"""Focused full-campaign replay regression tests."""

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
    os.chdir(ROOT)
    http_port = free_port()
    debug_port = free_port()
    server = ThreadingHTTPServer(("127.0.0.1", http_port), QuietHandler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    profile = Path(tempfile.mkdtemp(prefix="grail-campaign-replay-test-"))
    game_url = f"http://127.0.0.1:{http_port}/?sim=1"
    chrome = subprocess.Popen([
        str(CHROME), "--headless=new", "--disable-gpu", "--no-sandbox",
        "--remote-allow-origins=*", f"--remote-debugging-port={debug_port}",
        f"--user-data-dir={profile}", game_url,
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    checks = 0
    run_soak = os.environ.get("GRAIL_RUN_SOAK") == "1"
    try:
        devtools = DevTools(wait_for_json(debug_port, game_url))
        devtools.call("Runtime.enable")
        time.sleep(0.3)

        def check(expression: str, label: str):
            nonlocal checks
            if not run_soak and (
                label.startswith("Campaign 40")
                or label.startswith("Long campaign seek")
            ):
                return
            value = devtools.evaluate(expression)
            if not value:
                raise AssertionError(f"{label}: {value!r}")
            checks += 1

        scenario = json.dumps({
            "id": "campaign-replay-coverage",
            "seed": "campaign-replay-coverage-seed",
            "expeditions": 2,
            "strategy": "cautious",
            "betweenExpeditionPolicy": "conservative-sustainer",
            "turnaroundDistance": 8,
            "startingState": {
                "currentGold": 200,
                "provisions": 24,
                "arthurHealth": 20,
            },
        })
        check(
            f"(() => {{ const campaign=CampaignSimulationRunner.run({scenario}); const data=CampaignReplayData.normalize(campaign); return data.version===2&&data.expeditions.length===campaign.expeditions.length&&data.townActions.length>0&&data.totalActionCount>=data.townActionCount; }})()",
            "Campaign replay did not normalize the full campaign payload",
        )
        check(
            f"(() => {{ const campaign=CampaignSimulationRunner.run({scenario}); const actions=campaign.replay.townActions; const types=actions.map(action=>action.type); const purchases=actions.filter(action=>action.type==='buy-item').map(action=>action.itemId); const equipped=actions.filter(action=>action.type==='equip-item').map(action=>action.itemId); return types.includes('inn-rest')&&types.includes('buy-item')&&types.includes('equip-item')&&types.includes('pack-loadout')&&types.includes('departure')&&purchases.includes('knightly_longsword')&&purchases.includes('reinforced_mail')&&equipped.includes('knightly_longsword')&&equipped.includes('reinforced_mail')&&campaign.replay.expeditions.length===2; }})()",
            "Campaign telemetry did not record ordered Inn, purchase, equip, pack, and departure actions",
        )
        check(
            "(() => { const campaign=CampaignSimulationRunner.run({seed:'ordered-inn-cooking',expeditions:2,expeditionPlan:[40,40],startingState:{currentGold:200,provisions:10,materials:{raw_meat:3,mushrooms:3,fresh_herbs:3},arthurHealth:20}}); const actions=campaign.replay.townActions; const cooking=actions.filter(action=>action.type==='cook-recipe'); const cook2=actions.findIndex(action=>action.type==='cook-recipe'&&action.expeditionNumber===2); const entry2=actions.findIndex(action=>action.type==='town-entry'&&action.expeditionNumber===2); const departure2=actions.findIndex(action=>action.type==='departure'&&action.expeditionNumber===2); return cooking.length>0&&cooking.every(action=>action.context==='inn'&&action.providerId==='campfire')&&cook2>entry2&&cook2<departure2; })()",
            "Inn cooking was not explicitly contextualized or ordered before expedition two",
        )
        check(
            f"(() => {{ const campaign=CampaignSimulationRunner.run({scenario}); const before=JSON.stringify({{player:game.player,save:SaveSystem.load()}}); CampaignReplayController.start(campaign); const state=CampaignReplayController.state(); return state.status==='playing'&&state.realGameState.player!==game.player&&state.data.expeditions.length===2&&JSON.stringify(SaveSystem.load())===JSON.stringify(JSON.parse(before).save); }})()",
            "Campaign replay did not start in an isolated sandbox",
        )
        check(
            "Boolean(document.querySelector('.campaign-replay-controls')?.textContent.includes('Next Town')&&document.querySelector('.campaign-replay-controls')?.textContent.includes('Next Expedition')&&document.querySelector('.campaign-replay-timeline'))",
            "Campaign-specific controls and timeline were not rendered",
        )
        check(
            "(() => { const player=SaveSystem.createDefaultPlayerState(); player.provisions=2; player.materials={raw_meat:1,mushrooms:1,fresh_herbs:1}; const result=CraftingRules.craft(player,'hunters_stew','campfire',{context:'inn'}); return result.applied&&result.context==='inn'&&result.provisions===8&&player.provisions===10&&result.materialsConsumed.raw_meat===1&&result.materialsConsumed.mushrooms===1&&result.materialsConsumed.fresh_herbs===1; })()",
            "Inn Hunter's Stew did not consume the exact ingredients or add eight provisions",
        )
        check(
            "(() => { const player=SaveSystem.createDefaultPlayerState(); player.provisions=2; player.packedMaterials={raw_meat:1,mushrooms:1,fresh_herbs:1}; const expedition=ExpeditionRules.startExpedition(player,{provisions:2}); expedition.travelState='camped'; const result=CraftingRules.craft(player,'hunters_stew','campfire',{expedition,context:'camp'}); const townResult=CraftingRules.craft(player,'hunters_stew','campfire',{context:'camp'}); return result.applied&&result.context==='camp'&&expedition.provisions===10&&!townResult.applied; })()",
            "Wilderness camp cooking did not require or use an expedition camp context",
        )
        check(
            "(() => { const controls=document.querySelector('.campaign-replay-controls'); const selectors=['[data-replay-action=\\\"pause\\\"]','[data-replay-speed]','[data-replay-seek]','[data-replay-action=\\\"exit\\\"]']; const nodes=selectors.map(selector=>controls.querySelector(selector)); CampaignReplayController.setSpeed(8); CampaignReplayController.setAutoSkip(true); CampaignReplayController.renderControls(); return nodes.every((node,index)=>node?.isConnected&&node===controls.querySelector(selectors[index])); })()",
            "Campaign replay control nodes were replaced during a playback update",
        )
        check(
            "(() => { const controls=document.querySelector('.campaign-replay-controls'); const more=controls?.querySelector('[data-replay-action=\\\"toggle-more\\\"]'); const advanced=controls?.querySelector('[data-replay-advanced]'); const next=controls?.querySelector('[data-replay-action=\\\"next-event\\\"]'); if(!more||!advanced||!next||!advanced.hidden) return false; const original=more.textContent; more.click(); const opened=!advanced.hidden&&more.getAttribute('aria-expanded')==='true'; more.click(); return opened&&advanced.hidden&&more.textContent===original&&next.isConnected; })()",
            "Campaign replay More and Next Event controls did not keep a compact stable DOM",
        )
        devtools.call("Emulation.setDeviceMetricsOverride", {
            "width": 1366, "height": 768, "deviceScaleFactor": 1, "mobile": False,
        })
        check(
            "(() => { const game=document.querySelector('.game-viewport')?.getBoundingClientRect(); const controls=document.querySelector('.campaign-replay-controls')?.getBoundingClientRect(); const tools=document.querySelector('.simulation-tools')?.getBoundingClientRect(); return game&&controls&&tools&&game.width<=620.5&&game.height<=700&&controls.width<=650.5&&controls.right<=tools.left; })()",
            "Desktop campaign replay layout did not reserve a readable game column beside the simulation panel",
        )
        devtools.call("Emulation.setDeviceMetricsOverride", {
            "width": 390, "height": 844, "deviceScaleFactor": 1, "mobile": True,
        })
        check(
            "(() => { const controls=document.querySelector('.campaign-replay-controls'); const rect=controls?.getBoundingClientRect(); const advanced=controls?.querySelector('[data-replay-advanced]'); const timeline=controls?.querySelector('.campaign-replay-timeline'); return rect&&rect.height<=62&&getComputedStyle(controls).maxHeight==='60px'&&advanced?.hidden&&getComputedStyle(timeline).display==='none'; })()",
            "Mobile campaign replay controls did not collapse into a compact touch overlay",
        )
        devtools.call("Emulation.clearDeviceMetricsOverride")
        check(
            "(() => { CampaignReplayController.pause(); return CampaignReplayController.state().status==='paused'&&!CampaignReplayController.state().playing; })()",
            "Campaign replay did not pause while active",
        )
        check(
            "(() => { CampaignReplayController.play(); CampaignReplayController.setSpeed(4); return CampaignReplayController.state().status==='playing'&&CampaignReplayController.state().speed===4; })()",
            "Campaign replay speed could not change while playing",
        )
        check(
            "CampaignReplayController.skipTo('purchase').then(() => { const state=CampaignReplayController.state(); return state.lastTownAction?.type==='buy-item'&&document.body.textContent.includes('Bought'); })",
            "Recorded town purchases were not visibly replayed",
        )
        check(
            "CampaignReplayController.skipTo('expedition').then(() => { const state=CampaignReplayController.state(); return state.expeditionReplayActive&&game.screen==='expedition'&&state.expeditionIndex===0&&ReplayController.isActive(); })",
            "Town preparation did not transition into expedition one",
        )
        check(
            "CampaignReplayController.skipTo('return').then(() => { const state=CampaignReplayController.state(); return state.mode==='return'&&game.screen==='summary'&&!state.expeditionReplayActive; })",
            "Expedition one did not transition through the normal return summary",
        )
        check(
            "CampaignReplayController.skipTo('town').then(() => { const state=CampaignReplayController.state(); return state.expeditionIndex===1&&state.mode==='town'&&game.screen==='location'; })",
            "Campaign replay did not transition from expedition one return into town two",
        )
        check(
            "CampaignReplayController.skipTo('end').then(() => { const state=CampaignReplayController.state(); return state.status==='completed'&&state.error===null&&game.screen==='location'&&state.player.currentGold===state.data.endingState.gold; })",
            "Full campaign replay did not complete or match ending gold",
        )
        check(
            "(async () => { const final=JSON.stringify({player:CampaignReplayController.state().player,stocks:CampaignReplayController.state().shopStocks}); CampaignReplayController.restart(); await CampaignReplayController.skipTo('end'); const state=CampaignReplayController.state(); return state.status==='completed'&&JSON.stringify({player:state.player,stocks:state.shopStocks})===final; })()",
            "Campaign replay restart did not reproduce the same final state",
        )
        check(
            "(async () => { const state=CampaignReplayController.state(); const target=state.data.timeline.find(segment=>segment.label==='Expedition 2')?.actionIndex||0; await CampaignReplayController.seek(target); return state.expeditionIndex===1||state.status==='completed'; })()",
            "Campaign replay seek did not reach the later expedition",
        )
        check(
            "(async () => { const state=CampaignReplayController.state(); const bad=JSON.parse(JSON.stringify(state.data)); const action=bad.townActions.find(entry=>entry.type==='buy-item'); if(!action) return false; action.quantity=999; CampaignReplayController.exit(); CampaignReplayController.start(bad); await CampaignReplayController.skipTo('end'); const current=CampaignReplayController.state(); const error=current.error; return Boolean(current.status==='desync'&&error?.expeditionNumber&&error?.expectedAction?.quantity===999&&error?.currentReplayState?.player); })()",
            "Invalid town action did not produce a useful campaign desync",
        )
        check(
            "(() => { const before=JSON.stringify(SaveSystem.load()); CampaignReplayController.exit(); return !CampaignReplayController.isActive()&&!document.querySelector('.campaign-replay-controls')&&JSON.stringify(SaveSystem.load())===before; })()",
            "Exiting campaign replay did not restore save isolation and UI",
        )
        check(
            "(() => { const player=SaveSystem.createDefaultPlayerState(); player.selectedCompanions=[]; player.selectedCompanion=null; player.ownedItems.rope=1; player.ownedItems.torch=1; player.materials.raw_meat=1; player.packedItems=['rope','torch']; player.packedMaterials={raw_meat:1}; const expedition=ExpeditionRules.startExpedition(player,{companions:[],provisions:1,packedItems:['rope','torch'],packedMaterials:{raw_meat:1}}); const itemConsumed=ExpeditionRules.consumeCarriedItem(expedition,'torch',1); const materialConsumed=MaterialRules.consumeFromExpedition(player,expedition,'raw_meat',1); ExpeditionRules.settle(player,expedition,true); return itemConsumed&&materialConsumed.applied&&!player.ownedItems.torch&&player.ownedItems.rope===1&&player.packedItems.length===1&&player.packedItems[0]==='rope'&&!player.packedMaterials.raw_meat; })()",
            "Expedition settlement did not remove consumed items and materials from the persistent packed state",
        )
        check(
            "(() => { const player=SaveSystem.createDefaultPlayerState(); player.packedItems=['wayfarers_cloak']; player.packedMaterials={raw_meat:1}; player.ownedItems.rope=0; player.materials.raw_meat=0; const before=JSON.stringify({items:player.packedItems,materials:player.packedMaterials}); const result=applyReplayPack(player,['rope'],{raw_meat:1}); return !result.applied&&result.reason.includes('rope')&&JSON.stringify({items:player.packedItems,materials:player.packedMaterials})===before; })()",
            "Failed replay pack validation partially mutated the previous loadout",
        )
        check(
            "(() => { const campaign=CampaignSimulationRunner.run({id:'campaign-40',seed:'campaign-40',expeditions:40,strategy:'aggressive',betweenExpeditionPolicy:'aggressive-reinvestor',turnaroundDistance:40,startingState:{currentGold:2000,provisions:100,materials:{raw_meat:1,cloth:1}}}); const data=CampaignReplayData.normalize(campaign); const entry=data.expeditions[2]; const pack=data.towns[2].preparation.find(action=>action.type==='pack-loadout'); const itemInvariant=entry.stateBefore.packedItems.every(itemId=>Number(entry.stateBefore.ownedItems[itemId])>0); const materialInvariant=Object.entries(entry.stateBefore.packedMaterials).every(([materialId,quantity])=>Number(entry.stateBefore.materials[materialId]||0)>=Number(quantity)); const packInvariant=pack?.packedItems?.every(itemId=>Number(entry.stateBefore.ownedItems[itemId])>0)&&Object.entries(pack?.packedMaterials||{}).every(([materialId,quantity])=>Number(entry.stateBefore.materials[materialId]||0)>=Number(quantity)); return campaign.expeditions.length===40&&packInvariant&&itemInvariant&&materialInvariant; })()",
            "Campaign 40 did not record a valid Expedition 3 loadout and checkpoint",
        )
        check(
            "(async () => { const campaign=CampaignSimulationRunner.run({id:'campaign-40',seed:'campaign-40',expeditions:40,strategy:'aggressive',betweenExpeditionPolicy:'aggressive-reinvestor',turnaroundDistance:40,startingState:{currentGold:2000,provisions:100,materials:{raw_meat:1,cloth:1}}}); const data=CampaignReplayData.normalize(campaign); CampaignReplayController.start(data); await CampaignReplayController.skipTo('expedition'); await CampaignReplayController.skipTo('return'); await CampaignReplayController.skipTo('town'); await CampaignReplayController.skipTo('expedition'); await CampaignReplayController.skipTo('return'); await CampaignReplayController.skipTo('town'); const before=CampaignReplayController.state(); const beforeIndex=before.expeditionIndex; const reached=await CampaignReplayController.skipTo('expedition'); const atExp3=CampaignReplayController.state(); const atExp3Snapshot={index:atExp3.expeditionIndex,active:atExp3.expeditionReplayActive,status:atExp3.status,error:atExp3.error}; const pack=data.towns[2].preparation.find(action=>action.type==='pack-loadout'); const packValid=atExp3.player.packedItems.every(itemId=>Number(atExp3.player.ownedItems[itemId])>0)&&Object.entries(atExp3.player.packedMaterials).every(([materialId,quantity])=>Number(atExp3.player.materials[materialId]||0)>=Number(quantity)); const packRecorded=pack?.packedItems?.length>0&&pack?.packedItems?.every(itemId=>Number(data.expeditions[2].stateBefore.ownedItems[itemId])>0); const beyond76Result=await CampaignReplayController.seek(77); const beyond76=CampaignReplayController.state(); const beyond76Index=CampaignReplayController.currentActionIndex(); const laterTarget=Math.min(180,data.totalActionCount-1); const seekResult=await CampaignReplayController.seek(laterTarget); const sought=CampaignReplayController.state(); const soughtIndex=CampaignReplayController.currentActionIndex(); CampaignReplayController.exit(); return reached&&beforeIndex===2&&atExp3Snapshot.index===2&&atExp3Snapshot.active&&atExp3Snapshot.status==='paused'&&atExp3Snapshot.error===null&&packRecorded&&packValid&&beyond76Result&&beyond76.error===null&&beyond76Index>=77&&seekResult&&sought.error===null&&soughtIndex>=laterTarget; })()",
            "Campaign 40 did not reach Expedition 3, continue beyond action 76, or seek later without desync",
        )
        check(
            "(() => { const old=JSON.parse(JSON.stringify(CampaignSimulationRunner.run({seed:'legacy-replay-shape',expeditions:1,expeditionPlan:[100],healingEnabled:false,autoSellRecoveredLoot:false,startingState:{currentGold:0,provisions:2,materials:{raw_meat:1,mushrooms:1,fresh_herbs:1},selectedCompanions:[],selectedCompanion:null}}))); old.replay.version=1; old.replay.townActions?.filter(action=>action.type==='cook-recipe').forEach(action=>{ delete action.context; delete action.expeditionNumber; }); const data=CampaignReplayData.normalize(old); const cook=data.townActions.find(action=>action.type==='cook-recipe'); return data.legacy&&cook?.context==='inn'&&cook?.expeditionNumber===1; })()",
            "Older campaign payloads were not marked and reconstructed safely",
        )
        check(
            "(() => { const old=JSON.parse(JSON.stringify(CampaignSimulationRunner.run({seed:'legacy-aggregate-shape',expeditions:1,turnaroundDistance:5}))); delete old.replay.townActions; delete old.replay.expeditions; old.replay.version=1; const data=CampaignReplayData.normalize(old); return data.legacy&&data.unsupported.length>0&&data.townActions.some(action=>action.legacyReconstructed); })()",
            "Aggregate legacy campaign telemetry was not reconstructed",
        )
        check(
            "(async () => { const campaign=CampaignSimulationRunner.run({seed:'long-campaign-seek-yield',expeditions:50,turnaroundDistance:1,healingEnabled:false,autoSellRecoveredLoot:false,startingState:{currentGold:100000,provisions:1000,selectedCompanions:[],selectedCompanion:null}}); const data=CampaignReplayData.normalize(campaign); CampaignReplayController.start(data); const state=CampaignReplayController.state(); if(data.totalActionCount<=120) return false; const yieldsBefore=state.fastForwardYields; let timerFired=false; setTimeout(()=>{ timerFired=true; },0); const result=await CampaignReplayController.seek(data.totalActionCount); return result&&timerFired&&state.fastForwardYields>yieldsBefore&&(state.status==='paused'||state.status==='completed')&&state.error===null; })()",
            "Long campaign seek did not yield to the browser event loop",
        )
        check(
            "(() => { const state=CampaignReplayController.state(); const controls=document.querySelector('.campaign-replay-controls'); const exit=controls?.querySelector('[data-replay-action=\"exit\"]'); CampaignReplayController.exit(); return !CampaignReplayController.isActive()&&!exit?.isConnected; })()",
            "Exit Replay did not remain available after asynchronous fast-forward",
        )

        if devtools.console_errors:
            raise AssertionError(f"Browser reported campaign replay errors: {devtools.console_errors}")
        print(f"PASS: {checks} campaign replay assertions")
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
