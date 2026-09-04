"use strict";

const SAVE_KEY = "questForTheHolyGrail.save.v1";

// Authored defaults for a new campaign. Runtime-derived state such as current
// health, companion health, and injury snapshots is still created below from
// the live character and rules definitions.
const STARTING_PLAYER_STATE = Object.freeze({
  saveVersion: 12,
  faith: 10,
  maxFaith: 10,
  learnedAbilityIds: ["guard_break"],
  selectedActiveAbilityIds: ["guard_break"],
  selectedPassiveAbilityIds: [],
  ownedItems: {
    arthur_sword: 1,
    quilted_hauberk: 1,
    silver_stag_medallion: 1,
    torch: 1,
    healing_poultice: 1
  },
  equippedItems: {
    weapon: "arthur_sword",
    armor: "quilted_hauberk",
    relic: "silver_stag_medallion",
  },
  packedItems: ["torch", "healing_poultice"],
  materials: {
    cloth: 2,
    fresh_herbs: 1
  },
  packedMaterials: {
    fresh_herbs: 1,
    cloth: 2
  },
  learnedRecipes: ["bandages", "repair_kit", "roasted_meat", "royal_feast"],
  unlockedCompanions: ["sir_kay"],
  selectedCompanions: ["sir_kay"],
  selectedCompanion: "sir_kay",
  selectedExpeditionId: "old_forest_road",
  campaignFlags: {
    broceliande_intro_complete: false,
    forest_village_discovered: false,
    hostile_stag_defeated: false,
    verdant_warden_defeated: false,
    white_hart_shard_secured: false,
    druid_favor_offered: false,
    druid_favor_complete: false,
  },
  learnedKnowledge: [],
  discoveredContent: [],
  completedChapters: ["chapter_01", "chapter_02"],
  bestExpeditionDistance: 0,
  currentGold: 12,
  provisions: 24,
  currentLocationId: "broceliande_village",
});

const SaveSystem = Object.freeze({
  createDefaultPlayerState() {
    const authoredDefaults = JSON.parse(JSON.stringify(STARTING_PLAYER_STATE));
    return {
      ...authoredDefaults,
      arthurHealth: PLAYER_CHARACTER_DEFINITION.combat.maxHp,
      companionStates: Object.fromEntries(Object.values(COMPANION_DEFINITIONS).map((companion) => [
        companion.id,
        { health: companion.combat?.maxHp ?? 0 },
      ])),
      injuries: InjuryRules.snapshot({}),
      currentLocationId: "broceliande_village",
    };
  },

  load() {
    const defaults = this.createDefaultPlayerState();

    try {
      const serializedSave = localStorage.getItem(SAVE_KEY);
      if (!serializedSave) {
        return defaults;
      }

      return sanitizePlayerState(JSON.parse(serializedSave), defaults);
    } catch (error) {
      console.warn("The local save could not be loaded; using a fresh save.", error);
      return defaults;
    }
  },

  save(playerState) {
    try {
      if (typeof EquipmentRules !== "undefined"
        && typeof EquipmentRules.normalizeEquipmentCompatibility === "function") {
        EquipmentRules.normalizeEquipmentCompatibility(playerState);
      }
      localStorage.setItem(SAVE_KEY, JSON.stringify(playerState));
      return true;
    } catch (error) {
      console.warn("The browser could not save progress.", error);
      return false;
    }
  },

  reset() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch (error) {
      console.warn("The browser could not remove the local save.", error);
    }

    return this.createDefaultPlayerState();
  },
});

function sanitizePlayerState(savedState, defaults) {
  if (!savedState || typeof savedState !== "object") {
    return defaults;
  }

  const ownedItems = {};
  const savedItems = savedState.ownedItems ?? {};
  Object.keys(ITEM_DEFINITIONS).forEach((itemId) => {
    if (MaterialRules.isMaterialId(itemId)) return;
    const quantity = Number(savedItems[itemId]);
    if (Number.isInteger(quantity) && quantity > 0) {
      ownedItems[itemId] = quantity;
    }
  });

  // Version 3 introduced the default pack and its Rope to pre-existing prototype saves.
  if (Number(savedState.saveVersion) < 3) {
    Object.entries(defaults.ownedItems).forEach(([itemId, quantity]) => {
      ownedItems[itemId] ??= quantity;
    });
  }

  const equippedItems = {};
  const equipmentSlots = typeof EquipmentRules !== "undefined"
    && typeof EquipmentRules.supportedSlots === "function"
    ? EquipmentRules.supportedSlots()
    : ["armor", "relic", "shield", "weapon"];
  equipmentSlots.forEach((slot) => {
    const legacyRelic = slot === "relic" && savedState.equippedItems?.utility === "silver_stag_medallion"
      ? "silver_stag_medallion"
      : null;
    const itemId = savedState.equippedItems?.[slot] ?? legacyRelic;
    const item = ITEM_DEFINITIONS[itemId];
    if (item && item.equipmentSlot === slot && ownedItems[itemId]) {
      equippedItems[slot] = itemId;
      return;
    }

    const defaultItemId = defaults.equippedItems[slot];
    if (ownedItems[defaultItemId]) {
      equippedItems[slot] = defaultItemId;
    }
  });
  if (typeof EquipmentRules !== "undefined"
    && typeof EquipmentRules.normalizeEquipmentCompatibility === "function") {
    EquipmentRules.normalizeEquipmentCompatibility({ equippedItems });
  }

  const unlockedCompanions = validIdArray(
    savedState.unlockedCompanions,
    COMPANION_DEFINITIONS,
    defaults.unlockedCompanions,
  );
  const selectedCompanions = sanitizeSelectedCompanions(savedState, unlockedCompanions, defaults);
  const selectedCompanion = selectedCompanions[0] ?? null;
  const materials = sanitizeMaterials(savedState.materials, savedItems);
  const packedItems = sanitizePackedItems(savedState, ownedItems, equippedItems, defaults.packedItems);
  const packedMaterials = sanitizePackedMaterials(
    savedState, materials, defaults.packedMaterials, savedItems, selectedCompanions,
  );
  const injuries = InjuryRules.snapshot({ injuries: savedState.injuries ?? defaults.injuries });
  const campaignFlags = sanitizeCampaignFlags(savedState.campaignFlags, savedState, defaults);
  const selectedExpeditionId = EXPEDITION_DEFINITIONS[savedState.selectedExpeditionId]
    ? savedState.selectedExpeditionId
    : defaults.selectedExpeditionId;
  const maxFaith = sanitizeMaximumResource(savedState.maxFaith, defaults.maxFaith);
  const learnedAbilityIds = AbilityRules.sanitizeLearned(
    savedState.learnedAbilityIds,
    defaults.learnedAbilityIds,
  );
  const selectedActiveAbilityIds = AbilityRules.sanitizeLoadout(
    savedState.selectedActiveAbilityIds,
    learnedAbilityIds,
    "active",
  );
  const selectedPassiveAbilityIds = AbilityRules.sanitizeLoadout(
    savedState.selectedPassiveAbilityIds,
    learnedAbilityIds,
    "passive",
  );

  return {
    saveVersion: 12,
    faith: sanitizeResource(savedState.faith, defaults.faith, maxFaith),
    maxFaith,
    learnedAbilityIds,
    selectedActiveAbilityIds,
    selectedPassiveAbilityIds,
    ownedItems,
    equippedItems,
    packedItems,
    materials,
    packedMaterials,
    learnedRecipes: sanitizeRecipeIds(savedState.learnedRecipes, defaults.learnedRecipes),
    unlockedCompanions,
    selectedCompanions,
    selectedCompanion,
    selectedExpeditionId,
    campaignFlags,
    learnedKnowledge: sanitizeKnowledge(savedState.learnedKnowledge, defaults.learnedKnowledge),
    discoveredContent: sanitizeDiscoveredContent(savedState.discoveredContent, defaults.discoveredContent),
    completedChapters: validStringArray(savedState.completedChapters, defaults.completedChapters),
    bestExpeditionDistance: nonNegativeNumber(savedState.bestExpeditionDistance),
    currentGold: nonNegativeNumber(savedState.currentGold),
    provisions: Number.isFinite(Number(savedState.provisions))
      ? Math.max(0, Math.floor(Number(savedState.provisions)))
      : defaults.provisions,
    arthurHealth: sanitizeHealth(
      savedState.arthurHealth,
      PLAYER_CHARACTER_DEFINITION.combat.maxHp,
      defaults.arthurHealth,
    ),
    companionStates: sanitizeCompanionStates(savedState.companionStates, defaults.companionStates),
    injuries,
    currentLocationId: LOCATION_DEFINITIONS[savedState.currentLocationId]
      ? savedState.currentLocationId
      : defaults.currentLocationId,
  };
}

function discoveryKeyForReward(reward) {
  if (!reward?.type) return null;
  const id = reward.itemId ?? reward.materialId ?? reward.recipeId ?? reward.abilityId ?? reward.knowledgeId;
  return typeof id === "string" && id ? `${reward.type}:${id}` : null;
}

function sanitizeDiscoveredContent(value, fallback = []) {
  const source = Array.isArray(value) ? value : fallback;
  return [...new Set(source.filter((entry) => typeof entry === "string" && entry.includes(":")))];
}

function hasDiscoveredContent(player, reward) {
  const key = discoveryKeyForReward(reward);
  return Boolean(key && Array.isArray(player?.discoveredContent) && player.discoveredContent.includes(key));
}

function markPlayerContentDiscovered(player, reward) {
  const key = discoveryKeyForReward(reward);
  if (!player || !key) return false;
  player.discoveredContent = sanitizeDiscoveredContent(player.discoveredContent);
  if (player.discoveredContent.includes(key)) return false;
  player.discoveredContent.push(key);
  return true;
}

function sanitizeMaterials(value, legacyItems = {}) {
  const materials = {};
  const source = { ...(value ?? {}) };
  Object.entries(legacyItems).forEach(([itemId, quantity]) => {
    if (MaterialRules.isMaterialId(itemId)) {
      source[itemId] = (Number(source[itemId]) || 0) + (Number(quantity) || 0);
    }
  });
  Object.keys(source).forEach((materialId) => {
    if (!MaterialRules.isMaterialId(materialId)) return;
    const quantity = Number(source[materialId]);
    if (Number.isInteger(quantity) && quantity > 0) materials[materialId] = quantity;
  });
  return materials;
}

function sanitizeRecipeIds(value, fallback) {
  const source = Array.isArray(value) ? value : fallback;
  return [...new Set(source.filter((recipeId) => RECIPE_DEFINITIONS[recipeId]))];
}

function sanitizeSelectedCompanions(savedState, unlockedCompanions, defaults) {
  const legacyValue = savedState.selectedCompanion;
  const requested = legacyValue === null
    ? []
    : Array.isArray(savedState.selectedCompanions)
    ? savedState.selectedCompanions
    : legacyValue ? [legacyValue] : defaults.selectedCompanions;
  return [...new Set(requested
    .filter((companionId) => unlockedCompanions.includes(companionId)))]
    .slice(0, 2);
}

function sanitizeCampaignFlags(value, savedState, defaults) {
  const flags = {};
  Object.entries(value ?? {}).forEach(([flag, enabled]) => {
    if (typeof flag === "string" && typeof enabled === "boolean") flags[flag] = enabled;
  });
  // Saves from the one-route prototype already represent an established
  // Brocéliande campaign. Only brand-new current saves see the Hall intro.
  if (Number(savedState.saveVersion) < 8 && meaningfulLegacyProgress(savedState, defaults)) {
    flags.broceliande_intro_complete = true;
  }
  Object.entries(defaults.campaignFlags ?? {}).forEach(([flag, enabled]) => {
    flags[flag] ??= Boolean(enabled);
  });
  return flags;
}

function meaningfulLegacyProgress(savedState, defaults) {
  return Number(savedState.saveVersion) >= 7
    || Number(savedState.bestExpeditionDistance) > 0
    || Number(savedState.currentGold) !== Number(defaults.currentGold)
    || Number(savedState.provisions) !== Number(defaults.provisions)
    || (savedState.ownedItems && Object.keys(savedState.ownedItems).length > 0);
}

function sanitizePackedItems(savedState, ownedItems, equippedItems, fallback) {
  const requestedItems = Array.isArray(savedState.packedItems)
    ? savedState.packedItems
    : [savedState.equippedItems?.utility, ...fallback];
  return [...new Set(requestedItems)]
    .filter((itemId) => itemId
      && ownedItems[itemId]
      && ITEM_DEFINITIONS[itemId]?.carriable
      && !MaterialRules.isMaterialId(itemId)
      && !Object.values(equippedItems).includes(itemId))
    .slice(0, EXPEDITION_TUNING.packSlots);
}

function sanitizePackedMaterials(savedState, materials, fallback, legacyItems = {}, selectedCompanions = []) {
  let requested = savedState.packedMaterials;
  if (requested === undefined) {
    requested = Object.fromEntries((savedState.packedItems ?? [])
      .filter((materialId) => MaterialRules.isMaterialId(materialId))
      .map((materialId) => [materialId, legacyItems[materialId] ?? materials[materialId] ?? 1]));
  }
  if (requested === undefined || Object.keys(requested).length === 0) requested = fallback;
  const result = {};
  let remaining = MaterialRules.capacity(PLAYER_CHARACTER_DEFINITION, selectedCompanions);
  Object.entries(requested ?? {}).forEach(([materialId, quantity]) => {
    if (!MaterialRules.isMaterialId(materialId) || remaining <= 0) return;
    const accepted = Math.min(
      Math.max(0, Math.floor(Number(quantity) || 0)),
      Math.max(0, Math.floor(Number(materials[materialId]) || 0)),
      remaining,
    );
    if (accepted > 0) {
      result[materialId] = accepted;
      remaining -= accepted;
    }
  });
  return result;
}

function validIdArray(value, definitions, fallback) {
  if (!Array.isArray(value)) {
    return [...fallback];
  }

  const validIds = [...new Set(value.filter((id) => definitions[id]))];
  return validIds.length > 0 ? validIds : [...fallback];
}

function validStringArray(value, fallback) {
  return Array.isArray(value)
    ? [...new Set(value.filter((entry) => typeof entry === "string"))]
    : [...fallback];
}

function sanitizeKnowledge(value, fallback) {
  const migratedIds = Array.isArray(value)
    ? value.map((knowledgeId) => knowledgeId === "forest_road_lore" ? "woodcraft" : knowledgeId)
    : fallback;
  const validIds = [...new Set(migratedIds.filter((knowledgeId) => KNOWLEDGE_DEFINITIONS[knowledgeId]))];
  return validIds.length > 0 ? validIds : [...fallback];
}

function nonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function sanitizeHealth(value, maximum, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(Math.max(number, 0), maximum) : fallback;
}

function sanitizeResource(value, fallback, maximum) {
  const amount = Number(value);
  const cap = Math.max(0, Number(maximum) || 0);
  return Number.isFinite(amount) ? Math.min(Math.max(0, Math.floor(amount)), cap) : fallback;
}

function sanitizeMaximumResource(value, fallback) {
  const maximum = Number(value);
  return Number.isFinite(maximum) && maximum >= 0 ? Math.floor(maximum) : fallback;
}

function sanitizeCompanionStates(value, fallback) {
  return Object.fromEntries(Object.values(COMPANION_DEFINITIONS).map((companion) => [
    companion.id,
    {
      health: sanitizeHealth(
        value?.[companion.id]?.health,
        companion.combat?.maxHp ?? 0,
        fallback?.[companion.id]?.health ?? companion.combat?.maxHp ?? 0,
      ),
    },
  ]));
}
