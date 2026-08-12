"""Focused deterministic expedition-simulation regression tests.

Uses the same dependency-light Chrome DevTools harness as the end-to-end suite.
"""

from __future__ import annotations

import json
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


def run():
    if not CHROME.exists():
        raise RuntimeError(f"Chrome not found at {CHROME}")

    os.chdir(ROOT)
    http_port = free_port()
    debug_port = free_port()
    server = ThreadingHTTPServer(("127.0.0.1", http_port), QuietHandler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    profile = Path(tempfile.mkdtemp(prefix="grail-simulation-test-"))
    game_url = f"http://127.0.0.1:{http_port}/"
    chrome = subprocess.Popen([
        str(CHROME),
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--remote-allow-origins=*",
        f"--remote-debugging-port={debug_port}",
        f"--user-data-dir={profile}",
        game_url,
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    checks = 0
    try:
        devtools = DevTools(wait_for_json(debug_port, game_url))
        devtools.call("Runtime.enable")
        time.sleep(0.3)

        def check(expression: str, label: str):
            nonlocal checks
            if not devtools.evaluate(expression):
                raise AssertionError(label)
            checks += 1

        scenario = json.dumps({
            "id": "determinism-regression",
            "seed": "known-seed-2026-08-12",
            "strategy": "random",
            "provisions": 24,
            "regionId": "broceliande",
            "pathId": "old_forest_road",
            "turnaroundPolicy": {"type": "fixedDistance", "distance": 100},
        })

        check(
            f"SimulationRunner.verifyDeterminism({scenario}).matches",
            "Same-seed verification reported a deterministic mismatch",
        )
        check(
            f"(() => {{ const result=SimulationRunner.verifyDeterminism({scenario}); return result.firstMismatch===null && JSON.stringify(result.first)===JSON.stringify(result.second); }})()",
            "Normalized same-seed gameplay results differ",
        )
        check(
            f"(() => {{ const request={{scenarios:[{scenario}],runsPerScenario:8}}; const a=SimulationRunner.runBatch(request).results.map(SimulationTelemetry.normalizeRun); const b=SimulationRunner.runBatch(request).results.map(SimulationTelemetry.normalizeRun); return JSON.stringify(a)===JSON.stringify(b); }})()",
            "Known-seed batch results are not deterministic",
        )
        check(
            "(() => { const signatures=Array.from({length:16},(_,index)=>{ const run=SimulationRunner.run({seed:`different-${index}`,strategy:'random',turnaroundPolicy:{type:'fixedDistance',distance:100}}); return JSON.stringify({outcome:run.outcome,encounters:run.encounters,combats:run.combats,loot:run.lootDiscovered,health:run.finalPartyHealth,provisions:run.provisionsRemaining}); }); return new Set(signatures).size>1; })()",
            "A collection of different seeds did not produce divergent gameplay",
        )
        check(
            "(() => { const nativeRandom=Math.random; Math.random=()=>{ throw new Error('native Math.random reached'); }; try { const run=SimulationRunner.run({seed:'native-random-guard',strategy:'random',turnaroundPolicy:{type:'fixedDistance',distance:120}}); return ['returned','failed'].includes(run.outcome); } finally { Math.random=nativeRandom; } })()",
            "Seeded simulation called native Math.random",
        )
        check(
            f"(() => {{ const run=SimulationRunner.run({scenario}); return run.replay.seed===run.seed && run.replay.regionId==='broceliande' && run.replay.pathId==='old_forest_road' && run.replay.startingPlayerState.provisions===24 && JSON.stringify(run.replay.decisions)===JSON.stringify(run.decisions) && run.decisions.some(entry=>entry.type==='turnaround'); }})()",
            "Replay metadata is missing starting state, path, or decision history",
        )
        check(
            f"(() => {{ const run=SimulationRunner.run({scenario}); return Number.isFinite(run.provisionsConsumed) && Number.isFinite(run.provisionsGained) && run.encounters.every(entry=>entry.completed && Array.isArray(entry.lootGained) && Array.isArray(entry.lootLost) && Array.isArray(entry.packedItemsConsumed)) && run.combats.every(combat=>Number.isFinite(combat.damageDealt)&&Number.isFinite(combat.damageReceived)); }})()",
            "Production-state telemetry fields are incomplete or invalid",
        )
        check(
            "(() => { const seeded=GameRandom.create('direct-manager'); const player=SaveSystem.createDefaultPlayerState(); const expedition=ExpeditionRules.createExpedition(player,{provisions:24,random:seeded.random}); const nativeRandom=Math.random; Math.random=()=>{throw new Error('native Math.random reached encounter rules');}; try { for(let index=0;index<200&&!expedition.activeEncounter;index+=1) ExpeditionRules.travel(expedition,player,1); return Boolean(expedition.activeEncounter); } finally { Math.random=nativeRandom; } })()",
            "Seeded production encounter selection reached native Math.random",
        )
        check(
            "(() => { const player=SaveSystem.createDefaultPlayerState(); const itemBefore=player.ownedItems.old_coin??0; const goldBefore=player.currentGold; const expedition=ExpeditionRules.createExpedition(player,{provisions:5,random:GameRandom.create('settlement').random}); expedition.unsecuredLoot=[{itemId:'old_coin',quantity:1}]; expedition.goldCarried=3; ExpeditionRules.settle(player,expedition,true); ExpeditionRules.settle(player,expedition,true); return player.ownedItems.old_coin===itemBefore+1 && player.currentGold===goldBefore+3 && expedition.rewardsSettled; })()",
            "Shared settlement duplicated secured rewards",
        )

        if devtools.console_errors:
            raise AssertionError(f"Runtime exceptions: {devtools.console_errors}")
        print(f"PASS: {checks} deterministic simulation assertions")
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
