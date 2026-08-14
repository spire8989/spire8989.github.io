"use strict";

// Camp events use the same staged choice/outcome shape as travel encounters,
// but their reusable tables are selected from the expedition context.
const CAMP_EVENT_TABLE_DEFINITIONS = Object.freeze({
  forest_common: Object.freeze({
    id: "forest_common",
    entries: Object.freeze([
      Object.freeze({ eventId: "friendly_animal", weight: 24 }),
      Object.freeze({ eventId: "stranger_approaches", weight: 20 }),
      Object.freeze({ eventId: "strange_lights", weight: 18 }),
      Object.freeze({ eventId: "wounded_traveler", weight: 18 }),
    ]),
  }),
  forest_wildlife: Object.freeze({
    id: "forest_wildlife",
    entries: Object.freeze([
      Object.freeze({ eventId: "wolves_near_fire", weight: 20 }),
      Object.freeze({ eventId: "friendly_animal", weight: 16 }),
    ]),
  }),
  road_travelers: Object.freeze({
    id: "road_travelers",
    entries: Object.freeze([
      Object.freeze({ eventId: "stranger_approaches", weight: 22 }),
      Object.freeze({ eventId: "wounded_traveler", weight: 20 }),
      Object.freeze({ eventId: "friendly_animal", weight: 8 }),
    ]),
  }),
  deep_forest: Object.freeze({
    id: "deep_forest",
    entries: Object.freeze([
      Object.freeze({ eventId: "strange_lights", weight: 24 }),
      Object.freeze({ eventId: "wolves_near_fire", weight: 18 }),
      Object.freeze({ eventId: "wounded_traveler", weight: 10 }),
    ]),
  }),
});

const CAMP_EVENT_CONTEXT_TABLES = Object.freeze({
  regions: Object.freeze({
    broceliande: Object.freeze(["forest_common"]),
  }),
  paths: Object.freeze({
    old_forest_road: Object.freeze(["road_travelers"]),
    overgrown_trail: Object.freeze(["deep_forest"]),
    fountain_of_barenton: Object.freeze(["deep_forest"]),
    val_sans_retour: Object.freeze(["deep_forest"]),
    search_for_merlin: Object.freeze(["deep_forest"]),
  }),
});

const CAMP_EVENT_DEFINITIONS = Object.freeze({
  friendly_animal: {
    id: "friendly_animal",
    title: "A Quiet Visitor",
    description: "Something harmless wanders close to the edge of the firelight.",
    regionId: "broceliande",
    tags: ["friendly", "wildlife", "beneficial"],
    requirements: [],
    stages: { start: {
      text: "The animal pauses near the warmth, alert but not afraid.",
      choices: [
        {
          id: "leave_food",
          label: "Leave Out a Little Food",
          requirements: [{ type: "minimumResource", resource: "provisions", amount: 1, lockedLabel: "Requires 1 Provision" }],
          costs: [{ type: "modifyResource", resource: "provisions", amount: -1 }],
          outcomes: [{ type: "randomChance", chance: 0.7, effects: [{ type: "gainUnsecuredItem", itemId: "wild_berries", quantity: 1 }], resultText: "The visitor disappears into the dark, leaving a small clutch of berries near the fire.", elseResultText: "The visitor watches for a moment, then slips away without taking anything." }],
          resultText: "Arthur leaves a little food at the edge of the firelight.",
          endEncounter: true,
        },
        { id: "watch_quietly", label: "Watch Quietly", resultText: "The harmless visitor eventually wanders away, leaving the camp undisturbed.", endEncounter: true },
      ],
    } },
  },
  stranger_approaches: {
    id: "stranger_approaches",
    title: "Stranger Approaches",
    description: "A traveler notices the campfire and calls from just beyond the clearing.",
    regionId: "broceliande",
    tags: ["traveler", "neutral", "social"],
    requirements: [],
    stages: { start: {
      text: "The stranger waits for Arthur to decide whether the fire is welcoming.",
      choices: [
        {
          id: "invite_over",
          label: "Invite Them to the Fire",
          outcomes: [{ type: "randomOne", options: [
            { weight: 55, resultText: "The traveler shares a little trail food and a useful warning about the road ahead.", effects: [{ type: "modifyResource", resource: "provisions", amount: 2 }] },
            { weight: 30, resultText: "The traveler speaks at length about roads and weather, then moves on before dawn.", effects: [] },
            { weight: 15, resultText: "The stranger accepts the warmth but leaves before Arthur can learn much about them.", effects: [{ type: "modifyResource", resource: "provisions", amount: -1 }] },
          ] }],
          resultText: "Arthur makes room near the fire.",
          endEncounter: true,
        },
        { id: "question_them", label: "Question Them from a Distance", resultText: "The traveler answers cautiously, offers no clear explanation, and eventually continues on.", endEncounter: true },
        { id: "send_away", label: "Send Them Away", resultText: "The stranger fades back into the trees without argument.", endEncounter: true },
      ],
    } },
  },
  strange_lights: {
    id: "strange_lights",
    title: "Strange Lights",
    description: "Pale lights move between the trees beyond the reach of the fire.",
    regionId: "broceliande",
    tags: ["strange", "mystery", "risky"],
    requirements: [],
    stages: { start: {
      text: "The lights stop whenever Arthur looks directly at them, then begin moving again.",
      choices: [
        {
          id: "investigate_lights",
          label: "Investigate",
          outcomes: [{ type: "randomOne", options: [
            { weight: 45, resultText: "The lights vanish, but Arthur finds strange seeds resting on the moss.", effects: [{ type: "gainUnsecuredItem", itemId: "strange_seeds", quantity: 1 }] },
            { weight: 35, resultText: "The lights lead Arthur in a circle before disappearing. The wasted effort leaves him shaken.", effects: [{ type: "modifyResource", resource: "health", amount: -1 }] },
            { weight: 20, resultText: "The lights fade as Arthur approaches, leaving only damp leaves and silence.", effects: [] },
          ] }],
          resultText: "Arthur steps beyond the firelight to investigate.",
          pendingAction: { text: "Arthur follows the pale lights between the trees...", delayProfile: "search" },
          endEncounter: true,
        },
        { id: "stay_by_fire", label: "Stay by the Fire", resultText: "Arthur keeps the company close to the fire. The lights fade before dawn.", endEncounter: true },
      ],
    } },
  },
  wounded_traveler: {
    id: "wounded_traveler",
    title: "Wounded Traveler",
    description: "A voice calls weakly from the edge of the clearing. Someone has found the camp while hurt.",
    regionId: "broceliande",
    tags: ["traveler", "beneficial", "choice"],
    requirements: [],
    stages: { start: {
      text: "The traveler asks for help, but the darkness makes it difficult to judge the danger.",
      choices: [
        {
          id: "share_provisions",
          label: "Share Provisions",
          costs: [{ type: "modifyResource", resource: "provisions", amount: -2 }],
          outcomes: [{ type: "modifyResource", resource: "health", amount: 1 }],
          resultText: "The traveler eats, steadies their breathing, and gives Arthur a grateful warning about the nearby trail.",
          endEncounter: true,
        },
        {
          id: "use_bandages",
          label: "Offer Bandages",
          requirements: [{ type: "availableExpeditionItem", itemId: "bandages", quantity: 1, lockedLabel: "Requires 1 Bandage" }],
          costs: [{ type: "consumeExpeditionItem", itemId: "bandages", quantity: 1 }],
          outcomes: [{ type: "modifyResource", resource: "health", amount: 3 }],
          resultText: "Arthur dresses the traveler's wound. In return, the stranger points out a safer line through the trees.",
          endEncounter: true,
        },
        { id: "keep_distance", label: "Keep Your Distance", resultText: "Arthur refuses the request and keeps the company close to the fire.", endEncounter: true },
      ],
    } },
  },
  wolves_near_fire: {
    id: "wolves_near_fire",
    title: "Wolves Near the Fire",
    description: "Several pairs of eyes glint just beyond the clearing, keeping pace with the edge of the light.",
    regionId: "broceliande",
    tags: ["wildlife", "risky", "combat"],
    requirements: [],
    stages: { start: {
      text: "The pack does not come closer, but it does not leave either.",
      choices: [
        {
          id: "approach_wolves",
          label: "Approach the Wolves",
          outcomes: [{ type: "randomOne", options: [
            { weight: 25, resultText: "The largest wolf lowers its head, and the pack quietly withdraws. The encounter was stranger than threatening.", effects: [{ type: "modifyResource", resource: "health", amount: 1 }] },
            { weight: 45, resultText: "The wolves retreat into the brush as Arthur steps forward.", effects: [] },
            { weight: 30, resultText: "The pack answers with a sudden rush of teeth and snarls.", effects: [{ type: "startCombat", combatId: "wolves", victory: { outcomes: [{ type: "modifyResource", resource: "provisions", amount: 3 }], resultText: "The wolves scatter, leaving the company with meat and a quiet clearing." }, fled: { outcomes: [], resultText: "The company breaks away from the pack and returns to the fire." } }] },
          ] }],
          resultText: "Arthur steps beyond the firelight to meet the pack.",
          endEncounter: true,
        },
        {
          id: "offer_meat",
          label: "Offer Raw Meat",
          requirements: [{ type: "availableExpeditionItem", itemId: "raw_meat", quantity: 1, lockedLabel: "Requires Raw Meat" }],
          costs: [{ type: "consumeExpeditionItem", itemId: "raw_meat", quantity: 1 }],
          resultText: "The wolves take the meat and vanish into the forest without coming closer.",
          endEncounter: true,
        },
        { id: "leave_them_alone", label: "Leave Them Alone", resultText: "Arthur keeps the company close to the fire until the wolves lose interest.", endEncounter: true },
      ],
    } },
  },
});
