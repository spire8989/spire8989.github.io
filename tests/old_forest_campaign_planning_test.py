"""Focused regression coverage for Old Forest campaign milestone planning."""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from http.server import ThreadingHTTPServer
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))

from location_system_test import CHROME, DevTools, QuietHandler, ROOT, free_port, wait_for_json


def run() -> None:
    if not CHROME.exists():
        raise RuntimeError(f"Chrome not found at {CHROME}")
    os.chdir(ROOT)
    http_port = free_port()
    debug_port = free_port()
    server = ThreadingHTTPServer(("127.0.0.1", http_port), QuietHandler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    profile = Path(tempfile.mkdtemp(prefix="grail-old-forest-planning-test-"))
    game_url = f"http://127.0.0.1:{http_port}/?sim=1"
    chrome = subprocess.Popen([
        str(CHROME), "--headless=new", "--disable-gpu", "--no-sandbox",
        "--remote-allow-origins=*", f"--remote-debugging-port={debug_port}",
        f"--user-data-dir={profile}", game_url,
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    checks = 0
    try:
        devtools = DevTools(wait_for_json(debug_port, game_url))
        devtools.call("Runtime.enable")
        for _ in range(40):
            if devtools.evaluate("Boolean(document.querySelector('.simulation-tools'))"):
                break
            time.sleep(0.1)

        def check(expression: str, label: str) -> None:
            nonlocal checks
            result = devtools.evaluate(expression)
            if not result:
                raise AssertionError(f"{label} ({result!r})")
            checks += 1

        check(
            "(() => { const p=SaveSystem.createDefaultPlayerState(); const g=assessOldForestProgressionGoal(p,{strategy:'aggressive'}); return g.goalId==='learn-woodcraft'&&g.targetDistance>=60&&g.targetDistance<=80&&g.supplyRunUseful; })()",
            "An early Old Forest campaign did not select the 60-80 Woodcraft milestone",
        )
        check(
            "(() => { const p=SaveSystem.createDefaultPlayerState(); p.learnedKnowledge=['woodcraft']; p.ownedItems.verdant_shard_grace=1; const g=assessOldForestProgressionGoal(p,{strategy:'aggressive'}); return g.goalId==='discover-village'&&g.targetDistance>=95&&g.targetDistance<180; })()",
            "Established early progression did not select the village milestone near 95",
        )
        check(
            "(() => { const p=SaveSystem.createDefaultPlayerState(); p.learnedKnowledge=['woodcraft','song_of_the_forest']; p.ownedItems.verdant_shard_grace=1; p.campaignFlags.forest_village_discovered=true; p.campaignFlags.druid_favor_complete=true; const g=assessOldForestProgressionGoal(p,{strategy:'cautious'}); return g.goalId==='secure-wrath-shard'&&g.targetDistance>=130&&g.targetDistance<=145; })()",
            "The post-village planner did not select the Thorn-Crowned Hart milestone",
        )
        check(
            "(() => { const p=SaveSystem.createDefaultPlayerState(); p.learnedKnowledge=['song_of_the_forest']; p.ownedItems.verdant_shard_grace=1; p.ownedItems.verdant_shard_wrath=1; p.ownedItems.enchanted_verdant_heart=1; p.campaignFlags.forest_village_discovered=true; p.campaignFlags.druid_favor_complete=true; const g=assessOldForestProgressionGoal(p,{strategy:'aggressive'}); return g.goalId==='defeat-verdant-warden'&&g.targetDistance===180; })()",
            "Complete Heart/Song preparation did not select the 180-league Warden goal",
        )
        check(
            "(() => { const c=CampaignSimulationRunner.run({seed:'planning-village',campaignMode:'progression',expeditions:1,strategy:'aggressive',betweenExpeditionPolicy:'aggressive-reinvestor',turnaroundDistance:180,startingState:{currentGold:3000,provisions:100,learnedKnowledge:['woodcraft'],ownedItems:{verdant_shard_grace:1}}}); const e=c.expeditions[0]; return e.oldForestProgressionGoal==='discover-village'&&e.desiredTargetDistance===95&&e.routeObjectiveDistance===180&&e.isSupplyRun===false&&c.stopReason!=='progression-objective-blocked'; })()",
            "A rich campaign still treated the village milestone as a blocked 180 objective",
        )
        check(
            "(() => { const c=CampaignSimulationRunner.run({seed:'planning-wrath',campaignMode:'progression',expeditions:1,strategy:'aggressive',betweenExpeditionPolicy:'aggressive-reinvestor',turnaroundDistance:180,startingState:{currentGold:3000,provisions:100,learnedKnowledge:['woodcraft','song_of_the_forest'],ownedItems:{verdant_shard_grace:1},campaignFlags:{forest_village_discovered:true,druid_favor_complete:true}}}); const e=c.expeditions[0]; return e.oldForestProgressionGoal==='secure-wrath-shard'&&e.desiredTargetDistance===140&&e.isSupplyRun===false&&e.paceSelectedAtDeparture==='normal'&&c.stopReason!=='progression-objective-blocked'; })()",
            "A rich campaign still repeated a shallow supply loop instead of attempting the Wrath milestone",
        )
        check(
            "(() => { const c=CampaignSimulationRunner.run({seed:'planning-heart-services',campaignMode:'progression',expeditions:1,strategy:'cautious',betweenExpeditionPolicy:'conservative-sustainer',turnaroundDistance:180,startingState:{currentGold:3000,provisions:100,learnedKnowledge:['woodcraft','song_of_the_forest'],ownedItems:{verdant_shard_grace:1,verdant_shard_wrath:1},campaignFlags:{forest_village_discovered:true,druid_favor_complete:true}}}); const e=c.expeditions[0]; return e.oldForestProgressionGoal==='enchant-heart'&&c.endingState.ownedItems.enchanted_verdant_heart===1; })()",
            "Town progression services did not forge and awaken the Heart before planning the final goal",
        )
        check(
            "(() => { const hart=authoredStrategyChoice('random',ENCOUNTER_DEFINITIONS.white_hart.stages.start.choices,{encounter:ENCOUNTER_DEFINITIONS.white_hart,stageId:'start',campaignGoal:{goalId:'secure-grace-shard'}}); const stag=authoredStrategyChoice('random',ENCOUNTER_DEFINITIONS.thorn_crowned_hart.stages.start.choices,{encounter:ENCOUNTER_DEFINITIONS.thorn_crowned_hart,stageId:'start',campaignGoal:{goalId:'secure-wrath-shard'}}); const altar=authoredStrategyChoice('random',ENCOUNTER_DEFINITIONS.verdant_altar.stages.start.choices,{encounter:ENCOUNTER_DEFINITIONS.verdant_altar,stageId:'start',campaignGoal:{goalId:'defeat-verdant-warden'}}); return hart?.id==='show_medallion'&&stag?.id==='stand_against_stag'&&altar?.id==='sing_at_altar'; })()",
            "Goal-aware simulator choices did not support Grace, Wrath, and altar progression",
        )
        check(
            "(() => { const c=CampaignSimulationRunner.run({seed:'planning-cautious-advance',campaignMode:'progression',expeditions:4,strategy:'cautious',betweenExpeditionPolicy:'conservative-sustainer',turnaroundDistance:180,startingState:{currentGold:3000,provisions:100,learnedKnowledge:['woodcraft'],ownedItems:{verdant_shard_grace:1}}}); const goals=c.expeditions.map(e=>e.oldForestProgressionGoal); return goals.includes('discover-village')&&Math.max(...c.expeditions.map(e=>Number(e.desiredTargetDistance)||0))>=95&&c.stopReason!=='progression-objective-blocked'; })()",
            "Cautious planning did not advance beyond the early supply band",
        )
        check(
            "(() => { const c=CampaignSimulationRunner.run({seed:'planning-telemetry',campaignMode:'progression',expeditions:2,strategy:'cautious',betweenExpeditionPolicy:'conservative-sustainer',turnaroundDistance:180,startingState:{currentGold:1000,provisions:80}}); const compact=JSON.parse(CampaignSimulationTelemetry.toCompactJson({results:[c]})).campaigns[0].campaignSummary.progression; return compact.oldForestCurrentGoal&&Array.isArray(compact.oldForestProgressionGoalByExpedition)&&compact.oldForestProgressionGoalByExpedition.length===c.expeditions.length&&c.expeditions.every(e=>e.oldForestProgressionGoal&&Number.isFinite(e.oldForestTargetMilestoneDistance)); })()",
            "Compact campaign telemetry did not expose Old Forest planning goals",
        )
        check(
            "(() => { const c=CampaignSimulationRunner.run({seed:'planning-cooking-telemetry',campaignMode:'progression',expeditions:2,strategy:'cautious',betweenExpeditionPolicy:'conservative-sustainer',turnaroundDistance:95,startingState:{currentGold:1000,provisions:80,learnedRecipes:['hunters_stew'],materials:{raw_meat:2,mushrooms:2,fresh_herbs:2}}}); const summary=CampaignSimulationTelemetry.aggregate({results:[c]}); const ids=['roasted_meat','foraged_meal','hunters_stew','honeyed_berries','forestwarden_stew','honeyed_forest_preserves']; return ids.every(id=>Object.prototype.hasOwnProperty.call(c.foodRecipeLearnedById,id)&&Object.prototype.hasOwnProperty.call(c.foodRecipeUsedById,id)&&Object.prototype.hasOwnProperty.call(summary.foodRecipeLearningRateById,id)&&Object.prototype.hasOwnProperty.call(summary.foodRecipeUsageRateById,id))&&Number.isFinite(c.cookingOpportunityMissedCount)&&typeof summary.recipesUsedById==='object'&&typeof summary.cookingProvisionsGainedByRecipe==='object'; })()",
            "Campaign cooking telemetry did not expose recipe learning, usage, yield, and missed-opportunity fields",
        )
        check(
            "(() => { const secured={ownedItems:{flask:1},campaignFlags:{verdant_warden_defeated:true}}; const safe=campaignCompletionObjectiveAchieved('old_forest_flask',secured,{returnedSafely:true}); const lost=campaignCompletionObjectiveAchieved('old_forest_flask',secured,{returnedSafely:false}); const missing=campaignCompletionObjectiveAchieved('old_forest_flask',{ownedItems:{},campaignFlags:{verdant_warden_defeated:true}},{returnedSafely:true}); return safe&&!lost&&!missing; })()",
            "Flask objective did not require both the Warden flag and a safe return",
        )
        check(
            "(() => { const c=CampaignSimulationRunner.run({seed:'flask-objective-no-route-leak',campaignMode:'progression',completionObjective:'old_forest_flask',expeditions:2,strategy:'aggressive',betweenExpeditionPolicy:'aggressive-reinvestor',turnaroundDistance:180,startingState:{currentGold:3000,provisions:100,learnedKnowledge:['woodcraft','song_of_the_forest'],ownedItems:{verdant_shard_grace:1,verdant_shard_wrath:1,enchanted_verdant_heart:1},campaignFlags:{forest_village_discovered:true,druid_favor_complete:true,verdant_warden_defeated:true}}}); const forbidden=['fountain_of_barenton','val_sans_retour','search_for_merlin']; return !c.completedPlan&&c.expeditions.every(e=>e.routeId==='old_forest_road')&&!c.routeSequence.some(id=>forbidden.includes(id))&&c.stopReason!=='completion-objective-achieved'&&c.expeditions[0]?.desiredTargetDistance===180; })()",
            "The Flask objective counted an incomplete 180-league run or leaked into a later route",
        )
        check(
            "(() => { const c=CampaignSimulationRunner.run({seed:'flask-objective-stop',campaignMode:'progression',completionObjective:'old_forest_flask',expeditions:20,startingState:{ownedItems:{flask:1},campaignFlags:{verdant_warden_defeated:true}}}); const batch=CampaignSimulationRunner.runBatch({scenarios:[{id:'flask-objective-batch',seed:'flask-objective-batch',campaignMode:'progression',completionObjective:'old_forest_flask',expeditions:20,startingState:{ownedItems:{flask:1},campaignFlags:{verdant_warden_defeated:true}}}],campaignsPerScenario:2}); const compact=JSON.parse(CampaignSimulationTelemetry.toCompactJson(batch)); return c.completed===true&&c.completedPlan===true&&c.stopReason==='completion-objective-achieved'&&c.expeditionsAttempted===0&&c.completionObjective==='old_forest_flask'&&c.flaskSecured&&batch.summary.campaignCompletionRate===1&&batch.summary.successfulCompletionRate===1&&batch.summary.oldForestFlaskCompletionRate===1&&batch.summary.oldForestFlaskSuccessfulCompletionRate===1&&batch.summary.flaskSecuredRate===1&&compact.exportMetadata.completionObjectives.includes('old_forest_flask')&&compact.exportMetadata.configurations[0].completionObjective==='old_forest_flask'&&compact.campaigns[0].campaignSummary.completionObjective==='old_forest_flask'; })()",
            "Successful Flask completion did not stop immediately or propagate through campaign metrics and compact export",
        )
        check(
            "(() => { const type=document.querySelector('#campaign-type'); const objective=document.querySelector('#campaign-objective'); const field=document.querySelector('#campaign-objective-field'); if(!type||!objective||!field||!objective.querySelector('option[value=\"old_forest_flask\"]')?.textContent.includes('Merlin')) return false; type.value='repeated'; type.dispatchEvent(new Event('change')); const hiddenForRepeated=field.hidden; type.value='progression'; type.dispatchEvent(new Event('change')); return hiddenForRepeated&&!field.hidden&&currentCampaignScenario({querySelector:selector=>document.querySelector(selector)}).completionObjective===null; })()",
            "The campaign UI did not expose or scope the Flask completion objective selector",
        )
        if devtools.console_errors:
            raise AssertionError(f"Runtime exceptions: {devtools.console_errors}")
        print(f"PASS: {checks} Old Forest campaign planning assertions")
    finally:
        server.shutdown()
        chrome.terminate()
        try:
            chrome.wait(timeout=3)
        except subprocess.TimeoutExpired:
            chrome.kill()
        shutil.rmtree(profile, ignore_errors=True)


if __name__ == "__main__":
    run()
