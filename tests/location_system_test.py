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
        check("!document.querySelector('.simulation-tools')", "Simulation tools leaked into ordinary gameplay")
        check("(() => { const a=GameRandom.create('repeatable'); const b=GameRandom.create('repeatable'); return Array.from({length:20},()=>a.random()).every(value=>value===b.random()); })()", "Seeded RNG is not repeatable")
        check("(() => { const a=GameRandom.create('one'); const b=GameRandom.create('two'); return Array.from({length:10},()=>a.random()).some(value=>value!==b.random()); })()", "Different RNG seeds produced identical streams")
        check("(() => { const scenario={seed:'determinism',strategy:'random',provisions:24,turnaroundPolicy:{type:'fixedDistance',distance:50}}; const a=SimulationRunner.run(scenario); const b=SimulationRunner.run(scenario); return JSON.stringify({outcome:a.outcome,events:a.events,decisions:a.decisions,encounters:a.encounters,combats:a.combats})===JSON.stringify({outcome:b.outcome,events:b.events,decisions:b.decisions,encounters:b.encounters,combats:b.combats}); })()", "Identical simulation seeds and scenarios were not deterministic")
        check("(() => { const runs=Array.from({length:12},(_,index)=>SimulationRunner.run({seed:`variance-${index}`,strategy:'random',turnaroundPolicy:{type:'fixedDistance',distance:65}})); return new Set(runs.map(run=>JSON.stringify(run.decisions))).size>1; })()", "Different simulation seeds could not vary decisions")
        check("(() => { const run=SimulationRunner.run({seed:'completion',strategy:'aggressive',turnaroundPolicy:{type:'fixedDistance',distance:75}}); return ['returned','failed'].includes(run.outcome) && run.stepCount<10000 && Array.isArray(run.events) && Array.isArray(run.encounters) && Array.isArray(run.combats); })()", "Representative simulation did not terminate with telemetry")
        check("(() => { const batch=SimulationRunner.runBatch({scenarios:[{id:'combat-coverage',strategy:'aggressive',turnaroundPolicy:{type:'fixedDistance',distance:100}}],runsPerScenario:40}); const combat=batch.results.flatMap(run=>run.combats)[0]; return combat && combat.actions>0 && combat.actionEvents.length>0 && Number.isFinite(combat.damageDealt) && batch.results.some(run=>run.events.some(event=>event.type==='combat-resolution')); })()", "Simulated production combat did not produce action telemetry")
        check("(() => { const batch=SimulationRunner.runBatch({scenarios:[{id:'a',strategy:'cautious'},{id:'b',strategy:'greedy'}],runsPerScenario:5}); return batch.results.length===10 && batch.summary.totalRuns===10 && batch.summary.encounters.every(entry=>Number.isFinite(entry.averageDistance)); })()", "Batch runner or aggregation returned invalid results")
        check("(() => { const run=SimulationRunner.run({seed:'invariants',strategy:'greedy',turnaroundPolicy:{type:'provisionReserve',reserve:2}}); return [run.maximumDistance,run.finalDistance,run.finalArthurHealth,run.provisionsRemaining,run.provisionsConsumed].every(Number.isFinite) && run.finalDistance>=0 && run.provisionsRemaining>=0 && run.events.every(event=>event&&typeof event.type==='string'); })()", "Simulation resource or telemetry invariants failed")
        devtools.click('[data-action="enter-location"]')
        check("game.screen === 'location'", "Chapter III did not open the village")
        check("document.querySelectorAll('.hub-hotspot').length === 5 && document.querySelector('[data-destination-id=\"hall\"]')?.classList.contains('is-story-destination') && document.querySelector('[data-destination-id=\"hall\"]')?.classList.contains('position-center')", "Village should expose the Hall and four service locations")
        check("!game.player.campaignFlags.broceliande_intro_complete && document.querySelector('[data-destination-id=\"hall\"]') && [...document.querySelectorAll('.hub-hotspot')].filter(button => button.dataset.destinationId !== 'hall').every(button => button.disabled)", "Fresh village should emphasize only the Hall")
        check("document.querySelector('[data-action=\"prepare-expedition\"]')?.disabled && !document.querySelector('[data-action=\"view-inventory\"]')", "Fresh village should keep preparation locked until the introduction")
        devtools.click('[data-destination-id="hall"]')
        time.sleep(0.1)
        check("game.screen === 'destination' && game.dialogueSession?.sequenceId === 'broceliande_intro' && Boolean(document.querySelector('.dialogue-overlay'))", "Hall did not open the first-entry dialogue overlay")
        check("(() => { const visual=document.querySelector('.destination-visual'); const frame=visual.getBoundingClientRect(); const style=getComputedStyle(visual); return style.aspectRatio.replaceAll(' ', '')==='2/1' && Math.abs(frame.width/frame.height-2)<0.02 && [...visual.children].every(child=>{const box=child.getBoundingClientRect(); return box.left>=frame.left&&box.right<=frame.right&&box.top>=frame.top&&box.bottom<=frame.bottom;}); })()", "Hall destination hero is not an explicit contained 2:1 frame")
        check("Boolean(document.querySelector('#dialogue-speaker')?.textContent && document.querySelector('#dialogue-text')?.textContent && document.querySelector('.dialogue-portrait'))", "Dialogue presentation is missing speaker, text, or portrait placeholder")
        check("(() => { const overlay=document.querySelector('.dialogue-overlay'); const box=document.querySelector('.dialogue-box').getBoundingClientRect(); const viewport=document.querySelector('.game-viewport').getBoundingClientRect(); const header=document.querySelector('.game-header').getBoundingClientRect(); const style=getComputedStyle(overlay); return style.alignItems==='center' && box.top>header.bottom && box.top<viewport.top+viewport.height*0.75 && box.bottom<viewport.bottom-8 && style.pointerEvents==='auto'; })()", "Dialogue card is still bottom-anchored or outside the portrait viewport")
        check("(() => { const box=document.querySelector('.dialogue-box').getBoundingClientRect(); const viewport=document.querySelector('.game-viewport').getBoundingClientRect(); return box.height < viewport.height * 0.62; })()", "Dialogue card retained the old large fixed-height dead space")
        check("(() => { const button=document.querySelector('.dialogue-continue'); const copy=document.querySelector('.dialogue-copy'); if (!button || !copy) return false; const style=getComputedStyle(button); const height=button.getBoundingClientRect().height; const buttonBox=button.getBoundingClientRect(); const copyBox=copy.getBoundingClientRect(); return height>=36 && height<=41 && buttonBox.width<copyBox.width && buttonBox.right<=copyBox.right+1 && style.backgroundColor==='rgb(103, 41, 35)' && style.boxShadow==='none' && style.fontWeight==='600'; })()", "Reeve short-dialogue Continue action is still stretched or styled as a major CTA")
        check("(() => { const background=getComputedStyle(document.querySelector('.dialogue-overlay')).backgroundImage; return background!=='none' && (background.includes('0.7') || background.includes('0.78')); })()", "Dialogue backdrop did not receive the stronger mobile-safe dimming")
        for _ in range(5):
            devtools.click('[data-action="dialogue-continue"]')
        check("game.player.campaignFlags.broceliande_intro_complete && SaveSystem.load().campaignFlags.broceliande_intro_complete && !game.dialogueSession && Boolean(document.querySelector('.toast-major')) && document.querySelector('.toast').getBoundingClientRect().top >= document.querySelector('.game-header').getBoundingClientRect().bottom + 8", "Completing the introduction did not unlock the village or show its toast cleanly")
        devtools.click('[data-action="show-location"]')
        check("document.querySelectorAll('.hub-hotspot').length === 5 && [...document.querySelectorAll('.hub-hotspot')].every(button => !button.disabled) && document.querySelector('[data-action=\"prepare-expedition\"]') && !document.querySelector('[data-action=\"prepare-expedition\"]').disabled", "Post-intro village destinations did not unlock")
        check("document.querySelector('[data-destination-id=\"apothecary\"]')?.classList.contains('position-southeast')", "Apothecary did not move to the southeast hotspot")
        devtools.click('[data-destination-id="hall"]')
        check("game.screen === 'destination' && !game.dialogueSession && document.body.textContent.includes('Find a way to reach Merlin.')", "Hall replayed the first-entry introduction or lost its objective")
        check("(() => { const description=DESTINATION_DEFINITIONS.hall.description; return !document.querySelector('.destination-visual')?.textContent.includes(description) && !document.querySelector('.destination-heading') && !document.querySelector('.interaction-scroll')?.textContent.includes(description) && document.querySelector('#destination-title')?.textContent===DESTINATION_DEFINITIONS.hall.name; })()", "Hall repeated its atmospheric description in the visual or interaction panel")
        devtools.click('[data-action="npc-talk"][data-npc-id="village_reeve"]')
        check("Boolean(document.querySelector('.dialogue-overlay') && document.querySelectorAll('.dialogue-choice').length === 2)", "Post-intro Hall dialogue did not render its choices as an overlay")
        check("(() => { const buttons=[...document.querySelectorAll('.dialogue-choice')]; const copy=document.querySelector('.dialogue-copy').getBoundingClientRect(); return buttons.every(button=>{ const style=getComputedStyle(button); const box=button.getBoundingClientRect(); return box.height>=36 && box.width>=copy.width*0.95 && style.backgroundColor==='rgb(103, 41, 35)' && style.boxShadow==='none'; }); })()", "Reeve dialogue choices lost their comfortable full-width treatment")
        for width, height in ((320, 480), (360, 640), (390, 844), (430, 932)):
            devtools.call("Emulation.setDeviceMetricsOverride", {
                "width": width,
                "height": height,
                "deviceScaleFactor": 1,
                "mobile": True,
            })
            time.sleep(0.04)
            check("(() => { const overlay=document.querySelector('.dialogue-overlay').getBoundingClientRect(); const box=document.querySelector('.dialogue-box').getBoundingClientRect(); const viewport=document.querySelector('.game-viewport').getBoundingClientRect(); return overlay.left>=viewport.left&&overlay.right<=viewport.right&&box.top>=viewport.top&&box.bottom<=viewport.bottom; })()", f"Dialogue overlay escaped the portrait viewport at {width}x{height}")
            check("(() => { const visual=document.querySelector('.destination-visual'); const frame=visual.getBoundingClientRect(); return Math.abs(frame.width/frame.height-2)<0.02 && [...visual.children].every(child=>{const box=child.getBoundingClientRect(); return box.left>=frame.left&&box.right<=frame.right&&box.top>=frame.top&&box.bottom<=frame.bottom;}); })()", f"Hall 2:1 destination hero content escaped the frame at {width}x{height}")
        devtools.call("Emulation.clearDeviceMetricsOverride")
        time.sleep(0.04)
        devtools.evaluate("game.dialogueSession=DialogueSystem.startSimple('village_reeve','A longer test line establishes that the dialogue copy can hold several lines of readable text without pushing the presentation outside the phone viewport.'); game.dialogueSession.transientSequence.nodes.simple.choices=[{id:'choice_one',label:'First choice'},{id:'choice_two',label:'Second choice'},{id:'choice_three',label:'Third choice'}]; renderDestination()")
        check("(() => { const box=document.querySelector('.dialogue-box').getBoundingClientRect(); const viewport=document.querySelector('.game-viewport').getBoundingClientRect(); const choices=[...document.querySelectorAll('.dialogue-choice')]; return choices.length===3 && box.bottom<=viewport.bottom && box.top>=viewport.top && choices.every(choice=>{const rect=choice.getBoundingClientRect(); return rect.left>=box.left&&rect.right<=box.right&&rect.bottom<=box.bottom;}); })()", "Three dialogue choices or longer dialogue text overflowed the portrait viewport")
        for width, height in ((320, 480), (360, 640)):
            devtools.call("Emulation.setDeviceMetricsOverride", {
                "width": width,
                "height": height,
                "deviceScaleFactor": 1,
                "mobile": True,
            })
            time.sleep(0.04)
            check("(() => { const box=document.querySelector('.dialogue-box').getBoundingClientRect(); const viewport=document.querySelector('.game-viewport').getBoundingClientRect(); return document.querySelectorAll('.dialogue-choice').length===3&&box.top>=viewport.top&&box.bottom<=viewport.bottom; })()", f"Three dialogue choices escaped the viewport at {width}x{height}")
        devtools.call("Emulation.clearDeviceMetricsOverride")
        time.sleep(0.04)
        devtools.click('[data-action="dialogue-choice"][data-choice-id="choice_one"]')
        check("!game.dialogueSession && !document.querySelector('.dialogue-overlay')", "Three-choice dialogue did not close cleanly")
        devtools.call("Emulation.setDeviceMetricsOverride", {"width": 320, "height": 480, "deviceScaleFactor": 1, "mobile": True})
        devtools.evaluate("game.dialogueSession=DialogueSystem.startSimple('village_reeve','A short line.'); renderDestination()")
        check("(() => { const button=document.querySelector('.dialogue-continue'); const copy=document.querySelector('.dialogue-copy'); if (!button || !copy) return false; const buttonBox=button.getBoundingClientRect(); const copyBox=copy.getBoundingClientRect(); return buttonBox.height>=36 && buttonBox.height<=41 && buttonBox.width<copyBox.width && buttonBox.right<=copyBox.right+1; })()", "Narrow-phone Continue action became full-width or lost its compact touch target")
        devtools.call("Emulation.clearDeviceMetricsOverride")
        devtools.click('[data-action="dialogue-continue"]')
        devtools.click('[data-action="npc-talk"][data-npc-id="village_reeve"]')
        devtools.click('[data-action="dialogue-choice"][data-choice-id="ask_forest"]')
        check("(() => { const button=document.querySelector('.dialogue-continue'); return Boolean(button) && button.getBoundingClientRect().height>=36 && button.getBoundingClientRect().height<=41; })()", "Reeve follow-up Continue action is not compact and touch-friendly")
        devtools.click('[data-action="dialogue-continue"]')
        devtools.click('[data-action="dialogue-continue"]')
        check("!game.dialogueSession && !document.querySelector('.dialogue-overlay')", "Hall dialogue did not exit cleanly after a choice")
        devtools.click('[data-action="show-location"]')
        check("Object.keys(MATERIAL_DEFINITIONS).length === 10 && Object.keys(RECIPE_DEFINITIONS).length === 9", "Crafting content definitions are incomplete")
        check("(() => { const reward={type:'material',materialId:'raw_meat',quantity:1}; const zero=renderRewardCards([{type:'material',materialId:'raw_meat',quantity:0,rejectedQuantity:2}]); return rewardDisplayName(reward)==='Raw Meat' && rewardCategoryLabel(reward)==='Crafting Material' && zero.includes('No rewards') && !zero.includes('×0') && !zero.includes('Unknown reward'); })()", "Ingredient materials did not resolve in reward presentation or zero rewards still rendered as cards")
        check("(() => { const make=(packed)=>{ const player=SaveSystem.createDefaultPlayerState(); player.selectedCompanions=[]; player.selectedCompanion=null; player.materials.raw_meat=packed; player.packedMaterials={raw_meat:packed}; return {player,expedition:ExpeditionRules.createExpedition(player,{companions:[],provisions:8,random:()=>0})}; }; const partial=make(9); const partialResult=EncounterOutcomes.resolve({type:'gainUnsecuredItem',itemId:'raw_meat',quantity:2},{player:partial.player,expedition:partial.expedition}); const partialCard=renderRewardCards(partialResult.rewards); const full=make(10); const fullResult=EncounterOutcomes.resolve({type:'gainUnsecuredItem',itemId:'raw_meat',quantity:2},{player:full.player,expedition:full.expedition}); const fullCards=renderRewardCards(fullResult.rewards); return partialResult.rewards[0]?.quantity===1 && partialResult.rewards[0]?.rejectedQuantity===1 && partialCard.includes('Raw Meat') && partialCard.includes('×1') && partialCard.includes('1 collected · 1 left behind') && fullResult.rewards.length===0 && !fullCards.includes('reward-card') && fullResult.messages[0].includes('Material Bag was full') && !fullResult.messages[0].includes('×0'); })()", "Material reward definitions or partial/full Material Bag feedback is incorrect")
        check("(() => { const recipesValid=Object.values(RECIPE_DEFINITIONS).every(recipe=>{ const ingredients=Object.entries(recipe.ingredients).every(([id,quantity])=>(recipe.ingredientType==='item'?ITEM_DEFINITIONS[id]:MATERIAL_DEFINITIONS[id])&&Number.isInteger(quantity)&&quantity>0); const output=recipe.output.provisions>0||ITEM_DEFINITIONS[recipe.output.itemId]; return CRAFTING_PROVIDER_DEFINITIONS[recipe.craftingProvider]&&output&&RARITY_DEFINITIONS[recipe.rarity]&&ingredients; }); const entryValid=entry=>Number(entry.weight)>0&&({gold:true,material:Boolean(MATERIAL_DEFINITIONS[entry.materialId]),item:Boolean(ITEM_DEFINITIONS[entry.itemId]),recipe:Boolean(RECIPE_DEFINITIONS[entry.recipeId]),table:Boolean(LOOT_TABLE_DEFINITIONS[entry.tableId])})[entry.type]; return recipesValid&&Object.values(LOOT_TABLE_DEFINITIONS).every(table=>table.entries.length>0&&table.entries.every(entryValid))&&EXPEDITION_RETURN_REWARD_TIERS.every(tier=>tier.sources.every(source=>LOOT_TABLE_DEFINITIONS[source.tableId]&&source.rolls>0)); })()", "Recipe, loot-table, or return-tier references are invalid")
        check("game.player.saveVersion === 10 && game.player.learnedRecipes.includes('bandages') && game.player.materials.cloth === 3 && game.player.materials.raw_meat === 2 && !game.player.ownedItems.raw_meat && MaterialRules.collectionTotal(game.player.packedMaterials) === 10", "Fresh crafting state is invalid")
        check("(() => { const migrated=sanitizePlayerState({saveVersion:6,materials:{iron:2,unknown:9},ownedItems:{raw_meat:2},packedItems:['raw_meat'],learnedRecipes:['antidote','unknown'],injuries:{arthur:['deep_cut','deep_cut','unknown']}},SaveSystem.createDefaultPlayerState()); return migrated.saveVersion===10&&migrated.materials.iron===2&&migrated.materials.raw_meat===2&&!migrated.materials.unknown&&!migrated.ownedItems.raw_meat&&!migrated.packedItems.includes('raw_meat')&&migrated.packedMaterials.raw_meat===2&&migrated.learnedRecipes.length===1&&migrated.learnedRecipes[0]==='antidote'&&migrated.injuries.arthur.length===1&&migrated.injuries.arthur[0]==='deep_cut'&&migrated.campaignFlags.broceliande_intro_complete; })()", "Crafting save migration did not sanitize stable IDs, injuries, or move ingredients into the Material Bag")
        check("(() => { const player=SaveSystem.createDefaultPlayerState(); player.packedMaterials={raw_meat:2,mushrooms:1,fresh_herbs:1,honey:1,wild_berries:1,medicinal_herbs:2,cloth:2}; const expedition=ExpeditionRules.createExpedition(player,{companions:[],provisions:8,random:()=>0}); const found=MaterialRules.addUnsecured(expedition,'raw_meat',2); const before=MaterialRules.expeditionQuantity(expedition,'raw_meat'); const result=CraftingRules.craft(player,'hunters_stew','campfire',{expedition}); return found.accepted===0&&found.rejected===2&&before===2&&result.applied&&result.materialBagConsumed.raw_meat===1&&result.materialBagConsumed.mushrooms===1&&result.materialBagConsumed.fresh_herbs===1&&MaterialRules.expeditionQuantity(expedition,'raw_meat')===1&&Object.keys(expedition.materialBagRejected).length>0; })()", "Material Bag capacity or secured cooking ingredients are invalid")
        check("(() => { const player=SaveSystem.createDefaultPlayerState(); player.materials.raw_meat=0; player.packedMaterials={}; const expedition=ExpeditionRules.createExpedition(player,{companion:null,provisions:8,health:40,random:()=>0}); const found=MaterialRules.addUnsecured(expedition,'raw_meat',1); const before=MaterialRules.expeditionContents(expedition); const result=CraftingRules.craft(player,'roasted_meat','campfire',{expedition}); const cooked=expedition.provisions===11&&MaterialRules.expeditionQuantity(expedition,'raw_meat')===0; ExpeditionRules.settle(player,expedition,false); return found.accepted===1&&before.raw_meat===1&&result.applied&&result.materialBagConsumed.raw_meat===1&&cooked&&!player.materials.raw_meat&&!expedition.materialsLost.raw_meat; })()", "Found expedition materials were not cookable through the live Material Bag before settlement")
        check("(() => { const successPlayer=SaveSystem.createDefaultPlayerState(); successPlayer.materials.wood=0; successPlayer.packedMaterials={}; const success=ExpeditionRules.createExpedition(successPlayer,{companion:null,random:()=>0}); const successFound=MaterialRules.addUnsecured(success,'wood',2); ExpeditionRules.settle(successPlayer,success,true); const failedPlayer=SaveSystem.createDefaultPlayerState(); failedPlayer.materials.wood=0; failedPlayer.packedMaterials={}; const failed=ExpeditionRules.createExpedition(failedPlayer,{companion:null,random:()=>0}); const failedFound=MaterialRules.addUnsecured(failed,'wood',2); ExpeditionRules.settle(failedPlayer,failed,false); return successFound.accepted===2&&successPlayer.materials.wood===2&&success.materialsReturned.wood===2&&failedFound.accepted===2&&!failedPlayer.materials.wood&&failed.materialsLost.wood===2; })()", "Material Bag settlement did not secure success loot or discard failure loot")
        check("(() => { const player=SaveSystem.createDefaultPlayerState(); player.packedMaterials={}; const expedition=ExpeditionRules.createExpedition(player,{random:()=>0}); const reward=LootRules.resolveTable('forest_materials',{player,expedition,random:()=>0,debugLog:expedition.lootDebugLog}); return reward.materialId==='medicinal_herbs'&&expedition.unsecuredMaterials.medicinal_herbs===1&&expedition.lootDebugLog.some(event=>event.type==='loot-selected'); })()", "Nested material loot did not resolve into staged expedition state")
        check("(() => { const player=SaveSystem.createDefaultPlayerState(); player.learnedRecipes=['bandages','repair_kit','healing_poultice']; const expedition=ExpeditionRules.createExpedition(player,{random:()=>0}); const reward=LootRules.resolveTable('apothecary_common_recipes',{player,expedition,random:()=>0}); return reward?.recipeId==='antidote'&&expedition.unsecuredRecipes[0]==='antidote'; })()", "Known recipes were not filtered from loot eligibility")
        check("LootRules.entryEligible({type:'table',tableId:'common_materials',weight:1},{player:game.player},{depth:1,ancestors:['common_materials']})===false", "Loot-table cycle protection is invalid")
        check("[0,20,40,60,90].map(distance=>LootRules.returnRewardTier(distance).id).join(',')==='minor,low,medium,high,deep'", "Expedition return reward tiers are invalid")
        check("(() => { const player=SaveSystem.createDefaultPlayerState(); const expedition=ExpeditionRules.createExpedition(player,{random:()=>0}); LootRules.awardExpeditionReturn(player,expedition); return expedition.unsecuredMaterials.medicinal_herbs===undefined && expedition.returnRewardContents.materials.medicinal_herbs===1 && expedition.returnRewardResults.length===1; })()", "Return-tier rewards still merged into unsecured expedition haul")
        check("!document.querySelector('.location-panel') && Boolean(document.querySelector('.location-scene') && document.querySelector('.hub-hud'))", "Village scene and HUD structure is invalid")
        check("document.querySelector('.hub-status')?.textContent.includes('Provisions')", "Village provision overlay missing")
        for width, height in ((320, 480), (360, 640), (390, 844), (430, 932)):
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
            check("(() => { const apothecary=document.querySelector('[data-destination-id=\"apothecary\"]').getBoundingClientRect(); const scene=document.querySelector('.location-scene').getBoundingClientRect(); return apothecary.left > scene.left + scene.width * 0.45 && apothecary.top > scene.top + scene.height * 0.45; })()", f"Apothecary is not southeast of the village at {width}x{height}")
            check("(() => { const button=document.querySelector('[data-destination-id=\"apothecary\"]'); const before=button.getBoundingClientRect(); button.classList.add('is-pressed'); const pressed=button.getBoundingClientRect(); button.classList.remove('is-pressed'); return Math.abs(pressed.left-before.left)<5 && Math.abs(pressed.top-before.top)<5; })()", f"Pressed Apothecary jumps away from its southeast position at {width}x{height}")
            devtools.evaluate("ToastNotifications.dismissAll(); showToast({title:'Viewport check',duration:800})")
            check("(() => { const toast=document.querySelector('.toast'); const region=document.querySelector('#toast-region').getBoundingClientRect(); const header=document.querySelector('.game-header').getBoundingClientRect(); const viewport=document.querySelector('.game-viewport').getBoundingClientRect(); return toast && region.top >= header.bottom + 8 && region.left >= viewport.left && region.right <= viewport.right && toast.getBoundingClientRect().bottom <= viewport.bottom; })()", f"Toast stack is not anchored safely beneath the header at {width}x{height}")
            devtools.evaluate("ToastNotifications.dismissAll()")
        check("document.querySelector('.hub-identity').clientHeight < document.querySelector('.location-scene').clientHeight * 0.12", "Village title card is not compact")

        devtools.click('[data-action="prepare-expedition"]')
        check("game.screen === 'preparation' && game.preparationMode === 'expedition' && document.querySelector('#preparation-title')?.textContent === 'Prepare for Expedition'", "Village preparation CTA did not open the unified preparation screen")
        check("game.preparationStep === 'route' && document.querySelectorAll('.preparation-step').length === 4 && document.querySelector('.preparation-step.is-current')?.textContent.includes('Route') && document.querySelectorAll('.expedition-option').length === 4", "Preparation did not open on the compact Route step")
        check("!document.querySelector('.inventory-card') && !document.querySelector('.party-slot-list') && !document.querySelector('[data-action=\"start-expedition\"]')", "Preparation step isolation is missing from the Route step")
        check("document.querySelector('[data-action=\"show-location\"]')?.textContent.includes('Village') && !document.querySelector('[data-action=\"return-from-preparation\"]')", "Preparation does not provide top Village navigation")
        check("!document.body.textContent.includes('Inventory & Pack') && !document.body.textContent.includes('Prepare the Company')", "Legacy preparation labels still appear")
        devtools.click('[data-action="preparation-continue"]')
        check("Boolean(game.preparationStep === 'gear' && document.querySelector('.preparation-step.is-current')?.textContent.includes('Gear') && document.querySelector('.inventory-card') && document.querySelector('.equipment-slots') && document.querySelector('.pack-list'))", "Preparation did not advance to the Gear & Pack step")
        check("!document.querySelector('.expedition-option') && !document.querySelector('.party-slot-list') && !document.querySelector('[data-action=\"start-expedition\"]')", "Preparation step isolation is missing from the Gear & Pack step")
        devtools.click('[data-action="toggle-pack-item"][data-item-id="rope"]')
        check("!game.player.packedItems.includes('rope') && document.querySelector('[data-action=\"toggle-pack-item\"][data-item-id=\"rope\"]')?.textContent.includes('Pack')", "Packed items could not be removed from the unified preparation screen")
        devtools.click('[data-action="toggle-pack-item"][data-item-id="rope"]')
        check("game.player.packedItems.includes('rope') && [...document.querySelectorAll('[data-action=\"toggle-pack-item\"][data-item-id=\"rope\"]')].some(button => button.textContent.includes('Packed'))", "Packable inventory items could not be packed from the unified preparation screen")
        devtools.evaluate("game.player.ownedItems.hunters_charm=1; renderPreparation()")
        devtools.click('[data-action="equip-item"][data-item-id="hunters_charm"]')
        check("game.player.equippedItems.relic === 'hunters_charm' && !game.player.packedItems.includes('hunters_charm') && document.querySelector('[data-action=\"equip-item\"][data-item-id=\"hunters_charm\"]')?.disabled", "Equipment could not be equipped from the unified preparation screen")
        devtools.evaluate("game.player.equippedItems.relic='silver_stag_medallion'; delete game.player.ownedItems.hunters_charm; savePlayer(); renderPreparation()")
        check("EXPEDITION_TUNING.packSlots === 6 && document.querySelectorAll('.pack-item-card').length <= EXPEDITION_TUNING.packSlots", "Unified preparation screen does not preserve the expedition pack limit")
        check("(() => { const originalPacked=[...game.player.packedItems]; const originalOwned={...game.player.ownedItems}; const candidates=Object.values(ITEM_DEFINITIONS).filter(item=>item.carriable&&!MaterialRules.isMaterialId(item.id)&&!Object.values(game.player.equippedItems).includes(item.id)); if(candidates.length<7)return false; candidates.forEach(item=>{game.player.ownedItems[item.id]=Math.max(1,game.player.ownedItems[item.id]||0);}); game.player.packedItems=candidates.slice(0,6).map(item=>item.id); renderPreparation(); const extra=candidates[6]; const disabled=document.querySelector(`[data-action=\"toggle-pack-item\"][data-item-id=\"${extra.id}\"]`)?.disabled; game.player.packedItems=originalPacked; game.player.ownedItems=originalOwned; renderPreparation(); return disabled===true; })()", "Unified preparation screen did not enforce the existing pack slot limit")
        for width, height in ((320, 480), (360, 640), (390, 844), (430, 932)):
            devtools.call("Emulation.setDeviceMetricsOverride", {
                "width": width,
                "height": height,
                "deviceScaleFactor": 1,
                "mobile": True,
            })
            time.sleep(0.04)
            check("(() => { const prep=document.querySelector('.preparation-screen'); const back=document.querySelector('.preparation-back').getBoundingClientRect(); const viewport=document.querySelector('.game-viewport').getBoundingClientRect(); return prep.scrollWidth===prep.clientWidth&&back.top>=viewport.top&&back.bottom<=viewport.bottom; })()", f"Preparation top navigation or horizontal layout is invalid at {width}x{height}")
            check("(() => { const prep=document.querySelector('.preparation-screen'); const button=document.querySelector('[data-action=\"preparation-continue\"]'); prep.scrollTop=prep.scrollHeight; const box=button.getBoundingClientRect(); const viewport=document.querySelector('.game-viewport').getBoundingClientRect(); prep.scrollTop=0; return box.top>=viewport.top-1&&box.bottom<=viewport.bottom+1; })()", f"Gear & Pack Continue is clipped at the end of preparation at {width}x{height}")
        devtools.click('[data-action="preparation-continue"]')
        check("Boolean(game.preparationStep === 'company' && document.querySelector('.party-slot-list') && document.querySelector('.supplies-section') && !document.querySelector('.inventory-card'))", "Preparation did not advance to Company & Supplies")
        check("(() => { const empty=[...document.querySelectorAll('[data-action=\"select-companion\"][data-companion-id=\"\"]')]; return empty.length===2 && empty.every(option=>option.querySelector('strong')?.textContent==='None' && option.querySelector('span')?.textContent==='Leave this companion slot empty.' && !option.textContent.includes('Travel Alone')); })()", "Empty companion slots use wording that incorrectly implies solo travel")
        devtools.click('[data-action="preparation-continue"]')
        check("Boolean(game.preparationStep === 'review' && document.querySelector('.preparation-review') && document.querySelector('.review-route-card') && document.querySelector('[data-action=\"start-expedition\"]'))", "Preparation did not advance to Review & Depart")
        devtools.click('[data-action="preparation-back"]')
        check("Boolean(game.preparationStep === 'company' && document.querySelector('.supplies-section') && document.querySelector('.preparation-screen').scrollTop === 0)", "Preparation Back did not return to Company & Supplies at the top")
        devtools.click('[data-action="show-location"]')
        check("game.screen === 'location' && game.activeDestinationId === null", "Top Village navigation did not return to the village")

        devtools.click('[data-destination-id="inn"]')
        check("game.screen === 'destination' && game.activeDestinationId === 'inn'", "Inn did not open")
        check("Boolean(document.querySelector('.destination-visual') && document.querySelector('.destination-panel'))", "Building split view missing")
        check("(() => { const description=DESTINATION_DEFINITIONS.inn.description; const first=document.querySelector('.interaction-scroll > :first-child'); return !document.querySelector('.destination-visual')?.textContent.includes(description) && !document.querySelector('.interaction-scroll')?.textContent.includes(description) && document.querySelector('.npc-card')?.textContent.includes('Innkeeper') && document.querySelector('#destination-title')?.textContent==='The Inn' && getComputedStyle(first).marginTop==='0px'; })()", "Inn repeated its atmospheric description in the visual or interaction panel")
        check("(() => { const visual=document.querySelector('.destination-visual'); const style=getComputedStyle(visual); return style.aspectRatio.replaceAll(' ', '')==='2/1' && Math.abs(visual.clientWidth/visual.clientHeight-2)<0.02; })()", "Inn destination visual is not an explicit 2:1 frame")
        check("Boolean(document.querySelector('.interaction-header') && document.querySelector('.interaction-scroll'))", "Sticky interaction structure missing")
        check("document.querySelector('.interaction-header').getBoundingClientRect().bottom <= document.querySelector('.interaction-scroll').getBoundingClientRect().top + 1", "Back navigation is inside scrolling content")
        check("document.querySelectorAll('.inn-health-row').length === 2 && document.body.textContent.includes('Full Health') && !document.querySelector('[data-action=\"rest-at-inn\"]')", "Fully rested Inn state is still visually redundant")
        devtools.evaluate("game.player.arthurHealth=22; game.player.companionStates.sir_kay.health=34; game.player.currentGold=100; renderDestination()")
        check("document.body.textContent.includes('22 / 40') && document.body.textContent.includes('32 / 40') && document.body.textContent.includes('Rest · ' + HEALING_TUNING.innRestGoldCost + 'g')", "Injured Inn state does not show current, restored, and cost values")
        check("document.querySelectorAll('.inn-health-row').length === 2 && Boolean(document.querySelector('[data-action=\"rest-at-inn\"]'))", "Injured Inn state lost active-party rest controls")
        devtools.evaluate("game.player.arthurHealth=40; game.player.companionStates.sir_kay.health=50; renderDestination()")
        devtools.click('[data-action="hear-rumor"]')
        check("Boolean(game.dialogueSession && document.querySelector('.dialogue-overlay') && document.querySelector('#dialogue-text')?.textContent.length > 20 && !document.querySelector('.interaction-message'))", "Innkeeper rumor did not use the RPG dialogue overlay")
        devtools.click('[data-action="dialogue-continue"]')
        devtools.click('[data-action="npc-talk"][data-npc-id="village_innkeeper"]')
        check("Boolean(game.dialogueSession && document.querySelector('.dialogue-overlay') && document.querySelector('#dialogue-speaker')?.textContent.includes('Innkeeper') && !document.querySelector('.interaction-message'))", "Innkeeper Talk did not use the RPG dialogue overlay")
        devtools.click('[data-action="dialogue-continue"]')
        devtools.click('[data-action="show-location"]')

        devtools.evaluate("game.player.currentGold = 100; game.player.ownedItems.old_coin = 2; game.player.ownedItems.antler_fragment = 1; savePlayer()")
        devtools.click('[data-destination-id="merchant"]')
        devtools.click('[data-action="npc-talk"][data-npc-id="village_merchant"]')
        check("Boolean(game.dialogueSession && document.querySelector('.dialogue-overlay') && !document.querySelector('.interaction-message'))", "Merchant Talk did not use the RPG dialogue overlay")
        devtools.click('[data-action="dialogue-continue"]')
        devtools.evaluate("showNpcDialogue('village_merchant','rumors')")
        check("Boolean(game.dialogueSession && document.querySelector('.dialogue-overlay') && document.querySelector('#dialogue-text')?.textContent.includes('nothing new') && !document.querySelector('.interaction-message'))", "NPC without rumors did not fail gracefully through the dialogue UI")
        devtools.click('[data-action="dialogue-continue"]')
        check("(() => { const visual=document.querySelector('.destination-visual'); const style=getComputedStyle(visual); return style.aspectRatio.replaceAll(' ', '')==='2/1' && Math.abs(visual.clientWidth/visual.clientHeight-2)<0.02; })()", "Merchant destination visual is not an explicit 2:1 frame")
        check("(() => { const description=DESTINATION_DEFINITIONS.merchant.description; const first=document.querySelector('.interaction-scroll > :first-child'); return !document.querySelector('.destination-visual')?.textContent.includes(description) && !document.querySelector('.interaction-scroll')?.textContent.includes(description) && document.querySelector('.shopkeeper-row')?.textContent.includes('Village Merchant') && document.querySelector('#destination-title')?.textContent==='Merchant' && getComputedStyle(first).marginTop==='0px'; })()", "Merchant repeated its atmospheric description in the visual or interaction panel")
        check("document.querySelector('.destination-panel').clientHeight > document.querySelector('.visual-frame').clientHeight", "Merchant interaction area is not the majority")
        check("typeof showToast === 'function' && document.querySelector('#toast-region')?.getAttribute('aria-live') === 'polite'", "Toast notification API or live region is missing")
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
        check("[...document.querySelectorAll('.toast-success')].some(toast=>toast.textContent.includes('Purchased Dried Herbs'))", "Buying an item did not show a success toast")
        check("document.querySelector('.interaction-scroll').scrollHeight > document.querySelector('.interaction-scroll').clientHeight", "Long Merchant content does not scroll inside lower area")
        header_top = devtools.evaluate("document.querySelector('.interaction-header').getBoundingClientRect().top")
        devtools.evaluate("document.querySelector('.interaction-scroll').scrollTop = document.querySelector('.interaction-scroll').scrollHeight")
        check(f"Math.abs(document.querySelector('.interaction-header').getBoundingClientRect().top - {header_top}) < 1", "Merchant back header moved with scrolling content")
        merchant_buy_scroll = devtools.evaluate("document.querySelector('.interaction-scroll').scrollTop")
        herbs_before_scroll_purchase = devtools.evaluate("game.player.ownedItems.dried_herbs || 0")
        devtools.click('[data-action="buy-item"][data-item-id="dried_herbs"]')
        check(f"game.player.ownedItems.dried_herbs === {herbs_before_scroll_purchase + 1} && Math.abs(document.querySelector('.interaction-scroll').scrollTop - {merchant_buy_scroll}) < 1", "Buying an item reset the shop scroll position")

        merchant_tab_scroll = devtools.evaluate("document.querySelector('.interaction-scroll').scrollTop")
        devtools.click('[data-action="shop-tab"][data-tab="sell"]')
        check(f"Math.abs(document.querySelector('.interaction-scroll').scrollTop - Math.min({merchant_tab_scroll}, document.querySelector('.interaction-scroll').scrollHeight-document.querySelector('.interaction-scroll').clientHeight)) < 1", "Changing shop tabs reset the interaction scroll position")
        check("document.querySelector('[data-action=\"sell-item\"][data-item-id=\"silver_stag_medallion\"]')?.disabled", "Protected relic can be sold")
        check("document.querySelector('[data-action=\"sell-item\"][data-item-id=\"rope\"]')?.disabled", "Packed item can be sold")
        check("[...document.querySelectorAll('.shop-item-row')].some(row => row.textContent.includes('Antler Fragment') && row.textContent.includes('does not buy'))", "Vendor specialization not explained")
        old_gold = devtools.evaluate("game.player.currentGold")
        devtools.evaluate("document.querySelector('.interaction-scroll').scrollTop = document.querySelector('.interaction-scroll').scrollHeight")
        merchant_sell_scroll = devtools.evaluate("document.querySelector('.interaction-scroll').scrollTop")
        devtools.click('[data-action="sell-item"][data-item-id="old_coin"]')
        check(f"game.player.currentGold === {old_gold + 5}", "Selling coins did not add gold")
        check("game.player.ownedItems.old_coin === 1", "Selling did not remove one coin")
        check("[...document.querySelectorAll('.toast-success')].some(toast=>toast.textContent.includes('Sold Old Silver Coins') && toast.textContent.includes('+5 gold'))", "Selling an item did not show a reward toast")
        check(f"Math.abs(document.querySelector('.interaction-scroll').scrollTop - {merchant_sell_scroll}) < 1", "Selling an item reset the shop scroll position")

        devtools.click('[data-action="show-location"]')
        devtools.click('[data-destination-id="blacksmith"]')
        check("(() => { const visual=document.querySelector('.destination-visual'); const style=getComputedStyle(visual); return style.aspectRatio.replaceAll(' ', '')==='2/1' && Math.abs(visual.clientWidth/visual.clientHeight-2)<0.02; })()", "Blacksmith destination visual is not an explicit 2:1 frame")
        check("(() => { const description=DESTINATION_DEFINITIONS.blacksmith.description; return !document.querySelector('.destination-visual')?.textContent.includes(description) && !document.querySelector('.interaction-scroll')?.textContent.includes(description) && document.querySelector('.shopkeeper-row')?.textContent.includes('Blacksmith') && document.querySelector('#destination-title')?.textContent==='Blacksmith'; })()", "Blacksmith repeated its atmospheric description in the visual or interaction panel")
        devtools.click('[data-action="npc-talk"][data-npc-id="village_blacksmith"]')
        check("Boolean(game.dialogueSession && document.querySelector('.dialogue-overlay') && !document.querySelector('.interaction-message'))", "Blacksmith Talk did not use the RPG dialogue overlay")
        check("(() => { const button=document.querySelector('.dialogue-continue'); const copy=document.querySelector('.dialogue-copy'); if (!button || !copy) return false; const style=getComputedStyle(button); const buttonBox=button.getBoundingClientRect(); const copyBox=copy.getBoundingClientRect(); return buttonBox.height>=36 && buttonBox.height<=41 && buttonBox.width<copyBox.width && buttonBox.right<=copyBox.right+1 && style.backgroundColor==='rgb(103, 41, 35)' && style.boxShadow==='none'; })()", "Blacksmith short-dialogue Continue action is still stretched or visually dominant")
        devtools.click('[data-action="dialogue-continue"]')
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

        repair_before = devtools.evaluate("game.player.ownedItems.repair_kit || 0")
        repair_gold = devtools.evaluate("game.player.currentGold")
        devtools.click('[data-action="shop-tab"][data-tab="craft"]')
        check("document.body.textContent.includes('Repair Kit') && document.body.textContent.includes('Iron 2/2') && document.querySelectorAll('.crafting-requirement').length===4 && [...document.querySelectorAll('.crafting-requirement')].every(entry=>entry.getBoundingClientRect().height>0)", "Blacksmith crafting requirements are missing their contained ingredient or gold chips")
        devtools.click('[data-action="craft-item"][data-recipe-id="repair_kit"]')
        check("game.craftingAction?.recipeId==='repair_kit' && Boolean(document.querySelector('.crafting-progress'))", "Blacksmith crafting did not show a visible progress action")
        time.sleep(2.5)
        check(f"game.player.ownedItems.repair_kit === {repair_before + 1} && game.player.currentGold === {repair_gold - 2}", "Generic Blacksmith crafting did not create its item or charge gold")
        check("!game.player.materials.iron && !game.player.materials.wood && !game.player.materials.leather", "Blacksmith crafting did not consume materials")

        devtools.click('[data-action="show-location"]')
        devtools.click('[data-destination-id="apothecary"]')
        check("game.activeDestinationId === 'apothecary' && SHOP_DEFINITIONS.village_apothecary_shop.itemsForSale.antidote.price === 9", "Apothecary location or finished-goods shop is invalid")
        check("(() => { const visual=document.querySelector('.destination-visual'); const style=getComputedStyle(visual); return style.aspectRatio.replaceAll(' ', '')==='2/1' && Math.abs(visual.clientWidth/visual.clientHeight-2)<0.02; })()", "Apothecary destination visual is not an explicit 2:1 frame")
        check("(() => { const description=DESTINATION_DEFINITIONS.apothecary.description; return !document.querySelector('.destination-visual')?.textContent.includes(description) && !document.querySelector('.interaction-scroll')?.textContent.includes(description) && document.querySelector('.shopkeeper-row')?.textContent.includes('Apothecary') && document.querySelector('#destination-title')?.textContent==='Apothecary'; })()", "Apothecary repeated its atmospheric description in the visual or interaction panel")
        devtools.click('[data-action="npc-talk"][data-npc-id="village_apothecary"]')
        check("Boolean(game.dialogueSession && document.querySelector('.dialogue-overlay') && !document.querySelector('.interaction-message'))", "Apothecary Talk did not use the RPG dialogue overlay")
        devtools.click('[data-action="dialogue-continue"]')
        bandages_before_craft = devtools.evaluate("game.player.ownedItems.bandages || 0")
        devtools.click('[data-action="shop-tab"][data-tab="craft"]')
        check("document.body.textContent.includes('Bandages') && !document.body.textContent.includes('Healing Poultice')", "Crafting UI did not hide unknown Apothecary recipes")
        devtools.click('[data-action="craft-item"][data-recipe-id="bandages"]')
        time.sleep(2.0)
        check(f"game.player.ownedItems.bandages === {bandages_before_craft + 1} && game.player.materials.cloth === 1", "Generic Apothecary crafting did not create Bandages or consume Cloth")
        check("[...document.querySelectorAll('.toast-success')].some(toast=>toast.textContent.includes('Crafted Bandages')) && !document.querySelector('.interaction-message')", "Crafting confirmation remained inline instead of using a toast")
        devtools.evaluate("game.player.materials.cloth=0; renderDestination()")
        devtools.click('[data-action="craft-item"][data-recipe-id="bandages"]')
        check("[...document.querySelectorAll('.toast-warning')].some(toast=>toast.textContent.includes('Not Enough Materials'))", "Blocked crafting did not show a warning toast")
        check("!Object.keys(game.player.ownedItems).some(id=>MATERIAL_DEFINITIONS[id])", "Materials polluted normal item inventory")

        devtools.evaluate("ToastNotifications.dismissAll(); const before=document.querySelector('.interaction-scroll').getBoundingClientRect(); ['First','Second','Third','Fourth'].forEach(title=>showToast({title,message:'Rapid feedback',type:'success'})); const after=document.querySelector('.interaction-scroll').getBoundingClientRect(); window.toastLayoutStable=Math.abs(before.top-after.top)<0.01&&Math.abs(before.height-after.height)<0.01")
        check("document.querySelectorAll('.toast').length === 3 && !document.querySelector('.toast')?.textContent.includes('First') && window.toastLayoutStable", "Rapid toasts did not cap, stack, or preserve page layout")
        check("(() => { const toasts=[...document.querySelectorAll('.toast')]; const header=document.querySelector('.game-header').getBoundingClientRect(); return toasts.length===3 && toasts[0].getBoundingClientRect().top>=header.bottom+8 && toasts.every((toast,index)=>index===0||toast.getBoundingClientRect().top>=toasts[index-1].getBoundingClientRect().bottom); })()", "Rapid toasts did not stack downward from the upper anchor")
        check("(() => { const toast=document.querySelector('.toast'); const viewport=document.querySelector('.game-viewport').getBoundingClientRect(); return toast && toast.getBoundingClientRect().left >= viewport.left && toast.getBoundingClientRect().right <= viewport.right && getComputedStyle(document.querySelector('#toast-region')).pointerEvents === 'none'; })()", "Toast stack is not contained in the portrait viewport")
        devtools.evaluate("ToastNotifications.dismissAll(); showToast({title:'Short Toast',duration:800})")
        time.sleep(1.1)
        check("!document.querySelector('.toast')", "Expired toasts were not removed cleanly")

        devtools.click('[data-action="show-location"]')
        check("game.screen === 'location' && !DESTINATION_DEFINITIONS.forest_gate && !LOCATION_DEFINITIONS.broceliande_village.destinations.includes('forest_gate')", "Forest Gate navigation was not removed from the village")
        devtools.click('[data-action="prepare-expedition"]')
        check("game.screen === 'preparation' && game.preparationStep === 'route'", "Village preparation CTA did not open the Route step")
        check("game.preparationSupplies <= game.player.provisions", "Preparation selected more provisions than owned")
        check("document.querySelectorAll('.expedition-option').length === 4 && [...document.querySelectorAll('.expedition-option')].every(option => option.querySelector('.danger-rating'))", "Preparation does not display all four expedition routes")
        check("[...document.querySelectorAll('.expedition-option')].map(option => option.querySelectorAll('.danger-rating svg').length).join(',') === '1,2,2,3' && document.querySelector('[data-expedition-id=\"search_for_merlin\"]')?.disabled", "Expedition danger ratings or campaign lock presentation is invalid")
        check("['old_forest_road','fountain_of_barenton','val_sans_retour'].every(id => !document.querySelector(`[data-expedition-id=\"${id}\"]`)?.disabled)", "A normal Brocéliande expedition was incorrectly locked")
        loadout_before_routes = devtools.evaluate("JSON.stringify({equipment:game.player.equippedItems,packed:game.player.packedItems})")
        devtools.click('[data-action="select-expedition"][data-expedition-id="fountain_of_barenton"]')
        check("game.player.selectedExpeditionId === 'fountain_of_barenton' && document.querySelector('[data-expedition-id=\"fountain_of_barenton\"]')?.classList.contains('is-selected')", "Fountain route could not be selected")
        devtools.click('[data-action="select-expedition"][data-expedition-id="val_sans_retour"]')
        check("game.player.selectedExpeditionId === 'val_sans_retour' && JSON.stringify({equipment:game.player.equippedItems,packed:game.player.packedItems}) === " + json.dumps(loadout_before_routes), "Route selection erased the prepared loadout")
        devtools.evaluate("game.player.ownedItems.water_of_barenton=1; renderPreparation()")
        check("document.querySelector('[data-expedition-id=\"search_for_merlin\"]')?.disabled", "Water alone incorrectly unlocked Search for Merlin")
        devtools.evaluate("delete game.player.ownedItems.water_of_barenton; game.player.ownedItems.morgans_token=1; renderPreparation()")
        check("document.querySelector('[data-expedition-id=\"search_for_merlin\"]')?.disabled", "Morgan's Token alone incorrectly unlocked Search for Merlin")
        devtools.evaluate("game.player.ownedItems.water_of_barenton=1; renderPreparation()")
        devtools.evaluate("game.player.ownedItems.morgans_token=1; renderPreparation()")
        check("!document.querySelector('[data-expedition-id=\"search_for_merlin\"]')?.disabled", "Both campaign prerequisites did not unlock Search for Merlin")
        devtools.click('[data-action="select-expedition"][data-expedition-id="search_for_merlin"]')
        check("game.player.selectedExpeditionId === 'search_for_merlin'", "Unlocked Search for Merlin could not be selected")
        devtools.evaluate("delete game.player.ownedItems.water_of_barenton; delete game.player.ownedItems.morgans_token; game.player.selectedExpeditionId='old_forest_road'; savePlayer(); renderPreparation()")
        devtools.click('[data-action="preparation-continue"]')
        check("Boolean(game.preparationStep === 'gear' && document.querySelector('.equipment-slots') && document.querySelector('.pack-list') && !document.querySelector('.expedition-option'))", "Route selection did not preserve state while advancing to Gear & Pack")
        devtools.click('[data-action="preparation-continue"]')
        check("game.preparationStep === 'company' && document.body.textContent.includes('Owned:') && document.body.textContent.includes('To carry:') && document.body.textContent.includes('Consumption:')", "Preparation does not show party provision details on Company & Supplies")
        check("ITEM_DEFINITIONS.flask.unique && ITEM_DEFINITIONS.flask.campaignItem && EconomyRules.itemSaleBlockReason(game.player, SHOP_DEFINITIONS.village_general_goods, ITEM_DEFINITIONS.flask)", "Campaign Flask is not protected from ordinary sale")
        check("(() => { const player=SaveSystem.createDefaultPlayerState(); const expedition=ExpeditionRules.createExpedition(player,{expeditionId:'old_forest_road',companions:[],provisions:5,random:()=>0}); EncounterOutcomes.resolve({type:'gainUniqueUnsecuredItem',itemId:'flask'},{player,expedition}); EncounterOutcomes.resolve({type:'gainUniqueUnsecuredItem',itemId:'flask'},{player,expedition}); return expedition.unsecuredLoot.filter(entry=>entry.itemId==='flask').length===1; })()", "Unique campaign discovery effects awarded a duplicate Flask")
        check("(() => { const player=SaveSystem.createDefaultPlayerState(); const expedition=ExpeditionRules.createExpedition(player,{expeditionId:'fountain_of_barenton',companions:[],provisions:5,random:()=>0}); EncounterManager.force(expedition,'fountain_barenton'); EncounterManager.resolveChoice(expedition,player,'study_fountain'); return expedition.activeEncounter.phase==='result' && expedition.activeEncounter.resultText.includes('no suitable vessel') && !player.ownedItems.water_of_barenton; })()", "Fountain without the Flask awarded water or omitted its vessel warning")
        check("(() => { const player=SaveSystem.createDefaultPlayerState(); player.ownedItems.flask=1; const expedition=ExpeditionRules.createExpedition(player,{expeditionId:'fountain_of_barenton',companions:[],provisions:5,random:()=>0}); EncounterManager.force(expedition,'fountain_barenton'); EncounterManager.resolveChoice(expedition,player,'fill_flask'); ExpeditionRules.settle(player,expedition,true); const repeat=ExpeditionRules.createExpedition(player,{expeditionId:'fountain_of_barenton',companions:[],provisions:5,random:()=>0}); EncounterManager.force(repeat,'fountain_barenton'); const repeatChoice=EncounterRequirements.choiceAvailability(ENCOUNTER_DEFINITIONS.fountain_barenton.stages.start.choices.find(choice=>choice.id==='fill_flask'),{player,expedition:repeat}); return player.ownedItems.water_of_barenton===1 && !repeatChoice.available; })()", "Fountain Flask collection did not persist uniquely")
        check("(() => { const player=SaveSystem.createDefaultPlayerState(); const expedition=ExpeditionRules.createExpedition(player,{expeditionId:'val_sans_retour',companions:[],provisions:5,random:()=>0}); EncounterManager.force(expedition,'summoned_guardian'); const started=EncounterManager.resolveChoice(expedition,player,'fight_guardian',{startCombat:()=>true}); const completed=EncounterManager.completeCombat(expedition,player,'victory'); ExpeditionRules.settle(player,expedition,true); return started.combatStarted && completed.awaitingContinue && player.ownedItems.morgans_token===1; })()", "Val sans Retour guardian victory did not secure Morgan's Token")
        check("PLAYER_CHARACTER_DEFINITION.provisionCapacity === 20 && PLAYER_CHARACTER_DEFINITION.provisionConsumptionMultiplier === 1", "Arthur's provision data is invalid")
        check("COMPANION_DEFINITIONS.sir_kay.combat.maxHp === 50 && COMPANION_DEFINITIONS.sir_kay.provisionCapacityBonus === 10 && COMPANION_DEFINITIONS.sir_kay.provisionConsumptionBonus === 0.3", "Kay's health or provision data is invalid")
        check("EXPEDITION_TUNING.baseProvisionsPerDistance === 0.068 && !('maximumStartingProvisions' in EXPEDITION_TUNING)", "Provision tuning still uses the old cap or rate")
        check("partyProvisionCapacity('sir_kay') === 30 && partyProvisionConsumptionMultiplier('sir_kay') === 1.3 && partyProvisionCapacity(null) === 20 && partyProvisionConsumptionMultiplier(null) === 1", "Party provision calculations are invalid")
        check("(() => { const player=SaveSystem.createDefaultPlayerState(); player.unlockedCompanions.push('llamrei'); player.selectedCompanions=['llamrei']; player.selectedCompanion='llamrei'; const solo=ExpeditionRules.createExpedition(player,{companions:['llamrei'],provisions:10}); player.selectedCompanions=['sir_kay','llamrei']; player.selectedCompanion='sir_kay'; const full=ExpeditionRules.createExpedition(player,{companions:['sir_kay','llamrei'],provisions:10}); return solo.provisionCapacity===30&&solo.provisionConsumptionMultiplier===1.1&&solo.travelSpeedMultiplier===1.25&&full.provisionCapacity===40&&full.provisionConsumptionMultiplier===1.4&&full.travelSpeedMultiplier===1.1&&CombatSystem.create(full,'summoned_guardian').allies.length===3; })()", "Two-companion provision, travel, or combat party rules are invalid")
        check("(() => { const player=SaveSystem.createDefaultPlayerState(); player.unlockedCompanions.push('llamrei'); const expedition=ExpeditionRules.createExpedition(player,{companions:['llamrei'],provisions:10}); const combat=CombatSystem.create(expedition,'wild_boar'); combat.status='awaitingAction'; combat.activeActorId='llamrei'; const actions=CombatSystem.availableActions(combat,expedition); return actions.includes('attack')&&actions.includes('abilities')&&!actions.includes('items')&&!actions.includes('defend')&&!actions.includes('flee'); })()", "Llamrei exposed inappropriate human-only combat actions")
        check("sanitizePlayerState({saveVersion:7,selectedCompanion:'sir_kay'},SaveSystem.createDefaultPlayerState()).selectedCompanions.join(',')==='sir_kay' && sanitizePlayerState({saveVersion:7,selectedCompanions:['llamrei','llamrei'],selectedCompanion:'llamrei',unlockedCompanions:['sir_kay','llamrei']},SaveSystem.createDefaultPlayerState()).selectedCompanions.join(',')==='llamrei'", "Single-companion migration or duplicate slot sanitization is invalid")
        check("sanitizePlayerState({...SaveSystem.createDefaultPlayerState(), selectedCompanion:null}, SaveSystem.createDefaultPlayerState()).selectedCompanion === null", "Solo party selection does not survive save sanitization")
        devtools.evaluate("game.preparationSupplies = 28; renderPreparation()")
        devtools.evaluate("document.querySelector('.preparation-screen').scrollTop = document.querySelector('.preparation-screen').scrollHeight")
        preparation_scroll = devtools.evaluate("document.querySelector('.preparation-screen').scrollTop")
        devtools.click('[data-action="select-companion"][data-companion-id=""]')
        check("game.player.selectedCompanion === null && game.preparationSupplies === 20 && document.body.textContent.includes('20 / 20') && document.body.textContent.includes('1.00×')", "Removing Kay did not clamp capacity or update consumption")
        check(f"Math.abs(document.querySelector('.preparation-screen').scrollTop - {preparation_scroll}) < 1", "Changing preparation controls reset its scroll position")
        devtools.click('[data-action="select-companion"][data-companion-id="sir_kay"]')
        check("game.player.selectedCompanion === 'sir_kay' && document.body.textContent.includes('/ 30') && document.body.textContent.includes('1.30×')", "Selecting Kay did not update party provision details")
        devtools.click('[data-action="show-location"]')
        check("game.screen === 'location' && game.activeDestinationId === null", "Preparation back navigation did not return to the village")
        devtools.click('[data-action="prepare-expedition"]')
        carried = devtools.evaluate("game.preparationSupplies")
        owned_before_start = devtools.evaluate("game.player.provisions")
        devtools.click('[data-action="preparation-continue"]')
        devtools.click('[data-action="preparation-continue"]')
        devtools.click('[data-action="preparation-continue"]')
        check("Boolean(game.preparationStep === 'review' && document.querySelector('.review-route-card') && document.body.textContent.includes('Arthur'))", "Review step did not retain the selected expedition and company")
        devtools.click('[data-action="start-expedition"]')
        check("game.screen === 'expedition' && game.expedition.status === 'active'", "Expedition did not begin")
        check(f"game.player.provisions === {owned_before_start - carried}", "Starting expedition did not commit owned provisions")
        check(f"game.expedition.committedProvisions === {carried} && game.expedition.provisions <= {carried} && game.expedition.provisions > {carried} - 0.2", "Expedition received free or incorrect provisions")
        check(f"game.expedition.provisionCapacity === 30 && game.expedition.provisionConsumptionMultiplier === 1.3 && game.expedition.carriedProvisions === {carried}", "Expedition did not snapshot party provision values")
        check("document.querySelector('.direction-banner')?.textContent.includes('Old Forest Road') && document.querySelector('.direction-banner')?.textContent.includes('Traveling Outbound') && !document.querySelector('#region-title') && !document.body.textContent.includes('Chapter III')", "Active expedition route banner still repeated the chapter title")
        check("Boolean(document.querySelector('.journey-log')) && !document.querySelector('.journey-log')?.open && document.querySelector('#journey-log-preview')?.textContent.includes('No meaningful events')", "Journey Log did not start as a compact closed section")
        devtools.evaluate("JourneyLog.add(game.expedition,\"A trail marker records the company's passage.\",{category:'discovery'}); renderExpedition()")
        check("document.querySelector('#journey-log-preview')?.textContent.includes('trail marker') && document.querySelector('.journey-log-content')?.textContent.includes('trail marker')", "Journey Log did not retain a meaningful event and its preview")
        devtools.click('.journey-log .run-details-summary')
        check("document.querySelector('.journey-log')?.open && getComputedStyle(document.querySelector('.journey-log-content')).overflowY === 'auto'", "Journey Log did not expand into a bounded history")
        devtools.click('.journey-log .run-details-summary')
        check("!craftingRow(RECIPE_DEFINITIONS.repair_kit,'blacksmith').includes('Creates Repair Kit') && craftingRow(RECIPE_DEFINITIONS.roasted_meat,'campfire').includes('Creates 3 Provisions')", "Crafting output labels did not distinguish items from cooking results")
        check("Boolean(document.querySelector('.journey-controls') && document.querySelector('.expedition-status') && document.querySelector('.expedition-details') && document.querySelector('.expedition-action-bar')) && !document.querySelector('.strategic-exit') && !document.querySelector('.destructive-exit') && !document.querySelector('.journey-state-banner') && !document.querySelector('.journey-heading h2') && !document.querySelector('.expedition-details')?.open && document.querySelector('.journey-summary')?.textContent.includes('pace') && !document.querySelector('.journey-summary')?.textContent.includes('food rate') && !document.querySelector('.setting-button') && document.querySelector('#return-button')?.textContent.trim()==='Return'", "Expedition HUD did not simplify active Journey controls, status, details, and sticky actions")
        check("getComputedStyle(document.querySelector('.expedition-action-bar')).position === 'sticky' && getComputedStyle(document.querySelector('.travel-panel')).scrollPaddingBottom !== '0px'", "Expedition action bar is not sticky within the travel scroller")
        check("(() => { const bar=document.querySelector('.expedition-action-bar'); const primary=bar.querySelector('.travel-action-primary').getBoundingClientRect(); const secondary=bar.querySelector('.travel-return-button').getBoundingClientRect(); return primary.height===secondary.height && primary.width/(primary.width+secondary.width)>0.62 && primary.width/(primary.width+secondary.width)<0.71; })()", "Expedition action proportions did not keep the primary action near two thirds")
        devtools.evaluate("window.__travelActionPanel=document.querySelector('.travel-panel'); window.__travelActionPanel.scrollTop=window.__travelActionPanel.scrollHeight")
        check("(() => { const viewport=document.querySelector('.expedition-screen').getBoundingClientRect(); const bar=document.querySelector('.expedition-action-bar').getBoundingClientRect(); return bar.bottom<=viewport.bottom+1 && bar.top>=viewport.top-1; })()", "Sticky expedition actions did not remain inside the game viewport while scrolling")
        devtools.evaluate("window.__travelActionPanel.scrollTop=0")
        devtools.click('.expedition-details .run-details-summary')
        check("document.querySelector('.expedition-details')?.open", "Expedition Details did not expand")
        check("document.querySelector('.expedition-details .run-details-content')?.textContent.includes('Company') && document.querySelector('.expedition-details .run-details-content')?.textContent.includes('Unsecured: None')", "Expanded Expedition Details did not retain its readable unsecured breakdown")
        check("Boolean(document.querySelector('.expedition-details .run-details-actions [data-action=\"abandon-expedition\"]'))", "Expanded Expedition Details did not contain the abandon action")
        devtools.click('.expedition-details .run-details-summary')
        devtools.click('[data-action="pause-travel"]')
        check("game.expedition.travelState === 'paused'", "Pause Travel did not enter the paused state")
        check("document.querySelector('.direction-banner')?.textContent === 'Old Forest Road · Paused'", "Paused expedition did not identify its route and state in the visual banner")
        check("document.querySelectorAll('.setting-row').length===2 && document.querySelectorAll('.setting-button').length===6 && document.querySelector('.journey-summary')?.classList.contains('is-editable-summary')", "Paused Journey did not restore editable pace and ration controls")
        check("!document.querySelector('.journey-state-banner')", "Paused Journey retained the removed explanatory state box")
        check("document.querySelector('.journey-state')?.textContent.includes('Paused')", "Paused Journey did not show its state badge")
        check("Boolean(document.querySelector('.paused-actions'))", "Paused Journey did not reveal contextual actions")
        check("Boolean(document.querySelector('.expedition-action-bar #resume-button') && document.querySelector('.expedition-action-bar #return-button'))", "Paused Journey sticky actions did not expose Resume and Return")
        devtools.click('[data-action="make-camp"]')
        check("!document.querySelector('.expedition-action-bar')", "Sticky travel actions incorrectly appeared on the camp screen")
        check("(() => { const screen=document.querySelector('.camp-screen').getBoundingClientRect(); const panel=document.querySelector('.camp-panel').getBoundingClientRect(); const footer=document.querySelector('.camp-actions'); const footerBox=footer.getBoundingClientRect(); return document.querySelectorAll('.camp-panel .compact-resources .resource-card').length===6 && getComputedStyle(document.querySelector('.camp-tabs')).position==='sticky' && footer.parentElement.classList.contains('camp-screen') && getComputedStyle(footer).position==='relative' && Math.abs(footerBox.bottom-screen.bottom)<1 && Math.abs(footerBox.top-panel.bottom)<1; })()", "Camp status grid or the external Leave Camp footer is not structurally anchored to the viewport")
        check("getComputedStyle(document.querySelector('.camp-actions')).backgroundColor === 'rgb(17, 26, 19)' && getComputedStyle(document.querySelector('.camp-actions')).borderTopStyle === 'solid'", "Camp Leave Camp shelf is not an opaque divided footer")
        devtools.evaluate("const panel=document.querySelector('.camp-panel'); window.__campScrollTarget=Math.max(0,panel.scrollHeight-panel.clientHeight); panel.scrollTop=window.__campScrollTarget")
        devtools.click('[data-action="camp-tab"][data-tab="cook"]')
        check("Boolean(document.querySelector('.camp-panel')) && Math.abs(document.querySelector('.camp-panel').scrollTop - window.__campScrollTarget) <= 1", "Camp tab rerender did not preserve the camp panel scroll position")
        check("(() => { const row=document.querySelector('.crafting-row'); const button=row?.querySelector('.small-button'); return Boolean(row&&button) && button.getBoundingClientRect().height>=40 && !row.textContent.includes('Creates Roasted Meat'); })()", "Camp crafting cards did not retain touch-sized actions or concise item output")
        devtools.click('[data-action="leave-camp"]')
        devtools.click('[data-action="resume-travel"]')
        check("(() => { const p=SaveSystem.createDefaultPlayerState(); p.selectedCompanions=[]; p.selectedCompanion=null; const e=ExpeditionRules.createExpedition(p,{companions:[],provisions:20,random:()=>0}); e.nextEncounterAt=9999; const normal=ExpeditionRules.provisionConsumptionMultiplier(e); ExpeditionRules.setPace(e,'cautious'); ExpeditionRules.setRation(e,'sparse'); const cautious=ExpeditionRules.provisionConsumptionMultiplier(e); ExpeditionRules.setPace(e,'hard_push'); ExpeditionRules.setRation(e,'generous'); const push=ExpeditionRules.provisionConsumptionMultiplier(e); const distance=e.distance; ExpeditionRules.pause(e); const stopped=ExpeditionRules.travel(e,p,10); return cautious<normal&&push>normal&&stopped.distanceTraveled===0&&e.distance===distance&&e.provisions===20; })()", "Pace, ration, and paused travel rules are not independent")
        check("(() => { const p=SaveSystem.createDefaultPlayerState(); p.selectedCompanions=[]; p.selectedCompanion=null; const e=ExpeditionRules.createExpedition(p,{companions:[],provisions:8,health:20,random:()=>0}); e.travelState='paused'; const rest=ExpeditionRules.briefRest(e); return rest.applied&&rest.cost===1&&e.provisions===7&&e.health>20&&e.distance===0; })()", "Brief Rest did not consume provisions and heal without advancing travel")
        check("(() => { const p=SaveSystem.createDefaultPlayerState(); p.selectedCompanions=[]; p.selectedCompanion=null; const e=ExpeditionRules.createExpedition(p,{companions:[],provisions:8,health:20,random:()=>0}); e.travelState='paused'; ExpeditionRules.enterCamp(e); const first=ExpeditionRules.restAtCamp(e,p); const firstCycle=e.campCycle; const firstEvent=e.campEventId; EncounterManager.resolveChoice(e,p,'watch_quietly'); EncounterManager.continueJourney(e); ExpeditionRules.leaveCamp(e); ExpeditionRules.enterCamp(e); return first.applied&&first.totalHealingAmount>0&&e.campEventRolled&&e.campCycle===firstCycle&&e.campEventId===firstEvent; })()", "Camp rest or one-event camp-cycle protection is invalid")
        check("(() => { const p=SaveSystem.createDefaultPlayerState(); p.selectedCompanions=[]; p.selectedCompanion=null; const e=ExpeditionRules.createExpedition(p,{companions:[],provisions:1,random:()=>0}); e.travelState='paused'; ExpeditionRules.enterCamp(e); e.carriedItems.raw_meat=1; const result=CraftingRules.craft(p,'roasted_meat','campfire',{expedition:e}); return result.applied&&result.provisions===3&&e.provisions===4&&!e.carriedItems.raw_meat&&e.consumedItems.raw_meat===1; })()", "Camp cooking did not consume an ingredient into expedition provisions")
        check("(() => { const p=SaveSystem.createDefaultPlayerState(); p.selectedCompanions=[]; p.selectedCompanion=null; const e=ExpeditionRules.createExpedition(p,{companions:[],provisions:8,random:()=>0.99}); e.travelState='camped'; EncounterManager.beginCamp(e,'wolves_near_fire'); const result=EncounterManager.resolveChoice(e,p,'approach_wolves',{startCombat:()=>true}); return result.combatStarted&&e.activeEncounter.eventKind==='camp'&&e.activeEncounter.phase==='combat'; })()", "Weighted camp event outcomes did not hand off to reusable combat")
        check("!document.querySelector('#provisions-card small') && !document.body.textContent.includes('Return needs')", "Provision warning state added an explanatory second line")
        check("EXPEDITION_TUNING.returnProvisionWarningMarginRatio === 0.2 && game.expedition.distance < 1 && ExpeditionRules.estimateReturnProvisionCost(game.expedition) >= 0 && ExpeditionRules.returnProvisionStatus(game.expedition).state === 'safe' && document.querySelector('#provisions-card')?.dataset.provisionState === 'safe'", "Ample provisions at expedition start did not remain safe")
        check("(() => { const expedition=game.expedition; const original={distance:expedition.distance,maxDistanceReached:expedition.maxDistanceReached,provisions:expedition.provisions}; expedition.distance=20; expedition.maxDistanceReached=20; const required=ExpeditionRules.estimateReturnProvisionCost(expedition); expedition.provisions=required*1.1; updateTravelHud(); const warning=ExpeditionRules.returnProvisionStatus(expedition); const warningVisible=warning.state==='warning'&&warning.current>=warning.required&&warning.current<warning.warningThreshold&&document.querySelector('#provisions-card')?.dataset.provisionState==='warning'&&!document.querySelector('#return-button')?.disabled; expedition.provisions=required*0.9; updateTravelHud(); const danger=ExpeditionRules.returnProvisionStatus(expedition); const dangerVisible=danger.state==='danger'&&danger.current<danger.required&&document.querySelector('#provisions-card')?.dataset.provisionState==='danger'&&!document.querySelector('#return-button')?.disabled; expedition.distance=5; expedition.maxDistanceReached=20; expedition.provisions=ExpeditionRules.estimateReturnProvisionCost(expedition)*1.1; updateTravelHud(); const recoveredWarning=document.querySelector('#provisions-card')?.dataset.provisionState==='warning'; expedition.provisions=ExpeditionRules.estimateReturnProvisionCost(expedition)*1.5; updateTravelHud(); const recoveredSafe=document.querySelector('#provisions-card')?.dataset.provisionState==='safe'; Object.assign(expedition,original); updateTravelHud(); return warningVisible&&dangerVisible&&recoveredWarning&&recoveredSafe; })()", "Provision warning and danger states track return margin without blocking travel")
        check("(() => { const player=SaveSystem.createDefaultPlayerState(); const solo=ExpeditionRules.createExpedition(player,{companion:null,provisions:20}); const kay=ExpeditionRules.createExpedition(player,{companion:'sir_kay',provisions:20}); solo.distance=kay.distance=20; return solo.provisionConsumptionMultiplier===1&&kay.provisionConsumptionMultiplier===1.3&&ExpeditionRules.estimateReturnProvisionCost(kay)>ExpeditionRules.estimateReturnProvisionCost(solo); })()", "Party consumption modifiers did not affect the return estimate")
        devtools.evaluate("game.expedition.distance=20; game.expedition.maxDistanceReached=20; game.expedition.provisions=ExpeditionRules.estimateReturnProvisionCost(game.expedition)*1.1; updateTravelHud()")
        devtools.call("Emulation.setEmulatedMedia", {"features": [{"name": "prefers-reduced-motion", "value": "reduce"}]})
        check("document.querySelector('#provisions-card')?.dataset.provisionState === 'warning' && !document.querySelector('#provisions-card small') && !document.body.textContent.includes('Return needs') && getComputedStyle(document.querySelector('#provisions-card')).animationName === 'none' && getComputedStyle(document.querySelector('#provisions-card')).borderTopColor !== getComputedStyle(document.querySelector('.resource-card:not(#provisions-card)')).borderTopColor", "Reduced motion removed the warning pulse without removing its visual state or adding warning text")
        devtools.evaluate("game.expedition.provisions=ExpeditionRules.estimateReturnProvisionCost(game.expedition)*0.9; updateTravelHud()")
        check("document.querySelector('#provisions-card')?.dataset.provisionState === 'danger' && !document.querySelector('#provisions-card small') && !document.body.textContent.includes('Return needs') && getComputedStyle(document.querySelector('#provisions-card')).animationName === 'none' && getComputedStyle(document.querySelector('#provisions-card')).borderTopColor !== getComputedStyle(document.querySelector('.resource-card:not(#provisions-card)')).borderTopColor", "Reduced motion removed the danger pulse without removing its visual state or adding danger text")
        devtools.call("Emulation.setEmulatedMedia", {"features": [{"name": "prefers-reduced-motion", "value": "no-preference"}]})
        devtools.evaluate("game.expedition.distance=0; game.expedition.maxDistanceReached=0; game.expedition.provisions=game.expedition.carriedProvisions; updateTravelHud()")
        for width, height in ((320, 480), (360, 640), (390, 844), (430, 932)):
            devtools.call("Emulation.setDeviceMetricsOverride", {
                "width": width,
                "height": height,
                "deviceScaleFactor": 1,
                "mobile": True,
            })
            time.sleep(0.04)
            check("(() => { const grid=document.querySelector('.resource-grid').getBoundingClientRect(); const card=document.querySelector('#provisions-card').getBoundingClientRect(); const value=document.querySelector('#provisions-value').getBoundingClientRect(); return card.left>=grid.left-1&&card.right<=grid.right+1&&card.bottom<=grid.bottom+1&&value.right<=card.right+1; })()", f"Provisions stat is clipped or misaligned at {width}x{height}")
        check("document.querySelectorAll('.compact-resources .resource-card').length===6 && [...document.querySelectorAll('.compact-resources .resource-card')].every(card=>getComputedStyle(card).gridColumn==='auto') && document.querySelector('#loot-count')?.textContent.trim()==='0' && !document.querySelector('.unsecured-card') && !document.querySelector('.unsecured-breakdown')", "Expedition Status did not use six consistent cells with a compact zero Unsecured Loot value")
        check("(() => { const make=(items,materials,gold)=>({unsecuredLoot:items,unsecuredMaterials:materials,goldCarried:gold}); const mixed=make([{itemId:'old_coin',quantity:2}],{wood:1},8); return unsecuredLootDisplayValue(make([],{},0))==='0' && unsecuredLootDisplayValue(make([{itemId:'old_coin',quantity:1}],{wood:2},0))==='3' && unsecuredLootDisplayValue(make([],{},12))==='12g' && unsecuredLootDisplayValue(mixed)==='3 + 8g' && unsecuredLootSummary(mixed).includes('2 items') && unsecuredLootSummary(mixed).includes('1 material') && unsecuredLootSummary(mixed).includes('8 gold'); })()", "Unsecured Loot compact values did not total physical quantities and gold correctly")
        check("Object.keys(CATEGORY_ICON_MARKUP).length >= 14 && document.querySelectorAll('.category-icon').length >= 6 && !document.querySelector('.reward-icon')?.textContent.includes('ITEM')", "Reusable category icons are incomplete or still use placeholder labels")
        check("itemIconKind('unknown-category') === 'curiosity' && categoryIcon('unknown-category').includes('viewBox')", "Unknown item categories do not fall back safely")
        devtools.evaluate("game.expedition.selectedCompanion=null; game.expedition.activeEncounter=null; game.expedition.nextEncounterAt=999999; renderExpedition()")
        check("!document.querySelector('.travelers .companion') && document.querySelector('.expedition-details')?.textContent.includes('Arthur')", "Solo expedition presentation is invalid")
        check("document.querySelectorAll('.run-detail-collection').length === 4 && document.querySelector('.run-detail-collection')?.parentElement?.textContent.includes('Material Bag') && [...document.querySelectorAll('.run-item-chip')].every(chip => getComputedStyle(chip).whiteSpace !== 'nowrap')", "Expedition loadout/carried/material-bag/discovery collections do not use wrapping chips")
        devtools.evaluate("game.expedition.selectedCompanion='sir_kay'; renderExpedition()")
        check("Math.abs(document.querySelector('.visual-frame').clientWidth / document.querySelector('.visual-frame').clientHeight - 16/9) < 0.02", "Travel visual is not 16:9")
        travel_provisions = devtools.evaluate("game.expedition.provisions")
        travel_distance = devtools.evaluate("game.expedition.distance")
        devtools.evaluate("updateExpedition(0.5)")
        check(f"game.expedition.provisions < {travel_provisions} && game.expedition.distance > {travel_distance}", "Travel did not consume carried provisions")
        check("Math.abs(EXPEDITION_TUNING.baseProvisionsPerDistance * game.expedition.provisionConsumptionMultiplier - 0.0884) < 0.000001", "Kay's effective provision rate is invalid")
        check("(() => { const sample={committedProvisionsRemaining:30,foundProvisions:0,provisions:30}; adjustExpeditionProvisions(sample,5); return sample.provisions === 35 && sample.foundProvisions === 5; })()", "Found provisions were incorrectly capped at departure capacity")
        check("(() => { const original=game.expedition; const sample={...original,activeEncounter:null,status:'active',distance:10,maxDistanceReached:10,provisions:10,committedProvisionsRemaining:10,foundProvisions:0,encounterTravelDistance:0,nextEncounterAt:999}; game.expedition={...sample,direction:'outbound'}; updateExpedition(1); const outboundSpent=10-game.expedition.provisions; game.expedition={...sample,direction:'returning'}; updateExpedition(0.25); const returnSpent=10-game.expedition.provisions; game.expedition=original; return Math.abs(outboundSpent-returnSpent)<0.000001 && Math.abs(outboundSpent-(2.25*0.0884))<0.000001; })()", "Equal outbound and return distances consume different provisions")
        check("(() => { const before=game.expedition.provisions; game.player.selectedCompanion=null; updateExpedition(1); const spent=before-game.expedition.provisions; return Math.abs(spent/(EXPEDITION_TUNING.outboundTravelSpeed)-0.0884) < 0.000001 && game.expedition.provisionConsumptionMultiplier === 1.3; })()", "Active expedition consumption was not distance-based or changed after its snapshot")
        devtools.evaluate("game.player.selectedCompanion='sir_kay'")
        devtools.evaluate("game.expedition.distance = Math.max(game.expedition.distance, 2); game.expedition.maxDistanceReached = Math.max(game.expedition.maxDistanceReached, game.expedition.distance); beginReturn()")
        return_distance = devtools.evaluate("game.expedition.distance")
        check("game.expedition.direction==='returning' && document.querySelector('.direction-banner')?.textContent === 'Old Forest Road · Returning ←' && document.querySelector('#journey-log-preview')?.textContent.includes('turned back')", "Return travel did not update the route banner or Journey Log")
        devtools.evaluate("updateExpedition(0.01)")
        check(f"game.expedition.direction === 'returning' && game.expedition.distance < {return_distance}", "Existing return travel no longer reduces distance")
        devtools.evaluate("game.expedition.direction='outbound'; game.expedition.nextEncounterAt=999999")

        equipped_before = devtools.evaluate("JSON.stringify(game.player.equippedItems)")
        packed_before = devtools.evaluate("JSON.stringify(game.player.packedItems)")
        check("EncounterManager.force(game.expedition, 'fallen_tree')", "Existing encounter could not be triggered")
        devtools.evaluate("renderExpedition()")
        check("game.expedition.activeEncounter?.encounterId === 'fallen_tree' && document.querySelector('.travel-scene')?.classList.contains('is-paused') && !document.querySelector('.expedition-action-bar')", "Encounter flow no longer pauses travel cleanly or incorrectly showed travel actions")
        check("Math.abs(document.querySelector('.visual-frame').clientWidth / document.querySelector('.visual-frame').clientHeight - 16/9) < 0.02", "Encounter visual is not 16:9")
        new_encounters = "['glint_in_mud','discarded_bundle','beneath_the_roots','lost_purse','broken_bridge','hermits_fire','wolves_in_brush','ruined_wayside_shrine','sunken_road']"
        check(f"{new_encounters}.every(id => Boolean(ENCOUNTER_DEFINITIONS[id]))", "New Broceliande encounter definitions are incomplete")
        check("['ancient_spring','too_perfect_grove'].every(id => ENCOUNTER_DEFINITIONS[id]?.tags.includes('resting_place'))", "Unusual travel resting-place encounters are incomplete")
        check("Object.keys(ENCOUNTER_DEFINITIONS).length === 35", "Unexpected encounter pool size after content expansion")
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
        check("(() => { const sample={selectedEquipment:{},carriedItems:{},unsecuredLoot:[],committedProvisionsRemaining:10,foundProvisions:0,provisions:10,runFlags:{}}; const original=Math.random; Math.random=()=>0; const result=EncounterOutcomes.resolve({type:'gainWeightedRandomUnsecuredItem',items:[{itemId:'old_coin',weight:5},{itemId:'silver_brooch',weight:1}],resultText:'Arthur finds {itemName}.'},{expedition:sample,player:game.player}); Math.random=original; return result.resultText === 'Arthur finds Old Silver Coins.' && sample.unsecuredLoot[0].itemId === 'old_coin' && result.messages[0] === 'Found Old Silver Coins.'; })()", "Weighted unsecured loot does not identify or preserve the selected item")
        check("(() => { const make=()=>({random:()=>0,selectedEquipment:{},carriedItems:{},unsecuredLoot:[],committedProvisionsRemaining:10,foundProvisions:0,provisions:10,runFlags:{}}); const resolve=effect=>{const expedition=make(); EncounterOutcomes.resolve(effect,{expedition,player:game.player}); return expedition;}; const main=ENCOUNTER_DEFINITIONS.fork_in_the_road.stages.start.choices.find(choice=>choice.id==='main_road').outcomes[0]; const forage=ENCOUNTER_DEFINITIONS.woodland_foraging.stages.start.choices.find(choice=>choice.id==='gather_safe').outcomes[2]; const tree=ENCOUNTER_DEFINITIONS.fallen_tree.stages.start.choices.find(choice=>choice.id==='use_rope').outcomes[0]; const stream=ENCOUNTER_DEFINITIONS.woodland_stream.stages.start.choices.find(choice=>choice.id==='use_rope').outcomes[0]; const mainRun=resolve(main); const forageRun=resolve(forage); const treeRun=resolve(tree); const streamRun=resolve(stream); return main.chance===0.15&&forage.chance===0.2&&tree.chance===0.2&&stream.chance===0.15&&mainRun.unsecuredLoot[0]?.itemId==='dried_herbs'&&forageRun.unsecuredLoot[0]?.itemId==='dried_herbs'&&treeRun.provisions===11&&streamRun.unsecuredLoot[0]?.itemId==='hunting_supplies'; })()", "Safe low-risk outcomes cannot deterministically award their minor resources")
        check("(() => { const make=roll=>({random:()=>roll,selectedEquipment:{},carriedItems:{rope:1},consumedItems:{},unsecuredLoot:[],committedProvisionsRemaining:10,foundProvisions:0,provisions:10,runFlags:{}}); const tree=ENCOUNTER_DEFINITIONS.fallen_tree.stages.start.choices.find(choice=>choice.id==='use_rope'); const stream=ENCOUNTER_DEFINITIONS.woodland_stream.stages.start.choices.find(choice=>choice.id==='use_rope'); const bridge=ENCOUNTER_DEFINITIONS.broken_bridge.stages.start.choices.find(choice=>choice.id==='use_rope'); const resolve=(choice,roll)=>EncounterOutcomes.resolveAll(choice.outcomes||[],{expedition:make(roll),player:game.player}); const lost=make(0); EncounterOutcomes.resolveAll(tree.outcomes||[],{expedition:lost,player:game.player}); const held=make(0.99); EncounterOutcomes.resolveAll(tree.outcomes||[],{expedition:held,player:game.player}); const bridgeLoss=resolve(bridge,0); return tree.outcomes?.[0]?.secondaryOutcome?.chance===0.12&&stream.outcomes?.[0]?.secondaryOutcome?.chance===0.16&&bridge.outcomes?.[0]?.chance===0.18&&lost.consumedItems.rope===1&&!lost.carriedItems.rope&&held.carriedItems.rope===1&&!held.consumedItems.rope&&bridgeLoss.resultText.includes('snaps'); })()", "Rope obstacle outcomes did not preserve a favorable crossing while allowing seeded loss")
        check("['hidden_hollow','whispering_oak','abandoned_cart','strange_lights','something_in_thorns','woodland_foraging','fallen_tree','woodland_stream','fading_light','sudden_storm','shelter_before_nightfall'].every(id => Object.values(ENCOUNTER_DEFINITIONS[id].stages).some(stage => stage.choices.some(choice => choice.pendingAction)))", "Authored delayed actions are missing")
        check("(() => { const required={abandoned_camp:['search_camp'],abandoned_cart:['search_for_owner'],woodland_stream:['wade_across','use_rope'],fallen_tree:['use_rope'],shelter_before_nightfall:['rest','search_shelter'],sudden_storm:['shelter'],fading_light:['slow_down']}; return Object.entries(required).every(([encounterId,choiceIds]) => choiceIds.every(choiceId => Object.values(ENCOUNTER_DEFINITIONS[encounterId].stages).flatMap(stage => stage.choices || []).find(choice => choice.id === choiceId)?.pendingAction)); })()", "A specifically requested action delay is missing")
        check("Object.values(EXPEDITION_TUNING.encounterActionDelays).every(range => range.minimumMs >= 800 && range.maximumMs <= 2600)", "Pending action delay profiles are outside the intended range")
        check("['silver_brooch','amber_beads','decorated_buckle','merchants_ring','carved_ivory_token','bronze_figurine','polished_agate','embroidered_gloves','silver_cup','silver_reliquary','gilded_brooch','roman_signet','jeweled_saints_locket','coin_purse'].every(id => ITEM_DEFINITIONS[id]?.category === 'valuable' && Number.isFinite(SHOP_DEFINITIONS.village_general_goods.sellValues[id]))", "Sellable valuable definitions are incomplete")
        check("(() => { const cart=ENCOUNTER_DEFINITIONS.abandoned_cart.stages.start.choices.find(choice=>choice.id==='search_cart').outcomes[0]; const shrine=ENCOUNTER_DEFINITIONS.ruined_wayside_shrine.stages.start.choices.find(choice=>choice.id==='examine').outcomes[0].effects[0]; const road=ENCOUNTER_DEFINITIONS.sunken_road.stages.start.choices.find(choice=>choice.id==='follow').outcomes[1].effects[0]; const expected={silver_reliquary:{effect:shrine,weight:0.8},gilded_brooch:{effect:cart,weight:0.6},roman_signet:{effect:road,weight:0.4},jeweled_saints_locket:{effect:shrine,weight:0.2}}; return Object.entries(expected).every(([itemId,entry])=>{ const selected=entry.effect.items.find(item=>item.itemId===itemId); if(selected?.weight!==entry.weight) return false; const total=entry.effect.items.reduce((sum,item)=>sum+item.weight,0); const before=entry.effect.items.slice(0,entry.effect.items.indexOf(selected)).reduce((sum,item)=>sum+item.weight,0); const sample={random:()=>((before+entry.weight/2)/total),selectedEquipment:{},carriedItems:{},unsecuredLoot:[],committedProvisionsRemaining:10,foundProvisions:0,provisions:10,runFlags:{}}; EncounterOutcomes.resolve(entry.effect,{expedition:sample,player:game.player}); return sample.unsecuredLoot.length===1&&sample.unsecuredLoot[0].itemId===itemId; }); })()", "Rare treasure weights or deterministic weighted rolls are invalid")
        check("new Set(Object.values(ENCOUNTER_DEFINITIONS).flatMap(encounter => Object.values(encounter.stages).flatMap(stage => stage.choices || []).flatMap(choice => choice.outcomes || []).filter(effect => ['gainRandomUnsecuredItem','gainWeightedRandomUnsecuredItem'].includes(effect.type)).flatMap(effect => effect.itemIds || effect.items.map(entry => entry.itemId)))).size >= 18", "Encounter loot pools remain too repetitive")
        health_before_encounter = devtools.evaluate("game.expedition.health")
        check("EncounterManager.resolveChoice(game.expedition, game.player, 'climb_over', {failExpedition}).pending", "Fallen Tree climb did not enter its pending phase")
        check("(() => { const original = Math.random; Math.random = () => 0; const result = EncounterManager.completePendingAction(game.expedition, game.player, game.expedition.activeEncounter.pendingToken, {failExpedition}); Math.random = original; renderExpedition(); return result.resolved; })()", "Pending Fallen Tree choice did not resolve")
        check(f"game.expedition.health === {health_before_encounter - 1} && game.expedition.activeEncounter.resultText.includes('injury')", "Fallen Tree injury text does not match its damage branch")
        devtools.click('[data-action="continue-journey"]')

        check("ITEM_DEFINITIONS.arthur_sword.effects.combatDamage.minimum === 8 && ITEM_DEFINITIONS.quilted_hauberk.effects.combatDefense === 3", "Arthur equipment lacks combat stats")
        check("COMBAT_TUNING.actionGaugeMaximum === 100 && COMBAT_TUNING.fleeChance === 0.7 && COMBAT_TUNING.enemyTargetWeights.arthur===0.65 && COMBAT_TUNING.enemyTargetWeights.activeCompanions===0.35", "Combat tuning or enemy target weights are not centralized")
        check("(() => { const sample={...game.expedition,selectedCompanion:null,health:33,companionCombatHp:{}}; const combat=CombatSystem.create(sample,'wild_boar',{random:()=>0}); return combat.allies.length===1 && combat.allies[0].id==='arthur' && combat.allies[0].hp===33 && !JSON.stringify(combat).includes('sir_kay'); })()", "Solo combat incorrectly includes Kay or loses Arthur health")
        check("(() => { const sample={...game.expedition,selectedCompanion:'sir_kay',health:40,companionCombatHp:{sir_kay:41}}; const combat=CombatSystem.create(sample,'wild_boar',{random:()=>0}); return combat.allies.length===2 && combat.allies.find(ally=>ally.id==='sir_kay').hp===41; })()", "Kay party combat or expedition HP persistence is invalid")
        check("(() => { const sample={...game.expedition,selectedCompanion:null,health:40,companionCombatHp:{}}; const combat=CombatSystem.create(sample,'wild_boar',{random:()=>0}); CombatSystem.update(combat,sample,8); const gauges=combat.allies[0].gauge+combat.enemies[0].gauge; CombatSystem.update(combat,sample,5); return combat.status==='awaitingAction' && combat.activeActorId==='arthur' && combat.allies[0].gauge+combat.enemies[0].gauge===gauges; })()", "Ready gauges do not pause while awaiting player input")
        check("(() => { const sample={...game.expedition,selectedCompanion:null,health:40,companionCombatHp:{}}; const combat=CombatSystem.create(sample,'wild_boar',{random:()=>0}); combat.allies[0].gauge=100; CombatSystem.update(combat,sample,0); const before=combat.enemies[0].hp; CombatSystem.chooseAction(combat,sample,'attack'); return combat.enemies[0].hp===before-7; })()", "Arthur's equipped attack did not damage the boar using defense")
        check("(() => { const sample={...game.expedition,selectedCompanion:'sir_kay',health:40,companionCombatHp:{}}; const combat=CombatSystem.create(sample,'wild_boar',{random:()=>0}); const kay=combat.allies.find(ally=>ally.id==='sir_kay'); kay.gauge=100; CombatSystem.update(combat,sample,0); CombatSystem.chooseAction(combat,sample,'intercede'); combat.enemies[0].gauge=100; CombatSystem.update(combat,sample,0); return sample.health===40 && sample.companionCombatHp.sir_kay===43 && !kay.interceding && combat.log.some(line=>line.includes('meant for Arthur')); })()", "Intercede did not redirect and persist enemy Charge damage")
        check("(() => { const sample={...game.expedition,selectedCompanion:null,health:40,companionCombatHp:{}}; const combat=CombatSystem.create(sample,'wild_boar',{random:()=>0}); combat.enemies[0].gauge=100; CombatSystem.update(combat,sample,0); renderCombat(sample,combat); const flashed=document.querySelector('[data-combatant-id=\"arthur\"]')?.classList.contains('was-hit'); renderCombat(sample,combat); const cleared=!document.querySelector('[data-combatant-id=\"arthur\"]')?.classList.contains('was-hit'); return flashed&&cleared&&!combat.allies[0].lastHitEvent; })()", "Combat hit feedback persisted and replayed on later nameplate renders")
        check("(() => { const sample={...game.expedition,selectedCompanion:null,health:33,companionCombatHp:{}}; const combat=CombatSystem.create(sample,'wild_boar',{random:()=>0}); const arthur=combat.allies[0]; arthur.gauge=100; CombatSystem.update(combat,sample,0); CombatSystem.chooseAction(combat,sample,'defend'); combat.enemies[0].gauge=100; CombatSystem.update(combat,sample,0); const persisted=sample.health===30 && arthur.defending; arthur.gauge=100; CombatSystem.update(combat,sample,0); return persisted && !arthur.defending; })()", "Defend mitigation, duration, or Arthur expedition health persistence is invalid")
        check("(() => { let reason=''; const sample={activeEncounter:{phase:'combat',combatResolution:{combatId:'wild_boar'}},status:'active'}; const result=EncounterManager.completeCombat(sample,game.player,'defeat',{failExpedition:value=>{reason=value;}}); return result.ended && reason.includes('Arthur'); })()", "Combat defeat did not delegate to the expedition failure callback")
        check("COMBAT_DEFINITIONS.wolves.enemyIds.length===3 && COMBAT_DEFINITIONS.wolves.enemyIds.every(id=>id==='wolf') && COMBAT_ENEMY_DEFINITIONS.wolf.maxHp===14 && COMBAT_ENEMY_DEFINITIONS.wolf.speed===14", "Three-wolf combat data is invalid")
        check("(() => { const sample={...game.expedition,selectedCompanion:null,health:100,companionCombatHp:{}}; const combat=CombatSystem.create(sample,'wolves',{random:()=>0}); return combat.enemies.length===3 && new Set(combat.enemies.map(enemy=>enemy.id)).size===3 && combat.enemies.map(enemy=>enemy.name).join(',')==='Wolf 1,Wolf 2,Wolf 3' && combat.allies.length===1; })()", "Solo wolf combat does not create three distinguishable independent enemies")
        check("(() => { const sample={...game.expedition,selectedCompanion:'sir_kay',health:100,companionCombatHp:{}}; const combat=CombatSystem.create(sample,'wolves',{random:()=>0}); combat.enemies[0].hp=4; combat.enemies[0].gauge=11; return combat.allies.length===2 && combat.enemies[1].hp===14 && combat.enemies[2].hp===14 && combat.enemies[1].gauge===0 && combat.enemies[2].gauge===0; })()", "Wolf HP/gauges are shared or Kay is absent from the selected party")
        check("(() => { const sample={...game.expedition,selectedCompanion:null,health:100,companionCombatHp:{}}; const combat=CombatSystem.create(sample,'wolves',{random:()=>0}); combat.allies[0].gauge=100; CombatSystem.update(combat,sample,0); const targetResult=CombatSystem.chooseAction(combat,sample,'attack'); return combat.selectedEnemyId==='wolf_1' && targetResult.resolved && combat.enemies[0].hp===6 && !combat.pendingActionId && combat.selectedEnemyId==='wolf_1'; })()", "Multi-enemy Attack did not use the persistent default target directly")
        check("(() => { const sample={...game.expedition,selectedCompanion:null,health:100,companionCombatHp:{}}; const combat=CombatSystem.create(sample,'wolves',{random:()=>0}); combat.allies[0].gauge=100; CombatSystem.update(combat,sample,0); const selected=CombatSystem.selectEnemyTarget(combat,'wolf_2'); const before=combat.enemies.map(enemy=>enemy.hp); const result=CombatSystem.chooseAction(combat,sample,'attack'); return selected.selected && result.resolved && combat.enemies[0].hp===before[0] && combat.enemies[1].hp===before[1]-8 && combat.enemies[2].hp===before[2] && combat.selectedEnemyId==='wolf_2'; })()", "Selecting a wolf did not persist and direct Attack the selected target")
        check("(() => { const sample={...game.expedition,selectedCompanion:null,health:100,companionCombatHp:{}}; const combat=CombatSystem.create(sample,'wolves',{random:()=>0}); combat.enemies[0].hp=0; combat.allies[0].gauge=100; CombatSystem.update(combat,sample,0); const result=CombatSystem.chooseAction(combat,sample,'attack'); return result.resolved && combat.enemies[1].hp===6 && combat.selectedEnemyId==='wolf_2'; })()", "A defeated wolf was not replaced by the next living selected target")
        check("(() => { const sample={...game.expedition,selectedCompanion:null,health:100,companionCombatHp:{}}; const combat=CombatSystem.create(sample,'wolves',{random:()=>0}); combat.enemies[0].hp=0; combat.enemies[1].hp=0; combat.enemies[2].hp=14; combat.allies[0].gauge=100; CombatSystem.update(combat,sample,0); CombatSystem.chooseAction(combat,sample,'attack'); return combat.enemies[2].hp===6 && !combat.pendingActionId; })()", "Attack did not auto-target the sole remaining wolf")
        check("(() => { const sample={...game.expedition,selectedCompanion:null,health:100,companionCombatHp:{}}; const combat=CombatSystem.create(sample,'wolves',{random:()=>0}); combat.enemies[0].hp=1; combat.allies[0].gauge=100; CombatSystem.update(combat,sample,0); const result=CombatSystem.chooseAction(combat,sample,'attack'); return result.resolved && combat.enemies[0].hp===0 && combat.result===null && combat.selectedEnemyId==='wolf_2' && combat.enemies.filter(enemy=>enemy.hp>0).length===2; })()", "Defeating one wolf incorrectly ended combat or failed to select the next target")
        check("(() => { const sample={...game.expedition,selectedCompanion:null,health:100,companionCombatHp:{}}; const combat=CombatSystem.create(sample,'wolves',{random:()=>0}); combat.enemies[0].hp=0; combat.enemies[1].hp=0; combat.enemies[2].hp=1; combat.allies[0].gauge=100; CombatSystem.update(combat,sample,0); CombatSystem.chooseAction(combat,sample,'attack'); return combat.result==='victory' && combat.enemies.every(enemy=>enemy.hp===0); })()", "Wolf victory did not require all three enemies to be defeated")
        check("(() => { const sample={...game.expedition,selectedCompanion:null,health:100,companionCombatHp:{}}; const combat=CombatSystem.create(sample,'wolves',{random:()=>0}); combat.status='running'; combat.interactionMode='main'; const card=renderCombatant(combat.enemies[1],combat); const selected=CombatSystem.selectEnemyTarget(combat,'wolf_2').selected; combat.interactionMode='allyTarget'; const ignored=CombatSystem.selectEnemyTarget(combat,'wolf_3').selected; return card.includes('is-selectable')&&selected&&!ignored&&combat.selectedEnemyId==='wolf_2'; })()", "Enemy target selection did not remain available during live gauges or stay blocked in ally mode")
        check("(() => { const p=SaveSystem.createDefaultPlayerState(); p.selectedCompanions=[]; p.selectedCompanion=null; const boar=ExpeditionRules.createExpedition(p,{companions:[],provisions:10,packedMaterials:{},random:()=>0}); const boarVictory=ENCOUNTER_DEFINITIONS.wild_boar.stages.start.choices.find(choice=>choice.id==='fight').outcomes[0].victory; const boarResult=EncounterOutcomes.resolveAll(boarVictory.outcomes,{expedition:boar,player:p}); const wolves=ExpeditionRules.createExpedition(p,{companions:[],provisions:10,packedMaterials:{},random:()=>0}); const wolfVictory=ENCOUNTER_DEFINITIONS.wolves_in_brush.stages.start.choices.find(choice=>choice.id==='stand_ground').outcomes[0].victory; const wolfFled=ENCOUNTER_DEFINITIONS.wolves_in_brush.stages.start.choices.find(choice=>choice.id==='stand_ground').outcomes[0].fled; const wolfResult=EncounterOutcomes.resolveAll(wolfVictory.outcomes,{expedition:wolves,player:p}); return boarResult.rewards[0]?.materialId==='raw_meat'&&boarResult.rewards[0]?.quantity===3&&MaterialRules.expeditionQuantity(boar,'raw_meat')===3&&wolfResult.rewards[0]?.materialId==='raw_meat'&&wolfResult.rewards[0]?.quantity===2&&MaterialRules.expeditionQuantity(wolves,'raw_meat')===2&&wolfFled.outcomes.length===0; })()", "Animal combat victory outcomes did not feed guaranteed Raw Meat into the Material Bag")
        check("(() => { const sample={...game.expedition,selectedCompanion:'sir_kay',health:40,companionCombatHp:{}}; const combat=CombatSystem.create(sample,'wolves',{random:()=>0}); const kay=combat.allies.find(ally=>ally.id==='sir_kay'); kay.gauge=100; CombatSystem.update(combat,sample,0); CombatSystem.chooseAction(combat,sample,'intercede'); combat.enemies[1].gauge=100; CombatSystem.update(combat,sample,0); const afterFirst=sample.companionCombatHp.sir_kay; combat.enemies[2].gauge=100; CombatSystem.update(combat,sample,0); return afterFirst===49 && sample.health===39 && sample.companionCombatHp.sir_kay===49 && !kay.interceding; })()", "Kay Intercede was bypassed or consumed more than once by multiple wolves")
        check("(() => { const choice=ENCOUNTER_DEFINITIONS.wolves_in_brush.stages.start.choices.find(entry=>entry.id==='stand_ground'); return choice.outcomes.length===1 && choice.outcomes[0].type==='startCombat' && choice.outcomes[0].combatId==='wolves' && !JSON.stringify(choice).includes('randomChance'); })()", "Old fake wolf damage remains beside real combat")

        devtools.evaluate("game.expedition.selectedCompanion=null")
        check("EncounterManager.force(game.expedition, 'wild_boar')", "Wild Boar flee integration could not start")
        devtools.evaluate("resolveEncounterChoice('fight'); game.expedition.combat.random=()=>0; game.expedition.combat.allies[0].gauge=100; updateCombat(0)")
        provisions_before_flee = devtools.evaluate("game.expedition.provisions")
        check("game.expedition.combat?.allies.length===1 && game.expedition.combat.allies[0].id==='arthur' && document.querySelector('.combat-screen') && game.expedition.combat.status==='awaitingAction' && !document.querySelector('.expedition-action-bar')", "Solo Wild Boar Fight included Kay, failed to render its ready state, or showed travel actions")
        check("Math.abs(document.querySelector('.combat-scene').clientWidth/document.querySelector('.combat-scene').clientHeight-16/9)<0.02", "Combat visual is not the shared portrait-safe 16:9 frame")
        check("(() => { const panel=document.querySelector('.combat-panel'); const controls=document.querySelector('.combat-controls'); const log=document.querySelector('.combat-log'); return panel && controls && log && controls.compareDocumentPosition(log) & Node.DOCUMENT_POSITION_FOLLOWING && document.querySelector('.combat-log-label')?.textContent==='Combat Log' && document.body.textContent.includes(\"Wild Boar selected\"); })()", "Combat action controls and log are not in the decision-then-history order")
        devtools.click('[data-action="combat-action"][data-combat-action-id="flee"]')
        check(f"!game.expedition.combat && game.expedition.activeEncounter.phase==='result' && Math.abs(game.expedition.provisions-{provisions_before_flee})<0.000001", "Successful flee awarded victory provisions or failed to end combat")
        devtools.click('[data-action="continue-journey"]')

        devtools.evaluate("game.expedition.selectedCompanion='sir_kay'")
        check("EncounterManager.force(game.expedition, 'wild_boar')", "Wild Boar victory integration could not start")
        devtools.evaluate("resolveEncounterChoice('fight'); game.expedition.combat.enemies[0].hp=1; game.expedition.combat.allies[0].gauge=100; updateCombat(0)")
        provisions_before_victory = devtools.evaluate("game.expedition.provisions")
        check("game.expedition.combat.allies.some(ally=>ally.id==='sir_kay') && document.body.textContent.includes('Sir Kay')", "Selected Kay did not join the integrated combat UI")
        devtools.click('[data-action="combat-action"][data-combat-action-id="attack"]')
        check(f"!game.expedition.combat && game.expedition.activeEncounter.phase==='result' && document.querySelectorAll('.encounter-result-panel .compact-resources .resource-card').length===6 && Math.abs(game.expedition.provisions-{provisions_before_victory})<0.000001 && game.expedition.activeEncounter.rewards.some(reward=>reward.materialId==='raw_meat') && document.body.textContent.includes('Raw Meat') && document.querySelector('#journey-log-preview')?.textContent.includes('Raw Meat')", "Boar victory did not expose its Raw Meat reward, shared status grid, or Journey Log entry without inventing provisions")
        check("game.expedition.activeEncounter.resultText.includes('boar falls') && game.expedition.activeEncounter.rewards.some(reward=>reward.materialId==='raw_meat') && Boolean(document.querySelector('[data-action=\"continue-journey\"]'))", "Combat victory did not return cleanly through Continue Journey with its reward")
        devtools.click('[data-action="continue-journey"]')

        devtools.evaluate("game.expedition.selectedCompanion='sir_kay'")
        check("EncounterManager.force(game.expedition,'wolves_in_brush')", "Wolf encounter could not be forced")
        devtools.evaluate("resolveEncounterChoice('stand_ground'); game.expedition.combat.allies[0].gauge=100; updateCombat(0)")
        wolf_provisions_before = devtools.evaluate("game.expedition.provisions")
        wolf_raw_meat_before_flee = devtools.evaluate("MaterialRules.expeditionQuantity(game.expedition, 'raw_meat')")
        check("game.expedition.activeEncounter.phase==='combat' && game.expedition.combat.id==='wolves' && game.expedition.combat.enemies.length===3", "Stand Your Ground did not launch three-wolf combat")
        devtools.evaluate("(() => { const combat=game.expedition.combat; const arthur=combat.allies.find(ally=>ally.id==='arthur'); const kay=combat.allies.find(ally=>ally.id==='sir_kay'); game.expedition.carriedItems.bandages=2; game.expedition.consumedItems={}; arthur.hp=30; game.expedition.health=30; kay.hp=40; game.expedition.companionCombatHp.sir_kay=40; combat.status='awaitingAction'; combat.activeActorId='arthur'; arthur.gauge=100; renderCombat(game.expedition,combat); })()")
        check("document.querySelector('[data-combat-action-id=\"abilities\"]') && !document.querySelector('[data-combat-action-id=\"abilities\"]').disabled", "Ready Arthur did not expose an enabled Abilities action")
        devtools.click('[data-action="combat-action"][data-combat-action-id="abilities"]')
        check("game.expedition.combat.interactionMode==='abilities' && document.querySelector('[data-action=\"combat-ability\"][data-ability-id=\"pommel_strike\"]') && document.body.textContent.includes(\"Arthur's Abilities\")", "Abilities click did not re-render Arthur's submenu")
        devtools.click('[data-action="combat-ability"][data-ability-id="pommel_strike"]')
        check("game.expedition.combat.interactionMode==='enemyTarget' && game.expedition.combat.pendingActionId==='pommel_strike' && document.body.textContent.includes('Choose an enemy target')", "Pommel Strike did not enter the generic enemy target state")
        devtools.evaluate("window.pommelCancelBefore={gauge:game.expedition.combat.enemies[1].gauge,hp:game.expedition.combat.enemies[1].hp,arthurGauge:game.expedition.combat.allies[0].gauge}")
        devtools.click('[data-action="combat-cancel-target"]')
        check("game.expedition.combat.interactionMode==='abilities' && document.querySelector('[data-action=\"combat-ability\"][data-ability-id=\"pommel_strike\"]') && game.expedition.combat.enemies[1].gauge===window.pommelCancelBefore.gauge && game.expedition.combat.enemies[1].hp===window.pommelCancelBefore.hp && game.expedition.combat.allies[0].gauge===window.pommelCancelBefore.arthurGauge", "Canceling Pommel targeting did not return to Abilities without consuming the turn")
        devtools.click('[data-action="combat-menu-back"]')
        check("game.expedition.combat.interactionMode==='main' && Boolean(document.querySelector('[data-combat-action-id=\"items\"]'))", "Back from Abilities did not return to the main action menu")
        devtools.click('[data-action="combat-action"][data-combat-action-id="items"]')
        check("game.expedition.combat.interactionMode==='items' && document.querySelector('[data-action=\"combat-item\"][data-item-id=\"bandages\"]') && document.body.textContent.includes(\"Arthur's Items\")", "Items click did not re-render the carried-item submenu")
        devtools.click('[data-action="combat-item"][data-item-id="bandages"]')
        check("game.expedition.combat.interactionMode==='allyTarget' && game.expedition.combat.pendingActionId==='bandages' && document.body.textContent.includes('Choose an ally to heal')", "Bandages did not enter the data-defined ally target state")
        devtools.click('[data-action="combat-cancel-target"]')
        check("game.expedition.combat.interactionMode==='items' && document.querySelector('[data-action=\"combat-item\"][data-item-id=\"bandages\"]') && game.expedition.carriedItems.bandages===2 && game.expedition.combat.allies[0].gauge===100", "Canceling Bandage targeting did not return to Items without consuming the turn or item")
        devtools.click('[data-action="combat-menu-back"]')
        devtools.evaluate("game.expedition.combat.status='awaitingAction'; game.expedition.combat.interactionMode='main'; game.expedition.combat.pendingActionId=null; game.expedition.combat.activeActorId='arthur'; game.expedition.combat.allies[0].gauge=100; renderCombat(game.expedition,game.expedition.combat)")
        check("game.expedition.combat.interactionMode==='main' && !game.expedition.combat.pendingActionId && document.querySelectorAll('.combatant.enemy.is-selectable').length===3 && document.querySelector('.combatant.enemy.is-selected') && document.querySelector('.combat-target-badge')?.textContent==='TARGET' && !document.body.textContent.includes('VS')", "Paused wolf cards did not expose unmistakable persistent target selection")
        devtools.click('[data-action="combat-target"][data-target-id="wolf_2"]')
        check("game.expedition.combat.selectedEnemyId==='wolf_2' && document.querySelector('[data-combatant-id=\"wolf_2\"]')?.classList.contains('is-selected')", "Clicking an enemy card did not change the persistent selection")
        devtools.click('[data-action="combat-action"][data-combat-action-id="attack"]')
        check("game.expedition.combat.interactionMode==='main' && !game.expedition.combat.pendingActionId && game.expedition.combat.selectedEnemyId==='wolf_2'", "Basic Attack did not immediately use the selected wolf")
        for width, height in ((360, 640), (390, 844), (430, 932)):
            devtools.call("Emulation.setDeviceMetricsOverride", {
                "width": width,
                "height": height,
                "deviceScaleFactor": 1,
                "mobile": True,
            })
            time.sleep(0.03)
            check("document.querySelector('.combat-log').clientHeight < document.querySelector('.combat-panel').clientHeight * 0.3 && document.querySelector('.combat-screen').scrollHeight===document.querySelector('.combat-screen').clientHeight", f"Combat log is oversized or wolf combat overflows at {width}x{height}")
            check("document.querySelector('.combat-controls').getBoundingClientRect().top < document.querySelector('.combat-log').getBoundingClientRect().top", f"Combat actions are not above the log at {width}x{height}")
            check("[...document.querySelectorAll('.combatant')].every(entry=>{const box=entry.getBoundingClientRect(),scene=document.querySelector('.combat-scene').getBoundingClientRect(); return box.left>=scene.left && box.right<=scene.right && box.top>=scene.top && box.bottom<=scene.bottom;})", f"Combatant lineup escapes the battlefield at {width}x{height}")
        check("!game.expedition.combat.pendingActionId && game.expedition.combat.status==='running' && game.expedition.combat.selectedEnemyId==='wolf_2'", "Direct Attack did not leave combat in its running state with the selected target preserved")
        devtools.evaluate("game.expedition.combat.random=()=>0; game.expedition.combat.allies[0].gauge=100; game.expedition.combat.status='awaitingAction'; game.expedition.combat.activeActorId='arthur'; renderCombat(game.expedition,game.expedition.combat)")
        devtools.click('[data-action="combat-action"][data-combat-action-id="flee"]')
        check(f"!game.expedition.combat && game.expedition.activeEncounter.phase==='result' && Math.abs(game.expedition.provisions-{wolf_provisions_before})<0.000001 && MaterialRules.expeditionQuantity(game.expedition,'raw_meat')==={wolf_raw_meat_before_flee}", "Fleeing wolves granted a victory reward or failed to return to encounter results")
        devtools.click('[data-action="continue-journey"]')

        check("EncounterManager.force(game.expedition,'wolves_in_brush')", "Wolf victory encounter could not be forced")
        devtools.evaluate("resolveEncounterChoice('stand_ground'); game.expedition.combat.enemies[0].hp=0; game.expedition.combat.enemies[1].hp=0; game.expedition.combat.enemies[2].hp=1; game.expedition.combat.allies[0].gauge=100; updateCombat(0)")
        wolf_victory_provisions = devtools.evaluate("game.expedition.provisions")
        devtools.click('[data-action="combat-action"][data-combat-action-id="attack"]')
        check(f"!game.expedition.combat && game.expedition.activeEncounter.phase==='result' && Math.abs(game.expedition.provisions-{wolf_victory_provisions})<0.000001 && (game.expedition.activeEncounter.rewards.some(reward=>reward.materialId==='raw_meat') || (game.expedition.activeEncounter.rewards.length===0 && document.querySelector('#journey-log-preview')?.textContent.includes('Material Bag was full'))) && document.body.textContent.includes('Raw Meat') && document.querySelector('#journey-log-preview')?.textContent.includes('Raw Meat') && !document.querySelector('#journey-log-preview')?.textContent.includes('×0')", "Defeating all wolves did not expose or clearly report its Raw Meat reward, capacity overflow, or Journey Log entry")
        devtools.click('[data-action="continue-journey"]')

        check("(() => { const sample={...game.expedition,selectedCompanion:'sir_kay',health:1,companionCombatHp:{}}; const combat=CombatSystem.create(sample,'wild_boar',{random:()=>0}); combat.enemies[0].gauge=100; CombatSystem.update(combat,sample,0); return combat.result==='defeat' && sample.health===0; })()", "Arthur reaching zero did not report combat defeat")

        check("EncounterManager.force(game.expedition, 'glint_in_mud')", "Glint in the Mud could not be triggered")
        check("EncounterManager.resolveChoice(game.expedition, game.player, 'investigate', {failExpedition}).pending", "Glint investigation did not enter its pending phase")
        check("(() => { const original=Math.random; Math.random=()=>0; const result=EncounterManager.completePendingAction(game.expedition,game.player,game.expedition.activeEncounter.pendingToken,{failExpedition}); Math.random=original; renderExpedition(); return result.resolved; })()", "Glint investigation did not resolve")
        check("game.expedition.activeEncounter.resultText.includes('Old Silver Coins') && game.expedition.unsecuredLoot.some(entry=>entry.itemId==='old_coin') && document.body.textContent.includes('UNSECURED') && document.querySelector('.encounter-result-panel .reward-card') && document.body.textContent.includes('Unsecured Loot')", "Glint result did not identify and display unsecured loot")
        check("(() => { const preview=document.querySelector('#journey-log-preview')?.textContent ?? ''; return preview.includes('Found Old Silver Coins.') && !preview.includes('ITEM FOUND') && !preview.includes('UNSECURED') && !preview.includes('MATERIAL FOUND'); })()", "Journey Log reward prose retained raw discovery labels or split the narrative from its reward")
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
        check("(() => { game.expedition.activeEncounter.stageId='inside_hollow'; resolveEncounterChoice('search_stones'); return game.expedition.activeEncounter.phase==='pending' && !EncounterManager.resolveChoice(game.expedition,game.player,'search_stones',{failExpedition}).resolved; })()", "Pending choice could be resolved twice")
        green_before = devtools.evaluate("game.player.ownedItems.green_glass_vial || 0")
        devtools.evaluate("game.expedition.unsecuredLoot = [{itemId:'green_glass_vial', quantity:1}]")
        found_before_adjustment = devtools.evaluate("game.expedition.foundProvisions")
        devtools.evaluate("adjustExpeditionProvisions(game.expedition, 4); adjustExpeditionProvisions(game.expedition, -2)")
        check(f"game.expedition.foundProvisions === {found_before_adjustment + 2}", "Encounter-found provisions were not immediately usable")
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
        check(f"game.player.currentGold >= {gold_before_return + 3}", "Successful return did not bank carried and return-reward gold")
        check("game.expedition.returnRewardsRolled && game.summary.returnRewardTier === 'minor' && game.summary.returnRewards && (Object.keys(game.summary.returnRewards.materials).length + game.summary.returnRewards.gold + game.summary.returnRewards.recipes.length + game.summary.returnRewards.items.length) > 0 && document.body.textContent.includes('Expedition Haul') && document.body.textContent.includes('Minor Return Reward')", "Successful return did not separate and report its distance-tier reward")
        check(f"game.player.provisions === {success_stock_before + 2}", "Successful return did not settle unused and found provisions")
        check("rewardPresentation({type:'material',materialId:'wood',quantity:2}) === 'routine' && rewardPresentation({type:'recipe',recipeId:'strong_tonic',quantity:1}) === 'major' && rewardPresentation({type:'item',itemId:'green_glass_vial',quantity:1}) === 'major'", "Reward significance hierarchy does not use existing type/category/rarity data")
        devtools.evaluate("game.summary={outcome:'returned',title:'Returned to Safety',message:'A focused report.',distance:90,gold:12,expeditionGold:3,materials:{wood:2},recipes:[],loot:[{itemId:'old_coin',quantity:2},{itemId:'green_glass_vial',quantity:1}],returnRewardTier:'deep',returnRewards:{items:[],materials:{iron:1},recipes:['strong_tonic'],gold:9},provisionsReturned:2}; renderSummary()")
        check("document.body.textContent.includes('Wood') && document.querySelectorAll('.summary-major-rewards .reward-card').length === 2 && document.body.textContent.includes('Expedition Haul') && document.body.textContent.includes('Deep Return Reward')", "Returned report did not contrast compact routine rewards with highlighted discoveries")
        check("document.querySelector('.summary-reward-section')?.textContent.includes('Secured on return') && document.querySelector('.return-reward-section')?.textContent.includes('Distance-tier bonus')", "Returned report lost the haul versus return-reward source distinction")
        check(f"JSON.stringify(game.player.equippedItems) === {json.dumps(equipped_before)}", "Expedition changed equipped gear")
        check(f"JSON.stringify(game.player.packedItems) === {json.dumps(packed_before)}", "Expedition changed pack selection")
        for width, height in ((320, 480), (360, 640), (390, 844), (430, 932)):
            devtools.call("Emulation.setDeviceMetricsOverride", {
                "width": width,
                "height": height,
                "deviceScaleFactor": 1,
                "mobile": True,
            })
            time.sleep(0.03)
            check("(() => { const root=document.querySelector('.summary-screen'); return root && root.scrollWidth===root.clientWidth && [...root.querySelectorAll('.reward-card')].every(card=>{const box=card.getBoundingClientRect(), frame=root.getBoundingClientRect(); return box.left>=frame.left && box.right<=frame.right; }); })()", f"Reward report overflows the portrait summary at {width}x{height}")
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
