"use strict";

const AUDIO_SETTINGS_STORAGE_KEY = "questForTheHolyGrail.audio.v1";
const AUDIO_SETTINGS_DEFAULTS = Object.freeze({
  muted: false,
  sfxVolume: 0.8,
  musicVolume: 0.6,
});

// Gameplay uses semantic roles so authored UI and actions only depend on
// stable synthesized SFX IDs.
const AUDIO_SEMANTIC_SFX_IDS = Object.freeze({
  confirm: "pickup_confirm",
  coins: "coins",
  loot: "loot",
  majorLoot: "major_loot",
  crafting: "crafting",
  cooking: "cooking",
  encounter: "encounter",
  hit: "sword_hit",
  block: "block",
  heal: "heal",
  victory: "victory",
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
      musicVolume: clampAudioSetting(saved?.musicVolume, AUDIO_SETTINGS_DEFAULTS.musicVolume),
    };
  } catch (_error) {
    return { ...AUDIO_SETTINGS_DEFAULTS };
  }
}

const AudioManager = (() => {
  let settings = readAudioSettings();
  let initialized = false;
  let unlocked = false;
  const synthPlayer = typeof GrailAudioSynth !== "undefined" ? new GrailAudioSynth.SynthPlayer() : null;
  let currentMusicId = null;
  let desiredMusicId = null;
  let musicRequest = 0;

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

  function musicDefinition(id) {
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
    const requestedId = typeof id === "string" && id ? id : null;
    const nextId = musicDefinition(requestedId) ? requestedId : null;
    desiredMusicId = nextId;
    if (desiredMusicId === currentMusicId) return false;
    stopCurrentMusic();
    if (!desiredMusicId || !unlocked || settings.muted || !synthPlayer) return true;
    synthPlayer.setMusicVolume(settings.musicVolume);
    const request = ++musicRequest;
    currentMusicId = desiredMusicId;
    Promise.resolve(synthPlayer.playMusic(musicDefinition(desiredMusicId))).then((started) => {
      if (!started || request !== musicRequest || desiredMusicId !== currentMusicId) {
        if (request === musicRequest) stopCurrentMusic();
      }
    }).catch(() => {
      if (request === musicRequest) stopCurrentMusic();
    });
    return true;
  }

  function playSfx(id) {
    const definition = typeof SYNTH_AUDIO_DEFINITIONS !== "undefined"
      ? SYNTH_AUDIO_DEFINITIONS.sfx?.[id] ?? null
      : null;
    if (!definition || !unlocked || settings.muted || settings.sfxVolume <= 0 || !synthPlayer) return false;
    synthPlayer.setSfxVolume(settings.sfxVolume);
    Promise.resolve(synthPlayer.playSfx(definition)).catch(() => {});
    return true;
  }

  function playSemantic(role) {
    return playSfx(AUDIO_SEMANTIC_SFX_IDS[role]);
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

  function unlock() {
    if (!initialized) initialize();
    if (unlocked) return true;
    unlocked = true;
    synthPlayer?.ensureContext().catch(() => {});
    if (desiredMusicId) setMusic(desiredMusicId);
    return true;
  }

  function setMuted(muted) {
    settings.muted = Boolean(muted);
    persist();
    updateSettingsUi();
    if (settings.muted) {
      stopCurrentMusic();
    } else if (desiredMusicId) {
      setMusic(desiredMusicId);
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
    synthPlayer?.setMusicVolume(settings.musicVolume);
    persist();
    updateSettingsUi();
  }

  function initialize() {
    if (initialized) return;
    initialized = true;
    updateSettingsUi();
  }

  return Object.freeze({
    initialize,
    unlock,
    setMusic,
    stopMusic: () => {
      desiredMusicId = null;
      stopCurrentMusic();
    },
    playSfx,
    playSemantic,
    playAction,
    setMuted,
    setSfxVolume,
    setMusicVolume,
    toggleSettings: () => {
      const panel = document.querySelector("#audio-settings");
      if (!panel) return;
      panel.hidden = !panel.hidden;
      if (!panel.hidden) updateSettingsUi();
    },
    settings: () => ({ ...settings }),
    isUnlocked: () => unlocked,
    currentMusicId: () => currentMusicId,
  });
})();
