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
                raise AssertionError(label)
            checks += 1

        check(
            "(() => { const p=document.querySelector('.simulation-tools'); return p.querySelector('#campaign-type').value==='progression'&&p.querySelector('#campaign-distance').value==='180'&&p.querySelector('#campaign-healing').checked; })()",
            "Campaign Simulation did not default to the extended Old Forest objective",
        )
        check(
            "(() => { const c=CampaignSimulationRunner.run({seed:'old-focus',campaignMode:'progression',expeditions:2,strategy:'cautious',betweenExpeditionPolicy:'conservative-sustainer',turnaroundDistance:180,startingState:{arthurHealth:45,currentGold:1000,provisions:100}}); const e=c.expeditions[0]; return c.expeditions.length===1&&e.routeId==='old_forest_road'&&e.desiredTargetDistance>=180&&e.isSupplyRun&&e.progressionReadiness==='deferred'&&c.currentRoute==='old_forest_road'&&c.prerequisiteRunCount===0; })()",
            "Progression bots left Old Forest while waiting for earned depth progression",
        )
        check(
            "(() => { const p=SaveSystem.createDefaultPlayerState(); p.ownedItems.flask=1; return ExpeditionCatalog.missingPrerequisites(p,'fountain_of_barenton').length===0&&ExpeditionCatalog.missingPrerequisites(p,'val_sans_retour').length===0; })()",
            "A securely owned Flask did not release the next visible expeditions",
        )
        check(
            "(() => { const c=CampaignSimulationRunner.run({seed:'old-depth',campaignMode:'progression',expeditions:1,strategy:'aggressive',betweenExpeditionPolicy:'aggressive-reinvestor',turnaroundDistance:180,startingState:{arthurHealth:45,currentGold:3000,provisions:100}}); const e=c.expeditions[0]; return e.routeId==='old_forest_road'&&e.routeObjectiveDistance===180&&e.desiredTargetDistance>=180&&e.isSupplyRun&&e.actualMaximumDistance<180&&e.rationSelectedAtDeparture!=='sparse'; })()",
            "The campaign simulator incorrectly forced an unsupported 180-league Old Forest run",
        )
        check(
            "(() => { const c=CampaignSimulationRunner.run({seed:'old-repeat',campaignMode:'progression',expeditions:3,turnaroundDistance:180,startingState:{currentGold:3000,provisions:100}}); return c.routeSequence.every(id=>id==='old_forest_road')&&c.currentRoute==='old_forest_road'&&c.prerequisiteRunCount===0&&c.stopReason==='progression-objective-blocked'; })()",
            "Locked visible routes did not keep the simulator focused on Old Forest",
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
