"""Focused Old Forest cooking-economy and simulator regressions."""

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


def run() -> None:
    if not CHROME.exists():
        raise RuntimeError(f"Chrome not found at {CHROME}")
    os.chdir(ROOT)
    http_port = free_port()
    debug_port = free_port()
    server = ThreadingHTTPServer(("127.0.0.1", http_port), QuietHandler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    profile = Path(tempfile.mkdtemp(prefix="grail-old-forest-balance-test-"))
    game_url = f"http://127.0.0.1:{http_port}/?sim=1"
    chrome = subprocess.Popen([
        str(CHROME), "--headless=new", "--disable-gpu", "--no-sandbox",
        "--remote-allow-origins=*", f"--remote-debugging-port={debug_port}",
        f"--user-data-dir={profile}", game_url,
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    checks = 0
    try:
        devtools = DevTools(wait_for_json(debug_port, game_url))
        devtools.call("Runtime.enable")
        for _ in range(40):
            if devtools.evaluate("Boolean(document.querySelector('.simulation-tools'))"):
                break
            time.sleep(0.1)

        def check(expression: str, label: str) -> None:
            nonlocal checks
            result = devtools.evaluate(expression)
            if not result:
                raise AssertionError(f"{label} ({result!r})")
            checks += 1

        check(
            "(() => { const p=SaveSystem.createDefaultPlayerState(); p.learnedKnowledge=['woodcraft']; p.selectedCompanions=[]; p.selectedCompanion=null; const e=ExpeditionRules.createExpedition(p,{companions:[],provisions:8,packedMaterials:{},random:()=>0}); EncounterManager.force(e,'woodland_foraging'); const r=EncounterManager.resolveChoice(e,p,'search_with_woodcraft'); const completed=r.pending?EncounterManager.completePendingAction(e,p,r.pendingToken):r; return completed.resolved&&MaterialRules.expeditionQuantity(e,'mushrooms')>=1&&MaterialRules.expeditionQuantity(e,'fresh_herbs')>=1; })()",
            "Woodcraft foraging did not produce a synergistic cooking bundle",
        )
        check(
            "(() => { const ids=['woodland_foraging','abandoned_camp','hidden_hollow','beneath_the_roots','hermits_fire','ancient_spring','something_in_thorns']; const text=ids.map(id=>JSON.stringify(ENCOUNTER_DEFINITIONS[id])).join(' '); return ['mushrooms','wild_berries','fresh_herbs','honey'].every(id=>text.includes(id))&&JSON.stringify(ENCOUNTER_DEFINITIONS.beneath_the_roots).includes('woodcraft')&&JSON.stringify(ENCOUNTER_DEFINITIONS.ancient_spring).includes('woodcraft'); })()",
            "Old Forest cooking ingredients did not have varied authored sources",
        )
        check(
            "(() => { const shop=SHOP_DEFINITIONS.forest_village_provisions; const offers=shop.itemsForSale; return offers.wild_berries?.stock===3&&offers.mushrooms?.stock===2&&offers.fresh_herbs?.stock===2&&offers.honey?.stock===1&&offers.honey.price>offers.wild_berries.price&&shop.acceptedCategories.includes('ingredient'); })()",
            "Hidden village ingredient stock was not limited and expensive",
        )
        check(
            "(() => { const recipes=CraftingRules.knownRecipesForProvider(SaveSystem.createDefaultPlayerState(),'campfire'); const selection=MaterialRules.prioritizedSelection({raw_meat:10,honey:1,mushrooms:2,fresh_herbs:2,wild_berries:2},recipes); return selection.honey===1&&selection.mushrooms>=1&&selection.fresh_herbs>=1&&selection.raw_meat<=2&&MaterialRules.collectionTotal(selection)<=10; })()",
            "Material packing still preferred redundant raw meat over useful ingredients",
        )
        check(
            "(() => { const run=SimulationRunner.run({seed:'balance-strong-recipe',strategy:'normal',provisions:1,companions:[],materialBagContents:{raw_meat:1,mushrooms:1,rare_herbs:1},campaignGoal:{targetDistance:100},turnaroundPolicy:{type:'fixedDistance',distance:30},startingStateIsAuthoritative:true,startingState:{selectedCompanions:[],selectedCompanion:null,learnedRecipes:['forestwarden_stew'],materials:{raw_meat:1,mushrooms:1,rare_herbs:1}}}); return run.recipesUsedById.forestwarden_stew===1&&run.cookingProvisionsGainedByRecipe.forestwarden_stew===12&&run.cookingOpportunityMissedCount===0; })()",
            "The simulator did not use an available strong learned food recipe",
        )
        check(
            "(() => { const run=SimulationRunner.run({seed:'balance-cook-before-failure',strategy:'normal',provisions:1,companions:[],materialBagContents:{raw_meat:1,mushrooms:1,fresh_herbs:1},campaignGoal:{targetDistance:100},turnaroundPolicy:{type:'fixedDistance',distance:30},startingStateIsAuthoritative:true,startingState:{selectedCompanions:[],selectedCompanion:null,learnedRecipes:['hunters_stew'],materials:{raw_meat:1,mushrooms:1,fresh_herbs:1}}}); return run.cookingActionCount>0&&!run.provisionExhaustionFailure; })()",
            "The simulator declared a provision failure without attempting available cooking",
        )
        check(
            "(() => { const safety=SimulationProvisionPlanning.emergencyTurnaround({direction:'outbound',distance:30,provisions:4,provisionConsumptionMultiplier:1},'normal'); return safety.shouldTurn&&safety.strategyTolerance===1&&safety.encounterReserve===4; })()",
            "Normal return planning did not keep a light food reserve",
        )
        check(
            "(() => { const p=SaveSystem.createDefaultPlayerState(); const e=ExpeditionRules.createExpedition(p,{companions:[],provisions:8,packedMaterials:{},random:()=>0}); e.simulationMaterialPriorityEnabled=true; MaterialRules.addUnsecured(e,'raw_meat',10); const result=MaterialRules.addUnsecured(e,'honey',1); return result.accepted===1&&e.materialBagDiscarded.raw_meat===1&&MaterialRules.expeditionQuantity(e,'honey')===1; })()",
            "Simulator material priority did not replace excess raw meat under bag pressure",
        )
        check(
            "(() => { const route=ExpeditionCatalog.get('old_forest_road'); return !route.provisionCapacityBonus&&ExpeditionRules.partyProvisionCapacity([],route.id)===20&&ExpeditionRules.partyProvisionCapacity(['sir_kay'],route.id)===30; })()",
            "Old Forest received a route-specific provision-capacity bonus",
        )
        if devtools.console_errors:
            raise AssertionError(f"Runtime exceptions: {devtools.console_errors}")
        print(f"PASS: {checks} Old Forest balance assertions")
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
