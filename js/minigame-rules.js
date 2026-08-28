"use strict";

function minigameRandom(random) {
  const value = Number((typeof random === "function" ? random : Math.random)());
  return Math.min(1 - Number.EPSILON, Math.max(0, Number.isFinite(value) ? value : 0));
}

function minigameClamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, Number(value) || 0));
}

function minigameRandomBetween(minimum, maximum, random) {
  const low = Number(minimum) || 0;
  const high = Math.max(low, Number(maximum) || low);
  return low + minigameRandom(random) * (high - low);
}

function fishingCastBounds(definition) {
  return {
    ...FISHING_CAST_BOUNDS,
    ...(definition?.castBounds ?? {}),
  };
}

function fishingWaterDefinition(definition, hotspot) {
  return {
    ...definition.defaultWater,
    ...(hotspot ?? {}),
  };
}

function hotspotMatches(hotspot, x, y) {
  const dx = Number(x) - Number(hotspot.x);
  const dy = Number(y) - Number(hotspot.y);
  return dx * dx + dy * dy <= Number(hotspot.radius) ** 2;
}

function fishingHotspot(definition, x, y) {
  const matches = (definition?.hotspots ?? [])
    .map((hotspot, authoredIndex) => ({ hotspot, authoredIndex }))
    .filter(({ hotspot }) => hotspotMatches(hotspot, x, y))
    .sort((left, right) => (
      Number(right.hotspot.priority ?? 0) - Number(left.hotspot.priority ?? 0)
      || left.authoredIndex - right.authoredIndex
    ));
  if (matches.length > 0) return matches[0].hotspot;
  return {
    id: "default_water",
    name: "Open Water",
    isDefault: true,
    ...definition.defaultWater,
  };
}

function fishingLandingPosition(definition, x, power) {
  const bounds = fishingCastBounds(definition);
  const normalizedPower = minigameClamp(power, 0, 1);
  return {
    x: minigameClamp(x, bounds.minX, bounds.maxX),
    y: bounds.nearWaterY + (bounds.farWaterY - bounds.nearWaterY) * normalizedPower,
  };
}

function fishingRewardMessage(reward) {
  if (!reward || Number(reward.quantity) <= 0) return "";
  const quantity = reward.quantity === 1 ? "" : ` ×${reward.quantity}`;
  if (reward.type === "catch") return `Caught ${reward.displayName}${quantity}.`;
  if (reward.type === "material") {
    return `Collected ${MaterialRules.definition(reward.materialId).name ?? reward.materialId}${quantity}.`;
  }
  if (reward.type === "item") {
    return `Found ${ITEM_DEFINITIONS[reward.itemId]?.name ?? reward.itemId}${quantity}.`;
  }
  return "";
}

const MinigameRules = Object.freeze({
  clamp: minigameClamp,

  validateDefinition(definition) {
    const errors = [];
    if (!definition || definition.type !== "fishing") return ["A fishing minigame definition is required."];
    if (!Number.isInteger(definition.attemptLimit) || definition.attemptLimit <= 0) {
      errors.push("Fishing attemptLimit must be a positive integer.");
    }
    if (definition.timeLimitSeconds !== null
      && (!Number.isFinite(definition.timeLimitSeconds) || definition.timeLimitSeconds <= 0)) {
      errors.push("Fishing timeLimitSeconds must be null or a positive number.");
    }
    const bounds = fishingCastBounds(definition);
    ["minX", "maxX", "nearWaterY", "farWaterY"].forEach((field) => {
      if (!Number.isFinite(bounds[field]) || bounds[field] < 0 || bounds[field] > 1) {
        errors.push(`Fishing castBounds.${field} must be between 0 and 1.`);
      }
    });
    if (bounds.minX > bounds.maxX) errors.push("Fishing castBounds minX cannot exceed maxX.");
    if (!definition.defaultWater || typeof definition.defaultWater !== "object") {
      errors.push("Fishing defaultWater must be an object.");
    }
    const hotspots = Array.isArray(definition.hotspots) ? definition.hotspots : [];
    const ids = new Set();
    hotspots.forEach((hotspot) => {
      if (!hotspot || !hotspot.id || ids.has(hotspot.id)) errors.push("Fishing hotspot IDs must be unique and non-empty.");
      ids.add(hotspot?.id);
      ["x", "y", "radius"].forEach((field) => {
        if (!Number.isFinite(hotspot?.[field]) || hotspot[field] < 0 || hotspot[field] > 1) {
          errors.push(`Fishing hotspot ${hotspot?.id ?? "(unknown)"} ${field} must be between 0 and 1.`);
        }
      });
      if (!(Number(hotspot?.radius) > 0)) errors.push(`Fishing hotspot ${hotspot?.id ?? "(unknown)"} needs a radius.`);
    });
    [definition.defaultWater, ...hotspots].forEach((water, index) => {
      const label = index === 0 ? "defaultWater" : `hotspot ${hotspots[index - 1]?.id ?? "(unknown)"}`;
      if (!Number.isFinite(water?.biteChance) || water.biteChance < 0 || water.biteChance > 1) {
        errors.push(`Fishing ${label} biteChance must be between 0 and 1.`);
      }
      if (!Number.isFinite(water?.biteDelayMin) || !Number.isFinite(water?.biteDelayMax)
        || water.biteDelayMin < 0 || water.biteDelayMin > water.biteDelayMax) {
        errors.push(`Fishing ${label} bite delay range is invalid.`);
      }
      if (!Number.isFinite(water?.hookWindowMs)
        || water.hookWindowMs < 500 || water.hookWindowMs > 900) {
        errors.push(`Fishing ${label} hookWindowMs must be between 500 and 900 milliseconds.`);
      }
      if (water?.hookSuccessChance !== undefined
        && (!Number.isFinite(water.hookSuccessChance)
          || water.hookSuccessChance < 0 || water.hookSuccessChance > 1)) {
        errors.push(`Fishing ${label} hookSuccessChance must be between 0 and 1.`);
      }
      if (!water?.lootTableId || !LOOT_TABLE_DEFINITIONS[water.lootTableId]) {
        errors.push(`Fishing ${label} needs a known lootTableId.`);
      }
    });
    return errors;
  },

  fishingHotspot,

  landingPosition: fishingLandingPosition,

  createFishingSession(definition, context = {}) {
    return {
      type: "fishing",
      minigameId: definition.id,
      definitionId: definition.id,
      contextId: context.contextId ?? null,
      state: "aim",
      castsRemaining: definition.attemptLimit,
      casts: [],
      activeCast: null,
      selectedX: 0.5,
      power: 0,
      chargeDirection: 1,
      elapsedSeconds: 0,
      lastResult: null,
      messages: [],
      rewards: [],
    };
  },

  beginFishingCast(session, definition, { x, power, random } = {}) {
    if (!session || !["aim", "charging"].includes(session.state) || session.castsRemaining <= 0) return null;
    const landing = fishingLandingPosition(definition, x, power);
    const hotspot = fishingHotspot(definition, landing.x, landing.y);
    const water = fishingWaterDefinition(definition, hotspot);
    const timedMode = Number.isFinite(definition.timeLimitSeconds)
      && definition.timeLimitSeconds > 0;
    const biteRoll = minigameRandom(random);
    // Limited-cast Fishing always gives the player a real bite opportunity.
    // biteChance remains authored for timed mode and future nibble behavior.
    const biteOccurs = timedMode ? biteRoll < Number(water.biteChance) : true;
    const activeCast = {
      castNumber: definition.attemptLimit - session.castsRemaining + 1,
      aimX: landing.x,
      power: minigameClamp(power, 0, 1),
      landing,
      hotspotId: hotspot.id,
      hotspotName: hotspot.name ?? "Open Water",
      biteOccurs,
      timedMode,
      water: {
        biteChance: water.biteChance,
        biteDelayMin: water.biteDelayMin,
        biteDelayMax: water.biteDelayMax,
        hookWindowMs: water.hookWindowMs,
        hookSuccessChance: water.hookSuccessChance,
        lootTableId: water.lootTableId,
      },
      waitMs: minigameRandomBetween(water.biteDelayMin, water.biteDelayMax, random) * 1000,
      remainingMs: 0,
      hooked: false,
    };
    activeCast.remainingMs = activeCast.waitMs;
    session.activeCast = activeCast;
    session.selectedX = landing.x;
    session.power = minigameClamp(power, 0, 1);
    session.state = "waiting";
    return activeCast;
  },

  resolveFishingCast(session, definition, { hooked = false, player, expedition, random } = {}) {
    if (!session || !["waiting", "hook"].includes(session.state) || !session.activeCast) return null;
    const cast = session.activeCast;
    const successfulHook = Boolean(hooked && cast.biteOccurs);
    let rewards = [];
    let messages = [];
    let reward = null;
    let catchReward = null;
    if (successfulHook) {
      const results = LootRules.resolveSources([{ tableId: cast.water.lootTableId, rolls: 1 }], {
        player,
        expedition,
        random,
        debugLog: expedition?.lootDebugLog,
        sourceType: "minigame",
        sourceEncounterId: expedition?.activeEncounter?.encounterId,
        sourceChoiceId: expedition?.activeEncounter?.lastChoiceId,
      });
      reward = results[0] ?? null;
      catchReward = reward?.type === "catch" ? reward : null;
      rewards = results.filter((reward) => Number(reward.quantity) > 0 || reward.type === "recipe");
      messages = rewards.map(fishingRewardMessage).filter(Boolean);
    }
    const result = {
      castNumber: cast.castNumber,
      landing: cast.landing,
      hotspotId: cast.hotspotId,
      hotspotName: cast.hotspotName,
      power: cast.power,
      biteOccurred: cast.biteOccurs,
      hooked: successfulHook,
      missed: !successfulHook,
      reward,
      catch: catchReward,
      rewards,
      messages,
    };
    session.casts.push(result);
    session.castsRemaining = Math.max(0, session.castsRemaining - 1);
    session.activeCast = null;
    session.lastResult = result;
    session.messages.push(...messages);
    session.rewards.push(...rewards);
    session.state = session.castsRemaining > 0 ? "result" : "summary";
    return result;
  },

  simulateFishing(definition, context = {}) {
    const random = context.random;
    const strategyName = context.strategyName ?? "normal";
    const session = this.createFishingSession(definition, context);
    const events = [{ type: "minigame-start", minigameId: definition.id }];
    while (session.castsRemaining > 0) {
      const hotspots = definition.hotspots ?? [];
      let target = null;
      if (hotspots.length > 0) {
        if (strategyName === "random" || strategyName === "normal") {
          target = hotspots[Math.floor(minigameRandom(random) * hotspots.length)];
        } else if (strategyName === "cautious") {
          target = hotspots.slice().sort((left, right) => (
            Number(right.biteChance ?? definition.defaultWater.biteChance)
              - Number(left.biteChance ?? definition.defaultWater.biteChance)
            || Number(right.priority ?? 0) - Number(left.priority ?? 0)
          ))[0];
        } else {
          target = hotspots.slice().sort((left, right) => (
            Number(right.priority ?? 0) - Number(left.priority ?? 0)
            || Number(right.biteChance ?? 0) - Number(left.biteChance ?? 0)
          ))[0];
        }
      }
      const aimX = target?.x ?? 0.5;
      const power = target
        ? minigameClamp((target.y - fishingCastBounds(definition).nearWaterY)
          / (fishingCastBounds(definition).farWaterY - fishingCastBounds(definition).nearWaterY), 0, 1)
        : 0.5;
      const cast = this.beginFishingCast(session, definition, { x: aimX, power, random });
      if (!cast) break;
      events.push({
        type: "fishing-cast",
        castNumber: cast.castNumber,
        hotspotId: cast.hotspotId,
        landing: cast.landing,
      });
      const hookRoll = minigameRandom(random);
      const hooked = cast.biteOccurs && hookRoll < Number(cast.water.hookSuccessChance ?? 0.84);
      const result = this.resolveFishingCast(session, definition, {
        hooked,
        player: context.player,
        expedition: context.expedition,
        random,
      });
      if (!result) break;
      events.push({
        type: result.hooked ? "fishing-catch" : "fishing-miss",
        castNumber: result.castNumber,
        hotspotId: result.hotspotId,
        ...(result.catch ? { catchId: result.catch.catchId } : {}),
      });
      if (session.castsRemaining > 0) session.state = "aim";
    }
    events.push({
      type: "minigame-end",
      minigameId: definition.id,
      casts: session.casts.length,
      catches: session.casts.filter((cast) => cast.catch).length,
    });
    return {
      state: session.state,
      session,
      events,
      messages: session.messages,
      rewards: session.rewards,
      casts: session.casts,
    };
  },
});
