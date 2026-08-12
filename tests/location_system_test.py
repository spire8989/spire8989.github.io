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
        check("game.player.provisions === 24", "Fresh persistent provisions are invalid")
        check("sanitizePlayerState({saveVersion:4}, SaveSystem.createDefaultPlayerState()).provisions === 24", "Older save did not migrate provisions")
        devtools.click('[data-action="enter-location"]')
        check("game.screen === 'location'", "Chapter III did not open the village")
        check("document.querySelectorAll('.hub-hotspot').length === 4", "Village should expose four hotspots")
        check("!document.querySelector('.location-panel') && Boolean(document.querySelector('.location-scene') && document.querySelector('.hub-hud'))", "Village scene and HUD structure is invalid")
        check("document.querySelector('.hub-status')?.textContent.includes('Provisions')", "Village provision overlay missing")
        for width, height in ((360, 640), (390, 844), (430, 932)):
            devtools.call("Emulation.setDeviceMetricsOverride", {
                "width": width,
                "height": height,
                "deviceScaleFactor": 1,
                "mobile": True,
            })
            time.sleep(0.04)
            check("document.querySelector('.location-scene').getBoundingClientRect().bottom <= document.querySelector('.hub-hud').getBoundingClientRect().top + 1", f"Village scene overlaps HUD at {width}x{height}")
            check("[...document.querySelectorAll('.hub-hotspot')].every(hotspot => hotspot.getBoundingClientRect().bottom <= document.querySelector('.location-scene').getBoundingClientRect().bottom)", f"Village hotspot escapes scene at {width}x{height}")
            check("[...document.querySelectorAll('.hub-hotspot')].every(hotspot => hotspot.getBoundingClientRect().bottom <= document.querySelector('.hub-hud').getBoundingClientRect().top)", f"Village hotspot overlaps HUD at {width}x{height}")
        check("document.querySelector('.hub-identity').clientHeight < document.querySelector('.location-scene').clientHeight * 0.12", "Village title card is not compact")

        devtools.click('[data-action="view-inventory"]')
        check("game.screen === 'preparation' && game.preparationMode === 'inventory'", "Village inventory did not open in inventory context")
        check("!document.querySelector('[data-action=\"start-expedition\"]')", "Village inventory exposes Begin Expedition")
        check("!document.querySelector('.visual-frame')", "Inventory unnecessarily reserves a visual frame")
        devtools.click('[data-action="return-from-preparation"]')
        check("game.screen === 'location'", "Inventory did not return to village")

        devtools.click('[data-destination-id="inn"]')
        check("game.screen === 'destination' && game.activeDestinationId === 'inn'", "Inn did not open")
        check("Boolean(document.querySelector('.destination-visual') && document.querySelector('.destination-panel'))", "Building split view missing")
        check("Math.abs(document.querySelector('.visual-frame').clientWidth / document.querySelector('.visual-frame').clientHeight - 16/9) < 0.02", "Inn visual is not 16:9")
        check("Boolean(document.querySelector('.interaction-header') && document.querySelector('.interaction-scroll'))", "Sticky interaction structure missing")
        check("document.querySelector('.interaction-header').getBoundingClientRect().bottom <= document.querySelector('.interaction-scroll').getBoundingClientRect().top + 1", "Back navigation is inside scrolling content")
        devtools.click('[data-action="hear-rumor"]')
        check("document.querySelector('.interaction-message')?.textContent.length > 20", "Rumor did not appear")
        devtools.click('[data-action="show-location"]')

        devtools.evaluate("game.player.currentGold = 100; game.player.ownedItems.old_coin = 2; game.player.ownedItems.antler_fragment = 1; savePlayer()")
        devtools.click('[data-destination-id="merchant"]')
        check("Math.abs(document.querySelector('.visual-frame').clientWidth / document.querySelector('.visual-frame').clientHeight - 16/9) < 0.02", "Merchant visual is not 16:9")
        check("document.querySelector('.destination-panel').clientHeight > document.querySelector('.visual-frame').clientHeight", "Merchant interaction area is not the majority")
        check("SHOP_DEFINITIONS.village_general_goods.provisionsForSale.price === 1", "Provision price is not shop data")
        provision_before = devtools.evaluate("game.player.provisions")
        provision_gold = devtools.evaluate("game.player.currentGold")
        provision_stock = devtools.evaluate("game.provisionShopStock.village_general_goods")
        devtools.click('[data-action="buy-provisions"][data-quantity="5"]')
        check(f"game.player.provisions === {provision_before + 5}", "Buying provisions did not increase stock")
        check(f"game.player.currentGold === {provision_gold - 5}", "Buying provisions did not reduce gold")
        check(f"game.provisionShopStock.village_general_goods === {provision_stock - 5}", "Provision availability did not decrease")
        for item_id in ("rope", "torch", "bandages", "dried_herbs"):
            before = devtools.evaluate(f"game.player.ownedItems.{item_id} || 0")
            gold = devtools.evaluate("game.player.currentGold")
            devtools.click(f'[data-action="buy-item"][data-item-id="{item_id}"]')
            check(f"game.player.ownedItems.{item_id} === {before + 1}", f"Merchant did not sell {item_id}")
            check(f"game.player.currentGold < {gold}", f"Buying {item_id} did not reduce gold")
        check("document.querySelector('.interaction-scroll').scrollHeight > document.querySelector('.interaction-scroll').clientHeight", "Long Merchant content does not scroll inside lower area")
        header_top = devtools.evaluate("document.querySelector('.interaction-header').getBoundingClientRect().top")
        devtools.evaluate("document.querySelector('.interaction-scroll').scrollTop = document.querySelector('.interaction-scroll').scrollHeight")
        check(f"Math.abs(document.querySelector('.interaction-header').getBoundingClientRect().top - {header_top}) < 1", "Merchant back header moved with scrolling content")

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
        check("Math.abs(document.querySelector('.visual-frame').clientWidth / document.querySelector('.visual-frame').clientHeight - 16/9) < 0.02", "Blacksmith visual is not 16:9")
        devtools.click('[data-action="shop-tab"][data-tab="buy"]')
        check("document.querySelector('[data-action=\"buy-item\"][data-item-id=\"arthur_sword\"]')?.disabled", "Duplicate unique sword can be purchased")
        check("document.querySelector('[data-action=\"buy-item\"][data-item-id=\"quilted_hauberk\"]')?.disabled", "Duplicate unique armor can be purchased")
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
        check("Math.abs(document.querySelector('.visual-frame').clientWidth / document.querySelector('.visual-frame').clientHeight - 16/9) < 0.02", "Forest Gate visual is not 16:9")
        check("document.body.textContent.includes('Not Yet Available')", "Campaign quest lock missing")
        devtools.click('[data-action="prepare-expedition"]')
        check("game.screen === 'preparation'", "Forest Gate did not open loadout")
        check("document.body.textContent.includes('Owned:') && document.body.textContent.includes('Choose how many')", "Preparation does not show owned provisions")
        check("game.preparationSupplies <= game.player.provisions", "Preparation selected more provisions than owned")
        devtools.click('[data-action="return-from-preparation"]')
        check("game.activeDestinationId === 'forest_gate'", "Loadout back did not return to gate")
        devtools.click('[data-action="prepare-expedition"]')
        carried = devtools.evaluate("game.preparationSupplies")
        owned_before_start = devtools.evaluate("game.player.provisions")
        devtools.click('[data-action="start-expedition"]')
        check("game.screen === 'expedition' && game.expedition.status === 'active'", "Expedition did not begin")
        check(f"game.player.provisions === {owned_before_start - carried}", "Starting expedition did not commit owned provisions")
        check(f"game.expedition.committedProvisions === {carried} && game.expedition.provisions <= {carried} && game.expedition.provisions > {carried} - 0.2", "Expedition received free or incorrect provisions")
        check("Math.abs(document.querySelector('.visual-frame').clientWidth / document.querySelector('.visual-frame').clientHeight - 16/9) < 0.02", "Travel visual is not 16:9")
        travel_provisions = devtools.evaluate("game.expedition.provisions")
        travel_distance = devtools.evaluate("game.expedition.distance")
        devtools.evaluate("updateExpedition(0.5)")
        check(f"game.expedition.provisions < {travel_provisions} && game.expedition.distance > {travel_distance}", "Travel did not consume carried provisions")
        devtools.evaluate("game.expedition.distance = Math.max(game.expedition.distance, 2); game.expedition.maxDistanceReached = Math.max(game.expedition.maxDistanceReached, game.expedition.distance); beginReturn()")
        return_distance = devtools.evaluate("game.expedition.distance")
        devtools.evaluate("updateExpedition(0.01)")
        check(f"game.expedition.direction === 'returning' && game.expedition.distance < {return_distance}", "Existing return travel no longer reduces distance")

        equipped_before = devtools.evaluate("JSON.stringify(game.player.equippedItems)")
        packed_before = devtools.evaluate("JSON.stringify(game.player.packedItems)")
        check("EncounterManager.force(game.expedition, 'fallen_tree')", "Existing encounter could not be triggered")
        devtools.evaluate("renderExpedition()")
        check("game.expedition.activeEncounter?.encounterId === 'fallen_tree' && document.querySelector('.travel-scene')?.classList.contains('is-paused')", "Encounter flow no longer pauses travel")
        check("Math.abs(document.querySelector('.visual-frame').clientWidth / document.querySelector('.visual-frame').clientHeight - 16/9) < 0.02", "Encounter visual is not 16:9")
        check("['hidden_hollow','whispering_oak','abandoned_cart','strange_lights','something_in_thorns','woodland_foraging'].every(id => Object.values(ENCOUNTER_DEFINITIONS[id].stages).some(stage => stage.choices.some(choice => choice.pendingAction)))", "Authored delayed actions are missing")
        health_before_encounter = devtools.evaluate("game.expedition.health")
        check("(() => { const original = Math.random; Math.random = () => 0; const result = EncounterManager.resolveChoice(game.expedition, game.player, 'climb_over', {failExpedition}); Math.random = original; renderExpedition(); return result.resolved; })()", "Immediate randomized choice did not resolve")
        check(f"game.expedition.health === {health_before_encounter - 1} && game.expedition.activeEncounter.resultText.includes('injury')", "Fallen Tree injury text does not match its damage branch")
        devtools.click('[data-action="continue-journey"]')

        check("EncounterManager.force(game.expedition, 'hidden_hollow')", "Hidden Hollow could not be triggered")
        devtools.evaluate("game.expedition.activeEncounter.stageId = 'inside_hollow'; renderExpedition(); resolveEncounterChoice('search_stones')")
        check("game.expedition.activeEncounter.phase === 'pending' && document.body.textContent.includes('moves the stones')", "Pending action text did not render")
        check("!document.querySelector('[data-action=\"continue-journey\"]') && !document.querySelector('[data-action=\"encounter-choice\"]')", "Pending action exposes encounter controls")
        check("(() => { clearPendingEncounterActionTimer(); const original = Math.random; Math.random = () => 0; const result = EncounterManager.completePendingAction(game.expedition, game.player, game.expedition.activeEncounter.pendingToken, {failExpedition}); Math.random = original; renderExpedition(); return result.resolved; })()", "Pending success action did not complete")
        check("game.expedition.activeEncounter.phase === 'result' && game.expedition.activeEncounter.resultText.includes('green glass vial') && game.expedition.unsecuredLoot.some(entry => entry.itemId === 'green_glass_vial')", "Hidden Hollow success text does not match its loot branch")
        check("Boolean(document.querySelector('[data-action=\"continue-journey\"]'))", "Continue Journey missing after pending result")
        devtools.click('[data-action="continue-journey"]')

        check("EncounterManager.force(game.expedition, 'hidden_hollow')", "Hidden Hollow failure case could not be triggered")
        devtools.evaluate("game.expedition.activeEncounter.stageId = 'inside_hollow'; const pending = EncounterManager.resolveChoice(game.expedition, game.player, 'search_stones', {failExpedition}); const original = Math.random; Math.random = () => 0.99; EncounterManager.completePendingAction(game.expedition, game.player, pending.pendingToken, {failExpedition}); Math.random = original; renderExpedition()")
        check("game.expedition.activeEncounter.phase === 'result' && game.expedition.activeEncounter.resultText.includes('nothing but damp earth')", "Hidden Hollow no-result branch is silent or inaccurate")
        devtools.click('[data-action="continue-journey"]')

        check("EncounterManager.force(game.expedition, 'hidden_hollow')", "Pending cancellation case could not be triggered")
        devtools.evaluate("game.expedition.activeEncounter.stageId = 'inside_hollow'; resolveEncounterChoice('search_stones')")
        check("!EncounterManager.resolveChoice(game.expedition, game.player, 'search_stones', {failExpedition}).resolved", "Pending choice could be resolved twice")
        green_before = devtools.evaluate("game.player.ownedItems.green_glass_vial || 0")
        devtools.evaluate("game.expedition.unsecuredLoot = [{itemId:'green_glass_vial', quantity:1}]")
        devtools.evaluate("adjustExpeditionProvisions(game.expedition, 4); adjustExpeditionProvisions(game.expedition, -2)")
        check("game.expedition.foundProvisions === 2", "Encounter-found provisions were not immediately usable")
        committed_remaining = devtools.evaluate("Math.floor(game.expedition.committedProvisionsRemaining)")
        stock_before_failure = devtools.evaluate("game.player.provisions")

        devtools.evaluate("failExpedition('Test failure')")
        check("game.screen === 'summary'", "Failure summary missing")
        check("pendingEncounterActionTimer === null", "Pending encounter timer survived expedition failure")
        check(f"(game.player.ownedItems.green_glass_vial || 0) === {green_before}", "Failed run secured unsecured loot")
        check(f"game.player.provisions === {stock_before_failure + committed_remaining}", "Failure did not return only unused purchased provisions")
        devtools.click('[data-action="new-expedition"]')
        check("game.screen === 'location'", "Failed expedition did not return to village")

        coin_before = devtools.evaluate("game.player.ownedItems.old_coin || 0")
        gold_before_return = devtools.evaluate("game.player.currentGold")
        success_stock_before = devtools.evaluate("game.player.provisions")
        success_carry = devtools.evaluate("Math.min(5, game.player.provisions)")
        devtools.evaluate("game.preparationMode='expedition'; game.preparationSupplies=Math.min(5,game.player.provisions); startExpedition(); game.expedition.unsecuredLoot = [{itemId:'old_coin', quantity:1}]; game.expedition.goldCarried = 3; adjustExpeditionProvisions(game.expedition, 3); adjustExpeditionProvisions(game.expedition, -1); completeReturn()")
        check("game.screen === 'summary' && game.summary.outcome === 'returned'", "Successful summary missing")
        check(f"game.player.ownedItems.old_coin === {coin_before + 1}", "Successful return did not secure loot")
        check(f"game.player.currentGold === {gold_before_return + 3}", "Successful return did not bank carried gold")
        check(f"game.player.provisions === {success_stock_before + 2}", "Successful return did not settle unused and found provisions")
        check(f"JSON.stringify(game.player.equippedItems) === {json.dumps(equipped_before)}", "Expedition changed equipped gear")
        check(f"JSON.stringify(game.player.packedItems) === {json.dumps(packed_before)}", "Expedition changed pack selection")
        devtools.click('[data-action="new-expedition"]')
        check("game.screen === 'location'", "Successful expedition did not return to village")

        devtools.evaluate("window.confirm = () => true; resetSave()")
        check("game.player.currentLocationId === 'broceliande_village'", "Reset produced invalid location")
        check("game.player.currentGold === 12", "Reset did not restore treasury")
        check("game.player.provisions === 24", "Reset did not restore provisions")
        check("devtools_errors_placeholder = true", "Runtime alive after reset")
        if devtools.console_errors:
            raise AssertionError(f"Runtime exceptions: {devtools.console_errors}")
        print(f"PASS: {checks} UI/provision/location browser assertions")
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
