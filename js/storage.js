"use strict";

const SAVE_KEY = "questForTheHolyGrail.save.v1";

const SaveSystem = Object.freeze({
  createDefaultPlayerState() {
    return {
      saveVersion: 2,
      ownedItems: {
        arthur_sword: 1,
        quilted_hauberk: 1,
        wayfarers_cloak: 1,
        silver_stag_medallion: 1,
        torch: 2,
      },
      equippedItems: {
        weapon: "arthur_sword",
        armor: "quilted_hauberk",
        utility: "wayfarers_cloak",
      },
      unlockedCompanions: ["sir_kay"],
      selectedCompanion: "sir_kay",
      learnedKnowledge: ["woodcraft"],
      completedChapters: ["chapter_01", "chapter_02"],
      bestExpeditionDistance: 0,
      currentGold: 12,
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
    const quantity = Number(savedItems[itemId]);
    if (Number.isInteger(quantity) && quantity > 0) {
      ownedItems[itemId] = quantity;
    }
  });

  // Version 2 introduced intentional starting content to pre-existing prototype saves.
  if (Number(savedState.saveVersion) < 2) {
    Object.entries(defaults.ownedItems).forEach(([itemId, quantity]) => {
      ownedItems[itemId] ??= quantity;
    });
  }

  const equippedItems = {};
  ["weapon", "armor", "utility"].forEach((slot) => {
    const itemId = savedState.equippedItems?.[slot];
    const item = ITEM_DEFINITIONS[itemId];
    if (item && item.slot === slot && ownedItems[itemId]) {
      equippedItems[slot] = itemId;
      return;
    }

    const defaultItemId = defaults.equippedItems[slot];
    if (ownedItems[defaultItemId]) {
      equippedItems[slot] = defaultItemId;
    }
  });

  const unlockedCompanions = validIdArray(
    savedState.unlockedCompanions,
    COMPANION_DEFINITIONS,
    defaults.unlockedCompanions,
  );
  const selectedCompanion = unlockedCompanions.includes(savedState.selectedCompanion)
    ? savedState.selectedCompanion
    : unlockedCompanions[0];

  return {
    saveVersion: 2,
    ownedItems,
    equippedItems,
    unlockedCompanions,
    selectedCompanion,
    learnedKnowledge: sanitizeKnowledge(savedState.learnedKnowledge, defaults.learnedKnowledge),
    completedChapters: validStringArray(savedState.completedChapters, defaults.completedChapters),
    bestExpeditionDistance: nonNegativeNumber(savedState.bestExpeditionDistance),
    currentGold: nonNegativeNumber(savedState.currentGold),
  };
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
