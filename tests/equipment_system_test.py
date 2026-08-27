"""Focused shield and two-handed equipment regressions."""

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
    profile = Path(tempfile.mkdtemp(prefix="grail-equipment-test-"))
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
            try:
                result = devtools.evaluate(expression)
            except AssertionError:
                print(f"Browser exceptions before failed check: {devtools.console_errors}")
                raise
            if not result:
                raise AssertionError(label)
            checks += 1

        check(
            "(() => { const p=SaveSystem.createDefaultPlayerState(); p.ownedItems.weathered_round_shield=1; const result=EquipmentRules.equip(p,'weathered_round_shield'); return result.applied&&p.equippedItems.shield==='weathered_round_shield'&&EquipmentRules.equipmentSlots().join(',')==='weapon,shield,armor,relic'; })()",
            "A shield was not recognized as an equipable fourth slot",
        )
        check(
            "(() => { const p=SaveSystem.createDefaultPlayerState(); delete p.equippedItems.armor; p.ownedItems.weathered_round_shield=1; EquipmentRules.equip(p,'weathered_round_shield'); p.selectedCompanions=[]; const e=ExpeditionRules.createExpedition(p,{companions:[],provisions:5,random:()=>0}); const c=CombatSystem.create(e,'wild_boar',{random:()=>0}); return c.allies[0].defense===2; })()",
            "Shield defense did not reach combat when armor was absent",
        )
        check(
            "(() => { const p=SaveSystem.createDefaultPlayerState(); p.ownedItems.weathered_round_shield=1; EquipmentRules.equip(p,'weathered_round_shield'); p.selectedCompanions=[]; const e=ExpeditionRules.createExpedition(p,{companions:[],provisions:5,random:()=>0}); const c=CombatSystem.create(e,'wild_boar',{random:()=>0}); return c.allies[0].defense===5; })()",
            "Armor and shield defense did not stack additively",
        )
        check(
            "(() => { const p=SaveSystem.createDefaultPlayerState(); p.selectedCompanions=[]; const e=ExpeditionRules.createExpedition(p,{companions:[],provisions:5,random:()=>0}); const c=CombatSystem.create(e,'wild_boar',{random:()=>0}); return c.allies[0].defense===3; })()",
            "Existing armor-only defense changed unexpectedly",
        )
        check(
            "(() => { const defs={one:{id:'one',equippable:true,equipmentSlot:'weapon',effects:{combatDamage:{minimum:3,maximum:3}}},two:{id:'two',equippable:true,equipmentSlot:'weapon',twoHanded:true,effects:{combatDamage:{minimum:6,maximum:6}}},shield:{id:'shield',equippable:true,equipmentSlot:'shield',effects:{combatDefense:2}}}; const p={ownedItems:{one:1,two:1,shield:1},equippedItems:{weapon:'one',shield:'shield'},packedItems:[]}; const twoResult=EquipmentRules.equip(p,'two',defs); const removedShield=p.equippedItems.shield===undefined&&twoResult.compatibilityChanges[0]?.itemId==='shield'; p.equippedItems={weapon:'two'}; const shieldResult=EquipmentRules.equip(p,'shield',defs); const removedWeapon=p.equippedItems.weapon===undefined&&shieldResult.compatibilityChanges[0]?.itemId==='two'; p.equippedItems={weapon:'one',shield:'shield'}; EquipmentRules.equip(p,'one',defs); return removedShield&&removedWeapon&&p.equippedItems.shield==='shield'; })()",
            "Two-handed compatibility did not handle both manual equip directions or preserve a shield for one-handed swaps",
        )
        check(
            "(() => { const old={saveVersion:1,ownedItems:{arthur_sword:1,quilted_hauberk:1,silver_stag_medallion:1},equippedItems:{weapon:'arthur_sword',armor:'quilted_hauberk',relic:'silver_stag_medallion'},packedItems:[]}; const loaded=sanitizePlayerState(old,SaveSystem.createDefaultPlayerState()); return loaded.equippedItems.shield===undefined&&loaded.equippedItems.weapon==='arthur_sword'; })()",
            "An old save without a shield slot did not load safely",
        )
        check(
            "(() => { const key='questForTheHolyGrail.save.v1'; const previous=localStorage.getItem(key); try { const p=SaveSystem.createDefaultPlayerState(); p.ownedItems.weathered_round_shield=1; EquipmentRules.equip(p,'weathered_round_shield'); SaveSystem.save(p); const loaded=SaveSystem.load(); return loaded.equippedItems.shield==='weathered_round_shield'; } finally { if(previous===null)localStorage.removeItem(key); else localStorage.setItem(key,previous); } })()",
            "An equipped shield did not survive save and reload",
        )
        check(
            "(() => { const item=ITEM_DEFINITIONS.glimmering_sword; const had=Object.prototype.hasOwnProperty.call(item,'twoHanded'); const previous=item.twoHanded; item.twoHanded=true; try { const saved={saveVersion:12,ownedItems:{glimmering_sword:1,weathered_round_shield:1},equippedItems:{weapon:'glimmering_sword',shield:'weathered_round_shield'},packedItems:[]}; const loaded=sanitizePlayerState(saved,SaveSystem.createDefaultPlayerState()); return loaded.equippedItems.weapon==='glimmering_sword'&&loaded.equippedItems.shield===undefined; } finally { if(had)item.twoHanded=previous; else delete item.twoHanded; } })()",
            "Invalid saved two-handed and shield equipment was not repaired in favor of the weapon",
        )
        check(
            "(() => { const p=SaveSystem.createDefaultPlayerState(); p.ownedItems.weathered_round_shield=1; EquipmentRules.equip(p,'weathered_round_shield'); const e=ExpeditionRules.createExpedition(p,{companions:[],provisions:5,random:()=>0}); return e.selectedEquipment.shield==='weathered_round_shield'; })()",
            "Expedition equipment snapshots did not retain a shield",
        )
        check(
            "EquipmentRules.scoreItem(ITEM_DEFINITIONS.weathered_round_shield,'cautious')>0",
            "Simulation equipment scoring did not value shield defense",
        )
        check(
            "(() => { const p=SaveSystem.createDefaultPlayerState(); p.ownedItems.weathered_round_shield=1; const changes=EquipmentRules.equipBestOwned(p,'cautious'); return p.equippedItems.shield==='weathered_round_shield'&&changes.some(change=>change.itemId==='weathered_round_shield'); })()",
            "Simulation auto-equipment did not recognize an owned shield",
        )
        check(
            "(() => { const defs={one:{id:'one',equippable:true,equipmentSlot:'weapon',effects:{combatDamage:{minimum:3,maximum:3}}},two:{id:'two',equippable:true,equipmentSlot:'weapon',twoHanded:true,effects:{combatDamage:{minimum:8,maximum:8}}},shield:{id:'shield',equippable:true,equipmentSlot:'shield',effects:{combatDefense:2}}}; const p={ownedItems:{one:1,two:1,shield:1},equippedItems:{},packedItems:[]}; EquipmentRules.equipBestOwned(p,'aggressive',{definitions:defs}); return p.equippedItems.weapon==='two'&&!p.equippedItems.shield; })()",
            "Simulation auto-equipment produced an illegal two-handed and shield loadout",
        )
        check(
            "(() => { const run=SimulationRunner.run({seed:'shield-snapshot',expeditionId:'old_forest_road',companions:[],provisions:5,loadout:{...SaveSystem.createDefaultPlayerState().equippedItems,shield:'weathered_round_shield'},startingState:{selectedCompanions:[],selectedCompanion:null,ownedItems:{weathered_round_shield:1}},turnaroundPolicy:{type:'fixedDistance',distance:1}}); return run.loadout.shield==='weathered_round_shield'&&!(run.loadout.weapon==='weathered_round_shield'); })()",
            "Simulation output did not preserve a valid shield loadout",
        )
        check(
            "(() => { const base={expeditionId:'old_forest_road',companions:[],provisions:5,turnaroundPolicy:{type:'fixedDistance',distance:1}}; return ['random','cautious','aggressive'].every(strategy=>{ try { SimulationRunner.run({...base,seed:'shield-strategy-'+strategy,strategy}); return true; } catch (error) { return false; } }); })()",
            "A current simulation strategy stopped running after the equipment change",
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

    print(f"Equipment system suite passed {checks} assertions.")


if __name__ == "__main__":
    run()
