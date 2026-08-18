"use strict";

// Shared action/effect runtime.  CombatSystem owns the ATB state machine;
// this resolver owns the authored consequences of an action or trigger.
const CombatEffectResolver = Object.freeze({
  resolve(state, context, effects = []) {
    const list = Array.isArray(effects) ? effects : [effects];
    const result = {
      damage: 0,
      baseDamage: 0,
      healingAmount: 0,
      gaugeReduction: 0,
      damagePrevented: 0,
      effectsResolved: 0,
      resourceChanges: [],
    };
    list.forEach((effect) => {
      if (!effect || typeof effect !== "object") return;
      const effectResult = this.resolveOne(state, context, effect);
      result.effectsResolved += 1;
      result.damage += Number(effectResult.damage) || 0;
      result.baseDamage += Number(effectResult.baseDamage) || 0;
      result.healingAmount += Number(effectResult.healingAmount) || 0;
      result.gaugeReduction += Number(effectResult.gaugeReduction) || 0;
      result.damagePrevented += Number(effectResult.damagePrevented) || 0;
      if (effectResult.resourceChange) result.resourceChanges.push(effectResult.resourceChange);
    });
    return result;
  },

  resolveOne(state, context, effect) {
    const source = context.sourceCombatant ?? context.source;
    const target = effectTarget(state, context, effect.target);
    switch (effect.type) {
      case "dealDamage":
        return this.dealDamage(state, { ...context, targetCombatant: target }, effect, false);
      case "weaponDamage":
        return this.dealDamage(state, { ...context, targetCombatant: target }, effect, true);
      case "heal":
        return this.heal(target, effect.amount);
      case "modifyGauge":
        return this.modifyGauge(target, effect.amount);
      case "applyStatus":
        return this.applyStatus(state, { ...context, targetCombatant: target }, effect);
      case "removeStatus":
        return this.removeStatus(state, target, effect.statusId);
      case "modifyStat":
        return this.modifyStat(target, effect);
      case "modifyResource":
        return this.modifyResource(state, context, effect);
      case "storeCharge":
        return this.storeCharge(state, context, effect);
      case "consumeCharge":
        return this.consumeCharge(state, context, effect);
      case "conditional":
        return CombatConditionEvaluator.evaluate(effect.condition ?? effect.conditions, {
          ...context,
          state,
          random: state.random,
          targetCombatant: target,
        })
          ? this.resolve(state, context, effect.effects ?? [])
          : this.resolve(state, context, effect.elseEffects ?? []);
      case "randomChance": {
        const chance = Math.max(0, Math.min(1, Number(effect.chance) || 0));
        const passed = state.random() < chance;
        recordCombatEvent(state, {
          type: "combat-effect-random",
          effectType: effect.type,
          chance,
          passed,
          abilityId: context.abilityId ?? null,
        });
        return this.resolve(state, context, passed ? effect.effects ?? [] : effect.elseEffects ?? []);
      }
      case "setDefending":
        if (target) target.defending = effect.value !== false;
        return {};
      case "setFlag":
        if (target && typeof effect.flag === "string") target[effect.flag] = effect.value;
        return {};
      case "attemptFlee": {
        const escaped = state.random() < (Number(effect.chance) || COMBAT_TUNING.fleeChance);
        recordCombatEvent(state, {
          actor: source?.id ?? null,
          action: "flee",
          target: null,
          damage: 0,
          escaped,
        });
        if (escaped) finishCombat(state, "fled");
        return { escaped };
      }
      case "recordTrait":
        return this.recordTrait(state, context, effect);
      case "applyInjury":
        return this.applyInjury(state, context, target, effect);
      default:
        return {};
    }
  },

  dealDamage(state, context, effect, weaponDamage) {
    const source = context.sourceCombatant ?? context.source;
    const target = context.targetCombatant ?? context.target;
    if (!source || !target || !isLivingCombatant(target)) return {};
    if (!weaponDamage) {
      const amount = Math.max(0, Number(effect.amount) || 0);
      applyCombatDamage(state, target, amount);
      if (context.sourceStatus) {
        recordCombatEvent(state, {
          type: "status-tick",
          target: target.id,
          statusId: context.sourceStatus,
          damage: amount,
          remainingActivations: Number(target.statuses?.[context.sourceStatus]?.remainingActivations) || 0,
        });
        addCombatLog(state, `${target.name} suffers ${amount} damage from ${COMBAT_STATUS_DEFINITIONS[context.sourceStatus]?.name ?? context.sourceStatus}.`);
      }
      const damageEvent = {
        ...context,
        eventType: "damageDealt",
        damage: amount,
        baseDamage: amount,
        modifiedDamage: amount,
        finalDamage: amount,
        source: source.id,
        target: target.id,
        resultMetadata: { ...(context.resultMetadata ?? {}) },
      };
      CombatEventSystem.dispatch(state, "damageDealt", damageEvent);
      CombatEventSystem.dispatch(state, "damageTaken", damageEvent);
      CombatEventSystem.dispatch(state, "afterDamage", damageEvent);
      if (target.hp <= 0) {
        target.interceding = false;
        CombatEventSystem.dispatch(state, "actorDefeated", damageEvent);
        CombatEventSystem.dispatch(state, target.side === "enemy" ? "enemyDefeated" : "allyDefeated", damageEvent);
      }
      return { damage: amount, baseDamage: amount, finalDamage: amount };
    }
    const range = effect.range ?? context.damageRange ?? source.damage;
    const multiplier = Number(effect.multiplier ?? 1);
    const rolled = rollCombatDamage(range, state.random);
    const scaled = multiplier === 1 ? rolled : Math.floor(rolled * multiplier);
    const bonusDamage = Number(context.damageBonus) || 0;
    const rawDamage = Math.max(1, scaled + bonusDamage);
    const damageContext = {
      ...context,
      eventType: "beforeDamage",
      targetCombatant: target,
      baseDamage: rawDamage,
      modifiedDamage: rawDamage,
      finalDamage: null,
      resultMetadata: { ...(context.resultMetadata ?? {}) },
    };
    CombatEventSystem.dispatch(state, "beforeDamage", damageContext);
    const modified = Math.max(0, Number(damageContext.modifiedDamage ?? damageContext.baseDamage) || 0);
    const mitigated = calculateCombatDamage(modified, target.defense);
    const unguardedDamage = Math.max(1, Math.floor(
      mitigated * incomingDamageMultiplier(state, target),
    ));
    const guarded = target.defending && source.side === "enemy"
      ? Math.max(1, Math.floor(mitigated * COMBAT_TUNING.defendDamageMultiplier))
      : mitigated;
    const finalDamage = Math.max(1, Math.floor(guarded * incomingDamageMultiplier(state, target)));
    const damagePrevented = target.defending && source.side === "enemy"
      ? Math.max(0, unguardedDamage - finalDamage) : 0;
    damageContext.finalDamage = finalDamage;
    damageContext.resultMetadata.damagePrevented = damagePrevented;
    damageContext.resultMetadata.rawDamage = rolled;
    damageContext.resultMetadata.modifiedDamage = modified;
    applyCombatDamage(state, target, finalDamage);
    context.resultMetadata ??= {};
    context.resultMetadata.rawDamage = rolled;
    context.resultMetadata.modifiedDamage = modified;
    const damageEvent = {
      ...damageContext,
      eventType: "damageDealt",
      damage: finalDamage,
      source: source.id,
      target: target.id,
    };
    CombatEventSystem.dispatch(state, "damageDealt", damageEvent);
    CombatEventSystem.dispatch(state, "damageTaken", damageEvent);
    if (damagePrevented > 0) {
      CombatEventSystem.dispatch(state, "damagePrevented", {
        ...damageEvent,
        damagePrevented,
      });
    }
    CombatEventSystem.dispatch(state, "afterDamage", damageEvent);
    // A weapon hit is successful whenever damage resolves. attackHit is
    // intentionally emitted before defeat events so on-hit reactions can
    // observe the final hit, including a killing blow. Authored effects may
    // opt out with triggersOnHit:false; onHit:false remains a legacy alias.
    const triggersOnHit = effect.triggersOnHit !== false && effect.onHit !== false;
    if (triggersOnHit && finalDamage > 0) {
      CombatEventSystem.dispatch(state, "attackHit", damageEvent);
    }
    if (target.hp <= 0) {
      target.interceding = false;
      CombatEventSystem.dispatch(state, "actorDefeated", damageEvent);
      CombatEventSystem.dispatch(
        state,
        target.side === "enemy" ? "enemyDefeated" : "allyDefeated",
        damageEvent,
      );
    }
    context.baseDamage = rolled;
    context.modifiedDamage = modified;
    context.finalDamage = finalDamage;
    context.damagePrevented = damagePrevented;
    context.lastDamageTargetId = target.id;
    return {
      damage: finalDamage,
      baseDamage: rolled,
      damagePrevented,
    };
  },

  heal(target, amount) {
    if (!target || !isLivingCombatant(target)) return { healingAmount: 0 };
    const healingAmount = Math.min(
      Math.max(0, Number(amount) || 0),
      Math.max(0, target.maxHp - target.hp),
    );
    target.hp += healingAmount;
    return { healingAmount };
  },

  modifyGauge(target, amount) {
    if (!target) return { gaugeReduction: 0 };
    const previousGauge = Number(target.gauge) || 0;
    const requested = Number(amount) || 0;
    target.gauge = Math.max(0, previousGauge + requested);
    return {
      gaugeReduction: Math.max(0, previousGauge - target.gauge),
      gaugeChange: target.gauge - previousGauge,
    };
  },

  applyStatus(state, context, effect) {
    const target = context.targetCombatant ?? context.target;
    if (!target || !isLivingCombatant(target)) return { applied: false, statusId: effect.statusId };
    const chance = effect.chance === undefined
      ? null : Math.max(0, Math.min(1, Number(effect.chance) || 0));
    const passed = chance === null || state.random() < chance;
    const sourcePassive = context.sourcePassive ?? {};
    if (sourcePassive.sourceItemId) {
      recordCombatEvent(state, {
        type: "equipment-trigger",
        trigger: context.eventType === "attackHit" ? "onHit" : context.eventType,
        effect: "applyStatus",
        sourceItemId: sourcePassive.sourceItemId,
        equipmentSlot: sourcePassive.equipmentSlot ?? null,
        statusId: effect.statusId,
        chance: chance ?? 1,
        applied: passed,
        target: target.id,
      });
    }
    if (!passed) return { applied: false, statusId: effect.statusId };
    return applyCombatStatus(state, target, effect.statusId, {
      ...sourcePassive,
      ...effect,
    });
  },

  removeStatus(state, target, statusId) {
    if (!target?.statuses?.[statusId]) return { removed: false, statusId };
    delete target.statuses[statusId];
    recordCombatEvent(state, { type: "status-removed", target: target.id, statusId });
    return { removed: true, statusId };
  },

  modifyStat(target, effect) {
    if (!target || typeof effect.stat !== "string") return {};
    const previous = Number(target[effect.stat]) || 0;
    const next = effect.mode === "set"
      ? Number(effect.amount) || 0
      : previous + (Number(effect.amount) || 0);
    target[effect.stat] = Number.isFinite(next) ? next : previous;
    return { previous, value: target[effect.stat], stat: effect.stat };
  },

  modifyResource(state, context, effect) {
    const owner = resourceOwner(state, context, effect.resource);
    if (!owner || typeof effect.resource !== "string") return {};
    const previous = Number(owner[effect.resource]) || 0;
    const maximum = Number(owner[`max${capitalize(effect.resource)}`]);
    const requested = Number(effect.amount) || 0;
    const next = Number.isFinite(maximum)
      ? Math.min(Math.max(0, previous + requested), maximum)
      : Math.max(0, previous + requested);
    owner[effect.resource] = next;
    const change = next - previous;
    const resourceChange = { resource: effect.resource, previous, value: next, amount: change };
    recordCombatEvent(state, {
      type: "resource-modified",
      resource: effect.resource,
      amount: change,
      previous,
      value: next,
      source: context.sourceCombatant?.id ?? null,
      abilityId: context.abilityId ?? null,
    });
    return { resourceChange };
  },

  storeCharge(state, context, effect) {
    const source = context.sourceCombatant ?? context.source;
    if (!source) return {};
    source.combatCharges ??= {};
    const chargeId = String(effect.chargeId ?? "");
    if (!chargeId) return {};
    const amountSource = effect.amount === "damagePrevented" ? context.damagePrevented : effect.amount ?? context.damagePrevented;
    const amount = Math.max(0, Number(amountSource) || 0);
    const cap = Math.max(0, Number(effect.cap) || 0);
    const current = Math.max(0, Number(source.combatCharges[chargeId]) || 0);
    const next = Math.min(cap, current + amount);
    const storedAmount = next - current;
    source.combatCharges[chargeId] = next;
    const passive = context.sourcePassive ?? {};
    recordCombatEvent(state, {
      type: passive.sourceItemId ? "equipment-trigger" : "charge-stored",
      trigger: context.eventType,
      effect: "storeCharge",
      sourceItemId: passive.sourceItemId ?? null,
      equipmentSlot: passive.equipmentSlot ?? null,
      chargeId,
      amount,
      storedAmount,
      chargeTotal: next,
    });
    if (storedAmount > 0) addCombatLog(state, `${source.name} stores ${storedAmount} Resolve (${next}/${cap}).`);
    return { storedAmount };
  },

  consumeCharge(state, context, effect) {
    const source = context.sourceCombatant ?? context.source;
    if (!source) return {};
    source.combatCharges ??= {};
    const chargeId = String(effect.chargeId ?? "");
    if (!chargeId) return {};
    const spentAmount = Math.max(0, Number(source.combatCharges[chargeId]) || 0);
    source.combatCharges[chargeId] = 0;
    context.damageBonus = (Number(context.damageBonus) || 0) + spentAmount;
    const passive = context.sourcePassive ?? {};
    if (spentAmount > 0) {
      recordCombatEvent(state, {
        type: passive.sourceItemId ? "equipment-trigger" : "charge-consumed",
        trigger: context.eventType,
        effect: "consumeChargeForBonusDamage",
        sourceItemId: passive.sourceItemId ?? null,
        equipmentSlot: passive.equipmentSlot ?? null,
        chargeId,
        spentAmount,
        chargeTotal: 0,
      });
    }
    return { spentAmount };
  },

  applyInjury(state, context, target, effect) {
    if (!target || !InjuryRules?.applyToExpedition || !effect.injuryId) return {};
    const range = context.damageRange;
    const rawDamage = Number(context.resultMetadata?.rawDamage ?? context.baseDamage);
    const minimum = Number(range?.minimum);
    const maximum = Number(range?.maximum);
    const chance = Math.max(0, Math.min(1, Number(effect.chance ?? effect.injuryChance) || 0));
    const damageRollChance = Number.isFinite(minimum) && Number.isFinite(maximum) && maximum > minimum
      ? (rawDamage - minimum) / (maximum - minimum)
      : 1;
    if (damageRollChance < 1 - chance) return {};
    const injury = InjuryRules.applyToExpedition(state.expedition, target.id, effect.injuryId, {
      source: `combat:${context.abilityId ?? "effect"}`,
    });
    if (injury?.applied) context.injuryId = effect.injuryId;
    return { injuryId: injury?.applied ? effect.injuryId : null };
  },

  recordTrait(state, context, effect) {
    const trait = effect.trait ?? {};
    const target = context.targetCombatant ?? context.sourceCombatant;
    const suppressedByStatuses = effect.suppressedByStatuses ?? [];
    const amount = Math.max(0, Number(effect.amount) || 0);
    const healed = suppressedByStatuses.length > 0 ? 0 : amount;
    recordCombatEvent(state, {
      type: "enemy-trait",
      trait: trait.type,
      traitType: trait.type,
      trigger: trait.trigger,
      target: target?.id ?? null,
      amount,
      healed,
      appliedAmount: healed,
      suppressedByStatuses,
    });
    if (suppressedByStatuses.length > 0) {
      const names = suppressedByStatuses.map((statusId) => COMBAT_STATUS_DEFINITIONS[statusId]?.name ?? statusId).join(" and ");
      addCombatLog(state, `${target.name}'s regeneration is suppressed by ${names}.`);
    } else if (healed > 0) {
      addCombatLog(state, `${target.name} regenerates ${healed} HP.`);
    } else {
      addCombatLog(state, `${target.name}'s regeneration cannot exceed its maximum HP.`);
    }
    return { healed };
  },
});

function effectTarget(state, context, targetMode) {
  if (!targetMode || targetMode === "target") return context.targetCombatant ?? context.target;
  if (targetMode === "source" || targetMode === "self") return context.sourceCombatant ?? context.source;
  if (typeof targetMode === "string") return findCombatant(state, targetMode);
  return context.targetCombatant ?? context.target;
}

function resourceOwner(state, context, resource) {
  if (context.resourceOwner) return context.resourceOwner;
  if (resource === "faith") return state.playerState ?? state.expedition?.playerState ?? null;
  if (resource === "health") return context.targetCombatant ?? context.sourceCombatant;
  return state.expedition;
}

function incomingDamageMultiplier(state, target) {
  return typeof InjuryRules?.incomingDamageMultiplier === "function"
    ? InjuryRules.incomingDamageMultiplier(state.expedition, target.id) : 1;
}

function rollCombatDamage(range, random) {
  const minimum = Math.ceil(Number(range?.minimum) || 0);
  const maximum = Math.floor(Number(range?.maximum) || minimum);
  if (maximum <= minimum) return minimum;
  return minimum + Math.floor(random() * (maximum - minimum + 1));
}

function calculateCombatDamage(rawDamage, defense) {
  return Math.max(1, (Number(rawDamage) || 0) - Math.max(0, Number(defense) || 0));
}

function applyCombatDamage(state, target, amount) {
  target.hp = Math.max(0, target.hp - Math.max(0, Number(amount) || 0));
  target.lastHitEvent = ++state.eventCounter;
}

function findCombatant(state, combatantId) {
  return [...(state?.allies ?? []), ...(state?.enemies ?? [])]
    .find((combatant) => combatant.id === combatantId);
}

function capitalize(value) {
  return String(value).charAt(0).toUpperCase() + String(value).slice(1);
}
