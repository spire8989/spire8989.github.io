"use strict";

// Add ?debug=1 to the URL to expose temporary encounter testing controls.
const DEBUG_ENCOUNTERS_ENABLED = new URLSearchParams(window.location.search).has("debug");

const game = {
  player: SaveSystem.load(),
  expedition: null,
  screen: "campaign",
  preparationSupplies: 18,
  preparationMode: "expedition",
  activeDestinationId: null,
  preparationReturnDestinationId: "forest_gate",
  shopTab: "buy",
  provisionShopStock: createProvisionShopStock(),
  interactionMessage: "",
  summary: null,
  elapsedSeconds: 0,
  lastTimestamp: null,
  hudAccumulator: 0,
};

const ui = {
  screenRoot: document.querySelector("#screen-root"),
  saveStatus: document.querySelector("#save-status"),
};

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

  const { action, itemId, companionId, choiceId, destinationId } = control.dataset;

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
    case "shop-tab":
      game.shopTab = control.dataset.tab === "sell" ? "sell" : "buy";
      game.interactionMessage = "";
      renderDestination();
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
    case "view-inventory":
      game.preparationMode = "inventory";
      showScreen("preparation");
      break;
    case "prepare-expedition":
      game.preparationMode = "expedition";
      game.preparationReturnDestinationId = "forest_gate";
      game.preparationSupplies = Math.min(
        Math.max(game.preparationSupplies, EXPEDITION_TUNING.minimumStartingProvisions),
        game.player.provisions,
        EXPEDITION_TUNING.maximumStartingProvisions,
      );
      showScreen("preparation");
      break;
    case "return-from-preparation":
      if (game.preparationMode === "expedition" && game.preparationReturnDestinationId) {
        openDestination(game.preparationReturnDestinationId);
      } else {
        showLocation();
      }
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
    case "debug-trigger-encounter":
      triggerDebugEncounter();
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
  game.activeDestinationId = null;
  game.interactionMessage = "";
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
      <div class="location-scene" aria-label="Village scene with four destinations">
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
        </div>
        <div class="hub-actions">
          <button class="text-button" type="button" data-action="show-campaign">Chapter Select</button>
          <button class="game-button" type="button" data-action="view-inventory">Inventory / Pack</button>
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
  game.interactionMessage = "";
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

  if (destination.type === "expedition_gate") {
    interaction = renderForestGateInteraction();
  } else if (destination.shopId) {
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
          ${game.interactionMessage ? `<div class="interaction-message" aria-live="polite">${game.interactionMessage}</div>` : ""}
          ${interaction}
        </div>
      </div>
    </section>`;
}

function renderInnInteraction(destination, npc) {
  return `
    <article class="npc-card">
      <div><strong>${npc.name}</strong><span>${npc.role}</span></div>
      <p>${npc.description}</p>
    </article>
    <div class="interaction-actions">
      <button class="small-button" type="button" data-action="npc-talk" data-npc-id="${npc.id}">Talk</button>
      <button class="small-button" type="button" data-action="hear-rumor" data-npc-id="${npc.id}">Hear Rumor</button>
    </div>`;
}

function renderShopInteraction(destination, npc) {
  const shop = SHOP_DEFINITIONS[destination.shopId];
  const buySelected = game.shopTab === "buy";
  const rows = buySelected
    ? Object.entries(shop.itemsForSale).map(([itemId, offer]) => shopBuyRow(itemId, offer)).join("")
    : Object.entries(game.player.ownedItems).map(([itemId, quantity]) => shopSellRow(shop, itemId, quantity)).join("");
  const provisionOffer = buySelected && shop.provisionsForSale
    ? renderProvisionOffer(shop, shop.provisionsForSale)
    : "";

  return `
    <div class="shopkeeper-row">
      <div><strong>${npc.name}</strong><span>${npc.role}</span></div>
      <span class="gold-display">${Math.floor(game.player.currentGold)} gold</span>
    </div>
    <div class="shop-tabs" role="tablist" aria-label="Shop actions">
      <button class="${buySelected ? "is-selected" : ""}" type="button" role="tab" aria-selected="${buySelected}" data-action="shop-tab" data-tab="buy">Buy</button>
      <button class="${!buySelected ? "is-selected" : ""}" type="button" role="tab" aria-selected="${!buySelected}" data-action="shop-tab" data-tab="sell">Sell</button>
      <button type="button" data-action="npc-talk" data-npc-id="${npc.id}">Talk</button>
    </div>
    ${provisionOffer}
    <div class="shop-list">${rows || '<p class="empty-loot">Nothing available.</p>'}</div>`;
}

function renderForestGateInteraction() {
  return `
    <div class="gate-status">
      <p><span>Current region</span><strong>Brocéliande</strong></p>
      <article><div><strong>Expedition</strong><span>Available</span></div><button class="game-button" type="button" data-action="prepare-expedition">Prepare Expedition</button></article>
      <article class="is-locked"><div><strong>Campaign Quest</strong><span>Not Yet Available</span></div><button class="small-button" type="button" disabled>Locked</button></article>
    </div>`;
}

function renderProvisionOffer(shop, offer) {
  const stock = game.provisionShopStock[shop.id] ?? 0;
  const affordableMaximum = Math.min(stock, Math.floor(game.player.currentGold / offer.price));
  return `
    <article class="provision-offer">
      <div><strong>Provisions</strong><span>Owned: ${game.player.provisions} · ${offer.price} gold each · ${stock} available</span></div>
      <div class="provision-buy-actions">
        ${[1, 5, 10].map((quantity) => `<button class="small-button" type="button" data-action="buy-provisions" data-quantity="${quantity}" ${affordableMaximum < quantity ? "disabled" : ""}>Buy ${quantity}</button>`).join("")}
      </div>
    </article>`;
}

function shopBuyRow(itemId, offer) {
  const item = ITEM_DEFINITIONS[itemId];
  const ownedUnique = item.unique && Boolean(game.player.ownedItems[itemId]);
  const affordable = game.player.currentGold >= offer.price;
  return `
    <article class="shop-item-row ${ownedUnique ? "is-blocked" : ""}">
      <div class="item-icon" aria-hidden="true">${itemIcon(item.category)}</div>
      <div><strong>${item.name}</strong><span>${ownedUnique ? "Owned · unique equipment" : item.description}</span></div>
      <button class="small-button" type="button" data-action="buy-item" data-item-id="${itemId}" ${affordable && !ownedUnique ? "" : "disabled"}>${ownedUnique ? "Owned" : `Buy · ${offer.price}g`}</button>
    </article>`;
}

function shopSellRow(shop, itemId, quantity) {
  const item = ITEM_DEFINITIONS[itemId];
  const reason = itemSaleBlockReason(shop, item);
  const value = shop.sellValues[itemId];
  return `
    <article class="shop-item-row ${reason ? "is-blocked" : ""}">
      <div class="item-icon" aria-hidden="true">${itemIcon(item.category)}</div>
      <div><strong>${item.name}${quantity > 1 ? ` ×${quantity}` : ""}</strong><span>${reason || `${value} gold each`}</span></div>
      <button class="small-button" type="button" data-action="sell-item" data-item-id="${itemId}" ${reason ? "disabled" : ""}>${reason ? "Cannot Sell" : `Sell · ${value}g`}</button>
    </article>`;
}

function itemSaleBlockReason(shop, item) {
  if (item.questItem || item.protected || item.sellable === false) {
    return "Protected special item";
  }
  if (Object.values(game.player.equippedItems).includes(item.id)) {
    return "Currently equipped";
  }
  if (game.player.packedItems.includes(item.id)) {
    return "Currently packed";
  }
  if (!shopAcceptsItem(shop, item) || !Number.isFinite(shop.sellValues[item.id])) {
    return "This vendor does not buy this item";
  }
  return "";
}

function shopAcceptsItem(shop, item) {
  return shop.acceptedCategories.includes(item.category)
    || item.tags.some((tag) => shop.acceptedTags.includes(tag));
}

function buyShopItem(itemId) {
  const destination = DESTINATION_DEFINITIONS[game.activeDestinationId];
  const shop = SHOP_DEFINITIONS[destination?.shopId];
  const offer = shop?.itemsForSale[itemId];
  const item = ITEM_DEFINITIONS[itemId];
  if (!item || !offer || !Number.isFinite(offer.price)
    || game.player.currentGold < offer.price
    || (item.unique && game.player.ownedItems[itemId])) {
    return;
  }
  game.player.currentGold -= offer.price;
  game.player.ownedItems[itemId] = (game.player.ownedItems[itemId] ?? 0) + 1;
  game.interactionMessage = `Purchased ${item.name} for ${offer.price} gold.`;
  savePlayer();
  renderDestination();
}

function buyProvisions(quantity) {
  const destination = DESTINATION_DEFINITIONS[game.activeDestinationId];
  const shop = SHOP_DEFINITIONS[destination?.shopId];
  const offer = shop?.provisionsForSale;
  const totalPrice = offer?.price * quantity;
  const stock = game.provisionShopStock[shop?.id] ?? 0;
  if (!offer || !Number.isInteger(quantity) || quantity <= 0
    || quantity > stock || game.player.currentGold < totalPrice) {
    return;
  }
  game.player.currentGold -= totalPrice;
  game.player.provisions += quantity;
  game.provisionShopStock[shop.id] -= quantity;
  game.interactionMessage = `Purchased ${quantity} provision${quantity === 1 ? "" : "s"} for ${totalPrice} gold.`;
  savePlayer();
  renderDestination();
}

function sellShopItem(itemId) {
  const destination = DESTINATION_DEFINITIONS[game.activeDestinationId];
  const shop = SHOP_DEFINITIONS[destination?.shopId];
  const item = ITEM_DEFINITIONS[itemId];
  if (!shop || !item || !game.player.ownedItems[itemId] || itemSaleBlockReason(shop, item)) {
    return;
  }
  const price = shop.sellValues[itemId];
  game.player.ownedItems[itemId] -= 1;
  if (game.player.ownedItems[itemId] <= 0) {
    delete game.player.ownedItems[itemId];
  }
  game.player.currentGold += price;
  game.interactionMessage = `Sold ${item.name} for ${price} gold.`;
  savePlayer();
  renderDestination();
}

function showNpcDialogue(npcId, field) {
  const npc = NPC_DEFINITIONS[npcId];
  const lines = npc?.[field];
  if (!Array.isArray(lines) || lines.length === 0) {
    game.interactionMessage = `${npc?.name ?? "The villager"} has nothing more to add.`;
  } else {
    game.interactionMessage = `“${lines[Math.floor(Math.random() * lines.length)]}”`;
  }
  renderDestination();
}

function inventoryQuantity() {
  return Object.values(game.player.ownedItems).reduce((total, quantity) => total + quantity, 0);
}

function createProvisionShopStock() {
  return Object.fromEntries(
    Object.values(SHOP_DEFINITIONS)
      .filter((shop) => shop.provisionsForSale)
      .map((shop) => [shop.id, shop.provisionsForSale.stock]),
  );
}

function destinationIcon(type) {
  return ({ inn: "⌂", shop: "◆", expedition_gate: "♞" })[type] ?? "•";
}

function renderPreparation() {
  const expeditionPreparation = game.preparationMode === "expedition";
  const inventory = Object.entries(game.player.ownedItems)
    .map(([itemId, quantity]) => inventoryCard(ITEM_DEFINITIONS[itemId], quantity))
    .join("");
  const companions = game.player.unlockedCompanions
    .map((companionId) => companionCard(COMPANION_DEFINITIONS[companionId]))
    .join("");
  const equipment = ["weapon", "armor", "relic"]
    .map((slot) => equipmentSlotCard(slot, game.player.equippedItems[slot]))
    .join("");
  const packedItems = game.player.packedItems
    .map((itemId) => packItemCard(ITEM_DEFINITIONS[itemId], game.player.ownedItems[itemId]))
    .join("");
  const emptyPackSlots = EXPEDITION_TUNING.packSlots - game.player.packedItems.length;

  ui.screenRoot.innerHTML = `
    <section class="screen preparation-screen" aria-labelledby="preparation-title">
      <div class="screen-heading compact-heading">
        <p class="eyebrow">Chapter III — Brocéliande</p>
        <h1 id="preparation-title">${expeditionPreparation ? "Prepare the Company" : "Inventory & Pack"}</h1>
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

      ${expeditionPreparation ? `<section class="preparation-section" aria-labelledby="companion-title">
        <h2 id="companion-title">Companion</h2>
        <div class="choice-list">${companions}</div>
      </section>

      <section class="preparation-section supplies-section" aria-labelledby="supplies-title">
        <div>
          <h2 id="supplies-title">Provisions</h2>
          <p>Owned: <strong>${game.player.provisions}</strong> · Choose how many to carry.</p>
        </div>
        <div class="stepper" aria-label="Choose provisions">
          <button type="button" data-action="change-supplies" data-amount="-5" aria-label="Remove five provisions">−5</button>
          <button type="button" data-action="change-supplies" data-amount="-1" aria-label="Remove one provision">−</button>
          <strong>${game.preparationSupplies}</strong>
          <button type="button" data-action="change-supplies" data-amount="1" aria-label="Add one provision">+</button>
          <button type="button" data-action="change-supplies" data-amount="5" aria-label="Add five provisions">+5</button>
        </div>
      </section>` : ""}

      <div class="footer-actions">
        <button class="text-button" type="button" data-action="return-from-preparation">Back</button>
        ${expeditionPreparation ? `<button class="game-button" type="button" data-action="start-expedition" ${game.preparationSupplies > 0 ? "" : "disabled"}>Begin Expedition</button>` : ""}
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
      <div class="item-icon" aria-hidden="true">${itemIcon(item.category)}</div>
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
  const selected = game.player.selectedCompanion === companion.id;
  return `
    <button class="choice-card ${selected ? "is-selected" : ""}" type="button" data-action="select-companion" data-companion-id="${companion.id}">
      <strong>${companion.name}</strong>
      <span>${companion.description}</span>
    </button>`;
}

function equipItem(itemId) {
  const item = ITEM_DEFINITIONS[itemId];
  if (!item?.equippable || !game.player.ownedItems[itemId]) {
    return;
  }

  game.player.equippedItems[item.equipmentSlot] = itemId;
  game.player.packedItems = game.player.packedItems.filter((packedItemId) => packedItemId !== itemId);
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
  } else if (game.player.packedItems.length < EXPEDITION_TUNING.packSlots) {
    game.player.packedItems.push(itemId);
  }
  savePlayer();
  refreshPreparation();
}

function selectCompanion(companionId) {
  if (!game.player.unlockedCompanions.includes(companionId)) {
    return;
  }

  game.player.selectedCompanion = companionId;
  savePlayer();
  refreshPreparation();
}

function changeSupplies(amount) {
  if (game.preparationMode !== "expedition") {
    return;
  }
  game.preparationSupplies = clamp(
    game.preparationSupplies + amount,
    0,
    Math.min(EXPEDITION_TUNING.maximumStartingProvisions, game.player.provisions),
  );
  refreshPreparation();
}

function refreshPreparation() {
  const scrollTop = document.querySelector(".preparation-screen")?.scrollTop ?? 0;
  renderPreparation();
  const refreshedScreen = document.querySelector(".preparation-screen");
  if (refreshedScreen) {
    refreshedScreen.scrollTop = scrollTop;
  }
}

function startExpedition() {
  if (game.preparationMode !== "expedition"
    || game.preparationSupplies <= 0
    || game.preparationSupplies > game.player.provisions) {
    return;
  }
  const committedProvisions = game.preparationSupplies;
  game.player.provisions -= committedProvisions;
  savePlayer();
  game.expedition = {
    regionId: "broceliande",
    originLocationId: game.player.currentLocationId,
    currentPathId: "old_forest_road",
    distance: 0,
    maxDistanceReached: 0,
    direction: "outbound",
    provisions: committedProvisions,
    committedProvisions,
    committedProvisionsRemaining: committedProvisions,
    foundProvisions: 0,
    provisionsSettled: false,
    health: 100,
    goldCarried: 0,
    selectedEquipment: { ...game.player.equippedItems },
    selectedCompanion: game.player.selectedCompanion,
    carriedItems: createExpeditionCarriedItems(),
    consumedItems: {},
    consumablesSettled: false,
    unsecuredLoot: [],
    sceneOffset: 0,
    status: "active",
  };
  EncounterManager.initializeExpedition(game.expedition);
  showScreen("expedition");
}

function renderExpedition() {
  const expedition = game.expedition;
  const companion = COMPANION_DEFINITIONS[expedition.selectedCompanion];
  const activeEncounter = expedition.activeEncounter
    ? ENCOUNTER_DEFINITIONS[expedition.activeEncounter.encounterId]
    : null;
  const loadout = Object.values(expedition.selectedEquipment)
    .map((itemId) => ITEM_DEFINITIONS[itemId]?.name)
    .filter(Boolean)
    .join(" · ");

  ui.screenRoot.innerHTML = `
    <section class="screen expedition-screen" aria-label="Brocéliande expedition">
      <div class="visual-frame travel-scene ${activeEncounter ? "is-paused" : ""}" id="travel-scene">
        <div class="moon" aria-hidden="true"></div>
        <div class="forest forest-far" aria-hidden="true"></div>
        <div class="forest forest-near" aria-hidden="true"></div>
        <div class="travelers" id="travelers" aria-hidden="true">
          <span class="arthur">♞</span><span class="companion">♞</span>
        </div>
        <div class="ground" aria-hidden="true"></div>
        <div class="direction-banner" id="direction-banner">${activeEncounter ? `Encounter: ${activeEncounter.title}` : "Traveling Outbound →"}</div>
      </div>
      ${activeEncounter
        ? renderEncounterPanel(expedition, activeEncounter)
        : renderTravelPanel(expedition, companion, loadout)}
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
        <p><span>Company</span><strong>Arthur &amp; ${companion.name}</strong></p>
        <p><span>Path</span><strong id="path-value">${pathLabel(expedition.currentPathId)}</strong></p>
        <p><span>Loadout</span><strong>${loadout || "No equipment selected"}</strong></p>
        <p><span>Carried</span><strong>${formatCarriedItems(expedition.carriedItems)}</strong></p>
        <div id="loot-list" class="loot-list">${renderLootList(expedition.unsecuredLoot)}</div>
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

  const stage = encounter.stages[active.stageId];
  const choices = stage.choices.map((choice) => renderEncounterChoice(choice, expedition)).join("");
  const outcomes = active.outcomeMessages.length > 0
    ? `<div class="outcome-strip">${active.outcomeMessages.map((message) => `<span>${message}</span>`).join("")}</div>`
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
        <p>${stage.text}</p>
        ${outcomes}
      </div>
      <div class="encounter-choices">${choices}</div>
    </div>`;
}

function renderEncounterResultPanel(expedition, encounter, active) {
  const outcomes = active.outcomeMessages.length > 0
    ? `<div class="result-consequences">${active.outcomeMessages.map((message) => `<span>${message}</span>`).join("")}</div>`
    : "";

  return `
    <div class="travel-panel encounter-panel encounter-result-panel" aria-live="polite">
      ${renderExpeditionResources(expedition)}
      <div class="encounter-heading">
        <p class="eyebrow">Encounter Resolved</p>
        <h1>${encounter.title}</h1>
      </div>
      <div class="encounter-stage result-stage">
        <p>${active.resultText}</p>
        ${outcomes}
      </div>
      <div class="encounter-choices">
        <button class="encounter-choice continue-choice" type="button" data-action="continue-journey">
          <strong>Continue Journey</strong>
        </button>
      </div>
    </div>`;
}

function renderExpeditionResources(expedition) {
  return `
    <div class="resource-grid compact-resources">
      <div class="resource-card"><span>Distance</span><strong id="distance-value">${formatDistance(expedition.distance)}</strong></div>
      <div class="resource-card"><span>Max reached</span><strong id="max-distance-value">${formatDistance(expedition.maxDistanceReached)}</strong></div>
      <div class="resource-card"><span>Provisions</span><strong id="provisions-value">${formatResource(expedition.provisions)}</strong></div>
      <div class="resource-card"><span>Health</span><strong id="health-value">${Math.ceil(expedition.health)}%</strong></div>
      <div class="resource-card unsecured-card"><span>Unsecured</span><strong id="loot-count">${expedition.unsecuredLoot.length} items · ${expedition.goldCarried}g</strong></div>
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
      <pre id="debug-state">${debugExpeditionState(expedition)}</pre>
    </details>`;
}

function updateExpedition(deltaSeconds) {
  const expedition = game.expedition;
  if (!expedition || expedition.status !== "active" || expedition.activeEncounter) {
    return;
  }

  let distanceTraveled = 0;
  let reachedSafety = false;
  if (expedition.direction === "outbound") {
    distanceTraveled = EXPEDITION_TUNING.outboundTravelSpeed * deltaSeconds;
    expedition.distance += distanceTraveled;
    expedition.sceneOffset -= distanceTraveled * 9;
    expedition.maxDistanceReached = Math.max(expedition.maxDistanceReached, expedition.distance);
  } else {
    const requestedDistance = EXPEDITION_TUNING.outboundTravelSpeed
      * EXPEDITION_TUNING.returnSpeedMultiplier
      * deltaSeconds;
    distanceTraveled = Math.min(requestedDistance, expedition.distance);
    expedition.distance -= distanceTraveled;
    expedition.sceneOffset += distanceTraveled * 9;
    reachedSafety = expedition.distance <= 0;
    expedition.distance = Math.max(expedition.distance, 0);
  }

  // Resource cost follows journey distance, independent of real-world animation speed.
  adjustExpeditionProvisions(
    expedition,
    -(distanceTraveled * EXPEDITION_TUNING.provisionsPerDistance),
  );

  if (expedition.provisions <= 0) {
    expedition.provisions = 0;
    failExpedition("The company exhausted its provisions before reaching safety.");
    return;
  }

  if (reachedSafety) {
    completeReturn();
    return;
  }

  const encounter = EncounterManager.advance(expedition, game.player, distanceTraveled);
  if (encounter) {
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

  expedition.direction = "returning";
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
  });
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

function completeReturn() {
  const expedition = game.expedition;
  expedition.status = "returned";
  settleConsumedItems(expedition);
  settleExpeditionProvisions(expedition, true);

  expedition.unsecuredLoot.forEach(({ itemId, quantity }) => {
    game.player.ownedItems[itemId] = (game.player.ownedItems[itemId] ?? 0) + quantity;
  });
  game.player.currentGold += expedition.goldCarried;
  game.player.bestExpeditionDistance = Math.max(
    game.player.bestExpeditionDistance,
    expedition.maxDistanceReached,
  );
  savePlayer();

  game.summary = {
    outcome: "returned",
    title: "Returned to Safety",
    message: "Every discovery from this expedition is now part of Arthur's permanent inventory.",
    distance: expedition.maxDistanceReached,
    loot: [...expedition.unsecuredLoot],
    gold: expedition.goldCarried,
    provisionsReturned: expedition.provisionsReturned,
  };
  showScreen("summary");
}

function failExpedition(reason) {
  const expedition = game.expedition;
  if (!expedition || expedition.status !== "active") {
    return;
  }

  expedition.status = "failed";
  settleConsumedItems(expedition);
  settleExpeditionProvisions(expedition, false);
  game.player.bestExpeditionDistance = Math.max(
    game.player.bestExpeditionDistance,
    expedition.maxDistanceReached,
  );
  savePlayer();

  game.summary = {
    outcome: "failed",
    title: "Expedition Failed",
    message: reason,
    distance: expedition.maxDistanceReached,
    loot: [...expedition.unsecuredLoot],
    gold: expedition.goldCarried,
    provisionsReturned: expedition.provisionsReturned,
  };
  showScreen("summary");
}

function renderSummary() {
  const summary = game.summary;
  const returned = summary.outcome === "returned";
  const loot = summary.loot.length > 0
    ? summary.loot.map(({ itemId, quantity }) => `<li>${ITEM_DEFINITIONS[itemId].name}${quantity > 1 ? ` ×${quantity}` : ""}</li>`).join("")
    : "<li>No items discovered</li>";

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
        <div class="summary-loot">
          <span>${returned ? "Items secured" : "Unsecured items lost"}</span>
          <ul>${loot}</ul>
        </div>
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
  setText("#health-value", `${Math.ceil(expedition.health)}%`);
  setText("#loot-count", `${expedition.unsecuredLoot.length} items · ${expedition.goldCarried}g`);

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

function renderLootList(loot) {
  if (loot.length === 0) {
    return '<p class="empty-loot">No discoveries yet. Travel farther into the forest.</p>';
  }

  return loot.map(({ itemId }) => `<span class="loot-chip">${ITEM_DEFINITIONS[itemId].name}</span>`).join("");
}

function announceTravelEvent(message) {
  setText("#travel-message", message);
  const lootList = document.querySelector("#loot-list");
  if (lootList) {
    lootList.innerHTML = renderLootList(game.expedition.unsecuredLoot);
  }
}

function savePlayer() {
  const saved = SaveSystem.save(game.player);
  ui.saveStatus.textContent = saved ? "Saved locally" : "Save unavailable";
}

function createExpeditionCarriedItems() {
  return Object.fromEntries(
    game.player.packedItems.map((itemId) => [
      itemId,
      Math.min(game.player.ownedItems[itemId], ITEM_DEFINITIONS[itemId].maxStack ?? 1),
    ]),
  );
}

function settleConsumedItems(expedition) {
  if (expedition.consumablesSettled) {
    return;
  }

  Object.entries(expedition.consumedItems).forEach(([itemId, quantity]) => {
    const remainingQuantity = (game.player.ownedItems[itemId] ?? 0) - quantity;
    if (remainingQuantity > 0) {
      game.player.ownedItems[itemId] = remainingQuantity;
    } else {
      delete game.player.ownedItems[itemId];
    }
  });
  expedition.consumablesSettled = true;
}

function settleExpeditionProvisions(expedition, returnedSafely) {
  if (expedition.provisionsSettled) {
    return;
  }
  const purchasedReturned = Math.max(0, Math.floor(expedition.committedProvisionsRemaining));
  const foundReturned = returnedSafely ? Math.max(0, Math.floor(expedition.foundProvisions)) : 0;
  expedition.provisionsReturned = purchasedReturned + foundReturned;
  game.player.provisions += expedition.provisionsReturned;
  expedition.provisionsSettled = true;
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
  game.preparationReturnDestinationId = "forest_gate";
  game.shopTab = "buy";
  game.provisionShopStock = createProvisionShopStock();
  game.interactionMessage = "";
  game.preparationSupplies = Math.min(18, game.player.provisions);
  savePlayer();
  showScreen("campaign");
}

function itemIcon(category) {
  return ({
    weapon: "⚔",
    armor: "◈",
    gear: "⌁",
    relic: "✦",
    quest: "◆",
    treasure: "●",
    supply: "+",
  })[category] ?? "•";
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
  const labels = Object.entries(carriedItems)
    .filter(([, quantity]) => quantity > 0)
    .map(([itemId, quantity]) => `${ITEM_DEFINITIONS[itemId]?.name ?? itemId} ×${quantity}`);
  return labels.join(" · ") || "None";
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
    updateExpedition(deltaSeconds);
    game.hudAccumulator += deltaSeconds;
    if (game.hudAccumulator >= 0.05) {
      updateTravelHud();
      game.hudAccumulator = 0;
    }
  }

  requestAnimationFrame(gameLoop);
}

initializeGame();
