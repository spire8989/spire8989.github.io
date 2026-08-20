"""Focused browser coverage for the developer-only Game Debug panel."""

from __future__ import annotations

import json
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
    profile = Path(tempfile.mkdtemp(prefix="grail-debug-tools-test-"))
    base_url = f"http://127.0.0.1:{http_port}/"
    chrome = subprocess.Popen([
        str(CHROME), "--headless=new", "--disable-gpu", "--no-sandbox",
        "--remote-allow-origins=*", f"--remote-debugging-port={debug_port}",
        f"--user-data-dir={profile}", base_url,
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    checks = 0
    devtools = None
    try:
        devtools = DevTools(wait_for_json(debug_port, base_url))
        devtools.call("Runtime.enable")
        time.sleep(0.35)

        def check(expression: str, label: str) -> None:
            nonlocal checks
            if not devtools.evaluate(expression):
                raise AssertionError(label)
            checks += 1

        check("!document.querySelector('.debug-tools')&&!document.querySelector('.debug-tools-toggle')", "Normal URL exposed the debug panel")
        devtools.evaluate(f"location.href={json.dumps(f'{base_url}?debug=1&sim=1')}")
        time.sleep(0.45)
        check("Boolean(document.querySelector('.debug-tools'))&&Boolean(document.querySelector('.simulation-tools'))", "Debug and simulation tools did not initialize together")
        check("document.querySelector('#debug-town-hotspot-style')?.value===''", "Town hotspot style switcher did not default to the saved-style option")
        check(
            "(() => { game.screen='location'; renderLocation(); const before=[...document.querySelectorAll('.hub-hotspot')].map(button=>`${button.dataset.destinationId}:${button.dataset.hotspotX},${button.dataset.hotspotY}`).join('|'); const location=LOCATION_DEFINITIONS[game.player.currentLocationId]; const savedStyle=location.markerStyle; let style=document.querySelector('#debug-town-hotspot-style'); const savedSelected=style?.value===''; style.value='ribbon'; style.dispatchEvent(new Event('change',{bubbles:true})); const override=[...document.querySelectorAll('.hub-hotspot')].every(button=>button.classList.contains('town-hotspot-style-ribbon')); style=document.querySelector('#debug-town-hotspot-style'); style.value=''; style.dispatchEvent(new Event('change',{bubbles:true})); const restored=[...document.querySelectorAll('.hub-hotspot')].every(button=>button.classList.contains(`town-hotspot-style-${savedStyle}`)); location.markerStyle='ink'; renderLocation(); const saved=[...document.querySelectorAll('.hub-hotspot')].every(button=>button.classList.contains('town-hotspot-style-ink')); delete location.markerStyle; renderLocation(); const missing=[...document.querySelectorAll('.hub-hotspot')].every(button=>button.classList.contains('town-hotspot-style-tag')); location.markerStyle='invalid'; renderLocation(); const invalid=[...document.querySelectorAll('.hub-hotspot')].every(button=>button.classList.contains('town-hotspot-style-tag')); location.markerStyle=savedStyle; const after=[...document.querySelectorAll('.hub-hotspot')].map(button=>`${button.dataset.destinationId}:${button.dataset.hotspotX},${button.dataset.hotspotY}`).join('|'); game.screen='campaign'; renderScreen(); return savedSelected&&override&&restored&&saved&&missing&&invalid&&before===after; })()",
            "Town hotspot style override did not restore the saved style or preserve fallback coordinates",
        )
        check(
            "(() => { game.screen='location'; renderLocation(); const authored=DESTINATION_DEFINITIONS.inn.hotspot; DESTINATION_DEFINITIONS.inn.hotspot={x:0,y:1}; renderLocation(); const edgeScene=document.querySelector('.location-scene').getBoundingClientRect(); const edgeButton=document.querySelector('[data-destination-id=inn]').getBoundingClientRect(); const edgeClamped=edgeButton.left>=edgeScene.left-0.5&&edgeButton.right<=edgeScene.right+0.5&&edgeButton.top>=edgeScene.top-0.5&&edgeButton.bottom<=edgeScene.bottom+0.5&&document.querySelector('[data-destination-id=inn]').dataset.hotspotX==='0'&&document.querySelector('[data-destination-id=inn]').dataset.hotspotY==='1'; DESTINATION_DEFINITIONS.inn.hotspot=authored; renderLocation(); const scene=document.querySelector('.location-scene').getBoundingClientRect(); const buttons=[...document.querySelectorAll('.hub-hotspot')]; const locked=buttons.filter(button=>button.disabled); const noLockCopy=locked.every(button=>!button.querySelector('.hub-lock-label')&&!button.textContent.includes('Available after the Hall')); const inside=buttons.every(button=>{ const box=button.getBoundingClientRect(); return box.left>=scene.left-0.5&&box.right<=scene.right+0.5&&box.top>=scene.top-0.5&&box.bottom<=scene.bottom+0.5; }); const touchTarget=buttons.every(button=>{ const target=getComputedStyle(button,'::after'); const visible=button.getBoundingClientRect(); return Number.parseFloat(target.width)>=44&&Number.parseFloat(target.height)>=44&&visible.height<Number.parseFloat(target.height); }); game.screen='campaign'; renderScreen(); return edgeClamped&&locked.length>0&&noLockCopy&&inside&&touchTarget; })()",
            "Town hotspot locked labels, edge clamping, or mobile touch targets are incorrect",
        )
        check(
            "(() => { const encounter={encounterLayout:{arthur:{x:0.25,y:0.75},companion1:{x:0.6,y:0.4}}}; const scene=document.createElement('div'); scene.style.cssText='position:relative;width:400px;height:225px'; scene.innerHTML=renderEncounterTravelers([{type:'mount'}],encounter); document.body.append(scene); const arthur=scene.querySelector('.arthur'); const companion=scene.querySelector('.companion'); const first=arthur.getBoundingClientRect(); const authored=Math.abs((first.left+first.width/2-scene.getBoundingClientRect().left)/400-0.25)<0.02&&Math.abs((first.top+first.height/2-scene.getBoundingClientRect().top)/225-0.75)<0.02&&arthur.dataset.encounterLayoutX==='0.25'&&companion.dataset.encounterLayoutY==='0.4'; scene.style.width='800px'; scene.style.height='450px'; const resized=arthur.getBoundingClientRect(); const responsive=Math.abs((resized.left+resized.width/2-scene.getBoundingClientRect().left)/800-0.25)<0.02&&Math.abs((resized.top+resized.height/2-scene.getBoundingClientRect().top)/450-0.75)<0.02; const fallback=document.createElement('div'); fallback.innerHTML=renderEncounterTravelers([],{}); const fallbackArthur=fallback.querySelector('.arthur'); const fallbackWorks=fallbackArthur.dataset.encounterLayoutX==='0.42'&&fallbackArthur.dataset.encounterLayoutY==='0.66'; const occupied=scene.querySelectorAll('.arthur,.companion').length===2; scene.remove(); return authored&&responsive&&fallbackWorks&&occupied; })()",
            "Encounter party layout did not use normalized authored, fallback, responsive, or occupied slots",
        )
        check(
            "(() => { const definition=ENCOUNTER_DEFINITIONS.abandoned_camp; const base=resolveEncounterVisualState(definition,{}); const oldExpedition=game.expedition; const oldScreen=game.screen; const choice=definition.stages.start.choices.find(candidate=>candidate.id==='leave'); const oldOutcomes=choice.outcomes; const oldVisual=choice.visualOverride; const oldEnd=choice.endEncounter; choice.outcomes=[{type:'modifyResource',resource:'gold',amount:0}]; choice.visualOverride={backgroundAssetId:'expedition_old_forest_road_bg',encounterLayout:{arthur:{x:0.9,y:0.8}},hiddenSlots:['companion2']}; choice.endEncounter=true; const expedition=ExpeditionRules.createExpedition(SaveSystem.createDefaultPlayerState(),{expeditionId:'fountain_of_barenton',companions:['sir_kay','llamrei'],provisions:10}); EncounterManager.force(expedition,'abandoned_camp'); const resolved=EncounterManager.resolveChoice(expedition,SaveSystem.createDefaultPlayerState(),'leave'); const visual=resolveEncounterVisualState(definition,expedition.activeEncounter); game.expedition=expedition; game.screen='expedition'; renderScreen(); const image=document.querySelector('#travel-scene .travel-visual-track')?.dataset.travelAssetId; const members=[...document.querySelectorAll('#travelers > .companion')]; const rendered=members.length===2&&members[1].hidden&&document.querySelector('#travelers .arthur')?.dataset.encounterLayoutX==='0.9'&&Math.abs(Number(document.querySelector('#travelers .companion')?.dataset.encounterLayoutX)-base.layout.companion1.x)<0.0001; const inherited=visual.layout.companion1.x===base.layout.companion1.x&&visual.layout.companion2.y===base.layout.companion2.y; const stateUnchanged=expedition.selectedCompanions.length===2&&resolved.awaitingContinue; choice.outcomes=oldOutcomes; choice.visualOverride=oldVisual; choice.endEncounter=oldEnd; game.expedition=oldExpedition; game.screen=oldScreen; renderScreen(); return image==='expedition_old_forest_road_bg'&&resolved.resolved&&visual.hiddenSlots.has('companion2')&&inherited&&rendered&&stateUnchanged; })()",
            "Outcome visual overrides did not combine background, partial layout inheritance, hidden slots, and unchanged party state",
        )
        check("document.querySelectorAll('#debug-combat-select option').length===Object.keys(COMBAT_DEFINITIONS).length&&Boolean(document.querySelector('#debug-combat-select option[value=bandit_ambush]'))", "Combat launcher is not data-driven")
        check(
            "(() => { const items=document.querySelector('details[data-debug-details=items]'); const materials=document.querySelector('details[data-debug-details=materials]'); const gold=document.querySelector('#debug-gold-set'); const select=document.querySelector('#debug-item-select'); items.open=false; materials.open=true; gold.focus(); select.value='glimmering_sword'; select.dispatchEvent(new Event('change',{bubbles:true})); return !document.querySelector('details[data-debug-details=items]').open&&document.querySelector('details[data-debug-details=materials]').open&&document.activeElement?.id==='debug-gold-set'; })()",
            "Debug panel rebuild did not preserve section state and focused control",
        )

        check(
            "(() => { const s=document.querySelector('#debug-item-select'); s.value='glimmering_sword'; s.dispatchEvent(new Event('change',{bubbles:true})); document.querySelector('#debug-item-quantity').value='2'; document.querySelector('[data-debug-action=give-item]').click(); return game.player.ownedItems.glimmering_sword===2&&SaveSystem.load().ownedItems.glimmering_sword===2; })()",
            "Giving a data-defined item did not persist",
        )
        check(
            "(() => { const s=document.querySelector('#debug-item-select'); s.value='glimmering_sword'; s.dispatchEvent(new Event('change',{bubbles:true})); document.querySelector('#debug-item-quantity').value='10'; document.querySelector('[data-debug-action=remove-item]').click(); return !game.player.ownedItems.glimmering_sword&&Object.values(game.player.ownedItems).every(quantity=>quantity>=0); })()",
            "Removing an item did not clamp and clean up quantity",
        )
        check(
            "(() => { DebugTools.grantItem('glimmering_sword'); document.querySelector('#debug-item-select').value='glimmering_sword'; document.querySelector('#debug-item-select').dispatchEvent(new Event('change',{bubbles:true})); document.querySelector('[data-debug-action=equip-item]').click(); return game.player.equippedItems.weapon==='glimmering_sword'&&game.player.ownedItems.glimmering_sword===1; })()",
            "Equipping a data-defined item did not use valid equipment state",
        )
        check(
            "(() => { const s=document.querySelector('#debug-material-select'); s.value='silver'; s.dispatchEvent(new Event('change',{bubbles:true})); document.querySelector('#debug-material-quantity').value='4'; document.querySelector('[data-debug-action=give-material]').click(); const gave=game.player.materials.silver===4; document.querySelector('#debug-material-quantity').value='9'; document.querySelector('[data-debug-action=remove-material]').click(); return gave&&!game.player.materials.silver; })()",
            "Material give/remove did not use permanent material storage safely",
        )
        check(
            "(() => { const s=document.querySelector('#debug-recipe-select'); s.value='glimmering_sword'; s.dispatchEvent(new Event('change',{bubbles:true})); document.querySelector('[data-debug-action=learn-recipe]').click(); const learned=game.player.learnedRecipes.includes('glimmering_sword'); document.querySelector('[data-debug-action=forget-recipe]').click(); return learned&&!game.player.learnedRecipes.includes('glimmering_sword')&&SaveSystem.load().learnedRecipes.every(id=>RECIPE_DEFINITIONS[id]); })()",
            "Recipe learn/forget did not persist valid IDs",
        )
        check(
            "(() => { const s=document.querySelector('#debug-knowledge-select'); s.value='woodcraft'; s.dispatchEvent(new Event('change',{bubbles:true})); document.querySelector('[data-debug-action=grant-knowledge]').click(); const granted=game.player.learnedKnowledge.includes('woodcraft'); document.querySelector('[data-debug-action=remove-knowledge]').click(); return granted&&!game.player.learnedKnowledge.includes('woodcraft'); })()",
            "Knowledge grant/remove did not update progression",
        )
        check(
            "(() => { game.player.arthurHealth=1; document.querySelector('[data-debug-action=heal-arthur]').click(); return game.player.arthurHealth===HealingRules.arthurMaxHealth(game.player); })()",
            "Heal Arthur did not use the shared health maximum",
        )
        check(
            "(() => { game.player.arthurHealth=1; game.player.selectedCompanions=['sir_kay']; game.player.selectedCompanion='sir_kay'; game.player.companionStates.sir_kay.health=1; document.querySelector('[data-debug-action=heal-party]').click(); return game.player.arthurHealth===HealingRules.arthurMaxHealth(game.player)&&game.player.companionStates.sir_kay.health===InjuryRules.effectiveMaxHealth(game.player,'sir_kay'); })()",
            "Heal Party did not heal the selected party",
        )
        check(
            "(() => { game.expedition=ExpeditionRules.createExpedition(game.player,{provisions:10,companions:['sir_kay']}); game.screen='expedition'; renderScreen(); DebugTools.refresh(); const s=document.querySelector('#debug-encounter-select'); s.value='wild_boar'; s.dispatchEvent(new Event('change',{bubbles:true})); document.querySelector('[data-debug-action=trigger-encounter]').click(); return game.expedition.activeEncounter?.encounterId==='wild_boar'; })()",
            "Existing encounter forcing did not work through the general panel",
        )
        check(
            "(() => { game.expedition.activeEncounter=null; game.expedition.combat=null; renderScreen(); DebugTools.refresh(); const s=document.querySelector('#debug-combat-select'); s.value='bandit_ambush'; s.dispatchEvent(new Event('change',{bubbles:true})); document.querySelector('[data-debug-action=start-combat]').click(); return game.expedition.combat?.id==='bandit_ambush'&&document.querySelector('#debug-combat-state')?.textContent.includes('Bandit'); })()",
            "Data-defined combat did not launch through the production combat path",
        )
        check(
            "(() => { const enemy=game.expedition.combat.enemies[0]; document.querySelector('#debug-combat-enemy').value=enemy.id; document.querySelector('#debug-combat-enemy').dispatchEvent(new Event('change',{bubbles:true})); document.querySelector('#debug-combat-status').value='bleeding'; document.querySelector('#debug-combat-status').dispatchEvent(new Event('change',{bubbles:true})); document.querySelector('[data-debug-action=apply-combat-status]').click(); return Boolean(enemy.statuses.bleeding?.remainingActivations); })()",
            "Combat status debug control did not use canonical combat mutation",
        )
        check(
            "(() => { const run=SimulationRunner.run({seed:'debug-isolation',companions:[],turnaroundPolicy:{type:'fixedDistance',distance:1}}); ReplayController.start(run); const realPlayer=ReplayController.state().realGameState.player; const owned=realPlayer.ownedItems.glimmering_sword||0; const changed=DebugTools.grantItem('glimmering_sword'); const protectedState=realPlayer.ownedItems.glimmering_sword===owned&&!changed; ReplayController.exit(); return protectedState&&!ReplayController.isActive(); })()",
            "Debug controls mutated or failed to reject replay playback",
        )

        if devtools.console_errors:
            raise AssertionError(f"Runtime exceptions: {devtools.console_errors}")
        print(f"PASS: {checks} debug-tools assertions")
    finally:
        if devtools:
            try:
                devtools.ws.close()
            except Exception:
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
