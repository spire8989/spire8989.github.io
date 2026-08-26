"""Deterministic browser regressions for automated hidden-village resupply."""

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
    game_url = f"http://127.0.0.1:{http_port}/"
    server = ThreadingHTTPServer(("127.0.0.1", http_port), QuietHandler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    profile = Path(tempfile.mkdtemp(prefix="grail-hidden-village-provision-test-"))
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

        def check(expression: str, label: str):
            nonlocal checks
            value = devtools.evaluate(expression)
            passed = value.get("ok") if isinstance(value, dict) and "ok" in value else value
            if not passed:
                if isinstance(value, dict):
                    print(f"Diagnostic for {label}: {value}")
                raise AssertionError(label)
            checks += 1

        check(
            "CampaignRules.provisionShopForLocation('hidden_forest_village')?.id==="
            "'forest_village_provisions'",
            "Hidden village did not resolve its authored provision shop",
        )
        check(
            "(() => {"
            " const shop=SHOP_DEFINITIONS.forest_village_provisions;"
            " const originalPrice=shop.provisionsForSale.price;"
            " const originalStock=shop.provisionsForSale.stock;"
            " const runWithOffer=(price,stock)=>{"
            "  shop.provisionsForSale.price=price; shop.provisionsForSale.stock=stock;"
            "  try {"
            "   const shopStocks=CampaignRules.createShopStocks();"
            "   const state=SaveSystem.createDefaultPlayerState();"
            "   state.currentGold=100; state.provisions=10;"
            "   state.selectedCompanion=null; state.selectedCompanions=[];"
            "   const run=SimulationRunner.run({"
            "    seed:'hidden-village-provision', expeditionId:'old_forest_road',"
            "    strategy:'cautious', companions:[], provisions:10,"
            "    turnaroundPolicy:{type:'fixedDistance',distance:140},"
            "    campaignGoal:{goalId:'secure-wrath-shard',targetDistance:140},"
            "    startingStateIsAuthoritative:true, startingState:state,"
            "    locationServicePlans:[{locationId:'hidden_forest_village',encounterId:'hidden_forest_village',minimumDistance:95}],"
            "    onLocationEntered:(locationId,context)=>campaignLocationProvisionService(locationId,context,{"
            "     shopStocks,strategyName:'cautious',targetDistance:140,safetyMargin:6"
            "    })"
            "   });"
            "   return {run,stockAfter:shopStocks.forest_village_provisions};"
            "  } finally { shop.provisionsForSale.price=originalPrice; shop.provisionsForSale.stock=originalStock; }"
            " };"
            " const cheap=runWithOffer(0.01,240);"
            " const unavailable=runWithOffer(1000,240);"
            " const action=cheap.run.locationServiceActions?.find(entry=>entry.locationId==='hidden_forest_village');"
            " return {ok:Boolean(action)"
            "  && action.reason==='purchased-for-next-milestone'"
            "  && action.quantity>0"
            "  && action.stockBefore===240"
            "  && action.stockAfter===240-action.quantity"
            "  && action.provisionsAfter>action.provisionsBefore"
            "  && action.goldCost===action.quantity*0.01"
            "  && cheap.run.villageProvisionPurchaseCount===1"
            "  && cheap.run.villageProvisionsPurchased===action.quantity"
            "  && cheap.run.villageProvisionGoldSpent===action.goldCost"
            "  && cheap.run.maximumDistance>unavailable.run.maximumDistance"
            "  && unavailable.run.locationServiceActions?.[0]?.reason==='no-gold',"
            "  action,cheapMaximumDistance:cheap.run.maximumDistance,"
            "  unavailableMaximumDistance:unavailable.run.maximumDistance,"
            "  cheapTelemetry:{count:cheap.run.villageProvisionPurchaseCount,quantity:cheap.run.villageProvisionsPurchased},"
            "  unavailableReason:unavailable.run.locationServiceActions?.[0]?.reason};"
            "})()",
            "Cheap authored hidden-village provisions did not change the deterministic campaign path",
        )
        check(
            "(() => {"
            " const shop=SHOP_DEFINITIONS.forest_village_provisions;"
            " const originalPrice=shop.provisionsForSale.price;"
            " const originalStock=shop.provisionsForSale.stock;"
            " try {"
            "  shop.provisionsForSale.price=0.01; shop.provisionsForSale.stock=1;"
            "  const stocks=CampaignRules.createShopStocks();"
            "  const player=SaveSystem.createDefaultPlayerState(); player.currentGold=10; player.provisions=0;"
            "  const first=CampaignRules.buyProvisionsToAtLocation(player,stocks,'hidden_forest_village',10);"
            "  const second=CampaignRules.buyProvisionsToAtLocation(player,stocks,'hidden_forest_village',20);"
            "  return first.applied&&first.quantity===1&&player.provisions===1"
            "   &&stocks.forest_village_provisions===0&&second.reason==='no-stock';"
            " } finally { shop.provisionsForSale.price=originalPrice; shop.provisionsForSale.stock=originalStock; }"
            "})()",
            "Hidden-village provision stock did not persist through the canonical purchase helper",
        )
        if devtools.console_errors:
            raise AssertionError(f"Runtime exceptions: {devtools.console_errors}")
        print(f"PASS: {checks} hidden-village provision assertions")
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
