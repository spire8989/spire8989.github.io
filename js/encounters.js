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
        return [`Found ${ITEM_DEFINITIONS[itemId].name}`];
      }
      case "gainUnsecuredItem":
        if (!ITEM_DEFINITIONS[effect.itemId]) {
          return [];
        }
        addUnsecuredItem(expedition, effect.itemId, effect.quantity ?? 1);
        return [`Found ${ITEM_DEFINITIONS[effect.itemId].name}`];
      case "consumeExpeditionItem": {
        const quantity = effect.quantity ?? 1;
        if ((expedition.carriedItems[effect.itemId] ?? 0) < quantity) {
          return [];
        }
        expedition.carriedItems[effect.itemId] -= quantity;
        if (expedition.carriedItems[effect.itemId] <= 0) {
          delete expedition.carriedItems[effect.itemId];
        }
        expedition.consumedItems[effect.itemId] = (expedition.consumedItems[effect.itemId] ?? 0) + quantity;
        return [`Used ${quantity} ${ITEM_DEFINITIONS[effect.itemId]?.name ?? effect.itemId}`];
      }
      case "changePath":
        expedition.currentPathId = effect.pathId;
        return [`Path changed to ${pathLabel(effect.pathId)}`];
      case "setRunFlag":
        expedition.runFlags[effect.flag] = effect.value ?? true;
        return [];
      case "learnKnowledge":
        if (!player.learnedKnowledge.includes(effect.knowledgeId)) {
          player.learnedKnowledge.push(effect.knowledgeId);
        }
        return [];
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
  minimumSpacing: 5,
  maximumSpacing: 9,

  initializeExpedition(expedition) {
    expedition.encounterTravelDistance = 0;
    expedition.nextEncounterAt = randomBetween(this.minimumSpacing, this.maximumSpacing);
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
      expedition.nextEncounterAt = expedition.encounterTravelDistance + randomBetween(2, 4);
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
    active.outcomeMessages = outcomeMessages;

    if (choice.nextStage) {
      active.stageId = choice.nextStage;
      return { resolved: true, ended: false, message: choice.resultText ?? "" };
    }

    if (choice.endEncounter) {
      const message = choice.resultText || outcomeMessages.join(" · ") || `${encounter.title} resolved.`;
      this.end(expedition, message);
      return { resolved: true, ended: true, message };
    }

    return { resolved: true, ended: false, message: "" };
  },

  end(expedition, message) {
    expedition.lastEncounterId = expedition.activeEncounter?.encounterId ?? null;
    expedition.lastEncounterResult = message;
    expedition.activeEncounter = null;
    expedition.nextEncounterAt = expedition.encounterTravelDistance
      + randomBetween(this.minimumSpacing, this.maximumSpacing);
  },

  forceNextSoon(expedition) {
    expedition.nextEncounterAt = expedition.encounterTravelDistance + 0.2;
  },
});

function addUnsecuredItem(expedition, itemId, quantity) {
  const existingLoot = expedition.unsecuredLoot.find((entry) => entry.itemId === itemId);
  if (existingLoot) {
    existingLoot.quantity += quantity;
  } else {
    expedition.unsecuredLoot.push({ itemId, quantity });
  }
}

function expeditionItemQuantity(expedition, itemId) {
  const equippedQuantity = Object.values(expedition.selectedEquipment).includes(itemId) ? 1 : 0;
  const carriedQuantity = expedition.carriedItems?.[itemId] ?? 0;
  const unsecuredQuantity = expedition.unsecuredLoot
    .filter((entry) => entry.itemId === itemId)
    .reduce((sum, entry) => sum + entry.quantity, 0);
  return equippedQuantity + carriedQuantity + unsecuredQuantity;
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
