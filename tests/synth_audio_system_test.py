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
            "&&AssetCatalog.audioPath('pickup_confirm')===null",
            "Canonical synth content or file-backed asset separation is missing",
        )

        devtools.evaluate(
            "localStorage.setItem('questForTheHolyGrail.audio.v1',"
            "JSON.stringify({muted:false,sfxVolume:0.4,ambienceVolume:0.37})); location.reload()"
        )
        time.sleep(0.35)
        check(
            "AudioManager.settings().musicVolume===0.37"
            "&&AudioManager.settings().ambienceVolume===undefined",
            "Legacy ambienceVolume did not migrate to musicVolume",
        )
        check(
            "(() => { AudioManager.setMusicVolume(0.37);"
            "const saved=JSON.parse(localStorage.getItem('questForTheHolyGrail.audio.v1'));"
            "return saved.musicVolume===0.37&&saved.ambienceVolume===undefined; })()",
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
              const sfxStarted = AudioManager.playSynthSfx('pickup_confirm') === true;
              return { features, stopped, sameTrack, musicStarted, sfxStarted };
            })()
        """)
        if not all(runtime_result.values()):
            raise AssertionError(f"Synth runtime lifecycle result was incomplete: {runtime_result}")
        checks += 1

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
