"use strict";

// Shared authored shape for the next character presentation pass. These slots
// are intentionally data-only in Character Pass 1; combat and travel continue
// to render their existing static visual or placeholder.
const CHARACTER_VISUAL_SLOTS = Object.freeze(["idle", "walk", "attack"]);

function characterVisualDefinition(definition) {
  const visuals = definition?.visuals;
  return visuals && typeof visuals === "object" && !Array.isArray(visuals)
    ? visuals
    : null;
}

function resolveCharacterVisualAssetId(definition, requestedSlot = null) {
  const slot = requestedSlot && characterVisualDefinition(definition)?.[requestedSlot];
  const animatedAssetId = typeof slot?.assetId === "string" && slot.assetId
    ? slot.assetId
    : null;
  return animatedAssetId
    ?? definition?.combatVisualAssetId
    ?? definition?.visualAssetId
    ?? null;
}
