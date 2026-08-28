"""Focused browser coverage for the canonical synthesized-audio runtime pass."""

from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
import threading
import time
from http.server import ThreadingHTTPServer
from pathlib import Path

from asset_audio_system_test import CHROME, DevTools, QuietHandler, ROOT, free_port, wait_for_json


def run() -> None:
    if not CHROME.exists():
        raise RuntimeError(f"Chrome not found at {CHROME}")

    os.chdir(ROOT)
    http_port = free_port()
    debug_port = free_port()
    server = ThreadingHTTPServer(("127.0.0.1", http_port), QuietHandler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    profile = Path(tempfile.mkdtemp(prefix="grail-synth-audio-test-"))
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
            "(() => { const src=[...document.scripts].map(script=>script.src);"
            "return src.findIndex(value=>value.endsWith('/js/audio-synth-data.js'))"
            "<src.findIndex(value=>value.endsWith('/js/audio-synth.js'))"
            "&&src.findIndex(value=>value.endsWith('/js/audio-synth.js'))"
            "<src.findIndex(value=>value.endsWith('/js/audio.js')); })()",
            "Synth data and runtime did not load before AudioManager",
        )
        check(
            "Object.keys(SYNTH_AUDIO_DEFINITIONS.musicTracks).includes('camelot_twilight')"
            "&&Object.keys(SYNTH_AUDIO_DEFINITIONS.sfx).includes('pickup_confirm')"
            "&&typeof AssetCatalog.audio==='undefined'",
            "Canonical synth content or image-only asset separation is missing",
        )

        devtools.evaluate(
            "localStorage.setItem('questForTheHolyGrail.audio.v1',"
            "JSON.stringify({muted:false,sfxVolume:0.4,musicVolume:0.37})); location.reload()"
        )
        time.sleep(0.35)
        check(
            "AudioManager.settings().musicVolume===0.37"
            "&&AudioManager.settings().sfxVolume===0.4",
            "Synth audio settings did not reload from storage",
        )
        check(
            "(() => { AudioManager.setMusicVolume(0.37);"
            "const saved=JSON.parse(localStorage.getItem('questForTheHolyGrail.audio.v1'));"
            "return saved.musicVolume===0.37&&saved.sfxVolume===0.4; })()",
            "Audio settings did not persist the new musicVolume key",
        )

        runtime_result = devtools.evaluate(r"""
            (async () => {
              class Param {
                constructor() { this.value = 0; }
                setValueAtTime(value) { this.value = value; }
                linearRampToValueAtTime(value) { this.value = value; }
                exponentialRampToValueAtTime(value) { this.value = value; }
                setTargetAtTime(value) { this.value = value; }
              }
              const counts = { oscillator: 0, filter: 0, gain: 0, stopped: 0 };
              class Node {
                constructor(kind) {
                  this.kind = kind;
                  this.frequency = new Param();
                  this.gain = new Param();
                  this.detune = new Param();
                  this.Q = new Param();
                }
                connect() { return this; }
                disconnect() {}
                start() {}
                stop() { counts.stopped += 1; }
              }
              class FakeAudioContext {
                constructor() { this.state = 'running'; this.currentTime = 0; this.sampleRate = 8000; this.destination = {}; }
                resume() { return Promise.resolve(); }
                createGain() { counts.gain += 1; return new Node('gain'); }
                createOscillator() { counts.oscillator += 1; return new Node('oscillator'); }
                createBiquadFilter() { counts.filter += 1; return new Node('filter'); }
                createBufferSource() { return new Node('buffer'); }
                createBuffer(_channels, length) { return { getChannelData: () => new Float32Array(length) }; }
              }
              window.AudioContext = FakeAudioContext;
              const probe = new window.GrailAudioSynth.SynthPlayer();
              await probe.playMusic({
                bpm: 120, loopBeats: 2,
                voices: [{
                  wave: 'triangle', gain: 0.1,
                  filter: { frequency: 1800, q: 0.7 },
                  vibrato: { rate: 5.2, depth: 8 },
                  notes: [['C4', 0, 1]]
                }]
              });
              const features = counts.filter === 1 && counts.oscillator === 2;
              probe.stopMusic();
              const stopped = probe.status().music === 'stopped' && counts.stopped >= 2;
              AudioManager.unlock();
              AudioManager.setMusic('camelot_twilight');
              await new Promise(resolve => setTimeout(resolve, 0));
              const sameTrack = AudioManager.setMusic('camelot_twilight') === false;
              const musicStarted = AudioManager.currentMusicId() === 'camelot_twilight';
              const sfxStarted = AudioManager.playSfx('pickup_confirm') === true;
              return { features, stopped, sameTrack, musicStarted, sfxStarted };
            })()
        """)
        if not all(runtime_result.values()):
            raise AssertionError(f"Synth runtime lifecycle result was incomplete: {runtime_result}")
        checks += 1

        check(
            "(() => {"
            "const defaults=GLOBAL_SETTINGS.audioDefaults;"
            "const combat=defaults.combat;"
            "const semantic=AudioManager.semanticSfxId('confirm')==='pickup_confirm'"
            "&&AudioManager.semanticSfxId('coins')==='coins_transaction'"
            "&&AudioManager.semanticSfxId('cooking')==='cooking_loop'"
            "&&AudioManager.semanticSfxId('crafting')==='craft_cloth_loop';"
            "const hierarchy=CraftingRules.timedActionSfxId('apothecary',RECIPE_DEFINITIONS.bandages)==='craft_cloth_loop'"
            "&&CraftingRules.timedActionSfxId('apothecary',RECIPE_DEFINITIONS.healing_poultice)==='craft_potion_loop'"
            "&&CraftingRules.timedActionSfxId('blacksmith',RECIPE_DEFINITIONS.repair_kit)==='craft_blacksmith_loop'"
            "&&CraftingRules.timedActionSfxId('campfire',RECIPE_DEFINITIONS.roasted_meat)==='cooking_loop';"
            "const started=AudioManager.startLoopingSfx('cooking_loop','synth-test-loop');"
            "const active=AudioManager.loopingSfxChannels().some(entry=>entry.channel==='synth-test-loop'&&entry.id==='cooking_loop');"
            "const stopped=AudioManager.stopLoopingSfx('synth-test-loop')"
            "&&!AudioManager.loopingSfxChannels().some(entry=>entry.channel==='synth-test-loop');"
            "const oldScreen=game.screen,oldDestination=game.activeDestinationId,oldRest=game.restAction;"
            "game.screen='destination';game.activeDestinationId='inn';game.restAction={context:'inn-rest'};"
            "const rest=resolveCurrentMusicTrackId()==='rest_lullaby';game.restAction=null;"
            "const contextual=resolveCurrentMusicTrackId()!=='rest_lullaby';"
            "game.screen=oldScreen;game.activeDestinationId=oldDestination;game.restAction=oldRest;renderScreen();"
            "return defaults.restMusicTrackId==='rest_lullaby'&&combat.playerAttackUseSfxId==='attack_swing'&&combat.playerAttackImpactSfxId==='attack_impact'&&combat.enemyAttackUseSfxId===null&&combat.enemyAttackImpactSfxId==='attack_impact'&&semantic&&hierarchy&&started&&active&&stopped&&rest&&contextual; })()",
            "Global audio defaults, crafting hierarchy, loop lifecycle, or rest override is not stable",
        )

        check(
            "(() => { game.player.campaignFlags.broceliande_intro_complete=true;"
            "game.locationContext=null; game.activeDestinationId=null; game.screen='location'; renderScreen();"
            "const first=AudioManager.currentMusicId(); renderLocation();"
            "game.activeDestinationId='inn'; game.screen='destination'; renderDestination();"
            "const second=AudioManager.currentMusicId(); renderDestination();"
            "const repeated=AudioManager.currentMusicId()===second;"
            "game.screen='campaign'; renderScreen();"
            "return first==='camelot_twilight'&&second==='camelot_twilight'&&repeated&&AudioManager.currentMusicId()===null; })()",
            "Town and destination context did not inherit stable location music",
        )
        check(
            "(() => { const expedition={expeditionId:'old_forest_road',status:'active',travelState:'traveling'};"
            "const travel=resolveExpeditionMusicTrackId(expedition); expedition.travelState='camped';"
            "const inherited=resolveExpeditionMusicTrackId(expedition);"
            "EXPEDITION_DEFINITIONS.old_forest_road.campMusicTrackId=null;"
            "const disabled=resolveExpeditionMusicTrackId(expedition);"
            "delete EXPEDITION_DEFINITIONS.old_forest_road.campMusicTrackId;"
            "return travel==='wisps_of_the_forest'&&inherited===travel&&disabled===null; })()",
            "Expedition travel/camp synth inheritance and explicit camp silence are not stable",
        )
        check(
            "(() => { const expedition={expeditionId:'old_forest_road',status:'active',travelState:'camped'};"
            "const definition=EXPEDITION_DEFINITIONS.old_forest_road;"
            "const oldCombat=definition.combatMusicTrackId; const oldCamp=definition.campMusicTrackId;"
            "definition.combatMusicTrackId='camelot_twilight'; definition.campMusicTrackId='wisps_of_the_forest'; expedition.combat={};"
            "const combat=resolveExpeditionMusicTrackId(expedition); delete expedition.combat;"
            "const camp=resolveExpeditionMusicTrackId(expedition); delete definition.campMusicTrackId;"
            "const travel=resolveExpeditionMusicTrackId(expedition);"
            "if(oldCombat===undefined) delete definition.combatMusicTrackId; else definition.combatMusicTrackId=oldCombat;"
            "if(oldCamp===undefined) delete definition.campMusicTrackId; else definition.campMusicTrackId=oldCamp;"
            "const destination=DESTINATION_DEFINITIONS.inn; const oldDestinationMusic=destination.musicTrackId;"
            "destination.musicTrackId='wisps_of_the_forest'; game.activeDestinationId='inn'; game.screen='destination';"
            "const explicitDestination=resolveCurrentMusicTrackId(); delete destination.musicTrackId;"
            "const inheritedDestination=resolveCurrentMusicTrackId();"
            "if(oldDestinationMusic===undefined) delete destination.musicTrackId; else destination.musicTrackId=oldDestinationMusic;"
            "game.activeDestinationId=null; game.screen='campaign'; renderScreen();"
            "return combat==='camelot_twilight'&&camp==='wisps_of_the_forest'&&travel==='wisps_of_the_forest'&&explicitDestination==='wisps_of_the_forest'&&inheritedDestination==='camelot_twilight'&&AudioManager.playAction('unknown-audio-action')===false; })()",
            "Music precedence or unknown action audio behavior is not stable",
        )
        check(
            "(() => { const p=SaveSystem.createDefaultPlayerState(); p.selectedCompanions=[]; const e=ExpeditionRules.createExpedition(p,{companions:[],provisions:5,random:()=>0}); const c=CombatSystem.create(e,'wild_boar',{random:()=>0}); const target=c.enemies[0]; c.status='awaitingAction'; c.activeActorId='arthur'; const result=CombatSystem.resolveDefinition(c,e,{id:'audio_probe',name:'Audio Probe',kind:'active',target:'enemy',targetMode:'singleEnemy',useSfxId:'use_probe',impactSfxId:'impact_probe',effects:[{type:'weaponDamage'}]},target.id); const action=c.events.at(-1); return result.resolved&&action.useSfxId==='use_probe'&&action.impactSfxId==='impact_probe'&&Array.isArray(action.defeatedTargetIds); })()",
            "Combat result events did not preserve authored audio metadata",
        )
        check(
            "(() => {"
            "const originalExpedition=game.expedition,originalScreen=game.screen;"
            "const p=SaveSystem.createDefaultPlayerState();p.selectedCompanions=[];"
            "const e=ExpeditionRules.createExpedition(p,{companions:[],provisions:5,random:()=>0});"
            "e.status='active';const c=CombatSystem.create(e,'wild_boar',{random:()=>0});e.combat=c;"
            "game.expedition=e;game.screen='expedition';const target=c.enemies[0];target.hp=0;"
            "const event={actor:'arthur',action:'attack',target:target.id,damage:target.maxHp,useSfxId:'use_probe',impactSfxId:'impact_probe',defeatedTargetIds:[target.id],sequence:1};"
            "const calls=[];const fake={playSfx:id=>{calls.push('sfx:'+id);return true;},playSemantic:role=>{calls.push('semantic:'+role);return true;}};"
            "const basic={actor:'arthur',action:'attack',target:target.id,damage:1,sequence:0};const basicCalls=[];const basicFake={playSfx:id=>{basicCalls.push('sfx:'+id);return true;},playSemantic:role=>{basicCalls.push('semantic:'+role);return true;}};"
            "playCombatActionStartAudio([basic],c,basicFake);const basicStart=basicCalls.join('|')==='sfx:attack_swing';"
            "const basicController=combatPresentationController(c);basicController.active={event:basic,version:0,finished:false};presentCombatImpact(e,c,basic,0,basicFake);const basicImpact=basicCalls.join('|')==='sfx:attack_swing|sfx:attack_impact';"
            "const special={actor:'arthur',action:'ability',target:'arthur',healingAmount:3,sequence:3};const specialCalls=[];const specialFake={playSfx:id=>{specialCalls.push('sfx:'+id);return true;},playSemantic:role=>{specialCalls.push('semantic:'+role);return true;}};"
            "playCombatActionStartAudio([special],c,specialFake);const specialStart=specialCalls.length===0;const specialController=combatPresentationController(c);specialController.active={event:special,version:3,finished:false};presentCombatImpact(e,c,special,3,specialFake);const specialImpact=specialCalls.join('|')==='semantic:heal';"
            "const enemy={actor:'wild_boar_1',action:'boar_charge',target:'arthur',damage:4,sequence:4};const enemyCalls=[];const enemyFake={playSfx:id=>{enemyCalls.push('sfx:'+id);return true;},playSemantic:role=>{enemyCalls.push('semantic:'+role);return true;}};"
            "playCombatActionStartAudio([enemy],c,enemyFake);const enemyStart=enemyCalls.length===0;const enemyController=combatPresentationController(c);enemyController.active={event:enemy,version:4,finished:false};presentCombatImpact(e,c,enemy,4,enemyFake);const enemyImpact=enemyCalls.join('|')==='sfx:attack_impact';"
            "playCombatActionStartAudio([event],c,fake);const start=calls.join('|')==='sfx:use_probe';"
            "const controller=combatPresentationController(c);controller.active={event,version:1,finished:false};"
            "presentCombatImpact(e,c,event,1,fake);const impact=calls.join('|')==='sfx:use_probe|sfx:impact_probe|semantic:enemyDown';"
            "presentCombatImpact(e,c,event,1,fake);const once=calls.length===3;"
            "const blockedCalls=[];const blockedEvent={actor:'wild_boar_1',action:'boar_charge',target:'arthur',damage:0,damagePrevented:4,sequence:2};"
            "const blockedController=combatPresentationController(c);blockedController.active={event:blockedEvent,version:2,finished:false};"
            "presentCombatImpact(e,c,blockedEvent,2,{playSfx:id=>{blockedCalls.push('sfx:'+id);return true;},playSemantic:role=>{blockedCalls.push('semantic:'+role);return true;}});"
            "const blocked=blockedCalls.join('|')==='semantic:block';"
            "game.expedition=originalExpedition;game.screen=originalScreen;renderScreen();"
            "return basicStart&&basicImpact&&specialStart&&specialImpact&&enemyStart&&enemyImpact&&start&&impact&&once&&blocked; })()",
            "Combat action audio did not separate start, visual impact, defeat, fallback, and duplicate lifecycles",
        )
        if devtools.console_errors:
            raise AssertionError(f"Runtime exceptions: {devtools.console_errors}")
        print(f"PASS: {checks} synthesized-audio runtime assertions")
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
