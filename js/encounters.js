"use strict";

const EncounterRequirements = Object.freeze({
  meetsAll(requirements = [], context) {
    return requirements.every((requirement) => this.meets(requirement, context));
  },

  meets(requirement, context) {
    const { expedition, player } = context;

    switch (requirement.type) {
      case "expeditionItem":
        return expeditionItemQuantity(expedition, requirement.itemId) >= (requirement.quantity ?? 1);
      case "equippedItem":
        return Object.values(expedition.selectedEquipment).includes(requirement.itemId);
      case "ownsItem":
        return Boolean(player.ownedItems[requirement.itemId]);
      case "companion":
        return expedition.selectedCompanion === requirement.companionId;
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
  applyAll(effects = [], context) {
    return effects.flatMap((effect) => this.apply(effect, context));
  },

  apply(effect, context) {
    const { expedition, player } = context;

    switch (effect.type) {
      case "modifyResource": {
        const amount = Number.isFinite(effect.amount)
          ? effect.amount
          : randomInteger(effect.randomMinimum, effect.randomMaximum);
        const previousValue = Number(expedition[effect.resource]) || 0;
        expedition[effect.resource] = previousValue + amount;

        if (effect.resource === "health") {
          expedition.health = clampNumber(expedition.health, 0, 100);
        } else {
          expedition[effect.resource] = Math.max(0, expedition[effect.resource]);
        }

        return amount === 0
          ? []
          : [`${amount > 0 ? "+" : ""}${amount} ${resourceLabel(effect.resource)}`];
      }
      case "gainRandomUnsecuredItem": {
        const validItemIds = effect.itemIds.filter((itemId) => ITEM_DEFINITIONS[itemId]);
        if (validItemIds.length === 0) {
          return [];
        }
        const itemId = validItemIds[randomInteger(0, validItemIds.length - 1)];
        addUnsecuredItem(expedition, itemId, effect.quantity ?? 1);
        return [unsecuredLootMessage(itemId)];
      }
      case "gainUnsecuredItem":
        if (!ITEM_DEFINITIONS[effect.itemId]) {
          return [];
        }
        addUnsecuredItem(expedition, effect.itemId, effect.quantity ?? 1);
        return [unsecuredLootMessage(effect.itemId)];
      case "consumeExpeditionItem": {
        const quantity = effect.quantity ?? 1;
        if (expeditionItemQuantity(expedition, effect.itemId) < quantity) {
          return [];
        }
        consumeExpeditionItem(expedition, effect.itemId, quantity);
        return [`Used ${quantity} ${ITEM_DEFINITIONS[effect.itemId]?.name ?? effect.itemId}`];
      }
      case "changePath":
        expedition.currentPathId = effect.pathId;
        return [`Path changed to ${pathLabel(effect.pathId)}`];
      case "setRunFlag":
        expedition.runFlags[effect.flag] = effect.value ?? true;
        return effect.message ? [effect.message] : [];
      case "learnKnowledge":
        if (!player.learnedKnowledge.includes(effect.knowledgeId)) {
          player.learnedKnowledge.push(effect.knowledgeId);
        }
        return KNOWLEDGE_DEFINITIONS[effect.knowledgeId]
          ? [`Knowledge learned: ${KNOWLEDGE_DEFINITIONS[effect.knowledgeId].name}`]
          : [];
      case "conditional": {
        const effects = EncounterRequirements.meetsAll(effect.requirements, context)
          ? effect.effects
          : effect.elseEffects;
        return this.applyAll(effects, context);
      }
      case "randomChance":
        return Math.random() < effect.chance
          ? this.applyAll(effect.effects, context)
          : [];
      case "randomOne": {
        if (!Array.isArray(effect.options) || effect.options.length === 0) {
          return [];
        }
        const selectedEffects = effect.options[randomInteger(0, effect.options.length - 1)];
        return this.applyAll(selectedEffects, context);
      }
      case "failExpedition":
        context.failExpedition?.(effect.reason ?? "The expedition could not continue.");
        return [];
      default:
        console.warn(`Unknown encounter outcome type: ${effect.type}`);
        return [];
    }
  },
});

const EncounterManager = Object.freeze({
  initializeExpedition(expedition) {
    expedition.encounterTravelDistance = 0;
    expedition.nextEncounterAt = randomEncounterSpacing();
    expedition.seenEncounterIds = [];
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
    return weightedChoice(this.eligibleDefinitions(expedition, player));
  },

  eligibleDefinitions(expedition, player) {
    const context = { expedition, player };
    return Object.values(ENCOUNTER_DEFINITIONS).filter((encounter) => {
      const withinDistance = expedition.distance >= encounter.minimumDistance
        && expedition.distance <= encounter.maximumDistance;
      const correctLocation = encounter.regionId === expedition.regionId
        && encounter.pathIds.includes(expedition.currentPathId);
      const correctDirection = encounter.directions.includes(expedition.direction);
      const canRepeat = encounter.repeatable || !expedition.seenEncounterIds.includes(encounter.id);
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
    };
    if (!expedition.seenEncounterIds.includes(encounterId)) {
      expedition.seenEncounterIds.push(encounterId);
    }
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
    if (active?.phase === "result") {
      return { resolved: false, ended: false, message: "" };
    }
    const encounter = active ? ENCOUNTER_DEFINITIONS[active.encounterId] : null;
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

    const outcomeMessages = [
      ...EncounterOutcomes.applyAll(choice.costs, context),
      ...EncounterOutcomes.applyAll(choice.outcomes, context),
    ];
    active.outcomeMessages.push(...outcomeMessages);

    if (choice.nextStage) {
      const nextStage = encounter.stages[choice.nextStage];
      if (!nextStage) {
        console.warn(`Encounter ${encounter.id} is missing stage ${choice.nextStage}.`);
        return { resolved: false, ended: false, message: "" };
      }

      active.stageId = choice.nextStage;
      if (nextStage.resultStage) {
        active.outcomeMessages.push(...EncounterOutcomes.applyAll(nextStage.outcomes, context));
        active.phase = "result";
        active.resultText = nextStage.text;
        return { resolved: true, ended: false, awaitingContinue: true, message: nextStage.text };
      }

      active.phase = "choice";
      return { resolved: true, ended: false, message: choice.resultText ?? "" };
    }

    if (choice.endEncounter) {
      const message = choice.resultText || stage.text || `${encounter.title} resolved.`;
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
    expedition.lastEncounterId = expedition.activeEncounter?.encounterId ?? null;
    expedition.lastEncounterResult = message;
    expedition.activeEncounter = null;
    expedition.nextEncounterAt = expedition.encounterTravelDistance
      + Math.max(randomEncounterSpacing(), EXPEDITION_TUNING.postEncounterSafeDistance);
    return true;
  },

  forceNextSoon(expedition) {
    expedition.nextEncounterAt = expedition.encounterTravelDistance + 0.2;
  },
});

function randomEncounterSpacing() {
  return randomBetween(
    EXPEDITION_TUNING.encounterMinimumDistance,
    EXPEDITION_TUNING.encounterMaximumDistance,
  );
}

function addUnsecuredItem(expedition, itemId, quantity) {
  const existingLoot = expedition.unsecuredLoot.find((entry) => entry.itemId === itemId);
  if (existingLoot) {
    existingLoot.quantity += quantity;
  } else {
    expedition.unsecuredLoot.push({ itemId, quantity });
  }
}

function unsecuredLootMessage(itemId) {
  const item = ITEM_DEFINITIONS[itemId];
  return `ITEM FOUND\n${item.name}\n${item.description}\nUNSECURED`;
}

function expeditionItemQuantity(expedition, itemId) {
  const equippedQuantity = Object.values(expedition.selectedEquipment).includes(itemId) ? 1 : 0;
  const carriedQuantity = expedition.carriedItems?.[itemId] ?? 0;
  const unsecuredQuantity = expedition.unsecuredLoot
    .filter((entry) => entry.itemId === itemId)
    .reduce((sum, entry) => sum + entry.quantity, 0);
  return equippedQuantity + carriedQuantity + unsecuredQuantity;
}

function consumeExpeditionItem(expedition, itemId, quantity) {
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

function weightedChoice(entries) {
  if (entries.length === 0) {
    return null;
  }

  const totalWeight = entries.reduce((sum, entry) => sum + Math.max(entry.weight, 0), 0);
  let roll = Math.random() * totalWeight;
  for (const entry of entries) {
    roll -= Math.max(entry.weight, 0);
    if (roll <= 0) {
      return entry;
    }
  }
  return entries.at(-1);
}

function randomBetween(minimum, maximum) {
  return minimum + Math.random() * (maximum - minimum);
}

function randomInteger(minimum, maximum) {
  const low = Math.ceil(Math.min(minimum, maximum));
  const high = Math.floor(Math.max(minimum, maximum));
  return Math.floor(Math.random() * (high - low + 1)) + low;
}

function clampNumber(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function resourceLabel(resource) {
  return ({ provisions: "provisions", health: "health", goldCarried: "gold" })[resource] ?? resource;
}

function pathLabel(pathId) {
  return ({ old_forest_road: "Old Forest Road", overgrown_trail: "Overgrown Trail" })[pathId] ?? pathId;
}
