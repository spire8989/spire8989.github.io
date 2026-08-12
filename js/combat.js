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
    const enemies = definition.enemyIds.map((enemyId, index) => (
      createEnemyCombatant(enemyId, index)
    )).filter(Boolean);
    const state = {
      id: combatId,
      status: "running",
      allies,
      enemies,
      readyQueue: [],
      activeActorId: null,
      pendingActionId: null,
      log: [],
      result: null,
      resultHandled: false,
      random: typeof options.random === "function" ? options.random : Math.random,
      eventCounter: 0,
    };
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
    if (!actor || !isLivingCombatant(actor) || !availableActionIds(actor).includes(actionId)) {
      return { resolved: false, needsTarget: false };
    }

    if (actionId === "attack") {
      const targets = state.enemies.filter(isLivingCombatant);
      if (!targetId && targets.length > 1) {
        state.pendingActionId = actionId;
        return { resolved: false, needsTarget: true };
      }
      const target = targets.find((candidate) => candidate.id === targetId) ?? targets[0];
      if (!target) {
        return { resolved: false, needsTarget: false };
      }
      resolveAttack(state, actor, target);
    } else if (actionId === "defend") {
      actor.defending = true;
      addCombatLog(state, `${actor.name} braces for the next attack.`);
    } else if (actionId === "intercede") {
      actor.interceding = true;
      addCombatLog(state, `${actor.name} uses Intercede and moves to protect Arthur.`);
    } else if (actionId === "flee") {
      if (state.random() < COMBAT_TUNING.fleeChance) {
        addCombatLog(state, "The company escapes the battle.");
        finishCombat(state, "fled");
      } else {
        addCombatLog(state, `${actor.name} fails to find an escape route.`);
      }
    }

    actor.gauge = 0;
    state.activeActorId = null;
    state.pendingActionId = null;
    if (state.status === "awaitingAction") {
      state.status = "running";
      activateNextAlly(state);
    }
    syncCombatHealth(state, expedition);
    return { resolved: true, needsTarget: false, result: state.result };
  },

  availableActions(state) {
    const actor = findCombatant(state, state?.activeActorId);
    return actor ? availableActionIds(actor) : [];
  },
});

function createArthurCombatant(expedition) {
  const weapon = ITEM_DEFINITIONS[expedition.selectedEquipment.weapon];
  const armor = ITEM_DEFINITIONS[expedition.selectedEquipment.armor];
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
    abilityIds: [],
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
    abilityIds: [...(companion.combatAbilities ?? [])],
  };
}

function createEnemyCombatant(enemyId, index) {
  const enemy = COMBAT_ENEMY_DEFINITIONS[enemyId];
  if (!enemy) {
    return null;
  }
  return {
    id: `${enemyId}_${index + 1}`,
    definitionId: enemyId,
    side: "enemy",
    name: enemy.name,
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
    actor.interceding = false;
    state.activeActorId = actor.id;
    state.status = "awaitingAction";
    addCombatLog(state, `${actor.name} is ready.`);
    return;
  }
}

function resolveAttack(state, actor, target) {
  const damage = calculateCombatDamage(rollCombatDamage(actor.damage, state.random), target.defense);
  applyCombatDamage(state, target, damage);
  addCombatLog(state, `${actor.name} attacks ${target.name} for ${damage} damage.`);
  if (!isLivingCombatant(target)) {
    addCombatLog(state, `${target.name} is defeated.`);
  }
  if (!state.enemies.some(isLivingCombatant)) {
    finishCombat(state, "victory");
  }
}

function resolveEnemyAction(state, expedition, enemy) {
  const action = COMBAT_ENEMY_ACTION_DEFINITIONS[enemy.intentId];
  let target = chooseEnemyTarget(state, action);
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
    if (arthur) {
      return arthur;
    }
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
  return ["attack", "defend", ...(actor.abilityIds ?? []), "flee"];
}

function finishCombat(state, result) {
  state.status = "resolved";
  state.result = result;
  state.activeActorId = null;
  state.pendingActionId = null;
  state.readyQueue.length = 0;
}

function addCombatLog(state, message) {
  state.log.push(message);
  if (state.log.length > COMBAT_TUNING.combatLogLimit) {
    state.log.splice(0, state.log.length - COMBAT_TUNING.combatLogLimit);
  }
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
