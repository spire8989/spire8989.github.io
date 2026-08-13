"use strict";

const CraftingRules = Object.freeze({
  knownRecipesForProvider(player, providerId) {
    return (player.learnedRecipes ?? [])
      .map((recipeId) => RECIPE_DEFINITIONS[recipeId])
      .filter((recipe) => recipe?.craftingProvider === providerId);
  },

  quote(player, recipeId, providerId) {
    const recipe = RECIPE_DEFINITIONS[recipeId];
    const item = recipe ? ITEM_DEFINITIONS[recipe.output.itemId] : null;
    const known = Boolean(recipe && player.learnedRecipes?.includes(recipeId));
    const correctProvider = Boolean(recipe && recipe.craftingProvider === providerId);
    const ingredientStatus = Object.entries(recipe?.ingredients ?? {}).map(([materialId, required]) => ({
      materialId,
      required,
      owned: player.materials?.[materialId] ?? 0,
      sufficient: (player.materials?.[materialId] ?? 0) >= required,
    }));
    const uniqueAlreadyOwned = Boolean(item?.unique && player.ownedItems[item.id]);
    const affordable = Boolean(recipe && player.currentGold >= recipe.goldCost);
    const available = Boolean(recipe && item && known && correctProvider && affordable
      && !uniqueAlreadyOwned && ingredientStatus.every((entry) => entry.sufficient));
    return {
      recipeId,
      recipe,
      item,
      known,
      correctProvider,
      ingredientStatus,
      affordable,
      uniqueAlreadyOwned,
      available,
    };
  },

  craft(player, recipeId, providerId) {
    const quote = this.quote(player, recipeId, providerId);
    if (!quote.available) {
      return { applied: false, recipeId, reason: craftingBlockReason(quote), quote };
    }
    quote.ingredientStatus.forEach(({ materialId, required }) => {
      player.materials[materialId] -= required;
      if (player.materials[materialId] <= 0) delete player.materials[materialId];
    });
    player.currentGold -= quote.recipe.goldCost;
    const { itemId, quantity } = quote.recipe.output;
    player.ownedItems[itemId] = (player.ownedItems[itemId] ?? 0) + quantity;
    const result = {
      applied: true,
      recipeId,
      providerId,
      itemId,
      quantity,
      goldCost: quote.recipe.goldCost,
      materialsConsumed: Object.fromEntries(
        quote.ingredientStatus.map(({ materialId, required }) => [materialId, required]),
      ),
      reason: null,
    };
    console.debug("[Crafting] craft-performed", result);
    return result;
  },
});

function craftingBlockReason(quote) {
  if (!quote.recipe || !quote.item) return "invalid-recipe";
  if (!quote.known) return "recipe-unknown";
  if (!quote.correctProvider) return "wrong-provider";
  if (quote.uniqueAlreadyOwned) return "unique-item-owned";
  if (!quote.affordable) return "insufficient-gold";
  if (quote.ingredientStatus.some((entry) => !entry.sufficient)) return "insufficient-materials";
  return "unavailable";
}
