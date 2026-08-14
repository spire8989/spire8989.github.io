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
    const source = holder?.injuries ?? {};
    return Object.fromEntries(INJURY_CHARACTER_IDS.map((characterId) => [
      characterId,
      normalizeInjuryIds(source[characterId]),
    ]));
  },

  ensure(holder) {
    holder.injuries = this.snapshot(holder);
    return holder.injuries;
  },

  forCharacter(holder, characterId) {
    return normalizeInjuryIds(holder?.injuries?.[characterId]);
  },

  has(holder, characterId, injuryId) {
    return this.forCharacter(holder, characterId).includes(injuryId);
  },

  apply(holder, characterId, injuryId, metadata = {}) {
    const definition = this.definition(injuryId);
    if (!holder || !INJURY_CHARACTER_IDS.includes(characterId) || !definition) {
      return { applied: false, reason: "invalid-injury" };
    }
    this.ensure(holder);
    const current = holder.injuries[characterId];
    if (current.includes(injuryId)) return { applied: false, reason: "duplicate", injuryId, characterId };
    if (current.length >= this.maximumActive) return { applied: false, reason: "maximum-active", injuryId, characterId };
    current.push(injuryId);
    const result = {
      applied: true,
      injuryId,
      characterId,
      source: metadata.source ?? metadata.cause ?? "unknown",
      definition,
    };
    if (holder.injuryEvents) holder.injuryEvents.push({ type: "injury-gained", ...result });
    return result;
  },

  remove(holder, characterId, injuryId, metadata = {}) {
    const current = this.forCharacter(holder, characterId);
    const index = current.indexOf(injuryId);
    if (index < 0) return { applied: false, reason: "not-active", injuryId, characterId };
    holder.injuries[characterId].splice(index, 1);
    const result = {
      applied: true,
      injuryId,
      characterId,
      method: metadata.method ?? metadata.source ?? "treatment",
      definition: this.definition(injuryId),
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
    return this.forCharacter(holder, characterId).reduce((multiplier, injuryId) => (
      multiplier * (Number(this.definition(injuryId)?.effects?.[effectName]) || 1)
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

  treatmentItemFor(injuryId) {
    return this.definition(injuryId)?.treatmentItemId ?? null;
  },

  treatWithItem(player, characterId, itemId, metadata = {}) {
    const authoredTreatmentIds = ITEM_DEFINITIONS[itemId]?.effects?.treatment?.injuryIds ?? [];
    const injuryId = this.forCharacter(player, characterId)
      .find((candidate) => authoredTreatmentIds.includes(candidate) || this.treatmentItemFor(candidate) === itemId);
    if (!injuryId) return { applied: false, reason: "wrong-treatment", characterId, itemId };
    if ((player.ownedItems?.[itemId] ?? 0) < 1) return { applied: false, reason: "item-missing", characterId, itemId, injuryId };
    player.ownedItems[itemId] -= 1;
    if (player.ownedItems[itemId] <= 0) delete player.ownedItems[itemId];
    return this.remove(player, characterId, injuryId, { method: itemId, ...metadata });
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
      });
      JourneyLog.add(expedition, `${INJURY_DEFINITIONS[result.injuryId].name} affects ${characterName(result.characterId)}.`, { category: "injury" });
    }
    return result;
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

function normalizeInjuryIds(value) {
  const ids = Array.isArray(value) ? value : [];
  return [...new Set(ids.map((entry) => typeof entry === "string" ? entry : entry?.injuryId)
    .filter((injuryId) => INJURY_DEFINITIONS[injuryId]))].slice(0, InjuryRules.maximumActive);
}

function characterName(characterId) {
  if (characterId === "arthur") return PLAYER_CHARACTER_DEFINITION.name;
  return COMPANION_DEFINITIONS[characterId]?.name ?? characterId;
}
