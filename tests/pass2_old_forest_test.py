"""Focused browser regressions for Old Forest Road Contest Pass 2."""

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
    threading.Thread(target=server.serve_forever, daemon=True).start()
    profile = Path(tempfile.mkdtemp(prefix="grail-old-forest-pass2-"))
    game_url = f"http://127.0.0.1:{http_port}/"
    chrome = subprocess.Popen([
        str(CHROME), "--headless=new", "--disable-gpu", "--no-sandbox",
        "--remote-allow-origins=*", f"--remote-debugging-port={debug_port}",
        f"--user-data-dir={profile}", game_url,
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    checks = 0
    try:
        devtools = DevTools(wait_for_json(debug_port, game_url))
        devtools.call("Runtime.enable")
        time.sleep(0.4)

        def check(expression: str, label: str) -> None:
            nonlocal checks
            result = devtools.evaluate(expression)
            if not result:
                raise AssertionError(f"{label} ({result!r})")
            checks += 1

        check(
            "(() => { const p=SaveSystem.createDefaultPlayerState(); const e=ExpeditionRules.createExpedition(p,{expeditionId:'old_forest_road',provisions:30,random:()=>0}); e.distance=20; e.direction='outbound'; const noMap=!EncounterManager.eligibleDefinitions(e,p).some(entry=>entry.id==='fork_in_the_road'); p.ownedItems.old_foresters_map=1; e.packedItems=['old_foresters_map']; e.carriedItems={old_foresters_map:1}; const map=EncounterManager.eligibleDefinitions(e,p).some(entry=>entry.id==='fork_in_the_road'); e.distance=40; delete p.ownedItems.old_foresters_map; e.packedItems=[]; e.carriedItems={}; const normal=EncounterManager.eligibleDefinitions(e,p).some(entry=>entry.id==='overgrown_trail_turnoff'); return noMap&&map&&normal; })()",
            "The early Overgrown fork was not gated by the Forester's Map or the normal turnoff.",
        )
        check(
            "!JSON.stringify(ENCOUNTER_DEFINITIONS.bandit_leader).includes('threefold_seal') && ENCOUNTER_DEFINITIONS.bandit_leader.stages.start.choices.find(choice=>choice.id==='fight').outcomes[0].victory.outcomes.some(outcome=>outcome.type==='learnAbility'&&outcome.abilityId==='sweeping_cut')",
            "Bandit Leader still granted the removed Threefold recipe or lost its focused ability reward.",
        )
        check(
            "(() => { const p=SaveSystem.createDefaultPlayerState(); const e=ExpeditionRules.createExpedition(p,{expeditionId:'old_forest_road',provisions:30,random:()=>0}); e.currentPathId='overgrown_trail'; e.distance=60; EncounterManager.force(e,'white_hart'); const a=EncounterManager.resolveChoice(e,p,'wait_beside'); const b=EncounterManager.resolveChoice(e,p,'lower_gaze'); const c=EncounterManager.resolveChoice(e,p,'open_hand'); EncounterManager.continueJourney(e); ExpeditionRules.settle(p,e,true); return a.resolved&&b.resolved&&c.awaitingContinue&&p.ownedItems.verdant_shard_grace===1&&p.campaignFlags.white_hart_shard_secured===true; })()",
            "The peaceful White Hart sequence did not secure its one-time Grace shard.",
        )
        check(
            "(() => { const p=SaveSystem.createDefaultPlayerState(); const e=ExpeditionRules.createExpedition(p,{expeditionId:'old_forest_road',provisions:30,random:()=>0}); e.currentPathId='overgrown_trail'; e.distance=60; EncounterManager.force(e,'white_hart'); const result=EncounterManager.resolveChoice(e,p,'follow_hart'); EncounterManager.continueJourney(e); const next=ExpeditionRules.createExpedition(p,{expeditionId:'old_forest_road',provisions:30,random:()=>0}); next.currentPathId='overgrown_trail'; next.distance=60; return result.awaitingContinue&&p.campaignFlags.white_hart_shard_secured!==true&&EncounterManager.eligibleDefinitions(next,p).some(entry=>entry.id==='white_hart'); })()",
            "A failed White Hart approach became permanently unavailable or granted progress.",
        )
        check(
            "(() => { const p=SaveSystem.createDefaultPlayerState(); const e=ExpeditionRules.createExpedition(p,{expeditionId:'old_forest_road',provisions:30,random:()=>0}); e.distance=140; EncounterManager.force(e,'thorn_crowned_hart'); const started=EncounterManager.resolveChoice(e,p,'stand_against_stag',{startCombat:()=>true}); const finished=EncounterManager.completeCombat(e,p,'victory'); const staged=e.pendingCampaignFlags.hostile_stag_defeated===true&&e.unsecuredLoot.some(entry=>entry.itemId==='verdant_shard_wrath'); EncounterManager.continueJourney(e); ExpeditionRules.settle(p,e,true); const next=ExpeditionRules.createExpedition(p,{expeditionId:'old_forest_road',provisions:30,random:()=>0}); next.distance=140; return started.combatStarted&&finished.awaitingContinue&&staged&&p.campaignFlags.hostile_stag_defeated===true&&!EncounterManager.eligibleDefinitions(next,p).some(entry=>entry.id==='thorn_crowned_hart'); })()",
            "The Thorn-Crowned Hart was not a guaranteed one-time Main Road combat reward.",
        )
        check(
            "(() => { const p=SaveSystem.createDefaultPlayerState(); p.currentGold=20; p.ownedItems.verdant_shard_grace=1; p.ownedItems.verdant_shard_wrath=1; const result=CraftingRules.craft(p,'verdant_heart','blacksmith',{context:'town'}); return result.applied&&p.ownedItems.verdant_heart===1&&!p.ownedItems.verdant_shard_grace&&!p.ownedItems.verdant_shard_wrath; })()",
            "The Verdant Heart recipe did not consume both persistent shards.",
        )
        check(
            "(() => { const p=SaveSystem.createDefaultPlayerState(); const first=DialogueSystem.start('hidden_village_druid_dialogue',{returnContext:{type:'destination',destinationId:'hidden_forest_village'}}); const offered=DialogueSystem.choose(first,'ask_for_favor',{player:p}); p.ownedItems.forest_communion_draught=1; p.ownedItems.verdant_heart=1; const second=DialogueSystem.start('hidden_village_druid_dialogue',{returnContext:{type:'destination',destinationId:'hidden_forest_village'}}); const completed=DialogueSystem.choose(second,'offer_draught_with_heart',{player:p}); const finished=DialogueSystem.advance(completed.session,{player:p}); return offered.rewards.some(reward=>reward.type==='recipe'&&reward.recipeId==='forest_communion_draught')&&finished.ended&&p.campaignFlags.druid_favor_complete===true&&p.learnedKnowledge.includes('song_of_the_forest')&&p.ownedItems.enchanted_verdant_heart===1&&!p.ownedItems.forest_communion_draught; })()",
            "The Druid favor did not teach, consume, complete, and awaken the Heart path.",
        )
        check(
            "(() => { const p=SaveSystem.createDefaultPlayerState(); const e=ExpeditionRules.createExpedition(p,{expeditionId:'old_forest_road',provisions:30,random:()=>0}); e.distance=180; EncounterManager.force(e,'verdant_altar'); const result=EncounterManager.resolveChoice(e,p,'inspect_altar'); return result.awaitingContinue&&result.message.includes('awakened Verdant Heart')&&!e.combat; })()",
            "The incomplete altar state did not provide a friendly retry hint without starting the boss.",
        )
        check(
            "(() => { const p=SaveSystem.createDefaultPlayerState(); p.ownedItems.glimmering_sword=1; p.equippedItems.weapon='glimmering_sword'; const e=ExpeditionRules.createExpedition(p,{expeditionId:'old_forest_road',provisions:30,random:()=>0}); const combat=CombatSystem.create(e,'verdant_warden',{random:()=>0}); const target=combat.enemies[0]; combat.status='awaitingAction'; combat.activeActorId='arthur'; combat.allies[0].gauge=100; const before=target.hp; CombatSystem.chooseAction(combat,e,'attack',target.id); const hit=combat.events.find(event=>event.action==='attack'); return target.tags.includes('verdant')&&target.tags.includes('boss')&&COMBAT_ENEMY_DEFINITIONS.verdant_warden.maxHp>128&&target.hp<before&&hit?.bonusDamage>=4; })()",
            "Verdant Warden combat traits or Glimmering Sword's natural-target advantage were not active.",
        )
        check(
            "(() => { const c=CampaignSimulationRunner.run({seed:'pass2-metrics',campaignMode:'repeated',expeditions:2,expeditionPlan:[80],strategy:'cautious',betweenExpeditionPolicy:'conservative-sustainer',startingState:{currentGold:1000,provisions:80}}); return c.oldForestProgression&&Array.isArray(c.oldForestProgression.deepestDistanceByExpedition)&&'wardenLosses' in c.oldForestProgression&&'returnFailureByDepth' in c.oldForestProgression; })()",
            "The Old Forest simulator did not expose the requested progression and failure metrics.",
        )
        check(
            "rewardRevealModel({type:'knowledge',knowledgeId:'woodcraft',quantity:1}).knowledgeId==='woodcraft' && rewardRevealModel({type:'knowledge',knowledgeId:'woodcraft',quantity:1}).name===KNOWLEDGE_DEFINITIONS.woodcraft.name",
            "Knowledge rewards did not use the dedicated reveal model.",
        )
        if devtools.console_errors:
            raise AssertionError(f"Runtime exceptions: {devtools.console_errors}")
        print(f"PASS: {checks} Old Forest Pass 2 assertions")
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
