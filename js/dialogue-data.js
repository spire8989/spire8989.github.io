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
});
