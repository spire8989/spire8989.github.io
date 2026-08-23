"use strict";

// Character visuals are authored as optional data and rendered through one
// lightweight canvas path. A canvas is used instead of a CSS background so
// multi-row sheets and partial final rows never expose unused cells.
const CHARACTER_VISUAL_SLOTS = Object.freeze(["idle", "walk", "attack"]);
const CHARACTER_VISUAL_DEFAULT_FPS = Object.freeze({ idle: 6, walk: 10, attack: 12 });
const characterSpriteInstances = new Set();
const characterVisualImageCache = new Map();
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

function characterVisualSlotIsUsable(definition, slot) {
  const visual = characterVisualDefinition(definition)?.[slot];
  return Boolean(visual && typeof visual === "object" && characterVisualAssetIsUsable(visual.assetId));
}

function loadCharacterVisualImage(assetId) {
  const assetPath = characterVisualAssetIsUsable(assetId) ? AssetCatalog.imagePath(assetId) : null;
  if (!assetPath) return Promise.resolve(null);
  const cached = characterVisualImageCache.get(assetId);
  if (cached) return cached.promise;

  const image = new Image();
  const record = { image, loaded: false, failed: false, promise: null };
  record.promise = new Promise((resolve) => {
    image.onload = async () => {
      if (typeof image.decode === "function") {
        try {
          await image.decode();
        } catch (error) {
          // The loaded image is still drawable when decode is unavailable or
          // rejects after the browser has completed the resource load.
        }
      }
      record.loaded = Boolean(image.naturalWidth && image.naturalHeight);
      record.failed = !record.loaded;
      resolve(record.loaded ? image : null);
    };
    image.onerror = () => {
      record.failed = true;
      resolve(null);
    };
    image.src = assetPath;
  });
  characterVisualImageCache.set(assetId, record);
  return record.promise;
}

function preloadCharacterVisualSlot(definition, slot) {
  const visual = characterVisualDefinition(definition)?.[slot];
  if (!visual || typeof visual !== "object" || !characterVisualAssetIsUsable(visual.assetId)) {
    return Promise.resolve(null);
  }
  const config = characterVisualConfig(definition, slot);
  return loadCharacterVisualImage(config.assetId).then((image) => {
    if (!image) return null;
    let metadata;
    try {
      metadata = characterSpriteMetadata(image, config, definition);
    } catch (error) {
      return null;
    }
    return characterSpriteNormalization(definition, config, metadata)
      .then((automaticSlotNormalization) => ({ image, metadata, automaticSlotNormalization }));
  });
}

function preloadCharacterVisuals(definition, slots = CHARACTER_VISUAL_SLOTS) {
  if (!definition) return Promise.resolve([]);
  return Promise.all([...new Set(slots)].map((slot) => preloadCharacterVisualSlot(definition, slot)))
    .catch(() => []);
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

function characterVisualOffset(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
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
  const combatVisualScale = Math.min(3, characterVisualNumber(definition?.combatVisualScale, visualScale, 0.25));
  const slotScale = Math.min(3, characterVisualNumber(visual.scale, 1, 0.25));
  const travelOffsetY = characterVisualOffset(definition?.travelOffsetY);
  const offsetX = characterVisualOffset(visual.offsetX);
  const offsetY = characterVisualOffset(visual.offsetY);
  const authoredImpactFrame = options.impactFrame ?? visual.impactFrame;
  const defaultImpactFrame = Math.max(0, Math.min(frameCount - 1, Math.floor(frameCount * 0.6)));
  const impactFrame = Number.isInteger(Number(authoredImpactFrame))
    && Number(authoredImpactFrame) >= 0
    && Number(authoredImpactFrame) < frameCount
    ? Number(authoredImpactFrame)
    : defaultImpactFrame;
  return {
    ...resolved,
    frameCount,
    columns,
    rows,
    fps,
    loop: options.loop !== false,
    visualScale,
    combatVisualScale,
    travelOffsetY,
    slotScale,
    offsetX,
    offsetY,
    impactFrame,
    finalScale: visualScale * slotScale,
  };
}

function characterVisualContextScale(context, requestedSlot, explicitScale = null) {
  const contextScale = Number(explicitScale);
  if (Number.isFinite(contextScale) && contextScale > 0) return Math.min(3, contextScale);
  return 1;
}

function syncCombatVisualLayout(root, automaticSlotNormalization = 1, options = {}) {
  if (root?.dataset.characterContext !== "combat") return;
  const visual = root.closest(".combat-unit-visual");
  if (visual?.dataset.combatLayoutScaleLocked === "true" && options.lock !== true) return;
  const baseScale = Number(visual?.dataset.combatBaseScale);
  const normalization = Number(automaticSlotNormalization);
  if (!visual || !Number.isFinite(baseScale) || baseScale <= 0) return;
  visual.style.setProperty(
    "--combat-character-layout-scale",
    String(baseScale * (Number.isFinite(normalization) && normalization > 0 ? normalization : 1)),
  );
  if (options.lock === true) visual.dataset.combatLayoutScaleLocked = "true";
}

function characterVisualCombatScale(definition, requestedSlot, config) {
  if (!config || requestedSlot === "idle") return 1;
  const idleConfig = characterVisualConfig(definition, "idle");
  if (!idleConfig?.assetId || !config?.assetId) return 1;
  const idleScale = Number(idleConfig.finalScale);
  const slotScale = Number(config.finalScale);
  return Number.isFinite(idleScale) && idleScale > 0 && Number.isFinite(slotScale) && slotScale > 0
    ? slotScale / idleScale
    : 1;
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
  return `${definition?.id || "character"}|${config.assetId}|${config.frameCount}|${config.columns}|offset:${config.offsetX},${config.offsetY}`;
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
  const frameCells = [];
  const opaqueOffsets = [];
  const addFrame = (cell, bounds) => {
    frameCells.push(cell);
    frameBounds.push(bounds);
    const cellCenterX = (cell.left + cell.right) / 2;
    const cellCenterY = (cell.top + cell.bottom) / 2;
    opaqueOffsets.push({
      x: bounds.x - cell.left,
      y: bounds.y - cell.top,
      centerX: bounds.x + bounds.width / 2 - cellCenterX,
      centerY: bounds.y + bounds.height / 2 - cellCenterY,
      bottom: cell.bottom - (bounds.y + bounds.height),
    });
  };
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
      addFrame({ left, top, right, bottom }, maxX >= minX
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
      addFrame({ left, top, right, bottom }, { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) });
    }
  }
  const commonBottomGap = opaqueOffsets.length ? Math.min(...opaqueOffsets.map((offset) => offset.bottom)) : 0;
  // Keep one natural render scale for every frame; never rescale the current
  // pose. The canvas itself is the union of all anchored frame extents.
  const sharedScale = 1;
  const anchoredFrameExtents = frameBounds.map((bounds, frame) => {
    const opaqueOffset = opaqueOffsets[frame];
    const destinationWidth = bounds.width * sharedScale;
    const destinationHeight = bounds.height * sharedScale;
    const left = opaqueOffset.centerX * sharedScale - destinationWidth / 2 + config.offsetX;
    const bottom = -(opaqueOffset.bottom - commonBottomGap) * sharedScale + config.offsetY;
    return {
      left,
      top: bottom - destinationHeight,
      right: left + destinationWidth,
      bottom,
    };
  });
  const unionMinX = Math.min(...anchoredFrameExtents.map((extent) => extent.left));
  const unionMinY = Math.min(...anchoredFrameExtents.map((extent) => extent.top));
  const unionMaxX = Math.max(...anchoredFrameExtents.map((extent) => extent.right));
  const unionMaxY = Math.max(...anchoredFrameExtents.map((extent) => extent.bottom));
  const metadata = {
    width: image.naturalWidth,
    height: image.naturalHeight,
    frameBounds,
    frameCells,
    opaqueOffsets,
    commonFrameCellAnchor: frameCells[0]
      ? { x: (frameCells[0].left + frameCells[0].right) / 2, y: frameCells[0].bottom }
      : { x: 0, y: 0 },
    commonBottomGap,
    sharedScale,
    anchoredFrameExtents,
    unionMinX,
    unionMinY,
    unionMaxX,
    unionMaxY,
    canvasAnchorX: -unionMinX,
    canvasAnchorY: -unionMinY,
    normalizedWidth: Math.max(1, Math.ceil(unionMaxX - unionMinX)),
    normalizedHeight: Math.max(1, Math.ceil(unionMaxY - unionMinY)),
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
  const promise = loadCharacterVisualImage(config.assetId).then((cachedImage) => {
    if (!cachedImage) return null;
    try {
      return characterSpriteMetadata(cachedImage, config, definition);
    } catch (error) {
      return null;
    }
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
  const opaqueOffset = metadata.opaqueOffsets[frame];
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
  // Crop transparent pixels for efficiency, but place the opaque rectangle at
  // its original frame-cell anchor instead of recentering each silhouette.
  const anchoredLeft = opaqueOffset.centerX * scale - destinationWidth / 2 + config.offsetX;
  const anchoredBottom = -(opaqueOffset.bottom - metadata.commonBottomGap) * scale + config.offsetY;
  const destinationX = anchoredLeft - metadata.unionMinX;
  const destinationY = anchoredBottom - destinationHeight - metadata.unionMinY;
  context.drawImage(image, bounds.x, bounds.y, bounds.width, bounds.height, destinationX, destinationY, destinationWidth, destinationHeight);
  root.style.setProperty("--character-frame-aspect", `${width} / ${height}`);
  root.style.setProperty("--character-canvas-anchor-x", `${(metadata.canvasAnchorX / width) * 100}%`);
  root.style.setProperty("--character-canvas-anchor-y", `${(metadata.canvasAnchorY / height) * 100}%`);
  root.classList.add("is-ready");
  root.classList.remove("asset-load-failed");
  characterSpriteFallback(root, false);
  root._characterSpriteHasRendered = true;
  instance.frameIndex = frame;
}

function stopCharacterSpriteInstance(root) {
  for (const instance of characterSpriteInstances) if (instance.root === root) characterSpriteInstances.delete(instance);
  if (root) root._characterSpriteInstance = null;
}

function completeCharacterSpriteInstance(instance) {
  if (!instance || instance.completed) return;
  instance.completed = true;
  const onComplete = instance.onComplete;
  instance.onComplete = null;
  if (typeof onComplete === "function") onComplete({ version: instance.animationVersion });
}

function dispatchCharacterSpriteImpact(instance) {
  if (!instance || instance.impactFired) return;
  instance.impactFired = true;
  const onImpact = instance.onImpact;
  instance.onImpact = null;
  if (typeof onImpact === "function") {
    onImpact({ version: instance.animationVersion, frame: instance.frameIndex, impactFrame: instance.config.impactFrame });
  }
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
    if (!instance.config.loop && nextFrame >= instance.config.impactFrame) dispatchCharacterSpriteImpact(instance);
    if (!instance.config.loop && nextFrame >= instance.config.frameCount - 1) {
      instance.paused = true;
      completeCharacterSpriteInstance(instance);
    }
  }
  if (hasAnimation) scheduleCharacterSpriteAnimation();
}

function characterSpriteStateKey(root, config) {
  return `${config.assetId}|${config.frameCount}|${config.columns}|${root.dataset.characterRequestedSlot}|${root.dataset.characterLoop}|${root.dataset.characterMirror}`;
}

function finishCharacterSpriteTransitionFailure(root, stateKey) {
  if (!root?.isConnected || root._characterSpritePendingKey !== stateKey) return;
  root._characterSpritePendingKey = null;
  root._characterSpriteRestartRequested = false;
  const completion = root._characterSpriteCompletion;
  root._characterSpriteCompletion = null;
  if (!root._characterSpriteInstance && !root._characterSpriteHasRendered) {
    root.classList.remove("is-ready");
    root.classList.add("asset-load-failed");
    characterSpriteFallback(root, true);
  }
  if (typeof completion?.onComplete === "function") completion.onComplete({ version: completion.version });
}

function activateCharacterSprite(root, image, definition, requestedSlot, config, stateKey) {
  if (!root?.isConnected || root._characterSpritePendingKey !== stateKey) return;
  const canvas = root.querySelector(".character-sprite-canvas");
  if (!canvas || !image?.naturalWidth || !image?.naturalHeight) {
    finishCharacterSpriteTransitionFailure(root, stateKey);
    return;
  }
  const isCombat = root.dataset.characterContext === "combat";
  const contextScale = isCombat ? 1 : characterVisualContextScale(root.dataset.characterContext, requestedSlot, root.dataset.characterContextScale);
  let metadata;
  try {
    metadata = characterSpriteMetadata(image, config, definition);
  } catch (error) {
    finishCharacterSpriteTransitionFailure(root, stateKey);
    return;
  }
  const completion = root._characterSpriteCompletion;
  stopCharacterSpriteInstance(root);
  const instance = {
    root, image, canvas, config, metadata, automaticSlotNormalization: 1, stateKey, frameIndex: 0,
    startedAt: performance.now(), paused: window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false,
    onImpact: completion?.onImpact ?? null, onComplete: completion?.onComplete ?? null,
    animationVersion: completion?.version ?? null, impactFired: false, completed: false,
  };
  root._characterSpriteCompletion = null;
  root._characterSpritePendingKey = null;
  root._characterSpriteRestartRequested = false;
  root.classList.toggle("is-mirrored", root.dataset.characterMirror === "true");
  const combatScale = characterVisualCombatScale(definition, requestedSlot, config);
  root.style.setProperty("--character-visual-scale", String(isCombat ? combatScale : config.visualScale * config.slotScale * contextScale));
  if (!isCombat) root.style.setProperty("--character-travel-offset-y", `${config.travelOffsetY}%`);
  syncCombatVisualLayout(root);
  root._characterSpriteInstance = instance;
  characterSpriteInstances.add(instance);
  drawCharacterSprite(instance, 0);
  if (!config.loop && (config.impactFrame === 0 || config.frameCount <= 1 || instance.paused)) {
    dispatchCharacterSpriteImpact(instance);
    if (config.frameCount <= 1 || instance.paused) completeCharacterSpriteInstance(instance);
  }
  if (config.frameCount > 1 && config.fps > 0 && !instance.paused) scheduleCharacterSpriteAnimation();
  characterSpriteNormalization(definition, config, metadata).then((automaticSlotNormalization) => {
    if (!root.isConnected || root._characterSpriteInstance !== instance) return;
    instance.automaticSlotNormalization = automaticSlotNormalization;
    if (isCombat) {
      syncCombatVisualLayout(root, automaticSlotNormalization, { lock: requestedSlot === "idle" });
    } else {
      root.style.setProperty("--character-visual-scale", String(config.visualScale * automaticSlotNormalization * config.slotScale * contextScale));
      root.style.setProperty("--character-travel-offset-y", `${config.travelOffsetY}%`);
    }
  });
}

function initializeCharacterSprite(root) {
  if (!root) return;
  const canvas = root.querySelector(".character-sprite-canvas");
  const definition = root._characterDefinition || characterDefinitionForId(root.dataset.characterDefinitionId);
  root._characterDefinition = definition;
  const requestedSlot = root.dataset.characterRequestedSlot || "idle";
  const config = characterVisualConfig(definition, requestedSlot, { loop: root.dataset.characterLoop !== "false" });
  if (!canvas || !config.assetId || !characterVisualAssetIsUsable(config.assetId)) {
    if (!root._characterSpriteInstance && !root._characterSpriteHasRendered) {
      root.classList.remove("is-ready");
      characterSpriteFallback(root, true);
    }
    return;
  }
  const stateKey = characterSpriteStateKey(root, config);
  const cached = characterVisualImageCache.get(config.assetId);
  if (!root._characterSpriteRestartRequested
    && root._characterSpriteInstance?.stateKey === stateKey
    && cached?.loaded
    && root._characterSpriteInstance.image === cached.image) return;
  if (root._characterSpritePendingKey === stateKey) {
    // A completed cached image must never remain blocked behind a stale
    // preload marker when no live animation instance was created.
    if (root._characterSpriteInstance || !cached?.loaded) return;
    root._characterSpritePendingKey = null;
  }
  root._characterSpritePendingKey = stateKey;
  preloadCharacterVisuals(definition);
  loadCharacterVisualImage(config.assetId).then((image) => {
    if (!root.isConnected || root._characterSpritePendingKey !== stateKey) return;
    if (!image) {
      finishCharacterSpriteTransitionFailure(root, stateKey);
      return;
    }
    activateCharacterSprite(root, image, definition, requestedSlot, config, stateKey);
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
  if (root._characterSpriteInstance || root._characterSpriteHasRendered) return;
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
    || previousMirror !== (options.mirror ?? previousMirror)
    || options.restart === true;
  root.dataset.characterVisualStateKey = stateKey;
  root._characterSpriteCompletion = options.loop === false && (typeof options.onImpact === "function" || typeof options.onComplete === "function")
    ? { version: options.animationVersion ?? null, impactFrame: options.impactFrame, onImpact: options.onImpact, onComplete: options.onComplete }
    : null;
  root._characterSpriteRestartRequested = options.restart === true;
  const definition = root._characterDefinition || characterDefinitionForId(root.dataset.characterDefinitionId);
  root._characterDefinition = definition;
  if (stateChanged || !root._characterSpriteInstance) initializeCharacterSprite(root);
  else if (root._characterSpriteCompletion) {
    root._characterSpriteInstance.onImpact = root._characterSpriteCompletion.onImpact ?? null;
    root._characterSpriteInstance.impactFired = false;
    root._characterSpriteInstance.onComplete = root._characterSpriteCompletion.onComplete ?? null;
    root._characterSpriteInstance.animationVersion = root._characterSpriteCompletion.version;
    if (root._characterSpriteCompletion.impactFrame !== undefined) {
      root._characterSpriteInstance.config.impactFrame = characterVisualConfig(definition, requestedSlot, root._characterSpriteCompletion).impactFrame;
    }
    root._characterSpriteInstance.completed = false;
    root._characterSpriteCompletion = null;
  }
}

function playCharacterVisualAction(element, requestedSlot = "attack", options = {}) {
  const root = element?.matches?.("[data-character-sprite]") ? element : element?.querySelector?.("[data-character-sprite]");
  if (!root) return false;
  const definition = root._characterDefinition || characterDefinitionForId(root.dataset.characterDefinitionId);
  root._characterDefinition = definition;
  const version = (Number(root._characterVisualActionVersion) || 0) + 1;
  root._characterVisualActionVersion = version;
  if (!characterVisualSlotIsUsable(definition, requestedSlot)) {
    setCharacterVisualState(root, "idle", { loop: true, mirror: options.mirror });
    return false;
  }
  setCharacterVisualState(root, requestedSlot, {
    loop: false,
    mirror: options.mirror,
    restart: true,
    animationVersion: version,
    impactFrame: options.impactFrame,
    onImpact: (detail) => {
      if (!root.isConnected || Number(root._characterVisualActionVersion) !== version) return;
      if (typeof options.onImpact === "function") options.onImpact({ ...detail, version });
    },
    onComplete: () => {
      if (!root.isConnected || Number(root._characterVisualActionVersion) !== version) return;
      setCharacterVisualState(root, "idle", { loop: true, mirror: options.mirror });
      if (typeof options.onComplete === "function") options.onComplete({ version });
    },
  });
  return true;
}

function renderCharacterSprite(definition, requestedSlot = "idle", context = "combat", fallback = "", alt = "", options = {}) {
  const config = characterVisualConfig(definition, requestedSlot, options);
  preloadCharacterVisuals(definition);
  const assetPath = config.assetId ? AssetCatalog.imagePath(config.assetId) : null;
  const definitionId = definition?.id || "character";
  const className = options.className || "";
  const mirror = options.mirror ? "true" : "false";
  const contextScale = Number(options.contextScale);
  const contextScaleAttribute = Number.isFinite(contextScale) && contextScale > 0
    ? ` data-character-context-scale="${Math.min(3, contextScale)}"`
    : "";
  const fallbackMarkup = `<span class="character-sprite-fallback ${context === "combat" ? "combat-visual-fallback" : ""}">${fallback}</span>`;
  const root = `<span class="character-sprite ${className} ${context}${assetPath ? "" : " asset-load-failed"}" data-character-sprite data-character-context="${assetAttribute(context)}"${contextScaleAttribute} data-character-definition-id="${assetAttribute(definitionId)}" data-character-requested-slot="${assetAttribute(requestedSlot)}" data-character-loop="${options.loop === false ? "false" : "true"}" data-character-mirror="${mirror}" aria-label="${assetAttribute(alt)}">`;
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
