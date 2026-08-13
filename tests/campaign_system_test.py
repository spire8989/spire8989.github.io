"""Persistent health, Inn healing, and campaign-simulation browser regressions."""

from __future__ import annotations

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
    os.chdir(ROOT)
    http_port = free_port()
    debug_port = free_port()
    server = ThreadingHTTPServer(("127.0.0.1", http_port), QuietHandler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    profile = Path(tempfile.mkdtemp(prefix="grail-campaign-test-"))
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
        time.sleep(0.3)
        devtools.evaluate("localStorage.clear(); location.reload()")
        time.sleep(0.3)

        def check(expression: str, label: str):
            nonlocal checks
            if not devtools.evaluate(expression):
                raise AssertionError(label)
            checks += 1

        check("PLAYER_CHARACTER_DEFINITION.combat.maxHp===40 && game.player.arthurHealth===40", "Arthur's authoritative/reset health is not 40")
        check("COMPANION_DEFINITIONS.sir_kay.combat.maxHp===50 && game.player.saveVersion===6 && game.player.companionStates.sir_kay.health===50", "Kay's data-defined/reset health is not 50")
        check("sanitizePlayerState({saveVersion:5},SaveSystem.createDefaultPlayerState()).arthurHealth===40", "Old save did not migrate to valid persistent health")
        check("sanitizePlayerState({saveVersion:6,companionStates:{sir_kay:{health:85}}},SaveSystem.createDefaultPlayerState()).companionStates.sir_kay.health===50", "Old Kay health above the new maximum was not clamped")

        devtools.click('[data-action="enter-location"]')
        devtools.click('[data-destination-id="inn"]')
        devtools.evaluate("game.player.arthurHealth=20; game.player.companionStates.sir_kay.health=30; game.player.selectedCompanion='sir_kay'; game.player.currentGold=12; savePlayer(); renderDestination()")
        check("document.body.textContent.includes(\"Arthur's Health: 20 / 40\") && document.body.textContent.includes(\"Sir Kay's Health: 30 / 50\") && document.body.textContent.match(/Restore 10 health/g).length===2 && document.body.textContent.includes('whole active party')", "Inn did not show both active-party health quotes")
        devtools.click('[data-action="rest-at-inn"]')
        check("game.player.arthurHealth===30 && game.player.companionStates.sir_kay.health===40 && game.player.currentGold===9 && document.body.textContent.includes('active party rests')", "One flat-cost Inn rest did not heal Arthur and Kay")
        check("SaveSystem.load().arthurHealth===30 && SaveSystem.load().companionStates.sir_kay.health===40 && SaveSystem.load().currentGold===9", "Party healing did not persist through save/load")

        devtools.evaluate("game.player.arthurHealth=35; game.player.companionStates.sir_kay.health=45; game.player.currentGold=12; renderDestination()")
        devtools.click('[data-action="rest-at-inn"]')
        check("game.player.arthurHealth===40 && game.player.companionStates.sir_kay.health===50 && game.player.currentGold===9", "Party rest exceeded a maximum or charged more than once")
        check("document.querySelector('[data-action=\"rest-at-inn\"]')?.disabled && HealingRules.quoteInnRest(game.player).goldCost===0", "Full-health rest can still charge resources")

        devtools.evaluate("game.player.arthurHealth=20; game.player.companionStates.sir_kay.health=30; game.player.currentGold=2; savePlayer(); renderDestination()")
        check("!HealingRules.quoteInnRest(game.player).available && document.body.textContent.includes('Cannot Afford Rest')", "Unaffordable Inn healing is not clearly blocked")
        check("(() => { const before=JSON.stringify(game.player); const result=HealingRules.restAtInn(game.player); return !result.applied && JSON.stringify(game.player)===before; })()", "Unaffordable healing mutated player resources")
        check("(() => { const player=SaveSystem.createDefaultPlayerState(); player.selectedCompanion=null; player.arthurHealth=20; player.companionStates.sir_kay.health=30; const result=HealingRules.restAtInn(player); return player.arthurHealth===30 && player.companionStates.sir_kay.health===30 && result.partyMembers.length===1; })()", "A non-selected companion was healed")

        check("(() => { game.player.selectedCompanion='sir_kay'; game.player.arthurHealth=35; game.player.companionStates.sir_kay.health=40; game.player.currentGold=10; game.player.provisions=24; const expedition=ExpeditionRules.startExpedition(game.player,{provisions:5}); expedition.health=27; expedition.companionCombatHp.sir_kay=22; ExpeditionRules.settle(game.player,expedition,true); const persisted=game.player.arthurHealth===27&&game.player.companionStates.sir_kay.health===22; CampaignRules.enterLocation(game.player); const next=ExpeditionRules.startExpedition(game.player,{provisions:5}); return persisted && next.health===27 && next.companionCombatHp.sir_kay===22; })()", "Party damage reset on settlement, town entry, or next expedition start")
        check("(() => { game.expedition=null; game.player.arthurHealth=35; game.player.provisions=24; game.preparationMode='expedition'; game.preparationSupplies=5; startExpedition(); game.expedition.health=29; completeReturn(); const settled=game.screen==='summary'&&game.player.arthurHealth===29&&SaveSystem.load().arthurHealth===29; showLocation(); game.preparationMode='expedition'; game.preparationSupplies=5; startExpedition(); const carried=game.expedition.health===29; game.expedition=null; showScreen('campaign'); return settled&&carried; })()", "Normal game return/save/next departure did not preserve damage")
        check("(() => { const a=SaveSystem.createDefaultPlayerState(); const b=SaveSystem.createDefaultPlayerState(); a.arthurHealth=b.arthurHealth=20; a.companionStates.sir_kay.health=b.companionStates.sir_kay.health=30; a.currentGold=b.currentGold=10; const inn=HealingRules.restAtInn(a); const decision=applyBetweenExpeditionPolicy(b,CampaignRules.createShopStocks(),BetweenExpeditionPolicies['conservative-sustainer'],25,true); return JSON.stringify(inn.healingByPartyMember)===JSON.stringify(decision.healing.healingByPartyMember) && a.arthurHealth===b.arthurHealth && a.companionStates.sir_kay.health===b.companionStates.sir_kay.health && inn.goldCost===decision.healing.goldCost && a.currentGold===b.currentGold; })()", "Inn and campaign party healing diverged")
        check("(() => { const campaign=CampaignSimulationRunner.run({seed:'revive-kay',expeditions:1,turnaroundDistance:1,startingState:{arthurHealth:20,companionStates:{sir_kay:{health:0}},currentGold:100,provisions:30}}); return campaign.stopReason!=='required-companion-unavailable' && campaign.betweenExpeditionDecisions[0].healing.healingByPartyMember.sir_kay===10 && campaign.healingByPartyMember.sir_kay===10 && campaign.totalHealingCost===3; })()", "Campaign stopped before normal party healing or omitted per-member telemetry")
        check("(() => { const policy=BetweenExpeditionPolicies['aggressive-reinvestor']; const above=SaveSystem.createDefaultPlayerState(); above.arthurHealth=25; above.currentGold=100; const aboveDecision=applyBetweenExpeditionPolicy(above,CampaignRules.createShopStocks(),policy,25,true); const boundary=SaveSystem.createDefaultPlayerState(); boundary.arthurHealth=24; boundary.currentGold=100; const boundaryDecision=applyBetweenExpeditionPolicy(boundary,CampaignRules.createShopStocks(),policy,25,true); const below=SaveSystem.createDefaultPlayerState(); below.arthurHealth=23; below.currentGold=100; const belowDecision=applyBetweenExpeditionPolicy(below,CampaignRules.createShopStocks(),policy,25,true); return policy.healingThreshold===0.6 && !aboveDecision.healing.attempted && boundaryDecision.healing.applied && boundary.arthurHealth===34 && belowDecision.healing.applied && below.arthurHealth===33 && boundaryDecision.healingThresholdComparison==='at-or-below'; })()", "Aggressive healing threshold or exact-boundary behavior is invalid")
        check("(() => { const player=SaveSystem.createDefaultPlayerState(); player.arthurHealth=20; player.companionStates.sir_kay.health=30; player.currentGold=2; player.provisions=30; const decision=applyBetweenExpeditionPolicy(player,CampaignRules.createShopStocks(),BetweenExpeditionPolicies['aggressive-reinvestor'],25,true); const kay=decision.healing.partyMembers.find(member=>member.id==='sir_kay'); return decision.healing.attempted && !decision.healing.applied && decision.healing.healthBefore===20 && decision.healing.healthAfter===20 && decision.healing.healingAmount===0 && decision.healing.quotedHealthAfter===30 && decision.healing.quotedHealingAmount===10 && decision.healing.goldCost===0 && decision.healing.quotedGoldCost===3 && kay.healthAfter===30 && kay.healingAmount===0 && kay.quotedHealthAfter===40 && kay.quotedHealingAmount===10; })()", "Unaffordable healing telemetry reports quoted recovery as applied")
        check("(() => { const player=SaveSystem.createDefaultPlayerState(); player.provisions=1; player.currentGold=0; const stocks=CampaignRules.createShopStocks(); stocks.village_general_goods=0; const decision=applyBetweenExpeditionPolicy(player,stocks,BetweenExpeditionPolicies['conservative-sustainer'],75,true); return decision.preferredSafeDistance===0 && decision.minimumSupportedDistance>=1 && decision.actualTargetDistance>=1 && decision.stopReason===null && decision.safetyMargin===0 && decision.targetDistanceReductionReason==='preferred-safety-margin-unavailable'; })()", "A preferred safety margin was incorrectly treated as the real expedition minimum")
        check("(() => { const player=SaveSystem.createDefaultPlayerState(); player.provisions=100; player.currentGold=0; const decision=applyBetweenExpeditionPolicy(player,CampaignRules.createShopStocks(),BetweenExpeditionPolicies['conservative-sustainer'],500,true); return decision.provisionStockAvailableToPack===ExpeditionRules.partyProvisionCapacity(player.selectedCompanion) && decision.estimatedProvisionRequirementForChosenDistance<=decision.provisionStockAvailableToPack && decision.actualTargetDistance<500; })()", "Persistent stock above pack capacity inflated the supported distance")
        check("(() => { const make=()=>{const player=SaveSystem.createDefaultPlayerState(); player.provisions=15; player.currentGold=0; return player;}; const conservative=applyBetweenExpeditionPolicy(make(),CampaignRules.createShopStocks(),BetweenExpeditionPolicies['conservative-sustainer'],75,true); const aggressive=applyBetweenExpeditionPolicy(make(),CampaignRules.createShopStocks(),BetweenExpeditionPolicies['aggressive-reinvestor'],75,true); return conservative.actualTargetDistance<75 && conservative.actualTargetDistance>=1 && aggressive.actualTargetDistance<=75 && conservative.actualTargetDistance<=aggressive.actualTargetDistance && conservative.targetDistanceReduced && conservative.targetDistanceReductionReason && conservative.desiredProvisionStockForNominalDistance>conservative.actualProvisionStockAfterPurchase && conservative.estimatedProvisionRequirementForChosenDistance<=conservative.actualProvisionStockAfterPurchase; })()", "Adaptive distance or policy-specific safety margins are invalid")
        check("(() => { const campaign=CampaignSimulationRunner.run({seed:'adapt-not-stop',expeditions:1,strategy:'cautious',betweenExpeditionPolicy:'conservative-sustainer',turnaroundDistance:75,startingState:{currentGold:0,provisions:15}}); const decision=campaign.betweenExpeditionDecisions[0]; return campaign.expeditionsAttempted===1 && campaign.stopReason!=='cannot-support-any-expedition' && decision.actualTargetDistance<decision.desiredTargetDistance && campaign.expeditions[0].actualTargetDistance===decision.actualTargetDistance; })()", "Campaign terminated instead of launching a shorter affordable expedition")
        check("(() => { const campaign=CampaignSimulationRunner.run({seed:'town-floor-continues',expeditions:1,strategy:'cautious',betweenExpeditionPolicy:'conservative-sustainer',turnaroundDistance:100,startingState:{currentGold:0,provisions:0}}); return campaign.betweenExpeditionDecisions[0].townProvisionGrant===10 && campaign.expeditionsAttempted===1 && campaign.stopReason!=='cannot-support-any-expedition'; })()", "Production town safety net was incorrectly treated as insolvency")
        check("(() => { const player=SaveSystem.createDefaultPlayerState(); player.provisions=0; player.currentGold=0; const stocks=CampaignRules.createShopStocks(); stocks.village_general_goods=0; const decision=applyBetweenExpeditionPolicy(player,stocks,BetweenExpeditionPolicies['conservative-sustainer'],75,true); return decision.actualTargetDistance===0 && decision.stopReason==='cannot-support-any-expedition' && !decision.preferredProvisionTargetMet; })()", "True inability to support any expedition lacks an accurate stop reason")

        check("CampaignSimulationRunner.verifyDeterminism({seed:'campaign-repeat',expeditions:10,strategy:'random',betweenExpeditionPolicy:'conservative-sustainer',turnaroundDistance:25,startingState:{currentGold:100,provisions:30}}).matches", "Same-seed campaign is not deterministic")
        check("(() => { const signatures=Array.from({length:10},(_,i)=>CampaignSimulationRunner.run({seed:`campaign-diverge-${i}`,expeditions:5,strategy:'random',betweenExpeditionPolicy:'minimal-restock',turnaroundDistance:75,startingState:{currentGold:100,provisions:30}})).map(result=>JSON.stringify(result.expeditions.map(entry=>({outcome:entry.outcome,health:entry.endingHealth,encounters:entry.expeditionTelemetry.encounters.map(e=>e.encounterId)})))); return new Set(signatures).size>1; })()", "Different campaign seeds did not diverge")
        check("(() => { const campaign=CampaignSimulationRunner.run({seed:'ten-complete',expeditions:10,strategy:'cautious',betweenExpeditionPolicy:'conservative-sustainer',turnaroundDistance:25,startingState:{currentGold:100,provisions:30}}); return campaign.completedPlan && campaign.expeditionsAttempted===10 && campaign.expeditionsReturned===10 && campaign.replay.expeditionSeeds.length===10; })()", "Viable 10-expedition campaign did not complete")
        check("(() => { const campaign=CampaignSimulationRunner.run({seed:'persistence',expeditions:4,strategy:'aggressive',betweenExpeditionPolicy:'minimal-restock',turnaroundDistance:75,startingState:{currentGold:100,provisions:30}}); return campaign.expeditions.every((entry,index)=>index===0 || entry.stateBefore.gold===campaign.expeditions[index-1].stateAfter.gold) && campaign.expeditions.every(entry=>entry.stateAfter.provisionStock>=0); })()", "Gold/provision campaign state did not carry between expeditions")
        check("(() => { const batch=CampaignSimulationRunner.runBatch({scenarios:[{id:'batch',strategy:'cautious',betweenExpeditionPolicy:'conservative-sustainer',turnaroundDistance:25,startingState:{currentGold:100,provisions:30}}],campaignsPerScenario:12,expeditionsPerCampaign:10}); const csv=CampaignSimulationTelemetry.expeditionsToCsv(batch); return batch.results.length===12 && batch.summary.totalCampaigns===12 && batch.summary.campaignCompletionRate===1 && Number.isFinite(batch.summary.averageDesiredExpeditionDistance) && Number.isFinite(batch.summary.averageActualExpeditionDistance) && Number.isFinite(batch.summary.targetDistanceReductionFrequency) && Number.isFinite(batch.summary.averageDistanceReduced) && CampaignSimulationTelemetry.campaignsToCsv(batch).split('\\n').length===13 && csv.includes('desiredTargetDistance') && csv.includes('actualTargetDistance') && csv.includes('arthurHealing') && csv.includes('companionHealing') && csv.includes('healingCost'); })()", "Campaign batch, adaptive-distance summary, or CSV export is invalid")
        check("(() => { const campaign=CampaignSimulationRunner.run({seed:'replay',expeditions:3,turnaroundDistance:25,startingState:{currentGold:100,provisions:30}}); return campaign.replay.campaignSeed==='replay' && campaign.replay.expeditionSeeds.every((seed,index)=>seed===`replay:expedition-${index}`) && campaign.replay.expeditionReplays.length===campaign.expeditionsAttempted && campaign.betweenExpeditionDecisions.length>=campaign.expeditionsAttempted; })()", "Campaign replay payload is incomplete")

        if devtools.console_errors:
            raise AssertionError(f"Runtime exceptions: {devtools.console_errors}")
        print(f"PASS: {checks} campaign/health/Inn assertions")
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
