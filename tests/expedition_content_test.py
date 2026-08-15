"""Focused regression coverage for the Barenton and Val expedition content."""

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
    profile = Path(tempfile.mkdtemp(prefix="grail-expedition-content-test-"))
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

        def check(expression: str, label: str) -> None:
            nonlocal checks
            if not devtools.evaluate(expression):
                raise AssertionError(label)
            checks += 1

        check(
            "ENCOUNTER_DEFINITIONS.barenton_fountain_ritual.minimumDistance >= 94 "
            "&& ENCOUNTER_DEFINITIONS.barenton_fountain_ritual.milestone "
            "&& ENCOUNTER_DEFINITIONS.summoned_guardian.minimumDistance >= 100 "
            "&& COMBAT_ENEMY_DEFINITIONS.fountain_knight.maxHp === 48 "
            "&& COMBAT_ENEMY_DEFINITIONS.summoned_guardian.maxHp === 50",
            "Deep route milestones or boss combat stats are not in the intended range",
        )
        check(
            "(() => { const player=SaveSystem.createDefaultPlayerState(); player.ownedItems.flask=1; "
            "const expedition=ExpeditionRules.createExpedition(player,{expeditionId:'fountain_of_barenton',companions:[],provisions:10,packedItems:['wayfarers_cloak','flask'],random:()=>0}); "
            "EncounterManager.force(expedition,'barenton_fountain_ritual'); "
            "EncounterManager.resolveChoice(expedition,player,'fill_flask'); "
            "return expedition.activeEncounter.stageId==='ritual'&&expedition.unsecuredLoot.length===0&&!player.ownedItems.water_of_barenton; })()",
            "Barenton water was retained before the Perron ordeal",
        )
        check(
            "(() => { const player=SaveSystem.createDefaultPlayerState(); player.ownedItems.flask=1; "
            "const expedition=ExpeditionRules.createExpedition(player,{expeditionId:'fountain_of_barenton',companions:[],provisions:10,packedItems:['wayfarers_cloak','flask'],random:()=>0}); "
            "EncounterManager.force(expedition,'barenton_fountain_ritual'); "
            "['fill_flask','pour_on_perron','shelter_with_cloak'].forEach(id=>EncounterManager.resolveChoice(expedition,player,id)); "
            "const started=EncounterManager.resolveChoice(expedition,player,'face_fountain_knight',{startCombat:()=>true}); "
            "const finished=EncounterManager.completeCombat(expedition,player,'victory'); "
            "return started.combatStarted&&finished.awaitingContinue&&expedition.unsecuredLoot.some(entry=>entry.itemId==='water_of_barenton')&&!player.ownedItems.water_of_barenton; })()",
            "Fountain Knight victory did not stage unsecured Water of Barenton",
        )
        check(
            "(() => { const player=SaveSystem.createDefaultPlayerState(); player.ownedItems.flask=1; "
            "const expedition=ExpeditionRules.createExpedition(player,{expeditionId:'fountain_of_barenton',companions:[],provisions:10,packedItems:['wayfarers_cloak','flask'],random:()=>0}); "
            "EncounterManager.force(expedition,'barenton_fountain_ritual'); "
            "['fill_flask','pour_on_perron','shelter_with_cloak'].forEach(id=>EncounterManager.resolveChoice(expedition,player,id)); "
            "EncounterManager.resolveChoice(expedition,player,'face_fountain_knight',{startCombat:()=>true}); EncounterManager.completeCombat(expedition,player,'victory'); "
            "ExpeditionRules.settle(player,expedition,false); return !player.ownedItems.water_of_barenton; })()",
            "Failed Barenton expeditions retained unsecured water",
        )
        check(
            "(() => { const player=SaveSystem.createDefaultPlayerState(); const expedition=ExpeditionRules.createExpedition(player,{expeditionId:'val_sans_retour',companions:[],provisions:10,random:()=>0}); "
            "EncounterManager.force(expedition,'val_repeated_road'); EncounterManager.resolveChoice(expedition,player,'mark_the_road'); EncounterManager.continueJourney(expedition); "
            "EncounterManager.force(expedition,'val_impossible_boundary'); EncounterManager.resolveChoice(expedition,player,'step_through_boundary'); "
            "return expedition.runFlags.valLoopConfirmed&&expedition.runFlags.valBoundaryRevealed; })()",
            "Val loop and boundary reveal flags did not progress independently",
        )
        check(
            "(() => { const player=SaveSystem.createDefaultPlayerState(); const expedition=ExpeditionRules.createExpedition(player,{expeditionId:'val_sans_retour',companions:[],provisions:10,random:()=>0}); "
            "EncounterManager.force(expedition,'summoned_guardian'); const started=EncounterManager.resolveChoice(expedition,player,'fight_guardian',{startCombat:()=>true}); "
            "const finished=EncounterManager.completeCombat(expedition,player,'victory'); ExpeditionRules.settle(player,expedition,true); "
            "return started.combatStarted&&finished.awaitingContinue&&player.ownedItems.morgans_token===1&&COMBAT_DEFINITIONS.summoned_guardian.enemyIds.length===1; })()",
            "Morgan's Guardian did not grant its deliberate token reward",
        )
        check(
            "(() => ['cautious','random','aggressive'].every(strategy => { const result=SimulationRunner.run({id:'content-'+strategy,seed:'content-'+strategy,expeditionId:'fountain_of_barenton',strategy,provisions:30,packContents:['wayfarers_cloak','flask'],turnaroundPolicy:{type:'fixedDistance',distance:100}}); return ['returned','failed'].includes(result.outcome)&&result.replay.expeditionId==='fountain_of_barenton'&&result.encounters.every(entry=>entry.encounterId); }))()",
            "Barenton simulations did not terminate cleanly for every strategy",
        )
        check(
            "(() => { const a=SimulationRunner.run({seed:'barenton-replay',expeditionId:'fountain_of_barenton',strategy:'aggressive',provisions:30,packContents:['wayfarers_cloak','flask'],turnaroundPolicy:{type:'fixedDistance',distance:100}}); const b=SimulationRunner.verifyDeterminism({seed:'barenton-replay',expeditionId:'fountain_of_barenton',strategy:'aggressive',provisions:30,packContents:['wayfarers_cloak','flask'],turnaroundPolicy:{type:'fixedDistance',distance:100}}); return a.replay.expeditionId==='fountain_of_barenton'&&b.matches; })()",
            "Barenton replay determinism was not preserved",
        )
        check(
            "(() => { const result=SimulationRunner.run({seed:'val-replay',expeditionId:'val_sans_retour',strategy:'aggressive',provisions:30,turnaroundPolicy:{type:'fixedDistance',distance:100}}); return result.replay.expeditionId==='val_sans_retour'&&result.encounters.some(entry=>entry.encounterId==='val_impossible_boundary')&&result.encounters.every(entry=>entry.encounterId); })()",
            "Val simulation did not reach its boundary reveal without malformed encounters",
        )
        check(
            "(() => { const fountain=SimulationRunner.run({seed:'metric-fountain_of_barenton-cautious',expeditionId:'fountain_of_barenton',strategy:'cautious',provisions:30,packContents:['wayfarers_cloak','flask'],turnaroundPolicy:{type:'fixedDistance',distance:100}}); const val=SimulationRunner.run({seed:'metric-val_sans_retour-aggressive',expeditionId:'val_sans_retour',strategy:'aggressive',provisions:30,turnaroundPolicy:{type:'fixedDistance',distance:100}}); return fountain.endingPlayerState.ownedItems.water_of_barenton===1&&val.endingPlayerState.ownedItems.morgans_token===1; })()",
            "Deep-route simulations did not settle the deliberate Barenton and Val quest rewards",
        )
        metrics = devtools.evaluate(
            "(() => ['fountain_of_barenton','val_sans_retour'].flatMap(expeditionId => "
            "['cautious','random','aggressive'].map(strategy => { const run=SimulationRunner.run({seed:`metric-${expeditionId}-${strategy}`,expeditionId,strategy,provisions:30,packContents:['wayfarers_cloak','flask'],turnaroundPolicy:{type:'fixedDistance',distance:100}}); return {expeditionId,strategy,outcome:run.outcome,maximumDistance:run.maximumDistance,encounters:run.encounterCount,combats:run.combatCount,story:run.encounters.filter(entry=>entry.encounterId.includes('barenton')||entry.encounterId.includes('val_')||entry.encounterId==='summoned_guardian').length,turnaround:run.turnaroundDistance,finalProvisions:run.provisionsRemaining,ids:run.encounters.map(entry=>`${entry.encounterId}@${entry.distance}`)}; })))()"
        )
        print(f"CONTENT METRICS: {metrics}")

        if devtools.console_errors:
            raise AssertionError(f"Runtime exceptions: {devtools.console_errors}")
        print(f"PASS: {checks} Barenton/Val expedition-content assertions")
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
