"use strict";

const EncounterRequirements = Object.freeze({
  meetsAll(requirements = [], context) {
    return requirements.every((requirement) => this.meets(requirement, context));
  },

  meets(requirement, context = {}) {
    const { expedition, player } = context;
    if (!requirement?.type) return false;

    switch (requirement.type) {
      case "anyOf":
        return Array.isArray(requirement.requirements)
          && requirement.requirements.some((nestedRequirement) => this.meets(nestedRequirement, context));
      case "allOf":
        return Array.isArray(requirement.requirements)
          && requirement.requirements.every((nestedRequirement) => this.meets(nestedRequirement, context));
      case "availableExpeditionItem":
        return Boolean(expedition)
          && expeditionItemQuantity(expedition, requirement.itemId) >= (requirement.quantity ?? 1);
      case "carriedItem":
        return Boolean(expedition)
          && (expedition.carriedItems?.[requirement.itemId] ?? 0) >= (requirement.quantity ?? 1);
      case "equippedItem":
        return Boolean(expedition)
          && Object.values(expedition.selectedEquipment ?? {}).includes(requirement.itemId);
      case "ownsItem":
        return Boolean(player?.ownedItems?.[requirement.itemId]);
      case "notOwnsItem":
        return !player?.ownedItems?.[requirement.itemId];
      case "companion":
        return Boolean(expedition)
          && (expedition.selectedCompanions ?? [expedition.selectedCompanion]).includes(requirement.companionId);
      case "unlockedCompanion":
        return player?.unlockedCompanions?.includes(requirement.companionId) === true;
      case "notUnlockedCompanion":
        return player?.unlockedCompanions?.includes(requirement.companionId) !== true;
      case "knowledge":
        return player?.learnedKnowledge?.includes(requirement.knowledgeId) === true;
      case "notKnowledge":
        return player?.learnedKnowledge?.includes(requirement.knowledgeId) !== true;
      case "minimumResource":
        {
          const owner = AbilityRules.persistentResourceOwner(player, expedition, requirement.resource);
          return Boolean(owner) && Number(owner[requirement.resource]) >= requirement.amount;
        }
      case "minimumHealth":
        return Boolean(expedition) && expedition.health >= requirement.amount;
      case "maximumHealth":
        return Boolean(expedition) && expedition.health <= requirement.amount;
      case "minimumDistance":
        return Boolean(expedition) && expedition.distance >= requirement.amount;
      case "currentPath":
        return Boolean(expedition) && expedition.currentPathId === requirement.pathId;
      case "runFlag":
        return Boolean(expedition)
          && expedition.runFlags?.[requirement.flag] === (requirement.value ?? true);
      case "notRunFlag":
        return Boolean(expedition)
          && expedition.runFlags?.[requirement.flag] !== (requirement.value ?? true);
      case "encounterFlag":
        return Boolean(expedition?.activeEncounter)
          && expedition.activeEncounter.encounterFlags?.[requirement.flag] === (requirement.value ?? true);
      case "notEncounterFlag":
        return Boolean(expedition?.activeEncounter)
          && expedition.activeEncounter.encounterFlags?.[requirement.flag] !== (requirement.value ?? true);
      case "campaignFlag":
        return player?.campaignFlags?.[requirement.flag] === (requirement.value ?? true);
      case "notCampaignFlag":
        return player?.campaignFlags?.[requirement.flag] !== (requirement.value ?? true);
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
      const owner = AbilityRules.persistentResourceOwner(context.player, context.expedition, cost.resource);
      return !owner || Number(owner[cost.resource]) < Math.abs(cost.amount);
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
  resolveAll(effects = [], context = {}) {
    const combined = { messages: [], rewards: [], resultText: "", combat: null, dialogue: null, minigame: null, locationStop: null, sfxId: null };
    for (let index = 0; index < effects.length; index += 1) {
      const effect = effects[index];
      const resolved = this.resolve(effect, context);
      combined.messages.push(...resolved.messages);
      if (resolved.resultText) {
        combined.resultText = resolved.resultText;
      }
      if (resolved.combat) {
        combined.combat = resolved.combat;
      }
      if (resolved.minigame) {
        combined.minigame = {
          ...resolved.minigame,
          remainingEffects: [
            ...(resolved.minigame.remainingEffects ?? []),
            ...effects.slice(index + 1),
          ],
        };
        break;
      }
      if (resolved.locationStop) {
        combined.locationStop = resolved.locationStop;
      }
      if (resolved.sfxId) combined.sfxId = resolved.sfxId;
      combined.rewards.push(...(resolved.rewards ?? []).map((reward) => annotateEncounterReward(reward, context)));
      if (resolved.dialogue) {
        combined.dialogue = {
          ...resolved.dialogue,
          remainingEffects: [
            ...(resolved.dialogue.remainingEffects ?? []),
            ...effects.slice(index + 1),
          ],
        };
        break;
      }
    }
    return combined;
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
    let minigame = null;
    let locationStop = null;
    let sfxId = effect.sfxId ?? null;

    switch (effect.type) {
      case "modifyResource": {
        const amount = Number.isFinite(effect.amount)
          ? effect.amount
          : randomInteger(effect.randomMinimum, effect.randomMaximum, expedition.random);
        if (effect.resource === "faith") {
          AbilityRules.modifyPersistentResource(player, expedition, effect.resource, amount);
        } else if (effect.resource === "provisions" && Number.isFinite(expedition.committedProvisionsRemaining)) {
          adjustExpeditionProvisions(expedition, amount);
        } else {
          const previousValue = Number(expedition[effect.resource]) || 0;
          expedition[effect.resource] = previousValue + amount;
        }

        if (effect.resource === "health") {
          expedition.health = clampNumber(
            expedition.health,
            0,
            InjuryRules.effectiveMaxHealth(expedition, "arthur"),
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
        const reward = stagedReward(staged);
        rewards = reward ? [{ ...reward, unsecured: true }] : [];
        messages = staged.message ? [staged.message] : [];
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
        const reward = stagedReward(staged);
        rewards = reward ? [{ ...reward, unsecured: true }] : [];
        messages = staged.message ? [staged.message] : [];
        resultText = effect.resultText?.replaceAll("{itemName}", item.name) ?? resultText;
        break;
      }
      case "gainUnsecuredItem":
        if (!ITEM_DEFINITIONS[effect.itemId]) {
          break;
        }
        const quantity = effect.quantity ?? 1;
        const staged = addUnsecuredItem(expedition, effect.itemId, quantity);
        const reward = stagedReward(staged);
        rewards = reward ? [{ ...reward, unsecured: true }] : [];
        messages = staged.message ? [staged.message] : [];
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
          sourceType: "encounter",
          sourceEncounterId: context.sourceEncounterId ?? expedition.activeEncounter?.encounterId,
          sourceChoiceId: context.sourceChoiceId ?? expedition.activeEncounter?.lastChoiceId,
        });
        messages = lootRewards.map(lootRewardMessage).filter(Boolean);
        rewards = lootRewards
          .filter((reward) => reward.type === "recipe" || Number(reward.quantity) > 0)
          .map((reward) => ({ ...reward, unsecured: true }));
        break;
      }
      case "learnRecipe": {
        player.learnedRecipes ??= [];
        expedition.unsecuredRecipes ??= [];
        if (!RECIPE_DEFINITIONS[effect.recipeId]
          || player.learnedRecipes.includes(effect.recipeId)
          || expedition.unsecuredRecipes.includes(effect.recipeId)) {
          break;
        }
        expedition.unsecuredRecipes.push(effect.recipeId);
        rewards = [{ type: "recipe", recipeId: effect.recipeId, quantity: 1, unsecured: true }];
        messages = [`Discovered the ${RECIPE_DEFINITIONS[effect.recipeId].name} recipe.`];
        break;
      }
      case "learnAbility": {
        const learned = AbilityRules.learn(player, effect.abilityId);
        if (learned.applied) {
          const ability = AbilityRules.definition(effect.abilityId);
          rewards = [{ type: "ability", abilityId: effect.abilityId, quantity: 1, unsecured: true }];
          messages = [`Learned ${ability?.name ?? effect.abilityId}.`];
        }
        break;
      }
      case "applyInjury": {
        const targets = effect.target === "selected_companion"
          ? [selectedCompanionIds(expedition)[0]].filter(Boolean)
          : effect.target === "all"
            ? ["arthur", ...selectedCompanionIds(expedition)]
            : [effect.target ?? "arthur"];
        targets.forEach((target) => {
          const result = InjuryRules.applyToExpedition(expedition, target, effect.injuryId, {
            source: effect.source ?? effect.cause ?? "encounter",
          });
          if (result.applied) messages.push(`${INJURY_DEFINITIONS[result.injuryId].name} gained.`);
        });
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
        if (ExpeditionRules.changePath(expedition, effect.pathId)) {
          messages = [`Path changed to ${pathLabel(effect.pathId)}`];
        }
        break;
      case "enterLocation":
        if (typeof LOCATION_DEFINITIONS !== "undefined" && LOCATION_DEFINITIONS[effect.locationId]) {
          locationStop = { locationId: effect.locationId };
          expedition.locationStop = locationStop;
          expedition.travelState = "paused";
        }
        break;
      case "setRunFlag":
        expedition.runFlags[effect.flag] = effect.value ?? true;
        messages = effect.message ? [effect.message] : [];
        break;
      case "setEncounterFlag":
        expedition.activeEncounter ??= {};
        expedition.activeEncounter.encounterFlags ??= {};
        expedition.activeEncounter.encounterFlags[effect.flag] = effect.value ?? true;
        messages = effect.message ? [effect.message] : [];
        break;
      case "setCampaignFlag":
        player.campaignFlags ??= {};
        player.campaignFlags[effect.flag] = effect.value ?? true;
        messages = effect.message ? [effect.message] : [];
        break;
      case "setCampaignFlagOnSafeReturn":
        expedition.pendingCampaignFlags ??= {};
        expedition.pendingCampaignFlags[effect.flag] = effect.value ?? true;
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
        const staged = addUnsecuredItem(expedition, effect.itemId, uniqueQuantity);
        const reward = stagedReward(staged);
        rewards = reward ? [{ ...reward, unsecured: true }] : [];
        messages = staged.message ? [staged.message] : [];
        resultText = effect.resultText ?? resultText;
        break;
      }
      case "learnKnowledge":
        if (!player.learnedKnowledge.includes(effect.knowledgeId)) {
          player.learnedKnowledge.push(effect.knowledgeId);
          rewards = [{ type: "knowledge", knowledgeId: effect.knowledgeId, quantity: 1, unsecured: true }];
          messages = KNOWLEDGE_DEFINITIONS[effect.knowledgeId]
            ? [`Knowledge learned: ${KNOWLEDGE_DEFINITIONS[effect.knowledgeId].name}`]
            : [];
        }
        break;
      case "conditional": {
        const branch = EncounterRequirements.meetsAll(effect.requirements, context);
        const resolved = this.resolveAll(branch ? effect.effects : effect.elseEffects, context);
        messages = resolved.messages;
        rewards = resolved.rewards;
        combat = resolved.combat;
        minigame = resolved.minigame;
        locationStop = resolved.locationStop;
        sfxId = resolved.sfxId ?? sfxId;
        if (resolved.dialogue) return { ...resolved, resultText: resolved.resultText || (branch ? effect.resultText : effect.elseResultText) || "" };
        resultText = resolved.resultText || (branch ? effect.resultText : effect.elseResultText) || "";
        break;
      }
      case "randomChance": {
        const roll = gameplayRandom(expedition.random);
        const succeeded = roll < effect.chance;
        const resolved = this.resolveAll(succeeded ? effect.effects : effect.elseEffects, context);
        messages = resolved.messages;
        rewards = resolved.rewards;
        combat = resolved.combat;
        locationStop = resolved.locationStop;
        sfxId = resolved.sfxId ?? sfxId;
        if (resolved.dialogue) return { ...resolved, resultText: resolved.resultText || (succeeded ? effect.resultText : effect.elseResultText) || "" };
        resultText = resolved.resultText
          || (succeeded ? effect.resultText : effect.elseResultText)
          || "";
        if (effect.secondaryOutcome) {
          const secondary = effect.secondaryOutcome;
          const secondarySucceeded = roll < secondary.chance;
          const secondaryResolved = this.resolveAll(
            secondarySucceeded ? secondary.effects : secondary.elseEffects,
            context,
          );
          messages.push(...secondaryResolved.messages);
          rewards.push(...secondaryResolved.rewards);
          combat = secondaryResolved.combat ?? combat;
          minigame = secondaryResolved.minigame ?? minigame;
          locationStop = secondaryResolved.locationStop ?? locationStop;
          sfxId = secondaryResolved.sfxId ?? sfxId;
          if (secondaryResolved.dialogue) return { ...secondaryResolved, messages, rewards, combat };
          resultText = secondaryResolved.resultText
            || (secondarySucceeded ? secondary.resultText : secondary.elseResultText)
            || resultText;
        }
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
        minigame = resolved.minigame;
        locationStop = resolved.locationStop;
        sfxId = resolved.sfxId ?? sfxId;
        if (resolved.dialogue) return { ...resolved, resultText: resolved.resultText || selected.resultText || "" };
        resultText = resolved.resultText || selected.resultText || "";
        break;
      }
      case "failExpedition":
        context.failExpedition?.(effect.reason ?? "The expedition could not continue.");
        break;
      case "startCombat":
        combat = effect;
        break;
      case "startMinigame": {
        const definition = Minigames.definitionForEncounter(effect);
        if (definition) {
          minigame = {
            minigameId: definition.id,
            completionEffects: [...(effect.completionEffects ?? [])],
            markEncounterFlag: effect.markEncounterFlag ?? null,
            tutorialText: effect.tutorialText ?? definition.tutorial?.text ?? null,
          };
        }
        break;
      }
      case "startDialogue":
        if (DIALOGUE_DEFINITIONS[effect.dialogueId]) {
          return {
            messages,
            rewards,
            resultText,
            combat,
            dialogue: { dialogueId: effect.dialogueId, remainingEffects: [] },
            sfxId,
          };
        }
        break;
      default:
        console.warn(`Unknown encounter outcome type: ${effect.type}`);
        break;
    }

    return { messages, rewards, resultText, combat, dialogue: null, minigame, locationStop, sfxId };
  },
});

function formatJourneyEntry(entry) {
  const normalized = String(entry ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return "";

  const resourceChange = normalized.match(/^([+-])(\d+(?:\.\d+)?) (provisions|health|gold)$/i);
  if (resourceChange) {
    const [, sign, amount, resource] = resourceChange;
    return `${sign === "+" ? "Gained" : "Lost"} ${amount} ${resource.toLowerCase()}.`;
  }
  const usedItem = normalized.match(/^Used (\d+) (.+)$/i);
  if (usedItem) return `Used ${usedItem[1]} ${usedItem[2]}.`;
  const changedPath = normalized.match(/^Path changed to (.+)$/i);
  if (changedPath) return `The company took the ${changedPath[1]}.`;

  return normalized
    .replace(/\b(?:MATERIAL FOUND|ITEM FOUND|RECIPE FOUND|UNSECURED)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function recordActiveJourney(expedition, active) {
  if (!active || active.journeyLogged) return;
  active.journeyLogged = true;
  const entries = [active.resultText, ...(active.outcomeMessages ?? [])]
    .map(formatJourneyEntry)
    .filter(Boolean)
    .filter((entry, index, allEntries) => allEntries.indexOf(entry) === index);
  if (entries.length > 0) {
    JourneyLog.add(expedition, entries.join(" "), {
      category: active.eventKind === "camp" ? "camp" : "encounter",
    });
  }
}

function appendEncounterOutcome(active, resolved) {
  active.outcomeMessages.push(...(resolved.messages ?? []));
  active.rewards ??= [];
  active.rewards.push(...(resolved.rewards ?? []));
}

function annotateEncounterReward(reward, context = {}) {
  if (!reward || reward.sourceType || !["item", "material", "recipe", "gold", "catch"].includes(reward.type)) {
    return reward;
  }
  const expedition = context.expedition;
  const sourceEncounterId = context.sourceEncounterId ?? expedition?.activeEncounter?.encounterId;
  if (!sourceEncounterId) return reward;
  const annotated = {
    ...reward,
    sourceType: "encounter",
    sourceEncounterId,
    ...(context.sourceChoiceId || expedition?.activeEncounter?.lastChoiceId
      ? { sourceChoiceId: context.sourceChoiceId ?? expedition.activeEncounter.lastChoiceId }
      : {}),
  };
  expedition?.lootDebugLog?.push({ type: "loot-granted", ...annotated });
  return annotated;
}

function queueEncounterDialogue(expedition, player, dialogue, resume, callbacks = {}) {
  const active = expedition.activeEncounter;
  if (!active || !dialogue?.dialogueId) {
    return { resolved: false, ended: false, message: "" };
  }
  active.phase = "dialogue";
  active.dialogueResolution = {
    dialogueId: dialogue.dialogueId,
    remainingEffects: [...(dialogue.remainingEffects ?? [])],
    resume,
  };
  const started = callbacks.startDialogue?.(dialogue.dialogueId) === true;
  if (!started) {
    delete active.dialogueResolution;
    active.phase = resume.fallbackPhase ?? "choice";
    return { resolved: false, ended: false, message: "" };
  }
  return { resolved: true, ended: false, dialogueStarted: true, message: "" };
}

function beginEncounterCombat(expedition, combat, resume, callbacks = {}) {
  const active = expedition.activeEncounter;
  if (!active || !combat) return { resolved: false, ended: false, message: "" };
  active.phase = "combat";
  active.combatResolution = combat;
  if (resume) active.combatResume = resume;
  const started = callbacks.startCombat?.(combat.combatId) === true;
  if (!started) {
    active.phase = "choice";
    delete active.combatResolution;
    delete active.combatResume;
    return { resolved: false, ended: false, message: "" };
  }
  return {
    resolved: true,
    ended: false,
    combatStarted: true,
    message: "",
    sfxId: combat.sfxId ?? resume?.sfxId ?? null,
  };
}

function beginEncounterMinigame(expedition, minigame, resume, callbacks = {}) {
  const active = expedition.activeEncounter;
  const definition = Minigames.definition(minigame?.minigameId);
  if (!active || !definition || !minigame) return { resolved: false, ended: false, message: "" };
  active.phase = "minigame";
  active.minigameResolution = { ...minigame, resume };
  const started = callbacks.startMinigame?.(definition.id, definition) === true;
  if (!started) {
    delete active.minigameResolution;
    active.phase = resume.fallbackPhase ?? "choice";
    return { resolved: false, ended: false, message: "" };
  }
  return {
    resolved: true,
    ended: false,
    minigameStarted: true,
    minigameId: definition.id,
    message: "",
    sfxId: resume?.sfxId ?? null,
  };
}

function finishEncounterChoiceRoute(expedition, player, route, callbacks = {}) {
  const active = expedition.activeEncounter;
  const encounter = EncounterManager.definitionFor(expedition, active);
  const context = { expedition, player, ...callbacks };
  if (!active || !encounter) return { resolved: false, ended: false, message: "" };

  if (route.nextStageId) {
    const nextStage = encounter.stages[route.nextStageId];
    if (!nextStage) {
      console.warn(`Encounter ${encounter.id} is missing stage ${route.nextStageId}.`);
      return { resolved: false, ended: false, message: "" };
    }

    active.stageId = route.nextStageId;
    active.visualOverride = nextStage.visualOverride ?? null;
    if (nextStage.resultStage) {
      const resolvedStage = EncounterOutcomes.resolveAll(nextStage.outcomes, context);
      appendEncounterOutcome(active, resolvedStage);
      const resultText = resolvedStage.resultText || nextStage.text;
      const stageSfxId = resolvedStage.sfxId ?? nextStage.sfxId ?? null;
      if (resolvedStage.dialogue) {
        return queueEncounterDialogue(expedition, player, resolvedStage.dialogue, {
          type: "result",
          resultText,
          sfxId: stageSfxId,
          fallbackPhase: "choice",
        }, callbacks);
      }
      if (resolvedStage.combat) {
        return beginEncounterCombat(expedition, resolvedStage.combat, {
          type: "result",
          resultText,
          sfxId: stageSfxId,
          fallbackPhase: "choice",
        }, callbacks);
      }
      if (resolvedStage.minigame) {
        return beginEncounterMinigame(expedition, resolvedStage.minigame, {
          type: "result",
          resultText,
          sfxId: stageSfxId,
          fallbackPhase: "choice",
        }, callbacks);
      }
      active.phase = "result";
      active.resultText = resultText;
      recordActiveJourney(expedition, active);
      return {
        resolved: true,
        ended: false,
        awaitingContinue: true,
        message: active.resultText,
        locationStop: resolvedStage.locationStop ?? null,
        sfxId: stageSfxId,
      };
    }

    active.phase = "choice";
    active.stageText = route.authoredResultText || nextStage.text;
    return {
      resolved: true,
      ended: false,
      message: active.stageText,
      sfxId: route.sfxId ?? nextStage.sfxId ?? null,
    };
  }

  if (route.endEncounter) {
    active.visualOverride = route.visualOverride ?? null;
    const stage = encounter.stages[active.stageId];
    const message = route.resultText || route.authoredResultText || stage?.text || `${encounter.title} resolved.`;
    active.phase = "result";
    active.resultText = message;
    recordActiveJourney(expedition, active);
    return {
      resolved: true,
      ended: false,
      awaitingContinue: true,
      message,
      locationStop: route.locationStop ?? null,
      sfxId: route.sfxId ?? null,
    };
  }

  return { resolved: true, ended: false, message: "" };
}

const EncounterManager = Object.freeze({
  definitionFor(expedition, active = expedition?.activeEncounter) {
    return active?.eventKind === "camp"
      ? CAMP_EVENT_DEFINITIONS[active.encounterId]
      : ENCOUNTER_DEFINITIONS[active?.encounterId];
  },

  initializeExpedition(expedition) {
    expedition.encounterTravelDistance = 0;
    expedition.nextEncounterAt = randomEncounterSpacing(expedition);
    expedition.seenEncounterIds = [];
    expedition.encounterOccurrences = {};
    expedition.runFlags = {};
    expedition.pendingCampaignFlags = {};
    expedition.activeEncounter = null;
    expedition.lastEncounterId = null;
    expedition.lastEncounterResult = "";
    expedition.lastEncounterTravelDistance = null;
    expedition.journeyLog ??= [];
  },

  advance(expedition, player, distanceTraveled) {
    if (expedition.activeEncounter || expedition.status !== "active") {
      return null;
    }

    expedition.encounterTravelDistance += Math.abs(distanceTraveled);
    const dueMilestone = this.selectDueMilestone(expedition, player);
    const spacedEnoughForMilestone = expedition.lastEncounterTravelDistance === null
      || expedition.lastEncounterTravelDistance === undefined
      || expedition.encounterTravelDistance - expedition.lastEncounterTravelDistance
        >= EXPEDITION_TUNING.postEncounterSafeDistance;
    if (dueMilestone && (spacedEnoughForMilestone || dueMilestone.ignoreEncounterSpacing === true)) {
      this.begin(expedition, dueMilestone.id);
      return dueMilestone;
    }
    if (typeof DebugTools !== "undefined" && DebugTools.randomEncountersDisabled()) {
      return null;
    }
    if (expedition.encounterTravelDistance < expedition.nextEncounterAt) {
      return null;
    }

    const encounter = this.selectEligible(expedition, player);
    if (!encounter) {
      // An exhausted pool produces uninterrupted travel instead of recycling content.
      expedition.nextEncounterAt = expedition.encounterTravelDistance
        + ExpeditionRules.encounterSpacing(expedition).maximumDistance;
      return null;
    }

    this.begin(expedition, encounter.id);
    return encounter;
  },

  selectEligible(expedition, player) {
    return weightedChoice(this.eligibleDefinitions(expedition, player), expedition.random);
  },

  selectDueMilestone(expedition, player) {
    return this.eligibleDefinitions(expedition, player)
      .filter((encounter) => encounter.milestone === true)
      .sort((left, right) => (
        (Number(left.milestoneOrder ?? left.minimumDistance) || 0)
          - (Number(right.milestoneOrder ?? right.minimumDistance) || 0)
      ))[0] ?? null;
  },

  isEligibleDefinition(encounter, expedition, player) {
    const context = { expedition, player };
    const withinDistance = expedition.distance >= encounter.minimumDistance
      && (!Number.isFinite(encounter.maximumDistance)
        || expedition.distance <= encounter.maximumDistance);
    const correctLocation = encounter.regionId === expedition.regionId
      && encounter.pathIds.includes(expedition.currentPathId);
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
      && correctDirection
      && canRepeat
      && avoidsImmediateRepeat
      && EncounterRequirements.meetsAll(encounter.requirements, context);
  },

  eligibleDefinitions(expedition, player) {
    return Object.values(ENCOUNTER_DEFINITIONS).filter((encounter) => (
      this.isEligibleDefinition(encounter, expedition, player)
    )).map((encounter) => ({
      ...encounter,
      weight: (Number(encounter.weight) || 1) * ExpeditionRules.discoveryWeightMultiplier(expedition, encounter),
    }));
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
      encounterFlags: {},
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
      encounterFlags: {},
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

    active.lastChoiceId = choice.id;
    const context = {
      expedition,
      player,
      sourceEncounterId: active.encounterId,
      sourceChoiceId: active.lastChoiceId,
      ...callbacks,
    };
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
    const visualOverride = branch?.visualOverride ?? choice.visualOverride ?? null;
    active.visualOverride = visualOverride;
    const nextStageId = branch?.nextStage ?? choice.nextStage;
    const endEncounter = branch ? branch.endEncounter === true : choice.endEncounter;
    const authoredResultText = branch?.resultText || choice.resultText;
    const route = {
      type: "choice",
      nextStageId,
      endEncounter,
      authoredResultText,
      resultText: resolvedOutcomes.resultText,
      locationStop: resolvedOutcomes.locationStop ?? null,
      sfxId: branch?.sfxId ?? choice.sfxId ?? resolvedOutcomes.sfxId ?? null,
      visualOverride,
      fallbackPhase: "choice",
    };
    if (resolvedOutcomes.dialogue) {
      return queueEncounterDialogue(expedition, player, resolvedOutcomes.dialogue, route, callbacks);
    }
    if (resolvedOutcomes.combat) {
      return beginEncounterCombat(expedition, resolvedOutcomes.combat, route, callbacks);
    }
    if (resolvedOutcomes.minigame) {
      return beginEncounterMinigame(expedition, resolvedOutcomes.minigame, route, callbacks);
    }
    return finishEncounterChoiceRoute(expedition, player, route, callbacks);
  },

  completeDialogue(expedition, player, dialogueResult = {}, callbacks = {}) {
    const active = expedition.activeEncounter;
    if (!active || active.phase !== "dialogue" || !active.dialogueResolution) {
      return { resolved: false, ended: false, message: "" };
    }
    const resolution = active.dialogueResolution;
    delete active.dialogueResolution;
    active.outcomeMessages.push(...(dialogueResult.messages ?? []));
    active.rewards ??= [];
    active.rewards.push(...(dialogueResult.rewards ?? []).map((reward) => annotateEncounterReward(reward, {
      expedition,
      sourceEncounterId: active.encounterId,
      sourceChoiceId: active.lastChoiceId,
    })));
    const context = {
      expedition,
      player,
      sourceEncounterId: active.encounterId,
      sourceChoiceId: active.lastChoiceId,
      ...callbacks,
    };
    const resolved = EncounterOutcomes.resolveAll(resolution.remainingEffects, context);
    appendEncounterOutcome(active, resolved);
    if (resolution.resume?.visualOverride !== undefined) {
      active.visualOverride = resolution.resume.visualOverride ?? null;
    }
    if (resolved.dialogue) {
      return queueEncounterDialogue(expedition, player, resolved.dialogue, resolution.resume, callbacks);
    }
    if (resolved.combat) {
      return beginEncounterCombat(expedition, resolved.combat, resolution.resume, callbacks);
    }
    if (resolved.minigame) {
      return beginEncounterMinigame(expedition, resolved.minigame, resolution.resume, callbacks);
    }
    if (resolution.resume.type === "choice") {
      return finishEncounterChoiceRoute(expedition, player, resolution.resume, callbacks);
    }
    active.phase = "result";
    active.resultText = resolution.resume.resultText || resolved.resultText || "The dialogue concludes.";
    recordActiveJourney(expedition, active);
    return {
      resolved: true,
      ended: false,
      awaitingContinue: true,
      message: active.resultText,
      locationStop: resolved.locationStop ?? resolution.resume.locationStop ?? null,
      sfxId: resolved.sfxId ?? resolution.resume.sfxId ?? null,
    };
  },

  completeMinigame(expedition, player, result = {}, callbacks = {}) {
    const active = expedition.activeEncounter;
    if (!active || active.phase !== "minigame" || !active.minigameResolution) {
      return { resolved: false, ended: false, message: "" };
    }
    const resolution = active.minigameResolution;
    delete active.minigameResolution;
    active.phase = "choice";
    active.outcomeMessages.push(...(result.messages ?? []));
    active.rewards ??= [];
    active.rewards.push(...(result.rewards ?? []));
    if (resolution.markEncounterFlag) {
      active.encounterFlags ??= {};
      active.encounterFlags[resolution.markEncounterFlag] = true;
    }
    const context = {
      expedition,
      player,
      sourceEncounterId: active.encounterId,
      sourceChoiceId: active.lastChoiceId,
      ...callbacks,
    };
    const resolved = EncounterOutcomes.resolveAll([
      ...(resolution.completionEffects ?? []),
      ...(resolution.remainingEffects ?? []),
    ], context);
    appendEncounterOutcome(active, resolved);
    if (resolution.resume?.visualOverride !== undefined) {
      active.visualOverride = resolution.resume.visualOverride ?? null;
    }
    if (resolved.dialogue) {
      return queueEncounterDialogue(expedition, player, resolved.dialogue, resolution.resume, callbacks);
    }
    if (resolved.combat) {
      return beginEncounterCombat(expedition, resolved.combat, resolution.resume, callbacks);
    }
    if (resolved.minigame) {
      return beginEncounterMinigame(expedition, resolved.minigame, resolution.resume, callbacks);
    }
    if (resolution.resume?.type === "choice") {
      return finishEncounterChoiceRoute(expedition, player, resolution.resume, callbacks);
    }
    active.phase = "result";
    active.resultText = resolution.resume?.resultText || resolved.resultText || "The minigame concludes.";
    recordActiveJourney(expedition, active);
    return {
      resolved: true,
      ended: false,
      minigameCompleted: true,
      awaitingContinue: true,
      message: active.resultText,
      locationStop: resolved.locationStop ?? resolution.resume?.locationStop ?? null,
      sfxId: resolved.sfxId ?? resolution.resume?.sfxId ?? null,
    };
  },

  continueJourney(expedition) {
    const active = expedition.activeEncounter;
    if (!active || active.phase !== "result") {
      return false;
    }

    const message = active.resultText;
    recordActiveJourney(expedition, active);
    if (active.eventKind === "camp") {
      expedition.lastCampEventId = active.encounterId;
      expedition.lastCampEventResult = message;
      expedition.activeEncounter = null;
      return true;
    }
    expedition.lastEncounterId = expedition.activeEncounter?.encounterId ?? null;
    expedition.lastEncounterResult = message;
    expedition.lastEncounterTravelDistance = expedition.encounterTravelDistance;
    expedition.activeEncounter = null;
    expedition.nextEncounterAt = expedition.encounterTravelDistance
      + Math.max(randomEncounterSpacing(expedition), EXPEDITION_TUNING.postEncounterSafeDistance);
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
    const context = {
      expedition,
      player,
      sourceEncounterId: active.encounterId,
      sourceChoiceId: active.lastChoiceId,
      ...callbacks,
    };
    const combat = callbacks.combat ?? expedition.combat;
    if (result === "victory" && combat
      && typeof CombatSystem !== "undefined"
      && typeof CombatSystem.resolveVictoryLoot === "function") {
      const combatRewards = CombatSystem.resolveVictoryLoot(
        combat,
        expedition,
        player,
        { sourceEncounterId: active.encounterId, sourceChoiceId: active.lastChoiceId },
      );
      appendEncounterOutcome(active, {
        messages: combatRewards.map(lootRewardMessage).filter(Boolean),
        rewards: combatRewards
          .filter((reward) => reward.type === "recipe" || Number(reward.quantity) > 0)
          .map((reward) => ({ ...reward, unsecured: true })),
      });
    }
    const resolved = EncounterOutcomes.resolveAll(resolution.outcomes, context);
    appendEncounterOutcome(active, resolved);
    active.visualOverride = resolution.visualOverride ?? null;
    const resultText = resolved.resultText
      || resolution.resultText
      || (result === "victory" ? "The enemy is defeated." : "The company escapes.");
    delete active.combatResolution;
    if (resolved.dialogue) {
      return queueEncounterDialogue(expedition, player, resolved.dialogue, {
        type: "combatResult",
        resultText,
        sfxId: resolved.sfxId ?? resolution.sfxId ?? null,
        fallbackPhase: "choice",
      }, callbacks);
    }
    active.phase = "result";
    active.resultText = resultText;
    recordActiveJourney(expedition, active);
    return {
      resolved: true,
      ended: false,
      awaitingContinue: true,
      message: active.resultText,
      locationStop: resolved.locationStop ?? null,
      sfxId: resolved.sfxId ?? resolution.sfxId ?? null,
    };
  },

  forceNextSoon(expedition) {
    expedition.nextEncounterAt = expedition.encounterTravelDistance + 0.2;
  },
});

function randomEncounterSpacing(expedition) {
  const spacing = ExpeditionRules.encounterSpacing(expedition);
  return randomBetween(
    spacing.minimumDistance,
    spacing.maximumDistance,
    expedition?.random,
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
  const requestedQuantity = Math.max(0, Math.floor(Number(quantity) || 0));
  if (requestedQuantity === 0) {
    return {
      accepted: 0,
      rejected: 0,
      reward: { type: MaterialRules.isMaterialId(itemId) ? "material" : "item", ...(MaterialRules.isMaterialId(itemId) ? { materialId: itemId } : { itemId }), quantity: 0 },
      message: "",
    };
  }
  if (MaterialRules.isMaterialId(itemId)) {
    const staged = MaterialRules.addUnsecured(expedition, itemId, requestedQuantity);
    return {
      accepted: staged.accepted,
      rejected: staged.rejected,
      reward: {
        type: "material",
        materialId: itemId,
        quantity: staged.accepted,
        rejectedQuantity: staged.rejected,
      },
      message: materialAcquisitionMessage(itemId, staged.accepted, staged.rejected),
    };
  }
  const existingLoot = expedition.unsecuredLoot.find((entry) => entry.itemId === itemId);
  if (existingLoot) {
    existingLoot.quantity += requestedQuantity;
  } else {
    expedition.unsecuredLoot.push({ itemId, quantity: requestedQuantity });
  }
  return {
    accepted: requestedQuantity,
    rejected: 0,
    reward: { type: "item", itemId, quantity: requestedQuantity },
    message: unsecuredLootMessage(itemId, requestedQuantity),
  };
}

function quantityMarker(quantity) {
  return Number(quantity) > 1 ? ` ×${quantity}` : "";
}

function materialAcquisitionMessage(materialId, accepted, rejected) {
  const material = MaterialRules.definition(materialId);
  if (accepted > 0 && rejected > 0) {
    return `Collected ${material.name} ×${accepted}; ${rejected} left behind because the Material Bag was full.`;
  }
  if (accepted > 0) return `Collected ${material.name}${quantityMarker(accepted)}.`;
  if (rejected > 0) return `The Material Bag was full; ${material.name}${quantityMarker(rejected)} was left behind.`;
  return "";
}

function unsecuredLootMessage(itemId, quantity = 1) {
  if (MaterialRules.isMaterialId(itemId)) return materialAcquisitionMessage(itemId, quantity, 0);
  const item = ITEM_DEFINITIONS[itemId];
  return `Found ${item.name}${quantityMarker(quantity)}.`;
}

function lootRewardMessage(reward) {
  if (Number(reward.quantity) <= 0 && reward.type !== "recipe") return "";
  if (reward.type === "material") {
    return materialAcquisitionMessage(reward.materialId, reward.quantity, reward.rejectedQuantity ?? 0);
  }
  if (reward.type === "recipe") {
    return `Discovered the ${RECIPE_DEFINITIONS[reward.recipeId].name} recipe.`;
  }
  if (reward.type === "item") return unsecuredLootMessage(reward.itemId, reward.quantity);
  if (reward.type === "gold") return `Recovered ${reward.quantity} gold.`;
  if (reward.type === "catch") return `Caught ${reward.displayName}${quantityMarker(reward.quantity)}.`;
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

function stagedReward(staged) {
  return staged?.accepted > 0 ? staged.reward : null;
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
  return ({ provisions: "provisions", health: "health", goldCarried: "gold", faith: "Faith" })[resource] ?? resource;
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
