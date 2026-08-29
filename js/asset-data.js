"use strict";

// Runtime artwork metadata lives here. Synthesized audio content is kept in
// js/audio-synth-data.js so the image catalog stays independent of audio.
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
  },
  combat_arthur_idle_basesprite: {
    id: "combat_arthur_idle_basesprite",
    path: "assets/images/combat/basesprite.webp",
    category: "combat"
  },
  combat_arthur_walk_basesprite_walk2: {
    id: "combat_arthur_walk_basesprite_walk2",
    path: "assets/images/combat/BaseSprite-Walk2.webp",
    category: "combat"
  },
  combat_arthur_basesprite_idle_anim: {
    id: "combat_arthur_basesprite_idle_anim",
    path: "assets/images/combat/basesprite-idle.webp",
    category: "combat"
  },
  combat_bandit_idle: {
    id: "combat_bandit_idle",
    path: "assets/images/combat/bandit-idle.webp",
    category: "combat"
  },
  combat_sir_kay_idle: {
    id: "combat_sir_kay_idle",
    path: "assets/images/combat/sirkay-idle.webp",
    category: "combat"
  },
  combat_sir_kay_walk: {
    id: "combat_sir_kay_walk",
    path: "assets/images/combat/sirkay-walk.webp",
    category: "combat"
  },
  combat_arthur_attack: {
    id: "combat_arthur_attack",
    path: "assets/images/combat/wart-attack.webp",
    category: "combat"
  },
  combat_sir_kay_attack: {
    id: "combat_sir_kay_attack",
    path: "assets/images/combat/sirkay-attack.webp",
    category: "combat"
  },
  combat_bandit_attack: {
    id: "combat_bandit_attack",
    path: "assets/images/combat/bandit-attack2.webp",
    category: "combat"
  },
  combat_bandit_leader_idle: {
    id: "combat_bandit_leader_idle",
    path: "assets/images/combat/banditleader-idle.webp",
    category: "combat"
  },
  combat_bandit_leader_attack: {
    id: "combat_bandit_leader_attack",
    path: "assets/images/combat/banditleader-attack.webp",
    category: "combat"
  },
  combat_wild_boar_idle: {
    id: "combat_wild_boar_idle",
    path: "assets/images/combat/boar-idle.webp",
    category: "combat"
  },
  combat_wild_boar_attack: {
    id: "combat_wild_boar_attack",
    path: "assets/images/combat/boar-attack.webp",
    category: "combat"
  },
  combat_wolf_idle: {
    id: "combat_wolf_idle",
    path: "assets/images/combat/wolf-idle.webp",
    category: "combat"
  },
  combat_wolf_attack: {
    id: "combat_wolf_attack",
    path: "assets/images/combat/wolf-attack.webp",
    category: "combat"
  },
  combat_llamrei_idle: {
    id: "combat_llamrei_idle",
    path: "assets/images/combat/llamrei-idle.webp",
    category: "combat"
  },
  combat_llamrei_attack: {
    id: "combat_llamrei_attack",
    path: "assets/images/combat/llamrei-attack.webp",
    category: "combat"
  },
  combat_llamrei_walk: {
    id: "combat_llamrei_walk",
    path: "assets/images/combat/llamrei-walk.webp",
    category: "combat"
  },
  encounter_broken_bridge: {
    id: "encounter_broken_bridge",
    path: "assets/images/encounter/broken_bridge_bg.webp",
    category: "encounter"
  },
  encounter_woodland_stream: {
    id: "encounter_woodland_stream",
    path: "assets/images/encounter/woodland_stream.webp",
    category: "encounter"
  },
  town_hidden_forest_village: {
    id: "town_hidden_forest_village",
    path: "assets/images/town/Village2.webp",
    category: "town"
  },
  encounter_fish_the_stream: {
    id: "encounter_fish_the_stream",
    path: "assets/images/encounter/woodland_stream_fishing5.webp",
    category: "encounter"
  }
});

const ASSET_IMAGE_CATEGORIES = Object.freeze(["location", "town", "expedition", "encounter", "combat", "combat_scene", "portrait", "ui"]);

function validAssetPath(path, root) {
  return typeof path === "string"
    && path.startsWith(`${root}/`)
    && !path.includes("\\")
    && !path.split("/").some((part) => part === ".." || part === "." || part === "");
}

function normalizeImageAssetDefinition(definition) {
  if (!definition || typeof definition !== "object") return null;
  if (typeof definition.id !== "string"
    || !validAssetPath(definition.path, "assets/images")
    || !ASSET_IMAGE_CATEGORIES.includes(definition.category)) {
    return null;
  }
  return definition;
}

const AssetCatalog = Object.freeze({
  image(id) {
    return normalizeImageAssetDefinition(IMAGE_ASSET_DEFINITIONS[id]);
  },

  imagePath(id) {
    return this.image(id)?.path ?? null;
  },

  hasImage(id) {
    return Boolean(this.image(id));
  },
});
