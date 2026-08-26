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
