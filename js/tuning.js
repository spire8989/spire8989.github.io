"use strict";

// Central gameplay-feel values for rapid iteration during playtesting.
const EXPEDITION_TUNING = Object.freeze({
  outboundTravelSpeed: 2.25,
  returnSpeedMultiplier: 4,
  baseProvisionsPerDistance: 0.068,
  travelPaces: Object.freeze({
    cautious: Object.freeze({
      id: "cautious",
      name: "Cautious",
      description: "Advance more carefully and conserve a little food.",
      speedMultiplier: 0.75,
      provisionMultiplier: 0.9,
    }),
    normal: Object.freeze({
      id: "normal",
      name: "Normal",
      description: "The standard travel pace.",
      speedMultiplier: 1,
      provisionMultiplier: 1,
    }),
    hard_push: Object.freeze({
      id: "hard_push",
      name: "Hard Push",
      description: "Cover ground quickly at a higher food cost.",
      speedMultiplier: 1.35,
      provisionMultiplier: 1.15,
    }),
  }),
  rationLevels: Object.freeze({
    sparse: Object.freeze({
      id: "sparse",
      name: "Sparse",
      description: "The company eats as little as practical.",
      provisionMultiplier: 0.75,
    }),
    normal: Object.freeze({
      id: "normal",
      name: "Normal",
      description: "A balanced ration.",
      provisionMultiplier: 1,
    }),
    generous: Object.freeze({
      id: "generous",
      name: "Generous",
      description: "Larger meals with no extra recovery system yet.",
      provisionMultiplier: 1.25,
    }),
  }),
  briefRest: Object.freeze({
    provisionCost: 1,
    healing: 4,
  }),
  campRest: Object.freeze({
    provisionCost: 2,
    healing: 8,
  }),
  returnProvisionWarningMarginRatio: 0.2,
  encounterMinimumDistance: 14,
  encounterMaximumDistance: 22,
  encounterActionDelays: Object.freeze({
    physical: Object.freeze({ minimumMs: 800, maximumMs: 1400 }),
    search: Object.freeze({ minimumMs: 1200, maximumMs: 2400 }),
    rest: Object.freeze({ minimumMs: 1500, maximumMs: 2600 }),
    combat: Object.freeze({ minimumMs: 1000, maximumMs: 1800 }),
  }),
  postEncounterSafeDistance: 8,
  packSlots: 6,
  materialBagCapacity: 10,
  minimumStartingProvisions: 1,
  minimumTownProvisions: 10,
  companionBonuses: Object.freeze({
    llamreiProvisionCapacity: 10,
    llamreiSoloTravelSpeed: 0.25,
    llamreiPartyTravelSpeed: 0.10,
  }),
});

const CAMPAIGN_TUNING = Object.freeze({
  consumablePurchasing: Object.freeze({
    bandages: Object.freeze({
      aggressive: Object.freeze({ target: 3, minimum: 1, combatUseThreshold: 0.55 }),
      cautious: Object.freeze({ target: 2, minimum: 0, combatUseThreshold: 0.5 }),
      random: Object.freeze({ minimum: 0, maximum: 2, purchaseChance: 0.55, combatUseThreshold: 0.5 }),
    }),
  }),
});

const COMBAT_TUNING = Object.freeze({
  actionGaugeMaximum: 100,
  actionGaugeRate: 1.3,
  defendDamageMultiplier: 0.5,
  fleeChance: 0.7,
  combatLogLimit: 5,
  pommelStrikeDamageMultiplier: 0.6,
  pommelStrikeGaugeReduction: 25,
  bandageHealAmount: 8,
  enemyTargetWeights: Object.freeze({ arthur: 0.65, activeCompanions: 0.35 }),
});

const HEALING_TUNING = Object.freeze({
  innRestoration: 10,
  innRestGoldCost: 3,
});
