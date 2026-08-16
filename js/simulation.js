"use strict";

const SimulationStrategies = Object.freeze({
  random: createStrategy("random", (choices, context) => context.random.pick(choices)),
  normal: createStrategy("normal", (choices, context) => context.random.pick(choices)),
  cautious: createStrategy("cautious", (choices) => highestScored(choices, cautiousChoiceScore)),
  aggressive: createStrategy("aggressive", (choices) => highestScored(choices, aggressiveChoiceScore)),
  greedy: createStrategy("greedy", (choices) => highestScored(choices, greedyChoiceScore)),
});

const SimulationTravelPolicy = Object.freeze({
  departureSettings(strategyName, context = {}) {
    const capacity = Math.max(1, Number(context.capacity) || 1);
    const provisions = Math.max(0, Number(context.provisions) || 0);
    if (strategyName === "cautious") {
      return {
        paceId: "cautious",
        rationId: provisions >= capacity * 0.65 || hasInjury(context.injuries, "exhaustion") ? "generous" : "normal",
      };
    }
    if (strategyName === "aggressive") {
      return {
        paceId: hasInjury(context.injuries, "sprained_ankle") ? "normal" : "hard_push",
        rationId: provisions <= capacity * 0.5 ? "sparse" : "normal",
      };
    }
    return { paceId: "normal", rationId: "normal" };
  },

  travelSettings(expedition, strategyName) {
    const settings = this.departureSettings(strategyName, {
      provisions: expedition?.provisions,
      capacity: expedition?.provisionCapacity,
      injuries: expedition?.injuries,
    });
    if (strategyName === "cautious") {
      const returnStatus = ExpeditionRules.returnProvisionStatus(expedition);
      settings.rationId = returnStatus.state === "safe" && expedition.provisions >= expedition.provisionCapacity * 0.65
        ? "generous" : "normal";
    }
    if (strategyName === "aggressive") {
      const returnStatus = ExpeditionRules.returnProvisionStatus(expedition);
      settings.rationId = returnStatus.state === "danger" || expedition.provisions <= expedition.provisionCapacity * 0.5
        ? "sparse" : "normal";
    }
    if (hasInjury(expedition?.injuries, "sprained_ankle") && settings.paceId === "hard_push") {
      settings.paceId = "normal";
    }
    if (hasInjury(expedition?.injuries, "exhaustion")
      && expedition?.provisions >= (expedition?.provisionCapacity ?? 0) * 0.5) {
      settings.rationId = "generous";
    }
    return settings;
  },

  chooseAction(expedition, strategyName, history) {
    if (!expedition || expedition.travelState !== "traveling" || expedition.activeEncounter || expedition.combat) {
      return "continue";
    }
    const thresholds = {
      cautious: { brief: 0.78, camp: 0.58 },
      aggressive: { brief: 0.35, camp: 0.18 },
      normal: { brief: 0.55, camp: 0.35 },
      random: { brief: 0.55, camp: 0.35 },
      greedy: { brief: 0.45, camp: 0.25 },
    }[strategyName] ?? { brief: 0.55, camp: 0.35 };
    const healthRatio = expeditionHealthRatio(expedition);
    const injured = ["arthur", ...selectedCompanionIds(expedition)]
      .flatMap((characterId) => InjuryRules.forCharacter(expedition, characterId));
    const enoughForCamp = expedition.provisions >= EXPEDITION_TUNING.campRest.provisionCost;
    const enoughForBriefRest = expedition.provisions >= EXPEDITION_TUNING.briefRest.provisionCost;
    const movedSinceRest = history.lastRestDistance === null
      || Math.abs(expedition.distance - history.lastRestDistance)
        >= (strategyName === "cautious" ? 10 : 5);
    const movedSinceCamp = history.lastCampDistance === null
      || Math.abs(expedition.distance - history.lastCampDistance) >= 8;
    const restBenefit = ExpeditionRules.briefRestBenefit(expedition);
    const injuryIds = injured.map((instance) => InjuryRules.idOf(instance));
    const injuryWarrantsCamp = injuryIds.includes("deep_cut") || injuryIds.includes("infection")
      || injuryIds.includes("poisoned") || injuryIds.includes("exhaustion");
    const injuryWarrantsRest = injuryIds.includes("bruised_ribs") || injuryIds.includes("sprained_ankle")
      || injuryWarrantsCamp || restBenefit.recoverableConditions.length > 0;
    const campIsMeaningful = healthRatio < 1
      || injuryWarrantsCamp
      || restBenefit.recoverableConditions.length > 0;
    const campSafe = optionalRestIsSafe(expedition, strategyName, EXPEDITION_TUNING.campRest.provisionCost);
    const briefSafe = optionalRestIsSafe(expedition, strategyName, EXPEDITION_TUNING.briefRest.provisionCost);
    if ((healthRatio <= thresholds.camp || (injuryWarrantsCamp && strategyName !== "aggressive"))
      && campIsMeaningful && enoughForCamp && campSafe && movedSinceCamp && expedition.distance > 0) {
      return "camp";
    }
    if ((healthRatio <= thresholds.brief || (injuryWarrantsRest && strategyName !== "aggressive"))
      && restBenefit.meaningful && enoughForBriefRest && briefSafe && movedSinceRest) {
      return "brief-rest";
    }
    return "continue";
  },

  chooseCookingRecipe(candidates, expedition, strategyName) {
    if (!candidates.length) return null;
    const returnRequirement = ExpeditionRules.estimateReturnProvisionCost(expedition);
    const healthRatio = expeditionHealthRatio(expedition);
    const threshold = ({ cautious: 0.8, aggressive: 0.35 }[strategyName] ?? 0.55);
    const needsFood = expedition.provisions <= returnRequirement + ({ cautious: 5, aggressive: 2 }[strategyName] ?? 3);
    if (!needsFood && healthRatio > threshold) return null;
    return candidates
      .map((candidate) => {
        const output = Number(candidate.recipe.output?.provisions) || 0;
        const ingredients = Object.values(candidate.recipe.ingredients ?? {})
          .reduce((sum, quantity) => sum + (Number(quantity) || 0), 0);
        const efficiency = output / Math.max(1, ingredients);
        const score = strategyName === "cautious"
          ? output * 2 + efficiency
          : strategyName === "aggressive"
            ? output * 1.5 + efficiency * 2
            : output + efficiency;
        return { ...candidate, score };
      })
      .sort((left, right) => right.score - left.score || left.recipe.id.localeCompare(right.recipe.id))[0];
  },
});

const SimulationProvisionPlanning = Object.freeze({
  encounterReserves: Object.freeze({ cautious: 4, random: 3, normal: 3, aggressive: 2, greedy: 3 }),

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
      expedition.distance, ExpeditionRules.provisionConsumptionMultiplier(expedition),
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
      expeditionId: normalized.expeditionId,
      provisions: Math.min(normalized.provisions, player.provisions),
      companion: normalized.companion,
      companions: normalized.companions,
      equipment: normalized.loadout,
      packedItems: normalized.packContents,
      packedMaterials: normalized.materialBagContents,
      random: random.random,
      health: normalized.startingHealth,
      regionId: normalized.regionId,
      pathId: normalized.pathId,
      paceId: normalized.paceId,
      rationId: normalized.rationId,
    });
    const strategy = resolveStrategy(normalized.strategy);
    const turnaroundPolicy = resolveTurnaroundPolicy(normalized.turnaroundPolicy);
    const telemetry = createTelemetry(
      normalized, expedition, strategy, turnaroundPolicy, replayStartingState,
    );
    const decisionHistory = createExpeditionDecisionHistory();
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
      if (expedition.travelState === "camped") {
        processCampedExpedition(
          expedition, player, strategy, telemetry, decisionHistory, random, fail,
        );
        continue;
      }
      applySimulationTravelSettings(expedition, strategy.name, telemetry, normalized);
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

      const expeditionAction = SimulationTravelPolicy.chooseAction(
        expedition, strategy.name, decisionHistory,
      );
      if (expeditionAction !== "continue") {
        applySimulationExpeditionAction(
          expedition, player, expeditionAction, telemetry, decisionHistory,
        );
        continue;
      }

      let travelDistance = normalized.travelStepDistance
        * (expedition.direction === "returning" ? EXPEDITION_TUNING.returnSpeedMultiplier : 1)
        * ExpeditionRules.paceDefinition(expedition.paceId).speedMultiplier
        * ExpeditionRules.travelSpeedMultiplier(expedition);
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
      companions: run.companions,
      paceSelectedAtDeparture: run.paceSelectedAtDeparture,
      rationSelectedAtDeparture: run.rationSelectedAtDeparture,
      paceChanges: run.paceChanges,
      rationChanges: run.rationChanges,
      injuriesAtDeparture: run.injuriesAtDeparture,
      injuriesGained: run.injuriesGained,
      injuriesTreated: run.injuriesTreated,
      injuriesNaturallyRecovered: run.injuriesNaturallyRecovered,
      naturalRecoveriesByType: run.naturalRecoveriesByType,
      infectionOccurrences: run.infectionOccurrences,
      deepCutsStabilized: run.deepCutsStabilized,
      averageRecoveryDistanceByType: run.averageRecoveryDistanceByType,
      injuryEvents: run.injuryEvents,
      activeInjuriesAtEnd: run.activeInjuriesAtEnd,
      returnedWhileInjured: run.returnedWhileInjured,
      exhaustionOccurrences: run.exhaustionOccurrences,
      distanceByPace: run.distanceByPace,
      distanceByRation: run.distanceByRation,
      briefRests: run.briefRests,
      campsEntered: run.campsEntered,
      campRests: run.campRests,
      campEvents: run.campEvents,
      recipesCooked: run.recipesCooked,
      ingredientsConsumedById: run.ingredientsConsumedById,
      startingMaterialBag: run.startingMaterialBag,
      materialBagCapacity: run.materialBagCapacity,
      materialBagAtEnd: run.materialBagAtEnd,
      materialsFoundDuringExpedition: run.materialsFoundDuringExpedition,
      materialsRejectedDueToCapacity: run.materialsRejectedDueToCapacity,
      materialsReturnedSafely: run.materialsReturnedSafely,
      unsecuredMaterialsLost: run.unsecuredMaterialsLost,
      briefRestCount: run.briefRestCount,
      campRestCount: run.campRestCount,
      campEventCount: run.campEventCount,
      cookingActionCount: run.cookingActionCount,
      cookingProvisionsGained: run.cookingProvisionsGained,
      banditAmbushEncounters: run.banditAmbushEncounters,
      banditAmbushVictories: run.banditAmbushVictories,
      banditLeaderEligibilityTriggered: run.banditLeaderEligibilityTriggered,
      banditLeaderEncounters: run.banditLeaderEncounters,
      banditLeaderVictories: run.banditLeaderVictories,
      banditGoldRecovered: run.banditGoldRecovered,
      banditLootValueRecovered: run.banditLootValueRecovered,
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
      statusesAppliedById: run.statusesAppliedById,
      statusDamageById: run.statusDamageById,
      equipmentPassiveTriggers: run.equipmentPassiveTriggers,
      resolveStored: run.resolveStored,
      resolveSpent: run.resolveSpent,
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
      "paceSelectedAtDeparture", "rationSelectedAtDeparture", "paceChanges", "rationChanges",
      "injuriesAtDeparture", "injuriesGained", "injuriesTreated", "injuriesNaturallyRecovered",
      "naturalRecoveriesByType", "infectionOccurrences", "deepCutsStabilized", "averageRecoveryDistanceByType",
      "activeInjuriesAtEnd", "returnedWhileInjured", "exhaustionOccurrences", "distanceByPace", "distanceByRation",
      "outcome", "failureReason", "provisionExhaustionFailure", "originalTargetDistance",
      "departurePassiveFoodEstimate", "encounterProvisionReserve", "departureTotalEstimatedRequirement",
      "emergencyProvisionTurnaround", "emergencyProvisionTurnaroundDistance", "turnaroundDistance",
      "maximumDistance", "finalDistance", "finalArthurHealth",
      "provisionsConsumed", "provisionsRemaining", "provisionsGained", "goldGained",
      "briefRestCount", "campRestCount", "campEventCount", "cookingActionCount", "cookingProvisionsGained",
      "banditAmbushEncounters", "banditAmbushVictories", "banditLeaderEligibilityTriggered",
      "banditLeaderEncounters", "banditLeaderVictories", "banditGoldRecovered", "banditLootValueRecovered",
      "campEvents", "recipesCooked", "ingredientsConsumedById",
      "startingMaterialBag", "materialBagCapacity", "materialBagAtEnd",
      "materialsFoundDuringExpedition", "materialsRejectedDueToCapacity",
      "materialsReturnedSafely", "unsecuredMaterialsLost",
      "estimatedLootValue", "encounterCount", "combatCount", "aggressiveEmergencyActions",
      "combatsStartedBelow50Percent", "combatsStartedBelow25Percent", "stepCount", "durationMs",
      "arthurCombatAttacksReceived", "companionCombatAttacksReceived",
      "arthurCombatDamageReceived", "companionCombatDamageReceived",
      "totalHealingPerformed", "totalGaugeControl", "abilityUsesById", "itemUsesById",
      "statusesAppliedById", "statusDamageById", "equipmentPassiveTriggers", "resolveStored", "resolveSpent",
      "itemsPackedById", "itemsConsumedById", "itemsReturnedById", "bandagesPacked", "bandagesUsed",
      "bandagesReturned", "bandageHealingPerformed",
    ];
    return [fields.join(","), ...results.map((run) => fields.map((field) => csvCell(run[field])).join(","))].join("\n");
  },
});

function createStrategy(name, chooseEncounter) {
  return Object.freeze({
    name,
    chooseEncounter(choices, context) {
      const authoredChoice = authoredStrategyChoice(name, choices, context);
      return authoredChoice ?? chooseEncounter(choices, context);
    },
    chooseDialogue(choices, context) {
      if (name === "random" || name === "normal") return context.random.pick(choices);
      return choices[0];
    },
    chooseCombatAction(combat, expedition, context) {
      const actions = CombatSystem.availableActions(combat, expedition);
      const maxHealth = PLAYER_CHARACTER_DEFINITION.combat.maxHp;
      if (name === "cautious" && expedition.health < maxHealth * 0.3 && actions.includes("flee")) return "flee";
      if (name === "random" || name === "normal") return context.random.pick(actions);
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
      if (name === "random" || name === "normal") return context.random.pick(abilities)?.id;
      return abilities.find((ability) => ability.id === "pommel_strike")?.id
        ?? abilities.find((ability) => ability.id === "intercede")?.id
        ?? abilities[0]?.id;
    },
    chooseCombatItem(combat, _expedition, context) {
      const items = CombatSystem.availableItems(combat, _expedition);
      if (name === "random" || name === "normal") return context.random.pick(items)?.itemId;
      return items.find((entry) => entry.itemId === "bandages")?.itemId ?? items[0]?.itemId;
    },
    chooseCombatTarget(combat, _expedition, context, targetType = "enemy") {
      const targets = targetType === "ally"
        ? combat.allies.filter((ally) => ally.hp > 0 && ally.hp < ally.maxHp)
        : combat.enemies.filter((enemy) => enemy.hp > 0);
      if (name === "random" || name === "normal") return context.random.pick(targets)?.id;
      return targets.sort((left, right) => (left.hp / left.maxHp) - (right.hp / right.maxHp))[0]?.id;
    },
  });
}

function authoredStrategyChoice(strategyName, choices, context = {}) {
  if (strategyName === "random" || strategyName === "normal") return null;
  const encounterId = context.encounter?.id;
  const choiceById = (id) => choices.find((choice) => choice.id === id);
  if (encounterId === "hidden_flask") {
    return choiceById("recover_flask") ?? choiceById("leave_flask") ?? null;
  }
  if (encounterId === "barenton_fountain_ritual") {
    const priorities = context.stageId === "aftermath"
      ? ["face_fountain_knight", "withdraw_from_trial"]
      : context.stageId === "storm"
        ? (strategyName === "cautious"
          ? ["shelter_with_cloak", "wait_out_storm", "hold_to_stone"]
          : ["hold_to_stone", "shelter_with_cloak", "wait_out_storm"])
        : context.stageId === "ritual"
          ? ["pour_on_perron", "use_basin_water", "step_away"]
          : ["fill_flask", "study_perron", "leave_fountain"];
    return priorities.map(choiceById).find(Boolean) ?? null;
  }
  if (encounterId === "summoned_guardian") {
    if (strategyName === "aggressive") return choiceById("fight_guardian") ?? null;
    if (strategyName === "cautious" && Number(context.expedition?.health) >= PLAYER_CHARACTER_DEFINITION.combat.maxHp * 0.45) {
      return choiceById("fight_guardian") ?? null;
    }
  }
  if (encounterId === "val_false_knight" && strategyName === "cautious") {
    return choiceById("question_false_knight") ?? choiceById("leave_false_knight") ?? null;
  }
  if (encounterId === "val_morgans_offer") {
    return choiceById("refuse_morgans_offer") ?? choiceById("ask_what_it_costs") ?? null;
  }
  return null;
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
  const startsCombat = (choice.outcomes ?? []).some((outcome) => outcome.type === "startCombat");
  return (startsCombat ? 50 : 0)
    + (/fight|combat|attack|stand_ground|confront|force|cross|push/.test(text) ? 20 : 0)
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
  const startingState = scenario.startingState ?? {};
  const requestedCompanions = scenario.companions !== undefined
    ? scenario.companions
    : scenario.companion !== undefined
      ? scenario.companion
      : startingState.selectedCompanions !== undefined
        ? startingState.selectedCompanions
        : startingState.selectedCompanion !== undefined
          ? startingState.selectedCompanion
          : selectedCompanionIds(defaultPlayer);
  const companions = [...new Set((Array.isArray(requestedCompanions)
    ? requestedCompanions : [requestedCompanions]).filter((companionId) => COMPANION_DEFINITIONS[companionId]))].slice(0, 2);
  const companion = scenario.companion !== undefined ? scenario.companion : companions[0] ?? null;
  const capacity = ExpeditionRules.partyProvisionCapacity(companions);
  const requestedExpeditionId = scenario.expeditionId ?? startingState.selectedExpeditionId;
  const expeditionId = EXPEDITION_DEFINITIONS[requestedExpeditionId]
    ? requestedExpeditionId : "old_forest_road";
  const expeditionDefinition = ExpeditionCatalog.get(expeditionId);
  const turnaroundPolicy = scenario.turnaroundPolicy ?? { type: "fixedDistance", distance: 50 };
  const strategy = scenario.strategy ?? "cautious";
  const provisions = Math.max(1, Math.min(Number(scenario.provisions) || Math.min(24, capacity), capacity));
  const defaultTravelSettings = SimulationTravelPolicy.departureSettings(strategy, {
    provisions,
    capacity,
    injuries: startingState.injuries ?? defaultPlayer.injuries,
  });
  return {
    id: scenario.id ?? scenario.scenarioId ?? "default",
    scenarioId: scenario.scenarioId ?? scenario.id ?? "default",
    seed: scenario.seed ?? "grail-simulation",
    expeditionId,
    companion,
    companions,
    provisions,
    loadout: { ...defaultPlayer.equippedItems, ...(scenario.loadout?.equipment ?? scenario.loadout ?? {}) },
    packContents: scenario.packContents ?? defaultPlayer.packedItems,
    materialBagContents: scenario.materialBagContents
      ?? scenario.packedMaterials
      ?? (scenario.packContents !== undefined
        ? (Array.isArray(scenario.packContents)
          ? scenario.packContents
          : Object.fromEntries(Object.entries(scenario.packContents ?? {})
            .filter(([itemId]) => MaterialRules.isMaterialId(itemId))))
        : defaultPlayer.packedMaterials),
    strategy,
    turnaroundPolicy,
    startingState: scenario.startingState ?? {},
    regionId: scenario.regionId ?? "broceliande",
    pathId: scenario.pathId ?? expeditionDefinition.pathId,
    paceId: EXPEDITION_TUNING.travelPaces[scenario.paceId]
      ? scenario.paceId : defaultTravelSettings.paceId,
    rationId: EXPEDITION_TUNING.rationLevels[scenario.rationId]
      ? scenario.rationId : defaultTravelSettings.rationId,
    lockTravelSettings: scenario.lockTravelSettings
      ?? (scenario.paceId !== undefined || scenario.rationId !== undefined),
    startingHealth: Number.isFinite(scenario.startingState?.health)
      ? scenario.startingState.health
      : Number.isFinite(scenario.startingState?.arthurHealth)
        ? scenario.startingState.arthurHealth
        : PLAYER_CHARACTER_DEFINITION.combat.maxHp,
    maxSimulationSteps: Math.max(100, Math.floor(Number(scenario.maxSimulationSteps) || 10000)),
    maxCombatSteps: Math.max(50, Math.floor(Number(scenario.maxCombatSteps) || 2000)),
    travelStepDistance: Math.max(0.1, Number(scenario.travelStepDistance) || 1),
    startingStateIsAuthoritative: Boolean(scenario.startingStateIsAuthoritative),
  };
}

function createSimulationPlayer(scenario) {
  const defaults = SaveSystem.createDefaultPlayerState();
  const authoritativeState = Boolean(scenario.startingStateIsAuthoritative);
  const player = deepClone({ ...defaults, ...scenario.startingState });
  player.ownedItems = authoritativeState
    ? { ...(scenario.startingState.ownedItems ?? {}) }
    : { ...defaults.ownedItems, ...(scenario.startingState.ownedItems ?? {}) };
  player.injuries = InjuryRules.snapshot({ injuries: scenario.startingState.injuries ?? defaults.injuries });
  player.materials = authoritativeState
    ? { ...(scenario.startingState.materials ?? {}) }
    : { ...defaults.materials, ...(scenario.startingState.materials ?? {}) };
  player.packedMaterials = authoritativeState
    ? { ...(scenario.startingState.packedMaterials ?? {}) }
    : { ...defaults.packedMaterials, ...(scenario.startingState.packedMaterials ?? {}) };
  Object.entries(scenario.startingState.ownedItems ?? {}).forEach(([itemId, quantity]) => {
    if (MaterialRules.isMaterialId(itemId) && scenario.startingState.materials?.[itemId] === undefined) {
      player.materials[itemId] = Math.max(0, Number(quantity) || 0);
    }
  });
  MaterialRules.migratePlayerMaterials(player);
  player.equippedItems = { ...scenario.loadout };
  const packedEntries = Array.isArray(scenario.packContents)
    ? scenario.packContents.map((itemId) => [itemId, player.ownedItems[itemId] ?? 1])
    : Object.entries(scenario.packContents ?? {});
  packedEntries.forEach(([itemId, quantity]) => {
    if (MaterialRules.isMaterialId(itemId)) return;
    player.ownedItems[itemId] = Math.max(
      Number(player.ownedItems[itemId]) || 0,
      Math.max(1, Number(quantity) || 1),
    );
  });
  Object.values(player.equippedItems).filter(Boolean).forEach((itemId) => { player.ownedItems[itemId] ??= 1; });
  player.packedItems = packedEntries
    .map(([itemId]) => itemId)
    .filter((itemId) => !MaterialRules.isMaterialId(itemId))
    .slice(0, EXPEDITION_TUNING.packSlots);
  player.packedMaterials = MaterialRules.selectionFromRequest(
    scenario.materialBagContents,
    player.materials,
  );
  player.selectedCompanions = [...scenario.companions];
  player.selectedCompanion = scenario.companions[0] ?? null;
  player.selectedExpeditionId = scenario.expeditionId;
  player.unlockedCompanions = [...new Set([
    ...player.unlockedCompanions,
    ...scenario.companions,
  ])];
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

function createExpeditionDecisionHistory() {
  return {
    lastRestDistance: null,
    lastCampDistance: null,
    preparedCampCycles: new Set(),
  };
}

function expeditionHealthRatio(expedition) {
  const partyRatios = [
    expedition.health / InjuryRules.effectiveMaxHealth(expedition, "arthur"),
    ...Object.entries(expedition.companionCombatHp ?? {}).map(([companionId, health]) => (
      health / InjuryRules.effectiveMaxHealth(expedition, companionId)
    )),
  ];
  return Math.min(...partyRatios.filter(Number.isFinite));
}

function hasInjury(injuries, injuryId) {
  return Object.values(injuries ?? {}).some((entries) => (
    (entries ?? []).some((entry) => InjuryRules.idOf(entry) === injuryId)
  ));
}

function optionalRestIsSafe(expedition, strategyName, cost) {
  const requiredReturn = ExpeditionRules.estimateReturnProvisionCost(expedition);
  const reserve = SimulationProvisionPlanning.encounterReserve(strategyName)
    + (EXPEDITION_TUNING.optionalRestProvisionReserve[strategyName]
      ?? EXPEDITION_TUNING.optionalRestProvisionReserve.normal);
  return expedition.provisions - cost >= requiredReturn + reserve;
}

function applySimulationTravelSettings(expedition, strategyName, telemetry, scenario = {}) {
  const settings = SimulationTravelPolicy.travelSettings(expedition, strategyName);
  if (scenario.lockTravelSettings) {
    settings.paceId = expedition.paceId;
    settings.rationId = expedition.rationId;
  }
  if (settings.paceId !== expedition.paceId) {
    const change = {
      type: "pace-change",
      from: expedition.paceId,
      to: settings.paceId,
      distance: rounded(expedition.distance),
      direction: expedition.direction,
    };
    ExpeditionRules.setPace(expedition, settings.paceId);
    telemetry.paceChanges.push({ ...change });
    telemetry.decisions.push(change);
    telemetry.events.push({ ...change });
  }
  if (settings.rationId !== expedition.rationId) {
    const change = {
      type: "ration-change",
      from: expedition.rationId,
      to: settings.rationId,
      distance: rounded(expedition.distance),
      direction: expedition.direction,
    };
    ExpeditionRules.setRation(expedition, settings.rationId);
    telemetry.rationChanges.push({ ...change });
    telemetry.decisions.push(change);
    telemetry.events.push({ ...change });
  }
}

function applySimulationExpeditionAction(
  expedition, player, action, telemetry, decisionHistory,
) {
  const decision = {
    type: "expedition-action",
    action,
    distance: rounded(expedition.distance),
    direction: expedition.direction,
    health: rounded(expedition.health),
    provisions: rounded(expedition.provisions),
  };
  telemetry.decisions.push(decision);
  telemetry.events.push({ ...decision });
  if (!ExpeditionRules.pause(expedition)) return;

  if (action === "brief-rest") {
    const before = resourceSnapshot(expedition);
    const result = ExpeditionRules.briefRest(expedition);
    const after = resourceSnapshot(expedition);
    const rest = simulationRestTelemetry("brief", result, before, after, expedition);
    telemetry.briefRests.push(rest);
    telemetry.events.push({ type: "brief-rest", ...rest });
    if (result.applied) decisionHistory.lastRestDistance = expedition.distance;
    ExpeditionRules.resume(expedition);
    return;
  }

  if (action === "camp" && ExpeditionRules.enterCamp(expedition)) {
    decisionHistory.lastCampDistance = expedition.distance;
    telemetry.campsEntered += 1;
    telemetry.events.push({
      type: "camp-entered",
      distance: rounded(expedition.distance),
      direction: expedition.direction,
      campCycle: expedition.campCycle,
    });
  } else {
    ExpeditionRules.resume(expedition);
  }
}

function processCampedExpedition(
  expedition, player, strategy, telemetry, decisionHistory, _random, fail,
) {
  if (!decisionHistory.preparedCampCycles.has(expedition.campCycle)) {
    decisionHistory.preparedCampCycles.add(expedition.campCycle);
    cookAtCamp(expedition, player, strategy.name, telemetry);
    const before = resourceSnapshot(expedition);
    const result = ExpeditionRules.restAtCamp(expedition, player);
    const after = resourceSnapshot(expedition);
    const rest = simulationRestTelemetry("camp", result, before, after, expedition);
    telemetry.campRests.push(rest);
    telemetry.events.push({ type: "camp-rest", ...rest });
    if (result.eventId) {
      telemetry.events.push({
        type: "camp-event-start",
        eventId: result.eventId,
        distance: rounded(expedition.distance),
        campCycle: expedition.campCycle,
      });
    }
    if (!result.applied && expedition.provisions < EXPEDITION_TUNING.campRest.provisionCost) {
      telemetry.decisions.push({
        type: "camp-rest-skipped",
        reason: result.reason,
        distance: rounded(expedition.distance),
      });
    }
  }
  if (expedition.activeEncounter) return;
  if (ExpeditionRules.leaveCamp(expedition)) {
    ExpeditionRules.resume(expedition);
    telemetry.decisions.push({
      type: "leave-camp",
      distance: rounded(expedition.distance),
      direction: expedition.direction,
    });
    telemetry.events.push({
      type: "leave-camp",
      distance: rounded(expedition.distance),
      direction: expedition.direction,
    });
  } else if (expedition.status === "active") {
    fail("The simulation could not leave camp.");
  }
}

function cookAtCamp(expedition, player, strategyName, telemetry) {
  const candidates = CraftingRules.knownRecipesForProvider(player, "campfire")
    .map((recipe) => ({
      recipe,
      quote: CraftingRules.quote(player, recipe.id, "campfire", { expedition, context: "camp" }),
    }))
    .filter((candidate) => candidate.quote.available && Number(candidate.recipe.output?.provisions) > 0);
  const candidate = SimulationTravelPolicy.chooseCookingRecipe(candidates, expedition, strategyName);
  if (!candidate) return null;
  const before = resourceSnapshot(expedition);
  const result = CraftingRules.craft(player, candidate.recipe.id, "campfire", { expedition, context: "camp" });
  if (!result.applied) return null;
  const after = resourceSnapshot(expedition);
  const ingredientsConsumed = mergeQuantityCollections(
    result.materialBagConsumed ?? result.materialsConsumed,
    result.itemsConsumed,
  );
  const cooked = {
    recipeId: result.recipeId,
    context: "camp",
    provisionsBefore: before.resources.provisions,
    provisionsAfter: after.resources.provisions,
    provisionsGained: rounded(after.resources.provisions - before.resources.provisions),
    ingredientsConsumed: deepClone(ingredientsConsumed),
    materialBagBefore: deepClone(before.materialBag),
    materialBagAfter: deepClone(after.materialBag),
    outputsGained: { provisions: result.provisions ?? 0 },
    goldCost: result.goldCost ?? 0,
    distance: rounded(expedition.distance),
  };
  telemetry.recipesCooked.push(cooked);
  Object.entries(cooked.ingredientsConsumed).forEach(([itemId, quantity]) => {
    telemetry.ingredientsConsumedById[itemId] = (telemetry.ingredientsConsumedById[itemId] ?? 0) + quantity;
  });
  telemetry.decisions.push({ type: "cook-recipe", ...cooked });
  telemetry.events.push({ type: "recipe-cooked", ...cooked });
  return cooked;
}

function simulationRestTelemetry(kind, result, before, after, expedition) {
  return {
    kind,
    attempted: true,
    applied: Boolean(result.applied),
    reason: result.reason ?? null,
    cost: result.cost ?? 0,
    eventId: result.eventId ?? null,
    healthBefore: deepClone(before.health),
    healthAfter: deepClone(after.health),
    healthChanges: diffObject(before.health, after.health),
    provisionsBefore: before.resources.provisions,
    provisionsAfter: after.resources.provisions,
    provisionsChange: rounded(after.resources.provisions - before.resources.provisions),
    healingByPartyMember: deepClone(result.healingByPartyMember ?? {}),
    injuriesTreated: deepClone(result.injuriesTreated ?? []),
    recoveryAccelerated: deepClone(result.recoveryAccelerated ?? []),
    restHealingMultiplier: InjuryRules.restHealingMultiplier(expedition),
    distance: rounded(expedition.distance),
  };
}

function resolveEncounterInstantly(expedition, player, strategy, random, telemetry, fail) {
  const active = expedition.activeEncounter;
  const definition = EncounterManager.definitionFor(expedition, active);
  let history = telemetry.encounters.at(-1);
  if (!history || history.completed || history.encounterId !== active.encounterId) {
    history = {
      encounterId: definition.id,
      name: definition.title,
      eventKind: active.eventKind ?? "travel",
      campEventId: active.eventKind === "camp" ? definition.id : null,
      distance: rounded(expedition.distance),
      direction: expedition.direction,
      pathId: expedition.currentPathId,
      availableChoices: [],
      decisions: [],
      resourceChanges: {},
      healthChanges: {},
      itemsGained: [],
      itemsLost: [],
      materialBagChanges: {},
      combatTriggered: false,
      outcome: null,
      completed: false,
      before: resourceSnapshot(expedition),
    };
    telemetry.encounters.push(history);
    if (definition.id === "bandit_ambush") telemetry.banditAmbushEncounters += 1;
    if (definition.id === "bandit_leader") telemetry.banditLeaderEncounters += 1;
  }
  if (active.phase === "dialogue") {
    resolveDialogueInstantly(expedition, player, strategy, random, telemetry, history, fail);
    return;
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
    const choice = strategy.chooseEncounter(choices, {
      expedition, player, encounter: definition, stage, stageId: active.stageId, random,
    })
      ?? choices[0];
    history.availableChoices.push({ stageId: active.stageId, choiceIds: choices.map((entry) => entry.id) });
    history.decisions.push({ stageId: active.stageId, choiceId: choice.id, label: choice.label });
    const choiceDecision = {
      type: active.eventKind === "camp" ? "camp-event-choice" : "encounter-choice",
      encounterId: definition.id,
      ...(active.eventKind === "camp" ? { eventId: definition.id } : {}),
      stageId: active.stageId,
      choiceId: choice.id,
    };
    telemetry.decisions.push(choiceDecision);
    if (active.eventKind === "camp") {
      const campEvent = telemetry.campEvents.find((entry) => (
        entry.eventId === definition.id && !entry.completed
      )) ?? {
        eventId: definition.id,
        distance: rounded(expedition.distance),
        campCycle: expedition.campCycle,
        choices: [],
        completed: false,
      };
      if (!telemetry.campEvents.includes(campEvent)) telemetry.campEvents.push(campEvent);
      campEvent.choices.push({ stageId: active.stageId, choiceId: choice.id });
    }
    telemetry.events.push({
      type: choiceDecision.type, encounterId: definition.id, stageId: active.stageId,
      ...(active.eventKind === "camp" ? { eventId: definition.id } : {}),
      choiceId: choice.id, distance: rounded(expedition.distance),
    });
    const result = EncounterManager.resolveChoice(expedition, player, choice.id, {
      failExpedition: fail,
      startCombat: (combatId) => startSimulationCombat(expedition, combatId, history, telemetry),
      startDialogue: () => true,
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
    if (active.eventKind === "camp") {
      const campEvent = telemetry.campEvents.find((entry) => (
        entry.eventId === definition.id && !entry.completed
      ));
      if (campEvent) {
        campEvent.result = active.resultText;
        campEvent.completed = true;
      }
    }
    telemetry.events.push({
      type: active.eventKind === "camp" ? "camp-event-result" : "encounter-result",
      encounterId: definition.id,
      ...(active.eventKind === "camp" ? { eventId: definition.id } : {}),
      outcome: active.resultText,
      resources: resourceSnapshot(expedition),
    });
    EncounterManager.continueJourney(expedition);
  }
}

function resolveDialogueInstantly(expedition, player, strategy, random, telemetry, history, fail) {
  const active = expedition.activeEncounter;
  const dialogueId = active.dialogueResolution?.dialogueId;
  const session = DialogueSystem.start(dialogueId, { player, expedition });
  const dialogueHistory = {
    dialogueId,
    encounterId: active.encounterId,
    eventKind: active.eventKind ?? "travel",
    nodes: [],
    choices: [],
    completed: false,
  };
  telemetry.dialogues ??= [];
  telemetry.dialogues.push(dialogueHistory);
  if (!session) {
    fail(`Dialogue ${dialogueId} could not start.`);
    return;
  }
  telemetry.events.push({
    type: "dialogue-start",
    dialogueId,
    encounterId: active.encounterId,
    distance: rounded(expedition.distance),
  });

  let current = session;
  let steps = 0;
  let finalResult = null;
  while (current && steps < 100) {
    steps += 1;
    const node = DialogueSystem.currentNode(current);
    if (!node) break;
    dialogueHistory.nodes.push({ nodeId: current.nodeId, speakerId: node.speakerId });
    const context = { player, expedition };
    const choices = DialogueSystem.availableChoices(current, context);
    let result;
    if (choices.length > 0) {
      const choice = strategy.chooseDialogue?.(choices, {
        player, expedition, dialogue: DialogueSystem.sequence(current),
        node, nodeId: current.nodeId, random,
      }) ?? choices[0];
      dialogueHistory.choices.push({ nodeId: current.nodeId, choiceId: choice.id });
      const decision = {
        type: "dialogue-choice",
        dialogueId,
        nodeId: current.nodeId,
        choiceId: choice.id,
      };
      telemetry.decisions.push(decision);
      telemetry.events.push({ ...decision, distance: rounded(expedition.distance) });
      result = DialogueSystem.choose(current, choice.id, context);
    } else {
      result = DialogueSystem.advance(current, context);
    }
    if (!result.session && !result.ended) break;
    finalResult = result;
    current = result.session;
  }

  if (!finalResult?.ended) {
    fail(`Dialogue ${dialogueId} exceeded its safe step limit.`);
    return;
  }
  dialogueHistory.completed = true;
  telemetry.events.push({
    type: "dialogue-complete",
    dialogueId,
    encounterId: active.encounterId,
    distance: rounded(expedition.distance),
  });
  const completed = EncounterManager.completeDialogue(
    expedition,
    player,
    finalResult,
    {
      failExpedition: fail,
      startCombat: (combatId) => startSimulationCombat(expedition, combatId, history, telemetry),
      startDialogue: () => true,
    },
  );
  if (!completed.resolved) fail(`Dialogue ${dialogueId} could not resume its parent flow.`);
  checkEncounterSurvival(expedition, fail);
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
      if (result.unavailable) {
        actionId = "attack";
        result = CombatSystem.chooseAction(combat, expedition, actionId);
      }
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
  const encounterId = expedition.activeEncounter?.encounterId;
  if (combat.result === "victory" && encounterId === "bandit_ambush") {
    telemetry.banditAmbushVictories += 1;
    telemetry.banditLeaderEligibilityTriggered += 1;
  }
  if (combat.result === "victory" && encounterId === "bandit_leader") {
    telemetry.banditLeaderVictories += 1;
  }
  EncounterManager.completeCombat(expedition, player, combat.result, {
    failExpedition: fail,
    startDialogue: () => true,
  });
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
      originalTargetDistance, ExpeditionRules.provisionConsumptionMultiplier(expedition),
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
    companions: expedition.selectedCompanions,
    paceSelectedAtDeparture: expedition.paceId,
    rationSelectedAtDeparture: expedition.rationId,
    paceChanges: [],
    rationChanges: [],
    injuriesAtDeparture: deepClone(expedition.injuries),
    injuryEvents: [],
    injuriesTreated: [],
    briefRests: [],
    campsEntered: 0,
    campRests: [],
    campEvents: [],
    dialogues: [],
    recipesCooked: [],
    ingredientsConsumedById: {},
    banditAmbushEncounters: 0,
    banditAmbushVictories: 0,
    banditLeaderEligibilityTriggered: 0,
    banditLeaderEncounters: 0,
    banditLeaderVictories: 0,
    banditGoldRecovered: 0,
    banditLootValueRecovered: 0,
    startingMaterialBag: deepClone({
      capacity: MaterialRules.capacity(),
      contents: MaterialRules.expeditionContents(expedition),
    }),
    materialBagCapacity: MaterialRules.capacity(),
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
      expeditionId: expedition.expeditionId,
      regionId: expedition.regionId,
      pathId: expedition.currentPathId,
      companions: deepClone(expedition.selectedCompanions),
      paceId: expedition.paceId,
      rationId: expedition.rationId,
      startingProvisions: expedition.committedProvisions,
      loadout: deepClone(expedition.selectedEquipment),
      packedItems: deepClone(expedition.carriedItems),
      packedMaterials: deepClone(expedition.materialBag?.secured ?? {}),
      turnaroundPolicy: {
        name: turnaroundPolicy.name,
        configuration: deepClone(turnaroundPolicy.configuration ?? {}),
      },
      travelStepDistance: scenario.travelStepDistance,
      injuries: deepClone(expedition.injuries),
      decisions: [],
    },
    decisions: [],
    events: [{
      type: "expedition-start",
      seed: String(scenario.seed),
      configuration: scenario.scenarioId,
      regionId: expedition.regionId,
      pathId: expedition.currentPathId,
      paceId: expedition.paceId,
      rationId: expedition.rationId,
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
    ? mergeQuantityCollections(expedition.materialsReturned, returnRewardContents.materials)
    : {};
  const attacksReceivedByPartyMember = aggregateRunPartyCombatField(
    telemetry, "attacksReceivedByPartyMember",
  );
  const damageReceivedByPartyMember = aggregateRunPartyCombatField(
    telemetry, "damageReceivedByPartyMember",
  );
  const abilityUsesById = aggregateRunCombatField(telemetry, "abilityUsesById");
  const itemUsesById = aggregateRunCombatField(telemetry, "itemUsesById");
  const statusesAppliedById = aggregateRunCombatField(telemetry, "statusesAppliedById");
  const statusDamageById = aggregateRunCombatField(telemetry, "statusDamageById");
  const equipmentPassiveTriggers = telemetry.combats.flatMap(
    (combat) => combat.equipmentPassiveTriggers ?? [],
  );
  const resolveStored = telemetry.combats.reduce(
    (sum, combat) => sum + (Number(combat.resolveStored) || 0), 0,
  );
  const resolveSpent = telemetry.combats.reduce(
    (sum, combat) => sum + (Number(combat.resolveSpent) || 0), 0,
  );
  const injuryEvents = expedition.injuryEvents ?? [];
  const naturalRecoveryEvents = injuryEvents.filter((event) => (
    event.type === "injury-recovered" && event.recoveryType === "natural"
  ));
  const naturalRecoveriesByType = naturalRecoveryEvents.reduce((counts, event) => {
    counts[event.injuryId] = (counts[event.injuryId] ?? 0) + 1;
    return counts;
  }, {});
  const recoveryDistanceTotals = injuryEvents
    .filter((event) => event.type === "injury-gained" && Number(event.originalRecoveryDistance) > 0)
    .reduce((totalsByType, event) => {
      const current = totalsByType[event.injuryId] ?? { total: 0, count: 0 };
      current.total += Number(event.originalRecoveryDistance) || 0;
      current.count += 1;
      totalsByType[event.injuryId] = current;
      return totalsByType;
    }, {});
  const averageRecoveryDistanceByType = Object.fromEntries(Object.entries(recoveryDistanceTotals)
    .map(([injuryId, values]) => [injuryId, rounded(values.total / values.count)]));
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
    injuriesGained: deepClone((expedition.injuryEvents ?? []).filter((event) => event.type === "injury-gained")),
    injuriesTreated: deepClone((expedition.injuryEvents ?? []).filter((event) => event.type === "injury-treated")),
    injuryEvents: deepClone(expedition.injuryEvents ?? []),
    activeInjuriesAtEnd: deepClone(InjuryRules.snapshot(expedition)),
    returnedWhileInjured: returned && Object.values(InjuryRules.snapshot(expedition)).some((injuries) => injuries.length > 0),
    exhaustionOccurrences: injuryEvents.filter((event) => (
      event.type === "injury-gained" && event.injuryId === "exhaustion"
    )).length,
    injuriesNaturallyRecovered: naturalRecoveryEvents.length,
    naturalRecoveriesByType,
    infectionOccurrences: injuryEvents.filter((event) => event.type === "injury-infected").length,
    deepCutsStabilized: injuryEvents.filter((event) => event.type === "injury-treated" && event.deepCutStabilized).length,
    averageRecoveryDistanceByType,
    distanceByPace: deepClone(expedition.distanceByPace ?? {}),
    distanceByRation: deepClone(expedition.distanceByRation ?? {}),
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
    startingMaterialBag: telemetry.startingMaterialBag,
    materialBagCapacity: MaterialRules.capacity(),
    materialBagAtEnd: deepClone({
      capacity: MaterialRules.capacity(),
      contents: MaterialRules.expeditionContents(expedition),
      secured: expedition.materialBag?.secured ?? {},
      unsecured: expedition.materialBag?.unsecured ?? expedition.unsecuredMaterials ?? {},
    }),
    materialsFoundDuringExpedition: deepClone(expedition.materialsFound ?? {}),
    materialsRejectedDueToCapacity: deepClone(expedition.materialBagRejected ?? {}),
    materialsReturnedSafely: deepClone(expedition.materialsReturned ?? {}),
    unsecuredMaterialsLost: deepClone(expedition.materialsLost ?? {}),
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
    statusesAppliedById,
    statusDamageById,
    equipmentPassiveTriggers,
    resolveStored,
    resolveSpent,
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
    briefRestCount: telemetry.briefRests.filter((rest) => rest.applied).length,
    campRestCount: telemetry.campRests.filter((rest) => rest.applied).length,
    campEventCount: telemetry.campEvents.length,
    cookingActionCount: telemetry.recipesCooked.length,
    cookingProvisionsGained: rounded(telemetry.recipesCooked.reduce(
      (sum, recipe) => sum + (Number(recipe.provisionsGained) || 0), 0,
    )),
    banditGoldRecovered: rounded(telemetry.encounters
      .filter((encounter) => ["bandit_ambush", "bandit_leader"].includes(encounter.encounterId))
      .reduce((sum, encounter) => sum + Math.max(0, Number(encounter.resourceChanges?.goldCarried) || 0), 0)),
    banditLootValueRecovered: estimateLootValue(telemetry.encounters
      .filter((encounter) => ["bandit_ambush", "bandit_leader"].includes(encounter.encounterId))
      .flatMap((encounter) => encounter.lootGained ?? [])),
    restHealingModified: [...telemetry.briefRests, ...telemetry.campRests]
      .filter((rest) => rest.restHealingMultiplier !== 1)
      .map((rest) => ({ kind: rest.kind, multiplier: rest.restHealingMultiplier, distance: rest.distance })),
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
  telemetry.replay.injuryEvents = deepClone(telemetry.injuryEvents);
  telemetry.events.push({
    type: "expedition-end", outcome: telemetry.outcome, maximumDistance: telemetry.maximumDistance,
    health: telemetry.finalPartyHealth, provisions: telemetry.provisionsRemaining,
  });
}

function completeEncounterHistory(history, expedition) {
  const after = resourceSnapshot(expedition);
  history.resourceChanges = diffObject(history.before.resources, after.resources);
  history.healthChanges = diffObject(history.before.health, after.health);
  history.materialBagChanges = diffObject(
    history.before.materialBag?.contents ?? {},
    after.materialBag?.contents ?? {},
  );
  history.lootGained = inventoryDelta(history.before.unsecuredLoot, after.unsecuredLoot, 1);
  history.lootLost = inventoryDelta(history.before.unsecuredLoot, after.unsecuredLoot, -1);
  history.packedItemsConsumed = inventoryDelta(history.before.carriedItems, after.carriedItems, -1);
  history.itemsGained = [...history.lootGained];
  history.itemsLost = combineItemEntries([...history.lootLost, ...history.packedItemsConsumed]);
  history.completed = true;
}

function resourceSnapshot(expedition) {
  const companionHealth = Object.fromEntries((expedition.selectedCompanions
    ?? (expedition.selectedCompanion ? [expedition.selectedCompanion] : []))
    .map((companionId) => [
      companionId,
      expedition.companionCombatHp?.[companionId]
        ?? COMPANION_DEFINITIONS[companionId]?.combat?.maxHp,
    ]));
  return {
    resources: { provisions: rounded(expedition.provisions), goldCarried: expedition.goldCarried },
    health: {
      arthur: expedition.health,
      ...companionHealth,
    },
    carriedItems: { ...(expedition.carriedItems ?? {}) },
    unsecuredLoot: Object.fromEntries(
      expedition.unsecuredLoot.map((entry) => [entry.itemId, entry.quantity]),
    ),
    materialBag: deepClone({
      capacity: MaterialRules.capacity(),
      contents: MaterialRules.expeditionContents(expedition),
      secured: expedition.materialBag?.secured ?? {},
      unsecured: expedition.materialBag?.unsecured ?? expedition.unsecuredMaterials ?? {},
    }),
  };
}

function replayPlayerSnapshot(player) {
  return deepClone({
    ownedItems: player.ownedItems,
    equippedItems: player.equippedItems,
    packedItems: player.packedItems,
    unlockedCompanions: player.unlockedCompanions,
    selectedCompanions: player.selectedCompanions,
    selectedCompanion: player.selectedCompanion,
    selectedExpeditionId: player.selectedExpeditionId,
    arthurHealth: HealingRules.arthurHealth(player),
    injuries: player.injuries,
    companionStates: player.companionStates ?? {},
    learnedKnowledge: player.learnedKnowledge,
    materials: player.materials,
    packedMaterials: player.packedMaterials,
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
  const statusesAppliedById = {};
  const statusDamageById = {};
  const equipmentPassiveTriggers = [];
  let resolveStored = 0;
  let resolveSpent = 0;
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
    if (event.type === "status-applied" && event.statusId) {
      statusesAppliedById[event.statusId] = (statusesAppliedById[event.statusId] ?? 0) + 1;
    }
    if (event.type === "status-tick" && event.statusId) {
      statusDamageById[event.statusId] = (statusDamageById[event.statusId] ?? 0)
        + (Number(event.damage) || 0);
    }
    if (event.type === "equipment-trigger") {
      equipmentPassiveTriggers.push({
        trigger: event.trigger,
        effect: event.effect,
        sourceItemId: event.sourceItemId ?? null,
        equipmentSlot: event.equipmentSlot ?? null,
        statusId: event.statusId ?? null,
        chargeId: event.chargeId ?? null,
        amount: Number(event.amount) || 0,
        storedAmount: Number(event.storedAmount) || 0,
        spentAmount: Number(event.spentAmount) || 0,
        applied: event.applied,
      });
      resolveStored += Number(event.storedAmount) || 0;
      resolveSpent += Number(event.spentAmount) || 0;
    }
  });
  return {
    abilityUsesById,
    itemUsesById,
    itemHealingById,
    healingPerformed,
    gaugeControl,
    statusesAppliedById,
    statusDamageById,
    equipmentPassiveTriggers,
    resolveStored,
    resolveSpent,
  };
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
  const injuryEvents = results.flatMap((run) => run.injuriesGained ?? []);
  const injuriesByType = injuryEvents.reduce((counts, event) => {
    counts[event.injuryId] = (counts[event.injuryId] ?? 0) + 1;
    return counts;
  }, {});
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
    averageBriefRests: average(values("briefRestCount")),
    averageCampRests: average(values("campRestCount")),
    averageCampEvents: average(values("campEventCount")),
    averageCookingActions: average(values("cookingActionCount")),
    averageCookingProvisionsGained: average(values("cookingProvisionsGained")),
    banditAmbushEncounters: results.reduce((sum, run) => sum + (Number(run.banditAmbushEncounters) || 0), 0),
    banditAmbushVictories: results.reduce((sum, run) => sum + (Number(run.banditAmbushVictories) || 0), 0),
    banditLeaderEligibilityTriggered: results.reduce((sum, run) => sum + (Number(run.banditLeaderEligibilityTriggered) || 0), 0),
    banditLeaderEncounters: results.reduce((sum, run) => sum + (Number(run.banditLeaderEncounters) || 0), 0),
    banditLeaderVictories: results.reduce((sum, run) => sum + (Number(run.banditLeaderVictories) || 0), 0),
    banditGoldRecovered: results.reduce((sum, run) => sum + (Number(run.banditGoldRecovered) || 0), 0),
    banditLootValueRecovered: results.reduce((sum, run) => sum + (Number(run.banditLootValueRecovered) || 0), 0),
    injuriesPerRun: rounded(injuryEvents.length / Math.max(1, total)),
    runsWithAnyInjury: results.filter((run) => (run.injuriesGained ?? []).length > 0).length,
    runsWithTwoInjuries: results.filter((run) => Object.values(run.activeInjuriesAtEnd ?? {}).some((injuries) => injuries.length >= 2)).length,
    injuriesByType,
    runsTreatedForInjury: results.filter((run) => (run.injuriesTreated ?? []).length > 0).length,
    injuriesNaturallyRecovered: results.reduce((sum, run) => sum + (Number(run.injuriesNaturallyRecovered) || 0), 0),
    naturalRecoveriesByType: results.reduce((counts, run) => {
      Object.entries(run.naturalRecoveriesByType ?? {}).forEach(([injuryId, count]) => {
        counts[injuryId] = (counts[injuryId] ?? 0) + count;
      });
      return counts;
    }, {}),
    infectionOccurrences: results.reduce((sum, run) => sum + (Number(run.infectionOccurrences) || 0), 0),
    deepCutsStabilized: results.reduce((sum, run) => sum + (Number(run.deepCutsStabilized) || 0), 0),
    returnedWhileInjured: results.filter((run) => run.returnedWhileInjured).length,
    averageExhaustionOccurrences: average(values("exhaustionOccurrences")),
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
