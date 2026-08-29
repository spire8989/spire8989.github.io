"""Narrow-viewport travel presentation stress test.

This deliberately holds image decode readiness while the expedition changes
direction, then exercises encounter entry/exit repeatedly. It checks renderer
ownership rather than authored travel content or simulation results.
"""

from __future__ import annotations

import json
import os
import shutil
import socket
import subprocess
import tempfile
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import requests
import websocket


ROOT = Path(__file__).resolve().parents[1]
CHROME = Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe")


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, _format, *_args):
        pass


class DevTools:
    def __init__(self, url: str):
        self.ws = websocket.create_connection(url, timeout=8, origin="http://localhost")
        self.next_id = 0
        self.exceptions: list[str] = []

    def call(self, method: str, params=None):
        self.next_id += 1
        request_id = self.next_id
        self.ws.send(json.dumps({"id": request_id, "method": method, "params": params or {}}))
        while True:
            message = json.loads(self.ws.recv())
            if message.get("method") == "Runtime.exceptionThrown":
                self.exceptions.append(str(message["params"]))
            if message.get("id") == request_id:
                if "error" in message:
                    raise AssertionError(message["error"])
                return message.get("result", {})

    def evaluate(self, expression: str):
        result = self.call("Runtime.evaluate", {
            "expression": expression,
            "returnByValue": True,
            "awaitPromise": True,
        })["result"]
        if result.get("subtype") == "error" or "exceptionDetails" in result:
            raise AssertionError(result)
        return result.get("value")


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def wait_for_json(port: int, url_prefix: str):
    endpoint = f"http://127.0.0.1:{port}/json"
    for _ in range(100):
        try:
            pages = requests.get(endpoint, timeout=0.2).json()
            page = next((entry for entry in pages if entry.get("url", "").startswith(url_prefix)), None)
            if page:
                return page["webSocketDebuggerUrl"]
        except (requests.RequestException, ValueError, KeyError):
            time.sleep(0.05)
    raise RuntimeError("Chrome DevTools endpoint did not start")


def run():
    if not CHROME.exists():
        raise RuntimeError(f"Chrome not found at {CHROME}")

    os.chdir(ROOT)
    http_port = free_port()
    debug_port = free_port()
    server = ThreadingHTTPServer(("127.0.0.1", http_port), QuietHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    profile = Path(tempfile.mkdtemp(prefix="grail-travel-stability-"))
    chrome = subprocess.Popen([
        str(CHROME),
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--remote-allow-origins=*",
        "--window-size=360,640",
        f"--remote-debugging-port={debug_port}",
        f"--user-data-dir={profile}",
        f"http://127.0.0.1:{http_port}/?debug=1",
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    try:
        devtools = DevTools(wait_for_json(debug_port, f"http://127.0.0.1:{http_port}/"))
        devtools.call("Runtime.enable")
        devtools.call("Page.enable")
        time.sleep(0.4)
        devtools.evaluate("localStorage.clear(); location.reload()")
        time.sleep(0.4)

        result = devtools.evaluate(r'''(async () => {
          const definition = EXPEDITION_DEFINITIONS.old_forest_road;
          const encounter = ENCOUNTER_DEFINITIONS.fallen_tree;
          const originalScenes = definition.travelScenes;
          const originalEncounterVisual = encounter.visualAssetId;
          const originalExpedition = game.expedition;
          const originalScreen = game.screen;
          const originalPresentation = game.travelScenePresentation;
          const firstId = 'expedition_old_forest_road_wide_bg_loop';
          const secondId = 'expedition_old_forest_road_50_bg';
          const parallaxId = 'expedition_old_forest_road_woodcut_parallax';
          const encounterId = 'encounter_broken_bridge';
          const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
          const waitFor = async (predicate, limit = 100) => {
            for (let index = 0; index < limit; index += 1) {
              if (predicate()) return true;
              await wait(12);
            }
            return predicate();
          };
          const state = () => {
            const scene = document.querySelector('#travel-scene');
            const art = document.querySelector('#travel-art');
            const tracks = [...(art?.querySelectorAll('.travel-visual-track') ?? [])];
            const current = tracks.filter((track) => track.dataset.travelLayer === 'current');
            const next = tracks.filter((track) => track.dataset.travelLayer === 'next');
            const outgoing = tracks.filter((track) => track.dataset.travelLayer === 'outgoing');
            const layers = [...(scene?.querySelectorAll('.travel-parallax-layer') ?? [])];
            const panel = document.querySelector('#expedition-panel-host');
            const noFailedAsset = !scene?.classList.contains('asset-load-failed');
            const currentTrack = current[0];
            const parallaxRequired = currentTrack?.dataset.travelKind === 'travel'
              && currentTrack.dataset.travelMotion === 'loop'
              && Boolean(currentTrack.dataset.travelParallaxAssetId);
            const parallaxHealthy = !parallaxRequired
              || (layers.length === 1
                && layers[0]._travelParallaxTrack === currentTrack
                && Number(layers[0].dataset.travelGeneration) === Number(game.travelPresentationGeneration));
            return {
              current: current.length,
              next: next.length,
              outgoing: outgoing.length,
              parallax: layers.length,
              panel: Boolean(panel),
              choices: Boolean(document.querySelector('.encounter-panel .encounter-choice')),
              background: Boolean(current[0]?.querySelector('.travel-visual-asset:not([hidden])')),
              noFailedAsset,
              parallaxHealthy,
              generation: game.travelPresentationGeneration,
              currentAsset: current[0]?.dataset.travelAssetId ?? null,
              currentKind: current[0]?.dataset.travelKind ?? null,
            };
          };
          const stable = (expectChoices = false) => {
            const snapshot = state();
            return snapshot.current === 1
              && snapshot.next <= 1
              && snapshot.outgoing <= 1
              && snapshot.parallax <= 1
              && snapshot.panel
              && snapshot.background
              && snapshot.noFailedAsset
              && (expectChoices || snapshot.parallaxHealthy)
              && (!expectChoices || snapshot.choices);
          };
          const releaseDecode = [];
          const originalDecode = HTMLImageElement.prototype.decode;
          const delayDecode = () => new Promise((resolve) => releaseDecode.push(resolve));
          const releaseAll = () => { while (releaseDecode.length) releaseDecode.shift()(); };
          let result = false;
          try {
            definition.travelScenes = [
              { minDistance: 0, visualAssetId: firstId, travelParallaxAssetId: parallaxId, motion: 'loop' },
              { minDistance: 12, visualAssetId: secondId, travelParallaxAssetId: parallaxId, motion: 'loop' },
            ];
            encounter.visualAssetId = null;
            const expedition = ExpeditionRules.createExpedition(game.player, {
              expeditionId: 'old_forest_road', companions: [], provisions: 20, random: () => 0,
            });
            expedition.status = 'active';
            expedition.travelState = 'traveling';
            expedition.direction = 'outbound';
            expedition.distance = 0;
            expedition.maxDistanceReached = 24;
            expedition.nextEncounterAt = 999999;
            game.expedition = expedition;
            game.screen = 'expedition';
            game.travelScenePresentation = null;
            renderExpedition();
            if (!await waitFor(() => document.querySelector('.travel-scene')?.classList.contains('asset-image-active'))) throw new Error(`initial image did not activate: ${JSON.stringify({state: state(), html: document.querySelector('#travel-art')?.innerHTML.slice(0, 240), scene: document.querySelector('.travel-scene')?.className})}`);
            if (!stable()) throw new Error(`initial invariant failed: ${JSON.stringify(state())}`);

            HTMLImageElement.prototype.decode = delayDecode;
            travelScenePreloadCache.delete(secondId);
            expedition.distance = 12;
            updateTravelHud();
            await wait(35);
            const beforeReturnGeneration = game.travelPresentationGeneration;
            expedition.direction = 'returning';
            updateTravelHud();
            const afterReturnGeneration = game.travelPresentationGeneration;
            const returnWasAtomic = afterReturnGeneration > beforeReturnGeneration && stable();
            await waitFor(() => releaseDecode.length > 0, 40);
            releaseAll();
            await wait(160);
            const staleTravelCallbacksIgnored = game.travelPresentationGeneration === afterReturnGeneration
              && stable();
            HTMLImageElement.prototype.decode = originalDecode;

            encounter.visualAssetId = encounterId;
            travelScenePreloadCache.delete(encounterId);
            HTMLImageElement.prototype.decode = delayDecode;
            if (!EncounterManager.force(expedition, 'fallen_tree')) throw new Error('first encounter could not start');
            expedition.activeEncounter.visualOverride = { backgroundAssetId: encounterId };
            renderExpedition();
            const encounterEntryStable = stable(true);
            await waitFor(() => releaseDecode.length > 0, 40);
            releaseAll();
            await wait(180);
            HTMLImageElement.prototype.decode = originalDecode;
            syncTravelPresentation(expedition);
            await waitFor(() => stable(true) && state().currentKind === 'encounter', 160);
            const dedicatedEncounterStable = stable(true)
              && state().currentKind === 'encounter';

            expedition.activeEncounter.phase = 'result';
            expedition.activeEncounter.resultText = 'The path is clear.';
            continueJourney();
            await wait(140);
            const exitStable = stable(false) && !document.querySelector('.encounter-panel');

            for (let cycle = 0; cycle < 5; cycle += 1) {
              expedition.travelState = 'paused';
              updateTravelHud();
              if (!stable(false)) throw new Error(`paused invariant failed at cycle ${cycle}: ${JSON.stringify(state())}`);
              expedition.travelState = 'traveling';
              updateTravelHud();
              if (!stable(false)) throw new Error(`resumed invariant failed at cycle ${cycle}: ${JSON.stringify(state())}`);
              encounter.visualAssetId = null;
              if (!EncounterManager.force(expedition, 'fallen_tree')) throw new Error(`repeat encounter could not start at cycle ${cycle}`);
              expedition.activeEncounter.visualOverride = null;
              renderExpedition();
              if (!stable(true)) throw new Error(`encounter invariant failed at cycle ${cycle}: ${JSON.stringify(state())}`);
              expedition.activeEncounter.phase = 'result';
              expedition.activeEncounter.resultText = 'The path is clear.';
              continueJourney();
              await wait(80);
              if (!stable(false)) throw new Error(`post-encounter invariant failed at cycle ${cycle}: ${JSON.stringify(state())}`);
            }
            result = returnWasAtomic
              && staleTravelCallbacksIgnored
              && encounterEntryStable
              && dedicatedEncounterStable
              && exitStable
              && stable(false);
            window.__travelStabilityDebug = {
              result,
              returnWasAtomic,
              staleTravelCallbacksIgnored,
              encounterEntryStable,
              dedicatedEncounterStable,
              exitStable,
              state: state(),
            };
          } catch (error) {
            window.__travelStabilityDebug = { error: String(error), state: state() };
          } finally {
            HTMLImageElement.prototype.decode = originalDecode;
            releaseAll();
            definition.travelScenes = originalScenes;
            encounter.visualAssetId = originalEncounterVisual;
            game.expedition = originalExpedition;
            game.screen = originalScreen;
            game.travelScenePresentation = originalPresentation;
            renderScreen();
          }
          return `TRAVEL:${result}:${JSON.stringify(window.__travelStabilityDebug ?? {})}`;
        })()''')
        if not result or not (isinstance(result, str) and result.startswith("TRAVEL:true:")):
            raise AssertionError(f"Travel return/encounter presentation invariants failed: {result!r}; debug={devtools.evaluate('window.__travelStabilityDebug')!r}")
        if devtools.exceptions:
            raise AssertionError(f"Browser exceptions during travel stress: {devtools.exceptions[-3:]}")
        print("Travel stability stress passed")
    finally:
        chrome.terminate()
        try:
            chrome.wait(timeout=5)
        except subprocess.TimeoutExpired:
            chrome.kill()
        server.shutdown()
        server.server_close()
        shutil.rmtree(profile, ignore_errors=True)


if __name__ == "__main__":
    run()
