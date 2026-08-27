"""Focused generic reactive equipment regressions."""

from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
import threading
import time
from http.server import ThreadingHTTPServer
from pathlib import Path

from location_system_test import CHROME, DevTools, QuietHandler, ROOT, free_port, wait_for_json


def run() -> None:
    if not CHROME.exists():
        raise RuntimeError(f"Chrome not found at {CHROME}")

    os.chdir(ROOT)
    http_port = free_port()
    debug_port = free_port()
    server = ThreadingHTTPServer(("127.0.0.1", http_port), QuietHandler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    profile = Path(tempfile.mkdtemp(prefix="grail-reactive-equipment-test-"))
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
            result = devtools.evaluate(expression)
            if not result:
                raise AssertionError(label)
            checks += 1

        check(
            """(() => { const p=SaveSystem.createDefaultPlayerState(); p.selectedCompanions=[]; const e=ExpeditionRules.createExpedition(p,{companions:[],provisions:5}); const c=CombatSystem.create(e,'wild_boar',{random:()=>0}); const wearer=c.allies[0],attacker=c.enemies[0]; wearer.equippedPassives=[{id:'equipment:test_status:trigger:0',sourceItemId:'test_status',equipmentSlot:'shield',equipmentTrigger:true,trigger:{event:'damageTaken'},effects:[{type:'applyStatus',target:'eventSource',statusId:'poisoned',chance:1}]}]; CombatEffectResolver.resolve(c,{sourceCombatant:attacker,targetCombatant:wearer},[{type:'dealDamage',amount:3}]); const event=c.events.find(entry=>entry.type==='equipment-trigger'&&entry.effect==='applyStatus'); return attacker.statuses.poisoned?.remainingActivations===4&&event?.target===attacker.id&&event?.eventSource===attacker.id&&event?.eventTarget===wearer.id; })()""",
            "eventSource did not resolve to the original attacker for a reactive status",
        )
        check(
            """(() => { const make=(roll)=>{ const p=SaveSystem.createDefaultPlayerState(); p.selectedCompanions=[]; const e=ExpeditionRules.createExpedition(p,{companions:[],provisions:5}); const c=CombatSystem.create(e,'wild_boar',{random:()=>0}); const wearer=c.allies[0],attacker=c.enemies[0]; wearer.equippedPassives=[{id:'equipment:test_chance:trigger:0',sourceItemId:'test_chance',equipmentSlot:'shield',equipmentTrigger:true,trigger:{event:'damageTaken'},effects:[{type:'applyStatus',target:'eventSource',statusId:'poisoned',chance:0.25}]}]; c.random=()=>roll; CombatEffectResolver.resolve(c,{sourceCombatant:attacker,targetCombatant:wearer},[{type:'dealDamage',amount:1}]); return c; }; const failed=make(0.5),passed=make(0); const failEvents=failed.events.filter(entry=>entry.type==='equipment-trigger'&&entry.effect==='applyStatus'); const passEvents=passed.events.filter(entry=>entry.type==='equipment-trigger'&&entry.effect==='applyStatus'); return !failed.enemies[0].statuses.poisoned&&passed.enemies[0].statuses.poisoned?.remainingActivations===4&&failEvents.at(-1)?.applied===false&&passEvents.at(-1)?.applied===true; })()""",
            "reactive status chance did not fail and succeed deterministically",
        )
        check(
            """(() => { const p=SaveSystem.createDefaultPlayerState(); p.selectedCompanions=[]; const e=ExpeditionRules.createExpedition(p,{companions:[],provisions:5}); const c=CombatSystem.create(e,'wild_boar',{random:()=>0}); const wearer=c.allies[0],attacker=c.enemies[0]; wearer.equippedPassives=[{id:'equipment:test_reflect:trigger:0',sourceItemId:'test_reflect',equipmentSlot:'shield',equipmentTrigger:true,trigger:{event:'damageTaken'},effects:[{type:'dealDamage',target:'eventSource',amount:2}]}]; const before=attacker.hp; CombatEffectResolver.resolve(c,{sourceCombatant:attacker,targetCombatant:wearer},[{type:'dealDamage',amount:3}]); return attacker.hp===before-2&&c.events.some(entry=>entry.type==='equipment-trigger'&&entry.effect==='dealDamage'&&entry.target===attacker.id&&entry.sourceItemId==='test_reflect')&&!c.events.some(entry=>entry.type==='combat-event-limit'); })()""",
            "reactive flat damage did not reflect or terminate safely",
        )
        check(
            """(() => { const p=SaveSystem.createDefaultPlayerState(); p.selectedCompanions=[]; const e=ExpeditionRules.createExpedition(p,{companions:[],provisions:5}); const c=CombatSystem.create(e,'wild_boar',{random:()=>0}); const wearer=c.allies[0],attacker=c.enemies[0]; const reflect=(id,slot)=>({id,sourceItemId:id,equipmentSlot:slot,equipmentTrigger:true,trigger:{event:'damageTaken'},effects:[{type:'dealDamage',target:'eventSource',amount:2}]}); wearer.equippedPassives=[reflect('test_ally_reflect','shield')]; attacker.equippedPassives=[reflect('test_enemy_reflect','weapon')]; const beforeAttacker=attacker.hp; const beforeWearer=wearer.hp; CombatEffectResolver.resolve(c,{sourceCombatant:attacker,targetCombatant:wearer},[{type:'dealDamage',amount:3}]); return attacker.hp===beforeAttacker-2&&wearer.hp===beforeWearer-3&&c.events.filter(entry=>entry.type==='equipment-trigger'&&entry.effect==='dealDamage').length===1&&!c.events.some(entry=>entry.type==='combat-event-limit'); })()""",
            "two reflective combatants recursed instead of resolving once",
        )
        check(
            """(() => { const make=(roll)=>{ const p=SaveSystem.createDefaultPlayerState(); p.selectedCompanions=[]; const e=ExpeditionRules.createExpedition(p,{companions:[],provisions:5}); const c=CombatSystem.create(e,'wild_boar',{random:()=>0}); const wearer=c.allies[0],attacker=c.enemies[0]; wearer.equippedPassives=[{id:'equipment:test_gauge:trigger:0',sourceItemId:'test_gauge',equipmentSlot:'shield',equipmentTrigger:true,trigger:{event:'damageTaken'},effects:[{type:'randomChance',chance:0.3,effects:[{type:'modifyGauge',target:'eventSource',amount:-15}]}]}]; attacker.gauge=10; c.random=()=>roll; CombatEffectResolver.resolve(c,{sourceCombatant:attacker,targetCombatant:wearer},[{type:'dealDamage',amount:1}]); return c; }; const passed=make(0.2),failed=make(0.5); return passed.enemies[0].gauge===0&&failed.enemies[0].gauge===10&&passed.events.some(entry=>entry.type==='equipment-trigger'&&entry.effect==='randomChance'&&entry.passed===true)&&passed.events.some(entry=>entry.type==='equipment-trigger'&&entry.effect==='modifyGauge'&&entry.target==='wild_boar_1'); })()""",
            "reactive random gauge push was not deterministic or clamped",
        )
        check(
            """(() => { const p=SaveSystem.createDefaultPlayerState(); p.selectedCompanions=[]; const e=ExpeditionRules.createExpedition(p,{companions:[],provisions:5}); const c=CombatSystem.create(e,'wild_boar',{random:()=>0}); const wearer=c.allies[0],attacker=c.enemies[0]; wearer.equippedPassives=[{id:'equipment:test_once:trigger:0',sourceItemId:'test_once',equipmentSlot:'shield',equipmentTrigger:true,trigger:{event:'damageTaken',oncePerCombat:true},effects:[{type:'modifyGauge',target:'eventSource',amount:-4}]}]; attacker.gauge=10; CombatEffectResolver.resolve(c,{sourceCombatant:attacker,targetCombatant:wearer},[{type:'dealDamage',amount:1}]); CombatEffectResolver.resolve(c,{sourceCombatant:attacker,targetCombatant:wearer},[{type:'dealDamage',amount:1}]); return attacker.gauge===6&&c.events.filter(entry=>entry.type==='passive-trigger'&&entry.sourcePassiveId==='equipment:test_once:trigger:0').length===1; })()""",
            "oncePerCombat was not preserved for a generic equipment trigger",
        )
        check(
            """(() => { const p=SaveSystem.createDefaultPlayerState(); p.selectedCompanions=[]; const e=ExpeditionRules.createExpedition(p,{companions:[],provisions:5}); const c=CombatSystem.create(e,'wild_boar',{random:()=>0}); const wearer=c.allies[0],attacker=c.enemies[0]; wearer.equippedPassives=['weapon','shield','armor','relic'].map((slot,index)=>({id:`equipment:test_${slot}:trigger:0`,sourceItemId:`test_${slot}`,equipmentSlot:slot,equipmentTrigger:true,trigger:{event:'damageTaken'},effects:[{type:'modifyGauge',target:'eventSource',amount:-1}]})); attacker.gauge=5; CombatEffectResolver.resolve(c,{sourceCombatant:attacker,targetCombatant:wearer},[{type:'dealDamage',amount:1}]); return attacker.gauge===1&&['weapon','shield','armor','relic'].every(slot=>c.events.some(entry=>entry.type==='equipment-trigger'&&entry.effect==='modifyGauge'&&entry.equipmentSlot===slot)); })()""",
            "generic reactive triggers did not work across all equipment slots",
        )
        check(
            """(() => { const p=SaveSystem.createDefaultPlayerState(); p.selectedCompanions=[]; const e=ExpeditionRules.createExpedition(p,{companions:[],provisions:5}); const c=CombatSystem.create(e,'wild_boar',{random:()=>0}); const wearer=c.allies[0],attacker=c.enemies[0]; wearer.statuses={poisoned:{statusId:'poisoned',remainingActivations:4}}; wearer.equippedPassives=[{id:'equipment:test_indirect:trigger:0',sourceItemId:'test_indirect',equipmentSlot:'shield',equipmentTrigger:true,trigger:{event:'damageTaken'},effects:[{type:'dealDamage',target:'eventSource',amount:2}]}]; const beforeEnemy=attacker.hp; const beforeWearer=wearer.hp; CombatEventSystem.dispatchStatusTriggers(c,wearer,'turnStart'); return wearer.hp===beforeWearer-2&&attacker.hp===beforeEnemy&&!c.events.some(entry=>entry.type==='combat-event-limit')&&wearer.statuses.poisoned.remainingActivations===3; })()""",
            "indirect status damage incorrectly entered the reflection loop",
        )
    finally:
        try:
            chrome.terminate()
            chrome.wait(timeout=5)
        except subprocess.TimeoutExpired:
            chrome.kill()
            chrome.wait(timeout=5)
        server.shutdown()
        server.server_close()
        shutil.rmtree(profile, ignore_errors=True)

    print(f"Reactive equipment suite passed {checks} assertions.")


if __name__ == "__main__":
    run()
