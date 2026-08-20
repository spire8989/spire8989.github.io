"use strict";

// Runtime artwork and sound metadata lives here. Definitions intentionally
// start empty: the Content Editor can add real files without requiring the
// shipped prototype to include final art or audio.
const IMAGE_ASSET_DEFINITIONS = Object.freeze({
  portrait_reeve: {
    id: "portrait_reeve",
    path: "assets/images/portrait/reeveportrait.webp",
    category: "portrait"
  },
  location_blacksmith_bg: {
    id: "location_blacksmith_bg",
    path: "assets/images/location/blacksmith-bg.webp",
    category: "location"
  },
  expedition_old_forest_road_camp_bg: {
    id: "expedition_old_forest_road_camp_bg",
    path: "assets/images/expedition/old-forest-road-camp-bg.webp",
    category: "expedition"
  },
  expedition_old_forest_road_bg: {
    id: "expedition_old_forest_road_bg",
    path: "assets/images/expedition/old-forest-road-bg.webp",
    category: "expedition"
  },
  expedition_old_forest_road_1_bg: {
    id: "expedition_old_forest_road_1_bg",
    path: "assets/images/expedition/old-forest-road-1-bg.webp",
    category: "expedition"
  },
  expedition_old_forest_road_wide_bg: {
    id: "expedition_old_forest_road_wide_bg",
    path: "assets/images/expedition/old-forest-road-wide-bg.webp",
    category: "expedition"
  },
  expedition_old_forest_road_wide_bg_loop: {
    id: "expedition_old_forest_road_wide_bg_loop",
    path: "assets/images/expedition/old-forest-road-wide-bg-loop.webp",
    category: "expedition"
  },
  expedition_old_forest_road_50_bg: {
    id: "expedition_old_forest_road_50_bg",
    path: "assets/images/expedition/forest-road-50-bg.webp",
    category: "expedition"
  },
  location_apothecary_woodcut: {
    id: "location_apothecary_woodcut",
    path: "assets/images/location/woodcut-apothecary.webp",
    category: "location"
  },
  location_merchant_woodcut: {
    id: "location_merchant_woodcut",
    path: "assets/images/location/woodcut-merchant.webp",
    category: "location"
  },
  location_the_inn_woodcut_2: {
    id: "location_the_inn_woodcut_2",
    path: "assets/images/location/woodcut-inn-2.webp",
    category: "location"
  },
  location_the_hall_woodcut_3: {
    id: "location_the_hall_woodcut_3",
    path: "assets/images/location/woodcut-hall-3.webp",
    category: "location"
  },
  location_merchant_woodcut_2: {
    id: "location_merchant_woodcut_2",
    path: "assets/images/location/woodcut-merchant-2.webp",
    category: "location"
  },
  location_village_at_the_edge_of_broc_liande_woodcut_1: {
    id: "location_village_at_the_edge_of_broc_liande_woodcut_1",
    path: "assets/images/location/town_woodcut_1.webp",
    category: "location"
  }
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
