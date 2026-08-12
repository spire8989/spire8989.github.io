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
        check("document.body.textContent.includes('Owned:') && document.body.textContent.includes('To carry:') && document.body.textContent.includes('Consumption:')", "Preparation does not show party provision details")
        check("game.preparationSupplies <= game.player.provisions", "Preparation selected more provisions than owned")
        check("PLAYER_CHARACTER_DEFINITION.provisionCapacity === 20 && PLAYER_CHARACTER_DEFINITION.provisionConsumptionMultiplier === 1", "Arthur's provision data is invalid")
        check("COMPANION_DEFINITIONS.sir_kay.provisionCapacityBonus === 10 && COMPANION_DEFINITIONS.sir_kay.provisionConsumptionBonus === 0.3", "Kay's provision data is invalid")
        check("EXPEDITION_TUNING.baseProvisionsPerDistance === 0.08 && !('maximumStartingProvisions' in EXPEDITION_TUNING)", "Provision tuning still uses the old cap or rate")
        check("partyProvisionCapacity('sir_kay') === 30 && partyProvisionConsumptionMultiplier('sir_kay') === 1.3 && partyProvisionCapacity(null) === 20 && partyProvisionConsumptionMultiplier(null) === 1", "Party provision calculations are invalid")
        check("sanitizePlayerState({...SaveSystem.createDefaultPlayerState(), selectedCompanion:null}, SaveSystem.createDefaultPlayerState()).selectedCompanion === null", "Solo party selection does not survive save sanitization")
        devtools.evaluate("game.preparationSupplies = 28; renderPreparation()")
        devtools.click('[data-action="select-companion"][data-companion-id=""]')
        check("game.player.selectedCompanion === null && game.preparationSupplies === 20 && document.body.textContent.includes('20 / 20') && document.body.textContent.includes('1.00×')", "Removing Kay did not clamp capacity or update consumption")
        devtools.click('[data-action="select-companion"][data-companion-id="sir_kay"]')
        check("game.player.selectedCompanion === 'sir_kay' && document.body.textContent.includes('/ 30') && document.body.textContent.includes('1.30×')", "Selecting Kay did not update party provision details")
        devtools.click('[data-action="return-from-preparation"]')
        check("game.activeDestinationId === 'forest_gate'", "Loadout back did not return to gate")
        devtools.click('[data-action="prepare-expedition"]')
        carried = devtools.evaluate("game.preparationSupplies")
        owned_before_start = devtools.evaluate("game.player.provisions")
        devtools.click('[data-action="start-expedition"]')
        check("game.screen === 'expedition' && game.expedition.status === 'active'", "Expedition did not begin")
        check(f"game.player.provisions === {owned_before_start - carried}", "Starting expedition did not commit owned provisions")
        check(f"game.expedition.committedProvisions === {carried} && game.expedition.provisions <= {carried} && game.expedition.provisions > {carried} - 0.2", "Expedition received free or incorrect provisions")
        check(f"game.expedition.provisionCapacity === 30 && game.expedition.provisionConsumptionMultiplier === 1.3 && game.expedition.carriedProvisions === {carried}", "Expedition did not snapshot party provision values")
        devtools.evaluate("game.expedition.selectedCompanion=null; renderExpedition()")
        check("!document.querySelector('.travelers .companion') && document.querySelector('.run-details')?.textContent.includes('Arthur')", "Solo expedition presentation is invalid")
        devtools.evaluate("game.expedition.selectedCompanion='sir_kay'; renderExpedition()")
        check("Math.abs(document.querySelector('.visual-frame').clientWidth / document.querySelector('.visual-frame').clientHeight - 16/9) < 0.02", "Travel visual is not 16:9")
        travel_provisions = devtools.evaluate("game.expedition.provisions")
        travel_distance = devtools.evaluate("game.expedition.distance")
        devtools.evaluate("updateExpedition(0.5)")
        check(f"game.expedition.provisions < {travel_provisions} && game.expedition.distance > {travel_distance}", "Travel did not consume carried provisions")
        check("Math.abs(EXPEDITION_TUNING.baseProvisionsPerDistance * game.expedition.provisionConsumptionMultiplier - 0.104) < 0.000001", "Kay's effective provision rate is invalid")
        check("(() => { const sample={committedProvisionsRemaining:30,foundProvisions:0,provisions:30}; adjustExpeditionProvisions(sample,5); return sample.provisions === 35 && sample.foundProvisions === 5; })()", "Found provisions were incorrectly capped at departure capacity")
        check("(() => { const original=game.expedition; const sample={...original,activeEncounter:null,status:'active',distance:10,maxDistanceReached:10,provisions:10,committedProvisionsRemaining:10,foundProvisions:0,encounterTravelDistance:0,nextEncounterAt:999}; game.expedition={...sample,direction:'outbound'}; updateExpedition(1); const outboundSpent=10-game.expedition.provisions; game.expedition={...sample,direction:'returning'}; updateExpedition(0.25); const returnSpent=10-game.expedition.provisions; game.expedition=original; return Math.abs(outboundSpent-returnSpent)<0.000001 && Math.abs(outboundSpent-(2.25*0.104))<0.000001; })()", "Equal outbound and return distances consume different provisions")
        check("(() => { const before=game.expedition.provisions; game.player.selectedCompanion=null; updateExpedition(1); const spent=before-game.expedition.provisions; return Math.abs(spent/(EXPEDITION_TUNING.outboundTravelSpeed)-0.104) < 0.000001 && game.expedition.provisionConsumptionMultiplier === 1.3; })()", "Active expedition consumption was not distance-based or changed after its snapshot")
        devtools.evaluate("game.player.selectedCompanion='sir_kay'")
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
        new_encounters = "['glint_in_mud','discarded_bundle','beneath_the_roots','lost_purse','broken_bridge','hermits_fire','wolves_in_brush','ruined_wayside_shrine','sunken_road']"
        check(f"{new_encounters}.every(id => Boolean(ENCOUNTER_DEFINITIONS[id]))", "New Broceliande encounter definitions are incomplete")
        check("Object.keys(ENCOUNTER_DEFINITIONS).length === 27", "Unexpected encounter pool size after content expansion")
        check("EXPEDITION_TUNING.encounterMinimumDistance === 14 && EXPEDITION_TUNING.encounterMaximumDistance === 22", "Encounter spacing changed during the content pass")
        check("ENCOUNTER_DEFINITIONS.glint_in_mud.repeatable && ENCOUNTER_DEFINITIONS.glint_in_mud.maxOccurrencesPerRun === 2 && ENCOUNTER_DEFINITIONS.wolves_in_brush.repeatable && ENCOUNTER_DEFINITIONS.wolves_in_brush.maxOccurrencesPerRun === 2", "Repeatable discovery or wolves occurrence caps are invalid")
        check("!Number.isFinite(ENCOUNTER_DEFINITIONS.glint_in_mud.maximumDistance) && !Number.isFinite(ENCOUNTER_DEFINITIONS.broken_bridge.maximumDistance) && !Number.isFinite(ENCOUNTER_DEFINITIONS.wolves_in_brush.maximumDistance)", "Deep-run content has an arbitrary upper distance cap")
        check("(() => { const expedition=game.expedition; const prior={distance:expedition.distance,path:expedition.currentPathId,direction:expedition.direction,seen:[...expedition.seenEncounterIds],occurrences:{...expedition.encounterOccurrences}}; Object.assign(expedition,{distance:120,currentPathId:'old_forest_road',direction:'returning',seenEncounterIds:[],encounterOccurrences:{}}); const eligible=EncounterManager.eligibleDefinitions(expedition,game.player).map(entry=>entry.id); Object.assign(expedition,{distance:prior.distance,currentPathId:prior.path,direction:prior.direction,seenEncounterIds:prior.seen,encounterOccurrences:prior.occurrences}); return ['glint_in_mud','broken_bridge','wolves_in_brush'].every(id=>eligible.includes(id)); })()", "Deep return travel lacks the intended new content")
        check("ENCOUNTER_DEFINITIONS.beneath_the_roots.pathIds.length === 1 && ENCOUNTER_DEFINITIONS.beneath_the_roots.pathIds[0] === 'overgrown_trail' && ENCOUNTER_DEFINITIONS.lost_purse.pathIds[0] === 'old_forest_road'", "Travel discovery path pools are invalid")
        check("ENCOUNTER_DEFINITIONS.hermits_fire.description.includes('nowhere to be seen') && !JSON.stringify(ENCOUNTER_DEFINITIONS.hermits_fire).toLowerCase().includes('merlin')", "Hermit's Fire implies prohibited story content")
        check("ENCOUNTER_DEFINITIONS.broken_bridge.stages.start.choices.find(choice => choice.id === 'use_rope').requirements.some(requirement => requirement.type === 'carriedItem' && requirement.itemId === 'rope')", "Broken Bridge rope requirement is invalid")
        check("(() => { const choice=ENCOUNTER_DEFINITIONS.broken_bridge.stages.start.choices.find(entry=>entry.id==='cross_carefully'); const random=choice.outcomes[0]; return Boolean(choice.pendingAction && random.resultText && random.elseResultText); })()", "Broken Bridge crossing feedback is incomplete")
        check("ENCOUNTER_DEFINITIONS.ruined_wayside_shrine.stages.start.choices.find(choice => choice.id === 'offering').outcomes.some(effect => effect.type === 'setRunFlag' && effect.flag === 'waysideOfferingMade')", "Wayside offering flag is missing")
        check("ENCOUNTER_DEFINITIONS.sunken_road.stages.start.choices.find(choice => choice.id === 'follow').outcomes.some(effect => effect.type === 'setRunFlag' && effect.flag === 'sunkenRoadExplored')", "Sunken Road exploration flag is missing")
        check("(() => { const items=ENCOUNTER_DEFINITIONS.beneath_the_roots.stages.start.choices.find(choice=>choice.id==='dig_out').outcomes[0].items; return items.find(entry=>entry.itemId==='green_glass_vial').weight < items.find(entry=>entry.itemId==='bronze_figurine').weight; })()", "Green Glass Vial is not rarer than ordinary root loot")
        check("(() => { const definitions=" + new_encounters + ".map(id=>ENCOUNTER_DEFINITIONS[id]); return definitions.every(encounter=>Object.values(encounter.stages).flatMap(stage=>stage.choices||[]).filter(choice=>!['leave','return','offering','throw_food'].includes(choice.id)).some(choice=>choice.pendingAction)); })()", "New effortful encounters are missing pending actions")
        check("(() => { const sample={selectedEquipment:{},carriedItems:{},unsecuredLoot:[],committedProvisionsRemaining:10,foundProvisions:0,provisions:10,runFlags:{}}; const original=Math.random; Math.random=()=>0; const result=EncounterOutcomes.resolve({type:'gainWeightedRandomUnsecuredItem',items:[{itemId:'old_coin',weight:5},{itemId:'silver_brooch',weight:1}],resultText:'Arthur finds {itemName}.'},{expedition:sample,player:game.player}); Math.random=original; return result.resultText === 'Arthur finds Old Silver Coins.' && sample.unsecuredLoot[0].itemId === 'old_coin' && result.messages[0].includes('UNSECURED'); })()", "Weighted unsecured loot does not identify or preserve the selected item")
        check("['hidden_hollow','whispering_oak','abandoned_cart','strange_lights','something_in_thorns','woodland_foraging','fallen_tree','wild_boar','woodland_stream','fading_light','sudden_storm','shelter_before_nightfall'].every(id => Object.values(ENCOUNTER_DEFINITIONS[id].stages).some(stage => stage.choices.some(choice => choice.pendingAction)))", "Authored delayed actions are missing")
        check("(() => { const required={abandoned_camp:['search_camp'],abandoned_cart:['search_for_owner'],wild_boar:['fight'],woodland_stream:['wade_across','use_rope'],fallen_tree:['use_rope'],shelter_before_nightfall:['rest','search_shelter'],sudden_storm:['shelter'],fading_light:['slow_down']}; return Object.entries(required).every(([encounterId,choiceIds]) => choiceIds.every(choiceId => Object.values(ENCOUNTER_DEFINITIONS[encounterId].stages).flatMap(stage => stage.choices || []).find(choice => choice.id === choiceId)?.pendingAction)); })()", "A specifically requested action delay is missing")
        check("Object.values(EXPEDITION_TUNING.encounterActionDelays).every(range => range.minimumMs >= 800 && range.maximumMs <= 2600)", "Pending action delay profiles are outside the intended range")
        check("['silver_brooch','amber_beads','decorated_buckle','merchants_ring','carved_ivory_token','bronze_figurine','polished_agate','embroidered_gloves','silver_cup','coin_purse'].every(id => ITEM_DEFINITIONS[id]?.category === 'valuable' && Number.isFinite(SHOP_DEFINITIONS.village_general_goods.sellValues[id]))", "Sellable valuable definitions are incomplete")
        check("new Set(Object.values(ENCOUNTER_DEFINITIONS).flatMap(encounter => Object.values(encounter.stages).flatMap(stage => stage.choices || []).flatMap(choice => choice.outcomes || []).filter(effect => ['gainRandomUnsecuredItem','gainWeightedRandomUnsecuredItem'].includes(effect.type)).flatMap(effect => effect.itemIds || effect.items.map(entry => entry.itemId)))).size >= 18", "Encounter loot pools remain too repetitive")
        health_before_encounter = devtools.evaluate("game.expedition.health")
        check("EncounterManager.resolveChoice(game.expedition, game.player, 'climb_over', {failExpedition}).pending", "Fallen Tree climb did not enter its pending phase")
        check("(() => { const original = Math.random; Math.random = () => 0; const result = EncounterManager.completePendingAction(game.expedition, game.player, game.expedition.activeEncounter.pendingToken, {failExpedition}); Math.random = original; renderExpedition(); return result.resolved; })()", "Pending Fallen Tree choice did not resolve")
        check(f"game.expedition.health === {health_before_encounter - 1} && game.expedition.activeEncounter.resultText.includes('injury')", "Fallen Tree injury text does not match its damage branch")
        devtools.click('[data-action="continue-journey"]')

        check("EncounterManager.force(game.expedition, 'glint_in_mud')", "Glint in the Mud could not be triggered")
        check("EncounterManager.resolveChoice(game.expedition, game.player, 'investigate', {failExpedition}).pending", "Glint investigation did not enter its pending phase")
        check("(() => { const original=Math.random; Math.random=()=>0; const result=EncounterManager.completePendingAction(game.expedition,game.player,game.expedition.activeEncounter.pendingToken,{failExpedition}); Math.random=original; renderExpedition(); return result.resolved; })()", "Glint investigation did not resolve")
        check("game.expedition.activeEncounter.resultText.includes('Old Silver Coins') && game.expedition.unsecuredLoot.some(entry=>entry.itemId==='old_coin') && document.body.textContent.includes('UNSECURED')", "Glint result did not identify and display unsecured loot")
        check("Boolean(document.querySelector('[data-action=\"continue-journey\"]'))", "Travel discovery did not wait for Continue Journey")
        devtools.click('[data-action="continue-journey"]')

        check("EncounterManager.force(game.expedition, 'hermits_fire')", "Hermit's Fire could not be triggered")
        devtools.evaluate("EncounterManager.resolveChoice(game.expedition,game.player,'search',{failExpedition})")
        check("(() => { const original=Math.random; Math.random=()=>0.99; const result=EncounterManager.completePendingAction(game.expedition,game.player,game.expedition.activeEncounter.pendingToken,{failExpedition}); Math.random=original; renderExpedition(); return result.resolved; })()", "Hermit shelter no-result branch did not resolve")
        check("game.expedition.activeEncounter.resultText.includes('nothing useful')", "Hermit shelter search failed silently")
        devtools.click('[data-action="continue-journey"]')

        check("EncounterManager.force(game.expedition, 'sunken_road')", "Sunken Road could not be triggered")
        devtools.evaluate("EncounterManager.resolveChoice(game.expedition,game.player,'search_stones',{failExpedition})")
        check("(() => { const original=Math.random; Math.random=()=>0.99; const result=EncounterManager.completePendingAction(game.expedition,game.player,game.expedition.activeEncounter.pendingToken,{failExpedition}); Math.random=original; renderExpedition(); return result.resolved; })()", "Sunken Road empty search did not resolve")
        check("game.expedition.activeEncounter.resultText.includes('only soil')", "Sunken Road empty search failed silently")
        devtools.click('[data-action="continue-journey"]')

        check("(() => { const expedition = game.expedition; const prior = {distance:expedition.distance,path:expedition.currentPathId,direction:expedition.direction,seen:[...expedition.seenEncounterIds],occurrences:{...expedition.encounterOccurrences}}; expedition.distance=120; expedition.currentPathId='old_forest_road'; expedition.direction='returning'; expedition.seenEncounterIds=[]; expedition.encounterOccurrences={sudden_storm:1,woodland_stream:1}; const first=EncounterManager.eligibleDefinitions(expedition,game.player).map(entry=>entry.id); expedition.encounterOccurrences={sudden_storm:2,woodland_stream:2}; expedition.seenEncounterIds=['sudden_storm','woodland_stream']; const capped=EncounterManager.eligibleDefinitions(expedition,game.player).map(entry=>entry.id); Object.assign(expedition,{distance:prior.distance,currentPathId:prior.path,direction:prior.direction,seenEncounterIds:prior.seen,encounterOccurrences:prior.occurrences}); return first.includes('sudden_storm') && first.includes('woodland_stream') && !capped.includes('sudden_storm') && !capped.includes('woodland_stream'); })()", "Deep-run eligibility or per-run occurrence caps are invalid")

        check("EncounterManager.force(game.expedition, 'abandoned_cart')", "Abandoned Cart success branch could not be triggered")
        check("EncounterManager.resolveChoice(game.expedition, game.player, 'search_for_owner', {failExpedition}).pending", "Owner search did not enter its pending phase")
        check("(() => { const original=Math.random; Math.random=()=>0; const result=EncounterManager.completePendingAction(game.expedition,game.player,game.expedition.activeEncounter.pendingToken,{failExpedition}); Math.random=original; renderExpedition(); return result.resolved; })()", "Owner search success branch did not resolve")
        check("game.expedition.activeEncounter.phase === 'choice' && game.expedition.activeEncounter.stageId === 'vanishing_trail' && document.body.textContent.includes('Broken branches')", "Owner search success did not reach the trail stage")
        devtools.evaluate("game.expedition.activeEncounter = null")
        check("EncounterManager.force(game.expedition, 'abandoned_cart')", "Abandoned Cart failure branch could not be triggered")
        devtools.evaluate("EncounterManager.resolveChoice(game.expedition, game.player, 'search_for_owner', {failExpedition})")
        check("(() => { const original=Math.random; Math.random=()=>0.99; const result=EncounterManager.completePendingAction(game.expedition,game.player,game.expedition.activeEncounter.pendingToken,{failExpedition}); Math.random=original; renderExpedition(); return result.resolved; })()", "Owner search failure branch did not resolve")
        check("game.expedition.activeEncounter.phase === 'result' && game.expedition.activeEncounter.resultText.includes('no tracks clear enough')", "Owner search failure did not end with explicit feedback")
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

        check("EncounterManager.force(game.expedition, 'shelter_before_nightfall')", "Shelter search failure case could not be triggered")
        devtools.evaluate("const shelterPending = EncounterManager.resolveChoice(game.expedition, game.player, 'search_shelter', {failExpedition}); const shelterRandom = Math.random; Math.random = () => 0.99; EncounterManager.completePendingAction(game.expedition, game.player, shelterPending.pendingToken, {failExpedition}); Math.random = shelterRandom; renderExpedition()")
        check("game.expedition.activeEncounter.phase === 'result' && game.expedition.activeEncounter.resultText.includes('nothing useful')", "Shelter search no-result branch is silent or inaccurate")
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
        devtools.evaluate("game.player.provisions = 0; game.player.currentGold = 0; savePlayer()")
        devtools.click('[data-action="new-expedition"]')
        check("game.screen === 'location'", "Failed expedition did not return to village")
        check("game.player.provisions >= EXPEDITION_TUNING.minimumTownProvisions", "Town provision floor did not prevent a softlock")

        devtools.evaluate("game.player.ownedItems.silver_cup = 1; game.player.currentGold = 0; savePlayer()")
        devtools.click('[data-destination-id="merchant"]')
        devtools.click('[data-action="shop-tab"][data-tab="sell"]')
        devtools.click('[data-action="sell-item"][data-item-id="silver_cup"]')
        check("game.player.currentGold === 15 && !game.player.ownedItems.silver_cup", "New valuable could not be sold for its data-driven price")
        devtools.click('[data-action="show-location"]')

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
