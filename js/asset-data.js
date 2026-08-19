"use strict";

// Runtime artwork and sound metadata lives here. Definitions intentionally
// start empty: the Content Editor can add real files without requiring the
// shipped prototype to include final art or audio.
const IMAGE_ASSET_DEFINITIONS = Object.freeze({
});

const AUDIO_ASSET_DEFINITIONS = Object.freeze({
});

const ASSET_IMAGE_CATEGORIES = Object.freeze(["location", "expedition", "encounter", "combat", "portrait", "ui"]);
const ASSET_AUDIO_CATEGORIES = Object.freeze(["ambience", "sfx", "music"]);

function validAssetPath(path, root) {
  return typeof path === "string"
    && path.startsWith(`${root}/`)
    && !path.includes("\\")
    && !path.split("/").some((part) => part === ".." || part === "." || part === "");
}

function normalizeAssetDefinition(definition, type) {
  if (!definition || typeof definition !== "object") return null;
  const root = type === "image" ? "assets/images" : "assets/audio";
  const categories = type === "image" ? ASSET_IMAGE_CATEGORIES : ASSET_AUDIO_CATEGORIES;
  if (typeof definition.id !== "string"
    || !validAssetPath(definition.path, root)
    || !categories.includes(definition.category)) {
    return null;
  }
  return definition;
}

const AssetCatalog = Object.freeze({
  image(id) {
    return normalizeAssetDefinition(IMAGE_ASSET_DEFINITIONS[id], "image");
  },

  audio(id) {
    return normalizeAssetDefinition(AUDIO_ASSET_DEFINITIONS[id], "audio");
  },

  imagePath(id) {
    return this.image(id)?.path ?? null;
  },

  audioPath(id) {
    return this.audio(id)?.path ?? null;
  },

  hasImage(id) {
    return Boolean(this.image(id));
  },

  hasAudio(id) {
    return Boolean(this.audio(id));
  },
});
