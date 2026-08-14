"use strict";

const SAVE_KEY = "questForTheHolyGrail.save.v1";

const SaveSystem = Object.freeze({
  createDefaultPlayerState() {
    return {
      saveVersion: 9,
      ownedItems: {
        arthur_sword: 1,
        quilted_hauberk: 1,
        wayfarers_cloak: 1,
        rope: 1,
        silver_stag_medallion: 1,
        torch: 2,
      },
      equippedItems: {
        weapon: "arthur_sword",
        armor: "quilted_hauberk",
        relic: "silver_stag_medallion",
      },
      packedItems: ["wayfarers_cloak", "rope", "torch"],
      materials: {
        medicinal_herbs: 2,
        cloth: 3,
        leather: 1,
        iron: 2,
        wood: 1,
        raw_meat: 2,
        wild_berries: 1,
        mushrooms: 1,
        fresh_herbs: 1,
        honey: 1,
      },
      packedMaterials: {
        raw_meat: 2,
        wild_berries: 1,
        mushrooms: 1,
        fresh_herbs: 1,
        honey: 1,
        medicinal_herbs: 2,
        cloth: 2,
      },
      learnedRecipes: ["bandages", "repair_kit", "roasted_meat", "foraged_meal", "hunters_stew", "honeyed_berries"],
      unlockedCompanions: ["sir_kay"],
      selectedCompanions: ["sir_kay"],
      selectedCompanion: "sir_kay",
      selectedExpeditionId: "old_forest_road",
      campaignFlags: { broceliande_intro_complete: false },
      learnedKnowledge: ["woodcraft"],
      completedChapters: ["chapter_01", "chapter_02"],
      bestExpeditionDistance: 0,
      currentGold: 12,
      provisions: 24,
      arthurHealth: PLAYER_CHARACTER_DEFINITION.combat.maxHp,
      companionStates: Object.fromEntries(Object.values(COMPANION_DEFINITIONS).map((companion) => [
        companion.id,
        { health: companion.combat?.maxHp ?? 0 },
      ])),
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
  ["weapon", "armor", "relic"].forEach((slot) => {
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

  const materials = sanitizeMaterials(savedState.materials, savedItems);
  const packedItems = sanitizePackedItems(savedState, ownedItems, equippedItems, defaults.packedItems);
  const packedMaterials = sanitizePackedMaterials(savedState, materials, defaults.packedMaterials, savedItems);

  const unlockedCompanions = validIdArray(
    savedState.unlockedCompanions,
    COMPANION_DEFINITIONS,
    defaults.unlockedCompanions,
  );
  const selectedCompanions = sanitizeSelectedCompanions(savedState, unlockedCompanions, defaults);
  const selectedCompanion = selectedCompanions[0] ?? null;
  const campaignFlags = sanitizeCampaignFlags(savedState.campaignFlags, savedState, defaults);
  const selectedExpeditionId = EXPEDITION_DEFINITIONS[savedState.selectedExpeditionId]
    ? savedState.selectedExpeditionId
    : defaults.selectedExpeditionId;

  return {
    saveVersion: 9,
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
    currentLocationId: LOCATION_DEFINITIONS[savedState.currentLocationId]
      ? savedState.currentLocationId
      : defaults.currentLocationId,
  };
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
  flags.broceliande_intro_complete ??= Boolean(defaults.campaignFlags?.broceliande_intro_complete);
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

function sanitizePackedMaterials(savedState, materials, fallback, legacyItems = {}) {
  let requested = savedState.packedMaterials;
  if (requested === undefined) {
    requested = Object.fromEntries((savedState.packedItems ?? [])
      .filter((materialId) => MaterialRules.isMaterialId(materialId))
      .map((materialId) => [materialId, legacyItems[materialId] ?? materials[materialId] ?? 1]));
  }
  if (requested === undefined || Object.keys(requested).length === 0) requested = fallback;
  const result = {};
  let remaining = EXPEDITION_TUNING.materialBagCapacity;
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
