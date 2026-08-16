"use strict";

const InjuryRules = Object.freeze({
  maximumActive: 2,

  definition(injuryId) {
    return INJURY_DEFINITIONS[injuryId] ?? null;
  },

  characterIds() {
    return [...INJURY_CHARACTER_IDS];
  },

  snapshot(holder) {
    const source = holder?.injuries ?? (isDirectInjuryMap(holder) ? holder : {});
    return Object.fromEntries(INJURY_CHARACTER_IDS.map((characterId) => [
      characterId,
      normalizeInjuryInstances(source[characterId]),
    ]));
  },

  ensure(holder) {
    if (!holder) return {};
    if (isDirectInjuryMap(holder)) {
      const alreadyNormalized = INJURY_CHARACTER_IDS.every((characterId) => (
        Array.isArray(holder[characterId])
        && holder[characterId].every((entry) => entry && typeof entry === "object"
          && INJURY_DEFINITIONS[entry.injuryId])
      ));
      if (!alreadyNormalized) {
        const normalized = this.snapshot(holder);
        INJURY_CHARACTER_IDS.forEach((characterId) => { holder[characterId] = normalized[characterId]; });
      }
      return holder;
    }
    const source = holder.injuries ?? {};
    const alreadyNormalized = INJURY_CHARACTER_IDS.every((characterId) => (
      Array.isArray(source[characterId])
      && source[characterId].every((entry) => entry && typeof entry === "object"
        && INJURY_DEFINITIONS[entry.injuryId])
    ));
    if (!alreadyNormalized) holder.injuries = this.snapshot(holder);
    return holder.injuries;
  },

  forCharacter(holder, characterId) {
    this.ensure(holder);
    return holder?.injuries?.[characterId] ?? holder?.[characterId] ?? [];
  },

  idsForCharacter(holder, characterId) {
    return this.forCharacter(holder, characterId).map((instance) => this.idOf(instance));
  },

  idOf(instance) {
    return typeof instance === "string" ? instance : instance?.injuryId ?? null;
  },

  has(holder, characterId, injuryId) {
    return this.forCharacter(holder, characterId).some((instance) => this.idOf(instance) === injuryId);
  },

  apply(holder, characterId, injuryId, metadata = {}) {
    const definition = this.definition(injuryId);
    if (!holder || !INJURY_CHARACTER_IDS.includes(characterId) || !definition) {
      return { applied: false, reason: "invalid-injury" };
    }
    const injuries = this.ensure(holder);
    const current = injuries[characterId];
    if (current.some((instance) => this.idOf(instance) === injuryId)) {
      return { applied: false, reason: "duplicate", injuryId, characterId };
    }
    if (current.length >= this.maximumActive) {
      return { applied: false, reason: "maximum-active", injuryId, characterId };
    }

    const random = randomSource(metadata.random, holder?.random);
    const instance = createInjuryInstance(injuryId, metadata, random);
    current.push(instance);
    return {
      applied: true,
      injuryId,
      characterId,
      source: metadata.source ?? metadata.cause ?? "unknown",
      definition,
      instance: copyInjuryInstance(instance),
    };
  },

  remove(holder, characterId, injuryId, metadata = {}) {
    const current = this.forCharacter(holder, characterId);
    const index = current.findIndex((instance) => this.idOf(instance) === injuryId);
    if (index < 0) return { applied: false, reason: "not-active", injuryId, characterId };
    const instance = current[index];
    current.splice(index, 1);
    const result = {
      applied: true,
      injuryId,
      characterId,
      method: metadata.method ?? metadata.source ?? "treatment",
      definition: this.definition(injuryId),
      instance: copyInjuryInstance(instance),
      stabilized: Boolean(metadata.stabilized),
      deepCutStabilized: Boolean(metadata.stabilized && injuryId === "deep_cut"),
    };
    if (holder.injuryEvents) holder.injuryEvents.push({ type: "injury-treated", ...result });
    return result;
  },

  effectiveMaxHealth(holder, characterId) {
    const base = characterId === "arthur"
      ? PLAYER_CHARACTER_DEFINITION.combat.maxHp
      : COMPANION_DEFINITIONS[characterId]?.combat?.maxHp ?? 0;
    return Math.max(1, Math.floor(base * this.effectMultiplier(holder, characterId, "maxHealthMultiplier")));
  },

  effectMultiplier(holder, characterId, effectName) {
    return this.forCharacter(holder, characterId).reduce((multiplier, instance) => (
      multiplier * (Number(this.definition(this.idOf(instance))?.effects?.[effectName]) || 1)
    ), 1);
  },

  travelSpeedMultiplier(holder, characterId) {
    return this.effectMultiplier(holder, characterId, "travelSpeedMultiplier");
  },

  partyTravelSpeedMultiplier(expedition) {
    const ids = ["arthur", ...selectedCompanionIds(expedition)];
    return ids.reduce((multiplier, characterId) => (
      Math.min(multiplier, this.travelSpeedMultiplier(expedition, characterId))
    ), 1);
  },

  combatDefenseMultiplier(holder, characterId) {
    return this.effectMultiplier(holder, characterId, "defenseMultiplier");
  },

  combatGaugeRateMultiplier(holder, characterId) {
    return this.effectMultiplier(holder, characterId, "combatGaugeRateMultiplier");
  },

  incomingDamageMultiplier(holder, characterId) {
    return this.effectMultiplier(holder, characterId, "incomingDamageMultiplier");
  },

  restHealingMultiplier(expedition) {
    return this.rationDefinition(expedition?.rationId).restHealingMultiplier;
  },

  rationDefinition(rationId) {
    return EXPEDITION_TUNING.rationLevels[rationId ?? "normal"] ?? EXPEDITION_TUNING.rationLevels.normal;
  },

  recoverExhaustion(holder, characterId, method) {
    return this.has(holder, characterId, "exhaustion")
      ? this.remove(holder, characterId, "exhaustion", { method }) : { applied: false, reason: "not-active" };
  },

  accelerateRecovery(holder, characterId, distance, method = "rest") {
    const reduction = Math.max(0, Number(distance) || 0);
    if (reduction <= 0) return [];
    const results = [];
    const current = this.forCharacter(holder, characterId);
    [...current].forEach((instance) => {
      const definition = this.definition(this.idOf(instance));
      if (!definition?.recoveryDistanceRange || !(Number(instance.remainingRecoveryDistance) > 0)) return;
      const before = Number(instance.remainingRecoveryDistance);
      instance.remainingRecoveryDistance = Math.max(0, before - reduction);
      const accelerated = {
        applied: true,
        injuryId: this.idOf(instance),
        characterId,
        method,
        distanceReduced: roundInjuryDistance(before - instance.remainingRecoveryDistance),
        remainingRecoveryDistance: roundInjuryDistance(instance.remainingRecoveryDistance),
        recovered: instance.remainingRecoveryDistance <= 0,
        instance: copyInjuryInstance(instance),
      };
      if (instance.remainingRecoveryDistance <= 0) {
        const recovery = removeInstance(current, instance);
        accelerated.instance = copyInjuryInstance(recovery);
        accelerated.recovered = true;
        this.recordRecovery(holder, {
          ...accelerated,
          recoveryType: "accelerated",
        });
      } else if (holder.injuryEvents) {
        holder.injuryEvents.push({ type: "injury-recovery-accelerated", ...accelerated });
      }
      results.push(accelerated);
    });
    return results;
  },

  advanceTravelDamage(expedition, characterId, instance, distance) {
    const definition = this.definition(this.idOf(instance));
    const amount = Number(definition?.travelDamageAmount);
    const interval = Number(definition?.travelDamageInterval);
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(interval) || interval <= 0) return [];
    if (characterId !== "arthur" && expedition.companionCombatHp?.[characterId] === undefined) return [];

    const traveled = Math.max(0, Number(distance) || 0);
    if (traveled <= 0) return [];
    const accumulated = Number(instance.travelDamageDistance) || 0;
    const total = accumulated + traveled;
    const ticks = Math.floor((total + Number.EPSILON) / interval);
    instance.travelDamageDistance = roundInjuryDistance(total - (ticks * interval));
    if (ticks <= 0) return [];

    const events = [];
    for (let tick = 0; tick < ticks; tick += 1) {
      const healthBefore = characterId === "arthur"
        ? Math.max(0, Number(expedition.health) || 0)
        : Math.max(0, Number(expedition.companionCombatHp[characterId]) || 0);
      const damage = Math.min(amount, healthBefore);
      const healthAfter = Math.max(0, healthBefore - amount);
      if (characterId === "arthur") expedition.health = healthAfter;
      else expedition.companionCombatHp[characterId] = healthAfter;
      const event = {
        type: "injury-travel-damage",
        injuryId: this.idOf(instance),
        characterId,
        amount,
        damage,
        interval,
        tick: tick + 1,
        distance: Number(expedition.distance) || 0,
        healthBefore,
        healthAfter,
      };
      expedition.injuryEvents ??= [];
      expedition.injuryEvents.push(event);
      if (typeof JourneyLog !== "undefined") {
        const injury = this.definition(event.injuryId);
        JourneyLog.add(expedition, `${characterName(characterId)} takes ${damage} travel damage from ${injury?.shortName ?? event.injuryId}.`, { category: "injury" });
      }
      events.push(event);
    }
    return events;
  },

  treatmentItemFor(injuryId) {
    return this.definition(injuryId)?.treatmentItemId ?? null;
  },

  treatWithItem(player, characterId, itemId, metadata = {}) {
    const authoredTreatmentIds = ITEM_DEFINITIONS[itemId]?.effects?.treatment?.injuryIds ?? [];
    const target = this.forCharacter(player, characterId)
      .find((instance) => authoredTreatmentIds.includes(this.idOf(instance))
        || this.treatmentItemFor(this.idOf(instance)) === itemId);
    const injuryId = this.idOf(target);
    if (!injuryId) return { applied: false, reason: "wrong-treatment", characterId, itemId };
    if ((player.ownedItems?.[itemId] ?? 0) < 1) return { applied: false, reason: "item-missing", characterId, itemId, injuryId };

    const stabilized = injuryId === "deep_cut" && itemId === "healing_poultice";
    if (stabilized) {
      target.stabilized = true;
      target.infectionChecked = true;
    }
    player.ownedItems[itemId] -= 1;
    if (player.ownedItems[itemId] <= 0) delete player.ownedItems[itemId];
    return this.remove(player, characterId, injuryId, {
      method: itemId,
      stabilized,
      ...metadata,
    });
  },

  recordExpeditionResult(expedition, result, metadata = {}) {
    expedition.injuryEvents ??= [];
    if (result?.applied) {
      expedition.injuryEvents.push({
        type: "injury-gained",
        injuryId: result.injuryId,
        characterId: result.characterId,
        source: result.source ?? metadata.source ?? "unknown",
        distance: Number(expedition.distance) || 0,
        applied: true,
        originalRecoveryDistance: result.instance?.originalRecoveryDistance ?? null,
        remainingRecoveryDistance: result.instance?.remainingRecoveryDistance ?? null,
        initialState: copyInjuryInstance(result.instance),
      });
      JourneyLog.add(expedition, `${INJURY_DEFINITIONS[result.injuryId].name} affects ${characterName(result.characterId)}.`, { category: "injury" });
    }
    return result;
  },

  recordRecovery(holder, result) {
    if (!holder?.injuryEvents || !result?.applied) return result;
    const event = {
      type: "injury-recovered",
      injuryId: result.injuryId,
      characterId: result.characterId,
      recoveryType: result.recoveryType ?? "natural",
      method: result.method ?? null,
      distance: Number(holder.distance) || 0,
      originalRecoveryDistance: result.instance?.originalRecoveryDistance ?? null,
      remainingRecoveryDistance: 0,
    };
    holder.injuryEvents.push(event);
    if (typeof JourneyLog !== "undefined") {
      JourneyLog.add(holder, `${characterName(result.characterId)}'s ${INJURY_DEFINITIONS[result.injuryId].shortName.toLowerCase()} has healed.`, { category: "injury" });
    }
    return result;
  },

  recordExpeditionInfection(expedition, instance, characterId) {
    const event = {
      type: "injury-infected",
      injuryId: "deep_cut",
      characterId,
      distance: Number(expedition.distance) || 0,
      source: "untreated-deep-cut",
      originalRecoveryDistance: instance.originalRecoveryDistance ?? null,
    };
    expedition.injuryEvents ??= [];
    expedition.injuryEvents.push(event);
    JourneyLog.add(expedition, `${characterName(characterId)}'s wound has become infected.`, { category: "injury" });
    return event;
  },

  applyToExpedition(expedition, characterId, injuryId, metadata = {}) {
    const result = this.apply(expedition, characterId, injuryId, metadata);
    if (result.applied) {
      if (characterId === "arthur") {
        expedition.health = Math.min(Number(expedition.health) || 0, this.effectiveMaxHealth(expedition, "arthur"));
      } else if (expedition.companionCombatHp?.[characterId] !== undefined) {
        expedition.companionCombatHp[characterId] = Math.min(
          Number(expedition.companionCombatHp[characterId]) || 0,
          this.effectiveMaxHealth(expedition, characterId),
        );
      }
    }
    return this.recordExpeditionResult(expedition, result, metadata);
  },

  advanceNaturalRecovery(expedition, distanceTraveled, characterIds = null) {
    const distance = Math.max(0, Number(distanceTraveled) || 0);
    if (!expedition || distance <= 0) return [];
    const events = [];
    const partyIds = characterIds ?? ["arthur", ...selectedCompanionIds(expedition)];
    partyIds.forEach((characterId) => {
      const current = this.forCharacter(expedition, characterId);
      for (let index = current.length - 1; index >= 0; index -= 1) {
        const instance = current[index];
        const injuryId = this.idOf(instance);
        const definition = this.definition(injuryId);
        events.push(...this.advanceTravelDamage(expedition, characterId, instance, distance));
        if (!definition?.recoveryDistanceRange || !(Number(instance.remainingRecoveryDistance) > 0)) continue;
        const before = Number(instance.remainingRecoveryDistance);
        instance.remainingRecoveryDistance = Math.max(0, before - distance);

        if (injuryId === "deep_cut"
          && !instance.stabilized
          && !instance.infectionChecked
          && before - instance.remainingRecoveryDistance >= (Number(definition.infectionCheckDistance) || 0)) {
          instance.infectionChecked = true;
          if (Number(instance.infectionRoll) < (Number(definition.infectionChance) || 0)) {
            current.splice(index, 1);
            this.recordExpeditionInfection(expedition, instance, characterId);
            const infection = this.applyToExpedition(expedition, characterId, "infection", {
              source: "deep-cut-infection",
            });
            if (infection.applied) events.push({ ...infection, infection: true });
            continue;
          }
        }

        if (instance.remainingRecoveryDistance <= 0) {
          current.splice(index, 1);
          const result = {
            applied: true,
            injuryId,
            characterId,
            method: "travel",
            recoveryType: "natural",
            instance: copyInjuryInstance(instance),
          };
          this.recordRecovery(expedition, result);
          events.push(result);
        }
      }
    });
    return events;
  },

  checkTravelRisk(expedition, player, distanceTraveled) {
    if (!expedition || expedition.direction !== "outbound" || distanceTraveled <= 0) return [];
    expedition.travelRiskDistance = (Number(expedition.travelRiskDistance) || 0) + distanceTraveled;
    expedition.exhaustionCheckDistance = (Number(expedition.exhaustionCheckDistance) || 0) + distanceTraveled;
    const events = [];
    const pace = EXPEDITION_TUNING.travelPaces[expedition.paceId] ?? EXPEDITION_TUNING.travelPaces.normal;
    const ration = this.rationDefinition(expedition.rationId);
    const hasRiskModifier = expedition.paceId !== "normal"
      || expedition.rationId !== "normal"
      || this.forCharacter(expedition, "arthur").length > 0;
    if (!hasRiskModifier) return events;
    while (expedition.travelRiskDistance >= EXPEDITION_TUNING.travelInjuryCheckDistance) {
      expedition.travelRiskDistance -= EXPEDITION_TUNING.travelInjuryCheckDistance;
      const existingSprain = this.has(expedition, "arthur", "sprained_ankle");
      const hardPushMultiplier = expedition.paceId === "hard_push" && existingSprain ? 1.35 : 1;
      const chance = EXPEDITION_TUNING.travelInjuryBaseChance * pace.travelInjuryRiskMultiplier * hardPushMultiplier;
      if (expedition.random() < chance) {
        const result = this.applyToExpedition(expedition, "arthur", "sprained_ankle", {
          source: expedition.paceId === "hard_push" ? "hard-push-terrain" : "terrain",
        });
        if (result.applied) events.push(result);
      }
    }
    while (expedition.exhaustionCheckDistance >= EXPEDITION_TUNING.exhaustionCheckDistance) {
      expedition.exhaustionCheckDistance -= EXPEDITION_TUNING.exhaustionCheckDistance;
      if (expedition.random() < EXPEDITION_TUNING.sparseExhaustionBaseChance * ration.exhaustionRiskMultiplier) {
        const result = this.applyToExpedition(expedition, "arthur", "exhaustion", { source: "travel-fatigue" });
        if (result.applied) events.push(result);
      }
    }
    return events;
  },
});

function normalizeInjuryInstances(value) {
  const entries = Array.isArray(value) ? value : [];
  const seen = new Set();
  return entries.map((entry) => {
    const injuryId = typeof entry === "string" ? entry : entry?.injuryId;
    if (!INJURY_DEFINITIONS[injuryId] || seen.has(injuryId)) return null;
    seen.add(injuryId);
    return createInjuryInstance(injuryId, typeof entry === "object" ? entry : {}, null);
  }).filter(Boolean).slice(0, InjuryRules.maximumActive);
}

function isDirectInjuryMap(value) {
  return Boolean(value && value.injuries === undefined
    && INJURY_CHARACTER_IDS.some((characterId) => value[characterId] !== undefined));
}

function createInjuryInstance(injuryId, metadata = {}, random = null) {
  const definition = INJURY_DEFINITIONS[injuryId];
  const range = definition?.recoveryDistanceRange;
  const midpoint = range ? (range.minimum + range.maximum) / 2 : null;
  const rolledDistance = range
    ? clampInjuryDistance(metadata.originalRecoveryDistance ?? metadata.remainingRecoveryDistance
      ?? (random ? range.minimum + random() * (range.maximum - range.minimum) : midpoint))
    : null;
  const instance = {
    injuryId,
    remainingRecoveryDistance: range
      ? clampInjuryDistance(metadata.remainingRecoveryDistance ?? rolledDistance)
      : null,
    originalRecoveryDistance: range
      ? clampInjuryDistance(metadata.originalRecoveryDistance ?? rolledDistance)
      : null,
  };
  const travelDamageInterval = Number(definition?.travelDamageInterval);
  const travelDamageAmount = Number(definition?.travelDamageAmount);
  if (Number.isFinite(travelDamageAmount) && travelDamageAmount > 0
    && Number.isFinite(travelDamageInterval) && travelDamageInterval > 0) {
    instance.travelDamageDistance = clampInjuryDistance(metadata.travelDamageDistance ?? 0);
  }
  if (injuryId === "deep_cut") {
    instance.stabilized = Boolean(metadata.stabilized);
    instance.infectionChecked = Boolean(metadata.infectionChecked);
    instance.infectionRoll = Number.isFinite(Number(metadata.infectionRoll))
      ? Number(metadata.infectionRoll)
      : random ? random() : 1;
  }
  return instance;
}

function copyInjuryInstance(instance) {
  return instance ? { ...instance } : null;
}

function removeInstance(collection, instance) {
  const index = collection.indexOf(instance);
  if (index >= 0) collection.splice(index, 1);
  return instance;
}

function randomSource(primary, fallback) {
  const source = typeof primary === "function" ? primary : fallback;
  return typeof source === "function"
    ? () => Math.min(1 - Number.EPSILON, Math.max(0, Number(source()) || 0))
    : null;
}

function clampInjuryDistance(value) {
  const number = Number(value);
  return Number.isFinite(number) ? roundInjuryDistance(Math.max(0, number)) : null;
}

function roundInjuryDistance(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function characterName(characterId) {
  if (characterId === "arthur") return PLAYER_CHARACTER_DEFINITION.name;
  return COMPANION_DEFINITIONS[characterId]?.name ?? characterId;
}
