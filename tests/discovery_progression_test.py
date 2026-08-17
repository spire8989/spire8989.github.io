"""Regression coverage for discovery-gated Barenton and Val progression."""

from __future__ import annotations

import json
import os
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
    profile = Path(tempfile.mkdtemp(prefix="grail-discovery-test-"))
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
            if not devtools.evaluate(expression):
                raise AssertionError(label)
            checks += 1

        check(
            "(() => { const p=SaveSystem.createDefaultPlayerState(); const e=ExpeditionRules.createExpedition(p,{provisions:1}); e.runFlags={ritual:true,approach:true}; const c={expedition:e,player:p}; return EncounterRequirements.meets({type:'allOf',requirements:[{type:'anyOf',requirements:[{type:'runFlag',flag:'ritual'},{type:'campaignFlag',flag:'ritual'}]},{type:'runFlag',flag:'approach'}]},c)&&!EncounterRequirements.meets({type:'allOf',requirements:[{type:'runFlag',flag:'ritual'},{type:'runFlag',flag:'missing'}]},c); })()",
            "Nested anyOf/allOf requirements did not compose recursively",
        )
        check(
            "(() => { const p=SaveSystem.createDefaultPlayerState(); const e=ExpeditionRules.startExpedition(p,{provisions:1}); EncounterOutcomes.apply({type:'setCampaignFlagOnSafeReturn',flag:'test_discovery',value:true},{player:p,expedition:e}); const staged=!p.campaignFlags.test_discovery&&e.pendingCampaignFlags.test_discovery===true; ExpeditionRules.settle(p,e,true); return staged&&p.campaignFlags.test_discovery===true&&e.campaignFlagsSettled===true; })()",
            "Safe-return campaign discoveries were not staged and settled",
        )
        check(
            "(() => { const p=SaveSystem.createDefaultPlayerState(); const e=ExpeditionRules.startExpedition(p,{provisions:1}); EncounterOutcomes.apply({type:'setCampaignFlagOnSafeReturn',flag:'lost_discovery',value:true},{player:p,expedition:e}); ExpeditionRules.settle(p,e,false); return !p.campaignFlags.lost_discovery&&Object.keys(e.pendingCampaignFlags).length===0; })()",
            "Failed expeditions incorrectly kept staged campaign discoveries",
        )
        check(
            "(() => { const d=ENCOUNTER_DEFINITIONS.barenton_fountain_ritual; const p={campaignFlags:{}}; const e={runFlags:{},currentPathId:'fountain_of_barenton'}; const c={player:p,expedition:e}; const none=EncounterRequirements.meetsAll(d.requirements,c); e.runFlags.barentonRitualUnderstood=true; const ritualOnly=EncounterRequirements.meetsAll(d.requirements,c); e.runFlags.barentonApproachKnown=true; const sameRun=EncounterRequirements.meetsAll(d.requirements,c); const persistent=EncounterRequirements.meetsAll(d.requirements,{player:{campaignFlags:{barenton_ritual_understood:true,barenton_approach_known:true}},expedition:{runFlags:{}}}); e.runFlags.barentonOrdealComplete=true; return !none&&!ritualOnly&&sameRun&&persistent&&!EncounterRequirements.meetsAll(d.requirements,{player:p,expedition:e}); })()",
            "Barenton did not require both ritual and approach knowledge",
        )
        check(
            "(() => { const d=ENCOUNTER_DEFINITIONS.val_morgans_offer; const noKnowledge={player:{campaignFlags:{}},expedition:{runFlags:{valBoundaryRevealed:true}}}; const sameRun={player:{campaignFlags:{}},expedition:{runFlags:{valBoundaryRevealed:true,valLoopConfirmed:true}}}; const persistent={player:{campaignFlags:{val_way_understood:true}},expedition:{runFlags:{valBoundaryRevealed:true}}}; const noBoundary={player:{campaignFlags:{val_way_understood:true}},expedition:{runFlags:{}}}; return !EncounterRequirements.meetsAll(d.requirements,noKnowledge)&&EncounterRequirements.meetsAll(d.requirements,sameRun)&&EncounterRequirements.meetsAll(d.requirements,persistent)&&!EncounterRequirements.meetsAll(d.requirements,noBoundary); })()",
            "Morgan's Offer did not require the Val boundary and actual understanding",
        )
        check(
            "(() => { const d=ENCOUNTER_DEFINITIONS.summoned_guardian; const noOffer={player:{campaignFlags:{}},expedition:{runFlags:{}}}; const refused={player:{campaignFlags:{}},expedition:{runFlags:{morganOfferRefused:true}}}; const accepted={player:{campaignFlags:{}},expedition:{runFlags:{acceptedMorgansGift:true}}}; return !EncounterRequirements.meetsAll(d.requirements,noOffer)&&EncounterRequirements.meetsAll(d.requirements,refused)&&!EncounterRequirements.meetsAll(d.requirements,accepted); })()",
            "Guardian access was not tied to the current-run refused Morgan offer",
        )
        check(
            "(() => { const find=(id,choice)=>ENCOUNTER_DEFINITIONS[id].stages.start.choices.find(entry=>entry.id===choice).outcomes; const ritual=find('barenton_rumors','compare_accounts'); const approach=find('barenton_still_forest','listen_to_silence'); const val=find('val_repeated_road','mark_the_road'); return ritual.some(e=>e.type==='setCampaignFlagOnSafeReturn'&&e.flag==='barenton_ritual_understood')&&approach.some(e=>e.type==='setCampaignFlagOnSafeReturn'&&e.flag==='barenton_approach_known')&&val.some(e=>e.type==='setCampaignFlagOnSafeReturn'&&e.flag==='val_way_understood'); })()",
            "Meaningful authored discovery choices did not stage their persistent flags",
        )
        check(
            "(() => { const c=CampaignSimulationRunner.run({seed:'discovery-cautious',campaignMode:'progression',expeditions:20,strategy:'cautious',betweenExpeditionPolicy:'conservative-sustainer',turnaroundDistance:101,startingState:{arthurHealth:45,currentGold:3000,provisions:100,ownedItems:{flask:1},packedItems:['flask']}}); const barenton=c.expeditions.filter(e=>e.routeId==='fountain_of_barenton'); const val=c.expeditions.find(e=>e.routeId==='val_sans_retour'); return c.currentContentCompleted&&barenton.length>=2&&barenton.some(e=>!e.routeAttemptCompleted&&e.success)&&barenton.at(-1).routeAttemptCompleted&&val?.routeAttemptCompleted&&c.endingState.campaignFlags.barenton_ritual_understood&&c.endingState.campaignFlags.barenton_approach_known&&c.endingState.campaignFlags.val_way_understood; })()",
            "Cautious campaign simulation did not carry discovery attempts into completion",
        )
        check(
            "(() => { const c=CampaignSimulationRunner.run({seed:'discovery-cautious',campaignMode:'progression',expeditions:20,strategy:'cautious',betweenExpeditionPolicy:'conservative-sustainer',turnaroundDistance:101,startingState:{arthurHealth:45,currentGold:3000,provisions:100,ownedItems:{flask:1},packedItems:['flask']}}); const compact=JSON.parse(CampaignSimulationTelemetry.toCompactJson({results:[c]})).campaigns[0]; return compact.campaignSummary.progression.barentonDiscoveryReturnRate>0&&compact.campaignSummary.progression.valDiscoveryReturnRate>0&&compact.campaignSummary.progression.morganOfferReached>0&&compact.campaignSummary.progression.guardianReached>0&&compact.campaignSummary.progression.guardianVictories>0&&compact.notableEvents.some(e=>e.type==='campaign-flag-secured'&&e.flag==='val_way_understood'); })()",
            "Compact campaign telemetry omitted discovery returns or Morgan/Guardian milestones",
        )
        check(
            "(() => { const s={seed:'discovery-deterministic',strategy:'cautious',expeditionId:'fountain_of_barenton',provisions:30,turnaroundPolicy:{type:'fixedDistance',distance:101},startingState:{campaignFlags:{barenton_ritual_understood:true,barenton_approach_known:true},ownedItems:{flask:1},packedItems:['flask']}}; const a=SimulationRunner.verifyDeterminism(s); return a.matches; })()",
            "Discovery-gated simulation replay was not deterministic",
        )
        print(f"PASS: {checks} discovery/progression assertions")
    finally:
        chrome.kill()
        server.shutdown()


if __name__ == "__main__":
    run()
