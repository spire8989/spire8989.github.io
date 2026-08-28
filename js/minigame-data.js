"use strict";

// Minigame definitions are authored data. Runtime behavior lives in
// minigame-rules.js so future typed minigames can share the same lifecycle.
const MINIGAME_CATCH_DEFINITIONS = Object.freeze({
  brown_trout: Object.freeze({
    id: "brown_trout",
    name: "Brown Trout",
    description: "A speckled trout with a strong silver flash.",
    rewardItemId: "raw_fish",
    quantity: 2,
  }),
  small_trout: Object.freeze({
    id: "small_trout",
    name: "Small Trout",
    description: "A quick little trout, perfect for a campfire meal.",
    rewardItemId: "raw_fish",
    quantity: 1,
  }),
  large_pike: Object.freeze({
    id: "large_pike",
    name: "Large Pike",
    description: "A heavy river pike that nearly pulls the rod from your hands.",
    rewardItemId: "raw_fish",
    quantity: 3,
  }),
});

const FISHING_CAST_BOUNDS = Object.freeze({
  minX: 0.08,
  maxX: 0.92,
  nearWaterY: 0.58,
  farWaterY: 0.29,
});

const FISHING_DEFAULT_WATER = Object.freeze({
  biteChance: 0.58,
  biteDelayMin: 0.75,
  biteDelayMax: 1.45,
  hookWindowMs: 720,
  hookSuccessChance: 0.84,
  lootTableId: "fishing_woodland_default",
});

const MINIGAME_DEFINITIONS = Object.freeze({
  fishing_teacher_tutorial: Object.freeze({
    id: "fishing_teacher_tutorial",
    type: "fishing",
    name: "First Lesson: Fishing",
    description: "Learn to read the stream and bring home something fresh for camp.",
    backgroundAssetId: "encounter_woodland_stream",
    attemptLimit: 3,
    timeLimitSeconds: null,
    castBounds: {
      minX: 0.08, maxX: 0.92, nearWaterY: 0.58, farWaterY: 0.29,
    },
    defaultWater: Object.freeze({
      biteChance: 0.72,
      biteDelayMin: 0.75,
      biteDelayMax: 1.45,
      hookWindowMs: 820,
      hookSuccessChance: 0.84,
      lootTableId: "fishing_teacher_pool",
    }),
    hotspots: Object.freeze([
      Object.freeze({
        id: "quiet_reeds",
        name: "Quiet Reeds",
        x: 0.31, y: 0.41, radius: 0.13, priority: 2,
        biteChance: 0.8, biteDelayMin: 0.65, biteDelayMax: 1.2, hookWindowMs: 850,
        lootTableId: "fishing_teacher_pool",
      }),
      Object.freeze({
        id: "sunlit_ripple",
        name: "Sunlit Ripple",
        x: 0.68, y: 0.34, radius: 0.11, priority: 1,
        biteChance: 0.68, biteDelayMin: 0.8, biteDelayMax: 1.5, hookWindowMs: 760,
        lootTableId: "fishing_teacher_pool",
      }),
    ]),
    tutorial: Object.freeze({
      title: "Read the Water",
      text: "Press and hold on the water to charge your cast. Release to place the bobber; watch the float and tap it when it plunges.",
      completionText: "The fisher nods. You know how to read a stream now.",
    }),
  }),
  woodland_stream_fishing: Object.freeze({
    id: "woodland_stream_fishing",
    type: "fishing",
    name: "Fish the Stream",
    description: "The stream is clear enough to reward a patient cast.",
    backgroundAssetId: "encounter_woodland_stream",
    attemptLimit: 3,
    timeLimitSeconds: null,
    castBounds: {
      minX: 0.08, maxX: 0.92, nearWaterY: 0.58, farWaterY: 0.29,
    },
    defaultWater: Object.freeze({
      biteChance: 0.58,
      biteDelayMin: 0.75,
      biteDelayMax: 1.45,
      hookWindowMs: 720,
      hookSuccessChance: 0.84,
      lootTableId: "fishing_woodland_default",
    }),
    hotspots: Object.freeze([
      Object.freeze({
        id: "reed_shadow",
        name: "Reed Shadow",
        x: 0.25, y: 0.43, radius: 0.12, priority: 2,
        biteChance: 0.68, biteDelayMin: 0.7, biteDelayMax: 1.55, hookWindowMs: 690,
        lootTableId: "fishing_woodland_reeds",
      }),
      Object.freeze({
        id: "deep_pool",
        name: "Deep Pool",
        x: 0.73, y: 0.35, radius: 0.15, priority: 3,
        biteChance: 0.57, biteDelayMin: 0.95, biteDelayMax: 1.8, hookWindowMs: 650,
        lootTableId: "fishing_woodland_deep_pool",
      }),
      Object.freeze({
        id: "fallen_log",
        name: "Fallen Log",
        x: 0.52, y: 0.49, radius: 0.09, priority: 1,
        biteChance: 0.76, biteDelayMin: 0.6, biteDelayMax: 1.25, hookWindowMs: 780,
        lootTableId: "fishing_woodland_default",
      }),
    ]),
    tutorial: Object.freeze({
      title: "Fish the Stream",
      text: "Press and hold on the water to charge, release to cast, then watch the float. Tap the bobber when it plunges.",
      completionText: "The stream settles back into silence.",
    }),
  }),
});
