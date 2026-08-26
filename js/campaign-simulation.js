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

const CAMPAIGN_PROGRESSION_PREREQUISITES = Object.freeze({});

const CAMPAIGN_COMPLETION_OBJECTIVE_DEFINITIONS = Object.freeze({
  full_campaign: Object.freeze({
    id: "full_campaign",
    label: "Full Campaign",
  }),
  old_forest_flask: Object.freeze({
    id: "old_forest_flask",
    routeId: "old_forest_road",
    label: "Old Forest: Secure Merlin's Flask",
  }),
});

const OLD_FOREST_VILLAGE_RESUPPLY_DISTANCE = 95;

const CAMPAIGN_FOOD_RECIPE_IDS = Object.freeze([
  "roasted_meat",
  "foraged_meal",
  "hunters_stew",
  "honeyed_berries",
  "forestwarden_stew",
  "honeyed_forest_preserves",
]);

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

    if (progression && campaignCompletionObjectiveAchieved(config.completionObjective, player)) {
      progression.completionObjectiveAchieved = true;
      stopReason = "completion-objective-achieved";
      return finalizeCampaignTelemetry(
        config, policy, startingState, player, shopStocks, expeditions,
        betweenExpeditionDecisions, townActions, stopReason, progression, progressionTransitions,
      );
    }

    for (let index = 0; index < config.maxExpeditions; index += 1) {
      const expeditionNumber = index + 1;
      const objectiveLimited = isObjectiveLimitedCampaign(config);
      const progressionRouteId = objectiveLimited
        ? "old_forest_road" : progression?.currentRouteId ?? null;
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
      if (progression) {
        progression.strategy = config.strategy;
        progression.shopStocks = shopStocks;
      }
      const expeditionSeed = `${config.seed}:expedition-${index}`;
      const stateBeforeDecisions = campaignStateSnapshot(player, shopStocks, expeditionNumber);
      if (progression && player.selectedExpeditionId !== routeId) {
        player.selectedExpeditionId = routeId;
      }
      const townEntry = CampaignRules.enterLocation(player, shopStocks);
      const preDepartureServiceActions = [];
      if (progression && progressionRouteId === "old_forest_road") {
        applyOldForestProgressionServices(player, preDepartureServiceActions, expeditionNumber);
      }
      const progressionGoal = progression && progressionRouteId === "old_forest_road"
        ? assessOldForestProgressionGoal(player, progression)
        : null;
      if (progressionGoal) {
        progression.currentOldForestGoal = deepCampaignClone(progressionGoal);
        progression.oldForestProgressionGoalByExpedition.push({
          expeditionNumber,
          ...deepCampaignClone(progressionGoal),
        });
      }
      const configuredTargetDistance = progression
        ? config.expeditionPlan[Math.min(progression.routeIndex, config.expeditionPlan.length - 1)]
        : config.expeditionPlan[index % config.expeditionPlan.length];
      const progressionRoute = progression ? ExpeditionCatalog.get(progressionRouteId) : null;
      const routeObjectiveDistance = Number(progressionRoute?.minimumObjectiveDistance) || 0;
      const desiredTargetDistance = progressionGoal?.targetDistance ?? (progression
        ? Math.max(configuredTargetDistance, routeObjectiveDistance)
        : configuredTargetDistance);
      const reasonableAttemptDistance = progressionGoal?.minimumAttemptDistance
        ?? (progression ? routeObjectiveDistance : desiredTargetDistance);
      const progressionReadinessPlan = progression && !isPrerequisiteRun
        ? assessProgressionReadiness(
          progressionRouteId, desiredTargetDistance, routeObjectiveDistance,
          player, shopStocks, policy, config.strategy, progression, progressionRouteId,
          { requiredDistance: reasonableAttemptDistance, goal: progressionGoal },
        ) : null;
      let supplyRunForRoute = progressionReadinessPlan
        && progressionReadinessPlan.status === "deferred"
        && progressionReadinessPlan.supplyRunExpectedBenefit
        ? progressionRouteId : null;
      let isSupplyRun = Boolean(supplyRunForRoute);
      if (isSupplyRun) routeId = "old_forest_road";
      if (player.selectedExpeditionId !== routeId) player.selectedExpeditionId = routeId;
      let runKind = isSupplyRun ? "supply" : selectedRunKind;
      const plannedTargetDistance = isSupplyRun
        ? progressionSupplyRunDistance(config.strategy)
        : desiredTargetDistance;
      const preparationActions = [...preDepartureServiceActions];
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

      if (progressionReadinessPlan?.status === "blocked") {
        const blockedDecision = {
          expeditionNumber,
          expeditionId: routeId,
          progressionRouteId,
          runKind,
          isPrerequisiteRun,
          isSupplyRun: false,
          supplyRunForRoute: null,
          progressionReadiness: progressionReadinessPlan.status,
          progressionDeferredReason: progressionReadinessPlan.reason,
          progressionReadinessBlocker: progressionReadinessPlan.blocker,
          progressionRequiredDistance: progressionReadinessPlan.requiredDistance,
          progressionSupportedDistance: progressionReadinessPlan.supportedDistance,
          progressionUsesMidRouteResupply: Boolean(
            progressionReadinessPlan.progressionUsesMidRouteResupply,
          ),
          progressionResupplyLocationId: progressionReadinessPlan.progressionResupplyLocationId ?? null,
          progressionResupplyDistance: progressionReadinessPlan.progressionResupplyDistance ?? null,
          provisionsRequiredToReachResupply: progressionReadinessPlan.provisionsRequiredToReachResupply ?? null,
          projectedProvisionsAtResupply: progressionReadinessPlan.projectedProvisionsAtResupply ?? null,
          projectedVillageProvisionPurchase: progressionReadinessPlan.projectedVillageProvisionPurchase ?? 0,
          projectedVillageProvisionGoldCost: progressionReadinessPlan.projectedVillageProvisionGoldCost ?? 0,
          projectedVillageStockAfter: progressionReadinessPlan.projectedVillageStockAfter ?? null,
          postResupplySupportedDistance: progressionReadinessPlan.postResupplySupportedDistance ?? null,
          progressionTargetFullyReachable: Boolean(
            progressionReadinessPlan.progressionTargetFullyReachable,
          ),
          minimumViableProvisionRequirement:
            progressionReadinessPlan.minimumViableProvisionRequirement,
          preferredProvisionTarget: progressionReadinessPlan.preferredProvisionTarget,
          provisionCapacity: progressionReadinessPlan.provisionCapacity,
          actualPackedProvisions: progressionReadinessPlan.provisionStock,
          preferredBufferShortfall: progressionReadinessPlan.preferredBufferShortfall,
          supplyRunExpectedBenefit: false,
          supplyRunBenefitReason: progressionReadinessPlan.supplyRunBenefitReason,
          oldForestCurrentGoal: progressionGoal,
          oldForestTargetMilestoneDistance: progressionGoal?.targetDistance ?? null,
          oldForestGoalReason: progressionGoal?.reason ?? null,
          oldForestSupplyRunReason: progressionGoal?.supplyRunReason ?? null,
          oldForestProgressionGoal: progressionGoal?.goalId ?? null,
          ...druidTelemetryFromGoal(progressionGoal),
          strategyConstraints: [{
            type: "progression-objective-blocked",
            reason: progressionReadinessPlan.reason,
            blocker: progressionReadinessPlan.blocker,
          }],
          stopReason: "progression-objective-blocked",
        };
        betweenExpeditionDecisions.push(blockedDecision);
        townActions.push(...tagCampaignTownActions(preparationActions, expeditionNumber));
        stopReason = "progression-objective-blocked";
        break;
      }

      if (HealingRules.arthurHealth(player) <= 0) {
        stopReason = "arthur-died";
        break;
      }
      const decision = applyBetweenExpeditionPolicy(
        player, shopStocks, policy, plannedTargetDistance, config.healingEnabled, config.strategy,
        preparationRandom.random,
        preparationActions,
        {
          progressionRequiredDistance: progression && !isSupplyRun && !isPrerequisiteRun
            ? progressionReadinessPlan?.requiredDistance ?? desiredTargetDistance : 0,
          expeditionId: routeId,
          campaignGoal: progressionGoal,
          progressionResupplyPlan: progressionReadinessPlan?.villageResupply ?? null,
        },
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
      decision.progressionReadinessBlocker = progressionReadinessPlan?.blocker ?? null;
      decision.progressionRequiredDistance = progressionReadinessPlan?.requiredDistance ?? 0;
      decision.progressionSupportedDistance = progressionReadinessPlan?.supportedDistance ?? null;
      decision.progressionUsesMidRouteResupply = Boolean(
        progressionReadinessPlan?.progressionUsesMidRouteResupply,
      );
      decision.progressionResupplyLocationId = progressionReadinessPlan?.progressionResupplyLocationId ?? null;
      decision.progressionResupplyDistance = progressionReadinessPlan?.progressionResupplyDistance ?? null;
      decision.provisionsRequiredToReachResupply = progressionReadinessPlan?.provisionsRequiredToReachResupply ?? null;
      decision.projectedProvisionsAtResupply = progressionReadinessPlan?.projectedProvisionsAtResupply ?? null;
      decision.projectedVillageProvisionPurchase = progressionReadinessPlan?.projectedVillageProvisionPurchase ?? 0;
      decision.projectedVillageProvisionGoldCost = progressionReadinessPlan?.projectedVillageProvisionGoldCost ?? 0;
      decision.projectedVillageStockAfter = progressionReadinessPlan?.projectedVillageStockAfter ?? null;
      decision.postResupplySupportedDistance = progressionReadinessPlan?.postResupplySupportedDistance ?? null;
      decision.progressionTargetFullyReachable = Boolean(
        progressionReadinessPlan?.progressionTargetFullyReachable,
      );
      decision.supplyRunExpectedBenefit = progressionReadinessPlan?.supplyRunExpectedBenefit ?? null;
      decision.supplyRunBenefitReason = progressionReadinessPlan?.supplyRunBenefitReason ?? null;
      decision.oldForestCurrentGoal = deepCampaignClone(progressionGoal);
      decision.oldForestTargetMilestoneDistance = progressionGoal?.targetDistance ?? null;
      decision.oldForestGoalReason = progressionGoal?.reason ?? null;
      decision.oldForestSupplyRunReason = progressionGoal?.supplyRunReason ?? null;
      decision.oldForestProgressionGoal = progressionGoal?.goalId ?? null;
      Object.assign(decision, druidTelemetryFromGoal(progressionGoal));
      decision.objectiveDistanceFloorApplied = false;
      decision.objectiveDistanceFloorViolated = false;
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
      const progressionRequiredDistance = progression && !isSupplyRun && !isPrerequisiteRun
        ? progressionReadinessPlan?.requiredDistance ?? desiredTargetDistance : 0;
      if (progressionRequiredDistance > 0
        && decision.actualTargetDistance < progressionRequiredDistance) {
        const postPreparationReadiness = assessPreparedProgressionReadiness(
          progressionRouteId, progressionRequiredDistance, decision, player, progression, progressionGoal,
        );
        progressionReadiness = {
          ...postPreparationReadiness,
          status: postPreparationReadiness.status === "blocked" ? "blocked" : "deferred",
          reason: postPreparationReadiness.status === "blocked"
            ? postPreparationReadiness.reason : "objective-distance-floor-after-preparation",
          requiredDistance: progressionRequiredDistance,
          supportedDistance: decision.safeAffordableDistance,
        };
        if (progressionReadiness.status === "blocked"
          || !progressionReadiness.supplyRunExpectedBenefit) {
          townActions.push(...tagCampaignTownActions(preparationActions, expeditionNumber));
          stopReason = "progression-objective-blocked";
          break;
        }
        isSupplyRun = true;
        supplyRunForRoute = progressionRouteId;
        runKind = "supply";
        decision.actualTargetDistance = Math.min(
          decision.actualTargetDistance, progressionSupplyRunDistance(config.strategy),
        );
        decision.targetDistance = decision.actualTargetDistance;
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
        decision.progressionReadinessBlocker = progressionReadiness.blocker;
        decision.progressionRequiredDistance = progressionReadiness.requiredDistance;
        decision.progressionSupportedDistance = progressionReadiness.supportedDistance;
        decision.supplyRunExpectedBenefit = progressionReadiness.supplyRunExpectedBenefit;
        decision.supplyRunBenefitReason = progressionReadiness.supplyRunBenefitReason;
      }
      decision.objectiveDistanceFloorApplied = Boolean(
        progression && !isSupplyRun && !isPrerequisiteRun && progressionRequiredDistance > 0,
      );

      const actualTargetDistance = decision.actualTargetDistance;
      const capacity = ExpeditionRules.partyProvisionCapacity(selectedCompanionIds(player), routeId);
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
        lockTravelSettings: Boolean(progressionGoal?.travelSettings),
        materialBagContents: decision.materialBagContents,
        startingStateIsAuthoritative: true,
        startingState: deepCampaignClone(player),
        campaignGoal: progressionGoal,
        locationServicePlans: progressionRouteId === "old_forest_road"
          ? [{ locationId: "hidden_forest_village", encounterId: "hidden_forest_village", minimumDistance: 95 }]
          : [],
        onLocationEntered: (locationId, context) => campaignLocationProvisionService(
          locationId,
          context,
          {
            shopStocks,
            strategyName: config.strategy,
            targetDistance: actualTargetDistance,
            safetyMargin: policy.provisionMargin,
          },
        ),
      });

      replaceCampaignPlayer(player, run.endingPlayerState);
      applyOldForestProgressionServices(player, preparationActions, expeditionNumber);
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
      townActions.push(...tagCampaignTownActions(preparationActions, expeditionNumber), ...settlementActions);
      const endingState = campaignStateSnapshot(player, shopStocks, expeditionNumber);
      const damageTaken = run.damageTaken;
      const objectiveDistanceFloorViolated = Boolean(
        decision.objectiveDistanceFloorApplied
          && Number(run.maximumDistance) < Number(progressionRequiredDistance),
      );
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
      const completionObjectiveAchieved = Boolean(
        progression
        && objectiveLimited
        && progressionAttempt?.completed
        && campaignCompletionObjectiveAchieved(config.completionObjective, endingState, run),
      );
      const prerequisiteAcquired = isPrerequisiteRun
        && Boolean(run.returnedSafely)
        && hasCampaignItem(endingState, progressionSelection.itemId);
      const prerequisiteStatus = isPrerequisiteRun
        ? !run.returnedSafely
          ? "failed"
          : prerequisiteAcquired ? "acquired" : "not-acquired"
        : null;
      const druidIngredientPurchaseActions = (run.locationServiceActions ?? [])
        .flatMap((serviceAction) => serviceAction.druidIngredientPurchaseActions ?? []);
      const druidIngredientsPurchasedById = druidIngredientPurchaseActions.reduce((items, purchase) => {
        items[purchase.itemId] = (items[purchase.itemId] ?? 0) + (Number(purchase.quantity) || 0);
        return items;
      }, {});
      const druidIngredientGoldSpent = druidIngredientPurchaseActions.reduce(
        (sum, purchase) => sum + (Number(purchase.goldCost) || 0), 0,
      );
      const itemsPurchasedById = { ...decision.itemsPurchasedById };
      Object.entries(druidIngredientsPurchasedById).forEach(([itemId, quantity]) => {
        itemsPurchasedById[itemId] = (itemsPurchasedById[itemId] ?? 0) + quantity;
      });
      const itemPurchaseGoldSpentById = { ...decision.itemPurchaseGoldSpentById };
      druidIngredientPurchaseActions.forEach((purchase) => {
        itemPurchaseGoldSpentById[purchase.itemId] = (
          itemPurchaseGoldSpentById[purchase.itemId] ?? 0
        ) + (Number(purchase.goldCost) || 0);
      });
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
        progressionReadinessBlocker: progressionReadiness?.blocker ?? null,
        progressionRequiredDistance: progressionReadiness?.requiredDistance ?? 0,
        progressionSupportedDistance: progressionReadiness?.supportedDistance ?? null,
        progressionUsesMidRouteResupply: Boolean(
          decision.progressionUsesMidRouteResupply
            ?? progressionReadiness?.progressionUsesMidRouteResupply,
        ),
        progressionResupplyLocationId: decision.progressionResupplyLocationId
          ?? progressionReadiness?.progressionResupplyLocationId ?? null,
        progressionResupplyDistance: decision.progressionResupplyDistance
          ?? progressionReadiness?.progressionResupplyDistance ?? null,
        provisionsRequiredToReachResupply: decision.provisionsRequiredToReachResupply
          ?? progressionReadiness?.provisionsRequiredToReachResupply ?? null,
        projectedProvisionsAtResupply: decision.projectedProvisionsAtResupply
          ?? progressionReadiness?.projectedProvisionsAtResupply ?? null,
        projectedVillageProvisionPurchase: decision.projectedVillageProvisionPurchase
          ?? progressionReadiness?.projectedVillageProvisionPurchase ?? 0,
        projectedVillageProvisionGoldCost: decision.projectedVillageProvisionGoldCost
          ?? progressionReadiness?.projectedVillageProvisionGoldCost ?? 0,
        projectedVillageStockAfter: decision.projectedVillageStockAfter
          ?? progressionReadiness?.projectedVillageStockAfter ?? null,
        postResupplySupportedDistance: decision.postResupplySupportedDistance
          ?? progressionReadiness?.postResupplySupportedDistance ?? null,
        progressionTargetFullyReachable: Boolean(
          decision.progressionTargetFullyReachable
            ?? progressionReadiness?.progressionTargetFullyReachable,
        ),
        preferredSupportedDistance: progressionReadiness?.preferredSupportedDistance
          ?? decision.preferredSafeDistance ?? null,
        minimumViableSupportedDistance: progressionReadiness?.minimumViableSupportedDistance
          ?? decision.minimumViableSupportedDistance ?? null,
        minimumViableProvisionRequirement: decision.minimumViableProvisionRequirement,
        preferredProvisionTarget: decision.preferredProvisionTarget,
        provisionCapacity: decision.provisionCapacity,
        actualPackedProvisions: provisionsPacked,
        preferredBufferShortfall: decision.preferredBufferShortfall,
        supplyRunExpectedBenefit: decision.supplyRunExpectedBenefit ?? null,
        supplyRunBenefitReason: decision.supplyRunBenefitReason ?? null,
        oldForestCurrentGoal: deepCampaignClone(progressionGoal),
        oldForestTargetMilestoneDistance: progressionGoal?.targetDistance ?? null,
        oldForestGoalReason: progressionGoal?.reason ?? null,
        oldForestSupplyRunReason: progressionGoal?.supplyRunReason ?? null,
        oldForestProgressionGoal: progressionGoal?.goalId ?? null,
        ...druidTelemetryFromGoal(progressionGoal),
        objectiveDistanceFloorApplied: Boolean(decision.objectiveDistanceFloorApplied),
        objectiveDistanceFloorViolated,
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
        villageProvisionPurchaseCount: run.villageProvisionPurchaseCount,
        villageProvisionsPurchased: run.villageProvisionsPurchased,
        villageProvisionGoldSpent: run.villageProvisionGoldSpent,
        villageProvisionStockBefore: run.villageProvisionStockBefore,
        villageProvisionStockAfter: run.villageProvisionStockAfter,
        provisionsBeforeVillagePurchase: run.provisionsBeforeVillagePurchase,
        provisionsAfterVillagePurchase: run.provisionsAfterVillagePurchase,
        villageProvisionPurchaseReason: run.villageProvisionPurchaseReason,
        villageProvisionActions: run.locationServiceActions,
        provisionsPacked,
        provisionsReturned: run.provisionsReturned,
        itemsPurchasedById,
        itemPurchaseGoldSpentById,
        itemPurchaseGoldSpent: decision.itemPurchaseGoldSpent + druidIngredientGoldSpent,
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
        druidIngredientPurchaseActions,
        druidIngredientsPurchasedById,
        druidIngredientGoldSpent,
      };
      expeditions.push(expeditionEntry);

      if (progression && isSupplyRun) {
        progression.supplyRunsByRoute[supplyRunForRoute] += 1;
        const beforeReadinessMetric = progressionReadiness?.readinessMetric ?? null;
        const afterReadinessQuote = quoteCampaignProvisionAvailability(
          player, shopStocks, policy, desiredTargetDistance, config.strategy,
          progressionRouteId, progressionGoal,
        );
        const afterReadinessMetric = progressionReadinessMetric(
          afterReadinessQuote, player,
        );
        progression.supplyRunHistoryByRoute[supplyRunForRoute].push({
          expeditionNumber,
          goalId: progressionGoal?.goalId ?? null,
          blocker: progressionReadiness?.blocker ?? null,
          materiallyImproved: progressionReadinessMetricsImproved(
            beforeReadinessMetric, afterReadinessMetric,
          ),
          before: beforeReadinessMetric,
          after: afterReadinessMetric,
        });
      } else if (progression && isPrerequisiteRun) {
        progression.prerequisiteRunCount += 1;
        progression.prerequisiteRunsByRoute[progressionSelection.prerequisiteForRoute] += 1;
        progression.lastRoute = routeId;
        progression.lastAttemptReason = prerequisiteStatus;
      } else if (progression && objectiveLimited) {
        progression.attemptsByRoute[progressionRouteId] += 1;
        if (completionObjectiveAchieved) {
          if (!progression.routesCompleted.includes(progressionRouteId)) {
            progression.routesCompleted.push(progressionRouteId);
          }
          progression.routeCompletionAttempt[progressionRouteId] ??= expeditionNumber;
          progression.routeCompletionStatus[progressionRouteId] = "completed";
          progression.completionObjectiveAchieved = true;
          progression.lastRoute = progressionRouteId;
          progression.lastAttemptReason = "secured-flask-after-safe-return";
          progressionTransitions.push({
            expeditionNumber,
            fromRouteId: progressionRouteId,
            toRouteId: null,
            gatedRouteId: null,
            reason: "completion-objective-achieved",
          });
          stopReason = "completion-objective-achieved";
          break;
        }
        progression.routeCompletionStatus[progressionRouteId] = progressionAttempt?.status ?? "not-attempted";
        progression.lastRoute = progressionRouteId;
        progression.lastAttemptReason = progressionAttempt?.reason ?? null;
      } else if (progression) {
        progression.attemptsByRoute[progressionRouteId] += 1;
        if (progressionAttempt.completed) {
          if (!progression.routesCompleted.includes(progressionRouteId)) {
            progression.routesCompleted.push(progressionRouteId);
          }
          progression.routeCompletionAttempt[progressionRouteId] ??= expeditionNumber;
          progression.routeCompletionStatus[progressionRouteId] = "completed";
          const nextRoute = CAMPAIGN_PROGRESSION_ROUTES[progression.routeIndex + 1] ?? null;
          const nextRouteUnlocked = Boolean(nextRoute && ExpeditionCatalog.isUnlocked(player, nextRoute));
          const nextProgressionRoute = nextRoute && nextRouteUnlocked ? nextRoute : progressionRouteId;
          progressionTransitions.push({
            expeditionNumber,
            fromRouteId: progressionRouteId,
            toRouteId: nextProgressionRoute,
            gatedRouteId: nextRoute && !nextRouteUnlocked ? nextRoute : null,
            reason: progressionAttempt.reason,
          });
          if (nextRouteUnlocked) {
            progression.routeIndex += 1;
            progression.currentRouteId = nextRoute;
            progression.currentContentCompleted = !nextRoute;
          } else {
            progression.currentRouteId = progressionRouteId;
            progression.currentContentCompleted = false;
          }
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

    stopReason ??= progression?.completionObjectiveAchieved
      ? "completion-objective-achieved"
      : progression?.currentContentCompleted
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
    const fields = ["campaignId", "seed", "strategy", "betweenExpeditionPolicy", "campaignProgressionMode", "completionObjective",
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
      "ingredientsConsumedById", "recipesUsedById", "cookingProvisionsGainedByRecipe",
      "cookingIngredientShortagesByRecipe", "cookingOpportunityMissedCount",
      "foodRecipeLearnedById", "foodRecipeUsedById", "materialsFoundDuringExpedition", "materialsRejectedDueToCapacity",
      "materialsDiscardedDueToPriority",
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
      "totalGoldEarned", "totalGoldSpent", "totalItemPurchaseGoldSpent", "totalCraftingGoldSpent", "totalEquipmentCrafts", "totalHealingCost", "totalProvisionCost", "netCampaignWealth", "economicTrend", "supplyRunCount",
      "progressionUsesMidRouteResupply", "progressionResupplyLocationId", "progressionResupplyDistance",
      "provisionsRequiredToReachResupply", "projectedProvisionsAtResupply", "projectedVillageProvisionPurchase",
      "projectedVillageProvisionGoldCost", "projectedVillageStockAfter", "postResupplySupportedDistance",
      "progressionTargetFullyReachable",
      "oldForestCurrentGoal", "oldForestTargetMilestoneDistance", "oldForestGoalReason", "oldForestSupplyRunReason", "oldForestProgressionGoalByExpedition",
      "oldForestTripsUntilVillageDiscovery", "oldForestTripsUntilWoodcraft", "oldForestTripsUntilFirstVerdantShard", "oldForestTripsUntilSecondVerdantShard", "oldForestTripsUntilVerdantHeart", "oldForestTripsUntilSong", "oldForestTripsUntilHeartEnchanted", "oldForestTripsUntilFirstWardenAttempt", "oldForestTripsUntilFlaskSecured", "oldForestWardenAttempts", "oldForestWardenVictories", "oldForestWardenLosses", "oldForestDeepestDistanceByExpedition", "oldForestGlimmeringSwordAcquisitionRate", "oldForestReturnFailureByDepth"];
    return campaignCsv(fields, results.map((campaign) => ({
      ...campaign,
      oldForestTripsUntilVillageDiscovery: campaign.oldForestProgression?.tripsUntilVillageDiscovery,
      oldForestCurrentGoal: campaign.oldForestCurrentGoal,
      oldForestTargetMilestoneDistance: campaign.oldForestTargetMilestoneDistance,
      oldForestGoalReason: campaign.oldForestGoalReason,
      oldForestSupplyRunReason: campaign.oldForestSupplyRunReason,
      oldForestProgressionGoalByExpedition: campaign.oldForestProgressionGoalByExpedition,
      oldForestTripsUntilWoodcraft: campaign.oldForestProgression?.tripsUntilWoodcraft,
      oldForestTripsUntilFirstVerdantShard: campaign.oldForestProgression?.tripsUntilFirstVerdantShard,
      oldForestTripsUntilSecondVerdantShard: campaign.oldForestProgression?.tripsUntilSecondVerdantShard,
      oldForestTripsUntilVerdantHeart: campaign.oldForestProgression?.tripsUntilVerdantHeart,
      oldForestTripsUntilSong: campaign.oldForestProgression?.tripsUntilSong,
      oldForestTripsUntilHeartEnchanted: campaign.oldForestProgression?.tripsUntilHeartEnchanted,
      oldForestTripsUntilFirstWardenAttempt: campaign.oldForestProgression?.tripsUntilFirstWardenAttempt,
      oldForestTripsUntilFlaskSecured: campaign.oldForestProgression?.tripsUntilFlaskSecured,
      oldForestWardenAttempts: campaign.oldForestProgression?.wardenAttempts,
      oldForestWardenVictories: campaign.oldForestProgression?.wardenVictories,
      oldForestWardenLosses: campaign.oldForestProgression?.wardenLosses,
      oldForestDeepestDistanceByExpedition: campaign.oldForestProgression?.deepestDistanceByExpedition,
      oldForestGlimmeringSwordAcquisitionRate: campaign.oldForestProgression?.glimmeringSwordAcquisitionRate,
      oldForestReturnFailureByDepth: campaign.oldForestProgression?.returnFailureByDepth,
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
      "oldForestProgressionGoal", "oldForestTargetMilestoneDistance", "oldForestGoalReason", "oldForestSupplyRunReason",
      "progressionReadinessBlocker", "progressionSupportedDistance", "preferredSupportedDistance", "minimumViableSupportedDistance",
      "minimumViableProvisionRequirement", "preferredProvisionTarget", "provisionCapacity", "actualPackedProvisions",
      "progressionUsesMidRouteResupply", "progressionResupplyLocationId", "progressionResupplyDistance",
      "provisionsRequiredToReachResupply", "projectedProvisionsAtResupply", "projectedVillageProvisionPurchase",
      "projectedVillageProvisionGoldCost", "projectedVillageStockAfter", "postResupplySupportedDistance",
      "progressionTargetFullyReachable",
      "preferredBufferShortfall", "supplyRunExpectedBenefit", "supplyRunBenefitReason", "objectiveDistanceFloorApplied", "objectiveDistanceFloorViolated",
      "strategyConstraintTypes", "hardFailure", "hardFailureReason",
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
      "villageProvisionPurchaseCount", "villageProvisionsPurchased", "villageProvisionGoldSpent",
      "villageProvisionStockBefore", "villageProvisionStockAfter", "provisionsBeforeVillagePurchase",
      "provisionsAfterVillagePurchase", "villageProvisionPurchaseReason", "villageProvisionActions",
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
    completionObjective: campaign.completionObjective ?? null,
  });
  const plans = distinctCompactValues(configurations.map((configuration) => ({
    expeditionPlan: configuration.expeditionPlan ?? [],
    maxExpeditions: configuration.maxExpeditions ?? null,
    completionObjective: configuration.completionObjective ?? null,
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
    completionObjectives: distinctStrings(campaigns.map((campaign) => (
      campaign.completionObjective ?? campaign.simulationConfiguration?.completionObjective ?? "full_campaign"
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
      completionObjective: campaign.completionObjective ?? null,
      completionObjectiveAchieved: Boolean(campaign.completionObjectiveAchieved),
      routeSequence: compactClone(campaign.routeSequence ?? []),
      routeAttemptSequence: compactClone(campaign.routeAttemptSequence ?? []),
      routesCompleted: compactClone(campaign.routesCompleted ?? []),
      attemptsByRoute: compactClone(campaign.attemptsByRoute ?? {}),
      supplyRunCount: Number(campaign.supplyRunCount) || 0,
      supplyRunsByRoute: compactClone(campaign.supplyRunsByRoute ?? {}),
      oldForestCurrentGoal: compactClone(campaign.oldForestCurrentGoal ?? null),
      oldForestTargetMilestoneDistance: campaign.oldForestTargetMilestoneDistance ?? null,
      oldForestGoalReason: campaign.oldForestGoalReason ?? null,
      oldForestSupplyRunReason: campaign.oldForestSupplyRunReason ?? null,
      druidDraughtCraftable: campaign.druidDraughtCraftable ?? null,
      druidDraughtMissingRequirements: compactClone(campaign.druidDraughtMissingRequirements ?? []),
      druidDraughtMissingItems: compactClone(campaign.druidDraughtMissingItems ?? {}),
      druidDraughtMissingMaterials: compactClone(campaign.druidDraughtMissingMaterials ?? {}),
      druidDraughtGoldShortfall: campaign.druidDraughtGoldShortfall ?? null,
      druidIngredientAcquisitionPlan: campaign.druidIngredientAcquisitionPlan ?? null,
      druidIngredientAcquisitionSource: campaign.druidIngredientAcquisitionSource ?? null,
      druidIngredientProtectionActive: Boolean(campaign.druidIngredientProtectionActive),
      druidIngredientsProtectedById: compactClone(campaign.druidIngredientsProtectedById ?? {}),
      druidPrepRunReason: campaign.druidPrepRunReason ?? null,
      oldForestProgressionGoalByExpedition: compactClone(
        campaign.oldForestProgressionGoalByExpedition ?? [],
      ),
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
    provisions: (Number(entry.provisionCost) || 0) + (Number(entry.villageProvisionGoldSpent) || 0),
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
    villageProvisionPurchaseCount: Number(entry.villageProvisionPurchaseCount) || 0,
    villageProvisionsPurchased: Number(entry.villageProvisionsPurchased) || 0,
    villageProvisionGoldSpent: Number(entry.villageProvisionGoldSpent) || 0,
    villageProvisionStockBefore: entry.villageProvisionStockBefore ?? null,
    villageProvisionStockAfter: entry.villageProvisionStockAfter ?? null,
    provisionsBeforeVillagePurchase: entry.provisionsBeforeVillagePurchase ?? null,
    provisionsAfterVillagePurchase: entry.provisionsAfterVillagePurchase ?? null,
    villageProvisionPurchaseReason: entry.villageProvisionPurchaseReason ?? null,
    villageProvisionActions: compactClone(entry.villageProvisionActions ?? []),
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
    progressionReadinessBlocker: entry.progressionReadinessBlocker ?? null,
    progressionRequiredDistance: Number(entry.progressionRequiredDistance) || 0,
    progressionSupportedDistance: entry.progressionSupportedDistance ?? null,
    preferredSupportedDistance: entry.preferredSupportedDistance ?? null,
    minimumViableSupportedDistance: entry.minimumViableSupportedDistance ?? null,
    progressionUsesMidRouteResupply: Boolean(entry.progressionUsesMidRouteResupply),
    progressionResupplyLocationId: entry.progressionResupplyLocationId ?? null,
    progressionResupplyDistance: entry.progressionResupplyDistance ?? null,
    provisionsRequiredToReachResupply: entry.provisionsRequiredToReachResupply ?? null,
    projectedProvisionsAtResupply: entry.projectedProvisionsAtResupply ?? null,
    projectedVillageProvisionPurchase: Number(entry.projectedVillageProvisionPurchase) || 0,
    projectedVillageProvisionGoldCost: Number(entry.projectedVillageProvisionGoldCost) || 0,
    projectedVillageStockAfter: entry.projectedVillageStockAfter ?? null,
    postResupplySupportedDistance: entry.postResupplySupportedDistance ?? null,
    progressionTargetFullyReachable: Boolean(entry.progressionTargetFullyReachable),
    minimumViableProvisionRequirement: entry.minimumViableProvisionRequirement ?? null,
    preferredProvisionTarget: entry.preferredProvisionTarget ?? null,
    provisionCapacity: entry.provisionCapacity ?? null,
    actualPackedProvisions: entry.actualPackedProvisions ?? null,
    preferredBufferShortfall: entry.preferredBufferShortfall ?? null,
    supplyRunExpectedBenefit: entry.supplyRunExpectedBenefit ?? null,
    supplyRunBenefitReason: entry.supplyRunBenefitReason ?? null,
    oldForestProgressionGoal: entry.oldForestProgressionGoal ?? null,
    oldForestTargetMilestoneDistance: entry.oldForestTargetMilestoneDistance ?? null,
    oldForestGoalReason: entry.oldForestGoalReason ?? null,
    oldForestSupplyRunReason: entry.oldForestSupplyRunReason ?? null,
    druidDraughtCraftable: entry.druidDraughtCraftable ?? null,
    druidDraughtMissingRequirements: compactClone(entry.druidDraughtMissingRequirements ?? []),
    druidDraughtMissingItems: compactClone(entry.druidDraughtMissingItems ?? {}),
    druidDraughtMissingMaterials: compactClone(entry.druidDraughtMissingMaterials ?? {}),
    druidDraughtGoldShortfall: entry.druidDraughtGoldShortfall ?? null,
    druidIngredientAcquisitionPlan: entry.druidIngredientAcquisitionPlan ?? null,
    druidIngredientAcquisitionSource: entry.druidIngredientAcquisitionSource ?? null,
    druidIngredientProtectionActive: Boolean(entry.druidIngredientProtectionActive),
    druidIngredientsProtectedById: compactClone(entry.druidIngredientsProtectedById ?? {}),
    druidPrepRunReason: entry.druidPrepRunReason ?? null,
    objectiveDistanceFloorApplied: Boolean(entry.objectiveDistanceFloorApplied),
    objectiveDistanceFloorViolated: Boolean(entry.objectiveDistanceFloorViolated),
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
      progressionReadinessBlocker: entry.progressionReadinessBlocker ?? null,
      progressionRequiredDistance: Number(entry.progressionRequiredDistance) || 0,
      progressionSupportedDistance: entry.progressionSupportedDistance ?? null,
      preferredSupportedDistance: entry.preferredSupportedDistance ?? null,
      minimumViableSupportedDistance: entry.minimumViableSupportedDistance ?? null,
      minimumViableProvisionRequirement: entry.minimumViableProvisionRequirement ?? null,
      preferredProvisionTarget: entry.preferredProvisionTarget ?? null,
      provisionCapacity: entry.provisionCapacity ?? null,
      actualPackedProvisions: entry.actualPackedProvisions ?? null,
      preferredBufferShortfall: entry.preferredBufferShortfall ?? null,
      supplyRunExpectedBenefit: entry.supplyRunExpectedBenefit ?? null,
      supplyRunBenefitReason: entry.supplyRunBenefitReason ?? null,
      oldForestProgressionGoal: entry.oldForestProgressionGoal ?? null,
      oldForestTargetMilestoneDistance: entry.oldForestTargetMilestoneDistance ?? null,
      oldForestGoalReason: entry.oldForestGoalReason ?? null,
      oldForestSupplyRunReason: entry.oldForestSupplyRunReason ?? null,
      druidDraughtCraftable: entry.druidDraughtCraftable ?? null,
      druidDraughtMissingRequirements: compactClone(entry.druidDraughtMissingRequirements ?? []),
      druidDraughtMissingItems: compactClone(entry.druidDraughtMissingItems ?? {}),
      druidDraughtMissingMaterials: compactClone(entry.druidDraughtMissingMaterials ?? {}),
      druidDraughtGoldShortfall: entry.druidDraughtGoldShortfall ?? null,
      druidIngredientAcquisitionPlan: entry.druidIngredientAcquisitionPlan ?? null,
      druidIngredientAcquisitionSource: entry.druidIngredientAcquisitionSource ?? null,
      druidIngredientProtectionActive: Boolean(entry.druidIngredientProtectionActive),
      druidIngredientsProtectedById: compactClone(entry.druidIngredientsProtectedById ?? {}),
      druidPrepRunReason: entry.druidPrepRunReason ?? null,
      objectiveDistanceFloorApplied: Boolean(entry.objectiveDistanceFloorApplied),
      objectiveDistanceFloorViolated: Boolean(entry.objectiveDistanceFloorViolated),
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
  (campaign.betweenExpeditionDecisions ?? [])
    .filter((decision) => decision.progressionDeferredReason === "supply-run-no-material-benefit")
    .forEach((decision) => events.push({
      type: "supply-run-suppressed-no-benefit",
      expeditionNumber: decision.expeditionNumber,
      routeId: decision.progressionRouteId ?? null,
      blocker: decision.progressionReadinessBlocker ?? null,
      reason: decision.supplyRunBenefitReason ?? decision.progressionDeferredReason,
    }));
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
    if (!entry.isSupplyRun
      && entry.supplyRunExpectedBenefit === false
      && entry.supplyRunBenefitReason === "supply-run-no-material-benefit") {
      events.push({
        type: "supply-run-suppressed-no-benefit",
        expeditionNumber: entry.expeditionNumber,
        routeId: entry.campaignStageAtDeparture ?? null,
        blocker: entry.progressionReadinessBlocker ?? null,
        reason: entry.supplyRunBenefitReason,
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

function campaignDepartureSettings(strategyName, context = {}, campaignGoal = null) {
  const settings = SimulationTravelPolicy.departureSettings(strategyName, context);
  return campaignGoal?.travelSettings
    ? { ...settings, ...campaignGoal.travelSettings }
    : settings;
}

function applyBetweenExpeditionPolicy(
  player, shopStocks, policy, targetDistance, healingEnabled, strategyName = null,
  preparationRandom = GameRandom.random, townActions = [], planningOptions = {},
) {
  const planningStrategy = strategyName ?? defaultStrategyForBetweenPolicy(policy);
  const progressionRequiredDistance = Math.max(
    0, Number(planningOptions.progressionRequiredDistance) || 0,
  );
  const isProgressionAttempt = progressionRequiredDistance > 0;
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
  const capacity = ExpeditionRules.partyProvisionCapacity(activeCompanions, planningOptions.expeditionId);
  let travelSettings = campaignDepartureSettings(planningStrategy, {
    provisions: player.provisions,
    capacity,
    injuries: player.injuries,
  }, planningOptions.campaignGoal);
  const encounterProvisionReserve = SimulationProvisionPlanning.encounterReserve(planningStrategy);
  let provisionUncertaintyBuffer = SimulationProvisionPlanning.provisionUncertaintyBuffer(
    planningStrategy, targetDistance,
  );
  const initialProvisionNeed = estimateCampaignProvisionRequirement(
    targetDistance, activeCompanions, policy.provisionMargin, encounterProvisionReserve,
    travelSettings, provisionUncertaintyBuffer,
  );
  const innCooking = strategyName && player.provisions < Math.min(initialProvisionNeed, capacity)
    ? cookAtInn(player, planningStrategy, preparationRandom, townActions, {
      targetProvisions: Math.min(initialProvisionNeed, capacity),
      targetDistance,
      campaignGoal: planningOptions.campaignGoal,
    })
    : { actions: [], provisionsGained: 0, ingredientsConsumedById: {} };
  travelSettings = campaignDepartureSettings(planningStrategy, {
    provisions: player.provisions,
    capacity,
    injuries: player.injuries,
  }, planningOptions.campaignGoal);
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
  travelSettings = campaignDepartureSettings(planningStrategy, {
    provisions: player.provisions,
    capacity,
    injuries: player.injuries,
  }, planningOptions.campaignGoal);
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
  const routeQuestPack = {
    ...(player.selectedExpeditionId === "fountain_of_barenton" ? { flask: 1 } : {}),
    ...(planningOptions.campaignGoal?.goalId === "defeat-verdant-warden"
      ? { enchanted_verdant_heart: 1 } : {}),
  };
  const bandagesPacked = packCampaignItems(player, {
    ...routeQuestPack,
    bandages: Math.min(bandagePlan.target, bandagesAfterPurchase),
  });
  player.packedMaterials = MaterialRules.prioritizedSelection(
    player.materials,
    CraftingRules.knownRecipesForProvider(player, "campfire"),
  );
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
  const minimumViableProvisionRequirement = targetDistance >= 1
    ? estimateCampaignProvisionRequirement(
      targetDistance, activeCompanions, 0, encounterProvisionReserve, travelSettings, 0,
    ) : 0;
  const preferredProvisionTarget = desiredProvisionStockForNominalDistance;
  const preferredBufferShortfall = Math.max(
    0, preferredProvisionTarget - provisionStockAvailableToPack,
  );
  const preferredSafeDistance = maximumCampaignDistanceForProvisions(
    provisionStockAvailableToPack, activeCompanions,
    policy.provisionMargin, encounterProvisionReserve, travelSettings, planningStrategy,
  );
  const minimumViableSupportedDistance = maximumCampaignDistanceForProvisions(
    provisionStockAvailableToPack, activeCompanions, 0, encounterProvisionReserve, travelSettings,
  );
  const encounterReserveSupportedDistance = minimumViableSupportedDistance;
  const minimumSupportedDistance = maximumCampaignDistanceForProvisions(
    provisionStockAvailableToPack, activeCompanions, 0, 0, travelSettings,
  );
  const safeAffordableDistance = preferredSafeDistance >= 1
    ? preferredSafeDistance
      : encounterReserveSupportedDistance >= 1
        ? encounterReserveSupportedDistance : minimumSupportedDistance;
  let progressionSupportedDistance = Math.max(
    preferredSafeDistance, minimumViableSupportedDistance,
  );
  const planningSupportedDistance = isProgressionAttempt
    ? progressionSupportedDistance : safeAffordableDistance;
  let actualTargetDistance = Math.min(targetDistance, planningSupportedDistance);
  const postPreparationResupply = isProgressionAttempt
    && planningOptions.expeditionId === "old_forest_road"
    ? projectOldForestVillageResupply({
      player,
      shopStocks,
      targetDistance,
      policy,
      strategyName: planningStrategy,
      expeditionId: planningOptions.expeditionId,
      campaignGoal: planningOptions.campaignGoal,
    }) : null;
  if (postPreparationResupply?.progressionTargetFullyReachable) {
    actualTargetDistance = targetDistance;
    progressionSupportedDistance = Math.max(
      progressionSupportedDistance,
      postPreparationResupply.postResupplySupportedDistance,
    );
  }
  const provisionUncertaintyBufferUsed = preferredSafeDistance >= 1
    && (!isProgressionAttempt || preferredSafeDistance >= actualTargetDistance)
    ? SimulationProvisionPlanning.provisionUncertaintyBuffer(planningStrategy, actualTargetDistance)
    : 0;
  const preferredPreparationSupportsChosenTarget = preferredSafeDistance >= actualTargetDistance;
  const minimumPreparationSupportsChosenTarget = minimumViableSupportedDistance >= actualTargetDistance;
  const safetyMarginUsed = preferredPreparationSupportsChosenTarget
    ? policy.provisionMargin : 0;
  const encounterProvisionReserveUsed = preferredPreparationSupportsChosenTarget
    || minimumPreparationSupportsChosenTarget ? encounterProvisionReserve : 0;
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
    : isProgressionAttempt && actualTargetDistance < progressionRequiredDistance
      ? "minimum-viable-provisions-unavailable"
      : preferredProvisionTarget > capacity
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
  if (preferredBufferShortfall > 0) {
    strategyConstraints.push({
      type: "preferred-provision-buffer-unavailable",
      desiredProvisionStock: preferredProvisionTarget,
      preferredProvisionTarget,
      minimumViableProvisionRequirement,
      provisionCapacity: capacity,
      actualProvisionStock: provisionStockAvailableToPack,
      preferredBufferShortfall,
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
    progressionRequiredDistance,
    progressionSupportedDistance,
    progressionReadiness: isProgressionAttempt
      ? actualTargetDistance >= progressionRequiredDistance
        ? preferredPreparationSupportsChosenTarget ? "ready" : "ready-with-constraints"
        : "deferred"
      : null,
    provisionCapacity: capacity,
    provisionStockBeforePurchase,
    desiredProvisionStock,
    desiredProvisionStockForNominalDistance,
    preferredProvisionTarget,
    effectiveProvisionTarget: preferredProvisionTarget,
    minimumViableProvisionRequirement,
    preferredBufferShortfall,
    provisionUncertaintyBuffer,
    provisionUncertaintyBufferUsed,
    requiredProvisionSpend,
    survivalSuppliesFunded,
    affordableProvisionStock,
    actualProvisionStockAfterPurchase,
    provisionStockAvailableToPack,
    preferredSafeDistance,
    encounterReserveSupportedDistance,
    minimumViableSupportedDistance: Math.max(
      minimumViableSupportedDistance,
      postPreparationResupply?.postResupplySupportedDistance ?? 0,
    ),
    progressionUsesMidRouteResupply: Boolean(postPreparationResupply?.usesMidRouteResupply),
    progressionResupplyLocationId: postPreparationResupply?.resupplyLocationId ?? null,
    progressionResupplyDistance: postPreparationResupply?.resupplyDistance ?? null,
    provisionsRequiredToReachResupply: postPreparationResupply?.provisionsRequiredToReachResupply ?? null,
    projectedProvisionsAtResupply: postPreparationResupply?.projectedProvisionsAtResupply ?? null,
    projectedVillageProvisionPurchase: postPreparationResupply?.projectedVillageProvisionPurchase ?? 0,
    projectedVillageProvisionGoldCost: postPreparationResupply?.projectedVillageProvisionGoldCost ?? 0,
    projectedVillageStockAfter: postPreparationResupply?.projectedVillageStockAfter ?? null,
    postResupplySupportedDistance: postPreparationResupply?.postResupplySupportedDistance ?? null,
    progressionTargetFullyReachable: Boolean(
      postPreparationResupply?.progressionTargetFullyReachable,
    ),
    minimumSupportedDistance,
    estimatedProvisionRequirementForChosenDistance,
    departurePassiveFoodEstimate,
    desiredTargetPassiveFoodEstimate,
    encounterProvisionReserve,
    encounterProvisionReserveUsed,
    totalEstimatedProvisionRequirement: estimatedProvisionRequirementForChosenDistance,
    preferredProvisionTargetMet: provisionStockAvailableToPack >= preferredProvisionTarget,
    provisionPurchase,
    bandagePurchase,
    craftingActions,
    bandagesBeforeCrafting,
    bandagesCrafted,
    bandagesBeforePurchase,
    bandagesAfterPurchase,
    bandagesPurchased: bandagePurchase.quantity,
    bandagesPacked,
    actualPackedProvisions: provisionStockAvailableToPack,
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
  const requested = Object.entries(desiredQuantities)
    .filter(([itemId, desiredQuantity]) => desiredQuantity > 0 && (player.ownedItems[itemId] ?? 0) > 0)
    .map(([itemId]) => itemId);
  const required = requested.filter((itemId) => itemId !== "bandages");
  const packed = [
    ...required,
    ...(player.packedItems ?? []).filter((itemId) => !required.includes(itemId)),
    ...requested.filter((itemId) => itemId === "bandages"),
  ].filter((itemId, index, entries) => entries.indexOf(itemId) === index);
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

function cookAtInn(
  player, strategyName, random = GameRandom.random, townActions = [], options = {},
) {
  const actions = [];
  const ingredientsConsumedById = {};
  const targetProvisions = Number.isFinite(Number(options.targetProvisions))
    ? Math.max(0, Number(options.targetProvisions)) : Number.POSITIVE_INFINITY;
  const roll = () => Math.min(1 - Number.EPSILON, Math.max(0, Number(random()) || 0));
  const protectedIngredients = campaignDruidIngredientProtection(player, options.campaignGoal);
  let iterations = 0;
  while (player.provisions < targetProvisions && iterations < 8) {
    iterations += 1;
    const candidates = CraftingRules.knownRecipesForProvider(player, "campfire")
      .map((recipe) => ({
        recipe,
        quote: CraftingRules.quote(player, recipe.id, "campfire", { context: "inn" }),
      }))
      .filter((candidate) => candidate.quote.available && Number(candidate.recipe.output?.provisions) > 0)
      .filter((candidate) => !campaignRecipeConsumesProtectedIngredients(
        candidate.recipe, protectedIngredients, player,
      ));
    if (!candidates.length) break;
    const deficit = Math.max(1, targetProvisions - player.provisions);
    const selected = candidates
      .map((candidate) => ({
        ...candidate,
        score: campaignCookingScore(candidate.recipe, strategyName, deficit, options.targetDistance),
      }))
      .sort((left, right) => right.score - left.score || left.recipe.id.localeCompare(right.recipe.id));
    const candidate = strategyName === "random"
      ? selected[Math.floor(roll() * selected.length)] : selected[0];
    const result = CraftingRules.craft(player, candidate.recipe.id, "campfire", { context: "inn" });
    if (!result.applied) break;
    const consumed = {
      ...(result.materialsConsumed ?? {}),
      ...(result.itemsConsumed ?? {}),
    };
    Object.entries(consumed).forEach(([itemId, quantity]) => {
      ingredientsConsumedById[itemId] = (ingredientsConsumedById[itemId] ?? 0) + quantity;
    });
    const action = {
      recipeId: result.recipeId,
      providerId: "campfire",
      context: "inn",
      provisionsGained: result.provisions ?? 0,
      ingredientsConsumed: deepCampaignClone(consumed),
      goldCost: result.goldCost ?? 0,
    };
    actions.push(action);
    townActions.push({ type: "cook-recipe", ...deepCampaignClone(action) });
  }
  return {
    actions,
    provisionsGained: actions.reduce((sum, action) => sum + (Number(action.provisionsGained) || 0), 0),
    ingredientsConsumedById,
  };
}

function campaignCookingScore(recipe, strategyName, deficit, targetDistance = 0) {
  const output = Number(recipe.output?.provisions) || 0;
  const ingredients = CraftingRules.normalizeRecipeIngredients(recipe);
  const ingredientCount = ingredients.reduce((sum, ingredient) => sum + (Number(ingredient.quantity) || 0), 0);
  const efficiency = output / Math.max(1, ingredientCount);
  const excess = Math.max(0, output - deficit);
  const deepPreparation = Number(targetDistance) >= 95;
  const scarceIngredientCost = ingredients.reduce((sum, ingredient) => (
    sum + (ingredient.id === "honey" ? (deepPreparation ? 0 : 6)
      : ingredient.id === "rare_herbs" ? (deepPreparation ? 0 : 3) : 0)
  ), 0);
  return output * (strategyName === "cautious" ? 2 : strategyName === "aggressive" ? 1.5 : 1)
    + efficiency * (strategyName === "aggressive" ? 2 : 1)
    + Math.min(output, deficit) * 2
    - excess * 1.5
    - scarceIngredientCost;
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
  const campaignMode = configuration.campaignMode === "progression"
    || configuration.progressionMode === true
    || configuration.campaignProgressionMode === true
    ? "progression" : "repeated";
  const configuredObjective = configuration.completionObjective;
  const completionObjective = campaignMode !== "progression"
    ? null
    : configuredObjective === undefined
      ? "old_forest_flask"
      : configuredObjective === null || configuredObjective === ""
        ? "full_campaign"
        : CAMPAIGN_COMPLETION_OBJECTIVE_DEFINITIONS[configuredObjective]
          ? configuredObjective : "full_campaign";
  return {
    id: configuration.id ?? "campaign",
    seed: String(configuration.seed ?? "campaign-simulation"),
    strategy: configuration.strategy ?? "cautious",
    betweenExpeditionPolicy: configuration.betweenExpeditionPolicy ?? "conservative-sustainer",
    expeditionPlan: plan.map((distance) => Math.max(1, Number(distance) || 50)),
    maxExpeditions: count,
    campaignMode,
    completionObjective,
    startingState: configuration.startingState ?? {},
    healingEnabled: configuration.healingEnabled !== false,
    autoSellRecoveredLoot: configuration.autoSellRecoveredLoot !== false,
  };
}

function isObjectiveLimitedCampaign(config = {}) {
  return config.campaignMode === "progression"
    && config.completionObjective === "old_forest_flask";
}

function campaignCompletionObjectiveAchieved(completionObjective, state = {}, run = null) {
  if (completionObjective !== "old_forest_flask") return false;
  const flaskSecured = Number(state?.ownedItems?.flask) > 0
    && state?.campaignFlags?.verdant_warden_defeated === true;
  return Boolean(flaskSecured && (run === null || run?.returnedSafely === true));
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
    supplyRunHistoryByRoute: Object.fromEntries(
      CAMPAIGN_PROGRESSION_ROUTES.map((routeId) => [routeId, []]),
    ),
    currentOldForestGoal: null,
    oldForestProgressionGoalByExpedition: [],
    completionObjectiveAchieved: false,
    currentContentCompleted: false,
  };
}

function hasCampaignItem(state, itemId) {
  return Number(state?.ownedItems?.[itemId]) > 0;
}

function selectCampaignProgressionExpedition(routeId, player) {
  return { routeId, runKind: "progression" };
}

function hasCampaignKnowledge(state, knowledgeId) {
  return Array.isArray(state?.learnedKnowledge) && state.learnedKnowledge.includes(knowledgeId);
}

function oldForestGoal({ goalId, targetDistance, minimumAttemptDistance, reason, requiredPreparation, supplyRunUseful, supplyRunReason, travelSettings = null, druidTelemetry = null }) {
  return {
    goalId,
    targetDistance,
    minimumAttemptDistance,
    reason,
    requiredPreparation,
    preferredPreparation: requiredPreparation,
    supplyRunUseful,
    supplyRunReason,
    travelSettings,
    ...(druidTelemetry ?? {}),
  };
}

const DRUID_DRAUGHT_SOURCE_DEFINITIONS = Object.freeze({
  honey: Object.freeze({
    shopId: "forest_village_provisions",
    locationId: "hidden_forest_village",
    encounterSource: "forest_ingredients",
  }),
  fresh_herbs: Object.freeze({
    shopId: "forest_village_provisions",
    locationId: "hidden_forest_village",
    encounterSource: "woodland_foraging",
  }),
  rare_herbs: Object.freeze({
    encounterSource: "rare_herb_find",
    route: "overgrown_trail",
  }),
  medicinal_herbs: Object.freeze({
    encounterSource: "forest_materials",
    route: "old_forest_road",
  }),
});

function druidDraughtRequirementQuote(player) {
  return CraftingRules.quote(
    player, "forest_communion_draught", "apothecary", { context: "town" },
  );
}

function druidDraughtRequirementAnalysis(player, campaignState = {}) {
  const quote = druidDraughtRequirementQuote(player);
  const missingRequirements = (quote.ingredientStatus ?? [])
    .filter((entry) => !entry.sufficient)
    .map((entry) => ({
      ingredientId: entry.ingredientId,
      type: entry.type,
      required: entry.required,
      owned: entry.owned,
      missing: Math.max(0, entry.required - entry.owned),
    }));
  const missingItems = Object.fromEntries(missingRequirements
    .filter((entry) => entry.type === "item")
    .map((entry) => [entry.ingredientId, entry.missing]));
  const missingMaterials = Object.fromEntries(missingRequirements
    .filter((entry) => entry.type === "material")
    .map((entry) => [entry.ingredientId, entry.missing]));
  const goldShortfall = Math.max(
    0, Math.ceil(Number(quote.recipe?.goldCost) || 0) - Math.max(0, Number(player?.currentGold) || 0),
  );
  const shopStocks = campaignState.shopStocks ?? {};
  const sourceDefinitions = campaignState.druidIngredientSources
    ?? DRUID_DRAUGHT_SOURCE_DEFINITIONS;
  const sourceDetails = missingRequirements.map((entry) => {
    const source = sourceDefinitions[entry.ingredientId] ?? null;
    if (!source) return { ...entry, source: null, sourceType: null, available: false };
    const shopOffer = source.shopId
      ? SHOP_DEFINITIONS[source.shopId]?.itemsForSale?.[entry.ingredientId] : null;
    const shopStock = source.shopId
      ? Number(shopStocks[`${source.shopId}:${entry.ingredientId}`] ?? shopOffer?.stock ?? 0) : 0;
    const shopAffordable = Boolean(
      shopOffer && Number.isFinite(Number(shopOffer.price))
        && Number(player?.currentGold) >= Number(shopOffer.price) + goldShortfall,
    );
    const shopAvailable = Boolean(
      source.locationId === "hidden_forest_village"
        && player?.campaignFlags?.forest_village_discovered === true
        && shopStock >= entry.missing
        && shopAffordable,
    );
    const encounterAvailable = Boolean(source.encounterSource);
    return {
      ...entry,
      source: shopAvailable ? source.locationId : source.encounterSource,
      sourceType: shopAvailable ? "shop" : "encounter",
      available: shopAvailable || encounterAvailable,
      shopAvailable,
      shopStock,
      shopPrice: shopOffer?.price ?? null,
      route: source.route ?? null,
    };
  });
  const unavailable = sourceDetails.filter((entry) => !entry.available);
  const shopIngredients = sourceDetails.filter((entry) => entry.shopAvailable);
  const encounterIngredients = sourceDetails.filter((entry) => !entry.shopAvailable && entry.available);
  const sourceNames = [...new Set(sourceDetails.filter((entry) => entry.available).map((entry) => entry.source))];
  const sourceRoutes = [...new Set(sourceDetails
    .filter((entry) => entry.route && entry.available)
    .map((entry) => entry.route))];
  const hasDraught = hasCampaignItem(player, "forest_communion_draught");
  const craftable = hasDraught || Boolean(quote.available);
  let acquisitionPlan = null;
  let acquisitionSource = null;
  let prepRunReason = "druid-draught-requirements-ready-for-town-crafting";
  if (!craftable && unavailable.length > 0) {
    acquisitionPlan = "blocked-no-valid-source";
    prepRunReason = `druid-no-valid-acquisition-source-for-${unavailable.map((entry) => entry.ingredientId).join(",")}`;
  } else if (!craftable && goldShortfall > 0 && missingRequirements.length === 0) {
    acquisitionPlan = "earn-gold-before-crafting";
    acquisitionSource = "old_forest_loot";
    prepRunReason = `druid-gold-shortfall-${goldShortfall}`;
  } else if (!craftable && shopIngredients.length > 0) {
    acquisitionPlan = "buy-at-hidden-village";
    acquisitionSource = "hidden_forest_village";
    prepRunReason = `druid-buy-missing-${shopIngredients.map((entry) => entry.ingredientId).join(",")}-at-hidden-village`;
  } else if (!craftable && encounterIngredients.length > 0) {
    acquisitionPlan = "forage-on-overgrown-trail";
    acquisitionSource = sourceNames.join("+") || "old_forest_encounters";
    prepRunReason = `druid-gather-missing-${encounterIngredients.map((entry) => entry.ingredientId).join(",")}-from-authored-forest-sources`;
  }
  return {
    quote,
    craftable,
    missingRequirements,
    missingItems,
    missingMaterials,
    goldShortfall,
    acquisitionPlan,
    acquisitionSource,
    prepRunReason,
    sourceDetails,
    sourceRoutes,
    ingredientProtection: Object.fromEntries((quote.ingredientStatus ?? [])
      .filter((entry) => Number(entry.owned) > 0)
      .map((entry) => [entry.ingredientId, Math.min(entry.owned, entry.required)])),
  };
}

function campaignDruidIngredientProtection(player, campaignGoal = null) {
  if (campaignGoal?.goalId !== "complete-druid-favor") return {};
  return deepCampaignClone(campaignGoal.druidIngredientsProtectedById ?? {});
}

function campaignRecipeConsumesProtectedIngredients(recipe, protectedById = {}, player = null) {
  return CraftingRules.normalizeRecipeIngredients(recipe).some((ingredient) => {
    const protectedQuantity = Math.max(0, Number(protectedById[ingredient.id]) || 0);
    if (protectedQuantity <= 0) return false;
    const available = ingredient.type === "material"
      ? Number(player?.materials?.[ingredient.id]) || 0
      : Number(player?.ownedItems?.[ingredient.id]) || 0;
    return Math.max(0, available - protectedQuantity) < (Number(ingredient.quantity) || 0);
  });
}

function druidTelemetryFromGoal(goal = null) {
  return {
    druidDraughtCraftable: goal?.druidDraughtCraftable ?? null,
    druidDraughtMissingRequirements: deepCampaignClone(goal?.druidDraughtMissingRequirements ?? []),
    druidDraughtMissingItems: deepCampaignClone(goal?.druidDraughtMissingItems ?? {}),
    druidDraughtMissingMaterials: deepCampaignClone(goal?.druidDraughtMissingMaterials ?? {}),
    druidDraughtGoldShortfall: goal?.druidDraughtGoldShortfall ?? null,
    druidIngredientAcquisitionPlan: goal?.druidIngredientAcquisitionPlan ?? null,
    druidIngredientAcquisitionSource: goal?.druidIngredientAcquisitionSource ?? null,
    druidIngredientProtectionActive: Boolean(goal?.druidIngredientProtectionActive),
    druidIngredientsProtectedById: deepCampaignClone(goal?.druidIngredientsProtectedById ?? {}),
    druidPrepRunReason: goal?.druidPrepRunReason ?? null,
  };
}

function assessOldForestProgressionGoal(player, campaignState = {}) {
  const flags = player?.campaignFlags ?? {};
  const owns = (itemId) => hasCampaignItem(player, itemId);
  const hasWoodcraft = hasCampaignKnowledge(player, "woodcraft");
  const hasSong = hasCampaignKnowledge(player, "song_of_the_forest");
  const hasHeart = owns("verdant_heart") || owns("enchanted_verdant_heart");
  const hasGrace = owns("verdant_shard_grace") || hasHeart;
  const hasWrath = owns("verdant_shard_wrath") || hasHeart;
  const hasEnchantedHeart = owns("enchanted_verdant_heart");
  const villageDiscovered = flags.forest_village_discovered === true;
  const druidComplete = flags.druid_favor_complete === true;
  const liquidWealth = campaignLiquidWealth(player);
  const druidAnalysis = druidDraughtRequirementAnalysis(player, campaignState);
  const druidTelemetry = {
    druidDraughtCraftable: druidAnalysis.craftable,
    druidDraughtMissingRequirements: druidAnalysis.missingRequirements,
    druidDraughtMissingItems: druidAnalysis.missingItems,
    druidDraughtMissingMaterials: druidAnalysis.missingMaterials,
    druidDraughtGoldShortfall: druidAnalysis.goldShortfall,
    druidIngredientAcquisitionPlan: druidAnalysis.acquisitionPlan,
    druidIngredientAcquisitionSource: druidAnalysis.acquisitionSource,
    druidIngredientProtectionActive: Object.keys(druidAnalysis.ingredientProtection).length > 0,
    druidIngredientsProtectedById: druidAnalysis.ingredientProtection,
    druidPrepRunReason: druidAnalysis.prepRunReason,
  };
  const healthRatio = Number(player?.arthurHealth) > 0
    ? Number(player.arthurHealth) / Math.max(1, Number(player?.arthurMaxHealth) || PLAYER_CHARACTER_DEFINITION.combat.maxHp)
    : 0;
  const strategy = campaignState.strategy ?? "cautious";
  const villageProvisionOffer = CampaignRules.provisionShopForLocation("hidden_forest_village")
    ?.provisionsForSale;
  const villageReachTravelSettings = campaignDepartureSettings(strategy, {
    provisions: player?.provisions,
    capacity: ExpeditionRules.partyProvisionCapacity(selectedCompanionIds(player), "old_forest_road"),
    injuries: player?.injuries,
  });
  const canReachKnownVillageResupply = villageDiscovered
    && Number(villageProvisionOffer?.stock) > 0
    && Number.isFinite(Number(villageProvisionOffer?.price))
    && Number(player?.currentGold) >= Number(villageProvisionOffer.price)
    && Number(player?.provisions) >= campaignOneWayProvisionCost(
      OLD_FOREST_VILLAGE_RESUPPLY_DISTANCE,
      selectedCompanionIds(player),
      villageReachTravelSettings,
    );
  const preparationRunUseful = (reason) => ({
    useful: true,
    reason,
  });
  const optionalSupplyRun = (reason) => ({
    useful: liquidWealth < 80
      || (Number(player?.provisions) < 30 && !canReachKnownVillageResupply),
    reason,
  });

  if (!hasGrace) {
    if (!hasWoodcraft && !villageDiscovered) {
      const supply = preparationRunUseful("learn-woodcraft-and-open-the-overgrown-route");
      return oldForestGoal({
        goalId: "learn-woodcraft",
        targetDistance: 70,
        minimumAttemptDistance: 55,
        reason: "The first useful forest lesson is still missing; use an early run to find Woodcraft without requiring every optional reward.",
        requiredPreparation: { knowledge: ["woodcraft"], route: "overgrown_trail" },
        supplyRunUseful: supply.useful,
        supplyRunReason: supply.reason,
      });
    }
    const supply = preparationRunUseful("secure-the-white-hart-grace-shard");
    return oldForestGoal({
      goalId: "secure-grace-shard",
      targetDistance: 75,
      minimumAttemptDistance: 60,
      reason: "The first Verdant shard is still missing; deliberately take the peaceful White Hart path.",
      requiredPreparation: { item: "verdant_shard_grace", route: "overgrown_trail" },
      supplyRunUseful: supply.useful,
      supplyRunReason: supply.reason,
    });
  }

  if (!villageDiscovered) {
    const supply = optionalSupplyRun("prepare-provisions-and-healing-before-the-village-milestone");
    return oldForestGoal({
      goalId: "discover-village",
      targetDistance: 95,
      minimumAttemptDistance: strategy === "aggressive" ? 70 : 78,
      reason: "Early route progress is established; stop farming the shallow band and deliberately reach the hidden village milestone.",
      requiredPreparation: { campaignFlag: "forest_village_discovered", targetDistance: 95 },
      supplyRunUseful: supply.useful,
      supplyRunReason: supply.reason,
    });
  }

  if (!druidComplete || !hasSong) {
    const supply = druidAnalysis.craftable
      ? { useful: false, reason: "druid-draught-ingredients-ready-for-town-crafting" }
      : {
        useful: druidAnalysis.acquisitionPlan !== "blocked-no-valid-source",
        reason: druidAnalysis.prepRunReason,
      };
    return oldForestGoal({
      goalId: "complete-druid-favor",
      targetDistance: 100,
      minimumAttemptDistance: strategy === "aggressive" ? 75 : 82,
      reason: "The village is known, but the Druid's one-time favor and Song of the Forest are not complete.",
      requiredPreparation: { campaignFlag: "druid_favor_complete", knowledge: ["song_of_the_forest"], item: "forest_communion_draught" },
      supplyRunUseful: supply.useful,
      supplyRunReason: supply.reason,
      druidTelemetry,
    });
  }

  if (!hasWrath) {
    const supply = optionalSupplyRun("build enough survivability and supplies for the Thorn-Crowned Hart");
    return oldForestGoal({
      goalId: "secure-wrath-shard",
      targetDistance: 140,
      minimumAttemptDistance: 140,
      reason: "The Druid chain is complete; the next mandatory piece is the guaranteed Thorn-Crowned Hart at the deep milestone.",
      requiredPreparation: { item: "verdant_shard_wrath", encounter: "thorn_crowned_hart", targetDistance: 140 },
      supplyRunUseful: supply.useful || healthRatio < 0.8,
      supplyRunReason: supply.reason,
      travelSettings: strategy === "aggressive" ? { paceId: "normal", rationId: "normal" } : null,
    });
  }

  if (!hasHeart) {
    return oldForestGoal({
      goalId: "forge-verdant-heart",
      targetDistance: 80,
      minimumAttemptDistance: 55,
      reason: "Both Verdant shards are secured; let the Camelot blacksmith forge the protected unique Heart before another deep attempt.",
      requiredPreparation: { item: "verdant_heart", recipe: "verdant_heart", shards: ["verdant_shard_grace", "verdant_shard_wrath"] },
      supplyRunUseful: false,
      supplyRunReason: "town-crafting-is-the-next-meaningful-action",
    });
  }

  if (!hasEnchantedHeart) {
    return oldForestGoal({
      goalId: "enchant-heart",
      targetDistance: 95,
      minimumAttemptDistance: 75,
      reason: "The dormant Heart is forged; return through the Druid favor to awaken it before the altar attempt.",
      requiredPreparation: { item: "enchanted_verdant_heart", campaignFlag: "druid_favor_complete", knowledge: ["song_of_the_forest"] },
      supplyRunUseful: false,
      supplyRunReason: "town-enchantment-is-the-next-meaningful-action",
    });
  }

  return oldForestGoal({
    goalId: "defeat-verdant-warden",
    targetDistance: 180,
    minimumAttemptDistance: 180,
    reason: "The Heart is enchanted and the Song is known; make the final altar and Verdant Warden attempt.",
    requiredPreparation: { item: "enchanted_verdant_heart", knowledge: ["song_of_the_forest"], encounter: "verdant_altar", targetDistance: 180 },
    supplyRunUseful: liquidWealth < 60
      || (Number(player?.provisions) < 30 && !canReachKnownVillageResupply)
      || healthRatio < 0.8,
    supplyRunReason: "prepare-final-healing-and-provisions",
    travelSettings: strategy === "aggressive" ? { paceId: "normal", rationId: "normal" } : null,
  });
}

function assessProgressionReadiness(
  routeId, desiredTargetDistance, routeObjectiveDistance,
  player, shopStocks, policy, strategyName, progressionState = null, expeditionId = routeId, options = {},
) {
  const objectiveDistance = Number(routeObjectiveDistance) || 0;
  const desiredDistance = Number(desiredTargetDistance) || 0;
  const requiredDistance = Math.max(
    0, Number(options.requiredDistance) || Math.max(objectiveDistance, desiredDistance),
  );
  if (!routeId || requiredDistance <= 0) {
    return {
      status: "ready",
      reason: null,
      requiredDistance: objectiveDistance,
      supportedDistance: null,
      minimumViableProvisionRequirement: 0,
      preferredProvisionTarget: 0,
      provisionCapacity: null,
      provisionStock: null,
      preferredBufferShortfall: 0,
      progressionUsesMidRouteResupply: false,
      progressionResupplyLocationId: null,
      progressionResupplyDistance: null,
      provisionsRequiredToReachResupply: null,
      projectedProvisionsAtResupply: null,
      projectedVillageProvisionPurchase: 0,
      projectedVillageProvisionGoldCost: 0,
      projectedVillageStockAfter: null,
      postResupplySupportedDistance: null,
      progressionTargetFullyReachable: false,
      supplyRunExpectedBenefit: false,
      supplyRunBenefitReason: null,
    };
  }
  const quote = quoteCampaignProvisionAvailability(
    player, shopStocks, policy, desiredTargetDistance, strategyName, expeditionId, options.goal,
  );
  const preferredReady = quote.preferredSafeDistance >= desiredDistance
    && quote.provisionStock >= quote.preferredProvisionTarget;
  const minimumViable = quote.minimumViableSupportedDistance >= requiredDistance;
  const druidSourceBlocked = options.goal?.druidIngredientAcquisitionPlan === "blocked-no-valid-source";
  const blocker = druidSourceBlocked
    ? "druid-ingredient-source"
    : quote.provisionCapacity < quote.minimumViableProvisionRequirement
    ? "provision-capacity"
    : quote.provisionStock < quote.minimumViableProvisionRequirement
      ? "insufficient-provisions"
      : "minimum-distance-unsupported";
  const supplyHistory = progressionState?.supplyRunHistoryByRoute?.[routeId] ?? [];
  const lastSupplyRun = [...supplyHistory].reverse()
    .find((entry) => !options.goal?.goalId || entry.goalId === options.goal.goalId) ?? null;
  const supplyRunExpectedBenefit = !druidSourceBlocked && !minimumViable
    && blocker !== "provision-capacity"
    && options.goal?.supplyRunUseful !== false
    && (!lastSupplyRun || lastSupplyRun.materiallyImproved);
  const supplyRunBenefitReason = druidSourceBlocked
    ? "no-valid-druid-ingredient-source"
    : minimumViable
    ? (preferredReady ? null : "preferred-buffer-is-optional")
    : blocker === "provision-capacity"
      ? "capacity-not-improvable-by-supply-run"
      : !supplyRunExpectedBenefit
        ? "supply-run-no-material-benefit"
        : "supply-run-can-improve-provisions-or-gold";
  const status = druidSourceBlocked
    ? "blocked"
    : minimumViable
    ? preferredReady ? "ready" : "ready-with-constraints"
    : supplyRunExpectedBenefit ? "deferred" : "blocked";
  const reason = druidSourceBlocked
    ? options.goal?.druidPrepRunReason ?? "no-valid-druid-ingredient-source"
    : minimumViable
    ? preferredReady
      ? null
      : options.goal && requiredDistance < desiredDistance
        ? "reasonable-milestone-attempt"
        : "preferred-provision-buffer-unavailable"
    : blocker === "provision-capacity"
      ? "progression-objective-unsupported-by-capacity"
      : supplyRunExpectedBenefit ? "objective-distance-floor" : "supply-run-no-material-benefit";
  const readinessMetric = progressionReadinessMetric(quote, player);
  return {
    status,
    reason,
    requiredDistance,
    desiredDistance,
    goal: options.goal ? deepCampaignClone(options.goal) : null,
    supportedDistance: Math.max(
      quote.preferredSafeDistance, quote.minimumViableSupportedDistance,
    ),
    preferredSupportedDistance: quote.preferredSafeDistance,
    minimumViableSupportedDistance: quote.minimumViableSupportedDistance,
    minimumViableProvisionRequirement: quote.minimumViableProvisionRequirement,
    preferredProvisionTarget: quote.preferredProvisionTarget,
    provisionCapacity: quote.capacity,
    provisionStock: quote.provisionStock,
    preferredBufferShortfall: Math.max(
      0, quote.preferredProvisionTarget - quote.provisionStock,
    ),
    progressionUsesMidRouteResupply: Boolean(quote.villageResupply?.usesMidRouteResupply),
    progressionResupplyLocationId: quote.villageResupply?.resupplyLocationId ?? null,
    progressionResupplyDistance: quote.villageResupply?.resupplyDistance ?? null,
    provisionsRequiredToReachResupply: quote.villageResupply?.provisionsRequiredToReachResupply ?? null,
    projectedProvisionsAtResupply: quote.villageResupply?.projectedProvisionsAtResupply ?? null,
    projectedVillageProvisionPurchase: quote.villageResupply?.projectedVillageProvisionPurchase ?? 0,
    projectedVillageProvisionGoldCost: quote.villageResupply?.projectedVillageProvisionGoldCost ?? 0,
    projectedVillageStockAfter: quote.villageResupply?.projectedVillageStockAfter ?? null,
    postResupplySupportedDistance: quote.villageResupply?.postResupplySupportedDistance ?? null,
    progressionTargetFullyReachable: Boolean(quote.villageResupply?.progressionTargetFullyReachable),
    progressionReadinessBlocker: blocker,
    blocker,
    readinessMetric,
    supplyRunExpectedBenefit,
    supplyRunBenefitReason,
  };
}

function shouldRunProgressionSupplyRun(
  routeId, desiredTargetDistance, routeObjectiveDistance,
  player, shopStocks, policy, strategyName, progressionState = null,
) {
  return assessProgressionReadiness(
    routeId, desiredTargetDistance, routeObjectiveDistance,
    player, shopStocks, policy, strategyName, progressionState,
  ).status === "deferred";
}

function assessPreparedProgressionReadiness(
  routeId, requiredDistance, decision, player, progressionState, goal = null,
) {
  const resupplyViable = Boolean(
    decision.progressionTargetFullyReachable
      && decision.progressionResupplyLocationId
      && Number(decision.postResupplySupportedDistance) >= requiredDistance,
  );
  const minimumViable = resupplyViable || (
    decision.minimumViableSupportedDistance >= requiredDistance
      && decision.provisionStockAvailableToPack >= decision.minimumViableProvisionRequirement
  );
  const preferredReady = decision.preferredSafeDistance >= requiredDistance
    && decision.preferredProvisionTargetMet;
  const blocker = resupplyViable ? null : decision.provisionCapacity < decision.minimumViableProvisionRequirement
    ? "provision-capacity"
    : "insufficient-provisions";
  const supplyHistory = progressionState?.supplyRunHistoryByRoute?.[routeId] ?? [];
  const lastSupplyRun = [...supplyHistory].reverse()
    .find((entry) => !goal?.goalId || entry.goalId === goal.goalId) ?? null;
  const supplyRunExpectedBenefit = !minimumViable
    && blocker !== "provision-capacity"
    && goal?.supplyRunUseful !== false
    && (!lastSupplyRun || lastSupplyRun.materiallyImproved);
  const supplyRunBenefitReason = minimumViable
    ? (preferredReady ? null : "preferred-buffer-is-optional")
    : blocker === "provision-capacity"
      ? "capacity-not-improvable-by-supply-run"
      : !supplyRunExpectedBenefit
        ? "supply-run-no-material-benefit"
        : "supply-run-can-improve-provisions-or-gold";
  return {
    status: minimumViable
      ? preferredReady ? "ready" : "ready-with-constraints"
      : supplyRunExpectedBenefit ? "deferred" : "blocked",
    reason: minimumViable
      ? preferredReady ? null : "preferred-provision-buffer-unavailable"
      : blocker === "provision-capacity"
        ? "progression-objective-unsupported-by-capacity"
        : supplyRunExpectedBenefit ? "objective-distance-floor-after-preparation"
          : "supply-run-no-material-benefit",
    requiredDistance,
    supportedDistance: Math.max(
      decision.preferredSafeDistance, decision.minimumViableSupportedDistance,
    ),
    preferredSupportedDistance: decision.preferredSafeDistance,
    minimumViableSupportedDistance: decision.minimumViableSupportedDistance,
    minimumViableProvisionRequirement: decision.minimumViableProvisionRequirement,
    preferredProvisionTarget: decision.preferredProvisionTarget,
    provisionCapacity: decision.provisionCapacity,
    provisionStock: decision.provisionStockAvailableToPack,
    preferredBufferShortfall: decision.preferredBufferShortfall,
    blocker,
    readinessMetric: {
      provisionStock: decision.provisionStockAvailableToPack,
      capacity: decision.provisionCapacity,
      minimumViableProvisionRequirement: decision.minimumViableProvisionRequirement,
      minimumViableSupportedDistance: decision.minimumViableSupportedDistance,
      currentGold: Number(player.currentGold) || 0,
      provisionShopStock: 0,
      progressionUsesMidRouteResupply: Boolean(decision.progressionUsesMidRouteResupply),
      progressionResupplyLocationId: decision.progressionResupplyLocationId ?? null,
      progressionResupplyDistance: decision.progressionResupplyDistance ?? null,
      provisionsRequiredToReachResupply: decision.provisionsRequiredToReachResupply ?? null,
      projectedProvisionsAtResupply: decision.projectedProvisionsAtResupply ?? null,
      projectedVillageProvisionPurchase: decision.projectedVillageProvisionPurchase ?? 0,
      projectedVillageProvisionGoldCost: decision.projectedVillageProvisionGoldCost ?? 0,
      projectedVillageStockAfter: decision.projectedVillageStockAfter ?? null,
      postResupplySupportedDistance: decision.postResupplySupportedDistance ?? null,
      progressionTargetFullyReachable: Boolean(decision.progressionTargetFullyReachable),
    },
    supplyRunExpectedBenefit,
    supplyRunBenefitReason,
  };
}

function progressionSupplyRunDistance(strategyName) {
  const targets = CAMPAIGN_TUNING.provisionPreparation.supplyRunTargetDistance;
  return targets[strategyName] ?? targets.random;
}

function campaignOneWayProvisionCost(distance, companionIds, travelSettings = {}) {
  return estimateCampaignPassiveProvisionCost(distance, companionIds, travelSettings) / 2;
}

function maximumCampaignDistanceAfterResupply(
  provisions, resupplyDistance, companionIds, travelSettings, safetyMargin,
  encounterProvisionReserve, strategyName = null,
) {
  const available = Math.max(0, Number(provisions) || 0);
  const start = Math.max(0, Number(resupplyDistance) || 0);
  const limit = Math.max(start, 600);
  let supported = start;
  for (let distance = start; distance <= limit; distance += 1) {
    const uncertainty = strategyName
      ? SimulationProvisionPlanning.provisionUncertaintyBuffer(strategyName, distance)
      : 0;
    const requirement = campaignOneWayProvisionCost(
      distance - start, companionIds, travelSettings,
    ) + campaignOneWayProvisionCost(distance, companionIds, travelSettings)
      + Math.max(0, Number(safetyMargin) || 0)
      + Math.max(0, Number(encounterProvisionReserve) || 0)
      + uncertainty;
    if (requirement > available) break;
    supported = distance;
  }
  return supported;
}

function projectOldForestVillageResupply({
  player, shopStocks, targetDistance, policy, strategyName, expeditionId,
  provisions = null, currentGold = null, campaignGoal = null,
} = {}) {
  const companionIds = selectedCompanionIds(player);
  const capacity = ExpeditionRules.partyProvisionCapacity(companionIds, expeditionId);
  const currentProvisions = Math.max(
    0, Number(provisions ?? player?.provisions) || 0,
  );
  const availableGold = Math.max(0, Number(currentGold ?? player?.currentGold) || 0);
  const target = Math.max(0, Number(targetDistance) || 0);
  const serviceShop = CampaignRules.provisionShopForLocation("hidden_forest_village");
  const offer = serviceShop?.provisionsForSale;
  const stockBefore = serviceShop
    ? Math.max(0, Number(shopStocks?.[serviceShop.id]) || 0) : 0;
  const travelSettings = campaignDepartureSettings(strategyName, {
    provisions: currentProvisions,
    capacity,
    injuries: player?.injuries,
  }, campaignGoal);
  const encounterProvisionReserve = SimulationProvisionPlanning.encounterReserve(strategyName);
  const serviceKnown = player?.campaignFlags?.forest_village_discovered === true;
  const price = Number(offer?.price);
  const serviceEnabled = Boolean(
    target > OLD_FOREST_VILLAGE_RESUPPLY_DISTANCE
      && serviceKnown
      && offer
      && Number.isFinite(price)
      && price >= 0,
  );
  const provisionsRequiredToReachResupply = campaignOneWayProvisionCost(
    OLD_FOREST_VILLAGE_RESUPPLY_DISTANCE, companionIds, travelSettings,
  );
  const canReachResupply = serviceEnabled
    && currentProvisions >= provisionsRequiredToReachResupply;
  const projectedProvisionsAtResupply = canReachResupply
    ? Math.max(0, currentProvisions - provisionsRequiredToReachResupply) : null;
  const expectedAfterVillageTravel = campaignOneWayProvisionCost(
    target - OLD_FOREST_VILLAGE_RESUPPLY_DISTANCE, companionIds, travelSettings,
  ) + campaignOneWayProvisionCost(target, companionIds, travelSettings);
  const projectedProvisionTarget = Math.min(
    capacity,
    Math.ceil(expectedAfterVillageTravel + (Number(policy?.provisionMargin) || 0)
      + encounterProvisionReserve
      + SimulationProvisionPlanning.provisionUncertaintyBuffer(strategyName, target)),
  );
  const affordable = price > 0 ? Math.floor(availableGold / price) : Number.POSITIVE_INFINITY;
  const needed = projectedProvisionsAtResupply === null
    ? 0 : Math.max(0, Math.ceil(projectedProvisionTarget - projectedProvisionsAtResupply));
  const quantity = canReachResupply
    ? Math.min(
      needed,
      Math.floor(Math.max(0, capacity - projectedProvisionsAtResupply)),
      stockBefore,
      affordable,
    ) : 0;
  const projectedProvisionsAfterResupply = projectedProvisionsAtResupply === null
    ? null : projectedProvisionsAtResupply + Math.max(0, quantity);
  const projectedVillageProvisionGoldCost = Math.max(0, quantity) * Math.max(0, price);
  const projectedVillageStockAfter = Math.max(0, stockBefore - Math.max(0, quantity));
  const postResupplySupportedDistance = projectedProvisionsAfterResupply === null
    ? null
    : maximumCampaignDistanceAfterResupply(
      projectedProvisionsAfterResupply,
      OLD_FOREST_VILLAGE_RESUPPLY_DISTANCE,
      companionIds,
      travelSettings,
      0,
      encounterProvisionReserve,
    );
  const postResupplyPreferredSupportedDistance = projectedProvisionsAfterResupply === null
    ? null
    : maximumCampaignDistanceAfterResupply(
      projectedProvisionsAfterResupply,
      OLD_FOREST_VILLAGE_RESUPPLY_DISTANCE,
      companionIds,
      travelSettings,
      policy?.provisionMargin,
      encounterProvisionReserve,
      strategyName,
    );
  return {
    usesMidRouteResupply: Boolean(
      canReachResupply && quantity > 0 && postResupplySupportedDistance >= target,
    ),
    resupplyLocationId: serviceEnabled ? "hidden_forest_village" : null,
    resupplyDistance: serviceEnabled ? OLD_FOREST_VILLAGE_RESUPPLY_DISTANCE : null,
    provisionsRequiredToReachResupply,
    projectedProvisionsAtResupply,
    projectedVillageProvisionPurchase: Math.max(0, quantity),
    projectedVillageProvisionGoldCost,
    projectedVillageStockAfter: serviceEnabled ? projectedVillageStockAfter : null,
    postResupplySupportedDistance,
    postResupplyPreferredSupportedDistance,
    progressionTargetFullyReachable: Boolean(
      postResupplySupportedDistance !== null && postResupplySupportedDistance >= target,
    ),
    serviceKnown,
    serviceEnabled,
    canReachResupply,
    capacity,
    projectedProvisionTarget,
    projectedProvisionsAfterResupply,
    availableGold,
    stockBefore: serviceEnabled ? stockBefore : null,
    price: serviceEnabled ? price : null,
    travelSettings,
  };
}

function quoteCampaignProvisionAvailability(
  player, shopStocks, policy, targetDistance, strategyName, expeditionId = null, campaignGoal = null,
) {
  const planningStrategy = strategyName ?? defaultStrategyForBetweenPolicy(policy);
  const activeCompanions = selectedCompanionIds(player);
  const capacity = ExpeditionRules.partyProvisionCapacity(activeCompanions, expeditionId);
  const shop = SHOP_DEFINITIONS.village_general_goods;
  const availableShopStock = Math.max(0, Number(shopStocks?.[shop.id]) || 0);
  const affordablePurchaseQuantity = Math.min(
    Math.floor(Math.max(0, Number(player.currentGold) || 0) / shop.provisionsForSale.price),
    availableShopStock,
    Math.floor(Math.max(0, capacity - (Number(player.provisions) || 0))),
  );
  const mainProvisionGoldCost = affordablePurchaseQuantity * shop.provisionsForSale.price;
  const provisionStock = Math.min(
    capacity,
    Math.max(0, Number(player.provisions) || 0)
      + quoteInnCookingProvisionGain(player, strategyName, targetDistance, capacity, campaignGoal)
      + affordablePurchaseQuantity,
  );
  // Quote the departure mode using the stock that preparation can actually
  // reach. This prevents a low-stock Sparse/Normal preflight from claiming a
  // route is viable before cooking or purchasing crosses a policy threshold.
  const travelSettings = campaignDepartureSettings(planningStrategy, {
    provisions: provisionStock,
    capacity,
    injuries: player.injuries,
  }, campaignGoal);
  const encounterProvisionReserve = SimulationProvisionPlanning.encounterReserve(planningStrategy);
  const provisionUncertaintyBuffer = SimulationProvisionPlanning.provisionUncertaintyBuffer(
    planningStrategy, targetDistance,
  );
  const villageResupply = expeditionId === "old_forest_road"
    ? projectOldForestVillageResupply({
      player,
      shopStocks,
      targetDistance,
      policy,
      strategyName: planningStrategy,
      expeditionId,
      provisions: provisionStock,
      currentGold: Math.max(0, (Number(player.currentGold) || 0) - mainProvisionGoldCost),
      campaignGoal,
    }) : null;
  return {
    capacity,
    provisionStock,
    availableShopStock,
    affordablePurchaseQuantity,
    minimumViableProvisionRequirement: estimateCampaignProvisionRequirement(
      targetDistance, activeCompanions, 0, encounterProvisionReserve, travelSettings, 0,
    ),
    preferredProvisionTarget: estimateCampaignProvisionRequirement(
      targetDistance, activeCompanions, policy.provisionMargin,
      encounterProvisionReserve, travelSettings, provisionUncertaintyBuffer,
    ),
    desiredProvisionStock: Math.min(capacity, estimateCampaignProvisionRequirement(
      targetDistance, activeCompanions, policy.provisionMargin,
      encounterProvisionReserve, travelSettings, provisionUncertaintyBuffer,
    )),
    preferredSafeDistance: maximumCampaignDistanceForProvisions(
      provisionStock, activeCompanions, policy.provisionMargin,
      encounterProvisionReserve, travelSettings, planningStrategy,
    ),
    minimumViableSupportedDistance: Math.max(
      maximumCampaignDistanceForProvisions(
      provisionStock, activeCompanions, 0, encounterProvisionReserve, travelSettings,
      ),
      villageResupply?.postResupplySupportedDistance ?? 0,
    ),
    postResupplyPreferredSupportedDistance: villageResupply?.postResupplyPreferredSupportedDistance ?? null,
    progressionUsesMidRouteResupply: Boolean(villageResupply?.usesMidRouteResupply),
    progressionResupplyLocationId: villageResupply?.resupplyLocationId ?? null,
    progressionResupplyDistance: villageResupply?.resupplyDistance ?? null,
    provisionsRequiredToReachResupply: villageResupply?.provisionsRequiredToReachResupply ?? null,
    projectedProvisionsAtResupply: villageResupply?.projectedProvisionsAtResupply ?? null,
    projectedVillageProvisionPurchase: villageResupply?.projectedVillageProvisionPurchase ?? 0,
    projectedVillageProvisionGoldCost: villageResupply?.projectedVillageProvisionGoldCost ?? 0,
    projectedVillageStockAfter: villageResupply?.projectedVillageStockAfter ?? null,
    postResupplySupportedDistance: villageResupply?.postResupplySupportedDistance ?? null,
    progressionTargetFullyReachable: Boolean(villageResupply?.progressionTargetFullyReachable),
    provisionUncertaintyBuffer,
    villageResupply,
  };
}

function progressionReadinessMetric(quote, player) {
  return {
    provisionStock: Number(quote?.provisionStock) || 0,
    capacity: Number(quote?.capacity) || 0,
    minimumViableProvisionRequirement: Number(quote?.minimumViableProvisionRequirement) || 0,
    minimumViableSupportedDistance: Number(quote?.minimumViableSupportedDistance) || 0,
    currentGold: Number(player?.currentGold) || 0,
    provisionShopStock: Number(quote?.availableShopStock) || 0,
    progressionUsesMidRouteResupply: Boolean(quote?.villageResupply?.usesMidRouteResupply),
    progressionResupplyLocationId: quote?.villageResupply?.resupplyLocationId ?? null,
    progressionResupplyDistance: quote?.villageResupply?.resupplyDistance ?? null,
    provisionsRequiredToReachResupply: quote?.villageResupply?.provisionsRequiredToReachResupply ?? null,
    projectedProvisionsAtResupply: quote?.villageResupply?.projectedProvisionsAtResupply ?? null,
    projectedVillageProvisionPurchase: quote?.villageResupply?.projectedVillageProvisionPurchase ?? 0,
    projectedVillageProvisionGoldCost: quote?.villageResupply?.projectedVillageProvisionGoldCost ?? 0,
    projectedVillageStockAfter: quote?.villageResupply?.projectedVillageStockAfter ?? null,
    postResupplySupportedDistance: quote?.villageResupply?.postResupplySupportedDistance ?? null,
    progressionTargetFullyReachable: Boolean(quote?.villageResupply?.progressionTargetFullyReachable),
  };
}

function progressionReadinessMetricsImproved(before, after) {
  if (!before || !after) return false;
  return after.capacity > before.capacity
    || after.provisionStock > before.provisionStock
    || after.currentGold > before.currentGold
    || after.provisionShopStock > before.provisionShopStock
    || after.minimumViableSupportedDistance > before.minimumViableSupportedDistance
    || (after.postResupplySupportedDistance ?? 0) > (before.postResupplySupportedDistance ?? 0);
}

function quoteInnCookingProvisionGain(
  player, strategyName, targetDistance = 0, capacity = Infinity, campaignGoal = null,
) {
  const preview = deepCampaignClone(player);
  const targetProvisions = Math.max(Number(preview.provisions) || 0, Math.min(
    Number.isFinite(Number(capacity)) ? Number(capacity) : Number.POSITIVE_INFINITY,
    estimateCampaignProvisionRequirement(
      targetDistance,
      selectedCompanionIds(preview),
      0,
      SimulationProvisionPlanning.encounterReserve(strategyName),
      SimulationTravelPolicy.departureSettings(strategyName, {
        provisions: preview.provisions,
        capacity,
        injuries: preview.injuries,
      }),
      0,
    ),
  ));
  const result = cookAtInn(preview, strategyName, () => 0.5, [], {
    targetProvisions,
    targetDistance,
    campaignGoal,
  });
  return result.provisionsGained;
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
    const wardenDefeated = endingState.campaignFlags?.verdant_warden_defeated === true;
    if (returnedSafely && wardenDefeated) {
      return { completed: true, status: "completed", reason: "defeated-verdant-warden" };
    }
    return {
      completed: false,
      status: hardFailure ? "hard-failure" : "returned-not-completed",
      reason: !returnedSafely
        ? (run.failureReason ?? "failed-before-return")
        : wardenDefeated ? "warden-flag-awaiting-safe-return" : maximumDistance < Number(desiredTargetDistance)
          ? "returned-before-old-forest-goal"
          : intendedTargetReached ? "old-forest-goal-not-secured" : "returned-without-meaningful-route-progress",
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
  const totalProvisionCost = totals((entry) => (
    (Number(entry.provisionCost) || 0) + (Number(entry.villageProvisionGoldSpent) || 0)
  ));
  const totalVillageProvisionsPurchased = totals((entry) => entry.villageProvisionsPurchased);
  const totalVillageProvisionGoldSpent = totals((entry) => entry.villageProvisionGoldSpent);
  const itemPurchaseGoldSpentById = campaignCombatTotals(expeditions, "itemPurchaseGoldSpentById");
  const itemsPurchasedById = campaignCombatTotals(expeditions, "itemsPurchasedById");
  const itemsPackedById = campaignCombatTotals(expeditions, "itemsPackedById");
  const itemsConsumedById = campaignCombatTotals(expeditions, "itemsConsumedById");
  const itemsReturnedById = campaignCombatTotals(expeditions, "itemsReturnedById");
  const ingredientsConsumedById = campaignCombatTotals(expeditions, "ingredientsConsumedById");
  const recipesUsedById = campaignCombatTotals(expeditions, "recipesUsedById");
  const cookingProvisionsGainedByRecipe = campaignCombatTotals(
    expeditions, "cookingProvisionsGainedByRecipe",
  );
  const cookingIngredientShortagesByRecipe = campaignCombatTotals(
    expeditions, "cookingIngredientShortagesByRecipe",
  );
  const materialsDiscardedDueToPriority = campaignCombatTotals(
    expeditions, "materialsDiscardedDueToPriority",
  );
  expeditions.forEach((entry) => (entry.innCookingActions ?? []).forEach((action) => {
    if (!action.recipeId) return;
    recipesUsedById[action.recipeId] = (recipesUsedById[action.recipeId] ?? 0) + 1;
    cookingProvisionsGainedByRecipe[action.recipeId] = (
      cookingProvisionsGainedByRecipe[action.recipeId] ?? 0
    ) + (Number(action.provisionsGained) || 0);
  }));
  const foodRecipeLearnedById = Object.fromEntries(CAMPAIGN_FOOD_RECIPE_IDS.map((recipeId) => [
    recipeId, Boolean(endingState.learnedRecipes?.includes(recipeId)),
  ]));
  const foodRecipeUsedById = Object.fromEntries(CAMPAIGN_FOOD_RECIPE_IDS.map((recipeId) => [
    recipeId, (recipesUsedById[recipeId] ?? 0) > 0,
  ]));
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
    entry.objectiveDistanceFloorViolated === true
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
  const oldForestEntries = expeditions.filter((entry) => (
    !entry.isSupplyRun && !entry.isPrerequisiteRun
      && (entry.routeId ?? entry.expeditionId) === "old_forest_road"
  ));
  const entryRecoveredItem = (entry, itemId) => Boolean(
    entry.lootRecovered?.some((loot) => loot.itemId === itemId && Number(loot.quantity) > 0)
      || entry.itemsReturnedById?.[itemId] > 0
      || entry.stateAfter?.ownedItems?.[itemId] > 0,
  );
  const firstOldForestWithItem = (itemId) => oldForestEntries.find((entry) => (
    entry.success && entryRecoveredItem(entry, itemId)
  ))?.expeditionNumber ?? null;
  const firstOldForestWithKnowledge = (knowledgeId) => oldForestEntries.find((entry) => (
    entry.stateAfter?.learnedKnowledge?.includes(knowledgeId)
      || entry.expeditionTelemetry?.endingPlayerState?.learnedKnowledge?.includes(knowledgeId)
      || entry.townActions?.some((townAction) => townAction.learnedKnowledgeId === knowledgeId)
  ))?.expeditionNumber ?? null;
  const firstOldForestTownAction = (type) => oldForestEntries.find((entry) => (
    entry.townActions?.some((townAction) => townAction.type === type)
  ))?.expeditionNumber ?? null;
  const wardenCombats = oldForestEntries.flatMap((entry) => (
    entry.expeditionTelemetry?.combats?.filter((combat) => combat.combatId === "verdant_warden") ?? []
  ));
  const oldForestDepthByExpedition = oldForestEntries.map((entry) => ({
    expeditionNumber: entry.expeditionNumber,
    maximumDistance: Number(entry.actualMaximumDistance) || 0,
    returnedSafely: Boolean(entry.success),
  }));
  const oldForestFailureByDepth = oldForestEntries.filter((entry) => !entry.success).reduce((summary, entry) => {
    const depth = Number(entry.actualMaximumDistance) || 0;
    const band = depth < 80 ? "0-79" : depth < 130 ? "80-129" : depth < 160 ? "130-159" : depth < 200 ? "160-199" : "200+";
    summary[band] ??= { failures: 0, deaths: 0, reasons: {} };
    summary[band].failures += 1;
    if (entry.failureReason === "arthur-died" || entry.hardFailureReason === "arthur-died") summary[band].deaths += 1;
    const reason = entry.failureReason ?? "unknown";
    summary[band].reasons[reason] = (summary[band].reasons[reason] ?? 0) + 1;
    return summary;
  }, {});
  const glimmeringSwordAcquired = oldForestEntries.some((entry) => entryRecoveredItem(entry, "glimmering_sword"));
  const firstWardenAttempt = oldForestEntries.find((entry) => (
    entry.expeditionTelemetry?.encounters?.some((encounter) => encounter.encounterId === "verdant_altar")
  ))?.expeditionNumber ?? null;
  const firstOldForestFlaskSecured = oldForestEntries.find((entry) => (
    entry.success
    && campaignCompletionObjectiveAchieved(
      "old_forest_flask", entry.stateAfter ?? entry.expeditionTelemetry?.endingPlayerState ?? {},
    )
  ))?.expeditionNumber ?? null;
  const morganOfferReached = encounterCountFor("val_morgans_offer");
  const guardianReached = encounterCountFor("summoned_guardian");
  const guardianVictories = combatVictoryCountFor("summoned_guardian");
  const merlinFound = endingState.campaignFlags?.merlin_found === true;
  const currentContentCompleted = Boolean(progression?.currentContentCompleted);
  const flaskSecured = campaignCompletionObjectiveAchieved("old_forest_flask", endingState);
  const campaignCompleted = config.completionObjective === "old_forest_flask"
    ? Boolean(progression?.completionObjectiveAchieved)
    : config.campaignMode === "progression" ? currentContentCompleted
      : campaignCompletedPlan(config, expeditions, stopReason);
  const finalProgressionStage = config.campaignMode === "progression"
    ? campaignCompleted
      ? config.completionObjective === "old_forest_flask" ? "completion-objective-achieved" : "current-content-completed"
      : progression?.currentRouteId ?? null
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
      completionObjective: config.completionObjective,
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
    completedPlan: campaignCompleted,
    completed: campaignCompleted,
    campaignProgressionMode: config.campaignMode === "progression",
    completionObjective: config.completionObjective,
    routesCompleted: deepCampaignClone(routesCompleted),
    currentRoute: progression?.currentRouteId ?? null,
    lastRoute: progression?.lastRoute ?? expeditions.at(-1)?.routeId ?? null,
    attemptsByRoute: deepCampaignClone(attemptsByRoute),
    routeCompletionAttempt: deepCampaignClone(progression?.routeCompletionAttempt ?? {}),
    routeCompletionStatus: deepCampaignClone(routeCompletionStatus),
    completionObjectiveAchieved: Boolean(progression?.completionObjectiveAchieved),
    routeSequence,
    routeAttemptSequence,
    supplyRunCount: expeditions.filter((entry) => entry.isSupplyRun).length,
    supplyRunsByRoute: deepCampaignClone(supplyRunsByRoute),
    progressionUsesMidRouteResupply: expeditions.some((entry) => entry.progressionUsesMidRouteResupply),
    progressionResupplyLocationId: expeditions.find((entry) => entry.progressionResupplyLocationId)
      ?.progressionResupplyLocationId ?? null,
    progressionResupplyDistance: expeditions.find((entry) => entry.progressionResupplyDistance !== null
      && entry.progressionResupplyDistance !== undefined)?.progressionResupplyDistance ?? null,
    provisionsRequiredToReachResupply: expeditions.find((entry) => entry.provisionsRequiredToReachResupply !== null
      && entry.provisionsRequiredToReachResupply !== undefined)?.provisionsRequiredToReachResupply ?? null,
    projectedProvisionsAtResupply: expeditions.find((entry) => entry.projectedProvisionsAtResupply !== null
      && entry.projectedProvisionsAtResupply !== undefined)?.projectedProvisionsAtResupply ?? null,
    projectedVillageProvisionPurchase: expeditions.reduce(
      (sum, entry) => sum + (Number(entry.projectedVillageProvisionPurchase) || 0), 0,
    ),
    projectedVillageProvisionGoldCost: expeditions.reduce(
      (sum, entry) => sum + (Number(entry.projectedVillageProvisionGoldCost) || 0), 0,
    ),
    projectedVillageStockAfter: [...expeditions].reverse().find((entry) => (
      entry.projectedVillageStockAfter !== null && entry.projectedVillageStockAfter !== undefined
    ))?.projectedVillageStockAfter ?? null,
    postResupplySupportedDistance: Math.max(0, ...expeditions.map(
      (entry) => Number(entry.postResupplySupportedDistance) || 0,
    )),
    progressionTargetFullyReachable: expeditions.some((entry) => entry.progressionTargetFullyReachable),
    oldForestCurrentGoal: deepCampaignClone(progression?.currentOldForestGoal ?? null),
    oldForestTargetMilestoneDistance: progression?.currentOldForestGoal?.targetDistance ?? null,
    oldForestGoalReason: progression?.currentOldForestGoal?.reason ?? null,
    oldForestSupplyRunReason: progression?.currentOldForestGoal?.supplyRunReason ?? null,
    ...druidTelemetryFromGoal(progression?.currentOldForestGoal),
    oldForestProgressionGoalByExpedition: deepCampaignClone(
      progression?.oldForestProgressionGoalByExpedition ?? [],
    ),
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
    flaskSecured,
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
    oldForestProgression: {
      tripsUntilVillageDiscovery: firstExpeditionWithFlag("forest_village_discovered"),
      tripsUntilWoodcraft: firstOldForestWithKnowledge("woodcraft"),
      tripsUntilFirstVerdantShard: firstOldForestWithItem("verdant_shard_grace"),
      tripsUntilSecondVerdantShard: firstOldForestWithItem("verdant_shard_wrath"),
      tripsUntilVerdantHeart: firstOldForestTownAction("forge-verdant-heart"),
      tripsUntilSong: firstOldForestWithKnowledge("song_of_the_forest"),
      tripsUntilHeartEnchanted: firstOldForestTownAction("druid-favor-complete") ?? firstOldForestTownAction("druid-heart-awakened"),
      tripsUntilFirstWardenAttempt: firstWardenAttempt,
      tripsUntilFlaskSecured: firstOldForestFlaskSecured,
      wardenAttempts: wardenCombats.length,
      wardenVictories: wardenCombats.filter((combat) => combat.result === "victory").length,
      wardenLosses: wardenCombats.filter((combat) => combat.result !== "victory").length,
      deepestDistanceByExpedition: oldForestDepthByExpedition,
      glimmeringSwordAcquired,
      glimmeringSwordAcquisitionRate: oldForestEntries.length ? (glimmeringSwordAcquired ? 1 : 0) : 0,
      returnFailureByDepth: oldForestFailureByDepth,
    },
    currentContentCompleted,
    finalProgressionStage,
    progressionTransitions: deepCampaignClone(progressionTransitions),
    totalGoldEarned,
    totalGoldSpent,
    totalHealingCost,
    totalProvisionCost,
    villageProvisionPurchaseCount: totals((entry) => entry.villageProvisionPurchaseCount),
    villageProvisionsPurchased: totalVillageProvisionsPurchased,
    villageProvisionGoldSpent: totalVillageProvisionGoldSpent,
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
    recipesUsedById,
    cookingProvisionsGainedByRecipe,
    cookingIngredientShortagesByRecipe,
    cookingOpportunityMissedCount: totals((entry) => entry.cookingOpportunityMissedCount),
    foodRecipeLearnedById,
    foodRecipeUsedById,
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
    materialsDiscardedDueToPriority,
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
  const mergeCampaignMaps = (field) => results.reduce((merged, campaign) => {
    Object.entries(campaign[field] ?? {}).forEach(([id, value]) => {
      merged[id] = (merged[id] ?? 0) + (Number(value) || 0);
    });
    return merged;
  }, {});
  const recipeRate = (field) => Object.fromEntries(CAMPAIGN_FOOD_RECIPE_IDS.map((recipeId) => [
    recipeId,
    results.length
      ? results.filter((campaign) => campaign[field]?.[recipeId] === true).length / results.length
      : 0,
  ]));
  const recipesUsedById = mergeCampaignMaps("recipesUsedById");
  const cookingProvisionsGainedByRecipe = mergeCampaignMaps("cookingProvisionsGainedByRecipe");
  const cookingIngredientShortagesByRecipe = mergeCampaignMaps("cookingIngredientShortagesByRecipe");
  const materialsDiscardedDueToPriority = mergeCampaignMaps("materialsDiscardedDueToPriority");
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
  const oldForestFlaskCompletions = results.filter((campaign) => campaign.flaskSecured).length;
  const totalWardenAttempts = results.reduce(
    (sum, campaign) => sum + (campaign.oldForestProgression?.wardenAttempts ?? 0), 0,
  );
  const totalWardenVictories = results.reduce(
    (sum, campaign) => sum + (campaign.oldForestProgression?.wardenVictories ?? 0), 0,
  );
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
    oldForestFlaskCompletionRate: results.length ? oldForestFlaskCompletions / results.length : 0,
    oldForestFlaskSuccessfulCompletionRate: results.length ? oldForestFlaskCompletions / results.length : 0,
    averageTripsUntilFlask: campaignAverage(
      results.map((entry) => entry.oldForestProgression?.tripsUntilFlaskSecured).filter(Number.isFinite),
    ),
    medianTripsUntilFlask: campaignMedian(
      results.map((entry) => entry.oldForestProgression?.tripsUntilFlaskSecured).filter(Number.isFinite),
    ),
    wardenAttemptRate: results.length
      ? results.filter((entry) => (entry.oldForestProgression?.wardenAttempts ?? 0) > 0).length / results.length : 0,
    wardenVictoryRate: totalWardenVictories / Math.max(1, totalWardenAttempts),
    averageWardenAttempts: campaignAverage(
      results.map((entry) => entry.oldForestProgression?.wardenAttempts ?? 0),
    ),
    flaskSecuredRate: results.length ? oldForestFlaskCompletions / results.length : 0,
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
    averageCookingOpportunityMissedCount: averageField("cookingOpportunityMissedCount"),
    recipesUsedById,
    cookingProvisionsGainedByRecipe,
    cookingIngredientShortagesByRecipe,
    materialsDiscardedDueToPriority,
    foodRecipeLearningRateById: recipeRate("foodRecipeLearnedById"),
    foodRecipeUsageRateById: recipeRate("foodRecipeUsedById"),
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
    oldForestProgression: {
      averageTripsUntilVillageDiscovery: campaignAverage(results.map((entry) => entry.oldForestProgression?.tripsUntilVillageDiscovery).filter(Number.isFinite)),
      averageTripsUntilWoodcraft: campaignAverage(results.map((entry) => entry.oldForestProgression?.tripsUntilWoodcraft).filter(Number.isFinite)),
      averageTripsUntilFirstVerdantShard: campaignAverage(results.map((entry) => entry.oldForestProgression?.tripsUntilFirstVerdantShard).filter(Number.isFinite)),
      averageTripsUntilSecondVerdantShard: campaignAverage(results.map((entry) => entry.oldForestProgression?.tripsUntilSecondVerdantShard).filter(Number.isFinite)),
      averageTripsUntilVerdantHeart: campaignAverage(results.map((entry) => entry.oldForestProgression?.tripsUntilVerdantHeart).filter(Number.isFinite)),
      averageTripsUntilSong: campaignAverage(results.map((entry) => entry.oldForestProgression?.tripsUntilSong).filter(Number.isFinite)),
      averageTripsUntilHeartEnchanted: campaignAverage(results.map((entry) => entry.oldForestProgression?.tripsUntilHeartEnchanted).filter(Number.isFinite)),
      averageTripsUntilFirstWardenAttempt: campaignAverage(results.map((entry) => entry.oldForestProgression?.tripsUntilFirstWardenAttempt).filter(Number.isFinite)),
      averageTripsUntilFlaskSecured: campaignAverage(results.map((entry) => entry.oldForestProgression?.tripsUntilFlaskSecured).filter(Number.isFinite)),
      wardenWinRate: results.reduce((wins, entry) => wins + (entry.oldForestProgression?.wardenVictories ?? 0), 0)
        / Math.max(1, results.reduce((attempts, entry) => attempts + (entry.oldForestProgression?.wardenAttempts ?? 0), 0)),
      glimmeringSwordAcquisitionRate: results.length
        ? results.filter((entry) => entry.oldForestProgression?.glimmeringSwordAcquired).length / results.length : 0,
      deepestDistanceByCampaign: results.map((entry) => ({
        campaignId: entry.campaignId,
        depthByExpedition: entry.oldForestProgression?.deepestDistanceByExpedition ?? [],
      })),
      returnFailureByDepth: results.reduce((summary, entry) => {
        Object.entries(entry.oldForestProgression?.returnFailureByDepth ?? {}).forEach(([band, values]) => {
          summary[band] ??= { failures: 0, deaths: 0, reasons: {} };
          summary[band].failures += values.failures;
          summary[band].deaths += values.deaths;
          Object.entries(values.reasons ?? {}).forEach(([reason, count]) => {
            summary[band].reasons[reason] = (summary[band].reasons[reason] ?? 0) + count;
          });
        });
        return summary;
      }, {}),
    },
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

function applyOldForestProgressionServices(player, townActions = [], expeditionNumber = null) {
  const flags = player.campaignFlags ??= {};
  const action = (type, details = {}) => townActions.push({
    type,
    expeditionNumber,
    ...details,
  });
  const learnRecipe = (recipeId) => {
    if (!RECIPE_DEFINITIONS[recipeId] || player.learnedRecipes.includes(recipeId)) return false;
    player.learnedRecipes.push(recipeId);
    action("old-forest-recipe-learned", { recipeId });
    return true;
  };

  if (flags.forest_village_discovered === true && flags.druid_favor_offered !== true) {
    flags.druid_favor_offered = true;
    learnRecipe("forest_communion_draught");
    action("druid-favor-offered", { recipeId: "forest_communion_draught" });
  }

  if (flags.druid_favor_offered === true && flags.druid_favor_complete !== true) {
    const draughtQuote = CraftingRules.quote(player, "forest_communion_draught", "apothecary", { context: "town" });
    if (!player.ownedItems.forest_communion_draught && draughtQuote.available) {
      const crafted = CraftingRules.craft(player, "forest_communion_draught", "apothecary", { context: "town" });
      if (crafted.applied) action("craft-druid-draught", { recipeId: crafted.recipeId, goldCost: crafted.goldCost, result: deepCampaignClone(crafted) });
    }
    if (player.ownedItems.forest_communion_draught) {
      delete player.ownedItems.forest_communion_draught;
      flags.druid_favor_complete = true;
      if (player.ownedItems.verdant_heart) {
        delete player.ownedItems.verdant_heart;
        player.ownedItems.enchanted_verdant_heart = (player.ownedItems.enchanted_verdant_heart ?? 0) + 1;
        action("druid-favor-complete", { consumedItemId: "forest_communion_draught", transformed: "verdant_heart-to-enchanted_verdant_heart", learnedKnowledgeId: "song_of_the_forest" });
      } else {
        action("druid-favor-complete", { consumedItemId: "forest_communion_draught", learnedKnowledgeId: "song_of_the_forest" });
      }
      player.learnedKnowledge ??= [];
      if (!player.learnedKnowledge.includes("song_of_the_forest")) player.learnedKnowledge.push("song_of_the_forest");
    }
  }

  if (flags.druid_favor_complete === true && player.ownedItems.verdant_heart
    && !player.ownedItems.enchanted_verdant_heart) {
    delete player.ownedItems.verdant_heart;
    player.ownedItems.enchanted_verdant_heart = 1;
    action("druid-heart-awakened", { transformed: "verdant_heart-to-enchanted_verdant_heart" });
  }

  if (player.learnedKnowledge?.includes("woodcraft")) {
    learnRecipe("forestwarden_stew");
    learnRecipe("honeyed_forest_preserves");
  }
  if (player.ownedItems.verdant_shard_grace && player.ownedItems.verdant_shard_wrath
    && !player.ownedItems.verdant_heart && !player.ownedItems.enchanted_verdant_heart) {
    const forged = CraftingRules.craft(player, "verdant_heart", "blacksmith", { context: "town" });
    if (forged.applied) action("forge-verdant-heart", { recipeId: forged.recipeId, goldCost: forged.goldCost, result: deepCampaignClone(forged) });
  }
}

function campaignDruidIngredientService(locationId, context, options = {}) {
  if (locationId !== "hidden_forest_village"
    || context?.campaignGoal?.goalId !== "complete-druid-favor"
    || !context?.player) return null;
  const player = context.player;
  const analysis = druidDraughtRequirementAnalysis(player, { shopStocks: options.shopStocks });
  const purchases = [];
  Object.entries(analysis.missingItems).forEach(([itemId, quantity]) => {
    const source = analysis.sourceDetails.find((entry) => entry.ingredientId === itemId);
    if (!source?.shopAvailable) return;
    const purchase = CampaignRules.buyItemsToAtShop(
      player,
      options.shopStocks,
      "forest_village_provisions",
      itemId,
      (Number(player.ownedItems?.[itemId]) || 0) + quantity,
      Number(analysis.quote.recipe?.goldCost) || 0,
    );
    if (purchase.quantity > 0) {
      purchases.push({
        shopId: "forest_village_provisions",
        itemId,
        quantity: purchase.quantity,
        goldCost: purchase.goldCost,
        shortfall: purchase.shortfall,
      });
    }
  });
  return {
    purchases,
    purchasedItemsById: purchases.reduce((items, purchase) => {
      items[purchase.itemId] = (items[purchase.itemId] ?? 0) + purchase.quantity;
      return items;
    }, {}),
    goldSpent: purchases.reduce((sum, purchase) => sum + (Number(purchase.goldCost) || 0), 0),
    reason: purchases.length > 0
      ? "purchased-druid-ingredients-at-hidden-village"
      : analysis.acquisitionPlan === "buy-at-hidden-village"
        ? "hidden-village-ingredient-purchase-unavailable"
        : "no-hidden-village-ingredient-purchase-needed",
  };
}

function campaignLocationProvisionService(locationId, context, options = {}) {
  const expedition = context?.expedition;
  const player = context?.player;
  const shopStocks = options.shopStocks;
  const strategyName = context?.strategy ?? options.strategyName ?? "random";
  const currentDistance = Number(expedition?.distance) || 0;
  const targetDistance = Math.max(
    currentDistance,
    Number(options.targetDistance ?? context?.targetDistance) || currentDistance,
  );
  const serviceShop = CampaignRules.provisionShopForLocation(locationId);
  const stockBefore = serviceShop
    ? Math.max(0, Number(shopStocks?.[serviceShop.id]) || 0) : null;
  const provisionsBefore = Number(expedition?.provisions) || 0;
  const baseAction = {
    locationId,
    shopId: serviceShop?.id ?? null,
    distance: roundCampaignNumber(currentDistance),
    targetDistance: roundCampaignNumber(targetDistance),
    expectedRemainingOutboundDistance: roundCampaignNumber(
      Math.max(0, targetDistance - currentDistance),
    ),
    expectedReturnDistance: roundCampaignNumber(targetDistance),
    provisionsBefore: roundCampaignNumber(provisionsBefore),
    provisionsAfter: roundCampaignNumber(provisionsBefore),
    stockBefore,
    stockAfter: stockBefore,
    quantity: 0,
    goldCost: 0,
    desiredProvisionTarget: null,
    reason: null,
    druidIngredientPurchaseActions: [],
    druidIngredientsPurchasedById: {},
    druidIngredientGoldSpent: 0,
  };
  const ingredientService = campaignDruidIngredientService(locationId, context, options);
  const withIngredientService = (action) => ingredientService
    ? {
      ...action,
      druidIngredientPurchaseActions: deepCampaignClone(ingredientService.purchases),
      druidIngredientsPurchasedById: deepCampaignClone(ingredientService.purchasedItemsById),
      druidIngredientGoldSpent: ingredientService.goldSpent,
      druidIngredientServiceReason: ingredientService.reason,
    }
    : action;
  if (!serviceShop?.provisionsForSale || !expedition || !player) {
    return withIngredientService({ ...baseAction, reason: "service-disabled" });
  }

  const capacity = Math.max(0, Number(expedition.provisionCapacity) || 0);
  const travelSettings = SimulationTravelPolicy.travelSettings(expedition, strategyName);
  const expectedTravelDistance = Math.max(
    0, targetDistance - currentDistance,
  ) + targetDistance;
  const expectedTravelCost = ExpeditionRules.provisionCostForDistance(
    expectedTravelDistance,
    ExpeditionRules.provisionConsumptionMultiplier(expedition),
  );
  const safetyMargin = Math.max(0, Number(options.safetyMargin) || 0);
  const encounterReserve = SimulationProvisionPlanning.encounterReserve(strategyName);
  const desiredProvisionTarget = Math.min(
    capacity,
    Math.ceil(expectedTravelCost + safetyMargin + encounterReserve),
  );
  const action = {
    ...baseAction,
    capacity,
    travelSettings,
    expectedTravelCost: roundCampaignNumber(expectedTravelCost),
    safetyMargin,
    encounterReserve,
    desiredProvisionTarget,
  };
  if (provisionsBefore >= desiredProvisionTarget) {
    return withIngredientService({ ...action, reason: "already-sufficient" });
  }
  if (provisionsBefore >= capacity) return withIngredientService({ ...action, reason: "at-capacity" });
  if (stockBefore <= 0) return withIngredientService({ ...action, reason: "no-stock" });

  const offer = serviceShop.provisionsForSale;
  const price = Number(offer.price);
  if (!Number.isFinite(price) || price < 0) return withIngredientService({ ...action, reason: "service-disabled" });
  const affordable = price > 0
    ? Math.floor(Math.max(0, Number(player.currentGold) || 0) / price)
    : Number.POSITIVE_INFINITY;
  const needed = Math.max(0, Math.ceil(desiredProvisionTarget - provisionsBefore));
  const quantity = Math.min(
    needed,
    Math.floor(Math.max(0, capacity - provisionsBefore)),
    stockBefore,
    affordable,
  );
  if (quantity <= 0) {
    return withIngredientService({
      ...action,
      reason: affordable <= 0 ? "no-gold" : "purchase-not-useful",
    });
  }

  const purchase = EconomyRules.buyProvisions(player, serviceShop, shopStocks, quantity);
  if (!purchase.applied) return withIngredientService({ ...action, reason: "purchase-not-useful" });

  // EconomyRules owns the real purchase mutation. Move that purchased stock
  // from persistent inventory into the active expedition so settlement can
  // return unused purchased provisions using the normal committed-food path.
  player.provisions -= purchase.quantity;
  expedition.committedProvisions += purchase.quantity;
  expedition.committedProvisionsRemaining += purchase.quantity;
  expedition.provisions += purchase.quantity;
  expedition.carriedProvisions = (Number(expedition.carriedProvisions) || 0) + purchase.quantity;
  return withIngredientService({
    ...action,
    provisionsAfter: roundCampaignNumber(expedition.provisions),
    stockAfter: Math.max(0, Number(shopStocks?.[serviceShop.id]) || 0),
    quantity: purchase.quantity,
    goldCost: purchase.goldCost,
    reason: "purchased-for-next-milestone",
  });
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
  if (["progression-attempt-cap", "progression-objective-blocked"].includes(stopReason)) {
    return "incomplete";
  }
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
