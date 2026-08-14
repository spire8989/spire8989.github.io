"use strict";

const INJURY_DEFINITIONS = Object.freeze({
  sprained_ankle: Object.freeze({
    id: "sprained_ankle",
    name: "Sprained Ankle",
    shortName: "Sprained Ankle",
    description: "Uneven ground has left the company limping.",
    effects: Object.freeze({ travelSpeedMultiplier: 0.85, hardPushRiskMultiplier: 1.35 }),
    treatmentItemId: null,
  }),
  deep_cut: Object.freeze({
    id: "deep_cut",
    name: "Deep Cut",
    shortName: "Deep Cut",
    description: "A serious wound lowers effective maximum health until dressed.",
    effects: Object.freeze({ maxHealthMultiplier: 0.85 }),
    treatmentItemId: "healing_poultice",
  }),
  bruised_ribs: Object.freeze({
    id: "bruised_ribs",
    name: "Bruised Ribs",
    shortName: "Bruised Ribs",
    description: "Painful ribs make it harder to absorb a blow.",
    effects: Object.freeze({ defenseMultiplier: 0.8 }),
    treatmentItemId: null,
  }),
  exhaustion: Object.freeze({
    id: "exhaustion",
    name: "Exhaustion",
    shortName: "Exhaustion",
    description: "Fatigue slows travel and combat readiness.",
    effects: Object.freeze({ travelSpeedMultiplier: 0.9, combatGaugeRateMultiplier: 0.82 }),
    treatmentItemId: "strong_tonic",
  }),
  poisoned: Object.freeze({
    id: "poisoned",
    name: "Poisoned",
    shortName: "Poisoned",
    description: "A lingering venom makes incoming harm more dangerous.",
    effects: Object.freeze({ incomingDamageMultiplier: 1.1 }),
    treatmentItemId: "antidote",
  }),
});

const INJURY_CHARACTER_IDS = Object.freeze([
  "arthur",
  ...Object.keys(COMPANION_DEFINITIONS),
]);
