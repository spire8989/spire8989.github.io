"use strict";

// Locations, destinations, NPCs, and shops are content definitions. The UI only
// follows their IDs and actions, allowing future hubs to reuse the same screens.
const NPC_DEFINITIONS = Object.freeze({
  village_innkeeper: {
    id: "village_innkeeper",
    name: "Innkeeper",
    role: "Keeper of the village inn",
    description: "A watchful host who hears much from travelers at the forest edge.",
    dialogue: ["You will find a warm hearth here whenever the forest lets you return."],
    rumors: [
      "Travelers say the forest paths change after sunset.",
      "Hunters avoid the overgrown trails. They say strange lights move between the trees.",
    ],
    locationIds: ["broceliande_village"],
  },
  village_merchant: {
    id: "village_merchant",
    name: "Village Merchant",
    role: "General goods trader",
    description: "A practical trader with supplies for those bound for the forest.",
    dialogue: ["Take only what you can carry, and bring back what the forest has no use for."],
    rumors: [],
    locationIds: ["broceliande_village"],
  },
  village_blacksmith: {
    id: "village_blacksmith",
    name: "Blacksmith",
    role: "Smith and armorer",
    description: "The village smith keeps a small stock of dependable arms and tools.",
    dialogue: ["Good iron will not choose your road for you, but it may see you home."],
    rumors: [],
    locationIds: ["broceliande_village"],
  },
});

const SHOP_DEFINITIONS = Object.freeze({
  village_general_goods: {
    id: "village_general_goods",
    displayName: "General Goods",
    itemsForSale: {
      rope: { price: 6 },
      torch: { price: 3 },
      bandages: { price: 5 },
      dried_herbs: { price: 4 },
    },
    provisionsForSale: { price: 1, stock: 50 },
    acceptedCategories: ["supply", "consumable", "gear", "valuable"],
    acceptedTags: ["mundane", "tool", "supplies", "valuable"],
    sellValues: {
      rope: 3,
      torch: 1,
      bandages: 2,
      dried_herbs: 2,
      old_coin: 5,
      hunting_supplies: 3,
      fine_hunting_knife: 4,
    },
  },
  village_smithy: {
    id: "village_smithy",
    displayName: "Smithy Stock",
    itemsForSale: {
      arthur_sword: { price: 18 },
      quilted_hauberk: { price: 24 },
      fine_hunting_knife: { price: 10 },
    },
    acceptedCategories: ["weapon", "armor"],
    acceptedTags: ["steel", "martial", "tool"],
    sellValues: {
      arthur_sword: 9,
      quilted_hauberk: 12,
      fine_hunting_knife: 5,
    },
  },
});

const DESTINATION_DEFINITIONS = Object.freeze({
  inn: {
    id: "inn",
    name: "The Inn",
    type: "inn",
    description: "A low timber hall offering warmth, simple fare, and village talk.",
    visualKey: "inn_interior",
    scenePosition: "northwest",
    npcIds: ["village_innkeeper"],
    shopId: null,
    actions: ["talk", "rumor"],
  },
  merchant: {
    id: "merchant",
    name: "Merchant",
    type: "shop",
    description: "A covered stall stocked with practical expedition supplies.",
    visualKey: "merchant_stall",
    scenePosition: "northeast",
    npcIds: ["village_merchant"],
    shopId: "village_general_goods",
    actions: ["talk", "shop"],
  },
  blacksmith: {
    id: "blacksmith",
    name: "Blacksmith",
    type: "shop",
    description: "Firelight falls across a compact forge and racks of serviceable gear.",
    visualKey: "smithy_interior",
    scenePosition: "southwest",
    npcIds: ["village_blacksmith"],
    shopId: "village_smithy",
    actions: ["talk", "shop"],
  },
  forest_gate: {
    id: "forest_gate",
    name: "Forest Gate",
    type: "expedition_gate",
    description: "The last roofs give way to the old road beneath Brocéliande's trees.",
    visualKey: "forest_gate",
    scenePosition: "southeast",
    npcIds: [],
    shopId: null,
    actions: ["prepare_expedition"],
  },
});

const LOCATION_DEFINITIONS = Object.freeze({
  broceliande_village: {
    id: "broceliande_village",
    name: "Village at the Edge of Brocéliande",
    type: "village",
    description: "A small inhabited refuge beside the ancient forest.",
    chapterId: "chapter_03",
    regionId: "broceliande",
    visualKey: "broceliande_village",
    destinations: ["inn", "merchant", "blacksmith", "forest_gate"],
    npcs: ["village_innkeeper", "village_merchant", "village_blacksmith"],
    shops: ["village_general_goods", "village_smithy"],
    availableExpeditions: ["broceliande_expedition"],
    availableQuests: [],
    requirements: [],
  },
});
