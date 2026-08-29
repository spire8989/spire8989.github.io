"use strict";

const AUDIO_SETTINGS_STORAGE_KEY = "questForTheHolyGrail.audio.v1";
const AUDIO_SETTINGS_DEFAULTS = Object.freeze({
  muted: false,
  sfxVolume: 0.8,
  musicVolume: 0.6,
});

// Gameplay uses semantic roles so authored UI and actions only depend on
// stable synthesized SFX IDs. Promoted gameplay sounds come from the global
// settings singleton; only legacy/unconfigured roles retain local fallbacks.
const AUDIO_SEMANTIC_SFX_IDS = Object.freeze({
  reject: "reject",
  loot: "loot",
  majorLoot: "major_loot",
  encounter: "encounter",
  hit: "sword_hit",
  block: "block",
  heal: "heal",
  status: "status",
  enemyDown: "enemy_down",
  allyDown: "ally_down",
  fleeSuccess: "flee_success",
  fleeFail: "flee_fail",
  victory: "victory",
  defeat: "defeat",
  departure: "departure",
  safeReturn: "safe_return",
});

const AUDIO_GLOBAL_SFX_FIELDS = Object.freeze({
  confirm: "confirmSfxId",
  coins: "transactionSfxId",
  transaction: "transactionSfxId",
  crafting: "craftingSfxId",
  cooking: "cookingLoopSfxId",
});

const AUDIO_DUCKING_SEMANTIC_ROLES = new Set([
  "loot",
  "majorLoot",
  "encounter",
  "hit",
  "block",
  "heal",
  "status",
  "enemyDown",
  "allyDown",
  "fleeSuccess",
  "fleeFail",
  "victory",
  "defeat",
  "departure",
  "safeReturn",
]);

const AUDIO_DUCKING_DEFAULTS = Object.freeze({
  enabled: true,
  duckMultiplier: 0.62,
  attackMs: 60,
  holdMs: 180,
  releaseMs: 320,
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
  const loopingSfx = new Map();
  let activeLoopChannel = null;

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

  function musicDuckingSettings() {
    const configured = typeof GLOBAL_SETTINGS !== "undefined"
      ? GLOBAL_SETTINGS.audioDefaults?.musicDucking
      : null;
    return {
      enabled: configured?.enabled !== false,
      duckMultiplier: clampAudioSetting(configured?.duckMultiplier, AUDIO_DUCKING_DEFAULTS.duckMultiplier),
      attackMs: Math.max(0, Math.min(120000, Number.isFinite(Number(configured?.attackMs)) ? Number(configured.attackMs) : AUDIO_DUCKING_DEFAULTS.attackMs)),
      holdMs: Math.max(0, Math.min(120000, Number.isFinite(Number(configured?.holdMs)) ? Number(configured.holdMs) : AUDIO_DUCKING_DEFAULTS.holdMs)),
      releaseMs: Math.max(0, Math.min(120000, Number.isFinite(Number(configured?.releaseMs)) ? Number(configured.releaseMs) : AUDIO_DUCKING_DEFAULTS.releaseMs)),
    };
  }

  function requestMusicDuck() {
    const ducking = musicDuckingSettings();
    if (!ducking.enabled || !synthPlayer) return false;
    synthPlayer.duckMusic(ducking);
    return true;
  }

  function sfxDefinition(id) {
    return typeof SYNTH_AUDIO_DEFINITIONS !== "undefined"
      ? SYNTH_AUDIO_DEFINITIONS.sfx?.[id] ?? null
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

  function playSfx(id, loopChannelOrOptions = null, extraOptions = {}) {
    const options = loopChannelOrOptions && typeof loopChannelOrOptions === "object"
      ? { ...loopChannelOrOptions }
      : { ...extraOptions, loopChannel: loopChannelOrOptions };
    const definition = sfxDefinition(id);
    if (!definition || !unlocked || settings.muted || settings.sfxVolume <= 0 || !synthPlayer) return false;
    activeLoopChannel = options.loopChannel ?? null;
    synthPlayer.setSfxVolume(settings.sfxVolume);
    if (options.duckMusic === true) requestMusicDuck();
    Promise.resolve(synthPlayer.playSfx(definition)).catch(() => {});
    return true;
  }

  function semanticSfxId(role) {
    const field = AUDIO_GLOBAL_SFX_FIELDS[role];
    if (field && typeof GLOBAL_SETTINGS !== "undefined"
      && Object.prototype.hasOwnProperty.call(GLOBAL_SETTINGS.audioDefaults || {}, field)) {
      return GLOBAL_SETTINGS.audioDefaults[field];
    }
    return AUDIO_SEMANTIC_SFX_IDS[role] ?? null;
  }

  function playSemantic(role, options = {}) {
    const duckMusic = options.duckMusic ?? AUDIO_DUCKING_SEMANTIC_ROLES.has(role);
    return playSfx(semanticSfxId(role), { ...options, duckMusic });
  }

  function scheduleLoop(channel) {
    const loop = loopingSfx.get(channel);
    if (!loop) return;
    loop.timerId = null;
    if (!unlocked || settings.muted || settings.sfxVolume <= 0 || !synthPlayer) return;
    const started = playSfx(loop.id, channel);
    if (!started) return;
    const durationMs = Math.max(80, (Number(loop.definition.duration) || 0.25) * 1000);
    loop.timerId = window.setTimeout(() => scheduleLoop(channel), durationMs + 40);
  }

  function startLoopingSfx(id, channel = "default") {
    const definition = sfxDefinition(id);
    const key = String(channel || "default");
    if (!definition) {
      stopLoopingSfx(key);
      return false;
    }
    const existing = loopingSfx.get(key);
    if (existing?.id === id) return true;
    if (existing?.timerId !== null && existing?.timerId !== undefined) window.clearTimeout(existing.timerId);
    loopingSfx.set(key, { id, definition, timerId: null });
    scheduleLoop(key);
    return true;
  }

  function stopLoopingSfx(channel = "default") {
    const key = String(channel || "default");
    const loop = loopingSfx.get(key);
    if (!loop) return false;
    if (loop.timerId !== null) window.clearTimeout(loop.timerId);
    loopingSfx.delete(key);
    if (activeLoopChannel === key) {
      activeLoopChannel = null;
      synthPlayer?.stopSfx();
    }
    return true;
  }

  function pauseLoopTimers() {
    loopingSfx.forEach((loop) => {
      if (loop.timerId !== null) window.clearTimeout(loop.timerId);
      loop.timerId = null;
    });
  }

  function resumeLoopTimers() {
    if (settings.muted || settings.sfxVolume <= 0 || !unlocked) return;
    loopingSfx.forEach((_loop, channel) => {
      if (!loopingSfx.get(channel)?.timerId) scheduleLoop(channel);
    });
  }

  function loopingSfxChannels() {
    return [...loopingSfx.entries()].map(([channel, loop]) => ({ channel, id: loop.id }));
  }

  function playAction(action) {
    const roles = {
      "continue-journey": "confirm",
      "dialogue-choice": "confirm",
      "dialogue-continue": "confirm",
      "preparation-continue": "confirm",
      "preparation-back": "confirm",
      "show-campaign": "confirm",
    };
    return roles[action] ? playSemantic(roles[action]) : false;
  }

  function unlock() {
    if (!initialized) initialize();
    if (unlocked) return true;
    unlocked = true;
    synthPlayer?.ensureContext().catch(() => {});
    if (desiredMusicId) setMusic(desiredMusicId);
    resumeLoopTimers();
    return true;
  }

  function setMuted(muted) {
    settings.muted = Boolean(muted);
    persist();
    updateSettingsUi();
    if (settings.muted) {
      stopCurrentMusic();
      pauseLoopTimers();
      synthPlayer?.stopSfx();
      synthPlayer?.clearMusicDuck();
      activeLoopChannel = null;
    } else {
      if (desiredMusicId) setMusic(desiredMusicId);
      resumeLoopTimers();
    }
  }

  function setSfxVolume(value) {
    settings.sfxVolume = clampAudioSetting(value, AUDIO_SETTINGS_DEFAULTS.sfxVolume);
    synthPlayer?.setSfxVolume(settings.sfxVolume);
    if (settings.sfxVolume <= 0) {
      pauseLoopTimers();
      synthPlayer?.stopSfx();
      activeLoopChannel = null;
    } else {
      resumeLoopTimers();
    }
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
    semanticSfxId,
    playAction,
    startLoopingSfx,
    stopLoopingSfx,
    loopingSfxChannels,
    setMuted,
    setSfxVolume,
    setMusicVolume,
    musicDucking: () => Boolean(synthPlayer?.status().musicDucked),
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
