"use strict";

const LOOT_TABLE_DEFINITIONS = Object.freeze({
  common_materials: Object.freeze({
    id: "common_materials",
    entries: Object.freeze([
      Object.freeze({ type: "material", materialId: "medicinal_herbs", quantity: 1, weight: 30 }),
      Object.freeze({ type: "material", materialId: "cloth", quantity: 1, weight: 25 }),
      Object.freeze({ type: "material", materialId: "leather", quantity: 1, weight: 20 }),
      Object.freeze({ type: "material", materialId: "iron", quantity: 1, weight: 15 }),
      Object.freeze({ type: "material", materialId: "wood", quantity: 1, weight: 10 }),
    ]),
  }),
  uncommon_materials: Object.freeze({
    id: "uncommon_materials",
    entries: Object.freeze([
      Object.freeze({ type: "material", materialId: "silver", quantity: 1, weight: 20 }),
      Object.freeze({ type: "material", materialId: "rare_herbs", quantity: 1, weight: 30 }),
      Object.freeze({ type: "material", materialId: "alchemical_reagents", quantity: 1, weight: 30 }),
      Object.freeze({ type: "material", materialId: "sacred_oil", quantity: 1, weight: 20 }),
    ]),
  }),
  rare_materials: Object.freeze({
    id: "rare_materials",
    entries: Object.freeze([
      Object.freeze({ type: "material", materialId: "relic_fragment", quantity: 1, weight: 1 }),
    ]),
  }),
  forest_materials: Object.freeze({
    id: "forest_materials",
    entries: Object.freeze([
      Object.freeze({ type: "material", materialId: "medicinal_herbs", quantity: 1, weight: 35 }),
      Object.freeze({ type: "material", materialId: "wood", quantity: 1, weight: 25 }),
      Object.freeze({ type: "material", materialId: "leather", quantity: 1, weight: 20 }),
      Object.freeze({ type: "material", materialId: "rare_herbs", quantity: 1, weight: 8 }),
      Object.freeze({ type: "table", tableId: "common_materials", weight: 12 }),
    ]),
  }),
  forest_ingredients: Object.freeze({
    id: "forest_ingredients",
    entries: Object.freeze([
      Object.freeze({ type: "item", itemId: "raw_meat", quantity: 1, weight: 24 }),
      Object.freeze({ type: "item", itemId: "wild_berries", quantity: 1, weight: 28 }),
      Object.freeze({ type: "item", itemId: "mushrooms", quantity: 1, weight: 22 }),
      Object.freeze({ type: "item", itemId: "fresh_herbs", quantity: 1, weight: 18 }),
      Object.freeze({ type: "item", itemId: "honey", quantity: 1, weight: 8 }),
    ]),
  }),
  bandit_ambush_loot: {
    id: "bandit_ambush_loot",
    entries: [
      {
        type: "gold",
        minimum: 2,
        maximum: 5,
        weight: 7
      },
      {
        type: "item",
        itemId: "old_coin",
        weight: 5
      },
      {
        type: "item",
        itemId: "coin_purse",
        weight: 3
      },
      {
        type: "item",
        itemId: "decorated_buckle",
        weight: 3
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
        itemId: "dried_herbs",
        weight: 2
      },
      {
        type: "item",
        itemId: "rope",
        weight: 1
      },
      {
        type: "item",
        itemId: "rusted_sword",
        weight: 2
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
  forest_encounter_forage: Object.freeze({
    id: "forest_encounter_forage",
    entries: Object.freeze([
      Object.freeze({ type: "table", tableId: "forest_materials", weight: 6 }),
      Object.freeze({ type: "table", tableId: "forest_ingredients", weight: 5 }),
      Object.freeze({ type: "table", tableId: "apothecary_common_recipes", weight: 2 }),
    ]),
  }),
  expedition_return_minor: Object.freeze({
    id: "expedition_return_minor",
    entries: Object.freeze([
      Object.freeze({ type: "table", tableId: "common_materials", weight: 8 }),
      Object.freeze({ type: "gold", minimum: 1, maximum: 2, weight: 2 }),
    ]),
  }),
  expedition_return_low: Object.freeze({
    id: "expedition_return_low",
    entries: Object.freeze([
      Object.freeze({ type: "table", tableId: "common_materials", weight: 6 }),
      Object.freeze({ type: "table", tableId: "forest_materials", weight: 3 }),
      Object.freeze({ type: "gold", minimum: 2, maximum: 4, weight: 2 }),
    ]),
  }),
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
  expedition_return_deep: Object.freeze({
    id: "expedition_return_deep",
    entries: Object.freeze([
      Object.freeze({ type: "table", tableId: "uncommon_materials", weight: 5 }),
      Object.freeze({ type: "table", tableId: "forest_materials", weight: 4 }),
      Object.freeze({ type: "table", tableId: "apothecary_uncommon_recipes", weight: 2 }),
      Object.freeze({ type: "table", tableId: "rare_materials", weight: 1 }),
      Object.freeze({ type: "gold", minimum: 7, maximum: 12, weight: 2 }),
    ]),
  }),
});

const EXPEDITION_RETURN_REWARD_TIERS = Object.freeze([
  Object.freeze({ id: "minor", minimumDistance: 0, sources: Object.freeze([{ tableId: "expedition_return_minor", rolls: 1 }]) }),
  Object.freeze({ id: "low", minimumDistance: 20, sources: Object.freeze([{ tableId: "expedition_return_low", rolls: 2 }]) }),
  Object.freeze({ id: "medium", minimumDistance: 40, sources: Object.freeze([{ tableId: "expedition_return_medium", rolls: 2 }, { tableId: "common_materials", rolls: 1 }]) }),
  Object.freeze({ id: "high", minimumDistance: 60, sources: Object.freeze([{ tableId: "expedition_return_high", rolls: 3 }, { tableId: "uncommon_materials", rolls: 1, chance: 0.35 }]) }),
  Object.freeze({ id: "deep", minimumDistance: 90, sources: Object.freeze([{ tableId: "expedition_return_deep", rolls: 3 }, { tableId: "common_materials", rolls: 2 }, { tableId: "apothecary_uncommon_recipes", rolls: 1, chance: 0.25 }]) }),
]);
