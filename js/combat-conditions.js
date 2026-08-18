"use strict";

// Conditions are intentionally small and explicit.  They are data, not an
// expression language, and every random condition consumes the combat RNG.
const CombatConditionEvaluator = Object.freeze({
  evaluate(conditions, context = {}) {
    if (!conditions) return true;
    if (Array.isArray(conditions)) {
      return conditions.every((condition) => this.evaluate(condition, context));
    }
    if (typeof conditions !== "object") return false;

    if (conditions.all !== undefined) {
      if (!Array.isArray(conditions.all) || !conditions.all.every((condition) => this.evaluate(condition, context))) return false;
    }
    if (conditions.any !== undefined) {
      if (!Array.isArray(conditions.any) || !conditions.any.some((condition) => this.evaluate(condition, context))) return false;
    }

    const source = context.sourceCombatant ?? context.source;
    const target = context.targetCombatant ?? context.target;
    if (conditions.sourceSide && source?.side !== conditions.sourceSide) return false;
    if (conditions.targetSide && target?.side !== conditions.targetSide) return false;
    if (conditions.actionId && context.actionId !== conditions.actionId) return false;
    if (conditions.event && context.eventType !== conditions.event) return false;
    if (conditions.healthBelowPercent !== undefined
      && !healthPercentMatches(source, conditions.healthBelowPercent, (value, limit) => value < limit)) {
      return false;
    }
    if (conditions.healthAbovePercent !== undefined
      && !healthPercentMatches(source, conditions.healthAbovePercent, (value, limit) => value > limit)) {
      return false;
    }
    if (conditions.targetHealthBelowPercent !== undefined
      && !healthPercentMatches(target, conditions.targetHealthBelowPercent, (value, limit) => value < limit)) {
      return false;
    }
    if (conditions.targetHealthAbovePercent !== undefined
      && !healthPercentMatches(target, conditions.targetHealthAbovePercent, (value, limit) => value > limit)) {
      return false;
    }
    if (conditions.hasStatus !== undefined && !hasStatus(target ?? source, conditions.hasStatus)) return false;
    if (conditions.missingStatus !== undefined && hasStatus(target ?? source, conditions.missingStatus)) return false;
    if (conditions.firstUse && conditionUseCount(context) !== 1) return false;
    if (conditions.oncePerCombat) {
      const key = context.passiveUseKey
        ?? context.passiveKey
        ?? context.abilityId
        ?? "condition";
      if (context.state?.combatConditionUses?.[key]) return false;
    }
    if (conditions.chance !== undefined) {
      const chance = Math.max(0, Math.min(1, Number(conditions.chance) || 0));
      if (typeof context.random !== "function" || context.random() >= chance) return false;
    }
    return true;
  },
});

function conditionUseCount(context) {
  if (Number.isFinite(Number(context.useCount))) return Number(context.useCount);
  const abilityId = context.abilityId ?? context.actionId;
  if (!abilityId || !context.state) return 0;
  return 1 + (context.state.events ?? []).filter((event) => (
    (event.type === "action" || !event.type)
      && (event.abilityId === abilityId || event.action === abilityId)
  )).length;
}

function healthPercentMatches(combatant, limit, predicate) {
  if (!combatant || !Number.isFinite(Number(combatant.maxHp)) || combatant.maxHp <= 0) return false;
  return predicate(combatant.hp / combatant.maxHp, Math.max(0, Number(limit) || 0));
}

function hasStatus(combatant, statusIds) {
  if (!combatant) return false;
  const ids = Array.isArray(statusIds) ? statusIds : [statusIds];
  return ids.some((statusId) => Boolean(combatant.statuses?.[statusId]));
}
