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
    path: "assets/images/town/town_woodcut_1.webp",
    category: "town"
  },
  encounter_abandoned_camp: {
    id: "encounter_abandoned_camp",
    path: "assets/images/encounter/abandoned_camp.webp",
    category: "encounter"
  },
  encounter_abandoned_cart: {
    id: "encounter_abandoned_cart",
    path: "assets/images/encounter/abandoned_cart.webp",
    category: "encounter"
  },
  expedition_old_forest_road_woodcut: {
    id: "expedition_old_forest_road_woodcut",
    path: "assets/images/expedition/woodcut_old_forest_path.webp",
    category: "expedition"
  },
  expedition_old_forest_road_woodcut_3: {
    id: "expedition_old_forest_road_woodcut_3",
    path: "assets/images/expedition/woodcut_old_forest_path_3.webp",
    category: "expedition"
  },
  expedition_old_forest_road_woodcut_2: {
    id: "expedition_old_forest_road_woodcut_2",
    path: "assets/images/expedition/woodcut_old_forest_path_2.webp",
    category: "expedition"
  },
  expedition_old_forest_road_tree_trans_3: {
    id: "expedition_old_forest_road_tree_trans_3",
    path: "assets/images/expedition/old-forest-tree-trans-3.webp",
    category: "expedition"
  },
  expedition_old_forest_road_tree_6: {
    id: "expedition_old_forest_road_tree_6",
    path: "assets/images/expedition/old_forest_tree_6.webp",
    category: "expedition"
  },
  expedition_old_forest_road_woodcut_parallax: {
    id: "expedition_old_forest_road_woodcut_parallax",
    path: "assets/images/expedition/woodcut_old_forest_path-parallax.webp",
    category: "expedition",
    generatedFromAssetId: "expedition_old_forest_road_woodcut",
    foregroundAlignment: {
      offset: { x: 0, y: 605 },
      canvas: { width: 2176, height: 720 },
      size: { width: 2176, height: 115 }
    }
  },
  expedition_old_forest_road_woodcut_2_parallax: {
    id: "expedition_old_forest_road_woodcut_2_parallax",
    path: "assets/images/expedition/woodcut_old_forest_path_2-parallax.webp",
    category: "expedition",
    generatedFromAssetId: "expedition_old_forest_road_woodcut_2",
    foregroundAlignment: {
      offset: {
        x: 0,
        y: 500
      },
      canvas: {
        width: 2176,
        height: 720
      },
      size: {
        width: 2176,
        height: 194
      }
    }
  },
  expedition_old_forest_road_woodcut_3_parallax: {
    id: "expedition_old_forest_road_woodcut_3_parallax",
    path: "assets/images/expedition/woodcut_old_forest_path_3-parallax.webp",
    category: "expedition",
    generatedFromAssetId: "expedition_old_forest_road_woodcut_3",
    foregroundAlignment: {
      offset: {
        x: 0,
        y: 537
      },
      canvas: {
        width: 2176,
        height: 720
      },
      size: {
        width: 2176,
        height: 181
      }
    }
  },
  combat_scene_old_forest_road_combat: {
    id: "combat_scene_old_forest_road_combat",
    path: "assets/images/combat_scene/old_forest_combat.webp",
    category: "combat_scene"
  }
});

const AUDIO_ASSET_DEFINITIONS = Object.freeze({
});

const ASSET_IMAGE_CATEGORIES = Object.freeze(["location", "town", "expedition", "encounter", "combat", "combat_scene", "portrait", "ui"]);
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
