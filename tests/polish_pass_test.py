"""Small browser regressions for the recruitment, combat, and encounter polish pass."""

from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
import threading
import time
from http.server import ThreadingHTTPServer
from pathlib import Path

from combat_system_test import CHROME, DevTools, QuietHandler, ROOT, free_port, wait_for_json


def run() -> None:
    if not CHROME.exists():
        raise RuntimeError(f"Chrome not found at {CHROME}")
    os.chdir(ROOT)
    http_port = free_port()
    debug_port = free_port()
    server = ThreadingHTTPServer(("127.0.0.1", http_port), QuietHandler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    profile = Path(tempfile.mkdtemp(prefix="grail-polish-pass-"))
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
            "(() => { const p=SaveSystem.createDefaultPlayerState(); p.unlockedCompanions=[]; p.companionStates={}; const e=ExpeditionRules.createExpedition(p,{companions:[],provisions:5,random:()=>0}); const result=EncounterOutcomes.resolve({type:'unlockCompanion',companionId:'llamrei'},{player:p,expedition:e}); const full=ExpeditionRules.createExpedition(p,{companions:['sir_kay','llamrei'],provisions:5,random:()=>0}); const before=full.selectedCompanions.slice(); EncounterOutcomes.resolve({type:'unlockCompanion',companionId:'llamrei'},{player:p,expedition:full}); return result.messages.length===1&&e.selectedCompanions.length===1&&e.selectedCompanion==='llamrei'&&e.companionCombatHp.llamrei===InjuryRules.effectiveMaxHealth(e,'llamrei')&&full.selectedCompanions.length===before.length&&JSON.stringify(full.selectedCompanions)===JSON.stringify(before); })()",
            "Recruitment did not join an empty active party or preserve a full party",
        )
        check(
            "(() => { const action=COMBAT_ENEMY_ACTION_DEFINITIONS.wolf_bite; const prior=action.targetMode; try { const run=(mode)=>{ if(mode===undefined) delete action.targetMode; else action.targetMode=mode; const p=SaveSystem.createDefaultPlayerState(); const e=ExpeditionRules.createExpedition(p,{companions:['sir_kay'],provisions:5,random:()=>0}); const c=CombatSystem.create(e,'wolves',{random:()=>0}); c.status='running'; const enemy=c.enemies[0]; resolveEnemyAction(c,e,enemy); return c.events.find(entry=>entry.actor===enemy.id&&entry.action==='wolf_bite'); }; const single=run(undefined); const all=run('allAllies'); return single?.targetIds?.length===1&&single.targetIds[0]==='arthur'&&all?.targetIds?.includes('arthur')&&all.targetIds.includes('sir_kay')&&all.targetIds.length===2; } finally { if(prior===undefined) delete action.targetMode; else action.targetMode=prior; } })()",
            "Enemy targetMode did not preserve single-target behavior and add allAllies coverage",
        )
        check(
            "(() => { const enemy=COMBAT_ENEMY_DEFINITIONS.wild_boar; const action=COMBAT_ENEMY_ACTION_DEFINITIONS.wolf_bite; const priorAnimations=enemy.visuals.animations; const hadAnimation=Object.prototype.hasOwnProperty.call(enemy.visuals,'animations'); const priorMapping=enemy.actionAnimations; const hadMapping=Object.prototype.hasOwnProperty.call(enemy,'actionAnimations'); const priorId=action.animationId; try { enemy.visuals.animations={bell_ring:{...enemy.visuals.attack,impactFrame:7}}; enemy.actionAnimations={wolf_bite:'bell_ring'}; action.animationId='missing_animation'; const mapped=resolveCombatActionVisualSlot({side:'enemy',definitionId:'wild_boar'},{action:'wolf_bite'})==='bell_ring'; enemy.actionAnimations={wolf_bite:'missing_animation'}; const invalid=resolveCombatActionVisualSlot({side:'enemy',definitionId:'wild_boar'},{action:'wolf_bite'})==='attack'; delete enemy.actionAnimations; action.animationId='bell_ring'; const legacy=resolveCombatActionVisualSlot({side:'enemy',definitionId:'wild_boar'},{action:'wolf_bite'})==='bell_ring'; delete action.animationId; const missing=resolveCombatActionVisualSlot({side:'enemy',definitionId:'wild_boar'},{action:'wolf_bite'})==='attack'; return mapped&&invalid&&legacy&&missing; } finally { if(hadAnimation) enemy.visuals.animations=priorAnimations; else delete enemy.visuals.animations; if(hadMapping) enemy.actionAnimations=priorMapping; else delete enemy.actionAnimations; if(priorId===undefined) delete action.animationId; else action.animationId=priorId; } })()",
            "Enemy-local animation mappings did not select valid visuals or fall back to Attack",
        )
        check(
            "(async () => { const originalExpedition=game.expedition; const originalScreen=game.screen; const encounter=ENCOUNTER_DEFINITIONS.llamrei_discovery; const assetId=encounter.visualAssetId; const originalPreload=preloadTravelSceneAsset; const originalReady=travelSceneAssetReady; const originalFailed=travelSceneAssetFailed; let release=null; let ready=false; let pending=null; try { travelSceneAssetReady=id=>id===assetId?ready:originalReady(id); travelSceneAssetFailed=id=>id===assetId?false:originalFailed(id); preloadTravelSceneAsset=id=>id===assetId?(pending||(pending=new Promise(resolve=>{release=()=>{ready=true;resolve(null);};}))):originalPreload(id); const p=SaveSystem.createDefaultPlayerState(); const e=ExpeditionRules.createExpedition(p,{companions:[],provisions:5,random:()=>0}); e.status='active'; e.activeEncounter={encounterId:'llamrei_discovery',stageId:'start'}; game.expedition=e; game.screen='expedition'; renderExpedition(); const held=Boolean(e.activeEncounter&&game.travelScenePresentation?.encounterAssetLoad&&!document.querySelector('.encounter-panel')); if(!release) return false; release(); await new Promise(resolve=>setTimeout(resolve,0)); return held&&Boolean(document.querySelector('.encounter-panel')); } finally { preloadTravelSceneAsset=originalPreload; travelSceneAssetReady=originalReady; travelSceneAssetFailed=originalFailed; game.expedition=originalExpedition; game.screen=originalScreen; renderScreen(); } })()",
            "Encounter layout switched before its background asset was ready",
        )
        print(f"PASS: {checks} focused polish assertions")
    finally:
        chrome.terminate()
        try:
            chrome.wait(timeout=3)
        except subprocess.TimeoutExpired:
            chrome.kill()
        server.shutdown()
        shutil.rmtree(profile, ignore_errors=True)


if __name__ == "__main__":
    run()
