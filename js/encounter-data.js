"use strict";

// Encounter content is data. The manager and UI do not contain encounter-specific branches.
const ENCOUNTER_DEFINITIONS = Object.freeze({
  fallen_tree: {
    id: "fallen_tree",
    title: "Fallen Tree",
    description: "A large fallen tree blocks the road through the forest.",
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
                  { type: "modifyResource", resource: "health", amount: -1 },
                  { type: "applyInjury", target: "arthur", injuryId: "sprained_ankle", source: "fallen-tree-climb" },
                ],
                resultText: "A wet branch gives way as Arthur climbs. He lands hard on the far side and continues with a fresh injury.",
                elseResultText: "Arthur and Kay find firm footing and scramble safely over the trunk.",
              },
            ],
            pendingAction: {
              text: "Arthur and Kay test the branches and begin climbing over the fallen trunk...",
              delayProfile: "physical",
            },
            endEncounter: true,
          },
          {
            id: "clear_path",
            label: "Clear a Path",
            costs: [{ type: "modifyResource", resource: "provisions", amount: -2 }],
            resultText: "Clearing the branches takes time and extra supplies, but no one is hurt.",
            pendingAction: {
              text: "Arthur and Kay drag the tangled branches aside to clear a passage...",
              delayProfile: "physical",
            },
            endEncounter: true,
          },
          {
            id: "use_rope",
            label: "Use Rope",
            requirements: [
              {
                type: "carriedItem",
                itemId: "rope",
                unavailable: "locked",
                lockedLabel: "Requires Rope",
              },
            ],
            outcomes: [{
              type: "randomChance",
              chance: 0.2,
              effects: [{ type: "modifyResource", resource: "provisions", amount: 1 }],
              resultText: "The rope makes the passage easy, and Arthur recovers a small packet of usable trail food from the branches.",
              secondaryOutcome: {
                chance: 0.12,
                effects: [{ type: "consumeExpeditionItem", itemId: "rope", quantity: 1 }],
                resultText: "The rope catches on a jagged branch and frays beyond use as the company clears the trunk.",
                elseResultText: "The rope holds firm and can be packed again after the crossing.",
              },
            }],
            resultText: "The rope provides an easy handline over the fallen trunk.",
            pendingAction: {
              text: "Arthur secures the rope and guides the company past the obstacle...",
              delayProfile: "physical",
            },
            endEncounter: true,
          },
        ],
      },
    },
  },

  abandoned_camp: {
    id: "abandoned_camp",
    title: "Abandoned Camp",
    description: "A recently abandoned camp lies in a clearing beside the road.",
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
                  { itemId: "old_coin", weight: 5 },
                  { itemId: "bandages", weight: 5 },
                  { itemId: "dried_herbs", weight: 5 },
                  { itemId: "hunting_supplies", weight: 4 },
                  { itemId: "rope", weight: 3 },
                  { itemId: "silver_brooch", weight: 3 },
                  { itemId: "amber_beads", weight: 3 },
                  { itemId: "decorated_buckle", weight: 4 },
                  { itemId: "coin_purse", weight: 2 },
                ],
                quantity: 1,
                resultText: "Among the abandoned camp's scattered belongings, Arthur finds {itemName}.",
              },
              { type: "rollLootTable", tableId: "forest_encounter_forage", rolls: 1 },
            ],
            resultText: "The search turns up a small cache worth carrying home. Everything remains unsecured until a safe return.",
            pendingAction: {
              text: "Arthur searches the abandoned bedrolls, packs, and cold fire ring...",
              delayProfile: "search",
            },
            endEncounter: true,
          },
          {
            id: "take_provisions",
            label: "Take the Remaining Provisions",
            outcomes: [{ type: "modifyResource", resource: "provisions", amount: 4 }],
            resultText: "Kay gathers the remaining food and adds it to the company's provisions.",
            endEncounter: true,
          },
          {
            id: "leave",
            label: "Leave It Alone",
            resultText: "Arthur leaves the silent camp undisturbed.",
            endEncounter: true,
          },
        ],
      },
    },
  },

  fork_in_the_road: {
    id: "fork_in_the_road",
    title: "Fork in the Road",
    description: "The forest road divides beneath a dense canopy.",
    regionId: "broceliande",
    pathIds: ["old_forest_road"],
    directions: ["outbound"],
    weight: 5,
    minimumDistance: 7,
    maximumDistance: 40,
    tags: ["path", "choice"],
    repeatable: false,
    requirements: [],
    stages: {
      start: {
        text: "The main road continues ahead. A narrow, overgrown trail disappears between the older trees.",
        choices: [
          {
            id: "main_road",
            label: "Stay on the Main Road",
            outcomes: [{
              type: "randomChance",
              chance: 0.15,
              effects: [{ type: "gainUnsecuredItem", itemId: "dried_herbs", quantity: 1 }],
              resultText: "Along the clear verge, Arthur finds a small bundle of dried herbs dropped by an earlier traveler.",
            }],
            resultText: "Arthur keeps the company on the clearer road.",
            endEncounter: true,
          },
          {
            id: "overgrown_trail",
            label: "Take the Overgrown Trail",
            outcomes: [{ type: "changePath", pathId: "overgrown_trail" }],
            resultText: "The company turns onto the overgrown trail.",
            endEncounter: true,
          },
        ],
      },
    },
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
            endEncounter: true,
          },
          {
            id: "use_medallion",
            label: "Use Silver Stag Medallion",
            requirements: [
              {
                type: "equippedItem",
                itemId: "silver_stag_medallion",
                unavailable: "hidden",
              },
            ],
            outcomes: [{ type: "setRunFlag", flag: "stagStoneDiscovered", value: true }],
            resultText: "The Silver Stag Medallion responds to the stone. Whatever this signifies remains unclear.",
            endEncounter: true,
          },
          {
            id: "leave",
            label: "Leave",
            resultText: "Arthur leaves the old stone and its mystery behind.",
            endEncounter: true,
          },
        ],
      },
    },
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
                  outcomes: [{ type: "gainUnsecuredItem", itemId: "raw_meat", quantity: 3 }],
                  resultText: "The boar falls. Arthur recovers the meat before the company continues.",
                },
                fled: {
                  outcomes: [],
                  resultText: "The company escapes into the trees, leaving the boar and its meat behind.",
                },
              },
            ],
          },
          {
            id: "drive_away",
            label: "Drive It Away",
            outcomes: [
              {
                type: "randomChance",
                chance: 0.15,
                effects: [{ type: "modifyResource", resource: "health", amount: -1 }],
                resultText: "The boar lashes out before retreating, catching Arthur as it charges into the brush.",
                elseResultText: "Arthur and Kay make enough noise to drive the animal safely into the brush.",
              },
            ],
            endEncounter: true,
          },
          {
            id: "avoid",
            label: "Avoid It",
            costs: [{ type: "modifyResource", resource: "provisions", amount: -2 }],
            resultText: "The detour costs supplies, but the company avoids the animal.",
            endEncounter: true,
          },
        ],
      },
    },
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
                lockedLabel: "Requires 1 Torch",
              },
            ],
            costs: [{ type: "consumeExpeditionItem", itemId: "torch", quantity: 1 }],
            resultText: "By torchlight, Arthur and Kay continue safely along the road.",
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
                        effects: [{ type: "modifyResource", resource: "provisions", amount: -1 }],
                      },
                      {
                        resultText: "Arthur stumbles over a hidden root in the darkness and regains the road injured.",
                        effects: [{ type: "modifyResource", resource: "health", amount: -1 }],
                      },
                    ],
                  },
                ],
                elseResultText: "Arthur and Kay keep the fading road in sight and continue without mishap.",
              },
            ],
            endEncounter: true,
          },
          {
            id: "slow_down",
            label: "Slow Down and Find the Trail",
            costs: [{ type: "modifyResource", resource: "provisions", amount: -2 }],
            resultText: "The careful search costs time and provisions, but the company finds the road and continues safely.",
            pendingAction: {
              text: "Arthur slows the company and studies the ground for the safest line of the trail...",
              delayProfile: "search",
            },
            endEncounter: true,
          },
        ],
      },
    },
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
            outcomes: [{
              type: "randomChance",
              chance: 0.25,
              effects: [
                { type: "modifyResource", resource: "health", amount: -1 },
                { type: "applyInjury", target: "arthur", injuryId: "bruised_ribs", source: "swollen-stream" },
              ],
              resultText: "The current knocks Arthur against a submerged stone before the company reaches the far bank.",
              elseResultText: "Arthur and Kay keep their footing and wade safely through the cold current.",
            }],
            pendingAction: {
              text: "Arthur steps into the swollen stream and tests each foothold against the current...",
              delayProfile: "physical",
            },
            endEncounter: true,
          },
          {
            id: "use_rope",
            label: "Use the Rope",
            requirements: [{
              type: "carriedItem",
              itemId: "rope",
              unavailable: "locked",
              lockedLabel: "Requires Rope",
            }],
            outcomes: [{
              type: "randomChance",
              chance: 0.15,
              effects: [{ type: "gainUnsecuredItem", itemId: "hunting_supplies", quantity: 1 }],
              resultText: "The secured rope lets Arthur retrieve a small set of hooks and twine snagged beside the bank.",
              secondaryOutcome: {
                chance: 0.16,
                effects: [{ type: "consumeExpeditionItem", itemId: "rope", quantity: 1 }],
                resultText: "The current pulls the rope from its anchor and carries it downstream after the crossing.",
                elseResultText: "The rope comes free of the bank, ready to be used again.",
              },
            }],
            resultText: "With a rope secured across the stream, the company crosses safely.",
            pendingAction: {
              text: "Arthur secures the rope across the stream before the company begins crossing...",
              delayProfile: "physical",
            },
            endEncounter: true,
          },
          {
            id: "better_crossing",
            label: "Search for a Better Crossing",
            costs: [{ type: "modifyResource", resource: "provisions", amount: -2 }],
            resultText: "The search costs time and provisions, but reveals a safer crossing.",
            pendingAction: {
              text: "Arthur follows the bank in search of calmer water and firmer footing...",
              delayProfile: "search",
            },
            endEncounter: true,
          },
        ],
      },
    },
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
            requirements: [{
              type: "knowledge",
              knowledgeId: "woodcraft",
              unavailable: "locked",
              lockedLabel: "Requires Woodcraft",
            }],
            outcomes: [{ type: "modifyResource", resource: "provisions", amount: 5 }],
            resultText: "Arthur recognizes the useful plants and gathers a worthwhile supply.",
            pendingAction: {
              text: "Arthur searches the undergrowth for plants he recognizes as safe...",
              delayProfile: "search",
            },
            endEncounter: true,
          },
          {
            id: "gather_safe",
            label: "Gather What Looks Safe",
            outcomes: [
              { type: "modifyResource", resource: "provisions", amount: 2 },
              {
                type: "randomChance",
                chance: 0.2,
                effects: [{ type: "modifyResource", resource: "health", amount: -1 }],
                resultText: "Arthur gathers a small supply, but one of the plants leaves him sick and weakened.",
                elseResultText: "Arthur gathers a small supply of edible plants without ill effect.",
              },
              {
                type: "randomChance",
                chance: 0.2,
                effects: [{ type: "gainUnsecuredItem", itemId: "dried_herbs", quantity: 1 }],
              },
            ],
            pendingAction: {
              text: "Arthur compares leaves and roots, gathering only what appears safe...",
            },
            endEncounter: true,
          },
          {
            id: "keep_moving",
            label: "Keep Moving",
            resultText: "Arthur decides not to spend time searching the undergrowth.",
            endEncounter: true,
          },
        ],
      },
    },
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
            outcomes: [{
              type: "gainWeightedRandomUnsecuredItem",
              items: [
                { itemId: "bandages", weight: 5 },
                { itemId: "dried_herbs", weight: 5 },
                { itemId: "decorated_buckle", weight: 5 },
                { itemId: "silver_brooch", weight: 3 },
                { itemId: "coin_purse", weight: 3 },
                { itemId: "embroidered_gloves", weight: 2 },
                { itemId: "merchants_ring", weight: 2 },
                { itemId: "silver_cup", weight: 1 },
                { itemId: "gilded_brooch", weight: 0.6 },
              ],
              quantity: 1,
              resultText: "Beneath the overturned cart, Arthur finds {itemName} among the scattered cargo.",
            }],
            pendingAction: {
              text: "Arthur searches beneath the cart and through its scattered cargo...",
              delayProfile: "search",
            },
            endEncounter: true,
          },
          {
            id: "search_for_owner",
            label: "Search the Woods for the Owner",
            pendingAction: {
              text: "Arthur and Kay search the nearby woods for tracks or signs of passage...",
              delayProfile: "search",
            },
            branches: [
              {
                weight: 70,
                resultText: "Broken branches and disturbed leaves lead away from the road.",
                nextStage: "vanishing_trail",
              },
              {
                weight: 30,
                resultText: "Arthur and Kay search the nearby woods, but find no tracks clear enough to follow.",
                endEncounter: true,
              },
            ],
          },
          {
            id: "leave",
            label: "Leave It Alone",
            resultText: "Arthur leaves the abandoned cart behind.",
            endEncounter: true,
          },
        ],
      },
      vanishing_trail: {
        text: "Broken branches lead away from the road, but the trail disappears among the trees.",
        choices: [
          {
            id: "follow_trail",
            label: "Follow the Trail",
            costs: [{ type: "modifyResource", resource: "provisions", amount: -2 }],
            outcomes: [{
              type: "randomChance",
              chance: 0.4,
              effects: [{ type: "gainUnsecuredItem", itemId: "fine_hunting_knife", quantity: 1 }],
              resultText: "Beyond the last broken branch, Arthur finds a fine hunting knife half-hidden in the leaves.",
              elseResultText: "The broken branches grow sparse, and the trail fades completely among the trees.",
            }],
            pendingAction: {
              text: "Arthur follows the broken branches deeper into the woods...",
            },
            endEncounter: true,
          },
          {
            id: "return_to_road",
            label: "Return to the Road",
            resultText: "With the trail gone, Arthur and Kay return to the road.",
            endEncounter: true,
          },
        ],
      },
    },
  },

  white_hart: {
    id: "white_hart",
    title: "The White Hart",
    description: "A white stag stands motionless between the trees ahead. It watches Arthur without fear.",
    regionId: "broceliande",
    pathIds: ["overgrown_trail"],
    directions: ["outbound"],
    weight: 2,
    minimumDistance: 24,
    maximumDistance: 90,
    tags: ["mystery", "stag", "exploration"],
    repeatable: false,
    requirements: [],
    stages: {
      start: {
        text: "The hart waits in silence while the forest seems to hold its breath.",
        choices: [
          {
            id: "approach_slowly",
            label: "Approach Slowly",
            outcomes: [{ type: "setRunFlag", flag: "whiteHartSeen", value: true }],
            resultText: "The stag retreats deeper into the trees and disappears.",
            endEncounter: true,
          },
          {
            id: "follow_hart",
            label: "Follow It",
            costs: [{ type: "modifyResource", resource: "provisions", amount: -2 }],
            nextStage: "hart_disappears",
          },
          {
            id: "show_medallion",
            label: "Show the Silver Stag Medallion",
            requirements: [{
              type: "equippedItem",
              itemId: "silver_stag_medallion",
              unavailable: "hidden",
            }],
            outcomes: [{ type: "setRunFlag", flag: "whiteHartMedallionReaction", value: true }],
            resultText: "The stag's attention fixes upon the medallion. For several silent moments, neither animal nor man moves. The stag turns and disappears between two ancient oaks.",
            endEncounter: true,
          },
        ],
      },
      hart_disappears: {
        resultStage: true,
        text: "The hart leads Arthur away from the trail. For a moment it seems close enough to touch—then it is simply gone. Arthur finds a polished antler fragment where it disappeared.",
        outcomes: [{ type: "gainUnsecuredItem", itemId: "antler_fragment", quantity: 1 }],
      },
    },
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
            outcomes: [{ type: "setRunFlag", flag: "heardWhisperingOak", value: true }],
            resultText: "The sound seems to form words, but Arthur cannot understand them.",
            endEncounter: true,
          },
          {
            id: "examine_tree",
            label: "Examine the Tree",
            outcomes: [{
              type: "randomChance",
              chance: 0.45,
              effects: [{
                type: "gainWeightedRandomUnsecuredItem",
                items: [
                  { itemId: "dried_herbs", weight: 6 },
                  { itemId: "polished_agate", weight: 4 },
                  { itemId: "amber_beads", weight: 3 },
                  { itemId: "strange_seeds", weight: 1 },
                ],
                quantity: 1,
                resultText: "Among the oak's roots, Arthur finds {itemName}.",
              }],
              resultText: "Among the oak's roots, Arthur finds useful growth worth carrying home.",
              elseResultText: "Arthur examines the roots, bark, and fallen leaves, but finds nothing useful.",
            }],
            pendingAction: {
              text: "Arthur examines the ancient bark and searches among the oak's roots...",
            },
            endEncounter: true,
          },
          {
            id: "mark_bark",
            label: "Cut a Mark into the Bark",
            resultText: "Kay stops Arthur's hand. ‘Perhaps don't insult the strange tree.’",
            endEncounter: true,
          },
        ],
      },
    },
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
            costs: [{ type: "modifyResource", resource: "provisions", amount: -3 }],
            resultText: "After traveling for some time, the familiar landmark finally disappears behind them.",
            endEncounter: true,
          },
          {
            id: "leave_road",
            label: "Leave the Road",
            outcomes: [{
              type: "conditional",
              requirements: [{ type: "currentPath", pathId: "old_forest_road" }],
              effects: [{ type: "changePath", pathId: "overgrown_trail" }],
              elseEffects: [{ type: "modifyResource", resource: "provisions", amount: -1 }],
            }],
            resultText: "Arthur leaves the familiar way and chooses a different line through the forest.",
            endEncounter: true,
          },
          {
            id: "use_woodcraft",
            label: "Use Woodcraft",
            requirements: [{
              type: "knowledge",
              knowledgeId: "woodcraft",
              unavailable: "locked",
              lockedLabel: "Requires Woodcraft",
            }],
            outcomes: [{ type: "setRunFlag", flag: "impossibleRoadNoticed", value: true }],
            resultText: "Arthur studies the moss, slope, and direction of the fading light. Everything says they have been traveling forward.",
            pendingAction: {
              text: "Arthur studies the moss, slope, and fading light to judge the road's direction...",
              delayProfile: "search",
            },
            endEncounter: true,
          },
        ],
      },
    },
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
          { id: "enter", label: "Enter the Hollow", nextStage: "inside_hollow" },
          {
            id: "keep_moving",
            label: "Keep Moving",
            resultText: "Arthur leaves the hidden opening unexplored.",
            endEncounter: true,
          },
        ],
      },
      inside_hollow: {
        text: "The hollow is strangely still. Someone has arranged stones around the remains of an old fire.",
        choices: [
          {
            id: "search_fire",
            label: "Search the Fire",
            outcomes: [{
              type: "gainWeightedRandomUnsecuredItem",
              items: [
                { itemId: "old_coin", weight: 6 },
                { itemId: "polished_agate", weight: 5 },
                { itemId: "bronze_figurine", weight: 3 },
                { itemId: "carved_ivory_token", weight: 3 },
                { itemId: "hunters_charm", weight: 1 },
                { itemId: "strange_seeds", weight: 1 },
              ],
              quantity: 1,
              resultText: "Among the cold ashes and disturbed earth, Arthur finds {itemName}.",
            }],
            pendingAction: {
              text: "Arthur sifts through the cold ashes and searches the earth around the old fire...",
              delayProfile: "search",
            },
            endEncounter: true,
          },
          {
            id: "search_stones",
            label: "Search Beneath the Stones",
            outcomes: [{
              type: "randomChance",
              chance: 0.18,
              effects: [{ type: "gainUnsecuredItem", itemId: "green_glass_vial", quantity: 1 }],
              resultText: "Beneath the final stone, Arthur finds a tiny green glass vial sealed with black wax.",
              elseResultText: "Arthur finds nothing but damp earth, old ash, and insects beneath the stones.",
            }],
            pendingAction: {
              text: "Arthur kneels beside the old fire ring and moves the stones one by one...",
            },
            endEncounter: true,
          },
          {
            id: "leave",
            label: "Leave",
            resultText: "Arthur leaves the still hollow and returns to the trail.",
            endEncounter: true,
          },
        ],
      },
    },
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
            costs: [{ type: "modifyResource", resource: "provisions", amount: -2 }],
            resultText: "Arthur and Kay wait beneath the densest branches until the worst has passed.",
            pendingAction: {
              text: "Arthur and Kay shelter beneath the densest branches and wait for the storm to ease...",
              delayProfile: "rest",
            },
            endEncounter: true,
          },
          {
            id: "press_on",
            label: "Press On",
            outcomes: [{
              type: "randomChance",
              chance: 0.3,
              effects: [{ type: "modifyResource", resource: "health", amount: -1 }],
              resultText: "The driving rain makes every step treacherous. Arthur slips on the flooded road and presses on injured.",
              elseResultText: "Arthur and Kay endure the hard march and make it through the storm safely.",
            }],
            endEncounter: true,
          },
          {
            id: "use_cloak",
            label: "Use Traveler's Cloak",
            requirements: [{
              type: "carriedItem",
              itemId: "wayfarers_cloak",
              unavailable: "locked",
              lockedLabel: "Requires Traveler's Cloak",
            }],
            resultText: "The heavy travel cloak shields the company while the sudden storm passes.",
            endEncounter: true,
          },
        ],
      },
    },
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
            outcomes: [{
              type: "randomOne",
              options: [
                {
                  resultText: "Where the lights vanish, Arthur finds a cluster of strange seeds resting on the moss.",
                  effects: [{ type: "gainUnsecuredItem", itemId: "strange_seeds", quantity: 1 }],
                },
                {
                  resultText: "The lights lead Arthur in circles. By the time he regains the trail, the company has lost time and wasted supplies.",
                  effects: [{ type: "modifyResource", resource: "provisions", amount: -3 }],
                },
              ],
            }],
            pendingAction: {
              text: "Arthur follows the drifting lights between the trees...",
            },
            endEncounter: true,
          },
          {
            id: "watch_in_dark",
            label: "Extinguish the Torch and Watch",
            requirements: [{
              type: "carriedItem",
              itemId: "torch",
              unavailable: "locked",
              lockedLabel: "Requires 1 Torch",
            }],
            outcomes: [{ type: "setRunFlag", flag: "watchedStrangeLights", value: true }],
            resultText: "The lights drift closer for several moments, then vanish together.",
            endEncounter: true,
          },
          {
            id: "ignore",
            label: "Ignore Them",
            resultText: "Arthur keeps his attention on the trail and leaves the lights behind.",
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
            requirements: [{
              type: "availableExpeditionItem",
              itemId: "bandages",
              unavailable: "locked",
              lockedLabel: "Requires Bandages",
            }],
            costs: [{ type: "consumeExpeditionItem", itemId: "bandages", quantity: 1 }],
            outcomes: [{ type: "modifyResource", resource: "provisions", amount: 3 }],
            resultText: "The hunter thanks Arthur and shares some of his remaining provisions.",
            endEncounter: true,
          },
          {
            id: "leave",
            label: "Leave Him",
            resultText: "Arthur leaves the hunter beside the road.",
            endEncounter: true,
          },
        ],
      },
    },
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
            id: "reach_through",
            label: "Reach Through",
            outcomes: [{
              type: "randomOne",
              options: [
                {
                  resultText: "The hooked thorns catch Arthur's arm and cut deeply before he can reach the glint.",
                  effects: [{ type: "modifyResource", resource: "health", amount: -1 }],
                },
                {
                  resultText: "Arthur works his hand through the hooked branches and pulls the hidden object free.",
                  effects: [{
                    type: "gainRandomUnsecuredItem",
                    itemIds: ["old_coin", "silver_brooch", "decorated_buckle", "polished_agate"],
                    quantity: 1,
                  }],
                },
              ],
            }],
            pendingAction: {
              text: "Arthur reaches slowly through the hooked thorns toward the glint...",
            },
            endEncounter: true,
          },
          {
            id: "use_knife",
            label: "Use Hunting Knife",
            requirements: [{
              type: "availableExpeditionItem",
              itemId: "fine_hunting_knife",
              unavailable: "locked",
              lockedLabel: "Requires Fine Hunting Knife",
            }],
            outcomes: [{
              type: "gainRandomUnsecuredItem",
              itemIds: ["old_coin", "silver_brooch", "decorated_buckle", "polished_agate"],
              quantity: 1,
            }],
            resultText: "The keen knife cuts a safe opening through the thorns.",
            endEncounter: true,
          },
          {
            id: "leave",
            label: "Leave It",
            resultText: "Arthur decides the glint is not worth the thorns.",
            endEncounter: true,
          },
        ],
      },
    },
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
    stages: { start: {
      text: "A small edge gleams beneath a film of rainwater and dirt.",
      choices: [{
        id: "investigate",
        label: "Investigate",
        outcomes: [{
          type: "gainWeightedRandomUnsecuredItem",
          items: [
            { itemId: "old_coin", weight: 5 },
            { itemId: "decorated_buckle", weight: 5 },
            { itemId: "polished_agate", weight: 4 },
            { itemId: "silver_brooch", weight: 2 },
            { itemId: "amber_beads", weight: 2 },
          ],
          resultText: "Arthur brushes away the mud and finds {itemName}.",
        }],
        pendingAction: {
          text: "Arthur kneels and brushes the mud aside...",
          delayProfile: "physical",
        },
        endEncounter: true,
      }],
    } },
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
    stages: { start: {
      text: "The cloth is stained by rain, but the cord around it remains tightly knotted.",
      choices: [
        {
          id: "open_bundle",
          label: "Open the Bundle",
          outcomes: [{
            type: "gainWeightedRandomUnsecuredItem",
            items: [
              { itemId: "bandages", weight: 5 },
              { itemId: "dried_herbs", weight: 5 },
              { itemId: "old_coin", weight: 4 },
              { itemId: "coin_purse", weight: 3 },
              { itemId: "embroidered_gloves", weight: 2 },
            ],
            resultText: "Inside the bundle, Kay finds {itemName}.",
          }],
          pendingAction: {
            text: "Kay pulls the bundle free and cuts the cord...",
            delayProfile: "physical",
          },
          endEncounter: true,
        },
        { id: "leave", label: "Leave It", resultText: "Arthur leaves the weathered bundle beneath the hedge.", endEncounter: true },
      ],
    } },
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
    stages: { start: {
      text: "Only one smooth corner is visible between the thick roots.",
      choices: [
        {
          id: "dig_out",
          label: "Dig It Out",
          outcomes: [{
            type: "gainWeightedRandomUnsecuredItem",
            items: [
              { itemId: "bronze_figurine", weight: 5 },
              { itemId: "carved_ivory_token", weight: 5 },
              { itemId: "amber_beads", weight: 5 },
              { itemId: "hunters_charm", weight: 2 },
              { itemId: "antler_fragment", weight: 2 },
              { itemId: "green_glass_vial", weight: 1 },
            ],
            resultText: "Arthur clears the soil and draws out {itemName}.",
          }],
          pendingAction: {
            text: "Arthur clears away the damp soil around the roots...",
            delayProfile: "search",
          },
          endEncounter: true,
        },
        { id: "leave", label: "Leave It Buried", resultText: "Arthur leaves the half-buried object beneath the roots.", endEncounter: true },
      ],
    } },
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
    stages: { start: {
      text: "Mud covers one side, but the clasp is still closed.",
      choices: [
        {
          id: "pick_up",
          label: "Pick It Up",
          outcomes: [{
            type: "gainWeightedRandomUnsecuredItem",
            items: [
              { itemId: "old_coin", weight: 5 },
              { itemId: "coin_purse", weight: 4 },
              { itemId: "merchants_ring", weight: 2 },
            ],
            resultText: "Arthur checks the purse and recovers {itemName}.",
          }],
          pendingAction: { text: "Arthur lifts the purse from the wagon ruts and checks its contents...", delayProfile: "physical" },
          endEncounter: true,
        },
        { id: "leave", label: "Leave It", resultText: "Arthur leaves the purse beside the road.", endEncounter: true },
      ],
    } },
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
    stages: { start: {
      text: "The remaining boards creak over the open ravine.",
      choices: [
        {
          id: "cross_carefully",
          label: "Cross Carefully",
          outcomes: [{
            type: "randomChance", chance: 0.25,
            effects: [{ type: "modifyResource", resource: "health", amount: -1 }],
            resultText: "A plank breaks beneath Arthur. He catches the rail but reaches the far side injured.",
            elseResultText: "Arthur and Kay test each plank and cross the damaged bridge safely.",
          }],
          pendingAction: { text: "Arthur and Kay carefully cross the damaged bridge...", delayProfile: "physical" },
          endEncounter: true,
        },
        {
          id: "use_rope", label: "Use Rope",
          requirements: [{ type: "carriedItem", itemId: "rope", unavailable: "locked", lockedLabel: "Requires Rope" }],
          outcomes: [{
            type: "randomChance",
            chance: 0.18,
            effects: [{ type: "consumeExpeditionItem", itemId: "rope", quantity: 1 }],
            resultText: "The rope sacrifices itself as a handline; it snaps free once the company reaches the far side.",
            elseResultText: "The rope holds as a handline and comes free after the crossing.",
          }],
          resultText: "With the rope secured as a handline, the company crosses safely.",
          pendingAction: { text: "Arthur secures the rope across the broken span...", delayProfile: "physical" },
          endEncounter: true,
        },
        {
          id: "find_route", label: "Find Another Route",
          costs: [{ type: "modifyResource", resource: "provisions", amount: -3 }],
          resultText: "The company spends supplies on a long detour and reaches the far side safely.",
          pendingAction: { text: "Arthur searches the ravine for another crossing...", delayProfile: "search" },
          endEncounter: true,
        },
      ],
    } },
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
    stages: { start: {
      text: "The embers are warm and recent footprints circle the shelter.",
      choices: [
        {
          id: "wait", label: "Wait for the Hermit",
          outcomes: [{
            type: "randomChance", chance: 0.55,
            effects: [{
              type: "gainWeightedRandomUnsecuredItem",
              items: [{ itemId: "dried_herbs", weight: 3 }, { itemId: "bandages", weight: 2 }],
              resultText: "Nobody returns, but near the occupied shelter Arthur notices {itemName} left by the fire.",
            }],
            elseResultText: "Nobody returns. The warm embers and recent footprints are the only signs of the absent occupant.",
          }],
          pendingAction: { text: "Arthur and Kay wait quietly near the dying fire...", delayProfile: "rest" },
          endEncounter: true,
        },
        {
          id: "search", label: "Search the Shelter",
          outcomes: [{
            type: "randomChance", chance: 0.7,
            effects: [{
              type: "gainWeightedRandomUnsecuredItem",
              items: [
                { itemId: "dried_herbs", weight: 4 },
                { itemId: "bandages", weight: 4 },
                { itemId: "carved_ivory_token", weight: 2 },
              ],
              resultText: "Inside the recently occupied shelter, Arthur finds {itemName}.",
            }],
            elseResultText: "Arthur searches the crude shelter but finds nothing useful.",
          }],
          pendingAction: { text: "Arthur searches the crude shelter and the ground around the fire...", delayProfile: "search" },
          endEncounter: true,
        },
        { id: "leave", label: "Leave It Alone", resultText: "Arthur leaves the empty shelter and its absent occupant undisturbed.", endEncounter: true },
      ],
    } },
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
    stages: { start: {
      text: "The wolves keep pace just beyond the nearest trees.",
      choices: [
        {
          id: "stand_ground", label: "Stand Your Ground",
          outcomes: [{
            type: "startCombat",
            combatId: "wolves",
            victory: {
              outcomes: [{ type: "gainUnsecuredItem", itemId: "raw_meat", quantity: 3 }],
              resultText: "Arthur holds firm until the last wolf is driven down. The company gathers the meat the Material Bag can carry.",
            },
            fled: {
              outcomes: [],
              resultText: "The company breaks away from the pack and escapes deeper along the road.",
            },
          }],
        },
        {
          id: "throw_food", label: "Throw Them Food",
          costs: [{ type: "modifyResource", resource: "provisions", amount: -3 }],
          resultText: "The wolves seize the thrown food and disappear between the trees.",
          endEncounter: true,
        },
        {
          id: "make_noise", label: "Make Noise and Move Quickly",
          outcomes: [{
            type: "randomChance", chance: 0.45,
            effects: [{ type: "modifyResource", resource: "provisions", amount: -1 }],
            resultText: "The hurried retreat shakes loose a small share of supplies, but the wolves fall behind.",
            elseResultText: "The company's noise and quick pace drive the wolves away without loss.",
          }],
          pendingAction: { text: "Arthur and Kay shout and strike the trees as they move quickly onward...", delayProfile: "physical" },
          endEncounter: true,
        },
      ],
    } },
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
    stages: { start: {
      text: "Their blades are plain, but their stance says they have done this before.",
      choices: [
        {
          id: "fight",
          label: "Fight the Bandits",
          outcomes: [{
            type: "startCombat",
            combatId: "bandit_ambush",
            victory: {
              outcomes: [
                { type: "rollLootTable", tableId: "bandit_ambush_loot", rolls: 2 },
                {
                  type: "randomChance",
                  chance: 0.35,
                  effects: [{
                    type: "modifyResource",
                    resource: "provisions",
                    randomMinimum: 2,
                    randomMaximum: 4,
                  }],
                  resultText: "The bandits' packs contain a small reserve of provisions.",
                },
                {
                  type: "setRunFlag",
                  flag: "banditLeaderEligible",
                  value: true,
                  message: "A blackthorn mark suggests someone more important will come looking.",
                },
              ],
              resultText: "The two bandits fall back into the brush. Their blackthorn mark may draw a more dangerous pursuer.",
            },
            fled: {
              outcomes: [],
              resultText: "The company breaks from the ambush and leaves the bandits to the road.",
            },
          }],
        },
        {
          id: "break_through",
          label: "Break Through",
          costs: [{ type: "modifyResource", resource: "provisions", amount: -2 }],
          outcomes: [{
            type: "randomChance",
            chance: 0.25,
            effects: [{ type: "modifyResource", resource: "health", amount: -2 }],
            resultText: "Arthur forces a gap, but one blade catches him as the company gets past.",
            elseResultText: "Arthur drives through the gap before the bandits can close it.",
          }],
          endEncounter: true,
        },
        {
          id: "pay_toll",
          label: "Pay Their Toll",
          costs: [{ type: "modifyResource", resource: "goldCarried", amount: -4 }],
          resultText: "The bandits take the coins and vanish among the trees.",
          endEncounter: true,
        },
      ],
    } },
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
      { type: "runFlag", flag: "banditLeaderEligible" },
      { type: "notRunFlag", flag: "banditLeaderDefeated" },
    ],
    stages: { start: {
      text: "The captain's armor is better than the ambush crew's, and the road behind him is empty.",
      choices: [
        {
          id: "fight",
          label: "Face the Captain",
          outcomes: [{
            type: "startCombat",
            combatId: "bandit_leader",
            victory: {
              outcomes: [
                { type: "rollLootTable", tableId: "bandit_leader_loot", rolls: 2 },
                {
                  type: "setRunFlag",
                  flag: "banditLeaderDefeated",
                  value: true,
                  message: "The blackthorn band will trouble this road no more this season.",
                },
              ],
              resultText: "The bandit captain yields the road. His better-hidden purse confirms the rank he carried.",
            },
            fled: {
              outcomes: [],
              resultText: "The captain lets the company go, certain the road will offer another chance.",
            },
          }],
        },
        {
          id: "turn_back",
          label: "Turn Back",
          resultText: "Arthur turns away before the captain can force a costly fight.",
          endEncounter: true,
        },
      ],
    } },
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
    stages: { start: {
      text: "Rain and roots have worn the carved face almost smooth.",
      choices: [
        {
          id: "examine", label: "Examine the Shrine",
          outcomes: [{
            type: "randomChance", chance: 0.4,
            effects: [{
              type: "gainWeightedRandomUnsecuredItem",
              items: [
                { itemId: "old_coin", weight: 5 },
                { itemId: "silver_brooch", weight: 3 },
                { itemId: "bronze_figurine", weight: 2 },
                { itemId: "silver_reliquary", weight: 0.8 },
                { itemId: "jeweled_saints_locket", weight: 0.2 },
              ],
              resultText: "The symbols remain unclear, but among the fallen stones Arthur finds {itemName}.",
            }],
            elseResultText: "Arthur studies the worn symbols, but cannot interpret them and finds nothing hidden among the stones.",
          }],
          pendingAction: { text: "Arthur clears moss from the stones and examines the worn symbols...", delayProfile: "search" },
          endEncounter: true,
        },
        {
          id: "offering", label: "Leave an Offering",
          costs: [{ type: "modifyResource", resource: "provisions", amount: -2 }],
          outcomes: [{ type: "setRunFlag", flag: "waysideOfferingMade", value: true }],
          resultText: "Arthur leaves a small offering at the ruined shrine. Whether it matters remains unknown.",
          endEncounter: true,
        },
        { id: "leave", label: "Leave", resultText: "Arthur leaves the moss-covered shrine beside the road.", endEncounter: true },
      ],
    } },
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
    stages: { start: {
      text: "Roots cross the buried paving, and scattered roadside stones lean into the earth.",
      choices: [
        {
          id: "follow", label: "Follow the Old Road",
          outcomes: [
            { type: "setRunFlag", flag: "sunkenRoadExplored", value: true },
            {
              type: "randomChance", chance: 0.6,
              effects: [{
                type: "gainWeightedRandomUnsecuredItem",
                items: [
                  { itemId: "carved_ivory_token", weight: 4 },
                  { itemId: "bronze_figurine", weight: 4 },
                  { itemId: "merchants_ring", weight: 3 },
                  { itemId: "silver_cup", weight: 2 },
                  { itemId: "roman_signet", weight: 0.4 },
                ],
                resultText: "Along the buried route, Arthur finds {itemName} between the broken stones.",
              }],
              elseResultText: "Arthur follows the buried route until it vanishes beneath roots, finding no object worth carrying away.",
            },
          ],
          pendingAction: { text: "Arthur follows the broken paving deeper into the hollow...", delayProfile: "physical" },
          endEncounter: true,
        },
        {
          id: "search_stones", label: "Search the Roadside Stones",
          outcomes: [{
            type: "randomChance", chance: 0.65,
            effects: [{
              type: "gainWeightedRandomUnsecuredItem",
              items: [
                { itemId: "old_coin", weight: 5 },
                { itemId: "decorated_buckle", weight: 4 },
                { itemId: "polished_agate", weight: 4 },
              ],
              resultText: "Between the leaning roadside stones, Arthur finds {itemName}.",
            }],
            elseResultText: "Arthur searches the roadside stones but finds only soil, roots, and broken rock.",
          }],
          pendingAction: { text: "Arthur searches beneath the leaning stones along the buried road...", delayProfile: "search" },
          endEncounter: true,
        },
        { id: "return", label: "Return to the Trail", resultText: "Arthur returns to the overgrown trail without following the buried road.", endEncounter: true },
      ],
    } },
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
            costs: [{ type: "modifyResource", resource: "provisions", amount: -2 }],
            outcomes: [{ type: "modifyResource", resource: "health", amount: 1 }],
            resultText: "The brief rest restores some strength before the company returns to the road.",
            pendingAction: {
              text: "Arthur and Kay settle into the shelter and rest for a short while...",
              delayProfile: "rest",
            },
            endEncounter: true,
          },
          {
            id: "keep_moving",
            label: "Keep Moving",
            resultText: "Arthur chooses not to lose time and keeps moving toward safety.",
            endEncounter: true,
          },
          {
            id: "search_shelter",
            label: "Search the Shelter",
            outcomes: [{
              type: "randomChance",
              chance: 0.35,
              effects: [{
                type: "gainWeightedRandomUnsecuredItem",
                items: [
                  { itemId: "bandages", weight: 6 },
                  { itemId: "old_coin", weight: 5 },
                  { itemId: "polished_agate", weight: 4 },
                  { itemId: "silver_brooch", weight: 3 },
                  { itemId: "amber_beads", weight: 3 },
                  { itemId: "coin_purse", weight: 2 },
                ],
                quantity: 1,
                resultText: "Behind loose stones and old leaves, Arthur finds {itemName}.",
              }],
              elseResultText: "The shelter contains nothing useful beyond damp leaves and old ash.",
            }],
            pendingAction: {
              text: "Arthur searches behind loose stones and beneath the leaves inside the shelter...",
              delayProfile: "search",
            },
            endEncounter: true,
          },
        ],
      },
    },
  },

  hidden_flask: {
    id: "hidden_flask",
    title: "A Sealed Flask",
    description: "Something catches the light beneath a shelf of roots beside the old road.",
    regionId: "broceliande",
    pathIds: ["old_forest_road"],
    expeditionIds: ["old_forest_road"],
    directions: ["outbound"],
    weight: 0.8,
    minimumDistance: 28,
    maximumDistance: 95,
    tags: ["campaign", "discovery"],
    repeatable: false,
    requirements: [{ type: "notOwnsItem", itemId: "flask" }],
    stages: {
      start: {
        text: "The vessel is old, but its seal is unbroken. It may have been left here for a reason.",
        choices: [
          {
            id: "recover_flask",
            label: "Recover the Flask",
            outcomes: [{
              type: "gainUniqueUnsecuredItem",
              itemId: "flask",
              resultText: "Arthur takes the sealed flask. Its purpose is not yet clear.",
            }],
            pendingAction: { text: "Arthur reaches beneath the roots and carefully frees the sealed vessel...", delayProfile: "search" },
            endEncounter: true,
          },
          { id: "leave_flask", label: "Leave It Undisturbed", resultText: "Arthur leaves the sealed flask beneath the roots.", endEncounter: true },
        ],
      },
    },
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
    requirements: [{ type: "notUnlockedCompanion", companionId: "llamrei" }],
    stages: {
      start: {
        text: "The horse has no rider and no visible brand. She does not bolt when Arthur approaches.",
        choices: [
          {
            id: "approach_horse",
            label: "Approach the Horse",
            outcomes: [{
              type: "unlockCompanion",
              companionId: "llamrei",
            }],
            resultText: "The horse accepts Arthur's hand. Llamrei is willing to join the company.",
            pendingAction: { text: "Arthur lowers his voice and gives the horse time to decide...", delayProfile: "physical" },
            endEncounter: true,
          },
          { id: "leave_horse", label: "Leave Her in the Hollow", resultText: "Arthur leaves the horse where he found her.", endEncounter: true },
        ],
      },
    },
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
    stages: { start: {
      text: "One traveler says the fountain answers thunder. Another insists it answers only a knight who knows how to ask. Their fear is more consistent than their story.",
      choices: [
        {
          id: "compare_accounts",
          label: "Compare the Accounts",
          outcomes: [{ type: "setRunFlag", flag: "barentonClueHeard", value: true }],
          resultText: "Arthur keeps the useful part of the warning: water, stone, and weather belong to the same question.",
          endEncounter: true,
        },
        {
          id: "ask_for_directions",
          label: "Ask for the Old Road",
          outcomes: [{ type: "modifyResource", resource: "provisions", amount: 1 }],
          resultText: "A charcoal burner points toward the older trees and gives Kay a little food for the road.",
          endEncounter: true,
        },
        { id: "dismiss_rumors", label: "Dismiss the Rumors", resultText: "Arthur thanks the travelers and keeps the company moving.", endEncounter: true },
      ],
    } },
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
    stages: { start: {
      text: "The keeper does not reach for a weapon. He only rests one hand on a bull's horn and asks whether Arthur means to trouble the water.",
      choices: [
        {
          id: "question_keeper",
          label: "Question Him Respectfully",
          outcomes: [{ type: "setRunFlag", flag: "barentonKeeperWarned", value: true }],
          resultText: "The keeper gives no name. He says only: \"Pour upon the stone, and do not mistake the storm for an answer.\"",
          endEncounter: true,
        },
        {
          id: "use_woodcraft",
          label: "Read the Ground and the Herd",
          requirements: [{ type: "knowledge", knowledgeId: "woodcraft", unavailable: "locked", lockedLabel: "Requires Woodcraft" }],
          outcomes: [
            { type: "setRunFlag", flag: "barentonKeeperWarned", value: true },
            { type: "setRunFlag", flag: "barentonClueHeard", value: true },
          ],
          resultText: "The herd is arranged around a dry stone line. Arthur understands the keeper's direction without asking him to repeat it.",
          endEncounter: true,
        },
        {
          id: "challenge_keeper",
          label: "Challenge His Right to Block the Road",
          outcomes: [{ type: "setRunFlag", flag: "barentonKeeperDefied", value: true }],
          resultText: "The keeper steps aside, but his expression makes the gesture feel like a warning rather than a surrender.",
          endEncounter: true,
        },
      ],
    } },
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
    stages: { start: {
      text: "The silence is not peaceful. It feels arranged, as though the trees are waiting for a sound Arthur has not yet made.",
      choices: [
        {
          id: "listen_to_silence",
          label: "Listen and Mark the Place",
          outcomes: [{ type: "setRunFlag", flag: "barentonApproachSeen", value: true }],
          resultText: "Arthur marks the silent grove. Far ahead, water runs briefly uphill over a bed of black stones.",
          endEncounter: true,
        },
        { id: "move_quickly", label: "Move Quickly Through It", resultText: "The company crosses the silent ground without stopping to interpret it.", endEncounter: true },
      ],
    } },
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
    stages: { start: {
      text: "The stones are not a road, but they are too deliberately placed to be natural. The last marker points toward the sound of distant water.",
      choices: [
        {
          id: "follow_markers",
          label: "Follow the Markers",
          outcomes: [{ type: "setRunFlag", flag: "barentonApproachSeen", value: true }],
          resultText: "The markers bring Arthur to a rise from which the forest falls away toward the fountain hollow.",
          endEncounter: true,
        },
        {
          id: "leave_markers",
          label: "Leave Them Untouched",
          resultText: "Arthur leaves the old stones alone. Their line remains in the corner of his eye as the company passes.",
          endEncounter: true,
        },
      ],
    } },
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
    requirements: [{ type: "notRunFlag", flag: "barentonOrdealComplete" }],
    stages: {
      start: {
        text: "The fountain's surface is perfectly still. The Perron bears a shallow channel where water could be poured across its face.",
        choices: [
          {
            id: "fill_flask",
            label: "Try the Flask First",
            requirements: [{ type: "availableExpeditionItem", itemId: "flask", lockedLabel: "Requires Merlin's Flask" }],
            outcomes: [{ type: "setRunFlag", flag: "barentonWaterRefused", value: true }],
            resultText: "Arthur fills the flask. A moment later it is empty. There is no crack, no spill, and no sign of where the water went.",
            nextStage: "ritual",
          },
          {
            id: "study_perron",
            label: "Study the Stone",
            outcomes: [{ type: "setRunFlag", flag: "barentonClueUnderstood", value: true }],
            resultText: "The channel in the stone makes the old warning plain: the water must meet the stone before it can be carried away.",
            nextStage: "ritual",
          },
          { id: "leave_fountain", label: "Leave the Fountain Alone", resultText: "Arthur leaves the fountain untouched and keeps the unanswered ritual behind him.", endEncounter: true },
        ],
      },
      ritual: {
        text: "The forest is quiet enough for Arthur to hear the water moving beneath the basin. The next act will not be private.",
        choices: [
          {
            id: "pour_on_perron",
            label: "Pour Water Across the Perron",
            requirements: [{ type: "availableExpeditionItem", itemId: "flask", lockedLabel: "Requires Merlin's Flask" }],
            outcomes: [{ type: "setRunFlag", flag: "barentonRitualBegun", value: true }],
            resultText: "Arthur pours the water across the stone. The first drop strikes like a bell beneath the earth.",
            nextStage: "storm",
          },
          {
            id: "use_basin_water",
            label: "Use a Handful from the Basin",
            outcomes: [{ type: "setRunFlag", flag: "barentonRitualBegun", value: true }],
            resultText: "Arthur lets a handful of fountain water fall across the Perron. The forest answers at once.",
            nextStage: "storm",
          },
          { id: "step_away", label: "Step Away from the Stone", resultText: "Arthur decides that understanding the warning is not the same as accepting its cost.", endEncounter: true },
        ],
      },
      storm: {
        text: "The sky darkens without clouds. Rain strikes the hollow in a solid curtain while wind bends the trees away from the fountain.",
        choices: [
          {
            id: "shelter_with_cloak",
            label: "Shelter Beneath the Traveler's Cloak",
            requirements: [{ type: "carriedItem", itemId: "wayfarers_cloak", lockedLabel: "Requires Traveler's Cloak" }],
            outcomes: [{ type: "setRunFlag", flag: "barentonStormPassed", value: true }],
            resultText: "The cloak holds against the impossible rain. Arthur sees white birds fall silent in the branches, then take flight together.",
            nextStage: "aftermath",
          },
          {
            id: "hold_to_stone",
            outcomes: [
              { type: "setRunFlag", flag: "barentonStormPassed", value: true },
              {
                type: "randomChance", chance: 0.25,
                effects: [{ type: "modifyResource", resource: "health", amount: -2 }, { type: "applyInjury", target: "arthur", injuryId: "bruised_ribs", source: "barenton-storm" }],
                resultText: "The wind throws Arthur against the Perron, but the stone keeps him from being swept into the trees.",
                elseResultText: "Arthur braces against the Perron until the worst of the wind passes.",
              },
            ],
            nextStage: "aftermath",
          },
          {
            id: "wait_out_storm",
            costs: [{ type: "modifyResource", resource: "provisions", amount: -1 }],
            outcomes: [{ type: "setRunFlag", flag: "barentonStormPassed", value: true }],
            resultText: "The company waits beneath the roots. When the rain stops, every leaf in the hollow is turned toward the fountain.",
            nextStage: "aftermath",
          },
        ],
      },
      aftermath: {
        text: "The storm is gone as quickly as it came. Birds wheel above the hollow, and a rider in pale armor waits beside the fountain.",
        choices: [
          {
            id: "face_fountain_knight",
            label: "Accept the Fountain Knight's Trial",
            outcomes: [{ type: "startCombat", combatId: "fountain_knight", victory: {
              outcomes: [
                { type: "setRunFlag", flag: "barentonOrdealComplete", value: true },
                { type: "conditional", requirements: [{ type: "availableExpeditionItem", itemId: "flask" }], effects: [{ type: "gainUniqueUnsecuredItem", itemId: "water_of_barenton" }], resultText: "The water settles in Merlin's Flask and remains there. The ordeal is complete.", elseEffects: [], elseResultText: "The knight acknowledges the trial, but Arthur has no vessel in which to carry the water." },
              ],
              resultText: "The Fountain Knight lowers his blade. \"You came to ask a question,\" he says. \"Now carry its answer carefully.\"",
            }, fled: { outcomes: [], resultText: "The Fountain Knight lets Arthur withdraw. The fountain remains beyond the reach of an unfinished question." } }],
          },
          { id: "withdraw_from_trial", label: "Withdraw from the Trial", resultText: "Arthur lowers his weapon. The knight does not pursue, but the fountain gives no further sign.", endEncounter: true },
        ],
      },
    },
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
    requirements: [{ type: "runFlag", flag: "barentonOrdealComplete" }],
    stages: { start: {
      text: "The birds are singing again. A traveler on the road pauses when he sees the sealed flask at Arthur's side, then decides not to ask about it.",
      choices: [
        { id: "keep_water_hidden", label: "Keep the Flask Covered", outcomes: [{ type: "setRunFlag", flag: "barentonReturnNoticed", value: true }], resultText: "Arthur keeps the vessel beneath his cloak and lets the road carry the silence onward.", endEncounter: true },
        { id: "show_the_flask", label: "Show Him the Vessel", resultText: "The traveler looks at the flask, shivers once, and steps off the road without explanation.", endEncounter: true },
      ],
    } },
  },

  fountain_barenton: {
    id: "fountain_barenton",
    title: "Fountain of Barenton",
    description: "A clear fountain rises from a hollow where the forest seems to hold its breath.",
    regionId: "broceliande",
    // Retained as a compatibility fixture for old saved replay payloads. New
    // expeditions use barenton_fountain_ritual so water cannot be claimed
    // before the Perron and Fountain Knight ordeal.
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
              { type: "ownsItem", itemId: "flask", lockedLabel: "Requires the Flask" },
              { type: "notOwnsItem", itemId: "water_of_barenton", lockedLabel: "Already carrying the water" },
            ],
            outcomes: [{
              type: "gainUniqueUnsecuredItem",
              itemId: "water_of_barenton",
              resultText: "The Flask fills without disturbing the surface. The water feels cold even in Arthur's hand.",
            }],
            endEncounter: true,
          },
          {
            id: "study_fountain",
            label: "Study the Fountain",
            outcomes: [{
              type: "conditional",
              requirements: [
                { type: "ownsItem", itemId: "flask" },
                { type: "notOwnsItem", itemId: "water_of_barenton" },
              ],
              effects: [],
              resultText: "The water appears significant, but Arthur has no vessel with which to carry it.",
              elseEffects: [{
                type: "conditional",
                requirements: [{ type: "ownsItem", itemId: "water_of_barenton" }],
                effects: [],
                resultText: "The fountain is unchanged. The water already secured rests safely in Arthur's keeping.",
                elseEffects: [],
                elseResultText: "The water appears significant, but Arthur has no suitable vessel with which to carry it.",
              }],
              elseResultText: "The water appears significant, but Arthur has no suitable vessel with which to carry it.",
            }],
            resultText: "Arthur studies the fountain and remembers its place.",
            endEncounter: true,
          },
          { id: "leave_fountain", label: "Leave the Fountain", resultText: "Arthur leaves the fountain and its unanswered promise.", endEncounter: true },
        ],
      },
    },
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
    stages: { start: {
      text: "The clearing is comfortable in a way the forest has not been. A bed of dry leaves waits beside a fire that gives off no smoke.",
      choices: [
        {
          id: "accept_clearing_comfort",
          label: "Accept the Comfort",
          outcomes: [
            { type: "modifyResource", resource: "health", amount: 4 },
            { type: "modifyResource", resource: "provisions", amount: 2 },
            { type: "setRunFlag", flag: "acceptedValFeast", value: true },
          ],
          resultText: "The company rests, eats, and wakes refreshed. For a little while Arthur cannot remember why the road felt urgent.",
          endEncounter: true,
        },
        {
          id: "leave_clearing",
          label: "Leave the Clearing",
          outcomes: [{ type: "setRunFlag", flag: "valComfortRejected", value: true }],
          resultText: "Arthur thanks the clearing for its invitation and keeps walking before it can become a reason to stay.",
          endEncounter: true,
        },
      ],
    } },
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
    stages: { start: {
      text: "The knight's horse is saddled and sound. He says he will leave tomorrow, once the road is safer, his obligations are settled, and there is a better reason to hurry.",
      choices: [
        { id: "argue_for_departure", label: "Argue That He Should Leave", outcomes: [{ type: "setRunFlag", flag: "valLoopSuspected", value: true }], resultText: "The knight agrees with every argument and finds a new reason to remain. Arthur leaves him still preparing to depart.", endEncounter: true },
        { id: "inspire_him", label: "Remind Him of the Road", outcomes: [{ type: "setRunFlag", flag: "valLoopSuspected", value: true }], resultText: "The knight takes up his reins, then loosens them again. His thanks sounds like another postponement.", endEncounter: true },
        { id: "accept_his_logic", label: "Accept His Reasoning", outcomes: [{ type: "setRunFlag", flag: "acceptedValFeast", value: true }], resultText: "Arthur admits that the road can wait. The knight smiles as though Arthur has finally understood him.", endEncounter: true },
        { id: "leave_knight", label: "Leave Him to Tomorrow", resultText: "Arthur leaves the knight beside the road, where tomorrow appears to have been waiting for some time.", endEncounter: true },
      ],
    } },
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
    stages: { start: {
      text: "The knight demands that Arthur turn back. His badge is convincing at a glance, but the horse beneath him bears no matching mark.",
      choices: [
        {
          id: "challenge_false_knight",
          label: "Challenge Him",
          outcomes: [{ type: "startCombat", combatId: "false_knight", victory: {
            outcomes: [{ type: "setRunFlag", flag: "falseKnightDefeated", value: true }],
            resultText: "The knight yields. Up close, the badge is only painted tin, and the voice beneath the helm sounds almost relieved.",
          }, fled: { outcomes: [], resultText: "The false knight lets Arthur pass, already changing his account of what happened." } }],
        },
        { id: "question_false_knight", label: "Question the Story", outcomes: [{ type: "setRunFlag", flag: "valLoopSuspected", value: true }], resultText: "Arthur names the contradictions. The knight has no answer, and the road opens without a fight.", endEncounter: true },
        { id: "leave_false_knight", label: "Go Around Him", resultText: "Arthur leaves the false badge and its uncertain owner beside the road.", endEncounter: true },
      ],
    } },
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
    stages: { start: {
      text: "Arthur recognizes the bend. The same split birch stood behind him earlier, though the company has not turned around.",
      choices: [
        { id: "mark_the_road", label: "Mark the Road", outcomes: [{ type: "setRunFlag", flag: "valLoopSuspected", value: true }, { type: "setRunFlag", flag: "valLoopConfirmed", value: true }], resultText: "Arthur cuts a mark into the birch. When he looks back, the mark is on the tree ahead instead.", endEncounter: true },
        { id: "continue_confidently", label: "Continue Confidently", outcomes: [{ type: "setRunFlag", flag: "valLoopSuspected", value: true }], resultText: "Arthur refuses to let a resemblance unsettle the company and continues along the familiar bend.", endEncounter: true },
        { id: "trust_woodcraft", label: "Trust Woodcraft", requirements: [{ type: "knowledge", knowledgeId: "woodcraft", lockedLabel: "Requires Woodcraft" }], outcomes: [{ type: "setRunFlag", flag: "valLoopSuspected", value: true }, { type: "setRunFlag", flag: "valLoopConfirmed", value: true }], resultText: "The slope, roots, and old hoof marks confirm what Arthur already feared: the valley has folded the road over itself.", endEncounter: true },
      ],
    } },
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
    stages: { start: {
      text: "The hedge has no gap. Yet the road beyond it is close enough to show the rain-dark stones. When Arthur reaches for a branch, his hand meets open air.",
      choices: [
        { id: "step_through_boundary", label: "Step Through the Empty Space", outcomes: [{ type: "setRunFlag", flag: "valBoundaryRevealed", value: true }], resultText: "The hedge vanishes beneath Arthur's hand. The road was never blocked; the valley only supplied a reason to believe it was.", endEncounter: true },
        { id: "test_boundary", label: "Test the Boundary Carefully", outcomes: [{ type: "setRunFlag", flag: "valBoundaryRevealed", value: true }], resultText: "Arthur tests the hedge with the flat of his blade. The blade meets nothing, and the certainty of the obstacle breaks.", endEncounter: true },
        { id: "wait_for_opening", label: "Wait for an Opening", outcomes: [{ type: "setRunFlag", flag: "valLoopSuspected", value: true }], resultText: "The hedge remains while Arthur waits. Eventually he walks around it and finds no wall at all.", endEncounter: true },
      ],
    } },
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
    requirements: [{ type: "runFlag", flag: "valBoundaryRevealed" }],
    stages: { start: {
      text: "The lady says the valley keeps asking whether she is faithful. She answers that faithfulness is not the same as agreeing with every accusation.",
      choices: [
        { id: "believe_lady", label: "Take Her Account Seriously", outcomes: [{ type: "setRunFlag", flag: "valLoopConfirmed", value: true }], resultText: "Arthur tells her that a charge is not proof. The unseen voice falls quiet, displeased but unable to answer.", endEncounter: true },
        { id: "ask_what_she_knows", label: "Ask What She Knows of the Valley", outcomes: [{ type: "setRunFlag", flag: "valLoopSuspected", value: true }], resultText: "She says the valley does not forge chains; it offers reasons to hold them willingly.", endEncounter: true },
        { id: "leave_lady", label: "Leave Her in Peace", resultText: "Arthur leaves the lady with her own answer and does not repeat the valley's accusation.", endEncounter: true },
      ],
    } },
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
    requirements: [{ type: "runFlag", flag: "valBoundaryRevealed" }],
    stages: { start: {
      text: "There is no altar cloth and no priest, but the chapel's silence feels stable. A line scratched into the stone reads: \"Name what you know, and leave the rest unnamed.\"",
      choices: [
        { id: "take_chapel_counsel", label: "Take the Counsel", outcomes: [{ type: "setRunFlag", flag: "chapelCounsel", value: true }], resultText: "Arthur repeats the line once and feels the valley's explanations lose some of their weight.", endEncounter: true },
        { id: "rest_in_chapel", label: "Rest in the Chapel", costs: [{ type: "modifyResource", resource: "provisions", amount: -1 }], outcomes: [{ type: "modifyResource", resource: "health", amount: 5 }, { type: "setRunFlag", flag: "chapelCounsel", value: true }], resultText: "The dry chapel gives the company a short, quiet rest and a steadier sense of what it has actually seen.", endEncounter: true },
        { id: "leave_chapel", label: "Leave the Chapel", resultText: "Arthur leaves the chapel's narrow certainty and returns to the road.", endEncounter: true },
      ],
    } },
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
    requirements: [{ type: "runFlag", flag: "valBoundaryRevealed" }],
    stages: { start: {
      text: "The mirror shows Camelot's gates open and waiting. Arthur notices that the reflected leaves move before the wind reaches the real branches.",
      choices: [
        { id: "trust_reflection", label: "Trust What You See", outcomes: [{ type: "modifyResource", resource: "health", amount: 2 }, { type: "setRunFlag", flag: "acceptedValFeast", value: true }], resultText: "The reflection gives Arthur a moment of relief. When he turns away, the warmth remains but the road has shifted beneath it.", endEncounter: true },
        { id: "reject_reflection", label: "Reject the Image", resultText: "Arthur refuses to let the mirror decide what he wants. The silver surface clouds and shows only trees.", endEncounter: true },
        { id: "examine_inconsistencies", label: "Examine the Inconsistencies", requirements: [{ type: "runFlag", flag: "chapelCounsel", unavailable: "locked", lockedLabel: "Requires the Chapel's Counsel" }], outcomes: [{ type: "setRunFlag", flag: "valLoopConfirmed", value: true }], resultText: "Arthur names the impossible details aloud. The mirror cannot keep the image coherent and goes dark.", endEncounter: true },
      ],
    } },
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
    requirements: [{ type: "runFlag", flag: "valBoundaryRevealed" }],
    stages: { start: {
      text: "Servants know Arthur's name. The hall offers the exact food and rest the road has denied him, and no one asks him to explain why he should leave.",
      choices: [
        { id: "accept_val_feast", label: "Accept the Feast", outcomes: [{ type: "modifyResource", resource: "health", amount: 5 }, { type: "modifyResource", resource: "provisions", amount: 4 }, { type: "setRunFlag", flag: "acceptedValFeast", value: true }], resultText: "The meal is genuinely good. Arthur sleeps warm and wakes with the valley's comfort already sounding reasonable.", endEncounter: true },
        { id: "thank_and_leave_hall", label: "Thank Them and Leave", outcomes: [{ type: "setRunFlag", flag: "valHallRejected", value: true }], resultText: "Arthur leaves the warm hall before gratitude becomes an obligation. Behind him, the doors close without a sound.", endEncounter: true },
      ],
    } },
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
    requirements: [],
    stages: { start: {
      text: "Morgan does not threaten Arthur. She asks why he keeps giving his strength to a search that consumes knights and calls the consumption duty.",
      choices: [
        { id: "accept_morgans_gift", label: "Accept a Place to Rest", outcomes: [{ type: "modifyResource", resource: "health", amount: 6 }, { type: "modifyResource", resource: "provisions", amount: 5 }, { type: "setRunFlag", flag: "acceptedMorgansGift", value: true }], resultText: "Morgan gives Arthur a road that leads toward warmth. It is the most sensible road he has seen all day.", endEncounter: true },
        { id: "refuse_morgans_offer", label: "Refuse the Offer", outcomes: [{ type: "setRunFlag", flag: "morganOfferRefused", value: true }], resultText: "Arthur tells Morgan that a difficult duty does not become vanity merely because it hurts.", endEncounter: true },
        { id: "ask_what_it_costs", label: "Ask What It Costs", outcomes: [{ type: "setRunFlag", flag: "morganOfferRefused", value: true }], resultText: "Morgan answers that the cost is only the part of Arthur that insists on continuing. Arthur declines the bargain.", endEncounter: true },
      ],
    } },
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
    requirements: [{ type: "runFlag", flag: "valBoundaryRevealed" }],
    stages: { start: {
      text: "The clearing is bare, the great hall is gone, and the knight who would not leave is nowhere on the road. Arthur cannot tell whether they escaped or were only explanations.",
      choices: [
        { id: "name_what_is_real", label: "Name What Is Real", outcomes: [{ type: "setRunFlag", flag: "valReturnUnderstood", value: true }], resultText: "Arthur names the road, the company, and the direction home. The valley offers no argument before falling behind them.", endEncounter: true },
        { id: "keep_walking_val", label: "Keep Walking", resultText: "Arthur does not look back. The road behind him grows ordinary one step at a time.", endEncounter: true },
      ],
    } },
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
    requirements: [{ type: "runFlag", flag: "valBoundaryRevealed" }],
    stages: {
      start: {
        text: "The voice names no speaker. It only asks whether Arthur truly intends to continue into the valley.",
        choices: [
          {
            id: "listen_to_voice",
            label: "Listen",
            outcomes: [
              { type: "setRunFlag", flag: "morganVoiceHeard", value: true },
              { type: "setCampaignFlag", flag: "morgan_voice_heard", value: true },
            ],
            resultText: "The voice fades, leaving a promise that something deeper in the valley is waiting.",
            endEncounter: true,
          },
          { id: "ignore_voice", label: "Continue in Silence", resultText: "Arthur refuses to answer the unseen speaker.", endEncounter: true },
        ],
      },
    },
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
    requirements: [{ type: "notRunFlag", flag: "acceptedMorgansGift" }],
    stages: {
      start: {
        text: "The guardian rises without a word. Morgan's presence is nowhere visible, but the challenge is plain.",
        choices: [{
          id: "fight_guardian",
          label: "Face the Guardian",
          outcomes: [{
            type: "startCombat",
            combatId: "summoned_guardian",
            victory: {
              outcomes: [{
                type: "setRunFlag",
                flag: "guardianDefeated",
                value: true,
              }, {
                type: "gainUniqueUnsecuredItem",
                itemId: "morgans_token",
                resultText: "The guardian's remains harden into Morgan's Token.",
              }],
              resultText: "The summoned guardian falls, leaving a dark token among the roots.",
            },
            fled: { outcomes: [], resultText: "Arthur escapes the guardian, but the valley keeps its secret." },
          }],
        }],
      },
    },
  },

  merlins_prison: {
    id: "merlins_prison",
    title: "Voice in the Wood",
    description: "At the edge of the deepest wood, a voice answers from somewhere beyond sight.",
    regionId: "broceliande",
    pathIds: ["search_for_merlin"],
    expeditionIds: ["search_for_merlin"],
    directions: ["outbound"],
    weight: 20,
    minimumDistance: 100,
    maximumDistance: 125,
    tags: ["campaign", "merlin", "milestone"],
    repeatable: false,
    requirements: [],
    stages: {
      start: {
        text: "The wood closes around the road. Somewhere ahead, a familiar voice speaks Arthur's name.",
        choices: [{ id: "follow_voice", label: "Follow the Voice", resultText: "The search has reached a place the first expedition cannot yet explain.", endEncounter: true }],
      },
    },
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
    stages: { start: {
      text: "The water looks impossibly clean. The company can pause for a drink, though the forest offers no promises.",
      choices: [
        {
          id: "drink_spring",
          label: "Drink from the Spring",
          outcomes: [{ type: "randomChance", chance: 0.85, effects: [{ type: "modifyResource", resource: "health", amount: 4 }], resultText: "The cold water restores Arthur's strength and clears the road ahead.", elseEffects: [{ type: "modifyResource", resource: "health", amount: -2 }], elseResultText: "The water leaves Arthur dizzy and weak. The company moves on carefully." }],
          pendingAction: { text: "Arthur kneels beside the old spring and cups the clear water in his hands...", delayProfile: "rest" },
          endEncounter: true,
        },
        { id: "pass_spring", label: "Leave the Spring Alone", resultText: "Arthur leaves the clear spring untouched and keeps to the trail.", endEncounter: true },
      ],
    } },
  },

  too_perfect_grove: {
    id: "too_perfect_grove",
    title: "A Welcoming Grove",
    description: "A sheltered grove opens beside the road, dry, warm, and almost too perfectly suited for a rest.",
    regionId: "broceliande",
    pathIds: ["old_forest_road", "overgrown_trail", "fountain_of_barenton", "val_sans_retour"],
    directions: ["outbound", "returning"],
    weight: 2,
    minimumDistance: 20,
    maximumDistance: 90,
    tags: ["resting_place", "mystery", "risk_reward"],
    repeatable: false,
    requirements: [],
    stages: { start: {
      text: "The grove is so quiet that even the insects seem to be waiting for Arthur to decide.",
      choices: [
        {
          id: "rest_in_grove",
          label: "Rest in the Grove",
          costs: [{ type: "modifyResource", resource: "provisions", amount: -1 }],
          outcomes: [{ type: "randomChance", chance: 0.25, effects: [{ type: "modifyResource", resource: "health", amount: -3 }], resultText: "The perfect quiet breaks in Arthur's mind, and he leaves the grove more shaken than rested.", elseEffects: [{ type: "modifyResource", resource: "health", amount: 5 }], elseResultText: "The grove gives the company a calm hour of recovery before the road calls again." }],
          pendingAction: { text: "Arthur and the company settle beneath the unnaturally still trees...", delayProfile: "rest" },
          endEncounter: true,
        },
        { id: "keep_walking", label: "Keep Walking", resultText: "Arthur decides that a place this welcoming deserves caution and keeps the company moving.", endEncounter: true },
      ],
    } },
  },
});
