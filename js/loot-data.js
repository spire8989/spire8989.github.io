"use strict";

const LOOT_TABLE_DEFINITIONS = Object.freeze({
  common_materials: {
    id: "common_materials",
    entries: [
      {
        type: "material",
        materialId: "medicinal_herbs",
        weight: 30,
        minimum: 1,
        maximum: 2
      },
      {
        type: "material",
        materialId: "cloth",
        weight: 25,
        minimum: 1,
        maximum: 3
      },
      {
        type: "material",
        materialId: "leather",
        weight: 20,
        minimum: 1,
        maximum: 2
      },
      {
        type: "material",
        materialId: "iron",
        weight: 15,
        minimum: 1,
        maximum: 3
      },
      {
        type: "material",
        materialId: "wood",
        weight: 10,
        minimum: 1,
        maximum: 3
      }
    ]
  },
  uncommon_materials: {
    id: "uncommon_materials",
    entries: [
      {
        type: "material",
        materialId: "silver",
        weight: 20,
        minimum: 1,
        maximum: 3
      },
      {
        type: "material",
        materialId: "rare_herbs",
        weight: 30,
        minimum: 1,
        maximum: 2
      },
      {
        type: "material",
        materialId: "alchemical_reagents",
        weight: 30,
        minimum: 1,
        maximum: 2
      },
      {
        type: "material",
        materialId: "sacred_oil",
        quantity: 1,
        weight: 20
      },
      {
        type: "item",
        itemId: "green_glass_vial",
        weight: 15,
        quantity: 1
      },
      {
        type: "item",
        itemId: "poisonous_vines",
        weight: 20,
        minimum: 1,
        maximum: 4
      }
    ]
  },
  rare_materials: {
    id: "rare_materials",
    entries: [
      {
        type: "material",
        materialId: "relic_fragment",
        quantity: 1,
        weight: 1
      },
      {
        type: "item",
        itemId: "green_glass_vial",
        weight: 1,
        quantity: 1
      }
    ]
  },
  forest_materials: {
    id: "forest_materials",
    entries: [
      {
        type: "material",
        materialId: "medicinal_herbs",
        weight: 35,
        minimum: 1,
        maximum: 2
      },
      {
        type: "material",
        materialId: "wood",
        weight: 25,
        minimum: 1,
        maximum: 4
      },
      {
        type: "material",
        materialId: "leather",
        weight: 20,
        minimum: 1,
        maximum: 3
      },
      {
        type: "material",
        materialId: "rare_herbs",
        quantity: 1,
        weight: 8
      },
      {
        type: "table",
        tableId: "common_materials",
        weight: 12
      },
      {
        type: "item",
        itemId: "poisonous_vines",
        weight: 10,
        minimum: 1,
        maximum: 2
      },
      {
        type: "item",
        itemId: "honey",
        weight: 8,
        minimum: 1,
        maximum: 2
      }
    ]
  },
  forest_ingredients: {
    id: "forest_ingredients",
    entries: [
      {
        type: "item",
        itemId: "raw_meat",
        quantity: 1,
        weight: 18
      },
      {
        type: "item",
        itemId: "wild_berries",
        weight: 30,
        minimum: 1,
        maximum: 3
      },
      {
        type: "item",
        itemId: "mushrooms",
        weight: 30,
        minimum: 2,
        maximum: 3
      },
      {
        type: "item",
        itemId: "fresh_herbs",
        weight: 21,
        minimum: 1,
        maximum: 2
      },
      {
        type: "item",
        itemId: "honey",
        weight: 20,
        minimum: 1,
        maximum: 4
      },
      {
        type: "item",
        itemId: "antler_fragment",
        weight: 12,
        quantity: 1
      },
      {
        type: "item",
        itemId: "poisonous_vines",
        weight: 15,
        minimum: 1,
        maximum: 2
      }
    ]
  },
  rare_herb_find: {
    id: "rare_herb_find",
    entries: [
      {
        type: "material",
        materialId: "rare_herbs",
        quantity: 1,
        weight: 1
      }
    ]
  },
  bandit_ambush_loot: {
    id: "bandit_ambush_loot",
    entries: [
      {
        type: "gold",
        minimum: 4,
        maximum: 10,
        weight: 7
      },
      {
        type: "item",
        itemId: "silver_brooch",
        weight: 2
      },
      {
        type: "item",
        itemId: "bandages",
        weight: 1
      },
      {
        type: "item",
        itemId: "rope",
        weight: 1
      },
      {
        type: "item",
        itemId: "rusted_sword",
        weight: 0.5
      },
      {
        type: "recipe",
        recipeId: "forestwarden_mail",
        weight: 0.25
      },
      {
        type: "item",
        itemId: "weathered_round_shield",
        weight: 1
      }
    ]
  },
  bandit_leader_loot: {
    id: "bandit_leader_loot",
    entries: [
      {
        type: "gold",
        minimum: 8,
        maximum: 14,
        weight: 8
      },
      {
        type: "item",
        itemId: "coin_purse",
        weight: 4
      },
      {
        type: "item",
        itemId: "merchants_ring",
        weight: 4
      },
      {
        type: "item",
        itemId: "silver_cup",
        weight: 3
      },
      {
        type: "item",
        itemId: "gilded_brooch",
        weight: 2
      },
      {
        type: "item",
        itemId: "blackthorn_badge",
        weight: 1
      },
      {
        type: "item",
        itemId: "silver_reliquary",
        weight: 1
      }
    ]
  },
  briar_knight_loot: {
    id: "briar_knight_loot",
    entries: [
      {
        type: "item",
        itemId: "thorn_of_the_dolorous_vale",
        weight: 1,
        quantity: 1
      },
      {
        type: "recipe",
        recipeId: "splinterbark_shield",
        weight: 1
      }
    ]
  },
  apothecary_common_recipes: Object.freeze({
    id: "apothecary_common_recipes",
    entries: Object.freeze([
      Object.freeze({ type: "recipe", recipeId: "healing_poultice", weight: 3 }),
      Object.freeze({ type: "recipe", recipeId: "antidote", weight: 2 }),
    ]),
  }),
  apothecary_uncommon_recipes: Object.freeze({
    id: "apothecary_uncommon_recipes",
    entries: Object.freeze([
      Object.freeze({ type: "recipe", recipeId: "strong_tonic", weight: 1 }),
    ]),
  }),
  forest_encounter_forage: {
    id: "forest_encounter_forage",
    entries: [
      {
        type: "table",
        tableId: "forest_materials",
        weight: 6
      },
      {
        type: "table",
        tableId: "forest_ingredients",
        weight: 5
      },
      {
        type: "table",
        tableId: "apothecary_common_recipes",
        weight: 2
      },
      {
        type: "item",
        itemId: "old_foresters_map",
        weight: 1,
        quantity: 1
      },
      {
        type: "item",
        itemId: "antler_fragment",
        weight: 3,
        quantity: 1
      }
    ]
  },
  expedition_return_minor: Object.freeze({
    id: "expedition_return_minor",
    entries: Object.freeze([
      Object.freeze({ type: "table", tableId: "common_materials", weight: 8 }),
      Object.freeze({ type: "gold", minimum: 1, maximum: 2, weight: 2 }),
    ]),
  }),
  expedition_return_low: {
    id: "expedition_return_low",
    entries: [
      {
        type: "table",
        tableId: "common_materials",
        weight: 6
      },
      {
        type: "table",
        tableId: "forest_materials",
        weight: 3
      },
      {
        type: "gold",
        minimum: 2,
        maximum: 4,
        weight: 2
      }
    ]
  },
  expedition_return_medium: Object.freeze({
    id: "expedition_return_medium",
    entries: Object.freeze([
      Object.freeze({ type: "table", tableId: "forest_materials", weight: 6 }),
      Object.freeze({ type: "table", tableId: "uncommon_materials", weight: 2 }),
      Object.freeze({ type: "table", tableId: "apothecary_common_recipes", weight: 2 }),
      Object.freeze({ type: "gold", minimum: 3, maximum: 6, weight: 2 }),
    ]),
  }),
  expedition_return_high: Object.freeze({
    id: "expedition_return_high",
    entries: Object.freeze([
      Object.freeze({ type: "table", tableId: "forest_materials", weight: 5 }),
      Object.freeze({ type: "table", tableId: "uncommon_materials", weight: 3 }),
      Object.freeze({ type: "table", tableId: "apothecary_common_recipes", weight: 2 }),
      Object.freeze({ type: "table", tableId: "apothecary_uncommon_recipes", weight: 1 }),
      Object.freeze({ type: "gold", minimum: 5, maximum: 9, weight: 2 }),
    ]),
  }),
  expedition_return_deep: {
    id: "expedition_return_deep",
    entries: [
      {
        type: "table",
        tableId: "uncommon_materials",
        weight: 5
      },
      {
        type: "table",
        tableId: "forest_materials",
        weight: 4
      },
      {
        type: "table",
        tableId: "apothecary_uncommon_recipes",
        weight: 2
      },
      {
        type: "table",
        tableId: "rare_materials",
        weight: 1
      },
      {
        type: "gold",
        minimum: 7,
        maximum: 12,
        weight: 2
      },
      {
        type: "recipe",
        recipeId: "forestwarden_mail",
        weight: 2
      }
    ]
  },
  expedition_return_late: {
    id: "expedition_return_late",
    entries: [
      {
        type: "table",
        tableId: "uncommon_materials",
        weight: 5
      },
      {
        type: "table",
        tableId: "rare_materials",
        weight: 2
      },
      {
        type: "table",
        tableId: "apothecary_uncommon_recipes",
        weight: 2
      },
      {
        type: "gold",
        minimum: 10,
        maximum: 18,
        weight: 3
      },
      {
        type: "recipe",
        recipeId: "forestwarden_mail",
        weight: 5
      }
    ]
  },
  expedition_return_endgame: Object.freeze({
    id: "expedition_return_endgame",
    entries: Object.freeze([
      Object.freeze({ type: "table", tableId: "rare_materials", weight: 4 }),
      Object.freeze({ type: "table", tableId: "uncommon_materials", weight: 3 }),
      Object.freeze({ type: "table", tableId: "apothecary_uncommon_recipes", weight: 2 }),
      Object.freeze({ type: "gold", minimum: 16, maximum: 28, weight: 4 }),
    ]),
  }),
  expedition_return_optional: Object.freeze({
    id: "expedition_return_optional",
    entries: Object.freeze([
      Object.freeze({ type: "table", tableId: "rare_materials", weight: 5 }),
      Object.freeze({ type: "table", tableId: "uncommon_materials", weight: 3 }),
      Object.freeze({ type: "gold", minimum: 24, maximum: 42, weight: 5 }),
    ]),
  }),
  leper_knight_loot: {
    id: "leper_knight_loot",
    entries: [
      {
        type: "gold",
        minimum: 10,
        maximum: 25,
        weight: 20
      },
      {
        type: "item",
        itemId: "reliquary_of_saint_lazarus",
        weight: 5,
        quantity: 1
      }
    ]
  },
  abandoned_cart_loot: {
    id: "abandoned_cart_loot",
    entries: [
      {
        type: "item",
        itemId: "fine_hunting_knife",
        weight: 1
      },
      {
        type: "recipe",
        recipeId: "forestwarden_mail",
        weight: 1
      }
    ]
  },
  basic_animal_loot: {
    id: "basic_animal_loot",
    entries: [
      {
        type: "item",
        itemId: "raw_meat",
        weight: 10,
        minimum: 1,
        maximum: 2
      },
      {
        type: "item",
        itemId: "dried_herbs",
        weight: 5,
        minimum: 1,
        maximum: 3
      },
      {
        type: "item",
        itemId: "fresh_herbs",
        weight: 2,
        minimum: 1,
        maximum: 3
      },
      {
        type: "item",
        itemId: "mushrooms",
        weight: 2,
        minimum: 1,
        maximum: 3
      },
      {
        type: "recipe",
        recipeId: "splinterbark_shield",
        weight: 0.25
      }
    ],
    rolls: 1
  },
  shrine_loot: {
    id: "shrine_loot",
    entries: [
      {
        type: "item",
        itemId: "old_coin",
        weight: 50,
        minimum: 2,
        maximum: 3
      },
      {
        type: "item",
        itemId: "silver_brooch",
        weight: 29,
        quantity: 1
      },
      {
        type: "item",
        itemId: "silver_reliquary",
        weight: 8,
        quantity: 1
      },
      {
        type: "item",
        itemId: "jeweled_saints_locket",
        weight: 2,
        quantity: 1
      },
      {
        type: "material",
        materialId: "sacred_oil",
        weight: 2,
        quantity: 1
      }
    ],
    rolls: 1
  },
  fishing_teacher_pool: {
    id: "fishing_teacher_pool",
    entries: [
      { type: "catch", catchId: "brown_trout", weight: 80 },
      { type: "catch", catchId: "small_trout", weight: 20 },
    ],
  },
  fishing_woodland_default: {
    id: "fishing_woodland_default",
    entries: [
      { type: "catch", catchId: "brown_trout", weight: 55 },
      { type: "catch", catchId: "small_trout", weight: 30 },
      { type: "item", itemId: "old_coin", minimum: 2, maximum: 3, weight: 15 },
    ],
  },
  fishing_woodland_reeds: {
    id: "fishing_woodland_reeds",
    entries: [
      { type: "catch", catchId: "small_trout", weight: 58 },
      { type: "catch", catchId: "brown_trout", weight: 32 },
      { type: "item", itemId: "old_coin", minimum: 2, maximum: 3, weight: 10 },
    ],
  },
  fishing_woodland_deep_pool: {
    id: "fishing_woodland_deep_pool",
    entries: [
      { type: "catch", catchId: "large_pike", weight: 38 },
      { type: "catch", catchId: "brown_trout", weight: 42 },
      { type: "item", itemId: "old_coin", minimum: 2, maximum: 3, weight: 20 },
    ],
  }
});

const EXPEDITION_RETURN_REWARD_TIERS = Object.freeze([
  Object.freeze({ id: "minor", minimumDistance: 0, sources: Object.freeze([{ tableId: "expedition_return_minor", rolls: 1 }]) }),
  Object.freeze({ id: "low", minimumDistance: 20, sources: Object.freeze([{ tableId: "expedition_return_low", rolls: 2 }]) }),
  Object.freeze({ id: "medium", minimumDistance: 40, sources: Object.freeze([{ tableId: "expedition_return_medium", rolls: 2 }, { tableId: "common_materials", rolls: 1 }]) }),
  Object.freeze({ id: "high", minimumDistance: 60, sources: Object.freeze([{ tableId: "expedition_return_high", rolls: 3 }, { tableId: "uncommon_materials", rolls: 1, chance: 0.35 }]) }),
  Object.freeze({ id: "deep", minimumDistance: 90, sources: Object.freeze([{ tableId: "expedition_return_deep", rolls: 3 }, { tableId: "common_materials", rolls: 2 }, { tableId: "apothecary_uncommon_recipes", rolls: 1, chance: 0.25 }]) }),
  Object.freeze({ id: "late", minimumDistance: 120, sources: Object.freeze([{ tableId: "expedition_return_late", rolls: 4 }, { tableId: "forest_materials", rolls: 2 }, { tableId: "apothecary_uncommon_recipes", rolls: 1, chance: 0.5 }]) }),
  Object.freeze({ id: "endgame", minimumDistance: 160, sources: Object.freeze([{ tableId: "expedition_return_endgame", rolls: 5 }, { tableId: "rare_materials", rolls: 1 }, { tableId: "apothecary_uncommon_recipes", rolls: 1, chance: 0.7 }]) }),
  Object.freeze({ id: "optional", minimumDistance: 200, sources: Object.freeze([{ tableId: "expedition_return_optional", rolls: 5 }, { tableId: "rare_materials", rolls: 2 }]) }),
]);
