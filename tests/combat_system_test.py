"""Tier 1 focused combat architecture tests.

These scenarios construct compact combat states directly and reuse one browser
session. They intentionally do not run campaigns or stochastic soak loops.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
import threading
import time
from http.server import ThreadingHTTPServer
from pathlib import Path

import sys

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))

from location_system_test import CHROME, DevTools, QuietHandler, ROOT, free_port, wait_for_json


def run() -> None:
    if not CHROME.exists():
        raise RuntimeError(f"Chrome not found at {CHROME}")
    os.chdir(ROOT)
    http_port = free_port()
    debug_port = free_port()
    server = ThreadingHTTPServer(("127.0.0.1", http_port), QuietHandler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    profile = Path(tempfile.mkdtemp(prefix="grail-combat-tier1-"))
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
            "COMBAT_ABILITY_DEFINITIONS.pommel_strike.kind==='active'&&Array.isArray(COMBAT_ABILITY_DEFINITIONS.pommel_strike.effects)&&COMBAT_ABILITY_DEFINITIONS.pommel_strike.effects.length===2",
            "Pommel Strike did not expose the shared active/effect schema",
        )
        check(
            "(() => { const p=SaveSystem.createDefaultPlayerState(); p.selectedCompanions=[]; const e=ExpeditionRules.createExpedition(p,{companions:[],provisions:5,random:()=>0}); const c=CombatSystem.create(e,'wild_boar',{random:()=>0}); const a=c.allies[0],t=c.enemies[0]; const result=CombatEffectResolver.resolve(c,{sourceCombatant:a,targetCombatant:t,damageRange:{minimum:1,maximum:1}},[{type:'dealDamage',amount:5}]); return result.damage===5&&t.hp===27; })()",
            "EffectResolver damage did not apply deterministically",
        )
        check(
            "(() => { const p=SaveSystem.createDefaultPlayerState(); p.selectedCompanions=[]; const e=ExpeditionRules.createExpedition(p,{companions:[],provisions:5,random:()=>0}); const c=CombatSystem.create(e,'wild_boar',{random:()=>0}); const a=c.allies[0],t=c.enemies[0]; t.defense=0; const result=CombatEffectResolver.resolve(c,{sourceCombatant:a,targetCombatant:t},[{type:'weaponDamage',multiplier:.6}]); return result.damage===4&&t.hp===28; })()",
            "Weapon damage multiplier did not use the shared resolver",
        )
        check(
            "(() => { const p=SaveSystem.createDefaultPlayerState(); p.selectedCompanions=[]; const e=ExpeditionRules.createExpedition(p,{companions:[],provisions:5,health:20,random:()=>0}); const c=CombatSystem.create(e,'wild_boar',{random:()=>0}); const a=c.allies[0]; a.hp=20; const healed=CombatEffectResolver.resolve(c,{sourceCombatant:a,targetCombatant:a},[{type:'heal',amount:8}]); a.gauge=80; const gauge=CombatEffectResolver.resolve(c,{sourceCombatant:a,targetCombatant:a},[{type:'modifyGauge',amount:-25}]); return healed.healingAmount===8&&a.hp===28&&gauge.gaugeReduction===25&&a.gauge===55; })()",
            "Healing or gauge modification did not use composable effects",
        )
        check(
            "(() => { const p=SaveSystem.createDefaultPlayerState(); p.selectedCompanions=[]; p.faith=5; const e=ExpeditionRules.createExpedition(p,{companions:[],provisions:5,random:()=>0}); const c=CombatSystem.create(e,'wild_boar',{random:()=>0}); c.status='awaitingAction'; c.activeActorId='arthur'; const def={id:'faith_fixture',name:'Faith Fixture',kind:'active',targetMode:'singleEnemy',effects:[{type:'dealDamage',amount:1}],cost:{resource:'faith',amount:2}}; const ok=CombatSystem.resolveDefinition(c,e,def,c.enemies[0].id); return ok.resolved&&p.faith===3; })()",
            "A sufficient Faith cost did not resolve and consume exactly once",
        )
        check(
            "(() => { const p=SaveSystem.createDefaultPlayerState(); p.selectedCompanions=[]; p.faith=1; const e=ExpeditionRules.createExpedition(p,{companions:[],provisions:5,random:()=>0}); const c=CombatSystem.create(e,'wild_boar',{random:()=>0}); c.status='awaitingAction'; c.activeActorId='arthur'; const def={id:'faith_fixture',name:'Faith Fixture',kind:'active',targetMode:'singleEnemy',effects:[{type:'dealDamage',amount:1}],cost:{resource:'faith',amount:2}}; const result=CombatSystem.resolveDefinition(c,e,def,c.enemies[0].id); return !result.resolved&&result.reason==='insufficient-resource'&&p.faith===1&&c.events.every(event=>event.abilityId!=='faith_fixture'); })()",
            "Insufficient Faith did not reject the action without spending resource",
        )
        check(
            "(() => { const p=SaveSystem.createDefaultPlayerState(); p.selectedCompanions=[]; p.faith=5; const e=ExpeditionRules.createExpedition(p,{companions:[],provisions:5,random:()=>0}); const c=CombatSystem.create(e,'wild_boar',{random:()=>0}); c.status='awaitingAction'; c.activeActorId='arthur'; const def={id:'faith_fixture',name:'Faith Fixture',kind:'active',targetMode:'singleEnemy',effects:[{type:'dealDamage',amount:1}],cost:{resource:'faith',amount:2}}; const result=CombatSystem.resolveDefinition(c,e,def,'missing-target'); return !result.resolved&&p.faith===5; })()",
            "A target-rejected Faith action spent resource",
        )
        check(
            "(() => { const p=SaveSystem.createDefaultPlayerState(); p.selectedCompanions=[]; const e=ExpeditionRules.createExpedition(p,{companions:[],provisions:5,random:()=>0}); const c=CombatSystem.create(e,'wild_boar',{random:()=>0}); const start=c.events.filter(event=>event.eventType==='combatStart').length; c.status='running'; c.allies[0].gauge=100; CombatSystem.update(c,e,0); const ready=c.events.filter(event=>event.eventType==='actorReady'&&event.source==='arthur').length; const turnStart=c.events.filter(event=>event.eventType==='turnStart'&&event.source==='arthur').length; CombatSystem.chooseAction(c,e,'attack',c.enemies[0].id); const turnEnd=c.events.filter(event=>event.eventType==='turnEnd'&&event.source==='arthur').length; return start===1&&ready===1&&turnStart===1&&turnEnd===1; })()",
            "Combat lifecycle boundaries did not fire once per activation",
        )
        check(
            "(() => { const p=SaveSystem.createDefaultPlayerState(); p.selectedCompanions=[]; const e=ExpeditionRules.createExpedition(p,{companions:[],provisions:5,random:()=>0}); const c=CombatSystem.create(e,'wild_boar',{random:()=>0}); c.status='awaitingAction'; c.activeActorId='arthur'; const t=c.enemies[0]; CombatSystem.chooseAction(c,e,'attack',t.id); c.status='running'; t.gauge=100; CombatSystem.update(c,e,0); const hit=c.events.find(event=>event.eventType==='attackHit'); const taken=c.events.find(event=>event.eventType==='damageTaken'&&event.source===t.id); return hit?.source==='arthur'&&hit?.target===t.id&&taken?.source===t.id&&taken?.target==='arthur'; })()",
            "attackHit or damageTaken did not preserve source/target context",
        )
        check(
            "(() => { const p=SaveSystem.createDefaultPlayerState(); p.selectedCompanions=[]; const e=ExpeditionRules.createExpedition(p,{companions:[],provisions:5,random:()=>0}); const c=CombatSystem.create(e,'wild_boar',{random:()=>0}); const t=c.enemies[0]; t.hp=20; CombatSystem.applyStatus(c,t.id,'bleeding'); processEnemyActivationStatuses(c,t); processEnemyActivationStatuses(c,t); processEnemyActivationStatuses(c,t); return t.hp===14&&!t.statuses.bleeding&&c.events.filter(event=>event.type==='status-tick'&&event.statusId==='bleeding').length===3&&c.events.some(event=>event.type==='status-expired'&&event.statusId==='bleeding'); })()",
            "Status application, periodic tick, or expiration did not use lifecycle events",
        )
        check(
            "(() => { const p=SaveSystem.createDefaultPlayerState(); p.selectedCompanions=[]; const e=ExpeditionRules.createExpedition(p,{companions:[],provisions:5,random:()=>0}); const c=CombatSystem.create(e,'wild_boar',{random:()=>0}); const a=c.allies[0],t=c.enemies[0]; a.learnedPassives=[{id:'z-passive',trigger:{event:'beforeAction'},effects:[]},{id:'a-passive',trigger:{event:'beforeAction'},effects:[]}]; CombatEventSystem.dispatch(c,'beforeAction',{sourceCombatant:a,targetCombatant:t,actionId:'attack'}); const ids=c.events.filter(event=>event.type==='passive-trigger'&&event.eventType==='beforeAction').map(event=>event.sourcePassiveId); return JSON.stringify(ids)===JSON.stringify(['a-passive','z-passive']); })()",
            "Passive trigger ordering was not stable by source and ID",
        )
        check(
            "(() => { const p=SaveSystem.createDefaultPlayerState(); p.selectedCompanions=['sir_kay']; const e=ExpeditionRules.createExpedition(p,{companions:['sir_kay'],provisions:5,random:()=>0}); const c=CombatSystem.create(e,'wolves',{random:()=>0}); const a=c.allies[0],t=c.enemies[0]; const allEnemies=CombatTargetResolver.resolve(c,a,'allEnemies').targets; const allAllies=CombatTargetResolver.resolve(c,a,'allAllies').targets; const ally=CombatTargetResolver.resolve(c,a,'singleAlly').targets; return allEnemies.length===3&&allAllies.length===2&&ally.length===1&&ally[0].id==='arthur'; })()",
            "Central target resolver did not support the required target modes",
        )
        check(
            "(() => { const p=SaveSystem.createDefaultPlayerState(); p.selectedCompanions=[]; const e=ExpeditionRules.createExpedition(p,{companions:[],provisions:5,random:()=>0}); const c=CombatSystem.create(e,'wild_boar',{random:()=>0}); c.enemies[0].gauge=100; CombatSystem.update(c,e,0); return c.events.some(event=>event.eventType==='damageDealt'&&event.source==='wild_boar_1')&&c.events.some(event=>event.actor==='wild_boar_1'&&event.action==='boar_charge'); })()",
            "Enemy actions did not resolve through the shared effect path",
        )
        check(
            "(() => { const p=SaveSystem.createDefaultPlayerState(); p.selectedCompanions=[]; p.equippedItems.weapon='thorn_of_the_dolorous_vale'; p.equippedItems.relic='reliquary_of_saint_lazarus'; const e=ExpeditionRules.createExpedition(p,{companions:[],provisions:5,random:()=>0}); const c=CombatSystem.create(e,'wild_boar',{random:()=>0}); c.status='awaitingAction'; c.activeActorId='arthur'; CombatSystem.chooseAction(c,e,'attack',c.enemies[0].id); return c.events.filter(event=>event.type==='equipment-trigger'&&event.trigger==='onHit'&&event.applied).length===2&&c.enemies[0].statuses.bleeding&&c.enemies[0].statuses.poisoned; })()",
            "Equipment on-hit passives did not survive migration",
        )
        check(
            "(() => { const p=SaveSystem.createDefaultPlayerState(); p.selectedCompanions=[]; const e=ExpeditionRules.createExpedition(p,{companions:[],provisions:5,random:()=>0}); const c=CombatSystem.create(e,'bound_warden',{random:()=>0}); const enemy=c.enemies[0]; enemy.hp=80; enemy.gauge=100; CombatSystem.update(c,e,0); return enemy.hp===84&&c.events.some(event=>event.type==='enemy-trait'&&event.appliedAmount===4); })()",
            "Bound Warden regeneration did not use a passive trigger",
        )
        check(
            "(() => { const p=SaveSystem.createDefaultPlayerState(); p.selectedCompanion=null; const e=ExpeditionRules.createExpedition(p,{companions:[],provisions:5,random:()=>0}); const c=CombatSystem.create(e,'wild_boar',{random:()=>0}); const a=c.allies[0],t=c.enemies[0]; c.status='awaitingAction'; c.activeActorId='arthur'; a.gauge=100; t.gauge=24; const result=CombatSystem.chooseAbility(c,e,'pommel_strike',t.id); return result.resolved&&t.gauge===0&&c.events.at(-1)?.abilityId==='pommel_strike'; })()",
            "Pommel Strike did not preserve its composable damage and gauge effects",
        )
        check(
            "(() => { const p=SaveSystem.createDefaultPlayerState(); p.selectedCompanions=['sir_kay']; const e=ExpeditionRules.createExpedition(p,{companions:['sir_kay'],provisions:5,random:()=>0}); const c=CombatSystem.create(e,'wild_boar',{random:()=>0}); const kay=c.allies.find(entry=>entry.id==='sir_kay'); const enemy=c.enemies[0]; c.status='awaitingAction'; c.activeActorId='sir_kay'; kay.gauge=100; CombatSystem.chooseAbility(c,e,'intercede'); enemy.gauge=100; CombatSystem.update(c,e,0); const action=c.events.find(event=>event.actor===enemy.id&&event.action==='boar_charge'); return action?.redirectedByIntercede===true&&action.target==='sir_kay'; })()",
            "Intercede did not resolve as a shared flag effect",
        )
        check(
            "(() => { const p=SaveSystem.createDefaultPlayerState(); p.selectedCompanions=['llamrei']; const e=ExpeditionRules.createExpedition(p,{companions:['llamrei'],provisions:5,random:()=>0}); const c=CombatSystem.create(e,'wild_boar',{random:()=>0}); const llamrei=c.allies.find(entry=>entry.id==='llamrei'); const enemy=c.enemies[0]; c.status='awaitingAction'; c.activeActorId='llamrei'; llamrei.gauge=100; enemy.gauge=24; const result=CombatSystem.chooseAbility(c,e,'charge',enemy.id); return result.resolved&&enemy.gauge===14; })()",
            "Charge did not resolve through the shared effect vocabulary",
        )
        check(
            "(() => { const p=SaveSystem.createDefaultPlayerState(); p.selectedCompanions=[]; const e=ExpeditionRules.createExpedition(p,{companions:[],provisions:5,random:()=>0}); const c=CombatSystem.create(e,'wild_boar',{random:()=>0}); const native=Math.random; Math.random=()=>{throw new Error('native random used by combat');}; try { c.status='awaitingAction'; c.activeActorId='arthur'; return CombatSystem.chooseAction(c,e,'attack',c.enemies[0].id).resolved; } finally { Math.random=native; } })()",
            "Combat effects reached native Math.random instead of the injected source",
        )
        if devtools.console_errors:
            raise AssertionError(f"Runtime exceptions: {devtools.console_errors}")
        print(f"PASS: {checks} Tier 1 combat assertions")
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
