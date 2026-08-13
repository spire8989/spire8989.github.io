"use strict";

const SimulationStrategies = Object.freeze({
  random: createStrategy("random", (choices, context) => context.random.pick(choices)),
  cautious: createStrategy("cautious", (choices) => highestScored(choices, cautiousChoiceScore)),
  aggressive: createStrategy("aggressive", (choices) => highestScored(choices, aggressiveChoiceScore)),
  greedy: createStrategy("greedy", (choices) => highestScored(choices, greedyChoiceScore)),
});

const SimulationProvisionPlanning = Object.freeze({
  encounterReserves: Object.freeze({ cautious: 4, random: 3, aggressive: 2, greedy: 3 }),

  encounterReserve(strategyName) {
    return this.encounterReserves[strategyName] ?? this.encounterReserves.random;
  },

  passiveTravelCost(distance, consumptionMultiplier) {
    return ExpeditionRules.provisionCostForDistance(distance, consumptionMultiplier);
  },

  passiveRoundTripCost(distance, consumptionMultiplier) {
    return this.passiveTravelCost(distance, consumptionMultiplier) * 2;
  },

  emergencyTurnaround(expedition, strategyName) {
    const encounterReserve = this.encounterReserve(strategyName);
    const passiveReturnEstimate = this.passiveTravelCost(
      expedition.distance, expedition.provisionConsumptionMultiplier,
    );
    const totalReturnRequirement = passiveReturnEstimate + encounterReserve;
    return {
      shouldTurn: expedition.direction === "outbound"
        && expedition.distance > 0
        && expedition.provisions <= totalReturnRequirement,
      strategy: strategyName,
      distance: rounded(expedition.distance),
      provisionsRemaining: rounded(expedition.provisions),
      passiveReturnEstimate: rounded(passiveReturnEstimate),
      encounterReserve,
      totalReturnRequirement: rounded(totalReturnRequirement),
    };
  },
});

const TurnaroundPolicies = Object.freeze({
  fixedDistance(distance = 50) {
    const targetDistance = Math.max(0, Number(distance) || 0);
    return Object.freeze({
      name: "fixed-distance",
      configuration: { distance: targetDistance },
      shouldTurn(expedition) {
        return expedition.direction === "outbound" && expedition.distance >= targetDistance;
      },
    });
  },

  provisionReserve(options = {}) {
    const reserve = Math.max(0, Number(options.reserve) || 2);
    const minimumDistance = Math.max(0, Number(options.minimumDistance) || 10);
    return Object.freeze({
      name: "provision-reserve",
      configuration: { reserve, minimumDistance },
      shouldTurn(expedition) {
        const returnCost = ExpeditionRules.estimateReturnProvisionCost(expedition);
        return expedition.direction === "outbound"
          && expedition.distance >= minimumDistance
          && expedition.provisions <= returnCost + reserve;
      },
    });
  },
});

const SimulationRunner = Object.freeze({
  run(scenario = {}) {
    const startedAt = performance.now();
    const normalized = normalizeScenario(scenario);
    const random = GameRandom.create(normalized.seed);
    const player = createSimulationPlayer(normalized);
    const replayStartingState = replayPlayerSnapshot(player);
    const startingStock = player.provisions;
    const expedition = ExpeditionRules.startExpedition(player, {
      provisions: Math.min(normalized.provisions, player.provisions),
      companion: normalized.companion,
      equipment: normalized.loadout,
      packedItems: normalized.packContents,
      random: random.random,
      health: normalized.startingHealth,
      regionId: normalized.regionId,
      pathId: normalized.pathId,
    });
    const strategy = resolveStrategy(normalized.strategy);
    const turnaroundPolicy = resolveTurnaroundPolicy(normalized.turnaroundPolicy);
    const telemetry = createTelemetry(
      normalized, expedition, strategy, turnaroundPolicy, replayStartingState,
    );
    let stepCount = 0;
    let failureReason = null;

    const fail = (reason) => {
      if (expedition.status !== "active") return;
      expedition.status = "failed";
      failureReason = reason;
      telemetry.events.push({ type: "expedition-failed", reason, distance: rounded(expedition.distance) });
    };

    while (expedition.status === "active" && stepCount < normalized.maxSimulationSteps) {
      stepCount += 1;
      if (expedition.combat) {
        resolveCombatInstantly(expedition, player, strategy, random, telemetry, fail, normalized);
        continue;
      }
      if (expedition.activeEncounter) {
        resolveEncounterInstantly(expedition, player, strategy, random, telemetry, fail);
        continue;
      }
      if (turnaroundPolicy.shouldTurn(expedition, telemetry)) {
        ExpeditionRules.beginReturn(expedition);
        telemetry.turnaroundDistance = rounded(expedition.distance);
        telemetry.decisions.push({
          type: "turnaround",
          distance: rounded(expedition.distance),
          policy: turnaroundPolicy.name,
        });
        telemetry.events.push({ type: "turnaround", distance: rounded(expedition.distance) });
        continue;
      }
      const provisionSafety = SimulationProvisionPlanning.emergencyTurnaround(
        expedition, strategy.name,
      );
      if (provisionSafety.shouldTurn) {
        ExpeditionRules.beginReturn(expedition);
        telemetry.turnaroundDistance = rounded(expedition.distance);
        telemetry.emergencyProvisionTurnaround = true;
        telemetry.emergencyProvisionTurnaroundDistance = rounded(expedition.distance);
        telemetry.emergencyReturnPassiveEstimate = provisionSafety.passiveReturnEstimate;
        telemetry.emergencyReturnTotalRequirement = provisionSafety.totalReturnRequirement;
        const decision = {
          type: "emergency-provision-turnaround",
          distance: rounded(expedition.distance),
          originalTargetDistance: telemetry.originalTargetDistance,
          ...provisionSafety,
        };
        telemetry.decisions.push(decision);
        telemetry.events.push({ ...decision });
        continue;
      }

      let travelDistance = normalized.travelStepDistance;
      const distanceToEncounter = expedition.nextEncounterAt - expedition.encounterTravelDistance;
      if (distanceToEncounter > 0) travelDistance = Math.min(travelDistance, distanceToEncounter);
      if (expedition.direction === "outbound" && turnaroundPolicy.name === "fixed-distance") {
        travelDistance = Math.min(
          travelDistance,
          Math.max(0, turnaroundPolicy.configuration.distance - expedition.distance),
        );
      }
      const travel = ExpeditionRules.travel(expedition, player, travelDistance);
      if (travel.failureReason) {
        fail(travel.failureReason);
      } else if (travel.reachedSafety) {
        expedition.status = "returned";
        telemetry.events.push({ type: "expedition-returned", distance: 0 });
      } else if (travel.encounter) {
        telemetry.events.push({
          type: "encounter-start",
          encounterId: travel.encounter.id,
          distance: rounded(expedition.distance),
          direction: expedition.direction,
          pathId: expedition.currentPathId,
        });
      }
    }

    if (expedition.status === "active") {
      fail(`Maximum simulation step count (${normalized.maxSimulationSteps}) reached.`);
    }
    const returnedSafely = expedition.status === "returned";
    ExpeditionRules.settle(player, expedition, returnedSafely);
    finalizeTelemetry(
      telemetry,
      normalized,
      expedition,
      player,
      startingStock,
      failureReason,
      stepCount,
      performance.now() - startedAt,
    );
    return telemetry;
  },

  verifyDeterminism(scenario = {}, seed = scenario.seed ?? "determinism-check") {
    const configured = { ...scenario, seed };
    const firstRun = this.run(configured);
    const secondRun = this.run(configured);
    const first = SimulationTelemetry.normalizeRun(firstRun);
    const second = SimulationTelemetry.normalizeRun(secondRun);
    const firstMismatch = firstDifference(first, second);
    return {
      matches: firstMismatch === null,
      firstMismatch,
      first,
      second,
    };
  },

  runBatch(request = {}) {
    const startedAt = performance.now();
    const scenarios = request.scenarios?.length ? request.scenarios : [{}];
    const runsPerScenario = Math.max(1, Math.floor(Number(request.runsPerScenario) || 1));
    const results = [];
    scenarios.forEach((scenario, scenarioIndex) => {
      for (let runIndex = 0; runIndex < runsPerScenario; runIndex += 1) {
        const baseSeed = scenario.seed ?? request.seed ?? `${scenario.id ?? scenarioIndex}`;
        results.push(this.run({
          ...scenario,
          scenarioId: scenario.scenarioId ?? scenario.id ?? `scenario-${scenarioIndex + 1}`,
          seed: runsPerScenario === 1 ? baseSeed : `${baseSeed}:${runIndex}`,
        }));
      }
    });
    const batch = {
      generatedAt: new Date().toISOString(),
      durationMs: rounded(performance.now() - startedAt, 3),
      results,
    };
    batch.summary = SimulationTelemetry.aggregate(batch, request.groupBy);
    return batch;
  },

  async runBatchAsync(request = {}) {
    const scenarios = request.scenarios?.length ? request.scenarios : [{}];
    const runsPerScenario = Math.max(1, Math.floor(Number(request.runsPerScenario) || 1));
    const yieldEvery = Math.max(1, Math.floor(Number(request.yieldEvery) || 100));
    const startedAt = performance.now();
    const results = [];
    for (let scenarioIndex = 0; scenarioIndex < scenarios.length; scenarioIndex += 1) {
      for (let runIndex = 0; runIndex < runsPerScenario; runIndex += 1) {
        const scenario = scenarios[scenarioIndex];
        const baseSeed = scenario.seed ?? request.seed ?? `${scenario.id ?? scenarioIndex}`;
        results.push(this.run({
          ...scenario,
          scenarioId: scenario.scenarioId ?? scenario.id ?? `scenario-${scenarioIndex + 1}`,
          seed: runsPerScenario === 1 ? baseSeed : `${baseSeed}:${runIndex}`,
        }));
        if (results.length % yieldEvery === 0) {
          await new Promise((resolve) => window.setTimeout(resolve, 0));
        }
      }
    }
    const batch = {
      generatedAt: new Date().toISOString(),
      durationMs: rounded(performance.now() - startedAt, 3),
      results,
    };
    batch.summary = SimulationTelemetry.aggregate(batch, request.groupBy);
    return batch;
  },
});

const SimulationTelemetry = Object.freeze({
  normalizeRun(run) {
    return deepClone({
      scenario: run.scenario,
      replayStartingState: run.replay?.startingPlayerState,
      seed: run.seed,
      strategy: run.strategy,
      turnaroundPolicy: run.turnaroundPolicy,
      turnaroundConfiguration: run.turnaroundConfiguration,
      companion: run.companion,
      startingProvisions: run.startingProvisions,
      originalTargetDistance: run.originalTargetDistance,
      departurePassiveFoodEstimate: run.departurePassiveFoodEstimate,
      encounterProvisionReserve: run.encounterProvisionReserve,
      departureTotalEstimatedRequirement: run.departureTotalEstimatedRequirement,
      emergencyProvisionTurnaround: run.emergencyProvisionTurnaround,
      emergencyProvisionTurnaroundDistance: run.emergencyProvisionTurnaroundDistance,
      emergencyReturnPassiveEstimate: run.emergencyReturnPassiveEstimate,
      emergencyReturnTotalRequirement: run.emergencyReturnTotalRequirement,
      loadout: run.loadout,
      packedItems: run.packedItems,
      itemsPackedById: run.itemsPackedById,
      itemsConsumedById: run.itemsConsumedById,
      itemsReturnedById: run.itemsReturnedById,
      bandagesPacked: run.bandagesPacked,
      bandagesUsed: run.bandagesUsed,
      bandagesReturned: run.bandagesReturned,
      bandageHealingPerformed: run.bandageHealingPerformed,
      outcome: run.outcome,
      failureReason: run.failureReason,
      provisionExhaustionFailure: run.provisionExhaustionFailure,
      completionReason: run.completionReason,
      maximumDistance: run.maximumDistance,
      finalDistance: run.finalDistance,
      finalPartyHealth: run.finalPartyHealth,
      provisionsRemaining: run.provisionsRemaining,
      provisionsConsumed: run.provisionsConsumed,
      provisionsGained: run.provisionsGained,
      provisionsReturned: run.provisionsReturned,
      goldGained: run.goldGained,
      lootDiscovered: run.lootDiscovered,
      lootRecovered: run.lootRecovered,
      lootLost: run.lootLost,
      estimatedLootValue: run.estimatedLootValue,
      aggressiveEmergencyActions: run.aggressiveEmergencyActions,
      combatsStartedBelow50Percent: run.combatsStartedBelow50Percent,
      combatsStartedBelow25Percent: run.combatsStartedBelow25Percent,
      attacksReceivedByPartyMember: run.attacksReceivedByPartyMember,
      damageReceivedByPartyMember: run.damageReceivedByPartyMember,
      abilityUsesById: run.abilityUsesById,
      itemUsesById: run.itemUsesById,
      totalHealingPerformed: run.totalHealingPerformed,
      totalGaugeControl: run.totalGaugeControl,
      turnaroundDistance: run.turnaroundDistance,
      encounters: run.encounters,
      combats: run.combats,
      decisions: run.decisions,
      events: run.events,
    });
  },

  aggregate(batchOrResults, groupBy = ["strategy", "companion", "loadout", "scenarioId", "turnaroundPolicy"]) {
    const results = Array.isArray(batchOrResults) ? batchOrResults : batchOrResults.results;
    const groups = {};
    (groupBy ?? []).forEach((field) => {
      groups[field] = Object.fromEntries(groupValues(results, field).map(([key, runs]) => [key, summarizeRuns(runs)]));
    });
    return { ...summarizeRuns(results), groups, encounters: aggregateEncounters(results) };
  },

  toJson(batch, spacing = 2) {
    return JSON.stringify(batch, null, spacing);
  },

  toCsv(batchOrResults) {
    const results = Array.isArray(batchOrResults) ? batchOrResults : batchOrResults.results;
    const fields = [
      "runId", "scenarioId", "seed", "strategy", "turnaroundPolicy", "companion",
      "outcome", "failureReason", "provisionExhaustionFailure", "originalTargetDistance",
      "departurePassiveFoodEstimate", "encounterProvisionReserve", "departureTotalEstimatedRequirement",
      "emergencyProvisionTurnaround", "emergencyProvisionTurnaroundDistance", "turnaroundDistance",
      "maximumDistance", "finalDistance", "finalArthurHealth",
      "provisionsConsumed", "provisionsRemaining", "provisionsGained", "goldGained",
      "estimatedLootValue", "encounterCount", "combatCount", "aggressiveEmergencyActions",
      "combatsStartedBelow50Percent", "combatsStartedBelow25Percent", "stepCount", "durationMs",
      "arthurCombatAttacksReceived", "companionCombatAttacksReceived",
      "arthurCombatDamageReceived", "companionCombatDamageReceived",
      "totalHealingPerformed", "totalGaugeControl", "abilityUsesById", "itemUsesById",
      "itemsPackedById", "itemsConsumedById", "itemsReturnedById", "bandagesPacked", "bandagesUsed",
      "bandagesReturned", "bandageHealingPerformed",
    ];
    return [fields.join(","), ...results.map((run) => fields.map((field) => csvCell(run[field])).join(","))].join("\n");
  },
});

function createStrategy(name, chooseEncounter) {
  return Object.freeze({
    name,
    chooseEncounter,
    chooseCombatAction(combat, expedition, context) {
      const actions = CombatSystem.availableActions(combat, expedition);
      const maxHealth = PLAYER_CHARACTER_DEFINITION.combat.maxHp;
      if (name === "cautious" && expedition.health < maxHealth * 0.3 && actions.includes("flee")) return "flee";
      if (name === "random") return context.random.pick(actions);
      if (name === "aggressive") {
        const emergency = aggressiveEmergencyCombatDecision(combat, expedition, actions);
        if (emergency) {
          context.recordEmergency?.(emergency);
          return emergency.actionId;
        }
      }
      const abilities = CombatSystem.availableAbilities(combat, expedition);
      if (name === "aggressive" && actions.includes("abilities")
        && abilities.some((ability) => ability.id === "pommel_strike")
        && expedition.health < maxHealth
        && combat.enemies.some((enemy) => enemy.hp > 0 && enemy.gauge >= 75)) {
        return "abilities";
      }
      if (name === "cautious" && actions.includes("abilities")
        && abilities.some((ability) => ability.id === "intercede")
        && expedition.health < maxHealth * 0.55) {
        return "abilities";
      }
      if (name !== "random" && actions.includes("items")
        && expedition.health < maxHealth * 0.55
        && CombatSystem.availableItems(combat, expedition).length > 0) {
        return "items";
      }
      return actions.includes("attack") ? "attack" : actions[0];
    },
    chooseCombatAbility(combat, _expedition, context) {
      const abilities = CombatSystem.availableAbilities(combat, _expedition);
      if (name === "random") return context.random.pick(abilities)?.id;
      return abilities.find((ability) => ability.id === "pommel_strike")?.id
        ?? abilities.find((ability) => ability.id === "intercede")?.id
        ?? abilities[0]?.id;
    },
    chooseCombatItem(combat, _expedition, context) {
      const items = CombatSystem.availableItems(combat, _expedition);
      if (name === "random") return context.random.pick(items)?.itemId;
      return items.find((entry) => entry.itemId === "bandages")?.itemId ?? items[0]?.itemId;
    },
    chooseCombatTarget(combat, _expedition, context, targetType = "enemy") {
      const targets = targetType === "ally"
        ? combat.allies.filter((ally) => ally.hp > 0 && ally.hp < ally.maxHp)
        : combat.enemies.filter((enemy) => enemy.hp > 0);
      if (name === "random") return context.random.pick(targets)?.id;
      return targets.sort((left, right) => (left.hp / left.maxHp) - (right.hp / right.maxHp))[0]?.id;
    },
  });
}

function aggressiveEmergencyCombatDecision(combat, expedition, actions) {
  if (combat.activeActorId !== "arthur" || expedition.health <= 0) return null;
  const arthur = combat.allies.find((ally) => ally.id === "arthur");
  if (!arthur) return null;
  const secondsUntilArthurActs = COMBAT_TUNING.actionGaugeMaximum
    / (arthur.speed * COMBAT_TUNING.actionGaugeRate);
  const threats = combat.enemies.filter((enemy) => {
    if (enemy.hp <= 0) return false;
    const action = COMBAT_ENEMY_ACTION_DEFINITIONS[enemy.intentId];
    if (!action || action.target !== "arthur") return false;
    const secondsUntilEnemyActs = (COMBAT_TUNING.actionGaugeMaximum - enemy.gauge)
      / (enemy.speed * COMBAT_TUNING.actionGaugeRate);
    return secondsUntilEnemyActs <= secondsUntilArthurActs;
  }).map((enemy) => {
    const action = COMBAT_ENEMY_ACTION_DEFINITIONS[enemy.intentId];
    const unguardedDamage = Math.max(1, action.damage.maximum - arthur.defense);
    return {
      enemyId: enemy.id,
      intentId: enemy.intentId,
      unguardedDamage,
      defendedDamage: Math.max(1, Math.floor(unguardedDamage * COMBAT_TUNING.defendDamageMultiplier)),
    };
  });
  const estimatedIncomingDamage = threats.reduce((sum, threat) => sum + threat.unguardedDamage, 0);
  if (estimatedIncomingDamage < expedition.health) return null;
  const estimatedDefendedDamage = threats.reduce((sum, threat) => sum + threat.defendedDamage, 0);
  const actionId = actions.includes("defend") && estimatedDefendedDamage < expedition.health
    ? "defend" : actions.includes("flee") ? "flee" : actions.includes("defend") ? "defend" : null;
  return actionId ? {
    triggered: true,
    reason: "lethal-damage-before-next-action",
    actionId,
    arthurHealth: expedition.health,
    estimatedIncomingDamage,
    estimatedDefendedDamage,
    threats,
  } : null;
}

function choiceText(choice) {
  return `${choice.id} ${choice.label} ${JSON.stringify(choice.outcomes ?? [])} ${JSON.stringify(choice.branches ?? [])}`.toLowerCase();
}

function costAmount(choice, resource) {
  return (choice.costs ?? []).filter((cost) => cost.type === "modifyResource" && cost.resource === resource)
    .reduce((sum, cost) => sum + (Number(cost.amount) || 0), 0);
}

function cautiousChoiceScore(choice) {
  const text = choiceText(choice);
  return (choice.requirements?.length ?? 0) * 8
    + (/safe|careful|rope|cloak|knowledge|avoid|leave|road|wait|shelter|rest/.test(text) ? 12 : 0)
    - (/fight|combat|attack|risk|climb|search|pursue|follow/.test(text) ? 10 : 0)
    + costAmount(choice, "health") * 3 + costAmount(choice, "provisions");
}

function aggressiveChoiceScore(choice) {
  const text = choiceText(choice);
  return (/fight|combat|attack|stand_ground|confront|force|cross|push/.test(text) ? 20 : 0)
    - (/flee|avoid|leave|wait|return/.test(text) ? 10 : 0);
}

function greedyChoiceScore(choice) {
  const text = choiceText(choice);
  return (/loot|gain.*item|gold|search|investigate|explore|take|follow|open|dig|track/.test(text) ? 22 : 0)
    - (/leave|ignore|return|avoid|wait/.test(text) ? 8 : 0);
}

function highestScored(entries, score) {
  return entries.reduce((best, entry) => score(entry) > score(best) ? entry : best, entries[0]);
}

function normalizeScenario(scenario) {
  const defaultPlayer = SaveSystem.createDefaultPlayerState();
  const companion = scenario.companion !== undefined ? scenario.companion : defaultPlayer.selectedCompanion;
  const capacity = ExpeditionRules.partyProvisionCapacity(companion);
  const turnaroundPolicy = scenario.turnaroundPolicy ?? { type: "fixedDistance", distance: 50 };
  return {
    id: scenario.id ?? scenario.scenarioId ?? "default",
    scenarioId: scenario.scenarioId ?? scenario.id ?? "default",
    seed: scenario.seed ?? "grail-simulation",
    companion,
    provisions: Math.max(1, Math.min(Number(scenario.provisions) || Math.min(24, capacity), capacity)),
    loadout: { ...defaultPlayer.equippedItems, ...(scenario.loadout?.equipment ?? scenario.loadout ?? {}) },
    packContents: scenario.packContents ?? defaultPlayer.packedItems,
    strategy: scenario.strategy ?? "cautious",
    turnaroundPolicy,
    startingState: scenario.startingState ?? {},
    regionId: scenario.regionId ?? "broceliande",
    pathId: scenario.pathId ?? "old_forest_road",
    startingHealth: Number.isFinite(scenario.startingState?.health)
      ? scenario.startingState.health
      : Number.isFinite(scenario.startingState?.arthurHealth)
        ? scenario.startingState.arthurHealth
        : PLAYER_CHARACTER_DEFINITION.combat.maxHp,
    maxSimulationSteps: Math.max(100, Math.floor(Number(scenario.maxSimulationSteps) || 10000)),
    maxCombatSteps: Math.max(50, Math.floor(Number(scenario.maxCombatSteps) || 2000)),
    travelStepDistance: Math.max(0.1, Number(scenario.travelStepDistance) || 1),
  };
}

function createSimulationPlayer(scenario) {
  const defaults = SaveSystem.createDefaultPlayerState();
  const player = deepClone({ ...defaults, ...scenario.startingState });
  player.ownedItems = { ...defaults.ownedItems, ...(scenario.startingState.ownedItems ?? {}) };
  player.equippedItems = { ...scenario.loadout };
  const packedEntries = Array.isArray(scenario.packContents)
    ? scenario.packContents.map((itemId) => [itemId, player.ownedItems[itemId] ?? 1])
    : Object.entries(scenario.packContents ?? {});
  packedEntries.forEach(([itemId, quantity]) => { player.ownedItems[itemId] = Math.max(1, Number(quantity) || 1); });
  Object.values(player.equippedItems).filter(Boolean).forEach((itemId) => { player.ownedItems[itemId] ??= 1; });
  player.packedItems = packedEntries.map(([itemId]) => itemId).slice(0, EXPEDITION_TUNING.packSlots);
  player.selectedCompanion = scenario.companion;
  player.provisions = Math.max(Number(player.provisions) || 0, scenario.provisions);
  return player;
}

function resolveStrategy(strategy) {
  if (typeof strategy === "object" && typeof strategy.chooseEncounter === "function") return strategy;
  return SimulationStrategies[strategy] ?? SimulationStrategies.cautious;
}

function resolveTurnaroundPolicy(policy) {
  if (policy && typeof policy.shouldTurn === "function") return policy;
  if (typeof policy === "number") return TurnaroundPolicies.fixedDistance(policy);
  if (policy?.type === "provisionReserve" || policy?.type === "provision-reserve") {
    return TurnaroundPolicies.provisionReserve(policy);
  }
  return TurnaroundPolicies.fixedDistance(policy?.distance ?? 50);
}

function resolveEncounterInstantly(expedition, player, strategy, random, telemetry, fail) {
  const active = expedition.activeEncounter;
  const definition = ENCOUNTER_DEFINITIONS[active.encounterId];
  let history = telemetry.encounters.at(-1);
  if (!history || history.completed || history.encounterId !== active.encounterId) {
    history = {
      encounterId: definition.id,
      name: definition.title,
      distance: rounded(expedition.distance),
      direction: expedition.direction,
      pathId: expedition.currentPathId,
      availableChoices: [],
      decisions: [],
      resourceChanges: {},
      healthChanges: {},
      itemsGained: [],
      itemsLost: [],
      combatTriggered: false,
      outcome: null,
      completed: false,
      before: resourceSnapshot(expedition),
    };
    telemetry.encounters.push(history);
  }
  if (active.phase === "pending") {
    const result = EncounterManager.completePendingAction(expedition, player, active.pendingToken, {
      failExpedition: fail,
      startCombat: (combatId) => startSimulationCombat(expedition, combatId, history, telemetry),
    });
    checkEncounterSurvival(expedition, fail);
    if (!result.resolved) fail("A pending encounter action could not resolve.");
    return;
  }
  if (active.phase === "choice") {
    const stage = definition.stages[active.stageId];
    const choices = stage.choices.filter((choice) => EncounterRequirements.choiceAvailability(
      choice, { expedition, player },
    ).available);
    if (choices.length === 0) {
      fail(`Encounter ${definition.id} had no available choices.`);
      return;
    }
    const choice = strategy.chooseEncounter(choices, { expedition, player, encounter: definition, stage, random })
      ?? choices[0];
    history.availableChoices.push({ stageId: active.stageId, choiceIds: choices.map((entry) => entry.id) });
    history.decisions.push({ stageId: active.stageId, choiceId: choice.id, label: choice.label });
    telemetry.decisions.push({ type: "encounter-choice", encounterId: definition.id, stageId: active.stageId, choiceId: choice.id });
    telemetry.events.push({
      type: "encounter-choice", encounterId: definition.id, stageId: active.stageId,
      choiceId: choice.id, distance: rounded(expedition.distance),
    });
    const result = EncounterManager.resolveChoice(expedition, player, choice.id, {
      failExpedition: fail,
      startCombat: (combatId) => startSimulationCombat(expedition, combatId, history, telemetry),
      skipPresentationDelay: true,
    });
    checkEncounterSurvival(expedition, fail);
    if (!result.resolved) fail(`Encounter choice ${definition.id}/${choice.id} could not resolve.`);
    return;
  }
  if (active.phase === "result") {
    history.outcome = active.resultText;
    history.outcomeMessages = [...active.outcomeMessages];
    completeEncounterHistory(history, expedition);
    telemetry.events.push({
      type: "encounter-result", encounterId: definition.id, outcome: active.resultText,
      resources: resourceSnapshot(expedition),
    });
    EncounterManager.continueJourney(expedition);
  }
}

function startSimulationCombat(expedition, combatId, encounterHistory, telemetry) {
  const combat = CombatSystem.create(expedition, combatId, { random: expedition.random });
  if (!combat) return false;
  expedition.combat = combat;
  encounterHistory.combatTriggered = true;
  const healthRatio = expedition.health / PLAYER_CHARACTER_DEFINITION.combat.maxHp;
  telemetry.events.push({
    type: "combat-start",
    combatId,
    enemies: combat.enemies.map((enemy) => enemy.definitionId),
    arthurHealth: expedition.health,
    arthurEnteredBelow50Percent: healthRatio < 0.5,
    arthurEnteredBelow25Percent: healthRatio < 0.25,
  });
  return true;
}

function resolveCombatInstantly(expedition, player, strategy, random, telemetry, fail, scenario) {
  const combat = expedition.combat;
  const history = {
    combatId: combat.id,
    enemies: combat.enemies.map((enemy) => ({ id: enemy.definitionId, name: enemy.name })),
    partyHealthBefore: combatHealth(combat),
    partyHealthAfter: null,
    result: null,
    fled: false,
    damageDealt: 0,
    damageReceived: 0,
    actions: 0,
    rounds: 0,
    actionEvents: [],
    abilityUsesById: {},
    itemUsesById: {},
    healingPerformed: 0,
    gaugeControl: 0,
    arthurHealthAtStart: combat.allies.find((ally) => ally.id === "arthur")?.hp ?? expedition.health,
    arthurEnteredBelow50Percent: expedition.health / PLAYER_CHARACTER_DEFINITION.combat.maxHp < 0.5,
    arthurEnteredBelow25Percent: expedition.health / PLAYER_CHARACTER_DEFINITION.combat.maxHp < 0.25,
    aggressiveEmergencyActions: [],
  };
  telemetry.combats.push(history);
  let combatSteps = 0;
  let recordedCombatEvents = 0;
  while (!combat.result && combatSteps < scenario.maxCombatSteps) {
    combatSteps += 1;
    if (combat.status === "awaitingAction") {
      const actor = [...combat.allies, ...combat.enemies].find((entry) => entry.id === combat.activeActorId);
      const before = combatTotals(combat);
      let emergency = null;
      let actionId = strategy.chooseCombatAction(combat, expedition, {
        random,
        recordEmergency(details) {
          emergency = deepClone(details);
        },
      }) ?? "attack";
      let result = CombatSystem.chooseAction(combat, expedition, actionId);
      let targetId = null;
      let abilityId = COMBAT_ABILITY_DEFINITIONS[actionId]?.category ? null : actionId;
      let itemId = null;
      if (result.menu === "abilities") {
        abilityId = strategy.chooseCombatAbility?.(combat, expedition, { random })
          ?? CombatSystem.availableAbilities(combat, expedition)[0]?.id;
        if (abilityId) {
          result = CombatSystem.chooseAbility(combat, expedition, abilityId);
        } else {
          CombatSystem.chooseAction(combat, expedition, "back");
          actionId = "attack";
          result = CombatSystem.chooseAction(combat, expedition, actionId);
        }
      } else if (result.menu === "items") {
        itemId = strategy.chooseCombatItem?.(combat, expedition, { random })
          ?? CombatSystem.availableItems(combat, expedition)[0]?.itemId;
        if (itemId) {
          result = CombatSystem.chooseItem(combat, expedition, itemId);
        } else {
          CombatSystem.chooseAction(combat, expedition, "back");
          actionId = "attack";
          result = CombatSystem.chooseAction(combat, expedition, actionId);
        }
      }
      if (result.needsTarget) {
        targetId = strategy.chooseCombatTarget(
          combat, expedition, { random }, result.targetType ?? "enemy",
        );
        result = CombatSystem.choosePendingTarget(combat, expedition, targetId);
      }
      const after = combatTotals(combat);
      history.damageDealt += Math.max(0, before.enemyHp - after.enemyHp);
      history.damageReceived += Math.max(0, before.allyHp - after.allyHp);
      history.actions += 1;
      if (emergency) history.aggressiveEmergencyActions.push(emergency);
      telemetry.decisions.push({
        type: "combat-action", combatId: combat.id, actorId: actor?.id, actionId, abilityId, itemId, targetId,
        aggressiveEmergencyTriggered: Boolean(emergency), emergency,
      });
      telemetry.events.push({
        type: "combat-action", combatId: combat.id, actor: actor?.id, action: actionId,
        abilityId, itemId, target: targetId,
        aggressiveEmergencyTriggered: Boolean(emergency), emergency,
      });
      recordedCombatEvents = flushCombatEvents(combat, recordedCombatEvents, history, telemetry);
      continue;
    }
    const living = [...combat.allies, ...combat.enemies].filter((entry) => entry.hp > 0);
    const secondsToReady = Math.min(...living.map((entry) => (
      (COMBAT_TUNING.actionGaugeMaximum - entry.gauge) / (entry.speed * COMBAT_TUNING.actionGaugeRate)
    )).filter((value) => value >= 0));
    const before = combatTotals(combat);
    CombatSystem.update(combat, expedition, Math.max(0.0001, secondsToReady));
    const after = combatTotals(combat);
    history.damageDealt += Math.max(0, before.enemyHp - after.enemyHp);
    history.damageReceived += Math.max(0, before.allyHp - after.allyHp);
    history.rounds += 1;
    recordedCombatEvents = flushCombatEvents(combat, recordedCombatEvents, history, telemetry);
  }
  if (!combat.result) {
    fail(`Combat ${combat.id} exceeded ${scenario.maxCombatSteps} steps.`);
    history.result = "incomplete";
    history.partyHealthAfter = combatHealth(combat);
    Object.assign(history, combatActionTelemetry(history));
    Object.assign(history, combatPartyDamageTelemetry(history, combat));
    expedition.combat = null;
    return;
  }
  history.result = combat.result;
  history.fled = combat.result === "fled";
  history.partyHealthAfter = combatHealth(combat);
  Object.assign(history, combatActionTelemetry(history));
  Object.assign(history, combatPartyDamageTelemetry(history, combat));
  telemetry.events.push({
    type: "combat-result", combatId: combat.id, result: combat.result,
    damageDealt: history.damageDealt, damageReceived: history.damageReceived,
    attacksReceivedByPartyMember: history.attacksReceivedByPartyMember,
    damageReceivedByPartyMember: history.damageReceivedByPartyMember,
  });
  expedition.combat = null;
  EncounterManager.completeCombat(expedition, player, combat.result, { failExpedition: fail });
}

function checkEncounterSurvival(expedition, fail) {
  if (expedition.status !== "active") return;
  if (expedition.health <= 0) fail("Arthur was too badly injured to continue the expedition.");
  else if (expedition.provisions <= 0) fail("The company exhausted its provisions during the encounter.");
}

function createTelemetry(scenario, expedition, strategy, turnaroundPolicy, replayStartingState) {
  const originalTargetDistance = turnaroundPolicy.name === "fixed-distance"
    ? turnaroundPolicy.configuration.distance : null;
  const encounterProvisionReserve = SimulationProvisionPlanning.encounterReserve(strategy.name);
  const departurePassiveFoodEstimate = originalTargetDistance === null ? null : rounded(
    SimulationProvisionPlanning.passiveRoundTripCost(
      originalTargetDistance, expedition.provisionConsumptionMultiplier,
    ),
  );
  const departureTotalEstimatedRequirement = departurePassiveFoodEstimate === null
    ? null : Math.ceil(departurePassiveFoodEstimate + encounterProvisionReserve);
  return {
    runId: `${scenario.scenarioId}:${scenario.seed}`,
    scenarioId: scenario.scenarioId,
    seed: String(scenario.seed),
    strategy: strategy.name,
    turnaroundPolicy: turnaroundPolicy.name,
    turnaroundConfiguration: turnaroundPolicy.configuration ?? {},
    companion: expedition.selectedCompanion,
    startingProvisions: expedition.committedProvisions,
    originalTargetDistance,
    departurePassiveFoodEstimate,
    encounterProvisionReserve,
    departureTotalEstimatedRequirement,
    emergencyProvisionTurnaround: false,
    emergencyProvisionTurnaroundDistance: null,
    emergencyReturnPassiveEstimate: null,
    emergencyReturnTotalRequirement: null,
    loadout: deepClone(expedition.selectedEquipment),
    packedItems: deepClone(expedition.carriedItems),
    itemsPackedById: deepClone(expedition.carriedItems),
    scenario: deepClone({
      ...scenario,
      strategy: strategy.name,
      turnaroundPolicy: { name: turnaroundPolicy.name, ...(turnaroundPolicy.configuration ?? {}) },
    }),
    replay: {
      version: 1,
      seed: String(scenario.seed),
      startingPlayerState: deepClone(replayStartingState),
      regionId: expedition.regionId,
      pathId: expedition.currentPathId,
      decisions: [],
    },
    decisions: [],
    events: [{
      type: "expedition-start",
      seed: String(scenario.seed),
      configuration: scenario.scenarioId,
      regionId: expedition.regionId,
      pathId: expedition.currentPathId,
      originalTargetDistance,
      departurePassiveFoodEstimate,
      encounterProvisionReserve,
      departureTotalEstimatedRequirement,
    }],
    encounters: [],
    combats: [],
    turnaroundDistance: null,
  };
}

function finalizeTelemetry(telemetry, scenario, expedition, player, startingStock, failureReason, steps, duration) {
  const returned = expedition.status === "returned";
  telemetry.encounters.filter((encounter) => !encounter.completed && encounter.before)
    .forEach((encounter) => {
      encounter.outcome = failureReason ?? "The expedition ended during this encounter.";
      completeEncounterHistory(encounter, expedition);
    });
  const lootDiscovered = combineItemEntries(
    telemetry.encounters.flatMap((encounter) => encounter.lootGained ?? []),
  );
  const returnRewardContents = returned
    ? deepClone(expedition.returnRewardContents ?? createRewardBucket())
    : createRewardBucket();
  const lootRecovered = returned
    ? combineItemEntries([...expedition.unsecuredLoot, ...returnRewardContents.items])
    : [];
  const materialsRecovered = returned
    ? mergeQuantityCollections(expedition.unsecuredMaterials, returnRewardContents.materials)
    : {};
  const attacksReceivedByPartyMember = aggregateRunPartyCombatField(
    telemetry, "attacksReceivedByPartyMember",
  );
  const damageReceivedByPartyMember = aggregateRunPartyCombatField(
    telemetry, "damageReceivedByPartyMember",
  );
  const abilityUsesById = aggregateRunCombatField(telemetry, "abilityUsesById");
  const itemUsesById = aggregateRunCombatField(telemetry, "itemUsesById");
  Object.assign(telemetry, {
    outcome: returned ? "returned" : "failed",
    success: returned,
    returnedSafely: returned,
    failureReason: returned ? null : failureReason,
    provisionExhaustionFailure: !returned && typeof failureReason === "string"
      && failureReason.toLowerCase().includes("exhausted its provisions"),
    completionReason: returned ? "Returned safely to the expedition origin." : failureReason,
    maximumDistance: rounded(expedition.maxDistanceReached),
    finalDistance: rounded(expedition.distance),
    finalArthurHealth: rounded(expedition.health),
    finalPartyHealth: {
      arthur: rounded(expedition.health),
      ...(expedition.selectedCompanion && expedition.companionCombatHp[expedition.selectedCompanion] === undefined
        ? { [expedition.selectedCompanion]: COMPANION_DEFINITIONS[expedition.selectedCompanion]?.combat?.maxHp ?? 0 }
        : {}),
      ...Object.fromEntries(Object.entries(expedition.companionCombatHp).map(([id, hp]) => [id, rounded(hp)])),
    },
    provisionsRemaining: rounded(expedition.provisions),
    provisionsConsumed: rounded(
      expedition.committedProvisions + (expedition.totalProvisionsGained ?? 0) - expedition.provisions,
    ),
    provisionsGained: rounded(expedition.totalProvisionsGained ?? 0),
    provisionsReturned: expedition.provisionsReturned ?? 0,
    endingProvisionStock: player.provisions,
    endingPlayerState: deepClone(player),
    startingProvisionStock: startingStock,
    goldGained: returned ? expedition.goldCarried + returnRewardContents.gold : 0,
    materialsRecovered,
    recipesLearned: returned
      ? [...new Set([...expedition.unsecuredRecipes, ...returnRewardContents.recipes])]
      : [],
    returnRewardTier: returned ? expedition.returnRewardTier : null,
    returnRewardResults: returned ? deepClone(expedition.returnRewardResults ?? []) : [],
    returnRewardContents,
    lootDebugLog: deepClone([
      ...(expedition.lootDebugLog ?? []),
      ...(expedition.returnRewardLog ?? []),
    ]),
    lootRecovered,
    lootDiscovered,
    lootLost: subtractItemEntries(lootDiscovered, lootRecovered),
    estimatedLootValue: estimateLootValue(lootRecovered),
    damageTaken: calculateRunDamageTaken(telemetry),
    attacksReceivedByPartyMember,
    damageReceivedByPartyMember,
    abilityUsesById,
    itemUsesById,
    itemsConsumedById: deepClone(expedition.consumedItems ?? {}),
    itemsReturnedById: deepClone(expedition.carriedItems ?? {}),
    bandagesPacked: telemetry.itemsPackedById?.bandages ?? 0,
    bandagesUsed: expedition.consumedItems?.bandages ?? 0,
    bandagesReturned: expedition.carriedItems?.bandages ?? 0,
    totalHealingPerformed: telemetry.combats.reduce(
      (sum, combat) => sum + (Number(combat.healingPerformed) || 0), 0,
    ),
    totalGaugeControl: telemetry.combats.reduce(
      (sum, combat) => sum + (Number(combat.gaugeControl) || 0), 0,
    ),
    arthurCombatAttacksReceived: attacksReceivedByPartyMember.arthur ?? 0,
    companionCombatAttacksReceived: sumPartyFieldExceptArthur(attacksReceivedByPartyMember),
    arthurCombatDamageReceived: damageReceivedByPartyMember.arthur ?? 0,
    companionCombatDamageReceived: sumPartyFieldExceptArthur(damageReceivedByPartyMember),
    aggressiveEmergencyActions: telemetry.combats.reduce(
      (sum, combat) => sum + combat.aggressiveEmergencyActions.length, 0,
    ),
    combatsStartedBelow50Percent: telemetry.combats.filter(
      (combat) => combat.arthurEnteredBelow50Percent,
    ).length,
    combatsStartedBelow25Percent: telemetry.combats.filter(
      (combat) => combat.arthurEnteredBelow25Percent,
    ).length,
    encounterCount: telemetry.encounters.length,
    combatCount: telemetry.combats.length,
    stepCount: steps,
    durationMs: rounded(duration, 3),
  });
  telemetry.bandageHealingPerformed = telemetry.combats.reduce(
    (sum, combat) => sum + (Number(combat.itemHealingById?.bandages) || 0), 0,
  );
  telemetry.encounters.forEach((encounter) => delete encounter.before);
  telemetry.replay.decisions = deepClone(telemetry.decisions);
  telemetry.events.push({
    type: "expedition-end", outcome: telemetry.outcome, maximumDistance: telemetry.maximumDistance,
    health: telemetry.finalPartyHealth, provisions: telemetry.provisionsRemaining,
  });
}

function completeEncounterHistory(history, expedition) {
  const after = resourceSnapshot(expedition);
  history.resourceChanges = diffObject(history.before.resources, after.resources);
  history.healthChanges = diffObject(history.before.health, after.health);
  history.lootGained = inventoryDelta(history.before.unsecuredLoot, after.unsecuredLoot, 1);
  history.lootLost = inventoryDelta(history.before.unsecuredLoot, after.unsecuredLoot, -1);
  history.packedItemsConsumed = inventoryDelta(history.before.carriedItems, after.carriedItems, -1);
  history.itemsGained = [...history.lootGained];
  history.itemsLost = combineItemEntries([...history.lootLost, ...history.packedItemsConsumed]);
  history.completed = true;
}

function resourceSnapshot(expedition) {
  const companionHealth = expedition.selectedCompanion
    ? expedition.companionCombatHp?.[expedition.selectedCompanion]
      ?? COMPANION_DEFINITIONS[expedition.selectedCompanion]?.combat?.maxHp
    : undefined;
  return {
    resources: { provisions: rounded(expedition.provisions), goldCarried: expedition.goldCarried },
    health: {
      arthur: expedition.health,
      ...(expedition.selectedCompanion ? { [expedition.selectedCompanion]: companionHealth } : {}),
    },
    carriedItems: { ...(expedition.carriedItems ?? {}) },
    unsecuredLoot: Object.fromEntries(
      expedition.unsecuredLoot.map((entry) => [entry.itemId, entry.quantity]),
    ),
  };
}

function replayPlayerSnapshot(player) {
  return deepClone({
    ownedItems: player.ownedItems,
    equippedItems: player.equippedItems,
    packedItems: player.packedItems,
    unlockedCompanions: player.unlockedCompanions,
    selectedCompanion: player.selectedCompanion,
    arthurHealth: HealingRules.arthurHealth(player),
    companionStates: player.companionStates ?? {},
    learnedKnowledge: player.learnedKnowledge,
    materials: player.materials,
    learnedRecipes: player.learnedRecipes,
    campaignFlags: player.campaignFlags ?? {},
    provisions: player.provisions,
    currentGold: player.currentGold,
    currentLocationId: player.currentLocationId,
  });
}

function combineItemEntries(entries) {
  const totals = {};
  entries.forEach(({ itemId, quantity }) => {
    totals[itemId] = (totals[itemId] ?? 0) + quantity;
  });
  return Object.entries(totals)
    .filter(([, quantity]) => quantity > 0)
    .map(([itemId, quantity]) => ({ itemId, quantity }));
}

function mergeQuantityCollections(...collections) {
  return Object.fromEntries(Object.entries(collections.reduce((totals, collection) => {
    Object.entries(collection ?? {}).forEach(([id, quantity]) => {
      totals[id] = (totals[id] ?? 0) + (Number(quantity) || 0);
    });
    return totals;
  }, {})).filter(([, quantity]) => quantity > 0));
}

function subtractItemEntries(discovered, recovered) {
  const remaining = Object.fromEntries(discovered.map((entry) => [entry.itemId, entry.quantity]));
  recovered.forEach((entry) => { remaining[entry.itemId] = (remaining[entry.itemId] ?? 0) - entry.quantity; });
  return Object.entries(remaining)
    .filter(([, quantity]) => quantity > 0)
    .map(([itemId, quantity]) => ({ itemId, quantity }));
}

function firstDifference(left, right, path = "$") {
  if (Object.is(left, right)) return null;
  if (typeof left !== typeof right || left === null || right === null) {
    return { path, first: left, second: right };
  }
  if (typeof left !== "object") return { path, first: left, second: right };
  if (Array.isArray(left) !== Array.isArray(right)) return { path, first: left, second: right };
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length || leftKeys.some((key, index) => key !== rightKeys[index])) {
    return { path, first: leftKeys, second: rightKeys };
  }
  for (const key of leftKeys) {
    const mismatch = firstDifference(left[key], right[key], `${path}.${key}`);
    if (mismatch) return mismatch;
  }
  return null;
}

function diffObject(before, after) {
  return Object.fromEntries([...new Set([...Object.keys(before), ...Object.keys(after)])]
    .map((key) => [key, rounded((after[key] ?? 0) - (before[key] ?? 0))])
    .filter(([, value]) => value !== 0));
}

function inventoryDelta(before, after, direction) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].map((itemId) => ({
    itemId, quantity: ((after[itemId] ?? 0) - (before[itemId] ?? 0)) * direction,
  })).filter((entry) => entry.quantity > 0);
}

function combatTotals(combat) {
  return {
    allyHp: combat.allies.reduce((sum, actor) => sum + actor.hp, 0),
    enemyHp: combat.enemies.reduce((sum, actor) => sum + actor.hp, 0),
  };
}

function combatHealth(combat) {
  return Object.fromEntries(combat.allies.map((actor) => [actor.id, actor.hp]));
}

function combatPartyDamageTelemetry(history, combat) {
  const partyIds = new Set(combat.allies.map((ally) => ally.id));
  const enemyIds = new Set(combat.enemies.map((enemy) => enemy.id));
  const attacks = {};
  const damage = {};
  history.actionEvents.filter((event) => enemyIds.has(event.actor) && partyIds.has(event.target))
    .forEach((event) => {
      attacks[event.target] = (attacks[event.target] ?? 0) + 1;
      damage[event.target] = (damage[event.target] ?? 0) + (Number(event.damage) || 0);
    });
  return {
    attacksReceivedByPartyMember: Object.fromEntries([...partyIds].map((id) => [id, attacks[id] ?? 0])),
    damageReceivedByPartyMember: Object.fromEntries([...partyIds].map((id) => [id, damage[id] ?? 0])),
  };
}

function combatActionTelemetry(history) {
  const abilityUsesById = {};
  const itemUsesById = {};
  const itemHealingById = {};
  let healingPerformed = 0;
  let gaugeControl = 0;
  history.actionEvents.forEach((event) => {
    if (event.action === "ability" && event.abilityId) {
      abilityUsesById[event.abilityId] = (abilityUsesById[event.abilityId] ?? 0) + 1;
      gaugeControl += Number(event.gaugeReduction) || 0;
    }
    if (event.action === "item" && event.itemId) {
      itemUsesById[event.itemId] = (itemUsesById[event.itemId] ?? 0) + 1;
      const healing = Number(event.healingAmount) || 0;
      itemHealingById[event.itemId] = (itemHealingById[event.itemId] ?? 0) + healing;
      healingPerformed += healing;
    }
  });
  return { abilityUsesById, itemUsesById, itemHealingById, healingPerformed, gaugeControl };
}

function aggregateRunPartyCombatField(telemetry, field) {
  const totals = {};
  telemetry.combats.forEach((combat) => Object.entries(combat[field] ?? {}).forEach(([id, value]) => {
    totals[id] = (totals[id] ?? 0) + (Number(value) || 0);
  }));
  return totals;
}

function aggregateRunCombatField(telemetry, field) {
  const totals = {};
  telemetry.combats.forEach((combat) => Object.entries(combat[field] ?? {}).forEach(([id, value]) => {
    totals[id] = (totals[id] ?? 0) + (Number(value) || 0);
  }));
  return totals;
}

function sumPartyFieldExceptArthur(values) {
  return Object.entries(values).reduce(
    (sum, [id, value]) => sum + (id === "arthur" ? 0 : Number(value) || 0), 0,
  );
}

function flushCombatEvents(combat, startIndex, history, telemetry) {
  combat.events.slice(startIndex).forEach((event) => {
    const recorded = { type: "combat-resolution", combatId: combat.id, ...event };
    history.actionEvents.push({ ...event });
    telemetry.events.push(recorded);
  });
  return combat.events.length;
}

function estimateLootValue(loot) {
  return loot.reduce((sum, entry) => {
    const value = Math.max(0, ...Object.values(SHOP_DEFINITIONS).map((shop) => shop.sellValues?.[entry.itemId] ?? 0));
    return sum + value * entry.quantity;
  }, 0);
}

function calculateRunDamageTaken(telemetry) {
  const combatDamage = telemetry.combats.reduce(
    (sum, combat) => sum + combat.actionEvents
      .filter((event) => event.target === "arthur")
      .reduce((combatSum, event) => combatSum + (Number(event.damage) || 0), 0),
    0,
  );
  const nonCombatDamage = telemetry.encounters
    .filter((encounter) => !encounter.combatTriggered)
    .reduce((sum, encounter) => sum + Math.max(0, -(encounter.healthChanges?.arthur ?? 0)), 0);
  return rounded(combatDamage + nonCombatDamage);
}

function summarizeRuns(results) {
  const total = results.length;
  const returned = results.filter((run) => run.returnedSafely).length;
  const values = (field) => results.map((run) => Number(run[field]) || 0);
  return {
    totalRuns: total,
    successRate: ratio(returned, total),
    returnRate: ratio(returned, total),
    deathOrFailureRate: ratio(total - returned, total),
    averageMaximumDistance: average(values("maximumDistance")),
    medianMaximumDistance: median(values("maximumDistance")),
    averageProvisionsConsumed: average(values("provisionsConsumed")),
    averageProvisionsRemaining: average(values("provisionsRemaining")),
    averageHealthRemaining: average(values("finalArthurHealth")),
    averageLootValue: average(values("estimatedLootValue")),
    averageGold: average(values("goldGained")),
    averageEncounterCount: average(values("encounterCount")),
    averageCombatCount: average(values("combatCount")),
    averageAggressiveEmergencyActions: average(values("aggressiveEmergencyActions")),
    averageCombatsStartedBelow50Percent: average(values("combatsStartedBelow50Percent")),
    averageCombatsStartedBelow25Percent: average(values("combatsStartedBelow25Percent")),
    averageArthurCombatDamageReceived: average(values("arthurCombatDamageReceived")),
    averageCompanionCombatDamageReceived: average(values("companionCombatDamageReceived")),
    averageHealingPerformed: average(values("totalHealingPerformed")),
    averageGaugeControl: average(values("totalGaugeControl")),
    emergencyProvisionTurnaroundRate: ratio(
      results.filter((run) => run.emergencyProvisionTurnaround).length, total,
    ),
    provisionExhaustionFailureRate: ratio(
      results.filter((run) => run.provisionExhaustionFailure).length, total,
    ),
    averageEncounterProvisionReserve: average(values("encounterProvisionReserve")),
    averageDepartureTotalEstimatedRequirement: average(values("departureTotalEstimatedRequirement")),
  };
}

function aggregateEncounters(results) {
  const stats = {};
  results.forEach((run) => run.encounters.forEach((encounter) => {
    const entry = stats[encounter.encounterId] ??= {
      encounterId: encounter.encounterId, name: encounter.name, timesSeen: 0,
      outboundCount: 0, returnCount: 0, totalDistance: 0, choices: {}, runIds: new Set(),
    };
    entry.timesSeen += 1;
    entry.runIds.add(run.runId);
    entry.totalDistance += encounter.distance;
    if (encounter.direction === "outbound") entry.outboundCount += 1;
    else entry.returnCount += 1;
    encounter.decisions.forEach((decision) => {
      entry.choices[decision.choiceId] = (entry.choices[decision.choiceId] ?? 0) + 1;
    });
  }));
  return Object.values(stats).map((entry) => ({
    encounterId: entry.encounterId,
    name: entry.name,
    timesSeen: entry.timesSeen,
    percentageOfRuns: ratio(entry.runIds.size, results.length),
    outboundCount: entry.outboundCount,
    returnCount: entry.returnCount,
    averageDistance: rounded(entry.totalDistance / entry.timesSeen),
    choiceDistribution: entry.choices,
  })).sort((left, right) => right.timesSeen - left.timesSeen);
}

function groupValues(results, field) {
  const groups = {};
  results.forEach((run) => {
    const value = field === "loadout" ? JSON.stringify(run.loadout) : run[field];
    const key = value === null || value === undefined ? "none" : String(value);
    (groups[key] ??= []).push(run);
  });
  return Object.entries(groups);
}

function average(values) {
  return values.length ? rounded(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return rounded(sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2);
}

function ratio(value, total) {
  return total ? rounded(value / total, 4) : 0;
}

function rounded(value, precision = 4) {
  const scale = 10 ** precision;
  return Math.round((Number(value) || 0) * scale) / scale;
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function csvCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
