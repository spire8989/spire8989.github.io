"use strict";

// Target selection is deliberately independent from action execution.  A
// target mode is interpreted relative to the source combatant, so the same
// ability definition works for an ally or an enemy.
const CombatTargetResolver = Object.freeze({
  modes: Object.freeze([
    "self", "singleEnemy", "singleAlly", "allEnemies", "allAllies", "none",
  ]),

  normalizeMode(definition = {}) {
    if (definition.targetMode) return definition.targetMode;
    return ({
      enemy: "singleEnemy",
      ally: "singleAlly",
      self: "self",
      none: "none",
      menu: "none",
    })[definition.target] ?? "none";
  },

  candidates(state, source, mode) {
    if (!state || !source) return [];
    if (mode === "self") return [source];
    if (mode === "none") return [];
    const opposing = source.side === "ally" ? state.enemies : state.allies;
    const friendly = source.side === "ally" ? state.allies : state.enemies;
    if (mode === "singleEnemy" || mode === "allEnemies") {
      return opposing.filter(isLivingCombatant);
    }
    if (mode === "singleAlly" || mode === "allAllies") {
      return friendly.filter(isLivingCombatant);
    }
    return [];
  },

  resolve(state, source, mode, explicitTargetId = null, options = {}) {
    const candidates = this.candidates(state, source, mode);
    if (mode === "self") return { targets: [source], candidates };
    if (mode === "none") return { targets: [], candidates };
    if (mode === "allEnemies" || mode === "allAllies") {
      return { targets: candidates, candidates };
    }
    if (explicitTargetId) {
      const explicit = candidates.find((entry) => entry.id === explicitTargetId);
      return { targets: explicit ? [explicit] : [], candidates };
    }
    if (typeof options.selectTarget === "function") {
      const selected = options.selectTarget(candidates);
      return { targets: selected ? [selected] : [], candidates };
    }
    return { targets: candidates.length > 0 ? [candidates[0]] : [], candidates };
  },
});

function isLivingCombatant(combatant) {
  return Boolean(combatant && combatant.hp > 0);
}
