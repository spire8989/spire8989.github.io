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
  val_supernatural: Object.freeze({
    id: "val_supernatural",
    entries: Object.freeze([
      Object.freeze({ eventId: "morgan_across_campfire", weight: 14 }),
      Object.freeze({ eventId: "strange_lights", weight: 24 }),
      Object.freeze({ eventId: "wolves_near_fire", weight: 18 }),
      Object.freeze({ eventId: "familiar_voice_beyond_fire", weight: 16 }),
      Object.freeze({ eventId: "knight_asks_join", weight: 14 }),
    ]),
  }),
  barenton_supernatural: Object.freeze({
    id: "barenton_supernatural",
    entries: Object.freeze([
      Object.freeze({ eventId: "bell_beneath_earth", weight: 18 }),
      Object.freeze({ eventId: "strange_lights", weight: 14 }),
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
    fountain_of_barenton: Object.freeze(["deep_forest", "barenton_supernatural"]),
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
    stages: {
      start: {
        text: "The stranger waits for Arthur to decide whether the fire is welcoming.",
        choices: [
          {
            id: "invite_over",
            label: "Invite Them to the Fire",
            outcomes: [
              {
                type: "randomOne",
                options: [
                  {
                    weight: 55,
                    resultText: "The traveler shares a little trail food and a useful warning about the road ahead.",
                    effects: [
                      {
                        type: "modifyResource",
                        resource: "provisions",
                        amount: 2
                      }
                    ]
                  },
                  {
                    weight: 30,
                    resultText: "The traveler speaks at length about roads and weather, then moves on before dawn.",
                    effects: []
                  },
                  {
                    weight: 15,
                    resultText: "The stranger accepts the warmth but leaves before Arthur can learn much about them.",
                    effects: [
                      {
                        type: "modifyResource",
                        resource: "provisions",
                        amount: -1
                      }
                    ]
                  },
                  {
                    weight: 15,
                    resultText: "The stranger reveals himself to be a renowned Alchemist and gives you a couple potions for your hospitality.",
                    effects: [
                      {
                        type: "gainUnsecuredItem",
                        itemId: "healing_poultice",
                        quantity: 2
                      }
                    ]
                  }
                ]
              }
            ],
            resultText: "Arthur makes room near the fire.",
            endEncounter: true
          },
          {
            id: "question_them",
            label: "Question Them from a Distance",
            resultText: "The traveler answers cautiously, offers no clear explanation, and eventually continues on.",
            endEncounter: true
          },
          {
            id: "send_away",
            label: "Send Them Away",
            resultText: "The stranger fades back into the trees without argument.",
            endEncounter: true
          }
        ]
      }
    }
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
          outcomes: [
            { type: "modifyResource", resource: "health", amount: 1 },
            { type: "modifyResource", resource: "faith", amount: 1 },
          ],
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
            { weight: 30, resultText: "The pack answers with a sudden rush of teeth and snarls.", effects: [{ type: "startCombat", combatId: "wolves", victory: { outcomes: [{ type: "gainUnsecuredItem", itemId: "raw_meat", quantity: 2 }], resultText: "The wolves scatter, leaving meat beside the quiet clearing." }, fled: { outcomes: [], resultText: "The company breaks away from the pack and returns to the fire." } }] },
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
  morgan_across_campfire: {
    id: "morgan_across_campfire",
    title: "Morgan Across the Campfire",
    description: "A woman sits beyond the firelight, close enough to speak and far enough that the flames never touch her.",
    regionId: "broceliande",
    pathIds: ["val_sans_retour"],
    tags: ["campaign", "val", "morgan", "dialogue"],
    requirements: [{ type: "runFlag", flag: "valBoundaryRevealed" }],
    stages: { start: {
      text: "Morgan looks at the fire rather than at Arthur. She asks why he keeps moving when no one in the valley is forcing him to suffer.",
      choices: [
        { id: "answer_morgan", label: "Answer Her", outcomes: [{ type: "setRunFlag", flag: "morganRevealed", value: true }], resultText: "Arthur says that rest can be wise without becoming a place to hide. Morgan considers the distinction and does not argue.", endEncounter: true },
        { id: "listen_to_morgan", label: "Listen Without Agreeing", outcomes: [{ type: "setRunFlag", flag: "morganRevealed", value: true }], resultText: "Morgan says Camelot may be another prison, then lets the thought sit between them until the fire burns lower.", endEncounter: true },
        { id: "refuse_conversation", label: "Refuse the Conversation", resultText: "Arthur keeps his eyes on the fire. When he looks up again, only the empty far side of the clearing remains.", endEncounter: true },
      ],
    } },
  },
  bell_beneath_earth: {
    id: "bell_beneath_earth",
    title: "The Bell Beneath the Earth",
    description: "A low note travels through the soil beneath the camp, though no bell can be seen.",
    regionId: "broceliande",
    pathIds: ["fountain_of_barenton"],
    tags: ["campaign", "barenton", "sacred", "camp"],
    requirements: [],
    stages: { start: {
      text: "The sound comes once, then waits. The fire burns normally while the ground seems to remember a buried answer.",
      choices: [
        {
          id: "investigate_bell",
          label: "Investigate the Sound",
          costs: [{ type: "modifyResource", resource: "provisions", amount: -1 }],
          outcomes: [{ type: "randomOne", options: [
            { weight: 35, resultText: "A hand-sized relic fragment lies beneath the roots, wrapped in oil-dark cloth.", effects: [{ type: "rollLootTable", tableId: "rare_materials" }] },
            { weight: 35, resultText: "The earth gives up a trace of sacred oil before the note fades.", effects: [{ type: "rollLootTable", tableId: "uncommon_materials", chance: 0.55 }] },
            { weight: 30, resultText: "The company digs until dawn finds nothing but cold soil and a quieter fire.", effects: [{ type: "applyInjury", target: "arthur", injuryId: "exhaustion", source: "bell-beneath-earth" }] },
          ] }],
          resultText: "Arthur follows the note below the roots.",
          endEncounter: true,
        },
        {
          id: "pray_and_listen",
          label: "Pray and Listen",
          outcomes: [
            { type: "learnKnowledge", knowledgeId: "woodcraft" },
            { type: "modifyResource", resource: "faith", amount: 1 },
          ],
          resultText: "Arthur does not dig. By morning he understands that Barenton's signs reward attention before action.",
          endEncounter: true,
        },
        { id: "stay_by_fire", label: "Stay by the Fire", resultText: "The note comes once more and then disappears beneath the ordinary sounds of camp.", endEncounter: true },
      ],
    } },
  },
  familiar_voice_beyond_fire: {
    id: "familiar_voice_beyond_fire",
    title: "A Familiar Voice Beyond the Fire",
    description: "Someone outside the firelight speaks in a voice that belongs to a person the company cannot see.",
    regionId: "broceliande",
    pathIds: ["val_sans_retour"],
    tags: ["campaign", "val", "camp", "unreality"],
    requirements: [],
    stages: { start: {
      text: "The voice says Arthur's name once, gently. The trees hold no shape that could have spoken it.",
      choices: [
        {
          id: "investigate_voice",
          label: "Investigate Alone",
          outcomes: [{ type: "randomOne", options: [
            { weight: 35, resultText: "The voice stops at the edge of the clearing, leaving only a useful certainty: it wanted Arthur away from the fire.", effects: [{ type: "setRunFlag", flag: "familiarVoiceDistrusted", value: true }] },
            { weight: 35, resultText: "Arthur returns with a ringing head and a thin cut across his palm.", effects: [{ type: "modifyResource", resource: "health", amount: -2 }, { type: "applyInjury", target: "arthur", injuryId: "deep_cut", source: "familiar-voice" }] },
            { weight: 30, resultText: "The voice leads him to a dry place where the company can safely gather kindling.", effects: [{ type: "rollLootTable", tableId: "forest_materials" }] },
          ] }],
          resultText: "Arthur steps beyond the firelight alone.",
          endEncounter: true,
        },
        {
          id: "wake_companion",
          label: "Wake the Company",
          outcomes: [{ type: "modifyResource", resource: "health", amount: 1 }, { type: "setRunFlag", flag: "familiarVoiceShared", value: true }],
          resultText: "Arthur wakes his companion before answering. The voice has gone by the time both knights look toward the trees.",
          endEncounter: true,
        },
        {
          id: "answer_voice",
          label: "Answer the Voice",
          outcomes: [{ type: "startDialogue", dialogueId: "familiar_voice_dialogue" }],
          resultText: "Arthur answers without leaving the fire.",
          endEncounter: true,
        },
        { id: "stay_silent", label: "Stay Silent", resultText: "The voice repeats the name once, then withdraws as though silence were an answer.", endEncounter: true },
      ],
    } },
  },
  knight_asks_join: {
    id: "knight_asks_join",
    title: "The Knight Who Asks to Join",
    description: "A courteous knight appears beyond the camp and asks whether the company has room for one more.",
    regionId: "broceliande",
    pathIds: ["val_sans_retour"],
    tags: ["campaign", "val", "camp", "social"],
    requirements: [],
    stages: { start: {
      text: "The knight's horse is nowhere in sight. He speaks as if he has been walking beside the fire for some time.",
      choices: [
        {
          id: "admit_him",
          label: "Admit Him to the Fire",
          costs: [{ type: "modifyResource", resource: "provisions", amount: -1 }],
          outcomes: [{ type: "randomOne", options: [
            { weight: 50, resultText: "The knight shares a clean strip of cloth and disappears before the coals cool.", effects: [{ type: "modifyResource", resource: "health", amount: 1 }] },
            { weight: 30, resultText: "He leaves a small road token beside the fire and gives a direction that sounds almost right.", effects: [{ type: "setRunFlag", flag: "valKnightToken", value: true }] },
            { weight: 20, resultText: "The knight is gone at dawn, along with one of the company's loose provisions.", effects: [{ type: "modifyResource", resource: "provisions", amount: -1 }] },
          ] }],
          resultText: "Arthur makes room for the courteous stranger.",
          endEncounter: true,
        },
        {
          id: "question_him",
          label: "Question His Story",
          outcomes: [{ type: "randomChance", chance: 0.35, effects: [{ type: "startCombat", combatId: "false_knight", victory: { outcomes: [{ type: "setRunFlag", flag: "campKnightUnmasked", value: true }], resultText: "The stranger's courtesy falls away with his false face." }, fled: { outcomes: [], resultText: "The knight withdraws into the dark before the company can learn whether he was ever there." } }], resultText: "The knight answers too quickly, and his hand moves toward a hidden weapon.", elseResultText: "The knight answers each question plainly enough, then fades back into the trees." }],
          resultText: "Arthur asks the stranger where he came from.",
          endEncounter: true,
        },
        { id: "send_him_on", label: "Send Him On", resultText: "Arthur wishes the knight a safe road and keeps the fire between them until the stranger leaves.", endEncounter: true },
      ],
    } },
  },
});
