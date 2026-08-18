"use strict";

const CraftingRules = Object.freeze({
  normalizeRecipeIngredients(recipe) {
    return normalizeRecipeIngredients(recipe);
  },

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
    const ingredients = normalizeRecipeIngredients(recipe);
    const ingredientType = recipe?.ingredientType ?? null;
    const ingredientStatus = ingredients.map(({ type, id: ingredientId, quantity: required }) => {
      const owned = ingredientQuantity(player, expedition, type, ingredientId);
      return {
        type,
        ingredientId,
        materialId: type === "material" ? ingredientId : null,
        itemId: type === "item" ? ingredientId : null,
        materialBag: type === "material",
        required,
        owned,
        sufficient: owned >= required,
      };
    });
    const uniqueAlreadyOwned = Boolean(item?.unique && player.ownedItems[item.id]);
    const affordable = Boolean(recipe && player.currentGold >= recipe.goldCost);
    const validOutput = Boolean(recipe && (item || Number(recipe.output?.provisions) > 0
      || (typeof recipe.output?.resource === "string" && Number(recipe.output?.amount) > 0)));
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
      ingredients,
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
    quote.ingredientStatus.forEach(({ type, ingredientId, required }) => {
      if (type === "material") {
        const consumed = consumeMaterialIngredient(player, quote.expedition, ingredientId, required);
        materialBagConsumed[ingredientId] = consumed.consumed;
      } else {
        const consumed = consumeIngredient(player, quote.expedition, ingredientId, required);
        if (consumed.materialBag > 0) materialBagConsumed[ingredientId] = consumed.materialBag;
        if (consumed.items > 0) itemsConsumed[ingredientId] = consumed.items;
      }
    });
    player.currentGold -= quote.recipe.goldCost;
    const { itemId, quantity, provisions = 0, resource = null, amount = 0 } = quote.recipe.output;
    if (quote.expedition && provisions > 0) {
      ExpeditionRules.adjustProvisions(quote.expedition, provisions);
    } else if (resource) {
      AbilityRules.modifyPersistentResource(player, quote.expedition, resource, amount);
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
      resource,
      amount: Number(amount) || 0,
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

function normalizeRecipeIngredients(recipe) {
  if (Array.isArray(recipe?.ingredients)) {
    return recipe.ingredients
      .filter((entry) => entry && typeof entry === "object")
      .map((entry) => ({
        type: entry.type === "item" ? "item" : "material",
        id: entry.id,
        quantity: Number(entry.quantity),
      }));
  }
  const legacyType = recipe?.ingredientType === "item" ? "item" : "material";
  return Object.entries(recipe?.ingredients ?? {}).map(([id, quantity]) => ({
    type: legacyType,
    id,
    quantity: Number(quantity),
  }));
}

function ingredientQuantity(player, expedition, ingredientType, ingredientId) {
  if (ingredientType === "material") {
    return expedition
      ? MaterialRules.expeditionQuantity(expedition, ingredientId)
      : player.materials?.[ingredientId] ?? 0;
  }
  if (expedition) {
    const direct = (expedition.carriedItems?.[ingredientId] ?? 0)
      + (expedition.unsecuredLoot ?? [])
        .filter((entry) => entry.itemId === ingredientId)
        .reduce((total, entry) => total + (Number(entry.quantity) || 0), 0);
    return direct + (legacyMaterialItem(ingredientId) ? MaterialRules.expeditionQuantity(expedition, ingredientId) : 0);
  }
  return (player.ownedItems?.[ingredientId] ?? 0)
    + (legacyMaterialItem(ingredientId) ? player.materials?.[ingredientId] ?? 0 : 0);
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
  let remaining = quantity;
  let items = 0;
  let materialBag = 0;
  if (!expedition) {
    const owned = Math.min(player.ownedItems?.[itemId] ?? 0, remaining);
    if (owned > 0) {
      player.ownedItems[itemId] -= owned;
      if (player.ownedItems[itemId] <= 0) delete player.ownedItems[itemId];
      remaining -= owned;
      items += owned;
    }
    if (remaining > 0 && legacyMaterialItem(itemId)) {
      const available = Math.min(player.materials?.[itemId] ?? 0, remaining);
      if (available > 0) {
        player.materials[itemId] -= available;
        if (player.materials[itemId] <= 0) delete player.materials[itemId];
        remaining -= available;
        materialBag += available;
      }
    }
    return { applied: remaining <= 0, consumed: quantity - remaining, items, materialBag };
  }

  const carried = Math.min(expedition.carriedItems?.[itemId] ?? 0, remaining);
  if (carried > 0) {
    ExpeditionRules.consumeCarriedItem(expedition, itemId, carried);
    remaining -= carried;
    items += carried;
  }
  if (remaining > 0) {
    for (const entry of expedition.unsecuredLoot ?? []) {
      if (entry.itemId !== itemId || remaining <= 0) continue;
      const consumed = Math.min(Number(entry.quantity) || 0, remaining);
      entry.quantity -= consumed;
      remaining -= consumed;
      items += consumed;
    }
    expedition.unsecuredLoot = (expedition.unsecuredLoot ?? []).filter((entry) => entry.quantity > 0);
  }
  if (remaining > 0 && legacyMaterialItem(itemId)) {
    const consumed = consumeMaterialIngredient(player, expedition, itemId, remaining);
    materialBag += consumed.consumed;
    remaining -= consumed.consumed;
  }
  return { applied: remaining <= 0, consumed: quantity - remaining, items, materialBag };
}

function legacyMaterialItem(itemId) {
  return ITEM_DEFINITIONS[itemId]?.category === "ingredient";
}

function addExpeditionItem(expedition, itemId, quantity) {
  const existing = expedition.unsecuredLoot?.find((entry) => entry.itemId === itemId);
  if (existing) existing.quantity += quantity;
  else expedition.unsecuredLoot.push({ itemId, quantity });
}
