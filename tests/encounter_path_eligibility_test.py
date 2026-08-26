"""Focused regression coverage for path-based encounter eligibility."""

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
    profile = Path(tempfile.mkdtemp(prefix="grail-encounter-path-test-"))
    game_url = f"http://127.0.0.1:{http_port}/"
    chrome = subprocess.Popen([
        str(CHROME), "--headless=new", "--disable-gpu", "--no-sandbox",
        "--remote-allow-origins=*", f"--remote-debugging-port={debug_port}",
        f"--user-data-dir={profile}", game_url,
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    try:
        devtools = DevTools(wait_for_json(debug_port, game_url))
        devtools.call("Runtime.enable")
        time.sleep(0.3)
        expression = """(() => {
          const player = SaveSystem.createDefaultPlayerState();
          const make = (expeditionId, path, distance) => {
            const expedition = ExpeditionRules.createExpedition(player, { expeditionId, companions: [], provisions: 10, random: () => 0 });
            Object.assign(expedition, { currentPathId: path, distance, direction: 'outbound', seenEncounterIds: [], encounterOccurrences: {}, lastEncounterId: null });
            return expedition;
          };
          const old = make('old_forest_road', 'old_forest_road', 20);
          const oldDeep = make('old_forest_road', 'old_forest_road', 120);
          const fountain = make('fountain_of_barenton', 'fountain_of_barenton', 120);
          const trail = make('old_forest_road', 'overgrown_trail', 30);
          const legacy = { ...ENCOUNTER_DEFINITIONS.lost_purse, id: 'legacy_path_conflict', expeditionIds: ['fountain_of_barenton'] };
          const oldEncounter = EncounterManager.eligibleDefinitions(old, player).some(entry => entry.id === 'lost_purse');
          const trailOnly = EncounterManager.isEligibleDefinition(ENCOUNTER_DEFINITIONS.beneath_the_roots, trail, player);
          const oldExcludesTrail = EncounterManager.isEligibleDefinition(ENCOUNTER_DEFINITIONS.beneath_the_roots, old, player);
          const legacyUsesPath = EncounterManager.isEligibleDefinition(legacy, old, player);
          const leperOnOld = EncounterManager.isEligibleDefinition(ENCOUNTER_DEFINITIONS.leper_knight, oldDeep, player);
          const leperOnFountain = EncounterManager.isEligibleDefinition(ENCOUNTER_DEFINITIONS.leper_knight, fountain, player);
          return oldEncounter && trailOnly && !oldExcludesTrail && legacyUsesPath
            && ENCOUNTER_DEFINITIONS.leper_knight.pathIds.join(',') === 'old_forest_road,fountain_of_barenton'
            && leperOnOld && leperOnFountain;
        })()"""
        if not devtools.evaluate(expression):
            raise AssertionError("Path-based encounter eligibility regression failed")
        if devtools.console_errors:
            raise AssertionError(f"Runtime exceptions: {devtools.console_errors}")
        print("PASS: encounter path eligibility assertions")
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
