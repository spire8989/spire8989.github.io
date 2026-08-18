"use strict";

const BetweenExpeditionPolicies = Object.freeze({
  "conservative-sustainer": createBetweenPolicy("conservative-sustainer", {
    healingThreshold: 0.75,
    healingThresholdInclusive: true,
    provisionMargin: 5,
  }),
  "aggressive-reinvestor": createBetweenPolicy("aggressive-reinvestor", {
    healingThreshold: 0.5,
    healingThresholdInclusive: false,
    criticalHealingThreshold: 0.25,
    provisionMargin: 3,
  }),
  "minimal-restock": createBetweenPolicy("minimal-restock", {
    healingThreshold: 0.25,
    healingThresholdInclusive: true,
    provisionMargin: 1,
  }),
});

const CAMPAIGN_PROGRESSION_ROUTES = Object.freeze([
  "old_forest_road",
  "fountain_of_barenton",
  "val_sans_retour",
  "search_for_merlin",
]);

const CAMPAIGN_PROGRESSION_PREREQUISITES = Object.freeze({
  fountain_of_barenton: Object.freeze({
    searchRouteId: "old_forest_road",
    itemId: "flask",
    reason: "missing_flask",
  }),
});

const CampaignSimulationRunner = Object.freeze({
  run(configuration = {}) {
    const config = normalizeCampaignConfiguration(configuration);
    const player = createCampaignPlayer(config.startingState);
    const shopStocks = { ...CampaignRules.createShopStocks(), ...(config.startingState.shopStocks ?? {}) };
    const policy = resolveBetweenPolicy(config.betweenExpeditionPolicy);
    const preparationRandom = GameRandom.create(`${config.seed}:preparation`);
    const startingState = campaignStateSnapshot(player, shopStocks, 0);
    const expeditions = [];
    const betweenExpeditionDecisions = [];
    const townActions = [];
    const progression = config.campaignMode === "progression"
      ? createCampaignProgressionState()
      : null;
    const progressionTransitions = [];
    let stopReason = null;

    for (let index = 0; index < config.maxExpeditions; index += 1) {
      const expeditionNumber = index + 1;
      const progressionRouteId = progression?.currentRouteId ?? null;
      const progressionSelection = progression
        ? selectCampaignProgressionExpedition(progressionRouteId, player)
        : null;
      const selectedProgressionRouteId = progressionSelection?.routeId ?? progressionRouteId;
      const selectedRunKind = progressionSelection?.runKind
        ?? (progression ? "progression" : "repeated");
      const isPrerequisiteRun = selectedRunKind === "prerequisite";
      let routeId = selectedProgressionRouteId ?? player.selectedExpeditionId ?? "old_forest_road";
      if (!routeId) {
        stopReason = "current-content-completed";
        break;
      }
      const configuredTargetDistance = progression
        ? config.expeditionPlan[Math.min(progression.routeIndex, config.expeditionPlan.length - 1)]
        : config.expeditionPlan[index % config.expeditionPlan.length];
      const progressionRoute = progression ? ExpeditionCatalog.get(progressionRouteId) : null;
      const routeObjectiveDistance = Number(progressionRoute?.minimumObjectiveDistance) || 0;
      const desiredTargetDistance = progression
        ? Math.max(configuredTargetDistance, routeObjectiveDistance)
        : configuredTargetDistance;
      const expeditionSeed = `${config.seed}:expedition-${index}`;
      const stateBeforeDecisions = campaignStateSnapshot(player, shopStocks, expeditionNumber);
      if (progression && player.selectedExpeditionId !== routeId) {
        player.selectedExpeditionId = routeId;
      }
      const townEntry = CampaignRules.enterLocation(player, shopStocks);
      const progressionReadinessPlan = progression && !isPrerequisiteRun
        ? assessProgressionReadiness(
          progressionRouteId, desiredTargetDistance, routeObjectiveDistance,
          player, shopStocks, policy, config.strategy,
        ) : null;
      let supplyRunForRoute = progressionReadinessPlan
        && progressionReadinessPlan.status !== "ready"
        ? progressionRouteId : null;
      let isSupplyRun = Boolean(supplyRunForRoute);
      if (isSupplyRun) routeId = "old_forest_road";
      if (player.selectedExpeditionId !== routeId) player.selectedExpeditionId = routeId;
      let runKind = isSupplyRun ? "supply" : selectedRunKind;
      const plannedTargetDistance = isSupplyRun
        ? progressionSupplyRunDistance(config.strategy)
        : desiredTargetDistance;
      const preparationActions = [];
      if (stateBeforeDecisions.selectedExpeditionId !== routeId) {
        preparationActions.push({
          type: "select-expedition",
          expeditionNumber,
          expeditionId: routeId,
          previousExpeditionId: stateBeforeDecisions.selectedExpeditionId ?? null,
        });
      }
      preparationActions.push({
        type: "town-entry",
        expeditionNumber,
        provisionsGranted: townEntry.provisionsGranted,
        provisionStockBefore: stateBeforeDecisions.provisionStock,
        provisionStockAfter: player.provisions,
        shopProvisionStockBefore: townEntry.shopProvisionStockBefore,
        shopProvisionStockAfter: townEntry.shopProvisionStockAfter,
        shopProvisionsRestocked: townEntry.shopProvisionsRestocked,
      });

      if (HealingRules.arthurHealth(player) <= 0) {
        stopReason = "arthur-died";
        break;
      }
      const decision = applyBetweenExpeditionPolicy(
        player, shopStocks, policy, plannedTargetDistance, config.healingEnabled, config.strategy,
        preparationRandom.random,
        preparationActions,
      );
      decision.expeditionNumber = expeditionNumber;
      decision.expeditionId = routeId;
      decision.progressionRouteId = progressionRouteId;
      decision.runKind = runKind;
      decision.isPrerequisiteRun = isPrerequisiteRun;
      decision.prerequisiteForRoute = isPrerequisiteRun
        ? progressionSelection.prerequisiteForRoute : null;
      decision.prerequisiteItemId = isPrerequisiteRun
        ? progressionSelection.itemId : null;
      decision.prerequisiteReason = isPrerequisiteRun
        ? progressionSelection.reason : null;
      decision.isSupplyRun = isSupplyRun;
      decision.supplyRunForRoute = supplyRunForRoute;
      decision.supplyRunTargetDistance = isSupplyRun ? plannedTargetDistance : null;
      decision.progressionReadiness = progressionReadinessPlan?.status ?? null;
      decision.progressionDeferredReason = progressionReadinessPlan?.reason ?? null;
      decision.progressionRequiredDistance = progressionReadinessPlan?.requiredDistance ?? 0;
      decision.progressionSupportedDistance = progressionReadinessPlan?.supportedDistance ?? null;
      decision.objectiveDistanceFloorApplied = false;
      decision.townProvisionGrant = townEntry.provisionsGranted;
      betweenExpeditionDecisions.push(decision);

      if (decision.stopReason) {
        townActions.push(...tagCampaignTownActions(preparationActions, expeditionNumber));
        stopReason = decision.stopReason;
        break;
      }

      // The preflight quote and the full preparation policy intentionally share
      // the same planning rules, but a dead companion or another preparation
      // mutation can still reduce the final supported distance. Never let that
      // drift turn a known objective floor into a false progression attempt.
      let progressionReadiness = progressionReadinessPlan;
      if (progression && !isSupplyRun && !isPrerequisiteRun
        && routeObjectiveDistance > 0
        && decision.actualTargetDistance < routeObjectiveDistance) {
        progressionReadiness = {
          status: "deferred",
          reason: "objective-distance-floor-after-preparation",
          requiredDistance: routeObjectiveDistance,
          supportedDistance: decision.safeAffordableDistance,
        };
        isSupplyRun = true;
        supplyRunForRoute = progressionRouteId;
        runKind = "supply";
        const previousExpeditionId = player.selectedExpeditionId;
        routeId = "old_forest_road";
        player.selectedExpeditionId = routeId;
        if (previousExpeditionId !== routeId) {
          preparationActions.push({
            type: "select-expedition",
            expeditionNumber,
            expeditionId: routeId,
            previousExpeditionId,
          });
        }
        decision.expeditionId = routeId;
        decision.runKind = runKind;
        decision.isSupplyRun = true;
        decision.supplyRunForRoute = supplyRunForRoute;
        decision.supplyRunTargetDistance = decision.actualTargetDistance;
        decision.progressionReadiness = progressionReadiness.status;
        decision.progressionDeferredReason = progressionReadiness.reason;
        decision.progressionRequiredDistance = progressionReadiness.requiredDistance;
        decision.progressionSupportedDistance = progressionReadiness.supportedDistance;
      }
      decision.objectiveDistanceFloorApplied = Boolean(
        progression && !isSupplyRun && !isPrerequisiteRun && routeObjectiveDistance > 0,
      );

      const actualTargetDistance = decision.actualTargetDistance;
      const capacity = ExpeditionRules.partyProvisionCapacity(selectedCompanionIds(player));
      const provisionsPacked = Math.min(player.provisions, decision.provisionsToPack, capacity);
      if (provisionsPacked < EXPEDITION_TUNING.minimumStartingProvisions) {
        townActions.push(...tagCampaignTownActions(preparationActions, expeditionNumber));
        stopReason = "cannot-support-any-expedition";
        break;
      }

      preparationActions.push({
        type: "departure",
        expeditionNumber,
        expeditionId: player.selectedExpeditionId,
        expeditionSeed,
        companions: selectedCompanionIds(player),
        provisions: provisionsPacked,
        paceId: decision.paceId,
        rationId: decision.rationId,
        loadout: deepCampaignClone(player.equippedItems),
        packedItems: deepCampaignClone(decision.packContents),
        packedMaterials: deepCampaignClone(decision.materialBagContents),
      });
      const taggedPreparationActions = tagCampaignTownActions(preparationActions, expeditionNumber);
      decision.townActions = deepCampaignClone(taggedPreparationActions);
      const healthAtStart = HealingRules.arthurHealth(player);
      const goldAtStart = stateBeforeDecisions.gold;
      const provisionStockAtStart = stateBeforeDecisions.provisionStock;
      const run = SimulationRunner.run({
        id: `${config.id}:expedition-${expeditionNumber}`,
        seed: expeditionSeed,
        expeditionId: routeId,
        companion: player.selectedCompanion,
        companions: selectedCompanionIds(player),
        provisions: provisionsPacked,
        loadout: { ...player.equippedItems },
        packContents: decision.packContents,
        strategy: config.strategy,
        turnaroundPolicy: { type: "fixedDistance", distance: actualTargetDistance },
        paceId: decision.paceId,
        rationId: decision.rationId,
        lockTravelSettings: false,
        materialBagContents: decision.materialBagContents,
        startingStateIsAuthoritative: true,
        startingState: deepCampaignClone(player),
      });

      replaceCampaignPlayer(player, run.endingPlayerState);
      const sales = run.returnedSafely && config.autoSellRecoveredLoot
        ? CampaignRules.sellMerchantItems(player, run.lootRecovered)
        : { sales: [], goldEarned: 0 };
      const settlementActions = sales.sales.map((sale) => ({
        type: "sell-item",
        expeditionNumber,
        itemId: sale.itemId,
        quantity: 1,
        goldEarned: sale.goldEarned,
      }));
      townActions.push(...taggedPreparationActions, ...settlementActions);
      const endingState = campaignStateSnapshot(player, shopStocks, expeditionNumber);
      const damageTaken = run.damageTaken;
      const expeditionHardFailureReason = !run.returnedSafely && run.finalArthurHealth <= 0
        ? "arthur-died"
        : !run.returnedSafely && isCampaignResourceExhaustion(run.failureReason)
          ? "expedition-resource-exhaustion" : null;
      const progressionAttempt = progression
        && !isSupplyRun
        && !isPrerequisiteRun
        ? evaluateCampaignProgressionAttempt(
          progressionRouteId, desiredTargetDistance, decision, run, stateBeforeDecisions, endingState,
        )
        : null;
      const prerequisiteAcquired = isPrerequisiteRun
        && Boolean(run.returnedSafely)
        && hasCampaignItem(endingState, progressionSelection.itemId);
      const prerequisiteStatus = isPrerequisiteRun
        ? !run.returnedSafely
          ? "failed"
          : prerequisiteAcquired ? "acquired" : "not-acquired"
        : null;
      const expeditionEntry = {
        expeditionNumber,
        expeditionSeed,
        expeditionId: routeId,
        routeId,
        campaignStageAtDeparture: progression ? progressionRouteId ?? routeId : null,
        routeAttemptNumber: progression && !isSupplyRun
          && !isPrerequisiteRun
          ? progression.attemptsByRoute[progressionRouteId] + 1 : null,
        runKind,
        isPrerequisiteRun,
        prerequisiteForRoute: isPrerequisiteRun
          ? progressionSelection.prerequisiteForRoute : null,
        prerequisiteItemId: isPrerequisiteRun ? progressionSelection.itemId : null,
        prerequisiteReason: isPrerequisiteRun ? progressionSelection.reason : null,
        prerequisiteStatus,
        prerequisiteAcquired,
        isSupplyRun,
        supplyRunForRoute,
        supplyRunTargetDistance: isSupplyRun ? actualTargetDistance : null,
        supplyRunObjectiveDistance: isSupplyRun ? desiredTargetDistance : null,
        progressionReadiness: progressionReadiness?.status ?? null,
        progressionDeferredReason: progressionReadiness?.reason ?? null,
        progressionRequiredDistance: progressionReadiness?.requiredDistance ?? 0,
        progressionSupportedDistance: progressionReadiness?.supportedDistance ?? null,
        objectiveDistanceFloorApplied: Boolean(decision.objectiveDistanceFloorApplied),
        targetDistance: actualTargetDistance,
        configuredTargetDistance,
        routeObjectiveDistance,
        desiredTargetDistance,
        actualTargetDistance,
        targetDistanceReduced: decision.targetDistanceReduced,
        targetDistanceReduction: decision.targetDistanceReduction,
        targetDistanceReductionReason: decision.targetDistanceReductionReason,
        departurePassiveFoodEstimate: decision.departurePassiveFoodEstimate,
        paceSelectedAtDeparture: run.paceSelectedAtDeparture,
        rationSelectedAtDeparture: run.rationSelectedAtDeparture,
        paceChanges: run.paceChanges,
        rationChanges: run.rationChanges,
        briefRests: run.briefRests,
        campsEntered: run.campsEntered,
        campRests: run.campRests,
        campEvents: run.campEvents,
        injuriesAtDeparture: run.injuriesAtDeparture,
        injuriesGained: run.injuriesGained,
        injuriesTreated: run.injuriesTreated,
        injuriesNaturallyRecovered: run.injuriesNaturallyRecovered,
        naturalRecoveriesByType: run.naturalRecoveriesByType,
        infectionOccurrences: run.infectionOccurrences,
        deepCutsStabilized: run.deepCutsStabilized,
        averageRecoveryDistanceByType: run.averageRecoveryDistanceByType,
        activeInjuriesAtEnd: run.activeInjuriesAtEnd,
        returnedWhileInjured: run.returnedWhileInjured,
        exhaustionOccurrences: run.exhaustionOccurrences,
        distanceByPace: run.distanceByPace,
        distanceByRation: run.distanceByRation,
        injuryTreatment: decision.injuryTreatment,
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
        innCookingActions: decision.innCookingActions,
        innCookingProvisionsGained: decision.innCookingProvisionsGained,
        innIngredientsConsumedById: decision.innIngredientsConsumedById,
        encounterProvisionReserve: decision.encounterProvisionReserve,
        provisionUncertaintyBuffer: decision.provisionUncertaintyBuffer,
        provisionUncertaintyBufferUsed: decision.provisionUncertaintyBufferUsed,
        effectiveProvisionTarget: decision.effectiveProvisionTarget,
        totalEstimatedProvisionRequirement: decision.totalEstimatedProvisionRequirement,
        emergencyProvisionTurnaround: run.emergencyProvisionTurnaround,
        emergencyProvisionTurnaroundDistance: run.emergencyProvisionTurnaroundDistance,
        emergencyReturnProvisions: run.emergencyReturnProvisions,
        emergencyReturnEstimatedRequirement: run.emergencyReturnEstimatedRequirement,
        emergencyReturnTotalRequirement: run.emergencyReturnTotalRequirement,
        originalTargetDistance: desiredTargetDistance,
        departureTargetDistance: actualTargetDistance,
        actualTurnaroundDistance: run.turnaroundDistance,
        emergencyReturnStrategyTolerance: run.emergencyReturnStrategyTolerance,
        emergencyReturnTolerance: run.emergencyReturnTolerance,
        emergencyReturnTriggerReason: run.emergencyReturnTriggerReason,
        provisionExhaustionFailure: run.provisionExhaustionFailure,
        strategyConstraints: decision.strategyConstraints,
        hardFailure: Boolean(expeditionHardFailureReason),
        hardFailureReason: expeditionHardFailureReason,
        startingHealth: healthAtStart,
        endingHealth: run.finalArthurHealth,
        damageTaken,
        healingBefore: decision.healing,
        healingTriggeredByLowHp: decision.healingTriggeredByLowHp,
        healingTriggerReason: decision.healingTriggerReason,
        healingByPartyMember: decision.healing.healingByPartyMember,
        healingCost: decision.healing.goldCost,
        startingGold: goldAtStart,
        endingGold: player.currentGold,
        startingProvisionStock: provisionStockAtStart,
        endingProvisionStock: player.provisions,
        provisionsPurchased: decision.provisionPurchase.quantity,
        provisionCost: decision.provisionPurchase.goldCost,
        provisionsPacked,
        provisionsReturned: run.provisionsReturned,
        itemsPurchasedById: decision.itemsPurchasedById,
        itemPurchaseGoldSpentById: decision.itemPurchaseGoldSpentById,
        itemPurchaseGoldSpent: decision.itemPurchaseGoldSpent,
        equipmentChanges: decision.equipmentChanges,
        equipmentPurchases: decision.equipmentPurchases,
        equipmentPurchaseGoldSpent: decision.equipmentPurchaseGoldSpent,
        bandagesPurchased: decision.bandagesPurchased,
        bandagesCrafted: decision.bandagesCrafted,
        craftingActions: decision.craftingActions,
        equipmentCraftingActions: decision.equipmentCraftingActions,
        bandagesPacked: decision.bandagesPacked,
        itemsPackedById: run.itemsPackedById,
        itemsConsumedById: run.itemsConsumedById,
        itemsReturnedById: run.itemsReturnedById,
        bandagesReturned: run.itemsReturnedById?.bandages ?? 0,
        bandagesUsed: run.bandagesUsed ?? run.itemUsesById?.bandages ?? 0,
        bandageHealingPerformed: run.bandageHealingPerformed ?? 0,
        banditAmbushEncounters: run.banditAmbushEncounters,
        banditAmbushVictories: run.banditAmbushVictories,
        banditLeaderEligibilityTriggered: run.banditLeaderEligibilityTriggered,
        banditLeaderEncounters: run.banditLeaderEncounters,
        banditLeaderVictories: run.banditLeaderVictories,
        banditGoldRecovered: run.banditGoldRecovered,
        banditLootValueRecovered: run.banditLootValueRecovered,
        success: run.returnedSafely,
        outcome: run.outcome,
        failureReason: run.failureReason,
        actualMaximumDistance: run.maximumDistance,
        lootRecovered: run.lootRecovered,
        materialsRecovered: run.materialsRecovered,
        recipesLearned: run.recipesLearned,
        returnRewardTier: run.returnRewardTier,
        returnRewardResults: run.returnRewardResults,
        lootLost: run.lootLost,
        lootValueRecovered: run.estimatedLootValue,
        goldEarnedFromSales: sales.goldEarned,
        goldEarnedDirect: run.goldGained,
        soldItems: sales.sales,
        netGold: player.currentGold - stateBeforeDecisions.gold,
        combats: run.combatCount,
        aggressiveEmergencyActions: run.aggressiveEmergencyActions,
        combatsStartedBelow50Percent: run.combatsStartedBelow50Percent,
        combatsStartedBelow25Percent: run.combatsStartedBelow25Percent,
        attacksReceivedByPartyMember: run.attacksReceivedByPartyMember,
        damageReceivedByPartyMember: run.damageReceivedByPartyMember,
        arthurCombatAttacksReceived: run.arthurCombatAttacksReceived,
        companionCombatAttacksReceived: run.companionCombatAttacksReceived,
        arthurCombatDamageReceived: run.arthurCombatDamageReceived,
        companionCombatDamageReceived: run.companionCombatDamageReceived,
        abilityUsesById: run.abilityUsesById,
        itemUsesById: run.itemUsesById,
        statusesAppliedById: run.statusesAppliedById,
        statusDamageById: run.statusDamageById,
        equipmentPassiveTriggers: run.equipmentPassiveTriggers,
        resolveStored: run.resolveStored,
        resolveSpent: run.resolveSpent,
        regenerationPerformed: run.regenerationPerformed,
        regenerationSuppressedActivations: run.regenerationSuppressedActivations,
        regenerationSuppressedByStatus: run.regenerationSuppressedByStatus,
        heavyAttackUses: run.heavyAttackUses,
        defendActions: run.defendActions,
        totalHealingPerformed: run.totalHealingPerformed,
        totalGaugeControl: run.totalGaugeControl,
        encounters: run.encounterCount,
        provisionsConsumed: run.provisionsConsumed,
        provisionsFound: run.provisionsGained,
        replay: run.replay,
        townActions: [...preparationActions, ...settlementActions],
        expeditionTelemetry: run,
        stateBefore: stateBeforeDecisions,
        stateAfter: endingState,
        routeAttemptStatus: progressionAttempt?.status ?? null,
        routeAttemptCompleted: Boolean(progressionAttempt?.completed),
        routeCompletionReason: progressionAttempt?.reason ?? null,
        routeCompletionItem: progressionAttempt?.securedItemId ?? null,
      };
      expeditions.push(expeditionEntry);

      if (progression && isSupplyRun) {
        progression.supplyRunsByRoute[supplyRunForRoute] += 1;
      } else if (progression && isPrerequisiteRun) {
        progression.prerequisiteRunCount += 1;
        progression.prerequisiteRunsByRoute[progressionSelection.prerequisiteForRoute] += 1;
        progression.lastRoute = routeId;
        progression.lastAttemptReason = prerequisiteStatus;
      } else if (progression) {
        progression.attemptsByRoute[progressionRouteId] += 1;
        if (progressionAttempt.completed) {
          progression.routesCompleted.push(progressionRouteId);
          progression.routeCompletionAttempt[progressionRouteId] = expeditionNumber;
          progression.routeCompletionStatus[progressionRouteId] = "completed";
          const nextRoute = CAMPAIGN_PROGRESSION_ROUTES[progression.routeIndex + 1] ?? null;
          progressionTransitions.push({
            expeditionNumber,
            fromRouteId: progressionRouteId,
            toRouteId: nextRoute,
            reason: progressionAttempt.reason,
          });
          progression.routeIndex += 1;
          progression.currentRouteId = nextRoute;
          progression.currentContentCompleted = !nextRoute;
        } else {
          progression.routeCompletionStatus[progressionRouteId] = progressionAttempt.status;
        }
        progression.lastRoute = progressionRouteId;
        progression.lastAttemptReason = progressionAttempt.reason;
        if (progression.currentContentCompleted) {
          stopReason = "current-content-completed";
          break;
        }
      }

      if (!run.returnedSafely && run.finalArthurHealth <= 0) {
        stopReason = "arthur-died";
        break;
      }
      if (expeditionHardFailureReason) {
        stopReason = expeditionHardFailureReason;
        break;
      }
      if (run.failureReason?.includes("Maximum simulation step count")
        || run.failureReason?.includes("exceeded")) {
        stopReason = "simulation-safety-limit";
        break;
      }
    }

    stopReason ??= progression?.currentContentCompleted
      ? "current-content-completed"
      : expeditions.length >= config.maxExpeditions
        ? progression ? "progression-attempt-cap" : "max-expeditions-reached"
      : "cannot-support-any-expedition";
    return finalizeCampaignTelemetry(
      config, policy, startingState, player, shopStocks, expeditions,
      betweenExpeditionDecisions, townActions, stopReason, progression, progressionTransitions,
    );
  },

  runBatch(request = {}) {
    const scenarios = request.scenarios?.length ? request.scenarios : [{}];
    const campaignsPerScenario = Math.max(1, Math.floor(Number(request.campaignsPerScenario) || 1));
    const results = [];
    const startedAt = performance.now();
    scenarios.forEach((scenario, scenarioIndex) => {
      for (let index = 0; index < campaignsPerScenario; index += 1) {
        const baseSeed = scenario.seed ?? request.seed ?? scenario.id ?? `scenario-${scenarioIndex + 1}`;
        results.push(this.run({
          ...scenario,
          id: scenario.id ?? `scenario-${scenarioIndex + 1}`,
          seed: `${baseSeed}:campaign-${index}`,
          expeditions: scenario.expeditions ?? request.expeditionsPerCampaign,
        }));
      }
    });
    const batch = {
      generatedAt: new Date().toISOString(),
      durationMs: roundCampaignNumber(performance.now() - startedAt, 3),
      results,
    };
    batch.summary = CampaignSimulationTelemetry.aggregate(batch, request.groupBy);
    return batch;
  },

  verifyDeterminism(configuration = {}, seed = configuration.seed ?? "campaign-determinism") {
    const first = CampaignSimulationTelemetry.normalizeCampaign(this.run({ ...configuration, seed }));
    const second = CampaignSimulationTelemetry.normalizeCampaign(this.run({ ...configuration, seed }));
    return { matches: JSON.stringify(first) === JSON.stringify(second), first, second };
  },
});

const CampaignSimulationTelemetry = Object.freeze({
  normalizeCampaign(campaign) {
    const clone = deepCampaignClone(campaign);
    clone.expeditions.forEach((entry) => delete entry.expeditionTelemetry.durationMs);
    return clone;
  },

  aggregate(batchOrResults, groupBy = ["strategy", "betweenExpeditionPolicy", "planKey"]) {
    const results = Array.isArray(batchOrResults) ? batchOrResults : batchOrResults.results;
    const groups = {};
    groupBy.forEach((field) => {
      const grouped = {};
      results.forEach((campaign) => ((grouped[campaign[field] ?? "none"] ??= []).push(campaign)));
      groups[field] = Object.fromEntries(Object.entries(grouped).map(
        ([key, campaigns]) => [key, summarizeCampaigns(campaigns)],
      ));
    });
    return { ...summarizeCampaigns(results), groups };
  },

  toJson(batch, spacing = 2) {
    return JSON.stringify(batch, null, spacing);
  },

  toCompact(batchOrResults) {
    const batch = Array.isArray(batchOrResults)
      ? { results: batchOrResults }
      : (batchOrResults ?? { results: [] });
    const campaigns = batch.results ?? [];
    const compactCampaigns = campaigns.map((campaign) => compactCampaign(campaign));
    const payload = {
      compactExportVersion: 2,
      exportMetadata: compactExportMetadata(batch, campaigns),
      batchSummary: compactBatchSummary(batch.summary ?? summarizeCampaigns(campaigns), campaigns),
      campaigns: compactCampaigns,
    };
    payload.serializationStats = compactSerializationStats(compactCampaigns);
    return compactClean(payload);
  },

  toCompactJson(batchOrResults, spacing = 2) {
    return JSON.stringify(this.toCompact(batchOrResults), null, spacing);
  },

  compactToJson(batchOrResults, spacing = 2) {
    return this.toCompactJson(batchOrResults, spacing);
  },

  campaignsToCsv(batchOrResults) {
    const results = Array.isArray(batchOrResults) ? batchOrResults : batchOrResults.results;
    const fields = ["campaignId", "seed", "strategy", "betweenExpeditionPolicy", "campaignProgressionMode",
      "currentRoute", "lastRoute", "progressionRouteSequence", "routesCompleted", "attemptsByRoute",
      "routeCompletionAttempt", "routeCompletionStatus", "waterOfBarentonSecured", "morgansTokenSecured",
      "merlinFound", "boundWardenEncountered", "boundWardenVictories",
      "prerequisiteRunCount", "prerequisiteRunsByRoute", "progressionDeferredCount",
      "progressionDeferralsByRoute", "objectiveDistanceFloorViolations",
      "currentContentCompleted", "finalProgressionStage", "expeditionsAttempted",
      "expeditionsReturned", "stopReason", "stopCategory", "hardFailure", "hardFailureReason",
      "strategyConstraintCount", "strategyConstraintTypes", "startingGold", "endingGold", "endingArthurHealth",
      "averageDesiredExpeditionDistance", "averageActualExpeditionDistance", "targetDistanceReductionFrequency",
      "totalEmergencyProvisionTurnarounds", "emergencyProvisionTurnaroundRate",
      "totalLowHpHealingTriggers", "totalCriticalArthurHealingTriggers",
      "totalBriefRests", "totalCampRests", "totalCampEvents", "totalCookingActions", "totalCookingProvisionsGained",
      "totalInnCookingActions", "totalInnCookingProvisionsGained", "innIngredientsConsumedById",
      "totalBanditAmbushEncounters", "totalBanditAmbushVictories", "totalBanditLeaderEncounters", "totalBanditLeaderVictories",
      "totalBanditLeaderEligibilityTriggered", "totalBanditGoldRecovered", "totalBanditLootValueRecovered",
      "injuriesPerRun", "injuriesByType", "injuriesTreated", "injuriesNaturallyRecovered",
      "naturalRecoveriesByType", "infectionOccurrences", "deepCutsStabilized", "exhaustionOccurrences",
      "ingredientsConsumedById", "materialsFoundDuringExpedition", "materialsRejectedDueToCapacity",
      "materialsReturnedSafely", "unsecuredMaterialsLost",
      "totalAggressiveEmergencyActions", "totalCombatsStartedBelow50Percent", "totalCombatsStartedBelow25Percent",
      "totalArthurCombatDamageReceived", "totalCompanionCombatDamageReceived",
      "totalHealingPerformed", "totalGaugeControl", "abilityUsesById", "itemUsesById",
      "statusesAppliedById", "statusDamageById", "equipmentPassiveTriggers", "totalResolveStored", "totalResolveSpent",
      "totalRegenerationPerformed", "totalRegenerationSuppressedActivations", "regenerationSuppressedByStatus",
      "totalHeavyAttackUses", "totalDefendActions",
      "itemsPurchasedById", "itemPurchaseGoldSpentById", "bandagesPurchased", "bandagesPacked",
      "equipmentPurchases", "equipmentPurchaseGoldSpent", "equipmentCraftingActions", "equipmentChanges",
      "itemsConsumedById", "itemsPackedById", "itemsReturnedById", "bandagesUsed", "bandagesReturned", "bandageHealingPerformed",
      "totalGoldEarned", "totalGoldSpent", "totalItemPurchaseGoldSpent", "totalCraftingGoldSpent", "totalEquipmentCrafts", "totalHealingCost", "totalProvisionCost", "netCampaignWealth", "economicTrend", "supplyRunCount"];
    return campaignCsv(fields, results.map((campaign) => ({
      ...campaign,
      strategyConstraintTypes: campaign.strategyConstraints.map((constraint) => constraint.type).join("|"),
      progressionRouteSequence: (campaign.routeSequence ?? []).join("|"),
    })));
  },

  expeditionsToCsv(batchOrResults) {
    const campaigns = Array.isArray(batchOrResults) ? batchOrResults : batchOrResults.results;
    const rows = campaigns.flatMap((campaign) => campaign.expeditions.map((expedition) => ({
      campaignId: campaign.campaignId,
      seed: campaign.seed,
      strategy: campaign.strategy,
      policy: campaign.betweenExpeditionPolicy,
      arthurHealing: expedition.healingByPartyMember?.arthur ?? 0,
      companionId: expedition.stateBefore.selectedCompanion ?? "",
      companionHealing: expedition.stateBefore.selectedCompanion
        ? expedition.healingByPartyMember?.[expedition.stateBefore.selectedCompanion] ?? 0 : 0,
      strategyConstraintTypes: expedition.strategyConstraints.map((constraint) => constraint.type).join("|"),
      ...expedition,
    })));
    const fields = ["campaignId", "seed", "strategy", "policy", "expeditionNumber", "expeditionId", "routeId",
      "campaignStageAtDeparture", "routeAttemptNumber", "routeAttemptStatus", "routeAttemptCompleted",
      "routeCompletionReason", "routeCompletionItem", "isSupplyRun", "supplyRunForRoute", "supplyRunTargetDistance", "supplyRunObjectiveDistance", "success",
      "runKind", "isPrerequisiteRun", "prerequisiteForRoute", "prerequisiteItemId", "prerequisiteReason",
      "prerequisiteStatus", "prerequisiteAcquired",
      "configuredTargetDistance", "routeObjectiveDistance", "desiredTargetDistance", "actualTargetDistance", "targetDistanceReduced", "targetDistanceReduction",
      "targetDistanceReductionReason", "progressionReadiness", "progressionDeferredReason", "progressionRequiredDistance",
      "progressionSupportedDistance", "objectiveDistanceFloorApplied", "strategyConstraintTypes", "hardFailure", "hardFailureReason",
      "departurePassiveFoodEstimate", "encounterProvisionReserve", "provisionUncertaintyBuffer",
      "provisionUncertaintyBufferUsed", "effectiveProvisionTarget", "totalEstimatedProvisionRequirement",
      "emergencyProvisionTurnaround", "emergencyProvisionTurnaroundDistance",
      "emergencyReturnProvisions", "emergencyReturnEstimatedRequirement", "emergencyReturnStrategyTolerance", "emergencyReturnTolerance",
      "emergencyReturnTotalRequirement", "emergencyReturnTriggerReason",
      "originalTargetDistance", "departureTargetDistance", "actualTurnaroundDistance",
      "provisionExhaustionFailure",
      "paceSelectedAtDeparture", "rationSelectedAtDeparture", "paceChanges", "rationChanges", "briefRestCount", "campRestCount", "campEventCount",
      "injuriesAtDeparture", "injuriesGained", "injuriesTreated", "injuriesNaturallyRecovered",
      "naturalRecoveriesByType", "infectionOccurrences", "deepCutsStabilized", "averageRecoveryDistanceByType",
      "activeInjuriesAtEnd", "exhaustionOccurrences",
      "cookingActionCount", "cookingProvisionsGained", "innCookingActions", "innCookingProvisionsGained", "innIngredientsConsumedById",
      "campEvents", "recipesCooked", "ingredientsConsumedById", "craftingActions", "equipmentCraftingActions", "equipmentChanges", "equipmentPurchases",
      "banditAmbushEncounters", "banditAmbushVictories", "banditLeaderEligibilityTriggered", "banditLeaderEncounters", "banditLeaderVictories",
      "banditGoldRecovered", "banditLootValueRecovered",
      "startingMaterialBag", "materialBagCapacity", "materialBagAtEnd", "materialsFoundDuringExpedition",
      "materialsRejectedDueToCapacity", "materialsReturnedSafely", "unsecuredMaterialsLost",
      "actualMaximumDistance", "startingHealth", "endingHealth", "damageTaken",
      "arthurHealing", "companionId", "companionHealing", "healingCost",
      "healingTriggeredByLowHp", "healingTriggerReason",
      "aggressiveEmergencyActions", "combatsStartedBelow50Percent", "combatsStartedBelow25Percent",
      "arthurCombatAttacksReceived", "companionCombatAttacksReceived",
      "arthurCombatDamageReceived", "companionCombatDamageReceived",
      "totalHealingPerformed", "totalGaugeControl", "abilityUsesById", "itemUsesById",
      "statusesAppliedById", "statusDamageById", "equipmentPassiveTriggers", "resolveStored", "resolveSpent",
      "regenerationPerformed", "regenerationSuppressedActivations", "regenerationSuppressedByStatus", "heavyAttackUses", "defendActions",
      "itemsPurchasedById", "itemPurchaseGoldSpentById", "bandagesPurchased", "bandagesPacked",
      "bandagesUsed", "bandagesReturned", "bandageHealingPerformed",
      "startingGold", "endingGold", "provisionsPurchased", "provisionsReturned", "provisionsPacked", "lootValueRecovered",
      "netGold", "failureReason"];
    return campaignCsv(fields, rows);
  },
});

const COMPACT_CAMPAIGN_OMISSIONS = new Set([
  "startingState",
  "endingState",
  "betweenExpeditionDecisions",
  "expeditions",
  "replay",
]);

function compactExportMetadata(batch, campaigns) {
  const configurations = campaigns.map((campaign) => campaign.simulationConfiguration ?? {
    id: campaign.campaignId,
    strategy: campaign.strategy,
    betweenExpeditionPolicy: campaign.betweenExpeditionPolicy,
    expeditionPlan: campaign.expeditionPlan,
    maxExpeditions: campaign.expeditionPlan?.length ?? campaign.expeditionsAttempted,
  });
  const plans = distinctCompactValues(configurations.map((configuration) => ({
    expeditionPlan: configuration.expeditionPlan ?? [],
    maxExpeditions: configuration.maxExpeditions ?? null,
  })));
  return {
    compactExportVersion: 2,
    generatedAt: batch.generatedAt ?? new Date().toISOString(),
    source: "campaign-simulation",
    gameVersion: "html5-prototype",
    simulationVersion: 1,
    buildIdentifier: null,
    gitCommit: null,
    campaignCount: campaigns.length,
    expeditionCount: campaigns.reduce((sum, campaign) => sum + campaign.expeditions.length, 0),
    expeditionCap: Math.max(0, ...configurations.map((configuration) => (
      Number(configuration.maxExpeditions) || configuration.expeditionPlan?.length || 0
    ))),
    strategies: distinctStrings(campaigns.map((campaign) => campaign.strategy)),
    campaignModes: distinctStrings(campaigns.map((campaign) => (
      campaign.campaignProgressionMode ? "progression" : "repeated"
    ))),
    economicPolicies: distinctStrings(campaigns.map((campaign) => (
      campaign.betweenExpeditionPolicy
    ))),
    desiredTurnaroundDistances: distinctNumbers(campaigns.flatMap((campaign) => (
      campaign.expeditionPlan ?? []
    ))),
    configurations: plans,
    automation: {
      healingEnabled: distinctValues(configurations.map((configuration) => configuration.healingEnabled)),
      autoSellRecoveredLoot: distinctValues(configurations.map(
        (configuration) => configuration.autoSellRecoveredLoot,
      )),
    },
    rng: {
      deterministic: true,
      randomSource: "GameRandom",
      campaignSeedField: "campaignSeed",
      expeditionSeedFormat: "<campaignSeed>:expedition-<zero-based-index>",
      preparationSeedFormat: "<campaignSeed>:preparation",
    },
  };
}

function compactCampaign(campaign) {
  const expeditions = (campaign.expeditions ?? []).map((entry) => (
    compactExpedition(entry, campaign)
  ));
  return {
    campaignSummary: compactCampaignSummary(campaign, expeditions),
    expeditions,
    notableEvents: compactNotableEvents(campaign),
  };
}

function compactBatchSummary(summary, campaigns) {
  const compactSummary = compactOmitZeroNumbers(compactClone(summary));
  if (compactSummary.groups) {
    const groupFields = {
      strategy: (campaign) => campaign.strategy,
      betweenExpeditionPolicy: (campaign) => campaign.betweenExpeditionPolicy,
      planKey: (campaign) => campaign.planKey,
    };
    compactSummary.groups = Object.fromEntries(Object.entries(compactSummary.groups)
      .filter(([field]) => !groupFields[field]
        || new Set(campaigns.map(groupFields[field])).size > 1));
  }
  return compactSummary;
}

function compactCampaignSummary(campaign, expeditions) {
  const summary = {};
  const duplicatedCampaignFields = new Set([
    ...COMPACT_CAMPAIGN_OMISSIONS,
    "seed",
    "betweenExpeditionPolicy",
    "simulationConfiguration",
    "expeditionPlan",
    "planKey",
    "completedPlan",
    "stopReason",
    "stopCategory",
    "hardFailure",
    "hardFailureReason",
    "startingGold",
    "endingGold",
    "startingProvisionStock",
    "endingProvisionStock",
    "startingArthurHealth",
    "endingArthurHealth",
  ]);
  Object.entries(campaign).forEach(([key, value]) => {
    if (duplicatedCampaignFields.has(key)) return;
    summary[key] = compactClone(value);
  });
  const plan = campaign.expeditionPlan ?? [];
  const equipmentPurchasesById = compactCountById(
    expeditions.flatMap((entry) => entry.equipment.purchases), "itemId",
  );
  const equipmentPurchaseExpeditionsById = compactValuesById(
    expeditions.flatMap((entry) => entry.equipment.purchases.map((purchase) => ({
      itemId: purchase.itemId,
      value: entry.expeditionNumber,
    }))),
  );
  const equipmentCraftsByRecipeId = compactCountById(
    expeditions.flatMap((entry) => entry.equipment.crafts), "recipeId",
  );
  const equipmentCraftExpeditionsByRecipeId = compactValuesById(
    expeditions.flatMap((entry) => entry.equipment.crafts.map((craft) => ({
      recipeId: craft.recipeId,
      value: entry.expeditionNumber,
    }))), "recipeId",
  );
  const encounterCounts = compactMergeMaps(
    ...expeditions.map((entry) => entry.encounters.encountersById),
  );
  const encounterOutcomes = compactMergeNestedCounts(
    ...expeditions.map((entry) => entry.encounters.outcomesById),
  );
  const encounterChoices = compactMergeNestedCounts(
    ...expeditions.map((entry) => entry.encounters.choicesById),
  );
  const injuriesBySource = compactMergeMaps(
    ...expeditions.map((entry) => entry.injuries.gained.bySource),
  );
  const injuriesByCharacter = compactMergeMaps(
    ...expeditions.map((entry) => entry.injuries.gained.byCharacter),
  );
  const companionsUsedById = compactCountById(
    expeditions.flatMap((entry) => entry.party.activeParty
      .filter((characterId) => characterId !== "arthur")
      .map((characterId) => ({ characterId }))),
    "characterId",
  );
  const campaignItemsAcquiredById = compactMergeMaps(
    ...expeditions.map((entry) => entry.progression.campaignItemsAcquiredById),
  );
  const recipesUsedById = compactMergeMaps(
    ...expeditions.map((entry) => entry.crafting.recipesUsedById),
  );
  const compactAggregates = compactOmitZeroNumbers(summary);
  return {
    ...compactAggregates,
    campaignSeed: campaign.seed,
    economicPolicy: campaign.betweenExpeditionPolicy,
    desiredTurnaroundPlan: compactClone(plan),
    finalOutcome: {
      completed: Boolean(campaign.completedPlan),
      stopReason: campaign.stopReason ?? null,
      stopCategory: campaign.stopCategory ?? null,
      hardFailure: Boolean(campaign.hardFailure),
      hardFailureReason: campaign.hardFailureReason ?? null,
    },
    progression: {
      mode: campaign.campaignProgressionMode ? "current-campaign" : "repeated-route",
      routeSequence: compactClone(campaign.routeSequence ?? []),
      routeAttemptSequence: compactClone(campaign.routeAttemptSequence ?? []),
      routesCompleted: compactClone(campaign.routesCompleted ?? []),
      attemptsByRoute: compactClone(campaign.attemptsByRoute ?? {}),
      supplyRunCount: Number(campaign.supplyRunCount) || 0,
      supplyRunsByRoute: compactClone(campaign.supplyRunsByRoute ?? {}),
      progressionDeferredCount: Number(campaign.progressionDeferredCount) || 0,
      progressionDeferralsByRoute: compactClone(campaign.progressionDeferralsByRoute ?? {}),
      objectiveDistanceFloorViolations: Number(campaign.objectiveDistanceFloorViolations) || 0,
      prerequisiteRunCount: Number(campaign.prerequisiteRunCount) || 0,
      prerequisiteRunsByRoute: compactClone(campaign.prerequisiteRunsByRoute ?? {}),
      routeCompletionAttempt: compactClone(campaign.routeCompletionAttempt ?? {}),
      routeCompletionStatus: compactClone(campaign.routeCompletionStatus ?? {}),
      waterOfBarentonSecured: Boolean(campaign.waterOfBarentonSecured),
      morgansTokenSecured: Boolean(campaign.morgansTokenSecured),
      merlinFound: Boolean(campaign.merlinFound),
      boundWardenEncountered: Number(campaign.boundWardenEncountered) || 0,
      boundWardenVictories: Number(campaign.boundWardenVictories) || 0,
      barentonFirstExpedition: campaign.barentonFirstExpedition ?? null,
      barentonRitualKnowledgeSecuredOn: campaign.barentonRitualKnowledgeSecuredOn ?? null,
      barentonApproachKnowledgeSecuredOn: campaign.barentonApproachKnowledgeSecuredOn ?? null,
      barentonDiscoveryReturnCount: Number(campaign.barentonDiscoveryReturnCount) || 0,
      barentonDiscoveryReturnRate: Number(campaign.barentonDiscoveryReturnRate) || 0,
      valFirstExpedition: campaign.valFirstExpedition ?? null,
      valUnderstandingSecuredOn: campaign.valUnderstandingSecuredOn ?? null,
      valDiscoveryReturnCount: Number(campaign.valDiscoveryReturnCount) || 0,
      valDiscoveryReturnRate: Number(campaign.valDiscoveryReturnRate) || 0,
      morganOfferReached: Number(campaign.morganOfferReached) || 0,
      guardianReached: Number(campaign.guardianReached) || 0,
      guardianVictories: Number(campaign.guardianVictories) || 0,
      finalProgressionStage: campaign.finalProgressionStage ?? null,
      currentContentCompleted: Boolean(campaign.currentContentCompleted),
    },
    startingStateSummary: compactCampaignState(campaign.startingState),
    endingStateSummary: compactCampaignState(campaign.endingState),
    equipmentPurchasesById,
    equipmentPurchaseExpeditionsById,
    equipmentCraftsByRecipeId,
    equipmentCraftExpeditionsByRecipeId,
    encountersById: encounterCounts,
    encounterOutcomesById: encounterOutcomes,
    encounterChoicesById: encounterChoices,
    injuriesBySource,
    injuriesByCharacter,
    companionsUsedById,
    campaignItemsAcquiredById,
    recipesUsedById,
  };
}

function compactExpedition(entry, campaign) {
  const run = entry.expeditionTelemetry ?? {};
  const replay = run.replay ?? entry.replay ?? {};
  const startingState = replay.startingPlayerState ?? {};
  const endingState = run.endingPlayerState ?? entry.stateAfter ?? {};
  const activeParty = [...new Set(run.companions ?? startingState.selectedCompanions
    ?? (startingState.selectedCompanion ? [startingState.selectedCompanion] : []))];
  const startingHealthByCharacter = compactPartyHealth(
    startingState, activeParty, entry.startingHealth,
  );
  const endingHealthByCharacter = {
    ...compactPartyHealth(endingState, activeParty, entry.endingHealth),
    ...compactClone(run.finalPartyHealth ?? {}),
  };
  const encounters = compactEncounterSummary(run);
  const combat = compactCombatSummary(entry, run, encounters);
  const injuries = compactInjurySummary(entry, run);
  const crafting = compactCraftingSummary(entry, run);
  const rest = compactRestSummary(run);
  const materials = compactMaterialSummary(entry, run, crafting);
  const progression = compactProgressionSummary(entry, startingState, endingState);
  const equipment = compactEquipmentSummary(entry, run, endingState);
  const lootRecoveredById = compactItemEntriesToMap(run.lootRecovered);
  const lootLostById = compactItemEntriesToMap(run.lootLost);
  const goldEarnedTotal = Number(entry.goldEarnedDirect ?? run.goldGained) || 0;
  const goldEarnedFromSales = Number(entry.goldEarnedFromSales) || 0;
  const returnRewardGold = Number(run.returnRewardContents?.gold) || 0;
  const encounterGold = (run.encounters ?? []).reduce(
    (sum, encounter) => sum + Math.max(0, Number(encounter.resourceChanges?.goldCarried) || 0),
    0,
  );
  const goldEarnedDirect = encounterGold > 0
    ? encounterGold : Math.max(0, goldEarnedTotal - returnRewardGold);
  const otherIncome = Math.max(0, goldEarnedTotal - goldEarnedDirect - returnRewardGold);
  const craftingGoldCost = Number(crafting.goldCost) || 0;
  const spendingByCategory = {
    provisions: Number(entry.provisionCost) || 0,
    healing: Number(entry.healingCost) || 0,
    equipmentAndItems: Number(entry.itemPurchaseGoldSpent) || 0,
    crafting: craftingGoldCost,
  };
  spendingByCategory.total = Object.values(spendingByCategory)
    .reduce((sum, value) => sum + value, 0);
  const finalArthurHealth = Number(run.finalArthurHealth ?? entry.endingHealth) || 0;
  const arthurDied = finalArthurHealth <= 0;
  const returnedSuccessfully = Boolean(entry.success ?? run.returnedSafely);
  const companionIncapacitations = activeParty.filter((characterId) => (
    characterId !== "arthur" && (Number(endingHealthByCharacter[characterId]) || 0) <= 0
  ));
  const plannedTargetDistance = Number(entry.departureTargetDistance ?? entry.targetDistance) || 0;
  const maximumDistanceReached = Number(entry.actualMaximumDistance ?? run.maximumDistance) || 0;
  const encounterProvisionReserve = Number(entry.encounterProvisionReserve) || 0;
  const provisions = compactOmitZeroNumbers({
    stockBeforePreparation: Number(entry.startingProvisionStock) || 0,
    starting: Number(run.startingProvisions ?? entry.provisionsPacked) || 0,
    purchased: Number(entry.provisionsPurchased) || 0,
    packed: Number(entry.provisionsPacked) || 0,
    consumed: Number(entry.provisionsConsumed ?? run.provisionsConsumed) || 0,
    found: Number(entry.provisionsFound ?? run.provisionsGained) || 0,
    cooked: (Number(entry.cookingProvisionsGained) || 0)
      + (Number(entry.innCookingProvisionsGained) || 0),
    generatedAtInn: Number(entry.innCookingProvisionsGained) || 0,
    returned: Number(entry.provisionsReturned ?? run.provisionsReturned) || 0,
    remaining: Number(run.provisionsRemaining) || 0,
    endingStock: Number(entry.endingProvisionStock) || 0,
    provisionExhaustionFailure: Boolean(entry.provisionExhaustionFailure),
    estimatedReturnRequirement: entry.emergencyReturnEstimatedRequirement
      ?? run.emergencyReturnEstimatedRequirement ?? null,
    returnRequirementAtTurnaround: entry.emergencyReturnTotalRequirement
      ?? run.emergencyReturnTotalRequirement ?? null,
    returnProvisionsAtTurnaround: entry.emergencyReturnProvisions
      ?? run.emergencyReturnProvisions ?? null,
    returnStrategyTolerance: entry.emergencyReturnStrategyTolerance
      ?? run.emergencyReturnStrategyTolerance ?? null,
    returnTolerance: entry.emergencyReturnTolerance
      ?? run.emergencyReturnTolerance ?? null,
  });
  return {
    expeditionNumber: entry.expeditionNumber,
    expeditionId: entry.expeditionId ?? replay.expeditionId ?? run.expeditionId ?? null,
    routeId: entry.routeId ?? entry.expeditionId ?? replay.expeditionId ?? null,
    campaignStageAtDeparture: entry.campaignStageAtDeparture ?? null,
    routeAttemptNumber: entry.routeAttemptNumber ?? null,
    routeAttemptStatus: entry.routeAttemptStatus ?? null,
    routeAttemptCompleted: Boolean(entry.routeAttemptCompleted),
    routeCompletionReason: entry.routeCompletionReason ?? null,
    routeCompletionItem: entry.routeCompletionItem ?? null,
    runKind: entry.runKind ?? null,
    isPrerequisiteRun: Boolean(entry.isPrerequisiteRun),
    prerequisiteForRoute: entry.prerequisiteForRoute ?? null,
    prerequisiteItemId: entry.prerequisiteItemId ?? null,
    prerequisiteReason: entry.prerequisiteReason ?? null,
    prerequisiteStatus: entry.prerequisiteStatus ?? null,
    prerequisiteAcquired: Boolean(entry.prerequisiteAcquired),
    isSupplyRun: Boolean(entry.isSupplyRun),
    supplyRunForRoute: entry.supplyRunForRoute ?? null,
    supplyRunTargetDistance: entry.supplyRunTargetDistance ?? null,
    supplyRunObjectiveDistance: entry.supplyRunObjectiveDistance ?? null,
    progressionReadiness: entry.progressionReadiness ?? null,
    progressionDeferredReason: entry.progressionDeferredReason ?? null,
    progressionRequiredDistance: Number(entry.progressionRequiredDistance) || 0,
    progressionSupportedDistance: entry.progressionSupportedDistance ?? null,
    objectiveDistanceFloorApplied: Boolean(entry.objectiveDistanceFloorApplied),
    campaignId: campaign.campaignId,
    campaignSeed: campaign.seed,
    expeditionSeed: entry.expeditionSeed ?? run.seed,
    pathId: replay.pathId ?? run.scenario?.pathId ?? null,
    regionId: replay.regionId ?? run.scenario?.regionId ?? null,
    result: {
      maximumDistanceReached,
      returnedSuccessfully,
      failed: !returnedSuccessfully,
      outcome: entry.outcome ?? run.outcome ?? null,
      failureReason: entry.failureReason ?? run.failureReason ?? null,
      emergencyTurnaround: Boolean(entry.emergencyProvisionTurnaround),
      emergencyTurnaroundDistance: entry.emergencyProvisionTurnaroundDistance ?? null,
      returnRewardTier: entry.returnRewardTier ?? run.returnRewardTier ?? null,
      hardFailure: Boolean(entry.hardFailure),
      hardFailureReason: entry.hardFailureReason ?? null,
    },
    planning: {
      strategy: campaign.strategy,
      economicPolicy: campaign.betweenExpeditionPolicy,
      desiredTurnaroundDistance: Number(entry.desiredTargetDistance) || null,
      configuredTargetDistance: Number(entry.configuredTargetDistance) || null,
      routeObjectiveDistance: Number(entry.routeObjectiveDistance) || null,
      plannedTargetDistance,
      actualTargetDistance: Number(entry.actualTargetDistance) || plannedTargetDistance,
      targetDistanceReduction: Number(entry.targetDistanceReduction) || 0,
      targetDistanceReductionReason: entry.targetDistanceReductionReason ?? null,
      progressionReadiness: entry.progressionReadiness ?? null,
      progressionDeferredReason: entry.progressionDeferredReason ?? null,
      progressionRequiredDistance: Number(entry.progressionRequiredDistance) || 0,
      progressionSupportedDistance: entry.progressionSupportedDistance ?? null,
      objectiveDistanceFloorApplied: Boolean(entry.objectiveDistanceFloorApplied),
      strategyConstraints: compactClone(entry.strategyConstraints ?? []),
      selectedPace: entry.paceSelectedAtDeparture ?? run.paceSelectedAtDeparture ?? null,
      selectedRations: entry.rationSelectedAtDeparture ?? run.rationSelectedAtDeparture ?? null,
      departurePassiveFoodEstimate: entry.departurePassiveFoodEstimate ?? null,
      encounterProvisionReserve,
      provisionUncertaintyBuffer: Number(entry.provisionUncertaintyBuffer) || 0,
      provisionUncertaintyBufferUsed: Number(entry.provisionUncertaintyBufferUsed) || 0,
      effectiveProvisionTarget: Number(entry.effectiveProvisionTarget) || null,
      estimatedProvisionRequirement: entry.totalEstimatedProvisionRequirement ?? null,
    },
    economy: compactOmitZeroNumbers({
      startingGold: Number(entry.startingGold) || 0,
      endingGold: Number(entry.endingGold) || 0,
      goldEarned: goldEarnedTotal + goldEarnedFromSales,
      goldEarnedDirect,
      goldEarnedFromSales,
      returnRewardGold,
      otherIncome,
      goldSpent: spendingByCategory.total,
      spendingByCategory,
      netGold: Number(entry.netGold) || 0,
      lootRecoveredById,
      lootLostById,
      recoveredLootValue: Number(entry.lootValueRecovered ?? run.estimatedLootValue) || 0,
      lostLootValue: estimateCampaignItems(entry.lootLost ?? run.lootLost ?? []),
      soldItemsById: compactItemEntriesToMap(entry.soldItems?.map((sale) => ({
        itemId: sale.itemId,
        quantity: sale.quantity,
      }))),
    }),
    items: {
      purchasedById: compactClone(entry.itemsPurchasedById ?? {}),
      packedById: compactClone(entry.itemsPackedById ?? run.itemsPackedById ?? {}),
      consumedById: compactClone(entry.itemsConsumedById ?? run.itemsConsumedById ?? {}),
      returnedById: compactClone(entry.itemsReturnedById ?? run.itemsReturnedById ?? {}),
    },
    provisions,
    party: {
      activeParty: ["arthur", ...activeParty.filter((characterId) => characterId !== "arthur")],
      startingHealthByCharacter,
      endingHealthByCharacter,
      lowestHealthByCharacter: compactLowestPartyHealth(
        startingHealthByCharacter, endingHealthByCharacter, run,
      ),
      arthurDeath: arthurDied ? 1 : 0,
      companionIncapacitations,
      preparationHealing: compactHealingSummary(entry.healingBefore),
      damageTaken: Number(entry.damageTaken) || 0,
      damageTakenByCharacter: compactClone(entry.damageReceivedByPartyMember ?? {}),
    },
    injuries,
    travel: {
      distanceByPace: compactClone(entry.distanceByPace ?? run.distanceByPace ?? {}),
      distanceByRation: compactClone(entry.distanceByRation ?? run.distanceByRation ?? {}),
      paceChanges: compactClone(entry.paceChanges ?? run.paceChanges ?? []),
      rationChanges: compactClone(entry.rationChanges ?? run.rationChanges ?? []),
    },
    rest,
    crafting,
    materials,
    encounters,
    combat,
    bandits: {
      ambushesEncountered: Number(entry.banditAmbushEncounters) || 0,
      ambushVictories: Number(entry.banditAmbushVictories) || 0,
      leaderEligibilityTriggered: Number(entry.banditLeaderEligibilityTriggered) || 0,
      leaderEncounters: Number(entry.banditLeaderEncounters) || 0,
      leaderVictories: Number(entry.banditLeaderVictories) || 0,
      goldRecovered: Number(entry.banditGoldRecovered) || 0,
      lootValueRecovered: Number(entry.banditLootValueRecovered) || 0,
    },
    equipment,
    progression,
    campaignFlagsStaged: compactClone(run.campaignFlagsStaged ?? {}),
    campaignFlagsSettled: Boolean(run.campaignFlagsSettled),
    diagnostics: {
      healingTriggeredByLowHp: Boolean(entry.healingTriggeredByLowHp),
      healingTriggerReason: entry.healingTriggerReason ?? null,
      combatsStartedBelow50Percent: Number(entry.combatsStartedBelow50Percent) || 0,
      combatsStartedBelow25Percent: Number(entry.combatsStartedBelow25Percent) || 0,
      returnedWhileInjured: Boolean(entry.returnedWhileInjured),
    },
  };
}

function compactCampaignState(state) {
  if (!state) return null;
  return {
    expeditionNumber: state.expeditionNumber ?? null,
    gold: state.gold ?? null,
    provisionStock: state.provisionStock ?? null,
    arthurHealth: state.arthurHealth ?? null,
    arthurMaxHealth: state.arthurMaxHealth ?? null,
    equippedItems: compactClone(state.equippedItems ?? {}),
    selectedCompanion: state.selectedCompanion ?? null,
    selectedCompanions: compactClone(state.selectedCompanions ?? []),
    unlockedCompanions: compactClone(state.unlockedCompanions ?? []),
    learnedRecipes: compactClone(state.learnedRecipes ?? []),
    learnedKnowledge: compactClone(state.learnedKnowledge ?? []),
    importantItemsById: Object.fromEntries(Object.entries(state.ownedItems ?? {})
      .filter(([itemId]) => {
        const item = ITEM_DEFINITIONS[itemId];
        return item?.questItem || item?.campaignItem || item?.unique || item?.rarity === "rare";
      })),
    materials: compactClone(state.materials ?? {}),
    packedMaterials: compactClone(state.packedMaterials ?? {}),
    campaignFlags: compactClone(state.campaignFlags ?? {}),
    currentLocation: state.currentLocation ?? null,
  };
}

function compactEncounterSummary(run) {
  const histories = run.encounters ?? [];
  const encountersById = compactCountById(histories, "encounterId");
  const outcomesById = {};
  const choicesById = {};
  const injuryDistances = new Set((run.injuryEvents ?? [])
    .map((event) => Number(event.distance))
    .filter(Number.isFinite));
  const encounterResults = histories.map((encounter) => {
    const category = encounter.completed
      ? encounter.combatTriggered ? "combat-triggered" : "resolved"
      : "incomplete";
    const outcome = outcomesById[encounter.encounterId] ??= {};
    outcome[category] = (outcome[category] ?? 0) + 1;
    const choices = {};
    (encounter.decisions ?? []).forEach((decision) => {
      if (!decision.choiceId) return;
      choices[decision.choiceId] = (choices[decision.choiceId] ?? 0) + 1;
      const byEncounter = choicesById[encounter.encounterId] ??= {};
      byEncounter[decision.choiceId] = (byEncounter[decision.choiceId] ?? 0) + 1;
    });
    const itemsGained = compactItemEntriesToMap(encounter.itemsGained);
    const itemsLost = compactItemEntriesToMap(encounter.itemsLost);
    const resources = compactClone(encounter.resourceChanges ?? {});
    const health = compactClone(encounter.healthChanges ?? {});
    const materials = compactClone(encounter.materialBagChanges ?? {});
    const camp = encounter.eventKind === "camp" || Boolean(encounter.campEventId);
    const notable = compactEncounterIsNotable(encounter.encounterId);
    const nonDefaultChoice = (encounter.decisions ?? []).some((decision) => {
      const stage = (encounter.availableChoices ?? []).find((available) => (
        available.stageId === decision.stageId
      ));
      return stage?.choiceIds?.[0] && stage.choiceIds[0] !== decision.choiceId;
    });
    const meaningful = Boolean(encounter.combatTriggered) || camp || notable
      || hasCompactEntries(itemsGained) || hasCompactEntries(itemsLost)
      || hasCompactEntries(resources) || hasCompactEntries(health) || hasCompactEntries(materials)
      || nonDefaultChoice
      || injuryDistances.has(Number(encounter.distance))
      || (run.emergencyProvisionTurnaround
        && Number(encounter.distance) === Number(run.emergencyProvisionTurnaroundDistance));
    if (!meaningful) return null;
    const result = {
      id: encounter.encounterId,
      d: encounter.distance,
      dir: encounter.direction,
    };
    if (camp) result.camp = true;
    if (encounter.combatTriggered) result.combat = true;
    if (!encounter.completed) result.complete = false;
    if (category !== "resolved" && !encounter.combatTriggered) result.outcome = category;
    if (Object.keys(choices).length) result.choices = choices;
    if (hasCompactEntries(health)) result.hp = health;
    if (hasCompactEntries(resources)) result.resources = resources;
    if (hasCompactEntries(materials)) result.materials = materials;
    if (hasCompactEntries(itemsGained) || hasCompactEntries(itemsLost)) {
      result.items = {};
      if (hasCompactEntries(itemsGained)) result.items.gained = itemsGained;
      if (hasCompactEntries(itemsLost)) result.items.lost = itemsLost;
    }
    return result;
  }).filter(Boolean);
  const combatEncounterIds = histories.filter((encounter) => encounter.combatTriggered)
    .map((encounter) => encounter.encounterId);
  const notableEncounterIds = [...new Set(histories
    .filter((encounter) => compactEncounterIsNotable(encounter.encounterId))
    .map((encounter) => encounter.encounterId))];
  return compactOmitZeroNumbers({
    total: histories.length,
    encountersById,
    outcomesById,
    choicesById,
    combatCount: combatEncounterIds.length,
    combatEncountersById: compactCountById(combatEncounterIds.map((encounterId) => ({ encounterId })), "encounterId"),
    nonCombatCount: histories.length - combatEncounterIds.length,
    notableEncounterIds,
    results: encounterResults,
  });
}

function compactEncounterIsNotable(encounterId) {
  if (["bandit_ambush", "bandit_leader"].includes(encounterId)) return true;
  const tags = ENCOUNTER_DEFINITIONS[encounterId]?.tags ?? [];
  return tags.some((tag) => [
    "rare_loot", "campaign", "companion", "milestone", "fountain", "destination", "quest",
  ].includes(tag));
}

function compactSerializationStats(campaigns) {
  const expeditions = campaigns.flatMap((campaign) => campaign.expeditions ?? []);
  return compactOmitZeroNumbers({
    campaignCount: campaigns.length,
    expeditionCount: expeditions.length,
    detailedEncounterResultsKept: expeditions.reduce(
      (sum, expedition) => sum + (expedition.encounters.results?.length ?? 0), 0,
    ),
    detailedEncounterResultsDropped: expeditions.reduce(
      (sum, expedition) => sum + Math.max(
        0, (expedition.encounters.total ?? 0) - (expedition.encounters.results?.length ?? 0),
      ),
      0,
    ),
  });
}

function compactCombatSummary(entry, run, encounters) {
  const combats = run.combats ?? [];
  const outcomesById = {};
  const enemyTypesById = {};
  let damageDealt = 0;
  let damageReceived = 0;
  let healingPerformed = 0;
  let gaugeControl = 0;
  let resolveStored = 0;
  let resolveSpent = 0;
  let regenerationPerformed = 0;
  let regenerationSuppressedActivations = 0;
  let heavyAttackUses = 0;
  let defendActions = 0;
  const regenerationSuppressedByStatus = {};
  const statusesAppliedById = {};
  const statusDamageById = {};
  const equipmentPassiveTriggers = [];
  combats.forEach((combat) => {
    const result = combat.result ?? "incomplete";
    outcomesById[result] = (outcomesById[result] ?? 0) + 1;
    (combat.enemies ?? []).forEach((enemy) => {
      const enemyId = enemy.id ?? enemy.definitionId;
      if (enemyId) enemyTypesById[enemyId] = (enemyTypesById[enemyId] ?? 0) + 1;
    });
    damageDealt += Number(combat.damageDealt) || 0;
    damageReceived += Number(combat.damageReceived) || 0;
    healingPerformed += Number(combat.healingPerformed) || 0;
    gaugeControl += Number(combat.gaugeControl) || 0;
    resolveStored += Number(combat.resolveStored) || 0;
    resolveSpent += Number(combat.resolveSpent) || 0;
    regenerationPerformed += Number(combat.regenerationPerformed) || 0;
    regenerationSuppressedActivations += Number(combat.regenerationSuppressedActivations) || 0;
    heavyAttackUses += Number(combat.heavyAttackUses) || 0;
    defendActions += Number(combat.defendActions) || 0;
    Object.entries(combat.regenerationSuppressedByStatus ?? {}).forEach(([statusId, count]) => {
      regenerationSuppressedByStatus[statusId] = (regenerationSuppressedByStatus[statusId] ?? 0) + (Number(count) || 0);
    });
    Object.entries(combat.statusesAppliedById ?? {}).forEach(([statusId, count]) => {
      statusesAppliedById[statusId] = (statusesAppliedById[statusId] ?? 0) + (Number(count) || 0);
    });
    Object.entries(combat.statusDamageById ?? {}).forEach(([statusId, amount]) => {
      statusDamageById[statusId] = (statusDamageById[statusId] ?? 0) + (Number(amount) || 0);
    });
    equipmentPassiveTriggers.push(...(combat.equipmentPassiveTriggers ?? []));
  });
  return compactOmitZeroNumbers({
    count: Number(entry.combats) || combats.length,
    victories: outcomesById.victory ?? 0,
    flees: outcomesById.fled ?? 0,
    defeats: outcomesById.defeat ?? 0,
    outcomesById,
    enemyTypesById,
    damageTaken: Number(entry.damageTaken) || damageReceived,
    damageDealt,
    damageReceivedByPartyMember: compactClone(entry.damageReceivedByPartyMember ?? {}),
    attacksReceivedByPartyMember: compactClone(entry.attacksReceivedByPartyMember ?? {}),
    healingPerformed: Number(entry.totalHealingPerformed) || healingPerformed,
    gaugeControl: Number(entry.totalGaugeControl) || gaugeControl,
    abilitiesUsedById: compactClone(entry.abilityUsesById ?? {}),
    itemsUsedById: compactClone(entry.itemUsesById ?? {}),
    statusesAppliedById,
    statusDamageById,
    equipmentPassiveTriggers,
    resolveStored,
    resolveSpent,
    regenerationPerformed,
    regenerationSuppressedActivations,
    regenerationSuppressedByStatus,
    heavyAttackUses,
    defendActions,
    aggressiveEmergencyActions: Number(entry.aggressiveEmergencyActions) || 0,
  });
}

function compactInjurySummary(entry, run) {
  const departure = compactInjuryCollection(entry.injuriesAtDeparture, "departure");
  const gained = compactInjuryCollection(entry.injuriesGained, "gained");
  const treated = compactInjuryCollection(entry.injuriesTreated, "treated");
  const activeAtEnd = compactInjuryCollection(entry.activeInjuriesAtEnd, "active");
  const injuryEvents = run.injuryEvents ?? [];
  return compactOmitZeroNumbers({
    atDeparture: departure,
    gained,
    treated,
    naturallyRecovered: Number(entry.injuriesNaturallyRecovered ?? run.injuriesNaturallyRecovered) || 0,
    naturalRecoveriesByType: compactClone(entry.naturalRecoveriesByType ?? {}),
    activeAtEnd,
    infectionOccurrences: Number(entry.infectionOccurrences ?? run.infectionOccurrences) || 0,
    deepCutsStabilized: Number(entry.deepCutsStabilized ?? run.deepCutsStabilized) || 0,
    exhaustionOccurrences: Number(entry.exhaustionOccurrences ?? run.exhaustionOccurrences) || 0,
    returnedWhileInjured: Boolean(entry.returnedWhileInjured),
    averageRecoveryDistanceByType: compactClone(entry.averageRecoveryDistanceByType ?? {}),
    treatmentMethods: compactCountById((entry.injuryTreatment?.treated ?? []).map((treatment) => ({
      method: treatment.itemId ?? treatment.source ?? "unknown",
    })), "method"),
    eventCountsByType: compactCountById(injuryEvents, "type"),
  });
}

function compactInjuryCollection(collection, _kind) {
  const entries = Object.entries(collection ?? {}).flatMap(([characterId, injuries]) => (
    Array.isArray(injuries)
      ? injuries.map((injury) => ({ ...injury, characterId: injury.characterId ?? characterId }))
      : []
  ));
  const normalizedEntries = Array.isArray(collection)
    ? collection.map((injury) => ({ ...injury }))
    : entries;
  return {
    total: normalizedEntries.length,
    byType: compactCountById(normalizedEntries, "injuryId"),
    byCharacter: compactCountById(normalizedEntries, "characterId"),
    bySource: compactCountById(normalizedEntries, "source"),
  };
}

function compactRestSummary(run) {
  const briefRests = (run.briefRests ?? []).filter((rest) => rest.applied);
  const campRests = (run.campRests ?? []).filter((rest) => rest.applied);
  const fieldHealingByPartyMember = compactMergeMaps(
    ...[...briefRests, ...campRests].map((rest) => rest.healingByPartyMember ?? {}),
  );
  const campEventsById = {};
  (run.campEvents ?? []).forEach((event) => {
    const summary = campEventsById[event.eventId] ??= { count: 0, choicesById: {} };
    summary.count += 1;
    (event.choices ?? []).forEach((choice) => {
      if (choice.choiceId) summary.choicesById[choice.choiceId] = (
        summary.choicesById[choice.choiceId] ?? 0
      ) + 1;
    });
  });
  return compactOmitZeroNumbers({
    briefRestCount: Number(run.briefRestCount) || briefRests.length,
    briefRestHealingByPartyMember: compactMergeMaps(
      ...briefRests.map((rest) => rest.healingByPartyMember ?? {}),
    ),
    campRestCount: Number(run.campRestCount) || campRests.length,
    campHealingByPartyMember: compactMergeMaps(
      ...campRests.map((rest) => rest.healingByPartyMember ?? {}),
    ),
    fieldHealingByPartyMember,
    campEventCount: Number(run.campEventCount) || (run.campEvents ?? []).length,
    campEventsById,
    restHealingModified: compactClone(run.restHealingModified ?? []),
  });
}

function compactCraftingSummary(entry, run) {
  const fieldCooking = run.recipesCooked ?? [];
  const innCooking = entry.innCookingActions ?? [];
  const preparationCrafting = entry.craftingActions ?? [];
  const recipesUsedById = {};
  const providersById = {};
  const itemsCraftedById = {};
  const recordAction = (action, providerFallback) => {
    const recipeId = action.recipeId;
    if (!recipeId) return;
    recipesUsedById[recipeId] = (recipesUsedById[recipeId] ?? 0) + 1;
    const providerId = action.providerId ?? providerFallback ?? "unknown";
    providersById[providerId] = (providersById[providerId] ?? 0) + 1;
    const recipe = RECIPE_DEFINITIONS[recipeId];
    const itemId = action.itemId ?? recipe?.output?.itemId;
    const quantity = Number(action.quantity ?? recipe?.output?.quantity) || 0;
    if (itemId && quantity > 0) itemsCraftedById[itemId] = (itemsCraftedById[itemId] ?? 0) + quantity;
  };
  fieldCooking.forEach((action) => recordAction(action, "campfire"));
  innCooking.forEach((action) => recordAction(action, "inn"));
  preparationCrafting.forEach((action) => recordAction(action, action.providerId ?? "preparation"));
  const allIngredients = compactMergeMaps(
    entry.ingredientsConsumedById ?? {},
    entry.innIngredientsConsumedById ?? {},
    ...preparationCrafting.map((action) => compactMergeMaps(
      action.ingredientsConsumed ?? {},
      action.materialsConsumed ?? {},
      action.itemsConsumed ?? {},
    )),
  );
  return compactOmitZeroNumbers({
    actions: fieldCooking.length + innCooking.length + preparationCrafting.length,
    goldCost: [...fieldCooking, ...innCooking, ...preparationCrafting]
      .reduce((sum, action) => sum + (Number(action.goldCost) || 0), 0),
    recipesUsedById,
    providersById,
    itemsCraftedById,
    ingredientsConsumedById: allIngredients,
    fieldCooking: {
      actions: fieldCooking.length,
      recipesById: compactCountById(fieldCooking, "recipeId"),
      provisionsGenerated: Number(entry.cookingProvisionsGained) || 0,
    },
    innCooking: {
      actions: innCooking.length,
      recipesById: compactCountById(innCooking, "recipeId"),
      provisionsGenerated: Number(entry.innCookingProvisionsGained) || 0,
    },
    preparationCrafting: {
      actions: preparationCrafting.length,
      recipesById: compactCountById(preparationCrafting, "recipeId"),
    },
  });
}

function compactMaterialSummary(entry, run, crafting) {
  const startingBag = run.startingMaterialBag ?? entry.startingMaterialBag ?? {};
  const endingBag = run.materialBagAtEnd ?? entry.materialBagAtEnd ?? {};
  return compactOmitZeroNumbers({
    foundById: compactClone(entry.materialsFoundDuringExpedition ?? run.materialsFoundDuringExpedition ?? {}),
    consumedById: compactClone(crafting.ingredientsConsumedById),
    returnedById: compactClone(entry.materialsReturnedSafely ?? run.materialsReturnedSafely ?? {}),
    lostById: compactClone(entry.unsecuredMaterialsLost ?? run.unsecuredMaterialsLost ?? {}),
    rejectedById: compactClone(entry.materialsRejectedDueToCapacity ?? run.materialsRejectedDueToCapacity ?? {}),
    bagCapacity: Number(entry.materialBagCapacity ?? run.materialBagCapacity) || startingBag.capacity || 0,
    startingBag: compactClone(startingBag),
    endingBag: compactClone(endingBag),
    startingUsed: compactQuantityTotal(startingBag.contents),
    endingUsed: compactQuantityTotal(endingBag.contents),
  });
}

function compactProgressionSummary(entry, startingState, endingState) {
  const recipesLearned = compactArrayDifference(
    endingState.learnedRecipes, startingState.learnedRecipes,
  );
  const knowledgeLearned = compactArrayDifference(
    endingState.learnedKnowledge, startingState.learnedKnowledge,
  );
  const companionsUnlocked = compactArrayDifference(
    endingState.unlockedCompanions, startingState.unlockedCompanions,
  );
  const expeditionUnlocks = compactArrayDifference(
    endingState.unlockedExpeditions, startingState.unlockedExpeditions,
  );
  const campaignItemsAcquiredById = compactItemEntriesToMap(
    (entry.expeditionTelemetry?.lootRecovered ?? []).filter((loot) => {
      const item = ITEM_DEFINITIONS[loot.itemId];
      return item?.questItem || item?.campaignItem || item?.unique || item?.rarity === "rare";
    }),
  );
  return {
    recipesLearned,
    knowledgeLearned,
    companionsUnlocked,
    expeditionUnlocks,
    campaignItemsAcquiredById,
    campaignFlagsChanged: compactChangedMap(
      startingState.campaignFlags ?? {}, endingState.campaignFlags ?? {},
    ),
    campaignFlagsStaged: compactClone(entry.expeditionTelemetry?.campaignFlagsStaged ?? {}),
    campaignFlagsSettled: Boolean(entry.expeditionTelemetry?.campaignFlagsSettled),
  };
}

function compactEquipmentSummary(entry, run, endingState) {
  const purchases = (entry.equipmentPurchases ?? []).map((purchase) => ({
    itemId: purchase.itemId,
    equipmentSlot: purchase.equipmentSlot ?? ITEM_DEFINITIONS[purchase.itemId]?.equipmentSlot ?? null,
    quantity: Number(purchase.quantity) || 1,
    goldCost: Number(purchase.goldCost) || 0,
  }));
  const crafts = (entry.equipmentCraftingActions ?? []).map((craft) => ({
    recipeId: craft.recipeId,
    itemId: craft.itemId ?? RECIPE_DEFINITIONS[craft.recipeId]?.output?.itemId ?? null,
    providerId: craft.providerId ?? RECIPE_DEFINITIONS[craft.recipeId]?.craftingProvider ?? null,
    equipmentSlot: craft.equipmentSlot
      ?? ITEM_DEFINITIONS[craft.itemId]?.equipmentSlot
      ?? null,
    quantity: Number(craft.quantity) || 1,
    goldCost: Number(craft.goldCost) || 0,
    materialsConsumed: compactClone(craft.materialsConsumed ?? craft.materialBagConsumed ?? {}),
    itemsConsumed: compactClone(craft.itemsConsumed ?? {}),
  }));
  const equipActions = (entry.equipmentChanges ?? []).map((change) => ({
    itemId: change.itemId,
    equipmentSlot: change.equipmentSlot,
    previousItemId: change.previousItemId ?? null,
    source: change.source ?? "owned-inventory",
    strategy: change.strategy ?? null,
    score: Number(change.score),
  }));
  const acquired = (run.lootRecovered ?? [])
    .filter((loot) => ITEM_DEFINITIONS[loot.itemId]?.equippable)
    .map((loot) => ({
      itemId: loot.itemId,
      equipmentSlot: ITEM_DEFINITIONS[loot.itemId]?.equipmentSlot ?? null,
      quantity: Number(loot.quantity) || 1,
      source: "loot",
    }));
  const equippedAtDeparture = compactClone(run.loadout ?? {});
  const equippedAtReturn = compactClone(endingState.equippedItems ?? {});
  const changes = {};
  [...new Set([...Object.keys(equippedAtDeparture), ...Object.keys(equippedAtReturn)])]
    .forEach((slot) => {
      if (equippedAtDeparture[slot] !== equippedAtReturn[slot]) {
        changes[slot] = {
          from: equippedAtDeparture[slot] ?? null,
          to: equippedAtReturn[slot] ?? null,
        };
      }
    });
  return {
    equippedAtDeparture,
    purchases,
    crafts,
    acquired,
    equipActions,
    changes,
    equippedAtReturn,
  };
}

function compactNotableEvents(campaign) {
  const events = [];
  const previousEquipment = compactClone(campaign.startingState?.equippedItems ?? {});
  (campaign.expeditions ?? []).forEach((entry) => {
    const run = entry.expeditionTelemetry ?? {};
    if (entry.isPrerequisiteRun) {
      events.push({
        type: "prerequisite-run",
        expeditionNumber: entry.expeditionNumber,
        routeId: entry.routeId ?? null,
        prerequisiteForRoute: entry.prerequisiteForRoute ?? null,
        prerequisiteItemId: entry.prerequisiteItemId ?? null,
        reason: entry.prerequisiteReason ?? null,
        status: entry.prerequisiteStatus ?? null,
        acquired: Boolean(entry.prerequisiteAcquired),
      });
    }
    if (entry.progressionReadiness === "deferred") {
      events.push({
        type: "progression-deferred",
        expeditionNumber: entry.expeditionNumber,
        routeId: entry.campaignStageAtDeparture ?? null,
        reason: entry.progressionDeferredReason ?? null,
        requiredDistance: Number(entry.progressionRequiredDistance) || 0,
        supportedDistance: entry.progressionSupportedDistance ?? null,
        supplyRun: Boolean(entry.isSupplyRun),
      });
    }
    (entry.equipmentPurchases ?? []).forEach((purchase) => events.push({
      type: "equipment-purchased",
      expeditionNumber: entry.expeditionNumber,
      itemId: purchase.itemId,
      equipmentSlot: purchase.equipmentSlot ?? null,
      goldCost: Number(purchase.goldCost) || 0,
    }));
    (entry.equipmentCraftingActions ?? []).forEach((craft) => events.push({
      type: "equipment-crafted",
      expeditionNumber: entry.expeditionNumber,
      recipeId: craft.recipeId,
      itemId: craft.itemId ?? RECIPE_DEFINITIONS[craft.recipeId]?.output?.itemId ?? null,
      providerId: craft.providerId ?? RECIPE_DEFINITIONS[craft.recipeId]?.craftingProvider ?? null,
      equipmentSlot: craft.equipmentSlot
        ?? ITEM_DEFINITIONS[craft.itemId]?.equipmentSlot
        ?? null,
      quantity: Number(craft.quantity) || 1,
      goldCost: Number(craft.goldCost) || 0,
    }));
    (run.lootRecovered ?? [])
      .filter((loot) => ITEM_DEFINITIONS[loot.itemId]?.equippable)
      .forEach((loot) => events.push({
        type: "equipment-acquired",
        expeditionNumber: entry.expeditionNumber,
        itemId: loot.itemId,
        equipmentSlot: ITEM_DEFINITIONS[loot.itemId]?.equipmentSlot ?? null,
        quantity: Number(loot.quantity) || 1,
        source: "loot",
      }));
    const equippedAtDeparture = run.loadout ?? {};
    Object.entries(equippedAtDeparture).forEach(([slot, itemId]) => {
      if (itemId && previousEquipment[slot] !== itemId) {
        const equipChange = [...(entry.equipmentChanges ?? [])]
          .reverse()
          .find((change) => change.equipmentSlot === slot && change.itemId === itemId);
        events.push({
          type: "equipment-equipped",
          expeditionNumber: entry.expeditionNumber,
          equipmentSlot: slot,
          itemId,
          previousItemId: equipChange?.previousItemId ?? previousEquipment[slot] ?? null,
        });
      }
    });
    Object.assign(previousEquipment, equippedAtDeparture);
    (entry.recipesLearned ?? []).forEach((recipeId) => events.push({
      type: "recipe-learned", expeditionNumber: entry.expeditionNumber, recipeId,
    }));
    const progression = compactProgressionSummary(
      entry, entry.replay?.startingPlayerState ?? run.replay?.startingPlayerState ?? {},
      run.endingPlayerState ?? entry.stateAfter ?? {},
    );
    progression.knowledgeLearned.forEach((knowledgeId) => events.push({
      type: "knowledge-learned", expeditionNumber: entry.expeditionNumber, knowledgeId,
    }));
    progression.companionsUnlocked.forEach((companionId) => events.push({
      type: "companion-unlocked", expeditionNumber: entry.expeditionNumber, companionId,
    }));
    progression.expeditionUnlocks.forEach((expeditionId) => events.push({
      type: "expedition-unlocked", expeditionNumber: entry.expeditionNumber, expeditionId,
    }));
    Object.entries(progression.campaignItemsAcquiredById).forEach(([itemId, quantity]) => events.push({
      type: "campaign-item-acquired", expeditionNumber: entry.expeditionNumber, itemId, quantity,
    }));
    Object.entries(progression.campaignFlagsChanged).forEach(([flag, value]) => events.push({
      type: "campaign-flag-changed", expeditionNumber: entry.expeditionNumber, flag, value,
    }));
    Object.entries(progression.campaignFlagsStaged).forEach(([flag, value]) => events.push({
      type: progression.campaignFlagsSettled ? "campaign-flag-secured" : "campaign-flag-staged-lost",
      expeditionNumber: entry.expeditionNumber,
      flag,
      value,
    }));
    (run.encounters ?? []).filter((encounter) => compactEncounterIsNotable(encounter.encounterId))
      .forEach((encounter) => events.push({
        type: "notable-encounter",
        expeditionNumber: entry.expeditionNumber,
        encounterId: encounter.encounterId,
        distance: encounter.distance ?? null,
        outcomeCategory: encounter.combatTriggered
          ? "combat-triggered" : encounter.completed ? "resolved" : "incomplete",
      }));
    if (entry.banditLeaderEncounters > 0) events.push({
      type: "bandit-leader-encountered", expeditionNumber: entry.expeditionNumber,
      distance: entry.actualMaximumDistance ?? null,
    });
    if (entry.banditLeaderVictories > 0) events.push({
      type: "bandit-leader-defeated", expeditionNumber: entry.expeditionNumber,
      distance: entry.actualMaximumDistance ?? null,
    });
    (run.injuryEvents ?? []).filter((event) => ["injury-infected", "injury-treated"].includes(event.type)
      && (event.injuryId === "deep_cut" || event.deepCutStabilized))
      .forEach((event) => events.push({
        type: event.type === "injury-infected" ? "deep-cut-infection" : "deep-cut-treatment",
        expeditionNumber: entry.expeditionNumber,
        injuryId: event.injuryId ?? null,
        characterId: event.characterId ?? null,
        distance: event.distance ?? null,
      }));
    if (entry.emergencyProvisionTurnaround) events.push({
      type: "emergency-turnaround",
      expeditionNumber: entry.expeditionNumber,
      distance: entry.emergencyProvisionTurnaroundDistance ?? null,
    });
    if (entry.hardFailure) events.push({
      type: "expedition-hard-failure",
      expeditionNumber: entry.expeditionNumber,
      reason: entry.hardFailureReason ?? null,
    });
    if (entry.endingHealth <= 0) events.push({
      type: "arthur-death", expeditionNumber: entry.expeditionNumber,
    });
  });
  if (campaign.completedPlan) events.push({
    type: "campaign-completion", expeditionNumber: campaign.expeditions.length,
  });
  return events;
}

function compactPartyHealth(state, activeParty, arthurFallback) {
  const health = { arthur: Number(state.arthurHealth ?? arthurFallback) || 0 };
  activeParty.filter((characterId) => characterId !== "arthur").forEach((characterId) => {
    const value = state.companionStates?.[characterId]?.health;
    if (value !== undefined) health[characterId] = Number(value) || 0;
  });
  return health;
}

function compactLowestPartyHealth(starting, ending, run) {
  const lowest = { ...starting };
  Object.entries(ending).forEach(([characterId, health]) => {
    lowest[characterId] = Math.min(Number(lowest[characterId] ?? health), Number(health) || 0);
  });
  (run.combats ?? []).forEach((combat) => {
    [combat.partyHealthBefore, combat.partyHealthAfter].forEach((healthByCharacter) => {
      Object.entries(healthByCharacter ?? {}).forEach(([characterId, health]) => {
        lowest[characterId] = Math.min(Number(lowest[characterId] ?? health), Number(health) || 0);
      });
    });
  });
  return lowest;
}

function compactHealingSummary(healing) {
  if (!healing?.attempted) return undefined;
  return {
    applied: Boolean(healing.applied),
    goldCost: Number(healing.goldCost) || 0,
    quotedGoldCost: Number(healing.quotedGoldCost) || 0,
    totalHealingAmount: Number(healing.totalHealingAmount) || 0,
    healingByPartyMember: compactClone(healing.healingByPartyMember ?? {}),
    restActionCount: Number(healing.restActionCount) || 0,
  };
}

function compactCountById(entries, idField) {
  const counts = {};
  (entries ?? []).forEach((entry) => {
    const id = typeof entry === "string" ? entry : entry?.[idField];
    if (id === undefined || id === null || id === "") return;
    counts[id] = (counts[id] ?? 0) + 1;
  });
  return counts;
}

function compactValuesById(entries, idField = "itemId") {
  const values = {};
  (entries ?? []).forEach((entry) => {
    const id = entry?.[idField];
    if (!id) return;
    (values[id] ??= []).push(entry.value);
  });
  return values;
}

function compactItemEntriesToMap(entries) {
  const values = {};
  (entries ?? []).forEach((entry) => {
    if (!entry?.itemId) return;
    values[entry.itemId] = (values[entry.itemId] ?? 0) + (Number(entry.quantity) || 0);
  });
  return values;
}

function compactMergeMaps(...maps) {
  const merged = {};
  maps.forEach((map) => Object.entries(map ?? {}).forEach(([id, value]) => {
    merged[id] = (merged[id] ?? 0) + (Number(value) || 0);
  }));
  return merged;
}

function compactMergeNestedCounts(...maps) {
  const merged = {};
  maps.forEach((map) => Object.entries(map ?? {}).forEach(([id, counts]) => {
    const target = merged[id] ??= {};
    Object.entries(counts ?? {}).forEach(([key, value]) => {
      target[key] = (target[key] ?? 0) + (Number(value) || 0);
    });
  }));
  return merged;
}

function compactQuantityTotal(values) {
  return Object.values(values ?? {}).reduce((sum, value) => sum + (Number(value) || 0), 0);
}

function compactArrayDifference(after = [], before = []) {
  const previous = new Set(Array.isArray(before) ? before : []);
  return [...new Set((Array.isArray(after) ? after : []).filter((value) => !previous.has(value)))];
}

function compactChangedMap(before = {}, after = {}) {
  const changed = {};
  [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])].forEach((key) => {
    if (JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key])) {
      changed[key] = compactClone(after?.[key] ?? null);
    }
  });
  return changed;
}

function compactClone(value) {
  return value === undefined ? undefined : deepCampaignClone(value);
}

function hasCompactEntries(value) {
  return value && typeof value === "object" && Object.keys(value).length > 0;
}

function compactOmitZeroNumbers(value) {
  if (Array.isArray(value)) return value.map(compactOmitZeroNumbers);
  if (!value || typeof value !== "object") return value === 0 ? undefined : value;
  return Object.fromEntries(Object.entries(value)
    .filter(([, entry]) => entry !== 0)
    .map(([key, entry]) => [key, compactOmitZeroNumbers(entry)]));
}

function compactClean(value) {
  if (Array.isArray(value)) {
    const entries = value.map(compactClean).filter((entry) => entry !== undefined);
    return entries.length ? entries : undefined;
  }
  if (!value || typeof value !== "object") return value === null ? undefined : value;
  const entries = Object.entries(value)
    .map(([key, entry]) => [key, compactClean(entry)])
    .filter(([, entry]) => entry !== undefined);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function distinctCompactValues(values) {
  const unique = [];
  const seen = new Set();
  values.forEach((value) => {
    const key = JSON.stringify(value);
    if (seen.has(key)) return;
    seen.add(key);
    unique.push(compactClone(value));
  });
  return unique;
}

function distinctValues(values) {
  return [...new Set(values.filter((value) => value !== undefined))];
}

function distinctStrings(values) {
  return distinctValues(values.filter((value) => value !== null)).map(String);
}

function distinctNumbers(values) {
  return [...new Set(values.map((value) => Number(value)).filter(Number.isFinite))];
}

function createBetweenPolicy(name, tuning) {
  return Object.freeze({ name, ...tuning });
}

function resolveBetweenPolicy(value) {
  if (value && typeof value === "object" && value.name) return value;
  return BetweenExpeditionPolicies[value] ?? BetweenExpeditionPolicies["conservative-sustainer"];
}

function defaultStrategyForBetweenPolicy(policy) {
  if (policy.name === "aggressive-reinvestor") return "aggressive";
  if (policy.name === "conservative-sustainer") return "cautious";
  return "random";
}

function applyBetweenExpeditionPolicy(
  player, shopStocks, policy, targetDistance, healingEnabled, strategyName = null,
  preparationRandom = GameRandom.random, townActions = [],
) {
  const planningStrategy = strategyName ?? defaultStrategyForBetweenPolicy(policy);
  const goldBeforePreparation = player.currentGold;
  const equipmentChanges = EquipmentRules.equipBestOwned(player, planningStrategy);
  equipmentChanges.forEach((change) => {
    townActions.push({
      type: "equip-item",
      itemId: change.itemId,
      equipmentSlot: change.equipmentSlot,
      previousItemId: change.previousItemId,
      source: change.source,
      strategy: change.strategy,
    });
  });
  const restQuote = HealingRules.quoteInnRest(player);
  let healing = {
    attempted: false, intentionallySkipped: true, skippedInsufficientResources: false,
    ...restQuote,
    available: false,
    healthAfter: restQuote.healthBefore,
    healingAmount: 0,
    totalHealingAmount: 0,
    goldCost: 0,
    partyMembers: restQuote.partyMembers.map((member) => ({
      ...member, healthAfter: member.healthBefore, healingAmount: 0,
    })),
    healingByPartyMember: Object.fromEntries(restQuote.partyMembers.map(
      (member) => [member.id, 0],
    )),
  };
  const arthurQuote = restQuote.partyMembers.find((member) => member.id === "arthur");
  const arthurHealthRatio = arthurQuote.healthBefore / arthurQuote.maxHealth;
  const arthurCritical = Number.isFinite(policy.criticalHealingThreshold)
    && arthurHealthRatio < policy.criticalHealingThreshold;
  const partyMembersBelowThreshold = restQuote.partyMembers.filter((member) => {
    if (member.maxHealth <= 0) return false;
    const ratio = member.healthBefore / member.maxHealth;
    return policy.healingThresholdInclusive
      ? ratio <= policy.healingThreshold : ratio < policy.healingThreshold;
  });
  const partyNeedsRest = arthurCritical || partyMembersBelowThreshold.length > 0;
  const healingTriggerReason = arthurCritical
    ? "arthur-critical-below-25-percent"
    : partyMembersBelowThreshold.some((member) => member.id === "arthur")
      ? "arthur-low-below-50-percent"
      : partyMembersBelowThreshold.length > 0 ? "active-companion-below-threshold" : null;
  if (healingEnabled && partyNeedsRest) {
    const restActions = [];
    do {
      const action = HealingRules.restAtInn(player);
      restActions.push(action);
      townActions.push({
        type: "inn-rest",
        goldBefore: player.currentGold + (action.applied ? action.goldCost : 0),
        goldCost: action.goldCost ?? 0,
        goldAfter: player.currentGold,
        applied: Boolean(action.applied),
        quotedGoldCost: action.quotedGoldCost ?? 0,
        healthBefore: action.healthBefore,
        healthAfter: action.healthAfter,
        healingAmount: action.healingAmount ?? 0,
        totalHealingAmount: action.totalHealingAmount ?? 0,
        healingByPartyMember: action.healingByPartyMember,
      });
      if (!action.applied) break;
    } while (HealingRules.activeParty(player).some(
      (member) => member.maxHealth > 0
      && member.health / member.maxHealth < policy.healingThreshold,
    ));
    const result = summarizePolicyHealing(player, restQuote, restActions);
    healing = {
      attempted: true,
      intentionallySkipped: false,
      skippedInsufficientResources: restActions.some((action) => !action.applied && !action.fullHealth),
      ...result,
    };
  }

  const injuryTreatment = treatCampaignInjuries(player, planningStrategy, townActions);

  const companionsBeforeAvailability = selectedCompanionIds(player);
  const unavailableCompanionIds = companionsBeforeAvailability.filter((companionId) => (
    (player.companionStates?.[companionId]?.health ?? 0) <= 0
  ));
  const unavailableCompanionId = unavailableCompanionIds[0] ?? null;
  if (unavailableCompanionIds.length > 0) {
    player.selectedCompanions = selectedCompanionIds(player)
      .filter((companionId) => !unavailableCompanionIds.includes(companionId));
    player.selectedCompanion = player.selectedCompanions[0] ?? null;
    townActions.push({
      type: "select-companions",
      companionsBefore: companionsBeforeAvailability,
      companions: selectedCompanionIds(player),
    });
  }

  const goldAfterHealing = player.currentGold;
  const activeCompanions = selectedCompanionIds(player);
  const capacity = ExpeditionRules.partyProvisionCapacity(activeCompanions);
  let travelSettings = SimulationTravelPolicy.departureSettings(planningStrategy, {
    provisions: player.provisions,
    capacity,
    injuries: player.injuries,
  });
  const encounterProvisionReserve = SimulationProvisionPlanning.encounterReserve(planningStrategy);
  let provisionUncertaintyBuffer = SimulationProvisionPlanning.provisionUncertaintyBuffer(
    planningStrategy, targetDistance,
  );
  const initialProvisionNeed = estimateCampaignProvisionRequirement(
    targetDistance, activeCompanions, policy.provisionMargin, encounterProvisionReserve,
    travelSettings, provisionUncertaintyBuffer,
  );
  const innCooking = strategyName && player.provisions < Math.min(initialProvisionNeed, capacity)
    ? cookAtInn(player, planningStrategy, preparationRandom, townActions)
    : { actions: [], provisionsGained: 0, ingredientsConsumedById: {} };
  travelSettings = SimulationTravelPolicy.departureSettings(planningStrategy, {
    provisions: player.provisions,
    capacity,
    injuries: player.injuries,
  });
  let desiredProvisionStockForNominalDistance = estimateCampaignProvisionRequirement(
    targetDistance, activeCompanions, policy.provisionMargin, encounterProvisionReserve,
    travelSettings, provisionUncertaintyBuffer,
  );
  let desiredProvisionStock = Math.min(desiredProvisionStockForNominalDistance, capacity);
  const provisionStockBeforePurchase = player.provisions;
  const shop = SHOP_DEFINITIONS.village_general_goods;
  const shopStockBeforePurchase = shopStocks[shop.id] ?? 0;
  const affordablePurchaseQuantity = Math.min(
    Math.floor(player.currentGold / shop.provisionsForSale.price),
    shopStockBeforePurchase,
    Math.max(0, capacity - provisionStockBeforePurchase),
  );
  let affordableProvisionStock = Math.min(
    capacity, provisionStockBeforePurchase + affordablePurchaseQuantity,
  );
  let provisionPurchase = CampaignRules.buyProvisionsTo(player, shopStocks, desiredProvisionStock);
  if (provisionPurchase.quantity > 0) {
    townActions.push({
      type: "buy-provisions",
      shopId: "village_general_goods",
      quantity: provisionPurchase.quantity,
      goldCost: provisionPurchase.goldCost,
    });
  }
  // Crossing Aggressive's half-capacity ration threshold changes its actual
  // departure consumption. Re-quote after the first purchase so the bot does
  // not fund a sparse-ration estimate and then leave under a normal-ration
  // departure requirement.
  travelSettings = SimulationTravelPolicy.departureSettings(planningStrategy, {
    provisions: player.provisions,
    capacity,
    injuries: player.injuries,
  });
  provisionUncertaintyBuffer = SimulationProvisionPlanning.provisionUncertaintyBuffer(
    planningStrategy, targetDistance,
  );
  desiredProvisionStockForNominalDistance = estimateCampaignProvisionRequirement(
    targetDistance, activeCompanions, policy.provisionMargin, encounterProvisionReserve,
    travelSettings, provisionUncertaintyBuffer,
  );
  desiredProvisionStock = Math.min(desiredProvisionStockForNominalDistance, capacity);
  if (player.provisions < desiredProvisionStock) {
    const additionalProvisionPurchase = CampaignRules.buyProvisionsTo(
      player, shopStocks, desiredProvisionStock,
    );
    provisionPurchase = {
      ...provisionPurchase,
      applied: provisionPurchase.applied || additionalProvisionPurchase.applied,
      quantity: provisionPurchase.quantity + additionalProvisionPurchase.quantity,
      goldCost: provisionPurchase.goldCost + additionalProvisionPurchase.goldCost,
      shortfall: additionalProvisionPurchase.shortfall,
    };
    if (additionalProvisionPurchase.quantity > 0) {
      townActions.push({
        type: "buy-provisions",
        shopId: "village_general_goods",
        quantity: additionalProvisionPurchase.quantity,
        goldCost: additionalProvisionPurchase.goldCost,
      });
    }
  }
  affordableProvisionStock = Math.min(
    capacity,
    provisionStockBeforePurchase + Math.floor(provisionPurchase.quantity),
  );
  const bandagePlan = strategyName
    ? chooseBandagePlan(strategyName, preparationRandom)
    : { target: 0, minimum: 0, combatUseThreshold: 0, policy: "disabled" };
  const bandagesBeforeCrafting = player.ownedItems.bandages ?? 0;
  const craftingActions = [];
  while ((player.ownedItems.bandages ?? 0) < bandagePlan.target) {
    const crafted = CraftingRules.craft(player, "bandages", "apothecary");
    if (!crafted.applied) break;
    craftingActions.push(crafted);
    townActions.push({
      type: "craft-item",
      providerId: "apothecary",
      recipeId: "bandages",
      itemId: crafted.itemId ?? "bandages",
      quantity: crafted.quantity ?? 1,
      goldCost: crafted.goldCost ?? 0,
      result: deepCampaignClone(crafted),
    });
  }
  const bandagesCrafted = (player.ownedItems.bandages ?? 0) - bandagesBeforeCrafting;
  const bandagesBeforePurchase = player.ownedItems.bandages ?? 0;
  const bandagePackAvailable = player.packedItems.includes("bandages")
    || player.packedItems.length < EXPEDITION_TUNING.packSlots;
  const reserveMinimumBandages = planningStrategy === "aggressive"
    ? Math.min(bandagePlan.target, bandagePlan.minimum)
    : bandagePlan.target;
  const bandagePurchaseTarget = provisionPurchase.shortfall > 0 || !bandagePackAvailable
    ? bandagesBeforePurchase : Math.max(bandagesBeforePurchase, reserveMinimumBandages);
  const bandagePurchaseBeforeEquipment = CampaignRules.buyItemsTo(
    player, shopStocks, "bandages", bandagePurchaseTarget,
    healing.attempted ? HEALING_TUNING.innRestGoldCost : 0,
  );
  if (bandagePurchaseBeforeEquipment.quantity > 0) {
    townActions.push({
      type: "buy-item",
      shopId: "village_general_goods",
      itemId: "bandages",
      quantity: bandagePurchaseBeforeEquipment.quantity,
      goldCost: bandagePurchaseBeforeEquipment.goldCost,
    });
  }
  const requiredProvisionSpend = provisionPurchase.shortfall
    * shop.provisionsForSale.price;
  const survivalSuppliesFunded = provisionPurchase.shortfall <= 0
    && bandagePurchaseBeforeEquipment.shortfall <= 0;
  const equipmentCandidateBeforeFloor = planningStrategy === "aggressive"
    ? findCampaignEquipmentCandidate(
      player, planningStrategy, shopStocks, player.currentGold + requiredProvisionSpend,
    )
    : null;
  const equipmentPurchaseDeferredForProvisions = Boolean(
    planningStrategy === "aggressive"
      && !survivalSuppliesFunded
      && equipmentCandidateBeforeFloor
      && equipmentCandidateBeforeFloor.offer.price
        <= player.currentGold + requiredProvisionSpend,
  );
  const equipmentCraftingActions = !survivalSuppliesFunded
    ? [] : craftUsefulCampaignEquipment(player, planningStrategy, townActions);
  craftingActions.push(...equipmentCraftingActions);
  const equipmentPurchases = !survivalSuppliesFunded
    ? [] : buyCampaignEquipment(player, shopStocks, planningStrategy, townActions);
  const bandagePurchaseAfterEquipment = planningStrategy === "aggressive"
    && survivalSuppliesFunded
    && bandagePackAvailable
    ? CampaignRules.buyItemsTo(player, shopStocks, "bandages", bandagePlan.target)
    : { quantity: 0, goldCost: 0, shortfall: 0, itemId: "bandages" };
  if (bandagePurchaseAfterEquipment.quantity > 0) {
    townActions.push({
      type: "buy-item",
      shopId: "village_general_goods",
      itemId: "bandages",
      quantity: bandagePurchaseAfterEquipment.quantity,
      goldCost: bandagePurchaseAfterEquipment.goldCost,
    });
  }
  const finalEquipmentChanges = EquipmentRules.equipBestOwned(player, planningStrategy);
  equipmentChanges.push(...finalEquipmentChanges);
  finalEquipmentChanges.forEach((change) => {
    townActions.push({
      type: "equip-item",
      itemId: change.itemId,
      equipmentSlot: change.equipmentSlot,
      previousItemId: change.previousItemId,
      source: change.source,
      strategy: change.strategy,
    });
  });
  const bandagePurchase = {
    ...bandagePurchaseBeforeEquipment,
    applied: bandagePurchaseBeforeEquipment.applied || bandagePurchaseAfterEquipment.applied,
    quantity: bandagePurchaseBeforeEquipment.quantity + bandagePurchaseAfterEquipment.quantity,
    goldCost: bandagePurchaseBeforeEquipment.goldCost + bandagePurchaseAfterEquipment.goldCost,
    shortfall: Math.max(0, bandagePlan.target - (player.ownedItems.bandages ?? 0)),
  };
  const equipmentPurchaseGoldSpent = equipmentPurchases.reduce(
    (sum, purchase) => sum + (Number(purchase.goldCost) || 0), 0,
  );
  const bandagesAfterPurchase = player.ownedItems.bandages ?? 0;
  const routeQuestPack = player.selectedExpeditionId === "fountain_of_barenton"
    ? { flask: 1 } : {};
  const bandagesPacked = packCampaignItems(player, {
    ...routeQuestPack,
    bandages: Math.min(bandagePlan.target, bandagesAfterPurchase),
  });
  townActions.push({
    type: "pack-loadout",
    packedItems: deepCampaignClone(player.packedItems),
    packedMaterials: deepCampaignClone(player.packedMaterials),
    bandagesPacked,
  });
  const itemPurchaseGoldSpent = bandagePurchase.goldCost + equipmentPurchaseGoldSpent;
  const itemsPurchasedById = {
    ...(bandagePurchase.quantity > 0 ? { bandages: bandagePurchase.quantity } : {}),
    ...Object.fromEntries(equipmentPurchases.map((purchase) => [purchase.itemId, purchase.quantity])),
  };
  const itemPurchaseGoldSpentById = {
    ...(bandagePurchase.quantity > 0 ? { bandages: bandagePurchase.goldCost } : {}),
    ...Object.fromEntries(equipmentPurchases.map((purchase) => [purchase.itemId, purchase.goldCost])),
  };
  const actualProvisionStockAfterPurchase = player.provisions;
  const provisionStockAvailableToPack = Math.min(actualProvisionStockAfterPurchase, capacity);
  const preferredSafeDistance = maximumCampaignDistanceForProvisions(
    provisionStockAvailableToPack, activeCompanions,
    policy.provisionMargin, encounterProvisionReserve, travelSettings, planningStrategy,
  );
  const encounterReserveSupportedDistance = maximumCampaignDistanceForProvisions(
    provisionStockAvailableToPack, activeCompanions, 0, encounterProvisionReserve, travelSettings,
  );
  const minimumSupportedDistance = maximumCampaignDistanceForProvisions(
    provisionStockAvailableToPack, activeCompanions, 0, 0, travelSettings,
  );
  const safeAffordableDistance = preferredSafeDistance >= 1
    ? preferredSafeDistance
    : encounterReserveSupportedDistance >= 1
      ? encounterReserveSupportedDistance : minimumSupportedDistance;
  const safetyMarginUsed = preferredSafeDistance >= 1 ? policy.provisionMargin : 0;
  const encounterProvisionReserveUsed = preferredSafeDistance >= 1
    || encounterReserveSupportedDistance >= 1 ? encounterProvisionReserve : 0;
  const actualTargetDistance = Math.min(targetDistance, safeAffordableDistance);
  const provisionUncertaintyBufferUsed = preferredSafeDistance >= 1
    ? SimulationProvisionPlanning.provisionUncertaintyBuffer(planningStrategy, actualTargetDistance)
    : 0;
  const targetDistanceReduced = actualTargetDistance < targetDistance;
  const targetDistanceReduction = targetDistance - actualTargetDistance;
  const estimatedProvisionRequirementForChosenDistance = actualTargetDistance >= 1
    ? estimateCampaignProvisionRequirement(
      actualTargetDistance, activeCompanions,
      safetyMarginUsed, encounterProvisionReserveUsed, travelSettings, provisionUncertaintyBufferUsed,
    ) : 0;
  const departurePassiveFoodEstimate = roundCampaignNumber(
    estimateCampaignPassiveProvisionCost(actualTargetDistance, activeCompanions, travelSettings),
  );
  const desiredTargetPassiveFoodEstimate = roundCampaignNumber(
    estimateCampaignPassiveProvisionCost(targetDistance, activeCompanions, travelSettings),
  );
  const targetDistanceReductionReason = !targetDistanceReduced
    ? null
    : desiredProvisionStockForNominalDistance > capacity
      && actualProvisionStockAfterPurchase >= capacity
      ? "party-provision-capacity"
      : preferredSafeDistance < 1 && encounterReserveSupportedDistance >= 1
        ? "preferred-safety-margin-unavailable"
        : encounterReserveSupportedDistance < 1 && minimumSupportedDistance >= 1
          ? "expected-encounter-reserve-unavailable"
        : affordableProvisionStock < desiredProvisionStock
          ? "cannot-afford-target-provisions"
          : "insufficient-provisions-for-target";
  const canSupportAnyExpedition = actualTargetDistance >= 1
    && provisionStockAvailableToPack >= EXPEDITION_TUNING.minimumStartingProvisions;
  const strategyConstraints = [];
  if (healing.attempted && healing.skippedInsufficientResources) {
    strategyConstraints.push({
      type: "preferred-healing-unaffordable",
      quotedGoldCost: healing.quotedGoldCost,
      availableGold: goldBeforePreparation,
    });
  }
  if (unavailableCompanionId) {
    strategyConstraints.push({
      type: "active-companion-unavailable",
      companionId: unavailableCompanionId,
      resolution: "continue-without-companion",
    });
  }
  if (equipmentPurchaseDeferredForProvisions) {
    strategyConstraints.push({
      type: "equipment-purchase-deferred-for-provisions",
      itemId: equipmentCandidateBeforeFloor.itemId,
      itemCost: equipmentCandidateBeforeFloor.offer.price,
      availableGold: player.currentGold,
      requiredProvisionSpend,
      effectiveProvisionTarget: desiredProvisionStockForNominalDistance,
    });
  }
  if (actualProvisionStockAfterPurchase < desiredProvisionStock) {
    strategyConstraints.push({
      type: "preferred-provision-buffer-unavailable",
      desiredProvisionStock,
      actualProvisionStock: actualProvisionStockAfterPurchase,
    });
  }
  if (bandagePlan.target > bandagesBeforePurchase && bandagePurchase.quantity === 0) {
    const reason = !bandagePackAvailable
      ? "preferred-bandages-cannot-fit-pack"
      : provisionPurchase.shortfall > 0
      ? "bandage-purchase-skipped-for-provisions"
      : bandagePurchase.stock <= 0
        ? "preferred-bandage-stock-unavailable" : "preferred-bandages-unaffordable";
    strategyConstraints.push({
      type: reason,
      desiredBandages: bandagePlan.target,
      ownedBandages: bandagesBeforePurchase,
      availableBandages: bandagePurchaseBeforeEquipment.stock,
      availableGold: player.currentGold,
    });
  }
  if (bandagePlan.target > 0 && bandagesPacked < Math.min(bandagePlan.target, bandagesAfterPurchase)) {
    strategyConstraints.push({
      type: "preferred-bandages-cannot-fit-pack",
      desiredBandages: bandagePlan.target,
      bandagesPacked,
      packSlots: EXPEDITION_TUNING.packSlots,
    });
  }
  if (targetDistanceReduced) {
    strategyConstraints.push({
      type: "target-distance-reduced",
      desiredTargetDistance: targetDistance,
      actualTargetDistance,
      reason: targetDistanceReductionReason,
    });
  }
  const hardFailureReason = canSupportAnyExpedition ? null : "cannot-support-any-expedition";
  return {
    policy: policy.name,
    planningStrategy,
    paceId: travelSettings.paceId,
    rationId: travelSettings.rationId,
    healingThreshold: policy.healingThreshold,
    healingThresholdComparison: policy.healingThresholdInclusive ? "at-or-below" : "below",
    criticalHealingThreshold: policy.criticalHealingThreshold ?? null,
    healingTriggeredByLowHp: partyNeedsRest,
    healingTriggerReason,
    desiredTargetDistance: targetDistance,
    actualTargetDistance,
    safeAffordableDistance,
    targetDistanceReduced,
    targetDistanceReduction,
    targetDistanceReductionReason,
    strategyConstraints,
    hardFailure: Boolean(hardFailureReason),
    hardFailureReason,
    healing,
    injuryTreatment,
    healthBeforeHealing: Object.fromEntries(restQuote.partyMembers.map(
      (member) => [member.id, member.healthBefore],
    )),
    healthAfterHealing: Object.fromEntries(restQuote.partyMembers.map(
      (member) => [member.id, member.id === "arthur"
        ? HealingRules.arthurHealth(player)
        : player.companionStates?.[member.id]?.health ?? 0],
    )),
    preferredSafetyMargin: policy.provisionMargin,
    safetyMargin: safetyMarginUsed,
    provisionStockBeforePurchase,
    desiredProvisionStock,
    desiredProvisionStockForNominalDistance,
    effectiveProvisionTarget: desiredProvisionStockForNominalDistance,
    provisionUncertaintyBuffer,
    provisionUncertaintyBufferUsed,
    requiredProvisionSpend,
    survivalSuppliesFunded,
    affordableProvisionStock,
    actualProvisionStockAfterPurchase,
    provisionStockAvailableToPack,
    preferredSafeDistance,
    encounterReserveSupportedDistance,
    minimumSupportedDistance,
    estimatedProvisionRequirementForChosenDistance,
    departurePassiveFoodEstimate,
    desiredTargetPassiveFoodEstimate,
    encounterProvisionReserve,
    encounterProvisionReserveUsed,
    totalEstimatedProvisionRequirement: estimatedProvisionRequirementForChosenDistance,
    preferredProvisionTargetMet: actualProvisionStockAfterPurchase >= desiredProvisionStock,
    provisionPurchase,
    bandagePurchase,
    craftingActions,
    bandagesBeforeCrafting,
    bandagesCrafted,
    bandagesBeforePurchase,
    bandagesAfterPurchase,
    bandagesPurchased: bandagePurchase.quantity,
    bandagesPacked,
    innCookingActions: innCooking.actions,
    innCookingProvisionsGained: innCooking.provisionsGained,
    innIngredientsConsumedById: innCooking.ingredientsConsumedById,
    equipmentChanges,
    equipmentCraftingActions,
    equipmentPurchases,
    equipmentPurchaseGoldSpent,
    equipmentPurchaseDeferredForProvisions,
    itemsPurchasedById,
    itemPurchaseGoldSpentById,
    itemPurchaseGoldSpent,
    packContents: Object.fromEntries(player.packedItems.map((itemId) => [
      itemId,
      itemId === "bandages" ? bandagesPacked : player.ownedItems[itemId],
    ])),
    materialBagContents: deepCampaignClone(player.packedMaterials),
    desiredBandages: bandagePlan.target,
    minimumBandages: bandagePlan.minimum,
    bandagePurchasePolicy: bandagePlan.policy,
    provisionsToPack: Math.min(player.provisions, capacity),
    goldBeforePreparation,
    goldAfterHealing,
    goldAfterPreparation: player.currentGold,
    stopReason: hardFailureReason,
  };
}

function summarizePolicyHealing(player, initialQuote, restActions) {
  const finalParty = HealingRules.activeParty(player);
  const partyMembers = initialQuote.partyMembers.map((quotedMember) => {
    const finalMember = finalParty.find((member) => member.id === quotedMember.id) ?? quotedMember;
    return {
      ...quotedMember,
      healthAfter: finalMember.health,
      healingAmount: finalMember.health - quotedMember.healthBefore,
    };
  });
  const arthur = partyMembers.find((member) => member.id === "arthur");
  return {
    ...restActions[0],
    applied: restActions.some((action) => action.applied),
    healthAfter: arthur.healthAfter,
    healingAmount: arthur.healingAmount,
    totalHealingAmount: partyMembers.reduce((sum, member) => sum + member.healingAmount, 0),
    goldCost: restActions.reduce((sum, action) => sum + action.goldCost, 0),
    quotedGoldCost: restActions.reduce((sum, action) => sum + action.quotedGoldCost, 0),
    partyMembers,
    healingByPartyMember: Object.fromEntries(partyMembers.map(
      (member) => [member.id, member.healingAmount],
    )),
    restActionCount: restActions.filter((action) => action.applied).length,
    restActions,
  };
}

function chooseBandagePlan(strategyName, random = GameRandom.random) {
  const tuning = CAMPAIGN_TUNING.consumablePurchasing.bandages;
  if (strategyName === "aggressive") return { ...tuning.aggressive, policy: "aggressive" };
  if (strategyName === "cautious") return { ...tuning.cautious, policy: "cautious" };
  const randomTuning = tuning.random;
  const roll = () => Math.min(1 - Number.EPSILON, Math.max(0, Number(random()) || 0));
  const shouldBuy = roll() < randomTuning.purchaseChance;
  const target = shouldBuy
    ? randomTuning.minimum + Math.floor(
      roll() * (randomTuning.maximum - randomTuning.minimum + 1),
    ) : 0;
  return { ...randomTuning, target, policy: "random" };
}

function packCampaignItems(player, desiredQuantities) {
  ExpeditionRules.normalizePackedState(player);
  const packed = [...new Set(player.packedItems ?? [])];
  Object.entries(desiredQuantities).forEach(([itemId, desiredQuantity]) => {
    if (desiredQuantity <= 0 || (player.ownedItems[itemId] ?? 0) <= 0
      || packed.includes(itemId) || packed.length >= EXPEDITION_TUNING.packSlots) return;
    packed.push(itemId);
  });
  player.packedItems = packed.slice(0, EXPEDITION_TUNING.packSlots);
  return Math.min(
    Math.max(0, Math.floor(Number(desiredQuantities.bandages) || 0)),
    player.ownedItems.bandages ?? 0,
  ) * (player.packedItems.includes("bandages") ? 1 : 0);
}

function estimateCampaignPassiveProvisionCost(distance, companionId, travelSettings = {}) {
  const baseMultiplier = ExpeditionRules.partyProvisionConsumptionMultiplier(companionId);
  const pace = ExpeditionRules.paceDefinition(travelSettings.paceId);
  const ration = ExpeditionRules.rationDefinition(travelSettings.rationId);
  const multiplier = baseMultiplier * pace.provisionMultiplier * ration.provisionMultiplier;
  return SimulationProvisionPlanning.passiveRoundTripCost(distance, multiplier);
}

function campaignCraftingProviderAvailable(player, providerId) {
  if (!CRAFTING_PROVIDER_DEFINITIONS[providerId]) return false;
  const location = LOCATION_DEFINITIONS[player?.currentLocationId];
  return Boolean(location?.destinations?.some((destinationId) => (
    DESTINATION_DEFINITIONS[destinationId]?.craftingProviderId === providerId
  )));
}

function craftUsefulCampaignEquipment(
  player, strategyName, townActions = [], options = {},
) {
  const recipeDefinitions = options.recipeDefinitions ?? RECIPE_DEFINITIONS;
  const itemDefinitions = options.itemDefinitions ?? ITEM_DEFINITIONS;
  const blockedRecipeIds = new Set();
  const crafted = [];

  while (true) {
    const candidates = Object.values(CRAFTING_PROVIDER_DEFINITIONS)
      .filter((provider) => campaignCraftingProviderAvailable(player, provider.id))
      .flatMap((provider) => CraftingRules.knownRecipesForProvider(
        player, provider.id, recipeDefinitions,
      ).map((recipe) => {
        const itemId = recipe.output?.itemId;
        const item = itemId ? itemDefinitions[itemId] : null;
        const quote = CraftingRules.quote(player, recipe.id, provider.id, {
          context: "town",
          recipeDefinitions,
          itemDefinitions,
        });
        const bestOwned = item?.equipmentSlot
          ? EquipmentRules.bestOwnedForSlot(player, item.equipmentSlot, strategyName, itemDefinitions)
          : null;
        const bestOwnedScore = bestOwned
          ? EquipmentRules.scoreItem(bestOwned.item, strategyName) : Number.NEGATIVE_INFINITY;
        return {
          provider,
          recipe,
          item,
          quote,
          score: EquipmentRules.scoreItem(item, strategyName),
          bestOwnedScore,
        };
      }))
      .filter((candidate) => candidate.item?.equippable
        && candidate.item.equipmentSlot
        && !blockedRecipeIds.has(candidate.recipe.id)
        && candidate.quote.available
        && candidate.score > candidate.bestOwnedScore)
      .sort((left, right) => right.score - left.score
        || left.item.equipmentSlot.localeCompare(right.item.equipmentSlot)
        || left.recipe.id.localeCompare(right.recipe.id));

    const candidate = candidates[0];
    if (!candidate) break;
    const result = CraftingRules.craft(player, candidate.recipe.id, candidate.provider.id, {
      context: "town",
      recipeDefinitions,
      itemDefinitions,
    });
    if (!result.applied) {
      blockedRecipeIds.add(candidate.recipe.id);
      continue;
    }
    const action = {
      ...result,
      providerId: candidate.provider.id,
      equipmentSlot: candidate.item.equipmentSlot,
      ingredientsConsumed: {
        ...(result.materialsConsumed ?? {}),
        ...(result.itemsConsumed ?? {}),
      },
    };
    crafted.push(action);
    townActions.push({
      type: "craft-item",
      providerId: candidate.provider.id,
      recipeId: result.recipeId,
      itemId: result.itemId ?? candidate.recipe.output?.itemId,
      quantity: result.quantity ?? candidate.recipe.output?.quantity ?? 1,
      equipmentSlot: candidate.item.equipmentSlot,
      goldCost: result.goldCost ?? 0,
      ingredientsConsumed: deepCampaignClone(action.ingredientsConsumed),
      result: deepCampaignClone(result),
    });
  }
  return crafted;
}

function buyCampaignEquipment(player, shopStocks, strategyName, townActions = []) {
  const shop = SHOP_DEFINITIONS.village_smithy;
  const candidates = findCampaignEquipmentCandidates(player, strategyName);
  for (const candidate of candidates) {
    const goldReserve = strategyName === "aggressive" ? 0 : 10;
    if (player.currentGold < candidate.offer.price + goldReserve) continue;
    const previousItemId = player.equippedItems?.[candidate.item.equipmentSlot] ?? null;
    const result = EconomyRules.buyItem(player, shop, shopStocks, candidate.itemId, 1);
    if (!result.applied) continue;
    townActions.push({
      type: "buy-item",
      shopId: shop.id,
      itemId: candidate.itemId,
      quantity: result.quantity,
      goldCost: result.goldCost,
    });
    return [{
      ...result,
      equipmentSlot: candidate.item.equipmentSlot,
      previousItemId,
      strategy: strategyName,
    }];
  }
  return [];
}

function findCampaignEquipmentCandidates(player, strategyName) {
  const shop = SHOP_DEFINITIONS.village_smithy;
  return Object.entries(shop.itemsForSale ?? {})
    .map(([itemId, offer]) => ({ item: ITEM_DEFINITIONS[itemId], itemId, offer }))
    .filter(({ item, offer }) => item?.equippable && Number.isFinite(offer.price))
    .filter(({ item }) => {
      const bestOwned = EquipmentRules.bestOwnedForSlot(player, item.equipmentSlot, strategyName);
      const bestOwnedScore = bestOwned
        ? EquipmentRules.scoreItem(bestOwned.item, strategyName) : Number.NEGATIVE_INFINITY;
      return EquipmentRules.scoreItem(item, strategyName) > bestOwnedScore;
    })
    .sort((left, right) => {
      const valueLeft = EquipmentRules.scoreItem(left.item, strategyName);
      const valueRight = EquipmentRules.scoreItem(right.item, strategyName);
      return valueRight - valueLeft || left.offer.price - right.offer.price
        || left.itemId.localeCompare(right.itemId);
    });
}

function findCampaignEquipmentCandidate(
  player, strategyName, shopStocks, availableGold = player.currentGold,
) {
  const shop = SHOP_DEFINITIONS.village_smithy;
  const goldReserve = strategyName === "aggressive" ? 0 : 10;
  return findCampaignEquipmentCandidates(player, strategyName).find((candidate) => (
    (shopStocks?.[`${shop.id}:${candidate.itemId}`] ?? candidate.offer.stock ?? Infinity) > 0
      && candidate.offer.price + goldReserve <= availableGold
  )) ?? null;
}

function cookAtInn(player, strategyName, random = GameRandom.random, townActions = []) {
  const candidates = CraftingRules.knownRecipesForProvider(player, "campfire")
    .map((recipe) => ({
      recipe,
      quote: CraftingRules.quote(player, recipe.id, "campfire", { context: "inn" }),
    }))
    .filter((candidate) => candidate.quote.available && Number(candidate.recipe.output?.provisions) > 0);
  if (!candidates.length) return { actions: [], provisionsGained: 0, ingredientsConsumedById: {} };
  const roll = () => Math.min(1 - Number.EPSILON, Math.max(0, Number(random()) || 0));
  const selected = candidates
    .map((candidate) => {
      const output = Number(candidate.recipe.output.provisions) || 0;
      const ingredientCount = CraftingRules.normalizeRecipeIngredients(candidate.recipe)
        .reduce((sum, ingredient) => sum + (Number(ingredient.quantity) || 0), 0);
      const score = strategyName === "cautious"
        ? output * 2 + output / Math.max(1, ingredientCount)
        : strategyName === "aggressive"
          ? output + output / Math.max(1, ingredientCount) * 2
          : output + output / Math.max(1, ingredientCount);
      return { ...candidate, score };
    })
    .sort((left, right) => right.score - left.score || left.recipe.id.localeCompare(right.recipe.id));
  const candidate = strategyName === "random"
    ? selected[Math.floor(roll() * selected.length)]
    : selected[0];
  const result = CraftingRules.craft(player, candidate.recipe.id, "campfire", { context: "inn" });
  if (!result.applied) return { actions: [], provisionsGained: 0, ingredientsConsumedById: {} };
  const ingredientsConsumedById = {
    ...(result.materialsConsumed ?? {}),
    ...(result.itemsConsumed ?? {}),
  };
  const action = {
      recipeId: result.recipeId,
      providerId: "campfire",
      context: "inn",
      provisionsGained: result.provisions ?? 0,
      ingredientsConsumed: deepCampaignClone(ingredientsConsumedById),
      goldCost: result.goldCost ?? 0,
    };
  townActions.push({ type: "cook-recipe", ...deepCampaignClone(action) });
  return {
    actions: [action],
    provisionsGained: result.provisions ?? 0,
    ingredientsConsumedById,
  };
}

function treatCampaignInjuries(player, strategyName, townActions = []) {
  const treated = [];
  const crafted = [];
  const allowed = strategyName === "cautious"
    ? ["sprained_ankle", "deep_cut", "bruised_ribs", "exhaustion", "poisoned", "infection"]
    : strategyName === "aggressive"
      ? ["deep_cut", "infection", "poisoned"]
      : ["deep_cut", "infection", "exhaustion", "poisoned"];
  InjuryRules.characterIds().forEach((characterId) => {
    InjuryRules.forCharacter(player, characterId).forEach((instance) => {
      const injuryId = InjuryRules.idOf(instance);
      if (!allowed.includes(injuryId)) return;
      const itemId = InjuryRules.treatmentItemFor(injuryId);
      if (!itemId) return;
      if ((player.ownedItems?.[itemId] ?? 0) < 1) {
        const recipe = Object.values(RECIPE_DEFINITIONS).find((candidate) => candidate.output?.itemId === itemId);
        if (recipe && (player.learnedRecipes ?? []).includes(recipe.id)) {
          const result = CraftingRules.craft(player, recipe.id, recipe.craftingProvider);
          if (result.applied) {
            crafted.push({ recipeId: recipe.id, injuryId, characterId });
            townActions.push({
              type: "craft-item",
              providerId: recipe.craftingProvider,
              recipeId: recipe.id,
              itemId: result.itemId ?? recipe.output?.itemId,
              quantity: result.quantity ?? recipe.output?.quantity ?? 1,
              goldCost: result.goldCost ?? 0,
              result: deepCampaignClone(result),
            });
          }
        }
      }
      const result = InjuryRules.treatWithItem(player, characterId, itemId, { source: "campaign-preparation" });
      if (result.applied) {
        treated.push({ ...result, characterId, itemId });
        townActions.push({
          type: "treat-injury",
          characterId,
          injuryId,
          itemId,
          quantity: 1,
        });
      }
    });
  });
  return { treated, crafted };
}

function estimateCampaignProvisionRequirement(
  distance, companionId, safetyMargin, encounterProvisionReserve = 0, travelSettings = {},
  uncertaintyBuffer = 0,
) {
  return Math.ceil(
    estimateCampaignPassiveProvisionCost(distance, companionId, travelSettings)
      + safetyMargin + encounterProvisionReserve + (Number(uncertaintyBuffer) || 0),
  );
}

function maximumCampaignDistanceForProvisions(
  provisions, companionId, safetyMargin, encounterProvisionReserve = 0, travelSettings = {},
  uncertaintyStrategyName = null,
) {
  const baseMultiplier = ExpeditionRules.partyProvisionConsumptionMultiplier(companionId);
  const pace = ExpeditionRules.paceDefinition(travelSettings.paceId);
  const ration = ExpeditionRules.rationDefinition(travelSettings.rationId);
  const multiplier = baseMultiplier * pace.provisionMultiplier * ration.provisionMultiplier;
  const roundTripRate = 2 * EXPEDITION_TUNING.baseProvisionsPerDistance * multiplier;
  const uncertaintyAtEstimate = uncertaintyStrategyName
    ? SimulationProvisionPlanning.provisionUncertaintyBuffer(uncertaintyStrategyName, provisions / Math.max(roundTripRate, 0.0001))
    : 0;
  let distance = Math.max(0, Math.floor(
    (provisions - safetyMargin - encounterProvisionReserve - uncertaintyAtEstimate) / roundTripRate + 1e-9,
  ));
  while (distance > 0
    && estimateCampaignProvisionRequirement(
      distance, companionId, safetyMargin, encounterProvisionReserve, travelSettings,
      uncertaintyStrategyName
        ? SimulationProvisionPlanning.provisionUncertaintyBuffer(uncertaintyStrategyName, distance) : 0,
    ) > provisions) {
    distance -= 1;
  }
  return distance;
}

function normalizeCampaignConfiguration(configuration) {
  const count = Math.max(1, Math.floor(Number(configuration.expeditions ?? configuration.maxExpeditions) || 10));
  const plan = Array.isArray(configuration.expeditionPlan)
    ? configuration.expeditionPlan
    : [Number(configuration.turnaroundDistance) || 50];
  return {
    id: configuration.id ?? "campaign",
    seed: String(configuration.seed ?? "campaign-simulation"),
    strategy: configuration.strategy ?? "cautious",
    betweenExpeditionPolicy: configuration.betweenExpeditionPolicy ?? "conservative-sustainer",
    expeditionPlan: plan.map((distance) => Math.max(1, Number(distance) || 50)),
    maxExpeditions: count,
    campaignMode: configuration.campaignMode === "progression"
      || configuration.progressionMode === true
      || configuration.campaignProgressionMode === true
      ? "progression" : "repeated",
    startingState: configuration.startingState ?? {},
    healingEnabled: configuration.healingEnabled !== false,
    autoSellRecoveredLoot: configuration.autoSellRecoveredLoot !== false,
  };
}

function createCampaignProgressionState() {
  return {
    routeIndex: 0,
    currentRouteId: CAMPAIGN_PROGRESSION_ROUTES[0],
    lastRoute: null,
    lastAttemptReason: null,
    routesCompleted: [],
    supplyRunsByRoute: Object.fromEntries(CAMPAIGN_PROGRESSION_ROUTES.map((routeId) => [routeId, 0])),
    prerequisiteRunCount: 0,
    prerequisiteRunsByRoute: Object.fromEntries(CAMPAIGN_PROGRESSION_ROUTES.map((routeId) => [routeId, 0])),
    attemptsByRoute: Object.fromEntries(CAMPAIGN_PROGRESSION_ROUTES.map((routeId) => [routeId, 0])),
    routeCompletionAttempt: {},
    routeCompletionStatus: Object.fromEntries(CAMPAIGN_PROGRESSION_ROUTES.map((routeId) => [routeId, "pending"])),
    currentContentCompleted: false,
  };
}

function hasCampaignItem(state, itemId) {
  return Number(state?.ownedItems?.[itemId]) > 0;
}

function selectCampaignProgressionExpedition(routeId, player) {
  const prerequisite = CAMPAIGN_PROGRESSION_PREREQUISITES[routeId];
  if (!prerequisite
    || hasCampaignItem(player, prerequisite.itemId)
    || hasCampaignItem(player, "water_of_barenton")) {
    return {
      routeId,
      runKind: "progression",
    };
  }
  return {
    routeId: prerequisite.searchRouteId,
    runKind: "prerequisite",
    prerequisiteForRoute: routeId,
    itemId: prerequisite.itemId,
    reason: prerequisite.reason,
  };
}

function assessProgressionReadiness(
  routeId, desiredTargetDistance, routeObjectiveDistance,
  player, shopStocks, policy, strategyName,
) {
  const preparation = CAMPAIGN_TUNING.provisionPreparation;
  const objectiveDistance = Number(routeObjectiveDistance) || 0;
  const requiredDistance = objectiveDistance > 0
    ? objectiveDistance : preparation.deepObjectiveMinimumDistance;
  if (!routeId
    || (objectiveDistance <= 0 && routeId === "old_forest_road")
    || Number(desiredTargetDistance) < requiredDistance) {
    return {
      status: "ready",
      reason: null,
      requiredDistance: objectiveDistance,
      supportedDistance: null,
    };
  }
  const quote = quoteCampaignProvisionAvailability(
    player, shopStocks, policy, desiredTargetDistance, strategyName,
  );
  const progressionReady = quote.preferredSafeDistance >= Math.min(
    Number(desiredTargetDistance), requiredDistance,
  );
  return {
    status: progressionReady ? "ready" : objectiveDistance > 0 ? "deferred" : "preparation",
    reason: progressionReady ? null : objectiveDistance > 0
      ? "objective-distance-floor" : "deep-objective-preparation",
    requiredDistance: objectiveDistance,
    supportedDistance: quote.preferredSafeDistance,
  };
}

function shouldRunProgressionSupplyRun(
  routeId, desiredTargetDistance, routeObjectiveDistance,
  player, shopStocks, policy, strategyName,
) {
  return assessProgressionReadiness(
    routeId, desiredTargetDistance, routeObjectiveDistance,
    player, shopStocks, policy, strategyName,
  ).status !== "ready";
}

function progressionSupplyRunDistance(strategyName) {
  const targets = CAMPAIGN_TUNING.provisionPreparation.supplyRunTargetDistance;
  return targets[strategyName] ?? targets.random;
}

function quoteCampaignProvisionAvailability(
  player, shopStocks, policy, targetDistance, strategyName,
) {
  const planningStrategy = strategyName ?? defaultStrategyForBetweenPolicy(policy);
  const activeCompanions = selectedCompanionIds(player);
  const capacity = ExpeditionRules.partyProvisionCapacity(activeCompanions);
  const travelSettings = SimulationTravelPolicy.departureSettings(planningStrategy, {
    provisions: player.provisions,
    capacity,
    injuries: player.injuries,
  });
  const encounterProvisionReserve = SimulationProvisionPlanning.encounterReserve(planningStrategy);
  const provisionUncertaintyBuffer = SimulationProvisionPlanning.provisionUncertaintyBuffer(
    planningStrategy, targetDistance,
  );
  const shop = SHOP_DEFINITIONS.village_general_goods;
  const availableShopStock = Math.max(0, Number(shopStocks?.[shop.id]) || 0);
  const affordablePurchaseQuantity = Math.min(
    Math.floor(Math.max(0, Number(player.currentGold) || 0) / shop.provisionsForSale.price),
    availableShopStock,
    Math.max(0, capacity - (Number(player.provisions) || 0)),
  );
  const provisionStock = Math.min(
    capacity,
    Math.max(0, Number(player.provisions) || 0)
      + quoteInnCookingProvisionGain(player, strategyName)
      + affordablePurchaseQuantity,
  );
  return {
    capacity,
    provisionStock,
    desiredProvisionStock: Math.min(capacity, estimateCampaignProvisionRequirement(
      targetDistance, activeCompanions, policy.provisionMargin,
      encounterProvisionReserve, travelSettings, provisionUncertaintyBuffer,
    )),
    preferredSafeDistance: maximumCampaignDistanceForProvisions(
      provisionStock, activeCompanions, policy.provisionMargin,
      encounterProvisionReserve, travelSettings, planningStrategy,
    ),
    provisionUncertaintyBuffer,
  };
}

function quoteInnCookingProvisionGain(player, strategyName) {
  const candidates = CraftingRules.knownRecipesForProvider(player, "campfire")
    .map((recipe) => ({
      recipe,
      quote: CraftingRules.quote(player, recipe.id, "campfire", { context: "inn" }),
    }))
    .filter((candidate) => candidate.quote.available && Number(candidate.recipe.output?.provisions) > 0);
  if (!candidates.length) return 0;
  const scores = candidates.map((candidate) => {
    const output = Number(candidate.recipe.output.provisions) || 0;
    const ingredientCount = CraftingRules.normalizeRecipeIngredients(candidate.recipe)
      .reduce((sum, ingredient) => sum + (Number(ingredient.quantity) || 0), 0);
    const score = strategyName === "cautious"
      ? output * 2 + output / Math.max(1, ingredientCount)
      : strategyName === "aggressive"
        ? output + output / Math.max(1, ingredientCount) * 2
        : output + output / Math.max(1, ingredientCount);
    return { output, score };
  });
  return scores.sort((left, right) => right.score - left.score || right.output - left.output)[0].output;
}

function evaluateCampaignProgressionAttempt(
  routeId, desiredTargetDistance, decision, run, stateBefore, endingState,
) {
  const returnedSafely = Boolean(run.returnedSafely);
  const maximumDistance = Number(run.maximumDistance) || 0;
  const intendedTargetReached = maximumDistance >= Number(desiredTargetDistance);
  const securedQuantity = (itemId) => Number(endingState.ownedItems?.[itemId]) || 0;
  const hadQuantity = (itemId) => Number(stateBefore.ownedItems?.[itemId]) || 0;
  const hardFailure = !returnedSafely && Boolean(
    run.finalArthurHealth <= 0 || isCampaignResourceExhaustion(run.failureReason),
  );
  if (routeId === "old_forest_road") {
    if (returnedSafely && intendedTargetReached) {
      return { completed: true, status: "completed", reason: "returned-at-requested-target" };
    }
    return {
      completed: false,
      status: hardFailure ? "hard-failure" : "returned-not-completed",
      reason: !returnedSafely
        ? (run.failureReason ?? "failed-before-return")
        : decision.targetDistanceReduced || maximumDistance < Number(desiredTargetDistance)
          ? "returned-before-requested-target"
          : "returned-without-meaningful-route-progress",
    };
  }
  if (routeId === "search_for_merlin") {
    const merlinFound = endingState.campaignFlags?.merlin_found === true;
    if (returnedSafely && merlinFound) {
      return {
        completed: true,
        status: "completed",
        reason: "found-merlin",
        securedItemId: "merlins_seal",
      };
    }
    return {
      completed: false,
      status: hardFailure ? "hard-failure" : "returned-not-completed",
      reason: !returnedSafely
        ? (run.failureReason ?? "search-for-merlin-lost-before-safe-return")
        : "returned-without-merlin",
      securedItemId: merlinFound ? "merlins_seal" : null,
    };
  }
  const questItem = routeId === "fountain_of_barenton" ? "water_of_barenton" : "morgans_token";
  const secured = securedQuantity(questItem) > 0;
  const acquiredThisAttempt = securedQuantity(questItem) > hadQuantity(questItem);
  if (returnedSafely && secured) {
    return {
      completed: true,
      status: "completed",
      reason: acquiredThisAttempt ? `secured-${questItem}` : `confirmed-${questItem}-secured`,
      securedItemId: questItem,
    };
  }
  return {
    completed: false,
    status: hardFailure ? "hard-failure" : "returned-not-completed",
    reason: !returnedSafely
      ? `${questItem}-lost-before-safe-return`
      : `returned-without-${questItem}`,
    securedItemId: secured ? questItem : null,
  };
}

function createCampaignPlayer(overrides) {
  const defaults = SaveSystem.createDefaultPlayerState();
  const merged = { ...defaults, ...deepCampaignClone(overrides) };
  merged.ownedItems = { ...defaults.ownedItems, ...(overrides.ownedItems ?? {}) };
  merged.equippedItems = { ...defaults.equippedItems, ...(overrides.equippedItems ?? {}) };
  merged.packedItems = [...(overrides.packedItems ?? defaults.packedItems)];
  merged.materials = { ...defaults.materials, ...(overrides.materials ?? {}) };
  merged.packedMaterials = { ...defaults.packedMaterials, ...(overrides.packedMaterials ?? {}) };
  merged.injuries = InjuryRules.snapshot({ injuries: overrides.injuries ?? defaults.injuries });
  Object.entries(overrides.ownedItems ?? {}).forEach(([itemId, quantity]) => {
    if (MaterialRules.isMaterialId(itemId) && overrides.materials?.[itemId] === undefined) {
      merged.materials[itemId] = Math.max(0, Number(quantity) || 0);
    }
  });
  MaterialRules.migratePlayerMaterials(merged);
  merged.packedItems = merged.packedItems.filter((itemId) => !MaterialRules.isMaterialId(itemId));
  merged.learnedRecipes = [...(overrides.learnedRecipes ?? defaults.learnedRecipes)];
  merged.learnedKnowledge = [...(overrides.learnedKnowledge ?? defaults.learnedKnowledge)];
  merged.learnedAbilityIds = [...(overrides.learnedAbilityIds ?? defaults.learnedAbilityIds)];
  merged.selectedActiveAbilityIds = [...(overrides.selectedActiveAbilityIds ?? defaults.selectedActiveAbilityIds)];
  merged.selectedPassiveAbilityIds = [...(overrides.selectedPassiveAbilityIds ?? defaults.selectedPassiveAbilityIds)];
  AbilityRules.sanitizePlayerState(merged, defaults);
  merged.unlockedCompanions = [...(overrides.unlockedCompanions ?? defaults.unlockedCompanions)];
  merged.selectedCompanions = [...(overrides.selectedCompanions ?? selectedCompanionIds(merged))];
  merged.selectedCompanion = merged.selectedCompanions[0] ?? null;
  merged.unlockedCompanions = [...new Set([
    ...merged.unlockedCompanions,
    ...merged.selectedCompanions,
  ])];
  merged.companionStates = deepCampaignClone(overrides.companionStates ?? defaults.companionStates);
  ExpeditionRules.normalizePackedState(merged);
  return merged;
}

function replaceCampaignPlayer(target, source) {
  Object.keys(target).forEach((key) => delete target[key]);
  Object.assign(target, deepCampaignClone(source));
}

function tagCampaignTownActions(actions, expeditionNumber) {
  return actions.map((action) => ({
    ...action,
    expeditionNumber: Number(action.expeditionNumber) || expeditionNumber,
  }));
}

function campaignStateSnapshot(player, shopStocks, expeditionNumber) {
  return deepCampaignClone({
    expeditionNumber,
    selectedExpeditionId: player.selectedExpeditionId,
    gold: player.currentGold,
    provisionStock: player.provisions,
    faith: player.faith,
    maxFaith: player.maxFaith,
    learnedAbilityIds: player.learnedAbilityIds,
    selectedActiveAbilityIds: player.selectedActiveAbilityIds,
    selectedPassiveAbilityIds: player.selectedPassiveAbilityIds,
    ownedItems: player.ownedItems,
    equippedItems: player.equippedItems,
    packedItems: player.packedItems,
    packedMaterials: player.packedMaterials,
    learnedKnowledge: player.learnedKnowledge,
    materials: player.materials,
    learnedRecipes: player.learnedRecipes,
    campaignFlags: player.campaignFlags ?? {},
    arthurHealth: HealingRules.arthurHealth(player),
    arthurMaxHealth: HealingRules.arthurMaxHealth(player),
    injuries: player.injuries,
    companionStates: player.companionStates,
    unlockedCompanions: player.unlockedCompanions,
    selectedCompanions: selectedCompanionIds(player),
    selectedCompanion: player.selectedCompanion,
    currentLocation: player.currentLocationId,
    shopStocks,
  });
}

function finalizeCampaignTelemetry(
  config, policy, startingState, player, shopStocks, expeditions, decisions, townActions, stopReason,
  progression = null, progressionTransitions = [],
) {
  const endingState = campaignStateSnapshot(player, shopStocks, expeditions.length);
  const totals = (selector) => expeditions.reduce((sum, entry) => sum + (Number(selector(entry)) || 0), 0);
  const totalHealingCost = totals((entry) => entry.healingBefore.goldCost);
  const totalProvisionCost = totals((entry) => entry.provisionCost);
  const itemPurchaseGoldSpentById = campaignCombatTotals(expeditions, "itemPurchaseGoldSpentById");
  const itemsPurchasedById = campaignCombatTotals(expeditions, "itemsPurchasedById");
  const itemsPackedById = campaignCombatTotals(expeditions, "itemsPackedById");
  const itemsConsumedById = campaignCombatTotals(expeditions, "itemsConsumedById");
  const itemsReturnedById = campaignCombatTotals(expeditions, "itemsReturnedById");
  const ingredientsConsumedById = campaignCombatTotals(expeditions, "ingredientsConsumedById");
  const injuriesGained = expeditions.flatMap((entry) => entry.injuriesGained ?? []);
  const injuriesTreated = expeditions.flatMap((entry) => entry.injuriesTreated ?? []);
  const injuriesByType = injuriesGained.reduce((counts, entry) => {
    counts[entry.injuryId] = (counts[entry.injuryId] ?? 0) + 1;
    return counts;
  }, {});
  const recoveryDistanceTotals = injuriesGained.reduce((totalsByType, entry) => {
    if (!(Number(entry.originalRecoveryDistance) > 0)) return totalsByType;
    const current = totalsByType[entry.injuryId] ?? { total: 0, count: 0 };
    current.total += Number(entry.originalRecoveryDistance) || 0;
    current.count += 1;
    totalsByType[entry.injuryId] = current;
    return totalsByType;
  }, {});
  const averageRecoveryDistanceByType = Object.fromEntries(Object.entries(recoveryDistanceTotals)
    .map(([injuryId, values]) => [injuryId, values.total / values.count]));
  const totalItemPurchaseGoldSpent = totals((entry) => entry.itemPurchaseGoldSpent);
  const totalCraftingGoldSpent = totals((entry) => (entry.craftingActions ?? [])
    .reduce((sum, action) => sum + (Number(action.goldCost) || 0), 0));
  const totalGoldEarned = totals((entry) => entry.goldEarnedFromSales + entry.goldEarnedDirect);
  const totalGoldSpent = totalHealingCost + totalProvisionCost
    + totalItemPurchaseGoldSpent + totalCraftingGoldSpent;
  const abilityUsesById = campaignCombatTotals(expeditions, "abilityUsesById");
  const itemUsesById = campaignCombatTotals(expeditions, "itemUsesById");
  const statusesAppliedById = campaignCombatTotals(expeditions, "statusesAppliedById");
  const statusDamageById = campaignCombatTotals(expeditions, "statusDamageById");
  const equipmentPassiveTriggers = expeditions.flatMap(
    (entry) => entry.equipmentPassiveTriggers ?? [],
  );
  const totalResolveStored = totals((entry) => entry.resolveStored);
  const totalResolveSpent = totals((entry) => entry.resolveSpent);
  const totalRegenerationPerformed = totals((entry) => entry.regenerationPerformed);
  const totalRegenerationSuppressedActivations = totals((entry) => entry.regenerationSuppressedActivations);
  const regenerationSuppressedByStatus = campaignCombatTotals(expeditions, "regenerationSuppressedByStatus");
  const totalHeavyAttackUses = totals((entry) => entry.heavyAttackUses);
  const totalDefendActions = totals((entry) => entry.defendActions);
  const netGold = endingState.gold - startingState.gold;
  const successful = expeditions.filter((entry) => entry.success);
  const failed = expeditions.filter((entry) => !entry.success);
  const startingHealthValues = expeditions.map((entry) => entry.startingHealth);
  const endingHealthValues = expeditions.map((entry) => entry.endingHealth);
  const maxHealth = startingState.arthurMaxHealth;
  const startingWealth = campaignLiquidWealth(startingState);
  const endingWealth = campaignLiquidWealth(endingState);
  const netCampaignWealth = endingWealth - startingWealth;
  const stopCategory = campaignStopCategory(stopReason);
  const strategyConstraints = decisions.flatMap((decision) => (
    decision.strategyConstraints ?? []
  ).map((constraint) => ({ expeditionNumber: decision.expeditionNumber, ...constraint })));
  const economicTrend = netCampaignWealth > Math.max(2, expeditions.length)
    ? "economically-growing"
    : netCampaignWealth >= -Math.max(2, expeditions.length)
      ? "roughly-sustainable"
      : netCampaignWealth >= -Math.max(8, expeditions.length * 3)
        ? "slowly-declining"
        : "rapidly-unsustainable";
  const routesCompleted = progression?.routesCompleted ?? [];
  const routeCompletionStatus = progression?.routeCompletionStatus
    ?? Object.fromEntries(CAMPAIGN_PROGRESSION_ROUTES.map((routeId) => [
      routeId,
      expeditions.some((entry) => !entry.isSupplyRun && !entry.isPrerequisiteRun
        && entry.routeId === routeId && entry.routeAttemptCompleted)
        ? "completed" : "not-attempted",
    ]));
  const attemptsByRoute = progression?.attemptsByRoute
    ?? Object.fromEntries(CAMPAIGN_PROGRESSION_ROUTES.map((routeId) => [
      routeId, expeditions.filter((entry) => entry.routeId === routeId).length,
    ]));
  const routeSequence = expeditions.map((entry) => entry.routeId ?? entry.expeditionId);
  const routeAttemptSequence = expeditions
    .filter((entry) => !entry.isSupplyRun && !entry.isPrerequisiteRun)
    .map((entry) => entry.routeId ?? entry.expeditionId);
  const supplyRunsByRoute = progression?.supplyRunsByRoute
    ?? Object.fromEntries(CAMPAIGN_PROGRESSION_ROUTES.map((routeId) => [
      routeId, expeditions.filter((entry) => entry.isSupplyRun && entry.supplyRunForRoute === routeId).length,
    ]));
  const progressionDeferralsByRoute = Object.fromEntries(CAMPAIGN_PROGRESSION_ROUTES.map((routeId) => [
    routeId,
    expeditions.filter((entry) => entry.progressionReadiness === "deferred"
      && Number(entry.progressionRequiredDistance) > 0
      && entry.campaignStageAtDeparture === routeId).length,
  ]));
  const progressionDeferredCount = Object.values(progressionDeferralsByRoute)
    .reduce((sum, count) => sum + count, 0);
  const objectiveDistanceFloorViolations = expeditions.filter((entry) => (
    !entry.isSupplyRun && !entry.isPrerequisiteRun
      && Number(entry.routeObjectiveDistance) > 0
      && Number(entry.actualTargetDistance) < Number(entry.routeObjectiveDistance)
  )).length;
  const waterOfBarentonSecured = Boolean(endingState.ownedItems?.water_of_barenton);
  const morgansTokenSecured = Boolean(endingState.ownedItems?.morgans_token);
  const boundWardenEncountered = expeditions.reduce((count, entry) => count + (
    entry.expeditionTelemetry?.encounters?.filter((encounter) => encounter.encounterId === "bound_warden").length ?? 0
  ), 0);
  const boundWardenVictories = expeditions.reduce((count, entry) => count + (
    entry.expeditionTelemetry?.combats?.filter((combat) => (
      combat.combatId === "bound_warden" && combat.result === "victory"
    )).length ?? 0
  ), 0);
  const encounterCountFor = (encounterId) => expeditions.reduce((count, entry) => count + (
    entry.expeditionTelemetry?.encounters?.filter((encounter) => encounter.encounterId === encounterId).length ?? 0
  ), 0);
  const combatVictoryCountFor = (combatId) => expeditions.reduce((count, entry) => count + (
    entry.expeditionTelemetry?.combats?.filter((combat) => (
      combat.combatId === combatId && combat.result === "victory"
    )).length ?? 0
  ), 0);
  const discoveryFlagsFor = (entry, flags) => flags.filter((flag) => (
    entry.expeditionTelemetry?.campaignFlagsStaged?.[flag] === true
    && entry.success
  ));
  const barentonEntries = expeditions.filter((entry) => (
    !entry.isSupplyRun && !entry.isPrerequisiteRun
      && (entry.routeId ?? entry.expeditionId) === "fountain_of_barenton"
  ));
  const valEntries = expeditions.filter((entry) => (
    !entry.isSupplyRun && !entry.isPrerequisiteRun
      && (entry.routeId ?? entry.expeditionId) === "val_sans_retour"
  ));
  const barentonDiscoveryReturns = barentonEntries.filter((entry) => discoveryFlagsFor(
    entry, ["barenton_ritual_understood", "barenton_approach_known"],
  ).length > 0).length;
  const valDiscoveryReturns = valEntries.filter((entry) => discoveryFlagsFor(
    entry, ["val_way_understood"],
  ).length > 0).length;
  const firstExpeditionWithFlag = (flag) => expeditions.find((entry) => (
    entry.expeditionTelemetry?.campaignFlagsStaged?.[flag] === true && entry.success
  ))?.expeditionNumber ?? null;
  const firstBarentonExpedition = barentonEntries[0]?.expeditionNumber ?? null;
  const firstValExpedition = valEntries[0]?.expeditionNumber ?? null;
  const morganOfferReached = encounterCountFor("val_morgans_offer");
  const guardianReached = encounterCountFor("summoned_guardian");
  const guardianVictories = combatVictoryCountFor("summoned_guardian");
  const merlinFound = endingState.campaignFlags?.merlin_found === true;
  const currentContentCompleted = Boolean(progression?.currentContentCompleted);
  const finalProgressionStage = config.campaignMode === "progression"
    ? currentContentCompleted ? "current-content-completed" : progression?.currentRouteId ?? null
    : null;
  return {
    campaignId: `${config.id}:${config.seed}`,
    seed: config.seed,
    strategy: config.strategy,
    betweenExpeditionPolicy: policy.name,
    simulationConfiguration: {
      id: config.id,
      strategy: config.strategy,
      betweenExpeditionPolicy: policy.name,
      expeditionPlan: config.expeditionPlan,
      maxExpeditions: config.maxExpeditions,
      campaignMode: config.campaignMode,
      healingEnabled: config.healingEnabled,
      autoSellRecoveredLoot: config.autoSellRecoveredLoot,
    },
    expeditionPlan: config.expeditionPlan,
    planKey: config.expeditionPlan.join("-"),
    startingState,
    endingState,
    startingGold: startingState.gold,
    endingGold: endingState.gold,
    startingProvisionStock: startingState.provisionStock,
    endingProvisionStock: endingState.provisionStock,
    startingArthurHealth: startingState.arthurHealth,
    endingArthurHealth: endingState.arthurHealth,
    maxArthurHealth: maxHealth,
    expeditionsAttempted: expeditions.length,
    expeditionsReturned: successful.length,
    expeditionsFailed: failed.length,
    stopReason,
    stopCategory,
    hardFailure: stopCategory === "hard-failure",
    hardFailureReason: stopCategory === "hard-failure" ? stopReason : null,
    strategyConstraints,
    strategyConstraintCount: strategyConstraints.length,
    completedPlan: config.campaignMode === "progression"
      ? currentContentCompleted
      : campaignCompletedPlan(config, expeditions, stopReason),
    campaignProgressionMode: config.campaignMode === "progression",
    routesCompleted: deepCampaignClone(routesCompleted),
    currentRoute: progression?.currentRouteId ?? null,
    lastRoute: progression?.lastRoute ?? expeditions.at(-1)?.routeId ?? null,
    attemptsByRoute: deepCampaignClone(attemptsByRoute),
    routeCompletionAttempt: deepCampaignClone(progression?.routeCompletionAttempt ?? {}),
    routeCompletionStatus: deepCampaignClone(routeCompletionStatus),
    routeSequence,
    routeAttemptSequence,
    supplyRunCount: expeditions.filter((entry) => entry.isSupplyRun).length,
    supplyRunsByRoute: deepCampaignClone(supplyRunsByRoute),
    progressionDeferredCount,
    progressionDeferralsByRoute,
    objectiveDistanceFloorViolations,
    prerequisiteRunCount: expeditions.filter((entry) => entry.isPrerequisiteRun).length,
    prerequisiteRunsByRoute: deepCampaignClone(
      progression?.prerequisiteRunsByRoute
        ?? Object.fromEntries(CAMPAIGN_PROGRESSION_ROUTES.map((routeId) => [
          routeId,
          expeditions.filter((entry) => entry.isPrerequisiteRun
            && entry.prerequisiteForRoute === routeId).length,
        ])),
    ),
    waterOfBarentonSecured,
    morgansTokenSecured,
    merlinFound,
    boundWardenEncountered,
    boundWardenVictories,
    barentonFirstExpedition: firstBarentonExpedition,
    barentonRitualKnowledgeSecuredOn: firstExpeditionWithFlag("barenton_ritual_understood"),
    barentonApproachKnowledgeSecuredOn: firstExpeditionWithFlag("barenton_approach_known"),
    barentonDiscoveryReturnCount: barentonDiscoveryReturns,
    barentonDiscoveryReturnRate: barentonEntries.length ? barentonDiscoveryReturns / barentonEntries.length : 0,
    valFirstExpedition: firstValExpedition,
    valUnderstandingSecuredOn: firstExpeditionWithFlag("val_way_understood"),
    valDiscoveryReturnCount: valDiscoveryReturns,
    valDiscoveryReturnRate: valEntries.length ? valDiscoveryReturns / valEntries.length : 0,
    morganOfferReached,
    guardianReached,
    guardianVictories,
    currentContentCompleted,
    finalProgressionStage,
    progressionTransitions: deepCampaignClone(progressionTransitions),
    totalGoldEarned,
    totalGoldSpent,
    totalHealingCost,
    totalProvisionCost,
    totalItemPurchaseGoldSpent,
    totalCraftingGoldSpent,
    totalGearSpending: totals((entry) => entry.equipmentPurchaseGoldSpent),
    totalEquipmentCrafts: totals((entry) => (entry.equipmentCraftingActions ?? []).length),
    itemsPurchasedById,
    itemPurchaseGoldSpentById,
    itemsPackedById,
    itemsConsumedById,
    itemsReturnedById,
    totalBandagesPurchased: totals((entry) => entry.bandagesPurchased),
    totalBandagesPacked: totals((entry) => entry.bandagesPacked),
    totalBandagesUsed: totals((entry) => entry.bandagesUsed),
    totalBandagesReturned: totals((entry) => entry.bandagesReturned),
    totalBandageHealingPerformed: totals((entry) => entry.bandageHealingPerformed),
    totalBriefRests: totals((entry) => entry.briefRestCount),
    totalCampRests: totals((entry) => entry.campRestCount),
    totalCampEvents: totals((entry) => entry.campEventCount),
    totalCookingActions: totals((entry) => entry.cookingActionCount),
    totalCookingProvisionsGained: totals((entry) => entry.cookingProvisionsGained),
    totalInnCookingActions: totals((entry) => (entry.innCookingActions ?? []).length),
    totalInnCookingProvisionsGained: totals((entry) => entry.innCookingProvisionsGained),
    innIngredientsConsumedById: decisions.reduce((totalsById, decision) => {
      Object.entries(decision.innIngredientsConsumedById ?? {}).forEach(([itemId, quantity]) => {
        totalsById[itemId] = (totalsById[itemId] ?? 0) + quantity;
      });
      return totalsById;
    }, {}),
    totalBanditAmbushEncounters: totals((entry) => entry.banditAmbushEncounters),
    totalBanditAmbushVictories: totals((entry) => entry.banditAmbushVictories),
    totalBanditLeaderEncounters: totals((entry) => entry.banditLeaderEncounters),
    totalBanditLeaderVictories: totals((entry) => entry.banditLeaderVictories),
    totalBanditLeaderEligibilityTriggered: totals((entry) => entry.banditLeaderEligibilityTriggered),
    totalBanditGoldRecovered: totals((entry) => entry.banditGoldRecovered),
    totalBanditLootValueRecovered: totals((entry) => entry.banditLootValueRecovered),
    ingredientsConsumedById,
    injuriesPerRun: expeditions.length ? injuriesGained.length / expeditions.length : 0,
    runsWithAnyInjury: expeditions.filter((entry) => (entry.injuriesGained ?? []).length > 0).length,
    runsWithTwoInjuries: expeditions.filter((entry) => Object.values(entry.activeInjuriesAtEnd ?? {}).some((injuries) => injuries.length >= 2)).length,
    injuriesByType,
    injuriesTreated: injuriesTreated.length,
    injuriesNaturallyRecovered: totals((entry) => entry.injuriesNaturallyRecovered),
    naturalRecoveriesByType: campaignCombatTotals(expeditions, "naturalRecoveriesByType"),
    infectionOccurrences: totals((entry) => entry.infectionOccurrences),
    deepCutsStabilized: totals((entry) => entry.deepCutsStabilized),
    averageRecoveryDistanceByType,
    returnedWhileInjured: expeditions.filter((entry) => entry.returnedWhileInjured).length,
    exhaustionOccurrences: totals((entry) => entry.exhaustionOccurrences),
    distanceByPace: campaignDistanceTotals(expeditions, "distanceByPace"),
    distanceByRation: campaignDistanceTotals(expeditions, "distanceByRation"),
    materialsFoundDuringExpedition: campaignCombatTotals(expeditions, "materialsFoundDuringExpedition"),
    materialsRejectedDueToCapacity: campaignCombatTotals(expeditions, "materialsRejectedDueToCapacity"),
    materialsReturnedSafely: campaignCombatTotals(expeditions, "materialsReturnedSafely"),
    unsecuredMaterialsLost: campaignCombatTotals(expeditions, "unsecuredMaterialsLost"),
    totalLootValueRecovered: totals((entry) => entry.lootValueRecovered),
    totalLootValueLost: totals((entry) => estimateCampaignItems(entry.lootLost)),
    totalProvisionsConsumed: totals((entry) => entry.provisionsConsumed),
    totalProvisionsFound: totals((entry) => entry.provisionsFound),
    totalDamageTaken: totals((entry) => entry.damageTaken),
    totalHealingReceived: totals((entry) => entry.healingBefore.totalHealingAmount),
    totalLowHpHealingTriggers: expeditions.filter((entry) => entry.healingTriggeredByLowHp).length,
    totalCriticalArthurHealingTriggers: expeditions.filter(
      (entry) => entry.healingTriggerReason === "arthur-critical-below-25-percent",
    ).length,
    healingByPartyMember: campaignHealingByPartyMember(expeditions),
    totalCombats: totals((entry) => entry.combats),
    totalAggressiveEmergencyActions: totals((entry) => entry.aggressiveEmergencyActions),
    totalCombatsStartedBelow50Percent: totals((entry) => entry.combatsStartedBelow50Percent),
    totalCombatsStartedBelow25Percent: totals((entry) => entry.combatsStartedBelow25Percent),
    attacksReceivedByPartyMember: campaignPartyCombatTotals(expeditions, "attacksReceivedByPartyMember"),
    damageReceivedByPartyMember: campaignPartyCombatTotals(expeditions, "damageReceivedByPartyMember"),
    totalArthurCombatAttacksReceived: totals((entry) => entry.arthurCombatAttacksReceived),
    totalCompanionCombatAttacksReceived: totals((entry) => entry.companionCombatAttacksReceived),
    totalArthurCombatDamageReceived: totals((entry) => entry.arthurCombatDamageReceived),
    totalCompanionCombatDamageReceived: totals((entry) => entry.companionCombatDamageReceived),
    abilityUsesById,
    itemUsesById,
    statusesAppliedById,
    statusDamageById,
    equipmentPassiveTriggers,
    totalResolveStored,
    totalResolveSpent,
    totalRegenerationPerformed,
    totalRegenerationSuppressedActivations,
    regenerationSuppressedByStatus,
    totalHeavyAttackUses,
    totalDefendActions,
    totalHealingPerformed: totals((entry) => entry.totalHealingPerformed),
    totalGaugeControl: totals((entry) => entry.totalGaugeControl),
    totalEncounters: totals((entry) => entry.encounters),
    startingLiquidWealth: startingWealth,
    endingLiquidWealth: endingWealth,
    netCampaignWealth,
    averageStartingHealth: campaignAverage(startingHealthValues),
    averageEndingHealth: campaignAverage(endingHealthValues),
    averageHealthLost: campaignAverage(expeditions.map((entry) => entry.damageTaken)),
    averageHealing: campaignAverage(expeditions.map((entry) => entry.healingBefore.totalHealingAmount)),
    averageDesiredExpeditionDistance: campaignAverage(expeditions.map((entry) => entry.desiredTargetDistance)),
    averageActualExpeditionDistance: campaignAverage(expeditions.map((entry) => entry.actualTargetDistance)),
    targetDistanceReductionFrequency: expeditions.length
      ? expeditions.filter((entry) => entry.targetDistanceReduced).length / expeditions.length : 0,
    averageDistanceReduced: campaignAverage(expeditions.map((entry) => entry.targetDistanceReduction)),
    expeditionsWithReducedTarget: expeditions.filter((entry) => entry.targetDistanceReduced).length,
    emergencyProvisionTurnaroundRate: expeditions.length
      ? expeditions.filter((entry) => entry.emergencyProvisionTurnaround).length / expeditions.length : 0,
    totalEmergencyProvisionTurnarounds: expeditions.filter(
      (entry) => entry.emergencyProvisionTurnaround,
    ).length,
    averageEncounterProvisionReserve: campaignAverage(
      expeditions.map((entry) => entry.encounterProvisionReserve),
    ),
    damagePerSuccessfulExpedition: successful.length ? totals((entry) => entry.success ? entry.damageTaken : 0) / successful.length : 0,
    damagePerFailedExpedition: failed.length ? totals((entry) => !entry.success ? entry.damageTaken : 0) / failed.length : 0,
    healingCostPerSuccessfulExpedition: successful.length ? totalHealingCost / successful.length : 0,
    cumulativeDamage: totals((entry) => entry.damageTaken),
    lowestHealthReached: endingHealthValues.length ? Math.min(...endingHealthValues) : startingState.arthurHealth,
    expeditionsStartedBelow75Percent: startingHealthValues.filter((health) => health < maxHealth * 0.75).length,
    expeditionsStartedBelow50Percent: startingHealthValues.filter((health) => health < maxHealth * 0.5).length,
    expeditionsStartedBelow25Percent: startingHealthValues.filter((health) => health < maxHealth * 0.25).length,
    averageNetGoldPerExpedition: expeditions.length ? netGold / expeditions.length : 0,
    medianNetGoldPerExpedition: campaignMedian(expeditions.map((entry) => entry.netGold)),
    campaignRoi: startingWealth > 0 ? netCampaignWealth / startingWealth : null,
    averageProvisionSpend: expeditions.length ? totalProvisionCost / expeditions.length : 0,
    averageItemPurchaseSpend: expeditions.length ? totalItemPurchaseGoldSpent / expeditions.length : 0,
    averageBandagesPurchased: campaignAverage(expeditions.map((entry) => entry.bandagesPurchased)),
    averageBandagesUsed: campaignAverage(expeditions.map((entry) => entry.bandagesUsed)),
    averageHealingSpend: expeditions.length ? totalHealingCost / expeditions.length : 0,
    averageLootValueRecovered: expeditions.length ? totals((entry) => entry.lootValueRecovered) / expeditions.length : 0,
    breakEvenExpeditionRate: expeditions.length
      ? expeditions.filter((entry) => entry.netGold >= 0).length / expeditions.length : 0,
    successfulExpeditionsBeforeInsolvency: stopReason === "cannot-support-any-expedition" ? successful.length : null,
    expeditionsUntilHealthUnsustainable: stopReason === "arthur-died" ? expeditions.length : null,
    averageCostPerHealthRestored: totals((entry) => entry.healingBefore.totalHealingAmount) > 0
      ? totalHealingCost / totals((entry) => entry.healingBefore.totalHealingAmount) : 0,
    profitAfterHealingAndRestocking: netCampaignWealth,
    economicTrend,
    betweenExpeditionDecisions: decisions,
    expeditions,
    replay: {
      version: 2,
      campaignSeed: config.seed,
      campaignProgressionMode: config.campaignMode === "progression",
      progressionTransitions: deepCampaignClone(progressionTransitions),
      routeSequence,
      routeAttemptSequence,
      startingState,
      expeditionSeeds: expeditions.map((entry) => entry.expeditionSeed),
      betweenExpeditionDecisions: decisions,
      townActions,
      expeditionReplays: expeditions.map((entry) => entry.replay),
      expeditions: expeditions.map((entry) => ({
        expeditionNumber: entry.expeditionNumber,
        expeditionSeed: entry.expeditionSeed,
        expeditionId: entry.expeditionId,
        routeId: entry.routeId,
        campaignStageAtDeparture: entry.campaignStageAtDeparture,
        runKind: entry.runKind,
        isPrerequisiteRun: entry.isPrerequisiteRun,
        prerequisiteForRoute: entry.prerequisiteForRoute,
        prerequisiteItemId: entry.prerequisiteItemId,
        prerequisiteReason: entry.prerequisiteReason,
        prerequisiteStatus: entry.prerequisiteStatus,
        prerequisiteAcquired: entry.prerequisiteAcquired,
        isSupplyRun: entry.isSupplyRun,
        supplyRunForRoute: entry.supplyRunForRoute,
        replay: entry.replay,
        stateBefore: entry.stateBefore,
        stateAfter: entry.stateAfter,
        townActions: entry.townActions,
        success: entry.success,
        outcome: entry.outcome,
        failureReason: entry.failureReason,
        hardFailureReason: entry.hardFailureReason,
        actualMaximumDistance: entry.actualMaximumDistance,
      })),
      expected: {
        endingState,
        expeditionsAttempted: expeditions.length,
        stopReason,
        campaignProgressionMode: config.campaignMode === "progression",
      },
      endingState,
    },
  };
}

function summarizeCampaigns(results) {
  const averageField = (field) => campaignAverage(results.map((entry) => entry[field]));
  const expeditions = results.flatMap((entry) => entry.expeditions);
  const routeAttempts = Object.fromEntries(CAMPAIGN_PROGRESSION_ROUTES.map((routeId) => [
    routeId, results.flatMap((campaign) => campaign.expeditions
      .filter((entry) => !entry.isSupplyRun && !entry.isPrerequisiteRun
        && (entry.routeId ?? entry.expeditionId) === routeId)),
  ]));
  const routeRate = (routeId, predicate) => results.length
    ? results.filter((campaign) => predicate(campaign, routeId)).length / results.length : 0;
  const routeAverages = (routeId, field) => {
    const entries = routeAttempts[routeId];
    return entries.length ? campaignAverage(entries.map((entry) => entry[field])) : 0;
  };
  const completionAttemptDistribution = (routeId) => {
    const counts = { attempt1: 0, attempt2: 0, attempt3Plus: 0 };
    results.forEach((campaign) => {
      if (!campaign.routesCompleted?.includes(routeId)) return;
      const completedEntry = campaign.expeditions.find((entry) => (
        !entry.isSupplyRun && !entry.isPrerequisiteRun
          && (entry.routeId ?? entry.expeditionId) === routeId
          && entry.routeAttemptCompleted
      ));
      const attempt = Number(completedEntry?.routeAttemptNumber)
        || Number(campaign.routeCompletionAttempt?.[routeId]) || 0;
      if (attempt === 1) counts.attempt1 += 1;
      else if (attempt === 2) counts.attempt2 += 1;
      else if (attempt >= 3) counts.attempt3Plus += 1;
    });
    return {
      ...counts,
      attempt1Rate: results.length ? counts.attempt1 / results.length : 0,
      attempt2Rate: results.length ? counts.attempt2 / results.length : 0,
      attempt3PlusRate: results.length ? counts.attempt3Plus / results.length : 0,
    };
  };
  const deathsByRoute = Object.fromEntries(CAMPAIGN_PROGRESSION_ROUTES.map((routeId) => [
    routeId,
    routeAttempts[routeId].filter((entry) => entry.hardFailureReason === "arthur-died"
      || (!entry.success && Number(entry.endingHealth) <= 0)).length,
  ]));
  const resourceFailuresByRoute = Object.fromEntries(CAMPAIGN_PROGRESSION_ROUTES.map((routeId) => [
    routeId,
    routeAttempts[routeId].filter((entry) => entry.hardFailureReason === "expedition-resource-exhaustion"
      || Boolean(entry.provisionExhaustionFailure)).length,
  ]));
  const otherFailuresByRoute = Object.fromEntries(CAMPAIGN_PROGRESSION_ROUTES.map((routeId) => [
    routeId,
    routeAttempts[routeId].filter((entry) => {
      const death = entry.hardFailureReason === "arthur-died"
        || (!entry.success && Number(entry.endingHealth) <= 0);
      const resource = entry.hardFailureReason === "expedition-resource-exhaustion"
        || Boolean(entry.provisionExhaustionFailure);
      return !entry.routeAttemptCompleted && !death && !resource;
    }).length,
  ]));
  return {
    totalCampaigns: results.length,
    campaignCompletionRate: results.length ? results.filter((entry) => entry.completedPlan).length / results.length : 0,
    successfulCompletionRate: results.length ? results.filter((entry) => entry.completedPlan).length / results.length : 0,
    averageExpeditionsSurvived: averageField("expeditionsAttempted"),
    medianExpeditionsSurvived: campaignMedian(results.map((entry) => entry.expeditionsAttempted)),
    deathRate: results.length ? results.filter((entry) => entry.stopReason === "arthur-died").length / results.length : 0,
    insolvencyRate: results.length ? results.filter((entry) => entry.stopReason === "cannot-support-any-expedition").length / results.length : 0,
    resourceExhaustionRate: results.length
      ? results.filter((entry) => entry.stopReason === "expedition-resource-exhaustion").length / results.length : 0,
    hardFailureRate: results.length ? results.filter((entry) => entry.hardFailure).length / results.length : 0,
    campaignsWithStrategyConstraintsRate: results.length
      ? results.filter((entry) => entry.strategyConstraintCount > 0).length / results.length : 0,
    averageStrategyConstraintCount: averageField("strategyConstraintCount"),
    averageDesiredExpeditionDistance: campaignAverage(expeditions.map((entry) => entry.desiredTargetDistance)),
    averageActualExpeditionDistance: campaignAverage(expeditions.map((entry) => entry.actualTargetDistance)),
    targetDistanceReductionFrequency: expeditions.length
      ? expeditions.filter((entry) => entry.targetDistanceReduced).length / expeditions.length : 0,
    averageDistanceReduced: campaignAverage(expeditions.map((entry) => entry.targetDistanceReduction)),
    emergencyProvisionTurnaroundRate: expeditions.length
      ? expeditions.filter((entry) => entry.emergencyProvisionTurnaround).length / expeditions.length : 0,
    averageEmergencyProvisionTurnarounds: averageField("totalEmergencyProvisionTurnarounds"),
    averageEncounterProvisionReserve: campaignAverage(
      expeditions.map((entry) => entry.encounterProvisionReserve),
    ),
    averageEndingGold: averageField("endingGold"),
    averageEndingHealth: averageField("endingArthurHealth"),
    averageTotalProfit: averageField("netCampaignWealth"),
    averageNetCampaignWealth: averageField("netCampaignWealth"),
    averageHealingSpend: averageField("totalHealingCost"),
    averageLowHpHealingTriggers: averageField("totalLowHpHealingTriggers"),
    averageCriticalArthurHealingTriggers: averageField("totalCriticalArthurHealingTriggers"),
    averageProvisionSpend: averageField("totalProvisionCost"),
    averageItemPurchaseSpend: averageField("totalItemPurchaseGoldSpent"),
    averageBandagesPurchased: averageField("totalBandagesPurchased"),
    averageBandagesPacked: averageField("totalBandagesPacked"),
    averageBandagesUsed: averageField("totalBandagesUsed"),
    averageBandagesReturned: averageField("totalBandagesReturned"),
    averageBandageHealingPerformed: averageField("totalBandageHealingPerformed"),
    averageBriefRests: averageField("totalBriefRests"),
    averageCampRests: averageField("totalCampRests"),
    averageCampEvents: averageField("totalCampEvents"),
    averageCookingActions: averageField("totalCookingActions"),
    averageCookingProvisionsGained: averageField("totalCookingProvisionsGained"),
    averageTotalLootRecovered: averageField("totalLootValueRecovered"),
    averageTotalDamage: averageField("totalDamageTaken"),
    averageCombats: averageField("totalCombats"),
    averageAggressiveEmergencyActions: averageField("totalAggressiveEmergencyActions"),
    averageCombatsStartedBelow50Percent: averageField("totalCombatsStartedBelow50Percent"),
    averageCombatsStartedBelow25Percent: averageField("totalCombatsStartedBelow25Percent"),
    averageArthurCombatDamageReceived: averageField("totalArthurCombatDamageReceived"),
    averageCompanionCombatDamageReceived: averageField("totalCompanionCombatDamageReceived"),
    averageHealingPerformed: averageField("totalHealingPerformed"),
    averageGaugeControl: averageField("totalGaugeControl"),
    economicallyGrowingRate: results.length
      ? results.filter((entry) => entry.economicTrend === "economically-growing").length / results.length : 0,
    oldForestReachedRate: routeRate("old_forest_road", (campaign) => (
      (campaign.attemptsByRoute?.old_forest_road ?? campaign.expeditions
        .some((entry) => (entry.routeId ?? entry.expeditionId) === "old_forest_road")) > 0
    )),
    oldForestCompletionRate: routeRate("old_forest_road", (campaign) => (
      campaign.routesCompleted?.includes("old_forest_road")
      ?? campaign.expeditions.some((entry) => entry.routeId === "old_forest_road" && entry.routeAttemptCompleted)
    )),
    barentonReachedRate: routeRate("fountain_of_barenton", (campaign) => (
      (campaign.attemptsByRoute?.fountain_of_barenton ?? campaign.expeditions
        .some((entry) => (entry.routeId ?? entry.expeditionId) === "fountain_of_barenton")) > 0
    )),
    barentonCompletionRate: routeRate("fountain_of_barenton", (campaign) => (
      campaign.routesCompleted?.includes("fountain_of_barenton")
      ?? campaign.expeditions.some((entry) => entry.routeId === "fountain_of_barenton" && entry.routeAttemptCompleted)
    )),
    valReachedRate: routeRate("val_sans_retour", (campaign) => (
      (campaign.attemptsByRoute?.val_sans_retour ?? campaign.expeditions
        .some((entry) => (entry.routeId ?? entry.expeditionId) === "val_sans_retour")) > 0
    )),
    valCompletionRate: routeRate("val_sans_retour", (campaign) => (
      campaign.routesCompleted?.includes("val_sans_retour")
      ?? campaign.expeditions.some((entry) => entry.routeId === "val_sans_retour" && entry.routeAttemptCompleted)
    )),
    searchForMerlinReachedRate: routeRate("search_for_merlin", (campaign) => (
      (campaign.attemptsByRoute?.search_for_merlin ?? campaign.expeditions
        .some((entry) => (entry.routeId ?? entry.expeditionId) === "search_for_merlin")) > 0
    )),
    searchForMerlinCompletionRate: routeRate("search_for_merlin", (campaign) => (
      campaign.routesCompleted?.includes("search_for_merlin")
      ?? campaign.expeditions.some((entry) => entry.routeId === "search_for_merlin" && entry.routeAttemptCompleted)
    )),
    merlinFoundRate: results.length
      ? results.filter((campaign) => campaign.merlinFound).length / results.length : 0,
    fullCurrentCampaignCompletionRate: results.length
      ? results.filter((entry) => entry.currentContentCompleted).length / results.length : 0,
    averageTotalAttempts: averageField("expeditionsAttempted"),
    averageProgressionDeferredCount: averageField("progressionDeferredCount"),
    averageObjectiveDistanceFloorViolations: averageField("objectiveDistanceFloorViolations"),
    averageAttemptsOldForest: campaignAverage(results.map((entry) => entry.attemptsByRoute?.old_forest_road ?? 0)),
    averageAttemptsBarenton: campaignAverage(results.map((entry) => entry.attemptsByRoute?.fountain_of_barenton ?? 0)),
    averageAttemptsVal: campaignAverage(results.map((entry) => entry.attemptsByRoute?.val_sans_retour ?? 0)),
    averageAttemptsSearchForMerlin: campaignAverage(results.map((entry) => entry.attemptsByRoute?.search_for_merlin ?? 0)),
    barentonCompletionAttemptDistribution: completionAttemptDistribution("fountain_of_barenton"),
    valCompletionAttemptDistribution: completionAttemptDistribution("val_sans_retour"),
    averageBarentonDiscoveryReturnRate: averageField("barentonDiscoveryReturnRate"),
    averageValDiscoveryReturnRate: averageField("valDiscoveryReturnRate"),
    averageMorganOfferReached: averageField("morganOfferReached"),
    averageGuardianReached: averageField("guardianReached"),
    averageGuardianVictories: averageField("guardianVictories"),
    averageEndingHealthSearchForMerlin: routeAverages("search_for_merlin", "endingHealth"),
    averageDamageSearchForMerlin: routeAverages("search_for_merlin", "damageTaken"),
    averageCombatsSearchForMerlin: routeAverages("search_for_merlin", "combats"),
    averageEncounterCountSearchForMerlin: routeAverages("search_for_merlin", "encounters"),
    attemptCapFailureRate: results.length
      ? results.filter((entry) => entry.stopReason === "progression-attempt-cap").length / results.length : 0,
    deathsByRoute,
    resourceFailuresByRoute,
    otherFailuresByRoute,
    averageEndingHealthByRoute: Object.fromEntries(CAMPAIGN_PROGRESSION_ROUTES.map((routeId) => [
      routeId, routeAverages(routeId, "endingHealth"),
    ])),
    averageDamageByRoute: Object.fromEntries(CAMPAIGN_PROGRESSION_ROUTES.map((routeId) => [
      routeId, routeAverages(routeId, "damageTaken"),
    ])),
    averageCombatsByRoute: Object.fromEntries(CAMPAIGN_PROGRESSION_ROUTES.map((routeId) => [
      routeId, routeAverages(routeId, "combats"),
    ])),
    averageEncounterCountByRoute: Object.fromEntries(CAMPAIGN_PROGRESSION_ROUTES.map((routeId) => [
      routeId, routeAverages(routeId, "encounters"),
    ])),
  };
}

function estimateCampaignItems(items) {
  return items.reduce((sum, entry) => {
    const value = Math.max(0, ...Object.values(SHOP_DEFINITIONS).map((shop) => shop.sellValues?.[entry.itemId] ?? 0));
    return sum + value * entry.quantity;
  }, 0);
}

function campaignLiquidWealth(state) {
  const shop = SHOP_DEFINITIONS.village_general_goods;
  const inventoryValue = Object.entries(state.ownedItems ?? {}).reduce((sum, [itemId, quantity]) => {
    const item = ITEM_DEFINITIONS[itemId];
    if (!item || EconomyRules.itemSaleBlockReason({
      ownedItems: state.ownedItems,
      equippedItems: state.equippedItems,
      packedItems: state.packedItems,
    }, shop, item)) return sum;
    return sum + (shop.sellValues[itemId] ?? 0) * quantity;
  }, 0);
  const provisionPrice = shop.provisionsForSale.price;
  return (state.gold ?? 0) + (state.provisionStock ?? 0) * provisionPrice + inventoryValue;
}

function campaignHealingByPartyMember(expeditions) {
  const totals = {};
  expeditions.forEach((entry) => Object.entries(entry.healingBefore.healingByPartyMember ?? {})
    .forEach(([memberId, amount]) => {
      totals[memberId] = (totals[memberId] ?? 0) + amount;
    }));
  return totals;
}

function campaignPartyCombatTotals(expeditions, field) {
  const totals = {};
  expeditions.forEach((entry) => Object.entries(entry[field] ?? {}).forEach(([id, value]) => {
    totals[id] = (totals[id] ?? 0) + (Number(value) || 0);
  }));
  return totals;
}

function campaignCombatTotals(expeditions, field) {
  return campaignPartyCombatTotals(expeditions, field);
}

function campaignDistanceTotals(expeditions, field) {
  const totals = {};
  expeditions.forEach((entry) => Object.entries(entry[field] ?? {}).forEach(([id, value]) => {
    totals[id] = (totals[id] ?? 0) + (Number(value) || 0);
  }));
  return totals;
}

function campaignCompletedPlan(config, expeditions, stopReason) {
  return stopReason === "max-expeditions-reached" && expeditions.length === config.maxExpeditions;
}

function campaignStopCategory(stopReason) {
  if (["arthur-died", "expedition-resource-exhaustion", "cannot-support-any-expedition"]
    .includes(stopReason)) {
    return "hard-failure";
  }
  if (["max-expeditions-reached", "current-content-completed"].includes(stopReason)) return "completed";
  if (stopReason === "progression-attempt-cap") return "incomplete";
  return "simulation-error";
}

function isCampaignResourceExhaustion(failureReason) {
  return typeof failureReason === "string"
    && failureReason.toLowerCase().includes("exhausted its provisions");
}

function campaignAverage(values) {
  return values.length ? roundCampaignNumber(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
}

function campaignMedian(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return roundCampaignNumber(sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2);
}

function campaignCsv(fields, rows) {
  return [fields.join(","), ...rows.map((row) => fields.map((field) => campaignCsvCell(row[field])).join(","))].join("\n");
}

function campaignCsvCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function roundCampaignNumber(value, precision = 4) {
  const scale = 10 ** precision;
  return Math.round((Number(value) || 0) * scale) / scale;
}

function deepCampaignClone(value) {
  return JSON.parse(JSON.stringify(value));
}
