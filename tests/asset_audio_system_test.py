"""Focused browser coverage for the image catalog and synth-only runtime."""

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
    profile = Path(tempfile.mkdtemp(prefix="grail-asset-audio-test-"))
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
            "Object.keys(IMAGE_ASSET_DEFINITIONS).length>0"
            "&&AssetCatalog.imagePath('missing')===null"
            "&&typeof AssetCatalog.audio==='undefined'"
            "&&Object.keys(AssetCatalog).sort().join(',')==='hasImage,image,imagePath'",
            "Image-only asset catalog contract is missing",
        )
        check(
            "renderImageAsset(null)===''"
            "&&renderPortraitAsset(null,'AK','Arthur').includes('portrait-fallback')"
            "&&renderCombatVisual(null,'♞','Arthur').includes('combat-visual-fallback')",
            "Runtime asset renderers did not retain their fallbacks",
        )
        check(
            "['old_forest_road','fountain_of_barenton','val_sans_retour','search_for_merlin']"
            ".every(id=>Object.prototype.hasOwnProperty.call(EXPEDITION_DEFINITIONS[id],'travelVisualAssetId')"
            "&&Object.prototype.hasOwnProperty.call(EXPEDITION_DEFINITIONS[id],'campVisualAssetId')"
            "&&Object.keys(EXPEDITION_DEFINITIONS[id]).every(key=>!key.toLowerCase().includes('ambience')))"
            "&&resolveExpeditionVisualAssetId({expeditionId:'old_forest_road'},'camp')==='expedition_old_forest_road_camp_bg'",
            "Route-scoped visual fields or camp fallback resolution are missing",
        )
        check(
            "(() => { const button=document.querySelector('[data-action=toggle-audio-settings]'); button.click();"
            "const panel=document.querySelector('#audio-settings');"
            "const input=document.querySelector('#audio-sfx-volume'); input.value='0.25'; input.dispatchEvent(new Event('input',{bubbles:true}));"
            "return !panel.hidden&&AudioManager.settings().sfxVolume===0.25&&AudioManager.isUnlocked(); })()",
            "Audio settings did not unlock and persist the SFX volume control",
        )
        check(
            "(() => { AudioManager.setMusic(null); AudioManager.setMuted(true); const muted=AudioManager.settings().muted; AudioManager.setMuted(false); return muted===true&&AudioManager.currentMusicId()===null&&AudioManager.settings().musicVolume>=0; })()",
            "Synth-only audio manager mute and stop behavior is not stable",
        )
        if devtools.console_errors:
            raise AssertionError(f"Runtime exceptions: {devtools.console_errors}")
        print(f"PASS: {checks} asset/audio pipeline assertions")
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
