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
            f"(() => {{ const campaign=CampaignSimulationRunner.run({scenario}); const before=JSON.stringify({{player:game.player,save:SaveSystem.load()}}); CampaignReplayController.start(campaign); const state=CampaignReplayController.state(); return state.status==='playing'&&state.realGameState.player!==game.player&&state.data.expeditions.length===2&&JSON.stringify(SaveSystem.load())===JSON.stringify(JSON.parse(before).save); }})()",
            "Campaign replay did not start in an isolated sandbox",
        )
        check(
            "Boolean(document.querySelector('.campaign-replay-controls')?.textContent.includes('Next Town')&&document.querySelector('.campaign-replay-controls')?.textContent.includes('Next Expedition')&&document.querySelector('.campaign-replay-timeline'))",
            "Campaign-specific controls and timeline were not rendered",
        )
        check(
            "(() => { const state=CampaignReplayController.state(); CampaignReplayController.skipTo('purchase'); return state.lastTownAction?.type==='buy-item'&&document.body.textContent.includes('Bought'); })()",
            "Recorded town purchases were not visibly replayed",
        )
        check(
            "(() => { const state=CampaignReplayController.state(); CampaignReplayController.skipTo('expedition'); return state.expeditionReplayActive&&game.screen==='expedition'&&state.expeditionIndex===0&&ReplayController.isActive(); })()",
            "Town preparation did not transition into expedition one",
        )
        check(
            "(() => { const state=CampaignReplayController.state(); CampaignReplayController.skipTo('return'); return state.mode==='return'&&game.screen==='summary'&&!state.expeditionReplayActive; })()",
            "Expedition one did not transition through the normal return summary",
        )
        check(
            "(() => { const state=CampaignReplayController.state(); CampaignReplayController.skipTo('town'); return state.expeditionIndex===1&&state.mode==='town'&&game.screen==='location'; })()",
            "Campaign replay did not transition from expedition one return into town two",
        )
        check(
            "(() => { const state=CampaignReplayController.state(); CampaignReplayController.skipTo('end'); return state.status==='completed'&&state.error===null&&game.screen==='location'&&state.player.currentGold===state.data.endingState.gold; })()",
            "Full campaign replay did not complete or match ending gold",
        )
        check(
            "(() => { const final=JSON.stringify({player:CampaignReplayController.state().player,stocks:CampaignReplayController.state().shopStocks}); CampaignReplayController.restart(); CampaignReplayController.skipTo('end'); const state=CampaignReplayController.state(); return state.status==='completed'&&JSON.stringify({player:state.player,stocks:state.shopStocks})===final; })()",
            "Campaign replay restart did not reproduce the same final state",
        )
        check(
            "(() => { const state=CampaignReplayController.state(); const target=state.data.timeline.find(segment=>segment.label==='Expedition 2')?.actionIndex||0; CampaignReplayController.seek(target); return state.expeditionIndex===1||state.status==='completed'; })()",
            "Campaign replay seek did not reach the later expedition",
        )
        check(
            "(() => { const state=CampaignReplayController.state(); const bad=JSON.parse(JSON.stringify(state.data)); const action=bad.townActions.find(entry=>entry.type==='buy-item'); if(!action) return false; action.quantity=999; CampaignReplayController.exit(); CampaignReplayController.start(bad); CampaignReplayController.skipTo('end'); const current=CampaignReplayController.state(); const error=current.error; return Boolean(current.status==='desync'&&error?.expeditionNumber&&error?.expectedAction?.quantity===999&&error?.currentReplayState?.player); })()",
            "Invalid town action did not produce a useful campaign desync",
        )
        check(
            "(() => { const before=JSON.stringify(SaveSystem.load()); CampaignReplayController.exit(); return !CampaignReplayController.isActive()&&!document.querySelector('.campaign-replay-controls')&&JSON.stringify(SaveSystem.load())===before; })()",
            "Exiting campaign replay did not restore save isolation and UI",
        )
        check(
            "(() => { const old=JSON.parse(JSON.stringify(CampaignSimulationRunner.run({seed:'legacy-replay-shape',expeditions:1,turnaroundDistance:5}))); delete old.replay.townActions; delete old.replay.expeditions; old.replay.version=1; const data=CampaignReplayData.normalize(old); return data.legacy&&data.unsupported.length>0&&data.townActions.some(action=>action.legacyReconstructed); })()",
            "Older campaign payloads were not marked and reconstructed safely",
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
