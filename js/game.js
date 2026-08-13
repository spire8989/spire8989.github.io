"use strict";

// Add ?debug=1 to the URL to expose temporary encounter testing controls.
const DEBUG_ENCOUNTERS_ENABLED = new URLSearchParams(window.location.search).has("debug");

const game = {
  player: SaveSystem.load(),
  expedition: null,
  screen: "campaign",
  preparationSupplies: 18,
  // Retained as a compatibility field for older runtime callers; preparation
  // is now always the unified expedition setup screen.
  preparationMode: "expedition",
  activeDestinationId: null,
  shopTab: "buy",
  provisionShopStock: createProvisionShopStock(),
  itemShopStock: createItemShopStock(),
  dialogueMessage: "",
  summary: null,
  elapsedSeconds: 0,
  lastTimestamp: null,
  hudAccumulator: 0,
};

const ui = {
  screenRoot: document.querySelector("#screen-root"),
  saveStatus: document.querySelector("#save-status"),
};

let pendingEncounterActionTimer = null;

function initializeGame() {
  if (!ui.screenRoot || !ui.saveStatus) {
    throw new Error("Required game UI elements were not found.");
  }

  document.addEventListener("click", handleAction);
  document.addEventListener("pointerdown", showPressedState);
  document.addEventListener("pointerup", clearPressedState);
  document.addEventListener("pointercancel", clearPressedState);
  renderScreen();
  requestAnimationFrame(gameLoop);
}

function handleAction(event) {
  const control = event.target.closest("[data-action]");
  if (!control || control.disabled) {
    return;
  }

  const { action, itemId, recipeId, companionId, choiceId, destinationId } = control.dataset;

  switch (action) {
    case "show-campaign":
      if (!game.expedition || game.expedition.status !== "active") {
        showScreen("campaign");
      }
      break;
    case "enter-location":
      enterLocation(control.dataset.locationId);
      break;
    case "show-location":
      showLocation();
      break;
    case "open-destination":
      openDestination(destinationId);
      break;
    case "npc-talk":
      showNpcDialogue(control.dataset.npcId, "dialogue");
      break;
    case "hear-rumor":
      showNpcDialogue(control.dataset.npcId, "rumors");
      break;
    case "rest-at-inn":
      restAtInn();
      break;
    case "shop-tab":
      game.shopTab = ["buy", "sell", "craft"].includes(control.dataset.tab)
        ? control.dataset.tab : "buy";
      game.dialogueMessage = "";
      refreshDestination();
      break;
    case "buy-item":
      buyShopItem(itemId);
      break;
    case "buy-provisions":
      buyProvisions(Number(control.dataset.quantity));
      break;
    case "sell-item":
      sellShopItem(itemId);
      break;
    case "craft-item":
      craftItem(recipeId);
      break;
    case "view-inventory":
    case "prepare-expedition":
      game.preparationMode = "expedition";
      game.preparationSupplies = Math.min(
        Math.max(game.preparationSupplies, EXPEDITION_TUNING.minimumStartingProvisions),
        game.player.provisions,
        partyProvisionCapacity(game.player.selectedCompanion),
      );
      showScreen("preparation");
      break;
    case "return-from-preparation":
      showLocation();
      break;
    case "equip-item":
      equipItem(itemId);
      break;
    case "toggle-pack-item":
      togglePackItem(itemId);
      break;
    case "select-companion":
      selectCompanion(companionId);
      break;
    case "change-supplies":
      changeSupplies(Number(control.dataset.amount));
      break;
    case "start-expedition":
      startExpedition();
      break;
    case "return-to-safety":
      beginReturn();
      break;
    case "encounter-choice":
      resolveEncounterChoice(choiceId);
      break;
    case "continue-journey":
      continueJourney();
      break;
    case "combat-action":
      chooseCombatAction(control.dataset.combatActionId);
      break;
    case "combat-target":
      chooseCombatTarget(control.dataset.targetId);
      break;
    case "combat-ability":
      chooseCombatAbility(control.dataset.abilityId);
      break;
    case "combat-item":
      chooseCombatItem(control.dataset.itemId);
      break;
    case "combat-menu-back":
      backCombatMenu();
      break;
    case "combat-cancel-target":
      cancelCombatTargetSelection();
      break;
    case "debug-trigger-encounter":
      triggerDebugEncounter();
      break;
    case "debug-start-combat":
      startDebugCombat();
      break;
    case "debug-next-encounter":
      forceNextEncounter();
      break;
    case "abandon-expedition":
      failExpedition("The company abandoned the expedition before reaching safety.");
      break;
    case "new-expedition":
      showLocation();
      break;
    case "reset-save":
      resetSave();
      break;
    default:
      break;
  }
}

function showPressedState(event) {
  const control = event.target.closest("button:not(:disabled)");
  control?.classList.add("is-pressed");
}

function clearPressedState() {
  document.querySelectorAll("button.is-pressed").forEach((button) => {
    button.classList.remove("is-pressed");
  });
}

function showScreen(screen) {
  game.screen = screen;
  renderScreen();
}

function renderScreen() {
  switch (game.screen) {
    case "campaign":
      renderCampaign();
      break;
    case "location":
      renderLocation();
      break;
    case "destination":
      renderDestination();
      break;
    case "preparation":
      renderPreparation();
      break;
    case "expedition":
      renderExpedition();
      break;
    case "summary":
      renderSummary();
      break;
    default:
      throw new Error(`Unknown screen: ${game.screen}`);
  }
}

function renderCampaign() {
  const chapters = CHAPTER_DEFINITIONS.map((chapter) => {
    const completed = game.player.completedChapters.includes(chapter.id);
    const playable = chapter.id === "chapter_03";
    const stateClass = completed ? "is-complete" : playable ? "is-playable" : "is-locked";
    const stateLabel = completed ? "Completed" : playable ? "Available" : "Locked";
    const action = playable
      ? '<button class="game-button chapter-button" type="button" data-action="enter-location" data-location-id="broceliande_village">Enter</button>'
      : `<span class="chapter-state">${stateLabel}</span>`;

    return `
      <article class="chapter-card ${stateClass}">
        <div>
          <p class="chapter-number">Chapter ${chapter.number}</p>
          <h2>${chapter.name}</h2>
        </div>
        ${action}
      </article>`;
  }).join("");

  ui.screenRoot.innerHTML = `
    <section class="screen campaign-screen" aria-labelledby="campaign-title">
      <div class="screen-heading">
        <p class="eyebrow">The Chronicle of Arthur</p>
        <h1 id="campaign-title">Campaign</h1>
        <p>Choose the next chapter of the legend.</p>
      </div>
      <div class="chapter-list">${chapters}</div>
      <div class="campaign-stats">
        <span>Best expedition <strong>${formatDistance(game.player.bestExpeditionDistance)}</strong></span>
        <span>Treasury <strong>${Math.floor(game.player.currentGold)} gold</strong></span>
      </div>
    </section>`;
}

function enterLocation(locationId) {
  if (!LOCATION_DEFINITIONS[locationId]) {
    return;
  }
  game.player.currentLocationId = locationId;
  savePlayer();
  showLocation();
}

function showLocation() {
  const locationEntry = CampaignRules.enterLocation(game.player);
  if (locationEntry.provisionsGranted > 0) {
    savePlayer();
  }
  game.activeDestinationId = null;
  game.dialogueMessage = "";
  showScreen("location");
}

function renderLocation() {
  const location = LOCATION_DEFINITIONS[game.player.currentLocationId];
  if (!location) {
    showScreen("campaign");
    return;
  }

  const destinations = location.destinations.map((destinationId) => {
    const destination = DESTINATION_DEFINITIONS[destinationId];
    return `
      <button class="hub-hotspot position-${destination.scenePosition}" type="button"
        data-action="open-destination" data-destination-id="${destination.id}">
        <span class="hub-building-icon" aria-hidden="true">${destinationIcon(destination.type)}</span>
        <strong>${destination.name}</strong>
      </button>`;
  }).join("");

  ui.screenRoot.innerHTML = `
    <section class="screen location-screen" aria-labelledby="location-title">
      <div class="location-scene" aria-label="Village scene with five destinations">
        <div class="village-sky" aria-hidden="true"></div>
        <div class="village-tree-line" aria-hidden="true"></div>
        <div class="village-road" aria-hidden="true"></div>
        <header class="hub-identity">
          <p>Chapter III</p>
          <h1 id="location-title">${location.name}</h1>
        </header>
        ${destinations}
      </div>
      <div class="hub-hud" aria-label="Village resources and navigation">
      <div class="hub-status">
          <span><strong>${Math.floor(game.player.currentGold)}g</strong> Gold</span>
          <span><strong>${game.player.provisions}</strong> Provisions</span>
          <span><strong>${Math.ceil(HealingRules.arthurHealth(game.player))}/${HealingRules.arthurMaxHealth(game.player)}</strong> Health</span>
        </div>
        <div class="hub-actions">
          <button class="text-button" type="button" data-action="show-campaign">Chapter Select</button>
          <button class="game-button" type="button" data-action="prepare-expedition">Prepare for Expedition</button>
        </div>
      </div>
    </section>`;
}

function openDestination(destinationId) {
  const location = LOCATION_DEFINITIONS[game.player.currentLocationId];
  if (!location?.destinations.includes(destinationId) || !DESTINATION_DEFINITIONS[destinationId]) {
    return;
  }
  game.activeDestinationId = destinationId;
  game.shopTab = "buy";
  game.dialogueMessage = "";
  showScreen("destination");
}

function renderDestination() {
  const destination = DESTINATION_DEFINITIONS[game.activeDestinationId];
  if (!destination) {
    showLocation();
    return;
  }
  const npc = NPC_DEFINITIONS[destination.npcIds[0]];
  let interaction = "";

  if (destination.shopId) {
    interaction = renderShopInteraction(destination, npc);
  } else {
    interaction = renderInnInteraction(destination, npc);
  }

  ui.screenRoot.innerHTML = `
    <section class="screen destination-screen" aria-labelledby="destination-title">
      <div class="visual-frame destination-visual visual-${destination.visualKey}">
        <span class="destination-emblem" aria-hidden="true">${destinationIcon(destination.type)}</span>
        <div><p>${destination.name}</p><span>${destination.description}</span></div>
      </div>
      <div class="destination-panel">
        <header class="interaction-header">
          <button class="interaction-back" type="button" data-action="show-location">← Village</button>
          <strong id="destination-title">${destination.name}</strong>
          <span>${Math.floor(game.player.currentGold)}g · ${game.player.provisions} food</span>
        </header>
        <div class="interaction-scroll">
          <div class="destination-heading">
            <p class="eyebrow">${capitalize(destination.type.replace("_", " "))}</p>
            <p>${destination.description}</p>
          </div>
          ${game.dialogueMessage ? `<div class="interaction-message" aria-live="polite">${game.dialogueMessage}</div>` : ""}
          ${interaction}
        </div>
      </div>
    </section>`;
}

function renderInnInteraction(destination, npc) {
  const rest = HealingRules.quoteInnRest(game.player);
  const partyHealth = rest.partyMembers.map((member) => `
    <div class="inn-health-row">
      <strong>${member.name}</strong>
      <span>${rest.fullHealth ? `${member.healthBefore} / ${member.maxHealth}` : `${member.healthBefore} / ${member.maxHealth} &rarr; ${member.healthAfter} / ${member.maxHealth}`}</span>
      <span class="inn-health-result">${rest.fullHealth ? "Full Health" : `+${member.healingAmount} HP`}</span>
    </div>`).join("");
  const restAction = rest.fullHealth
    ? `<p class="inn-rest-complete">Everyone is fully rested.</p>`
    : `<div class="inn-rest-action"><span>Rest restores the active company</span><strong>${rest.goldCost}g</strong></div>
      <button class="game-button" type="button" data-action="rest-at-inn" ${rest.available ? "" : "disabled"}>${rest.available ? `Rest · ${rest.goldCost}g` : `Cannot Afford · ${rest.goldCost}g`}</button>`;
  return `
    <article class="npc-card">
      <div><strong>${npc.name}</strong><span>${npc.role}</span></div>
      <p>${npc.description}</p>
    </article>
    <div class="interaction-actions">
      <button class="small-button" type="button" data-action="npc-talk" data-npc-id="${npc.id}">Talk</button>
      <button class="small-button" type="button" data-action="hear-rumor" data-npc-id="${npc.id}">Hear Rumor</button>
    </div>
    <article class="provision-offer inn-rest-offer">
      <div class="inn-rest-heading"><strong>Rest the Company</strong><span>${rest.fullHealth ? "No payment needed" : "One rest"}</span></div>
      <div class="inn-health-list">${partyHealth}</div>
      ${restAction}
    </article>`;
}

function restAtInn() {
  if (game.activeDestinationId !== "inn") return;
  const result = HealingRules.restAtInn(game.player);
  if (result.applied) {
    const recovery = result.partyMembers.map(
      (member) => `${member.name} recovers ${member.healingAmount} health`,
    ).join("; ");
    showToast({
      title: "Rested at the Inn",
      message: `${recovery}. ${result.goldCost} gold was paid.`,
      type: "success",
    });
    savePlayer();
  } else if (result.fullHealth) {
    showToast({
      title: "Already Fully Rested",
      message: "No gold was charged.",
      type: "normal",
    });
  } else {
    showToast({
      title: "Cannot Afford Rest",
      message: `The active party needs ${result.quotedGoldCost} gold.`,
      type: "warning",
    });
  }
  refreshDestination();
}

function renderShopInteraction(destination, npc) {
  const shop = SHOP_DEFINITIONS[destination.shopId];
  const buySelected = game.shopTab === "buy";
  const sellSelected = game.shopTab === "sell";
  const craftSelected = game.shopTab === "craft" && Boolean(destination.craftingProviderId);
  const rows = craftSelected
    ? CraftingRules.knownRecipesForProvider(game.player, destination.craftingProviderId)
      .map((recipe) => craftingRow(recipe, destination.craftingProviderId)).join("")
    : buySelected
      ? Object.entries(shop.itemsForSale).map(([itemId, offer]) => shopBuyRow(shop, itemId, offer)).join("")
      : Object.entries(game.player.ownedItems).map(([itemId, quantity]) => shopSellRow(shop, itemId, quantity)).join("");
  const provisionOffer = buySelected && shop.provisionsForSale
    ? renderProvisionOffer(shop, shop.provisionsForSale)
    : "";
  const materials = craftSelected ? renderMaterialInventory() : "";

  return `
    <div class="shopkeeper-row">
      <div><strong>${npc.name}</strong><span>${npc.role}</span></div>
      <span class="gold-display">${Math.floor(game.player.currentGold)} gold</span>
    </div>
    <div class="shop-tabs" role="tablist" aria-label="Shop actions">
      <button class="${buySelected ? "is-selected" : ""}" type="button" role="tab" aria-selected="${buySelected}" data-action="shop-tab" data-tab="buy">Buy</button>
      <button class="${sellSelected ? "is-selected" : ""}" type="button" role="tab" aria-selected="${sellSelected}" data-action="shop-tab" data-tab="sell">Sell</button>
      ${destination.craftingProviderId ? `<button class="${craftSelected ? "is-selected" : ""}" type="button" role="tab" aria-selected="${craftSelected}" data-action="shop-tab" data-tab="craft">Craft</button>` : ""}
      <button type="button" data-action="npc-talk" data-npc-id="${npc.id}">Talk</button>
    </div>
    ${provisionOffer}
    ${materials}
    <div class="shop-list">${rows || '<p class="empty-loot">Nothing available.</p>'}</div>`;
}

function renderMaterialInventory() {
  const entries = Object.entries(game.player.materials)
    .filter(([, quantity]) => quantity > 0)
    .sort(([left], [right]) => (RARITY_DEFINITIONS[MATERIAL_DEFINITIONS[left].rarity]?.rank ?? 0)
      - (RARITY_DEFINITIONS[MATERIAL_DEFINITIONS[right].rarity]?.rank ?? 0)
      || MATERIAL_DEFINITIONS[left].name.localeCompare(MATERIAL_DEFINITIONS[right].name));
  const chips = entries.map(([materialId, quantity]) => (
    `<span class="material-chip rarity-${MATERIAL_DEFINITIONS[materialId].rarity}">${itemIcon("material", { ...MATERIAL_DEFINITIONS[materialId], id: materialId })}<span>${MATERIAL_DEFINITIONS[materialId].name}</span> <strong>${quantity}</strong></span>`
  )).join("");
  return `<div class="material-inventory"><span>Materials</span><div>${chips || '<em>None owned</em>'}</div></div>`;
}

function craftingRow(recipe, providerId) {
  const quote = CraftingRules.quote(game.player, recipe.id, providerId);
  const ingredients = quote.ingredientStatus.map(({ materialId, required, owned, sufficient }) => (
    `<span class="${sufficient ? "" : "is-missing"}">${MATERIAL_DEFINITIONS[materialId].name} ${owned}/${required}</span>`
  )).join(" · ");
  const cost = recipe.goldCost > 0 ? ` · ${recipe.goldCost} gold` : "";
  return `
    <article class="shop-item-row crafting-row ${quote.available ? "" : "is-blocked"}">
      <div class="item-icon" aria-hidden="true">${itemIcon(quote.item.category, quote.item)}</div>
      <div><strong>${recipe.name} <span class="rarity-label">${capitalize(recipe.rarity)}</span></strong><span>${recipe.description}</span><span class="crafting-cost">${ingredients}${cost}</span><span>Creates ${quote.item.name}${recipe.output.quantity > 1 ? ` ×${recipe.output.quantity}` : ""}</span></div>
      <button class="small-button" type="button" data-action="craft-item" data-recipe-id="${recipe.id}">Craft</button>
    </article>`;
}

function renderProvisionOffer(shop, offer) {
  const stock = game.provisionShopStock[shop.id] ?? 0;
  return `
    <article class="provision-offer">
      <div><strong>Provisions</strong><span>Owned: ${game.player.provisions} · ${offer.price} gold each · ${stock} available</span></div>
      <div class="provision-buy-actions">
        ${[1, 5, 10].map((quantity) => `<button class="small-button" type="button" data-action="buy-provisions" data-quantity="${quantity}" ${stock < quantity ? "disabled" : ""}>Buy ${quantity}</button>`).join("")}
      </div>
    </article>`;
}

function shopBuyRow(shop, itemId, offer) {
  const item = ITEM_DEFINITIONS[itemId];
  const ownedUnique = item.unique && Boolean(game.player.ownedItems[itemId]);
  const stock = game.itemShopStock[`${shop.id}:${itemId}`]
    ?? offer.stock ?? Infinity;
  const unavailable = stock <= 0;
  return `
    <article class="shop-item-row ${ownedUnique || unavailable ? "is-blocked" : ""}">
      <div class="item-icon" aria-hidden="true">${itemIcon(item.category, item)}</div>
      <div><strong>${item.name}</strong><span>${ownedUnique ? "Owned · unique equipment" : unavailable ? "Sold out" : `${item.description} · ${stock} available`}</span></div>
      <button class="small-button" type="button" data-action="buy-item" data-item-id="${itemId}" ${ownedUnique || unavailable ? "disabled" : ""}>${ownedUnique ? "Owned" : unavailable ? "Sold Out" : `Buy · ${offer.price}g`}</button>
    </article>`;
}

function shopSellRow(shop, itemId, quantity) {
  const item = ITEM_DEFINITIONS[itemId];
  const reason = itemSaleBlockReason(shop, item);
  const value = shop.sellValues[itemId];
  return `
    <article class="shop-item-row ${reason ? "is-blocked" : ""}">
      <div class="item-icon" aria-hidden="true">${itemIcon(item.category, item)}</div>
      <div><strong>${item.name}${quantity > 1 ? ` ×${quantity}` : ""}</strong><span>${reason || `${value} gold each`}</span></div>
      <button class="small-button" type="button" data-action="sell-item" data-item-id="${itemId}" ${reason ? "disabled" : ""}>${reason ? "Cannot Sell" : `Sell · ${value}g`}</button>
    </article>`;
}

function itemSaleBlockReason(shop, item) {
  return EconomyRules.itemSaleBlockReason(game.player, shop, item);
}

function shopAcceptsItem(shop, item) {
  return EconomyRules.shopAcceptsItem(shop, item);
}

function buyShopItem(itemId) {
  const destination = DESTINATION_DEFINITIONS[game.activeDestinationId];
  const shop = SHOP_DEFINITIONS[destination?.shopId];
  const offer = shop?.itemsForSale[itemId];
  const item = ITEM_DEFINITIONS[itemId];
  if (!item || !offer || !Number.isFinite(offer.price)) {
    return;
  }
  const result = EconomyRules.buyItem(game.player, shop, game.itemShopStock, itemId, 1);
  if (!result.applied) {
    showToast({
      title: "Purchase Unavailable",
      message: game.player.currentGold < offer.price ? "Not enough gold." : "That item cannot be purchased.",
      type: "warning",
    });
    return;
  }
  showToast({
    title: `Purchased ${item.name}`,
    message: `-${result.goldCost} gold`,
    type: "success",
  });
  savePlayer();
  refreshDestination();
}

function buyProvisions(quantity) {
  const destination = DESTINATION_DEFINITIONS[game.activeDestinationId];
  const shop = SHOP_DEFINITIONS[destination?.shopId];
  const offer = shop?.provisionsForSale;
  const result = EconomyRules.buyProvisions(game.player, shop, game.provisionShopStock, quantity);
  if (!result.applied) {
    showToast({
      title: "Provision Purchase Unavailable",
      message: game.player.currentGold < (offer?.price ?? 0) * quantity
        ? "Not enough gold."
        : "That quantity is not available.",
      type: "warning",
    });
    return;
  }
  showToast({
    title: `Purchased Provisions ×${quantity}`,
    message: `-${result.goldCost} gold`,
    type: "success",
  });
  savePlayer();
  refreshDestination();
}

function sellShopItem(itemId) {
  const destination = DESTINATION_DEFINITIONS[game.activeDestinationId];
  const shop = SHOP_DEFINITIONS[destination?.shopId];
  const item = ITEM_DEFINITIONS[itemId];
  const result = EconomyRules.sellItem(game.player, shop, itemId);
  if (!result.applied) {
    showToast({
      title: "Cannot Sell Item",
      message: result.reason ?? "This item cannot be sold here.",
      type: "warning",
    });
    return;
  }
  showToast({
    title: `Sold ${item.name}`,
    message: `+${result.goldEarned} gold`,
    type: "success",
  });
  savePlayer();
  refreshDestination();
}

function craftItem(recipeId) {
  const destination = DESTINATION_DEFINITIONS[game.activeDestinationId];
  const result = CraftingRules.craft(game.player, recipeId, destination?.craftingProviderId);
  if (!result.applied) {
    showToast({
      title: craftingFailureTitle(result),
      message: craftingFailureMessage(result),
      type: "warning",
    });
    return;
  }
  const item = ITEM_DEFINITIONS[result.itemId];
  showToast({
    title: `Crafted ${item.name}${result.quantity > 1 ? ` ×${result.quantity}` : ""}`,
    message: `${result.quantity} ${item.name} added to your inventory`,
    type: "success",
  });
  savePlayer();
  refreshDestination();
}

function craftingFailureTitle(result) {
  if (result.reason === "insufficient-materials") return "Not Enough Materials";
  if (result.reason === "insufficient-gold") return "Not Enough Gold";
  if (result.reason === "unique-item-owned") return "Already Owned";
  if (result.reason === "recipe-unknown") return "Recipe Locked";
  return "Cannot Craft";
}

function craftingFailureMessage(result) {
  if (result.reason === "insufficient-materials") {
    return (result.quote?.ingredientStatus ?? [])
      .filter((entry) => !entry.sufficient)
      .map((entry) => `${MATERIAL_DEFINITIONS[entry.materialId]?.name ?? entry.materialId} ${entry.owned}/${entry.required}`)
      .join(" · ") || "Required materials are missing.";
  }
  if (result.reason === "insufficient-gold") {
    return `Requires ${result.quote?.recipe?.goldCost ?? "additional"} gold.`;
  }
  if (result.reason === "unique-item-owned") return "This unique item is already in your inventory.";
  if (result.reason === "recipe-unknown") return "Learn this recipe before crafting it.";
  return "The current crafting station cannot make that item.";
}

function showNpcDialogue(npcId, field) {
  const npc = NPC_DEFINITIONS[npcId];
  const lines = npc?.[field];
  if (!Array.isArray(lines) || lines.length === 0) {
    game.dialogueMessage = `${npc?.name ?? "The villager"} has nothing more to add.`;
  } else {
    game.dialogueMessage = `“${lines[Math.floor(Math.random() * lines.length)]}”`;
  }
  refreshDestination();
}

function refreshDestination() {
  rerenderPreservingScroll(".interaction-scroll", renderDestination);
}

function inventoryQuantity() {
  return Object.values(game.player.ownedItems).reduce((total, quantity) => total + quantity, 0);
}

function createProvisionShopStock() {
  return CampaignRules.createShopStocks();
}

function createItemShopStock() {
  return CampaignRules.createShopStocks();
}

function partyProvisionCapacity(selectedCompanionId) {
  return ExpeditionRules.partyProvisionCapacity(selectedCompanionId);
}

function partyProvisionConsumptionMultiplier(selectedCompanionId) {
  return ExpeditionRules.partyProvisionConsumptionMultiplier(selectedCompanionId);
}

function destinationIcon(type) {
  return ({ inn: "⌂", shop: "◆" })[type] ?? "•";
}

function renderPreparation() {
  const provisionCapacity = partyProvisionCapacity(game.player.selectedCompanion);
  const provisionConsumptionMultiplier = partyProvisionConsumptionMultiplier(
    game.player.selectedCompanion,
  );
  const inventory = Object.entries(game.player.ownedItems)
    .map(([itemId, quantity]) => inventoryCard(ITEM_DEFINITIONS[itemId], quantity))
    .join("");
  const companions = [companionCard(null), ...game.player.unlockedCompanions
    .map((companionId) => companionCard(COMPANION_DEFINITIONS[companionId]))
  ].join("");
  const equipment = ["weapon", "armor", "relic"]
    .map((slot) => equipmentSlotCard(slot, game.player.equippedItems[slot]))
    .join("");
  const packedItems = game.player.packedItems
    .map((itemId) => packItemCard(ITEM_DEFINITIONS[itemId], game.player.ownedItems[itemId]))
    .join("");
  const emptyPackSlots = EXPEDITION_TUNING.packSlots - game.player.packedItems.length;

  ui.screenRoot.innerHTML = `
    <section class="screen preparation-screen" aria-labelledby="preparation-title">
      <button class="text-button preparation-back" type="button" data-action="show-location">← Village</button>
      <div class="screen-heading compact-heading">
        <p class="eyebrow">Chapter III — Brocéliande</p>
        <h1 id="preparation-title">Prepare for Expedition</h1>
      </div>

      <section class="preparation-section" aria-labelledby="equipment-title">
        <div class="section-title-row">
          <h2 id="equipment-title">Equipped Gear</h2>
          <span>Weapon · Armor · Relic</span>
        </div>
        <div class="equipment-slots">${equipment}</div>
      </section>

      <section class="preparation-section" aria-labelledby="pack-title">
        <div class="section-title-row">
          <h2 id="pack-title">Expedition Pack</h2>
          <span>${game.player.packedItems.length}/${EXPEDITION_TUNING.packSlots} slots</span>
        </div>
        <p class="section-help">Packed tools and consumables are available during encounters.</p>
        <div class="pack-list">
          ${packedItems || '<p class="empty-loot">The pack is empty.</p>'}
          ${Array.from({ length: emptyPackSlots }, () => '<div class="empty-pack-slot">Empty slot</div>').join("")}
        </div>
      </section>

      <section class="preparation-section" aria-labelledby="inventory-title">
        <div class="section-title-row">
          <h2 id="inventory-title">Permanent Inventory</h2>
          <span>${Object.keys(game.player.ownedItems).length} items</span>
        </div>
        <div class="inventory-list">${inventory}</div>
      </section>

      <section class="preparation-section" aria-labelledby="companion-title">
        <div class="section-title-row">
          <h2 id="companion-title">Party</h2>
          <span>${PLAYER_CHARACTER_DEFINITION.name}${game.player.selectedCompanion ? ` · ${COMPANION_DEFINITIONS[game.player.selectedCompanion].name}` : " · Traveling Alone"}</span>
        </div>
        <div class="choice-list">${companions}</div>
      </section>

      <section class="preparation-section supplies-section" aria-labelledby="supplies-title">
        <div>
          <h2 id="supplies-title">Provisions</h2>
          <p>Owned: <strong>${game.player.provisions}</strong></p>
          <p>To carry: <strong>${game.preparationSupplies} / ${provisionCapacity}</strong> · Consumption: <strong>${provisionConsumptionMultiplier.toFixed(2)}×</strong></p>
        </div>
        <div class="stepper" aria-label="Choose provisions">
          <button type="button" data-action="change-supplies" data-amount="-5" aria-label="Remove five provisions">−5</button>
          <button type="button" data-action="change-supplies" data-amount="-1" aria-label="Remove one provision">−</button>
          <strong>${game.preparationSupplies}</strong>
          <button type="button" data-action="change-supplies" data-amount="1" aria-label="Add one provision">+</button>
          <button type="button" data-action="change-supplies" data-amount="5" aria-label="Add five provisions">+5</button>
        </div>
      </section>

      <div class="footer-actions">
        <button class="game-button" type="button" data-action="start-expedition" ${game.preparationSupplies > 0 && HealingRules.arthurHealth(game.player) > 0 ? "" : "disabled"}>Begin Expedition</button>
      </div>
    </section>`;
}

function inventoryCard(item, quantity) {
  const equipped = item.equippable && game.player.equippedItems[item.equipmentSlot] === item.id;
  const packed = game.player.packedItems.includes(item.id);
  const actions = [];
  if (item.equippable) {
    actions.push(`<button class="small-button ${equipped ? "is-selected" : ""}" type="button" data-action="equip-item" data-item-id="${item.id}" ${equipped ? "disabled" : ""}>${equipped ? "Equipped" : `Equip ${capitalize(item.equipmentSlot)}`}</button>`);
  }
  if (item.carriable && !equipped) {
    const packFull = !packed && game.player.packedItems.length >= EXPEDITION_TUNING.packSlots;
    actions.push(`<button class="small-button ${packed ? "is-packed" : ""}" type="button" data-action="toggle-pack-item" data-item-id="${item.id}" ${packFull ? "disabled" : ""}>${packed ? "Packed" : "Pack"}</button>`);
  }
  if (actions.length === 0) {
    actions.push(`<span class="item-state">${item.questItem ? "Special" : "Owned"}</span>`);
  }

  return `
    <article class="inventory-card ${equipped ? "is-equipped" : ""}">
      <div class="item-icon" aria-hidden="true">${itemIcon(item.category, item)}</div>
      <div class="item-copy">
        <div class="item-title-row"><h3>${item.name}</h3>${quantity > 1 ? `<span>×${quantity}</span>` : ""}</div>
        <p>${item.description}</p>
        <span class="item-category">${item.equipmentSlot ?? item.category}${item.rarity ? ` · ${item.rarity}` : ""}</span>
      </div>
      <div class="item-actions">${actions.join("")}</div>
    </article>`;
}

function equipmentSlotCard(slot, itemId) {
  const item = ITEM_DEFINITIONS[itemId];
  return `
    <article class="equipment-slot-card">
      <span>${capitalize(slot)}</span>
      <strong>${item?.name ?? "Empty"}</strong>
    </article>`;
}

function packItemCard(item, quantity) {
  const packedQuantity = Math.min(quantity, item.maxStack ?? 1);
  return `
    <article class="pack-item-card">
      <div><strong>${item.name}</strong>${packedQuantity > 1 ? `<span> ×${packedQuantity}</span>` : ""}</div>
      <button class="small-button is-packed" type="button" data-action="toggle-pack-item" data-item-id="${item.id}">Remove</button>
    </article>`;
}

function companionCard(companion) {
  const selected = game.player.selectedCompanion === (companion?.id ?? null);
  const name = companion?.name ?? "Travel Alone";
  const description = companion
    ? `${companion.description} +${companion.provisionCapacityBonus} provision capacity · +${companion.provisionConsumptionBonus.toFixed(2)}× consumption.`
    : `${PLAYER_CHARACTER_DEFINITION.name} carries ${PLAYER_CHARACTER_DEFINITION.provisionCapacity} provisions at ${PLAYER_CHARACTER_DEFINITION.provisionConsumptionMultiplier.toFixed(2)}× consumption.`;
  return `
    <button class="choice-card ${selected ? "is-selected" : ""}" type="button" data-action="select-companion" data-companion-id="${companion?.id ?? ""}">
      <strong>${name}</strong>
      <span>${description}</span>
    </button>`;
}

function equipItem(itemId) {
  const item = ITEM_DEFINITIONS[itemId];
  if (!item?.equippable || !game.player.ownedItems[itemId]) {
    return;
  }

  const previousItemId = game.player.equippedItems[item.equipmentSlot];
  game.player.equippedItems[item.equipmentSlot] = itemId;
  game.player.packedItems = game.player.packedItems.filter((packedItemId) => packedItemId !== itemId);
  showToast({
    title: `Equipped ${item.name}`,
    message: previousItemId && previousItemId !== itemId
      ? `Replaced ${ITEM_DEFINITIONS[previousItemId]?.name ?? "previous gear"}.`
      : "Ready for the next expedition.",
    type: "success",
  });
  savePlayer();
  refreshPreparation();
}

function togglePackItem(itemId) {
  const item = ITEM_DEFINITIONS[itemId];
  if (!item?.carriable
    || !game.player.ownedItems[itemId]
    || Object.values(game.player.equippedItems).includes(itemId)) {
    return;
  }

  const packedIndex = game.player.packedItems.indexOf(itemId);
  if (packedIndex >= 0) {
    game.player.packedItems.splice(packedIndex, 1);
    showToast({
      title: `Removed ${item.name} from Pack`,
      type: "normal",
    });
  } else if (game.player.packedItems.length < EXPEDITION_TUNING.packSlots) {
    game.player.packedItems.push(itemId);
    showToast({
      title: `Packed ${item.name}`,
      type: "success",
    });
  }
  savePlayer();
  refreshPreparation();
}

function selectCompanion(companionId) {
  const selectedCompanion = companionId || null;
  if (selectedCompanion && !game.player.unlockedCompanions.includes(selectedCompanion)) {
    return;
  }

  const previousCompanion = game.player.selectedCompanion;
  game.player.selectedCompanion = selectedCompanion;
  game.preparationSupplies = Math.min(
    game.preparationSupplies,
    partyProvisionCapacity(selectedCompanion),
    game.player.provisions,
  );
  if (previousCompanion !== selectedCompanion) {
    showToast({
      title: selectedCompanion
        ? `${COMPANION_DEFINITIONS[selectedCompanion].name} Joined the Party`
        : "Traveling Alone",
      message: selectedCompanion
        ? "The company is ready to depart."
        : "Arthur will carry the expedition alone.",
      type: "success",
    });
  }
  savePlayer();
  refreshPreparation();
}

function changeSupplies(amount) {
  game.preparationSupplies = clamp(
    game.preparationSupplies + amount,
    0,
    Math.min(partyProvisionCapacity(game.player.selectedCompanion), game.player.provisions),
  );
  refreshPreparation();
}

function refreshPreparation() {
  rerenderPreservingScroll(".preparation-screen", renderPreparation);
}

function rerenderPreservingScroll(selector, render) {
  const scrollTop = document.querySelector(selector)?.scrollTop ?? 0;
  render();
  const refreshedScroller = document.querySelector(selector);
  if (refreshedScroller) refreshedScroller.scrollTop = scrollTop;
}

function startExpedition() {
  const provisionCapacity = partyProvisionCapacity(game.player.selectedCompanion);
  if (game.preparationSupplies <= 0
    || HealingRules.arthurHealth(game.player) <= 0
    || game.preparationSupplies > game.player.provisions
    || game.preparationSupplies > provisionCapacity) {
    return;
  }
  const committedProvisions = game.preparationSupplies;
  game.expedition = ExpeditionRules.startExpedition(game.player, {
    provisions: committedProvisions,
    companion: game.player.selectedCompanion,
  });
  savePlayer();
  showScreen("expedition");
}

function renderExpedition() {
  const expedition = game.expedition;
  if (expedition.combat) {
    renderCombat(expedition, expedition.combat);
    return;
  }
  const companion = expedition.selectedCompanion
    ? COMPANION_DEFINITIONS[expedition.selectedCompanion]
    : null;
  const activeEncounter = expedition.activeEncounter
    ? ENCOUNTER_DEFINITIONS[expedition.activeEncounter.encounterId]
    : null;
  const loadoutEntries = Object.values(expedition.selectedEquipment)
    .map((itemId) => ({ itemId, quantity: 1 }))
    .filter(({ itemId }) => ITEM_DEFINITIONS[itemId]);

  ui.screenRoot.innerHTML = `
    <section class="screen expedition-screen" aria-label="Brocéliande expedition">
      <div class="visual-frame travel-scene ${activeEncounter ? "is-paused" : ""}" id="travel-scene">
        <div class="moon" aria-hidden="true"></div>
        <div class="forest forest-far" aria-hidden="true"></div>
        <div class="forest forest-near" aria-hidden="true"></div>
        <div class="travelers" id="travelers" aria-hidden="true">
          <span class="arthur">♞</span>${companion ? '<span class="companion">♞</span>' : ""}
        </div>
        <div class="ground" aria-hidden="true"></div>
        <div class="direction-banner" id="direction-banner">${activeEncounter ? `Encounter: ${activeEncounter.title}` : "Traveling Outbound →"}</div>
      </div>
      ${activeEncounter
        ? renderEncounterPanel(expedition, activeEncounter)
        : renderTravelPanel(expedition, companion, loadoutEntries)}
    </section>`;
  updateTravelHud();
}

function renderTravelPanel(expedition, companion, loadout) {
  const travelMessage = expedition.lastEncounterResult
    || (expedition.currentPathId === "overgrown_trail"
      ? "The overgrown trail narrows beneath ancient trees."
      : "The old forest road winds deeper beneath the trees.");

  return `
    <div class="travel-panel">
      <div class="screen-heading travel-heading">
        <p class="eyebrow">Chapter III</p>
        <h1 id="region-title">Brocéliande</h1>
        <p id="travel-message">${travelMessage}</p>
      </div>
      ${renderExpeditionResources(expedition)}
      <div class="progress-track" aria-label="Current return distance">
        <div class="progress-fill" id="distance-progress"></div>
      </div>
      <section class="run-details">
        <p><span>Company</span><strong>${companion ? `Arthur &amp; ${companion.name}` : "Arthur"}</strong></p>
        <p><span>Path</span><strong id="path-value">${pathLabel(expedition.currentPathId)}</strong></p>
        <div class="run-detail-collection"><span>Loadout</span><div class="run-item-list">${renderItemChips(loadout, "No equipment selected")}</div></div>
        <div class="run-detail-collection"><span>Carried</span><div class="run-item-list">${formatCarriedItems(expedition.carriedItems)}</div></div>
        <div class="run-detail-collection"><span>Discoveries</span><div id="loot-list" class="loot-list">${renderDiscoveryList(expedition)}</div></div>
      </section>
      ${renderEncounterDebugControls(expedition)}
      <div class="footer-actions travel-actions">
        <button class="text-button danger-button" type="button" data-action="abandon-expedition">Abandon</button>
        <button id="return-button" class="game-button" type="button" data-action="return-to-safety">Return to Safety</button>
      </div>
    </div>`;
}

function renderEncounterPanel(expedition, encounter) {
  const active = expedition.activeEncounter;
  if (active.phase === "result") {
    return renderEncounterResultPanel(expedition, encounter, active);
  }
  if (active.phase === "pending") {
    return renderEncounterPendingPanel(expedition, encounter, active);
  }

  const stage = encounter.stages[active.stageId];
  const choices = stage.choices.map((choice) => renderEncounterChoice(choice, expedition)).join("");
  const outcomes = nonRewardOutcomeMessages(active.outcomeMessages).length > 0
    ? `<div class="outcome-strip">${nonRewardOutcomeMessages(active.outcomeMessages).map((message) => `<span>${message}</span>`).join("")}</div>`
    : "";

  return `
    <div class="travel-panel encounter-panel" aria-live="polite">
      ${renderExpeditionResources(expedition)}
      <div class="encounter-heading">
        <p class="eyebrow">Travel Paused · ${pathLabel(expedition.currentPathId)}</p>
        <h1>${encounter.title}</h1>
        <p class="encounter-description">${encounter.description}</p>
      </div>
      <div class="encounter-stage">
        <p>${active.stageText || stage.text}</p>
        ${outcomes}
      </div>
      <div class="encounter-choices">${choices}</div>
    </div>`;
}

function nonRewardOutcomeMessages(messages = []) {
  return messages.filter((message) => !/^(ITEM FOUND|MATERIAL FOUND|RECIPE FOUND|\+\d+ gold)/.test(message));
}

function renderEncounterPendingPanel(expedition, encounter, active) {
  return `
    <div class="travel-panel encounter-panel encounter-pending-panel" aria-live="polite" aria-busy="true">
      ${renderExpeditionResources(expedition)}
      <div class="encounter-heading">
        <p class="eyebrow">Action in Progress</p>
        <h1>${encounter.title}</h1>
      </div>
      <div class="encounter-stage pending-stage">
        <p>${active.actionText}</p>
        <div class="pending-indicator" aria-hidden="true"><span></span><span></span><span></span></div>
      </div>
    </div>`;
}

function renderEncounterResultPanel(expedition, encounter, active) {
  const outcomes = nonRewardOutcomeMessages(active.outcomeMessages).length > 0
    ? `<div class="result-consequences">${nonRewardOutcomeMessages(active.outcomeMessages).map((message) => `<span>${message}</span>`).join("")}</div>`
    : "";
  const rewards = renderRewardCards(active.rewards ?? [], {
    emptyMessage: "No physical rewards from this encounter.",
  });

  return `
    <div class="travel-panel encounter-panel encounter-result-panel" aria-live="polite">
      ${renderExpeditionResources(expedition)}
      <div class="encounter-heading">
        <p class="eyebrow">Encounter Resolved</p>
        <h1>${encounter.title}</h1>
      </div>
      <div class="encounter-stage result-stage">
        <p>${active.resultText}</p>
        <section class="encounter-rewards" aria-labelledby="encounter-rewards-title">
          <div class="reward-section-heading"><strong id="encounter-rewards-title">Discoveries</strong><span>Secure on return</span></div>
          ${rewards}
        </section>
        ${outcomes}
      </div>
      <div class="encounter-choices">
        <button class="encounter-choice continue-choice" type="button" data-action="continue-journey">
          <strong>Continue Journey</strong>
        </button>
      </div>
    </div>`;
}

function renderCombat(expedition, combat) {
  const activeActor = combat.allies.find((ally) => ally.id === combat.activeActorId);
  const awaitingAction = combat.status === "awaitingAction";
  const choosingTarget = ["enemyTarget", "allyTarget"].includes(combat.interactionMode);
  const selectedEnemy = combat.enemies.find((enemy) => enemy.id === combat.selectedEnemyId && enemy.hp > 0);
  ui.screenRoot.innerHTML = `
    <section class="screen expedition-screen combat-screen" aria-label="Combat">
      <div class="visual-frame combat-scene ${awaitingAction ? "is-paused" : ""} ${choosingTarget ? "is-choosing-target" : ""}">
        <div class="combat-side combat-party" aria-label="Party">
          ${combat.allies.map((combatant) => renderCombatant(combatant, combat)).join("")}
        </div>
        <div class="combat-battlefield-space" aria-hidden="true"></div>
        <div class="combat-side combat-enemies" aria-label="Enemies">
          ${combat.enemies.map((combatant) => renderCombatant(combatant, combat)).join("")}
        </div>
      </div>
      <div class="combat-panel">
        <div class="combat-state-line">
          <div>
            <p class="eyebrow">${awaitingAction ? "Current Turn" : "Battle in Progress"}</p>
            <strong>${activeActor ? `${activeActor.name}'s turn` : "Action gauges are filling"}</strong>
          </div>
          <span class="combat-target-summary">${selectedEnemy ? `${selectedEnemy.name} selected` : choosingTarget ? "Choose a target" : "No target selected"}</span>
        </div>
        <div class="combat-controls">
          ${renderCombatControls(combat, activeActor)}
        </div>
        <div class="combat-log" aria-live="polite">
          <strong class="combat-log-label">Combat Log</strong>
          <div class="combat-log-entries">${combat.log.slice(-4).map((message) => `<p>${message}</p>`).join("")}</div>
        </div>
      </div>
    </section>`;
  updateCombatHud();
}

function renderCombatant(combatant, combat) {
  const defeated = combatant.hp <= 0;
  const ready = combatant.id === combat.activeActorId;
  const wasHit = Boolean(combatant.lastHitEvent);
  const selectable = !defeated && (
    (combat.status === "awaitingAction" && combat.interactionMode === "main" && combatant.side === "enemy")
    || (combat.interactionMode === "enemyTarget" && combatant.side === "enemy")
    || (combat.interactionMode === "allyTarget" && combatant.side === "ally" && combatant.hp < combatant.maxHp)
  );
  const selected = combatant.side === "enemy" && combatant.id === combat.selectedEnemyId;
  const intent = combatant.side === "enemy" && !defeated
    ? `<div class="combat-intent">${COMBAT_ENEMY_ACTION_DEFINITIONS[combatant.intentId]?.name ?? "Attack"}</div>`
    : "";
  const effects = [combatant.defending ? "DEFENDING" : "", combatant.interceding ? "INTERCEDING" : ""]
    .filter(Boolean).join(" · ");
  const tag = selectable ? "button" : "article";
  const targetAttributes = selectable
    ? `type="button" data-action="combat-target" data-target-id="${combatant.id}" aria-label="Target ${combatant.name}"${combatant.side === "enemy" ? ` aria-pressed="${selected}"` : ""}`
    : "";
  const markup = `
    <${tag} class="combatant ${combatant.side} ${defeated ? "is-defeated" : ""} ${ready ? "is-ready" : ""} ${selectable ? "is-selectable" : ""} ${selected ? "is-selected" : ""} ${wasHit ? "was-hit" : ""}"
      data-combatant-id="${combatant.id}" ${targetAttributes}>
      <div class="combatant-token" aria-hidden="true">${combatant.side === "ally" ? "♞" : "◆"}</div>
      <div class="combatant-heading"><strong>${combatant.name}</strong><span class="combat-hp-label" id="combat-hp-${combatant.id}">${Math.ceil(combatant.hp)} / ${combatant.maxHp}</span></div>
      <div class="combat-bar hp-bar"><span id="combat-hp-bar-${combatant.id}" style="width:${(combatant.hp / combatant.maxHp) * 100}%"></span></div>
      ${intent}
      <div class="combat-bar gauge-bar"><span id="combat-gauge-${combatant.id}" style="width:${combatGaugePercent(combatant)}%"></span></div>
      ${effects ? `<small>${effects}</small>` : ""}
    </${tag}>`;
  combatant.lastHitEvent = null;
  return markup;
}

function renderCombatControls(combat, activeActor) {
  if (!activeActor) {
    return '<p class="combat-waiting">Watch enemy intent and prepare your response.</p>';
  }
  if (combat.interactionMode === "enemyTarget") {
    return `<div class="combat-target-prompt"><p>${combat.pendingTargetPrompt ?? "Choose an enemy target"}</p><button type="button" data-action="combat-cancel-target">Cancel</button></div>`;
  }
  if (combat.interactionMode === "allyTarget") {
    return `<div class="combat-target-prompt"><p>${combat.pendingTargetPrompt ?? "Choose an ally target"}</p><button type="button" data-action="combat-cancel-target">Cancel</button></div>`;
  }
  if (combat.interactionMode === "abilities") {
    const abilities = CombatSystem.availableAbilities(combat, game.expedition);
    const entries = abilities.length > 0
      ? abilities.map((ability) => `<button type="button" data-action="combat-ability" data-ability-id="${ability.id}"><strong>${ability.name}</strong><span>${ability.description ?? ""}</span></button>`).join("")
      : '<p class="combat-empty-menu">No usable abilities.</p>';
    return `<div class="combat-submenu-heading"><p>${activeActor.name}'s Abilities</p><button type="button" data-action="combat-menu-back">Back</button></div><div class="combat-action-grid combat-submenu-list">${entries}</div>`;
  }
  if (combat.interactionMode === "items") {
    const items = CombatSystem.availableItems(combat, game.expedition);
    const entries = items.length > 0
      ? items.map((entry) => `<button type="button" data-action="combat-item" data-item-id="${entry.itemId}"><strong>${entry.item.name} ×${entry.quantity}</strong><span>${entry.item.effects.combat.description}</span></button>`).join("")
      : '<p class="combat-empty-menu">No usable combat items.</p>';
    return `<div class="combat-submenu-heading"><p>${activeActor.name}'s Items</p><button type="button" data-action="combat-menu-back">Back</button></div><div class="combat-action-grid combat-submenu-list">${entries}</div>`;
  }
  const available = CombatSystem.availableActions(combat, game.expedition);
  const buttons = ["attack", "defend", "abilities", "items", "flee"].map((actionId) => {
    const action = COMBAT_ABILITY_DEFINITIONS[actionId];
    const disabled = available.includes(actionId) ? "" : " disabled";
    return `<button type="button" data-action="combat-action" data-combat-action-id="${actionId}"${disabled}><strong>${action.name}</strong>${action.description ? `<span>${action.description}</span>` : ""}</button>`;
  }).join("");
  return `<div class="combat-action-grid">${buttons}</div>`;
}

function combatGaugePercent(combatant) {
  return clamp((combatant.gauge / COMBAT_TUNING.actionGaugeMaximum) * 100, 0, 100);
}

function updateCombatHud() {
  const combat = game.expedition?.combat;
  if (!combat || game.screen !== "expedition") {
    return;
  }
  [...combat.allies, ...combat.enemies].forEach((combatant) => {
    const gauge = document.querySelector(`#combat-gauge-${combatant.id}`);
    if (gauge) {
      gauge.style.width = `${combatGaugePercent(combatant)}%`;
    }
  });
}

function unsecuredItemQuantity(expedition) {
  return (expedition?.unsecuredLoot ?? []).reduce((sum, entry) => sum + (Number(entry.quantity) || 0), 0);
}

function unsecuredMaterialQuantity(expedition) {
  return Object.values(expedition?.unsecuredMaterials ?? {})
    .reduce((sum, quantity) => sum + (Number(quantity) || 0), 0);
}

function renderExpeditionResources(expedition) {
  const itemQuantity = unsecuredItemQuantity(expedition);
  const materialQuantity = unsecuredMaterialQuantity(expedition);
  const totalDiscoveries = itemQuantity + materialQuantity;
  const provisionStatus = ExpeditionRules.returnProvisionStatus(expedition);
  return `
    <div class="resource-grid compact-resources">
      <div class="resource-card"><span>Distance</span><strong id="distance-value">${formatDistance(expedition.distance)}</strong></div>
      <div class="resource-card"><span>Max reached</span><strong id="max-distance-value">${formatDistance(expedition.maxDistanceReached)}</strong></div>
      <div id="provisions-card" class="resource-card provisions-card provision-state-${provisionStatus.state}" data-provision-state="${provisionStatus.state}">
        <span>Provisions</span>
        <strong id="provisions-value">${formatResource(expedition.provisions)}</strong>
      </div>
      <div class="resource-card"><span>Health</span><strong id="health-value">${Math.ceil(expedition.health)} / ${PLAYER_CHARACTER_DEFINITION.combat.maxHp}</strong></div>
      <div class="resource-card unsecured-card">
        <div class="resource-card-heading"><span>Unsecured Loot</span><strong id="loot-count">${totalDiscoveries}</strong></div>
        <div id="loot-breakdown" class="unsecured-breakdown">
          <span>${itemIcon("treasure")}<strong id="loot-item-count">${itemQuantity}</strong> items</span>
          <span>${itemIcon("material")}<strong id="loot-material-count">${materialQuantity}</strong> materials</span>
          <span>${itemIcon("currency")}<strong id="loot-gold-count">${expedition.goldCarried}</strong> gold</span>
        </div>
        <p id="loot-empty-state" class="unsecured-empty" ${totalDiscoveries > 0 || expedition.goldCarried > 0 ? "hidden" : ""}>Nothing found yet</p>
      </div>
    </div>`;
}

function renderEncounterChoice(choice, expedition) {
  const availability = EncounterRequirements.choiceAvailability(choice, {
    expedition,
    player: game.player,
  });
  if (!availability.available && availability.presentation === "hidden") {
    return "";
  }

  const locked = !availability.available;
  return `
    <button class="encounter-choice ${locked ? "is-locked" : ""}" type="button"
      data-action="encounter-choice" data-choice-id="${choice.id}" ${locked ? "disabled" : ""}>
      <strong>${choice.label}</strong>
      ${locked ? `<span>Locked — ${availability.reason}</span>` : ""}
    </button>`;
}

function renderEncounterDebugControls(expedition) {
  if (!DEBUG_ENCOUNTERS_ENABLED) {
    return "";
  }

  const options = Object.values(ENCOUNTER_DEFINITIONS)
    .map((encounter) => `<option value="${encounter.id}">${encounter.title}</option>`)
    .join("");
  return `
    <details class="debug-panel">
      <summary>Encounter Debug</summary>
      <select id="debug-encounter-select" aria-label="Encounter to trigger">${options}</select>
      <div class="debug-actions">
        <button type="button" data-action="debug-trigger-encounter">Trigger Selected</button>
        <button type="button" data-action="debug-next-encounter">Next Encounter Soon</button>
      </div>
      <div class="debug-combat-launcher">
        <select id="debug-combat-select" aria-label="Combat to start">
          <option value="wild_boar">Wild Boar</option>
          <option value="wolves">Three Wolves</option>
        </select>
        <button class="debug-combat-button" type="button" data-action="debug-start-combat">Start Combat</button>
      </div>
      <pre id="debug-state">${debugExpeditionState(expedition)}</pre>
    </details>`;
}

function updateExpedition(deltaSeconds) {
  const expedition = game.expedition;
  if (!expedition || expedition.status !== "active" || expedition.activeEncounter || expedition.combat) {
    return;
  }

  const speedMultiplier = expedition.direction === "returning"
    ? EXPEDITION_TUNING.returnSpeedMultiplier
    : 1;
  const travel = ExpeditionRules.travel(
    expedition,
    game.player,
    EXPEDITION_TUNING.outboundTravelSpeed * speedMultiplier * deltaSeconds,
  );

  if (travel.failureReason) {
    failExpedition(travel.failureReason);
    return;
  }

  if (travel.reachedSafety) {
    completeReturn();
    return;
  }

  if (travel.encounter) {
    renderExpedition();
  }
}

function beginReturn() {
  const expedition = game.expedition;
  if (!expedition
    || expedition.status !== "active"
    || expedition.direction === "returning"
    || expedition.activeEncounter) {
    return;
  }

  ExpeditionRules.beginReturn(expedition);
  announceTravelEvent("The company turns back toward the forest edge.");
  updateTravelHud();
}

function resolveEncounterChoice(choiceId) {
  const expedition = game.expedition;
  if (!expedition?.activeEncounter || expedition.status !== "active") {
    return;
  }

  const result = EncounterManager.resolveChoice(expedition, game.player, choiceId, {
    failExpedition,
    startCombat: (combatId) => startCombat(expedition, combatId),
  });
  if (!result.resolved) {
    return;
  }

  if (result.pending) {
    clearPendingEncounterActionTimer();
    const pendingExpedition = expedition;
    pendingEncounterActionTimer = window.setTimeout(() => {
      pendingEncounterActionTimer = null;
      if (game.expedition !== pendingExpedition || pendingExpedition.status !== "active") {
        return;
      }
      const completed = EncounterManager.completePendingAction(
        pendingExpedition,
        game.player,
        result.pendingToken,
        { failExpedition, startCombat: (combatId) => startCombat(pendingExpedition, combatId) },
      );
      finishEncounterResolution(completed, pendingExpedition);
    }, result.delayMs);
    renderExpedition();
    return;
  }

  finishEncounterResolution(result, expedition);
}

function finishEncounterResolution(result, expedition) {
  if (!result.resolved || expedition.status !== "active") {
    return;
  }

  if (expedition.health <= 0) {
    failExpedition("Arthur was too badly injured to continue the expedition.");
    return;
  }
  if (expedition.provisions <= 0) {
    failExpedition("The company exhausted its provisions during the encounter.");
    return;
  }

  renderExpedition();
}

function startCombat(expedition, combatId, options = {}) {
  if (!expedition || expedition.status !== "active" || expedition.combat) {
    return false;
  }
  const combat = CombatSystem.create(expedition, combatId, options);
  if (!combat) {
    return false;
  }
  expedition.combat = combat;
  return true;
}

function chooseCombatAction(actionId) {
  const expedition = game.expedition;
  const combat = expedition?.combat;
  if (!combat) {
    return;
  }
  const result = CombatSystem.chooseAction(combat, expedition, actionId);
  handleCombatInteractionResult(expedition, combat, result);
}

function chooseCombatTarget(targetId) {
  const expedition = game.expedition;
  const combat = expedition?.combat;
  if (!combat) {
    return;
  }
  if (combat.pendingActionId) {
    const result = CombatSystem.choosePendingTarget(combat, expedition, targetId);
    handleCombatInteractionResult(expedition, combat, result);
    return;
  }
  if (CombatSystem.selectEnemyTarget(combat, targetId).selected) {
    refreshCombat(expedition, combat);
  }
}

function chooseCombatAbility(abilityId) {
  const expedition = game.expedition;
  const combat = expedition?.combat;
  if (!combat) return;
  const result = CombatSystem.chooseAbility(combat, expedition, abilityId);
  handleCombatInteractionResult(expedition, combat, result);
}

function chooseCombatItem(itemId) {
  const expedition = game.expedition;
  const combat = expedition?.combat;
  if (!combat) return;
  const result = CombatSystem.chooseItem(combat, expedition, itemId);
  handleCombatInteractionResult(expedition, combat, result);
}

function handleCombatInteractionResult(expedition, combat, result) {
  if (result?.menu || result?.needsTarget || result?.unavailable) {
    refreshCombat(expedition, combat);
    return;
  }
  if (result?.resolved) {
    if (result.action === "item") {
      const item = ITEM_DEFINITIONS[result.itemId];
      const event = combat.events.at(-1);
      const target = combat.allies.find((ally) => ally.id === result.target);
      showToast({
        title: `Used ${item?.name ?? "Item"}`,
        message: `${target?.name ?? "Ally"} recovered ${event?.healingAmount ?? 0} HP`,
        type: "success",
      });
    }
    finishCombatResolution(expedition);
  }
}

function backCombatMenu() {
  const expedition = game.expedition;
  const combat = expedition?.combat;
  if (combat && CombatSystem.chooseAction(combat, expedition, "back").menu === "main") {
    refreshCombat(expedition, combat);
  }
}

function cancelCombatTargetSelection() {
  const expedition = game.expedition;
  const combat = expedition?.combat;
  if (CombatSystem.cancelTargetSelection(combat)) {
    refreshCombat(expedition, combat);
  }
}

function updateCombat(deltaSeconds) {
  const expedition = game.expedition;
  const combat = expedition?.combat;
  if (!combat) {
    return;
  }
  const update = CombatSystem.update(combat, expedition, deltaSeconds);
  if (update.result) {
    finishCombatResolution(expedition);
  } else if (update.changed) {
    refreshCombat(expedition, combat);
  }
}

function finishCombatResolution(expedition) {
  const combat = expedition.combat;
  if (!combat) {
    return;
  }
  if (!combat.result) {
    refreshCombat(expedition, combat);
    return;
  }
  if (combat.resultHandled) {
    return;
  }
  combat.resultHandled = true;
  const result = combat.result;
  expedition.combat = null;
  EncounterManager.completeCombat(expedition, game.player, result, { failExpedition });
  if (expedition.status === "active") {
    renderExpedition();
  }
}

function refreshCombat(expedition, combat) {
  rerenderPreservingScroll(".combat-panel", () => renderCombat(expedition, combat));
}

function clearPendingEncounterActionTimer() {
  if (pendingEncounterActionTimer !== null) {
    window.clearTimeout(pendingEncounterActionTimer);
    pendingEncounterActionTimer = null;
  }
}

function continueJourney() {
  const expedition = game.expedition;
  if (!expedition || !EncounterManager.continueJourney(expedition)) {
    return;
  }
  renderExpedition();
}

function triggerDebugEncounter() {
  if (!DEBUG_ENCOUNTERS_ENABLED || !game.expedition || game.expedition.activeEncounter) {
    return;
  }
  const encounterId = document.querySelector("#debug-encounter-select")?.value;
  if (EncounterManager.force(game.expedition, encounterId)) {
    renderExpedition();
  }
}

function forceNextEncounter() {
  if (!DEBUG_ENCOUNTERS_ENABLED || !game.expedition || game.expedition.activeEncounter) {
    return;
  }
  EncounterManager.forceNextSoon(game.expedition);
  renderExpedition();
}

function startDebugCombat() {
  const expedition = game.expedition;
  if (!DEBUG_ENCOUNTERS_ENABLED || !expedition || expedition.activeEncounter || expedition.combat) {
    return;
  }
  const combatId = document.querySelector("#debug-combat-select")?.value ?? "wild_boar";
  const encounterId = combatId === "wolves" ? "wolves_in_brush" : "wild_boar";
  const choiceId = combatId === "wolves" ? "stand_ground" : "fight";
  if (EncounterManager.force(expedition, encounterId)) {
    resolveEncounterChoice(choiceId);
  }
}

function completeReturn() {
  const expedition = game.expedition;
  clearPendingEncounterActionTimer();
  expedition.combat = null;
  expedition.status = "returned";
  ExpeditionRules.settle(game.player, expedition, true);
  savePlayer();

  game.summary = {
    outcome: "returned",
    title: "Returned to Safety",
    message: "Every secured discovery from this expedition has been added to Arthur's campaign resources.",
    distance: expedition.maxDistanceReached,
    loot: [...expedition.unsecuredLoot],
    gold: expedition.goldCarried + (expedition.returnRewardContents?.gold ?? 0),
    expeditionGold: expedition.goldCarried,
    materials: { ...expedition.unsecuredMaterials },
    recipes: [...expedition.unsecuredRecipes],
    returnRewardTier: expedition.returnRewardTier,
    returnRewards: cloneRewardBucket(expedition.returnRewardContents),
    provisionsReturned: expedition.provisionsReturned,
  };
  showScreen("summary");
}

function failExpedition(reason) {
  const expedition = game.expedition;
  if (!expedition || expedition.status !== "active") {
    return;
  }

  clearPendingEncounterActionTimer();
  expedition.combat = null;
  expedition.status = "failed";
  ExpeditionRules.settle(game.player, expedition, false);
  savePlayer();

  game.summary = {
    outcome: "failed",
    title: "Expedition Failed",
    message: reason,
    distance: expedition.maxDistanceReached,
    loot: [...expedition.unsecuredLoot],
    gold: expedition.goldCarried,
    expeditionGold: expedition.goldCarried,
    materials: { ...expedition.unsecuredMaterials },
    recipes: [...expedition.unsecuredRecipes],
    returnRewardTier: null,
    returnRewards: createRewardBucket(),
    provisionsReturned: expedition.provisionsReturned,
  };
  showScreen("summary");
}

function cloneRewardBucket(bucket = {}) {
  return {
    items: (bucket.items ?? []).map(({ itemId, quantity }) => ({ itemId, quantity })),
    materials: { ...(bucket.materials ?? {}) },
    recipes: [...(bucket.recipes ?? [])],
    gold: Number(bucket.gold) || 0,
  };
}

function rewardBucketEntries(bucket = {}, statusLabel = "") {
  return [
    ...(bucket.items ?? []).map((entry) => ({ ...entry, type: "item", statusLabel })),
    ...Object.entries(bucket.materials ?? {}).map(([materialId, quantity]) => ({
      type: "material", materialId, quantity, statusLabel,
    })),
    ...(bucket.gold > 0 ? [{ type: "gold", quantity: bucket.gold, statusLabel }] : []),
    ...(bucket.recipes ?? []).map((recipeId) => ({ type: "recipe", recipeId, quantity: 1, statusLabel })),
  ];
}

function rewardDefinition(reward) {
  return reward.type === "item" ? ITEM_DEFINITIONS[reward.itemId]
    : reward.type === "material" ? MATERIAL_DEFINITIONS[reward.materialId]
      : reward.type === "recipe" ? RECIPE_DEFINITIONS[reward.recipeId] : null;
}

function rewardIconKind(reward) {
  if (reward.type === "gold") return "currency";
  if (reward.type === "material") return itemIconKind("material", { ...MATERIAL_DEFINITIONS[reward.materialId], id: reward.materialId, category: "material" });
  if (reward.type === "recipe") return "recipe";
  const definition = rewardDefinition(reward);
  return itemIconKind(definition?.category, definition);
}

function rewardPresentation(reward) {
  const definition = rewardDefinition(reward);
  const rarityRank = RARITY_DEFINITIONS[definition?.rarity ?? "common"]?.rank ?? 0;
  if (reward.type === "recipe" || definition?.questItem || definition?.category === "relic" || rarityRank >= 3
    || (rarityRank >= 2 && definition?.category !== "valuable" && reward.type !== "material")) {
    return "major";
  }
  if (rarityRank >= 1 || ["valuable", "curiosity"].includes(definition?.category)) {
    return "notable";
  }
  return "routine";
}

function rewardDisplayName(reward) {
  return reward.type === "gold" ? "Gold" : rewardDefinition(reward)?.name ?? "Unknown reward";
}

function rewardQuantityLabel(reward) {
  if (reward.type === "gold") return `+${reward.quantity}`;
  return reward.quantity > 1 ? `×${reward.quantity}` : "";
}

function rewardCategoryLabel(reward) {
  const definition = rewardDefinition(reward);
  return reward.type === "gold" ? "Currency"
    : reward.type === "material" ? "Crafting Material"
      : reward.type === "recipe" ? "Recipe" : capitalize(definition?.category ?? "Item");
}

function renderRewardCard(reward, options = {}) {
  const definition = rewardDefinition(reward);
  const rarity = definition?.rarity ?? "common";
  const rarityName = RARITY_DEFINITIONS[rarity]?.name ?? capitalize(rarity);
  const name = rewardDisplayName(reward);
  const description = reward.type === "gold" ? "Coins recovered from the journey."
    : definition?.description ?? "A useful discovery from the road.";
  const quantity = rewardQuantityLabel(reward);
  const statusLabel = reward.statusLabel || (reward.unsecured ? "UNSECURED" : "");
  return `
    <article class="reward-card rarity-${rarity} ${options.variant === "summary" ? "is-summary-highlight" : ""}">
      <div class="reward-icon">${categoryIcon(rewardIconKind(reward))}</div>
      <div class="reward-copy">
        <div class="reward-heading"><strong>${name}</strong>${quantity ? `<span class="reward-quantity">${quantity}</span>` : ""}</div>
        <div class="reward-meta"><span>${rarityName}</span><span>${rewardCategoryLabel(reward)}</span></div>
        <p>${description}</p>
        ${statusLabel ? `<span class="reward-status">${statusLabel}</span>` : ""}
      </div>
    </article>`;
}

function renderRewardCards(rewards = [], options = {}) {
  if (rewards.length === 0) {
    return `<p class="empty-rewards">${options.emptyMessage ?? "No rewards this time."}</p>`;
  }
  return `<div class="reward-card-list">${rewards.map((reward) => renderRewardCard(reward, options)).join("")}</div>`;
}

function renderCompactRewardRow(reward) {
  const definition = rewardDefinition(reward);
  const rarity = definition?.rarity ?? "common";
  const statusLabel = reward.statusLabel || "";
  return `<li class="summary-reward-row ${rewardPresentation(reward) === "notable" ? "is-notable" : ""}">
    <span class="summary-reward-icon">${categoryIcon(rewardIconKind(reward))}</span>
    <span class="summary-reward-name">${rewardDisplayName(reward)}</span>
    <strong>${rewardQuantityLabel(reward)}</strong>
    ${rewardPresentation(reward) === "notable" ? `<em>${RARITY_DEFINITIONS[rarity]?.name ?? capitalize(rarity)}</em>` : ""}
    ${statusLabel ? `<small>${statusLabel}</small>` : ""}
  </li>`;
}

function renderSummaryRewardCollection(rewards = [], options = {}) {
  if (rewards.length === 0) {
    return `<p class="empty-rewards">${options.emptyMessage ?? "No rewards this time."}</p>`;
  }
  const routineAndNotable = rewards.filter((reward) => rewardPresentation(reward) !== "major");
  const major = rewards.filter((reward) => rewardPresentation(reward) === "major");
  const groups = [
    ["Items", routineAndNotable.filter((reward) => reward.type === "item")],
    ["Materials", routineAndNotable.filter((reward) => reward.type === "material")],
    ["Gold", routineAndNotable.filter((reward) => reward.type === "gold")],
  ].filter(([, group]) => group.length > 0);
  return `<div class="summary-reward-collection">${groups.map(([label, group]) => `<div class="summary-reward-group"><h3>${label}</h3><ul class="summary-reward-list">${group.map(renderCompactRewardRow).join("")}</ul></div>`).join("")}
    ${major.length > 0 ? `<div class="summary-major-rewards"><h3>Highlighted Discoveries</h3>${renderRewardCards(major, { variant: "summary" })}</div>` : ""}</div>`;
}

function renderSummary() {
  const summary = game.summary;
  const returned = summary.outcome === "returned";
  const expeditionRewards = [
    ...summary.loot.map((entry) => ({ ...entry, type: "item", statusLabel: returned ? "SECURED" : "LOST" })),
    ...Object.entries(summary.materials ?? {}).map(([materialId, quantity]) => ({
      type: "material", materialId, quantity, statusLabel: returned ? "SECURED" : "LOST",
    })),
    ...(summary.expeditionGold > 0 ? [{ type: "gold", quantity: summary.expeditionGold, statusLabel: returned ? "SECURED" : "LOST" }] : []),
    ...(summary.recipes ?? []).map((recipeId) => ({
      type: "recipe", recipeId, quantity: 1, statusLabel: returned ? "LEARNED" : "LOST",
    })),
  ];
  const returnRewards = rewardBucketEntries(summary.returnRewards, "RETURN REWARD");

  ui.screenRoot.innerHTML = `
    <section class="screen summary-screen ${returned ? "is-success" : "is-failure"}" aria-labelledby="summary-title">
      <div class="summary-emblem" aria-hidden="true">${returned ? "♜" : "♞"}</div>
      <div class="screen-heading">
        <p class="eyebrow">Expedition Report</p>
        <h1 id="summary-title">${summary.title}</h1>
        <p>${summary.message}</p>
      </div>

      <div class="summary-card">
        <p><span>Farthest distance</span><strong>${formatDistance(summary.distance)}</strong></p>
        <p><span>${returned ? "Gold banked" : "Gold lost"}</span><strong>${summary.gold}</strong></p>
        <p><span>Provisions returned</span><strong>${summary.provisionsReturned}</strong></p>
        ${returned ? `<p><span>Return reward tier</span><strong>${capitalize(summary.returnRewardTier ?? "minor")}</strong></p>` : ""}

        <section class="summary-reward-section" aria-labelledby="expedition-haul-title">
          <div class="summary-reward-heading"><strong id="expedition-haul-title">Expedition Haul</strong><span>${returned ? "Secured on return" : "Lost with the expedition"}</span></div>
          ${renderSummaryRewardCollection(expeditionRewards, { emptyMessage: returned ? "No discoveries from the expedition." : "No unsecured discoveries were lost." })}
        </section>

        ${returned ? `
          <section class="summary-reward-section return-reward-section" aria-labelledby="return-reward-title">
            <div class="summary-reward-heading"><strong id="return-reward-title">${capitalize(summary.returnRewardTier ?? "minor")} Return Reward</strong><span>Distance-tier bonus</span></div>
            ${renderSummaryRewardCollection(returnRewards, { emptyMessage: "No additional return reward this time." })}
          </section>` : ""}

        <p class="protected-note">Your original equipment and companion remain available.</p>
      </div>

      <div class="footer-actions summary-actions">
        <button class="game-button" type="button" data-action="new-expedition">Return to Village</button>
      </div>
    </section>`;
}

function updateTravelHud() {
  const expedition = game.expedition;
  if (game.screen !== "expedition" || !expedition) {
    return;
  }

  setText("#distance-value", formatDistance(expedition.distance));
  setText("#max-distance-value", formatDistance(expedition.maxDistanceReached));
  setText("#provisions-value", formatResource(expedition.provisions));
  const provisionStatus = ExpeditionRules.returnProvisionStatus(expedition);
  const provisionsCard = document.querySelector("#provisions-card");
  provisionsCard?.classList.remove(
    "provision-state-safe",
    "provision-state-warning",
    "provision-state-danger",
  );
  provisionsCard?.classList.add(`provision-state-${provisionStatus.state}`);
  if (provisionsCard) {
    provisionsCard.dataset.provisionState = provisionStatus.state;
  }
  setText("#health-value", `${Math.ceil(expedition.health)} / ${PLAYER_CHARACTER_DEFINITION.combat.maxHp}`);
  const itemQuantity = unsecuredItemQuantity(expedition);
  const materialQuantity = unsecuredMaterialQuantity(expedition);
  const totalDiscoveries = itemQuantity + materialQuantity;
  setText("#loot-count", totalDiscoveries);
  setText("#loot-item-count", itemQuantity);
  setText("#loot-material-count", materialQuantity);
  setText("#loot-gold-count", expedition.goldCarried);
  document.querySelector("#loot-empty-state")?.toggleAttribute(
    "hidden", totalDiscoveries > 0 || expedition.goldCarried > 0,
  );

  const returning = expedition.direction === "returning";
  const activeEncounter = expedition.activeEncounter
    ? ENCOUNTER_DEFINITIONS[expedition.activeEncounter.encounterId]
    : null;
  const directionBanner = document.querySelector("#direction-banner");
  const travelers = document.querySelector("#travelers");
  const returnButton = document.querySelector("#return-button");
  const progressFill = document.querySelector("#distance-progress");
  const scene = document.querySelector("#travel-scene");

  if (directionBanner) {
    directionBanner.textContent = activeEncounter
      ? `Encounter: ${activeEncounter.title}`
      : returning ? "← Returning to Safety" : "Traveling Outbound →";
  }
  travelers?.classList.toggle("is-returning", returning);
  travelers?.classList.toggle("is-paused", Boolean(activeEncounter));
  if (returnButton) {
    returnButton.disabled = returning;
    returnButton.textContent = returning ? "Returning…" : "Return to Safety";
  }
  if (progressFill) {
    const denominator = Math.max(expedition.maxDistanceReached, 1);
    progressFill.style.width = `${clamp((expedition.distance / denominator) * 100, 0, 100)}%`;
  }
  if (scene) {
    scene.classList.toggle("is-paused", Boolean(activeEncounter));
    scene.style.setProperty("--travel-offset", `${expedition.sceneOffset % 160}px`);
  }
  setText("#path-value", pathLabel(expedition.currentPathId));
  setText("#debug-state", debugExpeditionState(expedition));
}

function renderItemChip(itemId, quantity = 1, className = "") {
  const item = ITEM_DEFINITIONS[itemId];
  if (!item) return "";
  return `<span class="run-item-chip ${className}">${itemIcon(item.category, item)}<span>${item.name}</span>${quantity > 1 ? `<strong>×${quantity}</strong>` : ""}</span>`;
}

function renderItemChips(entries = [], emptyLabel = "None") {
  const chips = entries
    .filter((entry) => ITEM_DEFINITIONS[entry.itemId])
    .map((entry) => renderItemChip(entry.itemId, entry.quantity ?? 1))
    .filter(Boolean)
    .join("");
  return chips || `<span class="item-list-empty">${emptyLabel}</span>`;
}

function renderDiscoveryList(expedition) {
  const itemChips = (expedition?.unsecuredLoot ?? [])
    .map(({ itemId, quantity }) => renderItemChip(itemId, quantity, "loot-chip"))
    .join("");
  const materialChips = Object.entries(expedition?.unsecuredMaterials ?? {})
    .filter(([, quantity]) => quantity > 0)
    .map(([materialId, quantity]) => `<span class="run-item-chip loot-chip">${itemIcon("material", { ...MATERIAL_DEFINITIONS[materialId], id: materialId, category: "material" })}<span>${MATERIAL_DEFINITIONS[materialId]?.name ?? materialId}</span><strong>×${quantity}</strong></span>`)
    .join("");
  const goldChip = expedition?.goldCarried > 0
    ? `<span class="run-item-chip loot-chip loot-chip-gold">${categoryIcon("currency")}<span>Gold</span><strong>+${expedition.goldCarried}</strong></span>`
    : "";
  return itemChips + materialChips + goldChip
    || '<p class="empty-loot">No discoveries yet. Travel farther into the forest.</p>';
}

function renderLootList(loot) {
  return renderDiscoveryList({ unsecuredLoot: loot });
}

function announceTravelEvent(message) {
  setText("#travel-message", message);
  const lootList = document.querySelector("#loot-list");
  if (lootList) {
    lootList.innerHTML = renderDiscoveryList(game.expedition);
  }
}

function savePlayer() {
  const saved = SaveSystem.save(game.player);
  ui.saveStatus.textContent = saved ? "Saved locally" : "Save unavailable";
}

function resetSave() {
  if (!window.confirm("Reset all local progress and restore the prototype's starting inventory?")) {
    return;
  }

  game.player = SaveSystem.reset();
  game.expedition = null;
  game.summary = null;
  game.activeDestinationId = null;
  game.preparationMode = "expedition";
  game.shopTab = "buy";
  game.provisionShopStock = createProvisionShopStock();
  game.itemShopStock = createItemShopStock();
  game.dialogueMessage = "";
  game.preparationSupplies = Math.min(18, game.player.provisions);
  savePlayer();
  showScreen("campaign");
}

const CATEGORY_ICON_MARKUP = Object.freeze({
  weapon: '<path d="m14.5 3.5 6-1.5-1.5 6-8.8 8.8-2.9-2.9 8.8-8.8Z"/><path d="m5.6 14.4-2.1 2.1m4.2 1-2.1 2.1m4.2-1-2.1 2.1"/>',
  armor: '<path d="M12 3 19 6v5.3c0 4.5-2.8 7.6-7 9.7-4.2-2.1-7-5.2-7-9.7V6l7-3Z"/><path d="M8.5 12h7M12 8.5v7"/>',
  potion: '<path d="M9 3h6M10 3v4l-3.2 5.1A4 4 0 0 0 10.2 18h3.6a4 4 0 0 0 3.4-5.9L14 7V3"/><path d="M8.2 12h7.6"/>',
  healing: '<path d="M8 5.2 12 3l4 2.2v5.1c0 3-1.7 5.4-4 7.2-2.3-1.8-4-4.2-4-7.2V5.2Z"/><path d="M12 7.2v5.2m-2.6-2.6h5.2"/>',
  herb: '<path d="M12 20V9"/><path d="M12 13C8 13 5 11 5 6c4.8 0 7 2.5 7 7Zm0-3c0-4 2.5-6 7-6 0 4.5-2.3 6-7 6Z"/>',
  wood: '<path d="M5 5h14v5H5zM7 10v9m10-9v9M4 19h16"/><path d="M8 7h8"/>',
  material: '<path d="m5 8 7-4 7 4-7 4-7-4Z"/><path d="m5 8v8l7 4 7-4V8M8.5 10l7-4"/>',
  currency: '<circle cx="12" cy="12" r="8"/><path d="M14.5 9.2c-.5-.7-1.3-1.1-2.5-1.1-1.3 0-2.2.7-2.2 1.6 0 2.4 4.8 1 4.8 3.6 0 1-.9 1.7-2.4 1.7-1.2 0-2.2-.4-2.8-1.2M12 6.7v10.6"/>',
  gem: '<path d="m4 9 3.5-5h9L20 9l-8 10L4 9Z"/><path d="M4 9h16M8 4l4 15 4-15M7.5 9h9"/>',
  relic: '<circle cx="12" cy="12" r="8"/><path d="M12 7v10M8.5 10.5h7M8.5 13.5h7"/>',
  recipe: '<path d="M6 4h11a2 2 0 0 1 2 2v13H8a2 2 0 0 1-2-2V4Z"/><path d="M6 17a2 2 0 0 0 2 2M9 8h7M9 11h7M9 14h4"/>',
  rope: '<path d="M7 5c-2.5 0-3.5 2.8-1.5 4.3l7.2 5.4c2 1.5 1 4.3-1.5 4.3-1.8 0-3.1-1.1-3.1-2.7 0-1.1.6-1.9 1.3-2.4"/><path d="M17 19c2.5 0 3.5-2.8 1.5-4.3l-7.2-5.4c-2-1.5-1-4.3 1.5-4.3 1.8 0 3.1 1.1 3.1 2.7 0 1.1-.6 1.9-1.3 2.4"/>',
  torch: '<path d="M10 12.5h4l1.2 7H8.8l1.2-7Z"/><path d="M12 3c2.8 2.3 3.4 4.2 1.7 6.2-.8.9-1.8 1.4-1.7 3.3-2.8-1.4-3.1-4-.9-6.4.4-.5.8-1.4.9-3.1Z"/>',
  tool: '<path d="m14.5 5.5 4 4M13 7l4-4 2 2-4 4M4 20l7.8-7.8 2 2L6 22H4v-2Z"/>',
  treasure: '<path d="M4 9h16v10H4z"/><path d="M4 9 6 5h12l2 4M9 13h6M12 10v6"/>',
  curiosity: '<path d="M12 3.5 14 8l4.5 2-4.5 2-2 4.5-2-4.5-4.5-2 4.5-2 2-4.5Z"/><circle cx="18.5" cy="5.5" r="1.2"/>',
});

function categoryIcon(kind, className = "") {
  const iconId = CATEGORY_ICON_MARKUP[kind] ? kind : "curiosity";
  return `<svg class="category-icon ${className}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${CATEGORY_ICON_MARKUP[iconId]}</svg>`;
}

function itemIconKind(category, item = null) {
  const definition = item && typeof item === "object" ? item : { category };
  const tags = definition.tags ?? [];
  const id = definition.id ?? "";
  if (category === "material" || definition.category === "material") {
    if (id.includes("herb")) return "herb";
    if (id === "wood") return "wood";
    return "material";
  }
  if (category === "currency") return "currency";
  if (category === "recipe") return "recipe";
  if (category === "weapon") return "weapon";
  if (category === "armor") return "armor";
  if (id === "rope") return "rope";
  if (id === "torch") return "torch";
  if (tags.includes("medical")) return "healing";
  if (tags.includes("herbal") || tags.includes("plant")) return "herb";
  if (tags.includes("tool") || category === "supply") return "tool";
  if (category === "consumable") return tags.includes("alchemical") ? "potion" : "healing";
  if (category === "relic") return "relic";
  if (category === "valuable") return tags.includes("coin") ? "currency" : tags.includes("silver") ? "gem" : "treasure";
  if (category === "curiosity") return "curiosity";
  return category === "gear" ? "tool" : "curiosity";
}

function itemIcon(category, item = null) {
  return categoryIcon(itemIconKind(category, item));
}

function debugExpeditionState(expedition) {
  return JSON.stringify({
    ownedInventory: game.player.ownedItems,
    equippedGear: expedition.selectedEquipment,
    packedItems: expedition.carriedItems,
    unsecuredLoot: expedition.unsecuredLoot,
    consumedItems: expedition.consumedItems,
    path: expedition.currentPathId,
    direction: expedition.direction,
    distance: Number(expedition.distance.toFixed(2)),
    provisions: Number(expedition.provisions.toFixed(2)),
    provisionCapacity: expedition.provisionCapacity,
    provisionConsumptionMultiplier: expedition.provisionConsumptionMultiplier,
    carriedProvisions: expedition.carriedProvisions,
    health: expedition.health,
    nextEncounterIn: Number(Math.max(
      expedition.nextEncounterAt - expedition.encounterTravelDistance,
      0,
    ).toFixed(2)),
    seen: expedition.seenEncounterIds,
    flags: expedition.runFlags,
  }, null, 2);
}

function formatDistance(distance) {
  return `${distance.toFixed(1)} leagues`;
}

function formatResource(value) {
  return Math.max(value, 0).toFixed(1);
}

function formatCarriedItems(carriedItems) {
  const entries = Object.entries(carriedItems)
    .filter(([, quantity]) => quantity > 0)
    .map(([itemId, quantity]) => ({ itemId, quantity }));
  return renderItemChips(entries, "Nothing carried");
}

function setText(selector, text) {
  const element = document.querySelector(selector);
  if (element) {
    element.textContent = text;
  }
}

function capitalize(value) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function gameLoop(timestamp) {
  if (game.lastTimestamp === null) {
    game.lastTimestamp = timestamp;
  }

  const deltaSeconds = Math.min((timestamp - game.lastTimestamp) / 1000, 0.1);
  game.lastTimestamp = timestamp;
  game.elapsedSeconds += deltaSeconds;

  if (game.screen === "expedition") {
    if (game.expedition?.combat) {
      updateCombat(deltaSeconds);
    } else {
      updateExpedition(deltaSeconds);
    }
    game.hudAccumulator += deltaSeconds;
    if (game.hudAccumulator >= 0.05) {
      if (game.expedition?.combat) {
        updateCombatHud();
      } else {
        updateTravelHud();
      }
      game.hudAccumulator = 0;
    }
  }

  requestAnimationFrame(gameLoop);
}

initializeGame();
