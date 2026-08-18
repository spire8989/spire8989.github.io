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
        camp_scenario = json.dumps({
            "id": "camp-parity",
            "seed": "camp-parity-seed",
            "strategy": "cautious",
            "provisions": 20,
            "companions": [],
            "packContents": {"raw_meat": 1},
            "startingState": {
                "arthurHealth": 10,
                "selectedCompanions": [],
                "selectedCompanion": None,
                "ownedItems": {"raw_meat": 1},
                "packedItems": ["raw_meat"],
            },
            "turnaroundPolicy": {"type": "fixedDistance", "distance": 10},
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
            "(() => { const cautious=SimulationRunner.run({seed:'pace-cautious',strategy:'cautious',provisions:24,companions:[],turnaroundPolicy:{type:'fixedDistance',distance:5}}); const normal=SimulationRunner.run({seed:'pace-normal',strategy:'normal',provisions:24,companions:[],turnaroundPolicy:{type:'fixedDistance',distance:5}}); const aggressive=SimulationRunner.run({seed:'pace-aggressive',strategy:'aggressive',provisions:5,companions:[],turnaroundPolicy:{type:'fixedDistance',distance:5}}); return cautious.paceSelectedAtDeparture==='cautious'&&cautious.rationSelectedAtDeparture==='generous'&&normal.paceSelectedAtDeparture==='normal'&&normal.rationSelectedAtDeparture==='normal'&&aggressive.paceSelectedAtDeparture==='hard_push'&&aggressive.rationSelectedAtDeparture==='sparse'; })()",
            "Simulation strategies did not select their authored departure pace and ration settings",
        )
        check(
            "(() => { const normal=SimulationRunner.run({seed:'pace-cost-parity',strategy:'normal',paceId:'normal',rationId:'normal',provisions:20,companions:[],turnaroundPolicy:{type:'fixedDistance',distance:20}}); const cautious=SimulationRunner.run({seed:'pace-cost-parity',strategy:'normal',paceId:'cautious',rationId:'normal',provisions:20,companions:[],turnaroundPolicy:{type:'fixedDistance',distance:20}}); const normalExp=ExpeditionRules.createExpedition(SaveSystem.createDefaultPlayerState(),{provisions:20,companions:[],paceId:'normal',rationId:'normal'}); const cautiousExp=ExpeditionRules.createExpedition(SaveSystem.createDefaultPlayerState(),{provisions:20,companions:[],paceId:'cautious',rationId:'normal'}); return cautious.departurePassiveFoodEstimate<normal.departurePassiveFoodEstimate&&ExpeditionRules.provisionConsumptionMultiplier(cautiousExp)<ExpeditionRules.provisionConsumptionMultiplier(normalExp)&&normal.provisionsConsumed>0; })()",
            "Simulation pace/ration settings did not affect production provision consumption",
        )
        check(
            "(() => { const runs=Array.from({length:8},(_,index)=>SimulationRunner.run({seed:`ration-adaptation-${index}`,strategy:'cautious',provisions:24,companions:[],turnaroundPolicy:{type:'fixedDistance',distance:100}})); return runs.some(run=>run.rationChanges.some(change=>change.from==='generous'&&change.to==='normal'))&&runs.every(run=>run.replay.paceId===run.paceSelectedAtDeparture&&run.replay.rationId===run.rationSelectedAtDeparture); })()",
            "Simulation strategies did not adapt rations under return pressure or record replay settings",
        )
        check(
            "(() => { const run=SimulationRunner.run({seed:'brief-rest-parity',strategy:'normal',provisions:8,companions:[],startingState:{arthurHealth:20,selectedCompanions:[],selectedCompanion:null},turnaroundPolicy:{type:'fixedDistance',distance:5}}); const rest=run.briefRests[0]; return run.briefRestCount>0&&rest?.applied&&rest.cost===1&&rest.healthChanges.arthur===4&&rest.provisionsChange===-1; })()",
            "Simulation brief rest did not use ExpeditionRules or expose its resource changes",
        )
        check(
            f"(() => {{ const run=SimulationRunner.run({camp_scenario}); const cooked=run.recipesCooked[0]; return run.campsEntered>0&&run.campRestCount>0&&run.campRests[0]?.applied&&run.campRests[0].cost===2&&run.campEvents.length>0&&run.campEvents.every(event=>event.completed&&event.choices.length>0)&&run.startingMaterialBag.capacity===10&&run.startingMaterialBag.contents.raw_meat===1&&run.materialBagCapacity===10&&run.recipesCooked.length>0&&cooked.recipeId==='roasted_meat'&&cooked.ingredientsConsumed.raw_meat===1&&cooked.materialBagBefore.contents.raw_meat===1&&!cooked.materialBagAfter.contents.raw_meat&&cooked.provisionsGained===3; }})()",
            "Simulation camp flow did not rest, resolve a camp event, and cook through production rules",
        )
        check(
            f"SimulationRunner.verifyDeterminism({camp_scenario}).matches",
            "Same-seed camp, event, and cooking simulation was not deterministic",
        )
        check(
            f"(() => {{ const run=SimulationRunner.run({camp_scenario}); const csv=SimulationTelemetry.toCsv({{results:[run]}}); return csv.includes('paceSelectedAtDeparture')&&csv.includes('campEvents')&&csv.includes('recipesCooked')&&csv.includes('startingMaterialBag')&&csv.includes('materialsReturnedSafely')&&run.replay.startingPlayerState.packedMaterials.raw_meat===1&&run.events.some(event=>event.type==='camp-entered')&&run.events.some(event=>event.type==='recipe-cooked'); }})()",
            "Simulation telemetry exports did not preserve travel-management decisions and events",
        )
        check(
            "(() => { const runs=Array.from({length:200},(_,index)=>SimulationRunner.run({seed:'bandit-chain-'+index,strategy:'aggressive',provisions:30,turnaroundPolicy:{type:'fixedDistance',distance:100}})); const run=runs.find(entry=>entry.banditAmbushVictories>0&&entry.banditLeaderEncounters>0&&entry.banditLeaderVictories>0); return Boolean(run)&&run.banditAmbushEncounters>=run.banditAmbushVictories&&run.banditLeaderEligibilityTriggered>0&&run.banditGoldRecovered>=0&&run.banditLootValueRecovered>=0&&run.decisions.some(decision=>decision.type==='encounter-choice'&&decision.encounterId==='bandit_ambush'); })()",
            "Simulation combat AI did not complete the seeded bandit ambush/leader chain or expose its telemetry",
        )
        check(
            "(() => { const run=SimulationRunner.run({seed:'material-bag-overflow',strategy:'normal',provisions:10,companions:[],startingState:{materials:{raw_meat:10}},materialBagContents:{raw_meat:10},turnaroundPolicy:{type:'fixedDistance',distance:5}}); return run.startingMaterialBag.capacity===10&&run.startingMaterialBag.contents.raw_meat===10&&run.materialBagCapacity===10; })()",
            "Simulation Material Bag capacity or starting contents were not preserved",
        )
        check(
            "(() => { const run=SimulationRunner.run({seed:'material-bag-overflow',strategy:'normal',provisions:10,companions:[],startingState:{materials:{raw_meat:10}},materialBagContents:{raw_meat:10},turnaroundPolicy:{type:'fixedDistance',distance:5}}); return run.replay.startingPlayerState.packedMaterials.raw_meat===10&&run.materialBagAtEnd.capacity===10; })()",
            "Simulation Material Bag replay or ending capacity was not preserved",
        )
        check(
            "(() => { const run=SimulationRunner.run({seed:'material-bag-overflow',strategy:'normal',provisions:10,companions:[],startingState:{materials:{raw_meat:10}},materialBagContents:{raw_meat:10},turnaroundPolicy:{type:'fixedDistance',distance:5}}); return run.materialsFoundDuringExpedition&&run.materialsRejectedDueToCapacity&&Object.values(run.materialsRejectedDueToCapacity).every(quantity=>quantity>=0); })()",
            "Simulation Material Bag loot-capacity telemetry was not preserved",
        )
        check(
            f"(() => {{ const run=SimulationRunner.run({scenario}); return Number.isFinite(run.provisionsConsumed) && Number.isFinite(run.provisionsGained) && run.encounters.every(entry=>entry.completed && Array.isArray(entry.lootGained) && Array.isArray(entry.lootLost) && Array.isArray(entry.packedItemsConsumed)) && run.combats.every(combat=>Number.isFinite(combat.damageDealt)&&Number.isFinite(combat.damageReceived)); }})()",
            "Production-state telemetry fields are incomplete or invalid",
        )
        check(
            "(() => { const run=SimulationRunner.run({seed:'combat-passive-telemetry',strategy:'normal',turnaroundPolicy:{type:'fixedDistance',distance:25}}); const normalized=SimulationTelemetry.normalizeRun(run); const csv=SimulationTelemetry.toCsv({results:[run]}); return normalized.statusesAppliedById && normalized.statusDamageById && Array.isArray(normalized.equipmentPassiveTriggers) && Number.isFinite(normalized.resolveStored) && Number.isFinite(normalized.resolveSpent) && csv.includes('statusesAppliedById') && csv.includes('equipmentPassiveTriggers') && csv.includes('resolveStored') && csv.includes('resolveSpent'); })()",
            "Combat status and equipment passive telemetry was not normalized or exported",
        )
        check(
            "(() => { const seeded=GameRandom.create('direct-manager'); const player=SaveSystem.createDefaultPlayerState(); const expedition=ExpeditionRules.createExpedition(player,{provisions:24,random:seeded.random}); const nativeRandom=Math.random; Math.random=()=>{throw new Error('native Math.random reached encounter rules');}; try { for(let index=0;index<200&&!expedition.activeEncounter;index+=1) ExpeditionRules.travel(expedition,player,1); return Boolean(expedition.activeEncounter); } finally { Math.random=nativeRandom; } })()",
            "Seeded production encounter selection reached native Math.random",
        )
        check(
            "(() => { const player=SaveSystem.createDefaultPlayerState(); const itemBefore=player.ownedItems.old_coin??0; const expedition=ExpeditionRules.createExpedition(player,{provisions:5,random:GameRandom.create('settlement').random}); expedition.unsecuredLoot=[{itemId:'old_coin',quantity:1}]; expedition.goldCarried=3; ExpeditionRules.settle(player,expedition,true); const once=JSON.stringify({items:player.ownedItems,gold:player.currentGold,materials:player.materials,recipes:player.learnedRecipes}); ExpeditionRules.settle(player,expedition,true); return player.ownedItems.old_coin===itemBefore+1 && JSON.stringify({items:player.ownedItems,gold:player.currentGold,materials:player.materials,recipes:player.learnedRecipes})===once && expedition.rewardsSettled && expedition.returnRewardsRolled; })()",
            "Shared settlement duplicated secured rewards",
        )
        check(
            "(() => { const run=SimulationRunner.run({seed:'crafting-loot-telemetry',strategy:'cautious',turnaroundPolicy:{type:'fixedDistance',distance:45}}); return run.returnedSafely && run.returnRewardTier==='medium' && Array.isArray(run.returnRewardResults) && run.returnRewardResults.length>0 && run.materialsRecovered && Array.isArray(run.recipesLearned) && run.endingPlayerState.materials && Array.isArray(run.endingPlayerState.learnedRecipes) && run.lootDebugLog.some(event=>event.type==='loot-selected'); })()",
            "Simulation did not preserve crafting state or expose return-loot telemetry",
        )
        check(
            "(() => { const player=SaveSystem.createDefaultPlayerState(); player.selectedCompanion=null; const expedition=ExpeditionRules.createExpedition(player,{companion:null,provisions:5,health:40}); const combat=CombatSystem.create(expedition,'wolves',{random:()=>0}); combat.status='awaitingAction'; combat.activeActorId='arthur'; combat.allies[0].gauge=100; const target=combat.enemies[0]; target.gauge=24; const menu=CombatSystem.chooseAction(combat,expedition,'abilities'); const ability=CombatSystem.availableAbilities(combat,expedition).find(entry=>entry.id==='pommel_strike'); const result=CombatSystem.chooseAbility(combat,expedition,'pommel_strike',target.id); const event=combat.events.at(-1); return menu.menu==='abilities' && ability?.effectType==='damageAndGauge' && result.resolved && target.gauge===0 && event?.abilityId==='pommel_strike' && event?.gaugeReduction===24; })()",
            "Equipped Pommel Strike did not open, resolve, or control the enemy gauge",
        )
        check(
            "(() => { const player=SaveSystem.createDefaultPlayerState(); player.selectedCompanion=null; player.equippedItems.weapon='thorn_of_the_dolorous_vale'; player.equippedItems.relic='reliquary_of_saint_lazarus'; const expedition=ExpeditionRules.createExpedition(player,{companion:null,provisions:5,health:40}); const combat=CombatSystem.create(expedition,'wild_boar',{random:()=>0}); const arthur=combat.allies[0]; const effects=EquipmentRules.aggregateEquippedCombatEffects(expedition); const target=combat.enemies[0]; target.hp=100; combat.status='awaitingAction'; combat.activeActorId='arthur'; arthur.gauge=100; CombatSystem.chooseAction(combat,expedition,'attack',target.id); arthur.gauge=100; combat.status='awaitingAction'; combat.activeActorId='arthur'; CombatSystem.chooseAction(combat,expedition,'attack',target.id); return arthur.speed===20 && effects.combatSpeed===10 && effects.onHitEffects.some(effect=>effect.statusId==='bleeding'&&effect.sourceItemId==='thorn_of_the_dolorous_vale') && effects.onHitEffects.some(effect=>effect.statusId==='poisoned'&&effect.sourceItemId==='reliquary_of_saint_lazarus') && target.statuses.bleeding?.remainingActivations===3 && target.statuses.poisoned?.remainingActivations===4 && combat.events.filter(event=>event.type==='status-applied').length===4 && combat.events.filter(event=>event.type==='equipment-trigger'&&event.trigger==='onHit'&&event.applied).length===4; })()",
            "Equipped speed and on-hit combat effects did not aggregate and apply deterministically",
        )
        check(
            "(() => { const make=(statusId,activations)=>{ const player=SaveSystem.createDefaultPlayerState(); player.selectedCompanion=null; const expedition=ExpeditionRules.createExpedition(player,{companion:null,provisions:5,health:40}); const combat=CombatSystem.create(expedition,'wild_boar',{random:()=>0}); const target=combat.enemies[0]; target.hp=100; target.statuses={[statusId]:{statusId,remainingActivations:activations}}; for(let index=0;index<activations;index+=1) processEnemyActivationStatuses(combat,target); return {target,combat}; }; const bleeding=make('bleeding',3); const poisoned=make('poisoned',4); return bleeding.target.hp===94 && Object.keys(bleeding.target.statuses).length===0 && bleeding.combat.events.filter(event=>event.type==='status-tick'&&event.statusId==='bleeding').length===3 && poisoned.target.hp===92 && Object.keys(poisoned.target.statuses).length===0 && poisoned.combat.events.filter(event=>event.type==='status-tick'&&event.statusId==='poisoned').length===4; })()",
            "Canonical combat statuses did not tick, expire, and record their authored durations",
        )
        check(
            "(() => { const player=SaveSystem.createDefaultPlayerState(); player.selectedCompanion=null; const expedition=ExpeditionRules.createExpedition(player,{companion:null,provisions:5,health:40}); const combat=CombatSystem.create(expedition,'wild_boar',{random:()=>0}); const target=combat.enemies[0]; target.hp=1; target.statuses={bleeding:{statusId:'bleeding',remainingActivations:1}}; target.gauge=100; combat.status='running'; CombatSystem.update(combat,expedition,0); return combat.result==='victory' && !combat.events.some(event=>event.actor===target.id&&event.action); })()",
            "Enemy status damage did not resolve before a defeated enemy could act",
        )
        check(
            "COMBAT_ENEMY_DEFINITIONS.bound_warden.traits?.[0]?.type==='regeneration'&&COMBAT_ENEMY_DEFINITIONS.bound_warden.traits[0].suppressedByStatuses.includes('bleeding')&&COMBAT_ENEMY_ACTION_DEFINITIONS.warden_heavy_slam.telegraphed===true",
            "Bound Warden regeneration, suppression metadata, or heavy-attack telegraph was not authored",
        )
        check(
            "(() => { const player=SaveSystem.createDefaultPlayerState(); player.selectedCompanion=null; const expedition=ExpeditionRules.createExpedition(player,{companion:null,provisions:10,health:40}); const combat=CombatSystem.create(expedition,'bound_warden',{random:()=>0}); const enemy=combat.enemies[0]; enemy.hp=80; enemy.statuses={bleeding:{statusId:'bleeding',remainingActivations:3}}; enemy.gauge=100; combat.status='running'; CombatSystem.update(combat,expedition,0); const suppressed=enemy.hp===78&&combat.events.some(event=>event.type==='enemy-trait'&&event.traitType==='regeneration'&&event.suppressedByStatuses.includes('bleeding')); delete enemy.statuses.bleeding; enemy.gauge=100; CombatSystem.update(combat,expedition,0); return suppressed&&enemy.hp===82&&combat.events.filter(event=>event.type==='enemy-trait'&&event.traitType==='regeneration').at(-1)?.appliedAmount===4; })()",
            "Bound Warden regeneration did not heal at activation or respect status suppression",
        )
        check(
            "(() => { const player=SaveSystem.createDefaultPlayerState(); player.selectedCompanion=null; player.equippedItems.relic='shard_of_the_perron'; const expedition=ExpeditionRules.createExpedition(player,{companion:null,provisions:10,health:40}); const combat=CombatSystem.create(expedition,'bound_warden',{random:()=>0}); combat.status='awaitingAction'; combat.activeActorId='arthur'; combat.allies[0].gauge=100; combat.enemies[0].gauge=100; return SimulationStrategies.cautious.chooseCombatAction(combat,expedition,{random:()=>0})==='defend'&&SimulationStrategies.aggressive.chooseCombatAction(combat,expedition,{random:()=>0})==='defend'; })()",
            "Cautious and aggressive strategies did not use a generic equipped Defend trigger against an imminent Warden attack",
        )
        check(
            "(() => { const make=(armor)=>{ const player=SaveSystem.createDefaultPlayerState(); player.selectedCompanion=null; player.equippedItems.armor=armor; player.equippedItems.relic='shard_of_the_perron'; const expedition=ExpeditionRules.createExpedition(player,{companion:null,provisions:5,health:40}); const combat=CombatSystem.create(expedition,'wild_boar',{random:()=>0}); const arthur=combat.allies[0]; const enemy=combat.enemies[0]; combat.status='awaitingAction'; combat.activeActorId='arthur'; arthur.gauge=100; enemy.gauge=100; enemy.intentId='boar_charge'; CombatSystem.chooseAction(combat,expedition,'defend'); CombatSystem.update(combat,expedition,0); return {combat,arthur}; }; const normal=make('quilted_hauberk'); const godly=make('godly_armor'); const player=SaveSystem.createDefaultPlayerState(); player.selectedCompanion=null; player.equippedItems.relic='shard_of_the_perron'; const expedition=ExpeditionRules.createExpedition(player,{companion:null,provisions:5,health:40}); const combat=CombatSystem.create(expedition,'wild_boar',{random:()=>0}); const arthur=combat.allies[0]; const target=combat.enemies[0]; arthur.combatCharges.resolve=10; combat.status='awaitingAction'; combat.activeActorId='arthur'; arthur.gauge=100; const opened=CombatSystem.chooseAction(combat,expedition,'abilities'); CombatSystem.chooseAbility(combat,expedition,'pommel_strike',target.id); const preserved=arthur.combatCharges.resolve===10; arthur.gauge=100; combat.status='awaitingAction'; combat.activeActorId='arthur'; CombatSystem.chooseAction(combat,expedition,'attack',target.id); const attack=combat.events.find(event=>event.action==='attack'); return normal.arthur.combatCharges.resolve>0 && normal.arthur.combatCharges.resolve<=10 && !godly.arthur.combatCharges.resolve && opened.menu==='abilities' && preserved && arthur.combatCharges.resolve===0 && attack?.bonusDamage===10; })()",
            "Perron Resolve did not store only prevented damage, cap, skip abilities, and spend on a normal attack",
        )
        check(
            "(() => { const passiveLess={...ITEM_DEFINITIONS.thorn_of_the_dolorous_vale,effects:{...ITEM_DEFINITIONS.thorn_of_the_dolorous_vale.effects}}; delete passiveLess.effects.combatSpeed; delete passiveLess.effects.onHitEffects; return Number.isFinite(EquipmentRules.scoreItem(ITEM_DEFINITIONS.thorn_of_the_dolorous_vale)) && EquipmentRules.scoreItem(ITEM_DEFINITIONS.thorn_of_the_dolorous_vale)>EquipmentRules.scoreItem(passiveLess) && JSON.stringify(ENCOUNTER_DEFINITIONS.briar_knight).includes('thorn_of_the_dolorous_vale') && JSON.stringify(ENCOUNTER_DEFINITIONS.leper_knight).includes('reliquary_of_saint_lazarus') && JSON.stringify(ENCOUNTER_DEFINITIONS.barenton_fountain_ritual).includes('shard_of_the_perron') && !Object.values(SHOP_DEFINITIONS).some(shop=>JSON.stringify(shop).includes('thorn_of_the_dolorous_vale')||JSON.stringify(shop).includes('reliquary_of_saint_lazarus')||JSON.stringify(shop).includes('shard_of_the_perron')); })()",
            "New combat equipment was not scored and acquired through the authored unique reward paths",
        )
        check(
            "(() => { const player=SaveSystem.createDefaultPlayerState(); player.selectedCompanion=null; player.learnedAbilityIds=[]; player.selectedActiveAbilityIds=[]; player.selectedPassiveAbilityIds=[]; player.equippedItems.weapon='fine_hunting_knife'; const expedition=ExpeditionRules.createExpedition(player,{companion:null,provisions:5,health:40}); const combat=CombatSystem.create(expedition,'wild_boar',{random:()=>0}); combat.status='awaitingAction'; combat.activeActorId='arthur'; combat.allies[0].gauge=100; const noGrant=CombatSystem.availableAbilities(combat,expedition).length===0; player.equippedItems.weapon='arthur_sword'; const withSword=CombatSystem.create(ExpeditionRules.createExpedition(player,{companion:null,provisions:5,health:40}),'wild_boar',{random:()=>0}); withSword.status='awaitingAction'; withSword.activeActorId='arthur'; withSword.allies[0].gauge=100; const opened=CombatSystem.chooseAction(withSword,withSword.expedition,'abilities'); const before=withSword.allies[0].gauge; const backed=CombatSystem.chooseAction(withSword,withSword.expedition,'back'); return noGrant && opened.menu==='abilities' && backed.menu==='main' && withSword.interactionMode==='main' && withSword.allies[0].gauge===before; })()",
            "Ability grants were not equipment-driven or Back from Abilities consumed the turn",
        )
        check(
            "(() => { const player=SaveSystem.createDefaultPlayerState(); player.selectedCompanion=null; player.ownedItems.bandages=2; const expedition=ExpeditionRules.createExpedition(player,{companion:null,provisions:5,health:20,packedItems:['bandages']}); const combat=CombatSystem.create(expedition,'wild_boar',{random:()=>0}); combat.status='awaitingAction'; combat.activeActorId='arthur'; combat.allies[0].gauge=100; const menu=CombatSystem.chooseAction(combat,expedition,'items'); const result=CombatSystem.chooseItem(combat,expedition,'bandages'); return menu.menu==='items' && result.resolved && combat.allies[0].hp===28 && expedition.carriedItems.bandages===1 && expedition.consumedItems.bandages===1 && combat.events.at(-1)?.healingAmount===8; })()",
            "Combat Bandages did not heal, consume, and record one carried item",
        )
        check(
            "(() => { const player=SaveSystem.createDefaultPlayerState(); player.selectedCompanions=[]; player.selectedCompanion=null; player.materials={}; player.packedMaterials={}; const expedition=ExpeditionRules.createExpedition(player,{companions:[],provisions:10,random:()=>0}); EncounterManager.force(expedition,'wolves_in_brush'); const started=EncounterManager.resolveChoice(expedition,player,'stand_ground',{startCombat:()=>true}); const completed=EncounterManager.completeCombat(expedition,player,'victory'); const reward=expedition.activeEncounter.rewards.find(entry=>entry.materialId==='raw_meat'); return started.combatStarted&&completed.awaitingContinue&&reward?.quantity===3; })()",
            "Three-wolf victory did not stage exactly three raw meat",
        )
        check(
            "(() => { const amounts=Array.from({length:40},(_,index)=>{ const player=SaveSystem.createDefaultPlayerState(); player.selectedCompanions=[]; player.selectedCompanion=null; const expedition=ExpeditionRules.createExpedition(player,{companions:[],provisions:10,random:GameRandom.create('bandit-food-'+index).random}); EncounterManager.force(expedition,'bandit_ambush'); const started=EncounterManager.resolveChoice(expedition,player,'fight',{startCombat:()=>true}); EncounterManager.completeCombat(expedition,player,'victory'); return started.combatStarted ? expedition.provisions-10 : -1; }); return amounts.some(amount=>amount>=2&&amount<=4)&&amounts.some(amount=>amount===0)&&amounts.every(amount=>amount===0||(amount>=2&&amount<=4)); })()",
            "Normal bandit victories did not produce a seeded sometimes-2–4 provision reward branch",
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
        check(
            "(() => { const player=SaveSystem.createDefaultPlayerState(); player.selectedCompanions=[]; player.selectedCompanion=null; const expedition=ExpeditionRules.createExpedition(player,{companions:[],provisions:10,random:()=>0}); const first=InjuryRules.applyToExpedition(expedition,'arthur','sprained_ankle',{source:'test'}); const second=InjuryRules.applyToExpedition(expedition,'arthur','deep_cut',{source:'test'}); const duplicate=InjuryRules.applyToExpedition(expedition,'arthur','sprained_ankle',{source:'test'}); const blocked=InjuryRules.applyToExpedition(expedition,'arthur','poisoned',{source:'test'}); return first.applied&&second.applied&&duplicate.reason==='duplicate'&&blocked.reason==='maximum-active'&&InjuryRules.forCharacter(expedition,'arthur').length===2&&InjuryRules.effectiveMaxHealth(expedition,'arthur')===38&&InjuryRules.travelSpeedMultiplier(expedition,'arthur')<1; })()",
            "Injury application did not enforce authored effects, duplicate protection, or the two-injury cap",
        )
        check(
            "(() => { const player=SaveSystem.createDefaultPlayerState(); player.selectedCompanions=[]; player.selectedCompanion=null; const expedition=ExpeditionRules.createExpedition(player,{companions:[],provisions:10,random:()=>0}); EncounterManager.force(expedition,'bandit_ambush'); expedition.activeEncounter.phase='combat'; expedition.activeEncounter.combatResolution={victory:{resultText:'Victory',outcomes:[{type:'learnRecipe',recipeId:'glimmering_sword'},{type:'learnRecipe',recipeId:'glimmering_sword'}]},fled:{outcomes:[]}}; const result=EncounterManager.completeCombat(expedition,player,'victory'); return result.awaitingContinue&&expedition.unsecuredRecipes.length===1&&expedition.unsecuredRecipes[0]==='glimmering_sword'&&expedition.activeEncounter.rewards.filter(reward=>reward.type==='recipe').length===1; })()",
            "Direct recipe rewards did not work through combat victory or deduplicate staged recipes",
        )
        check(
            "(() => { const player=SaveSystem.createDefaultPlayerState(); player.selectedCompanions=[]; player.selectedCompanion=null; const expedition=ExpeditionRules.createExpedition(player,{companions:[],provisions:10,random:()=>0}); const before=expedition.provisions; EncounterManager.force(expedition,'bandit_ambush'); expedition.activeEncounter.phase='combat'; expedition.activeEncounter.combatResolution={victory:{resultText:'Victory',outcomes:[{type:'startDialogue',dialogueId:'reeve_after_intro'},{type:'modifyResource',resource:'provisions',amount:-1}]},fled:{outcomes:[]}}; const started=EncounterManager.completeCombat(expedition,player,'victory',{startDialogue:()=>true}); const paused=expedition.activeEncounter.phase==='dialogue'&&expedition.provisions===before; let session=DialogueSystem.start('reeve_after_intro',{player,expedition}); let result=null; let steps=0; while(session&&steps++<20){ const choices=DialogueSystem.availableChoices(session,{player,expedition}); result=choices.length?DialogueSystem.choose(session,choices[0].id,{player,expedition}):DialogueSystem.advance(session,{player,expedition}); session=result.session; if(result.ended) break; } const completed=EncounterManager.completeDialogue(expedition,player,result,{startDialogue:()=>true}); return started.dialogueStarted&&paused&&result?.ended&&completed.awaitingContinue&&expedition.activeEncounter.phase==='result'&&expedition.provisions===before-1; })()",
            "Combat victory dialogue did not suspend and resume its encounter flow exactly once",
        )
        check(
            "(() => { const player=SaveSystem.createDefaultPlayerState(); player.campaignFlags.dialogue_test=true; player.ownedItems.rope=1; return DialogueSystem.conditionsMet([{type:'campaignFlag',flag:'dialogue_test'},{type:'ownsItem',itemId:'rope'}],{player})&&!DialogueSystem.conditionsMet([{type:'carriedItem',itemId:'rope'}],{player})&&DialogueSystem.conditionsMet([{type:'notKnowledge',knowledgeId:'forest_road_lore'}],{player}); })()",
            "Dialogue requirements did not reuse shared player context or safely reject expedition-only requirements in town",
        )
        check(
            "(() => { const authored={id:'timed_fixture',craftingDurationMs:4321}; return CraftingRules.durationMs('blacksmith',authored)===4321&&CraftingRules.durationMs('blacksmith',{id:'default_fixture'})===CRAFTING_TUNING.providerDurations.blacksmith&&CraftingRules.durationMs('missing',{id:'fallback_fixture'})===CRAFTING_TUNING.defaultDurationMs; })()",
            "Recipe-specific crafting durations did not override provider defaults safely",
        )
        check(
            "(() => { const player=SaveSystem.createDefaultPlayerState(); player.selectedCompanions=[]; player.selectedCompanion=null; const expedition=ExpeditionRules.createExpedition(player,{companions:[],provisions:10,random:()=>0}); InjuryRules.applyToExpedition(expedition,'arthur','deep_cut',{source:'persistence'}); ExpeditionRules.settle(player,expedition,true); const next=ExpeditionRules.createExpedition(player,{companions:[],provisions:10,random:()=>0}); return InjuryRules.has(player,'arthur','deep_cut')&&InjuryRules.has(next,'arthur','deep_cut')&&next.health<=38; })()",
            "Injuries did not persist through settlement and the next expedition",
        )
        check(
            "(() => { const player=SaveSystem.createDefaultPlayerState(); player.selectedCompanions=[]; player.selectedCompanion=null; player.injuries={arthur:['deep_cut']}; player.ownedItems.healing_poultice=1; const wrong=InjuryRules.treatWithItem(player,'arthur','antidote'); const right=InjuryRules.treatWithItem(player,'arthur','healing_poultice'); return wrong.reason==='wrong-treatment'&&player.ownedItems.antidote===undefined&&right.applied&&player.ownedItems.healing_poultice===undefined&&!InjuryRules.has(player,'arthur','deep_cut'); })()",
            "Injury treatment did not require the correct real medical item",
        )
        check(
            "(() => { const make=(pace)=>{ const player=SaveSystem.createDefaultPlayerState(); player.selectedCompanions=[]; player.selectedCompanion=null; const e=ExpeditionRules.createExpedition(player,{companions:[],provisions:10,random:()=>0.1}); e.paceId=pace; e.nextEncounterAt=999; InjuryRules.checkTravelRisk(e,player,12); return InjuryRules.has(e,'arthur','sprained_ankle'); }; return !make('cautious')&&make('hard_push'); })()",
            "Cautious and Hard Push did not use different seeded terrain-injury risk",
        )
        check(
            "(() => { const make=seed=>{ const player=SaveSystem.createDefaultPlayerState(); player.selectedCompanions=[]; player.selectedCompanion=null; const e=ExpeditionRules.createExpedition(player,{companions:[],provisions:10,random:GameRandom.create(seed).random}); e.rationId='sparse'; InjuryRules.checkTravelRisk(e,player,18); return JSON.stringify(e.injuries); }; return make('sparse-seed')===make('sparse-seed'); })()",
            "Sparse-ration exhaustion risk was not deterministic under a seed",
        )
        check(
            "(() => { const player=SaveSystem.createDefaultPlayerState(); player.selectedCompanions=[]; player.selectedCompanion=null; player.learnedRecipes=['roasted_meat']; player.materials.raw_meat=1; player.packedMaterials={raw_meat:1}; const e=ExpeditionRules.createExpedition(player,{companions:[],provisions:5,random:()=>0}); const result=CraftingRules.craft(player,'roasted_meat','campfire',{expedition:e}); return result.applied&&result.provisions===3&&e.provisions===8&&MaterialRules.expeditionQuantity(e,'raw_meat')===0; })()",
            "Simulation cooking did not use the real recipe and Material Bag mutations",
        )
        check(
            "(() => { const make=seed=>{ const player=SaveSystem.createDefaultPlayerState(); player.selectedCompanions=[]; player.selectedCompanion=null; const e=ExpeditionRules.createExpedition(player,{companions:[],provisions:10,random:GameRandom.create(seed).random}); e.travelState='paused'; ExpeditionRules.enterCamp(e); const rest=ExpeditionRules.restAtCamp(e,player); return {event:rest.eventId,active:e.activeEncounter?.encounterId??null}; }; const a=make('camp-event-seed'); const b=make('camp-event-seed'); return a.event&&a.event===b.event&&JSON.stringify(a)===JSON.stringify(b); })()",
            "Camp event selection did not remain contextual and deterministic",
        )
        check(
            "(() => { const player=SaveSystem.createDefaultPlayerState(); player.selectedCompanions=[]; player.selectedCompanion=null; const e=ExpeditionRules.createExpedition(player,{companions:[],provisions:10,health:45}); e.travelState='paused'; const before=e.provisions; const rest=ExpeditionRules.briefRest(e); const cautious=SimulationTravelPolicy.chooseAction({...e,travelState:'traveling'},'cautious',{lastRestDistance:null,lastCampDistance:null}); const random=SimulationTravelPolicy.chooseAction({...e,travelState:'traveling'},'random',{lastRestDistance:null,lastCampDistance:null}); return !rest.applied&&rest.reason==='no-benefit'&&e.provisions===before&&cautious==='continue'&&random==='continue'; })()",
            "A useless brief rest was still available to a full-health cautious or random bot",
        )
        check(
            "(() => { const player=SaveSystem.createDefaultPlayerState(); player.selectedCompanions=[]; player.selectedCompanion=null; const e=ExpeditionRules.createExpedition(player,{companions:[],provisions:5,health:20}); e.distance=50; e.maxDistanceReached=50; const action=SimulationTravelPolicy.chooseAction(e,'cautious',{lastRestDistance:null,lastCampDistance:null}); return action==='continue'; })()",
            "Optional rest did not preserve a cautious bot's safe return provisions",
        )
        check(
            "(() => { const player=SaveSystem.createDefaultPlayerState(); player.selectedCompanions=[]; player.selectedCompanion=null; const e=ExpeditionRules.createExpedition(player,{companions:[],provisions:10,health:40}); e.distance=10; e.rationId='generous'; InjuryRules.applyToExpedition(e,'arthur','exhaustion',{source:'test'}); return SimulationTravelPolicy.chooseAction(e,'cautious',{lastRestDistance:null,lastCampDistance:null})==='camp'; })()",
            "Cautious exhaustion policy did not prefer a reasonable camp rest",
        )
        check(
            "(() => { const player=SaveSystem.createDefaultPlayerState(); player.selectedCompanions=[]; player.selectedCompanion=null; const e=ExpeditionRules.createExpedition(player,{companions:[],provisions:20,random:()=>0}); const gained=InjuryRules.applyToExpedition(e,'arthur','sprained_ankle',{source:'test'}); const rolled=InjuryRules.forCharacter(e,'arthur')[0]; const original=rolled.originalRecoveryDistance; e.nextEncounterAt=999; ExpeditionRules.travel(e,player,10); const afterTen=InjuryRules.forCharacter(e,'arthur')[0]?.remainingRecoveryDistance; ExpeditionRules.travel(e,player,15); return gained.applied&&original===25&&afterTen===15&&!InjuryRules.has(e,'arthur','sprained_ankle')&&e.injuryEvents.filter(event=>event.type==='injury-gained'&&event.injuryId==='sprained_ankle').length===1&&e.injuryEvents.filter(event=>event.type==='injury-recovered'&&event.injuryId==='sprained_ankle').length===1; })()",
            "Sprained Ankle did not roll once, advance by travel, and recover exactly once",
        )
        check(
            "(() => { const player=SaveSystem.createDefaultPlayerState(); player.selectedCompanions=[]; player.selectedCompanion=null; const e=ExpeditionRules.createExpedition(player,{companions:[],provisions:50,random:()=>0}); e.nextEncounterAt=999; InjuryRules.applyToExpedition(e,'arthur','bruised_ribs',{source:'test'}); ExpeditionRules.travel(e,player,35); return !InjuryRules.has(e,'arthur','bruised_ribs')&&e.injuryEvents.some(event=>event.type==='injury-recovered'&&event.injuryId==='bruised_ribs'); })()",
            "Bruised Ribs did not naturally clear after its authored recovery range",
        )
        check(
            "(() => { const player=SaveSystem.createDefaultPlayerState(); player.selectedCompanions=[]; player.selectedCompanion=null; const e=ExpeditionRules.createExpedition(player,{companions:[],provisions:40,health:20,random:()=>0}); e.nextEncounterAt=999; const applied=InjuryRules.applyToExpedition(e,'arthur','poisoned',{source:'test'}); const before=e.health; ExpeditionRules.travel(e,player,4); const afterFour=e.health; ExpeditionRules.travel(e,player,12); const afterSixteen=e.health; const ticks=e.injuryEvents.filter(event=>event.type==='injury-travel-damage'&&event.injuryId==='poisoned'); const treated=InjuryRules.remove(e,'arthur','poisoned',{method:'antidote'}); const afterTreatment=e.health; ExpeditionRules.travel(e,player,20); return applied.applied&&before===20&&afterFour===20&&afterSixteen===17&&ticks.length===3&&treated.applied&&afterTreatment===17&&!InjuryRules.has(e,'arthur','poisoned')&&!e.injuryEvents.some((event,index)=>index>e.injuryEvents.indexOf(ticks.at(-1))&&event.type==='injury-travel-damage'&&event.injuryId==='poisoned'); })()",
            "Poison did not tick exactly every five leagues, cross multiple intervals, or stop after Antidote",
        )
        check(
            "(() => { const make=seed=>{ const player=SaveSystem.createDefaultPlayerState(); player.selectedCompanions=['sir_kay']; player.selectedCompanion='sir_kay'; const e=ExpeditionRules.createExpedition(player,{companions:['sir_kay'],provisions:20,random:GameRandom.create(seed).random}); e.nextEncounterAt=999; InjuryRules.applyToExpedition(e,'sir_kay','poisoned',{source:'test'}); const before=e.companionCombatHp.sir_kay; ExpeditionRules.travel(e,player,10); return {before,after:e.companionCombatHp.sir_kay,events:e.injuryEvents.filter(event=>event.type==='injury-travel-damage').map(event=>({characterId:event.characterId,amount:event.amount,healthAfter:event.healthAfter}))}; }; const first=make('poison-companion'); const second=make('poison-companion'); return first.before===second.before&&first.after===first.before-2&&JSON.stringify(first)===JSON.stringify(second)&&first.events.every(event=>event.characterId==='sir_kay'); })()",
            "Generic travel damage did not support companions deterministically",
        )
        check(
            "(() => { const player=SaveSystem.createDefaultPlayerState(); player.selectedCompanions=[]; player.selectedCompanion=null; const e=ExpeditionRules.createExpedition(player,{companions:[],provisions:10,random:()=>0}); InjuryRules.applyToExpedition(e,'arthur','sprained_ankle',{source:'test'}); e.travelState='paused'; ExpeditionRules.enterCamp(e); const rest=ExpeditionRules.restAtCamp(e,player); return rest.applied&&rest.recoveryAccelerated[0]?.distanceReduced===8&&InjuryRules.forCharacter(e,'arthur')[0]?.remainingRecoveryDistance===17; })()",
            "Camp rest did not accelerate physical injury recovery through ExpeditionRules",
        )
        check(
            "(() => { const player=SaveSystem.createDefaultPlayerState(); player.selectedCompanions=[]; player.selectedCompanion=null; player.currentGold=10; InjuryRules.apply(player,'arthur','sprained_ankle',{source:'test'}); const before=InjuryRules.forCharacter(player,'arthur')[0].remainingRecoveryDistance; const rest=HealingRules.restAtInn(player); const after=InjuryRules.forCharacter(player,'arthur')[0].remainingRecoveryDistance; return rest.applied&&before===35&&after===20&&rest.recoveryAccelerated[0]?.distanceReduced===15; })()",
            "Inn rest did not accelerate physical injury recovery through HealingRules",
        )
        check(
            "(() => { let rolls=[0,0.1]; const player=SaveSystem.createDefaultPlayerState(); player.selectedCompanions=[]; player.selectedCompanion=null; const e=ExpeditionRules.createExpedition(player,{companions:[],provisions:30,random:()=>rolls.shift()??0.1}); InjuryRules.applyToExpedition(e,'arthur','deep_cut',{source:'test'}); e.nextEncounterAt=999; ExpeditionRules.travel(e,player,12); return !InjuryRules.has(e,'arthur','deep_cut')&&InjuryRules.has(e,'arthur','infection')&&e.injuryEvents.filter(event=>event.type==='injury-infected').length===1&&e.injuryEvents.filter(event=>event.type==='injury-gained'&&event.injuryId==='infection').length===1; })()",
            "Untreated Deep Cut did not produce one deterministic infection event",
        )
        check(
            "(() => { let rolls=[0,0.1]; const player=SaveSystem.createDefaultPlayerState(); player.selectedCompanions=[]; player.selectedCompanion=null; player.injuries={arthur:[{injuryId:'deep_cut',remainingRecoveryDistance:30,originalRecoveryDistance:30,stabilized:true,infectionChecked:false,infectionRoll:0}],sir_kay:[],llamrei:[]}; const e=ExpeditionRules.createExpedition(player,{companions:[],provisions:30,random:()=>rolls.shift()??0.1}); e.nextEncounterAt=999; ExpeditionRules.travel(e,player,12); return InjuryRules.has(e,'arthur','deep_cut')&&!InjuryRules.has(e,'arthur','infection'); })()",
            "A stabilized Deep Cut still became infected",
        )
        check(
            "(() => { const player=SaveSystem.createDefaultPlayerState(); player.selectedCompanions=[]; player.selectedCompanion=null; player.injuries={arthur:[{injuryId:'infection',remainingRecoveryDistance:null,originalRecoveryDistance:null}],sir_kay:[],llamrei:[]}; const e=ExpeditionRules.createExpedition(player,{companions:[],provisions:50,random:()=>0}); e.nextEncounterAt=999; ExpeditionRules.travel(e,player,50); const stillThere=InjuryRules.has(e,'arthur','infection'); player.ownedItems.healing_poultice=1; const treated=InjuryRules.treatWithItem(player,'arthur','healing_poultice'); return stillThere&&treated.applied&&!InjuryRules.has(player,'arthur','infection'); })()",
            "Infection incorrectly recovered through travel or bypassed its treatment path",
        )
        check(
            "(() => { const player=SaveSystem.createDefaultPlayerState(); player.selectedCompanions=[]; player.selectedCompanion=null; const e=ExpeditionRules.createExpedition(player,{companions:[],provisions:10,random:()=>0}); InjuryRules.applyToExpedition(e,'arthur','exhaustion',{source:'test'}); return e.injuryEvents.filter(event=>event.type==='injury-gained'&&event.injuryId==='exhaustion').length===1&&e.injuryEvents.filter(event=>event.injuryId==='exhaustion').length===1&&e.injuryEvents[0].applied===true&&Number.isFinite(e.injuryEvents[0].distance); })()",
            "Injury telemetry still double-counted an Exhaustion application",
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
