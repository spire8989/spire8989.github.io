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

const CampaignSimulationRunner = Object.freeze({
  run(configuration = {}) {
    const config = normalizeCampaignConfiguration(configuration);
    const player = createCampaignPlayer(config.startingState);
    const shopStocks = { ...CampaignRules.createShopStocks(), ...(config.startingState.shopStocks ?? {}) };
    const policy = resolveBetweenPolicy(config.betweenExpeditionPolicy);
    const startingState = campaignStateSnapshot(player, shopStocks, 0);
    const expeditions = [];
    const betweenExpeditionDecisions = [];
    let stopReason = null;

    for (let index = 0; index < config.maxExpeditions; index += 1) {
      const expeditionNumber = index + 1;
      const desiredTargetDistance = config.expeditionPlan[index % config.expeditionPlan.length];
      const expeditionSeed = `${config.seed}:expedition-${index}`;
      const stateBeforeDecisions = campaignStateSnapshot(player, shopStocks, expeditionNumber);
      const townEntry = CampaignRules.enterLocation(player);

      if (HealingRules.arthurHealth(player) <= 0) {
        stopReason = "arthur-died";
        break;
      }
      const decision = applyBetweenExpeditionPolicy(
        player, shopStocks, policy, desiredTargetDistance, config.healingEnabled, config.strategy,
      );
      decision.expeditionNumber = expeditionNumber;
      decision.townProvisionGrant = townEntry.provisionsGranted;
      betweenExpeditionDecisions.push(decision);

      if (decision.stopReason) {
        stopReason = decision.stopReason;
        break;
      }

      const actualTargetDistance = decision.actualTargetDistance;
      const capacity = ExpeditionRules.partyProvisionCapacity(player.selectedCompanion);
      const provisionsPacked = Math.min(player.provisions, decision.provisionsToPack, capacity);
      if (provisionsPacked < EXPEDITION_TUNING.minimumStartingProvisions) {
        stopReason = "cannot-support-any-expedition";
        break;
      }

      const healthAtStart = HealingRules.arthurHealth(player);
      const goldAtStart = stateBeforeDecisions.gold;
      const provisionStockAtStart = stateBeforeDecisions.provisionStock;
      const run = SimulationRunner.run({
        id: `${config.id}:expedition-${expeditionNumber}`,
        seed: expeditionSeed,
        companion: player.selectedCompanion,
        provisions: provisionsPacked,
        loadout: { ...player.equippedItems },
        packContents: [...player.packedItems],
        strategy: config.strategy,
        turnaroundPolicy: { type: "fixedDistance", distance: actualTargetDistance },
        startingState: deepCampaignClone(player),
      });

      replaceCampaignPlayer(player, run.endingPlayerState);
      const sales = run.returnedSafely && config.autoSellRecoveredLoot
        ? CampaignRules.sellMerchantItems(player, run.lootRecovered)
        : { sales: [], goldEarned: 0 };
      const endingState = campaignStateSnapshot(player, shopStocks, expeditionNumber);
      const damageTaken = run.damageTaken;
      const expeditionHardFailureReason = !run.returnedSafely && run.finalArthurHealth <= 0
        ? "arthur-died"
        : !run.returnedSafely && isCampaignResourceExhaustion(run.failureReason)
          ? "expedition-resource-exhaustion" : null;
      expeditions.push({
        expeditionNumber,
        expeditionSeed,
        targetDistance: actualTargetDistance,
        desiredTargetDistance,
        actualTargetDistance,
        targetDistanceReduced: decision.targetDistanceReduced,
        targetDistanceReduction: decision.targetDistanceReduction,
        targetDistanceReductionReason: decision.targetDistanceReductionReason,
        departurePassiveFoodEstimate: decision.departurePassiveFoodEstimate,
        encounterProvisionReserve: decision.encounterProvisionReserve,
        totalEstimatedProvisionRequirement: decision.totalEstimatedProvisionRequirement,
        emergencyProvisionTurnaround: run.emergencyProvisionTurnaround,
        emergencyProvisionTurnaroundDistance: run.emergencyProvisionTurnaroundDistance,
        originalTargetDistance: desiredTargetDistance,
        departureTargetDistance: actualTargetDistance,
        actualTurnaroundDistance: run.turnaroundDistance,
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
        success: run.returnedSafely,
        outcome: run.outcome,
        failureReason: run.failureReason,
        actualMaximumDistance: run.maximumDistance,
        lootRecovered: run.lootRecovered,
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
        totalHealingPerformed: run.totalHealingPerformed,
        totalGaugeControl: run.totalGaugeControl,
        encounters: run.encounterCount,
        provisionsConsumed: run.provisionsConsumed,
        provisionsFound: run.provisionsGained,
        replay: run.replay,
        expeditionTelemetry: run,
        stateBefore: stateBeforeDecisions,
        stateAfter: endingState,
      });

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

    stopReason ??= expeditions.length >= config.maxExpeditions
      ? "max-expeditions-reached"
      : "cannot-support-any-expedition";
    return finalizeCampaignTelemetry(
      config, policy, startingState, player, shopStocks, expeditions,
      betweenExpeditionDecisions, stopReason,
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

  campaignsToCsv(batchOrResults) {
    const results = Array.isArray(batchOrResults) ? batchOrResults : batchOrResults.results;
    const fields = ["campaignId", "seed", "strategy", "betweenExpeditionPolicy", "expeditionsAttempted",
      "expeditionsReturned", "stopReason", "stopCategory", "hardFailure", "hardFailureReason",
      "strategyConstraintCount", "strategyConstraintTypes", "startingGold", "endingGold", "endingArthurHealth",
      "averageDesiredExpeditionDistance", "averageActualExpeditionDistance", "targetDistanceReductionFrequency",
      "totalEmergencyProvisionTurnarounds", "emergencyProvisionTurnaroundRate",
      "totalLowHpHealingTriggers", "totalCriticalArthurHealingTriggers",
      "totalAggressiveEmergencyActions", "totalCombatsStartedBelow50Percent", "totalCombatsStartedBelow25Percent",
      "totalArthurCombatDamageReceived", "totalCompanionCombatDamageReceived",
      "totalGoldEarned", "totalGoldSpent", "totalHealingCost", "totalProvisionCost", "netCampaignWealth", "economicTrend"];
    return campaignCsv(fields, results.map((campaign) => ({
      ...campaign,
      strategyConstraintTypes: campaign.strategyConstraints.map((constraint) => constraint.type).join("|"),
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
    const fields = ["campaignId", "seed", "strategy", "policy", "expeditionNumber", "success",
      "desiredTargetDistance", "actualTargetDistance", "targetDistanceReduced", "targetDistanceReduction",
      "targetDistanceReductionReason", "strategyConstraintTypes", "hardFailure", "hardFailureReason",
      "departurePassiveFoodEstimate", "encounterProvisionReserve", "totalEstimatedProvisionRequirement",
      "emergencyProvisionTurnaround", "emergencyProvisionTurnaroundDistance",
      "originalTargetDistance", "departureTargetDistance", "actualTurnaroundDistance",
      "provisionExhaustionFailure",
      "actualMaximumDistance", "startingHealth", "endingHealth", "damageTaken",
      "arthurHealing", "companionId", "companionHealing", "healingCost",
      "healingTriggeredByLowHp", "healingTriggerReason",
      "aggressiveEmergencyActions", "combatsStartedBelow50Percent", "combatsStartedBelow25Percent",
      "arthurCombatAttacksReceived", "companionCombatAttacksReceived",
      "arthurCombatDamageReceived", "companionCombatDamageReceived",
      "totalHealingPerformed", "totalGaugeControl", "abilityUsesById", "itemUsesById",
      "startingGold", "endingGold", "provisionsPurchased", "provisionsReturned", "provisionsPacked", "lootValueRecovered",
      "netGold", "failureReason"];
    return campaignCsv(fields, rows);
  },
});

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
) {
  const planningStrategy = strategyName ?? defaultStrategyForBetweenPolicy(policy);
  const goldBeforePreparation = player.currentGold;
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

  const unavailableCompanionId = player.selectedCompanion
    && (player.companionStates?.[player.selectedCompanion]?.health ?? 0) <= 0
    ? player.selectedCompanion : null;
  if (unavailableCompanionId) {
    player.selectedCompanion = null;
  }

  const goldAfterHealing = player.currentGold;
  const capacity = ExpeditionRules.partyProvisionCapacity(player.selectedCompanion);
  const encounterProvisionReserve = SimulationProvisionPlanning.encounterReserve(planningStrategy);
  const desiredProvisionStockForNominalDistance = estimateCampaignProvisionRequirement(
    targetDistance, player.selectedCompanion, policy.provisionMargin, encounterProvisionReserve,
  );
  const desiredProvisionStock = Math.min(desiredProvisionStockForNominalDistance, capacity);
  const provisionStockBeforePurchase = player.provisions;
  const shop = SHOP_DEFINITIONS.village_general_goods;
  const shopStockBeforePurchase = shopStocks[shop.id] ?? 0;
  const affordablePurchaseQuantity = Math.min(
    Math.floor(player.currentGold / shop.provisionsForSale.price),
    shopStockBeforePurchase,
    Math.max(0, capacity - provisionStockBeforePurchase),
  );
  const affordableProvisionStock = Math.min(
    capacity, provisionStockBeforePurchase + affordablePurchaseQuantity,
  );
  const provisionPurchase = CampaignRules.buyProvisionsTo(player, shopStocks, desiredProvisionStock);
  const actualProvisionStockAfterPurchase = player.provisions;
  const provisionStockAvailableToPack = Math.min(actualProvisionStockAfterPurchase, capacity);
  const preferredSafeDistance = maximumCampaignDistanceForProvisions(
    provisionStockAvailableToPack, player.selectedCompanion,
    policy.provisionMargin, encounterProvisionReserve,
  );
  const encounterReserveSupportedDistance = maximumCampaignDistanceForProvisions(
    provisionStockAvailableToPack, player.selectedCompanion, 0, encounterProvisionReserve,
  );
  const minimumSupportedDistance = maximumCampaignDistanceForProvisions(
    provisionStockAvailableToPack, player.selectedCompanion, 0, 0,
  );
  const safeAffordableDistance = preferredSafeDistance >= 1
    ? preferredSafeDistance
    : encounterReserveSupportedDistance >= 1
      ? encounterReserveSupportedDistance : minimumSupportedDistance;
  const safetyMarginUsed = preferredSafeDistance >= 1 ? policy.provisionMargin : 0;
  const encounterProvisionReserveUsed = preferredSafeDistance >= 1
    || encounterReserveSupportedDistance >= 1 ? encounterProvisionReserve : 0;
  const actualTargetDistance = Math.min(targetDistance, safeAffordableDistance);
  const targetDistanceReduced = actualTargetDistance < targetDistance;
  const targetDistanceReduction = targetDistance - actualTargetDistance;
  const estimatedProvisionRequirementForChosenDistance = actualTargetDistance >= 1
    ? estimateCampaignProvisionRequirement(
      actualTargetDistance, player.selectedCompanion,
      safetyMarginUsed, encounterProvisionReserveUsed,
    ) : 0;
  const departurePassiveFoodEstimate = roundCampaignNumber(
    estimateCampaignPassiveProvisionCost(actualTargetDistance, player.selectedCompanion),
  );
  const desiredTargetPassiveFoodEstimate = roundCampaignNumber(
    estimateCampaignPassiveProvisionCost(targetDistance, player.selectedCompanion),
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
  if (actualProvisionStockAfterPurchase < desiredProvisionStock) {
    strategyConstraints.push({
      type: "preferred-provision-buffer-unavailable",
      desiredProvisionStock,
      actualProvisionStock: actualProvisionStockAfterPurchase,
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
    preferredProvisionTargetMet: actualProvisionStockAfterPurchase >= desiredProvisionStockForNominalDistance,
    provisionPurchase,
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

function estimateCampaignPassiveProvisionCost(distance, companionId) {
  const multiplier = ExpeditionRules.partyProvisionConsumptionMultiplier(companionId);
  return SimulationProvisionPlanning.passiveRoundTripCost(distance, multiplier);
}

function estimateCampaignProvisionRequirement(
  distance, companionId, safetyMargin, encounterProvisionReserve = 0,
) {
  return Math.ceil(
    estimateCampaignPassiveProvisionCost(distance, companionId)
      + safetyMargin + encounterProvisionReserve,
  );
}

function maximumCampaignDistanceForProvisions(
  provisions, companionId, safetyMargin, encounterProvisionReserve = 0,
) {
  const multiplier = ExpeditionRules.partyProvisionConsumptionMultiplier(companionId);
  const roundTripRate = 2 * EXPEDITION_TUNING.baseProvisionsPerDistance * multiplier;
  let distance = Math.max(0, Math.floor(
    (provisions - safetyMargin - encounterProvisionReserve) / roundTripRate + 1e-9,
  ));
  while (distance > 0
    && estimateCampaignProvisionRequirement(
      distance, companionId, safetyMargin, encounterProvisionReserve,
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
    startingState: configuration.startingState ?? {},
    healingEnabled: configuration.healingEnabled !== false,
    autoSellRecoveredLoot: configuration.autoSellRecoveredLoot !== false,
  };
}

function createCampaignPlayer(overrides) {
  const defaults = SaveSystem.createDefaultPlayerState();
  const merged = { ...defaults, ...deepCampaignClone(overrides) };
  merged.ownedItems = { ...defaults.ownedItems, ...(overrides.ownedItems ?? {}) };
  merged.equippedItems = { ...defaults.equippedItems, ...(overrides.equippedItems ?? {}) };
  merged.packedItems = [...(overrides.packedItems ?? defaults.packedItems)];
  merged.learnedKnowledge = [...(overrides.learnedKnowledge ?? defaults.learnedKnowledge)];
  merged.unlockedCompanions = [...(overrides.unlockedCompanions ?? defaults.unlockedCompanions)];
  merged.companionStates = deepCampaignClone(overrides.companionStates ?? defaults.companionStates);
  return merged;
}

function replaceCampaignPlayer(target, source) {
  Object.keys(target).forEach((key) => delete target[key]);
  Object.assign(target, deepCampaignClone(source));
}

function campaignStateSnapshot(player, shopStocks, expeditionNumber) {
  return deepCampaignClone({
    expeditionNumber,
    gold: player.currentGold,
    provisionStock: player.provisions,
    ownedItems: player.ownedItems,
    equippedItems: player.equippedItems,
    packedItems: player.packedItems,
    learnedKnowledge: player.learnedKnowledge,
    campaignFlags: player.campaignFlags ?? {},
    arthurHealth: HealingRules.arthurHealth(player),
    arthurMaxHealth: HealingRules.arthurMaxHealth(player),
    companionStates: player.companionStates,
    unlockedCompanions: player.unlockedCompanions,
    selectedCompanion: player.selectedCompanion,
    currentLocation: player.currentLocationId,
    shopStocks,
  });
}

function finalizeCampaignTelemetry(config, policy, startingState, player, shopStocks, expeditions, decisions, stopReason) {
  const endingState = campaignStateSnapshot(player, shopStocks, expeditions.length);
  const totals = (selector) => expeditions.reduce((sum, entry) => sum + (Number(selector(entry)) || 0), 0);
  const totalHealingCost = totals((entry) => entry.healingBefore.goldCost);
  const totalProvisionCost = totals((entry) => entry.provisionCost);
  const totalGoldEarned = totals((entry) => entry.goldEarnedFromSales + entry.goldEarnedDirect);
  const totalGoldSpent = totalHealingCost + totalProvisionCost;
  const abilityUsesById = campaignCombatTotals(expeditions, "abilityUsesById");
  const itemUsesById = campaignCombatTotals(expeditions, "itemUsesById");
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
  return {
    campaignId: `${config.id}:${config.seed}`,
    seed: config.seed,
    strategy: config.strategy,
    betweenExpeditionPolicy: policy.name,
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
    completedPlan: campaignCompletedPlan(config, expeditions, stopReason),
    totalGoldEarned,
    totalGoldSpent,
    totalHealingCost,
    totalProvisionCost,
    totalGearSpending: 0,
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
      version: 1,
      campaignSeed: config.seed,
      startingState,
      expeditionSeeds: expeditions.map((entry) => entry.expeditionSeed),
      betweenExpeditionDecisions: decisions,
      expeditionReplays: expeditions.map((entry) => entry.replay),
      endingState,
    },
  };
}

function summarizeCampaigns(results) {
  const averageField = (field) => campaignAverage(results.map((entry) => entry[field]));
  const expeditions = results.flatMap((entry) => entry.expeditions);
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

function campaignCompletedPlan(config, expeditions, stopReason) {
  return stopReason === "max-expeditions-reached" && expeditions.length === config.maxExpeditions;
}

function campaignStopCategory(stopReason) {
  if (["arthur-died", "expedition-resource-exhaustion", "cannot-support-any-expedition"]
    .includes(stopReason)) {
    return "hard-failure";
  }
  if (stopReason === "max-expeditions-reached") return "completed";
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
