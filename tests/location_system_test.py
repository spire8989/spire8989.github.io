"""Browser smoke/regression test for the data-driven village hub.

Uses Chrome's built-in DevTools protocol so the dependency-free game does not
need a JavaScript test framework or npm installation.
"""

from __future__ import annotations

import json
import os
import shutil
import socket
import subprocess
import tempfile
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import requests
import websocket


ROOT = Path(__file__).resolve().parents[1]
CHROME = Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe")


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, _format, *_args):
        pass

    def handle(self):
        try:
            super().handle()
        except ConnectionResetError:
            pass


class DevTools:
    def __init__(self, url: str):
        self.ws = websocket.create_connection(url, timeout=5, origin="http://localhost")
        self.next_id = 0
        self.console_errors: list[str] = []

    def call(self, method: str, params=None):
        self.next_id += 1
        request_id = self.next_id
        self.ws.send(json.dumps({"id": request_id, "method": method, "params": params or {}}))
        while True:
            message = json.loads(self.ws.recv())
            if message.get("method") == "Runtime.exceptionThrown":
                self.console_errors.append(str(message["params"]))
            if message.get("id") == request_id:
                if "error" in message:
                    raise AssertionError(message["error"])
                return message.get("result", {})

    def evaluate(self, expression: str):
        result = self.call("Runtime.evaluate", {
            "expression": expression,
            "returnByValue": True,
            "awaitPromise": True,
        })["result"]
        if result.get("subtype") == "error" or "exceptionDetails" in result:
            raise AssertionError(result)
        return result.get("value")

    def click(self, selector: str):
        clicked = self.evaluate(
            f"Boolean(document.querySelector({json.dumps(selector)})?.click() ?? true)"
        )
        time.sleep(0.03)
        return clicked


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def wait_for_json(port: int, game_url: str):
    endpoint = f"http://127.0.0.1:{port}/json"
    for _ in range(80):
        try:
            pages = requests.get(endpoint, timeout=0.2).json()
            page = next((entry for entry in pages if entry.get("url", "").startswith(game_url)), None)
            if page:
                return page["webSocketDebuggerUrl"]
        except (requests.RequestException, ValueError, KeyError):
            time.sleep(0.05)
    raise RuntimeError("Chrome DevTools endpoint did not start")


def assert_js(devtools: DevTools, expression: str, label: str):
    if not devtools.evaluate(expression):
        raise AssertionError(label)


def run():
    if not CHROME.exists():
        raise RuntimeError(f"Chrome not found at {CHROME}")

    os.chdir(ROOT)
    http_port = free_port()
    debug_port = free_port()
    server = ThreadingHTTPServer(("127.0.0.1", http_port), QuietHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    profile = Path(tempfile.mkdtemp(prefix="grail-location-test-"))
    chrome = subprocess.Popen([
        str(CHROME),
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--remote-allow-origins=*",
        f"--remote-debugging-port={debug_port}",
        f"--user-data-dir={profile}",
        f"http://127.0.0.1:{http_port}/",
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    checks = 0
    try:
        devtools = DevTools(wait_for_json(debug_port, f"http://127.0.0.1:{http_port}/"))
        devtools.call("Runtime.enable")
        devtools.call("Page.enable")
        time.sleep(0.3)
        devtools.evaluate("localStorage.clear(); location.reload()")
        time.sleep(0.35)

        def check(expression: str, label: str):
            nonlocal checks
            assert_js(devtools, expression, label)
            checks += 1

        check("game.screen === 'campaign'", "Fresh save should open campaign")
        check("game.player.currentLocationId === 'broceliande_village'", "Fresh location is invalid")
        devtools.click('[data-action="enter-location"]')
        check("game.screen === 'location'", "Chapter III did not open the village")
        check("document.querySelectorAll('.hub-hotspot').length === 4", "Village should expose four hotspots")
        check("Boolean(document.querySelector('.location-scene') && document.querySelector('.location-panel'))", "Village split view missing")

        devtools.click('[data-destination-id="inn"]')
        check("game.screen === 'destination' && game.activeDestinationId === 'inn'", "Inn did not open")
        check("Boolean(document.querySelector('.destination-visual') && document.querySelector('.destination-panel'))", "Building split view missing")
        devtools.click('[data-action="hear-rumor"]')
        check("document.querySelector('.interaction-message')?.textContent.length > 20", "Rumor did not appear")
        devtools.click('[data-action="show-location"]')

        devtools.evaluate("game.player.currentGold = 100; game.player.ownedItems.old_coin = 2; game.player.ownedItems.antler_fragment = 1; savePlayer()")
        devtools.click('[data-destination-id="merchant"]')
        for item_id in ("rope", "torch", "bandages", "dried_herbs"):
            before = devtools.evaluate(f"game.player.ownedItems.{item_id} || 0")
            gold = devtools.evaluate("game.player.currentGold")
            devtools.click(f'[data-action="buy-item"][data-item-id="{item_id}"]')
            check(f"game.player.ownedItems.{item_id} === {before + 1}", f"Merchant did not sell {item_id}")
            check(f"game.player.currentGold < {gold}", f"Buying {item_id} did not reduce gold")

        devtools.click('[data-action="shop-tab"][data-tab="sell"]')
        check("document.querySelector('[data-action=\"sell-item\"][data-item-id=\"silver_stag_medallion\"]')?.disabled", "Protected relic can be sold")
        check("document.querySelector('[data-action=\"sell-item\"][data-item-id=\"rope\"]')?.disabled", "Packed item can be sold")
        check("[...document.querySelectorAll('.shop-item-row')].some(row => row.textContent.includes('Antler Fragment') && row.textContent.includes('does not buy'))", "Vendor specialization not explained")
        old_gold = devtools.evaluate("game.player.currentGold")
        devtools.click('[data-action="sell-item"][data-item-id="old_coin"]')
        check(f"game.player.currentGold === {old_gold + 5}", "Selling coins did not add gold")
        check("game.player.ownedItems.old_coin === 1", "Selling did not remove one coin")

        devtools.click('[data-action="show-location"]')
        devtools.click('[data-destination-id="blacksmith"]')
        devtools.click('[data-action="shop-tab"][data-tab="sell"]')
        check("document.querySelector('[data-action=\"sell-item\"][data-item-id=\"arthur_sword\"]')?.disabled", "Equipped weapon can be sold")
        devtools.click('[data-action="shop-tab"][data-tab="buy"]')
        knife_before = devtools.evaluate("game.player.ownedItems.fine_hunting_knife || 0")
        devtools.click('[data-action="buy-item"][data-item-id="fine_hunting_knife"]')
        check(f"game.player.ownedItems.fine_hunting_knife === {knife_before + 1}", "Blacksmith did not sell knife")
        devtools.click('[data-action="shop-tab"][data-tab="sell"]')
        knife_gold = devtools.evaluate("game.player.currentGold")
        devtools.click('[data-action="sell-item"][data-item-id="fine_hunting_knife"]')
        check(f"game.player.currentGold === {knife_gold + 5}", "Blacksmith did not buy tool")

        devtools.click('[data-action="show-location"]')
        devtools.click('[data-destination-id="forest_gate"]')
        check("document.body.textContent.includes('Not Yet Available')", "Campaign quest lock missing")
        devtools.click('[data-action="prepare-expedition"]')
        check("game.screen === 'preparation'", "Forest Gate did not open loadout")
        devtools.click('[data-action="return-from-preparation"]')
        check("game.activeDestinationId === 'forest_gate'", "Loadout back did not return to gate")
        devtools.click('[data-action="prepare-expedition"]')
        devtools.click('[data-action="start-expedition"]')
        check("game.screen === 'expedition' && game.expedition.status === 'active'", "Expedition did not begin")

        equipped_before = devtools.evaluate("JSON.stringify(game.player.equippedItems)")
        packed_before = devtools.evaluate("JSON.stringify(game.player.packedItems)")
        check("EncounterManager.force(game.expedition, 'fallen_tree')", "Existing encounter could not be triggered")
        devtools.evaluate("renderExpedition()")
        check("game.expedition.activeEncounter?.encounterId === 'fallen_tree' && document.querySelector('.travel-scene')?.classList.contains('is-paused')", "Encounter flow no longer pauses travel")
        green_before = devtools.evaluate("game.player.ownedItems.green_glass_vial || 0")
        devtools.evaluate("game.expedition.unsecuredLoot = [{itemId:'green_glass_vial', quantity:1}]")

        devtools.evaluate("failExpedition('Test failure')")
        check("game.screen === 'summary'", "Failure summary missing")
        check(f"(game.player.ownedItems.green_glass_vial || 0) === {green_before}", "Failed run secured unsecured loot")
        devtools.click('[data-action="new-expedition"]')
        check("game.screen === 'location'", "Failed expedition did not return to village")

        coin_before = devtools.evaluate("game.player.ownedItems.old_coin || 0")
        gold_before_return = devtools.evaluate("game.player.currentGold")
        devtools.evaluate("startExpedition(); game.expedition.unsecuredLoot = [{itemId:'old_coin', quantity:1}]; game.expedition.goldCarried = 3; completeReturn()")
        check("game.screen === 'summary' && game.summary.outcome === 'returned'", "Successful summary missing")
        check(f"game.player.ownedItems.old_coin === {coin_before + 1}", "Successful return did not secure loot")
        check(f"game.player.currentGold === {gold_before_return + 3}", "Successful return did not bank carried gold")
        check(f"JSON.stringify(game.player.equippedItems) === {json.dumps(equipped_before)}", "Expedition changed equipped gear")
        check(f"JSON.stringify(game.player.packedItems) === {json.dumps(packed_before)}", "Expedition changed pack selection")
        devtools.click('[data-action="new-expedition"]')
        check("game.screen === 'location'", "Successful expedition did not return to village")

        devtools.evaluate("window.confirm = () => true; resetSave()")
        check("game.player.currentLocationId === 'broceliande_village'", "Reset produced invalid location")
        check("game.player.currentGold === 12", "Reset did not restore treasury")
        check("devtools_errors_placeholder = true", "Runtime alive after reset")
        if devtools.console_errors:
            raise AssertionError(f"Runtime exceptions: {devtools.console_errors}")
        print(f"PASS: {checks} location/shop/navigation browser assertions")
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
