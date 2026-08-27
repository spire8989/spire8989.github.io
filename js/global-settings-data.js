"use strict";

// Cross-cutting presentation defaults live in one small singleton so the
// Content Editor can tune presentation without duplicating rules in runtime
// systems. System-specific balance remains in its existing data files.
const GLOBAL_SETTINGS = Object.freeze({
  id: "global",
  rewardPresentation: {
    fullPopupMinimumRarity: "uncommon",
    majorPopupMinimumRarity: "rare",
    fullPopupCategories: ["quest", "relic"],
    fullPopupTypes: ["recipe", "ability", "knowledge"],
    majorPopupCategories: ["quest", "relic"],
    majorPopupTypes: ["recipe", "ability", "knowledge"],
    goldBehavior: "minor",
    materialBehavior: "normal",
    defaultLootSfxId: "pickup_confirm",
    majorLootSfxId: "pickup_confirm",
    minorHoldDurationMs: 820,
    normalHoldDurationMs: 1300,
    majorHoldDurationMs: 1850,
  },
  firstDiscovery: {
    enabled: true,
    minimumPresentation: "normal",
    eligibleTypes: ["item", "material", "recipe", "ability", "knowledge"],
    eligibleCategories: ["quest", "relic", "valuable", "curiosity"],
    sfxId: null,
  },
  expeditionWarnings: {
    lowEnabled: true,
    lowText: "Provisions are running low. Consider turning back.",
    criticalEnabled: true,
    criticalText: "At your present rate, you may not have enough provisions to reach safety.",
    retriggerAfterSafe: true,
    bannerDurationMs: 3200,
  },
  townDefaults: {
    markerStyle: "label",
    showMarkerIcons: false,
    markerFontScale: 1.25,
    markerHorizontalPadding: 0.57,
    markerVerticalPadding: 0.3
  },
  dialogueDefaults: {
    oneNodeBarkMode: "tap",
    barkAutoDismissDurationMs: 2200,
  },
});
