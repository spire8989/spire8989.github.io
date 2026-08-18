"use strict";

// The ATB loop remains here. Action consequences are normalized into the
// shared CombatEffectResolver and all reactions pass through CombatEventSystem.
const CombatSystem = Object.freeze({
  create(expedition, combatId, options = {}) {
    const definition = COMBAT_DEFINITIONS[combatId];
    if (!definition) return null;
    expedition.companionCombatHp ??= {};
    const allies = [createArthurCombatant(expedition)];
    selectedCompanionIds(expedition).forEach((companionId) => {
      const companion = createCompanionCombatant(expedition, companionId);
      if (companion) allies.push(companion);
    });
    const enemyCounts = definition.enemyIds.reduce((counts, enemyId) => {
      counts[enemyId] = (counts[enemyId] ?? 0) + 1;
      return counts;
    }, {});
    const enemyOccurrences = {};
    const enemies = definition.enemyIds.map((enemyId, index) => {
      enemyOccurrences[enemyId] = (enemyOccurrences[enemyId] ?? 0) + 1;
      return createEnemyCombatant(
        enemyId,
        index,
        enemyCounts[enemyId] > 1 ? enemyOccurrences[enemyId] : null,
      );
    }).filter(Boolean);
    const state = {
      id: combatId,
      status: "running",
      allies,
      enemies,
      selectedEnemyId: enemies.find(isLivingCombatant)?.id ?? null,
      readyQueue: [],
      activeActorId: null,
      pendingActionId: null,
      pendingActionKind: null,
      interactionMode: "main",
      targetSelectionReturnMode: null,
      pendingTargetPrompt: null,
      log: [],
      events: [],
      result: null,
      resultHandled: false,
      random: typeof options.random === "function"
        ? options.random
        : typeof expedition.random === "function" ? expedition.random : GameRandom.random,
      eventCounter: 0,
      eventDispatchDepth: 0,
      combatConditionUses: {},
      playerState: options.player ?? expedition.playerState ?? null,
    };
    Object.defineProperty(state, "expedition", { value: expedition, enumerable: false });
    enemies.forEach((enemy) => {
      enemy.intentId = nextEnemyIntent(enemy);
      addCombatLog(state, `${enemy.name} prepares ${enemyIntentName(enemy)}.`);
    });
    syncCombatHealth(state, expedition);
    CombatEventSystem.dispatch(state, "combatStart", { sourceCombatant: null });
    // The global combatStart record preserves the combat boundary; actor-
    // scoped dispatches let learned, companion, equipment, and status
    // passives resolve against their owning combatant.
    [...state.allies, ...state.enemies].forEach((combatant) => {
      CombatEventSystem.dispatch(state, "combatStart", {
        sourceCombatant: combatant,
        targetCombatant: combatant,
      }, { skipRecord: true });
    });
    return state;
  },

  update(state, expedition, deltaSeconds) {
    if (!state || state.status !== "running") return { changed: false, result: state?.result ?? null };
    [...state.allies, ...state.enemies].filter(isLivingCombatant).forEach((combatant) => {
      combatant.gauge = Math.min(
        COMBAT_TUNING.actionGaugeMaximum,
        combatant.gauge + combatant.speed * deltaSeconds * COMBAT_TUNING.actionGaugeRate
          * (combatant.side === "ally"
            ? InjuryRules.combatGaugeRateMultiplier(expedition, combatant.id) : 1),
      );
    });
    state.allies.filter((ally) => (
      isLivingCombatant(ally)
      && ally.gauge >= COMBAT_TUNING.actionGaugeMaximum
      && ally.id !== state.activeActorId
      && !state.readyQueue.includes(ally.id)
    )).forEach((ally) => state.readyQueue.push(ally.id));
    if (state.readyQueue.length > 0) {
      activateNextAlly(state);
      return { changed: true, result: state.result };
    }
    state.enemies.filter((enemy) => (
      isLivingCombatant(enemy) && enemy.gauge >= COMBAT_TUNING.actionGaugeMaximum
    )).forEach((enemy) => {
      if (state.status !== "running" || !isLivingCombatant(enemy)) return;
      beginActorActivation(state, enemy);
      if (!isLivingCombatant(enemy)) {
        enemy.gauge = 0;
        enemy.intentId = null;
        refreshSelectedEnemy(state);
        checkCombatOutcome(state);
        return;
      }
      resolveEnemyAction(state, expedition, enemy);
    });
    return { changed: true, result: state.result };
  },

  chooseAction(state, expedition, actionId, targetId = null) {
    if (!state || state.status !== "awaitingAction") return { resolved: false, needsTarget: false };
    const actor = findCombatant(state, state.activeActorId);
    if (!actor || !isLivingCombatant(actor)) return { resolved: false, needsTarget: false };
    if (actionId === "back" || actionId === "cancel") {
      resetPendingSelection(state, "main");
      return { resolved: false, menu: "main" };
    }
    if (actionId === "abilities") {
      if (abilityEntries(state, expedition).length === 0) return { resolved: false, unavailable: true };
      state.interactionMode = "abilities";
      state.targetSelectionReturnMode = null;
      state.pendingTargetPrompt = null;
      return { resolved: false, menu: "abilities" };
    }
    if (actionId === "items") {
      if (availableItemEntries(state, expedition).length === 0) return { resolved: false, unavailable: true };
      state.interactionMode = "items";
      state.targetSelectionReturnMode = null;
      state.pendingTargetPrompt = null;
      return { resolved: false, menu: "items" };
    }
    if (availableAbilityIds(state, expedition).includes(actionId)) return this.chooseAbility(state, expedition, actionId, targetId);
    if (!topLevelActionIds().includes(actionId)) return { resolved: false, needsTarget: false };
    const ability = COMBAT_ABILITY_DEFINITIONS[actionId];
    if (actionId === "defend" && actor.canDefend === false) return { resolved: false, unavailable: true };
    if (actionId === "flee" && actor.canFlee === false) return { resolved: false, unavailable: true };
    const targetResult = playerTargetResult(state, actor, ability, targetId, actionId);
    if (!targetResult.ready) return targetResult.response;
    const resolved = resolveCombatAbility(state, expedition, actor, ability, targetResult.targets, { action: actionId });
    return finishActorAction(state, expedition, actor, { ...resolved, action: actionId });
  },

  chooseAbility(state, expedition, abilityId, targetId = null) {
    if (!state || state.status !== "awaitingAction") return { resolved: false, needsTarget: false };
    const actor = findCombatant(state, state.activeActorId);
    const ability = COMBAT_ABILITY_DEFINITIONS[abilityId];
    if (!actor || !ability || ability.kind === "passive") {
      return { resolved: false, needsTarget: false };
    }
    const availability = abilityAvailability(state, expedition, actor, ability, targetId);
    if (!availability.usable) {
      return {
        resolved: false,
        unavailable: true,
        reason: availability.reason,
        cost: availability.cost,
        cooldownRemaining: availability.cooldownRemaining,
        chargesRemaining: availability.chargesRemaining,
      };
    }
    const targetResult = playerTargetResult(state, actor, ability, targetId, abilityId);
    if (!targetResult.ready) return targetResult.response;
    const costResult = payAbilityCost(state, ability);
    if (!costResult.paid) return { resolved: false, unavailable: true, reason: "insufficient-resource", cost: costResult };
    const resolved = resolveCombatAbility(state, expedition, actor, ability, targetResult.targets, {
      action: "ability", abilityId, resourceSpent: costResult.amount,
    });
    return finishActorAction(state, expedition, actor, {
      ...resolved,
      action: "ability",
      abilityId,
      target: targetResult.targets[0]?.id ?? null,
    });
  },

  // Direct callers such as deterministic tests and future AI can execute a
  // normalized definition without adding it to the player-facing ability
  // catalog. The same target, cost, event, and effect path is used.
  resolveDefinition(state, expedition, definition, targetId = null) {
    if (!state || state.status !== "awaitingAction" || !definition || definition.kind === "passive") {
      return { resolved: false, needsTarget: false };
    }
    const actor = findCombatant(state, state.activeActorId);
    const costResult = validateAbilityCost(state, definition);
    if (!actor || !isLivingCombatant(actor) || !costResult.sufficient) {
      return { resolved: false, unavailable: true, reason: costResult.sufficient ? "invalid-actor" : "insufficient-resource", cost: costResult };
    }
    const targetResult = playerTargetResult(state, actor, definition, targetId, definition.id);
    if (!targetResult.ready) return targetResult.response;
    const costPayment = payAbilityCost(state, definition);
    if (!costPayment.paid) return { resolved: false, unavailable: true, reason: "insufficient-resource" };
    const resolved = resolveCombatAbility(state, expedition, actor, definition, targetResult.targets, {
      action: "ability", abilityId: definition.id, resourceSpent: costPayment.amount,
    });
    return finishActorAction(state, expedition, actor, {
      ...resolved, action: "ability", abilityId: definition.id,
      target: targetResult.targets[0]?.id ?? null,
    });
  },

  chooseItem(state, expedition, itemId, targetId = null) {
    if (!state || state.status !== "awaitingAction") return { resolved: false, needsTarget: false };
    const actor = findCombatant(state, state.activeActorId);
    const entry = availableItemEntries(state, expedition).find((candidate) => candidate.itemId === itemId);
    const itemEffect = entry?.item?.effects?.combat;
    if (!actor || actor.canUseItems === false || !entry || !itemEffect) return { resolved: false, needsTarget: false };
    const itemAbility = {
      id: itemId,
      name: entry.item.name,
      target: itemEffect.target ?? "ally",
      targetMode: itemEffect.target === "self" ? "self" : "singleAlly",
      kind: "active",
      selectionPrompt: itemEffect.selectionPrompt,
      effects: [{ type: itemEffect.effectType === "heal" ? "heal" : itemEffect.effectType, amount: itemEffect.amount }],
    };
    const targetResult = playerTargetResult(state, actor, itemAbility, targetId, itemId);
    if (!targetResult.ready) return targetResult.response;
    if (!consumeCombatItem(expedition, itemId)) return { resolved: false, needsTarget: false };
    const resolved = resolveCombatAbility(state, expedition, actor, itemAbility, targetResult.targets, {
      action: "item", itemId,
    });
    return finishActorAction(state, expedition, actor, {
      ...resolved,
      action: "item", itemId, target: targetResult.targets[0]?.id ?? null,
    });
  },

  availableActions(state) {
    const expedition = arguments[1] ?? state?.expedition;
    const actor = findCombatant(state, state?.activeActorId);
    return actor ? topLevelActionIds().filter((actionId) => {
      if (actionId === "abilities") return abilityEntries(state, expedition).length > 0;
      if (actionId === "items") return actor.canUseItems !== false && availableItemEntries(state, expedition).length > 0;
      if (actionId === "defend") return actor.canDefend !== false;
      if (actionId === "flee") return actor.canFlee !== false;
      return true;
    }) : [];
  },

  availableAbilities(state, expedition) {
    return abilityEntries(state, expedition).filter((entry) => entry.availability.usable);
  },

  abilityEntries(state, expedition) {
    return abilityEntries(state, expedition);
  },

  abilityAvailability(state, expedition, abilityId, targetId = null) {
    const actor = findCombatant(state, state?.activeActorId);
    const ability = COMBAT_ABILITY_DEFINITIONS[abilityId];
    return abilityAvailability(state, expedition, actor, ability, targetId);
  },

  availableItems(state, expedition) { return availableItemEntries(state, expedition); },

  choosePendingTarget(state, expedition, targetId) {
    if (!state?.pendingActionId) return { resolved: false, needsTarget: false };
    if (state.pendingActionKind === "ability") return this.chooseAbility(state, expedition, state.pendingActionId, targetId);
    if (state.pendingActionKind === "item") return this.chooseItem(state, expedition, state.pendingActionId, targetId);
    return this.chooseAction(state, expedition, state.pendingActionId, targetId);
  },

  selectEnemyTarget(state, targetId) {
    if (!state || !["running", "awaitingAction"].includes(state.status) || state.interactionMode !== "main") return { selected: false };
    const target = state.enemies.find((enemy) => enemy.id === targetId && isLivingCombatant(enemy));
    if (!target) return { selected: false };
    state.selectedEnemyId = target.id;
    return { selected: true, targetId: target.id };
  },

  cancelTargetSelection(state) {
    if (!state || state.status !== "awaitingAction" || !state.pendingActionId) return false;
    resetPendingSelection(state, state.targetSelectionReturnMode ?? "main");
    return true;
  },

  applyStatus(state, targetId, statusId, source = {}) {
    const target = findCombatant(state, targetId);
    if (!state || !target) return { applied: false, reason: "invalid-target-or-status" };
    return applyCombatStatus(state, target, statusId, source);
  },
});

function createArthurCombatant(expedition) {
  const weapon = ITEM_DEFINITIONS[expedition.selectedEquipment.weapon];
  const armor = ITEM_DEFINITIONS[expedition.selectedEquipment.armor];
  const relic = ITEM_DEFINITIONS[expedition.selectedEquipment.relic];
  const equippedCombatEffects = EquipmentRules.aggregateEquippedCombatEffects(expedition);
  const player = expedition.playerState ?? null;
  const learnedAbilityIds = AbilityRules.sanitizeLearned(player?.learnedAbilityIds);
  const selectedActiveAbilityIds = AbilityRules.sanitizeLoadout(
    player?.selectedActiveAbilityIds,
    learnedAbilityIds,
    "active",
  );
  const selectedPassiveAbilityIds = AbilityRules.sanitizeLoadout(
    player?.selectedPassiveAbilityIds,
    learnedAbilityIds,
    "passive",
  );
  const grantedAbilityIds = collectAbilityIds(
    PLAYER_CHARACTER_DEFINITION.combatAbilities,
    weapon,
    armor,
    relic,
  );
  const grantedPassives = collectAbilityPassives(grantedAbilityIds);
  return {
    id: "arthur", definitionId: "arthur", side: "ally", name: PLAYER_CHARACTER_DEFINITION.name,
    maxHp: InjuryRules.effectiveMaxHealth(expedition, "arthur"),
    hp: clampCombatNumber(expedition.health, 0, InjuryRules.effectiveMaxHealth(expedition, "arthur")),
    speed: Math.max(1, PLAYER_CHARACTER_DEFINITION.combat.speed + equippedCombatEffects.combatSpeed),
    defense: Math.max(0, Math.floor((Number(armor?.effects?.combatDefense) || 0)
      * InjuryRules.combatDefenseMultiplier(expedition, "arthur"))),
    damage: weapon?.effects?.combatDamage ?? { minimum: 4, maximum: 6 }, gauge: 0,
    defending: false, interceding: false,
    // abilityIds remains as a compatibility alias for older callers. The
    // resolver uses selected learned IDs plus temporary grants below.
    abilityIds: grantedAbilityIds,
    learnedAbilityIds,
    selectedActiveAbilityIds,
    selectedPassiveAbilityIds,
    grantedAbilityIds,
    sourceItemIds: [weapon?.id, armor?.id, relic?.id].filter(Boolean), equippedCombatEffects,
    equippedPassives: [
      ...equipmentPassives(equippedCombatEffects),
      ...grantedPassives,
    ],
    learnedPassives: collectAbilityPassives(selectedPassiveAbilityIds),
    passiveDefinitions: [],
    combatCharges: {}, abilityCooldowns: {}, abilityCharges: {}, completedActivations: 0,
    statuses: {}, canUseItems: true, canDefend: true, canFlee: true,
  };
}

function createCompanionCombatant(expedition, companionId) {
  const companion = COMPANION_DEFINITIONS[companionId];
  if (!companion?.combat) return null;
  const storedHp = expedition.companionCombatHp[companionId];
  const hp = Number.isFinite(storedHp) ? storedHp : companion.combat.maxHp;
  expedition.companionCombatHp[companionId] = hp;
  const grantedAbilityIds = collectAbilityIds(companion.combatAbilities);
  return {
    id: companionId, definitionId: companionId, side: "ally", name: companion.name,
    maxHp: InjuryRules.effectiveMaxHealth(expedition, companionId),
    hp: clampCombatNumber(hp, 0, InjuryRules.effectiveMaxHealth(expedition, companionId)),
    speed: companion.combat.speed,
    defense: Math.max(0, Math.floor(companion.combat.defense * InjuryRules.combatDefenseMultiplier(expedition, companionId))),
    damage: companion.combat.basicDamage, gauge: 0, defending: false, interceding: false,
    abilityIds: grantedAbilityIds, sourceItemIds: [], grantedAbilityIds,
    learnedAbilityIds: [], selectedActiveAbilityIds: [], selectedPassiveAbilityIds: [],
    equippedPassives: collectAbilityPassives(grantedAbilityIds), learnedPassives: [], passiveDefinitions: [],
    combatCharges: {}, abilityCooldowns: {}, abilityCharges: {}, completedActivations: 0, statuses: {},
    canUseItems: companion.capabilities?.canUseItems !== false,
    canDefend: companion.capabilities?.canDefend !== false, canFlee: companion.capabilities?.canFlee !== false,
  };
}

function createEnemyCombatant(enemyId, index, occurrence) {
  const enemy = COMBAT_ENEMY_DEFINITIONS[enemyId];
  if (!enemy) return null;
  const traits = (enemy.traits ?? []).map((trait) => ({ ...trait, suppressedByStatuses: [...(trait.suppressedByStatuses ?? [])] }));
  return {
    id: `${enemyId}_${index + 1}`, definitionId: enemyId, side: "enemy",
    name: occurrence ? `${enemy.name} ${occurrence}` : enemy.name,
    maxHp: enemy.maxHp, hp: enemy.maxHp, speed: enemy.speed, defense: enemy.defense, gauge: 0,
    intentId: null, patternIndex: 0, actionPattern: [...enemy.actionPattern], statuses: {}, traits,
    passiveDefinitions: enemyTraitsToPassives(enemyId, traits, index), equippedPassives: [], learnedPassives: [],
  };
}

function activateNextAlly(state) {
  if (state.activeActorId || state.status !== "running") return;
  while (state.readyQueue.length > 0) {
    const actor = findCombatant(state, state.readyQueue.shift());
    if (!isLivingCombatant(actor)) continue;
    actor.defending = false;
    state.activeActorId = actor.id;
    state.status = "awaitingAction";
    beginActorActivation(state, actor);
    if (!isLivingCombatant(actor)) {
      actor.gauge = 0; state.activeActorId = null; state.status = "running"; checkCombatOutcome(state); continue;
    }
    addCombatLog(state, `${actor.name} is ready.`);
    return;
  }
}

function beginActorActivation(state, actor) {
  CombatEventSystem.dispatch(state, "actorReady", { sourceCombatant: actor, targetCombatant: actor });
  CombatEventSystem.dispatch(state, "turnStart", { sourceCombatant: actor, targetCombatant: actor });
}

function resolveCombatAbility(state, expedition, actor, ability, targets, metadata = {}) {
  const actionId = metadata.action === "ability" ? metadata.abilityId : ability.id;
  const baseContext = {
    eventType: "beforeAction", sourceCombatant: actor, source: actor,
    targetCombatant: targets[0] ?? null, target: targets[0] ?? null,
    abilityId: actionId, actionId, ability, damageRange: metadata.damageRange ?? actor.damage,
    tags: ability.tags ?? [], side: actor.side,
    resultMetadata: { selectedTargetId: metadata.selectedTargetId ?? targets[0]?.id ?? null, redirectedByIntercede: Boolean(metadata.redirectedByIntercede) },
    expedition,
  };
  CombatEventSystem.dispatch(state, "beforeAction", baseContext);
  const aggregate = { damage: 0, baseDamage: 0, healingAmount: 0, gaugeReduction: 0, damagePrevented: 0, injuryId: null };
  const effectTargets = targets.length > 0 ? targets : [null];
  effectTargets.forEach((target) => {
    const targetContext = { ...baseContext, targetCombatant: target, target };
    const result = CombatEffectResolver.resolve(state, targetContext, ability.effects ?? normalizeLegacyAbilityEffects(ability));
    aggregate.damage += Number(result.damage) || 0; aggregate.baseDamage += Number(result.baseDamage) || 0;
    aggregate.healingAmount += Number(result.healingAmount) || 0; aggregate.gaugeReduction += Number(result.gaugeReduction) || 0;
    aggregate.damagePrevented += Number(result.damagePrevented) || 0;
    aggregate.injuryId ??= targetContext.injuryId ?? null;
  });
  const authoredEffects = ability.effects ?? normalizeLegacyAbilityEffects(ability);
  const hasWeaponDamage = authoredEffects.some((effect) => effect.type === "weaponDamage");
  const setsDefense = authoredEffects.some((effect) => effect.type === "setDefending" && effect.value !== false);
  const setsIntercede = authoredEffects.some((effect) => effect.type === "setFlag" && effect.flag === "interceding");
  if (setsDefense) addCombatLog(state, `${actor.name} braces for the next attack.`);
  if (setsIntercede) addCombatLog(state, `${actor.name} moves to protect Arthur.`);
  if (hasWeaponDamage) {
    const target = targets[0];
    addCombatLog(state, `${actor.name} uses ${(ability.name ?? "Attack").toLowerCase()} on ${target?.name ?? "the target"} for ${aggregate.damage} damage.`);
    if (aggregate.gaugeReduction > 0 && target) addCombatLog(state, `${target.name}'s action gauge is pushed back.`);
    if (aggregate.damage > 0 && Number(baseContext.damageBonus) > 0) addCombatLog(state, `${actor.name}'s stored Resolve adds ${baseContext.damageBonus} bonus damage.`);
    if (target && !isLivingCombatant(target)) addCombatLog(state, `${target.name} is defeated.`);
    refreshSelectedEnemy(state);
  }
  CombatEventSystem.dispatch(state, "actionUsed", { ...baseContext, eventType: "actionUsed", targetCombatant: targets[0] ?? null, target: targets[0] ?? null, resultMetadata: { ...baseContext.resultMetadata, ...aggregate } });
  aggregate.actionEvent = recordCombatEvent(state, {
    actor: actor.id, action: metadata.action ?? ability.id,
    abilityId: metadata.abilityId ?? (metadata.action === "ability" ? ability.id : null), itemId: metadata.itemId ?? null,
    target: targets[0]?.id ?? null, damage: aggregate.damage, baseDamage: aggregate.baseDamage,
    bonusDamage: Number(baseContext.damageBonus) || 0, healingAmount: aggregate.healingAmount,
    gaugeReduction: aggregate.gaugeReduction, damagePrevented: aggregate.damagePrevented,
    faithSpent: Number(metadata.resourceSpent) || 0,
    selectedTarget: baseContext.resultMetadata.selectedTargetId ?? null,
    redirectedByIntercede: baseContext.resultMetadata.redirectedByIntercede ?? false,
    injuryId: baseContext.injuryId ?? null,
  });
  checkCombatOutcome(state);
  return aggregate;
}

function resolveEnemyAction(state, expedition, enemy) {
  if (!isLivingCombatant(enemy)) return;
  const action = COMBAT_ENEMY_ACTION_DEFINITIONS[enemy.intentId];
  const ability = normalizeEnemyAction(action);
  let target = chooseEnemyTarget(state, action);
  const selectedTargetId = target?.id ?? null;
  const interceder = state.allies.find((ally) => ally.interceding && isLivingCombatant(ally) && target?.id === "arthur");
  if (interceder) {
    interceder.interceding = false;
    addCombatLog(state, `${interceder.name} takes ${action.name} meant for Arthur.`);
    target = interceder;
  }
  if (target) {
    resolveCombatAbility(state, expedition, enemy, ability, [target], {
      action: action.id, damageRange: action.damage, selectedTargetId,
      redirectedByIntercede: target.id !== selectedTargetId,
    });
    const event = [...state.events].reverse().find((entry) => (
      entry.actor === enemy.id && entry.action === action.id
    ));
    if (event && event.actor === enemy.id && event.action === action.id) {
      event.selectedTarget = selectedTargetId; event.target = target.id; event.redirectedByIntercede = target.id !== selectedTargetId;
    }
    addCombatLog(state, `${enemy.name} uses ${action.name} on ${target.name} for ${event?.damage ?? 0} damage.`);
    if (!isLivingCombatant(target)) addCombatLog(state, `${target.name} is incapacitated.`);
  }
  enemy.gauge = 0; enemy.intentId = nextEnemyIntent(enemy);
  CombatEventSystem.dispatch(state, "turnEnd", { sourceCombatant: enemy, targetCombatant: enemy, abilityId: action?.id ?? null });
  if (state.allies.find((ally) => ally.id === "arthur")?.hp <= 0) finishCombat(state, "defeat");
  else if (state.status === "running") addCombatLog(state, `${enemy.name} prepares ${enemyIntentName(enemy)}.`);
  syncCombatHealth(state, expedition);
}

function normalizeEnemyAction(action) {
  if (!action) return { id: "enemy_attack", name: "Attack", targetMode: "singleEnemy", effects: [] };
  return {
    ...action, kind: "active", targetMode: "singleEnemy", tags: ["enemy", "martial"],
    effects: [{ type: "weaponDamage", range: action.damage }, ...(action.injuryId ? [{ type: "applyInjury", injuryId: action.injuryId, chance: action.injuryChance }] : [])],
  };
}

function chooseEnemyTarget(state, action) {
  if (action?.target === "arthur") {
    const arthur = state.allies.find((ally) => ally.id === "arthur" && isLivingCombatant(ally));
    const companions = state.allies.filter((ally) => ally.id !== "arthur" && isLivingCombatant(ally));
    if (!arthur) return companions[0] ?? null;
    if (companions.length === 0) return arthur;
    const roll = state.random();
    if (roll < COMBAT_TUNING.enemyTargetWeights.arthur) return arthur;
    const companionRoll = (roll - COMBAT_TUNING.enemyTargetWeights.arthur) / COMBAT_TUNING.enemyTargetWeights.activeCompanions;
    return companions[Math.min(companions.length - 1, Math.floor(companionRoll * companions.length))];
  }
  return state.allies.find(isLivingCombatant) ?? null;
}

function playerTargetResult(state, actor, ability, targetId, actionId) {
  const mode = CombatTargetResolver.normalizeMode(ability);
  if (mode === "singleEnemy") refreshSelectedEnemy(state);
  const candidates = CombatTargetResolver.candidates(state, actor, mode);
  if (mode === "singleEnemy" && !targetId && candidates.length > 1) {
    const selected = candidates.find((entry) => entry.id === state.selectedEnemyId);
    if (actionId === "attack" && selected) return { ready: true, targets: [selected] };
    return { ready: false, response: enterTargetSelection(state, actionId, "enemy", actionId === "ability" ? "ability" : "action", ability.selectionPrompt) };
  }
  if (mode === "singleAlly" && !targetId && candidates.length > 1) {
    return { ready: false, response: enterTargetSelection(state, actionId, "ally", actionId === "ability" ? "ability" : "item", ability.selectionPrompt) };
  }
  const resolved = CombatTargetResolver.resolve(state, actor, mode, targetId);
  if ((mode === "singleEnemy" || mode === "singleAlly") && resolved.targets.length === 0) {
    return { ready: false, response: { resolved: false, needsTarget: candidates.length > 1, targetType: mode === "singleAlly" ? "ally" : "enemy" } };
  }
  return { ready: true, targets: resolved.targets };
}

function validateAbilityCost(state, ability) {
  const cost = ability.cost;
  if (!cost || !cost.resource) return { sufficient: true, resource: null, amount: 0, current: null };
  const owner = resourceOwnerForState(state, cost.resource);
  const current = Number(owner?.[cost.resource]) || 0;
  const amount = Math.max(0, Number(cost.amount) || 0);
  return { sufficient: current >= amount, resource: cost.resource, amount, current };
}

function payAbilityCost(state, ability) {
  const cost = ability.cost;
  if (!cost?.resource) return { paid: true, resource: null, amount: 0, current: null };
  const result = validateAbilityCost(state, ability);
  if (!result.sufficient) return { paid: false, ...result };
  CombatEffectResolver.resolve(state, { sourceCombatant: findCombatant(state, state.activeActorId), abilityId: ability.id, resourceOwner: resourceOwnerForState(state, cost.resource) }, [{ type: "modifyResource", resource: cost.resource, amount: -result.amount }]);
  return { paid: true, ...result };
}

function initializeAbilityRuntime(actor, abilityIds) {
  actor.abilityCooldowns ??= {};
  actor.abilityCharges ??= {};
  actor.completedActivations ??= 0;
  [...new Set(abilityIds ?? [])].forEach((abilityId) => {
    const ability = COMBAT_ABILITY_DEFINITIONS[abilityId];
    if (!ability || ability.kind !== "active") return;
    if (Number.isFinite(Number(ability.chargesPerCombat))) {
      actor.abilityCharges[abilityId] ??= Math.max(0, Math.floor(Number(ability.chargesPerCombat)));
    }
  });
}

function abilityAvailability(state, expedition, actor, ability, targetId = null) {
  const empty = {
    usable: false,
    reason: "unknown-ability",
    cost: { sufficient: true, resource: null, amount: 0, current: null },
    cooldownRemaining: 0,
    chargesRemaining: null,
    targetValid: true,
  };
  if (!actor || !ability || ability.kind !== "active" || ability.category) return empty;
  const ids = effectiveActiveAbilityIds(state, actor);
  if (!ids.includes(ability.id)) return { ...empty, reason: "not-equipped" };
  initializeAbilityRuntime(actor, ids);
  const cost = validateAbilityCost(state, ability);
  const readyAt = Number(actor.abilityCooldowns?.[ability.id]);
  const cooldownRemaining = Number.isFinite(readyAt)
    ? Math.max(0, readyAt - (Number(actor.completedActivations) || 0)) : 0;
  const chargesRemaining = Number.isFinite(Number(ability.chargesPerCombat))
    ? Math.max(0, Number(actor.abilityCharges?.[ability.id]) || 0) : null;
  const targetValid = targetId
    ? CombatTargetResolver.resolve(state, actor, CombatTargetResolver.normalizeMode(ability), targetId).targets.length > 0
    : true;
  let reason = null;
  if (!cost.sufficient) reason = "insufficient-resource";
  else if (cooldownRemaining > 0) reason = "cooldown";
  else if (chargesRemaining !== null && chargesRemaining <= 0) reason = "no-charges";
  else if (!targetValid) reason = "invalid-target";
  return {
    usable: !reason,
    reason,
    cost,
    cooldownRemaining,
    chargesRemaining,
    targetValid,
  };
}

function effectiveActiveAbilityIds(state, actor) {
  const statusIds = collectStatusAbilityIds(actor);
  return collectAbilityIds(
    actor.selectedActiveAbilityIds,
    actor.grantedAbilityIds,
    statusIds,
  ).filter((abilityId) => COMBAT_ABILITY_DEFINITIONS[abilityId]?.kind === "active");
}

function abilityEntries(state, expedition) {
  const actor = findCombatant(state, state?.activeActorId);
  if (!actor || !isLivingCombatant(actor)) return [];
  return effectiveActiveAbilityIds(state, actor).map((abilityId) => {
    const ability = COMBAT_ABILITY_DEFINITIONS[abilityId];
    return { ...ability, availability: abilityAvailability(state, expedition, actor, ability) };
  });
}

function completeAbilityUse(actor, abilityId, actionEvent) {
  actor.completedActivations = (Number(actor.completedActivations) || 0) + 1;
  const ability = COMBAT_ABILITY_DEFINITIONS[abilityId];
  if (!ability || ability.kind !== "active") return;
  actor.abilityCharges ??= {};
  actor.abilityCooldowns ??= {};
  if (Number.isFinite(Number(ability.chargesPerCombat))) {
    actor.abilityCharges[abilityId] = Math.max(0, (Number(actor.abilityCharges[abilityId]) || 0) - 1);
  }
  if (Number.isFinite(Number(ability.cooldownActivations)) && Number(ability.cooldownActivations) > 0) {
    actor.abilityCooldowns[abilityId] = actor.completedActivations + Math.floor(Number(ability.cooldownActivations));
  }
  if (actionEvent) {
    actionEvent.cooldownRemaining = Math.max(0, (Number(actor.abilityCooldowns?.[abilityId]) || 0) - actor.completedActivations);
    actionEvent.chargesRemaining = Number.isFinite(Number(ability.chargesPerCombat))
      ? actor.abilityCharges[abilityId] : null;
  }
}

function resourceOwnerForState(state, resource) {
  return resource === "faith" ? state.playerState ?? state.expedition?.playerState : state.expedition;
}

function normalizeLegacyAbilityEffects(ability) {
  if (ability.effectType === "intercede") return [{ type: "setFlag", flag: "interceding", value: true }];
  if (ability.effectType === "damageAndGauge") return [{ type: "weaponDamage", multiplier: Number(ability.damageMultiplier) || 1 }, { type: "modifyGauge", amount: -(Number(ability.gaugeReduction) || 0) }];
  return [];
}

function equipmentPassives(equippedCombatEffects) {
  const passives = [];
  (equippedCombatEffects.onHitEffects ?? []).forEach((effect, index) => passives.push({
    id: `equipment:${effect.sourceItemId}:onHit:${index}`, trigger: { event: "attackHit" }, effects: [{ ...effect }],
    sourceItemId: effect.sourceItemId, equipmentSlot: effect.equipmentSlot,
  }));
  (equippedCombatEffects.combatTriggers ?? []).forEach((trigger, index) => passives.push({
    id: `equipment:${trigger.sourceItemId}:trigger:${index}`,
    trigger: { event: trigger.trigger === "beforeNormalAttack" ? "beforeAction" : "damagePrevented", conditions: trigger.trigger === "beforeNormalAttack" ? { actionId: "attack" } : null },
    effects: trigger.effect === "storeCharge"
      ? [{ type: "storeCharge", chargeId: trigger.chargeId, cap: trigger.cap, amount: "damagePrevented" }]
      : [{ type: "consumeCharge", chargeId: trigger.chargeId }],
    sourceItemId: trigger.sourceItemId, equipmentSlot: trigger.equipmentSlot,
  }));
  return passives;
}

function enemyTraitsToPassives(enemyId, traits, index) {
  return traits.flatMap((trait, traitIndex) => {
    if (trait.type !== "regeneration" || trait.trigger !== "activation") return [];
    const suppressedByStatuses = trait.suppressedByStatuses ?? [];
    return [{
      id: `enemy:${enemyId}:${index}:trait:${traitIndex}`, trigger: { event: "turnStart" },
      effects: [{ type: "conditional", condition: { missingStatus: suppressedByStatuses }, effects: [{ type: "heal", amount: trait.amount }, { type: "recordTrait", trait, amount: trait.amount, suppressedByStatuses: [] }], elseEffects: [{ type: "recordTrait", trait, amount: trait.amount, suppressedByStatuses }] }],
    }];
  });
}

function nextEnemyIntent(enemy) {
  const intentId = enemy.actionPattern[enemy.patternIndex % enemy.actionPattern.length];
  enemy.patternIndex += 1;
  return intentId;
}

function enemyIntentName(enemy) { return COMBAT_ENEMY_ACTION_DEFINITIONS[enemy.intentId]?.name ?? "Attack"; }

function processEnemyActivationStatuses(state, enemy) {
  if (!enemy) return false;
  CombatEventSystem.dispatchStatusTriggers(state, enemy, "turnStart");
  return isLivingCombatant(enemy);
}

function applyEnemyActivationTraits(state, enemy) {
  if (enemy) CombatEventSystem.dispatch(state, "turnStart", { sourceCombatant: enemy, targetCombatant: enemy });
}

function applyEquippedOnHitEffects(state, actor, target) {
  if (actor && target) CombatEventSystem.dispatch(state, "attackHit", { sourceCombatant: actor, targetCombatant: target });
}

function applyEquipmentCombatTriggers(state, actor, triggerName, context = {}) {
  const event = triggerName === "beforeNormalAttack" ? "beforeAction" : "damagePrevented";
  const resultContext = { sourceCombatant: actor, targetCombatant: context.target ?? actor, actionId: triggerName === "beforeNormalAttack" ? "attack" : null, damagePrevented: context.amount ?? 0 };
  CombatEventSystem.dispatch(state, event, resultContext);
  return { bonusDamage: Number(resultContext.damageBonus) || 0 };
}

function applyCombatStatus(state, target, statusId, source = {}) {
  const definition = COMBAT_STATUS_DEFINITIONS[statusId];
  const allowedSides = definition?.targetSides ?? ["enemy"];
  if (!definition || !isLivingCombatant(target) || !allowedSides.includes(target.side)) return { applied: false, statusId, reason: "invalid-target-or-status" };
  target.statuses ??= {};
  const previous = target.statuses[statusId];
  const remainingActivations = Math.max(1, Math.floor(Number(definition.durationActivations) || 1));
  target.statuses[statusId] = { statusId, remainingActivations };
  const refreshed = Boolean(previous);
  recordCombatEvent(state, { type: "status-applied", target: target.id, statusId, sourceItemId: source.sourceItemId ?? null, equipmentSlot: source.equipmentSlot ?? null, refreshed, remainingActivations });
  addCombatLog(state, `${target.name} is ${definition.name.toLowerCase()}${refreshed ? " again" : ""}.`);
  return { applied: true, statusId, refreshed, remainingActivations };
}

function finishActorAction(state, expedition, actor, event = {}) {
  actor.gauge = 0;
  if (event.action === "ability" && event.abilityId) {
    completeAbilityUse(actor, event.abilityId, event.actionEvent);
  } else {
    actor.completedActivations = (Number(actor.completedActivations) || 0) + 1;
  }
  CombatEventSystem.dispatch(state, "turnEnd", { sourceCombatant: actor, targetCombatant: actor, abilityId: event.abilityId ?? event.action });
  state.activeActorId = null; state.pendingActionId = null; state.pendingActionKind = null;
  state.interactionMode = "main"; state.targetSelectionReturnMode = null; state.pendingTargetPrompt = null;
  if (state.status === "awaitingAction") { state.status = "running"; activateNextAlly(state); }
  syncCombatHealth(state, expedition);
  const actionEvent = event.actionEvent;
  if (actionEvent) {
    const index = state.events.indexOf(actionEvent);
    if (index >= 0) {
      state.events.splice(index, 1);
      actionEvent.sequence = state.events.length + 1;
      state.events.push(actionEvent);
    }
  }
  const publicEvent = { ...event };
  delete publicEvent.actionEvent;
  return { resolved: true, needsTarget: false, result: state.result, ...publicEvent };
}

function finishCombat(state, result) {
  if (!state || state.result) return;
  state.result = result;
  const eventType = ({ victory: "combatVictory", defeat: "combatDefeat", fled: "combatFled" })[result];
  if (eventType) CombatEventSystem.dispatch(state, eventType, { result, sourceCombatant: null });
  CombatEventSystem.dispatch(state, "combatEnd", { result, sourceCombatant: null });
  state.status = "resolved";
  state.allies.forEach((ally) => { ally.interceding = false; });
  state.activeActorId = null; state.pendingActionId = null; state.pendingActionKind = null;
  state.interactionMode = "main"; state.targetSelectionReturnMode = null; state.pendingTargetPrompt = null;
  state.readyQueue.length = 0; state.selectedEnemyId = null;
}

function checkCombatOutcome(state) {
  if (!state || state.result) return state?.result ?? null;
  if (!state.enemies.some(isLivingCombatant)) finishCombat(state, "victory");
  else if (!state.allies.find((ally) => ally.id === "arthur" && isLivingCombatant(ally))) finishCombat(state, "defeat");
  return state.result;
}

function enterTargetSelection(state, actionId, targetType, kind = "action", prompt = null) {
  state.pendingActionId = actionId; state.pendingActionKind = kind;
  state.targetSelectionReturnMode = state.interactionMode === "enemyTarget" || state.interactionMode === "allyTarget" ? "main" : state.interactionMode;
  state.pendingTargetPrompt = prompt ?? (targetType === "ally" ? "Choose an ally target" : "Choose an enemy target");
  state.interactionMode = targetType === "ally" ? "allyTarget" : "enemyTarget";
  return { resolved: false, needsTarget: true, targetType, targetPrompt: state.pendingTargetPrompt };
}

function resetPendingSelection(state, mode = "main") {
  state.pendingActionId = null; state.pendingActionKind = null; state.interactionMode = mode;
  state.targetSelectionReturnMode = null; state.pendingTargetPrompt = null;
}

function consumeCombatItem(expedition, itemId) {
  if (typeof ExpeditionRules?.consumeCarriedItem === "function") return ExpeditionRules.consumeCarriedItem(expedition, itemId, 1);
  const quantity = expedition?.carriedItems?.[itemId] ?? 0;
  if (quantity < 1) return false;
  expedition.carriedItems[itemId] = quantity - 1;
  if (expedition.carriedItems[itemId] <= 0) delete expedition.carriedItems[itemId];
  expedition.consumedItems[itemId] = (expedition.consumedItems[itemId] ?? 0) + 1;
  return true;
}

function topLevelActionIds() { return ["attack", "defend", "abilities", "items", "flee"]; }

function collectAbilityIds(...sources) {
  return [...new Set(sources.flatMap((source) => Array.isArray(source)
    ? source
    : source?.effects?.grantedAbilityIds ?? [])
    .filter((id) => COMBAT_ABILITY_DEFINITIONS[id] && !COMBAT_ABILITY_DEFINITIONS[id].category))];
}

function collectAbilityPassives(abilityIds = []) {
  return [...new Set(abilityIds)]
    .map((abilityId) => COMBAT_ABILITY_DEFINITIONS[abilityId])
    .filter((ability) => ability?.kind === "passive")
    .map((ability) => ({
      id: `ability:${ability.id}`,
      abilityId: ability.id,
      trigger: ability.trigger ?? { event: "combatStart" },
      effects: ability.effects ?? ability.trigger?.effects ?? [],
    }));
}

function collectStatusAbilityIds(combatant) {
  return Object.keys(combatant?.statuses ?? {}).flatMap((statusId) => {
    const status = COMBAT_STATUS_DEFINITIONS[statusId];
    return status?.grantedAbilityIds ?? status?.effects?.grantedAbilityIds ?? [];
  });
}

function availableAbilityIds(state, expedition) {
  return abilityEntries(state, expedition)
    .filter((entry) => entry.availability.usable)
    .map((entry) => entry.id);
}

function availableItemEntries(state, expedition = state?.expedition) {
  if (!expedition) return [];
  const actor = findCombatant(state, state?.activeActorId);
  if (actor?.canUseItems === false) return [];
  const hasInjuredAlly = state.allies.some((ally) => isLivingCombatant(ally) && ally.hp < ally.maxHp);
  return Object.entries(expedition.carriedItems ?? {}).filter(([itemId, quantity]) => quantity > 0)
    .map(([itemId, quantity]) => ({ itemId, quantity, item: ITEM_DEFINITIONS[itemId] }))
    .filter((entry) => entry.item?.effects?.combat?.usable && entry.item.effects.combat.effectType === "heal" && hasInjuredAlly);
}

function syncCombatHealth(state, expedition) {
  const arthur = state.allies.find((ally) => ally.id === "arthur");
  if (arthur) expedition.health = arthur.hp;
  expedition.companionCombatHp ??= {};
  state.allies.filter((ally) => ally.id !== "arthur").forEach((ally) => { expedition.companionCombatHp[ally.definitionId] = ally.hp; });
}

function addCombatLog(state, message) {
  state.log.push(message);
  if (state.log.length > COMBAT_TUNING.combatLogLimit) state.log.splice(0, state.log.length - COMBAT_TUNING.combatLogLimit);
}

function recordCombatEvent(state, event) {
  const record = { sequence: state.events.length + 1, ...event };
  state.events.push(record);
  return record;
}

function findCombatant(state, combatantId) { return [...state.allies, ...state.enemies].find((combatant) => combatant.id === combatantId); }

function refreshSelectedEnemy(state) {
  const selected = state.enemies.find((enemy) => enemy.id === state.selectedEnemyId);
  if (!isLivingCombatant(selected)) state.selectedEnemyId = state.enemies.find(isLivingCombatant)?.id ?? null;
}

function clampCombatNumber(value, minimum, maximum) {
  const number = Number(value);
  return Math.min(Math.max(Number.isFinite(number) ? number : maximum, minimum), maximum);
}
