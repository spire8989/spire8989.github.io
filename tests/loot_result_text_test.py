"""Focused browser regression for failed encounter loot result text."""

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
    game_url = f"http://127.0.0.1:{http_port}/"
    server = ThreadingHTTPServer(("127.0.0.1", http_port), QuietHandler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    profile = Path(tempfile.mkdtemp(prefix="grail-loot-result-text-test-"))
    chrome = subprocess.Popen([
        str(CHROME), "--headless=new", "--disable-gpu", "--no-sandbox",
        "--remote-allow-origins=*", f"--remote-debugging-port={debug_port}",
        f"--user-data-dir={profile}", game_url,
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    try:
        devtools = DevTools(wait_for_json(debug_port, game_url))
        devtools.call("Runtime.enable")
        time.sleep(0.3)
        result = devtools.evaluate(
            "(() => {"
            " const player=SaveSystem.createDefaultPlayerState();"
            " const expedition=ExpeditionRules.createExpedition(player,{"
            "  companions:[],provisions:10,random:()=>0.99"
            " });"
            " const resolved=EncounterOutcomes.resolve({"
            "  type:'rollLootTable',tableId:'common_materials',chance:0,"
            "  resultText:'Loot succeeded.',elseResultText:'No loot this time.'"
            " },{player,expedition});"
            " return {text:resolved.resultText,rewards:resolved.rewards.length,"
            "  staged:expedition.unsecuredLoot.length};"
            "})()"
        )
        expected = {"text": "No loot this time.", "rewards": 0, "staged": 0}
        if result != expected:
            raise AssertionError(f"Failed loot chance returned {result!r}, expected {expected!r}")
        if devtools.console_errors:
            raise AssertionError(f"Runtime exceptions: {devtools.console_errors}")
        print("PASS: failed loot chance uses elseResultText")
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
