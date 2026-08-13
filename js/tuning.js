"use strict";

// Central gameplay-feel values for rapid iteration during playtesting.
const EXPEDITION_TUNING = Object.freeze({
  outboundTravelSpeed: 2.25,
  returnSpeedMultiplier: 4,
  baseProvisionsPerDistance: 0.068,
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
  minimumStartingProvisions: 1,
  minimumTownProvisions: 10,
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
