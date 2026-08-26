"use strict";

// Encounter content is data. The manager and UI do not contain encounter-specific branches.
const ENCOUNTER_DEFINITIONS = Object.freeze({
  hidden_forest_village: {
    id: "hidden_forest_village",
    title: "A Village Beneath the Boughs",
    description: "A narrow turnoff opens onto lanterns, low roofs, and a settlement that should not be here.",
    regionId: "broceliande",
    pathIds: ["old_forest_road"],
    expeditionIds: ["old_forest_road"],
    directions: ["outbound"],
    weight: 1,
    minimumDistance: 95,
    maximumDistance: 99,
    milestone: true,
    milestoneOrder: 95,
    ignoreEncounterSpacing: true,
    tags: ["campaign", "discovery", "location"],
    repeatable: false,
    requirements: [],
    stages: {
      start: {
        text: "The settlement is quiet but inhabited. A few doors open as Arthur approaches, and none of the villagers seem surprised to see him.",
        choices: [
          {
            id: "enter_village",
            label: "Enter the Village",
            outcomes: [
              { type: "setCampaignFlagOnSafeReturn", flag: "forest_village_discovered", value: true },
              { type: "setRunFlag", flag: "forest_village_visited", value: true },
              { type: "enterLocation", locationId: "hidden_forest_village" },
            ],
            resultText: "The company follows the lantern path into the hidden village.",
            endEncounter: true,
          },
          {
            id: "pass_village",
            label: "Mark the Turnoff and Continue",
            outcomes: [
              { type: "setCampaignFlagOnSafeReturn", flag: "forest_village_discovered", value: true },
            ],
            resultText: "Arthur marks the turnoff. The company keeps to the Main Road for now.",
            endEncounter: true,
          },
        ],
      },
    },
  },
  thornbound_crossing: {
    id: "thornbound_crossing",
    title: "The Thornbound Crossing",
    description: "A wall of living briars has grown across the road, its thorns arranged like warning fingers.",
    regionId: "broceliande",
    pathIds: ["old_forest_road"],
    expeditionIds: ["old_forest_road"],
    directions: ["outbound"],
    weight: 1,
    minimumDistance: 148,
    maximumDistance: 158,
    milestone: true,
    milestoneOrder: 150,
    ignoreEncounterSpacing: true,
    tags: ["verdant", "danger", "path"],
    repeatable: false,
    requirements: [],
    stages: {
      start: {
        text: "The briars flex across the road. Beyond them, the trees grow unnaturally quiet; something deeper in the forest is waiting for a prepared traveler.",
        choices: [
          {
            id: "read_the_thorns",
            label: "Read the Thorns with Woodcraft",
            requirements: [{ type: "knowledge", knowledgeId: "woodcraft", unavailable: "locked", lockedLabel: "Requires Woodcraft" }],
            outcomes: [
              { type: "modifyResource", resource: "provisions", amount: -1 },
              { type: "setRunFlag", flag: "thornbound_route_read", value: true },
            ],
            resultText: "Woodcraft reveals a seam in the briars. The company slips through with only a small loss of provisions and learns that the road beyond is not yet the altar.",
            endEncounter: true,
          },
          {
            id: "use_rope",
            label: "Anchor a Rope and Pull Through",
            requirements: [{ type: "availableExpeditionItem", itemId: "rope", unavailable: "locked", lockedLabel: "Requires Rope" }],
            costs: [{ type: "consumeExpeditionItem", itemId: "rope", quantity: 1 }],
            outcomes: [{ type: "modifyResource", resource: "provisions", amount: -2 }],
            resultText: "The rope gives the company a line through the briars, but the effort costs time and provisions.",
            endEncounter: true,
          },
          {
            id: "force_through",
            label: "Force a Way Through",
            outcomes: [{
              type: "startCombat",
              combatId: "briar_knight",
              victory: {
                resultText: "The briar guardian breaks apart. The safest route onward is earned, not given.",
                outcomes: [{ type: "gainUnsecuredItem", itemId: "antler_fragment", quantity: 1 }],
              },
              defeat: { resultText: "The briars drive the company back." },
              fled: { resultText: "The company retreats from the living thorns." },
            }],
            resultText: "The briars knot themselves into the shape of a knight.",
            endEncounter: true,
          },
          {
            id: "wait_for_opening",
            label: "Wait for the Briars to Part",
            outcomes: [{ type: "modifyResource", resource: "health", amount: -2 }, { type: "modifyResource", resource: "provisions", amount: -2 }],
            resultText: "The company waits until the briars loosen, but the cold thorns find every gap in their protection.",
            endEncounter: true,
          },
        ],
      },
    },
  },
  verdant_altar: {
    id: "verdant_altar",
    title: "The Verdant Altar",
    description: "At the oldest reach of the Main Road, a living altar rises from the roots.",
    regionId: "broceliande",
    pathIds: ["old_forest_road"],
    expeditionIds: ["old_forest_road"],
    directions: ["outbound"],
    weight: 1,
    minimumDistance: 180,
    maximumDistance: 188,
    milestone: true,
    milestoneOrder: 180,
    ignoreEncounterSpacing: true,
    tags: ["campaign", "verdant", "boss"],
    repeatable: false,
    requirements: [{ type: "notCampaignFlag", flag: "verdant_warden_defeated" }],
    stages: {
      start: {
        text: "The roots open around an altar of green crystal. Something ancient stirs below it, listening for the Song.",
        choices: [
          {
            id: "sing_at_altar",
            label: "Sing the Song and Place the Heart",
            requirements: [
              {
                type: "availableExpeditionItem",
                itemId: "enchanted_verdant_heart",
                unavailable: "locked",
                lockedLabel: "Requires the Enchanted Verdant Heart",
              },
              {
                type: "knowledge",
                knowledgeId: "song_of_the_forest",
                unavailable: "locked",
                lockedLabel: "Requires the Song of the Forest",
              },
            ],
            outcomes: [
              {
                type: "startCombat",
                combatId: "verdant_warden",
                victory: {
                  resultText: "The Verdant Warden falls, leaving the first reliable vessel for Merlin's water.",
                  outcomes: [
                    { type: "gainUniqueUnsecuredItem", itemId: "flask" },
                    { type: "setCampaignFlagOnSafeReturn", flag: "verdant_warden_defeated", value: true },
                  ],
                },
                defeat: { resultText: "The Verdant Warden drives the company from the altar." },
                fled: { resultText: "The company flees the altar. The Verdant Warden remains undefeated." },
              },
            ],
            resultText: "The Enchanted Verdant Heart answers the Song. The Verdant Warden rises.",
            endEncounter: true,
          },
          {
            id: "inspect_altar",
            label: "Listen to the Roots",
            outcomes: [{ type: "setRunFlag", flag: "altar_requirements_revealed", value: true }],
            resultText: "The altar does not awaken. Its roots seem to wait for an awakened Verdant Heart and the remembered Song; Arthur can return when both are ready.",
            endEncounter: true,
          },
          {
            id: "leave_altar",
            label: "Leave the Altar",
            resultText: "Arthur leaves the altar sleeping beneath the roots.",
            endEncounter: true,
          },
        ],
      },
    },
  },
  green_chapel_beyond: {
    id: "green_chapel_beyond",
    title: "The Chapel Beyond the Green",
    description: "Past the altar's reach, a roofless chapel stands inside a ring of roots that have never known an axe.",
    regionId: "broceliande",
    pathIds: ["old_forest_road"],
    expeditionIds: ["old_forest_road"],
    directions: ["outbound"],
    weight: 0.35,
    minimumDistance: 200,
    maximumDistance: 222,
    tags: ["rare", "optional", "verdant", "discovery"],
    repeatable: false,
    requirements: [{ type: "notOwnsItem", itemId: "thornward_charm" }],
    stages: {
      start: {
        text: "The chapel's stone floor is carpeted in moss. At its center, a thorn-shaped charm rests beneath a beam of green light.",
        choices: [
          {
            id: "take_thornward_charm",
            label: "Take the Thornward Charm",
            outcomes: [{ type: "gainUniqueUnsecuredItem", itemId: "thornward_charm" }],
            resultText: "The charm is cold at first, then warms as if it recognizes a traveler who has survived the deep road.",
            endEncounter: true,
          },
          {
            id: "leave_chapel",
            label: "Leave the Chapel Undisturbed",
            resultText: "Arthur leaves the rare sanctuary intact and turns back toward the altar.",
            endEncounter: true,
          },
        ],
      },
    },
  },
  rootbound_archive: {
    id: "rootbound_archive",
    title: "The Rootbound Archive",
    description: "A sealed stone door appears where no map marks a building, its lintel carved with a warning about the Warden.",
    regionId: "broceliande",
    pathIds: ["old_forest_road"],
    expeditionIds: ["old_forest_road"],
    directions: ["outbound"],
    weight: 0.2,
    minimumDistance: 214,
    maximumDistance: 232,
    tags: ["rare", "optional", "lore"],
    repeatable: false,
    requirements: [],
    stages: {
      start: {
        text: "The roots part just enough to reveal a stone archive. Its final inscription reads: ‘The Song opens the way; the Heart bears the cost.’",
        choices: [
          {
            id: "copy_inscription",
            label: "Copy the Inscription",
            outcomes: [{ type: "setRunFlag", flag: "rootbound_inscription_copied", value: true }],
            resultText: "Arthur records the warning. The Song and the awakened Heart are not separate keys but one promise.",
            endEncounter: true,
          },
          {
            id: "leave_archive",
            label: "Leave the Archive",
            resultText: "The roots close over the door as the company turns back.",
            endEncounter: true,
          },
        ],
      },
    },
  },
  abandoned_camp: {
    id: "abandoned_camp",
    title: "Abandoned Camp",
    description: "A recently abandoned camp sits in a clearing beside the road.",
    regionId: "broceliande",
    pathIds: ["old_forest_road", "overgrown_trail"],
    directions: ["outbound", "returning"],
    weight: 4,
    minimumDistance: 5,
    maximumDistance: 60,
    tags: ["discovery", "camp", "loot"],
    repeatable: false,
    requirements: [],
    stages: {
      start: {
        text: "The fire is cold, but whoever camped here departed in haste and left useful things behind.",
        choices: [
          {
            id: "search_camp",
            label: "Search the Camp",
            outcomes: [
              {
                type: "gainWeightedRandomUnsecuredItem",
                items: [
                  {
                    itemId: "old_coin",
                    weight: 5
                  },
                  {
                    itemId: "bandages",
                    weight: 5
                  },
                  {
                    itemId: "dried_herbs",
                    weight: 5
                  },
                  {
                    itemId: "hunting_supplies",
                    weight: 4
                  },
                  {
                    itemId: "rope",
                    weight: 3
                  },
                  {
                    itemId: "silver_brooch",
                    weight: 3
                  },
                  {
                    itemId: "amber_beads",
                    weight: 3
                  },
                  {
                    itemId: "decorated_buckle",
                    weight: 4
                  },
                  {
                    itemId: "coin_purse",
                    weight: 2
                  }
                ],
                quantity: 1,
                resultText: "Among the abandoned camp's scattered belongings, Arthur finds {itemName}."
              },
              {
                type: "rollLootTable",
                tableId: "forest_encounter_forage",
                rolls: 1
              },
              {
                type: "randomChance",
                chance: 0.18,
                effects: [{ type: "gainUnsecuredItem", itemId: "honey", quantity: 1 }]
              }
            ],
            resultText: "The search turns up a small cache worth carrying home. Everything remains unsecured until a safe return.",
            pendingAction: {
              text: "Arthur searches the abandoned bedrolls, packs, and cold fire ring...",
              delayProfile: "search"
            },
            endEncounter: true
          },
          {
            id: "take_provisions",
            label: "Take the Remaining Provisions",
            outcomes: [
              {
                type: "modifyResource",
                resource: "provisions",
                amount: 4
              }
            ],
            resultText: "Kay gathers the remaining food and adds it to the company's provisions.",
            endEncounter: true
          },
          {
            id: "leave",
            label: "Leave It Alone",
            resultText: "Arthur leaves the silent camp undisturbed.",
            endEncounter: true
          }
        ]
      }
    },
    visualAssetId: "encounter_abandoned_camp",
    encounterLayout: {
      arthur: {
        x: 0.203125,
        y: 0.7573784722222222
      },
      companion1: {
        x: 0.6484375,
        y: 0.8441840277777778,
        facing: "left"
      },
      companion2: {
        x: 0.412109375,
        y: 0.6393229166666666,
        scale: 0.75
      }
    }
  },
  fork_in_the_road: {
    id: "fork_in_the_road",
    title: "Fork in the Road",
    description: "The forest road divides beneath a dense canopy.",
    regionId: "broceliande",
    pathIds: ["old_forest_road"],
    directions: ["outbound"],
    weight: 5,
    minimumDistance: 20,
    maximumDistance: 24,
    milestone: true,
    milestoneOrder: 20,
    ignoreEncounterSpacing: true,
    tags: ["path", "choice"],
    repeatable: false,
    requirements: [{ type: "availableExpeditionItem", itemId: "old_foresters_map" }],
    stages: {
      start: {
        text: "The main road continues ahead. A narrow, overgrown trail disappears between the older trees.",
        choices: [
          {
            id: "main_road",
            label: "Stay on the Main Road",
            outcomes: [
              {
                type: "randomChance",
                chance: 0.15,
                effects: [
                  {
                    type: "gainUnsecuredItem",
                    itemId: "dried_herbs",
                    quantity: 1
                  }
                ],
                resultText: "Along the clear verge, Arthur finds a small bundle of dried herbs dropped by an earlier traveler."
              }
            ],
            resultText: "Arthur keeps the company on the clearer road.",
            endEncounter: true
          },
          {
            id: "overgrown_trail",
            label: "Take the Overgrown Trail",
            requirements: [
              { type: "availableExpeditionItem", itemId: "old_foresters_map" },
            ],
            outcomes: [
              {
                type: "changePath",
                pathId: "overgrown_trail"
              }
            ],
            resultText: "The company turns onto the overgrown trail.",
            endEncounter: true
          }
        ]
      }
    }
  },
  ancient_standing_stone: {
    id: "ancient_standing_stone",
    title: "Ancient Standing Stone",
    description: "An old standing stone rises from a ring of roots beside the trail.",
    regionId: "broceliande",
    pathIds: ["overgrown_trail"],
    directions: ["outbound"],
    weight: 6,
    minimumDistance: 9,
    maximumDistance: 70,
    tags: ["mystery", "standing_stone", "secret"],
    repeatable: false,
    requirements: [],
    stages: {
      start: {
        text: "Its surface is covered in unfamiliar markings worn smooth by rain and time.",
        choices: [
          {
            id: "examine",
            label: "Examine the Markings",
            resultText: "Arthur studies the markings, but their meaning remains unknown.",
            endEncounter: true
          },
          {
            id: "use_medallion",
            label: "Use Silver Stag Medallion",
            requirements: [
              {
                type: "equippedItem",
                itemId: "silver_stag_medallion",
                unavailable: "hidden"
              }
            ],
            outcomes: [
              {
                type: "gainUniqueUnsecuredItem",
                itemId: "white_stag_shard",
                resultText: "A pale shard remains where the stag stood, bright as polished antler."
              },
              {
                type: "setRunFlag",
                flag: "stagStoneDiscovered",
                value: true
              }
            ],
            resultText: "The Silver Stag Medallion responds to the stone. Whatever this signifies remains unclear.",
            endEncounter: true
          },
          {
            id: "leave",
            label: "Leave",
            resultText: "Arthur leaves the old stone and its mystery behind.",
            endEncounter: true
          }
        ]
      }
    }
  },
  wild_boar: {
    id: "wild_boar",
    title: "Wild Boar",
    description: "A wild boar blocks the path and becomes aggressive.",
    regionId: "broceliande",
    pathIds: ["old_forest_road", "overgrown_trail"],
    directions: ["outbound", "returning"],
    weight: 5,
    minimumDistance: 4,
    tags: ["animal", "danger"],
    repeatable: false,
    requirements: [],
    stages: {
      start: {
        text: "The animal lowers its head and paws at the earth. There is no time for a prolonged fight.",
        choices: [
          {
            id: "fight",
            label: "Fight",
            outcomes: [
              {
                type: "startCombat",
                combatId: "wild_boar",
                victory: {
                  outcomes: [
                    {
                      type: "gainUnsecuredItem",
                      itemId: "raw_meat",
                      quantity: 2
                    }
                  ],
                  resultText: "The boar falls. Arthur recovers the meat before the company continues."
                },
                fled: {
                  outcomes: [],
                  resultText: "The company escapes into the trees, leaving the boar and its meat behind."
                }
              }
            ]
          },
          {
            id: "drive_away",
            label: "Drive It Away",
            outcomes: [
              {
                type: "randomChance",
                chance: 0.15,
                effects: [
                  {
                    type: "modifyResource",
                    resource: "health",
                    amount: -1
                  }
                ],
                resultText: "The boar lashes out before retreating, catching Arthur as it charges into the brush.",
                elseResultText: "Arthur and Kay make enough noise to drive the animal safely into the brush."
              }
            ],
            endEncounter: true
          },
          {
            id: "guide_boar_aside",
            label: "Guide It Aside with Woodcraft",
            requirements: [{ type: "knowledge", knowledgeId: "woodcraft", unavailable: "locked", lockedLabel: "Requires Woodcraft" }],
            outcomes: [{ type: "setRunFlag", flag: "boar_route_read", value: true }],
            resultText: "Arthur reads the boar's footing and gives it an easy escape route. It slips into the brush without a fight or wasted provisions.",
            endEncounter: true,
          },
          {
            id: "avoid",
            label: "Avoid It",
            costs: [
              {
                type: "modifyResource",
                resource: "provisions",
                amount: -2
              }
            ],
            resultText: "The detour costs supplies, but the company avoids the animal.",
            endEncounter: true
          }
        ]
      }
    }
  },
  fading_light: {
    id: "fading_light",
    title: "Fading Light",
    description: "The forest grows darker as Arthur and Kay make their way back toward safety. The road ahead is becoming difficult to follow.",
    regionId: "broceliande",
    pathIds: ["old_forest_road", "overgrown_trail", "fountain_of_barenton", "val_sans_retour"],
    directions: ["returning"],
    weight: 6,
    minimumDistance: 2,
    tags: ["return", "survival", "darkness"],
    repeatable: false,
    requirements: [],
    stages: {
      start: {
        text: "The last daylight fades beneath the canopy, making the road difficult to follow.",
        choices: [
          {
            id: "light_torch",
            label: "Light a Torch",
            requirements: [
              {
                type: "carriedItem",
                itemId: "torch",
                unavailable: "locked",
                lockedLabel: "Requires 1 Torch"
              }
            ],
            costs: [
              {
                type: "consumeExpeditionItem",
                itemId: "torch",
                quantity: 1
              }
            ],
            resultText: "By torchlight, Arthur and Kay continue safely along the road.",
            endEncounter: true
          },
          {
            id: "read_weather",
            label: "Read the Weather with Woodcraft",
            requirements: [{ type: "knowledge", knowledgeId: "woodcraft", unavailable: "locked", lockedLabel: "Requires Woodcraft" }],
            outcomes: [{ type: "setRunFlag", flag: "storm_read", value: true }],
            resultText: "Woodcraft finds a dry shelf beneath the roots before the worst rain arrives. The company waits out the dangerous gusts without losing ground or health.",
            endEncounter: true,
          },
          {
            id: "press_on",
            label: "Press On",
            outcomes: [
              {
                type: "randomChance",
                chance: 0.4,
                effects: [
                  {
                    type: "randomOne",
                    options: [
                      {
                        resultText: "In the darkness, the company wanders off the road and wastes supplies finding it again.",
                        effects: [
                          {
                            type: "modifyResource",
                            resource: "provisions",
                            amount: -1
                          }
                        ]
                      },
                      {
                        resultText: "Arthur stumbles over a hidden root in the darkness and regains the road injured.",
                        effects: [
                          {
                            type: "modifyResource",
                            resource: "health",
                            amount: -1
                          }
                        ]
                      }
                    ]
                  }
                ],
                elseResultText: "Arthur and Kay keep the fading road in sight and continue without mishap."
              }
            ],
            endEncounter: true
          },
          {
            id: "slow_down",
            label: "Slow Down and Find the Trail",
            costs: [
              {
                type: "modifyResource",
                resource: "provisions",
                amount: -2
              }
            ],
            resultText: "The careful search costs time and provisions, but the company finds the road and continues safely.",
            pendingAction: {
              text: "Arthur slows the company and studies the ground for the safest line of the trail...",
              delayProfile: "search"
            },
            endEncounter: true
          }
        ]
      }
    }
  },
  woodland_stream: {
    id: "woodland_stream",
    title: "Woodland Stream",
    description: "A cold woodland stream cuts across the path. Recent rain has swollen the water beyond its banks.",
    regionId: "broceliande",
    pathIds: ["old_forest_road", "overgrown_trail", "fountain_of_barenton", "val_sans_retour"],
    directions: ["outbound", "returning"],
    weight: 5,
    minimumDistance: 4,
    tags: ["water", "obstacle", "survival"],
    repeatable: true,
    maxOccurrencesPerRun: 2,
    requirements: [],
    stages: {
      start: {
        text: "The current is swift enough to make a careless crossing dangerous.",
        choices: [
          {
            id: "wade_across",
            label: "Wade Across",
            outcomes: [
              {
                type: "randomChance",
                chance: 0.25,
                effects: [
                  {
                    type: "modifyResource",
                    resource: "health",
                    amount: -1
                  },
                  {
                    type: "applyInjury",
                    target: "arthur",
                    injuryId: "bruised_ribs",
                    source: "swollen-stream"
                  }
                ],
                resultText: "The current knocks Arthur against a submerged stone before the company reaches the far bank.",
                elseResultText: "Arthur and Kay keep their footing and wade safely through the cold current."
              }
            ],
            pendingAction: {
              text: "Arthur steps into the swollen stream and tests each foothold against the current...",
              delayProfile: "physical"
            },
            endEncounter: true
          },
          {
            id: "use_rope",
            label: "Use the Rope",
            requirements: [
              {
                type: "carriedItem",
                itemId: "rope",
                unavailable: "locked",
                lockedLabel: "Requires Rope"
              }
            ],
            outcomes: [
              {
                type: "randomChance",
                chance: 0.15,
                effects: [
                  {
                    type: "gainUnsecuredItem",
                    itemId: "hunting_supplies",
                    quantity: 1
                  }
                ],
                resultText: "The secured rope lets Arthur retrieve a small set of hooks and twine snagged beside the bank.",
                secondaryOutcome: {
                  chance: 0.16,
                  effects: [
                    {
                      type: "consumeExpeditionItem",
                      itemId: "rope",
                      quantity: 1
                    }
                  ],
                  resultText: "The current pulls the rope from its anchor and carries it downstream after the crossing.",
                  elseResultText: "The rope comes free of the bank, ready to be used again."
                }
              }
            ],
            resultText: "With a rope secured across the stream, the company crosses safely.",
            pendingAction: {
              text: "Arthur secures the rope across the stream before the company begins crossing...",
              delayProfile: "physical"
            },
            endEncounter: true
          },
          {
            id: "read_current",
            label: "Read the Current with Woodcraft",
            requirements: [{ type: "knowledge", knowledgeId: "woodcraft", unavailable: "locked", lockedLabel: "Requires Woodcraft" }],
            outcomes: [{ type: "setRunFlag", flag: "stream_crossing_read", value: true }],
            resultText: "Woodcraft finds a shallow crossing upstream. The company reaches the far bank without spending supplies or risking the current.",
            endEncounter: true,
          },
          {
            id: "better_crossing",
            label: "Search for a Better Crossing",
            costs: [
              {
                type: "modifyResource",
                resource: "provisions",
                amount: -2
              }
            ],
            resultText: "The search costs time and provisions, but reveals a safer crossing.",
            pendingAction: {
              text: "Arthur follows the bank in search of calmer water and firmer footing...",
              delayProfile: "search"
            },
            endEncounter: true
          }
        ]
      }
    },
    visualAssetId: "encounter_woodland_stream",
    encounterLayout: {
      arthur: {
        x: 0.43359375,
        y: 0.6809895833333334,
        facing: "right",
        scale: 0.75
      },
      companion2: {
        x: 0.271484375,
        y: 1,
        facing: "right"
      },
      companion1: {
        x: 0.65625,
        y: 0.9587673611111112,
        facing: "right"
      }
    }
  },
  woodland_foraging: {
    id: "woodland_foraging",
    title: "Woodland Foraging",
    description: "Kay spots signs that edible plants may be growing nearby.",
    regionId: "broceliande",
    pathIds: ["old_forest_road", "overgrown_trail", "fountain_of_barenton", "val_sans_retour"],
    directions: ["outbound", "returning"],
    weight: 5,
    minimumDistance: 5,
    tags: ["foraging", "knowledge", "provisions"],
    repeatable: false,
    requirements: [],
    stages: {
      start: {
        text: "A careful search might replenish the company's supplies.",
        choices: [
          {
            id: "search_with_woodcraft",
            label: "Search the Area",
            requirements: [
              {
                type: "knowledge",
                knowledgeId: "woodcraft",
                unavailable: "locked",
                lockedLabel: "Requires Woodcraft"
              }
            ],
            outcomes: [
              {
                type: "modifyResource",
                resource: "provisions",
                amount: 5
              },
              {
                type: "randomOne",
                options: [
                  {
                    effects: [
                      { type: "gainUnsecuredItem", itemId: "mushrooms", quantity: 1 },
                      { type: "gainUnsecuredItem", itemId: "fresh_herbs", quantity: 1 }
                    ]
                  },
                  {
                    effects: [
                      { type: "gainUnsecuredItem", itemId: "wild_berries", quantity: 2 },
                      { type: "gainUnsecuredItem", itemId: "fresh_herbs", quantity: 1 }
                    ]
                  }
                ]
              },
              {
                type: "randomChance",
                chance: 0.15,
                effects: [{ type: "gainUnsecuredItem", itemId: "honey", quantity: 1 }]
              },
              {
                type: "randomChance",
                chance: 0.08,
                effects: [{ type: "gainUnsecuredItem", itemId: "rare_herbs", quantity: 1 }]
              }
            ],
            resultText: "Arthur recognizes the useful plants and gathers a worthwhile supply.",
            pendingAction: {
              text: "Arthur searches the undergrowth for plants he recognizes as safe...",
              delayProfile: "search"
            },
            endEncounter: true
          },
          {
            id: "gather_safe",
            label: "Gather What Looks Safe",
            outcomes: [
              {
                type: "modifyResource",
                resource: "provisions",
                amount: 2
              },
              {
                type: "randomChance",
                chance: 0.2,
                effects: [
                  {
                    type: "modifyResource",
                    resource: "health",
                    amount: -1
                  }
                ],
                resultText: "Arthur gathers a small supply, but one of the plants leaves him sick and weakened.",
                elseResultText: "Arthur gathers a small supply of edible plants without ill effect."
              },
              {
                type: "randomChance",
                chance: 0.2,
                effects: [
                  {
                    type: "gainUnsecuredItem",
                    itemId: "dried_herbs",
                    quantity: 1
                  }
                ]
              },
              {
                type: "randomChance",
                chance: 0.35,
                effects: [{
                  type: "randomOne",
                  options: [
                    { effects: [{ type: "gainUnsecuredItem", itemId: "wild_berries", quantity: 1 }] },
                    { effects: [{ type: "gainUnsecuredItem", itemId: "mushrooms", quantity: 1 }] },
                    { effects: [{ type: "gainUnsecuredItem", itemId: "fresh_herbs", quantity: 1 }] }
                  ]
                }]
              }
            ],
            pendingAction: {
              text: "Arthur compares leaves and roots, gathering only what appears safe..."
            },
            endEncounter: true
          },
          {
            id: "keep_moving",
            label: "Keep Moving",
            resultText: "Arthur decides not to spend time searching the undergrowth.",
            endEncounter: true
          }
        ]
      }
    }
  },
  abandoned_cart: {
    id: "abandoned_cart",
    title: "Abandoned Cart",
    description: "An overturned merchant's cart lies beside the road. One wheel is shattered. There is no sign of its owner.",
    regionId: "broceliande",
    pathIds: ["old_forest_road"],
    directions: ["outbound"],
    weight: 4,
    minimumDistance: 8,
    maximumDistance: 75,
    tags: ["road", "exploration", "loot"],
    repeatable: false,
    requirements: [],
    stages: {
      start: {
        text: "The cart may still hold something useful, while broken branches lead into the woods nearby.",
        choices: [
          {
            id: "search_cart",
            label: "Search the Cart",
            outcomes: [
              {
                type: "gainWeightedRandomUnsecuredItem",
                items: [
                  {
                    itemId: "bandages",
                    weight: 5
                  },
                  {
                    itemId: "dried_herbs",
                    weight: 5
                  },
                  {
                    itemId: "decorated_buckle",
                    weight: 5
                  },
                  {
                    itemId: "silver_brooch",
                    weight: 3
                  },
                  {
                    itemId: "coin_purse",
                    weight: 3
                  },
                  {
                    itemId: "embroidered_gloves",
                    weight: 2
                  },
                  {
                    itemId: "merchants_ring",
                    weight: 2
                  },
                  {
                    itemId: "silver_cup",
                    weight: 1
                  },
                  {
                    itemId: "gilded_brooch",
                    weight: 0.6
                  }
                ],
                quantity: 1,
                resultText: "Beneath the overturned cart, Arthur finds {itemName} among the scattered cargo."
              }
            ],
            pendingAction: {
              text: "Arthur searches beneath the cart and through its scattered cargo...",
              delayProfile: "search"
            },
            endEncounter: true
          },
          {
            id: "search_for_owner",
            label: "Search the Woods for the Owner",
            pendingAction: {
              text: "Arthur and Kay search the nearby woods for tracks or signs of passage...",
              delayProfile: "search"
            },
            branches: [
              {
                weight: 70,
                resultText: "Broken branches and disturbed leaves lead away from the road.",
                nextStage: "vanishing_trail"
              },
              {
                weight: 30,
                resultText: "Arthur and Kay search the nearby woods, but find no tracks clear enough to follow.",
                endEncounter: true
              }
            ]
          },
          {
            id: "leave",
            label: "Leave It Alone",
            resultText: "Arthur leaves the abandoned cart behind.",
            endEncounter: true
          }
        ]
      },
      vanishing_trail: {
        text: "Broken branches lead away from the road, but the trail disappears among the trees.",
        choices: [
          {
            id: "follow_trail",
            label: "Follow the Trail",
            costs: [
              {
                type: "modifyResource",
                resource: "provisions",
                amount: -2
              }
            ],
            outcomes: [
              {
                type: "randomChance",
                chance: 0.4,
                effects: [
                  {
                    type: "gainUnsecuredItem",
                    itemId: "fine_hunting_knife",
                    quantity: 1
                  }
                ],
                resultText: "Beyond the last broken branch, Arthur finds a fine hunting knife half-hidden in the leaves.",
                elseResultText: "The broken branches grow sparse, and the trail fades completely among the trees."
              }
            ],
            pendingAction: {
              text: "Arthur follows the broken branches deeper into the woods..."
            },
            endEncounter: true
          },
          {
            id: "return_to_road",
            label: "Return to the Road",
            resultText: "With the trail gone, Arthur and Kay return to the road.",
            endEncounter: true
          }
        ]
      }
    },
    visualAssetId: "encounter_abandoned_cart",
    encounterLayout: {
      arthur: {
        x: 0.595703125,
        y: 0.7747395833333334,
        facing: "left"
      },
      companion1: {
        x: 0.873046875,
        y: 0.9552951388888888,
        facing: "left"
      },
      companion2: {
        x: 0.193359375,
        y: 0.9934895833333334
      }
    }
  },
  thorn_crowned_hart: {
    id: "thorn_crowned_hart",
    title: "The Thorn-Crowned Hart",
    description: "A massive stag blocks the Main Road, its antlers overgrown with black thorns and green fire.",
    regionId: "broceliande",
    pathIds: ["old_forest_road"],
    expeditionIds: ["old_forest_road"],
    directions: ["outbound"],
    weight: 1,
    minimumDistance: 132,
    maximumDistance: 146,
    milestone: true,
    milestoneOrder: 140,
    ignoreEncounterSpacing: true,
    tags: ["campaign", "verdant", "stag", "boss"],
    repeatable: false,
    requirements: [{ type: "notCampaignFlag", flag: "hostile_stag_defeated" }],
    stages: {
      start: {
        text: "The stag scrapes one hoof across the road. It is not an omen to be observed from a distance; it is a guardian demanding an answer.",
        choices: [
          {
            id: "stand_against_stag",
            label: "Stand Against the Thorn-Crowned Hart",
            outcomes: [{
              type: "startCombat",
              combatId: "thorn_crowned_hart",
              victory: {
                resultText: "The Thorn-Crowned Hart falls. Beneath the thorns, a second Verdant shard pulses with hard-won strength.",
                outcomes: [
                  { type: "gainUniqueUnsecuredItem", itemId: "verdant_shard_wrath" },
                  { type: "setCampaignFlagOnSafeReturn", flag: "hostile_stag_defeated", value: true },
                ],
              },
              defeat: { resultText: "The thorn-crowned guardian drives the company from the Main Road." },
              fled: { resultText: "The company escapes, but the Thorn-Crowned Hart remains on the road." },
            }],
            resultText: "The stag lowers its crown of thorns and charges.",
            endEncounter: true,
          },
          {
            id: "withdraw_from_stag",
            label: "Give Ground and Continue Later",
            resultText: "Arthur yields the road for now. The guardian remains, waiting for a stronger challenge.",
            endEncounter: true,
          },
        ],
      },
    },
  },
  white_hart: {
    id: "white_hart",
    title: "The White Hart",
    description: "A white stag stands motionless between the trees ahead. It watches Arthur with the patience of an old guardian.",
    regionId: "broceliande",
    pathIds: ["overgrown_trail"],
    directions: ["outbound", "returning"],
    weight: 2,
    minimumDistance: 50,
    maximumDistance: 80,
    tags: ["mystery", "stag", "exploration"],
    repeatable: true,
    maxOccurrencesPerRun: 1,
    requirements: [{ type: "notCampaignFlag", flag: "white_hart_shard_secured" }],
    stages: {
      start: {
        text: "The hart waits in silence while the forest seems to hold its breath. Its gaze is wary, but not hostile.",
        choices: [
          {
            id: "wait_beside",
            label: "Wait Beside the Trail",
            nextStage: "hart_breath",
            resultText: "Arthur lowers his hand and waits. The hart's breathing becomes slow enough to hear.",
          },
          {
            id: "show_medallion",
            label: "Show the Silver Stag Medallion",
            requirements: [{ type: "equippedItem", itemId: "silver_stag_medallion", unavailable: "locked", lockedLabel: "Requires the Silver Stag Medallion" }],
            nextStage: "hart_breath",
            resultText: "The medallion catches the hart's eye. Arthur keeps it lowered and lets the animal decide the distance.",
          },
          {
            id: "follow_hart",
            label: "Follow Before It Trusts You",
            nextStage: "hart_flees",
            resultText: "Arthur follows too quickly. The hart springs away through the undergrowth.",
          },
          {
            id: "hunt_hart",
            label: "Hunt the Hart",
            nextStage: "hart_flees",
            resultText: "Arthur reaches for the bow before the omen can move. The hart vanishes.",
            endEncounter: true,
          },
        ]
      },
      hart_breath: {
        text: "The hart's ears relax by a fraction. One careless movement will still send it fleeing.",
        choices: [
          {
            id: "lower_gaze",
            label: "Lower Your Gaze",
            nextStage: "hart_close",
            resultText: "Arthur looks to the ground. The hart takes one careful step closer.",
          },
          {
            id: "call_softly",
            label: "Call Softly with Woodcraft",
            requirements: [{ type: "knowledge", knowledgeId: "woodcraft", unavailable: "locked", lockedLabel: "Requires Woodcraft" }],
            nextStage: "hart_close",
            resultText: "Arthur matches the forest's quiet rhythm. The hart answers with a soft breath and comes closer.",
          },
          {
            id: "step_forward",
            label: "Step Toward It",
            nextStage: "hart_flees",
            resultText: "Arthur steps forward. The hart wheels away before trust can form.",
          },
        ],
      },
      hart_close: {
        text: "The hart stands within reach. A pale green shard rests in the moss beneath its chest.",
        choices: [
          {
            id: "open_hand",
            label: "Open Your Hand to the Shard",
            outcomes: [
              { type: "gainUniqueUnsecuredItem", itemId: "verdant_shard_grace" },
              { type: "setCampaignFlagOnSafeReturn", flag: "white_hart_shard_secured", value: true },
            ],
            resultText: "The hart allows Arthur to take the shard. Its light settles into his palm, and the guardian disappears without fear.",
            endEncounter: true,
          },
          {
            id: "touch_hart",
            label: "Reach for the Hart",
            nextStage: "hart_flees",
            resultText: "Arthur reaches toward the animal. The hart bounds away, leaving the shard behind in the moss.",
          },
        ],
      },
      hart_flees: {
        resultStage: true,
        text: "The White Hart is gone. The forest has not closed the path forever, but this meeting is over.",
        outcomes: []
      }
    }
  },
  whispering_oak: {
    id: "whispering_oak",
    title: "Whispering Oak",
    description: "An enormous oak stands apart from the surrounding forest. As Arthur passes beneath its branches, he hears something that sounds almost like a voice.",
    regionId: "broceliande",
    pathIds: ["overgrown_trail"],
    directions: ["outbound"],
    weight: 3,
    minimumDistance: 15,
    maximumDistance: 90,
    tags: ["atmosphere", "mystery", "discovery"],
    repeatable: false,
    requirements: [],
    stages: {
      start: {
        text: "Leaves stir overhead though the surrounding air is still.",
        choices: [
          {
            id: "listen",
            label: "Listen",
            outcomes: [
              {
                type: "setRunFlag",
                flag: "heardWhisperingOak",
                value: true
              }
            ],
            resultText: "The sound seems to form words, but Arthur cannot understand them.",
            endEncounter: true
          },
          {
            id: "examine_tree",
            label: "Examine the Tree",
            outcomes: [
              {
                type: "randomChance",
                chance: 0.45,
                effects: [
                  {
                    type: "gainWeightedRandomUnsecuredItem",
                    items: [
                      {
                        itemId: "dried_herbs",
                        weight: 6
                      },
                      {
                        itemId: "polished_agate",
                        weight: 4
                      },
                      {
                        itemId: "amber_beads",
                        weight: 3
                      },
                      {
                        itemId: "strange_seeds",
                        weight: 1
                      }
                    ],
                    quantity: 1,
                    resultText: "Among the oak's roots, Arthur finds {itemName}."
                  }
                ],
                resultText: "Among the oak's roots, Arthur finds useful growth worth carrying home.",
                elseResultText: "Arthur examines the roots, bark, and fallen leaves, but finds nothing useful."
              }
            ],
            pendingAction: {
              text: "Arthur examines the ancient bark and searches among the oak's roots..."
            },
            endEncounter: true
          },
          {
            id: "mark_bark",
            label: "Cut a Mark into the Bark",
            resultText: "Kay stops Arthur's hand. ‘Perhaps don't insult the strange tree.’",
            endEncounter: true
          }
        ]
      }
    }
  },
  road_behind_you: {
    id: "road_behind_you",
    title: "The Road Behind You",
    description: "Arthur recognizes a split oak beside the road. He is certain they passed the same tree miles ago.",
    regionId: "broceliande",
    pathIds: ["old_forest_road", "overgrown_trail"],
    directions: ["outbound"],
    weight: 3,
    minimumDistance: 20,
    maximumDistance: 90,
    tags: ["mystery", "path", "knowledge"],
    repeatable: false,
    requirements: [],
    stages: {
      start: {
        text: "The familiar landmark should be far behind them, yet the road looks unchanged.",
        choices: [
          {
            id: "trust_road",
            label: "Trust the Road",
            costs: [
              {
                type: "modifyResource",
                resource: "provisions",
                amount: -3
              }
            ],
            resultText: "After traveling for some time, the familiar landmark finally disappears behind them.",
            endEncounter: true
          },
          {
            id: "leave_road",
            label: "Leave the Road",
            outcomes: [{ type: "modifyResource", resource: "provisions", amount: -1 }],
            resultText: "Arthur steps off the familiar line briefly, then returns to the marked Main Road.",
            endEncounter: true
          },
          {
            id: "use_woodcraft",
            label: "Use Woodcraft",
            requirements: [
              {
                type: "knowledge",
                knowledgeId: "woodcraft",
                unavailable: "locked",
                lockedLabel: "Requires Woodcraft"
              }
            ],
            outcomes: [
              {
                type: "setRunFlag",
                flag: "impossibleRoadNoticed",
                value: true
              }
            ],
            resultText: "Arthur studies the moss, slope, and direction of the fading light. Everything says they have been traveling forward.",
            pendingAction: {
              text: "Arthur studies the moss, slope, and fading light to judge the road's direction...",
              delayProfile: "search"
            },
            endEncounter: true
          }
        ]
      }
    }
  },
  hidden_hollow: {
    id: "hidden_hollow",
    title: "Hidden Hollow",
    description: "Beyond a wall of thorn and hazel, Arthur notices a narrow opening descending into a sheltered hollow.",
    regionId: "broceliande",
    pathIds: ["overgrown_trail"],
    directions: ["outbound"],
    weight: 2,
    minimumDistance: 30,
    maximumDistance: 90,
    tags: ["secret", "exploration", "rare_loot"],
    repeatable: false,
    requirements: [],
    stages: {
      start: {
        text: "The opening is easy to miss and the descent vanishes beneath dense growth.",
        choices: [
          {
            id: "enter",
            label: "Enter the Hollow",
            nextStage: "inside_hollow"
          },
          {
            id: "keep_moving",
            label: "Keep Moving",
            resultText: "Arthur leaves the hidden opening unexplored.",
            endEncounter: true
          }
        ]
      },
      inside_hollow: {
        text: "The hollow is strangely still. Someone has arranged stones around the remains of an old fire.",
        choices: [
          {
            id: "search_fire",
            label: "Search the Fire",
            outcomes: [
              {
                type: "gainWeightedRandomUnsecuredItem",
                items: [
                  {
                    itemId: "old_coin",
                    weight: 6
                  },
                  {
                    itemId: "polished_agate",
                    weight: 5
                  },
                  {
                    itemId: "bronze_figurine",
                    weight: 3
                  },
                  {
                    itemId: "carved_ivory_token",
                    weight: 3
                  },
                  {
                    itemId: "hunters_charm",
                    weight: 1
                  },
                  {
                    itemId: "strange_seeds",
                    weight: 1
                  }
                ],
                quantity: 1,
                resultText: "Among the cold ashes and disturbed earth, Arthur finds {itemName}."
              },
              {
                type: "rollLootTable",
                tableId: "forest_ingredients",
                rolls: 1
              },
              {
                type: "randomChance",
                chance: 0.16,
                effects: [{ type: "gainUnsecuredItem", itemId: "honey", quantity: 1 }]
              }
            ],
            pendingAction: {
              text: "Arthur sifts through the cold ashes and searches the earth around the old fire...",
              delayProfile: "search"
            },
            endEncounter: true
          },
          {
            id: "search_stones",
            label: "Search Beneath the Stones",
            outcomes: [
              {
                type: "randomChance",
                chance: 0.18,
                effects: [
                  {
                    type: "gainUnsecuredItem",
                    itemId: "green_glass_vial",
                    quantity: 1
                  }
                ],
                resultText: "Beneath the final stone, Arthur finds a tiny green glass vial sealed with black wax.",
                elseResultText: "Arthur finds nothing but damp earth, old ash, and insects beneath the stones."
              }
            ],
            pendingAction: {
              text: "Arthur kneels beside the old fire ring and moves the stones one by one..."
            },
            endEncounter: true
          },
          {
            id: "leave",
            label: "Leave",
            resultText: "Arthur leaves the still hollow and returns to the trail.",
            endEncounter: true
          }
        ]
      }
    }
  },
  sudden_storm: {
    id: "sudden_storm",
    title: "Sudden Storm",
    description: "Rain crashes through the canopy with almost no warning.",
    regionId: "broceliande",
    pathIds: ["old_forest_road", "overgrown_trail", "fountain_of_barenton", "val_sans_retour"],
    directions: ["outbound", "returning"],
    weight: 5,
    minimumDistance: 5,
    tags: ["weather", "survival", "equipment"],
    repeatable: true,
    maxOccurrencesPerRun: 2,
    requirements: [],
    stages: {
      start: {
        text: "Within moments the road is slick and the company is soaked by the downpour.",
        choices: [
          {
            id: "shelter",
            label: "Shelter Beneath the Trees",
            costs: [
              {
                type: "modifyResource",
                resource: "provisions",
                amount: -2
              }
            ],
            resultText: "Arthur and Kay wait beneath the densest branches until the worst has passed.",
            pendingAction: {
              text: "Arthur and Kay shelter beneath the densest branches and wait for the storm to ease...",
              delayProfile: "rest"
            },
            endEncounter: true
          },
          {
            id: "press_on",
            label: "Press On",
            outcomes: [
              {
                type: "randomChance",
                chance: 0.3,
                effects: [
                  {
                    type: "modifyResource",
                    resource: "health",
                    amount: -1
                  }
                ],
                resultText: "The driving rain makes every step treacherous. Arthur slips on the flooded road and presses on injured.",
                elseResultText: "Arthur and Kay endure the hard march and make it through the storm safely."
              }
            ],
            endEncounter: true
          },
          {
            id: "use_cloak",
            label: "Use Traveler's Cloak",
            requirements: [
              {
                type: "carriedItem",
                itemId: "wayfarers_cloak",
                unavailable: "locked",
                lockedLabel: "Requires Traveler's Cloak"
              }
            ],
            resultText: "The heavy travel cloak shields the company while the sudden storm passes.",
            endEncounter: true
          }
        ]
      }
    }
  },
  strange_lights: {
    id: "strange_lights",
    title: "Strange Lights",
    description: "Small lights flicker between the distant trees. They move slowly, almost as though waiting for Arthur to notice them.",
    regionId: "broceliande",
    pathIds: ["overgrown_trail"],
    directions: ["outbound"],
    weight: 2,
    minimumDistance: 34,
    maximumDistance: 90,
    tags: ["mystery", "risk_reward", "deep_forest"],
    repeatable: false,
    requirements: [],
    stages: {
      start: {
        text: "They drift between the trunks without casting light upon the ground.",
        choices: [
          {
            id: "follow_lights",
            label: "Follow the Lights",
            outcomes: [
              {
                type: "randomOne",
                options: [
                  {
                    resultText: "Where the lights vanish, Arthur finds a cluster of strange seeds resting on the moss.",
                    effects: [
                      {
                        type: "gainUnsecuredItem",
                        itemId: "strange_seeds",
                        quantity: 1
                      }
                    ]
                  },
                  {
                    resultText: "The lights lead Arthur in circles. By the time he regains the trail, the company has lost time and wasted supplies.",
                    effects: [
                      {
                        type: "modifyResource",
                        resource: "provisions",
                        amount: -3
                      }
                    ]
                  }
                ]
              }
            ],
            pendingAction: {
              text: "Arthur follows the drifting lights between the trees..."
            },
            endEncounter: true
          },
          {
            id: "watch_in_dark",
            label: "Extinguish the Torch and Watch",
            requirements: [
              {
                type: "carriedItem",
                itemId: "torch",
                unavailable: "locked",
                lockedLabel: "Requires 1 Torch"
              }
            ],
            outcomes: [
              {
                type: "setRunFlag",
                flag: "watchedStrangeLights",
                value: true
              }
            ],
            resultText: "The lights drift closer for several moments, then vanish together.",
            endEncounter: true
          },
          {
            id: "ignore",
            label: "Ignore Them",
            resultText: "Arthur keeps his attention on the trail and leaves the lights behind.",
            endEncounter: true
          }
        ]
      }
    }
  },
  mossbound_guide: {
    id: "mossbound_guide",
    title: "The Mossbound Guide",
    description: "An old forester's marker has been dressed in moss and twine, as if someone still maintains it in secret.",
    regionId: "broceliande",
    pathIds: ["overgrown_trail"],
    directions: ["outbound"],
    weight: 2,
    minimumDistance: 32,
    maximumDistance: 78,
    tags: ["knowledge", "foraging", "path"],
    repeatable: false,
    requirements: [{ type: "notKnowledge", knowledgeId: "woodcraft" }],
    stages: {
      start: {
        text: "The marker's knots describe safe bark, edible shoots, and the sound a stream makes before it floods. Whoever made it expected a careful traveler.",
        choices: [
          {
            id: "study_marker",
            label: "Study the Forester's Marker",
            outcomes: [
              { type: "learnKnowledge", knowledgeId: "woodcraft" },
              { type: "learnRecipe", recipeId: "forestwarden_stew" },
            ],
            resultText: "Arthur copies the marker's practical signs. The forest becomes legible enough to feed and shelter the company.",
            endEncounter: true,
          },
          {
            id: "leave_marker",
            label: "Leave It for Another Traveler",
            resultText: "Arthur leaves the marker untouched, but the road ahead offers no second lesson this run.",
            endEncounter: true,
          },
        ],
      },
    },
  },
  injured_hunter: {
    id: "injured_hunter",
    title: "Injured Hunter",
    description: "A hunter sits against a tree beside the road, one leg wrapped in a blood-soaked cloth.",
    regionId: "broceliande",
    pathIds: ["old_forest_road"],
    directions: ["outbound", "returning"],
    weight: 4,
    minimumDistance: 8,
    maximumDistance: 80,
    tags: ["traveler", "tradeoff", "consumable"],
    repeatable: false,
    requirements: [],
    stages: {
      start: {
        text: "He watches Arthur cautiously but is in no condition to travel without help.",
        choices: [
          {
            id: "give_bandages",
            label: "Give Him Bandages",
            requirements: [
              {
                type: "availableExpeditionItem",
                itemId: "bandages",
                unavailable: "locked",
                lockedLabel: "Requires Bandages"
              }
            ],
            costs: [
              {
                type: "consumeExpeditionItem",
                itemId: "bandages",
                quantity: 1
              }
            ],
            outcomes: [
              {
                type: "modifyResource",
                resource: "provisions",
                amount: 3
              },
              { type: "learnKnowledge", knowledgeId: "woodcraft" }
            ],
            resultText: "The hunter thanks Arthur and shares some of his remaining provisions.",
            endEncounter: true
          },
          {
            id: "leave",
            label: "Leave Him",
            resultText: "Arthur leaves the hunter beside the road.",
            endEncounter: true
          }
        ]
      }
    }
  },
  something_in_thorns: {
    id: "something_in_thorns",
    title: "Something in the Thorns",
    description: "Something metallic glints inside a dense wall of thorns beside the path.",
    regionId: "broceliande",
    pathIds: ["overgrown_trail"],
    directions: ["outbound"],
    weight: 4,
    minimumDistance: 12,
    maximumDistance: 90,
    tags: ["loot", "risk_reward", "tool"],
    repeatable: false,
    requirements: [],
    stages: {
      start: {
        text: "Reaching the object by hand means pushing through a mass of hooked branches.",
        choices: [
          {
            id: "harvest_thorn_berries",
            label: "Harvest the Edible Thorns with Woodcraft",
            requirements: [{ type: "knowledge", knowledgeId: "woodcraft", unavailable: "locked", lockedLabel: "Requires Woodcraft" }],
            outcomes: [
              { type: "gainUnsecuredItem", itemId: "wild_berries", quantity: 2 },
              {
                type: "randomChance",
                chance: 0.25,
                effects: [{ type: "gainUnsecuredItem", itemId: "fresh_herbs", quantity: 1 }]
              }
            ],
            resultText: "Arthur recognizes a safe opening and gathers the thorn berries without disturbing the hidden metal.",
            endEncounter: true
          },
          {
            id: "reach_through",
            label: "Reach Through",
            outcomes: [
              {
                type: "randomOne",
                options: [
                  {
                    resultText: "The hooked thorns catch Arthur's arm and cut deeply before he can reach the glint.",
                    effects: [
                      {
                        type: "modifyResource",
                        resource: "health",
                        amount: -1
                      }
                    ]
                  },
                  {
                    resultText: "Arthur works his hand through the hooked branches and pulls the hidden object free.",
                    effects: [
                      {
                        type: "gainRandomUnsecuredItem",
                        itemIds: ["old_coin", "silver_brooch", "decorated_buckle", "polished_agate"],
                        quantity: 1
                      }
                    ]
                  }
                ]
              }
            ],
            pendingAction: {
              text: "Arthur reaches slowly through the hooked thorns toward the glint..."
            },
            endEncounter: true
          },
          {
            id: "use_knife",
            label: "Use Hunting Knife",
            requirements: [
              {
                type: "availableExpeditionItem",
                itemId: "fine_hunting_knife",
                unavailable: "locked",
                lockedLabel: "Requires Fine Hunting Knife"
              }
            ],
            outcomes: [
              {
                type: "gainRandomUnsecuredItem",
                itemIds: ["old_coin", "silver_brooch", "decorated_buckle", "polished_agate"],
                quantity: 1
              }
            ],
            resultText: "The keen knife cuts a safe opening through the thorns.",
            endEncounter: true
          },
          {
            id: "leave",
            label: "Leave It",
            resultText: "Arthur decides the glint is not worth the thorns.",
            endEncounter: true
          }
        ]
      }
    }
  },
  glint_in_mud: {
    id: "glint_in_mud",
    title: "Glint in the Mud",
    description: "Something catches the light in the mud beside the road.",
    regionId: "broceliande",
    pathIds: ["old_forest_road", "overgrown_trail"],
    directions: ["outbound", "returning"],
    weight: 3,
    minimumDistance: 4,
    tags: ["discovery", "loot", "travel"],
    repeatable: true,
    maxOccurrencesPerRun: 2,
    requirements: [],
    stages: {
      start: {
        text: "A small edge gleams beneath a film of rainwater and dirt.",
        choices: [
          {
            id: "investigate",
            label: "Investigate",
            outcomes: [
              {
                type: "gainWeightedRandomUnsecuredItem",
                items: [
                  {
                    itemId: "old_coin",
                    weight: 5
                  },
                  {
                    itemId: "decorated_buckle",
                    weight: 5
                  },
                  {
                    itemId: "polished_agate",
                    weight: 4
                  },
                  {
                    itemId: "silver_brooch",
                    weight: 2
                  },
                  {
                    itemId: "amber_beads",
                    weight: 2
                  }
                ],
                resultText: "Arthur brushes away the mud and finds {itemName}."
              }
            ],
            pendingAction: {
              text: "Arthur kneels and brushes the mud aside...",
              delayProfile: "physical"
            },
            endEncounter: true
          }
        ]
      }
    }
  },
  discarded_bundle: {
    id: "discarded_bundle",
    title: "Discarded Bundle",
    description: "A weathered cloth bundle lies caught beneath a hedge.",
    regionId: "broceliande",
    pathIds: ["old_forest_road"],
    directions: ["outbound", "returning"],
    weight: 3,
    minimumDistance: 5,
    tags: ["discovery", "supplies", "loot"],
    repeatable: false,
    requirements: [],
    stages: {
      start: {
        text: "The cloth is stained by rain, but the cord around it remains tightly knotted.",
        choices: [
          {
            id: "open_bundle",
            label: "Open the Bundle",
            outcomes: [
              {
                type: "gainWeightedRandomUnsecuredItem",
                items: [
                  {
                    itemId: "bandages",
                    weight: 5
                  },
                  {
                    itemId: "dried_herbs",
                    weight: 5
                  },
                  {
                    itemId: "old_coin",
                    weight: 4
                  },
                  {
                    itemId: "coin_purse",
                    weight: 3
                  },
                  {
                    itemId: "embroidered_gloves",
                    weight: 2
                  }
                ],
                resultText: "Inside the bundle, Kay finds {itemName}."
              }
            ],
            pendingAction: {
              text: "Kay pulls the bundle free and cuts the cord...",
              delayProfile: "physical"
            },
            endEncounter: true
          },
          {
            id: "leave",
            label: "Leave It",
            resultText: "Arthur leaves the weathered bundle beneath the hedge.",
            endEncounter: true
          }
        ]
      }
    }
  },
  beneath_the_roots: {
    id: "beneath_the_roots",
    title: "Something Beneath the Roots",
    description: "The roots of an old tree have pushed something dark from the soil.",
    regionId: "broceliande",
    pathIds: ["overgrown_trail"],
    directions: ["outbound"],
    weight: 3,
    minimumDistance: 18,
    tags: ["discovery", "deep_forest", "loot"],
    repeatable: false,
    requirements: [],
    stages: {
      start: {
        text: "Only one smooth corner is visible between the thick roots.",
        choices: [
          {
            id: "read_the_roots",
            label: "Read the Damp Roots with Woodcraft",
            requirements: [{ type: "knowledge", knowledgeId: "woodcraft", unavailable: "locked", lockedLabel: "Requires Woodcraft" }],
            outcomes: [
              { type: "gainUnsecuredItem", itemId: "mushrooms", quantity: 2 },
              { type: "gainUnsecuredItem", itemId: "fresh_herbs", quantity: 1 },
              {
                type: "randomChance",
                chance: 0.12,
                effects: [{ type: "gainUnsecuredItem", itemId: "rare_herbs", quantity: 1 }]
              }
            ],
            resultText: "Woodcraft reveals a damp edible patch beneath the roots, with a rarer medicinal sprig hidden among it.",
            endEncounter: true
          },
          {
            id: "dig_out",
            label: "Dig It Out",
            outcomes: [
              {
                type: "gainWeightedRandomUnsecuredItem",
                items: [
                  {
                    itemId: "bronze_figurine",
                    weight: 5
                  },
                  {
                    itemId: "carved_ivory_token",
                    weight: 5
                  },
                  {
                    itemId: "amber_beads",
                    weight: 5
                  },
                  {
                    itemId: "hunters_charm",
                    weight: 2
                  },
                  {
                    itemId: "antler_fragment",
                    weight: 2
                  },
                  {
                    itemId: "green_glass_vial",
                    weight: 1
                  }
                ],
                resultText: "Arthur clears the soil and draws out {itemName}."
              }
            ],
            pendingAction: {
              text: "Arthur clears away the damp soil around the roots...",
              delayProfile: "search"
            },
            endEncounter: true
          },
          {
            id: "leave",
            label: "Leave It Buried",
            resultText: "Arthur leaves the half-buried object beneath the roots.",
            endEncounter: true
          }
        ]
      }
    }
  },
  lost_purse: {
    id: "lost_purse",
    title: "Lost Purse",
    description: "A small leather purse lies near the wagon ruts.",
    regionId: "broceliande",
    pathIds: ["old_forest_road"],
    directions: ["outbound", "returning"],
    weight: 3,
    minimumDistance: 4,
    tags: ["discovery", "road", "loot"],
    repeatable: false,
    requirements: [],
    stages: {
      start: {
        text: "Mud covers one side, but the clasp is still closed.",
        choices: [
          {
            id: "pick_up",
            label: "Pick It Up",
            outcomes: [
              {
                type: "gainWeightedRandomUnsecuredItem",
                items: [
                  {
                    itemId: "old_coin",
                    weight: 5
                  },
                  {
                    itemId: "coin_purse",
                    weight: 4
                  },
                  {
                    itemId: "merchants_ring",
                    weight: 2
                  }
                ],
                resultText: "Arthur checks the purse and recovers {itemName}."
              }
            ],
            pendingAction: {
              text: "Arthur lifts the purse from the wagon ruts and checks its contents...",
              delayProfile: "physical"
            },
            endEncounter: true
          },
          {
            id: "leave",
            label: "Leave It",
            resultText: "Arthur leaves the purse beside the road.",
            endEncounter: true
          }
        ]
      }
    }
  },
  broken_bridge: {
    id: "broken_bridge",
    title: "Broken Bridge",
    description: "A narrow wooden bridge crosses a steep ravine ahead. Several planks have collapsed into the darkness below.",
    regionId: "broceliande",
    pathIds: ["old_forest_road"],
    directions: ["outbound", "returning"],
    weight: 4,
    minimumDistance: 10,
    tags: ["obstacle", "road", "rope"],
    repeatable: false,
    requirements: [],
    stages: {
      start: {
        text: "The remaining boards creak over the open ravine.",
        choices: [
          {
            id: "cross_carefully",
            label: "Cross Carefully",
            outcomes: [
              {
                type: "randomChance",
                chance: 0.25,
                effects: [
                  {
                    type: "modifyResource",
                    resource: "health",
                    amount: -1
                  }
                ],
                resultText: "A plank breaks beneath Arthur. He catches the rail but reaches the far side injured.",
                elseResultText: "Arthur and Kay test each plank and cross the damaged bridge safely."
              }
            ],
            pendingAction: {
              text: "Arthur and Kay carefully cross the damaged bridge...",
              delayProfile: "physical"
            },
            endEncounter: true
          },
          {
            id: "use_rope",
            label: "Use Rope",
            requirements: [
              {
                type: "carriedItem",
                itemId: "rope",
                unavailable: "locked",
                lockedLabel: "Requires Rope"
              }
            ],
            outcomes: [
              {
                type: "randomChance",
                chance: 0.18,
                effects: [
                  {
                    type: "consumeExpeditionItem",
                    itemId: "rope",
                    quantity: 1
                  }
                ],
                resultText: "The rope sacrifices itself as a handline; it snaps free once the company reaches the far side.",
                elseResultText: "The rope holds as a handline and comes free after the crossing."
              }
            ],
            resultText: "With the rope secured as a handline, the company crosses safely.",
            pendingAction: {
              text: "Arthur secures the rope across the broken span...",
              delayProfile: "physical"
            },
            endEncounter: true
          },
          {
            id: "find_route",
            label: "Find Another Route",
            costs: [
              {
                type: "modifyResource",
                resource: "provisions",
                amount: -3
              }
            ],
            resultText: "The company spends supplies on a long detour and reaches the far side safely.",
            pendingAction: {
              text: "Arthur searches the ravine for another crossing...",
              delayProfile: "search"
            },
            endEncounter: true
          }
        ]
      }
    },
    visualAssetId: "encounter_broken_bridge",
    encounterLayout: {
      arthur: {
        x: 0.302734375,
        y: 0.7330729166666666
      },
      companion2: {
        x: 0.126953125,
        y: 0.8407118055555556
      },
      companion1: {
        x: 0.5234375,
        y: 0.9657118055555556,
        facing: "left"
      }
    }
  },
  hermits_fire: {
    id: "hermits_fire",
    title: "The Hermit's Fire",
    description: "Smoke curls above the trees. In a small clearing, a crude shelter stands beside a dying fire. Whoever lives here is nowhere to be seen.",
    regionId: "broceliande",
    pathIds: ["overgrown_trail"],
    directions: ["outbound"],
    weight: 3,
    minimumDistance: 18,
    tags: ["shelter", "mystery", "discovery"],
    repeatable: false,
    requirements: [],
    stages: {
      start: {
        text: "The embers are warm and recent footprints circle the shelter.",
        choices: [
          {
            id: "wait",
            label: "Wait for the Hermit",
            outcomes: [
              {
                type: "randomChance",
                chance: 0.55,
                effects: [
                  {
                    type: "gainWeightedRandomUnsecuredItem",
                    items: [
                      {
                        itemId: "dried_herbs",
                        weight: 3
                      },
                      {
                        itemId: "honey",
                        weight: 1
                      },
                      {
                        itemId: "bandages",
                        weight: 2
                      }
                    ],
                    resultText: "Nobody returns, but near the occupied shelter Arthur notices {itemName} left by the fire."
                  }
                ],
                elseResultText: "Nobody returns. The warm embers and recent footprints are the only signs of the absent occupant."
              }
            ],
            pendingAction: {
              text: "Arthur and Kay wait quietly near the dying fire...",
              delayProfile: "rest"
            },
            endEncounter: true
          },
          {
            id: "search",
            label: "Search the Shelter",
            outcomes: [
              {
                type: "randomChance",
                chance: 0.7,
                effects: [
                  {
                    type: "gainWeightedRandomUnsecuredItem",
                    items: [
                      {
                        itemId: "dried_herbs",
                        weight: 4
                      },
                      {
                        itemId: "mushrooms",
                        weight: 3
                      },
                      {
                        itemId: "fresh_herbs",
                        weight: 3
                      },
                      {
                        itemId: "honey",
                        weight: 1
                      },
                      {
                        itemId: "bandages",
                        weight: 4
                      },
                      {
                        itemId: "carved_ivory_token",
                        weight: 2
                      }
                    ],
                    resultText: "Inside the recently occupied shelter, Arthur finds {itemName}."
                  }
                ],
                elseResultText: "Arthur searches the crude shelter but finds nothing useful."
              }
            ],
            pendingAction: {
              text: "Arthur searches the crude shelter and the ground around the fire...",
              delayProfile: "search"
            },
            endEncounter: true
          },
          {
            id: "leave",
            label: "Leave It Alone",
            resultText: "Arthur leaves the empty shelter and its absent occupant undisturbed.",
            endEncounter: true
          }
        ]
      }
    }
  },
  wolves_in_brush: {
    id: "wolves_in_brush",
    title: "Wolves in the Brush",
    description: "Low growls follow the company through the undergrowth. Several pairs of eyes move between the trees.",
    regionId: "broceliande",
    pathIds: ["old_forest_road", "overgrown_trail"],
    directions: ["outbound", "returning"],
    weight: 4,
    minimumDistance: 16,
    tags: ["animal", "danger", "survival"],
    repeatable: true,
    maxOccurrencesPerRun: 2,
    requirements: [],
    stages: {
      start: {
        text: "The wolves keep pace just beyond the nearest trees.",
        choices: [
          {
            id: "stand_ground",
            label: "Stand Your Ground",
            outcomes: [
              {
                type: "startCombat",
                combatId: "wolves",
                victory: {
                  outcomes: [
                    {
                      type: "gainUnsecuredItem",
                      itemId: "raw_meat",
                      quantity: 2
                    }
                  ],
                  resultText: "Arthur holds firm until the last wolf is driven down. The company gathers the meat the Material Bag can carry."
                },
                fled: {
                  outcomes: [],
                  resultText: "The company breaks away from the pack and escapes deeper along the road."
                }
              }
            ]
          },
          {
            id: "throw_food",
            label: "Throw Them Food",
            costs: [
              {
                type: "modifyResource",
                resource: "provisions",
                amount: -3
              }
            ],
            resultText: "The wolves seize the thrown food and disappear between the trees.",
            endEncounter: true
          },
          {
            id: "make_noise",
            label: "Make Noise and Move Quickly",
            outcomes: [
              {
                type: "randomChance",
                chance: 0.45,
                effects: [
                  {
                    type: "modifyResource",
                    resource: "provisions",
                    amount: -1
                  }
                ],
                resultText: "The hurried retreat shakes loose a small share of supplies, but the wolves fall behind.",
                elseResultText: "The company's noise and quick pace drive the wolves away without loss."
              }
            ],
            pendingAction: {
              text: "Arthur and Kay shout and strike the trees as they move quickly onward...",
              delayProfile: "physical"
            },
            endEncounter: true
          }
        ]
      }
    }
  },
  bandit_ambush: {
    id: "bandit_ambush",
    title: "Bandit Ambush",
    description: "Two armed figures step from the roadside thorns and block the Old Forest Road.",
    regionId: "broceliande",
    pathIds: ["old_forest_road", "overgrown_trail"],
    directions: ["outbound", "returning"],
    weight: 5,
    minimumDistance: 12,
    tags: ["humanoid", "bandit", "danger", "combat"],
    repeatable: false,
    requirements: [],
    stages: {
      start: {
        text: "Their blades are plain, but their stance says they have done this before.",
        choices: [
          {
            id: "fight",
            label: "Fight the Bandits",
            outcomes: [
              {
                type: "startCombat",
                combatId: "bandit_ambush",
                victory: {
                  outcomes: [
                    {
                      type: "rollLootTable",
                      tableId: "bandit_ambush_loot",
                      rolls: 2
                    },
                    {
                      type: "randomChance",
                      chance: 0.35,
                      effects: [
                        {
                          type: "modifyResource",
                          resource: "provisions",
                          randomMinimum: 2,
                          randomMaximum: 4
                        }
                      ],
                      resultText: "The bandits' packs contain a small reserve of provisions."
                    },
                    {
                      type: "setRunFlag",
                      flag: "banditLeaderEligible",
                      value: true,
                      message: "A blackthorn mark suggests someone more important will come looking."
                    }
                  ],
                  resultText: "The two bandits fall back into the brush. Their blackthorn mark may draw a more dangerous pursuer."
                },
                fled: {
                  outcomes: [],
                  resultText: "The company breaks from the ambush and leaves the bandits to the road."
                }
              }
            ]
          },
          {
            id: "break_through",
            label: "Break Through",
            costs: [
              {
                type: "modifyResource",
                resource: "provisions",
                amount: -2
              }
            ],
            outcomes: [
              {
                type: "randomChance",
                chance: 0.25,
                effects: [
                  {
                    type: "modifyResource",
                    resource: "health",
                    amount: -2
                  }
                ],
                resultText: "Arthur forces a gap, but one blade catches him as the company gets past.",
                elseResultText: "Arthur drives through the gap before the bandits can close it."
              }
            ],
            endEncounter: true
          },
          {
            id: "pay_toll",
            label: "Pay Their Toll",
            costs: [
              {
                type: "modifyResource",
                resource: "goldCarried",
                amount: -4
              }
            ],
            resultText: "The bandits take the coins and vanish among the trees.",
            endEncounter: true
          }
        ]
      }
    }
  },
  bandit_leader: {
    id: "bandit_leader",
    title: "Bandit Leader",
    description: "A scarred captain waits beside the road, furious that Arthur survived the earlier ambush.",
    regionId: "broceliande",
    pathIds: ["old_forest_road", "overgrown_trail"],
    directions: ["outbound", "returning"],
    weight: 3,
    minimumDistance: 28,
    tags: ["humanoid", "bandit", "leader", "danger", "combat"],
    repeatable: false,
    requirements: [
      {
        type: "runFlag",
        flag: "banditLeaderEligible"
      },
      {
        type: "notRunFlag",
        flag: "banditLeaderDefeated"
      }
    ],
    stages: {
      start: {
        text: "The captain's armor is better than the ambush crew's, and the road behind him is empty.",
        choices: [
          {
            id: "fight",
            label: "Face the Captain",
            outcomes: [
              {
                type: "startCombat",
                combatId: "bandit_leader",
                victory: {
                  outcomes: [
                    {
                      type: "rollLootTable",
                      tableId: "bandit_leader_loot",
                      rolls: 2
                    },
                    {
                      type: "setRunFlag",
                      flag: "banditLeaderDefeated",
                      value: true,
                      message: "The blackthorn band will trouble this road no more this season."
                    },
                    {
                      type: "learnRecipe",
                      recipeId: "glimmering_sword"
                    },
                    {
                      type: "learnAbility",
                      abilityId: "sweeping_cut"
                    },
                  ],
                  resultText: "The bandit captain yields the road. His better-hidden purse confirms the rank he carried."
                },
                fled: {
                  outcomes: [],
                  resultText: "The captain lets the company go, certain the road will offer another chance."
                }
              }
            ]
          },
          {
            id: "turn_back",
            label: "Turn Back",
            resultText: "Arthur turns away before the captain can force a costly fight.",
            endEncounter: true
          }
        ]
      }
    }
  },
  ruined_wayside_shrine: {
    id: "ruined_wayside_shrine",
    title: "Ruined Wayside Shrine",
    description: "An old stone shrine stands beside the road, half-swallowed by moss and roots.",
    regionId: "broceliande",
    pathIds: ["old_forest_road", "overgrown_trail", "fountain_of_barenton", "val_sans_retour"],
    directions: ["outbound"],
    weight: 3,
    minimumDistance: 18,
    tags: ["atmosphere", "shrine", "loot"],
    repeatable: false,
    requirements: [],
    stages: {
      start: {
        text: "Rain and roots have worn the carved face almost smooth.",
        choices: [
          {
            id: "examine",
            label: "Examine the Shrine",
            outcomes: [
              {
                type: "randomChance",
                chance: 0.4,
                effects: [
                  {
                    type: "gainWeightedRandomUnsecuredItem",
                    items: [
                      {
                        itemId: "old_coin",
                        weight: 5
                      },
                      {
                        itemId: "silver_brooch",
                        weight: 3
                      },
                      {
                        itemId: "bronze_figurine",
                        weight: 2
                      },
                      {
                        itemId: "silver_reliquary",
                        weight: 0.8
                      },
                      {
                        itemId: "jeweled_saints_locket",
                        weight: 0.2
                      }
                    ],
                    resultText: "The symbols remain unclear, but among the fallen stones Arthur finds {itemName}."
                  }
                ],
                elseResultText: "Arthur studies the worn symbols, but cannot interpret them and finds nothing hidden among the stones."
              }
            ],
            pendingAction: {
              text: "Arthur clears moss from the stones and examines the worn symbols...",
              delayProfile: "search"
            },
            endEncounter: true
          },
          {
            id: "offering",
            label: "Leave an Offering",
            costs: [
              {
                type: "modifyResource",
                resource: "provisions",
                amount: -2
              }
            ],
            outcomes: [
              {
                type: "setRunFlag",
                flag: "waysideOfferingMade",
                value: true
              },
              {
                type: "modifyResource",
                resource: "faith",
                amount: 1
              }
            ],
            resultText: "Arthur leaves a small offering at the ruined shrine. Whether it matters remains unknown.",
            endEncounter: true
          },
          {
            id: "leave",
            label: "Leave",
            resultText: "Arthur leaves the moss-covered shrine beside the road.",
            endEncounter: true
          }
        ]
      }
    }
  },
  sunken_road: {
    id: "sunken_road",
    title: "The Sunken Road",
    description: "The trail descends into a hollow where an older road lies beneath the forest floor. Broken stones disappear between the trees.",
    regionId: "broceliande",
    pathIds: ["overgrown_trail"],
    directions: ["outbound"],
    weight: 3,
    minimumDistance: 35,
    tags: ["deep_forest", "old_road", "loot"],
    repeatable: false,
    requirements: [],
    stages: {
      start: {
        text: "Roots cross the buried paving, and scattered roadside stones lean into the earth.",
        choices: [
          {
            id: "follow",
            label: "Follow the Old Road",
            outcomes: [
              {
                type: "setRunFlag",
                flag: "sunkenRoadExplored",
                value: true
              },
              {
                type: "randomChance",
                chance: 0.6,
                effects: [
                  {
                    type: "gainWeightedRandomUnsecuredItem",
                    items: [
                      {
                        itemId: "carved_ivory_token",
                        weight: 4
                      },
                      {
                        itemId: "bronze_figurine",
                        weight: 4
                      },
                      {
                        itemId: "merchants_ring",
                        weight: 3
                      },
                      {
                        itemId: "silver_cup",
                        weight: 2
                      },
                      {
                        itemId: "roman_signet",
                        weight: 0.4
                      }
                    ],
                    resultText: "Along the buried route, Arthur finds {itemName} between the broken stones."
                  }
                ],
                elseResultText: "Arthur follows the buried route until it vanishes beneath roots, finding no object worth carrying away."
              }
            ],
            pendingAction: {
              text: "Arthur follows the broken paving deeper into the hollow...",
              delayProfile: "physical"
            },
            endEncounter: true
          },
          {
            id: "search_stones",
            label: "Search the Roadside Stones",
            outcomes: [
              {
                type: "randomChance",
                chance: 0.65,
                effects: [
                  {
                    type: "gainWeightedRandomUnsecuredItem",
                    items: [
                      {
                        itemId: "old_coin",
                        weight: 5
                      },
                      {
                        itemId: "decorated_buckle",
                        weight: 4
                      },
                      {
                        itemId: "polished_agate",
                        weight: 4
                      }
                    ],
                    resultText: "Between the leaning roadside stones, Arthur finds {itemName}."
                  }
                ],
                elseResultText: "Arthur searches the roadside stones but finds only soil, roots, and broken rock."
              }
            ],
            pendingAction: {
              text: "Arthur searches beneath the leaning stones along the buried road...",
              delayProfile: "search"
            },
            endEncounter: true
          },
          {
            id: "return",
            label: "Return to the Trail",
            resultText: "Arthur returns to the overgrown trail without following the buried road.",
            endEncounter: true
          }
        ]
      }
    }
  },
  shelter_before_nightfall: {
    id: "shelter_before_nightfall",
    title: "Shelter Before Nightfall",
    description: "Darkness gathers beneath the trees. Kay points toward a shallow rocky shelter beside the road.",
    regionId: "broceliande",
    pathIds: ["old_forest_road", "overgrown_trail", "fountain_of_barenton", "val_sans_retour"],
    directions: ["returning"],
    weight: 5,
    minimumDistance: 3,
    tags: ["return", "shelter", "recovery"],
    repeatable: false,
    requirements: [],
    stages: {
      start: {
        text: "The shelter offers a chance to rest, though every delay consumes supplies.",
        choices: [
          {
            id: "rest",
            label: "Rest Briefly",
            costs: [
              {
                type: "modifyResource",
                resource: "provisions",
                amount: -2
              }
            ],
            outcomes: [
              {
                type: "modifyResource",
                resource: "health",
                amount: 1
              }
            ],
            resultText: "The brief rest restores some strength before the company returns to the road.",
            pendingAction: {
              text: "Arthur and Kay settle into the shelter and rest for a short while...",
              delayProfile: "rest"
            },
            endEncounter: true
          },
          {
            id: "keep_moving",
            label: "Keep Moving",
            resultText: "Arthur chooses not to lose time and keeps moving toward safety.",
            endEncounter: true
          },
          {
            id: "search_shelter",
            label: "Search the Shelter",
            outcomes: [
              {
                type: "randomChance",
                chance: 0.35,
                effects: [
                  {
                    type: "gainWeightedRandomUnsecuredItem",
                    items: [
                      {
                        itemId: "bandages",
                        weight: 6
                      },
                      {
                        itemId: "old_coin",
                        weight: 5
                      },
                      {
                        itemId: "polished_agate",
                        weight: 4
                      },
                      {
                        itemId: "silver_brooch",
                        weight: 3
                      },
                      {
                        itemId: "amber_beads",
                        weight: 3
                      },
                      {
                        itemId: "coin_purse",
                        weight: 2
                      }
                    ],
                    quantity: 1,
                    resultText: "Behind loose stones and old leaves, Arthur finds {itemName}."
                  }
                ],
                elseResultText: "The shelter contains nothing useful beyond damp leaves and old ash."
              }
            ],
            pendingAction: {
              text: "Arthur searches behind loose stones and beneath the leaves inside the shelter...",
              delayProfile: "search"
            },
            endEncounter: true
          }
        ]
      }
    }
  },
  hidden_flask: {
    id: "hidden_flask",
    title: "A Weathered Trail Map",
    description: "Something catches the light beneath a shelf of roots beside the old road.",
    regionId: "broceliande",
    pathIds: ["old_forest_road"],
    expeditionIds: ["old_forest_road"],
    directions: ["outbound"],
    weight: 1,
    minimumDistance: 48,
    maximumDistance: 150,
    tags: ["campaign", "discovery"],
    repeatable: false,
    requirements: [
      {
        type: "notOwnsItem",
        itemId: "old_foresters_map"
      }
    ],
    stages: {
      start: {
        text: "The map is old, but its route marks are still legible. It may have been left here for a reason.",
        choices: [
          {
            id: "recover_map",
            label: "Recover the Map",
            outcomes: [
              {
                type: "gainUniqueUnsecuredItem",
                itemId: "old_foresters_map",
                resultText: "Arthur takes the weathered map. Its early turnoff is still usable."
              }
            ],
            pendingAction: {
              text: "Arthur reaches beneath the roots and carefully frees the weathered map...",
              delayProfile: "search"
            },
            endEncounter: true
          },
          {
            id: "leave_map",
            label: "Leave It Undisturbed",
            resultText: "Arthur leaves the weathered map beneath the roots.",
            endEncounter: true
          }
        ]
      }
    }
  },
  llamrei_discovery: {
    id: "llamrei_discovery",
    title: "A Horse in the Bracken",
    description: "A powerful horse watches from a bracken-filled hollow, wary but unhurt.",
    regionId: "broceliande",
    pathIds: ["old_forest_road"],
    expeditionIds: ["old_forest_road"],
    directions: ["outbound"],
    weight: 0.7,
    minimumDistance: 20,
    maximumDistance: 90,
    tags: ["campaign", "companion", "discovery"],
    repeatable: false,
    requirements: [
      {
        type: "notUnlockedCompanion",
        companionId: "llamrei"
      }
    ],
    stages: {
      start: {
        text: "The horse has no rider and no visible brand. She does not bolt when Arthur approaches.",
        choices: [
          {
            id: "approach_horse",
            label: "Approach the Horse",
            outcomes: [
              {
                type: "unlockCompanion",
                companionId: "llamrei"
              }
            ],
            resultText: "The horse accepts Arthur's hand. Llamrei is willing to join the company.",
            pendingAction: {
              text: "Arthur lowers his voice and gives the horse time to decide...",
              delayProfile: "physical"
            },
            endEncounter: true
          },
          {
            id: "leave_horse",
            label: "Leave Her in the Hollow",
            resultText: "Arthur leaves the horse where he found her.",
            endEncounter: true
          }
        ]
      }
    }
  },
  barenton_rumors: {
    id: "barenton_rumors",
    title: "Rumors in the Rain",
    description: "The road toward Barenton carries fragments of warnings from travelers who did not agree on what they saw.",
    regionId: "broceliande",
    pathIds: ["fountain_of_barenton"],
    expeditionIds: ["fountain_of_barenton"],
    directions: ["outbound"],
    weight: 5,
    minimumDistance: 8,
    maximumDistance: 24,
    tags: ["campaign", "fountain", "clue"],
    repeatable: false,
    requirements: [],
    stages: {
      start: {
        text: "One traveler says the fountain answers thunder. Another insists it answers only a knight who knows how to ask. Their fear is more consistent than their story.",
        choices: [
          {
            id: "compare_accounts",
            label: "Compare the Accounts",
            outcomes: [
              {
                type: "setRunFlag",
                flag: "barentonClueHeard",
                value: true
              },
              {
                type: "setRunFlag",
                flag: "barentonRitualUnderstood",
                value: true
              },
              {
                type: "setCampaignFlagOnSafeReturn",
                flag: "barenton_ritual_understood",
                value: true
              }
            ],
            resultText: "Arthur keeps the useful part of the warning: water, stone, and weather belong to the same question.",
            endEncounter: true
          },
          {
            id: "ask_for_directions",
            label: "Ask for the Old Road",
            outcomes: [
              {
                type: "modifyResource",
                resource: "provisions",
                amount: 1
              }
            ],
            resultText: "A charcoal burner points toward the older trees and gives Kay a little food for the road.",
            endEncounter: true
          },
          {
            id: "dismiss_rumors",
            label: "Dismiss the Rumors",
            resultText: "Arthur thanks the travelers and keeps the company moving.",
            endEncounter: true
          }
        ]
      }
    }
  },
  keeper_of_bulls: {
    id: "keeper_of_bulls",
    title: "The Keeper of Bulls",
    description: "A massive keeper stands among dark-horned cattle where no pasture should be, watching the road as if it were a gate.",
    regionId: "broceliande",
    pathIds: ["fountain_of_barenton"],
    expeditionIds: ["fountain_of_barenton"],
    directions: ["outbound"],
    weight: 10,
    minimumDistance: 22,
    maximumDistance: 45,
    milestone: true,
    milestoneOrder: 22,
    tags: ["campaign", "fountain", "milestone", "dialogue"],
    repeatable: false,
    requirements: [],
    stages: {
      start: {
        text: "The keeper does not reach for a weapon. He only rests one hand on a bull's horn and asks whether Arthur means to trouble the water.",
        choices: [
          {
            id: "question_keeper",
            label: "Question Him Respectfully",
            outcomes: [
              {
                type: "setRunFlag",
                flag: "barentonKeeperWarned",
                value: true
              },
              {
                type: "setRunFlag",
                flag: "barentonRitualUnderstood",
                value: true
              },
              {
                type: "setCampaignFlagOnSafeReturn",
                flag: "barenton_ritual_understood",
                value: true
              }
            ],
            resultText: "The keeper gives no name. He says only: \"Pour upon the stone, and do not mistake the storm for an answer.\"",
            endEncounter: true
          },
          {
            id: "use_woodcraft",
            label: "Read the Ground and the Herd",
            requirements: [
              {
                type: "knowledge",
                knowledgeId: "woodcraft",
                unavailable: "locked",
                lockedLabel: "Requires Woodcraft"
              }
            ],
            outcomes: [
              {
                type: "setRunFlag",
                flag: "barentonKeeperWarned",
                value: true
              },
              {
                type: "setRunFlag",
                flag: "barentonClueHeard",
                value: true
              },
              {
                type: "setRunFlag",
                flag: "barentonRitualUnderstood",
                value: true
              },
              {
                type: "setCampaignFlagOnSafeReturn",
                flag: "barenton_ritual_understood",
                value: true
              }
            ],
            resultText: "The herd is arranged around a dry stone line. Arthur understands the keeper's direction without asking him to repeat it.",
            endEncounter: true
          },
          {
            id: "challenge_keeper",
            label: "Challenge His Right to Block the Road",
            outcomes: [
              {
                type: "setRunFlag",
                flag: "barentonKeeperDefied",
                value: true
              }
            ],
            resultText: "The keeper steps aside, but his expression makes the gesture feel like a warning rather than a surrender.",
            endEncounter: true
          }
        ]
      }
    }
  },
  barenton_still_forest: {
    id: "barenton_still_forest",
    title: "The Forest Holds Its Breath",
    description: "Birdsong disappears around a patch of old trees, and a thin rain falls beneath an unbroken sky.",
    regionId: "broceliande",
    pathIds: ["fountain_of_barenton"],
    expeditionIds: ["fountain_of_barenton"],
    directions: ["outbound"],
    weight: 5,
    minimumDistance: 42,
    maximumDistance: 78,
    tags: ["campaign", "fountain", "mystery", "atmosphere"],
    repeatable: false,
    requirements: [],
    stages: {
      start: {
        text: "The silence is not peaceful. It feels arranged, as though the trees are waiting for a sound Arthur has not yet made.",
        choices: [
          {
            id: "listen_to_silence",
            label: "Listen and Mark the Place",
            outcomes: [
              {
                type: "setRunFlag",
                flag: "barentonApproachSeen",
                value: true
              },
              {
                type: "setRunFlag",
                flag: "barentonApproachKnown",
                value: true
              },
              {
                type: "setCampaignFlagOnSafeReturn",
                flag: "barenton_approach_known",
                value: true
              }
            ],
            resultText: "Arthur marks the silent grove. Far ahead, water runs briefly uphill over a bed of black stones.",
            endEncounter: true
          },
          {
            id: "move_quickly",
            label: "Move Quickly Through It",
            resultText: "The company crosses the silent ground without stopping to interpret it.",
            endEncounter: true
          }
        ]
      }
    }
  },
  barenton_stone_markers: {
    id: "barenton_stone_markers",
    title: "Markers Beside the Water",
    description: "Small old stones lead between roots toward the deeper hollow, each one wet though the ground around it is dry.",
    regionId: "broceliande",
    pathIds: ["fountain_of_barenton"],
    expeditionIds: ["fountain_of_barenton"],
    directions: ["outbound"],
    weight: 4,
    minimumDistance: 64,
    maximumDistance: 88,
    tags: ["campaign", "fountain", "secret", "discovery"],
    repeatable: false,
    requirements: [],
    stages: {
      start: {
        text: "The stones are not a road, but they are too deliberately placed to be natural. The last marker points toward the sound of distant water.",
        choices: [
          {
            id: "follow_markers",
            label: "Follow the Markers",
            outcomes: [
              {
                type: "setRunFlag",
                flag: "barentonApproachSeen",
                value: true
              },
              {
                type: "setRunFlag",
                flag: "barentonApproachKnown",
                value: true
              },
              {
                type: "setCampaignFlagOnSafeReturn",
                flag: "barenton_approach_known",
                value: true
              }
            ],
            resultText: "The markers bring Arthur to a rise from which the forest falls away toward the fountain hollow.",
            endEncounter: true
          },
          {
            id: "leave_markers",
            label: "Leave Them Untouched",
            resultText: "Arthur leaves the old stones alone. Their line remains in the corner of his eye as the company passes.",
            endEncounter: true
          }
        ]
      }
    }
  },
  barenton_fountain_ritual: {
    id: "barenton_fountain_ritual",
    title: "The Perron of Barenton",
    description: "A dark stone stands beside the fountain, polished by weather and by hands that came here long before Arthur.",
    regionId: "broceliande",
    pathIds: ["fountain_of_barenton"],
    expeditionIds: ["fountain_of_barenton"],
    directions: ["outbound"],
    weight: 20,
    minimumDistance: 94,
    maximumDistance: 110,
    milestone: true,
    milestoneOrder: 94,
    tags: ["campaign", "fountain", "milestone", "quest", "destination"],
    repeatable: false,
    requirements: [
      {
        type: "notRunFlag",
        flag: "barentonOrdealComplete"
      },
      {
        type: "allOf",
        requirements: [
          {
            type: "anyOf",
            requirements: [
              {
                type: "runFlag",
                flag: "barentonRitualUnderstood"
              },
              {
                type: "campaignFlag",
                flag: "barenton_ritual_understood"
              }
            ]
          },
          {
            type: "anyOf",
            requirements: [
              {
                type: "runFlag",
                flag: "barentonApproachKnown"
              },
              {
                type: "campaignFlag",
                flag: "barenton_approach_known"
              }
            ]
          }
        ]
      }
    ],
    stages: {
      start: {
        text: "The fountain's surface is perfectly still. The Perron bears a shallow channel where water could be poured across its face.",
        choices: [
          {
            id: "fill_flask",
            label: "Try the Flask First",
            requirements: [
              {
                type: "availableExpeditionItem",
                itemId: "flask",
                lockedLabel: "Requires Merlin's Flask"
              }
            ],
            outcomes: [
              {
                type: "setRunFlag",
                flag: "barentonWaterRefused",
                value: true
              }
            ],
            resultText: "Arthur fills the flask. A moment later it is empty. There is no crack, no spill, and no sign of where the water went.",
            nextStage: "ritual"
          },
          {
            id: "study_perron",
            label: "Study the Stone",
            outcomes: [
              {
                type: "gainUniqueUnsecuredItem",
                itemId: "barenton_stone",
                resultText: "A dark chip breaks free from the Perron, cold in Arthur's palm."
              },
              {
                type: "learnAbility",
                abilityId: "call_the_storm"
              },
              {
                type: "setRunFlag",
                flag: "barentonClueUnderstood",
                value: true
              }
            ],
            resultText: "The channel in the stone makes the old warning plain: the water must meet the stone before it can be carried away.",
            nextStage: "ritual"
          },
          {
            id: "leave_fountain",
            label: "Leave the Fountain Alone",
            resultText: "Arthur leaves the fountain untouched and keeps the unanswered ritual behind him.",
            endEncounter: true
          }
        ]
      },
      ritual: {
        text: "The forest is quiet enough for Arthur to hear the water moving beneath the basin. The next act will not be private.",
        choices: [
          {
            id: "pour_on_perron",
            label: "Pour Water Across the Perron",
            requirements: [
              {
                type: "availableExpeditionItem",
                itemId: "flask",
                lockedLabel: "Requires Merlin's Flask"
              }
            ],
            outcomes: [
              {
                type: "setRunFlag",
                flag: "barentonRitualBegun",
                value: true
              }
            ],
            resultText: "Arthur pours the water across the stone. The first drop strikes like a bell beneath the earth.",
            nextStage: "storm"
          },
          {
            id: "use_basin_water",
            label: "Use a Handful from the Basin",
            outcomes: [
              {
                type: "setRunFlag",
                flag: "barentonRitualBegun",
                value: true
              }
            ],
            resultText: "Arthur lets a handful of fountain water fall across the Perron. The forest answers at once.",
            nextStage: "storm"
          },
          {
            id: "step_away",
            label: "Step Away from the Stone",
            resultText: "Arthur decides that understanding the warning is not the same as accepting its cost.",
            endEncounter: true
          }
        ]
      },
      storm: {
        text: "The sky darkens without clouds. Rain strikes the hollow in a solid curtain while wind bends the trees away from the fountain.",
        choices: [
          {
            id: "shelter_with_cloak",
            label: "Shelter Beneath the Traveler's Cloak",
            requirements: [
              {
                type: "carriedItem",
                itemId: "wayfarers_cloak",
                lockedLabel: "Requires Traveler's Cloak"
              }
            ],
            outcomes: [
              {
                type: "setRunFlag",
                flag: "barentonStormPassed",
                value: true
              }
            ],
            resultText: "The cloak holds against the impossible rain. Arthur sees white birds fall silent in the branches, then take flight together.",
            nextStage: "aftermath"
          },
          {
            id: "hold_to_stone",
            outcomes: [
              {
                type: "setRunFlag",
                flag: "barentonStormPassed",
                value: true
              },
              {
                type: "randomChance",
                chance: 0.25,
                effects: [
                  {
                    type: "modifyResource",
                    resource: "health",
                    amount: -2
                  },
                  {
                    type: "applyInjury",
                    target: "arthur",
                    injuryId: "bruised_ribs",
                    source: "barenton-storm"
                  }
                ],
                resultText: "The wind throws Arthur against the Perron, but the stone keeps him from being swept into the trees.",
                elseResultText: "Arthur braces against the Perron until the worst of the wind passes."
              }
            ],
            nextStage: "aftermath",
            label: "Hold Fast to the Perron",
            resultText: "Arthur braces himself against the Perron and refuses to yield to the storm."
          },
          {
            id: "wait_out_storm",
            costs: [
              {
                type: "modifyResource",
                resource: "provisions",
                amount: -1
              }
            ],
            outcomes: [
              {
                type: "setRunFlag",
                flag: "barentonStormPassed",
                value: true
              }
            ],
            resultText: "The company waits beneath the roots. When the rain stops, every leaf in the hollow is turned toward the fountain.",
            nextStage: "aftermath",
            label: "Take Shelter and Wait Out the Storm"
          }
        ]
      },
      aftermath: {
        text: "The storm is gone as quickly as it came. Birds wheel above the hollow, and a rider in pale armor waits beside the fountain.",
        choices: [
          {
            id: "face_fountain_knight",
            label: "Accept the Fountain Knight's Trial",
            outcomes: [
              {
                type: "startCombat",
                combatId: "fountain_knight",
                victory: {
                  outcomes: [
                    {
                      type: "setRunFlag",
                      flag: "barentonOrdealComplete",
                      value: true
                    },
                    {
                      type: "conditional",
                      requirements: [
                        {
                          type: "availableExpeditionItem",
                          itemId: "flask"
                        }
                      ],
                      effects: [
                        {
                          type: "gainUniqueUnsecuredItem",
                          itemId: "water_of_barenton"
                        }
                      ],
                      resultText: "The water settles in Merlin's Flask and remains there. The ordeal is complete.",
                      elseEffects: [],
                      elseResultText: "The knight acknowledges the trial, but Arthur has no vessel in which to carry the water."
                    },
                    {
                      type: "randomChance",
                      chance: 0.3,
                      effects: [{ type: "gainUniqueUnsecuredItem", itemId: "shard_of_the_perron" }],
                      resultText: "A dark splinter breaks from the Perron and settles at Arthur's feet, warm with the force of the storm.",
                      elseEffects: [],
                    }
                  ],
                  resultText: "The Fountain Knight lowers his blade. \"You came to ask a question,\" he says. \"Now carry its answer carefully.\""
                },
                fled: {
                  outcomes: [],
                  resultText: "The Fountain Knight lets Arthur withdraw. The fountain remains beyond the reach of an unfinished question."
                }
              }
            ]
          },
          {
            id: "withdraw_from_trial",
            label: "Withdraw from the Trial",
            resultText: "Arthur lowers his weapon. The knight does not pursue, but the fountain gives no further sign.",
            endEncounter: true
          }
        ]
      }
    }
  },
  barenton_return_echo: {
    id: "barenton_return_echo",
    title: "The Quiet Fountain Road",
    description: "The road back is calmer now, but the forest remembers what happened at the water.",
    regionId: "broceliande",
    pathIds: ["fountain_of_barenton"],
    expeditionIds: ["fountain_of_barenton"],
    directions: ["returning"],
    weight: 8,
    minimumDistance: 2,
    maximumDistance: 80,
    tags: ["campaign", "fountain", "return", "callback"],
    repeatable: false,
    requirements: [
      {
        type: "runFlag",
        flag: "barentonOrdealComplete"
      }
    ],
    stages: {
      start: {
        text: "The birds are singing again. A traveler on the road pauses when he sees the sealed flask at Arthur's side, then decides not to ask about it.",
        choices: [
          {
            id: "keep_water_hidden",
            label: "Keep the Flask Covered",
            outcomes: [
              {
                type: "setRunFlag",
                flag: "barentonReturnNoticed",
                value: true
              }
            ],
            resultText: "Arthur keeps the vessel beneath his cloak and lets the road carry the silence onward.",
            endEncounter: true
          },
          {
            id: "show_the_flask",
            label: "Show Him the Vessel",
            resultText: "The traveler looks at the flask, shivers once, and steps off the road without explanation.",
            endEncounter: true
          }
        ]
      }
    }
  },
  fountain_barenton: {
    id: "fountain_barenton",
    title: "Fountain of Barenton",
    description: "A clear fountain rises from a hollow where the forest seems to hold its breath.",
    regionId: "broceliande",
    pathIds: ["legacy_fountain"],
    expeditionIds: ["fountain_of_barenton"],
    directions: ["outbound"],
    weight: 20,
    minimumDistance: 90,
    tags: ["campaign", "fountain", "mystery"],
    repeatable: false,
    requirements: [],
    stages: {
      start: {
        text: "The water is still enough to reflect the branches above it. Something about the fountain feels older than the road.",
        choices: [
          {
            id: "fill_flask",
            label: "Fill the Flask",
            requirements: [
              {
                type: "ownsItem",
                itemId: "flask",
                lockedLabel: "Requires the Flask"
              },
              {
                type: "notOwnsItem",
                itemId: "water_of_barenton",
                lockedLabel: "Already carrying the water"
              }
            ],
            outcomes: [
              {
                type: "gainUniqueUnsecuredItem",
                itemId: "water_of_barenton",
                resultText: "The Flask fills without disturbing the surface. The water feels cold even in Arthur's hand."
              }
            ],
            endEncounter: true
          },
          {
            id: "study_fountain",
            label: "Study the Fountain",
            outcomes: [
              {
                type: "conditional",
                requirements: [
                  {
                    type: "ownsItem",
                    itemId: "flask"
                  },
                  {
                    type: "notOwnsItem",
                    itemId: "water_of_barenton"
                  }
                ],
                effects: [],
                resultText: "The water appears significant, but Arthur has no vessel with which to carry it.",
                elseEffects: [
                  {
                    type: "conditional",
                    requirements: [
                      {
                        type: "ownsItem",
                        itemId: "water_of_barenton"
                      }
                    ],
                    effects: [],
                    resultText: "The fountain is unchanged. The water already secured rests safely in Arthur's keeping.",
                    elseEffects: [],
                    elseResultText: "The water appears significant, but Arthur has no suitable vessel with which to carry it."
                  }
                ],
                elseResultText: "The water appears significant, but Arthur has no suitable vessel with which to carry it."
              }
            ],
            resultText: "Arthur studies the fountain and remembers its place.",
            endEncounter: true
          },
          {
            id: "leave_fountain",
            label: "Leave the Fountain",
            resultText: "Arthur leaves the fountain and its unanswered promise.",
            endEncounter: true
          }
        ]
      }
    }
  },
  val_pleasant_clearing: {
    id: "val_pleasant_clearing",
    title: "A Pleasant Clearing",
    description: "A warm, dry clearing opens beside the road with food already laid out beneath the trees.",
    regionId: "broceliande",
    pathIds: ["val_sans_retour"],
    expeditionIds: ["val_sans_retour"],
    directions: ["outbound"],
    weight: 7,
    minimumDistance: 10,
    maximumDistance: 30,
    tags: ["campaign", "val", "risk_reward", "resting_place"],
    repeatable: false,
    requirements: [],
    stages: {
      start: {
        text: "The clearing is comfortable in a way the forest has not been. A bed of dry leaves waits beside a fire that gives off no smoke.",
        choices: [
          {
            id: "accept_clearing_comfort",
            label: "Accept the Comfort",
            outcomes: [
              {
                type: "modifyResource",
                resource: "health",
                amount: 4
              },
              {
                type: "modifyResource",
                resource: "provisions",
                amount: 2
              },
              {
                type: "setRunFlag",
                flag: "acceptedValFeast",
                value: true
              }
            ],
            resultText: "The company rests, eats, and wakes refreshed. For a little while Arthur cannot remember why the road felt urgent.",
            endEncounter: true
          },
          {
            id: "leave_clearing",
            label: "Leave the Clearing",
            outcomes: [
              {
                type: "setRunFlag",
                flag: "valComfortRejected",
                value: true
              }
            ],
            resultText: "Arthur thanks the clearing for its invitation and keeps walking before it can become a reason to stay.",
            endEncounter: true
          }
        ]
      }
    }
  },
  val_knight_who_will_not_leave: {
    id: "val_knight_who_will_not_leave",
    title: "The Knight Who Will Not Leave",
    description: "A mounted knight waits beside the road, able to ride out but endlessly certain that tomorrow will be safer.",
    regionId: "broceliande",
    pathIds: ["val_sans_retour"],
    expeditionIds: ["val_sans_retour"],
    directions: ["outbound"],
    weight: 5,
    minimumDistance: 15,
    maximumDistance: 40,
    tags: ["campaign", "val", "dialogue", "temptation"],
    repeatable: false,
    requirements: [],
    stages: {
      start: {
        text: "The knight's horse is saddled and sound. He says he will leave tomorrow, once the road is safer, his obligations are settled, and there is a better reason to hurry.",
        choices: [
          {
            id: "argue_for_departure",
            label: "Argue That He Should Leave",
            outcomes: [
              {
                type: "setRunFlag",
                flag: "valLoopSuspected",
                value: true
              }
            ],
            resultText: "The knight agrees with every argument and finds a new reason to remain. Arthur leaves him still preparing to depart.",
            endEncounter: true
          },
          {
            id: "inspire_him",
            label: "Remind Him of the Road",
            outcomes: [
              {
                type: "setRunFlag",
                flag: "valLoopSuspected",
                value: true
              }
            ],
            resultText: "The knight takes up his reins, then loosens them again. His thanks sounds like another postponement.",
            endEncounter: true
          },
          {
            id: "accept_his_logic",
            label: "Accept His Reasoning",
            outcomes: [
              {
                type: "setRunFlag",
                flag: "acceptedValFeast",
                value: true
              }
            ],
            resultText: "Arthur admits that the road can wait. The knight smiles as though Arthur has finally understood him.",
            endEncounter: true
          },
          {
            id: "leave_knight",
            label: "Leave Him to Tomorrow",
            resultText: "Arthur leaves the knight beside the road, where tomorrow appears to have been waiting for some time.",
            endEncounter: true
          }
        ]
      }
    }
  },
  val_false_knight: {
    id: "val_false_knight",
    title: "The False Knight",
    description: "A knight in familiar colors bars the road, but his story changes each time Arthur asks who sent him.",
    regionId: "broceliande",
    pathIds: ["val_sans_retour"],
    expeditionIds: ["val_sans_retour"],
    directions: ["outbound"],
    weight: 4,
    minimumDistance: 25,
    maximumDistance: 50,
    tags: ["campaign", "val", "combat", "confrontation"],
    repeatable: false,
    requirements: [],
    stages: {
      start: {
        text: "The knight demands that Arthur turn back. His badge is convincing at a glance, but the horse beneath him bears no matching mark.",
        choices: [
          {
            id: "challenge_false_knight",
            label: "Challenge Him",
            outcomes: [
              {
                type: "startCombat",
                combatId: "false_knight",
                victory: {
                  outcomes: [
                    {
                      type: "setRunFlag",
                      flag: "falseKnightDefeated",
                      value: true
                    }
                  ],
                  resultText: "The knight yields. Up close, the badge is only painted tin, and the voice beneath the helm sounds almost relieved."
                },
                fled: {
                  outcomes: [],
                  resultText: "The false knight lets Arthur pass, already changing his account of what happened."
                }
              }
            ]
          },
          {
            id: "question_false_knight",
            label: "Question the Story",
            outcomes: [
              {
                type: "setRunFlag",
                flag: "valLoopSuspected",
                value: true
              }
            ],
            resultText: "Arthur names the contradictions. The knight has no answer, and the road opens without a fight.",
            endEncounter: true
          },
          {
            id: "leave_false_knight",
            label: "Go Around Him",
            resultText: "Arthur leaves the false badge and its uncertain owner beside the road.",
            endEncounter: true
          }
        ]
      }
    }
  },
  val_repeated_road: {
    id: "val_repeated_road",
    title: "The Road You Have Already Taken",
    description: "A split birch, a boot-shaped hollow, and a strip of blue cloth make the next bend unmistakable.",
    regionId: "broceliande",
    pathIds: ["val_sans_retour"],
    expeditionIds: ["val_sans_retour"],
    directions: ["outbound"],
    weight: 6,
    minimumDistance: 30,
    maximumDistance: 55,
    tags: ["campaign", "val", "mystery", "loop"],
    repeatable: false,
    requirements: [],
    stages: {
      start: {
        text: "Arthur recognizes the bend. The same split birch stood behind him earlier, though the company has not turned around.",
        choices: [
          {
            id: "mark_the_road",
            label: "Mark the Road",
            outcomes: [
              {
                type: "setRunFlag",
                flag: "valLoopSuspected",
                value: true
              },
              {
                type: "setRunFlag",
                flag: "valLoopConfirmed",
                value: true
              },
              {
                type: "setRunFlag",
                flag: "valWayUnderstood",
                value: true
              },
              {
                type: "setCampaignFlagOnSafeReturn",
                flag: "val_way_understood",
                value: true
              }
            ],
            resultText: "Arthur cuts a mark into the birch. When he looks back, the mark is on the tree ahead instead.",
            endEncounter: true
          },
          {
            id: "continue_confidently",
            label: "Continue Confidently",
            outcomes: [
              {
                type: "setRunFlag",
                flag: "valLoopSuspected",
                value: true
              }
            ],
            resultText: "Arthur refuses to let a resemblance unsettle the company and continues along the familiar bend.",
            endEncounter: true
          },
          {
            id: "trust_woodcraft",
            label: "Trust Woodcraft",
            requirements: [
              {
                type: "knowledge",
                knowledgeId: "woodcraft",
                lockedLabel: "Requires Woodcraft"
              }
            ],
            outcomes: [
              {
                type: "setRunFlag",
                flag: "valLoopSuspected",
                value: true
              },
              {
                type: "setRunFlag",
                flag: "valLoopConfirmed",
                value: true
              },
              {
                type: "setRunFlag",
                flag: "valWayUnderstood",
                value: true
              },
              {
                type: "setCampaignFlagOnSafeReturn",
                flag: "val_way_understood",
                value: true
              }
            ],
            resultText: "The slope, roots, and old hoof marks confirm what Arthur already feared: the valley has folded the road over itself.",
            endEncounter: true
          }
        ]
      }
    }
  },
  val_impossible_boundary: {
    id: "val_impossible_boundary",
    title: "The Wall That Isn't There",
    description: "A hedge rises across the road, solid enough to stop the eye and thin enough to show the same road beyond it.",
    regionId: "broceliande",
    pathIds: ["val_sans_retour"],
    expeditionIds: ["val_sans_retour"],
    directions: ["outbound"],
    weight: 15,
    minimumDistance: 50,
    maximumDistance: 65,
    milestone: true,
    milestoneOrder: 50,
    tags: ["campaign", "val", "milestone", "reveal"],
    repeatable: false,
    requirements: [],
    stages: {
      start: {
        text: "The hedge has no gap. Yet the road beyond it is close enough to show the rain-dark stones. When Arthur reaches for a branch, his hand meets open air.",
        choices: [
          {
            id: "step_through_boundary",
            label: "Step Through the Empty Space",
            outcomes: [
              {
                type: "setRunFlag",
                flag: "valBoundaryRevealed",
                value: true
              }
            ],
            resultText: "The hedge vanishes beneath Arthur's hand. The road was never blocked; the valley only supplied a reason to believe it was.",
            endEncounter: true
          },
          {
            id: "test_boundary",
            label: "Test the Boundary Carefully",
            outcomes: [
              {
                type: "setRunFlag",
                flag: "valBoundaryRevealed",
                value: true
              }
            ],
            resultText: "Arthur tests the hedge with the flat of his blade. The blade meets nothing, and the certainty of the obstacle breaks.",
            endEncounter: true
          },
          {
            id: "wait_for_opening",
            label: "Wait for an Opening",
            outcomes: [
              {
                type: "setRunFlag",
                flag: "valLoopSuspected",
                value: true
              }
            ],
            resultText: "The hedge remains while Arthur waits. Eventually he walks around it and finds no wall at all.",
            endEncounter: true
          }
        ]
      }
    }
  },
  val_faithful_lady: {
    id: "val_faithful_lady",
    title: "The Faithful Lady",
    description: "A woman waits beside a ruined carriage, accused by an unseen voice of leaving someone behind.",
    regionId: "broceliande",
    pathIds: ["val_sans_retour"],
    expeditionIds: ["val_sans_retour"],
    directions: ["outbound"],
    weight: 4,
    minimumDistance: 55,
    maximumDistance: 75,
    tags: ["campaign", "val", "dialogue", "social"],
    repeatable: false,
    requirements: [
      {
        type: "runFlag",
        flag: "valBoundaryRevealed"
      }
    ],
    stages: {
      start: {
        text: "The lady says the valley keeps asking whether she is faithful. She answers that faithfulness is not the same as agreeing with every accusation.",
        choices: [
          {
            id: "believe_lady",
            label: "Take Her Account Seriously",
            outcomes: [
              {
                type: "setRunFlag",
                flag: "valLoopConfirmed",
                value: true
              },
              {
                type: "setRunFlag",
                flag: "valWayUnderstood",
                value: true
              },
              {
                type: "setCampaignFlagOnSafeReturn",
                flag: "val_way_understood",
                value: true
              }
            ],
            resultText: "Arthur tells her that a charge is not proof. The unseen voice falls quiet, displeased but unable to answer.",
            endEncounter: true
          },
          {
            id: "ask_what_she_knows",
            label: "Ask What She Knows of the Valley",
            outcomes: [
              {
                type: "setRunFlag",
                flag: "valLoopSuspected",
                value: true
              }
            ],
            resultText: "She says the valley does not forge chains; it offers reasons to hold them willingly.",
            endEncounter: true
          },
          {
            id: "leave_lady",
            label: "Leave Her in Peace",
            resultText: "Arthur leaves the lady with her own answer and does not repeat the valley's accusation.",
            endEncounter: true
          }
        ]
      }
    }
  },
  val_chapel: {
    id: "val_chapel",
    title: "The Chapel in the Val",
    description: "A small chapel stands in the valley, its door swollen by rain but its interior dry and unchanged.",
    regionId: "broceliande",
    pathIds: ["val_sans_retour"],
    expeditionIds: ["val_sans_retour"],
    directions: ["outbound"],
    weight: 4,
    minimumDistance: 55,
    maximumDistance: 80,
    tags: ["campaign", "val", "resting_place", "protection"],
    repeatable: false,
    requirements: [
      {
        type: "runFlag",
        flag: "valBoundaryRevealed"
      }
    ],
    stages: {
      start: {
        text: "There is no altar cloth and no priest, but the chapel's silence feels stable. A line scratched into the stone reads: \"Name what you know, and leave the rest unnamed.\"",
        choices: [
          {
            id: "take_chapel_counsel",
            label: "Take the Counsel",
            outcomes: [
              {
                type: "setRunFlag",
                flag: "chapelCounsel",
                value: true
              },
              {
                type: "modifyResource",
                resource: "faith",
                amount: 2
              },
              {
                type: "learnAbility",
                abilityId: "smite"
              },
              {
                type: "setRunFlag",
                flag: "valWayUnderstood",
                value: true
              },
              {
                type: "setCampaignFlagOnSafeReturn",
                flag: "val_way_understood",
                value: true
              }
            ],
            resultText: "Arthur repeats the line once and feels the valley's explanations lose some of their weight.",
            endEncounter: true
          },
          {
            id: "rest_in_chapel",
            label: "Rest in the Chapel",
            costs: [
              {
                type: "modifyResource",
                resource: "provisions",
                amount: -1
              }
            ],
            outcomes: [
              {
                type: "modifyResource",
                resource: "health",
                amount: 5
              },
              {
                type: "modifyResource",
                resource: "faith",
                amount: 1
              },
              {
                type: "setRunFlag",
                flag: "chapelCounsel",
                value: true
              },
              {
                type: "setRunFlag",
                flag: "valWayUnderstood",
                value: true
              },
              {
                type: "setCampaignFlagOnSafeReturn",
                flag: "val_way_understood",
                value: true
              }
            ],
            resultText: "The dry chapel gives the company a short, quiet rest and a steadier sense of what it has actually seen.",
            endEncounter: true
          },
          {
            id: "leave_chapel",
            label: "Leave the Chapel",
            resultText: "Arthur leaves the chapel's narrow certainty and returns to the road.",
            endEncounter: true
          }
        ]
      }
    }
  },
  val_miroir_aux_fees: {
    id: "val_miroir_aux_fees",
    title: "Miroir aux Fées",
    description: "A silvered mirror hangs between two trees and reflects a road that leads somewhere Arthur longs to see.",
    regionId: "broceliande",
    pathIds: ["val_sans_retour"],
    expeditionIds: ["val_sans_retour"],
    directions: ["outbound"],
    weight: 4,
    minimumDistance: 60,
    maximumDistance: 85,
    tags: ["campaign", "val", "mystery", "perception"],
    repeatable: false,
    requirements: [
      {
        type: "runFlag",
        flag: "valBoundaryRevealed"
      }
    ],
    stages: {
      start: {
        text: "The mirror shows Camelot's gates open and waiting. Arthur notices that the reflected leaves move before the wind reaches the real branches.",
        choices: [
          {
            id: "trust_reflection",
            label: "Trust What You See",
            outcomes: [
              {
                type: "modifyResource",
                resource: "health",
                amount: 2
              },
              {
                type: "setRunFlag",
                flag: "acceptedValFeast",
                value: true
              }
            ],
            resultText: "The reflection gives Arthur a moment of relief. When he turns away, the warmth remains but the road has shifted beneath it.",
            endEncounter: true
          },
          {
            id: "reject_reflection",
            label: "Reject the Image",
            resultText: "Arthur refuses to let the mirror decide what he wants. The silver surface clouds and shows only trees.",
            endEncounter: true
          },
          {
            id: "examine_inconsistencies",
            label: "Examine the Inconsistencies",
            requirements: [
              {
                type: "runFlag",
                flag: "chapelCounsel",
                unavailable: "locked",
                lockedLabel: "Requires the Chapel's Counsel"
              }
            ],
            outcomes: [
              {
                type: "gainUniqueUnsecuredItem",
                itemId: "black_glass_tear",
                resultText: "The false image fractures, leaving one black glass tear in the moss."
              },
              {
                type: "setRunFlag",
                flag: "valLoopConfirmed",
                value: true
              },
              {
                type: "setRunFlag",
                flag: "valWayUnderstood",
                value: true
              },
              {
                type: "setCampaignFlagOnSafeReturn",
                flag: "val_way_understood",
                value: true
              }
            ],
            resultText: "Arthur names the impossible details aloud. The mirror cannot keep the image coherent and goes dark.",
            endEncounter: true
          }
        ]
      }
    }
  },
  val_great_hall: {
    id: "val_great_hall",
    title: "The Great Hall",
    description: "A great hall stands where the road should be, offering warmth, food, recognition, and a chair already pulled out for Arthur.",
    regionId: "broceliande",
    pathIds: ["val_sans_retour"],
    expeditionIds: ["val_sans_retour"],
    directions: ["outbound"],
    weight: 4,
    minimumDistance: 75,
    maximumDistance: 95,
    tags: ["campaign", "val", "risk_reward", "resting_place"],
    repeatable: false,
    requirements: [
      {
        type: "runFlag",
        flag: "valBoundaryRevealed"
      }
    ],
    stages: {
      start: {
        text: "Servants know Arthur's name. The hall offers the exact food and rest the road has denied him, and no one asks him to explain why he should leave.",
        choices: [
          {
            id: "accept_val_feast",
            label: "Accept the Feast",
            outcomes: [
              {
                type: "modifyResource",
                resource: "health",
                amount: 5
              },
              {
                type: "modifyResource",
                resource: "provisions",
                amount: 4
              },
              {
                type: "setRunFlag",
                flag: "acceptedValFeast",
                value: true
              }
            ],
            resultText: "The meal is genuinely good. Arthur sleeps warm and wakes with the valley's comfort already sounding reasonable.",
            endEncounter: true
          },
          {
            id: "thank_and_leave_hall",
            label: "Thank Them and Leave",
            outcomes: [
              {
                type: "setRunFlag",
                flag: "valHallRejected",
                value: true
              }
            ],
            resultText: "Arthur leaves the warm hall before gratitude becomes an obligation. Behind him, the doors close without a sound.",
            endEncounter: true
          }
        ]
      }
    }
  },
  val_morgans_offer: {
    id: "val_morgans_offer",
    title: "Morgan's Offer",
    description: "Morgan waits at the edge of a road that seems to lead home, offering a reason to stop that sounds like wisdom.",
    regionId: "broceliande",
    pathIds: ["val_sans_retour"],
    expeditionIds: ["val_sans_retour"],
    directions: ["outbound"],
    weight: 20,
    minimumDistance: 90,
    maximumDistance: 102,
    milestone: true,
    milestoneOrder: 90,
    tags: ["campaign", "val", "milestone", "morgan", "temptation"],
    repeatable: false,
    requirements: [
      {
        type: "runFlag",
        flag: "valBoundaryRevealed"
      },
      {
        type: "anyOf",
        requirements: [
          {
            type: "runFlag",
            flag: "valWayUnderstood"
          },
          {
            type: "runFlag",
            flag: "valLoopConfirmed"
          },
          {
            type: "campaignFlag",
            flag: "val_way_understood"
          }
        ]
      }
    ],
    stages: {
      start: {
        text: "Morgan does not threaten Arthur. She asks why he keeps giving his strength to a search that consumes knights and calls the consumption duty.",
        choices: [
          {
            id: "accept_morgans_gift",
            label: "Accept a Place to Rest",
            outcomes: [
              {
                type: "modifyResource",
                resource: "health",
                amount: 6
              },
              {
                type: "modifyResource",
                resource: "provisions",
                amount: 5
              },
              {
                type: "setRunFlag",
                flag: "acceptedMorgansGift",
                value: true
              }
            ],
            resultText: "Morgan gives Arthur a road that leads toward warmth. It is the most sensible road he has seen all day.",
            endEncounter: true
          },
          {
            id: "refuse_morgans_offer",
            label: "Refuse the Offer",
            outcomes: [
              {
                type: "setRunFlag",
                flag: "morganOfferRefused",
                value: true
              }
            ],
            resultText: "Arthur tells Morgan that a difficult duty does not become vanity merely because it hurts.",
            endEncounter: true
          },
          {
            id: "ask_what_it_costs",
            label: "Ask What It Costs",
            outcomes: [
              {
                type: "setRunFlag",
                flag: "morganOfferRefused",
                value: true
              }
            ],
            resultText: "Morgan answers that the cost is only the part of Arthur that insists on continuing. Arthur declines the bargain.",
            endEncounter: true
          }
        ]
      }
    }
  },
  val_return_echo: {
    id: "val_return_echo",
    title: "The Val Lets Go",
    description: "On the return road, places that once seemed permanent look thin and ordinary.",
    regionId: "broceliande",
    pathIds: ["val_sans_retour"],
    expeditionIds: ["val_sans_retour"],
    directions: ["returning"],
    weight: 8,
    minimumDistance: 2,
    maximumDistance: 80,
    tags: ["campaign", "val", "return", "callback"],
    repeatable: false,
    requirements: [
      {
        type: "runFlag",
        flag: "valBoundaryRevealed"
      }
    ],
    stages: {
      start: {
        text: "The clearing is bare, the great hall is gone, and the knight who would not leave is nowhere on the road. Arthur cannot tell whether they escaped or were only explanations.",
        choices: [
          {
            id: "name_what_is_real",
            label: "Name What Is Real",
            outcomes: [
              {
                type: "setRunFlag",
                flag: "valReturnUnderstood",
                value: true
              }
            ],
            resultText: "Arthur names the road, the company, and the direction home. The valley offers no argument before falling behind them.",
            endEncounter: true
          },
          {
            id: "keep_walking_val",
            label: "Keep Walking",
            resultText: "Arthur does not look back. The road behind him grows ordinary one step at a time.",
            endEncounter: true
          }
        ]
      }
    }
  },
  morgans_voice: {
    id: "morgans_voice",
    title: "Morgan's Voice",
    description: "A woman's voice reaches Arthur through the valley without disturbing the air.",
    regionId: "broceliande",
    pathIds: ["val_sans_retour"],
    expeditionIds: ["val_sans_retour"],
    directions: ["outbound"],
    weight: 4,
    minimumDistance: 66,
    maximumDistance: 90,
    tags: ["campaign", "dialogue", "morgan"],
    repeatable: false,
    requirements: [
      {
        type: "runFlag",
        flag: "valBoundaryRevealed"
      }
    ],
    stages: {
      start: {
        text: "The voice names no speaker. It only asks whether Arthur truly intends to continue into the valley.",
        choices: [
          {
            id: "listen_to_voice",
            label: "Listen",
            outcomes: [
              {
                type: "setRunFlag",
                flag: "morganVoiceHeard",
                value: true
              },
              {
                type: "setCampaignFlag",
                flag: "morgan_voice_heard",
                value: true
              }
            ],
            resultText: "The voice fades, leaving a promise that something deeper in the valley is waiting.",
            endEncounter: true
          },
          {
            id: "ignore_voice",
            label: "Continue in Silence",
            resultText: "Arthur refuses to answer the unseen speaker.",
            endEncounter: true
          }
        ]
      }
    }
  },
  summoned_guardian: {
    id: "summoned_guardian",
    title: "Morgan's Guardian",
    description: "At the valley's deepest road, a guardian waits between Arthur and the reason he came.",
    regionId: "broceliande",
    pathIds: ["val_sans_retour"],
    expeditionIds: ["val_sans_retour"],
    directions: ["outbound"],
    weight: 20,
    minimumDistance: 100,
    maximumDistance: 120,
    milestone: true,
    milestoneOrder: 100,
    ignoreEncounterSpacing: true,
    tags: ["campaign", "combat", "guardian"],
    repeatable: false,
    requirements: [
      {
        type: "runFlag",
        flag: "morganOfferRefused"
      }
    ],
    stages: {
      start: {
        text: "The guardian rises without a word. Morgan's presence is nowhere visible, but the challenge is plain.",
        choices: [
          {
            id: "fight_guardian",
            label: "Face the Guardian",
            outcomes: [
              {
                type: "startCombat",
                combatId: "summoned_guardian",
                victory: {
                  outcomes: [
                    {
                      type: "setRunFlag",
                      flag: "guardianDefeated",
                      value: true
                    },
                    {
                      type: "gainUniqueUnsecuredItem",
                      itemId: "morgans_token",
                      resultText: "The guardian's remains harden into Morgan's Token."
                    }
                  ],
                  resultText: "The summoned guardian falls, leaving a dark token among the roots."
                },
                fled: {
                  outcomes: [],
                  resultText: "Arthur escapes the guardian, but the valley keeps its secret."
                }
              }
            ]
          }
        ]
      }
    }
  },
  road_that_remembers: {
    id: "road_that_remembers",
    title: "The Road That Remembers",
    description: "The road repeats pieces of Arthur's earlier journeys, but each familiar detail is subtly wrong.",
    regionId: "broceliande",
    pathIds: ["search_for_merlin"],
    expeditionIds: ["search_for_merlin"],
    directions: ["outbound"],
    weight: 20,
    minimumDistance: 34,
    maximumDistance: 48,
    milestone: true,
    milestoneOrder: 34,
    tags: ["campaign", "merlin", "supernatural", "navigation"],
    repeatable: false,
    requirements: [],
    stages: {
      start: {
        text: "A bridge from the Old Forest Road crosses the stream ahead, though Arthur remembers it standing somewhere else. The trees repeat the same crooked branch three times.",
        choices: [
          {
            id: "study_the_road",
            label: "Study the Road Normally",
            outcomes: [
              { type: "modifyResource", resource: "health", amount: -1 },
              { type: "setRunFlag", flag: "roadMemoryStudied", value: true }
            ],
            resultText: "Arthur studies the signs until the repeated road slips out of alignment. The company loses time, but finds the true track.",
            endEncounter: true
          },
          {
            id: "trust_memory",
            label: "Trust Arthur's Memory",
            outcomes: [
              { type: "modifyResource", resource: "distance", amount: 3 },
              { type: "setRunFlag", flag: "roadMemoryTrusted", value: true }
            ],
            resultText: "Arthur chooses the path he remembers. For a few steps the forest follows his recollection, then lets him pass at a cost in certainty.",
            endEncounter: true
          },
          {
            id: "use_water_of_barenton",
            label: "Consult the Water of Barenton",
            requirements: [
              { type: "ownsItem", itemId: "water_of_barenton", lockedLabel: "Requires the Water of Barenton" }
            ],
            outcomes: [
              { type: "learnKnowledge", knowledgeId: "woodcraft" },
              { type: "setRunFlag", flag: "roadMemoryRevealed", value: true }
            ],
            resultText: "Arthur holds the Water of Barenton up to the false trees. Their reflections point toward the one road that has no memory of him. The Water remains untouched.",
            endEncounter: true
          }
        ]
      }
    }
  },
  overgrown_trail_turnoff: {
    id: "overgrown_trail_turnoff",
    title: "The Overgrown Turnoff",
    description: "The Main Road narrows beside a trail swallowed by fern and thorn.",
    regionId: "broceliande",
    pathIds: ["old_forest_road"],
    expeditionIds: ["old_forest_road"],
    directions: ["outbound"],
    weight: 1,
    minimumDistance: 40,
    maximumDistance: 44,
    milestone: true,
    milestoneOrder: 40,
    ignoreEncounterSpacing: true,
    tags: ["path", "route"],
    repeatable: false,
    requirements: [],
    stages: {
      start: {
        text: "The clearer road continues ahead. A trail beside it disappears into thick undergrowth and seems to rejoin the road farther on.",
        choices: [
          {
            id: "take_overgrown_trail",
            label: "Take the Overgrown Trail",
            outcomes: [{ type: "changePath", pathId: "overgrown_trail" }],
            resultText: "The company takes the bounded Overgrown Trail. It will rejoin the Main Road near the deep forest.",
            endEncounter: true,
          },
          {
            id: "stay_main_road",
            label: "Stay on the Main Road",
            resultText: "Arthur keeps the company on the Main Road.",
            endEncounter: true,
          },
        ],
      },
    },
  },
  hollow_crown: {
    id: "hollow_crown",
    title: "The Hollow Crown",
    description: "A ruined ring of standing stones forms a crown without a king and blocks the deeper road.",
    regionId: "broceliande",
    pathIds: ["search_for_merlin"],
    expeditionIds: ["search_for_merlin"],
    directions: ["outbound"],
    weight: 20,
    minimumDistance: 68,
    maximumDistance: 78,
    milestone: true,
    milestoneOrder: 68,
    tags: ["campaign", "merlin", "threshold", "morgan"],
    repeatable: false,
    requirements: [],
    stages: {
      start: {
        text: "The stones lean inward over the road. Morgan's Token warms in Arthur's hand, and the empty crown seems to notice.",
        choices: [
          {
            id: "present_morgans_token",
            label: "Present Morgan's Token",
            requirements: [
              { type: "ownsItem", itemId: "morgans_token", lockedLabel: "Requires Morgan's Token" }
            ],
            outcomes: [
              { type: "setRunFlag", flag: "hollowCrownPassed", value: true }
            ],
            resultText: "Arthur presents Morgan's Token. The stones part without touching him. The token is not consumed; it was a sign, not a toll.",
            endEncounter: true
          },
          {
            id: "investigate_stones",
            label: "Investigate the Stones",
            outcomes: [
              { type: "modifyResource", resource: "health", amount: -2 },
              { type: "setRunFlag", flag: "hollowCrownInvestigated", value: true }
            ],
            resultText: "The stones whisper names that are not Arthur's. He finds a narrow gap and squeezes through, leaving blood on the old rock.",
            endEncounter: true
          },
          {
            id: "force_a_passage",
            label: "Force a Passage",
            outcomes: [
              { type: "modifyResource", resource: "health", amount: -5 },
              { type: "modifyResource", resource: "distance", amount: 4 }
            ],
            resultText: "Arthur forces the company through the leaning stones. The crown resists, then releases them with a violent shudder.",
            endEncounter: true
          },
          {
            id: "turn_back_from_crown",
            label: "Turn Back",
            resultText: "Arthur refuses to cross the hollow crown. The company keeps the road behind them open for another attempt.",
            endEncounter: true
          }
        ]
      }
    }
  },
  black_hound_of_the_hunt: {
    id: "black_hound_of_the_hunt",
    title: "The Black Hound of the Hunt",
    description: "A black hound watches from the ferns, too large for any mortal kennel and too patient to be mistaken for a wolf.",
    regionId: "broceliande",
    pathIds: ["search_for_merlin"],
    expeditionIds: ["search_for_merlin"],
    directions: ["outbound"],
    weight: 8,
    minimumDistance: 84,
    maximumDistance: 98,
    tags: ["campaign", "merlin", "combat", "hunt"],
    repeatable: false,
    requirements: [],
    stages: {
      start: {
        text: "The hound's eyes remain fixed on Arthur. Behind it, something has dragged a line through the moss as if the forest itself were being hunted.",
        choices: [
          {
            id: "fight_black_hound",
            label: "Face the Black Hound",
            outcomes: [{
              type: "startCombat",
              combatId: "black_hound_of_the_hunt",
              victory: {
                outcomes: [
                  { type: "rollLootTable", tableId: "uncommon_materials", chance: 0.8 },
                  { type: "rollLootTable", tableId: "forest_materials", chance: 0.8 }
                ],
                resultText: "The hound dissolves into black mist. The road is quiet, but the Hunt has learned Arthur's scent."
              },
              fled: { outcomes: [], resultText: "The hound lets the company run. Its paws never sound on the road behind them." }
            }]
          },
          {
            id: "slip_past_hound",
            label: "Slip into the Trees",
            resultText: "Arthur leads the company through the undergrowth. The hound watches them go, waiting for a more costly mistake.",
            endEncounter: true
          }
        ]
      }
    }
  },
  bound_warden: {
    id: "bound_warden",
    title: "The Bound Warden",
    description: "An ancient knight bound in old enchantment bars the last road to Merlin.",
    regionId: "broceliande",
    pathIds: ["search_for_merlin"],
    expeditionIds: ["search_for_merlin"],
    directions: ["outbound"],
    weight: 25,
    minimumDistance: 108,
    maximumDistance: 114,
    milestone: true,
    milestoneOrder: 110,
    ignoreEncounterSpacing: true,
    tags: ["campaign", "merlin", "combat", "guardian", "milestone"],
    repeatable: false,
    requirements: [
      { type: "notCampaignFlag", flag: "bound_warden_defeated" }
    ],
    stages: {
      start: {
        text: "The knight's armor is fused to its bones by a pale enchantment. It raises a heavy blade and takes the road as its oath.",
        choices: [
          {
            id: "fight_bound_warden",
            label: "Face the Bound Warden",
            outcomes: [{
              type: "startCombat",
              combatId: "bound_warden",
              victory: {
                outcomes: [
                  { type: "setCampaignFlag", flag: "bound_warden_defeated", value: true }
                ],
                resultText: "The Bound Warden falls to one knee. The enchantment breaks, but whatever it guarded remains beyond the next rise."
              },
              fled: { outcomes: [], resultText: "The Bound Warden does not pursue. It simply returns to the road and waits." }
            }]
          },
          {
            id: "turn_back_from_warden",
            label: "Turn Back",
            resultText: "Arthur turns back from the guardian. Merlin remains unreachable, but the road home is still open.",
            endEncounter: true
          }
        ]
      }
    }
  },
  merlin_found: {
    id: "merlin_found",
    title: "Merlin Found",
    description: "Beyond the guardian, a small clearing opens around a man who has been waiting beneath an ancient tree.",
    regionId: "broceliande",
    pathIds: ["search_for_merlin"],
    expeditionIds: ["search_for_merlin"],
    directions: ["outbound"],
    weight: 25,
    minimumDistance: 116,
    maximumDistance: 122,
    milestone: true,
    milestoneOrder: 118,
    ignoreEncounterSpacing: true,
    tags: ["campaign", "merlin", "milestone", "destination", "quest"],
    repeatable: false,
    requirements: [
      { type: "campaignFlag", flag: "bound_warden_defeated" }
    ],
    stages: {
      start: {
        text: "The man beneath the tree looks up before Arthur speaks. His eyes are tired, amused, and entirely unsurprised.",
        choices: [
          {
            id: "meet_merlin",
            label: "Meet Merlin",
            outcomes: [
              { type: "setCampaignFlag", flag: "merlin_found", value: true },
              { type: "gainUniqueUnsecuredItem", itemId: "merlins_seal" }
            ],
            resultText: "Arthur has finally found Merlin. Merlin says he knew Arthur would come, and that the Flask, the Water of Barenton, and Morgan's Token were the steps that made the meeting possible. The Grail quest lies beyond this unfinished chapter.",
            endEncounter: true
          }
        ]
      }
    }
  },
  leper_knight: {
    id: "leper_knight",
    title: "The Leper Knight",
    description: "A scarred knight rests beside a broken shrine, asking for neither pity nor trust.",
    regionId: "broceliande",
    pathIds: ["fountain_of_barenton"],
    expeditionIds: ["fountain_of_barenton"],
    directions: ["outbound", "returning"],
    weight: 4,
    minimumDistance: 18,
    maximumDistance: 86,
    tags: ["campaign", "barenton", "social", "combat", "moral"],
    repeatable: false,
    requirements: [],
    stages: {
      start: {
        text: "The knight's armor is clean but failing. He warns Arthur not to mistake his distance for contempt, then waits to see what sort of man has found him.",
        choices: [
          {
            id: "offer_aid",
            label: "Offer Bandages",
            requirements: [{ type: "availableExpeditionItem", itemId: "bandages", quantity: 1, lockedLabel: "Requires 1 Bandage" }],
            costs: [{ type: "consumeExpeditionItem", itemId: "bandages", quantity: 1 }],
            outcomes: [
              { type: "modifyResource", resource: "health", amount: 1 },
              { type: "setRunFlag", flag: "leperKnightAided", value: true },
              { type: "rollLootTable", tableId: "common_materials", chance: 0.5 },
              {
                type: "randomChance",
                chance: 0.3,
                effects: [{ type: "gainUniqueUnsecuredItem", itemId: "reliquary_of_saint_lazarus" }],
                resultText: "The knight presses a small reliquary into Arthur's palm. Saint Lazarus, he says, knew that mercy can be a kind of courage.",
                elseEffects: [],
              }
            ],
            resultText: "The knight accepts the bandage without touching Arthur's hand. In return he gives a brief warning about a spring guarded by something that does not fear steel.",
            endEncounter: true
          },
          {
            id: "speak_to_knight",
            label: "Speak with Him",
            outcomes: [{ type: "startDialogue", dialogueId: "leper_knight_dialogue" }],
            resultText: "Arthur speaks without stepping closer.",
            endEncounter: true
          },
          {
            id: "keep_distance",
            label: "Keep Your Distance",
            resultText: "Arthur leaves food beside the shrine and gives the knight room to choose whether to take it.",
            endEncounter: true
          },
          {
            id: "challenge_knight",
            label: "Drive Him from the Road",
            outcomes: [{
              type: "startCombat",
              combatId: "leper_knight",
              victory: {
                outcomes: [{ type: "setRunFlag", flag: "leperKnightDefeated", value: true }, { type: "rollLootTable", tableId: "forest_materials" }],
                resultText: "The knight yields and asks Arthur to remember that sickness is not the same thing as guilt."
              },
              fled: { outcomes: [], resultText: "The knight lets Arthur pass without pursuing the challenge." }
            }]
          }
        ]
      }
    }
  },
  serpent_at_spring: {
    id: "serpent_at_spring",
    title: "The Serpent at the Spring",
    description: "A scaled body lies beneath the clear water, bright-eyed and still until Arthur reaches for the bank.",
    regionId: "broceliande",
    pathIds: ["fountain_of_barenton"],
    expeditionIds: ["fountain_of_barenton"],
    directions: ["outbound", "returning"],
    weight: 5,
    minimumDistance: 28,
    maximumDistance: 88,
    tags: ["campaign", "barenton", "combat", "alchemical"],
    repeatable: true,
    maxOccurrencesPerRun: 2,
    requirements: [],
    stages: {
      start: {
        text: "The serpent rises between Arthur and the water. Its fangs carry a pale sheen that looks more like resin than venom.",
        choices: [
          {
            id: "fight_serpent",
            label: "Drive It from the Spring",
            outcomes: [{
              type: "startCombat",
              combatId: "serpent_at_spring",
              victory: {
                outcomes: [
                  { type: "setRunFlag", flag: "serpentDefeated", value: true },
                  { type: "rollLootTable", tableId: "forest_materials" },
                  { type: "rollLootTable", tableId: "uncommon_materials", chance: 0.65 }
                ],
                resultText: "The serpent dissolves into the reeds. A clear venomous residue remains on the stones, useful to anyone who knows alchemy."
              },
              fled: { outcomes: [], resultText: "The company retreats from the spring while the serpent settles back beneath the water." }
            }]
          },
          {
            id: "leave_serpent",
            label: "Leave the Water Untouched",
            resultText: "Arthur leaves the spring to its guardian and continues without testing the water.",
            endEncounter: true
          }
        ]
      }
    }
  },
  black_boar_of_broceliande: {
    id: "black_boar_of_broceliande",
    title: "The Black Boar of Broceliande",
    description: "A huge black boar tears at the roots beside the road, its bristles shining as though wet with ink.",
    regionId: "broceliande",
    pathIds: ["fountain_of_barenton"],
    expeditionIds: ["fountain_of_barenton"],
    directions: ["outbound", "returning"],
    weight: 4,
    minimumDistance: 38,
    maximumDistance: 88,
    tags: ["campaign", "barenton", "combat", "wildlife"],
    repeatable: true,
    maxOccurrencesPerRun: 1,
    requirements: [],
    stages: {
      start: {
        text: "The boar turns. It is too large for an ordinary animal, and the ground shudders before it moves.",
        choices: [
          {
            id: "fight_black_boar",
            label: "Face the Black Boar",
            outcomes: [{
              type: "startCombat",
              combatId: "black_boar_broceliande",
              victory: {
                outcomes: [
                  { type: "gainUnsecuredItem", itemId: "raw_meat", quantity: 2 },
                  { type: "rollLootTable", tableId: "forest_materials" }
                ],
                resultText: "The enchanted boar falls. Its meat is plentiful, and its hide is thick enough to be worth saving."
              },
              fled: { outcomes: [], resultText: "The company gives the boar the road. Its charge leaves the roots torn open behind it." }
            }]
          },
          {
            id: "avoid_black_boar",
            label: "Give It the Road",
            resultText: "Arthur waits behind the trees until the boar's heavy passage fades into the rain.",
            endEncounter: true
          }
        ]
      }
    }
  },
  charcoal_burner: {
    id: "charcoal_burner",
    title: "The Charcoal Burner",
    description: "A charcoal burner tends a low kiln beneath the older trees and watches the company through a veil of smoke.",
    regionId: "broceliande",
    pathIds: ["fountain_of_barenton"],
    expeditionIds: ["fountain_of_barenton"],
    directions: ["outbound", "returning"],
    weight: 5,
    minimumDistance: 12,
    maximumDistance: 82,
    tags: ["campaign", "barenton", "social", "knowledge"],
    repeatable: false,
    requirements: [],
    stages: {
      start: {
        text: "The burner points at the road, then at the company's provisions, as if asking which one Arthur thinks will last longer.",
        choices: [
          {
            id: "speak_with_burner",
            label: "Speak with Him",
            outcomes: [{ type: "startDialogue", dialogueId: "charcoal_burner_dialogue" }],
            resultText: "Arthur asks which trees the road is avoiding.",
            endEncounter: true
          },
          {
            id: "share_provisions",
            label: "Offer Provisions",
            costs: [{ type: "modifyResource", resource: "provisions", amount: -2 }],
            outcomes: [{ type: "rollLootTable", tableId: "forest_materials", chance: 0.7 }, { type: "setRunFlag", flag: "charcoalBurnerKindness", value: true }],
            resultText: "The burner accepts the food and points out a dry line through the roots where the company can make better time.",
            endEncounter: true
          },
          {
            id: "examine_kiln",
            label: "Examine the Kiln",
            outcomes: [{ type: "randomOne", options: [
              { weight: 45, resultText: "Arthur finds sound wood stacked beneath the kiln and adds it to the company's stores.", effects: [{ type: "rollLootTable", tableId: "common_materials" }] },
              { weight: 30, resultText: "The smoke stings Arthur's eyes, but the burner shows him a useful mark on the road.", effects: [{ type: "setRunFlag", flag: "charcoalBurnerMark", value: true }] },
              { weight: 25, resultText: "The work is too hot to inspect safely. Arthur backs away with nothing gained.", effects: [{ type: "modifyResource", resource: "health", amount: -1 }] }
            ] }],
            resultText: "Arthur studies the kiln and the tracks around it.",
            endEncounter: true
          },
          { id: "leave_burner", label: "Leave Him to His Work", resultText: "Arthur thanks the burner and keeps the company moving through the smoke.", endEncounter: true }
        ]
      }
    }
  },
  red_spring_white_spring: {
    id: "red_spring_white_spring",
    title: "The Red Spring and the White Spring",
    description: "Two small springs rise side by side: one stained red by the earth, the other pale as milk.",
    regionId: "broceliande",
    pathIds: ["fountain_of_barenton"],
    expeditionIds: ["fountain_of_barenton"],
    directions: ["outbound", "returning"],
    weight: 4,
    minimumDistance: 34,
    maximumDistance: 86,
    tags: ["campaign", "barenton", "water", "risk_reward"],
    repeatable: false,
    requirements: [],
    stages: {
      start: {
        text: "Neither spring smells foul. The red water seems warm; the white water seems to pull heat from the air around it.",
        choices: [
          {
            id: "drink_red_spring",
            label: "Drink from the Red Spring",
            outcomes: [{ type: "randomChance", chance: 0.62, effects: [{ type: "modifyResource", resource: "health", amount: 5 }], resultText: "The red water burns cleanly through Arthur's weariness.", elseEffects: [{ type: "applyInjury", target: "arthur", injuryId: "poisoned", source: "red-spring" }], elseResultText: "The red water turns bitter. Arthur staggers away with a sour taste and a tightening stomach." }],
            resultText: "Arthur cups the warm red water.",
            endEncounter: true
          },
          {
            id: "drink_white_spring",
            label: "Drink from the White Spring",
            outcomes: [{ type: "randomChance", chance: 0.58, effects: [{ type: "modifyResource", resource: "health", amount: 2 }], resultText: "The white water cools Arthur's throat and steadies his breathing.", elseEffects: [{ type: "applyInjury", target: "arthur", injuryId: "exhaustion", source: "white-spring" }], elseResultText: "The white water leaves Arthur cold to the bone. Even standing feels like work." }],
            resultText: "Arthur tastes the cold white water.",
            endEncounter: true
          },
          {
            id: "inspect_both_springs",
            label: "Inspect Both Springs",
            outcomes: [{ type: "setRunFlag", flag: "barentonTwinSpringsSeen", value: true }, { type: "learnKnowledge", knowledgeId: "woodcraft" }],
            resultText: "Arthur leaves both springs untouched and learns more from their banks than from their colors.",
            endEncounter: true
          },
          { id: "leave_springs", label: "Leave Them Alone", resultText: "Arthur leaves the two springs to their separate silence.", endEncounter: true }
        ]
      }
    }
  },
  pilgrims_wrong_fountain: {
    id: "pilgrims_wrong_fountain",
    title: "Pilgrims at the Wrong Fountain",
    description: "Three tired pilgrims have built a little shrine around an ordinary pool and insist they have found Barenton.",
    regionId: "broceliande",
    pathIds: ["fountain_of_barenton"],
    expeditionIds: ["fountain_of_barenton"],
    directions: ["outbound", "returning"],
    weight: 5,
    minimumDistance: 20,
    maximumDistance: 90,
    tags: ["campaign", "barenton", "social", "clue"],
    repeatable: false,
    requirements: [],
    stages: {
      start: {
        text: "The pool is clear, but no rain gathers above it and no old stone bears the marks described by the road's keeper.",
        choices: [
          {
            id: "examine_water",
            label: "Examine the Water",
            outcomes: [{ type: "setRunFlag", flag: "wrongFountainRecognized", value: true }],
            resultText: "Arthur finds nothing sacred in the pool except the pilgrims' need to believe they have arrived.",
            endEncounter: true
          },
          {
            id: "question_pilgrims",
            label: "Question the Pilgrims",
            outcomes: [{ type: "startDialogue", dialogueId: "pilgrims_wrong_fountain_dialogue" }],
            resultText: "Arthur asks who first named the pool Barenton.",
            endEncounter: true
          },
          {
            id: "share_with_pilgrims",
            label: "Share Provisions",
            costs: [{ type: "modifyResource", resource: "provisions", amount: -2 }],
            outcomes: [{ type: "setRunFlag", flag: "barentonClueHeard", value: true }, { type: "modifyResource", resource: "health", amount: 1 }],
            resultText: "The pilgrims share a direction in return: find the fountain where the old stones are wet without rain.",
            endEncounter: true
          },
          {
            id: "follow_their_directions",
            label: "Follow Their Directions",
            costs: [{ type: "modifyResource", resource: "provisions", amount: -1 }],
            outcomes: [{ type: "setRunFlag", flag: "wrongFountainFollowed", value: true }, { type: "modifyResource", resource: "health", amount: -1 }],
            resultText: "The pilgrims' directions lead Arthur in a careful half-circle before the true road appears again.",
            endEncounter: true
          },
          { id: "leave_pilgrims", label: "Leave Them to Their Shrine", resultText: "Arthur leaves the pilgrims with their pool and keeps the true fountain question to himself.", endEncounter: true }
        ]
      }
    }
  },
  knight_forgotten_name: {
    id: "knight_forgotten_name",
    title: "The Knight Who Forgot His Name",
    description: "A knight in a clean but ancient harness stands by the road, unable to say who he was before the valley.",
    regionId: "broceliande",
    pathIds: ["val_sans_retour"],
    expeditionIds: ["val_sans_retour"],
    directions: ["outbound", "returning"],
    weight: 4,
    minimumDistance: 18,
    maximumDistance: 72,
    tags: ["campaign", "val", "dialogue", "combat", "memory"],
    repeatable: false,
    requirements: [],
    stages: {
      start: {
        text: "The knight remembers a banner, a battle, and the feeling of having once been expected somewhere. His own name will not come.",
        choices: [
          { id: "ask_his_story", label: "Ask What He Remembers", outcomes: [{ type: "startDialogue", dialogueId: "forgotten_knight_dialogue" }], resultText: "Arthur asks the knight to begin with the last thing he knows.", endEncounter: true },
          {
            id: "challenge_forgotten_knight",
            label: "Challenge Him",
            outcomes: [{
              type: "startCombat",
              combatId: "false_knight",
              victory: {
                outcomes: [{ type: "setRunFlag", flag: "forgottenKnightDefeated", value: true }, { type: "startDialogue", dialogueId: "forgotten_knight_victory_dialogue" }],
                resultText: "The knight falls to one knee, still searching for the word that would make him whole."
              },
              fled: { outcomes: [], resultText: "The nameless knight watches Arthur leave, as if trying to remember whether they had met before." }
            }]
          },
          { id: "leave_nameless_knight", label: "Leave Him Be", resultText: "Arthur leaves the knight beside the road with his unfinished memory.", endEncounter: true }
        ]
      }
    }
  },
  morgans_huntsmen: {
    id: "morgans_huntsmen",
    title: "Morgan's Huntsmen",
    description: "Two retainers in green and black step from opposite sides of the road, bows already drawn.",
    regionId: "broceliande",
    pathIds: ["val_sans_retour"],
    expeditionIds: ["val_sans_retour"],
    directions: ["outbound", "returning"],
    weight: 5,
    minimumDistance: 28,
    maximumDistance: 92,
    tags: ["campaign", "val", "combat", "repeatable"],
    repeatable: true,
    maxOccurrencesPerRun: 2,
    requirements: [],
    stages: {
      start: {
        text: "The huntsmen do not announce a quarry. They only say that the road belongs to someone else today.",
        choices: [
          {
            id: "fight_huntsmen",
            label: "Fight the Huntsmen",
            outcomes: [{
              type: "startCombat",
              combatId: "morgans_huntsmen",
              victory: {
                outcomes: [{ type: "rollLootTable", tableId: "bandit_ambush_loot" }, { type: "randomChance", chance: 0.35, effects: [{ type: "modifyResource", resource: "provisions", randomMinimum: 2, randomMaximum: 4 }], resultText: "Their packs contain a small reserve of provisions.", elseEffects: [] }],
                resultText: "The two retainers retreat into the valley, leaving coins, gear, and a little food behind."
              },
              fled: { outcomes: [], resultText: "The huntsmen let the company run, calling after Arthur as if they know exactly where he is going." }
            }]
          },
          { id: "avoid_huntsmen", label: "Slip into the Trees", resultText: "Arthur waits until the huntsmen pass, their green cloaks fading into the valley's deeper green.", endEncounter: true }
        ]
      }
    }
  },
  briar_knight: {
    id: "briar_knight",
    title: "The Briar Knight",
    description: "A knight-shaped mass of thorn and rust blocks the road, moving only when the wind moves through it.",
    regionId: "broceliande",
    pathIds: ["val_sans_retour"],
    expeditionIds: ["val_sans_retour"],
    directions: ["outbound", "returning"],
    weight: 4,
    minimumDistance: 46,
    maximumDistance: 94,
    tags: ["campaign", "val", "combat", "enchanted"],
    repeatable: true,
    maxOccurrencesPerRun: 1,
    requirements: [],
    stages: {
      start: {
        text: "The briars have grown through armor, mail, and the place where a face should be. The thing raises a thorned blade as if remembering a drill.",
        choices: [
          {
            id: "fight_briar_knight",
            label: "Face the Briar Knight",
            outcomes: [{
              type: "startCombat",
              combatId: "briar_knight",
              victory: {
                outcomes: [
                  { type: "rollLootTable", tableId: "uncommon_materials", chance: 0.75 },
                  { type: "rollLootTable", tableId: "forest_materials" },
                  {
                    type: "randomChance",
                    chance: 0.3,
                    effects: [{ type: "gainUniqueUnsecuredItem", itemId: "thorn_of_the_dolorous_vale" }],
                    resultText: "The briars part around a thin black blade. It is light in Arthur's hand, but eager to draw blood.",
                    elseEffects: [],
                  },
                ],
                resultText: "The briars collapse into a dark heap. Beneath the thorns are rare herbs and a few pieces of old metal."
              },
              fled: { outcomes: [], resultText: "Arthur breaks away from the thorned blade before the road closes around him." }
            }]
          },
          { id: "go_around_briar_knight", label: "Go Around It", resultText: "The company searches for a gap while the briar knight waits without turning its head.", endEncounter: true }
        ]
      }
    }
  },
  sleeping_camp: {
    id: "sleeping_camp",
    title: "The Immaculate Camp",
    description: "A small camp waits beside the road with a warm fire, clean blankets, and food that has not cooled.",
    regionId: "broceliande",
    pathIds: ["val_sans_retour"],
    expeditionIds: ["val_sans_retour"],
    directions: ["outbound", "returning"],
    weight: 4,
    minimumDistance: 22,
    maximumDistance: 88,
    tags: ["campaign", "val", "resting_place", "temptation"],
    repeatable: false,
    requirements: [],
    stages: {
      start: {
        text: "The camp is not abandoned; it is simply waiting. The blankets smell of sun, and the food is exactly what the company would choose.",
        choices: [
          {
            id: "rest_in_camp",
            label: "Rest by the Fire",
            costs: [{ type: "modifyResource", resource: "provisions", amount: -2 }],
            outcomes: [{ type: "modifyResource", resource: "health", amount: 7 }, { type: "randomChance", chance: 0.3, effects: [{ type: "applyInjury", target: "arthur", injuryId: "exhaustion", source: "sleeping-camp" }], resultText: "The rest is deep enough to become difficult to leave.", elseEffects: [{ type: "setRunFlag", flag: "sleepingCampAccepted", value: true }], elseResultText: "Arthur sleeps lightly and wakes before the fire can decide to keep him." }],
            resultText: "Arthur accepts the immaculate camp's warmth.",
            endEncounter: true
          },
          {
            id: "eat_at_camp",
            label: "Eat the Fresh Food",
            outcomes: [{ type: "modifyResource", resource: "provisions", amount: 4 }, { type: "randomChance", chance: 0.4, effects: [{ type: "applyInjury", target: "arthur", injuryId: "exhaustion", source: "sleeping-camp-food" }], resultText: "The food is nourishing, but it leaves Arthur heavy and reluctant to stand.", elseEffects: [], elseResultText: "The meal restores enough strength to make the next stretch feel easy." }],
            resultText: "Arthur takes only what the road can carry.",
            endEncounter: true
          },
          {
            id: "search_sleeping_camp",
            label: "Search the Camp",
            outcomes: [{ type: "randomChance", chance: 0.5, effects: [{ type: "rollLootTable", tableId: "common_materials" }, { type: "setRunFlag", flag: "sleepingCampSearched", value: true }], resultText: "Under the clean blanket Arthur finds supplies laid out for someone who never arrived.", elseEffects: [{ type: "modifyResource", resource: "health", amount: -1 }], elseResultText: "The camp's order unsettles Arthur, and the company leaves before finding anything." }],
            resultText: "Arthur searches the firelit camp without sitting down.",
            endEncounter: true
          },
          { id: "leave_sleeping_camp", label: "Leave the Camp", resultText: "Arthur leaves the perfect fire and keeps the reason for its waiting to himself.", endEncounter: true }
        ]
      }
    }
  },
  feast_never_cools: {
    id: "feast_never_cools",
    title: "The Feast That Never Cools",
    description: "A small roadside table holds warm bread and fruit beneath an open sky, with no house or host nearby.",
    regionId: "broceliande",
    pathIds: ["val_sans_retour"],
    expeditionIds: ["val_sans_retour"],
    directions: ["outbound", "returning"],
    weight: 4,
    minimumDistance: 36,
    maximumDistance: 90,
    tags: ["campaign", "val", "risk_reward", "food"],
    repeatable: false,
    requirements: [],
    stages: {
      start: {
        text: "The food is fresh despite the rain. A second glance finds no footprints around the table, and the road remains empty in both directions.",
        choices: [
          {
            id: "take_little_food",
            label: "Take a Little Food",
            outcomes: [{ type: "modifyResource", resource: "provisions", amount: 3 }, { type: "setRunFlag", flag: "valRoadsideFoodTaken", value: true }],
            resultText: "Arthur takes enough for one meal and leaves the rest exactly as he found it.",
            endEncounter: true
          },
          {
            id: "sit_at_feast",
            label: "Sit and Eat",
            outcomes: [{ type: "modifyResource", resource: "provisions", amount: 6 }, { type: "randomChance", chance: 0.45, effects: [{ type: "applyInjury", target: "arthur", injuryId: "exhaustion", source: "feast-never-cools" }, { type: "setRunFlag", flag: "valRoadsideFeastAccepted", value: true }], resultText: "Arthur loses the better part of the day to the table, though the food never stops arriving.", elseEffects: [{ type: "setRunFlag", flag: "valRoadsideFeastAccepted", value: true }], elseResultText: "The meal is brief, generous, and hard to remember once the company stands." }],
            resultText: "Arthur sits at the roadside table.",
            endEncounter: true
          },
          {
            id: "inspect_feast",
            label: "Inspect the Food",
            outcomes: [{ type: "setRunFlag", flag: "valFeastExamined", value: true }, { type: "learnKnowledge", knowledgeId: "woodcraft" }],
            resultText: "The food has no source, no preparation site, and no reason to be warm. Arthur leaves it untouched.",
            endEncounter: true
          },
          { id: "refuse_feast", label: "Refuse the Invitation", resultText: "Arthur refuses the table's quiet invitation and keeps walking.", endEncounter: true }
        ]
      }
    }
  },
  woman_at_ford: {
    id: "woman_at_ford",
    title: "The Woman at the Ford",
    description: "A woman waits ankle-deep in the ford, asking whether Arthur truly knows where the road is taking him.",
    regionId: "broceliande",
    pathIds: ["val_sans_retour"],
    expeditionIds: ["val_sans_retour"],
    directions: ["outbound", "returning"],
    weight: 4,
    minimumDistance: 42,
    maximumDistance: 92,
    tags: ["campaign", "val", "social", "ambiguity"],
    repeatable: false,
    requirements: [],
    stages: {
      start: {
        text: "The water runs around the woman's boots without wetting them. She might be lost, testing Arthur, or waiting for someone who resembles him.",
        choices: [
          { id: "speak_carefully", label: "Speak Carefully", outcomes: [{ type: "startDialogue", dialogueId: "woman_at_ford_dialogue" }], resultText: "Arthur answers the question with one of his own.", endEncounter: true },
          {
            id: "help_at_ford",
            label: "Help Her Cross",
            costs: [{ type: "modifyResource", resource: "provisions", amount: -1 }],
            outcomes: [{ type: "randomChance", chance: 0.6, effects: [{ type: "setRunFlag", flag: "womanAtFordHelped", value: true }, { type: "setRunFlag", flag: "valPathClue", value: true }], resultText: "The woman points to a ford farther upstream where the stones are real.", elseEffects: [{ type: "modifyResource", resource: "health", amount: -1 }], elseResultText: "The woman is gone halfway across. Arthur's boots fill with cold water as he reaches the far bank." }],
            resultText: "Arthur offers the woman his hand.",
            endEncounter: true
          },
          {
            id: "cross_elsewhere",
            label: "Cross Somewhere Else",
            costs: [{ type: "modifyResource", resource: "provisions", amount: -1 }],
            outcomes: [{ type: "setRunFlag", flag: "valFordAvoided", value: true }],
            resultText: "Arthur follows the bank until the water is shallow enough to trust.",
            endEncounter: true
          },
          { id: "distrust_woman", label: "Distrust Her", outcomes: [{ type: "setRunFlag", flag: "womanAtFordDistrusted", value: true }], resultText: "Arthur refuses the ford. The woman smiles as if that was the answer she wanted.", endEncounter: true }
        ]
      }
    }
  },
  returning_knight: {
    id: "returning_knight",
    title: "The Knight Returning from the Val",
    description: "A mud-streaked knight walks toward Arthur, insisting that the road behind him is the only road that leads out.",
    regionId: "broceliande",
    pathIds: ["val_sans_retour"],
    expeditionIds: ["val_sans_retour"],
    directions: ["returning"],
    weight: 5,
    minimumDistance: 8,
    maximumDistance: 82,
    tags: ["campaign", "val", "navigation", "return"],
    repeatable: false,
    requirements: [],
    stages: {
      start: {
        text: "The knight knows several details about Arthur's camp and none about the place he claims to have left. He offers to lead the company back by a shorter route.",
        choices: [
          {
            id: "follow_returning_knight",
            label: "Follow His Route",
            costs: [{ type: "modifyResource", resource: "provisions", amount: -2 }],
            outcomes: [{ type: "randomChance", chance: 0.35, effects: [{ type: "modifyResource", resource: "distance", amount: 8 }, { type: "setRunFlag", flag: "returningKnightLoop", value: true }], resultText: "The knight leads Arthur through a bend that should not exist. When the company emerges, the road is farther from home.", elseEffects: [{ type: "setRunFlag", flag: "returningKnightTrusted", value: true }], elseResultText: "The knight's route reaches the familiar road and saves the company a long search." }],
            resultText: "Arthur follows the knight's certainty.",
            endEncounter: true
          },
          {
            id: "question_returning_knight",
            label: "Question Him",
            outcomes: [{ type: "setRunFlag", flag: "returningKnightQuestioned", value: true }, { type: "learnKnowledge", knowledgeId: "woodcraft" }],
            resultText: "The knight cannot name a single tree he passed. Arthur thanks him and chooses the road by its slope instead.",
            endEncounter: true
          },
          {
            id: "trust_own_route",
            label: "Trust Your Own Route",
            outcomes: [{ type: "setRunFlag", flag: "returningKnightRejected", value: true }],
            resultText: "Arthur declines the offered shortcut. The knight nods, relieved or disappointed, and keeps walking toward the valley.",
            endEncounter: true
          },
          { id: "challenge_returning_knight", label: "Challenge His Certainty", resultText: "Arthur asks the knight to prove the road is real. The knight has already vanished between two turns.", endEncounter: true }
        ]
      }
    }
  },
  ancient_spring: {
    id: "ancient_spring",
    title: "Ancient Spring",
    description: "A clear spring wells from beneath an old stone and gathers in a quiet basin beside the trail.",
    regionId: "broceliande",
    pathIds: ["old_forest_road", "overgrown_trail", "fountain_of_barenton", "val_sans_retour"],
    directions: ["outbound", "returning"],
    weight: 3,
    minimumDistance: 12,
    maximumDistance: 85,
    tags: ["resting_place", "water", "beneficial"],
    repeatable: false,
    requirements: [],
    stages: {
      start: {
        text: "The water looks impossibly clean. The company can pause for a drink, though the forest offers no promises.",
        choices: [
          {
            id: "gather_spring_growth",
            label: "Gather the Spring Growth with Woodcraft",
            requirements: [{ type: "knowledge", knowledgeId: "woodcraft", unavailable: "locked", lockedLabel: "Requires Woodcraft" }],
            outcomes: [
              { type: "gainUnsecuredItem", itemId: "fresh_herbs", quantity: 1 },
              { type: "gainUnsecuredItem", itemId: "wild_berries", quantity: 1 },
              {
                type: "randomChance",
                chance: 0.1,
                effects: [{ type: "gainUnsecuredItem", itemId: "rare_herbs", quantity: 1 }]
              }
            ],
            resultText: "Arthur gathers the clean herbs and berries growing beside the spring, leaving the water undisturbed.",
            endEncounter: true
          },
          {
            id: "drink_spring",
            label: "Drink from the Spring",
            outcomes: [
              {
                type: "randomChance",
                chance: 0.85,
                effects: [
                  {
                    type: "modifyResource",
                    resource: "health",
                    amount: 4
                  }
                ],
                resultText: "The cold water restores Arthur's strength and clears the road ahead.",
                elseEffects: [
                  {
                    type: "modifyResource",
                    resource: "health",
                    amount: -2
                  }
                ],
                elseResultText: "The water leaves Arthur dizzy and weak. The company moves on carefully."
              }
            ],
            pendingAction: {
              text: "Arthur kneels beside the old spring and cups the clear water in his hands...",
              delayProfile: "rest"
            },
            endEncounter: true
          },
          {
            id: "pass_spring",
            label: "Leave the Spring Alone",
            resultText: "Arthur leaves the clear spring untouched and keeps to the trail.",
            endEncounter: true
          }
        ]
      }
    }
  },
  too_perfect_grove: {
    id: "too_perfect_grove",
    title: "A Welcoming Grove",
    description: "A sheltered grove opens beside the road, dry, warm, and almost too perfectly suited for a rest.",
    regionId: "broceliande",
    pathIds: ["old_forest_road", "overgrown_trail"],
    directions: ["outbound", "returning"],
    weight: 2,
    minimumDistance: 20,
    maximumDistance: 90,
    tags: ["resting_place", "mystery", "risk_reward"],
    repeatable: false,
    requirements: [],
    stages: {
      start: {
        text: "The grove is so quiet that even the insects seem to be waiting for Arthur to decide.",
        choices: [
          {
            id: "rest_in_grove",
            label: "Rest in the Grove",
            costs: [
              {
                type: "modifyResource",
                resource: "provisions",
                amount: -1
              }
            ],
            outcomes: [
              {
                type: "randomChance",
                chance: 0.25,
                effects: [
                  {
                    type: "modifyResource",
                    resource: "health",
                    amount: -3
                  }
                ],
                resultText: "The perfect quiet breaks in Arthur's mind, and he leaves the grove more shaken than rested.",
                elseEffects: [
                  {
                    type: "modifyResource",
                    resource: "health",
                    amount: 5
                  }
                ],
                elseResultText: "The grove gives the company a calm hour of recovery before the road calls again."
              }
            ],
            pendingAction: {
              text: "Arthur and the company settle beneath the unnaturally still trees...",
              delayProfile: "rest"
            },
            endEncounter: true
          },
          {
            id: "keep_walking",
            label: "Keep Walking",
            resultText: "Arthur decides that a place this welcoming deserves caution and keeps the company moving.",
            endEncounter: true
          }
        ]
      }
    }
  },
  fallen_tree: {
    id: "fallen_tree",
    title: "Fallen Tree",
    description: "A large fallen tree blocks the path through the forest.",
    regionId: "broceliande",
    pathIds: ["old_forest_road", "overgrown_trail"],
    directions: ["outbound", "returning"],
    weight: 5,
    minimumDistance: 3,
    tags: ["obstacle", "road"],
    repeatable: false,
    requirements: [],
    stages: {
      start: {
        text: "The trunk is broad and tangled with wet branches. Arthur and Kay must find a way past.",
        choices: [
          {
            id: "climb_over",
            label: "Climb Over",
            outcomes: [
              {
                type: "randomChance",
                chance: 0.3,
                effects: [
                  {
                    type: "modifyResource",
                    resource: "health",
                    amount: -1
                  },
                  {
                    type: "applyInjury",
                    target: "arthur",
                    injuryId: "sprained_ankle",
                    source: "fallen-tree-climb"
                  }
                ],
                resultText: "A wet branch gives way as Arthur climbs. He lands hard on the far side and continues with a fresh injury.",
                elseResultText: "Arthur and Kay find firm footing and scramble safely over the trunk."
              }
            ],
            pendingAction: {
              text: "Arthur and Kay test the branches and begin climbing over the fallen trunk...",
              delayProfile: "physical"
            },
            endEncounter: true
          },
          {
            id: "clear_path",
            label: "Clear a Path",
            costs: [
              {
                type: "modifyResource",
                resource: "provisions",
                amount: -2
              }
            ],
            resultText: "Clearing the branches takes time and extra supplies, but no one is hurt.",
            pendingAction: {
              text: "Arthur and Kay drag the tangled branches aside to clear a passage...",
              delayProfile: "physical"
            },
            endEncounter: true
          },
          {
            id: "use_rope",
            label: "Use Rope",
            requirements: [
              {
                type: "carriedItem",
                itemId: "rope",
                unavailable: "locked",
                lockedLabel: "Requires Rope"
              }
            ],
            outcomes: [
              {
                type: "randomChance",
                chance: 0.2,
                effects: [
                  {
                    type: "modifyResource",
                    resource: "provisions",
                    amount: 1
                  }
                ],
                resultText: "The rope makes the passage easy, and Arthur recovers a small packet of usable trail food from the branches.",
                secondaryOutcome: {
                  chance: 0.12,
                  effects: [
                    {
                      type: "consumeExpeditionItem",
                      itemId: "rope",
                      quantity: 1
                    }
                  ],
                  resultText: "The rope catches on a jagged branch and frays beyond use as the company clears the trunk.",
                  elseResultText: "The rope holds firm and can be packed again after the crossing."
                }
              }
            ],
            resultText: "The rope provides an easy handline over the fallen trunk.",
            pendingAction: {
              text: "Arthur secures the rope and guides the company past the obstacle...",
              delayProfile: "physical"
            },
            endEncounter: true
          }
        ]
      }
    }
  }
});
