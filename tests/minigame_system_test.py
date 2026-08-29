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
        "--window-size=390,844",
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
            " const overlap={id:'low',x:0.13,y:0.33,radius:0.3,priority:1};"
            " const priority=MinigameRules.fishingHotspot({...d,hotspots:[overlap,d.hotspots[1]]},0.13,0.33);"
            " const fallback=MinigameRules.fishingHotspot(d,0.95,0.95);"
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
            " && MINIGAME_DEFINITIONS.fishing_teacher_tutorial.tutorial.enabled===true"
            " && d.encounterLayout?.arthur && d.encounterLayout?.companion1 && d.encounterLayout?.companion2"
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
            " const guaranteed=Minigames.simulate('woodland_stream_fishing',{player:p,expedition:e,random:()=>0.99,strategyName:'aggressive'});"
            " const completed=EncounterManager.completeMinigame(e,p,sim,{startMinigame:()=>true});"
            " const fishChoice=ENCOUNTER_DEFINITIONS.woodland_stream.stages.start.choices.find(c=>c.id==='fish_the_stream');"
            " const unavailable=EncounterRequirements.choiceAvailability(fishChoice,{player:p,expedition:e}).available===false;"
            " const rawFishBeforeCook=e.materialBag.unsecured.raw_fish;"
            " const cooked=CraftingRules.craft(p,'cooked_fish','campfire',{expedition:e,context:'camp'});"
            " const ok=started.minigameStarted===true && sim.state==='summary' && sim.casts.length===3"
            " && sim.casts.every(c=>c.hooked&&c.catch?.catchId==='large_pike')"
            " && guaranteed.casts.length===3 && guaranteed.casts.every(c=>c.biteOccurred===true)"
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
            "(() => { const previous={player:game.player,expedition:game.expedition,screen:game.screen,session:game.minigameSession};"
            " const p=SaveSystem.createDefaultPlayerState(); p.learnedKnowledge=[]; p.selectedCompanions=[]; p.selectedCompanion=null;"
            " p.materials.honey=1; p.packedMaterials={honey:1}; const e=ExpeditionRules.createExpedition(p,{companions:[],provisions:20,random:()=>0});"
            " e.direction='outbound'; e.distance=120; e.encounterTravelDistance=120; e.currentPathId='old_forest_road'; EncounterManager.begin(e,'old_road_fisher');"
            " game.player=p; game.expedition=e; game.screen='expedition'; const started=EncounterManager.resolveChoice(e,p,'offer_honey',{startMinigame:(id,d)=>startMinigame(e,id,d)}); renderScreen();"
            " const stage=document.querySelector('[data-fishing-stage]'); const overlay=document.querySelector('[data-fishing-tutorial-overlay]'); const button=overlay?.querySelector('[data-action=fishing-begin-lesson]'); const buttonRect=button?.getBoundingClientRect();"
            " const tutorialText=MINIGAME_DEFINITIONS.fishing_teacher_tutorial.tutorial.text; const initial=game.minigameSession?.state==='tutorial'"
            " && overlay?.closest('[data-fishing-stage]')===stage && buttonRect?.width>0 && buttonRect?.top>=0 && buttonRect?.bottom<=window.innerHeight"
            " && !document.querySelector('.fishing-panel .fishing-instructions') && !document.querySelector('.fishing-panel')?.textContent.includes(tutorialText)"
            " && game.minigameSession?.castsRemaining===3; button?.click();"
            " const aimStage=document.querySelector('[data-fishing-stage]'); const aimRect=aimStage?.getBoundingClientRect();"
            " const aimed=game.minigameSession?.state==='aim' && game.minigameSession?.castsRemaining===3"
            " && document.querySelector('.fishing-stage-hint')?.textContent==='Press and hold on the water to cast';"
            " aimStage?.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,clientX:aimRect.left+aimRect.width*0.4,clientY:aimRect.top+aimRect.height*0.6,pointerId:41,pointerType:'touch',buttons:1}));"
            " aimStage?.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,cancelable:true,clientX:aimRect.left+aimRect.width*0.4,clientY:aimRect.top+aimRect.height*0.6,pointerId:41,pointerType:'touch',buttons:0}));"
            " const inputWorks=game.minigameSession?.state==='waiting' && game.minigameSession?.castsRemaining===3;"
            " game.minigameSession=previous.session; game.expedition=previous.expedition; game.player=previous.player; game.screen=previous.screen; renderScreen();"
            " window.__minigameDebug={...window.__minigameDebug,teacherOverlay:{started,initial,aimed,inputWorks}}; return started.minigameStarted===true && initial && aimed && inputWorks; })()",
            "The teacher Fishing tutorial did not stay on-stage or transition into normal aim without spending a cast",
        )
        check(
            "(() => { const p=SaveSystem.createDefaultPlayerState(); p.selectedCompanions=[]; p.selectedCompanion=null; p.packedMaterials={};"
            " const e=ExpeditionRules.createExpedition(p,{companions:[],provisions:20,random:()=>0});"
            " const d=MINIGAME_DEFINITIONS.woodland_stream_fishing; const s=MinigameRules.createFishingSession(d);"
            " const rolls=[0.99,0,0,0.99,0]; const random=()=>rolls.shift()??0;"
            " MinigameRules.beginFishingCast(s,d,{x:0.95,power:0.5,random});"
            " const result=MinigameRules.resolveFishingCast(s,d,{hooked:true,player:p,expedition:e,random});"
            " return result?.biteOccurred===true && result.reward?.type==='item' && result.reward.itemId==='old_coin' && result.catch===null; })()",
            "Fishing did not preserve existing item rewards separately from fish catch definitions",
        )
        check(
            "(() => { const fish={type:'catch',displayName:'Small Trout',rewardItemId:'raw_fish',quantity:1};"
            " const item={type:'item',itemId:'old_coin',quantity:3};"
            " const markup=fishingResultMarkup({state:'summary',casts:[{hooked:true,reward:item},{hooked:true,reward:fish}]});"
            " return markup.includes('2 catches') && markup.includes('Small Trout') && markup.includes('Old Silver Coins')"
            " && markup.indexOf('Old Silver Coins')<markup.indexOf('Return to the encounter'); })()",
            "Fishing summary did not count and list non-fish successful rewards",
        )
        check(
            "(() => { const p=SaveSystem.createDefaultPlayerState(); p.learnedKnowledge=['fishing']; p.selectedCompanions=[]; p.selectedCompanion=null; p.packedMaterials={};"
            " const e=ExpeditionRules.createExpedition(p,{companions:[],provisions:30,random:()=>0}); e.direction='outbound'; e.distance=12; e.encounterTravelDistance=12; e.currentPathId='old_forest_road';"
            " EncounterManager.begin(e,'woodland_stream'); const def=ENCOUNTER_DEFINITIONS.woodland_stream; const beforeVisual=resolveEncounterVisualState(def,e.activeEncounter); const beforeLayout=JSON.stringify(beforeVisual.layout); const beforeHidden=JSON.stringify([...beforeVisual.hiddenSlots]);"
            " const started=EncounterManager.resolveChoice(e,p,'fish_the_stream',{startMinigame:()=>true}); const sim=Minigames.simulate('woodland_stream_fishing',{player:p,expedition:e,random:()=>0,strategyName:'aggressive'});"
            " const catchMessages=sim.messages.filter(message=>message.includes('Caught')); const completed=EncounterManager.completeMinigame(e,p,sim,{startMinigame:()=>true});"
            " const noCatchAccumulation=!e.activeEncounter.outcomeMessages.some(message=>catchMessages.includes(message))"
            " && !e.activeEncounter.rewards.some(reward=>reward.type==='catch'||reward.sourceType==='minigame'); const rawFish=e.materialBag.unsecured.raw_fish;"
            " const afterLayout=JSON.stringify(resolveEncounterVisualState(def,e.activeEncounter).layout); const crossing=EncounterManager.resolveChoice(e,p,'wade_across',{skipPresentationDelay:true});"
            " const crossed=EncounterManager.completePendingAction(e,p,crossing.pendingToken,{skipPresentationDelay:true}); const finalMarkup=renderEncounterResultPanel(e,def,e.activeEncounter);"
            " const afterVisual=resolveEncounterVisualState(def,e.activeEncounter); const noDuplicateCatchPresentation=!finalMarkup.includes('Caught')&&!finalMarkup.includes('Unknown reward')"
            " && JSON.stringify(afterVisual.layout)===beforeLayout && JSON.stringify([...afterVisual.hiddenSlots])===beforeHidden"
            " && e.activeEncounter.stageId==='start' && afterVisual.backgroundAssetId==='encounter_woodland_stream';"
            " window.__minigameDebug={...window.__minigameDebug,ownership:{started,simMessages:sim.messages,catchMessages,completed,rawFish,noCatchAccumulation,crossing,crossed,finalMarkup}};"
            " return started.minigameStarted===true && sim.casts.length===3 && catchMessages.length>0 && rawFish===9 && completed.resolved===true && noCatchAccumulation && afterLayout===beforeLayout && crossed.resolved===true && noDuplicateCatchPresentation; })()",
            "Fishing catches were not kept local through stream crossing or the authored encounter layout was not restored",
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
            " const stage=document.querySelector('[data-fishing-stage]');"
            " const oldArea=document.querySelector('[data-fishing-cast-area]');"
            " const hookButton=document.querySelector('.fishing-hook-button');"
            " const fishingScreen=document.querySelector('.fishing-screen');"
            " const stageRect=stage?.getBoundingClientRect();"
            " const caption=document.querySelector('.fishing-stage-caption');"
            " const prompt=document.querySelector('.fishing-stage-hint'); const promptRect=prompt?.getBoundingClientRect(); const castsPill=document.querySelector('.fishing-casts-remaining');"
            " const portraitLayout=fishingScreen && stage && stageRect && getComputedStyle(fishingScreen).display!=='grid'"
            " && Math.abs(stageRect.width/stageRect.height-2/3)<0.02"
            " && !document.querySelector('.fishing-water-overlay')"
            " && caption?.children.length===1 && caption.textContent.includes('3 casts remaining')"
            " && promptRect.top<stageRect.top+stageRect.height*0.2"
            " && getComputedStyle(prompt).backgroundColor!=='rgba(0, 0, 0, 0)'"
            " && getComputedStyle(castsPill).backgroundColor!=='rgba(0, 0, 0, 0)'"
            " && game.minigameSession.state==='aim' && !document.querySelector('[data-fishing-tutorial-overlay]')"
            " && document.querySelector('.fishing-stage-hint')?.textContent==='Press and hold on the water to cast';"
            " if (!game.minigameSession || !stage || oldArea || hookButton || !portraitLayout) return false;"
            " const rect=stage.getBoundingClientRect();"
            " const pointer=(type,x,id=17)=>stage.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,clientX:rect.left+rect.width*x,clientY:rect.top+rect.height*0.62,pointerId:id,pointerType:'mouse',buttons:type==='pointerup'?0:1}));"
            " pointer('pointerdown',0.22);"
            " const gaugeRect=document.querySelector('.fishing-power-overlay').getBoundingClientRect();"
            " const charging=game.minigameSession.state==='charging'"
            " && !document.querySelector('.fishing-power-overlay').classList.contains('is-hidden')"
            " && gaugeRect.height>=16 && gaugeRect.top<rect.top+rect.height*0.2"
            " && !document.querySelector('.fishing-bobber')"
            " && document.querySelector('.fishing-stage-hint')?.classList.contains('is-hidden')"
            " && Number(game.minigameSession.selectedX).toFixed(2)==='0.22';"
            " pointer('pointermove',0.76); pointer('pointerup',0.76);"
            " const castStarted=game.minigameSession.state==='waiting'"
            " && Boolean(document.querySelector('.fishing-bobber'))"
            " && getComputedStyle(document.querySelector('.fishing-bobber-visual')).animationName.includes('fishing-bobber-drift')"
            " && !document.querySelector('.fishing-stage-hint')"
            " && Math.abs(game.minigameSession.activeCast.aimX-0.76)<0.01;"
            " const noBobberBeforeCast=(()=>{const s=game.minigameSession; s.state='aim'; s.activeCast=null; renderScreen(); return !document.querySelector('.fishing-bobber');})();"
            " const recast=(()=>{const s=game.minigameSession; const next=document.querySelector('[data-fishing-stage]'); const r=next.getBoundingClientRect();"
            " next.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,clientX:r.left+r.width*0.68,clientY:r.top+r.height*0.62,pointerId:18,pointerType:'touch',buttons:1}));"
            " next.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,cancelable:true,clientX:r.left+r.width*0.68,clientY:r.top+r.height*0.62,pointerId:18,pointerType:'touch',buttons:0}));"
            " s.activeCast.remainingMs=0; updateFishing(0.1); return s.state==='hook' && Boolean(document.querySelector('.fishing-bobber.is-hook'));})();"
            " const plungeMotion=(()=>{const visual=document.querySelector('.fishing-bobber-visual'); const style=getComputedStyle(visual); return style.animationName.includes('fishing-bobber-hook') && style.animationIterationCount==='infinite' && document.querySelector('.fishing-stage-hint')?.textContent==='BITE!' && document.querySelector('.fishing-power-overlay').classList.contains('is-hidden');})();"
            " const elsewhere=document.querySelector('[data-fishing-stage]'); elsewhere.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,clientX:rect.left+rect.width*0.05,clientY:rect.top+rect.height*0.1,pointerId:19,pointerType:'mouse',buttons:1}));"
            " const elsewhereDoesNotHook=game.minigameSession.state==='hook';"
            " const bobber=document.querySelector('[data-fishing-bobber]'); bobber.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,clientX:rect.left+rect.width*0.68,clientY:rect.top+rect.height*0.35,pointerId:20,pointerType:'touch',buttons:1}));"
            " const resultStageElement=document.querySelector('[data-fishing-stage]'); const resultOverlay=document.querySelector('[data-fishing-overlay]'); const resultCard=document.querySelector('.fishing-stage-result-card'); const resultButton=document.querySelector('.fishing-stage-result-card .game-button'); const resultStage=resultStageElement?.getBoundingClientRect(); const resultCardRect=resultCard?.getBoundingClientRect(); const resultButtonRect=resultButton?.getBoundingClientRect();"
            " const successfulResult=game.minigameSession.state==='result' && !document.querySelector('.fishing-bobber')"
            " && resultOverlay?.closest('.fishing-stage')===resultStageElement && !document.querySelector('.fishing-panel .fishing-result-card')"
            " && resultOverlay?.querySelector('.fishing-stage-overlay-backdrop')"
            " && resultCard?.textContent.includes('Raw Fish')"
            " && !document.querySelector('.fishing-stage-hint')"
            " && getComputedStyle(document.querySelector('.fishing-reward-line')).display==='block'"
            " && resultButtonRect && resultCardRect && document.querySelector('.fishing-reward-line').getBoundingClientRect().bottom<=resultButtonRect.top"
            " && Math.abs(resultStage.width-rect.width)<1 && Math.abs(resultStage.height-rect.height)<1"
            " && resultCardRect.top>=resultStage.top && resultCardRect.bottom<=resultStage.bottom"
            " && resultButtonRect.top>=0 && resultButtonRect.bottom<=window.innerHeight;"
            " const resultBlocksInput=(()=>{const r=resultStageElement.getBoundingClientRect(); resultStageElement.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,clientX:r.left+r.width*0.5,clientY:r.top+r.height*0.5,pointerId:24,pointerType:'touch',buttons:1})); return game.minigameSession.state==='result';})();"
            " const resultDismissed=(()=>{document.querySelector('[data-action=fishing-dismiss-result]')?.click(); return game.minigameSession.state==='aim' && !document.querySelector('[data-fishing-overlay]');})();"
            " const canceled=(()=>{const s=game.minigameSession; const next=document.querySelector('[data-fishing-stage]'); const r=next.getBoundingClientRect();"
            " next.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,clientX:r.left+r.width*0.4,clientY:r.top+r.height*0.62,pointerId:23,pointerType:'mouse',buttons:1}));"
            " next.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,cancelable:true,clientX:r.left+r.width*0.4,clientY:r.top+r.height*0.62,pointerId:23,pointerType:'mouse',buttons:0}));"
            " return s.state==='aim' && s.casts.length===1 && s.castsRemaining===2 && !document.querySelector('.fishing-bobber');})();"
            " const miss=(()=>{const s=game.minigameSession; const next=document.querySelector('[data-fishing-stage]'); const r=next.getBoundingClientRect();"
            " next.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,clientX:r.left+r.width*0.4,clientY:r.top+r.height*0.62,pointerId:21,pointerType:'mouse',buttons:1}));"
            " next.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,cancelable:true,clientX:r.left+r.width*0.4,clientY:r.top+r.height*0.62,pointerId:21,pointerType:'mouse',buttons:0}));"
            " s.activeCast.remainingMs=0; updateFishing(0.1); s.hookRemainingMs=0; updateFishing(0.8); const missStage=document.querySelector('[data-fishing-stage]'); return s.state==='result' && !document.querySelector('.fishing-bobber') && document.querySelector('[data-fishing-overlay]')?.closest('.fishing-stage')===missStage && !document.querySelector('.fishing-panel .fishing-result-card') && document.querySelector('.fishing-stage-result-card')?.textContent.includes('The fish got away.');})();"
            " const missDismissed=(()=>{document.querySelector('[data-action=fishing-dismiss-result]')?.click(); return game.minigameSession.state==='aim' && !document.querySelector('[data-fishing-overlay]');})();"
            " const finalMiss=(()=>{const s=game.minigameSession; const next=document.querySelector('[data-fishing-stage]'); const r=next.getBoundingClientRect();"
            " next.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,clientX:r.left+r.width*0.5,clientY:r.top+r.height*0.62,pointerId:22,pointerType:'touch',buttons:1}));"
            " next.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,cancelable:true,clientX:r.left+r.width*0.5,clientY:r.top+r.height*0.62,pointerId:22,pointerType:'touch',buttons:0}));"
            " s.activeCast.remainingMs=0; updateFishing(0.1); s.hookRemainingMs=0; updateFishing(0.8); const summaryStageElement=document.querySelector('[data-fishing-stage]'); const summaryOverlay=document.querySelector('[data-fishing-overlay]'); const summaryStage=summaryStageElement?.getBoundingClientRect(); const summaryButton=document.querySelector('.fishing-summary-card .game-button')?.getBoundingClientRect(); return s.state==='summary' && !document.querySelector('.fishing-bobber') && summaryOverlay?.closest('.fishing-stage')===summaryStageElement && !document.querySelector('.fishing-panel .fishing-result-card') && summaryButton?.top>=0 && summaryButton?.bottom<=window.innerHeight && Math.abs(summaryStage.width-rect.width)<1 && Math.abs(summaryStage.height-rect.height)<1;})();"
            " window.__minigameDebug={...window.__minigameDebug,charging,castStarted,noBobberBeforeCast,recast,plungeMotion,elsewhereDoesNotHook,successfulResult,resultBlocksInput,resultDismissed,canceled,miss,missDismissed,finalMiss,portraitLayout,finalSession:game.minigameSession};"
            " return charging && castStarted && noBobberBeforeCast && recast && plungeMotion && elsewhereDoesNotHook && successfulResult && resultBlocksInput && resultDismissed && canceled && miss && missDismissed && finalMiss; })()",
            "The playable fishing image input, bobber hook flow, or cast lifecycle did not work",
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
