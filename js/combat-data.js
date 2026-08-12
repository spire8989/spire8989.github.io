"use strict";

// Combat content stays separate from the frame-rate-independent simulation.
const COMBAT_ABILITY_DEFINITIONS = Object.freeze({
  attack: Object.freeze({ id: "attack", name: "Attack", target: "enemy" }),
  defend: Object.freeze({ id: "defend", name: "Defend", target: "self" }),
  intercede: Object.freeze({
    id: "intercede",
    name: "Intercede",
    target: "self",
    description: "Protect Arthur from the next targeted attack.",
  }),
  flee: Object.freeze({ id: "flee", name: "Flee", target: "none" }),
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
});

const COMBAT_DEFINITIONS = Object.freeze({
  wild_boar: Object.freeze({
    id: "wild_boar",
    enemyIds: ["wild_boar"],
  }),
});
