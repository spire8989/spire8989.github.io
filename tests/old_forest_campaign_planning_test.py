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
            passed = result.get("ok") if isinstance(result, dict) and "ok" in result else result
            if not passed:
                if isinstance(result, dict):
                    print(f"Diagnostic for {label}: {result}")
                elif result is None and devtools.console_errors:
                    print(f"Console diagnostics for {label}: {devtools.console_errors[-3:]}")
                raise AssertionError(f"{label} ({result!r})")
            checks += 1

        check(
            "(() => { const p=SaveSystem.createDefaultPlayerState(); const g=assessOldForestProgressionGoal(p,{strategy:'aggressive'}); return g.goalId==='learn-woodcraft'&&g.targetDistance>=60&&g.targetDistance<=80&&g.supplyRunUseful; })()",
            "An early Old Forest campaign did not select the 60-80 Woodcraft milestone",
        )
        check(
            "(() => { const village=ENCOUNTER_DEFINITIONS.hidden_forest_village; const p=SaveSystem.createDefaultPlayerState(); p.learnedKnowledge=['woodcraft']; p.ownedItems.verdant_shard_grace=1; const g=assessOldForestProgressionGoal(p,{strategy:'aggressive'}); return g.goalId==='discover-village'&&g.targetDistance===village.milestoneOrder&&g.targetDistance>=village.minimumDistance&&g.targetDistance<=village.maximumDistance; })()",
            "Established early progression did not select the village milestone order from authored content",
        )
        check(
            "(() => { const white=ENCOUNTER_DEFINITIONS.white_hart; const thorn=ENCOUNTER_DEFINITIONS.thorn_crowned_hart; const altar=ENCOUNTER_DEFINITIONS.verdant_altar; return resolveProgressionEncounterDistance('white_hart')===white.maximumDistance&&resolveProgressionEncounterDistance('thorn_crowned_hart')===thorn.milestoneOrder&&resolveProgressionEncounterDistance('verdant_altar')===altar.milestoneOrder&&white.minimumDistance<resolveProgressionEncounterDistance('white_hart')&&thorn.minimumDistance<resolveProgressionEncounterDistance('thorn_crowned_hart'); })()",
            "Progression pursuit distances did not distinguish ranged eligibility from milestone order",
        )
        check(
            "(() => { const white=ENCOUNTER_DEFINITIONS.white_hart; const thorn=ENCOUNTER_DEFINITIONS.thorn_crowned_hart; const altar=ENCOUNTER_DEFINITIONS.verdant_altar; const old={whiteMin:white.minimumDistance,whiteMax:white.maximumDistance,thornOrder:thorn.milestoneOrder,altarOrder:altar.milestoneOrder}; try { white.minimumDistance=61; white.maximumDistance=87; thorn.milestoneOrder=151; altar.milestoneOrder=211; const gracePlayer=SaveSystem.createDefaultPlayerState(); gracePlayer.learnedKnowledge=['woodcraft']; const grace=assessOldForestProgressionGoal(gracePlayer,{strategy:'aggressive'}); const wrathPlayer=SaveSystem.createDefaultPlayerState(); wrathPlayer.learnedKnowledge=['woodcraft','song_of_the_forest']; wrathPlayer.ownedItems.verdant_shard_grace=1; wrathPlayer.campaignFlags.forest_village_discovered=true; wrathPlayer.campaignFlags.druid_favor_complete=true; const wrath=assessOldForestProgressionGoal(wrathPlayer,{strategy:'cautious'}); const altarPlayer=SaveSystem.createDefaultPlayerState(); altarPlayer.learnedKnowledge=['song_of_the_forest']; altarPlayer.ownedItems.verdant_shard_grace=1; altarPlayer.ownedItems.verdant_shard_wrath=1; altarPlayer.ownedItems.enchanted_verdant_heart=1; altarPlayer.campaignFlags.forest_village_discovered=true; altarPlayer.campaignFlags.druid_favor_complete=true; const finalGoal=assessOldForestProgressionGoal(altarPlayer,{strategy:'aggressive'}); return grace.goalId==='secure-grace-shard'&&grace.targetDistance===87&&grace.minimumAttemptDistance===87&&wrath.goalId==='secure-wrath-shard'&&wrath.targetDistance===151&&finalGoal.goalId==='defeat-verdant-warden'&&finalGoal.targetDistance===211&&finalGoal.minimumAttemptDistance===211; } finally { white.minimumDistance=old.whiteMin; white.maximumDistance=old.whiteMax; thorn.milestoneOrder=old.thornOrder; altar.milestoneOrder=old.altarOrder; } })()",
            "Changing authored encounter distances did not change simulator progression goals automatically",
        )
        check(
            "(() => { const c=CampaignSimulationRunner.run({seed:'grace-pursuit-distance',campaignMode:'progression',expeditions:4,strategy:'aggressive',betweenExpeditionPolicy:'aggressive-reinvestor',turnaroundDistance:180,startingState:{currentGold:3000,provisions:100,learnedKnowledge:['woodcraft']}}); const graceRuns=c.expeditions.filter(e=>e.oldForestProgressionGoal==='secure-grace-shard'); return graceRuns.length>0&&graceRuns.every(e=>e.desiredTargetDistance===ENCOUNTER_DEFINITIONS.white_hart.maximumDistance)&&!graceRuns.some(e=>e.desiredTargetDistance===ENCOUNTER_DEFINITIONS.white_hart.minimumDistance); })()",
            "A Grace-shard campaign still turned around at the White Hart minimum eligibility distance",
        )
        check(
            "(() => { const p=SaveSystem.createDefaultPlayerState(); p.learnedKnowledge=['woodcraft','song_of_the_forest']; p.ownedItems.verdant_shard_grace=1; p.campaignFlags.forest_village_discovered=true; p.campaignFlags.druid_favor_complete=true; const g=assessOldForestProgressionGoal(p,{strategy:'cautious'}); return g.goalId==='secure-wrath-shard'&&g.targetDistance>=130&&g.targetDistance<=145; })()",
            "The post-village planner did not select the Thorn-Crowned Hart milestone",
        )
        check(
            "(() => { const p=SaveSystem.createDefaultPlayerState(); p.learnedKnowledge=['song_of_the_forest']; p.ownedItems.verdant_shard_grace=1; p.ownedItems.verdant_shard_wrath=1; p.ownedItems.enchanted_verdant_heart=1; p.campaignFlags.forest_village_discovered=true; p.campaignFlags.druid_favor_complete=true; const g=assessOldForestProgressionGoal(p,{strategy:'aggressive'}); return g.goalId==='defeat-verdant-warden'&&g.targetDistance===180; })()",
            "Complete Heart/Song preparation did not select the 180-stadion Warden goal",
        )
        check(
            "(() => { const c=CampaignSimulationRunner.run({seed:'planning-village',campaignMode:'progression',expeditions:1,strategy:'aggressive',betweenExpeditionPolicy:'aggressive-reinvestor',turnaroundDistance:180,startingState:{currentGold:3000,provisions:100,learnedKnowledge:['woodcraft'],ownedItems:{verdant_shard_grace:1}}}); const e=c.expeditions[0]; return e.oldForestProgressionGoal==='discover-village'&&e.desiredTargetDistance===ENCOUNTER_DEFINITIONS.hidden_forest_village.milestoneOrder&&e.routeObjectiveDistance===0&&e.isSupplyRun===false&&c.stopReason!=='progression-objective-blocked'; })()",
            "A rich campaign still treated the authored village milestone as a blocked 180 objective",
        )
        check(
            "(() => { const c=CampaignSimulationRunner.run({seed:'planning-wrath',campaignMode:'progression',expeditions:1,strategy:'aggressive',betweenExpeditionPolicy:'aggressive-reinvestor',turnaroundDistance:180,startingState:{currentGold:3000,provisions:100,learnedKnowledge:['woodcraft','song_of_the_forest'],ownedItems:{verdant_shard_grace:1},campaignFlags:{forest_village_discovered:true,druid_favor_complete:true}}}); const e=c.expeditions[0]; return e.oldForestProgressionGoal==='secure-wrath-shard'&&e.desiredTargetDistance===140&&e.isSupplyRun===false&&e.paceSelectedAtDeparture==='normal'&&c.stopReason!=='progression-objective-blocked'; })()",
            "A rich campaign still repeated a shallow supply loop instead of attempting the Wrath milestone",
        )
        check(
            "(() => { const shop=SHOP_DEFINITIONS.forest_village_provisions; const oldPrice=shop.provisionsForSale.price; const oldStock=shop.provisionsForSale.stock; const run=(price,stock,gold=1000)=>{ shop.provisionsForSale.price=price; shop.provisionsForSale.stock=stock; try { return CampaignSimulationRunner.run({seed:'readiness-wrath-village',campaignMode:'progression',completionObjective:'full_campaign',expeditions:1,strategy:'cautious',betweenExpeditionPolicy:'conservative-sustainer',turnaroundDistance:140,startingState:{currentGold:gold,provisions:10,learnedKnowledge:['woodcraft','song_of_the_forest'],ownedItems:{verdant_shard_grace:1},campaignFlags:{forest_village_discovered:true,druid_favor_complete:true},shopStocks:{village_general_goods:0,forest_village_provisions:stock}}}); } finally { shop.provisionsForSale.price=oldPrice; shop.provisionsForSale.stock=oldStock; } }; const c=run(0.01,240); const e=c.expeditions[0]; const reachedHart=e?.expeditionTelemetry?.encounters?.some(encounter=>encounter.encounterId==='thorn_crowned_hart'); return e?.oldForestProgressionGoal==='secure-wrath-shard'&&e?.actualTargetDistance===140&&!e?.isSupplyRun&&e?.progressionUsesMidRouteResupply===true&&e?.progressionTargetFullyReachable===true&&e?.villageProvisionPurchaseCount>0&&reachedHart&&e?.progressionResupplyDistance===ENCOUNTER_DEFINITIONS.hidden_forest_village.milestoneOrder; })()",
            "A 140-stadion Wrath attempt did not use the known hidden-village resupply projection and runtime purchase",
        )
        check(
            "(() => { const shop=SHOP_DEFINITIONS.forest_village_provisions; const oldPrice=shop.provisionsForSale.price; const oldStock=shop.provisionsForSale.stock; const run=(price,stock,gold)=>{ shop.provisionsForSale.price=price; shop.provisionsForSale.stock=stock; try { return CampaignSimulationRunner.run({seed:'readiness-wrath-unavailable',campaignMode:'progression',completionObjective:'full_campaign',expeditions:1,strategy:'cautious',betweenExpeditionPolicy:'conservative-sustainer',turnaroundDistance:140,startingState:{currentGold:gold,provisions:10,learnedKnowledge:['woodcraft','song_of_the_forest'],ownedItems:{verdant_shard_grace:1},campaignFlags:{forest_village_discovered:true,druid_favor_complete:true},shopStocks:{village_general_goods:0,forest_village_provisions:stock}}}); } finally { shop.provisionsForSale.price=oldPrice; shop.provisionsForSale.stock=oldStock; } }; const c=run(1000,240,0); const e=c.expeditions[0]; return e?.isSupplyRun===true||e?.actualTargetDistance<140||c.stopReason==='progression-objective-blocked'; })()",
            "Unavailable hidden-village provisions were incorrectly treated as sufficient for the 140 milestone",
        )
        check(
            "(() => { const p=SaveSystem.createDefaultPlayerState(); p.campaignFlags.forest_village_discovered=false; const policy=BetweenExpeditionPolicies['conservative-sustainer']; const samples=Array.from({length:30},(_,index)=>{ p.provisions=index+1; return assessProgressionReadiness('old_forest_road',140,180,p,{village_general_goods:0},policy,'cautious',null,'old_forest_road',{requiredDistance:140,goal:{goalId:'secure-wrath-shard',supplyRunUseful:true}}); }); const sample=samples.find(result=>result.supportedDistance>=130&&result.supportedDistance<140); return sample?.requiredDistance===140&&!sample?.progressionTargetFullyReachable; })()",
            "A 130-stadion Wrath preparation run was still treated as a valid 140-stadion milestone attempt",
        )
        check(
            "(() => { const shop=SHOP_DEFINITIONS.forest_village_provisions; const oldPrice=shop.provisionsForSale.price; const oldStock=shop.provisionsForSale.stock; shop.provisionsForSale.price=0.01; shop.provisionsForSale.stock=240; try { const c=CampaignSimulationRunner.run({seed:'readiness-warden-village',campaignMode:'progression',completionObjective:'full_campaign',expeditions:1,strategy:'aggressive',betweenExpeditionPolicy:'aggressive-reinvestor',turnaroundDistance:180,startingState:{currentGold:1000,provisions:10,learnedKnowledge:['woodcraft','song_of_the_forest'],ownedItems:{verdant_shard_grace:1,verdant_shard_wrath:1,enchanted_verdant_heart:1},campaignFlags:{forest_village_discovered:true,druid_favor_complete:true},shopStocks:{village_general_goods:0,forest_village_provisions:240}}}); const e=c.expeditions[0]; return {ok:e?.oldForestProgressionGoal==='defeat-verdant-warden'&&e?.actualTargetDistance===180&&!e?.isSupplyRun&&e?.progressionRequiredDistance===180&&e?.progressionTargetFullyReachable===true, goal:e?.oldForestProgressionGoal,target:e?.actualTargetDistance,supply:e?.isSupplyRun,required:e?.progressionRequiredDistance,reachable:e?.progressionTargetFullyReachable,readiness:e?.progressionReadiness,projection:e?.postResupplySupportedDistance,purchase:e?.projectedVillageProvisionPurchase,actualPurchase:e?.villageProvisionPurchaseCount,stop:c.stopReason}; } finally { shop.provisionsForSale.price=oldPrice; shop.provisionsForSale.stock=oldStock; } })()",
            "A 180-stadion Warden attempt was not made viable by the known hidden-village resupply projection",
        )
        check(
            "(() => { const p=SaveSystem.createDefaultPlayerState(); p.campaignFlags.forest_village_discovered=false; const policy=BetweenExpeditionPolicies['aggressive-reinvestor']; const samples=Array.from({length:35},(_,index)=>{ p.provisions=index+1; return assessProgressionReadiness('old_forest_road',180,180,p,{village_general_goods:0},policy,'aggressive',null,'old_forest_road',{requiredDistance:180,goal:{goalId:'defeat-verdant-warden',supplyRunUseful:true,travelSettings:{paceId:'normal',rationId:'normal'}}}); }); const sample=samples.find(result=>result.supportedDistance>=150&&result.supportedDistance<180); return sample?.requiredDistance===180&&!sample?.progressionTargetFullyReachable; })()",
            "A 160-stadion Warden preparation run was still treated as a valid 180-stadion milestone attempt",
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
            "(() => { const c=CampaignSimulationRunner.run({seed:'druid-telemetry-compact',campaignMode:'progression',completionObjective:'full_campaign',expeditions:1,strategy:'cautious',betweenExpeditionPolicy:'conservative-sustainer',turnaroundDistance:100,startingState:{currentGold:100,provisions:100,learnedRecipes:['forest_communion_draught'],materials:{rare_herbs:1,medicinal_herbs:2},ownedItems:{fresh_herbs:1,verdant_shard_grace:1},campaignFlags:{forest_village_discovered:true,druid_favor_offered:true}}}); const compact=JSON.parse(CampaignSimulationTelemetry.toCompactJson({results:[c]})).campaigns[0].campaignSummary.progression; return c.oldForestCurrentGoal?.goalId==='complete-druid-favor'&&compact.druidDraughtMissingItems.honey===1&&compact.druidIngredientAcquisitionPlan==='buy-at-hidden-village'&&compact.druidIngredientProtectionActive===true&&compact.druidPrepRunReason.includes('honey'); })()",
            "Compact campaign telemetry did not preserve Druid requirement, acquisition, protection, and reason fields",
        )
        check(
            "(() => { const secured={ownedItems:{flask:1},campaignFlags:{verdant_warden_defeated:true}}; const safe=campaignCompletionObjectiveAchieved('old_forest_flask',secured,{returnedSafely:true}); const lost=campaignCompletionObjectiveAchieved('old_forest_flask',secured,{returnedSafely:false}); const missing=campaignCompletionObjectiveAchieved('old_forest_flask',{ownedItems:{},campaignFlags:{verdant_warden_defeated:true}},{returnedSafely:true}); return safe&&!lost&&!missing; })()",
            "Flask objective did not require both the Warden flag and a safe return",
        )
        check(
            "(() => { const c=CampaignSimulationRunner.run({seed:'flask-objective-no-route-leak',campaignMode:'progression',completionObjective:'old_forest_flask',expeditions:2,strategy:'aggressive',betweenExpeditionPolicy:'aggressive-reinvestor',turnaroundDistance:180,startingState:{currentGold:3000,provisions:100,learnedKnowledge:['woodcraft','song_of_the_forest'],ownedItems:{verdant_shard_grace:1,verdant_shard_wrath:1,enchanted_verdant_heart:1},campaignFlags:{forest_village_discovered:true,druid_favor_complete:true,verdant_warden_defeated:true}}}); const forbidden=['fountain_of_barenton','val_sans_retour','search_for_merlin']; return !c.completedPlan&&c.expeditions.every(e=>e.routeId==='old_forest_road')&&!c.routeSequence.some(id=>forbidden.includes(id))&&c.stopReason!=='completion-objective-achieved'&&c.expeditions[0]?.desiredTargetDistance===180; })()",
            "The Flask objective counted an incomplete 180-stadion run or leaked into a later route",
        )
        check(
            "(() => { const c=CampaignSimulationRunner.run({seed:'flask-objective-stop',campaignMode:'progression',completionObjective:'old_forest_flask',expeditions:20,startingState:{ownedItems:{flask:1},campaignFlags:{verdant_warden_defeated:true}}}); const batch=CampaignSimulationRunner.runBatch({scenarios:[{id:'flask-objective-batch',seed:'flask-objective-batch',campaignMode:'progression',completionObjective:'old_forest_flask',expeditions:20,startingState:{ownedItems:{flask:1},campaignFlags:{verdant_warden_defeated:true}}}],campaignsPerScenario:2}); const compact=JSON.parse(CampaignSimulationTelemetry.toCompactJson(batch)); return c.completed===true&&c.completedPlan===true&&c.stopReason==='completion-objective-achieved'&&c.expeditionsAttempted===0&&c.completionObjective==='old_forest_flask'&&c.flaskSecured&&batch.summary.campaignCompletionRate===1&&batch.summary.successfulCompletionRate===1&&batch.summary.oldForestFlaskCompletionRate===1&&batch.summary.oldForestFlaskSuccessfulCompletionRate===1&&batch.summary.flaskSecuredRate===1&&compact.exportMetadata.completionObjectives.includes('old_forest_flask')&&compact.exportMetadata.configurations[0].completionObjective==='old_forest_flask'&&compact.campaigns[0].campaignSummary.completionObjective==='old_forest_flask'; })()",
            "Successful Flask completion did not stop immediately or propagate through campaign metrics and compact export",
        )
        check(
            "(() => { const type=document.querySelector('#campaign-type'); const objective=document.querySelector('#campaign-objective'); const field=document.querySelector('#campaign-objective-field'); if(!type||!objective||!field||objective.value!=='old_forest_flask'||!objective.querySelector('option[value=\"old_forest_flask\"]')?.textContent.includes('Merlin')||!objective.querySelector('option[value=\"full_campaign\"]')) return false; type.value='repeated'; type.dispatchEvent(new Event('change')); const hiddenForRepeated=field.hidden; type.value='progression'; type.dispatchEvent(new Event('change')); return hiddenForRepeated&&!field.hidden&&currentCampaignScenario({querySelector:selector=>document.querySelector(selector)}).completionObjective==='old_forest_flask'; })()",
            "The campaign UI did not expose or scope the Flask completion objective selector",
        )
        check(
            "(() => { const defaultConfig=normalizeCampaignConfiguration({campaignMode:'progression'}); const fullConfig=normalizeCampaignConfiguration({campaignMode:'progression',completionObjective:'full_campaign'}); return defaultConfig.completionObjective==='old_forest_flask'&&fullConfig.completionObjective==='full_campaign'&&!isObjectiveLimitedCampaign(fullConfig); })()",
            "Progression simulator defaults did not select Flask while retaining explicit Full Campaign mode",
        )
        check(
            "(() => { const start={currentGold:3000,provisions:100,learnedKnowledge:['woodcraft','song_of_the_forest'],ownedItems:{verdant_shard_grace:1,verdant_shard_wrath:1,enchanted_verdant_heart:1,glimmering_sword:1,reinforced_mail:1,bandages:20},equippedItems:{weapon:'glimmering_sword',armor:'reinforced_mail',relic:'silver_stag_medallion'},campaignFlags:{forest_village_discovered:true,druid_favor_complete:true}}; const c=CampaignSimulationRunner.run({seed:'diagnose-warden-13',campaignMode:'progression',completionObjective:'old_forest_flask',expeditions:1,strategy:'aggressive',betweenExpeditionPolicy:'aggressive-reinvestor',turnaroundDistance:180,startingState:start}); const e=c.expeditions[0]; const altar=e?.expeditionTelemetry?.encounters?.find(x=>x.encounterId==='verdant_altar'); const choice=e?.expeditionTelemetry?.decisions?.find(x=>x.encounterId==='verdant_altar'); const warden=e?.expeditionTelemetry?.combats?.find(x=>x.combatId==='verdant_warden'); return e?.oldForestProgressionGoal==='defeat-verdant-warden'&&e?.actualTargetDistance===180&&e?.itemsPackedById?.enchanted_verdant_heart===1&&altar&&choice?.choiceId==='sing_at_altar'&&warden?.result==='victory'&&e.objectiveDistanceFloorApplied===true&&!e.objectiveDistanceFloorViolated&&!e.success&&!c.completed; })()",
            "A Warden attempt did not pack the owned Heart, sing at the altar, and start the Warden combat",
        )
        check(
            "(() => { const makePlayer=()=>{const p=SaveSystem.createDefaultPlayerState(); p.learnedKnowledge=['song_of_the_forest']; p.ownedItems.enchanted_verdant_heart=1; p.campaignFlags.druid_favor_complete=true; return p;}; const p=makePlayer(); const e=ExpeditionRules.createExpedition(p,{expeditionId:'old_forest_road',provisions:30,packedItems:['enchanted_verdant_heart'],random:()=>0}); e.distance=180; EncounterManager.force(e,'verdant_altar'); const started=EncounterManager.resolveChoice(e,p,'sing_at_altar',{startCombat:()=>true}); const finished=EncounterManager.completeCombat(e,p,'victory'); const staged=e.unsecuredLoot.some(entry=>entry.itemId==='flask')&&e.pendingCampaignFlags.verdant_warden_defeated===true; ExpeditionRules.settle(p,e,true); const safe=campaignCompletionObjectiveAchieved('old_forest_flask',p,{returnedSafely:true}); const unsafePlayer=makePlayer(); const unsafe=ExpeditionRules.createExpedition(unsafePlayer,{expeditionId:'old_forest_road',provisions:30,packedItems:['enchanted_verdant_heart'],random:()=>0}); unsafe.distance=180; EncounterManager.force(unsafe,'verdant_altar'); EncounterManager.resolveChoice(unsafe,unsafePlayer,'sing_at_altar',{startCombat:()=>true}); EncounterManager.completeCombat(unsafe,unsafePlayer,'victory'); ExpeditionRules.settle(unsafePlayer,unsafe,false); return started.combatStarted&&finished.awaitingContinue&&staged&&p.ownedItems.flask===1&&p.campaignFlags.verdant_warden_defeated===true&&safe&&!campaignCompletionObjectiveAchieved('old_forest_flask',unsafePlayer,{returnedSafely:false})&&!unsafePlayer.ownedItems.flask&&!unsafePlayer.campaignFlags.verdant_warden_defeated; })()",
            "Warden victory did not use unsecured Flask and safe-return flag commit semantics",
        )
        check(
            "(() => { const p=SaveSystem.createDefaultPlayerState(); p.currentGold=10; p.materials={...p.materials,rare_herbs:1,medicinal_herbs:2}; p.ownedItems.honey=1; p.ownedItems.fresh_herbs=1; p.ownedItems.verdant_shard_grace=1; p.learnedRecipes=['forest_communion_draught']; p.campaignFlags.forest_village_discovered=true; p.campaignFlags.druid_favor_offered=true; const quote=CraftingRules.quote(p,'forest_communion_draught','apothecary',{context:'town'}); const goal=assessOldForestProgressionGoal(p,{strategy:'cautious'}); const actions=[]; applyOldForestProgressionServices(p,actions,1); return quote.available&&goal.goalId==='complete-druid-favor'&&goal.supplyRunUseful===false&&goal.supplyRunReason==='druid-draught-ingredients-ready-for-town-crafting'&&p.campaignFlags.druid_favor_complete===true&&p.learnedKnowledge.includes('song_of_the_forest')&&!p.ownedItems.forest_communion_draught&&actions.some(action=>action.type==='craft-druid-draught'); })()",
            "The Druid planner did not recognize the mixed material/item Communion Draught recipe",
        )
        check(
            "(() => { const p=SaveSystem.createDefaultPlayerState(); p.currentGold=100; p.materials={rare_herbs:1,medicinal_herbs:2}; p.ownedItems={fresh_herbs:1,verdant_shard_grace:1}; p.learnedRecipes=['forest_communion_draught']; p.campaignFlags.forest_village_discovered=true; p.campaignFlags.druid_favor_offered=true; const goal=assessOldForestProgressionGoal(p,{strategy:'cautious'}); return {ok:goal.goalId==='complete-druid-favor'&&goal.druidDraughtCraftable===false&&goal.druidDraughtMissingItems.honey===1&&Object.keys(goal.druidDraughtMissingMaterials).length===0&&goal.druidIngredientAcquisitionPlan==='buy-at-hidden-village'&&goal.druidIngredientAcquisitionSource==='hidden_forest_village'&&goal.supplyRunUseful===true&&!goal.supplyRunReason.includes('generic'),goal}; })()",
            "The Druid planner did not identify the hidden-village honey source for a real missing requirement",
        )
        check(
            "(() => { const p=SaveSystem.createDefaultPlayerState(); p.currentGold=100; p.materials={rare_herbs:1,medicinal_herbs:2}; p.ownedItems={fresh_herbs:1,verdant_shard_grace:1}; p.learnedRecipes=['forest_communion_draught']; p.campaignFlags.forest_village_discovered=true; p.campaignFlags.druid_favor_offered=true; const goal=assessOldForestProgressionGoal(p,{strategy:'cautious'}); const stocks=CampaignRules.createShopStocks(); const expedition=ExpeditionRules.createExpedition(p,{expeditionId:'old_forest_road',provisions:20,random:()=>0}); expedition.distance=95; const service=campaignLocationProvisionService('hidden_forest_village',{expedition,player:p,campaignGoal:goal,strategy:'cautious',targetDistance:100},{shopStocks:stocks,targetDistance:100}); const actions=[]; applyOldForestProgressionServices(p,actions,1); const craft=actions.find(action=>action.type==='craft-druid-draught'); return service.druidIngredientsPurchasedById.honey===1&&craft?.result?.itemsConsumed?.honey===1&&stocks['forest_village_provisions:honey']===0&&p.campaignFlags.druid_favor_complete===true; })()",
            "The hidden-village ingredient source did not purchase honey and immediately complete the Druid favor",
        )
        check(
            "(() => { const c=CampaignSimulationRunner.run({seed:'druid-hidden-village-run',campaignMode:'progression',completionObjective:'full_campaign',expeditions:1,strategy:'cautious',betweenExpeditionPolicy:'conservative-sustainer',turnaroundDistance:100,startingState:{currentGold:100,provisions:100,learnedRecipes:['forest_communion_draught'],materials:{rare_herbs:1,medicinal_herbs:2},ownedItems:{fresh_herbs:1,verdant_shard_grace:1},campaignFlags:{forest_village_discovered:true,druid_favor_offered:true}}}); const e=c.expeditions[0]; const service=e?.expeditionTelemetry?.locationServiceActions?.find(action=>action.druidIngredientsPurchasedById?.honey); return e?.oldForestProgressionGoal==='complete-druid-favor'&&service?.druidIngredientsPurchasedById?.honey===1&&c.endingState.campaignFlags.druid_favor_complete===true&&c.endingState.learnedKnowledge.includes('song_of_the_forest'); })()",
            "The campaign simulator did not use the hidden-village honey service to finish the Druid favor",
        )
        check(
            "(() => { try { const p=SaveSystem.createDefaultPlayerState(); p.currentGold=100; p.materials={rare_herbs:1,medicinal_herbs:2}; p.ownedItems={honey:1,fresh_herbs:1,wild_berries:1}; p.learnedRecipes=['forest_communion_draught']; p.campaignFlags.forest_village_discovered=true; p.campaignFlags.druid_favor_offered=true; const goal=assessOldForestProgressionGoal(p,{strategy:'cautious'}); const before=p.ownedItems.honey; const result=cookAtInn(p,'cautious',()=>0.5,[],{targetProvisions:6,campaignGoal:goal}); const quote=CraftingRules.quote(p,'forest_communion_draught','apothecary',{context:'town'}); return {ok:before===1&&goal.druidIngredientProtectionActive&&goal.druidIngredientsProtectedById.honey===1&&result.actions.length===0&&p.ownedItems.honey===1&&quote.available,goal,result,quote}; } catch (error) { return {ok:false,error:String(error),stack:error.stack}; } })()",
            "Inn cooking consumed the last honey reserved for the Druid draught",
        )
        check(
            "(() => { const p=SaveSystem.createDefaultPlayerState(); p.currentGold=100; p.materials={rare_herbs:1}; p.ownedItems={honey:1,fresh_herbs:1,verdant_shard_grace:1}; p.learnedRecipes=['forest_communion_draught']; p.campaignFlags.forest_village_discovered=true; p.campaignFlags.druid_favor_offered=true; const goal=assessOldForestProgressionGoal(p,{strategy:'cautious',druidIngredientSources:{medicinal_herbs:null}}); const readiness=assessProgressionReadiness('old_forest_road',100,180,p,CampaignRules.createShopStocks(),BetweenExpeditionPolicies['conservative-sustainer'],'cautious',null,'old_forest_road',{requiredDistance:82,goal}); return goal.supplyRunUseful===false&&goal.druidIngredientAcquisitionPlan==='blocked-no-valid-source'&&goal.druidPrepRunReason.includes('medicinal_herbs')&&goal.druidDraughtMissingMaterials.medicinal_herbs===2&&readiness.status==='blocked'&&readiness.blocker==='druid-ingredient-source'; })()",
            "The Druid planner scheduled a preparation loop when no authored source existed",
        )
        check(
            "(() => { const p=SaveSystem.createDefaultPlayerState(); p.currentGold=3000; p.provisions=100; p.materials={rare_herbs:1,medicinal_herbs:2}; p.ownedItems={honey:1,fresh_herbs:1,verdant_heart:1,verdant_shard_grace:1}; p.learnedRecipes=['forest_communion_draught']; p.campaignFlags.forest_village_discovered=true; p.campaignFlags.druid_favor_offered=true; const goal=assessOldForestProgressionGoal(p,{strategy:'cautious'}); const actions=[]; applyOldForestProgressionServices(p,actions,1); const c=CampaignSimulationRunner.run({seed:'druid-chain-immediate',campaignMode:'progression',completionObjective:'full_campaign',expeditions:1,strategy:'cautious',betweenExpeditionPolicy:'conservative-sustainer',turnaroundDistance:140,startingState:p}); const e=c.expeditions[0]; return goal.druidDraughtCraftable&&goal.supplyRunUseful===false&&p.campaignFlags.druid_favor_complete===true&&p.learnedKnowledge.includes('song_of_the_forest')&&p.ownedItems.enchanted_verdant_heart===1&&actions.some(action=>action.type==='craft-druid-draught')&&['secure-wrath-shard','defeat-verdant-warden'].includes(e?.oldForestProgressionGoal); })()",
            "The complete Druid chain did not craft immediately, awaken the Heart, and advance the planner",
        )
        check(
            "(() => { const shop=SHOP_DEFINITIONS.forest_village_provisions; const oldPrice=shop.provisionsForSale.price; const oldStock=shop.provisionsForSale.stock; shop.provisionsForSale.price=0.01; shop.provisionsForSale.stock=240; try { const c=CampaignSimulationRunner.run({seed:'cautious-warden-hard-feasible',campaignMode:'progression',completionObjective:'full_campaign',expeditions:1,strategy:'cautious',betweenExpeditionPolicy:'conservative-sustainer',turnaroundDistance:180,startingState:{currentGold:1000,provisions:10,learnedKnowledge:['woodcraft','song_of_the_forest'],ownedItems:{verdant_shard_grace:1,verdant_shard_wrath:1,enchanted_verdant_heart:1,glimmering_sword:1,reinforced_mail:1,bandages:20},equippedItems:{weapon:'glimmering_sword',armor:'reinforced_mail',relic:'silver_stag_medallion'},campaignFlags:{forest_village_discovered:true,druid_favor_complete:true},shopStocks:{village_general_goods:0,forest_village_provisions:240}}}); const e=c.expeditions[0]; const compact=JSON.parse(CampaignSimulationTelemetry.toCompactJson({results:[c]})).campaigns[0].expeditions[0]; return {ok:e?.oldForestProgressionGoal==='defeat-verdant-warden'&&e?.progressionTargetHardFeasible===true&&e?.progressionPreferredSafetySatisfied===false&&e?.progressionAttemptAllowedDespiteSafetyShortfall===true&&!e?.isSupplyRun&&e?.actualTargetDistance===180&&e?.progressionHardSupportedDistance>=180&&e?.progressionPreferredSupportedDistance<180&&e?.expeditionTelemetry?.encounters?.some(encounter=>encounter.encounterId==='verdant_altar')&&compact.progressionTargetHardFeasible===true,goal:e?.oldForestProgressionGoal,hard:e?.progressionTargetHardFeasible,preferred:e?.progressionPreferredSafetySatisfied,attempt:e?.progressionAttemptAllowedDespiteSafetyShortfall,supply:e?.isSupplyRun,target:e?.actualTargetDistance,hardDistance:e?.progressionHardSupportedDistance,preferredDistance:e?.progressionPreferredSupportedDistance,blocker:e?.progressionReadinessBlocker,stop:c.stopReason,encounters:e?.expeditionTelemetry?.encounters?.map(encounter=>encounter.encounterId),warden:e?.expeditionTelemetry?.combats?.map(combat=>combat.combatId)}; } finally { shop.provisionsForSale.price=oldPrice; shop.provisionsForSale.stock=oldStock; } })()",
            "Cautious treated a hard-feasible 180 Warden attempt as an endless preferred-safety preparation run",
        )
        check(
            "(() => { const shop=SHOP_DEFINITIONS.forest_village_provisions; const oldPrice=shop.provisionsForSale.price; const oldStock=shop.provisionsForSale.stock; shop.provisionsForSale.price=1000; shop.provisionsForSale.stock=240; try { const c=CampaignSimulationRunner.run({seed:'cautious-warden-hard-shortfall',campaignMode:'progression',completionObjective:'full_campaign',expeditions:1,strategy:'cautious',betweenExpeditionPolicy:'conservative-sustainer',turnaroundDistance:180,startingState:{currentGold:0,provisions:10,learnedKnowledge:['woodcraft','song_of_the_forest'],ownedItems:{verdant_shard_grace:1,verdant_shard_wrath:1,enchanted_verdant_heart:1},campaignFlags:{forest_village_discovered:true,druid_favor_complete:true},shopStocks:{village_general_goods:0,forest_village_provisions:240}}}); const e=c.expeditions[0]; return e?.progressionTargetHardFeasible===false&&!e?.expeditionTelemetry?.encounters?.some(encounter=>encounter.encounterId==='verdant_altar')&&['insufficient-gold-for-resupply','hard-provision-shortfall'].includes(e?.progressionReadinessBlocker)&&e?.progressionSupplyRunCanImproveReadiness===true; } finally { shop.provisionsForSale.price=oldPrice; shop.provisionsForSale.stock=oldStock; } })()",
            "A genuine hard Warden provision shortfall did not expose a precise blocker and actionable preparation status",
        )
        check(
            "(() => { const quote={progressionTargetHardFeasible:false,hardSupportedDistance:165,hardProvisionRequirement:40,provisionStock:40}; const blocked=canPreparationRunImproveReadiness(quote,'capacity-limited',180); const fixed=canPreparationRunImproveReadiness(quote,'insufficient-village-stock',180); return blocked.useful===false&&blocked.reason==='capacity-limits-hard-feasibility'&&fixed.useful===false&&fixed.reason==='village-stock-cannot-be-improved-by-ordinary-supply-run'; })()",
            "The readiness planner still considered futile capacity or fixed-village-stock preparation runs useful",
        )
        check(
            "(() => { const c=CampaignSimulationRunner.run({seed:'floor-telemetry',campaignMode:'progression',completionObjective:'full_campaign',expeditions:1,strategy:'cautious',betweenExpeditionPolicy:'conservative-sustainer',turnaroundDistance:180,startingState:{currentGold:0,provisions:10,learnedKnowledge:['woodcraft','song_of_the_forest'],ownedItems:{verdant_shard_grace:1,verdant_shard_wrath:1,enchanted_verdant_heart:1},campaignFlags:{forest_village_discovered:true,druid_favor_complete:true},shopStocks:{village_general_goods:0,forest_village_provisions:0}}}); const e=c.expeditions[0]; return e?.isSupplyRun===true&&!e.objectiveDistanceFloorApplied&&!e.objectiveDistanceFloorViolated&&c.objectiveDistanceFloorViolations===0; })()",
            "Supply/preparation runs were counted as objective-distance-floor violations",
        )
        check(
            "(() => { const encounter=ENCOUNTER_DEFINITIONS.thorn_crowned_hart; const p=SaveSystem.createDefaultPlayerState(); p.learnedKnowledge=['woodcraft','song_of_the_forest']; p.ownedItems.verdant_shard_grace=1; p.campaignFlags.forest_village_discovered=true; p.campaignFlags.druid_favor_complete=true; const goal=assessOldForestProgressionGoal(p,{strategy:'cautious'}); return encounter.minimumDistance<goal.targetDistance&&goal.targetDistance===encounter.milestoneOrder&&goal.targetDistance<encounter.maximumDistance; })()",
            "Thorn-Crowned Hart authored range and canonical 140-stadion planner milestone were inconsistent",
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
