"use strict";

// Combat content stays separate from the frame-rate-independent simulation.
const COMBAT_ABILITY_DEFINITIONS = Object.freeze({
  attack: Object.freeze({
    id: "attack",
    name: "Attack",
    target: "enemy",
    selectionPrompt: "Choose an enemy target",
    category: "action",
  }),
  defend: Object.freeze({ id: "defend", name: "Defend", target: "self", category: "action" }),
  abilities: Object.freeze({
    id: "abilities",
    name: "Abilities",
    description: "Use a learned or equipped combat ability.",
    target: "menu",
    category: "action",
  }),
  items: Object.freeze({
    id: "items",
    name: "Items",
    description: "Use a carried combat item.",
    target: "menu",
    category: "action",
  }),
  pommel_strike: Object.freeze({
    id: "pommel_strike",
    name: "Pommel Strike",
    description: "Deal reduced weapon damage and push an enemy's action gauge back.",
    target: "enemy",
    selectionPrompt: "Choose an enemy target",
    effectType: "damageAndGauge",
    damageMultiplier: 0.6,
    gaugeReduction: 25,
  }),
  intercede: Object.freeze({
    id: "intercede",
    name: "Intercede",
    target: "self",
    description: "Protect Arthur from the next targeted attack.",
    effectType: "intercede",
  }),
  charge: Object.freeze({
    id: "charge",
    name: "Charge",
    description: "Llamrei strikes an enemy and pushes its action gauge back.",
    target: "enemy",
    selectionPrompt: "Choose an enemy for Charge",
    effectType: "damageAndGauge",
    damageMultiplier: 1.15,
    gaugeReduction: 10,
  }),
  flee: Object.freeze({ id: "flee", name: "Flee", target: "none", category: "action" }),
});

const COMBAT_ENEMY_DEFINITIONS = Object.freeze({
  wild_boar: Object.freeze({
    id: "wild_boar",
    name: "Wild Boar",
    maxHp: 32,
    speed: 11,
    defense: 1,
    actionPattern: ["boar_charge", "boar_gore", "boar_gore"],
  }),
  wolf: Object.freeze({
    id: "wolf",
    name: "Wolf",
    maxHp: 14,
    speed: 14,
    defense: 0,
    actionPattern: ["wolf_bite", "wolf_lunge", "wolf_bite"],
  }),
  bandit: Object.freeze({
    id: "bandit",
    name: "Bandit",
    maxHp: 20,
    speed: 12,
    defense: 1,
    actionPattern: ["bandit_slash", "bandit_feint", "bandit_slash"],
  }),
  bandit_leader: Object.freeze({
    id: "bandit_leader",
    name: "Bandit Leader",
    maxHp: 44,
    speed: 13,
    defense: 3,
    actionPattern: ["leader_strike", "leader_command", "leader_strike"],
  }),
  summoned_guardian: Object.freeze({
    id: "summoned_guardian",
    name: "Morgan's Guardian",
    maxHp: 50,
    speed: 11,
    defense: 3,
    actionPattern: ["guardian_sweep", "guardian_sweep"],
  }),
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
  bandit_slash: Object.freeze({
    id: "bandit_slash",
    name: "Slash",
    damage: Object.freeze({ minimum: 4, maximum: 7 }),
    target: "arthur",
  }),
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
});
