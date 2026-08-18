"use strict";

// All event listeners pass through this dispatcher.  Listener order is part
// of the combat contract and is stable even if authored object key order is
// changed:
// actor statuses -> equipped passives -> learned passives -> target statuses
// -> target passives.  Entries within each source are sorted by stable ID.
const COMBAT_EVENT_TRIGGER_ORDER = Object.freeze([
  "actor-status",
  "equipped-effects",
  "learned-passives",
  "target-status",
  "target-passives",
]);

const CombatEventSystem = Object.freeze({
  dispatch(state, eventType, context = {}, options = {}) {
    if (!state || !eventType) return { eventType, triggered: 0 };
    state.eventDispatchDepth = Number(state.eventDispatchDepth) || 0;
    if (state.eventDispatchDepth >= 32) {
      recordCombatEvent(state, {
        type: "combat-event-limit",
        eventType,
        source: context.sourceCombatant?.id ?? null,
        target: context.targetCombatant?.id ?? null,
      });
      return { eventType, triggered: 0, blocked: true };
    }
    const source = context.sourceCombatant ?? context.source ?? null;
    const target = context.targetCombatant ?? context.target ?? null;
    const normalized = context;
    normalized.state = state;
    normalized.eventType = eventType;
    normalized.sourceCombatant = source;
    normalized.targetCombatant = target;
    normalized.random = state.random;
    if (!options.skipRecord) {
      recordCombatEvent(state, {
        type: "combat-event",
        eventType,
        source: source?.id ?? null,
        target: target?.id ?? null,
        abilityId: normalized.abilityId ?? null,
        sourceItemId: normalized.sourceItem?.id ?? normalized.sourceItemId ?? null,
        sourcePassiveId: normalized.sourcePassive?.id ?? null,
      });
    }
    state.eventDispatchDepth += 1;
    let triggered = 0;
    try {
      const listeners = options.onlyStatuses
        ? statusListeners(source, eventType, "actor-status")
        : this.listeners(state, normalized, eventType);
      listeners.forEach((listener) => {
          if (listener.owner && !isLivingCombatant(listener.owner)
            && !["actorDefeated", "enemyDefeated", "allyDefeated"].includes(eventType)) return;
          if (!CombatConditionEvaluator.evaluate(listener.conditions, {
            ...normalized,
            sourceCombatant: listener.owner ?? source,
            targetCombatant: target,
            passiveKey: listener.id,
          })) return;
          // Listener effects execute as the listener owner, but the event's
          // source must remain stable for the action resolver. A target-side
          // status or passive must not turn the attacker into the target for
          // the remainder of the same event dispatch.
          const listenerContext = {
            ...normalized,
            eventType,
            sourcePassive: listener,
            sourceStatus: listener.sourceStatus ?? null,
            sourceCombatant: listener.owner ?? source,
            targetCombatant: target ?? listener.owner ?? source,
            passiveKey: listener.id,
            passiveUseKey: `${listener.owner?.id ?? "combat"}:${listener.id}`,
          };
          if (listener.oncePerCombat || listener.conditions?.oncePerCombat) {
            state.combatConditionUses ??= {};
            const useKey = listenerContext.passiveUseKey;
            if (state.combatConditionUses[useKey]) return;
            state.combatConditionUses[useKey] = true;
          }
          recordCombatEvent(state, {
            type: "passive-trigger",
            eventType,
            source: listener.owner?.id ?? null,
            sourcePassiveId: listener.id,
            sourceStatusId: listener.sourceStatus ?? null,
          });
          CombatEffectResolver.resolve(state, listenerContext, listener.effects ?? []);
          // These fields intentionally flow back into the shared event. This
          // is how an ordered beforeAction passive contributes a damage bonus
          // while retaining the original event source/target identities.
          ["damageBonus", "modifiedDamage", "finalDamage", "damagePrevented", "injuryId"]
            .forEach((key) => {
              if (listenerContext[key] !== undefined) normalized[key] = listenerContext[key];
            });
          triggered += 1;
      });
    } finally {
      state.eventDispatchDepth -= 1;
    }
    return { eventType, triggered };
  },

  listeners(state, context, eventType) {
    const source = context.sourceCombatant;
    const target = context.targetCombatant;
    const listeners = [];
    if (source) {
      listeners.push(...statusListeners(source, eventType, "actor-status"));
      listeners.push(...collectAbilityPassives(collectStatusAbilityIds(source))
        .filter((passive) => passive.trigger?.event === eventType)
        .map((passive) => normalizePassive(passive, source, "actor-status")));
      listeners.push(...(source.equippedPassives ?? [])
        .filter((passive) => passive.trigger?.event === eventType)
        .map((passive) => normalizePassive(passive, source, "equipped-effects")));
      listeners.push(...(source.learnedPassives ?? [])
        .filter((passive) => passive.trigger?.event === eventType)
        .map((passive) => normalizePassive(passive, source, "learned-passives")));
      listeners.push(...(source.passiveDefinitions ?? [])
        .filter((passive) => passive.trigger?.event === eventType)
        .map((passive) => normalizePassive(passive, source, "target-passives")));
    }
    if (target && target !== source) {
      listeners.push(...statusListeners(target, eventType, "target-status"));
      listeners.push(...collectAbilityPassives(collectStatusAbilityIds(target))
        .filter((passive) => passive.trigger?.event === eventType)
        .map((passive) => normalizePassive(passive, target, "target-status")));
      listeners.push(...(target.equippedPassives ?? [])
        // Equipment on-hit effects belong to the striking item owner. They
        // must not run as a target reaction when an enemy weapon emits the
        // same shared attackHit lifecycle event.
        .filter((passive) => passive.trigger?.event === eventType
          && !(eventType === "attackHit" && passive.sourceItemId))
        .map((passive) => normalizePassive(passive, target, "target-passives")));
      listeners.push(...(target.learnedPassives ?? [])
        .filter((passive) => passive.trigger?.event === eventType)
        .map((passive) => normalizePassive(passive, target, "target-passives")));
      listeners.push(...(target.passiveDefinitions ?? [])
        .filter((passive) => passive.trigger?.event === eventType)
        .map((passive) => normalizePassive(passive, target, "target-passives")));
    }
    return listeners.sort((left, right) => {
      const order = COMBAT_EVENT_TRIGGER_ORDER.indexOf(left.orderGroup)
        - COMBAT_EVENT_TRIGGER_ORDER.indexOf(right.orderGroup);
      return order || left.id.localeCompare(right.id);
    });
  },

  dispatchStatusTriggers(state, combatant, eventType) {
    if (!combatant) return { triggered: 0 };
    const result = this.dispatch(state, eventType, {
      sourceCombatant: combatant,
      targetCombatant: combatant,
    }, { onlyStatuses: true, skipRecord: true });
    if (eventType === "turnStart") expireActivationStatuses(state, combatant);
    return result;
  },
});

function statusListeners(combatant, eventType, orderGroup) {
  return Object.keys(combatant.statuses ?? {}).sort().flatMap((statusId) => {
    const definition = COMBAT_STATUS_DEFINITIONS[statusId];
    const entry = combatant.statuses?.[statusId];
    if (!definition || !entry) return [];
    const triggers = Array.isArray(definition.triggers)
      ? definition.triggers
      : definition.periodicDamage > 0 && eventType === "turnStart"
        ? [{ event: "turnStart", effects: [{ type: "dealDamage", amount: definition.periodicDamage }] }]
        : [];
    return triggers
      .map((trigger, index) => ({
        ...normalizePassive({
          id: `status:${combatant.id}:${statusId}:${index}`,
          trigger,
          sourceStatus: statusId,
        }, combatant, orderGroup),
        sourceStatus: statusId,
        statusEntry: entry,
        statusDefinition: definition,
      }))
      .filter((listener) => listener.trigger?.event === eventType);
  });
}

function normalizePassive(passive, owner, orderGroup) {
  const trigger = passive.trigger ?? {};
  return {
    ...passive,
    id: String(passive.id ?? `${orderGroup}:${owner?.id ?? "unknown"}`),
    owner,
    orderGroup,
    conditions: passive.conditions ?? trigger.conditions ?? null,
    effects: passive.effects ?? trigger.effects ?? [],
    oncePerCombat: passive.oncePerCombat ?? trigger.oncePerCombat ?? false,
  };
}

function expireActivationStatuses(state, combatant) {
  const statusIds = Object.keys(combatant.statuses ?? {}).sort();
  statusIds.forEach((statusId) => {
    const entry = combatant.statuses?.[statusId];
    if (!entry) return;
    entry.remainingActivations = Math.max(0, (Number(entry.remainingActivations) || 0) - 1);
    if (entry.remainingActivations > 0) return;
    delete combatant.statuses[statusId];
    recordCombatEvent(state, { type: "status-expired", target: combatant.id, statusId });
    const definition = COMBAT_STATUS_DEFINITIONS[statusId];
    addCombatLog(state, `${combatant.name} is no longer ${definition?.name?.toLowerCase() ?? statusId}.`);
  });
}
