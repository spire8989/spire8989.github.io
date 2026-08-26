"""Focused deterministic Phase 1 visual replay regression tests."""

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
    profile = Path(tempfile.mkdtemp(prefix="grail-replay-test-"))
    game_url = f"http://127.0.0.1:{http_port}/?sim=1"
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
            value = devtools.evaluate(expression)
            if not value:
                raise AssertionError(f"{label}: {value!r}")
            checks += 1

        devtools.evaluate(
            "(() => { document.querySelector('#sim-runs').value='1'; document.querySelector('[data-sim-action=\"current\"]').click(); return new Promise(resolve => setTimeout(resolve, 250)); })()"
        )
        check(
            "!document.querySelector('.simulation-inspect')?.hidden&&document.querySelector('[data-sim-action=\"replay\"]')?.textContent.includes('Watch Replay')",
            "Simulation UI did not expose Watch Replay for a selected run",
        )
        check(
            "(() => { document.querySelector('[data-sim-action=\"replay\"]').click(); return ReplayController.isActive()&&game.screen==='expedition'; })()",
            "Watch Replay did not launch the selected simulation run",
        )
        check(
            "(() => { ReplayController.exit(); return game.screen==='campaign'&&!ReplayController.isActive(); })()",
            "Replay launched from the developer panel did not exit cleanly",
        )

        scenario = json.dumps({
            "id": "phase-one-replay",
            "seed": "phase-one-replay-seed",
            "strategy": "aggressive",
            "provisions": 30,
            "companions": [],
            "turnaroundPolicy": {"type": "fixedDistance", "distance": 55},
            "startingState": {"arthurHealth": 16},
        })
        check(
            f"(() => {{ const run=SimulationRunner.run({scenario}); const data=ReplayData.normalize(run); return data.seed===run.seed&&data.startingProvisions===run.startingProvisions&&data.pathId===run.replay.pathId&&data.decisions.length===run.decisions.length; }})()",
            "Known simulation replay did not normalize",
        )
        check(
            f"(() => {{ const run=SimulationRunner.run({scenario}); const before=JSON.stringify(game.player); ReplayController.start(run); const state=ReplayController.state(); return state.status==='playing'&&state.realGameState.player!==game.player&&JSON.stringify(SaveSystem.load())===before&&document.querySelector('.replay-controls')?.textContent.includes('REPLAY'); }})()",
            "Replay did not start in a sandbox with developer controls",
        )
        check(
            "game.screen==='expedition'&&!document.querySelector('.replay-controls button[data-replay-action=\"exit\"]')?.disabled",
            "Replay did not use the normal expedition screen",
        )
        check(
            "(() => { const state=ReplayController.state(); ReplayController.skipTo('end'); return state.status==='completed'&&state.decisionIndex===state.data.decisions.length&&state.error===null; })()",
            "Recorded replay did not complete without a desync",
        )
        check(
            f"(() => {{ const run=SimulationRunner.run({scenario}); return game.summary?.outcome===run.outcome&&Math.abs(game.expedition.maxDistanceReached-run.maximumDistance)<0.01&&document.querySelector('.replay-warning')===null; }})()",
            "Replay completion did not match the original deterministic run",
        )
        check(
            "JSON.stringify(SaveSystem.load())===JSON.stringify(ReplayController.state().realGameState.player)",
            "Replay settlement mutated the real saved player",
        )
        check(
            "(() => { const run=SimulationRunner.run({seed:'coverage-0',strategy:'cautious',provisions:30,turnaroundPolicy:{type:'fixedDistance',distance:100},startingState:{arthurHealth:20,materials:{raw_meat:1}},materialBagContents:{raw_meat:1}}); const types=[...new Set(run.decisions.map(decision=>decision.type))]; ReplayController.exit(); ReplayController.start(run); ReplayController.skipTo('end'); const state=ReplayController.state(); return ['combat-action','expedition-action','cook-recipe','camp-event-choice','leave-camp'].every(type=>types.includes(type))&&state.status==='completed'&&state.error===null&&state.decisionIndex===state.data.decisions.length; })()",
            "Replay did not enforce the recorded camp, cooking, encounter, and combat decision stream",
        )
        check(
            "(() => { const final=JSON.stringify({summary:game.summary,maximumDistance:game.expedition.maxDistanceReached,provisions:game.expedition.provisions}); const total=ReplayController.state().data.decisions.length; ReplayController.seek(0); const reset=ReplayController.state().decisionIndex===0&&ReplayController.state().status==='paused'; ReplayController.seek(total); const atTarget=ReplayController.state().decisionIndex===total; ReplayController.skipTo('end'); const actual=JSON.stringify({summary:game.summary,maximumDistance:game.expedition.maxDistanceReached,provisions:game.expedition.provisions}); return reset&&atTarget&&ReplayController.state().status==='completed'&&actual===final; })()",
            "Replay seek/replay-from-start did not reach the same final state",
        )
        check(
            "(() => { const first=JSON.stringify({summary:game.summary,expedition:game.expedition}); ReplayController.restart(); const reset=ReplayController.state().decisionIndex===0&&game.summary===null; ReplayController.skipTo('end'); return reset&&JSON.stringify({summary:game.summary,expedition:game.expedition})===first; })()",
            "Replay restart did not reproduce the same final state",
        )
        check(
            "(() => { const run=SimulationRunner.run({seed:'coverage-0',strategy:'aggressive',provisions:30,turnaroundPolicy:{type:'fixedDistance',distance:100}}); const bad=JSON.parse(JSON.stringify(run)); const action=bad.replay.decisions.find(decision=>decision.type==='combat-action'&&decision.actionId==='attack'); if(!action) return false; action.targetId='missing-target'; ReplayController.exit(); ReplayController.start(bad); ReplayController.skipTo('end'); return ReplayController.state().status==='desync'&&ReplayController.state().error?.expectedDecision?.targetId==='missing-target'; })()",
            "Recorded combat target changes were not rejected as a replay desync",
        )
        check(
            "(() => { const run=SimulationRunner.run({seed:'replay-invalid-decision',strategy:'normal',provisions:24,companions:[],turnaroundPolicy:{type:'fixedDistance',distance:20}}); const bad=JSON.parse(JSON.stringify(run)); bad.replay.decisions[0]={type:'combat-action',combatId:'missing',actorId:'arthur',actionId:'attack',targetId:'missing',distance:0}; ReplayController.exit(); ReplayController.start(bad); ReplayController.skipTo('end'); const state=ReplayController.state(); return state.status==='desync'&&state.error?.decisionIndex===0&&state.error?.expectedDecision?.type==='combat-action'&&state.error?.currentReplayState; })()",
            "Invalid replay decisions did not produce a useful desync error",
        )
        check(
            "(() => { ReplayController.exit(); const before=JSON.stringify(game.player); const run=SimulationRunner.run({seed:'replay-exit',strategy:'random',provisions:24,companions:[],turnaroundPolicy:{type:'fixedDistance',distance:10}}); ReplayController.start(run); ReplayController.exit(); return game.screen==='campaign'&&JSON.stringify(game.player)===before&&!document.querySelector('.replay-controls'); })()",
            "Exiting replay did not restore the real game state and UI",
        )

        if devtools.console_errors:
            raise AssertionError(f"Browser reported replay errors: {devtools.console_errors}")
        print(f"PASS: {checks} replay assertions")
    finally:
        try:
            devtools.ws.close()
        except (NameError, AttributeError):
            pass
        chrome.terminate()
        try:
            chrome.wait(timeout=5)
        except subprocess.TimeoutExpired:
            chrome.kill()
        server.shutdown()
        shutil.rmtree(profile, ignore_errors=True)


if __name__ == "__main__":
    run()
