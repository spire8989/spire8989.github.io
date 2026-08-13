"use strict";

// Production UI and instant simulations both use these expedition lifecycle rules.
const ExpeditionRules = Object.freeze({
  partyProvisionCapacity(selectedCompanionId) {
    const companion = selectedCompanionId ? COMPANION_DEFINITIONS[selectedCompanionId] : null;
    return PLAYER_CHARACTER_DEFINITION.provisionCapacity
      + (companion?.provisionCapacityBonus ?? 0);
  },

  partyProvisionConsumptionMultiplier(selectedCompanionId) {
    const companion = selectedCompanionId ? COMPANION_DEFINITIONS[selectedCompanionId] : null;
    return PLAYER_CHARACTER_DEFINITION.provisionConsumptionMultiplier
      + (companion?.provisionConsumptionBonus ?? 0);
  },

  provisionConsumptionMultiplier(expedition) {
    const snapshot = Number(expedition?.provisionConsumptionMultiplier);
    return Number.isFinite(snapshot)
      ? Math.max(0, snapshot)
      : this.partyProvisionConsumptionMultiplier(expedition?.selectedCompanion);
  },

  provisionCostForDistance(distance, consumptionMultiplier) {
    return Math.max(0, Number(distance) || 0)
      * EXPEDITION_TUNING.baseProvisionsPerDistance
      * Math.max(0, Number(consumptionMultiplier) || 0);
  },

  estimateReturnProvisionCost(expedition) {
    return this.provisionCostForDistance(
      expedition?.distance,
      this.provisionConsumptionMultiplier(expedition),
    );
  },

  returnProvisionStatus(expedition) {
    const current = Math.max(0, Number(expedition?.provisions) || 0);
    const required = this.estimateReturnProvisionCost(expedition);
    const warningThreshold = required
      * (1 + EXPEDITION_TUNING.returnProvisionWarningMarginRatio);
    const state = required > 0 && current < required
      ? "danger"
      : required > 0 && current <= warningThreshold
        ? "warning"
        : "safe";
    return { current, required, warningThreshold, state };
  },

  createCarriedItems(player, packedItems = player.packedItems) {
    const isList = Array.isArray(packedItems);
    const itemIds = isList ? packedItems : Object.keys(packedItems ?? {});
    return Object.fromEntries(itemIds
      .filter((itemId) => player.ownedItems[itemId] && ITEM_DEFINITIONS[itemId]?.carriable)
      .map((itemId) => {
        const requested = isList ? player.ownedItems[itemId] : Number(packedItems[itemId]);
        const quantity = Math.max(0, Math.floor(Number(requested) || 0));
        return [itemId, Math.min(
          player.ownedItems[itemId], quantity, ITEM_DEFINITIONS[itemId].maxStack ?? 1,
        )];
      })
      .filter(([, quantity]) => quantity > 0));
  },

  createExpedition(player, options = {}) {
    const selectedCompanion = options.companion !== undefined
      ? options.companion
      : player.selectedCompanion;
    const capacity = this.partyProvisionCapacity(selectedCompanion);
    const provisions = Math.max(0, Math.min(Number(options.provisions) || 0, capacity));
    const selectedEquipment = { ...player.equippedItems, ...(options.equipment ?? {}) };
    const expedition = {
      regionId: options.regionId ?? "broceliande",
      originLocationId: player.currentLocationId,
      currentPathId: options.pathId ?? "old_forest_road",
      distance: 0,
      maxDistanceReached: 0,
      direction: "outbound",
      provisions,
      carriedProvisions: provisions,
      provisionCapacity: capacity,
      provisionConsumptionMultiplier: this.partyProvisionConsumptionMultiplier(selectedCompanion),
      committedProvisions: provisions,
      committedProvisionsRemaining: provisions,
      foundProvisions: 0,
      provisionsSettled: false,
      rewardsSettled: false,
      health: Number.isFinite(options.health)
        ? Math.min(Math.max(options.health, 0), HealingRules.arthurMaxHealth(player))
        : HealingRules.arthurHealth(player),
      companionCombatHp: Object.fromEntries(Object.entries(player.companionStates ?? {}).map(
        ([companionId, state]) => [companionId, state.health],
      )),
      combat: null,
      goldCarried: 0,
      selectedEquipment,
      selectedCompanion,
      carriedItems: this.createCarriedItems(player, options.packedItems),
      consumedItems: {},
      consumablesSettled: false,
      unsecuredLoot: [],
      unsecuredMaterials: {},
      unsecuredRecipes: [],
      lootDebugLog: [],
      returnRewardsRolled: false,
      returnRewardContents: createRewardBucket(),
      sceneOffset: 0,
      status: "active",
      random: typeof options.random === "function" ? options.random : GameRandom.random,
    };
    EncounterManager.initializeExpedition(expedition);
    return expedition;
  },

  startExpedition(player, options = {}) {
    const requestedProvisions = Math.min(
      Math.max(0, Number(options.provisions) || 0),
      Math.max(0, Number(player.provisions) || 0),
    );
    const expedition = this.createExpedition(player, {
      ...options,
      provisions: requestedProvisions,
    });
    player.provisions -= expedition.committedProvisions;
    return expedition;
  },

  travel(expedition, player, distanceRequested) {
    if (!expedition || expedition.status !== "active" || expedition.activeEncounter || expedition.combat) {
      return { distanceTraveled: 0, encounter: null, reachedSafety: false, failureReason: null };
    }
    const requested = Math.max(0, Number(distanceRequested) || 0);
    const distanceTraveled = expedition.direction === "returning"
      ? Math.min(requested, expedition.distance)
      : requested;
    if (expedition.direction === "outbound") {
      expedition.distance += distanceTraveled;
      expedition.sceneOffset -= distanceTraveled * 9;
      expedition.maxDistanceReached = Math.max(expedition.maxDistanceReached, expedition.distance);
    } else {
      expedition.distance = Math.max(0, expedition.distance - distanceTraveled);
      expedition.sceneOffset += distanceTraveled * 9;
    }
    adjustExpeditionProvisions(
      expedition,
      -this.provisionCostForDistance(
        distanceTraveled,
        this.provisionConsumptionMultiplier(expedition),
      ),
    );
    if (expedition.provisions <= 0) {
      expedition.provisions = 0;
      return {
        distanceTraveled,
        encounter: null,
        reachedSafety: false,
        failureReason: "The company exhausted its provisions before reaching safety.",
      };
    }
    const reachedSafety = expedition.direction === "returning" && expedition.distance <= 0;
    const encounter = reachedSafety ? null : EncounterManager.advance(expedition, player, distanceTraveled);
    return { distanceTraveled, encounter, reachedSafety, failureReason: null };
  },

  beginReturn(expedition) {
    if (!expedition || expedition.status !== "active" || expedition.direction === "returning"
      || expedition.activeEncounter || expedition.combat) {
      return false;
    }
    expedition.direction = "returning";
    return true;
  },

  settleConsumedItems(player, expedition) {
    if (expedition.consumablesSettled) return;
    Object.entries(expedition.consumedItems).forEach(([itemId, quantity]) => {
      player.ownedItems[itemId] = Math.max(0, (player.ownedItems[itemId] ?? 0) - quantity);
      if (player.ownedItems[itemId] <= 0) delete player.ownedItems[itemId];
    });
    expedition.consumablesSettled = true;
  },

  consumeCarriedItem(expedition, itemId, quantity = 1) {
    const amount = Math.max(0, Math.floor(Number(quantity) || 0));
    if (!expedition || amount <= 0 || (expedition.carriedItems?.[itemId] ?? 0) < amount) {
      return false;
    }
    expedition.carriedItems[itemId] -= amount;
    if (expedition.carriedItems[itemId] <= 0) delete expedition.carriedItems[itemId];
    expedition.consumedItems[itemId] = (expedition.consumedItems[itemId] ?? 0) + amount;
    return true;
  },

  settleProvisions(player, expedition, returnedSafely) {
    if (expedition.provisionsSettled) return;
    const purchased = Math.max(0, Math.floor(expedition.committedProvisionsRemaining));
    const found = returnedSafely ? Math.max(0, Math.floor(expedition.foundProvisions)) : 0;
    expedition.provisionsReturned = purchased + found;
    player.provisions += expedition.provisionsReturned;
    expedition.provisionsSettled = true;
  },

  settle(player, expedition, returnedSafely) {
    this.settleConsumedItems(player, expedition);
    this.settleProvisions(player, expedition, returnedSafely);
    if (returnedSafely && !expedition.rewardsSettled) {
      LootRules.awardExpeditionReturn(player, expedition);
      expedition.unsecuredLoot.forEach(({ itemId, quantity }) => {
        player.ownedItems[itemId] = (player.ownedItems[itemId] ?? 0) + quantity;
      });
      Object.entries(expedition.unsecuredMaterials).forEach(([materialId, quantity]) => {
        player.materials[materialId] = (player.materials[materialId] ?? 0) + quantity;
      });
      expedition.unsecuredRecipes.forEach((recipeId) => {
        if (!player.learnedRecipes.includes(recipeId)) player.learnedRecipes.push(recipeId);
      });
      player.currentGold += expedition.goldCarried;
      const returnRewards = expedition.returnRewardContents ?? createRewardBucket();
      returnRewards.items.forEach(({ itemId, quantity }) => {
        player.ownedItems[itemId] = (player.ownedItems[itemId] ?? 0) + quantity;
      });
      Object.entries(returnRewards.materials).forEach(([materialId, quantity]) => {
        player.materials[materialId] = (player.materials[materialId] ?? 0) + quantity;
      });
      returnRewards.recipes.forEach((recipeId) => {
        if (!player.learnedRecipes.includes(recipeId)) player.learnedRecipes.push(recipeId);
      });
      player.currentGold += returnRewards.gold;
    }
    expedition.rewardsSettled = true;
    player.arthurHealth = Math.min(
      Math.max(expedition.health, 0),
      HealingRules.arthurMaxHealth(player),
    );
    player.companionStates ??= {};
    Object.entries(expedition.companionCombatHp ?? {}).forEach(([companionId, health]) => {
      const maximum = COMPANION_DEFINITIONS[companionId]?.combat?.maxHp ?? 0;
      player.companionStates[companionId] = {
        health: Math.min(Math.max(Number(health) || 0, 0), maximum),
      };
    });
    player.bestExpeditionDistance = Math.max(player.bestExpeditionDistance, expedition.maxDistanceReached);
  },
});
