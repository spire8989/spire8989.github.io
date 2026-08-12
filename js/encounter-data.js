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
              },
            ],
            resultText: "The company scrambles across the trunk and continues down the road.",
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
                type: "expeditionItem",
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
            nextStage: "searched",
          },
          {
            id: "take_provisions",
            label: "Take the Remaining Provisions",
            outcomes: [{ type: "modifyResource", resource: "provisions", amount: 4 }],
            nextStage: "provisions_taken",
          },
          {
            id: "leave",
            label: "Leave It Alone",
            resultText: "Arthur leaves the silent camp undisturbed.",
            endEncounter: true,
          },
        ],
      },
      searched: {
        text: "The search turns up one mundane item worth carrying home. It remains unsecured until a safe return.",
        choices: [{ id: "continue", label: "Continue Journey", endEncounter: true }],
      },
      provisions_taken: {
        text: "Kay gathers the remaining food and adds it to the company's provisions.",
        choices: [{ id: "continue", label: "Continue Journey", endEncounter: true }],
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
            nextStage: "unknown_markings",
          },
          {
            id: "use_medallion",
            label: "Use Silver Stag Medallion",
            requirements: [
              {
                type: "expeditionItem",
                itemId: "silver_stag_medallion",
                unavailable: "hidden",
              },
            ],
            outcomes: [{ type: "setRunFlag", flag: "stagStoneDiscovered", value: true }],
            nextStage: "medallion_reacts",
          },
          {
            id: "leave",
            label: "Leave",
            resultText: "Arthur leaves the old stone and its mystery behind.",
            endEncounter: true,
          },
        ],
      },
      unknown_markings: {
        text: "Arthur studies the markings, but their meaning remains unknown.",
        choices: [{ id: "continue", label: "Continue Journey", endEncounter: true }],
      },
      medallion_reacts: {
        text: "The Silver Stag Medallion responds to the stone. Whatever this signifies remains unclear.",
        choices: [{ id: "continue", label: "Keep This Discovery Secret", endEncounter: true }],
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
                type: "expeditionItem",
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
});
