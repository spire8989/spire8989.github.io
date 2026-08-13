"use strict";

const BetweenExpeditionPolicies = Object.freeze({
  "conservative-sustainer": createBetweenPolicy("conservative-sustainer", {
    healingThreshold: 0.75,
    provisionMargin: 5,
    stopOnShortfall: true,
    stopOnHealingShortfall: true,
  }),
  "aggressive-reinvestor": createBetweenPolicy("aggressive-reinvestor", {
    healingThreshold: 0.35,
    provisionMargin: 3,
    stopOnShortfall: false,
    stopOnHealingShortfall: false,
  }),
  "minimal-restock": createBetweenPolicy("minimal-restock", {
    healingThreshold: 0.25,
    provisionMargin: 1,
    stopOnShortfall: true,
    stopOnHealingShortfall: true,
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
      const targetDistance = config.expeditionPlan[index % config.expeditionPlan.length];
      const expeditionSeed = `${config.seed}:expedition-${index}`;
      const stateBeforeDecisions = campaignStateSnapshot(player, shopStocks, expeditionNumber);
      const townEntry = CampaignRules.enterLocation(player);

      if (HealingRules.arthurHealth(player) <= 0) {
        stopReason = "arthur-died";
        break;
      }
      if (player.selectedCompanion
        && (player.companionStates?.[player.selectedCompanion]?.health ?? 0) <= 0) {
        stopReason = "required-companion-unavailable";
        break;
      }

      const decision = applyBetweenExpeditionPolicy(
        player, shopStocks, policy, targetDistance, config.healingEnabled,
      );
      decision.expeditionNumber = expeditionNumber;
      decision.townProvisionGrant = townEntry.provisionsGranted;
      betweenExpeditionDecisions.push(decision);

      if (decision.stopReason) {
        stopReason = decision.stopReason;
        break;
      }

      const capacity = ExpeditionRules.partyProvisionCapacity(player.selectedCompanion);
      const provisionsPacked = Math.min(player.provisions, decision.provisionsToPack, capacity);
      if (provisionsPacked < EXPEDITION_TUNING.minimumStartingProvisions) {
        stopReason = "no-viable-expedition";
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
        turnaroundPolicy: { type: "fixedDistance", distance: targetDistance },
        startingState: deepCampaignClone(player),
      });

      replaceCampaignPlayer(player, run.endingPlayerState);
      const sales = run.returnedSafely && config.autoSellRecoveredLoot
        ? CampaignRules.sellMerchantItems(player, run.lootRecovered)
        : { sales: [], goldEarned: 0 };
      const endingState = campaignStateSnapshot(player, shopStocks, expeditionNumber);
      const damageTaken = run.damageTaken;
      expeditions.push({
        expeditionNumber,
        expeditionSeed,
        targetDistance,
        startingHealth: healthAtStart,
        endingHealth: run.finalArthurHealth,
        damageTaken,
        healingBefore: decision.healing,
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
      if (run.failureReason?.includes("Maximum simulation step count")
        || run.failureReason?.includes("exceeded")) {
        stopReason = "simulation-safety-limit";
        break;
      }
    }

    stopReason ??= expeditions.length >= config.maxExpeditions
      ? "max-expeditions-reached"
      : "no-viable-expedition";
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
      "expeditionsReturned", "stopReason", "startingGold", "endingGold", "endingArthurHealth",
      "totalGoldEarned", "totalGoldSpent", "totalHealingCost", "totalProvisionCost", "economicTrend"];
    return campaignCsv(fields, results);
  },

  expeditionsToCsv(batchOrResults) {
    const campaigns = Array.isArray(batchOrResults) ? batchOrResults : batchOrResults.results;
    const rows = campaigns.flatMap((campaign) => campaign.expeditions.map((expedition) => ({
      campaignId: campaign.campaignId,
      seed: campaign.seed,
      strategy: campaign.strategy,
      policy: campaign.betweenExpeditionPolicy,
      ...expedition,
    })));
    const fields = ["campaignId", "seed", "strategy", "policy", "expeditionNumber", "success",
      "targetDistance", "actualMaximumDistance", "startingHealth", "endingHealth", "damageTaken",
      "startingGold", "endingGold", "provisionsPurchased", "provisionsReturned", "lootValueRecovered",
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

function applyBetweenExpeditionPolicy(player, shopStocks, policy, targetDistance, healingEnabled) {
  const healthBefore = HealingRules.arthurHealth(player);
  const maxHealth = HealingRules.arthurMaxHealth(player);
  let healing = {
    attempted: false, intentionallySkipped: true, skippedInsufficientResources: false,
    healthBefore, healthAfter: healthBefore, healingAmount: 0, goldCost: 0, resource: "gold",
  };
  if (healingEnabled && healthBefore / maxHealth < policy.healingThreshold) {
    const result = HealingRules.restAtInn(player);
    healing = {
      attempted: true,
      intentionallySkipped: false,
      skippedInsufficientResources: !result.applied && !result.fullHealth,
      ...result,
    };
  }

  const multiplier = ExpeditionRules.partyProvisionConsumptionMultiplier(player.selectedCompanion);
  const required = Math.ceil(
    targetDistance * 2 * EXPEDITION_TUNING.baseProvisionsPerDistance * multiplier
      + policy.provisionMargin,
  );
  const capacity = ExpeditionRules.partyProvisionCapacity(player.selectedCompanion);
  const desired = Math.min(required, capacity);
  const provisionPurchase = CampaignRules.buyProvisionsTo(player, shopStocks, desired);
  const shortfall = player.provisions < desired;
  const healingShortfall = healing.attempted && healing.skippedInsufficientResources;
  return {
    policy: policy.name,
    targetDistance,
    healing,
    desiredProvisionStock: desired,
    provisionPurchase,
    provisionsToPack: Math.min(player.provisions, capacity),
    stopReason: healingShortfall && policy.stopOnHealingShortfall
      ? "cannot-afford-required-healing"
      : shortfall && policy.stopOnShortfall ? "cannot-afford-minimum-provisions" : null,
  };
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
  const netGold = endingState.gold - startingState.gold;
  const successful = expeditions.filter((entry) => entry.success);
  const failed = expeditions.filter((entry) => !entry.success);
  const startingHealthValues = expeditions.map((entry) => entry.startingHealth);
  const endingHealthValues = expeditions.map((entry) => entry.endingHealth);
  const maxHealth = startingState.arthurMaxHealth;
  const startingWealth = campaignLiquidWealth(startingState);
  const endingWealth = campaignLiquidWealth(endingState);
  const netCampaignWealth = endingWealth - startingWealth;
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
    completedPlan: expeditions.length === config.maxExpeditions,
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
    totalHealingReceived: totals((entry) => entry.healingBefore.healingAmount),
    totalCombats: totals((entry) => entry.combats),
    totalEncounters: totals((entry) => entry.encounters),
    startingLiquidWealth: startingWealth,
    endingLiquidWealth: endingWealth,
    netCampaignWealth,
    averageStartingHealth: campaignAverage(startingHealthValues),
    averageEndingHealth: campaignAverage(endingHealthValues),
    averageHealthLost: campaignAverage(expeditions.map((entry) => entry.damageTaken)),
    averageHealing: campaignAverage(expeditions.map((entry) => entry.healingBefore.healingAmount)),
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
    successfulExpeditionsBeforeInsolvency: stopReason === "cannot-afford-minimum-provisions" ? successful.length : null,
    expeditionsUntilHealthUnsustainable: ["arthur-died", "cannot-afford-required-healing"].includes(stopReason)
      ? expeditions.length : null,
    averageCostPerHealthRestored: totals((entry) => entry.healingBefore.healingAmount) > 0
      ? totalHealingCost / totals((entry) => entry.healingBefore.healingAmount) : 0,
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
  return {
    totalCampaigns: results.length,
    campaignCompletionRate: results.length ? results.filter((entry) => entry.completedPlan).length / results.length : 0,
    averageExpeditionsSurvived: averageField("expeditionsAttempted"),
    medianExpeditionsSurvived: campaignMedian(results.map((entry) => entry.expeditionsAttempted)),
    deathRate: results.length ? results.filter((entry) => entry.stopReason === "arthur-died").length / results.length : 0,
    insolvencyRate: results.length ? results.filter((entry) => entry.stopReason === "cannot-afford-minimum-provisions").length / results.length : 0,
    averageEndingGold: averageField("endingGold"),
    averageEndingHealth: averageField("endingArthurHealth"),
    averageTotalProfit: averageField("netCampaignWealth"),
    averageHealingSpend: averageField("totalHealingCost"),
    averageProvisionSpend: averageField("totalProvisionCost"),
    averageTotalLootRecovered: averageField("totalLootValueRecovered"),
    averageTotalDamage: averageField("totalDamageTaken"),
    averageCombats: averageField("totalCombats"),
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
