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
  hookWindowMs: 1350,
  hookSuccessChance: 0.84,
  lootTableId: "fishing_woodland_default",
});

const MINIGAME_DEFINITIONS = Object.freeze({
  fishing_teacher_tutorial: {
    id: "fishing_teacher_tutorial",
    type: "fishing",
    name: "First Lesson: Fishing",
    description: "Learn to read the stream and bring home something fresh for camp.",
    backgroundAssetId: "encounter_first_lesson_fishing",
    musicTrackId: "fishing_woodland_stream_fairfolk",
    attemptLimit: 3,
    timeLimitSeconds: null,
    castBounds: {
      minX: 0.08,
      maxX: 0.92,
      nearWaterY: 0.58,
      farWaterY: 0.29
    },
    defaultWater: {
      biteChance: 0.72,
      biteDelayMin: 0.75,
      biteDelayMax: 1.45,
      hookWindowMs: 1600,
      hookSuccessChance: 0.84,
      lootTableId: "fishing_teacher_pool"
    },
    hotspots: [
      {
        id: "quiet_reeds",
        name: "Quiet Reeds",
        x: 0.7719354444934475,
        y: 0.42720433717132894,
        radius: 0.13,
        priority: 2,
        biteChance: 0.8,
        biteDelayMin: 0.65,
        biteDelayMax: 1.2,
        hookWindowMs: 1500,
        lootTableId: "fishing_teacher_pool"
      },
      {
        id: "sunlit_ripple",
        name: "Sunlit Ripple",
        x: 0.2751613493888609,
        y: 0.3919354838709677,
        radius: 0.19218870753219408,
        priority: 1,
        biteChance: 0.68,
        biteDelayMin: 0.8,
        biteDelayMax: 1.5,
        hookWindowMs: 1450,
        lootTableId: "fishing_teacher_pool"
      },
      {
        id: "sunlit_ripple_2",
        name: "Sunlit Ripple 3",
        x: 0.30483870967741933,
        y: 0.6413978494623656,
        radius: 0.19218870753219408,
        priority: 1,
        biteChance: 0.68,
        biteDelayMin: 0.8,
        biteDelayMax: 1.5,
        hookWindowMs: 1450,
        lootTableId: "fishing_teacher_pool"
      },
      {
        id: "sunlit_ripple_3",
        name: "Sunlit Ripple 2 Copy",
        x: 0.6841935680758569,
        y: 0.6611827891360047,
        radius: 0.19218870753219408,
        priority: 1,
        biteChance: 0.68,
        biteDelayMin: 0.8,
        biteDelayMax: 1.5,
        hookWindowMs: 1450,
        lootTableId: "fishing_teacher_pool"
      }
    ],
    tutorial: {
      enabled: true,
      title: "Read the Water",
      text: "Press and hold on the water to charge your cast. Release to place the bobber; watch the float and tap it when it plunges.",
      completionText: "The fisher nods. You know how to read a stream now."
    }
  },
  woodland_stream_fishing: {
    id: "woodland_stream_fishing",
    type: "fishing",
    name: "Fish the Stream",
    description: "The stream is clear enough to reward a patient cast.",
    backgroundAssetId: "encounter_fish_the_stream",
    musicTrackId: "fishing_woodland_stream_fairfolk",
    attemptLimit: 3,
    timeLimitSeconds: null,
    castBounds: {
      minX: 0.08,
      maxX: 0.92,
      nearWaterY: 0.58,
      farWaterY: 0.29
    },
    defaultWater: {
      biteChance: 0.58,
      biteDelayMin: 0.75,
      biteDelayMax: 1.45,
      hookWindowMs: 1350,
      hookSuccessChance: 0.84,
      lootTableId: "fishing_woodland_default"
    },
    hotspots: [
      {
        id: "reed_shadow",
        name: "Reed Shadow",
        x: 0.3383870770854335,
        y: 0.7343010851131972,
        radius: 0.23790085723460794,
        priority: 2,
        biteChance: 0.68,
        biteDelayMin: 0.7,
        biteDelayMax: 1.55,
        hookWindowMs: 1450,
        lootTableId: "fishing_woodland_reeds"
      },
      {
        id: "rocks_center",
        name: "Rocks Center",
        x: 0.6583871164629537,
        y: 0.436666738858787,
        radius: 0.2283060797060715,
        priority: 2,
        biteChance: 0.68,
        biteDelayMin: 0.7,
        biteDelayMax: 1.55,
        hookWindowMs: 1450,
        lootTableId: "fishing_woodland_default"
      },
      {
        id: "deep_pool",
        name: "Deep Pool",
        x: 0.13322586551789314,
        y: 0.32543011737126176,
        radius: 0.14094737478718003,
        priority: 3,
        biteChance: 0.57,
        biteDelayMin: 0.95,
        biteDelayMax: 1.8,
        hookWindowMs: 1250,
        lootTableId: "fishing_woodland_deep_pool"
      },
      {
        id: "fallen_log",
        name: "Fallen Log",
        x: 0.14612909132434476,
        y: 0.505215076733661,
        radius: 0.16005779364469708,
        priority: 1,
        biteChance: 0.76,
        biteDelayMin: 0.6,
        biteDelayMax: 1.25,
        hookWindowMs: 1400,
        lootTableId: "fishing_woodland_default"
      }
    ],
    tutorial: {
      title: "Fish the Stream",
      text: "Press and hold on the water to charge, release to cast, then watch the float. Tap the bobber when it plunges.",
      completionText: "The stream settles back into silence."
    }
  },
});
