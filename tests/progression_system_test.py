"""Focused regression coverage for current-campaign progression simulation."""

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
        time.sleep(0.4)

        def check(expression: str, label: str) -> None:
            nonlocal checks
            if not devtools.evaluate(expression):
                raise AssertionError(label)
            checks += 1

        check(
            "(() => { const select=document.querySelector('#campaign-type'); if(!select) return false; select.value='progression'; return currentCampaignScenario(document.querySelector('.simulation-tools')).campaignMode==='progression'; })()",
            "Campaign progression mode was not exposed through the simulation UI",
        )
        check(
            "(() => { const c=CampaignSimulationRunner.run({seed:'progression-begins',campaignMode:'progression',expeditions:1,turnaroundDistance:1}); return c.campaignProgressionMode&&c.expeditions[0].routeId==='old_forest_road'&&c.expeditions[0].campaignStageAtDeparture==='old_forest_road'; })()",
            "Progression did not begin on Old Forest Road",
        )
        check(
            "(() => { const c=CampaignSimulationRunner.run({seed:'progression-old-complete',campaignMode:'progression',expeditions:2,strategy:'cautious',betweenExpeditionPolicy:'conservative-sustainer',turnaroundDistance:101,startingState:{arthurHealth:45,currentGold:1000,provisions:100,ownedItems:{flask:1},packedItems:['flask']}}); return c.expeditions[0].routeAttemptCompleted&&c.expeditions[0].actualMaximumDistance>=101&&c.expeditions[1].routeId==='fountain_of_barenton'&&c.routesCompleted[0]==='old_forest_road'; })()",
            "A successful intended-distance Old Forest return did not advance to Barenton",
        )
        check(
            "(() => { const c=CampaignSimulationRunner.run({seed:'progression-early-old',campaignMode:'progression',expeditions:1,turnaroundDistance:101,startingState:{arthurHealth:45,currentGold:0,provisions:15}}); return c.expeditions[0].success&&c.expeditions[0].actualMaximumDistance<101&&!c.routesCompleted.includes('old_forest_road')&&c.stopReason==='progression-attempt-cap'&&!c.completedPlan; })()",
            "An early Old Forest turnaround incorrectly completed the route",
        )
        check(
            "(() => { const c=CampaignSimulationRunner.run({seed:'progression-no-flask',campaignMode:'progression',expeditions:3,strategy:'cautious',betweenExpeditionPolicy:'conservative-sustainer',turnaroundDistance:101,startingState:{arthurHealth:45,currentGold:1000,provisions:100}}); return c.routeSequence[0]==='old_forest_road'&&c.routeSequence.slice(1).every(id=>id==='fountain_of_barenton')&&!c.waterOfBarentonSecured&&c.attemptsByRoute.fountain_of_barenton===2&&c.expeditions[1].routeCompletionReason==='returned-without-water_of_barenton'; })()",
            "Barenton without Water did not retry Barenton",
        )
        check(
            "(() => { const run={returnedSafely:false,finalArthurHealth:0,failureReason:'The company exhausted its provisions before reaching safety.'}; const result=evaluateCampaignProgressionAttempt('fountain_of_barenton',101,{},run,{ownedItems:{flask:1}},{ownedItems:{}}); return !result.completed&&result.status==='hard-failure'&&result.reason==='water_of_barenton-lost-before-safe-return'; })()",
            "Water acquired before an expedition failure was allowed to advance Barenton",
        )
        check(
            "(() => { const c=CampaignSimulationRunner.run({seed:'progression-completes',campaignMode:'progression',expeditions:3,strategy:'cautious',betweenExpeditionPolicy:'conservative-sustainer',turnaroundDistance:101,startingState:{arthurHealth:45,currentGold:3000,provisions:100,ownedItems:{flask:1},packedItems:['flask']}}); return c.routeSequence.join(',')==='old_forest_road,fountain_of_barenton,val_sans_retour'&&c.waterOfBarentonSecured&&c.expeditions[1].routeCompletionItem==='water_of_barenton'&&c.routesCompleted.includes('fountain_of_barenton'); })()",
            "Safely returned Water did not advance to Val",
        )
        check(
            "(() => { const result=evaluateCampaignProgressionAttempt('val_sans_retour',101,{}, {returnedSafely:true,finalArthurHealth:45,failureReason:null}, {ownedItems:{}}, {ownedItems:{}}); return !result.completed&&result.status==='returned-not-completed'&&result.reason==='returned-without-morgans_token'; })()",
            "Val without Morgan's Token did not remain incomplete",
        )
        check(
            "(() => { const result=evaluateCampaignProgressionAttempt('val_sans_retour',101,{}, {returnedSafely:false,finalArthurHealth:0,failureReason:'Arthur died'}, {ownedItems:{}}, {ownedItems:{}}); return !result.completed&&result.status==='hard-failure'&&result.reason==='morgans_token-lost-before-safe-return'; })()",
            "A lost Morgan's Token was allowed to complete Val",
        )
        check(
            "(() => { const c=CampaignSimulationRunner.run({seed:'progression-stops',campaignMode:'progression',expeditions:10,strategy:'aggressive',betweenExpeditionPolicy:'aggressive-reinvestor',turnaroundDistance:101,startingState:{arthurHealth:45,currentGold:3000,provisions:100,ownedItems:{flask:1},packedItems:['flask']}}); return c.currentContentCompleted&&c.completedPlan&&c.stopReason==='current-content-completed'&&c.expeditionsAttempted===3&&c.morgansTokenSecured&&c.routesCompleted.join(',')==='old_forest_road,fountain_of_barenton,val_sans_retour'; })()",
            "Safely returned Morgan's Token did not complete and stop the current campaign",
        )
        check(
            "(() => { const c=CampaignSimulationRunner.run({seed:'progression-no-merlin',campaignMode:'progression',expeditions:10,strategy:'cautious',betweenExpeditionPolicy:'conservative-sustainer',turnaroundDistance:101,startingState:{arthurHealth:45,currentGold:3000,provisions:100,ownedItems:{flask:1},packedItems:['flask']}}); return !c.routeSequence.includes('search_for_merlin')&&!c.expeditions.some(e=>e.expeditionId==='search_for_merlin')&&c.endingState.ownedItems.water_of_barenton===1&&c.endingState.ownedItems.morgans_token===1; })()",
            "Progression launched Search for Merlin instead of stopping after Val",
        )
        check(
            "(() => { const c=CampaignSimulationRunner.run({seed:'progression-cap',campaignMode:'progression',expeditions:1,turnaroundDistance:50}); return !c.completedPlan&&c.currentContentCompleted===false&&c.stopReason==='progression-attempt-cap'&&c.stopCategory==='incomplete'; })()",
            "The progression attempt cap was classified as completion",
        )
        check(
            "(() => { const configs=['cautious','random','aggressive'].map(strategy=>({seed:'progression-strategy-'+strategy,campaignMode:'progression',expeditions:3,strategy,betweenExpeditionPolicy:strategy==='aggressive'?'aggressive-reinvestor':strategy==='cautious'?'conservative-sustainer':'minimal-restock',turnaroundDistance:101,startingState:{arthurHealth:45,currentGold:3000,provisions:100,ownedItems:{flask:1},packedItems:['flask']}})); const results=configs.map(config=>CampaignSimulationRunner.run(config)); return results.every(c=>c.expeditions[0].routeId==='old_forest_road'&&c.routeSequence.every(id=>['old_forest_road','fountain_of_barenton','val_sans_retour'].includes(id))&&c.expeditions.every((e,i)=>i===0||e.routeId!=='fountain_of_barenton'||c.routesCompleted.includes('old_forest_road'))); })()",
            "Strategies did not share the same progression route order",
        )
        check(
            "CampaignSimulationRunner.verifyDeterminism({seed:'progression-replay',campaignMode:'progression',expeditions:5,strategy:'cautious',betweenExpeditionPolicy:'conservative-sustainer',turnaroundDistance:101,startingState:{arthurHealth:45,currentGold:3000,provisions:100,ownedItems:{flask:1},packedItems:['flask']}}).matches",
            "Progression campaign determinism was not preserved",
        )
        check(
            "(() => { const batch=CampaignSimulationRunner.runBatch({scenarios:[{id:'progression-funnel',seed:'progression-funnel',campaignMode:'progression',expeditions:3,strategy:'cautious',turnaroundDistance:101,startingState:{arthurHealth:45,currentGold:3000,provisions:100,ownedItems:{flask:1},packedItems:['flask']}}],campaignsPerScenario:2}); const s=batch.summary; return s.totalCampaigns===2&&s.oldForestReachedRate===1&&s.oldForestCompletionRate===1&&s.barentonReachedRate===1&&s.barentonCompletionRate===1&&s.valReachedRate===1&&s.valCompletionRate===1&&s.fullCurrentCampaignCompletionRate===1&&s.averageTotalAttempts===3&&s.averageAttemptsOldForest===1&&s.averageAttemptsBarenton===1&&s.averageAttemptsVal===1&&s.attemptCapFailureRate===0&&s.deathsByRoute&&s.averageEncounterCountByRoute; })()",
            "Progression batch funnel telemetry was incomplete",
        )
        check(
            "(() => { const c=CampaignSimulationRunner.run({seed:'progression-compact',campaignMode:'progression',expeditions:3,strategy:'cautious',turnaroundDistance:101,startingState:{arthurHealth:45,currentGold:3000,provisions:100,ownedItems:{flask:1},packedItems:['flask']}}); const compact=JSON.parse(CampaignSimulationTelemetry.toCompactJson({results:[c]})); const s=compact.campaigns[0].campaignSummary; const e=compact.campaigns[0].expeditions[0]; return s.progression.mode==='current-campaign'&&s.progression.routeSequence[0]==='old_forest_road'&&s.progression.attemptsByRoute&&s.progression.routeCompletionStatus&&e.routeId==='old_forest_road'&&e.campaignStageAtDeparture==='old_forest_road'&&e.routeAttemptStatus; })()",
            "Compact export omitted progression route and completion data",
        )
        check(
            "(() => { const c=CampaignSimulationRunner.run({seed:'progression-replay-route-switch',campaignMode:'progression',expeditions:3,strategy:'cautious',turnaroundDistance:101,startingState:{arthurHealth:45,currentGold:3000,provisions:100,ownedItems:{flask:1},packedItems:['flask']}}); const data=CampaignReplayData.normalize(c); return data.routeSequence.join(',')===c.routeSequence.join(',')&&data.progressionTransitions.length===3&&data.townActions.some(a=>a.type==='select-expedition'&&a.expeditionId==='fountain_of_barenton')&&data.expeditions.map(e=>e.replay.expeditionId).join(',')===c.routeSequence.join(','); })()",
            "Campaign replay did not preserve route transitions",
        )
        check(
            "(async () => { const c=CampaignSimulationRunner.run({seed:'progression-replay-playback',campaignMode:'progression',expeditions:3,strategy:'cautious',turnaroundDistance:101,startingState:{arthurHealth:45,currentGold:3000,provisions:100,ownedItems:{flask:1},packedItems:['flask']}}); const started=CampaignReplayController.start(c); const reached=await CampaignReplayController.skipTo('end'); const state=CampaignReplayController.state(); const clean=state?.error===null; CampaignReplayController.exit(); return started&&reached&&clean&&state.status==='completed'&&state.data.expeditions.map(e=>e.replay.expeditionId).join(',')==='old_forest_road,fountain_of_barenton,val_sans_retour'; })()",
            "Campaign replay playback could not reproduce the progression route switches",
        )
        check(
            "(() => { const c=CampaignSimulationRunner.run({seed:'progression-health-default',campaignMode:'progression',expeditions:1,turnaroundDistance:1,startingState:{selectedCompanions:[],selectedCompanion:null}}); return c.startingArthurHealth===45&&c.startingState.arthurHealth===45&&c.startingState.arthurMaxHealth===45; })()",
            "A fresh progression campaign did not start Arthur at full intended health",
        )
        check(
            "(() => { const c=CampaignSimulationRunner.run({seed:'progression-supply-run',campaignMode:'progression',expeditions:2,strategy:'cautious',betweenExpeditionPolicy:'conservative-sustainer',expeditionPlan:[1,101],startingState:{arthurHealth:45,currentGold:10,provisions:10,materials:{},packedMaterials:{},learnedRecipes:[],shopStocks:{village_general_goods:0}}}); const supply=c.expeditions[1]; return c.supplyRunCount===1&&supply.isSupplyRun&&supply.supplyRunForRoute==='fountain_of_barenton'&&supply.routeId==='old_forest_road'&&supply.campaignStageAtDeparture==='fountain_of_barenton'&&supply.actualTargetDistance>=50&&supply.actualTargetDistance<=75&&c.attemptsByRoute.fountain_of_barenton===0&&c.routeAttemptSequence.join(',')==='old_forest_road'; })()",
            "Progression did not use a clearly marked 50–75 league Old Forest supply run before a provision-short deep objective",
        )
        check(
            "(() => { const c=CampaignSimulationRunner.run({seed:'progression-supply-run',campaignMode:'progression',expeditions:2,strategy:'cautious',betweenExpeditionPolicy:'conservative-sustainer',expeditionPlan:[1,101],startingState:{arthurHealth:45,currentGold:10,provisions:10,materials:{},packedMaterials:{},learnedRecipes:[],shopStocks:{village_general_goods:0}}}); const compact=JSON.parse(CampaignSimulationTelemetry.toCompactJson({results:[c]})); const data=CampaignReplayData.normalize(c); const e=compact.campaigns[0].expeditions[1]; return e.isSupplyRun&&e.supplyRunForRoute==='fountain_of_barenton'&&data.expeditions[1].replay.expeditionId==='old_forest_road'; })()",
            "Compact telemetry and campaign replay did not preserve the marked supply-run route",
        )
        check(
            "(async () => { const c=CampaignSimulationRunner.run({seed:'progression-supply-run',campaignMode:'progression',expeditions:2,betweenExpeditionPolicy:'conservative-sustainer',expeditionPlan:[1,101],startingState:{arthurHealth:45,currentGold:10,provisions:10,materials:{},packedMaterials:{},learnedRecipes:[],shopStocks:{village_general_goods:0}}}); const started=CampaignReplayController.start(c); const reached=await CampaignReplayController.skipTo('end'); const state=CampaignReplayController.state(); const supply=state?.data.expeditions[1]; CampaignReplayController.exit(); return started&&reached&&state.status==='completed'&&state.error===null&&supply.replay.expeditionId==='old_forest_road'; })()",
            "Campaign replay could not reproduce an intentional supply run",
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
