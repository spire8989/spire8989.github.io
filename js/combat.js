"use strict";

const CombatSystem = Object.freeze({
  create(expedition, combatId, options = {}) {
    const definition = COMBAT_DEFINITIONS[combatId];
    if (!definition) {
      return null;
    }

    expedition.companionCombatHp ??= {};
    const allies = [createArthurCombatant(expedition)];
    if (expedition.selectedCompanion) {
      const companion = createCompanionCombatant(expedition, expedition.selectedCompanion);
      if (companion) {
        allies.push(companion);
      }
    }
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
      readyQueue: [],
      activeActorId: null,
      pendingActionId: null,
      pendingActionKind: null,
      interactionMode: "main",
      log: [],
      events: [],
      result: null,
      resultHandled: false,
      random: typeof options.random === "function"
        ? options.random
        : typeof expedition.random === "function" ? expedition.random : GameRandom.random,
      eventCounter: 0,
    };
    Object.defineProperty(state, "expedition", { value: expedition, enumerable: false });
    enemies.forEach((enemy) => {
      enemy.intentId = nextEnemyIntent(enemy);
      addCombatLog(state, `${enemy.name} prepares ${enemyIntentName(enemy)}.`);
    });
    syncCombatHealth(state, expedition);
    return state;
  },

  update(state, expedition, deltaSeconds) {
    if (!state || state.status !== "running") {
      return { changed: false, result: state?.result ?? null };
    }

    let changed = false;
    const livingCombatants = [...state.allies, ...state.enemies].filter(isLivingCombatant);
    livingCombatants.forEach((combatant) => {
      combatant.gauge = Math.min(
        COMBAT_TUNING.actionGaugeMaximum,
        combatant.gauge + combatant.speed * deltaSeconds * COMBAT_TUNING.actionGaugeRate,
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
      return { changed: true, result: null };
    }

    state.enemies.filter((enemy) => (
      isLivingCombatant(enemy) && enemy.gauge >= COMBAT_TUNING.actionGaugeMaximum
    )).forEach((enemy) => {
      if (state.status !== "running") {
        return;
      }
      resolveEnemyAction(state, expedition, enemy);
      changed = true;
    });

    return { changed, result: state.result };
  },

  chooseAction(state, expedition, actionId, targetId = null) {
    if (!state || state.status !== "awaitingAction") {
      return { resolved: false, needsTarget: false };
    }
    const actor = findCombatant(state, state.activeActorId);
    if (!actor || !isLivingCombatant(actor)) {
      return { resolved: false, needsTarget: false };
    }

    if (actionId === "back" || actionId === "cancel") {
      state.interactionMode = "main";
      state.pendingActionId = null;
      state.pendingActionKind = null;
      return { resolved: false, menu: "main" };
    }
    if (actionId === "abilities") {
      if (availableAbilityIds(state, expedition).length === 0) return { resolved: false, unavailable: true };
      state.interactionMode = "abilities";
      return { resolved: false, menu: "abilities" };
    }
    if (actionId === "items") {
      if (availableItemEntries(state, expedition).length === 0) return { resolved: false, unavailable: true };
      state.interactionMode = "items";
      return { resolved: false, menu: "items" };
    }
    if (availableAbilityIds(state, expedition).includes(actionId)) {
      return this.chooseAbility(state, expedition, actionId, targetId);
    }
    if (!topLevelActionIds().includes(actionId)) {
      return { resolved: false, needsTarget: false };
    }

    if (actionId === "attack") {
      const targets = state.enemies.filter(isLivingCombatant);
      if (!targetId && targets.length > 1) return enterTargetSelection(state, actionId, "enemy");
      const target = targetId
        ? targets.find((candidate) => candidate.id === targetId)
        : targets[0];
      if (!target) {
        return { resolved: false, needsTarget: targets.length > 1 };
      }
      resolveAttack(state, actor, target);
    } else if (actionId === "defend") {
      actor.defending = true;
      addCombatLog(state, `${actor.name} braces for the next attack.`);
      recordCombatEvent(state, { actor: actor.id, action: "defend", target: actor.id, damage: 0 });
    } else if (actionId === "flee") {
      const escaped = state.random() < COMBAT_TUNING.fleeChance;
      recordCombatEvent(state, { actor: actor.id, action: "flee", target: null, damage: 0, escaped });
      if (escaped) {
        addCombatLog(state, "The company escapes the battle.");
        finishCombat(state, "fled");
      } else {
        addCombatLog(state, `${actor.name} fails to find an escape route.`);
      }
    }

    actor.gauge = 0;
    state.activeActorId = null;
    state.pendingActionId = null;
    state.pendingActionKind = null;
    state.interactionMode = "main";
    if (state.status === "awaitingAction") {
      state.status = "running";
      activateNextAlly(state);
    }
    syncCombatHealth(state, expedition);
    return { resolved: true, needsTarget: false, result: state.result };
  },

  chooseAbility(state, expedition, abilityId, targetId = null) {
    if (!state || state.status !== "awaitingAction") return { resolved: false, needsTarget: false };
    const actor = findCombatant(state, state.activeActorId);
    const ability = COMBAT_ABILITY_DEFINITIONS[abilityId];
    if (!actor || !ability || !availableAbilityIds(state, expedition).includes(abilityId)) {
      return { resolved: false, needsTarget: false };
    }
    const targets = ability.target === "enemy"
      ? state.enemies.filter(isLivingCombatant)
      : ability.target === "ally" ? state.allies.filter(isLivingCombatant) : [];
    if (["enemy", "ally"].includes(ability.target) && !targetId && targets.length > 1) {
      return enterTargetSelection(state, abilityId, ability.target, "ability");
    }
    const target = ability.target === "self" ? actor : targetId ? targets.find((entry) => entry.id === targetId) : targets[0];
    if (["enemy", "ally"].includes(ability.target) && !target) {
      return { resolved: false, needsTarget: targets.length > 1, targetType: ability.target };
    }
    if (ability.effectType === "intercede") {
      actor.interceding = true;
      addCombatLog(state, `${actor.name} uses Intercede and moves to protect Arthur.`);
      recordCombatEvent(state, { actor: actor.id, action: "ability", abilityId, target: "arthur", damage: 0 });
    } else if (ability.effectType === "damageAndGauge") {
      resolvePommelStrike(state, actor, target, ability);
    } else {
      return { resolved: false, needsTarget: false };
    }
    return finishActorAction(state, expedition, actor, { action: "ability", abilityId, target: target?.id ?? null });
  },

  chooseItem(state, expedition, itemId, targetId = null) {
    if (!state || state.status !== "awaitingAction") return { resolved: false, needsTarget: false };
    const actor = findCombatant(state, state.activeActorId);
    const entry = availableItemEntries(state, expedition).find((candidate) => candidate.itemId === itemId);
    const itemEffect = entry?.item?.effects?.combat;
    if (!actor || !entry || !itemEffect) return { resolved: false, needsTarget: false };
    const targets = itemEffect.target === "ally"
      ? state.allies.filter((ally) => isLivingCombatant(ally) && ally.hp < ally.maxHp)
      : [];
    if (!targetId && targets.length > 1) return enterTargetSelection(state, itemId, "ally", "item");
    const target = targetId ? targets.find((ally) => ally.id === targetId) : targets[0];
    if (!target) return { resolved: false, needsTarget: targets.length > 1, targetType: "ally" };
    const amount = Math.min(Number(itemEffect.amount) || 0, target.maxHp - target.hp);
    if (amount <= 0 || !consumeCombatItem(expedition, itemId)) return { resolved: false, needsTarget: false };
    target.hp += amount;
    addCombatLog(state, `${actor.name} uses ${entry.item.name} on ${target.name}, restoring ${amount} HP.`);
    recordCombatEvent(state, { actor: actor.id, action: "item", itemId, target: target.id, damage: 0, healingAmount: amount });
    return finishActorAction(state, expedition, actor, { action: "item", itemId, target: target.id });
  },

  availableActions(state) {
    const expedition = arguments[1] ?? state?.expedition;
    const actor = findCombatant(state, state?.activeActorId);
    return actor ? topLevelActionIds().filter((actionId) => (
      actionId !== "abilities" || availableAbilityIds(state, expedition).length > 0
    )).filter((actionId) => actionId !== "items" || availableItemEntries(state, expedition).length > 0) : [];
  },

  availableAbilities(state, expedition) {
    return availableAbilityIds(state, expedition).map((id) => COMBAT_ABILITY_DEFINITIONS[id]);
  },

  availableItems(state, expedition) {
    return availableItemEntries(state, expedition);
  },

  choosePendingTarget(state, expedition, targetId) {
    if (!state?.pendingActionId) return { resolved: false, needsTarget: false };
    if (state.pendingActionKind === "ability") return this.chooseAbility(state, expedition, state.pendingActionId, targetId);
    if (state.pendingActionKind === "item") return this.chooseItem(state, expedition, state.pendingActionId, targetId);
    return this.chooseAction(state, expedition, state.pendingActionId, targetId);
  },

  cancelTargetSelection(state) {
    if (!state || state.status !== "awaitingAction" || !state.pendingActionId) {
      return false;
    }
    state.pendingActionId = null;
    state.pendingActionKind = null;
    state.interactionMode = "main";
    return true;
  },
});

function createArthurCombatant(expedition) {
  const weapon = ITEM_DEFINITIONS[expedition.selectedEquipment.weapon];
  const armor = ITEM_DEFINITIONS[expedition.selectedEquipment.armor];
  const relic = ITEM_DEFINITIONS[expedition.selectedEquipment.relic];
  return {
    id: "arthur",
    definitionId: "arthur",
    side: "ally",
    name: PLAYER_CHARACTER_DEFINITION.name,
    maxHp: PLAYER_CHARACTER_DEFINITION.combat.maxHp,
    hp: clampCombatNumber(expedition.health, 0, PLAYER_CHARACTER_DEFINITION.combat.maxHp),
    speed: PLAYER_CHARACTER_DEFINITION.combat.speed,
    defense: Number(armor?.effects?.combatDefense) || 0,
    damage: weapon?.effects?.combatDamage ?? { minimum: 4, maximum: 6 },
    gauge: 0,
    defending: false,
    interceding: false,
    abilityIds: collectAbilityIds(
      PLAYER_CHARACTER_DEFINITION.combatAbilities,
      weapon,
      armor,
      relic,
    ),
    sourceItemIds: [weapon?.id, armor?.id, relic?.id].filter(Boolean),
  };
}

function createCompanionCombatant(expedition, companionId) {
  const companion = COMPANION_DEFINITIONS[companionId];
  if (!companion?.combat) {
    return null;
  }
  const storedHp = expedition.companionCombatHp[companionId];
  const hp = Number.isFinite(storedHp) ? storedHp : companion.combat.maxHp;
  expedition.companionCombatHp[companionId] = hp;
  return {
    id: companionId,
    definitionId: companionId,
    side: "ally",
    name: companion.name,
    maxHp: companion.combat.maxHp,
    hp: clampCombatNumber(hp, 0, companion.combat.maxHp),
    speed: companion.combat.speed,
    defense: companion.combat.defense,
    damage: companion.combat.basicDamage,
    gauge: 0,
    defending: false,
    interceding: false,
    abilityIds: collectAbilityIds(companion.combatAbilities),
    sourceItemIds: [],
  };
}

function createEnemyCombatant(enemyId, index, occurrence) {
  const enemy = COMBAT_ENEMY_DEFINITIONS[enemyId];
  if (!enemy) {
    return null;
  }
  return {
    id: `${enemyId}_${index + 1}`,
    definitionId: enemyId,
    side: "enemy",
    name: occurrence ? `${enemy.name} ${occurrence}` : enemy.name,
    maxHp: enemy.maxHp,
    hp: enemy.maxHp,
    speed: enemy.speed,
    defense: enemy.defense,
    gauge: 0,
    intentId: null,
    patternIndex: 0,
    actionPattern: [...enemy.actionPattern],
  };
}

function activateNextAlly(state) {
  if (state.activeActorId || state.status !== "running") {
    return;
  }
  while (state.readyQueue.length > 0) {
    const actorId = state.readyQueue.shift();
    const actor = findCombatant(state, actorId);
    if (!isLivingCombatant(actor)) {
      continue;
    }
    actor.defending = false;
    state.activeActorId = actor.id;
    state.status = "awaitingAction";
    addCombatLog(state, `${actor.name} is ready.`);
    return;
  }
}

function resolveAttack(state, actor, target) {
  const damage = calculateCombatDamage(rollCombatDamage(actor.damage, state.random), target.defense);
  applyCombatDamage(state, target, damage);
  recordCombatEvent(state, { actor: actor.id, action: "attack", target: target.id, damage });
  addCombatLog(state, `${actor.name} attacks ${target.name} for ${damage} damage.`);
  if (!isLivingCombatant(target)) {
    addCombatLog(state, `${target.name} is defeated.`);
  }
  if (!state.enemies.some(isLivingCombatant)) {
    finishCombat(state, "victory");
  }
}

function resolvePommelStrike(state, actor, target, ability) {
  const multiplier = Number(ability.damageMultiplier ?? COMBAT_TUNING.pommelStrikeDamageMultiplier) || 0;
  const rawDamage = Math.floor(rollCombatDamage(actor.damage, state.random) * multiplier);
  const damage = calculateCombatDamage(Math.max(1, rawDamage), target.defense);
  applyCombatDamage(state, target, damage);
  const reduction = Number(ability.gaugeReduction ?? COMBAT_TUNING.pommelStrikeGaugeReduction) || 0;
  const previousGauge = target.gauge;
  target.gauge = Math.max(0, target.gauge - reduction);
  recordCombatEvent(state, {
    actor: actor.id,
    action: "ability",
    abilityId: ability.id,
    target: target.id,
    damage,
    gaugeReduction: Math.max(0, previousGauge - target.gauge),
  });
  addCombatLog(state, `${actor.name} uses ${ability.name} on ${target.name} for ${damage} damage.`);
  if (previousGauge > target.gauge) addCombatLog(state, `${target.name}'s action gauge is pushed back.`);
  if (!isLivingCombatant(target)) addCombatLog(state, `${target.name} is defeated.`);
  if (!state.enemies.some(isLivingCombatant)) finishCombat(state, "victory");
}

function resolveEnemyAction(state, expedition, enemy) {
  const action = COMBAT_ENEMY_ACTION_DEFINITIONS[enemy.intentId];
  let target = chooseEnemyTarget(state, action);
  const selectedTargetId = target?.id ?? null;
  const interceder = state.allies.find((ally) => (
    ally.interceding && isLivingCombatant(ally) && target?.id === "arthur"
  ));
  if (interceder) {
    interceder.interceding = false;
    addCombatLog(state, `${interceder.name} takes ${action.name} meant for Arthur.`);
    target = interceder;
  }
  if (target) {
    const rolled = rollCombatDamage(action.damage, state.random);
    const mitigated = calculateCombatDamage(rolled, target.defense);
    const damage = target.defending
      ? Math.max(1, Math.floor(mitigated * COMBAT_TUNING.defendDamageMultiplier))
      : mitigated;
    applyCombatDamage(state, target, damage);
    recordCombatEvent(state, {
      actor: enemy.id,
      action: action.id,
      target: target.id,
      selectedTarget: selectedTargetId,
      redirectedByIntercede: target.id !== selectedTargetId,
      damage,
    });
    addCombatLog(state, `${enemy.name} uses ${action.name} on ${target.name} for ${damage} damage.`);
    if (!isLivingCombatant(target)) {
      addCombatLog(state, `${target.name} is incapacitated.`);
    }
  }
  enemy.gauge = 0;
  enemy.intentId = nextEnemyIntent(enemy);
  if (state.allies.find((ally) => ally.id === "arthur")?.hp <= 0) {
    finishCombat(state, "defeat");
  } else {
    addCombatLog(state, `${enemy.name} prepares ${enemyIntentName(enemy)}.`);
  }
  syncCombatHealth(state, expedition);
}

function chooseEnemyTarget(state, action) {
  if (action?.target === "arthur") {
    const arthur = state.allies.find((ally) => ally.id === "arthur" && isLivingCombatant(ally));
    const companions = state.allies.filter((ally) => ally.id !== "arthur" && isLivingCombatant(ally));
    if (!arthur) return companions[0] ?? null;
    if (companions.length === 0) return arthur;
    const roll = state.random();
    if (roll < COMBAT_TUNING.enemyTargetWeights.arthur) return arthur;
    const companionRoll = (roll - COMBAT_TUNING.enemyTargetWeights.arthur)
      / COMBAT_TUNING.enemyTargetWeights.activeCompanions;
    return companions[Math.min(companions.length - 1, Math.floor(companionRoll * companions.length))];
  }
  return state.allies.find(isLivingCombatant) ?? null;
}

function nextEnemyIntent(enemy) {
  const intentId = enemy.actionPattern[enemy.patternIndex % enemy.actionPattern.length];
  enemy.patternIndex += 1;
  return intentId;
}

function enemyIntentName(enemy) {
  return COMBAT_ENEMY_ACTION_DEFINITIONS[enemy.intentId]?.name ?? "Attack";
}

function calculateCombatDamage(rawDamage, defense) {
  return Math.max(1, rawDamage - Math.max(0, Number(defense) || 0));
}

function rollCombatDamage(range, random) {
  const minimum = Math.ceil(range.minimum);
  const maximum = Math.floor(range.maximum);
  return minimum + Math.floor(random() * (maximum - minimum + 1));
}

function applyCombatDamage(state, target, amount) {
  target.hp = Math.max(0, target.hp - amount);
  target.lastHitEvent = ++state.eventCounter;
  if (target.hp <= 0) {
    target.interceding = false;
  }
}

function syncCombatHealth(state, expedition) {
  const arthur = state.allies.find((ally) => ally.id === "arthur");
  if (arthur) {
    expedition.health = arthur.hp;
  }
  expedition.companionCombatHp ??= {};
  state.allies.filter((ally) => ally.id !== "arthur").forEach((ally) => {
    expedition.companionCombatHp[ally.definitionId] = ally.hp;
  });
}

function availableActionIds(actor) {
  return topLevelActionIds();
}

function topLevelActionIds() {
  return ["attack", "defend", "abilities", "items", "flee"];
}

function collectAbilityIds(...sources) {
  return [...new Set(sources.flatMap((source) => {
    if (Array.isArray(source)) return source;
    return source?.effects?.grantedAbilityIds ?? [];
  }).filter((id) => COMBAT_ABILITY_DEFINITIONS[id] && !COMBAT_ABILITY_DEFINITIONS[id].category))];
}

function availableAbilityIds(state, expedition = state?.expedition) {
  const actor = findCombatant(state, state?.activeActorId);
  return actor && isLivingCombatant(actor)
    ? (actor.abilityIds ?? []).filter((id) => COMBAT_ABILITY_DEFINITIONS[id])
    : [];
}

function availableItemEntries(state, expedition = state?.expedition) {
  if (!expedition) return [];
  const hasInjuredAlly = state.allies.some((ally) => isLivingCombatant(ally) && ally.hp < ally.maxHp);
  return Object.entries(expedition.carriedItems ?? {})
    .filter(([itemId, quantity]) => quantity > 0)
    .map(([itemId, quantity]) => ({ itemId, quantity, item: ITEM_DEFINITIONS[itemId] }))
    .filter((entry) => entry.item?.effects?.combat?.usable
      && entry.item.effects.combat.effectType === "heal"
      && hasInjuredAlly
    );
}

function enterTargetSelection(state, actionId, targetType, kind = "action") {
  state.pendingActionId = actionId;
  state.pendingActionKind = kind;
  state.interactionMode = targetType === "ally" ? "allyTarget" : "enemyTarget";
  return { resolved: false, needsTarget: true, targetType };
}

function finishActorAction(state, expedition, actor, event = {}) {
  actor.gauge = 0;
  state.activeActorId = null;
  state.pendingActionId = null;
  state.pendingActionKind = null;
  state.interactionMode = "main";
  if (state.status === "awaitingAction") {
    state.status = "running";
    activateNextAlly(state);
  }
  syncCombatHealth(state, expedition);
  return { resolved: true, needsTarget: false, result: state.result, ...event };
}

function consumeCombatItem(expedition, itemId) {
  if (typeof ExpeditionRules?.consumeCarriedItem === "function") {
    return ExpeditionRules.consumeCarriedItem(expedition, itemId, 1);
  }
  const quantity = expedition?.carriedItems?.[itemId] ?? 0;
  if (quantity < 1) return false;
  expedition.carriedItems[itemId] = quantity - 1;
  if (expedition.carriedItems[itemId] <= 0) delete expedition.carriedItems[itemId];
  expedition.consumedItems[itemId] = (expedition.consumedItems[itemId] ?? 0) + 1;
  return true;
}

function finishCombat(state, result) {
  state.status = "resolved";
  state.result = result;
  state.allies.forEach((ally) => { ally.interceding = false; });
  state.activeActorId = null;
  state.pendingActionId = null;
  state.pendingActionKind = null;
  state.interactionMode = "main";
  state.readyQueue.length = 0;
}

function addCombatLog(state, message) {
  state.log.push(message);
  if (state.log.length > COMBAT_TUNING.combatLogLimit) {
    state.log.splice(0, state.log.length - COMBAT_TUNING.combatLogLimit);
  }
}

function recordCombatEvent(state, event) {
  state.events.push({ sequence: state.events.length + 1, ...event });
}

function findCombatant(state, combatantId) {
  return [...state.allies, ...state.enemies].find((combatant) => combatant.id === combatantId);
}

function isLivingCombatant(combatant) {
  return Boolean(combatant && combatant.hp > 0);
}

function clampCombatNumber(value, minimum, maximum) {
  const number = Number(value);
  return Math.min(Math.max(Number.isFinite(number) ? number : maximum, minimum), maximum);
}
