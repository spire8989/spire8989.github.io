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
    maximumDistance: 50,
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
                effects: [{ type: "modifyResource", resource: "health", amount: -1 }],
                resultText: "A wet branch gives way as Arthur climbs. He lands hard on the far side and continues with a fresh injury.",
                elseResultText: "Arthur and Kay find firm footing and scramble safely over the trunk.",
              },
            ],
            endEncounter: true,
          },
          {
            id: "clear_path",
            label: "Clear a Path",
            costs: [{ type: "modifyResource", resource: "provisions", amount: -2 }],
            resultText: "Clearing the branches takes time and extra supplies, but no one is hurt.",
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
            resultText: "The rope provides an easy handline over the fallen trunk.",
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
                type: "gainRandomUnsecuredItem",
                itemIds: ["old_coin", "hunting_supplies", "bandages", "rope"],
                quantity: 1,
              },
            ],
            resultText: "The search turns up one mundane item worth carrying home. It remains unsecured until a safe return.",
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
    maximumDistance: 80,
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
              { type: "modifyResource", resource: "health", randomMinimum: -6, randomMaximum: -2 },
              { type: "modifyResource", resource: "provisions", amount: 3 },
            ],
            resultText: "Arthur drives the boar down and the company gathers usable meat.",
            endEncounter: true,
          },
          {
            id: "drive_away",
            label: "Drive It Away",
            outcomes: [
              {
                type: "randomChance",
                chance: 0.15,
                effects: [{ type: "modifyResource", resource: "health", amount: -1 }],
              },
            ],
            resultText: "Arthur and Kay make enough noise to drive the animal into the brush.",
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
    pathIds: ["old_forest_road", "overgrown_trail"],
    directions: ["returning"],
    weight: 6,
    minimumDistance: 2,
    maximumDistance: 80,
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
                      [{ type: "modifyResource", resource: "provisions", amount: -1 }],
                      [{ type: "modifyResource", resource: "health", amount: -1 }],
                    ],
                  },
                ],
              },
            ],
            resultText: "Arthur and Kay press on through the failing light.",
            endEncounter: true,
          },
          {
            id: "slow_down",
            label: "Slow Down and Find the Trail",
            costs: [{ type: "modifyResource", resource: "provisions", amount: -2 }],
            resultText: "The careful search costs time and provisions, but the company finds the road and continues safely.",
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
    pathIds: ["old_forest_road", "overgrown_trail"],
    directions: ["outbound", "returning"],
    weight: 5,
    minimumDistance: 4,
    maximumDistance: 90,
    tags: ["water", "obstacle", "survival"],
    repeatable: false,
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
              effects: [{ type: "modifyResource", resource: "health", amount: -1 }],
            }],
            resultText: "Arthur and Kay struggle through the cold current and regain the path on the far bank.",
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
            resultText: "With a rope secured across the stream, the company crosses safely.",
            endEncounter: true,
          },
          {
            id: "better_crossing",
            label: "Search for a Better Crossing",
            costs: [{ type: "modifyResource", resource: "provisions", amount: -2 }],
            resultText: "The search costs time and provisions, but reveals a safer crossing.",
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
    pathIds: ["old_forest_road", "overgrown_trail"],
    directions: ["outbound", "returning"],
    weight: 5,
    minimumDistance: 5,
    maximumDistance: 90,
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
              type: "gainRandomUnsecuredItem",
              itemIds: ["bandages", "old_coin", "dried_herbs"],
              quantity: 1,
            }],
            resultText: "Arthur searches what remains beneath the overturned cart.",
            endEncounter: true,
          },
          {
            id: "search_for_owner",
            label: "Search the Woods for the Owner",
            nextStage: "vanishing_trail",
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
                type: "gainRandomUnsecuredItem",
                itemIds: ["dried_herbs", "strange_seeds"],
                quantity: 1,
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
              type: "gainRandomUnsecuredItem",
              itemIds: ["old_coin", "hunters_charm", "strange_seeds"],
              quantity: 1,
            }],
            resultText: "Arthur searches the cold ashes and the earth around the old fire.",
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
    pathIds: ["old_forest_road", "overgrown_trail"],
    directions: ["outbound", "returning"],
    weight: 5,
    minimumDistance: 5,
    maximumDistance: 90,
    tags: ["weather", "survival", "equipment"],
    repeatable: false,
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
                    itemIds: ["old_coin", "hunters_charm"],
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
              itemIds: ["old_coin", "hunters_charm"],
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

  shelter_before_nightfall: {
    id: "shelter_before_nightfall",
    title: "Shelter Before Nightfall",
    description: "Darkness gathers beneath the trees. Kay points toward a shallow rocky shelter beside the road.",
    regionId: "broceliande",
    pathIds: ["old_forest_road", "overgrown_trail"],
    directions: ["returning"],
    weight: 5,
    minimumDistance: 3,
    maximumDistance: 90,
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
                type: "gainRandomUnsecuredItem",
                itemIds: ["bandages", "old_coin"],
                quantity: 1,
              }],
            }],
            resultText: "Arthur searches the shallow shelter before moving on.",
            endEncounter: true,
          },
        ],
      },
    },
  },
});
