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


def run():
    if not CHROME.exists():
        raise RuntimeError(f"Chrome not found at {CHROME}")

    os.chdir(ROOT)
    http_port = free_port()
    debug_port = free_port()
    server = ThreadingHTTPServer(("127.0.0.1", http_port), QuietHandler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    profile = Path(tempfile.mkdtemp(prefix="grail-simulation-automation-test-"))
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
                diagnostic = devtools.evaluate("window.__simulationAutomationDebug ?? null")
                raise AssertionError(f"{label}: {diagnostic!r}" if diagnostic else label)
            checks += 1

        check(
            "(() => { const p=SaveSystem.createDefaultPlayerState(); p.learnedKnowledge=['fishing'];"
            " p.selectedCompanions=[]; p.selectedCompanion=null; p.packedMaterials={};"
            " const e=ExpeditionRules.createExpedition(p,{companions:[],provisions:30,random:()=>0});"
            " const result=Minigames.simulate('woodland_stream_fishing',{player:p,expedition:e,random:()=>0,strategyName:'aggressive'});"
            " const casts=result.casts; const rawFish=e.materialBag.unsecured.raw_fish||0;"
            " const ok=casts.length===3&&casts.every(c=>c.hotspotId==='deep_pool'&&c.catch?.rewardItemId==='raw_fish')&&rawFish===9;"
            " window.__simulationAutomationDebug={casts,rawFish}; return ok; })()",
            "Fishing automation did not target the best available hotspot or grant raw fish",
        )
        check(
            "(() => { const run=SimulationRunner.run({seed:'fishing-automation',strategy:'aggressive',provisions:60,"
            " startingState:{learnedKnowledge:['fishing'],selectedCompanions:[],selectedCompanion:null},"
            " turnaroundPolicy:{type:'fixedDistance',distance:180}});"
            " const determinism=SimulationRunner.verifyDeterminism({strategy:'aggressive',provisions:60,"
            " startingState:{learnedKnowledge:['fishing'],selectedCompanions:[],selectedCompanion:null},"
            " turnaroundPolicy:{type:'fixedDistance',distance:180}},'fishing-automation');"
            " const csv=SimulationTelemetry.toCsv({results:[run]});"
            " const p=SaveSystem.createDefaultPlayerState(); p.selectedCompanions=[]; p.selectedCompanion=null;"
            " p.provisions=2; p.materials={...p.materials,raw_fish:1};"
            " p.learnedRecipes=[...p.learnedRecipes,'cooked_fish'];"
            " const cooking=applyBetweenExpeditionPolicy(p,CampaignRules.createShopStocks(),"
            " BetweenExpeditionPolicies['conservative-sustainer'],100,false,'cautious',()=>0.5);"
            " const campaign=CampaignSimulationRunner.run({seed:'fishing-campaign-telemetry',expeditions:1,"
            " strategy:'aggressive',turnaroundDistance:180,startingState:{learnedKnowledge:['fishing'],currentGold:3000,provisions:100}});"
            " const campaignCsv=CampaignSimulationTelemetry.expeditionsToCsv({results:[campaign]});"
            " const campaignFields=['hotspotCasts','nonHotspotCasts','actualFishCaught','fishRewardsByItemId',"
            " 'cookedFishRecipeUses','provisionsGainedFromFish'];"
            " const fields=['fishingSessions','fishingCasts','fishingHooks','fishingMisses','hotspotCasts','nonHotspotCasts',"
            " 'actualFishCaught','fishRewardsByItemId','rawFishGained','cookedFishRecipeUses','provisionsGainedFromFish'];"
            " const ok=run.stepCount<10000&&run.fishingSessions>0&&run.fishingCasts>=run.fishingSessions*3"
            " &&run.hotspotCasts+run.nonHotspotCasts===run.fishingCasts&&run.actualFishCaught>0"
            " &&run.fishRewardsByItemId.raw_fish===run.rawFishGained&&run.rawFishGained>0"
            " &&fields.every(field=>csv.includes(field))"
            " &&campaignFields.every(field=>campaignCsv.includes(field))"
            " &&Number.isFinite(campaign.totalHotspotCasts)&&campaign.fishRewardsByItemId"
            " &&determinism.matches"
            " &&cooking.innCookingActions.some(action=>action.recipeId==='cooked_fish')"
            " &&cooking.cookedFishRecipeUses===1&&cooking.provisionsGainedFromFish===4"
            " &&cooking.innIngredientsConsumedById.raw_fish===1&&cooking.innCookingProvisionsGained===4;"
            " window.__simulationAutomationDebug={run:{outcome:run.outcome,steps:run.stepCount,sessions:run.fishingSessions,casts:run.fishingCasts,hotspotCasts:run.hotspotCasts,nonHotspotCasts:run.nonHotspotCasts,fishCaught:run.fishCaught,actualFishCaught:run.actualFishCaught,fishRewardsByItemId:run.fishRewardsByItemId,rawFish:run.rawFishGained,cooked:run.cookedFishRecipeUses,fishProvisions:run.provisionsGainedFromFish},csvFields:fields.map(field=>[field,csv.includes(field)]),determinism:{matches:determinism.matches,firstMismatch:determinism.firstMismatch},cooking}; return ok; })()",
            "Fishing replay or fish cooking did not complete through the normal simulation flow",
        )
        check(
            "(() => { const base=SaveSystem.createDefaultPlayerState(); const cook=(id,learned,definitions,owned={},target=1)=>{ const player={...base,provisions:0,currentGold:0,learnedRecipes:[...learned],ownedItems:{...base.ownedItems,...owned}}; return {player,result:cookAtInn(player,'normal',()=>0.5,[],{targetProvisions:target,recipeDefinitions:definitions})}; }; const recipe=(id,extra={})=>({id,name:id,craftingProvider:'campfire',ingredients:[],output:{provisions:1},goldCost:0,...extra}); const starter=cook('starter_food',[],{starter_food:recipe('starter_food',{starter:true})}); const alwaysKnown=cook('always_known_food',[],{always_known_food:recipe('always_known_food',{alwaysKnown:true})}); const unknown=cook('unknown_food',[],{unknown_food:recipe('unknown_food')}); const learned=cook('learned_food',['learned_food'],{learned_food:recipe('learned_food')}); const starterIds=['cooked_fish','hunters_stew','honeyed_berries']; const starterEligible=starterIds.every(id=>{ const definition=RECIPE_DEFINITIONS[id]; const owned=Object.fromEntries(CraftingRules.normalizeRecipeIngredients(definition).map(ingredient=>[ingredient.id,ingredient.quantity])); return cook(id,[],{[id]:definition},owned).result.actions.some(action=>action.recipeId===id); }); const royal={...RECIPE_DEFINITIONS.royal_feast,starter:false}; const royalOwned=Object.fromEntries(CraftingRules.normalizeRecipeIngredients(royal).map(ingredient=>[ingredient.id,ingredient.quantity])); const royalUnknown=cook('royal_feast',[],{royal_feast:royal},royalOwned,20); const royalMissing=cook('royal_feast',['royal_feast'],{royal_feast:royal},{...royalOwned,raw_fish:1},20); const royalLearned=cook('royal_feast',['royal_feast'],{royal_feast:royal},royalOwned,20); const startingRoyal={provisions:0,currentGold:1000,learnedRecipes:['royal_feast'],ownedItems:{...royalOwned}}; const campaign=CampaignSimulationRunner.run({seed:'royal-feast-telemetry',expeditions:1,strategy:'normal',turnaroundDistance:100,startingState:startingRoyal}); const campaignUnknown=CampaignSimulationRunner.run({seed:'royal-feast-unknown',expeditions:1,strategy:'normal',turnaroundDistance:100,startingState:{...startingRoyal,learnedRecipes:[]}}); const repeat=CampaignSimulationRunner.verifyDeterminism({seed:'royal-feast-telemetry',expeditions:1,strategy:'normal',turnaroundDistance:100,startingState:startingRoyal},'royal-feast-telemetry'); const summary=CampaignSimulationTelemetry.aggregate({results:[campaign]}); const ids=campaignFoodRecipeIds(); const known=new Set(CraftingRules.knownRecipesForProvider(base,'campfire').map(recipe=>recipe.id)); const ok=ids.includes('royal_feast')&&starter.result.actions.some(action=>action.recipeId==='starter_food')&&alwaysKnown.result.actions.some(action=>action.recipeId==='always_known_food')&&unknown.result.actions.length===0&&learned.result.actions.some(action=>action.recipeId==='learned_food')&&starterIds.every(id=>known.has(id))&&starterEligible&&royalUnknown.result.actions.length===0&&royalMissing.result.actions.length===0&&royalLearned.result.actions.some(action=>action.recipeId==='royal_feast')&&campaign.foodRecipeLearnedById.cooked_fish===true&&campaign.foodRecipeLearnedById.hunters_stew===true&&campaign.foodRecipeLearnedById.honeyed_berries===true&&campaign.foodRecipeLearnedById.royal_feast===true&&campaignUnknown.foodRecipeLearnedById.royal_feast===(RECIPE_DEFINITIONS.royal_feast.starter===true)&&campaign.foodRecipeUsedById.royal_feast===true&&summary.foodRecipeLearningRateById.royal_feast===1&&summary.foodRecipeUsageRateById.royal_feast===1&&summary.recipesUsedById.royal_feast===1&&summary.cookingProvisionsGainedByRecipe.royal_feast===20&&repeat.matches; return ok; })()",
            "Campaign cooking did not preserve canonical knowledge semantics or authored Royal Feast telemetry",
        )
        check(
            "(() => { const base=SaveSystem.createDefaultPlayerState();"
            " base.currentGold=10000; base.provisions=30; base.campaignFlags={...base.campaignFlags,forest_village_discovered:true,druid_favor_complete:true};"
            " base.learnedKnowledge=[...new Set([...base.learnedKnowledge,'song_of_the_forest'])];"
            " base.ownedItems={...base.ownedItems,verdant_shard_grace:1,verdant_shard_wrath:1,verdant_heart:1,enchanted_verdant_heart:1};"
            " const cautious=CampaignSimulationRunner.run({seed:'cautious-final-objective',campaignMode:'progression',expeditions:1,"
            " strategy:'cautious',expeditionPlan:[200],startingState:base});"
            " const aggressive=CampaignSimulationRunner.run({seed:'aggressive-final-objective',campaignMode:'progression',expeditions:1,"
            " strategy:'aggressive',expeditionPlan:[200],startingState:base});"
            " const incomplete={...base,ownedItems:{...base.ownedItems}}; delete incomplete.ownedItems.verdant_heart; delete incomplete.ownedItems.enchanted_verdant_heart;"
            " const prerequisiteGoal=assessOldForestProgressionGoal(incomplete,{strategy:'cautious'});"
            " const cd=cautious.betweenExpeditionDecisions[0]; const ad=aggressive.betweenExpeditionDecisions[0];"
            " const ordinary=campaignDepartureSettings('cautious',{provisions:30,capacity:30});"
            " const ok=cd?.oldForestProgressionGoal==='defeat-verdant-warden'&&cd.progressionRequiredDistance===200"
            " &&cd.progressionReadiness!=='blocked'&&cd.paceId==='normal'&&cd.rationId==='normal'"
            " &&ad?.oldForestProgressionGoal==='defeat-verdant-warden'&&ad.progressionReadiness!=='blocked'"
            " &&ordinary.paceId==='cautious'&&ordinary.rationId==='generous'"
            " &&prerequisiteGoal.goalId==='forge-verdant-heart';"
            " window.__simulationAutomationDebug={cautious:{stop:cautious.stopReason,decision:cd},aggressive:{stop:aggressive.stopReason,decision:ad}}; return ok; })()",
            "Cautious final progression remained blocked or lost aggressive scheduling",
        )
        if devtools.console_errors:
            raise AssertionError(f"Browser reported runtime exceptions: {devtools.console_errors[:3]}")
    finally:
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
        server.server_close()
        shutil.rmtree(profile, ignore_errors=True)

    print(f"Simulation automation browser checks passed ({checks} checks).")


if __name__ == "__main__":
    run()
