"""Focused browser coverage for the reusable fishing minigame path."""

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
    profile = Path(tempfile.mkdtemp(prefix="grail-minigame-test-"))
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
                diagnostic = devtools.evaluate("window.__minigameDebug ?? null")
                raise AssertionError(f"{label}: {diagnostic!r}" if diagnostic else label)
            checks += 1

        check(
            "typeof MinigameRules === 'object' && typeof Minigames === 'object'"
            " && typeof EncounterManager === 'object' && typeof CraftingRules === 'object'",
            "Fishing runtime modules were not loaded",
        )
        check(
            "(() => { const d=MINIGAME_DEFINITIONS.woodland_stream_fishing;"
            " const overlap={id:'low',x:0.73,y:0.35,radius:0.3,priority:1};"
            " const priority=MinigameRules.fishingHotspot({...d,hotspots:[overlap,d.hotspots[1]]},0.73,0.35);"
            " const fallback=MinigameRules.fishingHotspot(d,0.5,0.58);"
            " return d.attemptLimit===3 && d.timeLimitSeconds===null"
            " && priority.id==='deep_pool' && fallback.id==='default_water'; })()",
            "Fishing hotspots did not use normalized coordinates, priority, and default fallback",
        )
        check(
            "(() => { const d=ENCOUNTER_DEFINITIONS.old_road_fisher;"
            " const choices=d.stages.start.choices;"
            " const teaching=choices.filter(c=>c.outcomes?.some(e=>e.type==='startMinigame'));"
            " const s=ENCOUNTER_DEFINITIONS.woodland_stream;"
            " const fish=s.stages.start.choices.find(c=>c.id==='fish_the_stream');"
            " return d.minimumDistance===115 && d.maximumDistance===180 && d.weight===2"
            " && d.milestone!==true && teaching.length===3"
            " && fish.requirements.some(r=>r.type==='knowledge'&&r.knowledgeId==='fishing')"
            " && fish.requirements.some(r=>r.type==='notEncounterFlag'&&r.flag==='fishing_used')"
            " && s.repeatable===true && s.maxOccurrencesPerRun===2; })()",
            "The fishing teacher or repeatable stream encounter is not authored as specified",
        )
        check(
            "(() => { const p=SaveSystem.createDefaultPlayerState(); p.learnedKnowledge=['fishing'];"
            " p.selectedCompanions=[]; p.selectedCompanion=null; p.packedMaterials={};"
            " const e=ExpeditionRules.createExpedition(p,{companions:[],provisions:30,random:()=>0});"
            " e.direction='outbound'; e.distance=12; e.encounterTravelDistance=12; e.currentPathId='old_forest_road';"
            " EncounterManager.begin(e,'woodland_stream');"
            " const started=EncounterManager.resolveChoice(e,p,'fish_the_stream',{startMinigame:()=>true});"
            " const sim=Minigames.simulate('woodland_stream_fishing',{player:p,expedition:e,random:()=>0,strategyName:'aggressive'});"
            " const completed=EncounterManager.completeMinigame(e,p,sim,{startMinigame:()=>true});"
            " const fishChoice=ENCOUNTER_DEFINITIONS.woodland_stream.stages.start.choices.find(c=>c.id==='fish_the_stream');"
            " const unavailable=EncounterRequirements.choiceAvailability(fishChoice,{player:p,expedition:e}).available===false;"
            " const rawFishBeforeCook=e.materialBag.unsecured.raw_fish;"
            " const cooked=CraftingRules.craft(p,'cooked_fish','campfire',{expedition:e,context:'camp'});"
            " const ok=started.minigameStarted===true && sim.state==='summary' && sim.casts.length===3"
            " && sim.casts.every(c=>c.hooked&&c.catch?.catchId==='large_pike')"
            " && rawFishBeforeCook===9 && !completed.minigameCompleted"
            " && e.activeEncounter.encounterFlags.fishing_used===true && unavailable"
            " && cooked.applied===true && cooked.provisions===4"
            " && e.materialBag.unsecured.raw_fish===8;"
            " window.__minigameDebug={started,simState:sim.state,casts:sim.casts,eMaterial:e.materialBag.unsecured,completed,unavailable,cooked,flags:e.encounterFlags}; return ok; })()",
            "Fishing did not resolve catches, flag the occurrence, or feed the campfish recipe",
        )
        check(
            "(() => { const p=SaveSystem.createDefaultPlayerState(); p.learnedKnowledge=[];"
            " p.selectedCompanions=[]; p.selectedCompanion=null; p.materials.honey=1; p.packedMaterials={honey:1};"
            " const e=ExpeditionRules.createExpedition(p,{companions:[],provisions:20,random:()=>0});"
            " e.direction='outbound'; e.distance=120; e.encounterTravelDistance=120; e.currentPathId='old_forest_road';"
            " EncounterManager.begin(e,'old_road_fisher');"
            " const choice=EncounterManager.resolveChoice(e,p,'offer_honey',{startMinigame:()=>true});"
            " const sim=Minigames.simulate('fishing_teacher_tutorial',{player:p,expedition:e,random:()=>0,strategyName:'normal'});"
            " const completed=EncounterManager.completeMinigame(e,p,sim,{startMinigame:()=>true});"
            " return choice.minigameStarted===true && completed.resolved===true"
            " && p.learnedKnowledge.includes('fishing') && e.activeEncounter.phase==='result'; })()",
            "The fishing tutorial did not grant Fishing knowledge on completion",
        )
        check(
            "(() => { const p=SaveSystem.createDefaultPlayerState(); p.learnedKnowledge=['fishing'];"
            " p.selectedCompanions=[]; p.selectedCompanion=null;"
            " const e=ExpeditionRules.createExpedition(p,{companions:[],provisions:30,random:()=>0});"
            " e.direction='outbound'; e.distance=12; e.encounterTravelDistance=12; e.currentPathId='old_forest_road';"
            " EncounterManager.begin(e,'woodland_stream');"
            " EncounterManager.resolveChoice(e,p,'fish_the_stream',{startMinigame:()=>true});"
            " const sim=Minigames.simulate('woodland_stream_fishing',{player:p,expedition:e,random:()=>0,strategyName:'aggressive'});"
            " EncounterManager.completeMinigame(e,p,sim,{startMinigame:()=>true});"
            " EncounterManager.resolveChoice(e,p,'wade_across',{startMinigame:()=>true});"
            " const pending=e.activeEncounter.pendingToken; EncounterManager.completePendingAction(e,p,pending,{startMinigame:()=>true});"
            " EncounterManager.continueJourney(e); e.lastEncounterId='different_encounter';"
            " const secondEligible=EncounterManager.isEligibleDefinition(ENCOUNTER_DEFINITIONS.woodland_stream,e,p);"
            " EncounterManager.begin(e,'woodland_stream'); e.lastEncounterId='different_encounter';"
            " const thirdEligible=EncounterManager.isEligibleDefinition(ENCOUNTER_DEFINITIONS.woodland_stream,e,p);"
            " return secondEligible===true && thirdEligible===false; })()",
            "Woodland Stream did not allow exactly two separated occurrences",
        )
        check(
            "(() => { const r=SimulationRunner.run({seed:'fishing-telemetry',strategy:'aggressive',provisions:60,"
            "startingState:{learnedKnowledge:['fishing'],selectedCompanions:[],selectedCompanion:null},"
            "turnaroundPolicy:{type:'fixedDistance',distance:180}});"
            " const csv=SimulationTelemetry.toCsv({results:[r]});"
            " window.__minigameDebug={simulation:{sessions:r.fishingSessions,casts:r.fishingCasts,"
            "outcome:r.outcome,encounters:r.encounters.map(e=>({id:e.encounterId,choices:e.decisions.map(d=>d.choiceId)}))}};"
            " return ['fishingSessions','fishingCasts','fishingHooks','fishingMisses','fishCaught','rawFishGained',"
            "'fishingLoot','fishingKnowledgeLearned'].every(field=>csv.includes(field))"
            " && Number.isInteger(r.fishingSessions) && Number.isInteger(r.fishingCasts)"
            " && r.fishingSessions>0 && r.fishingCasts>=r.fishingSessions*3"
            " && (() => { const c=CampaignSimulationRunner.run({seed:'fishing-campaign-telemetry',expeditions:1,strategy:'aggressive',turnaroundDistance:180,startingState:{learnedKnowledge:['fishing'],currentGold:3000,provisions:100}});"
            " const expeditionCsv=CampaignSimulationTelemetry.expeditionsToCsv({results:[c]});"
            " const campaignCsv=CampaignSimulationTelemetry.campaignsToCsv({results:[c]});"
            " return Number.isFinite(c.totalFishingSessions)"
            " && ['fishingSessions','fishingCasts','fishingHooks','fishingMisses','fishCaught','rawFishGained','fishingLoot','fishingKnowledgeLearned'].every(field=>expeditionCsv.includes(field))"
            " && ['totalFishingSessions','totalFishingCasts','totalFishingHooks','totalFishingMisses','totalFishCaught','totalRawFishGained','fishingLoot','totalFishingKnowledgeLearned'].every(field=>campaignCsv.includes(field)); })()"
            " && (() => { const make=()=>{const p=SaveSystem.createDefaultPlayerState(); p.packedMaterials={};"
            " const e=ExpeditionRules.createExpedition(p,{companions:[],provisions:20,random:()=>0}); return {p,e};};"
            " const aContext=make(); const bContext=make();"
            " const a=Minigames.simulate('woodland_stream_fishing',{player:aContext.p,expedition:aContext.e,random:GameRandom.create('fishing-replay').random,strategyName:'aggressive'});"
            " const b=Minigames.simulate('woodland_stream_fishing',{player:bContext.p,expedition:bContext.e,random:GameRandom.create('fishing-replay').random,strategyName:'aggressive'});"
            " return JSON.stringify(a)===JSON.stringify(b); })(); })()",
            "Fishing simulation telemetry was not emitted in JSON/CSV run results",
        )
        check(
            "(() => { game.player=SaveSystem.createDefaultPlayerState(); game.player.learnedKnowledge=['fishing'];"
            " game.player.selectedCompanions=[]; game.player.selectedCompanion=null;"
            " const e=ExpeditionRules.createExpedition(game.player,{companions:[],provisions:20,random:()=>0});"
            " e.direction='outbound'; e.distance=12; e.encounterTravelDistance=12; e.currentPathId='old_forest_road';"
            " EncounterManager.begin(e,'woodland_stream'); game.expedition=e; game.screen='expedition';"
            " const resolved=EncounterManager.resolveChoice(e,game.player,'fish_the_stream',{startMinigame:(id,d)=>startMinigame(e,id,d)});"
            " window.__minigameDebug={resolved,session:Boolean(game.minigameSession),active:e.activeEncounter}; renderScreen();"
            " const stage=Boolean(document.querySelector('[data-fishing-cast-area]'));"
            " if (!game.minigameSession) return false;"
            " game.minigameSession.state='charging'; game.minigameSession.power=0.9; releaseFishingCast();"
            " const castStarted=game.minigameSession.state==='waiting'"
            " && Boolean(document.querySelector('.fishing-bobber'));"
            " game.minigameSession.activeCast.remainingMs=0; updateFishing(0.1);"
            " const biteState=game.minigameSession.state==='hook'"
            " && !document.querySelector('.fishing-hook-button').disabled;"
            " resolveFishingHook(true);"
            " window.__minigameDebug={...window.__minigameDebug,afterCastState:game.minigameSession.state,afterCastSession:game.minigameSession,"
            "bobber:Boolean(document.querySelector('.fishing-bobber')),stage:Boolean(document.querySelector('[data-fishing-cast-area]')),biteState};"
            " return stage && castStarted && biteState && game.minigameSession.state==='result'; })()",
            "The playable fishing screen did not render or resolve a cast",
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

    print(f"Minigame browser checks passed ({checks} checks).")


if __name__ == "__main__":
    run()
