"use strict";

const AUDIO_SETTINGS_STORAGE_KEY = "questForTheHolyGrail.audio.v1";
const AUDIO_SETTINGS_DEFAULTS = Object.freeze({
  muted: false,
  sfxVolume: 0.8,
  musicVolume: 0.6,
});

// Gameplay asks for semantic sound roles. Asset IDs remain centralized here
// so authored definitions and UI code never need to know filenames.
const AUDIO_SEMANTIC_ASSET_IDS = Object.freeze({
  confirm: "pickup_confirm",
  coins: "sfx_coins",
  loot: "sfx_loot",
  majorLoot: "sfx_major_loot",
  crafting: "sfx_crafting",
  cooking: "sfx_cooking",
  encounter: "sfx_encounter_sting",
  hit: "sfx_sword_hit",
  block: "sfx_block",
  heal: "sfx_heal",
  victory: "sfx_victory",
});

function clampAudioSetting(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(1, Math.max(0, numeric)) : fallback;
}

function readAudioSettings() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(AUDIO_SETTINGS_STORAGE_KEY) || "null");
    return {
      muted: saved?.muted === true,
      sfxVolume: clampAudioSetting(saved?.sfxVolume, AUDIO_SETTINGS_DEFAULTS.sfxVolume),
      musicVolume: clampAudioSetting(saved?.musicVolume ?? saved?.ambienceVolume, AUDIO_SETTINGS_DEFAULTS.musicVolume),
    };
  } catch (_error) {
    return { ...AUDIO_SETTINGS_DEFAULTS };
  }
}

const AudioManager = (() => {
  let settings = readAudioSettings();
  let initialized = false;
  let unlocked = false;
  let currentAmbienceId = null;
  let currentAmbience = null;
  let desiredAmbienceId = null;
  const synthPlayer = typeof GrailAudioSynth !== "undefined" ? new GrailAudioSynth.SynthPlayer() : null;
  let currentMusicId = null;
  let desiredMusicId = null;
  let musicRequest = 0;
  let transitionTimer = null;
  let transitionToken = 0;

  function persist() {
    try {
      window.localStorage.setItem(AUDIO_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch (_error) {
      // Audio preferences are best-effort when storage is unavailable.
    }
  }

  function updateSettingsUi() {
    const muteButton = document.querySelector("[data-action='toggle-audio-mute']");
    const panel = document.querySelector("#audio-settings");
    const sfx = document.querySelector("#audio-sfx-volume");
    const music = document.querySelector("#audio-music-volume");
    if (muteButton) {
      muteButton.textContent = settings.muted ? "Unmute" : "Mute";
      muteButton.setAttribute("aria-pressed", String(settings.muted));
    }
    if (panel) panel.dataset.muted = String(settings.muted);
    if (sfx) sfx.value = String(settings.sfxVolume);
    if (music) music.value = String(settings.musicVolume);
  }

  function synthMusicDefinition(id) {
    return typeof SYNTH_AUDIO_DEFINITIONS !== "undefined"
      ? SYNTH_AUDIO_DEFINITIONS.musicTracks?.[id] ?? null
      : null;
  }

  function stopCurrentMusic() {
    musicRequest += 1;
    currentMusicId = null;
    synthPlayer?.stopMusic();
  }

  function setMusic(id) {
    desiredMusicId = typeof id === "string" && id ? id : null;
    if (desiredMusicId === currentMusicId) return false;
    stopCurrentMusic();
    const definition = synthMusicDefinition(desiredMusicId);
    if (!desiredMusicId || !definition || !unlocked || settings.muted || !synthPlayer) return true;
    synthPlayer.setMusicVolume(settings.musicVolume);
    const request = ++musicRequest;
    currentMusicId = desiredMusicId;
    Promise.resolve(synthPlayer.playMusic(definition)).then((started) => {
      if (!started || request !== musicRequest || desiredMusicId !== currentMusicId) {
        if (request === musicRequest) stopCurrentMusic();
      }
    }).catch(() => {
      if (request === musicRequest) stopCurrentMusic();
    });
    return true;
  }

  function stopCurrentAmbience(immediate = false) {
    if (transitionTimer) {
      window.clearTimeout(transitionTimer);
      transitionTimer = null;
    }
    const audio = currentAmbience;
    currentAmbience = null;
    currentAmbienceId = null;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    if (!immediate) audio.volume = 0;
  }

  function startAmbience(id, token) {
    if (token !== transitionToken || id !== desiredAmbienceId) return;
    const path = AssetCatalog.audioPath(id);
    if (!path || !unlocked || settings.muted) return;
    const audio = new Audio(path);
    audio.loop = true;
    audio.volume = 0;
    audio.addEventListener("error", () => {
      if (currentAmbience === audio) stopCurrentAmbience(true);
    }, { once: true });
    currentAmbience = audio;
    currentAmbienceId = id;
    audio.play().catch(() => {
      if (currentAmbience === audio) stopCurrentAmbience(true);
    });
    const targetVolume = settings.musicVolume;
    const fadeSteps = 8;
    let step = 0;
    const fade = () => {
      if (currentAmbience !== audio) return;
      step += 1;
      audio.volume = targetVolume * (step / fadeSteps);
      if (step < fadeSteps) window.setTimeout(fade, 25);
    };
    fade();
  }

  function setAmbience(id) {
    desiredAmbienceId = typeof id === "string" ? id : null;
    if (desiredAmbienceId === currentAmbienceId && currentAmbience) return false;
    transitionToken += 1;
    const token = transitionToken;
    if (transitionTimer) {
      window.clearTimeout(transitionTimer);
      transitionTimer = null;
    }
    if (!desiredAmbienceId || !AssetCatalog.audioPath(desiredAmbienceId) || !unlocked || settings.muted) {
      stopCurrentAmbience();
      return true;
    }
    const previous = currentAmbience;
    if (previous) {
      previous.pause();
      previous.currentTime = 0;
      currentAmbience = null;
      currentAmbienceId = null;
    }
    transitionTimer = window.setTimeout(() => {
      transitionTimer = null;
      startAmbience(desiredAmbienceId, token);
    }, previous ? 160 : 0);
    return true;
  }

  function unlock() {
    if (!initialized) initialize();
    if (unlocked) return true;
    unlocked = true;
    synthPlayer?.ensureContext().catch(() => {});
    if (desiredAmbienceId) setAmbience(desiredAmbienceId);
    if (desiredMusicId) setMusic(desiredMusicId);
    return true;
  }

  function playSfx(id) {
    const path = AssetCatalog.audioPath(id);
    if (path) {
      if (!unlocked || settings.muted || settings.sfxVolume <= 0) return false;
      const audio = new Audio(path);
      audio.volume = settings.sfxVolume;
      audio.play().catch(() => {});
      return true;
    }
    return playSynthSfx(id);
  }

  function playSynthSfx(id) {
    const definition = typeof SYNTH_AUDIO_DEFINITIONS !== "undefined"
      ? SYNTH_AUDIO_DEFINITIONS.sfx?.[id] ?? null
      : null;
    if (!definition || !unlocked || settings.muted || settings.sfxVolume <= 0 || !synthPlayer) return false;
    synthPlayer.setSfxVolume(settings.sfxVolume);
    Promise.resolve(synthPlayer.playSfx(definition)).catch(() => {});
    return true;
  }

  function playSemantic(role) {
    return playSfx(AUDIO_SEMANTIC_ASSET_IDS[role]);
  }

  function playAction(action) {
    const roles = {
      "buy-item": "coins",
      "buy-provisions": "coins",
      "sell-item": "coins",
      "craft-item": "crafting",
      "inn-cook-recipe": "cooking",
      "cook-recipe": "cooking",
      "camp-craft-item": "crafting",
      "encounter-choice": "encounter",
      "combat-action": "confirm",
      "combat-ability": "hit",
      "combat-item": "heal",
      "combat-target": "confirm",
      "camp-rest": "heal",
      "rest-at-inn": "heal",
      "continue-journey": "confirm",
    };
    return playSemantic(roles[action] ?? "confirm");
  }

  function setMuted(muted) {
    settings.muted = Boolean(muted);
    persist();
    updateSettingsUi();
    if (settings.muted) {
      stopCurrentAmbience();
      stopCurrentMusic();
    } else {
      if (desiredAmbienceId) setAmbience(desiredAmbienceId);
      if (desiredMusicId) setMusic(desiredMusicId);
    }
  }

  function setSfxVolume(value) {
    settings.sfxVolume = clampAudioSetting(value, AUDIO_SETTINGS_DEFAULTS.sfxVolume);
    synthPlayer?.setSfxVolume(settings.sfxVolume);
    persist();
    updateSettingsUi();
  }

  function setMusicVolume(value) {
    settings.musicVolume = clampAudioSetting(value, AUDIO_SETTINGS_DEFAULTS.musicVolume);
    if (currentAmbience) currentAmbience.volume = settings.musicVolume;
    synthPlayer?.setMusicVolume(settings.musicVolume);
    persist();
    updateSettingsUi();
  }

  function setAmbienceVolume(value) {
    setMusicVolume(value);
  }

  function initialize() {
    if (initialized) return;
    initialized = true;
    updateSettingsUi();
  }

  return Object.freeze({
    initialize,
    unlock,
    playSfx,
    playSemantic,
    playAction,
    setMusic,
    stopMusic: () => {
      desiredMusicId = null;
      stopCurrentMusic();
    },
    playSynthSfx,
    setAmbience,
    stopAmbience: () => {
      desiredAmbienceId = null;
      transitionToken += 1;
      stopCurrentAmbience();
    },
    setMuted,
    setSfxVolume,
    setMusicVolume,
    setAmbienceVolume,
    toggleSettings: () => {
      const panel = document.querySelector("#audio-settings");
      if (!panel) return;
      panel.hidden = !panel.hidden;
      if (!panel.hidden) updateSettingsUi();
    },
    settings: () => ({ ...settings }),
    isUnlocked: () => unlocked,
    currentMusicId: () => currentMusicId,
    currentAmbienceId: () => currentAmbienceId,
  });
})();
