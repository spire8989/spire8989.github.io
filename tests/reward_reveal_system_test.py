"""Focused browser coverage for the shared reward reveal presentation layer."""

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
    profile = Path(tempfile.mkdtemp(prefix="grail-reward-reveal-test-"))
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

        def check(expression: str, label: str) -> None:
            nonlocal checks
            if not devtools.evaluate(expression):
                raise AssertionError(label)
            checks += 1

        check(
            "Boolean(document.querySelector('#reward-reveal-host'))"
            "&&typeof RewardRevealSystem==='object'"
            "&&typeof queueRewardRevealPresentation==='function'",
            "Stable reward reveal host or queue API is missing",
        )

        check(
            "(() => {"
            "localStorage.clear();"
            "game.rewardPresentationContextId+=1;"
            "RewardRevealSystem.cancel({resetSeen:true});"
            "game.expedition=ExpeditionRules.createExpedition(game.player,{provisions:10,random:()=>0});"
            "game.expedition.status='active';"
            "game.expedition.travelState='paused';"
            "game.screen='expedition';"
            "renderExpedition();"
            "EncounterManager.force(game.expedition,'glint_in_mud');"
            "renderExpedition();"
            "resolveEncounterChoice('investigate');"
            "clearPendingEncounterActionTimer();"
            "const token=game.expedition.activeEncounter.pendingToken;"
            "const result=EncounterManager.completePendingAction(game.expedition,game.player,token,{failExpedition});"
            "finishEncounterResolution(result,game.expedition,0);"
            "return game.expedition.activeEncounter.phase==='result';"
            "})()",
            "Glint in the Mud did not settle into its result phase",
        )
        time.sleep(0.5)
        check(
            "document.querySelector('#reward-reveal-host')?.classList.contains('is-normal')"
            "&&document.querySelector('#reward-reveal-host')?.textContent.includes('Old Silver Coins')"
            "&&RewardRevealSystem.isBlocking()"
            "&&document.querySelector('.encounter-result-panel')?.getAttribute('aria-live')==='off'",
            "Glint reward did not show a blocking normal reveal above the persistent result card",
        )
        check(
            "(() => { continueJourney(); return game.expedition.activeEncounter?.phase==='result'; })()",
            "Normal reward reveal did not protect Continue Journey",
        )
        time.sleep(2.1)
        check(
            "!document.querySelector('#reward-reveal-host')?.classList.contains('is-visible')"
            "&&!RewardRevealSystem.isBlocking()"
            "&&game.expedition.activeEncounter?.phase==='result'",
            "Normal reveal did not cleanly settle",
        )

        check(
            "(() => {"
            "RewardRevealSystem.cancel({resetSeen:true});"
            "const rewards=[{type:'material',materialId:'wood',quantity:3},{type:'material',materialId:'wood',quantity:2},{type:'gold',quantity:6}];"
            "const first=queueRewardRevealPresentation(rewards,{source:'test',eventId:'test-minor',allowFirstDiscovery:false});"
            "const duplicate=queueRewardRevealPresentation(rewards,{source:'test',eventId:'test-minor',allowFirstDiscovery:false});"
            "return first===true&&duplicate===false;"
            "})()",
            "Reward queue did not deduplicate a repeated event token",
        )
        time.sleep(0.12)
        check(
            "document.querySelector('#reward-reveal-host')?.classList.contains('is-minor')"
            "&&document.querySelector('#reward-reveal-host')?.textContent.includes('+5')"
            "&&document.querySelector('#reward-reveal-host')?.textContent.includes('+6')"
            "&&!RewardRevealSystem.isBlocking()",
            "Minor rewards did not group into a non-blocking quantity chip",
        )
        time.sleep(1.1)
        check(
            "(() => {"
            "RewardRevealSystem.cancel({resetSeen:true});"
            "queueRewardRevealPresentation([{type:'item',itemId:'green_glass_vial',quantity:1}],{source:'test',eventId:'test-major'});"
            "return true;"
            "})()",
            "Major reward could not be queued",
        )
        time.sleep(0.5)
        check(
            "document.querySelector('#reward-reveal-host')?.classList.contains('is-major')"
            "&&document.querySelector('#reward-reveal-host')?.textContent.includes('Green Glass Vial')"
            "&&document.querySelector('#reward-reveal-host')?.textContent.includes('DISCOVERY FOUND')"
            "&&RewardRevealSystem.isBlocking()",
            "Major reward did not receive the stronger reveal treatment",
        )
        check(
            "(() => { RewardRevealSystem.cancel(); return RewardRevealSystem.pendingCount()===0 && !document.querySelector('#reward-reveal-host')?.classList.contains('is-visible'); })()",
            "Reward reveal cancellation left stale presentation state",
        )

        check(
            "(() => {"
            "RewardRevealSystem.cancel({resetSeen:true});"
            "queueRewardRevealPresentation([{type:'item',itemId:'green_glass_vial',quantity:1}],{source:'refresh',eventId:'refresh-reveal'});"
            "renderScreen();"
            "return RewardRevealSystem.pendingCount()===0 || RewardRevealSystem.isBlocking() || document.querySelector('#reward-reveal-host')?.classList.contains('is-visible');"
            "})()",
            "A normal expedition render cancelled an active or queued reward reveal",
        )

        check(
            "(() => {"
            "RewardRevealSystem.cancel({resetSeen:true}); game.pendingDiscoveryKeys.clear(); game.player.discoveredContent=[];"
            "const reward={type:'item',itemId:'torch',quantity:1};"
            "const first=rewardRevealModel(reward); const second=rewardRevealModel(reward);"
            "const marked=markPlayerContentDiscovered(game.player,reward); game.pendingDiscoveryKeys.clear();"
            "const known=rewardRevealModel(reward);"
            "const explicit=rewardRevealModel({type:'item',itemId:'silver_stag_medallion',quantity:1,revealTier:'minor'});"
            "return first?.firstDiscovery===true&&first.tier==='normal'&&second?.firstDiscovery===false&&second.tier==='minor'&&marked&&known?.firstDiscovery===false&&explicit?.tier==='minor';"
            "})()",
            "First-discovery promotion did not respect persistent state or explicit tier priority",
        )

        check(
            "(() => { const defaults=SaveSystem.createDefaultPlayerState(); const migrated=sanitizePlayerState({saveVersion:1,ownedItems:{},equippedItems:{}},defaults); return migrated.saveVersion===12&&Array.isArray(migrated.discoveredContent)&&migrated.discoveredContent.length===0; })()",
            "Older saves did not migrate with an empty discovered-content ledger",
        )

        check(
            "resolveDialogueSpeaker('sir_kay')?.id==='sir_kay'"
            "&&resolveDialogueSpeaker('arthur')?.id==='arthur'",
            "Companion dialogue speakers did not resolve through the shared runtime",
        )

        check(
            "(() => {"
            "const location=LOCATION_DEFINITIONS.broceliande_village; const previous=location.markerStyle; location.markerStyle='label'; game.player.currentLocationId='broceliande_village'; renderLocation();"
            "const marker=document.querySelector('.hub-hotspot.town-hotspot-style-label'); const textOnly=Boolean(marker)&&!marker.querySelector('.hub-building-icon');"
            "if(previous===undefined) delete location.markerStyle; else location.markerStyle=previous; renderScreen(); return textOnly;"
            "})()",
            "Label town markers did not omit icon markup",
        )

        check(
            "(() => {"
            "const expedition=game.expedition; expedition.direction='outbound'; expedition.provisionWarningShown={warning:false,danger:false}; expedition.provisionWarningState='safe'; renderExpedition();"
            "updateProvisionWarningTransition(expedition,{state:'warning'}); const first=expedition.provisionWarningShown.warning&&document.querySelector('.provision-warning-warning');"
            "updateProvisionWarningTransition(expedition,{state:'warning'}); const once=expedition.provisionWarningShown.warning;"
            "updateProvisionWarningTransition(expedition,{state:'safe'}); const reset=!expedition.provisionWarningShown.warning;"
            "updateProvisionWarningTransition(expedition,{state:'warning'}); const retrigger=expedition.provisionWarningShown.warning;"
            "updateProvisionWarningTransition(expedition,{state:'danger'}); const critical=expedition.provisionWarningShown.danger&&document.querySelector('.provision-warning-danger');"
            "return Boolean(first)&&once&&reset&&retrigger&&Boolean(critical);"
            "})()",
            "Provision warning transitions did not produce the expected one-shot/retrigger banners",
        )

        if devtools.console_errors:
            raise AssertionError(f"Runtime exceptions: {devtools.console_errors}")
        print(f"PASS: {checks} reward reveal assertions")
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
