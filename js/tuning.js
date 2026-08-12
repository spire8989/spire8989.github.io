"use strict";

// Central gameplay-feel values for rapid iteration during playtesting.
const EXPEDITION_TUNING = Object.freeze({
  outboundTravelSpeed: 2.25,
  returnSpeedMultiplier: 4,
  baseProvisionsPerDistance: 0.07,
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
