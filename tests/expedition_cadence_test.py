"""Focused expedition-specific cadence and return-speed regressions."""

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
    profile = Path(tempfile.mkdtemp(prefix="grail-expedition-cadence-test-"))
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
                raise AssertionError(label)
            checks += 1

        check(
            "(() => { const outbound=ExpeditionRules.encounterSpacing({expeditionId:'fountain_of_barenton',direction:'outbound'}); const returning=ExpeditionRules.encounterSpacing({expeditionId:'fountain_of_barenton',direction:'returning'}); return outbound.minimumDistance===7 && outbound.maximumDistance===10 && returning.minimumDistance===7 && returning.maximumDistance===10 && ExpeditionRules.returnSpeedMultiplier({expeditionId:'fountain_of_barenton'})===4; })()",
            "Expeditions without cadence overrides did not use global defaults",
        )
        check(
            "formatDistance(1)==='1 stadion'&&formatDistance(2)==='2 stadia'&&formatDistance(180)==='180 stadia'",
            "Runtime distance formatting did not use stadion/stadia terminology",
        )
        check(
            "(() => { const legacyUnit=['lea','gue'].join(''); const text=document.querySelector('.simulation-tools')?.textContent.toLowerCase()||''; return text.includes('stadia')&&!text.includes(legacyUnit); })()",
            "Simulation controls still exposed the old distance unit",
        )
        check(
            "(() => { const player=SaveSystem.createDefaultPlayerState(); player.selectedCompanions=[]; const e=ExpeditionRules.createExpedition(player,{expeditionId:'old_forest_road',companions:[],provisions:30,random:()=>0.5}); const outbound=e.nextEncounterAt; e.direction='returning'; EncounterManager.initializeExpedition(e); const spacing=ExpeditionRules.encounterSpacing(e); return outbound===8.5 && e.nextEncounterAt===20 && spacing.minimumDistance===16 && spacing.maximumDistance===24 && ExpeditionRules.returnSpeedMultiplier(e)===4; })()",
            "Old Forest Road did not use its authored outbound/return cadence",
        )
        check(
            "(() => { const custom={direction:'returning',encounterSpacing:{outbound:{minimumDistance:3,maximumDistance:5}},returnSpeedMultiplier:2}; const spacing=ExpeditionRules.encounterSpacing(custom); const invalid={direction:'returning',encounterSpacing:{returning:{minimumDistance:20,maximumDistance:10}},returnSpeedMultiplier:0}; const safe=ExpeditionRules.encounterSpacing(invalid); return spacing.minimumDistance===3 && spacing.maximumDistance===5 && ExpeditionRules.returnSpeedMultiplier(custom)===2 && safe.minimumDistance===20 && safe.maximumDistance===20 && ExpeditionRules.returnSpeedMultiplier(invalid)===4; })()",
            "Invalid or partial cadence overrides did not fall back safely",
        )
        check(
            "(() => { const result=SimulationRunner.run({expeditionId:'old_forest_road',strategy:'normal',companions:[],provisions:30,turnaroundPolicy:{type:'fixedDistance',distance:50},seed:'old-forest-cadence',maxSimulationSteps:5000}); const returning=result.events.filter(event=>event.type==='encounter-start'&&event.direction==='returning'); const gaps=returning.slice(1).map((event,index)=>returning[index].distance-event.distance); return result.outcome==='returned' && returning.length>0 && gaps.every(gap=>gap>=16); })()",
            "Simulation did not share expedition-aware returning encounter cadence",
        )
    finally:
        try:
            chrome.terminate()
            chrome.wait(timeout=5)
        except subprocess.TimeoutExpired:
            chrome.kill()
            chrome.wait(timeout=5)
        server.shutdown()
        server.server_close()
        shutil.rmtree(profile, ignore_errors=True)

    print(f"Expedition cadence suite passed {checks} assertions.")


if __name__ == "__main__":
    run()
