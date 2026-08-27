"""Focused regression coverage for current-campaign Old Forest progression."""

from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
import threading
import time
from http.server import ThreadingHTTPServer
from pathlib import Path

from location_system_test import CHROME, DevTools, QuietHandler, ROOT, free_port, wait_for_json


def run() -> None:
    if not CHROME.exists():
        raise RuntimeError(f"Chrome not found at {CHROME}")
    os.chdir(ROOT)
    http_port = free_port()
    debug_port = free_port()
    server = ThreadingHTTPServer(("127.0.0.1", http_port), QuietHandler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    profile = Path(tempfile.mkdtemp(prefix="grail-progression-test-"))
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
                raise AssertionError(f"{label}: {result!r}")
            checks += 1

        check(
            "(() => { const p=document.querySelector('.simulation-tools'); return p.querySelector('#campaign-type').value==='progression'&&p.querySelector('#campaign-distance').value==='180'&&p.querySelector('#campaign-healing').checked; })()",
            "Campaign Simulation did not default to the extended Old Forest objective",
        )
        check(
            "(() => { const c=CampaignSimulationRunner.run({seed:'old-focus',campaignMode:'progression',expeditions:2,strategy:'cautious',betweenExpeditionPolicy:'conservative-sustainer',turnaroundDistance:180,startingState:{arthurHealth:45,currentGold:1000,provisions:100}}); const e=c.expeditions[0]; return c.expeditions.length===2&&e.routeId==='old_forest_road'&&e.oldForestProgressionGoal==='learn-woodcraft'&&e.desiredTargetDistance>=60&&e.desiredTargetDistance<=80&&e.routeObjectiveDistance===0&&!e.isSupplyRun&&c.currentRoute==='old_forest_road'&&c.prerequisiteRunCount===0; })()",
            "Progression bots did not begin with an explicit early Old Forest milestone",
        )
        check(
            "(() => { const p=SaveSystem.createDefaultPlayerState(); p.ownedItems.flask=1; return ExpeditionCatalog.missingPrerequisites(p,'fountain_of_barenton').length===0&&ExpeditionCatalog.missingPrerequisites(p,'val_sans_retour').length===0; })()",
            "A securely owned Flask did not release the next visible expeditions",
        )
        check(
            "(() => { const c=CampaignSimulationRunner.run({seed:'old-depth',campaignMode:'progression',expeditions:1,strategy:'aggressive',betweenExpeditionPolicy:'aggressive-reinvestor',turnaroundDistance:180,startingState:{arthurHealth:45,currentGold:3000,provisions:100}}); const e=c.expeditions[0]; return e.routeId==='old_forest_road'&&e.routeObjectiveDistance===0&&e.oldForestProgressionGoal==='learn-woodcraft'&&e.desiredTargetDistance<180&&!e.isSupplyRun&&e.actualMaximumDistance>0; })()",
            "The campaign simulator still treated the early Old Forest goal as the unsupported 180 objective",
        )
        check(
            "(() => { const makeFinal=()=>{const p=SaveSystem.createDefaultPlayerState(); p.learnedKnowledge=[...p.learnedKnowledge,'song_of_the_forest']; p.campaignFlags={...p.campaignFlags,forest_village_discovered:true,druid_favor_complete:true}; p.ownedItems={...p.ownedItems,verdant_shard_grace:1,verdant_shard_wrath:1,enchanted_verdant_heart:1}; p.currentGold=1000; p.provisions=500; p.provisionStock=500; return p;}; const originalOrder=ENCOUNTER_DEFINITIONS.verdant_altar.milestoneOrder; let observed; try { const p=makeFinal(); const before=assessOldForestProgressionGoal(p,{strategy:'cautious'}); ENCOUNTER_DEFINITIONS.verdant_altar.milestoneOrder=205; const after=assessOldForestProgressionGoal(p,{strategy:'cautious'}); const c=CampaignSimulationRunner.run({seed:'authored-altar-distance',campaignMode:'progression',completionObjective:'full_campaign',expeditions:1,expeditionPlan:[180],strategy:'normal',healingEnabled:false,autoSellRecoveredLoot:false,startingState:p}); const e=c.expeditions[0]; observed=before.targetDistance===originalOrder&&after.goalId==='defeat-verdant-warden'&&after.targetDistance===205&&after.minimumAttemptDistance===205&&e?.configuredTargetDistance===180&&e?.desiredTargetDistance===205&&e?.routeObjectiveDistance===0&&e?.progressionRequiredDistance===205&&e?.oldForestTargetMilestoneDistance===205; } finally { ENCOUNTER_DEFINITIONS.verdant_altar.milestoneOrder=originalOrder; } return observed; })()",
            "The final Verdant Altar progression goal did not resolve its target from authored encounter distance or override expeditionPlan",
        )
        check(
            "(() => { const originalOrder=ENCOUNTER_DEFINITIONS.thorn_crowned_hart.milestoneOrder; try { ENCOUNTER_DEFINITIONS.thorn_crowned_hart.milestoneOrder=155; const p=SaveSystem.createDefaultPlayerState(); p.learnedKnowledge=[...p.learnedKnowledge,'song_of_the_forest']; p.campaignFlags={...p.campaignFlags,forest_village_discovered:true,druid_favor_complete:true}; p.ownedItems={...p.ownedItems,verdant_shard_grace:1}; const goal=assessOldForestProgressionGoal(p,{strategy:'cautious'}); return goal.goalId==='secure-wrath-shard'&&goal.targetDistance===155&&goal.minimumAttemptDistance===155&&goal.requiredPreparation.encounter==='thorn_crowned_hart'&&goal.requiredPreparation.targetDistance===155; } finally { ENCOUNTER_DEFINITIONS.thorn_crowned_hart.milestoneOrder=originalOrder; } })()",
            "Thorn-Crowned Hart progression did not resolve from its authored encounter distance",
        )
        check(
            "(() => { const originalWhite=ENCOUNTER_DEFINITIONS.white_hart.minimumDistance; const originalWhiteMaximum=ENCOUNTER_DEFINITIONS.white_hart.maximumDistance; const originalVillage=ENCOUNTER_DEFINITIONS.hidden_forest_village.minimumDistance; const originalVillageMaximum=ENCOUNTER_DEFINITIONS.hidden_forest_village.maximumDistance; const originalVillageOrder=ENCOUNTER_DEFINITIONS.hidden_forest_village.milestoneOrder; try { ENCOUNTER_DEFINITIONS.white_hart.minimumDistance=61; ENCOUNTER_DEFINITIONS.white_hart.maximumDistance=69; ENCOUNTER_DEFINITIONS.hidden_forest_village.minimumDistance=123; ENCOUNTER_DEFINITIONS.hidden_forest_village.maximumDistance=131; ENCOUNTER_DEFINITIONS.hidden_forest_village.milestoneOrder=127; const p=SaveSystem.createDefaultPlayerState(); p.learnedKnowledge=[...p.learnedKnowledge,'woodcraft']; const grace=assessOldForestProgressionGoal(p,{strategy:'cautious'}); p.ownedItems={...p.ownedItems,verdant_shard_grace:1}; const village=assessOldForestProgressionGoal(p,{strategy:'cautious'}); return grace.goalId==='secure-grace-shard'&&grace.targetDistance===69&&grace.minimumAttemptDistance===69&&grace.requiredPreparation.encounter==='white_hart'&&grace.requiredPreparation.targetDistance===69&&village.goalId==='discover-village'&&village.targetDistance===127&&village.requiredPreparation.targetDistance===127; } finally { ENCOUNTER_DEFINITIONS.white_hart.minimumDistance=originalWhite; ENCOUNTER_DEFINITIONS.white_hart.maximumDistance=originalWhiteMaximum; ENCOUNTER_DEFINITIONS.hidden_forest_village.minimumDistance=originalVillage; ENCOUNTER_DEFINITIONS.hidden_forest_village.maximumDistance=originalVillageMaximum; ENCOUNTER_DEFINITIONS.hidden_forest_village.milestoneOrder=originalVillageOrder; } })()",
            "Earlier encounter-backed Old Forest milestones did not follow authored distances",
        )
        check(
            "(() => { const original=ENCOUNTER_DEFINITIONS.verdant_altar.minimumDistance; try { ENCOUNTER_DEFINITIONS.verdant_altar.minimumDistance=undefined; try { resolveProgressionEncounterDistance('verdant_altar'); return false; } catch (error) { return error.message.includes('maximumDistance without minimumDistance'); } } finally { ENCOUNTER_DEFINITIONS.verdant_altar.minimumDistance=original; } })()",
            "Invalid authored progression encounter distance did not produce a clear diagnostic",
        )
        check(
            "(() => { try { resolveProgressionEncounterDistance('missing_progression_encounter'); return false; } catch (error) { return error.message.includes('was not found in ENCOUNTER_DEFINITIONS'); } })()",
            "Missing authored progression encounter did not produce a clear diagnostic",
        )
        check(
            "(() => { const c=CampaignSimulationRunner.run({seed:'repeated-configured-distance',campaignMode:'repeated',expeditions:1,expeditionPlan:[37],strategy:'normal',healingEnabled:false,autoSellRecoveredLoot:false,startingState:{currentGold:1000,provisions:100,provisionStock:100}}); const e=c.expeditions[0]; return e.configuredTargetDistance===37&&e.desiredTargetDistance===37; })()",
            "Non-progression campaign simulations did not preserve their configured target distance",
        )
        check(
            "(() => { const c=CampaignSimulationRunner.run({seed:'old-repeat',campaignMode:'progression',expeditions:3,turnaroundDistance:180,startingState:{currentGold:3000,provisions:100}}); return c.routeSequence.every(id=>id==='old_forest_road')&&c.currentRoute==='old_forest_road'&&c.prerequisiteRunCount===0&&c.stopReason!=='progression-objective-blocked'&&c.oldForestProgressionGoalByExpedition.length===c.expeditions.length; })()",
            "Old Forest progression did not remain focused on milestone goals",
        )
        if devtools.console_errors:
            raise AssertionError(f"Runtime exceptions: {devtools.console_errors}")
        print(f"PASS: {checks} current-campaign progression assertions")
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
