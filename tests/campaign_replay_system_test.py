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
