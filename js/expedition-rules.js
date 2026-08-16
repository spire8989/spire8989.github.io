"use strict";

const JourneyLog = Object.freeze({
  add(expedition, message, options = {}) {
    const normalized = String(message ?? "").replace(/\s+/g, " ").trim();
    if (!expedition || !normalized) return null;
    expedition.journeyLog ??= [];
    const numericDistance = Number(expedition.distance);
    const entry = {
      message: normalized,
      distance: Number.isFinite(numericDistance) ? numericDistance : 0,
      category: options.category ?? "event",
    };
    expedition.journeyLog.push(entry);
    if (expedition.journeyLog.length > 50) {
      expedition.journeyLog.splice(0, expedition.journeyLog.length - 50);
    }
    return entry;
  },
});

// Production UI and instant simulations both use these expedition lifecycle rules.
const ExpeditionRules = Object.freeze({
  partyProvisionCapacity(selectedCompanions) {
    return PLAYER_CHARACTER_DEFINITION.provisionCapacity
      + companionIdsFromSelection(selectedCompanions)
        .reduce((total, companionId) => total + (COMPANION_DEFINITIONS[companionId]?.provisionCapacityBonus ?? 0), 0);
  },

  partyProvisionConsumptionMultiplier(selectedCompanions) {
    return PLAYER_CHARACTER_DEFINITION.provisionConsumptionMultiplier
      + companionIdsFromSelection(selectedCompanions)
        .reduce((total, companionId) => total + (COMPANION_DEFINITIONS[companionId]?.provisionConsumptionBonus ?? 0), 0);
  },

  partyTravelSpeedMultiplier(selectedCompanions) {
    const companionIds = companionIdsFromSelection(selectedCompanions);
    if (!companionIds.includes("llamrei")) return 1;
    const otherCompanionCount = companionIds.filter((companionId) => companionId !== "llamrei").length;
    return 1 + (otherCompanionCount > 0
      ? EXPEDITION_TUNING.companionBonuses.llamreiPartyTravelSpeed
      : EXPEDITION_TUNING.companionBonuses.llamreiSoloTravelSpeed);
  },

  travelSpeedMultiplier(expedition) {
    return (Number(expedition?.travelSpeedMultiplier) || 1)
      * InjuryRules.partyTravelSpeedMultiplier(expedition);
  },

  discoveryWeightMultiplier(expedition, encounter) {
    const discoveryTags = ["discovery", "secret", "exploration", "mystery"];
    if (!encounter?.tags?.some((tag) => discoveryTags.includes(tag))) return 1;
    return this.paceDefinition(expedition?.paceId).discoveryWeightMultiplier ?? 1;
  },

  provisionConsumptionMultiplier(expedition) {
    const snapshot = Number(expedition?.provisionConsumptionMultiplier);
    const base = Number.isFinite(snapshot)
      ? Math.max(0, snapshot)
      : this.partyProvisionConsumptionMultiplier(expedition?.selectedCompanions ?? expedition?.selectedCompanion);
    const pace = EXPEDITION_TUNING.travelPaces[expedition?.paceId ?? "normal"]
      ?? EXPEDITION_TUNING.travelPaces.normal;
    const ration = EXPEDITION_TUNING.rationLevels[expedition?.rationId ?? "normal"]
      ?? EXPEDITION_TUNING.rationLevels.normal;
    return base * pace.provisionMultiplier * ration.provisionMultiplier;
  },

  paceDefinition(paceId = "normal") {
    return EXPEDITION_TUNING.travelPaces[paceId] ?? EXPEDITION_TUNING.travelPaces.normal;
  },

  rationDefinition(rationId = "normal") {
    return EXPEDITION_TUNING.rationLevels[rationId] ?? EXPEDITION_TUNING.rationLevels.normal;
  },

  setPace(expedition, paceId) {
    if (!expedition || !EXPEDITION_TUNING.travelPaces[paceId]) return false;
    if (expedition.paceId === paceId) return true;
    const previous = expedition.paceId;
    expedition.paceId = paceId;
    expedition.paceChanges ??= [];
    expedition.paceChanges.push({ from: previous, to: paceId, distance: Number(expedition.distance) || 0, direction: expedition.direction });
    return true;
  },

  setRation(expedition, rationId) {
    if (!expedition || !EXPEDITION_TUNING.rationLevels[rationId]) return false;
    if (expedition.rationId === rationId) return true;
    const previous = expedition.rationId;
    expedition.rationId = rationId;
    expedition.rationChanges ??= [];
    expedition.rationChanges.push({ from: previous, to: rationId, distance: Number(expedition.distance) || 0, direction: expedition.direction });
    return true;
  },

  pause(expedition) {
    if (!expedition || expedition.status !== "active" || expedition.activeEncounter || expedition.combat
      || expedition.travelState === "camped") return false;
    expedition.travelState = "paused";
    return true;
  },

  resume(expedition) {
    if (!expedition || expedition.status !== "active" || expedition.activeEncounter || expedition.combat
      || expedition.travelState !== "paused") return false;
    expedition.travelState = "traveling";
    return true;
  },

  enterCamp(expedition) {
    if (!expedition || expedition.status !== "active" || expedition.activeEncounter || expedition.combat
      || expedition.travelState !== "paused") return false;
    expedition.travelState = "camped";
    const siteKey = `${expedition.direction}:${expedition.currentPathId}:${Math.round(expedition.distance * 100) / 100}`;
    const newCampSite = expedition.campSiteKey !== siteKey;
    if (newCampSite) {
      expedition.campSiteKey = siteKey;
      expedition.campCycle += 1;
      expedition.campEventRolled = false;
      expedition.campEventId = null;
      expedition.lastCampEventId = null;
      expedition.lastCampEventResult = "";
    }
    if (newCampSite) {
      JourneyLog.add(expedition, "The company made camp.", { category: "camp" });
    }
    return true;
  },

  leaveCamp(expedition) {
    if (!expedition || expedition.status !== "active" || expedition.activeEncounter || expedition.combat
      || expedition.travelState !== "camped") return false;
    expedition.travelState = "paused";
    JourneyLog.add(expedition, "The company left camp and returned to the road.", { category: "camp" });
    return true;
  },

  adjustProvisions(expedition, amount) {
    if (!expedition) return 0;
    const previous = expedition.provisions;
    adjustExpeditionProvisions(expedition, Number(amount) || 0);
    return expedition.provisions - previous;
  },

  setDistance(expedition, distance) {
    if (!expedition || expedition.status !== "active") return false;
    const value = Number(distance);
    if (!Number.isFinite(value) || value < 0) return false;
    expedition.distance = value;
    if (expedition.direction === "outbound") {
      expedition.maxDistanceReached = Math.max(Number(expedition.maxDistanceReached) || 0, value);
    }
    return true;
  },

  briefRest(expedition) {
    if (!expedition || expedition.status !== "active" || expedition.travelState !== "paused"
      || expedition.activeEncounter || expedition.combat) {
      return { applied: false, reason: "not-paused" };
    }
    const cost = EXPEDITION_TUNING.briefRest.provisionCost;
    if (expedition.provisions < cost) return { applied: false, reason: "insufficient-provisions", cost };
    const benefit = this.briefRestBenefit(expedition);
    if (!benefit.meaningful) return { applied: false, reason: "no-benefit", cost, ...benefit };
    this.adjustProvisions(expedition, -cost);
    const healing = HealingRules.restExpeditionParty(
      expedition,
      Math.round(EXPEDITION_TUNING.briefRest.healing * InjuryRules.restHealingMultiplier(expedition)),
    );
    const injuriesTreated = expedition.rationId === "generous"
      ? selectedPartyIds(expedition).map((id) => InjuryRules.recoverExhaustion(expedition, id, "brief-rest"))
        .filter((result) => result.applied)
      : [];
    const recoveryAccelerated = selectedPartyIds(expedition).flatMap((id) => (
      InjuryRules.accelerateRecovery(
        expedition, id, EXPEDITION_TUNING.briefRest.recoveryDistanceReduction, "brief-rest",
      )
    ));
    JourneyLog.add(expedition, "The company took a brief roadside rest.", { category: "rest" });
    return { applied: true, cost, ...healing, injuriesTreated, recoveryAccelerated };
  },

  briefRestBenefit(expedition) {
    const requested = Math.round(EXPEDITION_TUNING.briefRest.healing * InjuryRules.restHealingMultiplier(expedition));
    const healingByPartyMember = {};
    const recoverableConditions = [];
    selectedPartyIds(expedition).forEach((characterId) => {
      const maximum = InjuryRules.effectiveMaxHealth(expedition, characterId);
      const health = characterId === "arthur"
        ? Number(expedition.health) || 0
        : Number(expedition.companionCombatHp?.[characterId]) || 0;
      healingByPartyMember[characterId] = Math.min(requested, Math.max(0, maximum - health));
      InjuryRules.forCharacter(expedition, characterId).forEach((instance) => {
        const injuryId = InjuryRules.idOf(instance);
        if (injuryId === "exhaustion" && expedition.rationId === "generous") {
          recoverableConditions.push({ characterId, injuryId, reason: "generous-ration" });
        } else if (this.definitionCanAdvance(instance)) {
          recoverableConditions.push({ characterId, injuryId, reason: "recovery-distance" });
        }
      });
    });
    return {
      meaningful: Object.values(healingByPartyMember).some((amount) => amount > 0)
        || recoverableConditions.length > 0,
      healingByPartyMember,
      recoverableConditions,
    };
  },

  definitionCanAdvance(instance) {
    return Boolean(this.recoveryDistanceReductionForBriefRest() > 0
      && Number(instance?.remainingRecoveryDistance) > 0
      && INJURY_DEFINITIONS[InjuryRules.idOf(instance)]?.recoveryDistanceRange);
  },

  recoveryDistanceReductionForBriefRest() {
    return EXPEDITION_TUNING.briefRest.recoveryDistanceReduction;
  },

  restAtCamp(expedition, player) {
    if (!expedition || expedition.status !== "active" || expedition.travelState !== "camped"
      || expedition.activeEncounter || expedition.combat) {
      return { applied: false, reason: "not-at-camp" };
    }
    const cost = EXPEDITION_TUNING.campRest.provisionCost;
    if (expedition.provisions < cost) return { applied: false, reason: "insufficient-provisions", cost };
    this.adjustProvisions(expedition, -cost);
    const healing = HealingRules.restExpeditionParty(
      expedition,
      Math.round(EXPEDITION_TUNING.campRest.healing * InjuryRules.restHealingMultiplier(expedition)),
    );
    const event = !expedition.campEventRolled ? CampRules.rollForCampEvent(expedition, player) : null;
    const injuriesTreated = expedition.rationId !== "sparse"
      ? selectedPartyIds(expedition).map((id) => InjuryRules.recoverExhaustion(expedition, id, "camp-rest"))
        .filter((result) => result.applied)
      : [];
    const recoveryAccelerated = selectedPartyIds(expedition).flatMap((id) => (
      InjuryRules.accelerateRecovery(
        expedition, id, EXPEDITION_TUNING.campRest.recoveryDistanceReduction, "camp-rest",
      )
    ));
    JourneyLog.add(expedition, "The company rested at camp.", { category: "rest" });
    return { applied: true, cost, ...healing, injuriesTreated, recoveryAccelerated, eventId: event?.id ?? null };
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
      .filter((itemId) => player.ownedItems[itemId]
        && ITEM_DEFINITIONS[itemId]?.carriable
        && !MaterialRules.isMaterialId(itemId))
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
    MaterialRules.migratePlayerMaterials(player);
    const selectedCompanions = options.companions !== undefined
      ? companionIdsFromSelection(options.companions)
      : options.companion !== undefined
        ? companionIdsFromSelection(options.companion)
        : selectedCompanionIds(player);
    const selectedCompanion = selectedCompanions[0] ?? null;
    const expeditionDefinition = ExpeditionCatalog.get(
      options.expeditionId ?? player.selectedExpeditionId ?? "old_forest_road",
    );
    const capacity = this.partyProvisionCapacity(selectedCompanions);
    const provisions = Math.max(0, Math.min(Number(options.provisions) || 0, capacity));
    const selectedEquipment = { ...player.equippedItems, ...(options.equipment ?? {}) };
    const materialBagRequest = options.materialBagContents
      ?? options.packedMaterials
      ?? (Array.isArray(options.packedItems)
        ? options.packedItems.filter((itemId) => MaterialRules.isMaterialId(itemId))
        : undefined);
    const materialBag = MaterialRules.createExpeditionBag(player, materialBagRequest);
    const expedition = {
      expeditionId: expeditionDefinition.id,
      regionId: options.regionId ?? expeditionDefinition.regionId,
      originLocationId: player.currentLocationId,
      currentPathId: options.pathId ?? expeditionDefinition.pathId,
      distance: 0,
      maxDistanceReached: 0,
      direction: "outbound",
      provisions,
      carriedProvisions: provisions,
      provisionCapacity: capacity,
      provisionConsumptionMultiplier: this.partyProvisionConsumptionMultiplier(selectedCompanions),
      travelSpeedMultiplier: this.partyTravelSpeedMultiplier(selectedCompanions),
      paceId: EXPEDITION_TUNING.travelPaces[options.paceId] ? options.paceId : "normal",
      rationId: EXPEDITION_TUNING.rationLevels[options.rationId] ? options.rationId : "normal",
      injuries: InjuryRules.snapshot(player),
      injuryEvents: [],
      paceChanges: [],
      rationChanges: [],
      travelRiskDistance: 0,
      exhaustionCheckDistance: 0,
      travelState: "traveling",
      campCycle: 0,
      campSiteKey: null,
      campEventRolled: false,
      campEventId: null,
      committedProvisions: provisions,
      committedProvisionsRemaining: provisions,
      foundProvisions: 0,
      provisionsSettled: false,
      rewardsSettled: false,
      health: Number.isFinite(options.health)
        ? Math.min(Math.max(options.health, 0), InjuryRules.effectiveMaxHealth({ injuries: InjuryRules.snapshot(player) }, "arthur"))
        : Math.min(HealingRules.arthurHealth(player), InjuryRules.effectiveMaxHealth({ injuries: InjuryRules.snapshot(player) }, "arthur")),
      companionCombatHp: Object.fromEntries(selectedCompanions.map((companionId) => [
        companionId,
        player.companionStates?.[companionId]?.health
          ?? InjuryRules.effectiveMaxHealth({ injuries: InjuryRules.snapshot(player) }, companionId)
          ?? 0,
      ])),
      combat: null,
      goldCarried: 0,
      selectedEquipment,
      selectedCompanions,
      selectedCompanion,
      journeyLog: [],
      carriedItems: this.createCarriedItems(player, options.packedItems),
      materialBag,
      consumedItems: {},
      consumablesSettled: false,
      unsecuredLoot: [],
      unsecuredMaterials: materialBag.unsecured,
      materialBagRejected: { ...materialBag.rejected },
      materialsFound: {},
      materialsReturned: {},
      materialsLost: {},
      materialsSettled: false,
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
    if (!expedition || expedition.status !== "active" || expedition.activeEncounter || expedition.combat
      || expedition.travelState !== "traveling") {
      return { distanceTraveled: 0, encounter: null, reachedSafety: false, failureReason: null };
    }
    const requested = Math.max(0, Number(distanceRequested) || 0);
    const distanceTraveled = expedition.direction === "returning"
      ? Math.min(requested, expedition.distance)
      : requested;
    expedition.distanceByPace ??= {};
    expedition.distanceByRation ??= {};
    expedition.distanceByPace[expedition.paceId] = (expedition.distanceByPace[expedition.paceId] ?? 0) + distanceTraveled;
    expedition.distanceByRation[expedition.rationId] = (expedition.distanceByRation[expedition.rationId] ?? 0) + distanceTraveled;
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
    InjuryRules.advanceNaturalRecovery(expedition, distanceTraveled);
    InjuryRules.checkTravelRisk(expedition, player, distanceTraveled);
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
    JourneyLog.add(expedition, "The company turned back toward safety.", { category: "return" });
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
    MaterialRules.settle(player, expedition, returnedSafely);
    player.injuries = InjuryRules.snapshot(expedition);
    if (returnedSafely && !expedition.rewardsSettled) {
      LootRules.awardExpeditionReturn(player, expedition);
      expedition.unsecuredLoot.forEach(({ itemId, quantity }) => {
        player.ownedItems[itemId] = (player.ownedItems[itemId] ?? 0) + quantity;
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
      InjuryRules.effectiveMaxHealth(player, "arthur"),
    );
    player.companionStates ??= {};
    Object.entries(expedition.companionCombatHp ?? {}).forEach(([companionId, health]) => {
      const maximum = InjuryRules.effectiveMaxHealth(player, companionId);
      const safeHealth = Math.min(Math.max(Number(health) || 0, 0), maximum);
      player.companionStates[companionId] = {
        health: COMPANION_DEFINITIONS[companionId]?.noPermanentDeath && safeHealth <= 0
          ? maximum : safeHealth,
      };
    });
    player.bestExpeditionDistance = Math.max(player.bestExpeditionDistance, expedition.maxDistanceReached);
    this.normalizePackedState(player);
  },

  normalizePackedState(player) {
    player.ownedItems ??= {};
    player.equippedItems ??= {};
    player.packedItems = [...new Set(player.packedItems ?? [])]
      .filter((itemId) => ITEM_DEFINITIONS[itemId]?.carriable
        && !MaterialRules.isMaterialId(itemId)
        && (player.ownedItems[itemId] ?? 0) > 0
        && !Object.values(player.equippedItems).includes(itemId))
      .slice(0, EXPEDITION_TUNING.packSlots);

    let remainingCapacity = Math.max(0, Math.floor(Number(EXPEDITION_TUNING.materialBagCapacity) || 0));
    const packedMaterials = {};
    Object.entries(MaterialRules.normalizeCollection(player.packedMaterials ?? {})).forEach(([materialId, quantity]) => {
      if (remainingCapacity <= 0) return;
      const available = Math.max(0, Math.floor(Number(player.materials?.[materialId]) || 0));
      const accepted = Math.min(quantity, available, remainingCapacity);
      if (accepted > 0) {
        packedMaterials[materialId] = accepted;
        remainingCapacity -= accepted;
      }
    });
    player.packedMaterials = packedMaterials;
    return player;
  },
});

function selectedPartyIds(expedition) {
  return ["arthur", ...selectedCompanionIds(expedition)];
}

function companionIdsFromSelection(selection) {
  if (Array.isArray(selection)) return [...new Set(selection.filter(Boolean))].slice(0, 2);
  return selection ? [selection] : [];
}
