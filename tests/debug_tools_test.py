"""Focused browser coverage for the developer-only Game Debug panel."""

from __future__ import annotations

import json
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
    profile = Path(tempfile.mkdtemp(prefix="grail-debug-tools-test-"))
    base_url = f"http://127.0.0.1:{http_port}/"
    chrome = subprocess.Popen([
        str(CHROME), "--headless=new", "--disable-gpu", "--no-sandbox",
        "--remote-allow-origins=*", f"--remote-debugging-port={debug_port}",
        f"--user-data-dir={profile}", base_url,
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    checks = 0
    devtools = None
    try:
        devtools = DevTools(wait_for_json(debug_port, base_url))
        devtools.call("Runtime.enable")
        time.sleep(0.35)

        def check(expression: str, label: str) -> None:
            nonlocal checks
            result = devtools.evaluate(expression)
            if not result:
                raise AssertionError(label)
            checks += 1

        check("!document.querySelector('.debug-tools')&&!document.querySelector('.debug-tools-toggle')", "Normal URL exposed the debug panel")
        devtools.evaluate(f"location.href={json.dumps(f'{base_url}?debug=1&sim=1')}")
        time.sleep(0.45)
        check("Boolean(document.querySelector('.debug-tools'))&&Boolean(document.querySelector('.simulation-tools'))", "Debug and simulation tools did not initialize together")
        check("document.querySelector('#debug-town-hotspot-style')?.value===''", "Town hotspot style switcher did not default to the saved-style option")
        check(
            "(() => { game.screen='location'; renderLocation(); const before=[...document.querySelectorAll('.hub-hotspot')].map(button=>`${button.dataset.destinationId}:${button.dataset.hotspotX},${button.dataset.hotspotY}`).join('|'); const location=LOCATION_DEFINITIONS[game.player.currentLocationId]; const savedStyle=location.markerStyle; let style=document.querySelector('#debug-town-hotspot-style'); const savedSelected=style?.value===''; style.value='ribbon'; style.dispatchEvent(new Event('change',{bubbles:true})); const override=[...document.querySelectorAll('.hub-hotspot')].every(button=>button.classList.contains('town-hotspot-style-ribbon')); style=document.querySelector('#debug-town-hotspot-style'); style.value=''; style.dispatchEvent(new Event('change',{bubbles:true})); const restored=[...document.querySelectorAll('.hub-hotspot')].every(button=>button.classList.contains(`town-hotspot-style-${savedStyle}`)); location.markerStyle='ink'; renderLocation(); const saved=[...document.querySelectorAll('.hub-hotspot')].every(button=>button.classList.contains('town-hotspot-style-ink')); delete location.markerStyle; renderLocation(); const missing=[...document.querySelectorAll('.hub-hotspot')].every(button=>button.classList.contains('town-hotspot-style-tag')); location.markerStyle='invalid'; renderLocation(); const invalid=[...document.querySelectorAll('.hub-hotspot')].every(button=>button.classList.contains('town-hotspot-style-tag')); location.markerStyle=savedStyle; const after=[...document.querySelectorAll('.hub-hotspot')].map(button=>`${button.dataset.destinationId}:${button.dataset.hotspotX},${button.dataset.hotspotY}`).join('|'); game.screen='campaign'; renderScreen(); return savedSelected&&override&&restored&&saved&&missing&&invalid&&before===after; })()",
            "Town hotspot style override did not restore the saved style or preserve fallback coordinates",
        )
        check(
            "(() => { game.screen='location'; renderLocation(); const authored=DESTINATION_DEFINITIONS.inn.hotspot; DESTINATION_DEFINITIONS.inn.hotspot={x:0,y:1}; renderLocation(); const edgeScene=document.querySelector('.location-scene').getBoundingClientRect(); const edgeButton=document.querySelector('[data-destination-id=inn]').getBoundingClientRect(); const edgeClamped=edgeButton.left>=edgeScene.left-0.5&&edgeButton.right<=edgeScene.right+0.5&&edgeButton.top>=edgeScene.top-0.5&&edgeButton.bottom<=edgeScene.bottom+0.5&&document.querySelector('[data-destination-id=inn]').dataset.hotspotX==='0'&&document.querySelector('[data-destination-id=inn]').dataset.hotspotY==='1'; DESTINATION_DEFINITIONS.inn.hotspot=authored; renderLocation(); const scene=document.querySelector('.location-scene').getBoundingClientRect(); const buttons=[...document.querySelectorAll('.hub-hotspot')]; const locked=buttons.filter(button=>button.disabled); const noLockCopy=locked.every(button=>!button.querySelector('.hub-lock-label')&&!button.textContent.includes('Available after the Hall')); const inside=buttons.every(button=>{ const box=button.getBoundingClientRect(); return box.left>=scene.left-0.5&&box.right<=scene.right+0.5&&box.top>=scene.top-0.5&&box.bottom<=scene.bottom+0.5; }); const touchTarget=buttons.every(button=>{ const target=getComputedStyle(button,'::after'); const visible=button.getBoundingClientRect(); return Number.parseFloat(target.width)>=44&&Number.parseFloat(target.height)>=44&&visible.height<Number.parseFloat(target.height); }); game.screen='campaign'; renderScreen(); return edgeClamped&&locked.length>0&&noLockCopy&&inside&&touchTarget; })()",
            "Town hotspot locked labels, edge clamping, or mobile touch targets are incorrect",
        )
        check(
            "(() => { const encounter={encounterLayout:{arthur:{x:0.25,y:0.75},companion1:{x:0.6,y:0.4}}}; const scene=document.createElement('div'); scene.style.cssText='position:relative;width:400px;height:225px'; scene.innerHTML=renderEncounterTravelers([{type:'mount'}],encounter); document.body.append(scene); const arthur=scene.querySelector('.arthur'); const companion=scene.querySelector('.companion'); const layout=scene.querySelector('.travelers'); const first=arthur.getBoundingClientRect(); const authored=Math.abs((first.left+first.width/2-scene.getBoundingClientRect().left)/400-0.25)<0.02&&Math.abs((first.top+first.height/2-scene.getBoundingClientRect().top)/225-0.75)<0.02&&arthur.dataset.encounterLayoutX==='0.25'&&companion.dataset.encounterLayoutY==='0.4'; const stationary=getComputedStyle(layout).transitionProperty==='none'&&getComputedStyle(layout).transform==='none'; scene.style.width='800px'; scene.style.height='450px'; const resized=arthur.getBoundingClientRect(); const responsive=Math.abs((resized.left+resized.width/2-scene.getBoundingClientRect().left)/800-0.25)<0.02&&Math.abs((resized.top+resized.height/2-scene.getBoundingClientRect().top)/450-0.75)<0.02; const fallback=document.createElement('div'); fallback.innerHTML=renderEncounterTravelers([],{}); const fallbackArthur=fallback.querySelector('.arthur'); const fallbackWorks=fallbackArthur.dataset.encounterLayoutX==='0.42'&&fallbackArthur.dataset.encounterLayoutY==='0.66'; const occupied=scene.querySelectorAll('.arthur,.companion').length===2; scene.remove(); return authored&&stationary&&responsive&&fallbackWorks&&occupied; })()",
            "Encounter party layout did not use normalized authored, fallback, responsive, or occupied slots",
        )
        check(
            "(async () => { const host=document.createElement('div'); host.innerHTML=renderCharacterSprite(PLAYER_CHARACTER_DEFINITION,'walk','travel','fallback','Arthur'); document.body.append(host); const root=host.querySelector('[data-character-sprite]'); const image=root?.querySelector('.character-sprite-source'); const canvas=root?.querySelector('.character-sprite-canvas'); const waitFor=async predicate=>{for(let index=0;index<100&&!predicate();index+=1) await new Promise(resolve=>setTimeout(resolve,10));}; await waitFor(()=>root?.classList.contains('is-ready')&&canvas?.width>0); const instance=root?._characterSpriteInstance; const frameSizes=[]; for(let frame=0;frame<14;frame+=1){drawCharacterSprite(instance,frame); frameSizes.push(`${canvas.width}x${canvas.height}`);} const walkReady=root?.classList.contains('is-ready')&&canvas?.width<256&&canvas?.height<256&&canvas?.height>0&&instance?.config.frameCount===14&&instance?.config.columns===4&&instance?.config.offsetX===0&&instance?.config.offsetY===0&&instance?.metadata.frameBounds.length===14&&instance?.metadata.frameCells.length===14&&instance?.metadata.opaqueOffsets.length===14&&instance?.metadata.commonFrameCellAnchor?.x===128&&instance?.metadata.sharedScale===1&&new Set(frameSizes).size===1&&!root?.querySelector('.character-sprite-fallback')?.classList.contains('is-visible'); setCharacterVisualState(root,'idle'); await waitFor(()=>root?.dataset.characterRequestedSlot==='idle'&&root?.classList.contains('is-ready')&&canvas?.height>0); const idleReady=root?.dataset.characterRequestedSlot==='idle'&&root?.classList.contains('is-ready')&&canvas?.width<768&&canvas?.height<768&&root?._characterSpriteInstance?.config.frameCount===19&&root?._characterSpriteInstance?.config.offsetX===0&&root?._characterSpriteInstance?.config.offsetY===0&&root?._characterSpriteInstance?.metadata.frameCells.length===19&&!root?.querySelector('.character-sprite-fallback')?.classList.contains('is-visible'); host.remove(); return walkReady&&idleReady&&image?.dataset.assetId==='combat_arthur_basesprite_idle_anim'; })()",
            "Character sprite sheets did not load, slice multi-row frames, or switch visual states",
        )
        check(
            "(async () => { const originalExpedition=game.expedition; const originalScreen=game.screen; const expedition=ExpeditionRules.createExpedition(game.player,{expeditionId:'old_forest_road',companions:['sir_kay'],provisions:10,random:()=>0}); expedition.status='active'; expedition.travelState='traveling'; game.expedition=expedition; game.screen='expedition'; renderExpedition(); const waitFor=async predicate=>{for(let index=0;index<100&&!predicate();index+=1) await new Promise(resolve=>setTimeout(resolve,10));}; const root=document.querySelector('#travelers .arthur [data-character-sprite]'); await waitFor(()=>root?.classList.contains('is-ready')&&root?.dataset.characterRequestedSlot==='walk'); const walkScale=Number.parseFloat(getComputedStyle(root).getPropertyValue('--character-visual-scale')); expedition.travelState='paused'; updateTravelHud(); await waitFor(()=>root?.classList.contains('is-ready')&&root?.dataset.characterRequestedSlot==='idle'&&root?._characterSpriteInstance?.config.frameCount===19); const idleScale=Number.parseFloat(getComputedStyle(root).getPropertyValue('--character-visual-scale')); const result=Number.isFinite(walkScale)&&Number.isFinite(idleScale)&&walkScale>idleScale&&idleScale>0.7&&idleScale<0.9; game.expedition=originalExpedition; game.screen=originalScreen; renderScreen(); return result; })()",
            "Travel Idle did not use the compact context scale needed to match the traveling Walk presentation",
        )
        check(
            "(async () => { const originalExpedition=game.expedition; const originalScreen=game.screen; const expedition=ExpeditionRules.createExpedition(game.player,{expeditionId:'old_forest_road',companions:[],provisions:10,random:()=>0}); expedition.status='active'; expedition.travelState='traveling'; game.expedition=expedition; game.screen='expedition'; renderExpedition(); const waitFor=async predicate=>{for(let index=0;index<100&&!predicate();index+=1) await new Promise(resolve=>setTimeout(resolve,10));}; const opaqueBox=root=>{const canvas=root?.querySelector('.character-sprite-canvas'); const context=canvas?.getContext('2d'); if(!canvas||!context||!canvas.width||!canvas.height) return null; const pixels=context.getImageData(0,0,canvas.width,canvas.height).data; let minX=canvas.width,minY=canvas.height,maxX=-1,maxY=-1; for(let y=0;y<canvas.height;y+=1) for(let x=0;x<canvas.width;x+=1) if(pixels[(y*canvas.width+x)*4+3]>8){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);} if(maxX<0) return null; const rect=canvas.getBoundingClientRect(); const rootBox=root.getBoundingClientRect(); return {center:rect.left+(minX+maxX+1)/2/canvas.width*rect.width,rootCenter:rootBox.left+rootBox.width/2,rootBottom:rootBox.bottom,fullHeight:minY<=1&&maxY>=canvas.height-4};}; const root=document.querySelector('#travelers .arthur [data-character-sprite]'); await waitFor(()=>root?.classList.contains('is-ready')&&root?.dataset.characterRequestedSlot==='walk'); drawCharacterSprite(root._characterSpriteInstance,0); const walk=opaqueBox(root); expedition.travelState='paused'; updateTravelHud(); await waitFor(()=>root?.dataset.characterRequestedSlot==='idle'&&root?._characterSpriteInstance?.config.frameCount===19); drawCharacterSprite(root._characterSpriteInstance,0); const idle=opaqueBox(root); expedition.travelState='traveling'; updateTravelHud(); await waitFor(()=>root?.dataset.characterRequestedSlot==='walk'&&root?._characterSpriteInstance?.config.frameCount===14); drawCharacterSprite(root._characterSpriteInstance,0); const resumed=opaqueBox(root); const result=walk&&idle&&resumed&&walk.fullHeight&&idle.fullHeight&&resumed.fullHeight&&Math.abs(walk.center-idle.center)<3&&Math.abs(walk.rootCenter-idle.rootCenter)<3&&Math.abs(walk.rootBottom-idle.rootBottom)<3&&Math.abs(walk.center-resumed.center)<3&&Math.abs(walk.rootCenter-resumed.rootCenter)<3&&Math.abs(walk.rootBottom-resumed.rootBottom)<3; game.expedition=originalExpedition; game.screen=originalScreen; renderScreen(); return result; })()",
            "Walk/Idle/Walk travel switching moved Arthur's rendered silhouette off its authored anchor",
        )
        check(
            "(async () => { const originalExpedition=game.expedition; const originalScreen=game.screen; const expedition=ExpeditionRules.createExpedition(game.player,{expeditionId:'old_forest_road',companions:[],provisions:10,random:()=>0}); expedition.status='active'; game.expedition=expedition; game.screen='expedition'; const started=startCombat(expedition,'wild_boar'); if(!started) return false; renderCombat(expedition,expedition.combat); const scene=document.querySelector('.combat-scene'); const background=scene?.querySelector('.combat-background'); const sprite=scene?.querySelector('.combatant.ally [data-character-sprite]'); const waitFor=async predicate=>{for(let index=0;index<100&&!predicate();index+=1) await new Promise(resolve=>setTimeout(resolve,10));}; await waitFor(()=>background?.complete&&sprite?.classList.contains('is-ready')); const canvas=sprite?.querySelector('.character-sprite-canvas'); const result=scene?.dataset.combatBackgroundAssetId==='combat_scene_old_forest_road_combat'&&background?.naturalWidth>0&&sprite?.classList.contains('is-ready')&&canvas?.width>0&&canvas?.width<768&&canvas?.height>0&&canvas?.height<768&&!sprite?.querySelector('.character-sprite-fallback')?.classList.contains('is-visible'); game.expedition=originalExpedition; game.screen=originalScreen; renderScreen(); return result; })()",
            "Combat did not resolve its authored battlefield or render the character visual above it",
        )
        check(
            "(async () => { const originalExpedition=game.expedition; const originalScreen=game.screen; const expedition=ExpeditionRules.createExpedition(game.player,{expeditionId:'old_forest_road',companions:[],provisions:10,random:()=>0}); expedition.status='active'; game.expedition=expedition; game.screen='expedition'; const started=startCombat(expedition,'wild_boar'); if(!started) return false; renderCombat(expedition,expedition.combat); const waitFor=async predicate=>{for(let index=0;index<100&&!predicate();index+=1) await new Promise(resolve=>setTimeout(resolve,10));}; const sprite=document.querySelector('.combat-party .combatant.ally [data-character-sprite]'); await waitFor(()=>sprite?.classList.contains('is-ready')); const canvas=sprite?.querySelector('.character-sprite-canvas'); const context=canvas?.getContext('2d'); const pixels=context?.getImageData(0,0,canvas.width,canvas.height).data; let minY=canvas?.height??0; let maxY=-1; if(canvas&&pixels) for(let y=0;y<canvas.height;y+=1) for(let x=0;x<canvas.width;x+=1) if(pixels[(y*canvas.width+x)*4+3]>8){minY=Math.min(minY,y);maxY=Math.max(maxY,y);} const visual=sprite?.closest('.combat-unit-visual'); const box=canvas?.getBoundingClientRect(); const visualBox=visual?.getBoundingClientRect(); const result=sprite?.classList.contains('is-ready')&&getComputedStyle(sprite).overflow==='visible'&&maxY>=canvas.height-2&&minY<=1&&box?.bottom<=visualBox?.bottom+1; game.expedition=originalExpedition; game.screen=originalScreen; renderScreen(); return result; })()",
            "Solo Arthur combat sprite was clipped or its sprite root still inherited text overflow",
        )
        check(
            "(async () => { const originalExpedition=game.expedition; const originalScreen=game.screen; const expedition=ExpeditionRules.createExpedition(game.player,{expeditionId:'old_forest_road',companions:['sir_kay'],provisions:10,random:()=>0}); expedition.status='active'; game.expedition=expedition; game.screen='expedition'; const started=startCombat(expedition,'wild_boar'); if(!started) return false; renderCombat(expedition,expedition.combat); const waitFor=async predicate=>{for(let index=0;index<100&&!predicate();index+=1) await new Promise(resolve=>setTimeout(resolve,10));}; const alphaBounds=canvas=>{const context=canvas?.getContext('2d'); if(!canvas||!context||!canvas.width||!canvas.height) return null; const pixels=context.getImageData(0,0,canvas.width,canvas.height).data; let minX=canvas.width,minY=canvas.height,maxX=-1,maxY=-1; for(let y=0;y<canvas.height;y+=1) for(let x=0;x<canvas.width;x+=1) if(pixels[(y*canvas.width+x)*4+3]>8){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);} return maxX>=0?{minX,minY,maxX,maxY}:null;}; const allies=[...document.querySelectorAll('.combat-party .combatant.ally')]; const arthur=allies.find((unit)=>unit.dataset.combatantId==='arthur'); const kay=allies.find((unit)=>unit.dataset.combatantId==='sir_kay'); await waitFor(()=>arthur?.querySelector('[data-character-sprite]')?.classList.contains('is-ready')); const sprite=arthur?.querySelector('[data-character-sprite]'); const canvas=sprite?.querySelector('.character-sprite-canvas'); const visual=arthur?.querySelector('.combat-unit-visual'); const hud=arthur?.querySelector('.combat-unit-hud'); const gauge=arthur?.querySelector('.gauge-bar'); const kayVisual=kay?.querySelector('.combat-unit-visual'); const canvasBounds=alphaBounds(canvas); const canvasBox=canvas?.getBoundingClientRect(); const kayBox=kayVisual?.getBoundingClientRect(); const hudBox=hud?.getBoundingClientRect(); const gaugeBox=gauge?.getBoundingClientRect(); const fallback=kay?.querySelector('.combat-visual-fallback'); const fallbackSize=Number.parseFloat(getComputedStyle(fallback).fontSize); const visualHeight=Number.parseFloat(getComputedStyle(visual).height); const scene=document.querySelector('.combat-scene'); const sceneRatio=scene&&Math.abs(scene.getBoundingClientRect().width/scene.getBoundingClientRect().height-1.2)<0.03; const bodyVisible=canvasBounds&&canvasBounds.minY<=1&&canvasBounds.maxY>=canvas.height-2&&canvasBounds.minX>=0&&canvasBounds.maxX<canvas.width; const spriteVisible=getComputedStyle(sprite).overflow==='visible'&&canvasBox?.bottom<=visual.getBoundingClientRect().bottom+1; const result=allies.length===2&&sprite?.classList.contains('is-ready')&&bodyVisible&&spriteVisible&&sceneRatio&&kay?.querySelector('.combat-visual-fallback')?.classList.contains('is-visible')&&gaugeBox.top>=hudBox.top&&gaugeBox.bottom<=hudBox.bottom&&gaugeBox.bottom<=canvasBox.top+1&&canvasBox.bottom<=kayBox.top+1&&fallbackSize<visualHeight; game.expedition=originalExpedition; game.screen=originalScreen; renderScreen(); return result; })()",
            "Arthur and fallback Sir Kay did not remain separated in the bounded two-ally combat layout",
        )
        check(
            "(async () => { const originalExpedition=game.expedition; const originalScreen=game.screen; const expedition=ExpeditionRules.createExpedition(game.player,{expeditionId:'old_forest_road',companions:['sir_kay'],provisions:10,random:()=>0}); expedition.status='active'; game.expedition=expedition; game.screen='expedition'; const started=startCombat(expedition,'wild_boar'); if(!started) return false; renderCombat(expedition,expedition.combat); const scene=document.querySelector('.combat-scene'); const sprite=scene?.querySelector('.combat-party .combatant.ally [data-character-sprite]'); const waitFor=async predicate=>{for(let index=0;index<100&&!predicate();index+=1) await new Promise(resolve=>setTimeout(resolve,10));}; await waitFor(()=>sprite?.classList.contains('is-ready')&&sprite?._characterSpriteInstance?.config.frameCount===19); const instance=sprite?._characterSpriteInstance; const sceneBefore=scene; const firstFrame=instance?.frameIndex; await new Promise(resolve=>setTimeout(resolve,420)); const secondFrame=sprite?._characterSpriteInstance?.frameIndex; const hud=scene?.querySelector('.combat-party .combatant.ally .combat-unit-hud')?.getBoundingClientRect(); const visual=scene?.querySelector('.combat-party .combatant.ally .combat-unit-visual')?.getBoundingClientRect(); const gauge=scene?.querySelector('.combat-party .combatant.ally .gauge-bar')?.getBoundingClientRect(); const sceneBox=scene?.getBoundingClientRect(); const result=instance?.config.frameCount===19&&instance?.config.columns===5&&firstFrame!==secondFrame&&document.querySelector('.combat-scene')===sceneBefore&&hud.top>=sceneBox.top&&gauge.top>=hud.top&&gauge.bottom<=hud.bottom&&gauge.bottom<=visual.top+1&&visual.bottom<=sceneBox.bottom+1; game.expedition=originalExpedition; game.screen=originalScreen; renderScreen(); return result; })()",
            "Arthur's combat Idle animation did not continue while the HUD updated",
        )
        travel_lookahead_expression = r"""
        (async () => {
          const definition = EXPEDITION_DEFINITIONS.old_forest_road;
          const originalScenes = definition.travelScenes;
          const originalSeamForeground = definition.travelSeamForegroundAssetId;
          const originalExpedition = game.expedition;
          const originalScreen = game.screen;
          const firstId = "expedition_old_forest_road_woodcut";
          const secondId = "expedition_old_forest_road_woodcut_3";
          const thirdId = "expedition_old_forest_road_woodcut_2";
          const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
          const waitForActive = (frame) => new Promise((resolve) => {
            let ticks = 0;
            const poll = () => frame?.classList.contains("asset-image-active")
              || frame?.classList.contains("asset-load-failed")
              || ticks++ > 100
              ? resolve()
              : setTimeout(poll, 10);
            poll();
          });
          const order = () => [...document.querySelectorAll(
            "#travel-art .travel-visual-track[data-travel-layer=\"current\"] .travel-visual-asset",
          )].map((tile) => tile.dataset.travelAssetId).join(",");
          let result = false;
          try {
            definition.travelScenes = [
              { minDistance: 0, visualAssetId: firstId, motion: "loop", showSeamForegroundBetweenLoops: false },
              { minDistance: 17.5, visualAssetId: secondId, motion: "loop", showSeamForegroundBetweenLoops: false },
              { minDistance: 40, visualAssetId: thirdId, motion: "loop", showSeamForegroundBetweenLoops: false },
            ];
            definition.travelSeamForegroundAssetId = firstId;
            const expedition = ExpeditionRules.createExpedition(game.player, {
              expeditionId: "old_forest_road",
              companions: [],
              provisions: 10,
              random: () => 0,
            });
            game.expedition = expedition;
            game.screen = "expedition";
            game.travelScenePresentation = null;
            expedition.status = "visual-test";
            expedition.travelState = "traveling";
            expedition.direction = "outbound";
            expedition.distance = 17;
            expedition.maxDistanceReached = 40;
            renderExpedition();
            await waitForActive(document.querySelector(".travel-scene"));

            let image = document.querySelector(
              "#travel-art .travel-visual-asset[data-travel-copy=\"primary\"]",
            );
            let animation = travelImageAnimation(image);
            let duration = Number(animation?.effect?.getComputedTiming?.().duration);
            if (!image || !animation || !Number.isFinite(duration) || duration <= 0) return false;

            animation.currentTime = duration * 0.55;
            updateTravelHud();
            await wait(120);
            const currentTrack = document.querySelector(
              "#travel-art .travel-visual-track[data-travel-layer=\"current\"]",
            );
            const seamForeground = document.querySelector("#travel-scene > .travel-seam-foreground-layer .travel-seam-foreground");
            const firstQueued = game.travelScenePresentation?.pending?.assetId === secondId
              && order() === `${firstId},${secondId}`;
            const seamSuppressed = !seamForeground || firstQueued;
            animation.currentTime = duration - 1;
            updateTravelHud();
            await wait(120);
            updateTravelHud();
            const firstTransition = game.travelScenePresentation?.activeAssetId === secondId
              && !game.travelScenePresentation?.pending
              && order() === `${secondId},${secondId}`;
            const changeSeam = document.querySelector("#travel-scene > .travel-seam-foreground-layer .travel-seam-foreground");
            const seamShownForChange = Boolean(changeSeam);
            const seamCoversFrame = Boolean(changeSeam)
              && changeSeam.getBoundingClientRect().height >= document.querySelector("#travel-scene").getBoundingClientRect().height;
            const changeLayer = changeSeam?.closest(".travel-seam-foreground-layer");
            const foregroundAboveTravelers = Boolean(changeLayer)
              && Number(getComputedStyle(changeLayer).zIndex) > Number(getComputedStyle(document.querySelector(".travelers")).zIndex);
            expedition.distance = 39;
            image = document.querySelector(
              "#travel-art .travel-visual-asset[data-travel-copy=\"primary\"]",
            );
            animation = travelImageAnimation(image);
            duration = Number(animation?.effect?.getComputedTiming?.().duration);
            if (!image || !animation || !Number.isFinite(duration) || duration <= 0) return false;
            game.travelScenePresentation.activeTileDistance = expedition.distance;
            game.travelScenePresentation.activeAnimationCycle = travelAnimationCycle(animation);
            animation.currentTime = duration * 0.55;
            updateTravelHud();
            await wait(120);
            const secondQueued = game.travelScenePresentation?.pending?.assetId === thirdId
              && order() === `${secondId},${thirdId}`;
            animation.currentTime = duration - 1;
            updateTravelHud();
            await wait(120);
            updateTravelHud();
            const secondTransition = game.travelScenePresentation?.activeAssetId === thirdId
              && !game.travelScenePresentation?.pending
              && order() === `${thirdId},${thirdId}`;
            const outboundTransitions = firstQueued && firstTransition && secondQueued && secondTransition;
            expedition.direction = "returning";
            expedition.distance = 63.6;
            updateTravelHud();
            await wait(80);
            const returnHeldCurrentArtwork = game.travelScenePresentation?.activeAssetId === thirdId
              && order() === thirdId + "," + thirdId
              && game.travelScenePresentation?.pending?.assetId !== secondId
              && getComputedStyle(document.querySelector("#travel-art .travel-visual-track[data-travel-layer=\"current\"]")).animationDirection === "reverse";
            definition.travelSeamForegroundAssetId = null;
            document.querySelector(".expedition-screen")?.remove();
            renderExpedition();
            await waitForActive(document.querySelector(".travel-scene"));
            const seamFallback = !document.querySelector("#travel-scene > .travel-seam-foreground-layer .travel-seam-foreground");
            result = outboundTransitions && returnHeldCurrentArtwork && seamSuppressed && seamShownForChange && seamCoversFrame && foregroundAboveTravelers && seamFallback;
          } finally {
            definition.travelScenes = originalScenes;
            if (originalSeamForeground === undefined) delete definition.travelSeamForegroundAssetId;
            else definition.travelSeamForegroundAssetId = originalSeamForeground;
            game.expedition = originalExpedition;
            game.screen = originalScreen;
            game.travelScenePresentation = null;
            renderScreen();
          }
          return result;
        })()
        """
        check(
            travel_lookahead_expression,
            "Travel lookahead did not stage and recycle both successive panorama scene changes without reverting the prior image",
        )
        check(
            r"""
            (async () => {
              const definition = EXPEDITION_DEFINITIONS.old_forest_road;
              const originalScenes = definition.travelScenes;
              const originalSeamForeground = definition.travelSeamForegroundAssetId;
              const originalExpedition = game.expedition;
              const originalScreen = game.screen;
              const firstId = "expedition_old_forest_road_woodcut";
              const secondId = "expedition_old_forest_road_woodcut_3";
              const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
              const waitForActive = (frame) => new Promise((resolve) => {
                let ticks = 0;
                const poll = () => frame?.classList.contains("asset-image-active")
                  || frame?.classList.contains("asset-load-failed")
                  || ticks++ > 100
                  ? resolve()
                  : setTimeout(poll, 10);
                poll();
              });
              try {
                definition.travelScenes = [
                  { minDistance: 0, visualAssetId: firstId, motion: "loop" },
                  { minDistance: 17.5, visualAssetId: secondId, motion: "pan", showSeamForegroundBetweenLoops: false },
                ];
                definition.travelSeamForegroundAssetId = firstId;
                const expedition = ExpeditionRules.createExpedition(game.player, {
                  expeditionId: "old_forest_road",
                  companions: [],
                  provisions: 10,
                  random: () => 0,
                });
                game.expedition = expedition;
                game.screen = "expedition";
                game.travelScenePresentation = null;
                expedition.status = "visual-crossfade-test";
                expedition.travelState = "traveling";
                expedition.direction = "outbound";
                expedition.distance = 17;
                expedition.maxDistanceReached = 20;
                renderExpedition();
                await waitForActive(document.querySelector(".travel-scene"));
                const image = document.querySelector("#travel-art .travel-visual-asset[data-travel-copy=\"primary\"]");
                const animation = travelImageAnimation(image);
                const duration = Number(animation?.effect?.getComputedTiming?.().duration);
                if (!image || !animation || !Number.isFinite(duration) || duration <= 0) return false;
                animation.currentTime = duration * 0.68;
                const state = travelScenePresentationFor(expedition);
                state.pending = {
                  assetId: secondId,
                  motion: "pan",
                  sceneKey: "scene:1:17.5",
                  showSeamForegroundBetweenLoops: false,
                  tileMode: false,
                  tileReady: false,
                  tileInstallRequested: false,
                  outgoingAssetId: firstId,
                  seamCrossed: false,
                };
                const scene = document.querySelector(".travel-scene");
                scene.dataset.travelDesiredAssetId = secondId;
                scene.dataset.travelDesiredMotion = "pan";
                beginTravelSceneTransition(expedition, scene, state.pending);
                await wait(820);
                const carry = document.querySelector("#travel-scene > .travel-seam-foreground-carry");
                const oldTrack = [...document.querySelectorAll("#travel-art .travel-visual-track")]
                  .find((track) => track.dataset.travelAssetId === firstId);
                const carryForeground = carry?.querySelector(".travel-seam-foreground");
                return Boolean(carry && carryForeground && carry.isConnected && !oldTrack?.isConnected);
              } finally {
                definition.travelScenes = originalScenes;
                if (originalSeamForeground === undefined) delete definition.travelSeamForegroundAssetId;
                else definition.travelSeamForegroundAssetId = originalSeamForeground;
                game.expedition = originalExpedition;
                game.screen = originalScreen;
                game.travelScenePresentation = null;
                renderScreen();
              }
            })()
            """,
            "Travel seam foreground was removed with the fading background instead of remaining until offscreen",
        )
        check(
            r"""
            (async () => {
              const definition = EXPEDITION_DEFINITIONS.old_forest_road;
              const originalScenes = definition.travelScenes;
              const originalSeamForeground = definition.travelSeamForegroundAssetId;
              const originalExpedition = game.expedition;
              const firstId = "expedition_old_forest_road_woodcut";
              const secondId = "expedition_old_forest_road_woodcut_3";
              const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
              const waitForActive = (frame) => new Promise((resolve) => {
                let ticks = 0;
                const poll = () => frame?.classList.contains("asset-image-active")
                  || frame?.classList.contains("asset-load-failed")
                  || ticks++ > 100
                  ? resolve()
                  : setTimeout(poll, 10);
                poll();
              });
              try {
                definition.travelScenes = [
                  { minDistance: 0, visualAssetId: firstId, motion: "loop", showSeamForegroundBetweenLoops: true },
                  { minDistance: 17.5, visualAssetId: secondId, motion: "loop", showSeamForegroundBetweenLoops: false },
                ];
                definition.travelSeamForegroundAssetId = firstId;
                const expedition = ExpeditionRules.createExpedition(game.player, {
                  expeditionId: "old_forest_road",
                  companions: [],
                  provisions: 10,
                  random: () => 0,
                });
                game.expedition = expedition;
                game.screen = "expedition";
                game.travelScenePresentation = null;
                expedition.status = "visual-same-loop-test";
                expedition.travelState = "traveling";
                expedition.direction = "outbound";
                expedition.distance = 17;
                expedition.maxDistanceReached = 20;
                renderExpedition();
                await waitForActive(document.querySelector(".travel-scene"));
                const image = document.querySelector("#travel-art .travel-visual-asset[data-travel-copy=\"primary\"]");
                const animation = travelImageAnimation(image);
                const duration = Number(animation?.effect?.getComputedTiming?.().duration);
                if (!image || !animation || !Number.isFinite(duration) || duration <= 0) return false;
                const initialTrack = currentTravelTrack();
                const seamLayer = document.querySelector("#travel-scene > .travel-seam-foreground-layer");
                const seamCopies = [...(seamLayer?.querySelectorAll(".travel-seam-foreground") ?? [])];
                const seamAnimation = travelImageAnimation(seamLayer);
                const loopDistance = Number.parseFloat(
                  getComputedStyle(initialTrack).getPropertyValue("--travel-loop-distance"),
                );
                const artFrame = document.querySelector("#travel-art")?.getBoundingClientRect();
                const setLoopTime = (time) => {
                  animation.currentTime = time;
                  if (seamAnimation) seamAnimation.currentTime = time;
                };
                const crossesLeftEdge = () => seamCopies.some((foreground) => {
                  const bounds = foreground.getBoundingClientRect();
                  return artFrame && bounds.left < artFrame.left && bounds.right > artFrame.left;
                });
                setLoopTime(duration - 1);
                const seamVisibleBeforeWrap = crossesLeftEdge();
                const spacing = seamCopies.length === 2
                  ? Math.abs(seamCopies[1].getBoundingClientRect().left - seamCopies[0].getBoundingClientRect().left)
                  : 0;
                setLoopTime(duration + 1);
                const seamVisibleAfterWrap = crossesLeftEdge();
                const repeatingSeamWrapPreserved = seamCopies.length === 2
                  && seamAnimation
                  && Number.isFinite(loopDistance)
                  && Math.abs(spacing - loopDistance) < 3
                  && seamVisibleBeforeWrap
                  && seamVisibleAfterWrap;
                const state = travelScenePresentationFor(expedition);
                state.activeTileDistance = expedition.distance;
                state.activeAnimationCycle = travelAnimationCycle(animation);
                setLoopTime(duration * 0.55);
                updateTravelHud();
                await wait(120);
                animation.currentTime = duration - 1;
                updateTravelHud();
                await wait(120);
                updateTravelHud();
                const carry = document.querySelector("#travel-scene > .travel-seam-foreground-carry");
                const foregrounds = [...(carry?.querySelectorAll(".travel-seam-foreground") ?? [])];
                const frame = document.querySelector("#travel-art")?.getBoundingClientRect();
                const outgoingRetained = Boolean(carry?.isConnected && foregrounds.length && frame)
                  && foregrounds.some((foreground) => {
                    const bounds = foreground.getBoundingClientRect();
                    return bounds.right > frame.left && bounds.left < frame.right;
                  });
                const backgroundBeforePause = currentTravelTrack()?.dataset.travelAssetId;
                expedition.travelState = "paused";
                updateTravelHud();
                const directionBeforeTransform = travelTransformX(currentTravelTrack());
                expedition.direction = "returning";
                updateTravelHud();
                const directionAfterTransform = travelTransformX(currentTravelTrack());
                const backgroundAfterDirection = currentTravelTrack()?.dataset.travelAssetId;
                const directionBeforeResumeTime = Number(travelImageAnimation(currentTravelTrack())?.currentTime);
                expedition.travelState = "traveling";
                updateTravelHud();
                await wait(120);
                const backgroundAfterResume = currentTravelTrack()?.dataset.travelAssetId;
                const directionAfterResumeAnimation = travelImageAnimation(currentTravelTrack());
                const movedAfterResume = Math.abs(
                  Number(directionAfterResumeAnimation?.currentTime) - directionBeforeResumeTime,
                ) > 0;
                expedition.distance = 17;
                updateTravelHud();
                await wait(120);
                const returnForeground = document.querySelector("#travel-scene > .travel-seam-foreground-layer:not(.travel-seam-foreground-carry) .travel-seam-foreground");
                const directionPreservedBackground = backgroundBeforePause
                  && backgroundBeforePause === backgroundAfterDirection
                  && backgroundBeforePause === backgroundAfterResume;
                const directionTransformPreserved = Number.isFinite(directionBeforeTransform)
                  && Number.isFinite(directionAfterTransform)
                  && Math.abs(directionBeforeTransform - directionAfterTransform) < 1;
                const returningDirection = getComputedStyle(currentTravelTrack()).animationDirection === "reverse";
                return outgoingRetained
                  && repeatingSeamWrapPreserved
                  && directionTransformPreserved
                  && movedAfterResume
                  && returningDirection
                  && directionPreservedBackground
                  && Boolean(returnForeground?.isConnected);
              } finally {
                definition.travelScenes = originalScenes;
                if (originalSeamForeground === undefined) delete definition.travelSeamForegroundAssetId;
                else definition.travelSeamForegroundAssetId = originalSeamForeground;
                game.expedition = originalExpedition;
                game.screen = "campaign";
                game.travelScenePresentation = null;
                renderScreen();
              }
            })()
            """,
            "Loop seam foreground was removed before its outgoing tree fully left the travel frame",
        )
        check(
            r"""
            (async () => {
              const definition = EXPEDITION_DEFINITIONS.old_forest_road;
              const originalScenes = definition.travelScenes;
              const originalSeamForeground = definition.travelSeamForegroundAssetId;
              const originalExpedition = game.expedition;
              const originalScreen = game.screen;
              const firstId = "expedition_old_forest_road_woodcut";
              const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
              const waitForActive = (frame) => new Promise((resolve) => {
                let ticks = 0;
                const poll = () => frame?.classList.contains("asset-image-active")
                  || frame?.classList.contains("asset-load-failed")
                  || ticks++ > 100
                  ? resolve()
                  : setTimeout(poll, 10);
                poll();
              });
              try {
                definition.travelScenes = [
                  { minDistance: 0, visualAssetId: firstId, motion: "loop", showSeamForegroundBetweenLoops: true },
                ];
                definition.travelSeamForegroundAssetId = firstId;
                const expedition = ExpeditionRules.createExpedition(game.player, {
                  expeditionId: "old_forest_road",
                  companions: [],
                  provisions: 10,
                  random: () => 0,
                });
                game.expedition = expedition;
                game.screen = "expedition";
                game.travelScenePresentation = null;
                expedition.status = "visual-direction-phase-test";
                expedition.travelState = "paused";
                expedition.direction = "outbound";
                expedition.distance = 5;
                expedition.maxDistanceReached = 10;
                renderExpedition();
                await waitForActive(document.querySelector(".travel-scene"));
                const initialAnimation = travelImageAnimation(currentTravelTrack());
                const duration = Number(initialAnimation?.effect?.getComputedTiming?.().duration);
                if (!initialAnimation || !Number.isFinite(duration) || duration <= 0) return false;
                const phaseResults = [];
                for (const fraction of [0.25, 0.92]) {
                  expedition.travelState = "paused";
                  expedition.direction = "outbound";
                  updateTravelHud();
                  const outboundAnimation = travelImageAnimation(currentTravelTrack());
                  outboundAnimation.currentTime = duration * fraction;
                  const before = travelTransformX(currentTravelTrack());
                  const beforeAsset = currentTravelTrack()?.dataset.travelAssetId;
                  expedition.direction = "returning";
                  updateTravelHud();
                  const after = travelTransformX(currentTravelTrack());
                  const afterAsset = currentTravelTrack()?.dataset.travelAssetId;
                  const direction = getComputedStyle(currentTravelTrack()).animationDirection;
                  const beforeResume = Number(travelImageAnimation(currentTravelTrack())?.currentTime);
                  expedition.travelState = "traveling";
                  updateTravelHud();
                  await wait(80);
                  const afterResume = Number(travelImageAnimation(currentTravelTrack())?.currentTime);
                  phaseResults.push(
                    Number.isFinite(before)
                    && Number.isFinite(after)
                    && Math.abs(before - after) < 1
                    && beforeAsset === afterAsset
                    && direction === "reverse"
                    && afterResume > beforeResume,
                  );
                  expedition.travelState = "paused";
                  expedition.direction = "outbound";
                  updateTravelHud();
                }
                return phaseResults.length === 2 && phaseResults.every(Boolean);
              } finally {
                definition.travelScenes = originalScenes;
                if (originalSeamForeground === undefined) delete definition.travelSeamForegroundAssetId;
                else definition.travelSeamForegroundAssetId = originalSeamForeground;
                game.expedition = originalExpedition;
                game.screen = originalScreen;
                game.travelScenePresentation = null;
                renderScreen();
              }
            })()
            """,
            "Reversing travel direction did not preserve the rendered loop position near and far from a seam",
        )
        check(
            "(() => { const definition=ENCOUNTER_DEFINITIONS.abandoned_camp; const base=resolveEncounterVisualState(definition,{}); const oldExpedition=game.expedition; const oldScreen=game.screen; const choice=definition.stages.start.choices.find(candidate=>candidate.id==='leave'); const oldOutcomes=choice.outcomes; const oldVisual=choice.visualOverride; const oldEnd=choice.endEncounter; choice.outcomes=[{type:'modifyResource',resource:'gold',amount:0}]; choice.visualOverride={backgroundAssetId:'expedition_old_forest_road_bg',encounterLayout:{arthur:{x:0.9,y:0.8}},hiddenSlots:['companion2']}; choice.endEncounter=true; const expedition=ExpeditionRules.createExpedition(SaveSystem.createDefaultPlayerState(),{expeditionId:'fountain_of_barenton',companions:['sir_kay','llamrei'],provisions:10}); EncounterManager.force(expedition,'abandoned_camp'); const resolved=EncounterManager.resolveChoice(expedition,SaveSystem.createDefaultPlayerState(),'leave'); const visual=resolveEncounterVisualState(definition,expedition.activeEncounter); game.expedition=expedition; game.screen='expedition'; renderScreen(); const image=document.querySelector('#travel-scene .travel-visual-track')?.dataset.travelAssetId; const members=[...document.querySelectorAll('#travelers > .companion')]; const rendered=members.length===2&&members[1].hidden&&document.querySelector('#travelers .arthur')?.dataset.encounterLayoutX==='0.9'&&Math.abs(Number(document.querySelector('#travelers .companion')?.dataset.encounterLayoutX)-base.layout.companion1.x)<0.0001; const inherited=visual.layout.companion1.x===base.layout.companion1.x&&visual.layout.companion2.y===base.layout.companion2.y; const stateUnchanged=expedition.selectedCompanions.length===2&&resolved.awaitingContinue; choice.outcomes=oldOutcomes; choice.visualOverride=oldVisual; choice.endEncounter=oldEnd; game.expedition=oldExpedition; game.screen=oldScreen; renderScreen(); return image==='expedition_old_forest_road_bg'&&resolved.resolved&&visual.hiddenSlots.has('companion2')&&inherited&&rendered&&stateUnchanged; })()",
            "Outcome visual overrides did not combine background, partial layout inheritance, hidden slots, and unchanged party state",
        )
        check("document.querySelectorAll('#debug-combat-select option').length===Object.keys(COMBAT_DEFINITIONS).length&&Boolean(document.querySelector('#debug-combat-select option[value=bandit_ambush]'))", "Combat launcher is not data-driven")
        check(
            "(() => { const items=document.querySelector('details[data-debug-details=items]'); const materials=document.querySelector('details[data-debug-details=materials]'); const gold=document.querySelector('#debug-gold-set'); const select=document.querySelector('#debug-item-select'); items.open=false; materials.open=true; gold.focus(); select.value='glimmering_sword'; select.dispatchEvent(new Event('change',{bubbles:true})); return !document.querySelector('details[data-debug-details=items]').open&&document.querySelector('details[data-debug-details=materials]').open&&document.activeElement?.id==='debug-gold-set'; })()",
            "Debug panel rebuild did not preserve section state and focused control",
        )

        check(
            "(() => { const s=document.querySelector('#debug-item-select'); s.value='glimmering_sword'; s.dispatchEvent(new Event('change',{bubbles:true})); document.querySelector('#debug-item-quantity').value='2'; document.querySelector('[data-debug-action=give-item]').click(); return game.player.ownedItems.glimmering_sword===2&&SaveSystem.load().ownedItems.glimmering_sword===2; })()",
            "Giving a data-defined item did not persist",
        )
        check(
            "(() => { const s=document.querySelector('#debug-item-select'); s.value='glimmering_sword'; s.dispatchEvent(new Event('change',{bubbles:true})); document.querySelector('#debug-item-quantity').value='10'; document.querySelector('[data-debug-action=remove-item]').click(); return !game.player.ownedItems.glimmering_sword&&Object.values(game.player.ownedItems).every(quantity=>quantity>=0); })()",
            "Removing an item did not clamp and clean up quantity",
        )
        check(
            "(() => { DebugTools.grantItem('glimmering_sword'); document.querySelector('#debug-item-select').value='glimmering_sword'; document.querySelector('#debug-item-select').dispatchEvent(new Event('change',{bubbles:true})); document.querySelector('[data-debug-action=equip-item]').click(); return game.player.equippedItems.weapon==='glimmering_sword'&&game.player.ownedItems.glimmering_sword===1; })()",
            "Equipping a data-defined item did not use valid equipment state",
        )
        check(
            "(() => { const s=document.querySelector('#debug-material-select'); s.value='silver'; s.dispatchEvent(new Event('change',{bubbles:true})); document.querySelector('#debug-material-quantity').value='4'; document.querySelector('[data-debug-action=give-material]').click(); const gave=game.player.materials.silver===4; document.querySelector('#debug-material-quantity').value='9'; document.querySelector('[data-debug-action=remove-material]').click(); return gave&&!game.player.materials.silver; })()",
            "Material give/remove did not use permanent material storage safely",
        )
        check(
            "(() => { const s=document.querySelector('#debug-recipe-select'); s.value='glimmering_sword'; s.dispatchEvent(new Event('change',{bubbles:true})); document.querySelector('[data-debug-action=learn-recipe]').click(); const learned=game.player.learnedRecipes.includes('glimmering_sword'); document.querySelector('[data-debug-action=forget-recipe]').click(); return learned&&!game.player.learnedRecipes.includes('glimmering_sword')&&SaveSystem.load().learnedRecipes.every(id=>RECIPE_DEFINITIONS[id]); })()",
            "Recipe learn/forget did not persist valid IDs",
        )
        check(
            "(() => { const s=document.querySelector('#debug-knowledge-select'); s.value='woodcraft'; s.dispatchEvent(new Event('change',{bubbles:true})); document.querySelector('[data-debug-action=grant-knowledge]').click(); const granted=game.player.learnedKnowledge.includes('woodcraft'); document.querySelector('[data-debug-action=remove-knowledge]').click(); return granted&&!game.player.learnedKnowledge.includes('woodcraft'); })()",
            "Knowledge grant/remove did not update progression",
        )
        check(
            "(() => { game.player.arthurHealth=1; document.querySelector('[data-debug-action=heal-arthur]').click(); return game.player.arthurHealth===HealingRules.arthurMaxHealth(game.player); })()",
            "Heal Arthur did not use the shared health maximum",
        )
        check(
            "(() => { game.player.arthurHealth=1; game.player.selectedCompanions=['sir_kay']; game.player.selectedCompanion='sir_kay'; game.player.companionStates.sir_kay.health=1; document.querySelector('[data-debug-action=heal-party]').click(); return game.player.arthurHealth===HealingRules.arthurMaxHealth(game.player)&&game.player.companionStates.sir_kay.health===InjuryRules.effectiveMaxHealth(game.player,'sir_kay'); })()",
            "Heal Party did not heal the selected party",
        )
        check(
            "(() => { game.expedition=ExpeditionRules.createExpedition(game.player,{provisions:10,companions:['sir_kay']}); game.screen='expedition'; renderScreen(); DebugTools.refresh(); const s=document.querySelector('#debug-encounter-select'); s.value='wild_boar'; s.dispatchEvent(new Event('change',{bubbles:true})); document.querySelector('[data-debug-action=trigger-encounter]').click(); return game.expedition.activeEncounter?.encounterId==='wild_boar'; })()",
            "Existing encounter forcing did not work through the general panel",
        )
        check(
            "(() => { game.expedition.activeEncounter=null; game.expedition.combat=null; renderScreen(); DebugTools.refresh(); const s=document.querySelector('#debug-combat-select'); s.value='bandit_ambush'; s.dispatchEvent(new Event('change',{bubbles:true})); document.querySelector('[data-debug-action=start-combat]').click(); return game.expedition.combat?.id==='bandit_ambush'&&document.querySelector('#debug-combat-state')?.textContent.includes('Bandit'); })()",
            "Data-defined combat did not launch through the production combat path",
        )
        check(
            "(() => { const enemy=game.expedition.combat.enemies[0]; document.querySelector('#debug-combat-enemy').value=enemy.id; document.querySelector('#debug-combat-enemy').dispatchEvent(new Event('change',{bubbles:true})); document.querySelector('#debug-combat-status').value='bleeding'; document.querySelector('#debug-combat-status').dispatchEvent(new Event('change',{bubbles:true})); document.querySelector('[data-debug-action=apply-combat-status]').click(); return Boolean(enemy.statuses.bleeding?.remainingActivations); })()",
            "Combat status debug control did not use canonical combat mutation",
        )
        check(
            "(() => { const run=SimulationRunner.run({seed:'debug-isolation',companions:[],turnaroundPolicy:{type:'fixedDistance',distance:1}}); ReplayController.start(run); const realPlayer=ReplayController.state().realGameState.player; const owned=realPlayer.ownedItems.glimmering_sword||0; const changed=DebugTools.grantItem('glimmering_sword'); const protectedState=realPlayer.ownedItems.glimmering_sword===owned&&!changed; ReplayController.exit(); return protectedState&&!ReplayController.isActive(); })()",
            "Debug controls mutated or failed to reject replay playback",
        )

        if devtools.console_errors:
            raise AssertionError(f"Runtime exceptions: {devtools.console_errors}")
        print(f"PASS: {checks} debug-tools assertions")
    finally:
        if devtools:
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
        shutil.rmtree(profile, ignore_errors=True)


if __name__ == "__main__":
    run()
