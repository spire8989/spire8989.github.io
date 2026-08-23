"use strict";

// Character visuals are authored as optional data and rendered through one
// lightweight canvas path. A canvas is used instead of a CSS background so
// multi-row sheets and partial final rows never expose unused cells.
const CHARACTER_VISUAL_SLOTS = Object.freeze(["idle", "walk", "attack"]);
const CHARACTER_VISUAL_DEFAULT_FPS = Object.freeze({ idle: 6, walk: 10, attack: 12 });
const characterSpriteInstances = new Set();
const characterSpriteMetadataCache = new Map();
const characterSpriteMetadataPromises = new Map();
const characterSpriteNormalizationCache = new Map();
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
  const slotScale = Math.min(3, characterVisualNumber(visual.scale, 1, 0.25));
  return { ...resolved, frameCount, columns, rows, fps, loop: options.loop !== false, visualScale, slotScale, finalScale: visualScale * slotScale };
}

function characterVisualContextScale(context, requestedSlot) {
  // Travel and encounter art has more open scenic space than combat. Keep the
  // authored Idle pose in the same apparent family as the traveling Walk pose;
  // combat retains its independent unit sizing.
  if (context === "travel" && requestedSlot === "idle") return 0.82;
  return 1;
}

function characterVisualReferenceSlot(definition) {
  const visuals = characterVisualDefinition(definition);
  const preferred = ["walk", "idle", "attack"];
  return preferred.find((slot) => {
    const visual = visuals?.[slot];
    return visual && typeof visual === "object" && characterVisualAssetIsUsable(visual.assetId);
  }) || CHARACTER_VISUAL_SLOTS.find((slot) => visuals?.[slot]?.assetId && characterVisualAssetIsUsable(visuals[slot].assetId)) || "idle";
}

function characterSpriteMetadataKey(definition, config) {
  return `${definition?.id || "character"}|${config.assetId}|${config.frameCount}|${config.columns}`;
}

function characterSpriteFallback(root, visible = true) {
  root?.querySelector(".character-sprite-fallback")?.classList.toggle("is-visible", visible);
}

function characterSpriteMetadata(image, config, definition) {
  const key = characterSpriteMetadataKey(definition, config);
  const cached = characterSpriteMetadataCache.get(key);
  if (cached && cached.width === image.naturalWidth && cached.height === image.naturalHeight) return cached;
  const scanCanvas = document.createElement("canvas");
  scanCanvas.width = image.naturalWidth;
  scanCanvas.height = image.naturalHeight;
  const scanContext = scanCanvas.getContext("2d", { willReadFrequently: true });
  const frameBounds = [];
  if (scanContext) {
    scanContext.drawImage(image, 0, 0);
    const pixels = scanContext.getImageData(0, 0, image.naturalWidth, image.naturalHeight).data;
    for (let frame = 0; frame < config.frameCount; frame += 1) {
      const column = frame % config.columns;
      const row = Math.floor(frame / config.columns);
      const left = Math.floor(column * image.naturalWidth / config.columns);
      const top = Math.floor(row * image.naturalHeight / config.rows);
      const right = Math.floor((column + 1) * image.naturalWidth / config.columns);
      const bottom = Math.floor((row + 1) * image.naturalHeight / config.rows);
      let minX = right;
      let minY = bottom;
      let maxX = left - 1;
      let maxY = top - 1;
      for (let y = top; y < bottom; y += 1) {
        for (let x = left; x < right; x += 1) {
          if (pixels[(y * image.naturalWidth + x) * 4 + 3] <= 8) continue;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
      frameBounds.push(maxX >= minX
        ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
        : { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) });
    }
  } else {
    for (let frame = 0; frame < config.frameCount; frame += 1) {
      const column = frame % config.columns;
      const row = Math.floor(frame / config.columns);
      const left = Math.floor(column * image.naturalWidth / config.columns);
      const top = Math.floor(row * image.naturalHeight / config.rows);
      const right = Math.floor((column + 1) * image.naturalWidth / config.columns);
      const bottom = Math.floor((row + 1) * image.naturalHeight / config.rows);
      frameBounds.push({ x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) });
    }
  }
  const maximumVisibleHeight = Math.max(...frameBounds.map((bounds) => bounds.height), 1);
  const maximumVisibleWidth = Math.max(...frameBounds.map((bounds) => bounds.width), 1);
  // The maximum opaque bounds define the logical animation box. Keep one
  // natural render scale for every frame; never rescale the current pose.
  const sharedScale = 1;
  const metadata = {
    width: image.naturalWidth,
    height: image.naturalHeight,
    frameBounds,
    sharedScale,
    normalizedWidth: Math.ceil(maximumVisibleWidth * sharedScale),
    normalizedHeight: Math.ceil(maximumVisibleHeight * sharedScale),
  };
  characterSpriteMetadataCache.set(key, metadata);
  return metadata;
}

function loadCharacterSpriteMetadata(definition, config, image = null) {
  const key = characterSpriteMetadataKey(definition, config);
  const cached = characterSpriteMetadataCache.get(key);
  if (cached) return Promise.resolve(cached);
  if (image?.naturalWidth && image?.naturalHeight) {
    return Promise.resolve(characterSpriteMetadata(image, config, definition));
  }
  if (characterSpriteMetadataPromises.has(key)) return characterSpriteMetadataPromises.get(key);
  const promise = new Promise((resolve) => {
    const source = new Image();
    source.onload = () => {
      try {
        resolve(characterSpriteMetadata(source, config, definition));
      } catch (error) {
        resolve(null);
      }
    };
    source.onerror = () => resolve(null);
    source.src = AssetCatalog.imagePath(config.assetId) || "";
  }).finally(() => characterSpriteMetadataPromises.delete(key));
  characterSpriteMetadataPromises.set(key, promise);
  return promise;
}

function characterSpriteNormalization(definition, config, metadata) {
  const referenceSlot = characterVisualReferenceSlot(definition);
  const referenceConfig = characterVisualConfig(definition, referenceSlot);
  const key = `${characterSpriteMetadataKey(definition, config)}|reference:${characterSpriteMetadataKey(definition, referenceConfig)}`;
  if (characterSpriteNormalizationCache.has(key)) return characterSpriteNormalizationCache.get(key);
  const promise = loadCharacterSpriteMetadata(definition, referenceConfig).then((referenceMetadata) => {
    if (!referenceMetadata || !metadata?.normalizedHeight) return 1;
    return Math.max(0.5, Math.min(2, referenceMetadata.normalizedHeight / metadata.normalizedHeight));
  });
  characterSpriteNormalizationCache.set(key, promise);
  return promise;
}

function drawCharacterSprite(instance, frameIndex = instance.frameIndex) {
  const { root, image, canvas, config, metadata } = instance;
  if (!root?.isConnected || !image?.naturalWidth || !image?.naturalHeight || !canvas || !metadata) return;
  const frame = Math.max(0, Math.min(config.frameCount - 1, Math.floor(frameIndex)));
  const bounds = metadata.frameBounds[frame];
  const scale = metadata.sharedScale;
  const width = metadata.normalizedWidth;
  const height = metadata.normalizedHeight;
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, width, height);
  context.imageSmoothingEnabled = true;
  const destinationWidth = bounds.width * scale;
  const destinationHeight = bounds.height * scale;
  context.drawImage(image, bounds.x, bounds.y, bounds.width, bounds.height, (width - destinationWidth) / 2, height - destinationHeight, destinationWidth, destinationHeight);
  root.style.setProperty("--character-frame-aspect", `${width} / ${height}`);
  root.classList.add("is-ready");
  root.classList.remove("asset-load-failed");
  characterSpriteFallback(root, false);
  instance.frameIndex = frame;
}

function stopCharacterSpriteInstance(root) {
  for (const instance of characterSpriteInstances) if (instance.root === root) characterSpriteInstances.delete(instance);
  if (root) root._characterSpriteInstance = null;
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
  const image = root.querySelector(".character-sprite-source");
  const canvas = root.querySelector(".character-sprite-canvas");
  const definition = root._characterDefinition || characterDefinitionForId(root.dataset.characterDefinitionId);
  root._characterDefinition = definition;
  const requestedSlot = root.dataset.characterRequestedSlot || "idle";
  const config = characterVisualConfig(definition, requestedSlot, { loop: root.dataset.characterLoop !== "false" });
  const contextScale = characterVisualContextScale(root.dataset.characterContext, requestedSlot);
  root.classList.toggle("is-mirrored", root.dataset.characterMirror === "true");
  if (!image || !canvas || !config.assetId || !characterVisualAssetIsUsable(config.assetId)) {
    root.classList.remove("is-ready");
    characterSpriteFallback(root, true);
    return;
  }
  if (!image.naturalWidth || !image.naturalHeight) {
    root.classList.remove("is-ready");
    characterSpriteFallback(root, true);
    return;
  }
  const stateKey = `${config.assetId}|${config.frameCount}|${config.columns}|${root.dataset.characterRequestedSlot}|${root.dataset.characterLoop}|${root.dataset.characterMirror}`;
  if (root._characterSpriteInstance?.stateKey === stateKey && root._characterSpriteInstance.image === image) return;
  if (root._characterSpritePendingKey === stateKey) return;
  stopCharacterSpriteInstance(root);
  root._characterSpritePendingKey = stateKey;
  const metadata = characterSpriteMetadata(image, config, definition);
  const instance = { root, image, canvas, config, metadata, automaticSlotNormalization: 1, stateKey, frameIndex: 0, startedAt: performance.now(), paused: window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false };
  root._characterSpritePendingKey = null;
  root.style.setProperty("--character-visual-scale", String(config.visualScale * config.slotScale * contextScale));
  root._characterSpriteInstance = instance;
  characterSpriteInstances.add(instance);
  drawCharacterSprite(instance, 0);
  if (config.frameCount > 1 && config.fps > 0 && !instance.paused) scheduleCharacterSpriteAnimation();
  characterSpriteNormalization(definition, config, metadata).then((automaticSlotNormalization) => {
    if (!root.isConnected || root._characterSpriteInstance !== instance) return;
    instance.automaticSlotNormalization = automaticSlotNormalization;
    root.style.setProperty("--character-visual-scale", String(config.visualScale * automaticSlotNormalization * config.slotScale * contextScale));
  });
}

function initializeCharacterSprites(root = document) {
  const elements = root?.matches?.("[data-character-sprite]")
    ? [root]
    : [...(root?.querySelectorAll?.("[data-character-sprite]") || [])];
  elements.forEach((element) => initializeCharacterSprite(element));
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
      if (config.assetId) {
        return;
      }
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
  const root = `<span class="character-sprite ${className} ${context}${assetPath ? "" : " asset-load-failed"}" data-character-sprite data-character-context="${assetAttribute(context)}" data-character-definition-id="${assetAttribute(definitionId)}" data-character-requested-slot="${assetAttribute(requestedSlot)}" data-character-loop="${options.loop === false ? "false" : "true"}" data-character-mirror="${mirror}" aria-label="${assetAttribute(alt)}">`;
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
