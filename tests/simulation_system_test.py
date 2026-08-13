"""Focused deterministic expedition-simulation regression tests.

Uses the same dependency-light Chrome DevTools harness as the end-to-end suite.
"""

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
    if not CHROME.exists():
        raise RuntimeError(f"Chrome not found at {CHROME}")

    os.chdir(ROOT)
    http_port = free_port()
    debug_port = free_port()
    server = ThreadingHTTPServer(("127.0.0.1", http_port), QuietHandler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    profile = Path(tempfile.mkdtemp(prefix="grail-simulation-test-"))
    game_url = f"http://127.0.0.1:{http_port}/"
    chrome = subprocess.Popen([
        str(CHROME),
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--remote-allow-origins=*",
        f"--remote-debugging-port={debug_port}",
        f"--user-data-dir={profile}",
        game_url,
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    checks = 0
    try:
        devtools = DevTools(wait_for_json(debug_port, game_url))
        devtools.call("Runtime.enable")
        time.sleep(0.3)

        def check(expression: str, label: str):
            nonlocal checks
            if not devtools.evaluate(expression):
                raise AssertionError(label)
            checks += 1

        scenario = json.dumps({
            "id": "determinism-regression",
            "seed": "known-seed-2026-08-12",
            "strategy": "random",
            "provisions": 24,
            "regionId": "broceliande",
            "pathId": "old_forest_road",
            "turnaroundPolicy": {"type": "fixedDistance", "distance": 100},
        })

        check(
            f"SimulationRunner.verifyDeterminism({scenario}).matches",
            "Same-seed verification reported a deterministic mismatch",
        )
        check(
            f"(() => {{ const result=SimulationRunner.verifyDeterminism({scenario}); return result.firstMismatch===null && JSON.stringify(result.first)===JSON.stringify(result.second); }})()",
            "Normalized same-seed gameplay results differ",
        )
        check(
            f"(() => {{ const request={{scenarios:[{scenario}],runsPerScenario:8}}; const a=SimulationRunner.runBatch(request).results.map(SimulationTelemetry.normalizeRun); const b=SimulationRunner.runBatch(request).results.map(SimulationTelemetry.normalizeRun); return JSON.stringify(a)===JSON.stringify(b); }})()",
            "Known-seed batch results are not deterministic",
        )
        check(
            "(() => { const signatures=Array.from({length:16},(_,index)=>{ const run=SimulationRunner.run({seed:`different-${index}`,strategy:'random',turnaroundPolicy:{type:'fixedDistance',distance:100}}); return JSON.stringify({outcome:run.outcome,encounters:run.encounters,combats:run.combats,loot:run.lootDiscovered,health:run.finalPartyHealth,provisions:run.provisionsRemaining}); }); return new Set(signatures).size>1; })()",
            "A collection of different seeds did not produce divergent gameplay",
        )
        check(
            "(() => { const nativeRandom=Math.random; Math.random=()=>{ throw new Error('native Math.random reached'); }; try { const run=SimulationRunner.run({seed:'native-random-guard',strategy:'random',turnaroundPolicy:{type:'fixedDistance',distance:120}}); return ['returned','failed'].includes(run.outcome); } finally { Math.random=nativeRandom; } })()",
            "Seeded simulation called native Math.random",
        )
        check(
            f"(() => {{ const run=SimulationRunner.run({scenario}); return run.replay.seed===run.seed && run.replay.regionId==='broceliande' && run.replay.pathId==='old_forest_road' && run.replay.startingPlayerState.provisions===24 && JSON.stringify(run.replay.decisions)===JSON.stringify(run.decisions) && run.decisions.some(entry=>entry.type==='turnaround'); }})()",
            "Replay metadata is missing starting state, path, or decision history",
        )
        check(
            f"(() => {{ const run=SimulationRunner.run({scenario}); return Number.isFinite(run.provisionsConsumed) && Number.isFinite(run.provisionsGained) && run.encounters.every(entry=>entry.completed && Array.isArray(entry.lootGained) && Array.isArray(entry.lootLost) && Array.isArray(entry.packedItemsConsumed)) && run.combats.every(combat=>Number.isFinite(combat.damageDealt)&&Number.isFinite(combat.damageReceived)); }})()",
            "Production-state telemetry fields are incomplete or invalid",
        )
        check(
            "(() => { const seeded=GameRandom.create('direct-manager'); const player=SaveSystem.createDefaultPlayerState(); const expedition=ExpeditionRules.createExpedition(player,{provisions:24,random:seeded.random}); const nativeRandom=Math.random; Math.random=()=>{throw new Error('native Math.random reached encounter rules');}; try { for(let index=0;index<200&&!expedition.activeEncounter;index+=1) ExpeditionRules.travel(expedition,player,1); return Boolean(expedition.activeEncounter); } finally { Math.random=nativeRandom; } })()",
            "Seeded production encounter selection reached native Math.random",
        )
        check(
            "(() => { const player=SaveSystem.createDefaultPlayerState(); const itemBefore=player.ownedItems.old_coin??0; const goldBefore=player.currentGold; const expedition=ExpeditionRules.createExpedition(player,{provisions:5,random:GameRandom.create('settlement').random}); expedition.unsecuredLoot=[{itemId:'old_coin',quantity:1}]; expedition.goldCarried=3; ExpeditionRules.settle(player,expedition,true); ExpeditionRules.settle(player,expedition,true); return player.ownedItems.old_coin===itemBefore+1 && player.currentGold===goldBefore+3 && expedition.rewardsSettled; })()",
            "Shared settlement duplicated secured rewards",
        )
        check(
            "(() => { const player=SaveSystem.createDefaultPlayerState(); player.selectedCompanion=null; const expedition=ExpeditionRules.createExpedition(player,{companion:null,provisions:5,health:40}); const combat=CombatSystem.create(expedition,'wolves',{random:()=>0}); combat.status='awaitingAction'; combat.activeActorId='arthur'; combat.allies[0].gauge=100; const target=combat.enemies[0]; target.gauge=24; const menu=CombatSystem.chooseAction(combat,expedition,'abilities'); const ability=CombatSystem.availableAbilities(combat,expedition).find(entry=>entry.id==='pommel_strike'); const result=CombatSystem.chooseAbility(combat,expedition,'pommel_strike',target.id); const event=combat.events.at(-1); return menu.menu==='abilities' && ability?.effectType==='damageAndGauge' && result.resolved && target.gauge===0 && event?.abilityId==='pommel_strike' && event?.gaugeReduction===24; })()",
            "Equipped Pommel Strike did not open, resolve, or control the enemy gauge",
        )
        check(
            "(() => { const player=SaveSystem.createDefaultPlayerState(); player.selectedCompanion=null; player.equippedItems.weapon='fine_hunting_knife'; const expedition=ExpeditionRules.createExpedition(player,{companion:null,provisions:5,health:40}); const combat=CombatSystem.create(expedition,'wild_boar',{random:()=>0}); combat.status='awaitingAction'; combat.activeActorId='arthur'; combat.allies[0].gauge=100; const noGrant=CombatSystem.availableAbilities(combat,expedition).length===0; player.equippedItems.weapon='arthur_sword'; const withSword=CombatSystem.create(ExpeditionRules.createExpedition(player,{companion:null,provisions:5,health:40}),'wild_boar',{random:()=>0}); withSword.status='awaitingAction'; withSword.activeActorId='arthur'; withSword.allies[0].gauge=100; const opened=CombatSystem.chooseAction(withSword,withSword.expedition,'abilities'); const before=withSword.allies[0].gauge; const backed=CombatSystem.chooseAction(withSword,withSword.expedition,'back'); return noGrant && opened.menu==='abilities' && backed.menu==='main' && withSword.interactionMode==='main' && withSword.allies[0].gauge===before; })()",
            "Ability grants were not equipment-driven or Back from Abilities consumed the turn",
        )
        check(
            "(() => { const player=SaveSystem.createDefaultPlayerState(); player.selectedCompanion=null; player.ownedItems.bandages=2; const expedition=ExpeditionRules.createExpedition(player,{companion:null,provisions:5,health:20,packedItems:['bandages']}); const combat=CombatSystem.create(expedition,'wild_boar',{random:()=>0}); combat.status='awaitingAction'; combat.activeActorId='arthur'; combat.allies[0].gauge=100; const menu=CombatSystem.chooseAction(combat,expedition,'items'); const result=CombatSystem.chooseItem(combat,expedition,'bandages'); return menu.menu==='items' && result.resolved && combat.allies[0].hp===28 && expedition.carriedItems.bandages===1 && expedition.consumedItems.bandages===1 && combat.events.at(-1)?.healingAmount===8; })()",
            "Combat Bandages did not heal, consume, and record one carried item",
        )
        check(
            "(() => { const player=SaveSystem.createDefaultPlayerState(); player.selectedCompanion=null; player.ownedItems.bandages=2; const expedition=ExpeditionRules.createExpedition(player,{companion:null,provisions:5,health:20,packedItems:['bandages']}); const combat=CombatSystem.create(expedition,'wild_boar',{random:()=>0}); combat.status='awaitingAction'; combat.activeActorId='arthur'; combat.allies[0].gauge=100; const menu=CombatSystem.chooseAction(combat,expedition,'items'); const before=expedition.carriedItems.bandages; const backed=CombatSystem.chooseAction(combat,expedition,'back'); return menu.menu==='items' && backed.menu==='main' && expedition.carriedItems.bandages===before && !expedition.consumedItems.bandages; })()",
            "Opening and canceling the Items submenu consumed a Bandage",
        )
        check(
            "(() => { const player=SaveSystem.createDefaultPlayerState(); player.ownedItems.bandages=2; player.companionStates.sir_kay.health=40; const expedition=ExpeditionRules.createExpedition(player,{provisions:5,health:20,packedItems:['bandages']}); const combat=CombatSystem.create(expedition,'wild_boar',{random:()=>0}); combat.status='awaitingAction'; combat.activeActorId='arthur'; combat.allies[0].gauge=100; const menu=CombatSystem.chooseAction(combat,expedition,'items'); const pending=CombatSystem.chooseItem(combat,expedition,'bandages'); const paused=pending.needsTarget && combat.interactionMode==='allyTarget'; const result=CombatSystem.choosePendingTarget(combat,expedition,'sir_kay'); const kay=combat.allies.find(ally=>ally.id==='sir_kay'); return menu.menu==='items' && paused && result.resolved && kay.hp===48 && expedition.consumedItems.bandages===1; })()",
            "Combat item friendly target selection did not pause and heal the selected ally",
        )
        check(
            "(() => { const player=SaveSystem.createDefaultPlayerState(); const expedition=ExpeditionRules.createExpedition(player,{provisions:5,health:40}); const combat=CombatSystem.create(expedition,'wild_boar',{random:()=>0}); combat.status='awaitingAction'; combat.activeActorId='sir_kay'; const kay=combat.allies.find(ally=>ally.id==='sir_kay'); kay.gauge=100; const result=CombatSystem.chooseAction(combat,expedition,'intercede'); kay.gauge=100; CombatSystem.update(combat,expedition,0); const persisted=kay.interceding; kay.gauge=0; combat.status='running'; combat.enemies[0].gauge=100; CombatSystem.update(combat,expedition,0); const event=[...combat.events].reverse().find(entry=>entry.actor===combat.enemies[0].id); return result.resolved && persisted && !kay.interceding && event?.redirectedByIntercede===true && event.target==='sir_kay'; })()",
            "Intercede did not persist until the next applicable Arthur attack",
        )

        if devtools.console_errors:
            raise AssertionError(f"Runtime exceptions: {devtools.console_errors}")
        print(f"PASS: {checks} deterministic simulation assertions")
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
