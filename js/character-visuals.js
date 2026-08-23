"use strict";

// Character visuals are authored as optional data and rendered through one
// lightweight canvas path. A canvas is used instead of a CSS background so
// multi-row sheets and partial final rows never expose unused cells.
const CHARACTER_VISUAL_SLOTS = Object.freeze(["idle", "walk", "attack"]);
const CHARACTER_VISUAL_DEFAULT_FPS = Object.freeze({ idle: 6, walk: 10, attack: 12 });
const characterSpriteInstances = new Set();
let characterSpriteAnimationFrame = null;

function characterVisualDefinition(definition) {
  const visuals = definition?.visuals;
  return visuals && typeof visuals === "object" && !Array.isArray(visuals) ? visuals : null;
}

function characterVisualAssetIsUsable(assetId) {
  return typeof AssetCatalog !== "undefined" && Boolean(assetId) && Boolean(AssetCatalog.imagePath(assetId));
}

function characterVisualCandidates(definition, requestedSlot = "idle") {
  const candidates = [];
  const visuals = characterVisualDefinition(definition);
  const addSlot = (slot) => {
    if (!slot || candidates.some((candidate) => candidate.slot === slot)) return;
    const visual = visuals?.[slot];
    if (visual && typeof visual === "object" && typeof visual.assetId === "string" && visual.assetId) candidates.push({ slot, visual });
  };
  addSlot(requestedSlot);
  if (requestedSlot !== "idle") addSlot("idle");
  candidates.push({ slot: null, visual: null, assetId: definition?.combatVisualAssetId });
  candidates.push({ slot: null, visual: null, assetId: definition?.combat?.visualAssetId });
  candidates.push({ slot: null, visual: null, assetId: definition?.visualAssetId });
  return candidates;
}

function resolveCharacterVisual(definition, requestedSlot = "idle") {
  for (const candidate of characterVisualCandidates(definition, requestedSlot)) {
    const assetId = candidate.assetId ?? candidate.visual?.assetId;
    if (characterVisualAssetIsUsable(assetId)) return { assetId, slot: candidate.slot, visual: candidate.visual };
  }
  return { assetId: null, slot: null, visual: null };
}

function resolveCharacterVisualAssetId(definition, requestedSlot = null) {
  return resolveCharacterVisual(definition, requestedSlot || "idle").assetId;
}

function characterVisualNumber(value, fallback, minimum = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= minimum ? number : fallback;
}

function characterVisualConfig(definition, requestedSlot, options = {}) {
  const resolved = resolveCharacterVisual(definition, requestedSlot);
  const visual = resolved.visual || {};
  const frameCountValue = Number(visual.frameCount);
  const frameCount = Number.isInteger(frameCountValue) && frameCountValue > 0 ? frameCountValue : 1;
  const columnsValue = Number(visual.columns);
  const columns = Number.isInteger(columnsValue) && columnsValue > 0 ? Math.min(columnsValue, frameCount) : frameCount;
  const fpsValue = Number(visual.fps);
  const fps = frameCount > 1 ? (Number.isFinite(fpsValue) && fpsValue > 0 ? fpsValue : CHARACTER_VISUAL_DEFAULT_FPS[requestedSlot] ?? 8) : 0;
  const rows = Math.max(1, Math.ceil(frameCount / columns));
  const visualScale = Math.min(3, characterVisualNumber(definition?.visualScale, 1, 0.25));
  return { ...resolved, frameCount, columns, rows, fps, loop: options.loop !== false, visualScale };
}

function characterSpriteFallback(root, visible = true) {
  root?.querySelector(".character-sprite-fallback")?.classList.toggle("is-visible", visible);
}

function drawCharacterSprite(instance, frameIndex = instance.frameIndex) {
  const { root, image, canvas, config } = instance;
  if (!root?.isConnected || !image?.naturalWidth || !image?.naturalHeight || !canvas) return;
  const frameWidth = image.naturalWidth / config.columns;
  const frameHeight = image.naturalHeight / config.rows;
  if (!(frameWidth > 0) || !(frameHeight > 0)) return;
  const frame = Math.max(0, Math.min(config.frameCount - 1, Math.floor(frameIndex)));
  const column = frame % config.columns;
  const row = Math.floor(frame / config.columns);
  const width = Math.max(1, Math.round(frameWidth));
  const height = Math.max(1, Math.round(frameHeight));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, width, height);
  context.imageSmoothingEnabled = true;
  context.drawImage(image, column * frameWidth, row * frameHeight, frameWidth, frameHeight, 0, 0, width, height);
  root.style.setProperty("--character-frame-aspect", `${frameWidth} / ${frameHeight}`);
  root.classList.add("is-ready");
  root.classList.remove("asset-load-failed");
  characterSpriteFallback(root, false);
  instance.frameIndex = frame;
}

function stopCharacterSpriteInstance(root) {
  for (const instance of characterSpriteInstances) if (instance.root === root) characterSpriteInstances.delete(instance);
}

function scheduleCharacterSpriteAnimation() {
  if (characterSpriteAnimationFrame === null) characterSpriteAnimationFrame = window.requestAnimationFrame(tickCharacterSprites);
}

function tickCharacterSprites(timestamp) {
  characterSpriteAnimationFrame = null;
  let hasAnimation = false;
  for (const instance of [...characterSpriteInstances]) {
    if (!instance.root?.isConnected) {
      characterSpriteInstances.delete(instance);
      continue;
    }
    if (instance.config.frameCount <= 1 || instance.paused || instance.config.fps <= 0 || !instance.image?.naturalWidth) continue;
    hasAnimation = true;
    const frame = Math.floor((Math.max(0, timestamp - instance.startedAt) / 1000) * instance.config.fps);
    const nextFrame = instance.config.loop ? frame % instance.config.frameCount : Math.min(frame, instance.config.frameCount - 1);
    if (nextFrame !== instance.frameIndex) drawCharacterSprite(instance, nextFrame);
    if (!instance.config.loop && nextFrame >= instance.config.frameCount - 1) instance.paused = true;
  }
  if (hasAnimation) scheduleCharacterSpriteAnimation();
}

function initializeCharacterSprite(root) {
  if (!root) return;
  stopCharacterSpriteInstance(root);
  const image = root.querySelector(".character-sprite-source");
  const canvas = root.querySelector(".character-sprite-canvas");
  const definition = root._characterDefinition || characterDefinitionForId(root.dataset.characterDefinitionId);
  root._characterDefinition = definition;
  const config = characterVisualConfig(definition, root.dataset.characterRequestedSlot || "idle", { loop: root.dataset.characterLoop !== "false" });
  root.style.setProperty("--character-visual-scale", String(config.visualScale));
  root.classList.toggle("is-mirrored", root.dataset.characterMirror === "true");
  if (!image || !canvas || !config.assetId || !characterVisualAssetIsUsable(config.assetId)) {
    root.classList.remove("is-ready");
    characterSpriteFallback(root, true);
    return;
  }
  const instance = { root, image, canvas, config, frameIndex: 0, startedAt: performance.now(), paused: window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false };
  root._characterSpriteInstance = instance;
  characterSpriteInstances.add(instance);
  if (image.complete && image.naturalWidth) drawCharacterSprite(instance, 0);
  if (config.frameCount > 1 && config.fps > 0 && !instance.paused) scheduleCharacterSpriteAnimation();
}

function handleCharacterSpriteImageError(image) {
  const root = image?.closest("[data-character-sprite]");
  if (!root) return;
  stopCharacterSpriteInstance(root);
  root.classList.remove("is-ready");
  root.classList.add("asset-load-failed");
  characterSpriteFallback(root, true);
}

function setCharacterVisualState(element, requestedSlot = "idle", options = {}) {
  const root = element?.matches?.("[data-character-sprite]") ? element : element?.querySelector?.("[data-character-sprite]");
  if (!root) return;
  const previousStateKey = root.dataset.characterVisualStateKey;
  const previousSlot = root.dataset.characterRequestedSlot || "idle";
  const previousLoop = root.dataset.characterLoop !== "false";
  const previousMirror = root.dataset.characterMirror === "true";
  root.dataset.characterRequestedSlot = requestedSlot;
  root.dataset.characterLoop = options.loop === false ? "false" : "true";
  if (options.mirror !== undefined) root.dataset.characterMirror = options.mirror ? "true" : "false";
  const stateKey = `${requestedSlot}|${root.dataset.characterLoop}|${root.dataset.characterMirror === "true"}`;
  const stateChanged = previousStateKey !== stateKey
    || previousSlot !== requestedSlot
    || previousLoop !== (options.loop !== false)
    || previousMirror !== (options.mirror ?? previousMirror);
  root.dataset.characterVisualStateKey = stateKey;
  const definition = root._characterDefinition || characterDefinitionForId(root.dataset.characterDefinitionId);
  root._characterDefinition = definition;
  const config = characterVisualConfig(definition, requestedSlot, options);
  const image = root.querySelector(".character-sprite-source");
  const assetChanged = !image || image.dataset.assetId !== (config.assetId || "");
  if (assetChanged) {
    stopCharacterSpriteInstance(root);
    root.classList.remove("is-ready", "asset-load-failed");
    characterSpriteFallback(root, true);
    if (image) {
      image.dataset.assetId = config.assetId || "";
      image.src = config.assetId ? AssetCatalog.imagePath(config.assetId) : "";
      if (config.assetId) return;
    }
  }
  if (assetChanged || stateChanged || !root._characterSpriteInstance) initializeCharacterSprite(root);
}

function renderCharacterSprite(definition, requestedSlot = "idle", context = "combat", fallback = "", alt = "", options = {}) {
  const config = characterVisualConfig(definition, requestedSlot, options);
  const assetPath = config.assetId ? AssetCatalog.imagePath(config.assetId) : null;
  const definitionId = definition?.id || "character";
  const className = options.className || "";
  const mirror = options.mirror ? "true" : "false";
  const fallbackMarkup = `<span class="character-sprite-fallback ${context === "combat" ? "combat-visual-fallback" : ""}">${fallback}</span>`;
  const root = `<span class="character-sprite ${className} ${context}${assetPath ? "" : " asset-load-failed"}" data-character-sprite data-character-definition-id="${assetAttribute(definitionId)}" data-character-requested-slot="${assetAttribute(requestedSlot)}" data-character-loop="${options.loop === false ? "false" : "true"}" data-character-mirror="${mirror}" aria-label="${assetAttribute(alt)}">`;
  if (!assetPath) return `${root}${fallbackMarkup}</span>`;
  const image = `<img class="character-sprite-source" data-asset-id="${assetAttribute(config.assetId)}" src="${assetAttribute(assetPath)}" alt="" aria-hidden="true" onload="initializeCharacterSprite(this.closest('[data-character-sprite]'))" onerror="handleCharacterSpriteImageError(this)">`;
  return `${root}<canvas class="character-sprite-canvas" aria-hidden="true"></canvas>${image}${fallbackMarkup}</span>`;
}

function characterDefinitionForId(id) {
  if (id === "arthur") return typeof PLAYER_CHARACTER_DEFINITION !== "undefined" ? PLAYER_CHARACTER_DEFINITION : null;
  return typeof COMPANION_DEFINITIONS !== "undefined" && COMPANION_DEFINITIONS[id]
    ? COMPANION_DEFINITIONS[id]
    : typeof COMBAT_ENEMY_DEFINITIONS !== "undefined" && COMBAT_ENEMY_DEFINITIONS[id]
      ? COMBAT_ENEMY_DEFINITIONS[id]
      : null;
}

function characterDefinitionForCombatant(combatant) {
  const definitionId = combatant?.definitionId || combatant?.id?.replace(/_\d+$/, "");
  return characterDefinitionForId(definitionId)
    || { id: definitionId || combatant?.id || "character", combatVisualAssetId: combatant?.visualAssetId || null };
}
