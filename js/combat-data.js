"use strict";

// Combat content stays separate from the frame-rate-independent simulation.
const COMBAT_ABILITY_DEFINITIONS = Object.freeze({
  attack: {
    id: "attack",
    name: "Attack",
    target: "enemy",
    targetMode: "singleEnemy",
    kind: "active",
    tags: ["martial", "basic"],
    effects: [
      {
        type: "weaponDamage",
        multiplier: 1
      }
    ],
    selectionPrompt: "Choose an enemy target",
    category: "action",
    impactSfxId: "attack_impact",
    useSfxId: "attack_swing"
  },
  defend: Object.freeze({
    id: "defend",
    name: "Defend",
    target: "self",
    targetMode: "self",
    kind: "active",
    effects: Object.freeze([{ type: "setDefending", value: true }]),
    category: "action",
  }),
  abilities: Object.freeze({
    id: "abilities",
    name: "Abilities",
    description: "Use a learned or equipped combat ability.",
    target: "menu",
    targetMode: "none",
    kind: "active",
    effects: Object.freeze([]),
    category: "action",
  }),
  items: Object.freeze({
    id: "items",
    name: "Items",
    description: "Use a carried combat item.",
    target: "menu",
    targetMode: "none",
    kind: "active",
    effects: Object.freeze([]),
    category: "action",
  }),
  pommel_strike: Object.freeze({
    id: "pommel_strike",
    name: "Pommel Strike",
    description: "Deal reduced weapon damage and push an enemy's action gauge back.",
    target: "enemy",
    targetMode: "singleEnemy",
    kind: "active",
    tags: ["martial"],
    effects: Object.freeze([
      Object.freeze({ type: "weaponDamage", multiplier: 0.6 }),
      Object.freeze({ type: "modifyGauge", target: "target", amount: -25 }),
    ]),
    selectionPrompt: "Choose an enemy target",
    // Legacy aliases remain readable by the Content Editor and older tools.
    effectType: "damageAndGauge",
    damageMultiplier: 0.6,
    gaugeReduction: 25,
  }),
  intercede: Object.freeze({
    id: "intercede",
    name: "Intercede",
    target: "self",
    targetMode: "self",
    kind: "active",
    description: "Protect Arthur from the next targeted attack.",
    tags: ["martial", "protection"],
    effects: Object.freeze([
      Object.freeze({ type: "setFlag", flag: "interceding", value: true }),
    ]),
    effectType: "intercede",
  }),
  charge: Object.freeze({
    id: "charge",
    name: "Charge",
    description: "Llamrei strikes an enemy and pushes its action gauge back.",
    target: "enemy",
    targetMode: "singleEnemy",
    kind: "active",
    tags: ["martial", "mount"],
    effects: Object.freeze([
      Object.freeze({ type: "weaponDamage", multiplier: 1.15 }),
      Object.freeze({ type: "modifyGauge", target: "target", amount: -10 }),
    ]),
    selectionPrompt: "Choose an enemy for Charge",
    effectType: "damageAndGauge",
    damageMultiplier: 1.15,
    gaugeReduction: 10,
  }),
  flee: Object.freeze({
    id: "flee",
    name: "Flee",
    target: "none",
    targetMode: "none",
    kind: "active",
    effects: Object.freeze([{ type: "attemptFlee" }]),
    category: "action",
  }),
  healing_prayer: Object.freeze({
    id: "healing_prayer",
    name: "Healing Prayer",
    description: "Restore 10 HP to an ally through focused Faith.",
    target: "ally",
    targetMode: "singleAlly",
    kind: "active",
    tags: ["faith", "healing"],
    cost: Object.freeze({ resource: "faith", amount: 3 }),
    cooldownActivations: 1,
    chargesPerCombat: 2,
    effects: Object.freeze([{ type: "heal", amount: 10 }]),
    selectionPrompt: "Choose an ally to heal",
  }),
  sweeping_cut: Object.freeze({
    id: "sweeping_cut",
    name: "Sweeping Cut",
    description: "A broad martial arc that catches every enemy for reduced weapon damage.",
    target: "enemy",
    targetMode: "allEnemies",
    kind: "active",
    tags: ["martial", "weapon", "area"],
    cooldownActivations: 2,
    effects: Object.freeze([
      Object.freeze({ type: "weaponDamage", multiplier: 0.6 }),
    ]),
    selectionPrompt: "Sweep across every enemy",
  }),
  guard_break: Object.freeze({
    id: "guard_break",
    name: "Guard Break",
    description: "Strike through a guarded enemy's stance and shove its action gauge backward.",
    target: "enemy",
    targetMode: "singleEnemy",
    kind: "active",
    tags: ["martial", "weapon", "control"],
    cooldownActivations: 1,
    effects: Object.freeze([
      Object.freeze({ type: "weaponDamage", multiplier: 0.85 }),
      Object.freeze({ type: "modifyGauge", target: "target", amount: -30 }),
    ]),
    selectionPrompt: "Choose an enemy to break",
  }),
  smite: Object.freeze({
    id: "smite",
    name: "Smite",
    description: "Spend Faith to call a focused blow against one enemy, with a chance to leave it bleeding.",
    target: "enemy",
    targetMode: "singleEnemy",
    kind: "active",
    tags: ["faith", "holy", "martial"],
    cost: Object.freeze({ resource: "faith", amount: 4 }),
    cooldownActivations: 1,
    effects: Object.freeze([
      Object.freeze({ type: "dealDamage", amount: 11 }),
      Object.freeze({ type: "applyStatus", statusId: "bleeding", chance: 0.35 }),
    ]),
    selectionPrompt: "Choose an enemy to smite",
  }),
  call_the_storm: Object.freeze({
    id: "call_the_storm",
    name: "Call the Storm",
    description: "A mystical invocation that lashes every enemy with cold rain and turns their momentum aside.",
    target: "enemy",
    targetMode: "allEnemies",
    kind: "active",
    tags: ["faith", "mystical", "spell", "area"],
    cost: Object.freeze({ resource: "faith", amount: 5 }),
    chargesPerCombat: 1,
    effects: Object.freeze([
      Object.freeze({ type: "dealDamage", amount: 7 }),
      Object.freeze({ type: "modifyGauge", target: "target", amount: -18 }),
    ]),
    selectionPrompt: "Call the storm across every enemy",
  }),
  steady_heart: Object.freeze({
    id: "steady_heart",
    name: "Steady Heart",
    description: "Begin each combat with a little action gauge already gathered.",
    kind: "passive",
    tags: ["faith", "discipline"],
    trigger: Object.freeze({
      event: "combatStart",
      effects: Object.freeze([{ type: "modifyGauge", target: "self", amount: 15 }]),
    }),
    effects: Object.freeze([{ type: "modifyGauge", target: "self", amount: 15 }]),
  }),
  pilgrims_resolve: Object.freeze({
    id: "pilgrims_resolve",
    name: "Pilgrim's Resolve",
    description: "Begin combat with a measured step toward action.",
    kind: "passive",
    tags: ["faith", "discipline", "travel"],
    trigger: Object.freeze({
      event: "combatStart",
      effects: Object.freeze([{ type: "modifyGauge", target: "self", amount: 10 }]),
    }),
  }),
  unyielding: Object.freeze({
    id: "unyielding",
    name: "Unyielding",
    description: "When Arthur is badly hurt, the first damaging exchange steels his footing.",
    kind: "passive",
    tags: ["martial", "defense", "survival"],
    trigger: Object.freeze({
      event: "damageTaken",
      conditions: Object.freeze({ healthBelowPercent: 0.4, oncePerCombat: true }),
      effects: Object.freeze([{ type: "setDefending", target: "self", value: true }]),
    }),
  }),
  battle_prayer: Object.freeze({
    id: "battle_prayer",
    name: "Battle Prayer",
    description: "The fall of an enemy returns a small measure of Faith once each combat.",
    kind: "passive",
    tags: ["faith", "combat", "resource"],
    trigger: Object.freeze({
      event: "enemyDefeated",
      oncePerCombat: true,
      effects: Object.freeze([{ type: "modifyResource", resource: "faith", amount: 1 }]),
    }),
  }),
  threefold_concord: Object.freeze({
    id: "threefold_concord",
    name: "Threefold Concord",
    description: "The forest, fountain, and Val answer together: begin each combat with one Faith, if there is room for it.",
    kind: "passive",
    tags: ["faith", "relic", "threefold"],
    trigger: Object.freeze({
      event: "combatStart",
      oncePerCombat: true,
      effects: Object.freeze([{ type: "modifyResource", resource: "faith", amount: 1 }]),
    }),
  }),
});

const COMBAT_STATUS_DEFINITIONS = Object.freeze({
  bleeding: Object.freeze({
    id: "bleeding",
    name: "Bleeding",
    description: "Lose 2 HP when ready to act. Lasts for three enemy activations.",
    periodicDamage: 2,
    durationActivations: 3,
    refreshBehavior: "refresh",
    triggers: Object.freeze([Object.freeze({
      event: "turnStart",
      effects: Object.freeze([{ type: "dealDamage", amount: 2 }]),
    })]),
  }),
  poisoned: Object.freeze({
    id: "poisoned",
    name: "Poisoned",
    description: "Lose 2 HP when ready to act. Lasts for four enemy activations.",
    periodicDamage: 2,
    durationActivations: 4,
    refreshBehavior: "refresh",
    triggers: Object.freeze([Object.freeze({
      event: "turnStart",
      effects: Object.freeze([{ type: "dealDamage", amount: 2 }]),
    })]),
  }),
});

const COMBAT_ENEMY_DEFINITIONS = Object.freeze({
  wild_boar: {
    id: "wild_boar",
    name: "Wild Boar",
    maxHp: 32,
    speed: 11,
    defense: 1,
    actionPattern: ["boar_charge", "boar_gore", "boar_gore"],
    visuals: {
      idle: {
        assetId: "combat_wild_boar_idle",
        frameCount: 17,
        columns: 5,
        fps: 16
      },
      attack: {
        assetId: "combat_wild_boar_attack",
        frameCount: 25,
        columns: 5,
        fps: 20
      }
    },
    visualScale: 0.5,
    lootSources: [
      {
        tableId: "basic_animal_loot",
        rolls: 2
      }
    ]
  },
  wolf: {
    id: "wolf",
    name: "Wolf",
    maxHp: 14,
    speed: 14,
    defense: 0,
    actionPattern: ["wolf_bite", "wolf_lunge", "wolf_bite"],
    visuals: {
      idle: {
        assetId: "combat_wolf_idle",
        frameCount: 23,
        columns: 5,
        fps: 16
      },
      attack: {
        assetId: "combat_wolf_attack",
        frameCount: 25,
        columns: 5,
        fps: 20,
        scale: 0.75
      }
    }
  },
  bandit: {
    id: "bandit",
    name: "Bandit",
    maxHp: 20,
    speed: 12,
    defense: 1,
    actionPattern: ["bandit_slash", "bandit_feint", "bandit_slash"],
    visuals: {
      idle: {
        assetId: "combat_bandit_idle",
        frameCount: 24,
        columns: 5,
        scale: 1.5,
        fps: 16
      },
      attack: {
        assetId: "combat_bandit_attack",
        frameCount: 25,
        columns: 5,
        fps: 20,
        scale: 2
      }
    },
    lootSources: [
      {
        tableId: "bandit_ambush_loot",
        rolls: 1
      }
    ]
  },
  bandit_leader: {
    id: "bandit_leader",
    name: "Bandit Leader",
    maxHp: 44,
    speed: 13,
    defense: 3,
    actionPattern: ["leader_strike", "leader_command", "leader_strike"],
    visuals: {
      idle: {
        assetId: "combat_bandit_leader_idle",
        frameCount: 24,
        columns: 5,
        fps: 16,
        scale: 1
      },
      attack: {
        assetId: "combat_bandit_leader_attack",
        frameCount: 24,
        columns: 5,
        scale: 1.25,
        fps: 20
      },
      walk: {}
    },
    visualScale: 1.1,
    lootSources: [
      {
        tableId: "bandit_leader_loot",
        rolls: 2
      }
    ]
  },
  summoned_guardian: {
    id: "summoned_guardian",
    name: "Morgan's Guardian",
    maxHp: 50,
    speed: 11,
    defense: 3,
    actionPattern: ["guardian_sweep", "guardian_sweep"]
  },
  fountain_knight: Object.freeze({
    id: "fountain_knight",
    name: "Fountain Knight",
    maxHp: 48,
    speed: 12,
    defense: 3,
    actionPattern: ["knight_lance", "knight_guard", "knight_lance"],
  }),
  false_knight: Object.freeze({
    id: "false_knight",
    name: "False Knight",
    maxHp: 36,
    speed: 11,
    defense: 2,
    actionPattern: ["false_knight_blade", "false_knight_blade"],
  }),
  serpent: Object.freeze({
    id: "serpent",
    name: "Spring Serpent",
    maxHp: 26,
    speed: 14,
    defense: 1,
    actionPattern: ["serpent_bite", "serpent_coil", "serpent_bite"],
  }),
  black_boar: Object.freeze({
    id: "black_boar",
    name: "Black Boar of Broceliande",
    maxHp: 42,
    speed: 10,
    defense: 2,
    actionPattern: ["black_boar_charge", "black_boar_gore", "black_boar_trample"],
  }),
  leper_knight: {
    id: "leper_knight",
    name: "Leper Knight",
    maxHp: 48,
    speed: 11,
    defense: 2,
    actionPattern: ["leper_blade", "leper_cough", "leper_blade"],
    lootSources: [
      {
        rolls: 1,
        tableId: "leper_knight_loot"
      }
    ]
  },
  morgans_huntsman: Object.freeze({
    id: "morgans_huntsman",
    name: "Morgan's Huntsman",
    maxHp: 22,
    speed: 14,
    defense: 1,
    actionPattern: ["huntsman_shot", "huntsman_hook", "huntsman_shot"],
  }),
  briar_knight: {
    id: "briar_knight",
    name: "Briar Knight",
    maxHp: 69,
    speed: 5,
    defense: 3,
    actionPattern: ["briar_cut", "briar_thrust", "briar_surge"],
    lootSources: [
      {
        tableId: "uncommon_materials",
        rolls: 1,
        chance: 0.75
      },
      {
        tableId: "forest_materials",
        rolls: 1
      },
      {
        tableId: "briar_knight_loot",
        rolls: 1,
        chance: 0.75
      }
    ]
  },
  black_hound_of_the_hunt: Object.freeze({
    id: "black_hound_of_the_hunt",
    name: "Black Hound of the Hunt",
    maxHp: 58,
    speed: 15,
    defense: 2,
    actionPattern: ["hound_bite", "hound_pounce", "hound_bite"],
  }),
  bound_warden: Object.freeze({
    id: "bound_warden",
    name: "Bound Warden",
    maxHp: 100,
    speed: 10,
    defense: 3,
    actionPattern: ["warden_strike", "warden_heavy_slam", "warden_strike", "warden_strike"],
    traits: [
      Object.freeze({
        type: "regeneration",
        amount: 4,
        trigger: "activation",
        suppressedByStatuses: ["bleeding", "poisoned"],
      }),
    ],
  }),
  verdant_warden: {
    id: "verdant_warden",
    name: "Verdant Warden",
    maxHp: 86,
    speed: 12,
    defense: 5,
    actionPattern: ["warden_strike", "warden_root_bind", "warden_heavy_slam", "warden_thorn_burst", "warden_strike"],
    tags: ["verdant", "enchanted", "warden", "boss"],
    traits: [
      {
        type: "regeneration",
        amount: 5,
        trigger: "activation",
        suppressedByStatuses: ["bleeding", "poisoned"]
      }
    ]
  },
  thorn_crowned_hart: Object.freeze({
    id: "thorn_crowned_hart",
    name: "Thorn-Crowned Hart",
    maxHp: 104,
    speed: 14,
    defense: 4,
    actionPattern: ["thorn_hart_charge", "thorn_hart_briar_rend", "thorn_hart_roar", "thorn_hart_charge"],
    tags: ["verdant", "enchanted", "stag", "boss"],
  }),
});

const COMBAT_ENEMY_ACTION_DEFINITIONS = Object.freeze({
  boar_gore: Object.freeze({
    id: "boar_gore",
    name: "Gore",
    damage: Object.freeze({ minimum: 5, maximum: 8 }),
    target: "arthur",
  }),
  boar_charge: Object.freeze({
    id: "boar_charge",
    name: "Charge",
    damage: Object.freeze({ minimum: 9, maximum: 13 }),
    target: "arthur",
  }),
  wolf_bite: Object.freeze({
    id: "wolf_bite",
    name: "Bite",
    damage: Object.freeze({ minimum: 3, maximum: 6 }),
    target: "arthur",
  }),
  wolf_lunge: Object.freeze({
    id: "wolf_lunge",
    name: "Lunge",
    damage: Object.freeze({ minimum: 5, maximum: 8 }),
    target: "arthur",
    injuryId: "sprained_ankle",
    injuryChance: 0.2,
  }),
  bandit_slash: {
    id: "bandit_slash",
    name: "Slash",
    damage: {
      maximum: 8,
      minimum: 4
    },
    target: "arthur"
  },
  bandit_feint: Object.freeze({
    id: "bandit_feint",
    name: "Feint",
    damage: Object.freeze({ minimum: 3, maximum: 6 }),
    target: "arthur",
    injuryId: "bruised_ribs",
    injuryChance: 0.12,
  }),
  leader_strike: Object.freeze({
    id: "leader_strike",
    name: "Leader's Strike",
    damage: Object.freeze({ minimum: 7, maximum: 11 }),
    target: "arthur",
    injuryId: "deep_cut",
    injuryChance: 0.12,
  }),
  leader_command: Object.freeze({
    id: "leader_command",
    name: "Commanding Blow",
    damage: Object.freeze({ minimum: 5, maximum: 9 }),
    target: "arthur",
    injuryId: "bruised_ribs",
    injuryChance: 0.18,
  }),
  guardian_sweep: Object.freeze({
    id: "guardian_sweep",
    name: "Spectral Sweep",
    damage: Object.freeze({ minimum: 7, maximum: 11 }),
    target: "arthur",
    injuryId: "bruised_ribs",
    injuryChance: 0.16,
  }),
  knight_lance: Object.freeze({
    id: "knight_lance",
    name: "Measured Lance",
    damage: Object.freeze({ minimum: 6, maximum: 10 }),
    target: "arthur",
    injuryId: "deep_cut",
    injuryChance: 0.1,
  }),
  knight_guard: Object.freeze({
    id: "knight_guard",
    name: "Guarded Stroke",
    damage: Object.freeze({ minimum: 4, maximum: 7 }),
    target: "arthur",
  }),
  false_knight_blade: Object.freeze({
    id: "false_knight_blade",
    name: "Uncertain Blade",
    damage: Object.freeze({ minimum: 5, maximum: 8 }),
    target: "arthur",
  }),
  serpent_bite: Object.freeze({
    id: "serpent_bite",
    name: "Venomous Bite",
    damage: Object.freeze({ minimum: 4, maximum: 7 }),
    target: "arthur",
    injuryId: "poisoned",
    injuryChance: 0.2,
  }),
  serpent_coil: Object.freeze({
    id: "serpent_coil",
    name: "Coiling Strike",
    damage: Object.freeze({ minimum: 3, maximum: 5 }),
    target: "arthur",
    injuryId: "sprained_ankle",
    injuryChance: 0.12,
  }),
  black_boar_charge: Object.freeze({
    id: "black_boar_charge",
    name: "Black Charge",
    damage: Object.freeze({ minimum: 10, maximum: 14 }),
    target: "arthur",
    injuryId: "deep_cut",
    injuryChance: 0.08,
  }),
  black_boar_gore: Object.freeze({
    id: "black_boar_gore",
    name: "Enchanted Gore",
    damage: Object.freeze({ minimum: 6, maximum: 10 }),
    target: "arthur",
    injuryId: "bruised_ribs",
    injuryChance: 0.16,
  }),
  black_boar_trample: Object.freeze({
    id: "black_boar_trample",
    name: "Trampling Rush",
    damage: Object.freeze({ minimum: 4, maximum: 7 }),
    target: "arthur",
    injuryId: "sprained_ankle",
    injuryChance: 0.2,
  }),
  leper_blade: Object.freeze({
    id: "leper_blade",
    name: "Blunted Knight's Blade",
    damage: Object.freeze({ minimum: 5, maximum: 8 }),
    target: "arthur",
    injuryId: "deep_cut",
    injuryChance: 0.1,
  }),
  leper_cough: Object.freeze({
    id: "leper_cough",
    name: "Sickening Cough",
    damage: Object.freeze({ minimum: 3, maximum: 6 }),
    target: "arthur",
    injuryId: "poisoned",
    injuryChance: 0.18,
  }),
  huntsman_shot: Object.freeze({
    id: "huntsman_shot",
    name: "Enchanted Shot",
    damage: Object.freeze({ minimum: 4, maximum: 7 }),
    target: "arthur",
    injuryId: "deep_cut",
    injuryChance: 0.06,
  }),
  huntsman_hook: Object.freeze({
    id: "huntsman_hook",
    name: "Hooked Staff",
    damage: Object.freeze({ minimum: 3, maximum: 6 }),
    target: "arthur",
    injuryId: "bruised_ribs",
    injuryChance: 0.12,
  }),
  briar_cut: Object.freeze({
    id: "briar_cut",
    name: "Thorned Cut",
    damage: Object.freeze({ minimum: 6, maximum: 9 }),
    target: "arthur",
    injuryId: "deep_cut",
    injuryChance: 0.1,
  }),
  briar_thrust: Object.freeze({
    id: "briar_thrust",
    name: "Briar Thrust",
    damage: Object.freeze({ minimum: 4, maximum: 8 }),
    target: "arthur",
    injuryId: "sprained_ankle",
    injuryChance: 0.14,
  }),
  briar_surge: Object.freeze({
    id: "briar_surge",
    name: "Thorn Surge",
    damage: Object.freeze({ minimum: 3, maximum: 6 }),
    target: "arthur",
    injuryId: "bruised_ribs",
    injuryChance: 0.16,
  }),
  hound_bite: Object.freeze({
    id: "hound_bite",
    name: "Black Bite",
    damage: Object.freeze({ minimum: 6, maximum: 10 }),
    target: "arthur",
    injuryId: "deep_cut",
    injuryChance: 0.1,
  }),
  hound_pounce: Object.freeze({
    id: "hound_pounce",
    name: "Pouncing Rush",
    damage: Object.freeze({ minimum: 9, maximum: 14 }),
    target: "arthur",
    injuryId: "sprained_ankle",
    injuryChance: 0.15,
  }),
  warden_strike: Object.freeze({
    id: "warden_strike",
    name: "Bound Strike",
    damage: Object.freeze({ minimum: 7, maximum: 11 }),
    target: "arthur",
    injuryId: "deep_cut",
    injuryChance: 0.1,
  }),
  warden_heavy_slam: Object.freeze({
    id: "warden_heavy_slam",
    name: "Grave-Splitting Slam",
    damage: Object.freeze({ minimum: 16, maximum: 22 }),
    target: "arthur",
    injuryId: "bruised_ribs",
    injuryChance: 0.2,
    telegraphed: true,
  }),
  warden_root_bind: Object.freeze({
    id: "warden_root_bind",
    name: "Root Bind",
    damage: Object.freeze({ minimum: 8, maximum: 13 }),
    target: "arthur",
    statusId: "poisoned",
    statusChance: 0.55,
  }),
  warden_thorn_burst: Object.freeze({
    id: "warden_thorn_burst",
    name: "Thorn Burst",
    damage: Object.freeze({ minimum: 10, maximum: 16 }),
    target: "arthur",
    injuryId: "deep_cut",
    injuryChance: 0.18,
    telegraphed: true,
  }),
  thorn_hart_charge: Object.freeze({
    id: "thorn_hart_charge",
    name: "Thorn Charge",
    damage: Object.freeze({ minimum: 12, maximum: 18 }),
    target: "arthur",
    injuryId: "bruised_ribs",
    injuryChance: 0.22,
    telegraphed: true,
  }),
  thorn_hart_briar_rend: Object.freeze({
    id: "thorn_hart_briar_rend",
    name: "Briar Rend",
    damage: Object.freeze({ minimum: 8, maximum: 14 }),
    target: "arthur",
    injuryId: "deep_cut",
    injuryChance: 0.24,
  }),
  thorn_hart_roar: Object.freeze({
    id: "thorn_hart_roar",
    name: "Verdant Roar",
    damage: Object.freeze({ minimum: 6, maximum: 10 }),
    target: "arthur",
    statusId: "bleeding",
    statusChance: 0.65,
  }),
});

const COMBAT_DEFINITIONS = Object.freeze({
  wild_boar: Object.freeze({
    id: "wild_boar",
    enemyIds: ["wild_boar"],
  }),
  wolves: Object.freeze({
    id: "wolves",
    enemyIds: ["wolf", "wolf", "wolf"],
  }),
  bandit_ambush: Object.freeze({
    id: "bandit_ambush",
    enemyIds: ["bandit", "bandit"],
  }),
  bandit_leader: Object.freeze({
    id: "bandit_leader",
    enemyIds: ["bandit_leader"],
  }),
  summoned_guardian: Object.freeze({
    id: "summoned_guardian",
    enemyIds: ["summoned_guardian"],
  }),
  fountain_knight: Object.freeze({
    id: "fountain_knight",
    enemyIds: ["fountain_knight"],
  }),
  false_knight: Object.freeze({
    id: "false_knight",
    enemyIds: ["false_knight"],
  }),
  serpent_at_spring: Object.freeze({
    id: "serpent_at_spring",
    enemyIds: ["serpent"],
  }),
  black_boar_broceliande: Object.freeze({
    id: "black_boar_broceliande",
    enemyIds: ["black_boar"],
  }),
  leper_knight: Object.freeze({
    id: "leper_knight",
    enemyIds: ["leper_knight"],
  }),
  morgans_huntsmen: Object.freeze({
    id: "morgans_huntsmen",
    enemyIds: ["morgans_huntsman", "morgans_huntsman"],
  }),
  briar_knight: Object.freeze({
    id: "briar_knight",
    enemyIds: ["briar_knight"],
  }),
  black_hound_of_the_hunt: Object.freeze({
    id: "black_hound_of_the_hunt",
    enemyIds: ["black_hound_of_the_hunt"],
  }),
  bound_warden: Object.freeze({
    id: "bound_warden",
    enemyIds: ["bound_warden"],
  }),
  verdant_warden: Object.freeze({
    id: "verdant_warden",
    enemyIds: ["verdant_warden"],
  }),
  thorn_crowned_hart: Object.freeze({
    id: "thorn_crowned_hart",
    enemyIds: ["thorn_crowned_hart"],
  }),
});
