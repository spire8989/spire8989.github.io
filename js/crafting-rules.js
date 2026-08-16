"use strict";

const CraftingRules = Object.freeze({
  durationMs(providerId, recipeOrId = null) {
    const recipe = typeof recipeOrId === "string" ? RECIPE_DEFINITIONS[recipeOrId] : recipeOrId;
    const authoredDuration = Number(recipe?.craftingDurationMs);
    if (Number.isFinite(authoredDuration) && authoredDuration > 0) return authoredDuration;
    return CRAFTING_TUNING.providerDurations[providerId] ?? CRAFTING_TUNING.defaultDurationMs;
  },

  knownRecipesForProvider(player, providerId, definitions = RECIPE_DEFINITIONS) {
    return (player.learnedRecipes ?? [])
      .map((recipeId) => definitions[recipeId])
      .filter((recipe) => recipe?.craftingProvider === providerId)
      .concat(providerId === "campfire"
        ? Object.values(definitions).filter((recipe) => (
          recipe.craftingProvider === providerId
          && recipe.starter
          && !(player.learnedRecipes ?? []).includes(recipe.id)
        ))
        : [])
      .filter((recipe, index, recipes) => recipes.findIndex((entry) => entry.id === recipe.id) === index);
  },

  quote(player, recipeId, providerId, context = {}) {
    const recipeDefinitions = context.recipeDefinitions ?? RECIPE_DEFINITIONS;
    const itemDefinitions = context.itemDefinitions ?? ITEM_DEFINITIONS;
    const recipe = recipeDefinitions[recipeId];
    const expedition = context.expedition ?? null;
    const productionContext = context.context
      ?? (expedition ? "camp" : providerId === "campfire" ? "inn" : "town");
    const item = recipe?.output?.itemId ? itemDefinitions[recipe.output.itemId] : null;
    const known = Boolean(recipe && (
      player.learnedRecipes?.includes(recipeId)
      || (providerId === "campfire" && recipe.starter === true)
    ));
    const correctProvider = Boolean(recipe && recipe.craftingProvider === providerId);
    const ingredientType = recipe?.ingredientType ?? "material";
    const ingredientStatus = Object.entries(recipe?.ingredients ?? {}).map(([ingredientId, required]) => ({
      ingredientId,
      materialId: MaterialRules.isMaterialId(ingredientId) ? ingredientId : null,
      itemId: ingredientType === "item" && !MaterialRules.isMaterialId(ingredientId) ? ingredientId : null,
      materialBag: MaterialRules.isMaterialId(ingredientId),
      required,
      owned: ingredientQuantity(player, expedition, ingredientType, ingredientId),
      sufficient: ingredientQuantity(player, expedition, ingredientType, ingredientId) >= required,
    }));
    const uniqueAlreadyOwned = Boolean(item?.unique && player.ownedItems[item.id]);
    const affordable = Boolean(recipe && player.currentGold >= recipe.goldCost);
    const validOutput = Boolean(recipe && (item || Number(recipe.output?.provisions) > 0));
    const contextValid = productionContext === "camp" ? Boolean(expedition) : productionContext === "inn" ? !expedition : true;
    const available = Boolean(recipe && validOutput && known && correctProvider && contextValid && affordable
      && !uniqueAlreadyOwned && ingredientStatus.every((entry) => entry.sufficient));
    return {
      recipeId,
      recipe,
      item,
      expedition,
      context: productionContext,
      ingredientType,
      known,
      correctProvider,
      contextValid,
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
    const materialBagConsumed = {};
    const itemsConsumed = {};
    quote.ingredientStatus.forEach(({ ingredientId, materialBag, required }) => {
      if (materialBag) {
        const consumed = consumeMaterialIngredient(player, quote.expedition, ingredientId, required);
        materialBagConsumed[ingredientId] = consumed.consumed;
      } else {
        consumeIngredient(player, quote.expedition, ingredientId, required);
        itemsConsumed[ingredientId] = required;
      }
    });
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
      context: quote.context,
      itemId,
      quantity: quantity ?? 0,
      provisions,
      goldCost: quote.recipe.goldCost,
      materialsConsumed: materialBagConsumed,
      materialBagConsumed,
      itemsConsumed,
      reason: null,
    };
    if (quote.expedition && typeof JourneyLog !== "undefined") {
      const outputMessage = provisions > 0
        ? `Cooked ${quote.recipe.name} and gained ${provisions} provisions.`
        : `Crafted ${quote.item?.name ?? quote.recipe.name}.`;
      JourneyLog.add(quote.expedition, outputMessage, {
        category: provisions > 0 ? "cooking" : "crafting",
      });
    }
    console.debug("[Crafting] craft-performed", result);
    return result;
  },
});

function craftingBlockReason(quote) {
  if (!quote.recipe || !quote.validOutput) return "invalid-recipe";
  if (!quote.known) return "recipe-unknown";
  if (!quote.correctProvider) return "wrong-provider";
  if (!quote.contextValid) return quote.context === "camp" ? "camp-requires-expedition" : "inn-requires-town";
  if (quote.uniqueAlreadyOwned) return "unique-item-owned";
  if (!quote.affordable) return "insufficient-gold";
  if (quote.ingredientStatus.some((entry) => !entry.sufficient)) return "insufficient-materials";
  return "unavailable";
}

function ingredientQuantity(player, expedition, ingredientType, ingredientId) {
  if (MaterialRules.isMaterialId(ingredientId)) {
    return expedition
      ? MaterialRules.expeditionQuantity(expedition, ingredientId)
      : player.materials?.[ingredientId] ?? 0;
  }
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

function consumeMaterialIngredient(player, expedition, materialId, quantity) {
  if (expedition) return MaterialRules.consumeFromExpedition(player, expedition, materialId, quantity);
  const available = player.materials?.[materialId] ?? 0;
  const consumed = Math.min(available, quantity);
  if (consumed > 0) {
    player.materials[materialId] -= consumed;
    if (player.materials[materialId] <= 0) delete player.materials[materialId];
  }
  return { applied: consumed >= quantity, consumed, secured: consumed, unsecured: 0 };
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
