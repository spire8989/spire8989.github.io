"use strict";

// Lightweight RPG dialogue content. Portrait keys intentionally resolve to a
// placeholder in the UI until final portrait art exists.
const DIALOGUE_DEFINITIONS = Object.freeze({
  broceliande_intro: Object.freeze({
    id: "broceliande_intro",
    start: "welcome",
    nodes: Object.freeze({
      welcome: Object.freeze({
        speakerId: "village_reeve",
        portraitKey: "reeve",
        text: "You are Arthur. I had hoped the forest would not draw you here.",
        next: "merlin",
      }),
      merlin: Object.freeze({
        speakerId: "village_reeve",
        portraitKey: "reeve",
        text: "Merlin entered Brocéliande some time ago. He has not returned.",
        next: "roads",
      }),
      roads: Object.freeze({
        speakerId: "village_reeve",
        portraitKey: "reeve",
        text: "No road leads plainly to him. Travelers bring back only conflicting stories of the deeper wood.",
        next: "resolve",
      }),
      resolve: Object.freeze({
        speakerId: "arthur",
        portraitKey: "arthur",
        text: "Then I will search the forest and learn how to reach him.",
        next: "farewell",
      }),
      farewell: Object.freeze({
        speakerId: "village_reeve",
        portraitKey: "reeve",
        text: "The village will keep a light for your return. Begin where the road allows, and listen for what the forest withholds.",
        effects: [
          { type: "setFlag", flag: "broceliande_intro_complete", value: true },
          { type: "unlockVillage" },
          { type: "showToast", title: "Brocéliande Expeditions Available", message: "The village is open to Arthur's search.", toastType: "major" },
        ],
      }),
    }),
  }),

  reeve_after_intro: Object.freeze({
    id: "reeve_after_intro",
    start: "objective",
    nodes: Object.freeze({
      objective: Object.freeze({
        speakerId: "village_reeve",
        portraitKey: "reeve",
        text: "Merlin remains somewhere beyond the village. Find a road into the forest, and return with what you learn.",
        choices: [
          { id: "ask_forest", label: "Ask about the forest", next: "rumor" },
          { id: "leave_hall", label: "Leave the Hall", end: true },
        ],
      }),
      rumor: Object.freeze({
        speakerId: "village_reeve",
        portraitKey: "reeve",
        text: "The old paths are not the only paths. Keep your eyes open for places that do not belong to any map.",
        next: "close",
      }),
      close: Object.freeze({
        speakerId: "village_reeve",
        portraitKey: "reeve",
        text: "May the forest show you more than it showed Merlin.",
        end: true,
      }),
    }),
  }),
  bell_bearer_dialogue: {
    id: "bell_bearer_dialogue",
    start: "warning",
    nodes: {
      warning: {
        speakerId: "bell_bearer",
        portraitKey: "placeholder",
        text: "Do not call me cursed. Call me tired, wounded, or foolish if you must. Those names still leave a man somewhere to stand.",
        choices: [
          {
            id: "listen_to_warning",
            label: "Listen",
            next: "parting",
            effects: [
              {
                type: "setCampaignFlag",
                flag: "bell_bearer_heard",
                value: true
              },
              {
                type: "learnKnowledge",
                knowledgeId: "woodcraft"
              }
            ]
          },
          {
            id: "thank_knight",
            label: "Thank Him",
            next: "parting",
            effects: [
              {
                type: "setCampaignFlag",
                flag: "bell_bearer_respected",
                value: true
              }
            ]
          }
        ]
      },
      parting: {
        speakerId: "bell_bearer",
        portraitKey: "placeholder",
        text: "The true spring is not the first water a thirsty man finds. Remember that, and perhaps the forest will let you pass."
      }
    }
  },
  charcoal_burner_dialogue: Object.freeze({
    id: "charcoal_burner_dialogue",
    start: "directions",
    nodes: Object.freeze({
      directions: Object.freeze({
        speakerId: "charcoal_burner",
        portraitKey: "placeholder",
        text: "The old trees keep their roots dry beneath the rain. Follow the dark ground, not the loud water.",
        choices: [
          { id: "remember_directions", label: "Remember the Direction", next: "farewell", effects: [{ type: "setCampaignFlag", flag: "charcoal_burner_direction", value: true }, { type: "learnKnowledge", knowledgeId: "woodcraft" }] },
          { id: "ask_about_fountain", label: "Ask About the Fountain", next: "farewell", effects: [{ type: "setCampaignFlag", flag: "charcoal_burner_fountain_warning", value: true }] },
        ],
      }),
      farewell: Object.freeze({
        speakerId: "charcoal_burner",
        portraitKey: "placeholder",
        text: "The burner turns back to the kiln. The smoke keeps his final gesture brief: farther in, pay attention before you act.",
      }),
    }),
  }),
  pilgrims_wrong_fountain_dialogue: Object.freeze({
    id: "pilgrims_wrong_fountain_dialogue",
    start: "answer",
    nodes: Object.freeze({
      answer: Object.freeze({
        speakerId: "pilgrim",
        portraitKey: "placeholder",
        text: "We named it because we needed to arrive. If you find the true fountain, do not make the same mistake with a different kind of hope.",
        choices: [
          { id: "thank_pilgrims", label: "Thank Them", end: true, effects: [{ type: "setCampaignFlag", flag: "wrong_fountain_warning", value: true }] },
          { id: "share_truth", label: "Tell Them It Is Not Barenton", end: true, effects: [{ type: "setCampaignFlag", flag: "wrong_fountain_corrected", value: true }] },
        ],
      }),
    }),
  }),
  forgotten_knight_dialogue: Object.freeze({
    id: "forgotten_knight_dialogue",
    start: "memory",
    nodes: Object.freeze({
      memory: Object.freeze({
        speakerId: "forgotten_knight",
        portraitKey: "placeholder",
        text: "I remember wanting to leave. Then I remembered a reason to stay. The reason has gone, but the staying remains.",
        choices: [
          { id: "name_the_pattern", label: "Name the Pattern", end: true, effects: [{ type: "setCampaignFlag", flag: "forgotten_knight_pattern", value: true }, { type: "learnKnowledge", knowledgeId: "woodcraft" }] },
          { id: "leave_him_memory", label: "Let Him Keep the Memory", end: true, effects: [{ type: "setCampaignFlag", flag: "forgotten_knight_spared", value: true }] },
        ],
      }),
    }),
  }),
  forgotten_knight_victory_dialogue: Object.freeze({
    id: "forgotten_knight_victory_dialogue",
    start: "fallen",
    nodes: Object.freeze({
      fallen: Object.freeze({
        speakerId: "forgotten_knight",
        portraitKey: "placeholder",
        text: "You have beaten the body that carried the name. Will you spare the man who cannot recover it?",
        choices: [
          { id: "spare_forgotten_knight", label: "Spare Him", end: true, effects: [{ type: "setCampaignFlag", flag: "forgotten_knight_spared", value: true }] },
          { id: "question_forgotten_knight", label: "Question Him", end: true, effects: [{ type: "setCampaignFlag", flag: "forgotten_knight_questioned", value: true }, { type: "learnKnowledge", knowledgeId: "woodcraft" }] },
        ],
      }),
    }),
  }),
  woman_at_ford_dialogue: Object.freeze({
    id: "woman_at_ford_dialogue",
    start: "ford",
    nodes: Object.freeze({
      ford: Object.freeze({
        speakerId: "woman_at_ford",
        portraitKey: "placeholder",
        text: "The water only asks what you are willing to call a crossing. A ford, a delay, or a way to turn back.",
        choices: [
          { id: "ask_real_question", label: "Ask Which Way Is Real", end: true, effects: [{ type: "setCampaignFlag", flag: "woman_at_ford_questioned", value: true }] },
          { id: "say_nothing", label: "Say Nothing", end: true, effects: [{ type: "setCampaignFlag", flag: "woman_at_ford_distrusted", value: true }] },
        ],
      }),
    }),
  }),
  familiar_voice_dialogue: Object.freeze({
    id: "familiar_voice_dialogue",
    start: "voice",
    nodes: Object.freeze({
      voice: Object.freeze({
        speakerId: "unseen_voice",
        portraitKey: "placeholder",
        text: "You know why you are tired. You do not know whether the reason you continue is yours.",
        choices: [
          { id: "answer_with_purpose", label: "Answer with Your Purpose", end: true, effects: [{ type: "setCampaignFlag", flag: "familiar_voice_answered", value: true }] },
          { id: "refuse_the_voice", label: "Refuse to Answer", end: true, effects: [{ type: "setCampaignFlag", flag: "familiar_voice_refused", value: true }, { type: "learnKnowledge", knowledgeId: "woodcraft" }] },
        ],
      }),
    }),
  }),
  hidden_village_druid_dialogue: Object.freeze({
    id: "hidden_village_druid_dialogue",
    start: "greeting",
    nodes: Object.freeze({
      greeting: Object.freeze({
        speakerId: "hidden_village_druid",
        portraitKey: "placeholder",
        text: "The Druid studies Arthur's hands before looking at the road dust on his boots. \"You have walked far enough to ask the forest a question. First, prove you can listen.\"",
        choices: [
          {
            id: "ask_for_favor",
            label: "Ask What the Druid Needs",
            requirements: [{ type: "notCampaignFlag", flag: "druid_favor_offered" }, { type: "notCampaignFlag", flag: "druid_favor_complete" }],
            next: "favor_offered",
            effects: [
              { type: "setCampaignFlag", flag: "druid_favor_offered", value: true },
              { type: "learnRecipe", recipeId: "forest_communion_draught" },
            ],
          },
          {
            id: "offer_draught_with_heart",
            label: "Present the Communion Draught",
            requirements: [
              { type: "ownsItem", itemId: "forest_communion_draught" },
              { type: "ownsItem", itemId: "verdant_heart" },
              { type: "notCampaignFlag", flag: "druid_favor_complete" },
            ],
            next: "favor_complete_heart",
            effects: [
              { type: "consumeItem", itemId: "forest_communion_draught", quantity: 1 },
              { type: "transformItem", fromItemId: "verdant_heart", toItemId: "enchanted_verdant_heart" },
              { type: "setCampaignFlag", flag: "druid_favor_complete", value: true },
              { type: "learnKnowledge", knowledgeId: "song_of_the_forest" },
            ],
          },
          {
            id: "offer_draught_without_heart",
            label: "Present the Draught Without the Heart",
            requirements: [
              { type: "ownsItem", itemId: "forest_communion_draught" },
              { type: "notOwnsItem", itemId: "verdant_heart" },
              { type: "notOwnsItem", itemId: "enchanted_verdant_heart" },
              { type: "notCampaignFlag", flag: "druid_favor_complete" },
            ],
            next: "favor_complete_no_heart",
            effects: [
              { type: "consumeItem", itemId: "forest_communion_draught", quantity: 1 },
              { type: "setCampaignFlag", flag: "druid_favor_complete", value: true },
              { type: "learnKnowledge", knowledgeId: "song_of_the_forest" },
            ],
          },
          {
            id: "awaken_dormant_heart",
            label: "Bring the Dormant Heart",
            requirements: [
              { type: "campaignFlag", flag: "druid_favor_complete" },
              { type: "ownsItem", itemId: "verdant_heart" },
            ],
            next: "heart_awakened",
            effects: [{ type: "transformItem", fromItemId: "verdant_heart", toItemId: "enchanted_verdant_heart" }],
          },
          {
            id: "learn_woodcraft",
            label: "Ask About the Forest Paths",
            requirements: [{ type: "notKnowledge", knowledgeId: "woodcraft" }],
            next: "woodcraft_lesson",
            effects: [
              { type: "learnKnowledge", knowledgeId: "woodcraft" },
              { type: "learnRecipe", recipeId: "forestwarden_stew" },
              { type: "learnRecipe", recipeId: "honeyed_forest_preserves" },
            ],
          },
          {
            id: "ask_about_altar",
            label: "Ask About the Deep Altar",
            next: "altar_hint",
          },
        ],
      }),
      favor_offered: Object.freeze({
        speakerId: "hidden_village_druid",
        portraitKey: "placeholder",
        text: "\"Make this in Camelot, where the apothecary can keep the herbs clean. Bring it back on another road. The forest does not reward a hurried errand.\"",
        end: true,
      }),
      favor_complete_heart: Object.freeze({
        speakerId: "hidden_village_druid",
        portraitKey: "placeholder",
        text: "The draught disappears into the roots. When the Druid touches the two-fitted heart, it begins to hum. \"Now you may sing, but the altar will decide whether it hears you.\"",
        end: true,
      }),
      favor_complete_no_heart: Object.freeze({
        speakerId: "hidden_village_druid",
        portraitKey: "placeholder",
        text: "The Druid accepts the draught and teaches Arthur the Song. \"The heart is still missing. When you forge it, bring it here and I will wake it.\"",
        end: true,
      }),
      heart_awakened: Object.freeze({
        speakerId: "hidden_village_druid",
        portraitKey: "placeholder",
        text: "The Druid lays one palm against the dormant heart. Green light travels through its seam and settles into a steady pulse. The heart is awake.",
        end: true,
      }),
      woodcraft_lesson: Object.freeze({
        speakerId: "hidden_village_druid",
        portraitKey: "placeholder",
        text: "The Druid teaches Arthur to read a broken fern, a wet stone, and the silence before an animal moves. \"Woodcraft is not command. It is knowing what the forest has already said.\"",
        end: true,
      }),
      altar_hint: Object.freeze({
        speakerId: "hidden_village_druid",
        portraitKey: "placeholder",
        text: "\"Far beyond the patient road stands an altar. It wakes for the Song, but only an awakened heart can survive what answers. Do not mistake a hint for permission.\"",
        end: true,
      }),
    }),
  }),
});
