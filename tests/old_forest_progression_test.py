"""Focused browser regressions for the Pass 1 Old Forest Road overhaul."""

from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
import threading
import time
from http.server import ThreadingHTTPServer
from pathlib import Path

from location_system_test import CHROME, DevTools, QuietHandler, free_port, wait_for_json


ROOT = Path(__file__).resolve().parents[1]


def run() -> None:
    if not CHROME.exists():
        raise RuntimeError(f"Chrome not found at {CHROME}")
    os.chdir(ROOT)
    http_port = free_port()
    debug_port = free_port()
    server = ThreadingHTTPServer(("127.0.0.1", http_port), QuietHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    profile = Path(tempfile.mkdtemp(prefix="grail-old-forest-test-"))
    chrome = subprocess.Popen([
        str(CHROME), "--headless=new", "--disable-gpu", "--no-sandbox",
        "--remote-allow-origins=*", f"--remote-debugging-port={debug_port}",
        f"--user-data-dir={profile}", f"http://127.0.0.1:{http_port}/",
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    checks = 0
    try:
        devtools = DevTools(wait_for_json(debug_port, f"http://127.0.0.1:{http_port}/"))
        devtools.call("Runtime.enable")
        time.sleep(0.3)

        def check(expression: str, label: str) -> None:
            nonlocal checks
            if not devtools.evaluate(expression):
                raise AssertionError(label)
            checks += 1

        check(
            "EXPEDITION_DEFINITIONS.old_forest_road.minimumObjectiveDistance >= 180"
            " && [120,160,200].every(distance => EXPEDITION_RETURN_REWARD_TIERS.some(tier => tier.minimumDistance === distance))",
            "Old Forest did not expose the extended objective and late return reward tiers",
        )
        check(
            "ITEM_DEFINITIONS.old_foresters_map && SHOP_DEFINITIONS.village_general_goods.itemsForSale.old_foresters_map.price === 25"
            " && LOCATION_DEFINITIONS.hidden_forest_village && SHOP_DEFINITIONS.forest_village_provisions.provisionsForSale.price === 2",
            "The map or hidden-village services were not authored in the data model",
        )
        check(
            "(() => { const p=SaveSystem.createDefaultPlayerState(); p.campaignFlags.broceliande_intro_complete=true; p.ownedItems.old_foresters_map=1; p.packedItems=['old_foresters_map']; const e=ExpeditionRules.createExpedition(p,{expeditionId:'old_forest_road',provisions:30,packedItems:['old_foresters_map'],random:()=>0}); e.travelState='traveling'; e.distance=20; ExpeditionRules.changePath(e,'overgrown_trail'); const entered=e.pathRoute?.entryDistance===20&&e.currentPathId==='overgrown_trail'; e.distance=79; ExpeditionRules.travel(e,p,2); const rejoined=e.currentPathId==='old_forest_road'&&!e.pathRoute; e.direction='returning'; e.distance=40; ExpeditionRules.changePath(e,'overgrown_trail'); ExpeditionRules.travel(e,p,40); return entered&&rejoined&&e.currentPathId==='old_forest_road'&&e.distance===0; })()",
            "Overgrown Trail did not enter, rejoin, and return along a bounded route",
        )
        check(
            "(() => { const p=SaveSystem.createDefaultPlayerState(); const e=ExpeditionRules.createExpedition(p,{expeditionId:'old_forest_road',provisions:30,random:()=>0}); e.direction='outbound'; e.distance=96; const village=EncounterManager.eligibleDefinitions(e,p).find(entry=>entry.id==='hidden_forest_village'); return Boolean(village)&&village.milestone===true; })()",
            "The hidden village turnoff was not guaranteed at the deep Main Road distance",
        )
        check(
            "(() => { const p=SaveSystem.createDefaultPlayerState(); const e=ExpeditionRules.createExpedition(p,{expeditionId:'old_forest_road',provisions:30,random:()=>0}); EncounterManager.force(e,'hidden_forest_village'); const result=EncounterManager.resolveChoice(e,p,'enter_village'); const staged=e.pendingCampaignFlags.forest_village_discovered===true&&result.locationStop?.locationId==='hidden_forest_village'; EncounterManager.continueJourney(e); ExpeditionRules.settle(p,e,true); return staged&&p.campaignFlags.forest_village_discovered===true&&LOCATION_DEFINITIONS.hidden_forest_village.destinations.length===3; })()",
            "Hidden-village discovery did not stage and persist across a safe return",
        )
        check(
            "(() => { const p=SaveSystem.createDefaultPlayerState(); const e=ExpeditionRules.createExpedition(p,{expeditionId:'old_forest_road',provisions:30,random:()=>0}); game.player=p; game.expedition=e; enterExpeditionLocation(e,'hidden_forest_village'); const visible=game.screen==='location'&&document.querySelectorAll('.hub-hotspot').length===3&&document.querySelector('[data-action=leave-expedition-location]'); leaveExpeditionLocation(); return Boolean(visible)&&game.screen==='expedition'&&game.locationContext===null&&e.travelState==='paused'; })()",
            "The hidden village did not use the full-screen location stop and return flow",
        )
        check(
            "(() => { const p=SaveSystem.createDefaultPlayerState(); p.learnedKnowledge=['song_of_the_forest']; p.ownedItems.enchanted_verdant_heart=1; const e=ExpeditionRules.createExpedition(p,{expeditionId:'old_forest_road',provisions:30,packedItems:['enchanted_verdant_heart'],random:()=>0}); e.distance=180; EncounterManager.force(e,'verdant_altar'); const started=EncounterManager.resolveChoice(e,p,'sing_at_altar',{startCombat:()=>true}); const finished=EncounterManager.completeCombat(e,p,'victory'); const staged=e.unsecuredLoot.some(entry=>entry.itemId==='flask')&&e.pendingCampaignFlags.verdant_warden_defeated===true; ExpeditionRules.settle(p,e,true); return started.combatStarted&&finished.awaitingContinue&&staged&&p.ownedItems.flask===1&&p.campaignFlags.verdant_warden_defeated===true; })()",
            "Verdant Warden victory did not award Flask and persist its scaffold flag",
        )
        check(
            "!JSON.stringify(ENCOUNTER_DEFINITIONS.hidden_flask).includes('itemId\\\":\\\"flask')"
            " && ENCOUNTER_DEFINITIONS.verdant_altar.requirements.some(requirement => requirement.type==='knowledge'&&requirement.knowledgeId==='song_of_the_forest')"
            " && ExpeditionCatalog.missingPrerequisites(SaveSystem.createDefaultPlayerState(),'fountain_of_barenton').includes('flask')",
            "Flask still had an ordinary Old Forest source or lost the visible route gate",
        )
        print(f"PASS: {checks} Old Forest progression assertions")
    finally:
        chrome.terminate()
        try:
            chrome.wait(timeout=3)
        except subprocess.TimeoutExpired:
            chrome.kill()
        server.shutdown()
        server.server_close()
        shutil.rmtree(profile, ignore_errors=True)


if __name__ == "__main__":
    run()
