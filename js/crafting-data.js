"use strict";

const RARITY_DEFINITIONS = Object.freeze({
  common: Object.freeze({ id: "common", name: "Common", rank: 0 }),
  uncommon: Object.freeze({ id: "uncommon", name: "Uncommon", rank: 1 }),
  rare: Object.freeze({ id: "rare", name: "Rare", rank: 2 }),
  epic: Object.freeze({ id: "epic", name: "Epic", rank: 3 }),
  legendary: Object.freeze({ id: "legendary", name: "Legendary", rank: 4 }),
});

const MATERIAL_DEFINITIONS = Object.freeze({
  medicinal_herbs: Object.freeze({ id: "medicinal_herbs", name: "Medicinal Herbs", description: "Common leaves and roots used in simple remedies.", rarity: "common" }),
  cloth: Object.freeze({ id: "cloth", name: "Cloth", description: "Clean woven cloth suitable for dressings and repairs.", rarity: "common" }),
  leather: Object.freeze({ id: "leather", name: "Leather", description: "Tough cured hide used for straps, grips, and patches.", rarity: "common" }),
  iron: Object.freeze({ id: "iron", name: "Iron", description: "Workable iron pieces for tools and equipment.", rarity: "common" }),
  wood: Object.freeze({ id: "wood", name: "Wood", description: "Dry, sound timber useful in many practical crafts.", rarity: "common" }),
  silver: Object.freeze({ id: "silver", name: "Silver", description: "Purified silver valued for both craft and ritual use.", rarity: "uncommon" }),
  rare_herbs: Object.freeze({ id: "rare_herbs", name: "Rare Herbs", description: "Unusual plants with stronger medicinal properties.", rarity: "uncommon" }),
  alchemical_reagents: Object.freeze({ id: "alchemical_reagents", name: "Alchemical Reagents", description: "Salts, powders, and extracts for advanced preparations.", rarity: "uncommon" }),
  sacred_oil: Object.freeze({ id: "sacred_oil", name: "Sacred Oil", description: "Consecrated oil reserved for uncommon rites and remedies.", rarity: "uncommon" }),
  relic_fragment: Object.freeze({ id: "relic_fragment", name: "Relic Fragment", description: "A rare fragment whose original purpose has been lost.", rarity: "rare" }),
});

const CRAFTING_PROVIDER_DEFINITIONS = Object.freeze({
  apothecary: Object.freeze({ id: "apothecary", name: "Apothecary" }),
  blacksmith: Object.freeze({ id: "blacksmith", name: "Blacksmith" }),
  campfire: Object.freeze({ id: "campfire", name: "Campfire" }),
});

const RECIPE_DEFINITIONS = Object.freeze({
  bandages: {
    id: "bandages",
    name: "Bandages",
    description: "Cut and prepare clean cloth for dressing wounds.",
    craftingProvider: "apothecary",
    ingredients: [
      { type: "material", id: "cloth", quantity: 2 },
    ],
    output: {
      itemId: "bandages",
      quantity: 1
    },
    goldCost: 0,
    rarity: "common",
    craftingDurationMs: 1000
  },
  healing_poultice: Object.freeze({
    id: "healing_poultice", name: "Healing Poultice", description: "Bind crushed medicinal herbs into a restorative dressing.",
    craftingProvider: "apothecary", ingredients: Object.freeze([
      Object.freeze({ type: "material", id: "medicinal_herbs", quantity: 2 }),
      Object.freeze({ type: "material", id: "cloth", quantity: 1 }),
    ]),
    output: Object.freeze({ itemId: "healing_poultice", quantity: 1 }), goldCost: 0, rarity: "common",
  }),
  antidote: Object.freeze({
    id: "antidote", name: "Antidote", description: "Prepare a draught against common woodland venoms.",
    craftingProvider: "apothecary", ingredients: Object.freeze([
      Object.freeze({ type: "material", id: "medicinal_herbs", quantity: 2 }),
      Object.freeze({ type: "material", id: "alchemical_reagents", quantity: 1 }),
    ]),
    output: Object.freeze({ itemId: "antidote", quantity: 1 }), goldCost: 0, rarity: "common",
  }),
  strong_tonic: Object.freeze({
    id: "strong_tonic", name: "Strong Tonic", description: "Concentrate rare herbs into a potent restorative.",
    craftingProvider: "apothecary", ingredients: Object.freeze([
      Object.freeze({ type: "material", id: "rare_herbs", quantity: 2 }),
      Object.freeze({ type: "material", id: "alchemical_reagents", quantity: 1 }),
      Object.freeze({ type: "material", id: "sacred_oil", quantity: 1 }),
    ]),
    output: Object.freeze({ itemId: "strong_tonic", quantity: 2 }), goldCost: 2, rarity: "uncommon",
  }),
  repair_kit: Object.freeze({
    id: "repair_kit", name: "Repair Kit", description: "Fit spare iron, wood, and leather into a portable repair kit.",
    craftingProvider: "blacksmith", ingredients: Object.freeze([
      Object.freeze({ type: "material", id: "iron", quantity: 2 }),
      Object.freeze({ type: "material", id: "wood", quantity: 1 }),
      Object.freeze({ type: "material", id: "leather", quantity: 1 }),
    ]),
    output: Object.freeze({ itemId: "repair_kit", quantity: 1 }), goldCost: 2, rarity: "uncommon",
  }),
  roasted_meat: Object.freeze({
    id: "roasted_meat", name: "Roasted Meat", description: "Cook a plain but filling meal over the fire.",
    craftingProvider: "campfire", starter: true,
    ingredients: Object.freeze([
      Object.freeze({ type: "item", id: "raw_meat", quantity: 1 }),
    ]),
    output: Object.freeze({ provisions: 3 }), goldCost: 0, rarity: "common",
  }),
  foraged_meal: Object.freeze({
    id: "foraged_meal", name: "Foraged Meal", description: "Combine berries and mushrooms into a simple woodland meal.",
    craftingProvider: "campfire", starter: true,
    ingredients: Object.freeze([
      Object.freeze({ type: "item", id: "wild_berries", quantity: 1 }),
      Object.freeze({ type: "item", id: "mushrooms", quantity: 1 }),
    ]),
    output: Object.freeze({ provisions: 5 }), goldCost: 0, rarity: "common",
  }),
  hunters_stew: Object.freeze({
    id: "hunters_stew", name: "Hunter's Stew", description: "A careful use of meat, mushrooms, and herbs yields the best meal.",
    craftingProvider: "campfire", starter: true,
    ingredients: Object.freeze([
      Object.freeze({ type: "item", id: "raw_meat", quantity: 1 }),
      Object.freeze({ type: "item", id: "mushrooms", quantity: 1 }),
      Object.freeze({ type: "item", id: "fresh_herbs", quantity: 1 }),
    ]),
    output: Object.freeze({ provisions: 8 }), goldCost: 0, rarity: "uncommon",
  }),
  honeyed_berries: Object.freeze({
    id: "honeyed_berries", name: "Honeyed Berries", description: "Sweeten wild berries with a little golden honey.",
    craftingProvider: "campfire", starter: true,
    ingredients: Object.freeze([
      Object.freeze({ type: "item", id: "wild_berries", quantity: 1 }),
      Object.freeze({ type: "item", id: "honey", quantity: 1 }),
    ]),
    output: Object.freeze({ provisions: 6 }), goldCost: 0, rarity: "common",
  }),
  forestwarden_stew: Object.freeze({
    id: "forestwarden_stew", name: "Forestwarden Stew", description: "A deep stew of meat, mushrooms, and rare herbs that keeps its warmth over a long march.",
    craftingProvider: "campfire", ingredients: Object.freeze([
      Object.freeze({ type: "item", id: "raw_meat", quantity: 1 }),
      Object.freeze({ type: "item", id: "mushrooms", quantity: 1 }),
      Object.freeze({ type: "material", id: "rare_herbs", quantity: 1 }),
    ]),
    output: Object.freeze({ provisions: 12 }), goldCost: 0, rarity: "rare",
  }),
  honeyed_forest_preserves: Object.freeze({
    id: "honeyed_forest_preserves", name: "Honeyed Forest Preserves", description: "Berries, honey, and fresh herbs sealed into a dense travel ration with little waste.",
    craftingProvider: "campfire", ingredients: Object.freeze([
      Object.freeze({ type: "item", id: "wild_berries", quantity: 2 }),
      Object.freeze({ type: "item", id: "honey", quantity: 1 }),
      Object.freeze({ type: "item", id: "fresh_herbs", quantity: 1 }),
    ]),
    output: Object.freeze({ provisions: 10 }), goldCost: 0, rarity: "uncommon",
  }),
  glimmering_sword: {
    id: "glimmering_sword",
    name: "Glimmering Sword",
    description: "Polish up ",
    craftingProvider: "blacksmith",
    ingredients: [
      { type: "item", id: "rusted_sword", quantity: 1 },
      { type: "item", id: "green_glass_vial", quantity: 1 },
    ],
    output: {
      itemId: "glimmering_sword",
      quantity: 1
    },
    goldCost: 5,
    rarity: "rare"
  },
  verdant_heart: Object.freeze({
    id: "verdant_heart",
    name: "Forge the Verdant Heart",
    description: "Fit the Shard of Grace and Shard of Wrath into one dormant heart. The Blacksmith warns that the finished piece is not yet awake.",
    craftingProvider: "blacksmith",
    ingredients: [
      { type: "item", id: "verdant_shard_grace", quantity: 1 },
      { type: "item", id: "verdant_shard_wrath", quantity: 1 },
    ],
    output: { itemId: "verdant_heart", quantity: 1 },
    goldCost: 6,
    rarity: "epic",
    alwaysKnown: true,
  }),
  forest_communion_draught: Object.freeze({
    id: "forest_communion_draught",
    name: "Green Communion Draught",
    description: "Prepare the Druid's bitter ritual draught from herbs, honey, and a fresh forest cutting.",
    craftingProvider: "apothecary",
    ingredients: [
      { type: "material", id: "rare_herbs", quantity: 1 },
      { type: "material", id: "medicinal_herbs", quantity: 2 },
      { type: "item", id: "honey", quantity: 1 },
      { type: "item", id: "fresh_herbs", quantity: 1 },
    ],
    output: { itemId: "forest_communion_draught", quantity: 1 },
    goldCost: 3,
    rarity: "rare",
  }),
  threefold_seal: {
    id: "threefold_seal",
    name: "Threefold Seal",
    description: "A relic assembled from forest omen, fountain stone, and the dark glass left behind by the Val.",
    craftingProvider: "blacksmith",
    ingredients: [
      { type: "item", id: "white_stag_shard", quantity: 1 },
      { type: "item", id: "barenton_stone", quantity: 1 },
      { type: "item", id: "black_glass_tear", quantity: 1 },
      { type: "material", id: "silver", quantity: 2 },
      { type: "material", id: "sacred_oil", quantity: 1 },
    ],
    output: {
      itemId: "threefold_seal",
      quantity: 1,
    },
    goldCost: 8,
    rarity: "epic"
  }
});
