"use strict";

const LOOT_TABLE_MAX_DEPTH = 12;

function createRewardBucket() {
  return {
    items: [],
    materials: {},
    recipes: [],
    gold: 0,
  };
}

const LootRules = Object.freeze({
  resolveSources(sources, context) {
    const results = [];
    (sources ?? []).forEach((source) => {
      const rolls = Math.max(0, Math.floor(Number(source.rolls) || 0));
      const chance = Number.isFinite(source.chance) ? Math.max(0, Math.min(1, source.chance)) : 1;
      const sourceContext = {
        ...context,
        sourceType: source.sourceType ?? context.sourceType,
        sourceEnemyId: source.sourceEnemyId ?? context.sourceEnemyId,
        sourceEnemyInstanceIndex: source.sourceEnemyInstanceIndex ?? context.sourceEnemyInstanceIndex,
        sourceCombatId: source.sourceCombatId ?? context.sourceCombatId,
        sourceEncounterId: source.sourceEncounterId ?? context.sourceEncounterId,
        sourceChoiceId: source.sourceChoiceId ?? context.sourceChoiceId,
      };
      recordLootEvent(sourceContext, { type: "loot-source", tableId: source.tableId, rolls, chance });
      for (let roll = 0; roll < rolls; roll += 1) {
        if (lootRandom(sourceContext.random) >= chance) {
          recordLootEvent(sourceContext, { type: "loot-chance-missed", tableId: source.tableId, roll: roll + 1 });
          continue;
        }
        const result = this.resolveTable(source.tableId, sourceContext);
        if (result) results.push(result);
      }
    });
    return results;
  },

  resolveTable(tableId, context, state = {}) {
    const table = LOOT_TABLE_DEFINITIONS[tableId];
    const depth = state.depth ?? 0;
    const ancestors = state.ancestors ?? [];
    if (!table || depth >= LOOT_TABLE_MAX_DEPTH || ancestors.includes(tableId)) {
      recordLootEvent(context, {
        type: "loot-table-blocked", tableId,
        reason: !table ? "missing-table" : depth >= LOOT_TABLE_MAX_DEPTH ? "maximum-depth" : "cycle",
      });
      return null;
    }
    const nextAncestors = [...ancestors, tableId];
    const eligible = table.entries.filter((entry) => this.entryEligible(entry, context, {
      depth: depth + 1,
      ancestors: nextAncestors,
    }));
    const skipped = table.entries.length - eligible.length;
    if (skipped > 0) {
      recordLootEvent(context, { type: "loot-ineligible-skipped", tableId, count: skipped });
    }
    const selected = weightedLootChoice(eligible, context.random);
    if (!selected) {
      recordLootEvent(context, { type: "loot-table-empty", tableId });
      return null;
    }
    recordLootEvent(context, { type: "loot-selected", tableId, entry: lootEntryLabel(selected) });
    if (selected.type === "table") {
      return this.resolveTable(selected.tableId, context, {
        depth: depth + 1,
        ancestors: nextAncestors,
      });
    }
    return grantLootEntry(selected, context, tableId);
  },

  entryEligible(entry, context, state = {}) {
    if (!entry || !(Number(entry.weight) > 0)) return false;
    if (entry.type === "gold") return true;
    if (entry.type === "catch") return Boolean(MINIGAME_CATCH_DEFINITIONS[entry.catchId]);
    if (entry.type === "material") return Boolean(MATERIAL_DEFINITIONS[entry.materialId]);
    if (entry.type === "item") {
      const item = ITEM_DEFINITIONS[entry.itemId];
      if (MaterialRules.isMaterialId(entry.itemId)) return Boolean(item);
      const alreadyStaged = context.expedition?.unsecuredLoot
        ?.some((reward) => reward.itemId === entry.itemId)
        || context.rewardBucket?.items?.some((reward) => reward.itemId === entry.itemId);
      return Boolean(item && (!item.unique
        || (!context.player?.ownedItems?.[entry.itemId] && !alreadyStaged)));
    }
    if (entry.type === "recipe") {
      return Boolean(RECIPE_DEFINITIONS[entry.recipeId]
        && !context.player?.learnedRecipes?.includes(entry.recipeId)
        && !context.expedition?.unsecuredRecipes?.includes(entry.recipeId)
        && !context.rewardBucket?.recipes?.includes(entry.recipeId));
    }
    if (entry.type === "table") {
      const table = LOOT_TABLE_DEFINITIONS[entry.tableId];
      if (!table || (state.depth ?? 0) >= LOOT_TABLE_MAX_DEPTH
        || (state.ancestors ?? []).includes(entry.tableId)) return false;
      return table.entries.some((child) => this.entryEligible(child, context, {
        depth: (state.depth ?? 0) + 1,
        ancestors: [...(state.ancestors ?? []), entry.tableId],
      }));
    }
    return false;
  },

  returnRewardTier(distance) {
    const reached = Math.max(0, Number(distance) || 0);
    return [...EXPEDITION_RETURN_REWARD_TIERS]
      .reverse()
      .find((tier) => reached >= tier.minimumDistance) ?? EXPEDITION_RETURN_REWARD_TIERS[0];
  },

  awardExpeditionReturn(player, expedition) {
    if (!expedition) return [];
    if (expedition.returnRewardsRolled) {
      expedition.returnRewardContents ??= createRewardBucket();
      return expedition.returnRewardResults ?? [];
    }
    const tier = this.returnRewardTier(expedition.maxDistanceReached);
    expedition.returnRewardTier = tier.id;
    expedition.returnRewardLog ??= [];
    const rewardBucket = createRewardBucket();
    const results = this.resolveSources(tier.sources, {
      player,
      expedition,
      rewardBucket,
      random: expedition.random,
      debugLog: expedition.returnRewardLog,
    });
    expedition.returnRewardResults = results;
    expedition.returnRewardContents = rewardBucket;
    expedition.returnRewardsRolled = true;
    console.debug("[Loot] expedition-return", {
      tier: tier.id,
      maximumDistance: expedition.maxDistanceReached,
      results,
      trace: expedition.returnRewardLog,
    });
    return results;
  },
});

function grantLootEntry(entry, context, sourceTableId) {
  if (entry.type === "catch") {
    const catchDefinition = MINIGAME_CATCH_DEFINITIONS[entry.catchId];
    if (!catchDefinition) return null;
    const quantity = Number.isFinite(entry.quantity)
      ? Math.max(1, Math.floor(entry.quantity))
      : Number(catchDefinition.quantity) || 1;
    const granted = grantLootEntry({
      type: "item",
      itemId: catchDefinition.rewardItemId,
      quantity,
    }, context, sourceTableId);
    if (!granted) return null;
    const reward = {
      ...granted,
      type: "catch",
      catchId: catchDefinition.id,
      displayName: catchDefinition.name,
      description: catchDefinition.description,
      rewardItemId: catchDefinition.rewardItemId,
      sourceTableId,
    };
    recordLootEvent(context, { type: "catch-granted", ...reward });
    return reward;
  }
  const quantity = lootQuantity(entry, context.random);
  const materialId = entry.type === "material" ? entry.materialId : entry.itemId;
  const isMaterial = entry.type === "material"
    || (entry.type === "item" && MaterialRules.isMaterialId(entry.itemId));
  const reward = { type: isMaterial ? "material" : entry.type, quantity, sourceTableId, ...lootProvenance(context) };
  if (entry.type === "gold") {
    if (context.rewardBucket) context.rewardBucket.gold += quantity;
    else if (context.expedition) context.expedition.goldCarried += quantity;
    else if (context.player) context.player.currentGold += quantity;
  } else if (isMaterial) {
    reward.materialId = materialId;
    if (context.rewardBucket) {
      addQuantity(context.rewardBucket.materials, materialId, quantity);
    } else if (context.expedition) {
      const staged = MaterialRules.addUnsecured(context.expedition, materialId, quantity);
      reward.quantity = staged.accepted;
      reward.rejectedQuantity = staged.rejected;
      if (staged.rejected > 0) {
        recordLootEvent(context, {
          type: "material-capacity-rejected",
          materialId,
          quantity: staged.rejected,
          capacity: staged.capacity,
          used: staged.used,
        });
      }
    } else addQuantity(context.player.materials, materialId, quantity);
  } else if (entry.type === "item") {
    reward.itemId = entry.itemId;
    if (context.rewardBucket) addEntryQuantity(context.rewardBucket.items, "itemId", entry.itemId, quantity);
    else if (context.expedition) addEntryQuantity(context.expedition.unsecuredLoot, "itemId", entry.itemId, quantity);
    else addQuantity(context.player.ownedItems, entry.itemId, quantity);
  } else if (entry.type === "recipe") {
    reward.recipeId = entry.recipeId;
    reward.quantity = 1;
    if (context.rewardBucket) context.rewardBucket.recipes.push(entry.recipeId);
    else if (context.expedition) context.expedition.unsecuredRecipes.push(entry.recipeId);
    else if (!context.player.learnedRecipes.includes(entry.recipeId)) context.player.learnedRecipes.push(entry.recipeId);
  }
  if (context.player && !context.expedition && !context.rewardBucket
    && ["item", "material", "recipe"].includes(reward.type)) {
    reward.firstDiscovery = markPlayerContentDiscovered(context.player, reward);
  }
  recordLootEvent(context, { type: "loot-granted", ...reward });
  return reward;
}

function weightedLootChoice(entries, random) {
  const total = entries.reduce((sum, entry) => sum + Number(entry.weight), 0);
  if (!(total > 0)) return null;
  let roll = lootRandom(random) * total;
  for (const entry of entries) {
    roll -= Number(entry.weight);
    if (roll < 0) return entry;
  }
  return entries.at(-1) ?? null;
}

function lootQuantity(entry, random) {
  if (Number.isFinite(entry.quantity)) return Math.max(1, Math.floor(entry.quantity));
  const minimum = Math.max(1, Math.floor(Number(entry.minimum) || 1));
  const maximum = Math.max(minimum, Math.floor(Number(entry.maximum) || minimum));
  return minimum + Math.floor(lootRandom(random) * (maximum - minimum + 1));
}

function lootRandom(random) {
  const value = Number((typeof random === "function" ? random : GameRandom.random)());
  return Math.min(1 - Number.EPSILON, Math.max(0, Number.isFinite(value) ? value : 0));
}

function addQuantity(collection, id, quantity) {
  collection[id] = (collection[id] ?? 0) + quantity;
}

function addEntryQuantity(collection, idField, id, quantity) {
  const existing = collection.find((entry) => entry[idField] === id);
  if (existing) existing.quantity += quantity;
  else collection.push({ [idField]: id, quantity });
}

function lootEntryLabel(entry) {
  return entry.type === "table" ? `${entry.type}:${entry.tableId}`
    : entry.type === "catch" ? `${entry.type}:${entry.catchId}`
    : entry.type === "material" || (entry.type === "item" && MaterialRules.isMaterialId(entry.itemId)) ? `material:${entry.materialId ?? entry.itemId}`
      : entry.type === "item" ? `${entry.type}:${entry.itemId}`
        : entry.type === "recipe" ? `${entry.type}:${entry.recipeId}` : entry.type;
}

function lootProvenance(context) {
  return Object.fromEntries([
    ["sourceType", context.sourceType],
    ["sourceEnemyId", context.sourceEnemyId],
    ["sourceEnemyInstanceIndex", context.sourceEnemyInstanceIndex],
    ["sourceCombatId", context.sourceCombatId],
    ["sourceEncounterId", context.sourceEncounterId],
    ["sourceChoiceId", context.sourceChoiceId],
  ].filter(([, value]) => value !== undefined && value !== null));
}

function recordLootEvent(context, event) {
  context.debugLog?.push({ ...lootProvenance(context), ...event });
}
