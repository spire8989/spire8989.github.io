"use strict";

// Locations, destinations, NPCs, and shops are content definitions. The UI only
// follows their IDs and actions, allowing future hubs to reuse the same screens.
const NPC_DEFINITIONS = Object.freeze({
  village_innkeeper: {
    id: "village_innkeeper",
    portraitAssetId: null,
    name: "Innkeeper",
    role: "Keeper of the village inn",
    description: "A watchful host who hears much from travelers at the forest edge.",
    dialogue: ["You will find a warm hearth here whenever the forest lets you return."],
    rumors: [
      "Travelers say the forest paths change after sunset.",
      "Hunters avoid the overgrown trails. They say strange lights move between the trees.",
      "Old charcoal burners speak of an altar deep in BrocÃ©liande where something green wakes when called.",
    ],
    locationIds: ["broceliande_village"],
  },
  village_merchant: {
    id: "village_merchant",
    portraitAssetId: null,
    name: "Village Merchant",
    role: "General goods trader",
    description: "A practical trader with supplies for those bound for the forest.",
    dialogue: ["Take only what you can carry, and bring back what the forest has no use for."],
    rumors: [],
    locationIds: ["broceliande_village"],
  },
  village_blacksmith: {
    id: "village_blacksmith",
    portraitAssetId: null,
    name: "Blacksmith",
    role: "Smith and armorer",
    description: "The village smith keeps a small stock of dependable arms and tools.",
    dialogue: ["Good iron will not choose your road for you, but it may see you home."],
    rumors: [],
    locationIds: ["broceliande_village"],
  },
  village_apothecary: {
    id: "village_apothecary",
    portraitAssetId: null,
    name: "Apothecary",
    role: "Herbalist and remedy maker",
    description: "Bundles of herbs and stoppered bottles line the apothecary's small workroom.",
    dialogue: ["A finished draught costs coin. Learn its preparation, and the forest may provide the rest."],
    rumors: [],
    locationIds: ["broceliande_village"],
  },
  village_reeve: {
    id: "village_reeve",
    portraitAssetId: "portrait_reeve",
    name: "Reeve of Brocéliande",
    role: "Village leader",
    description: "A measured village leader who has listened to too many conflicting accounts of the forest.",
    dialogue: [],
    rumors: [],
    dialogueSequenceId: "reeve_after_intro",
    introDialogueSequenceId: "broceliande_intro",
    locationIds: ["broceliande_village"]
  },
  hidden_village_innkeeper: {
    id: "hidden_village_innkeeper",
    portraitAssetId: null,
    name: "Forest Host",
    role: "Keeper of a hidden hearth",
    description: "A quiet host who charges for every blanket and every hour of warmth.",
    dialogue: ["The village keeps no road signs. Those who find us are welcome to pay for the night."],
    rumors: [
      "The oldest paths are safer when the forest knows your name.",
      "There is an altar beyond the last patient road. The forest has a Song, and an old green heart waits for it.",
    ],
    locationIds: ["hidden_forest_village"],
  },
  hidden_village_merchant: {
    id: "hidden_village_merchant",
    portraitAssetId: null,
    name: "Trail Merchant",
    role: "Small provisions trader",
    description: "A guarded merchant with a few costly supplies and little patience for haggling.",
    dialogue: ["You can buy time here, knight. You cannot buy much of it."],
    rumors: [],
    locationIds: ["hidden_forest_village"],
  },
  hidden_village_druid: {
    id: "hidden_village_druid",
    portraitAssetId: null,
    name: "Village Druid",
    role: "Druid of the hidden grove",
    description: "A watchful druid tends a shelf of remedies and the unfinished rites that keep the village hidden.",
    dialogue: [],
    rumors: [],
    dialogueSequenceId: "hidden_village_druid_dialogue",
    locationIds: ["hidden_forest_village"],
  },
  leper_knight: {
    id: "leper_knight",
    portraitAssetId: null,
    name: "Leper Knight",
    role: "Wounded knight of the forest road",
    description: "A scarred knight who offers hard-won warnings without asking for pity.",
    dialogue: [],
    rumors: [],
    dialogueSequenceId: "leper_knight_dialogue",
    locationIds: [],
  },
  charcoal_burner: {
    id: "charcoal_burner",
    portraitAssetId: null,
    name: "Charcoal Burner",
    role: "Forest kiln worker",
    description: "A solitary burner who reads the forest floor and smoke better than any map.",
    dialogue: [],
    rumors: [],
    dialogueSequenceId: "charcoal_burner_dialogue",
    locationIds: [],
  },
  pilgrim: {
    id: "pilgrim",
    portraitAssetId: null,
    name: "Pilgrim",
    role: "Traveler seeking the true fountain",
    description: "A weary pilgrim who named the wrong fountain out of desperate hope.",
    dialogue: [],
    rumors: [],
    dialogueSequenceId: "pilgrims_wrong_fountain_dialogue",
    locationIds: [],
  },
  forgotten_knight: {
    id: "forgotten_knight",
    portraitAssetId: null,
    name: "Forgotten Knight",
    role: "Nameless knight of the deep forest",
    description: "A knight who remembers the urge to leave but not the reason he stayed.",
    dialogue: [],
    rumors: [],
    dialogueSequenceId: "forgotten_knight_dialogue",
    locationIds: [],
  },
  woman_at_ford: {
    id: "woman_at_ford",
    portraitAssetId: null,
    name: "Woman at the Ford",
    role: "Watcher at the forest crossing",
    description: "A quiet woman who treats every crossing as a question rather than a place.",
    dialogue: [],
    rumors: [],
    dialogueSequenceId: "woman_at_ford_dialogue",
    locationIds: [],
  },
  unseen_voice: {
    id: "unseen_voice",
    portraitAssetId: null,
    name: "Familiar Voice",
    role: "Unseen presence beyond the campfire",
    description: "A voice from the dark that sounds familiar enough to make exhaustion feel uncertain.",
    dialogue: [],
    rumors: [],
    dialogueSequenceId: "familiar_voice_dialogue",
    locationIds: [],
  },
});

const SHOP_DEFINITIONS = Object.freeze({
  village_general_goods: {
    id: "village_general_goods",
    displayName: "General Goods",
    itemsForSale: {
      rope: { price: 6 },
      torch: { price: 3 },
      bandages: { price: 5, stock: 8 },
      dried_herbs: { price: 4 },
      old_foresters_map: { price: 25, stock: 1 },
    },
    provisionsForSale: { price: 1, stock: 70 },
    acceptedCategories: ["supply", "consumable", "gear", "valuable"],
    acceptedTags: ["mundane", "tool", "supplies", "valuable"],
    sellValues: {
      rope: 3,
      torch: 1,
      bandages: 2,
      dried_herbs: 2,
      old_coin: 5,
      silver_brooch: 6,
      amber_beads: 4,
      decorated_buckle: 5,
      merchants_ring: 10,
      carved_ivory_token: 9,
      bronze_figurine: 12,
      polished_agate: 7,
      embroidered_gloves: 8,
      silver_cup: 15,
      silver_reliquary: 15,
      gilded_brooch: 20,
      roman_signet: 25,
      jeweled_saints_locket: 30,
      coin_purse: 6,
      blackthorn_badge: 14,
      hunting_supplies: 3,
      fine_hunting_knife: 4,
    },
  },
  village_smithy: {
    id: "village_smithy",
    displayName: "Smithy Stock",
    itemsForSale: {
      fine_hunting_knife: {
        price: 10
      },
      knightly_longsword: {
        price: 48
      },
      reinforced_mail: {
        price: 60
      },
      knights_kite_shield: {
        price: 42
      }
    },
    acceptedCategories: ["weapon", "armor"],
    acceptedTags: ["steel", "martial", "tool"],
    sellValues: {
      arthur_sword: 9,
      quilted_hauberk: 12,
      fine_hunting_knife: 5,
      knightly_longsword: 24,
      reinforced_mail: 30
    }
  },
  village_apothecary_shop: {
    id: "village_apothecary_shop",
    displayName: "Apothecary Remedies",
    itemsForSale: {
      bandages: { price: 6, stock: 8 },
      antidote: { price: 9, stock: 5 },
      healing_poultice: { price: 12, stock: 4 },
      strong_tonic: { price: 22, stock: 2 },
    },
    acceptedCategories: ["consumable"],
    acceptedTags: ["medical", "herbal", "alchemical"],
    sellValues: {
      bandages: 2,
      antidote: 4,
      healing_poultice: 5,
      strong_tonic: 9,
    },
  },
  forest_village_provisions: {
    id: "forest_village_provisions",
    displayName: "Hidden Trail Supplies",
    itemsForSale: {
      rope: {
        price: 10,
        stock: 3
      },
      torch: {
        price: 5,
        stock: 3
      },
      bandages: {
        price: 8,
        stock: 3
      },
      dried_herbs: {
        price: 7,
        stock: 3
      },
      wild_berries: {
        price: 10,
        stock: 3
      },
      mushrooms: {
        price: 12,
        stock: 2
      },
      fresh_herbs: {
        price: 14,
        stock: 2
      },
      honey: {
        price: 28,
        stock: 1
      }
    },
    provisionsForSale: {
      price: 1,
      stock: 24
    },
    acceptedCategories: ["supply", "consumable", "ingredient", "gear", "valuable"],
    acceptedTags: ["mundane", "tool", "supplies", "food", "ingredient", "foraged", "sweet", "valuable"],
    sellValues: {
      rope: 4,
      torch: 2,
      bandages: 3,
      dried_herbs: 3,
      old_coin: 4,
      silver_brooch: 5,
      coin_purse: 5
    }
  },
  forest_village_apothecary: {
    id: "forest_village_apothecary",
    displayName: "Forest Remedies",
    itemsForSale: {
      bandages: { price: 10, stock: 3 },
      antidote: { price: 16, stock: 2 },
      healing_poultice: { price: 22, stock: 1 },
    },
    acceptedCategories: ["consumable"],
    acceptedTags: ["medical", "herbal", "alchemical"],
    sellValues: {
      bandages: 3,
      antidote: 6,
      healing_poultice: 8,
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
    visualAssetId: "location_the_inn_woodcut_2",
    scenePosition: "northwest",
    hotspot: {
      x: 0.46730775099534255,
      y: 0.2605769573113857
    },
    npcIds: ["village_innkeeper"],
    shopId: null,
    craftingProviderId: "campfire",
    actions: ["talk", "rumor"]
  },
  merchant: {
    id: "merchant",
    name: "Merchant",
    type: "shop",
    description: "A covered stall stocked with practical expedition supplies.",
    visualKey: "merchant_stall",
    visualAssetId: "location_merchant_woodcut_2",
    scenePosition: "northeast",
    hotspot: {
      x: 0.7865384908822867,
      y: 0.34006409767346507
    },
    npcIds: ["village_merchant"],
    shopId: "village_general_goods",
    actions: ["talk", "shop"]
  },
  blacksmith: {
    id: "blacksmith",
    name: "Blacksmith",
    type: "shop",
    description: "Firelight falls across a compact forge and racks of serviceable gear.",
    visualKey: "smithy_interior",
    visualAssetId: "location_blacksmith_bg",
    scenePosition: "southwest",
    hotspot: {
      x: 0.15384615384615385,
      y: 0.4990385740231245
    },
    npcIds: ["village_blacksmith"],
    shopId: "village_smithy",
    craftingProviderId: "blacksmith",
    actions: ["talk", "shop"]
  },
  apothecary: {
    id: "apothecary",
    name: "Apothecary",
    type: "shop",
    description: "Drying herbs hang above a workbench crowded with jars and small brass scales.",
    visualKey: "apothecary_interior",
    visualAssetId: "location_apothecary_woodcut",
    scenePosition: "southeast",
    hotspot: {
      x: 0.7999999706561749,
      y: 0.5464743834275466
    },
    npcIds: ["village_apothecary"],
    shopId: "village_apothecary_shop",
    craftingProviderId: "apothecary",
    actions: ["talk", "shop"]
  },
  hall: {
    id: "hall",
    name: "The Hall",
    type: "story",
    description: "The village's central hall, where news is weighed and the chapter's purpose is kept in view.",
    visualKey: "hall_interior",
    visualAssetId: "location_the_hall_woodcut_3",
    scenePosition: "center",
    hotspot: {
      x: 0.47884618318997896,
      y: 0.4349360099205604
    },
    npcIds: ["village_reeve"],
    shopId: null,
    actions: ["talk"],
    requiresIntro: false
  },
  hidden_inn: {
    id: "hidden_inn",
    name: "Hidden Hearth",
    type: "inn",
    description: "A small, expensive hearth where the forest village offers a guarded night's rest.",
    visualKey: "inn_interior",
    visualAssetId: "location_the_inn_woodcut_2",
    scenePosition: "northwest",
    hotspot: {
      x: 0.36538461538461536,
      y: 0.3118589841402494
    },
    npcIds: ["hidden_village_innkeeper"],
    shopId: null,
    craftingProviderId: "campfire",
    restConfig: {
      restoration: 8,
      goldCost: 8,
      recoveryDistanceReduction: 8
    },
    actions: ["talk", "rumor"],
    requiresIntro: false
  },
  hidden_merchant: {
    id: "hidden_merchant",
    name: "Trail Merchant",
    type: "shop",
    description: "A small stall with limited, costly supplies.",
    visualKey: "merchant_stall",
    visualAssetId: "location_merchant_woodcut_2",
    scenePosition: "northeast",
    hotspot: {
      x: 0.2519230475792518,
      y: 0.5990384419759115
    },
    npcIds: ["hidden_village_merchant"],
    shopId: "forest_village_provisions",
    actions: ["talk", "shop"],
    requiresIntro: false
  },
  hidden_apothecary: {
    id: "hidden_apothecary",
    name: "Druid's Shelves",
    type: "shop",
    description: "A placeholder apothecary where a druid keeps a few expensive remedies.",
    visualKey: "apothecary_interior",
    visualAssetId: "location_apothecary_woodcut",
    scenePosition: "southeast",
    hotspot: {
      x: 0.75,
      y: 0.6221154041779346
    },
    npcIds: ["hidden_village_druid"],
    shopId: "forest_village_apothecary",
    craftingProviderId: "apothecary",
    actions: ["talk", "shop"],
    requiresIntro: false
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
    musicTrackId: "camelot_twilight",
    visualKey: "broceliande_village",
    visualAssetId: "location_village_at_the_edge_of_broc_liande_woodcut_1",
    markerStyle: "tag",
    destinations: ["inn", "merchant", "blacksmith", "apothecary", "hall"],
    npcs: ["village_innkeeper", "village_merchant", "village_blacksmith", "village_apothecary", "village_reeve"],
    shops: ["village_general_goods", "village_smithy", "village_apothecary_shop"],
    availableExpeditions: ["old_forest_road", "fountain_of_barenton", "val_sans_retour", "search_for_merlin"],
    availableQuests: [],
    requirements: [],
    requiresIntro: true,
    serviceConfig: { provisionShopId: "village_general_goods", autoProvisionGrant: true },
  },
  hidden_forest_village: {
    id: "hidden_forest_village",
    name: "Hidden Forest Village",
    type: "village",
    description: "A concealed settlement beneath the deep canopy, offering only a few costly comforts.",
    chapterId: "chapter_03",
    regionId: "broceliande",
    visualKey: "hidden_forest_village",
    visualAssetId: "town_hidden_forest_village",
    markerStyle: "tag",
    destinations: ["hidden_inn", "hidden_merchant", "hidden_apothecary"],
    npcs: ["hidden_village_innkeeper", "hidden_village_merchant", "hidden_village_druid"],
    shops: ["forest_village_provisions", "forest_village_apothecary"],
    availableExpeditions: [],
    availableQuests: [],
    requirements: [],
    requiresIntro: false,
    serviceConfig: {
      autoProvisionGrant: false,
      restockProvisionShopId: null
    }
  },
});
