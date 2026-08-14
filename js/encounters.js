"use strict";

const EncounterRequirements = Object.freeze({
  meetsAll(requirements = [], context) {
    return requirements.every((requirement) => this.meets(requirement, context));
  },

  meets(requirement, context) {
    const { expedition, player } = context;

    switch (requirement.type) {
      case "availableExpeditionItem":
        return expeditionItemQuantity(expedition, requirement.itemId) >= (requirement.quantity ?? 1);
      case "carriedItem":
        return (expedition.carriedItems?.[requirement.itemId] ?? 0) >= (requirement.quantity ?? 1);
      case "equippedItem":
        return Object.values(expedition.selectedEquipment).includes(requirement.itemId);
      case "ownsItem":
        return Boolean(player.ownedItems[requirement.itemId]);
      case "notOwnsItem":
        return !player.ownedItems[requirement.itemId];
      case "companion":
        return (expedition.selectedCompanions ?? [expedition.selectedCompanion]).includes(requirement.companionId);
      case "unlockedCompanion":
        return player.unlockedCompanions?.includes(requirement.companionId) === true;
      case "notUnlockedCompanion":
        return player.unlockedCompanions?.includes(requirement.companionId) !== true;
      case "knowledge":
        return player.learnedKnowledge.includes(requirement.knowledgeId);
      case "minimumResource":
        return Number(expedition[requirement.resource]) >= requirement.amount;
      case "minimumHealth":
        return expedition.health >= requirement.amount;
      case "maximumHealth":
        return expedition.health <= requirement.amount;
      case "minimumDistance":
        return expedition.distance >= requirement.amount;
      case "currentPath":
        return expedition.currentPathId === requirement.pathId;
      case "runFlag":
        return expedition.runFlags[requirement.flag] === (requirement.value ?? true);
      case "campaignFlag":
        return player.campaignFlags?.[requirement.flag] === (requirement.value ?? true);
      default:
        console.warn(`Unknown encounter requirement type: ${requirement.type}`);
        return false;
    }
  },

  choiceAvailability(choice, context) {
    const failedRequirement = (choice.requirements ?? []).find(
      (requirement) => !this.meets(requirement, context),
    );

    if (failedRequirement) {
      return {
        available: false,
        presentation: failedRequirement.unavailable ?? "locked",
        reason: failedRequirement.lockedLabel ?? "Requirements not met",
      };
    }

    const unaffordableCost = (choice.costs ?? []).find((cost) => {
      if (cost.type !== "modifyResource" || cost.amount >= 0) {
        return false;
      }
      return Number(context.expedition[cost.resource]) < Math.abs(cost.amount);
    });

    if (unaffordableCost) {
      return {
        available: false,
        presentation: "locked",
        reason: `Requires ${Math.abs(unaffordableCost.amount)} ${resourceLabel(unaffordableCost.resource)}`,
      };
    }

    return { available: true, presentation: "available", reason: "" };
  },
});

const EncounterOutcomes = Object.freeze({
  resolveAll(effects = [], context) {
    return effects.reduce((combined, effect) => {
      const resolved = this.resolve(effect, context);
      combined.messages.push(...resolved.messages);
      if (resolved.resultText) {
        combined.resultText = resolved.resultText;
      }
      if (resolved.combat) {
        combined.combat = resolved.combat;
      }
      combined.rewards.push(...(resolved.rewards ?? []));
      return combined;
    }, { messages: [], rewards: [], resultText: "", combat: null });
  },

  applyAll(effects = [], context) {
    return this.resolveAll(effects, context).messages;
  },

  apply(effect, context) {
    return this.resolve(effect, context).messages;
  },

  resolve(effect, context) {
    const { expedition, player } = context;
    let messages = [];
    let rewards = [];
    let resultText = effect.resultText ?? "";
    let combat = null;

    switch (effect.type) {
      case "modifyResource": {
        const amount = Number.isFinite(effect.amount)
          ? effect.amount
          : randomInteger(effect.randomMinimum, effect.randomMaximum, expedition.random);
        if (effect.resource === "provisions" && Number.isFinite(expedition.committedProvisionsRemaining)) {
          adjustExpeditionProvisions(expedition, amount);
        } else {
          const previousValue = Number(expedition[effect.resource]) || 0;
          expedition[effect.resource] = previousValue + amount;
        }

        if (effect.resource === "health") {
          expedition.health = clampNumber(
            expedition.health,
            0,
            PLAYER_CHARACTER_DEFINITION.combat.maxHp,
          );
        } else {
          expedition[effect.resource] = Math.max(0, expedition[effect.resource]);
        }

        messages = amount === 0
          ? []
          : [`${amount > 0 ? "+" : ""}${amount} ${resourceLabel(effect.resource)}`];
        break;
      }
      case "gainRandomUnsecuredItem": {
        const validItemIds = effect.itemIds.filter((itemId) => ITEM_DEFINITIONS[itemId]);
        if (validItemIds.length === 0) {
          break;
        }
        const itemId = validItemIds[randomInteger(0, validItemIds.length - 1, expedition.random)];
        const quantity = effect.quantity ?? 1;
        const staged = addUnsecuredItem(expedition, itemId, quantity);
        rewards = [{ ...staged.reward, unsecured: true }];
        messages = [staged.message];
        break;
      }
      case "gainWeightedRandomUnsecuredItem": {
        const validItems = (effect.items ?? []).filter((entry) => (
          ITEM_DEFINITIONS[entry.itemId] && Number(entry.weight) > 0
        ));
        const selected = weightedChoice(validItems, expedition.random);
        if (!selected) {
          break;
        }
        const item = ITEM_DEFINITIONS[selected.itemId];
        const quantity = effect.quantity ?? 1;
        const staged = addUnsecuredItem(expedition, selected.itemId, quantity);
        rewards = [{ ...staged.reward, unsecured: true }];
        messages = [staged.message];
        resultText = effect.resultText?.replaceAll("{itemName}", item.name) ?? resultText;
        break;
      }
      case "gainUnsecuredItem":
        if (!ITEM_DEFINITIONS[effect.itemId]) {
          break;
        }
        const quantity = effect.quantity ?? 1;
        const staged = addUnsecuredItem(expedition, effect.itemId, quantity);
        rewards = [{ ...staged.reward, unsecured: true }];
        messages = [staged.message];
        break;
      case "rollLootTable": {
        const lootRewards = LootRules.resolveSources([{
          tableId: effect.tableId,
          rolls: effect.rolls ?? 1,
          chance: effect.chance ?? 1,
        }], {
          player,
          expedition,
          random: expedition.random,
          debugLog: expedition.lootDebugLog,
        });
        messages = lootRewards.map(lootRewardMessage);
        rewards = lootRewards.map((reward) => ({ ...reward, unsecured: true }));
        break;
      }
      case "consumeExpeditionItem": {
        const quantity = effect.quantity ?? 1;
        if (expeditionItemQuantity(expedition, effect.itemId) < quantity) {
          break;
        }
        consumeExpeditionItem(expedition, effect.itemId, quantity, player);
        messages = [`Used ${quantity} ${ITEM_DEFINITIONS[effect.itemId]?.name ?? effect.itemId}`];
        break;
      }
      case "changePath":
        expedition.currentPathId = effect.pathId;
        messages = [`Path changed to ${pathLabel(effect.pathId)}`];
        break;
      case "setRunFlag":
        expedition.runFlags[effect.flag] = effect.value ?? true;
        messages = effect.message ? [effect.message] : [];
        break;
      case "setCampaignFlag":
        player.campaignFlags ??= {};
        player.campaignFlags[effect.flag] = effect.value ?? true;
        messages = effect.message ? [effect.message] : [];
        break;
      case "unlockCompanion":
        if (COMPANION_DEFINITIONS[effect.companionId]
          && !player.unlockedCompanions.includes(effect.companionId)) {
          player.unlockedCompanions.push(effect.companionId);
          messages = [
            `${COMPANION_DEFINITIONS[effect.companionId].name} is now available as a companion.`,
          ];
        }
        break;
      case "gainUniqueUnsecuredItem": {
        const item = ITEM_DEFINITIONS[effect.itemId];
        const alreadyOwned = Boolean(player.ownedItems[effect.itemId])
          || expedition.unsecuredLoot.some((entry) => entry.itemId === effect.itemId);
        if (!item || alreadyOwned || (item.unique !== true && item.campaignItem !== true)) break;
        const uniqueQuantity = effect.quantity ?? 1;
        addUnsecuredItem(expedition, effect.itemId, uniqueQuantity);
        rewards = [{ type: "item", itemId: effect.itemId, quantity: uniqueQuantity, unsecured: true }];
        messages = [unsecuredLootMessage(effect.itemId)];
        resultText = effect.resultText ?? resultText;
        break;
      }
      case "learnKnowledge":
        if (!player.learnedKnowledge.includes(effect.knowledgeId)) {
          player.learnedKnowledge.push(effect.knowledgeId);
        }
        messages = KNOWLEDGE_DEFINITIONS[effect.knowledgeId]
          ? [`Knowledge learned: ${KNOWLEDGE_DEFINITIONS[effect.knowledgeId].name}`]
          : [];
        break;
      case "conditional": {
        const branch = EncounterRequirements.meetsAll(effect.requirements, context);
        const resolved = this.resolveAll(branch ? effect.effects : effect.elseEffects, context);
        messages = resolved.messages;
        rewards = resolved.rewards;
        combat = resolved.combat;
        resultText = resolved.resultText || (branch ? effect.resultText : effect.elseResultText) || "";
        break;
      }
      case "randomChance": {
        const succeeded = gameplayRandom(expedition.random) < effect.chance;
        const resolved = this.resolveAll(succeeded ? effect.effects : effect.elseEffects, context);
        messages = resolved.messages;
        rewards = resolved.rewards;
        combat = resolved.combat;
        resultText = resolved.resultText
          || (succeeded ? effect.resultText : effect.elseResultText)
          || "";
        break;
      }
      case "randomOne": {
        if (!Array.isArray(effect.options) || effect.options.length === 0) {
          break;
        }
        const weightedOptions = effect.options.every((option) => (
          !Array.isArray(option) && Number(option.weight) > 0
        ));
        const selected = weightedOptions
          ? weightedChoice(effect.options, expedition.random)
          : effect.options[randomInteger(0, effect.options.length - 1, expedition.random)];
        const selectedEffects = Array.isArray(selected) ? selected : selected.effects;
        const resolved = this.resolveAll(selectedEffects, context);
        messages = resolved.messages;
        rewards = resolved.rewards;
        combat = resolved.combat;
        resultText = resolved.resultText || selected.resultText || "";
        break;
      }
      case "failExpedition":
        context.failExpedition?.(effect.reason ?? "The expedition could not continue.");
        break;
      case "startCombat":
        combat = effect;
        break;
      default:
        console.warn(`Unknown encounter outcome type: ${effect.type}`);
        break;
    }

    return { messages, rewards, resultText, combat };
  },
});

const EncounterManager = Object.freeze({
  definitionFor(expedition, active = expedition?.activeEncounter) {
    return active?.eventKind === "camp"
      ? CAMP_EVENT_DEFINITIONS[active.encounterId]
      : ENCOUNTER_DEFINITIONS[active?.encounterId];
  },

  initializeExpedition(expedition) {
    expedition.encounterTravelDistance = 0;
    expedition.nextEncounterAt = randomEncounterSpacing(expedition.random);
    expedition.seenEncounterIds = [];
    expedition.encounterOccurrences = {};
    expedition.runFlags = {};
    expedition.activeEncounter = null;
    expedition.lastEncounterId = null;
    expedition.lastEncounterResult = "";
  },

  advance(expedition, player, distanceTraveled) {
    if (expedition.activeEncounter || expedition.status !== "active") {
      return null;
    }

    expedition.encounterTravelDistance += Math.abs(distanceTraveled);
    if (expedition.encounterTravelDistance < expedition.nextEncounterAt) {
      return null;
    }

    const encounter = this.selectEligible(expedition, player);
    if (!encounter) {
      // An exhausted pool produces uninterrupted travel instead of recycling content.
      expedition.nextEncounterAt = expedition.encounterTravelDistance
        + EXPEDITION_TUNING.encounterMaximumDistance;
      return null;
    }

    this.begin(expedition, encounter.id);
    return encounter;
  },

  selectEligible(expedition, player) {
    return weightedChoice(this.eligibleDefinitions(expedition, player), expedition.random);
  },

  eligibleDefinitions(expedition, player) {
    const context = { expedition, player };
    return Object.values(ENCOUNTER_DEFINITIONS).filter((encounter) => {
      const withinDistance = expedition.distance >= encounter.minimumDistance
        && (!Number.isFinite(encounter.maximumDistance)
          || expedition.distance <= encounter.maximumDistance);
      const correctLocation = encounter.regionId === expedition.regionId
        && encounter.pathIds.includes(expedition.currentPathId);
      const correctExpedition = !encounter.expeditionIds
        || encounter.expeditionIds.includes(expedition.expeditionId);
      const correctDirection = encounter.directions.includes(expedition.direction);
      const occurrences = Math.max(
        expedition.encounterOccurrences?.[encounter.id] ?? 0,
        expedition.seenEncounterIds.includes(encounter.id) ? 1 : 0,
      );
      const occurrenceLimit = encounter.repeatable
        ? encounter.maxOccurrencesPerRun ?? Number.POSITIVE_INFINITY
        : 1;
      const canRepeat = occurrences < occurrenceLimit;
      const avoidsImmediateRepeat = encounter.id !== expedition.lastEncounterId
        || Object.values(ENCOUNTER_DEFINITIONS).filter((candidate) => (
          candidate.regionId === expedition.regionId
          && candidate.pathIds.includes(expedition.currentPathId)
        )).length === 1;

      return withinDistance
        && correctLocation
        && correctExpedition
        && correctDirection
        && canRepeat
        && avoidsImmediateRepeat
        && EncounterRequirements.meetsAll(encounter.requirements, context);
    });
  },

  begin(expedition, encounterId) {
    const encounter = ENCOUNTER_DEFINITIONS[encounterId];
    if (!encounter || expedition.activeEncounter) {
      return false;
    }

    expedition.activeEncounter = {
      encounterId,
      stageId: "start",
      phase: "choice",
      resultText: "",
      outcomeMessages: [],
      rewards: [],
      pendingToken: 0,
    };
    if (!expedition.seenEncounterIds.includes(encounterId)) {
      expedition.seenEncounterIds.push(encounterId);
    }
    expedition.encounterOccurrences ??= {};
    expedition.encounterOccurrences[encounterId] = (expedition.encounterOccurrences[encounterId] ?? 0) + 1;
    return true;
  },

  beginCamp(expedition, eventId) {
    const event = CAMP_EVENT_DEFINITIONS[eventId];
    if (!event || expedition.activeEncounter || expedition.travelState !== "camped") {
      return false;
    }
    expedition.activeEncounter = {
      encounterId: eventId,
      eventKind: "camp",
      stageId: "start",
      phase: "choice",
      resultText: "",
      outcomeMessages: [],
      rewards: [],
      pendingToken: 0,
    };
    return true;
  },

  force(expedition, encounterId) {
    if (expedition.activeEncounter) {
      return false;
    }
    return this.begin(expedition, encounterId);
  },

  resolveChoice(expedition, player, choiceId, callbacks = {}) {
    const active = expedition.activeEncounter;
    if (active?.phase !== "choice") {
      return { resolved: false, ended: false, message: "" };
    }
    const encounter = this.definitionFor(expedition, active);
    const stage = encounter?.stages[active.stageId];
    const choice = stage?.choices.find((candidate) => candidate.id === choiceId);
    if (!choice) {
      return { resolved: false, ended: false, message: "" };
    }

    const context = { expedition, player, ...callbacks };
    const availability = EncounterRequirements.choiceAvailability(choice, context);
    if (!availability.available) {
      return { resolved: false, ended: false, message: "" };
    }

    if (choice.pendingAction) {
      active.phase = "pending";
      active.actionText = choice.pendingAction.text;
      active.pendingChoiceId = choice.id;
      active.pendingToken += 1;
      return {
        resolved: true,
        ended: false,
        pending: true,
        pendingToken: active.pendingToken,
        // Presentation timing is deliberately outside the seeded gameplay stream.
        delayMs: callbacks.skipPresentationDelay
          ? 0
          : pendingActionDelay(choice.pendingAction, callbacks.presentationRandom),
        message: active.actionText,
      };
    }

    return this.applyChoice(expedition, player, choice, callbacks);
  },

  completePendingAction(expedition, player, pendingToken, callbacks = {}) {
    const active = expedition.activeEncounter;
    if (!active
      || active.phase !== "pending"
      || active.pendingToken !== pendingToken) {
      return { resolved: false, ended: false, message: "" };
    }

    const encounter = this.definitionFor(expedition, active);
    const stage = encounter?.stages[active.stageId];
    const choice = stage?.choices.find((candidate) => candidate.id === active.pendingChoiceId);
    if (!choice) {
      return { resolved: false, ended: false, message: "" };
    }

    delete active.actionText;
    delete active.pendingChoiceId;
    return this.applyChoice(expedition, player, choice, callbacks);
  },

  applyChoice(expedition, player, choice, callbacks = {}) {
    const active = expedition.activeEncounter;
    const encounter = this.definitionFor(expedition, active);
    const stage = encounter?.stages[active.stageId];
    if (!active || !encounter || !stage) {
      return { resolved: false, ended: false, message: "" };
    }

    const context = { expedition, player, ...callbacks };
    const branch = Array.isArray(choice.branches) && choice.branches.length > 0
      ? weightedChoice(choice.branches, expedition.random)
      : null;
    const choiceOutcomes = [
      ...(choice.outcomes ?? []),
      ...(branch?.outcomes ?? []),
    ];
    const outcomeMessages = [
      ...EncounterOutcomes.applyAll(choice.costs, context),
    ];
    const resolvedOutcomes = EncounterOutcomes.resolveAll(choiceOutcomes, context);
    outcomeMessages.push(...resolvedOutcomes.messages);
    active.outcomeMessages.push(...outcomeMessages);
    active.rewards.push(...resolvedOutcomes.rewards);
    if (resolvedOutcomes.combat) {
      active.phase = "combat";
      active.combatResolution = resolvedOutcomes.combat;
      const started = callbacks.startCombat?.(resolvedOutcomes.combat.combatId) === true;
      if (!started) {
        active.phase = "choice";
        delete active.combatResolution;
        return { resolved: false, ended: false, message: "" };
      }
      return { resolved: true, ended: false, combatStarted: true, message: "" };
    }
    const nextStageId = branch?.nextStage ?? choice.nextStage;
    const endEncounter = branch ? branch.endEncounter === true : choice.endEncounter;
    const authoredResultText = branch?.resultText || choice.resultText;

    if (nextStageId) {
      const nextStage = encounter.stages[nextStageId];
      if (!nextStage) {
        console.warn(`Encounter ${encounter.id} is missing stage ${nextStageId}.`);
        return { resolved: false, ended: false, message: "" };
      }

      active.stageId = nextStageId;
      if (nextStage.resultStage) {
        const resolvedStage = EncounterOutcomes.resolveAll(nextStage.outcomes, context);
        active.outcomeMessages.push(...resolvedStage.messages);
        active.rewards.push(...resolvedStage.rewards);
        active.phase = "result";
        active.resultText = resolvedStage.resultText || nextStage.text;
        return { resolved: true, ended: false, awaitingContinue: true, message: active.resultText };
      }

      active.phase = "choice";
      active.stageText = authoredResultText || nextStage.text;
      return { resolved: true, ended: false, message: active.stageText };
    }

    if (endEncounter) {
      const message = resolvedOutcomes.resultText
        || authoredResultText
        || stage.text
        || `${encounter.title} resolved.`;
      active.phase = "result";
      active.resultText = message;
      return { resolved: true, ended: false, awaitingContinue: true, message };
    }

    return { resolved: true, ended: false, message: "" };
  },

  continueJourney(expedition) {
    const active = expedition.activeEncounter;
    if (!active || active.phase !== "result") {
      return false;
    }

    const message = active.resultText;
    if (active.eventKind === "camp") {
      expedition.lastCampEventId = active.encounterId;
      expedition.lastCampEventResult = message;
      expedition.activeEncounter = null;
      return true;
    }
    expedition.lastEncounterId = expedition.activeEncounter?.encounterId ?? null;
    expedition.lastEncounterResult = message;
    expedition.activeEncounter = null;
    expedition.nextEncounterAt = expedition.encounterTravelDistance
      + Math.max(randomEncounterSpacing(expedition.random), EXPEDITION_TUNING.postEncounterSafeDistance);
    return true;
  },

  completeCombat(expedition, player, result, callbacks = {}) {
    const active = expedition.activeEncounter;
    if (!active || active.phase !== "combat" || !active.combatResolution) {
      return { resolved: false, ended: false, message: "" };
    }
    if (result === "defeat") {
      callbacks.failExpedition?.("Arthur was too badly injured to continue the expedition.");
      return { resolved: true, ended: true, message: "" };
    }

    const resolution = active.combatResolution[result];
    if (!resolution) {
      return { resolved: false, ended: false, message: "" };
    }
    const context = { expedition, player, ...callbacks };
    const resolved = EncounterOutcomes.resolveAll(resolution.outcomes, context);
    active.outcomeMessages.push(...resolved.messages);
    active.rewards ??= [];
    active.rewards.push(...resolved.rewards);
    active.phase = "result";
    active.resultText = resolved.resultText
      || resolution.resultText
      || (result === "victory" ? "The enemy is defeated." : "The company escapes.");
    delete active.combatResolution;
    return { resolved: true, ended: false, awaitingContinue: true, message: active.resultText };
  },

  forceNextSoon(expedition) {
    expedition.nextEncounterAt = expedition.encounterTravelDistance + 0.2;
  },
});

function randomEncounterSpacing(random) {
  return randomBetween(
    EXPEDITION_TUNING.encounterMinimumDistance,
    EXPEDITION_TUNING.encounterMaximumDistance,
    random,
  );
}

function pendingActionDelay(pendingAction, random) {
  const profile = EXPEDITION_TUNING.encounterActionDelays[pendingAction.delayProfile ?? "search"]
    ?? EXPEDITION_TUNING.encounterActionDelays.search;
  return randomInteger(
    pendingAction.minimumMs ?? profile.minimumMs,
    pendingAction.maximumMs ?? profile.maximumMs,
    random,
  );
}

function addUnsecuredItem(expedition, itemId, quantity) {
  if (MaterialRules.isMaterialId(itemId)) {
    const staged = MaterialRules.addUnsecured(expedition, itemId, quantity);
    const definition = MaterialRules.definition(itemId);
    return {
      accepted: staged.accepted,
      rejected: staged.rejected,
      reward: {
        type: "material",
        materialId: itemId,
        quantity: staged.accepted,
        rejectedQuantity: staged.rejected,
      },
      message: staged.rejected > 0
        ? `MATERIAL FOUND\n${definition.name} x${staged.accepted}\nUNSECURED\nMaterial Bag full: ${staged.rejected} could not be carried.`
        : `MATERIAL FOUND\n${definition.name} x${staged.accepted}\nUNSECURED`,
    };
  }
  const existingLoot = expedition.unsecuredLoot.find((entry) => entry.itemId === itemId);
  if (existingLoot) {
    existingLoot.quantity += quantity;
  } else {
    expedition.unsecuredLoot.push({ itemId, quantity });
  }
  return {
    accepted: quantity,
    rejected: 0,
    reward: { type: "item", itemId, quantity },
    message: unsecuredLootMessage(itemId),
  };
}

function unsecuredLootMessage(itemId) {
  if (MaterialRules.isMaterialId(itemId)) {
    const material = MaterialRules.definition(itemId);
    return `MATERIAL FOUND\n${material.name}\n${material.description}\nUNSECURED`;
  }
  const item = ITEM_DEFINITIONS[itemId];
  return `ITEM FOUND\n${item.name}\n${item.description}\nUNSECURED`;
}

function lootRewardMessage(reward) {
  if (reward.type === "material") {
    const material = MaterialRules.definition(reward.materialId);
    const overflow = reward.rejectedQuantity > 0
      ? `\nMaterial Bag full: ${reward.rejectedQuantity} could not be carried.` : "";
    return `MATERIAL FOUND\n${material.name} x${reward.quantity}\nUNSECURED${overflow}`;
  }
  if (reward.type === "recipe") {
    return `RECIPE FOUND\n${RECIPE_DEFINITIONS[reward.recipeId].name}\nUNSECURED`;
  }
  if (reward.type === "item") return unsecuredLootMessage(reward.itemId);
  if (reward.type === "gold") return `+${reward.quantity} gold`;
  return "";
}

function expeditionItemQuantity(expedition, itemId) {
  if (MaterialRules.isMaterialId(itemId)) return MaterialRules.expeditionQuantity(expedition, itemId);
  const equippedQuantity = Object.values(expedition.selectedEquipment).includes(itemId) ? 1 : 0;
  const carriedQuantity = expedition.carriedItems?.[itemId] ?? 0;
  const unsecuredQuantity = expedition.unsecuredLoot
    .filter((entry) => entry.itemId === itemId)
    .reduce((sum, entry) => sum + entry.quantity, 0);
  return equippedQuantity + carriedQuantity + unsecuredQuantity;
}

function consumeExpeditionItem(expedition, itemId, quantity, player) {
  if (MaterialRules.isMaterialId(itemId)) {
    return MaterialRules.consumeFromExpedition(player, expedition, itemId, quantity).applied;
  }
  let remaining = quantity;
  const carriedQuantity = expedition.carriedItems[itemId] ?? 0;
  const carriedUsed = Math.min(carriedQuantity, remaining);

  if (carriedUsed > 0) {
    expedition.carriedItems[itemId] -= carriedUsed;
    expedition.consumedItems[itemId] = (expedition.consumedItems[itemId] ?? 0) + carriedUsed;
    remaining -= carriedUsed;
    if (expedition.carriedItems[itemId] <= 0) {
      delete expedition.carriedItems[itemId];
    }
  }

  for (let index = expedition.unsecuredLoot.length - 1; index >= 0 && remaining > 0; index -= 1) {
    const loot = expedition.unsecuredLoot[index];
    if (loot.itemId !== itemId) {
      continue;
    }
    const unsecuredUsed = Math.min(loot.quantity, remaining);
    loot.quantity -= unsecuredUsed;
    remaining -= unsecuredUsed;
    if (loot.quantity <= 0) {
      expedition.unsecuredLoot.splice(index, 1);
    }
  }
}

function weightedChoice(entries, random) {
  if (entries.length === 0) {
    return null;
  }

  const totalWeight = entries.reduce((sum, entry) => sum + Math.max(entry.weight, 0), 0);
  let roll = gameplayRandom(random) * totalWeight;
  for (const entry of entries) {
    roll -= Math.max(entry.weight, 0);
    if (roll <= 0) {
      return entry;
    }
  }
  return entries.at(-1);
}

function randomBetween(minimum, maximum, random) {
  return minimum + gameplayRandom(random) * (maximum - minimum);
}

function randomInteger(minimum, maximum, random) {
  const low = Math.ceil(Math.min(minimum, maximum));
  const high = Math.floor(Math.max(minimum, maximum));
  return Math.floor(gameplayRandom(random) * (high - low + 1)) + low;
}

function gameplayRandom(random) {
  return (typeof random === "function" ? random : GameRandom.random)();
}

function clampNumber(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

// Found food is consumed before settlement-owned food. This lets unused
// purchased provisions return after either outcome while failed-run forage is lost.
function adjustExpeditionProvisions(expedition, amount) {
  if (amount >= 0) {
    expedition.foundProvisions += amount;
    expedition.totalProvisionsGained = (expedition.totalProvisionsGained ?? 0) + amount;
  } else {
    let cost = Math.abs(amount);
    const foundUsed = Math.min(expedition.foundProvisions, cost);
    expedition.foundProvisions -= foundUsed;
    cost -= foundUsed;
    expedition.committedProvisionsRemaining = Math.max(
      expedition.committedProvisionsRemaining - cost,
      0,
    );
  }
  expedition.provisions = Math.max(
    expedition.foundProvisions + expedition.committedProvisionsRemaining,
    0,
  );
}

function resourceLabel(resource) {
  return ({ provisions: "provisions", health: "health", goldCarried: "gold" })[resource] ?? resource;
}

function pathLabel(pathId) {
  return ({
    old_forest_road: "Old Forest Road",
    overgrown_trail: "Overgrown Trail",
    fountain_of_barenton: "Fountain of Barenton",
    val_sans_retour: "Val sans Retour",
    search_for_merlin: "Search for Merlin",
  })[pathId] ?? pathId;
}
