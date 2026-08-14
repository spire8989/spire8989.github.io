"use strict";

const CraftingRules = Object.freeze({
  knownRecipesForProvider(player, providerId) {
    return (player.learnedRecipes ?? [])
      .map((recipeId) => RECIPE_DEFINITIONS[recipeId])
      .filter((recipe) => recipe?.craftingProvider === providerId)
      .concat(providerId === "campfire"
        ? Object.values(RECIPE_DEFINITIONS).filter((recipe) => (
          recipe.craftingProvider === providerId
          && recipe.starter
          && !(player.learnedRecipes ?? []).includes(recipe.id)
        ))
        : [])
      .filter((recipe, index, recipes) => recipes.findIndex((entry) => entry.id === recipe.id) === index);
  },

  quote(player, recipeId, providerId, context = {}) {
    const recipe = RECIPE_DEFINITIONS[recipeId];
    const expedition = context.expedition ?? null;
    const item = recipe?.output?.itemId ? ITEM_DEFINITIONS[recipe.output.itemId] : null;
    const known = Boolean(recipe && (
      player.learnedRecipes?.includes(recipeId)
      || (providerId === "campfire" && recipe.starter === true)
    ));
    const correctProvider = Boolean(recipe && recipe.craftingProvider === providerId);
    const ingredientType = recipe?.ingredientType ?? "material";
    const ingredientStatus = Object.entries(recipe?.ingredients ?? {}).map(([ingredientId, required]) => ({
      ingredientId,
      materialId: ingredientType === "material" ? ingredientId : null,
      itemId: ingredientType === "item" ? ingredientId : null,
      required,
      owned: ingredientQuantity(player, expedition, ingredientType, ingredientId),
      sufficient: ingredientQuantity(player, expedition, ingredientType, ingredientId) >= required,
    }));
    const uniqueAlreadyOwned = Boolean(item?.unique && player.ownedItems[item.id]);
    const affordable = Boolean(recipe && player.currentGold >= recipe.goldCost);
    const validOutput = Boolean(recipe && (item || Number(recipe.output?.provisions) > 0));
    const available = Boolean(recipe && validOutput && known && correctProvider && affordable
      && !uniqueAlreadyOwned && ingredientStatus.every((entry) => entry.sufficient));
    return {
      recipeId,
      recipe,
      item,
      expedition,
      ingredientType,
      known,
      correctProvider,
      ingredientStatus,
      affordable,
      uniqueAlreadyOwned,
      validOutput,
      available,
    };
  },

  craft(player, recipeId, providerId, context = {}) {
    const quote = this.quote(player, recipeId, providerId, context);
    if (!quote.available) {
      return { applied: false, recipeId, reason: craftingBlockReason(quote), quote };
    }
    quote.ingredientStatus.forEach(({ materialId, required }) => {
      if (quote.ingredientType === "material") {
        player.materials[materialId] -= required;
        if (player.materials[materialId] <= 0) delete player.materials[materialId];
      }
    });
    if (quote.ingredientType === "item") {
      quote.ingredientStatus.forEach(({ itemId, required }) => {
        consumeIngredient(player, quote.expedition, itemId, required);
      });
    }
    player.currentGold -= quote.recipe.goldCost;
    const { itemId, quantity, provisions = 0 } = quote.recipe.output;
    if (quote.expedition && provisions > 0) {
      ExpeditionRules.adjustProvisions(quote.expedition, provisions);
    } else if (quote.expedition && itemId) {
      addExpeditionItem(quote.expedition, itemId, quantity);
    } else if (provisions > 0) {
      player.provisions = Math.max(0, (player.provisions ?? 0) + provisions);
    } else if (itemId) {
      player.ownedItems[itemId] = (player.ownedItems[itemId] ?? 0) + quantity;
    }
    const result = {
      applied: true,
      recipeId,
      providerId,
      itemId,
      quantity: quantity ?? 0,
      provisions,
      goldCost: quote.recipe.goldCost,
      materialsConsumed: Object.fromEntries(
        quote.ingredientStatus
          .filter(({ materialId }) => materialId)
          .map(({ materialId, required }) => [materialId, required]),
      ),
      itemsConsumed: Object.fromEntries(
        quote.ingredientStatus
          .filter(({ itemId }) => itemId)
          .map(({ itemId, required }) => [itemId, required]),
      ),
      reason: null,
    };
    console.debug("[Crafting] craft-performed", result);
    return result;
  },
});

function craftingBlockReason(quote) {
  if (!quote.recipe || !quote.validOutput) return "invalid-recipe";
  if (!quote.known) return "recipe-unknown";
  if (!quote.correctProvider) return "wrong-provider";
  if (quote.uniqueAlreadyOwned) return "unique-item-owned";
  if (!quote.affordable) return "insufficient-gold";
  if (quote.ingredientStatus.some((entry) => !entry.sufficient)) return "insufficient-materials";
  return "unavailable";
}

function ingredientQuantity(player, expedition, ingredientType, ingredientId) {
  if (ingredientType === "item") {
    if (expedition) {
      return (expedition.carriedItems?.[ingredientId] ?? 0)
        + (expedition.unsecuredLoot ?? [])
          .filter((entry) => entry.itemId === ingredientId)
          .reduce((total, entry) => total + (Number(entry.quantity) || 0), 0);
    }
    return player.ownedItems?.[ingredientId] ?? 0;
  }
  return player.materials?.[ingredientId] ?? 0;
}

function consumeIngredient(player, expedition, itemId, quantity) {
  if (!expedition) {
    player.ownedItems[itemId] = Math.max(0, (player.ownedItems[itemId] ?? 0) - quantity);
    if (player.ownedItems[itemId] <= 0) delete player.ownedItems[itemId];
    return;
  }

  let remaining = quantity;
  const carried = Math.min(expedition.carriedItems?.[itemId] ?? 0, remaining);
  if (carried > 0) {
    ExpeditionRules.consumeCarriedItem(expedition, itemId, carried);
    remaining -= carried;
  }
  if (remaining <= 0) return;
  for (const entry of expedition.unsecuredLoot ?? []) {
    if (entry.itemId !== itemId || remaining <= 0) continue;
    const consumed = Math.min(Number(entry.quantity) || 0, remaining);
    entry.quantity -= consumed;
    remaining -= consumed;
  }
  expedition.unsecuredLoot = (expedition.unsecuredLoot ?? []).filter((entry) => entry.quantity > 0);
}

function addExpeditionItem(expedition, itemId, quantity) {
  const existing = expedition.unsecuredLoot?.find((entry) => entry.itemId === itemId);
  if (existing) existing.quantity += quantity;
  else expedition.unsecuredLoot.push({ itemId, quantity });
}
