"use strict";

// Add ?debug=1 to the URL to expose temporary encounter testing controls.
const DEBUG_ENCOUNTERS_ENABLED = new URLSearchParams(window.location.search).has("debug");

const game = {
  player: SaveSystem.load(),
  expedition: null,
  screen: "campaign",
  preparationSupplies: 18,
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

  const { action, itemId, companionId, choiceId } = control.dataset;

  switch (action) {
    case "show-campaign":
      if (!game.expedition || game.expedition.status !== "active") {
        showScreen("campaign");
      }
      break;
    case "prepare-expedition":
      showScreen("preparation");
      break;
    case "equip-item":
      equipItem(itemId);
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
      showScreen("preparation");
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
      ? '<button class="game-button chapter-button" type="button" data-action="prepare-expedition">Enter</button>'
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

function renderPreparation() {
  const inventory = Object.entries(game.player.ownedItems)
    .map(([itemId, quantity]) => inventoryCard(ITEM_DEFINITIONS[itemId], quantity))
    .join("");
  const companions = game.player.unlockedCompanions
    .map((companionId) => companionCard(COMPANION_DEFINITIONS[companionId]))
    .join("");

  ui.screenRoot.innerHTML = `
    <section class="screen preparation-screen" aria-labelledby="preparation-title">
      <div class="screen-heading compact-heading">
        <p class="eyebrow">Chapter III — Brocéliande</p>
        <h1 id="preparation-title">Prepare the Company</h1>
      </div>

      <section class="preparation-section" aria-labelledby="inventory-title">
        <div class="section-title-row">
          <h2 id="inventory-title">Permanent Inventory</h2>
          <span>${Object.keys(game.player.ownedItems).length} items</span>
        </div>
        <div class="inventory-list">${inventory}</div>
      </section>

      <section class="preparation-section" aria-labelledby="companion-title">
        <h2 id="companion-title">Companion</h2>
        <div class="choice-list">${companions}</div>
      </section>

      <section class="preparation-section supplies-section" aria-labelledby="supplies-title">
        <div>
          <h2 id="supplies-title">Provisions</h2>
          <p>Consumed during outward and return travel.</p>
        </div>
        <div class="stepper" aria-label="Choose provisions">
          <button type="button" data-action="change-supplies" data-amount="-2" aria-label="Remove two provisions">−</button>
          <strong>${game.preparationSupplies}</strong>
          <button type="button" data-action="change-supplies" data-amount="2" aria-label="Add two provisions">+</button>
        </div>
      </section>

      <div class="footer-actions">
        <button class="text-button" type="button" data-action="show-campaign">Back</button>
        <button class="game-button" type="button" data-action="start-expedition">Begin Expedition</button>
      </div>
    </section>`;
}

function inventoryCard(item, quantity) {
  const equipped = item.equippable && game.player.equippedItems[item.slot] === item.id;
  const button = item.equippable
    ? `<button class="small-button ${equipped ? "is-selected" : ""}" type="button" data-action="equip-item" data-item-id="${item.id}">${equipped ? "Equipped" : "Equip"}</button>`
    : `<span class="item-state">${item.questItem ? "Quest item" : "Stored"}</span>`;

  return `
    <article class="inventory-card ${equipped ? "is-equipped" : ""}">
      <div class="item-icon" aria-hidden="true">${itemIcon(item.category)}</div>
      <div class="item-copy">
        <div class="item-title-row"><h3>${item.name}</h3>${quantity > 1 ? `<span>×${quantity}</span>` : ""}</div>
        <p>${item.description}</p>
        <span class="item-category">${item.slot ?? item.category}</span>
      </div>
      ${button}
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

  game.player.equippedItems[item.slot] = itemId;
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
  game.preparationSupplies = clamp(
    game.preparationSupplies + amount,
    EXPEDITION_TUNING.minimumStartingProvisions,
    EXPEDITION_TUNING.maximumStartingProvisions,
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
  game.expedition = {
    regionId: "broceliande",
    currentPathId: "old_forest_road",
    distance: 0,
    maxDistanceReached: 0,
    direction: "outbound",
    provisions: game.preparationSupplies,
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
      <div class="travel-scene ${activeEncounter ? "is-paused" : ""}" id="travel-scene">
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
  expedition.provisions -= distanceTraveled * EXPEDITION_TUNING.provisionsPerDistance;

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
        <div class="summary-loot">
          <span>${returned ? "Items secured" : "Unsecured items lost"}</span>
          <ul>${loot}</ul>
        </div>
        <p class="protected-note">Your original equipment and companion remain available.</p>
      </div>

      <div class="footer-actions summary-actions">
        <button class="text-button" type="button" data-action="show-campaign">Campaign</button>
        <button class="game-button" type="button" data-action="new-expedition">Prepare Again</button>
      </div>
    </section>`;
}

function updateTravelHud() {
  const expedition = game.expedition;
  if (game.screen !== "expedition" || !expedition) {
    return;
  }

  setText("#distance-value", formatDistance(expedition.distance));
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
    Object.entries(game.player.ownedItems).filter(([itemId, quantity]) => (
      quantity > 0 && ITEM_DEFINITIONS[itemId]?.tags.includes("consumable")
    )),
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

function resetSave() {
  if (!window.confirm("Reset all local progress and restore the prototype's starting inventory?")) {
    return;
  }

  game.player = SaveSystem.reset();
  game.expedition = null;
  game.summary = null;
  game.preparationSupplies = 18;
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
