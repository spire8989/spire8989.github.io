"use strict";

// The debug panel is deliberately isolated from the normal game renderer. It is
// only created for ?debug=1 and all mutations pass through the same rule objects
// used by normal gameplay. Replay playback is always read-only here.
const debugToolsState = {
  open: true,
  itemId: null,
  itemFilter: "",
  materialId: null,
  materialFilter: "",
  recipeId: null,
  recipeFilter: "",
  knowledgeId: null,
  knowledgeFilter: "",
  injuryId: null,
  injuryTarget: "arthur",
  encounterId: null,
  combatId: null,
  expeditionId: null,
  combatEnemyId: null,
  combatStatusId: null,
};

let debugToolsPanel = null;
let debugToolsToggle = null;

const DebugTools = Object.freeze({
  isEnabled() {
    return Boolean(DEBUG_TOOLS_ENABLED);
  },

  refresh() {
    renderDebugTools();
  },

  refreshState() {
    if (!debugToolsPanel) return;
    const expeditionActive = String(Boolean(game.expedition?.status === "active"));
    const combatActive = String(Boolean(game.expedition?.combat));
    if (debugToolsPanel.dataset.expeditionActive !== expeditionActive
      || debugToolsPanel.dataset.combatActive !== combatActive) {
      renderDebugTools();
      return;
    }
    const playerSummary = debugToolsPanel.querySelector("#debug-player-summary");
    if (playerSummary) playerSummary.textContent = debugPlayerSummary();
    const expeditionState = debugToolsPanel.querySelector("#debug-expedition-state");
    if (expeditionState) expeditionState.textContent = debugExpeditionSnapshot(game.expedition);
    const combatState = debugToolsPanel.querySelector("#debug-combat-state");
    if (combatState) combatState.innerHTML = renderCombatDebugReadout(game.expedition?.combat);
    updateDebugAvailability();
  },

  grantItem(itemId, quantity = 1) {
    if (!debugMutationAllowed() || !ITEM_DEFINITIONS[itemId] || MaterialRules.isMaterialId(itemId)) return false;
    const amount = debugPositiveQuantity(quantity);
    game.player.ownedItems ??= {};
    game.player.ownedItems[itemId] = (game.player.ownedItems[itemId] ?? 0) + amount;
    finishDebugMutation(`Granted ${ITEM_DEFINITIONS[itemId].name} ×${amount}`);
    return true;
  },

  removeItem(itemId, quantity = 1) {
    if (!debugMutationAllowed() || !ITEM_DEFINITIONS[itemId] || MaterialRules.isMaterialId(itemId)) return false;
    const amount = debugPositiveQuantity(quantity);
    removePersistentItem(itemId, amount);
    finishDebugMutation(`Removed ${ITEM_DEFINITIONS[itemId].name}`);
    return true;
  },
});

if (DEBUG_TOOLS_ENABLED) {
  initializeDebugTools();
}

function initializeDebugTools() {
  debugToolsPanel = document.createElement("aside");
  debugToolsPanel.className = "debug-tools";
  debugToolsPanel.setAttribute("aria-label", "Game debug tools");
  debugToolsToggle = document.createElement("button");
  debugToolsToggle.className = "debug-tools-toggle";
  debugToolsToggle.type = "button";
  debugToolsToggle.textContent = "Debug";
  debugToolsToggle.setAttribute("aria-label", "Open game debug tools");
  document.body.append(debugToolsPanel, debugToolsToggle);

  debugToolsPanel.addEventListener("click", (event) => {
    const control = event.target.closest("[data-debug-action]");
    if (!control || control.disabled) return;
    void handleDebugAction(control.dataset.debugAction, control);
  });
  debugToolsPanel.addEventListener("change", (event) => {
    const target = event.target;
    if (target.id === "debug-item-select") debugToolsState.itemId = target.value;
    if (target.id === "debug-material-select") debugToolsState.materialId = target.value;
    if (target.id === "debug-recipe-select") debugToolsState.recipeId = target.value;
    if (target.id === "debug-knowledge-select") debugToolsState.knowledgeId = target.value;
    if (target.id === "debug-injury-target") debugToolsState.injuryTarget = target.value;
    if (target.id === "debug-injury-select") debugToolsState.injuryId = target.value;
    if (target.id === "debug-encounter-select") debugToolsState.encounterId = target.value;
    if (target.id === "debug-combat-select") debugToolsState.combatId = target.value;
    if (target.id === "debug-combat-enemy") debugToolsState.combatEnemyId = target.value;
    if (target.id === "debug-combat-status") debugToolsState.combatStatusId = target.value;
    if (target.id === "debug-expedition-select") debugToolsState.expeditionId = target.value;
    renderDebugTools();
  });
  debugToolsPanel.addEventListener("input", (event) => {
    const target = event.target;
    const filters = {
      "debug-item-filter": "itemFilter",
      "debug-material-filter": "materialFilter",
      "debug-recipe-filter": "recipeFilter",
      "debug-knowledge-filter": "knowledgeFilter",
    };
    if (!filters[target.id]) return;
    debugToolsState[filters[target.id]] = target.value;
    updateDebugCatalog(target.id);
  });
  debugToolsToggle.addEventListener("click", () => {
    debugToolsState.open = true;
    renderDebugTools();
  });
  renderDebugTools();
}

async function handleDebugAction(action, control) {
  if (action === "close") {
    debugToolsState.open = false;
    renderDebugTools();
    return;
  }
  if (action === "open") {
    debugToolsState.open = true;
    renderDebugTools();
    return;
  }

  if ([
    "adjust-gold", "set-gold", "adjust-provisions", "set-provisions", "give-item", "remove-item",
    "equip-item", "give-material", "remove-material", "heal-party", "heal-arthur", "damage-health",
    "clear-injuries", "add-injury", "learn-recipe", "forget-recipe", "grant-knowledge", "remove-knowledge",
    "toggle-companion", "toggle-campaign-flag", "unlock-expedition", "select-expedition", "trigger-encounter",
    "next-encounter", "start-combat", "set-distance", "add-distance", "force-return", "pause-travel",
    "resume-travel", "apply-combat-status", "save-now", "reset-save",
  ].includes(action) && !debugMutationAllowed()) {
    return;
  }

  switch (action) {
    case "adjust-gold":
      game.player.currentGold = Math.max(0, Math.floor(Number(game.player.currentGold) || 0) + Number(control.dataset.amount));
      finishDebugMutation("Gold updated");
      break;
    case "set-gold":
      game.player.currentGold = debugNonNegativeInput("debug-gold-set");
      finishDebugMutation("Gold set");
      break;
    case "adjust-provisions":
      game.player.provisions = Math.max(0, Math.floor(Number(game.player.provisions) || 0) + Number(control.dataset.amount));
      finishDebugMutation("Provisions updated");
      break;
    case "set-provisions":
      game.player.provisions = debugNonNegativeInput("debug-provisions-set");
      finishDebugMutation("Provisions set");
      break;
    case "give-item":
      DebugTools.grantItem(selectedItemId(), debugQuantityFrom("debug-item-quantity"));
      break;
    case "remove-item":
      DebugTools.removeItem(selectedItemId(), debugQuantityFrom("debug-item-quantity"));
      break;
    case "equip-item":
      equipDebugItem(selectedItemId());
      break;
    case "give-material":
      mutateMaterial(selectedMaterialId(), debugQuantityFrom("debug-material-quantity"));
      break;
    case "remove-material":
      mutateMaterial(selectedMaterialId(), -debugQuantityFrom("debug-material-quantity"));
      break;
    case "heal-party":
      healDebugParty();
      break;
    case "heal-arthur":
      setDebugHealth("arthur", HealingRules.arthurMaxHealth(game.player));
      break;
    case "damage-health":
      setDebugHealth(control.dataset.characterId, debugCurrentHealth(control.dataset.characterId) - Number(control.dataset.amount));
      break;
    case "clear-injuries":
      game.player.injuries = InjuryRules.snapshot({});
      finishDebugMutation("All injuries cleared");
      break;
    case "add-injury":
      addDebugInjury();
      break;
    case "learn-recipe":
      setMembership(game.player, "learnedRecipes", selectedRecipeId(), true);
      finishDebugMutation("Recipe learned");
      break;
    case "forget-recipe":
      setMembership(game.player, "learnedRecipes", selectedRecipeId(), false);
      finishDebugMutation("Recipe forgotten");
      break;
    case "grant-knowledge":
      setMembership(game.player, "learnedKnowledge", selectedKnowledgeId(), true);
      finishDebugMutation("Knowledge granted");
      break;
    case "remove-knowledge":
      setMembership(game.player, "learnedKnowledge", selectedKnowledgeId(), false);
      finishDebugMutation("Knowledge removed");
      break;
    case "toggle-companion":
      toggleDebugCompanion(control.dataset.companionId);
      break;
    case "toggle-campaign-flag":
      toggleDebugCampaignFlag(control.dataset.flag);
      break;
    case "unlock-expedition":
      grantExpeditionPrerequisites(control.dataset.expeditionId);
      break;
    case "select-expedition":
      selectDebugExpedition(control.dataset.expeditionId);
      break;
    case "trigger-encounter":
      triggerDebugEncounterFromPanel();
      break;
    case "next-encounter":
      if (canUseActiveExpedition() && !game.expedition.activeEncounter && !game.expedition.combat) {
        EncounterManager.forceNextSoon(game.expedition);
        renderScreen();
        DebugTools.refreshState();
        setDebugStatus("Next encounter queued");
      }
      break;
    case "start-combat":
      startDebugCombatFromPanel();
      break;
    case "set-distance":
      setDebugDistance(debugNonNegativeInput("debug-distance-set"));
      break;
    case "add-distance":
      setDebugDistance(Math.max(0, Number(game.expedition?.distance) || 0) + Number(control.dataset.amount));
      break;
    case "force-return":
      if (canUseActiveExpedition() && ExpeditionRules.beginReturn(game.expedition)) {
        renderScreen();
        DebugTools.refreshState();
        setDebugStatus("Production return flow started");
      }
      break;
    case "pause-travel":
      if (canUseActiveExpedition() && ExpeditionRules.pause(game.expedition)) {
        renderScreen();
        DebugTools.refreshState();
      }
      break;
    case "resume-travel":
      if (canUseActiveExpedition() && ExpeditionRules.resume(game.expedition)) {
        renderScreen();
        DebugTools.refreshState();
      }
      break;
    case "apply-combat-status":
      applyDebugCombatStatus();
      break;
    case "save-now":
      saveDebugNow();
      break;
    case "copy-player":
      await copyDebugState(game.player, "Player state copied");
      break;
    case "copy-expedition":
      await copyDebugState(game.expedition, "Active expedition state copied");
      break;
    case "reset-save":
      resetSave();
      renderDebugTools();
      break;
    default:
      break;
  }
}

function renderDebugTools() {
  if (!debugToolsPanel) return;
  debugToolsPanel.classList.toggle("is-open", debugToolsState.open);
  debugToolsPanel.classList.toggle("is-collapsed", !debugToolsState.open);
  debugToolsToggle.hidden = debugToolsState.open;
  debugToolsPanel.innerHTML = `
    <header class="debug-tools-header">
      <div><small>Developer only</small><h2>Game Debug</h2></div>
      <button type="button" data-debug-action="close" aria-label="Close game debug tools">×</button>
    </header>
    <p class="debug-tools-status" id="debug-tools-status" role="status">${escapeDebugText(debugReplayActive() ? "Replay sandbox: controls disabled" : "Ready")}</p>
    ${renderDebugPlayerSection()}
    ${renderDebugItemsSection()}
    ${renderDebugMaterialsSection()}
    ${renderDebugProgressionSection()}
    ${renderDebugExpeditionSection()}
    ${renderDebugCombatSection()}
    ${renderDebugSaveSection()}`;
  debugToolsPanel.dataset.expeditionActive = String(Boolean(game.expedition?.status === "active"));
  debugToolsPanel.dataset.combatActive = String(Boolean(game.expedition?.combat));
  debugToolsPanel.querySelectorAll("[data-debug-action]").forEach((control) => {
    control.dataset.baseDisabled = String(control.disabled);
  });
  updateDebugAvailability();
}

function renderDebugPlayerSection() {
  const player = game.player;
  const healthRows = debugHealthCharacterIds().map((characterId) => {
    const current = debugCurrentHealth(characterId);
    const maximum = debugMaximumHealth(characterId);
    return `<div class="debug-health-row"><span>${escapeDebugText(characterNameForDebug(characterId))}</span><strong>${Math.ceil(current)} / ${maximum}</strong>
      ${characterId === "arthur" ? `<button type="button" data-debug-action="heal-arthur">Heal</button>` : ""}
      <button type="button" data-debug-action="damage-health" data-character-id="${escapeDebugText(characterId)}" data-amount="5">−5</button>
      <button type="button" data-debug-action="damage-health" data-character-id="${escapeDebugText(characterId)}" data-amount="10">−10</button></div>`;
  }).join("");
  const injuries = debugHealthCharacterIds().flatMap((characterId) => InjuryRules.forCharacter(player, characterId)
    .map((instance) => `${characterNameForDebug(characterId)}: ${INJURY_DEFINITIONS[InjuryRules.idOf(instance)]?.name ?? InjuryRules.idOf(instance)}`));
  const injuryTargets = debugHealthCharacterIds().map((characterId) => `<option value="${escapeDebugText(characterId)}" ${debugToolsState.injuryTarget === characterId ? "selected" : ""}>${escapeDebugText(characterNameForDebug(characterId))}</option>`).join("");
  const injuryOptions = Object.values(INJURY_DEFINITIONS).map((injury) => `<option value="${escapeDebugText(injury.id)}">${escapeDebugText(injury.name)} [${escapeDebugText(injury.id)}]</option>`).join("");
  return `<details class="debug-section" open>
    <summary>Player <span id="debug-player-summary">${escapeDebugText(debugPlayerSummary())}</span></summary>
    <div class="debug-section-content">
      <div class="debug-stat-row"><span>Gold</span><strong>${Math.floor(player.currentGold ?? 0)}</strong><button type="button" data-debug-action="adjust-gold" data-amount="10">+10</button><button type="button" data-debug-action="adjust-gold" data-amount="100">+100</button><button type="button" data-debug-action="adjust-gold" data-amount="1000">+1000</button><button type="button" data-debug-action="adjust-gold" data-amount="-10">−10</button></div>
      <div class="debug-direct-row"><label>Set gold <input id="debug-gold-set" type="number" min="0" value="${Math.floor(player.currentGold ?? 0)}"></label><button type="button" data-debug-action="set-gold">Set</button></div>
      <div class="debug-stat-row"><span>Provisions</span><strong>${Math.floor(player.provisions ?? 0)}</strong><button type="button" data-debug-action="adjust-provisions" data-amount="5">+5</button><button type="button" data-debug-action="adjust-provisions" data-amount="20">+20</button><button type="button" data-debug-action="adjust-provisions" data-amount="-5">−5</button></div>
      <div class="debug-direct-row"><label>Set provisions <input id="debug-provisions-set" type="number" min="0" value="${Math.floor(player.provisions ?? 0)}"></label><button type="button" data-debug-action="set-provisions">Set</button></div>
      <div class="debug-health-list"><strong>Health</strong>${healthRows}</div>
      <div class="debug-actions"><button type="button" data-debug-action="heal-party">Heal Party</button><button type="button" data-debug-action="clear-injuries">Clear All Injuries</button></div>
      <p class="debug-muted">Active injuries: ${injuries.length ? escapeDebugText(injuries.join(" · ")) : "None"}</p>
      <div class="debug-direct-row"><label>Target <select id="debug-injury-target">${injuryTargets}</select></label><label>Injury <select id="debug-injury-select">${injuryOptions}</select></label><button type="button" data-debug-action="add-injury">Add</button></div>
    </div>
  </details>`;
}

function renderDebugItemsSection() {
  const items = filteredDebugItems();
  const selected = ITEM_DEFINITIONS[selectedItemId()];
  const options = items.map((item) => `<option value="${escapeDebugText(item.id)}" ${item.id === selected?.id ? "selected" : ""}>${escapeDebugText(item.name)} [${escapeDebugText(item.id)}] · owned ${Number(game.player.ownedItems?.[item.id]) || 0}</option>`).join("");
  return `<details class="debug-section" open>
    <summary>Items</summary><div class="debug-section-content">
      <label>Search <input id="debug-item-filter" type="search" value="${escapeDebugText(debugToolsState.itemFilter)}" placeholder="Name or stable ID"></label>
      <select id="debug-item-select" class="debug-catalog-select" size="5" aria-label="Debug item selector">${options || '<option disabled>No matching items</option>'}</select>
      ${selected ? `<p class="debug-selected"><strong>${escapeDebugText(selected.name)}</strong> <code>${escapeDebugText(selected.id)}</code> · owned ${Number(game.player.ownedItems?.[selected.id]) || 0}${selected.equippable ? ` · slot ${escapeDebugText(selected.equipmentSlot)}` : ""}</p>` : ""}
      <div class="debug-direct-row"><label>Quantity <input id="debug-item-quantity" type="number" min="1" step="1" value="1"></label><button type="button" data-debug-action="give-item" ${selected ? "" : "disabled"}>Give</button><button type="button" data-debug-action="remove-item" ${selected ? "" : "disabled"}>Remove</button>${selected?.equippable ? '<button type="button" data-debug-action="equip-item">Equip</button>' : ""}</div>
      <p class="debug-muted">Materials are kept in the separate Materials section.</p>
    </div>
  </details>`;
}

function renderDebugMaterialsSection() {
  const materials = filteredDebugMaterials();
  const selected = debugMaterialDefinition(selectedMaterialId());
  const options = materials.map((material) => `<option value="${escapeDebugText(material.id)}" ${material.id === selected?.id ? "selected" : ""}>${escapeDebugText(material.name)} [${escapeDebugText(material.id)}] · stored ${Number(game.player.materials?.[material.id]) || 0}</option>`).join("");
  const expedition = game.expedition;
  const bag = expedition ? MaterialRules.expeditionContents(expedition) : {};
  return `<details class="debug-section">
    <summary>Materials</summary><div class="debug-section-content">
      <label>Search <input id="debug-material-filter" type="search" value="${escapeDebugText(debugToolsState.materialFilter)}" placeholder="Name or stable ID"></label>
      <select id="debug-material-select" class="debug-catalog-select" size="4" aria-label="Debug material selector">${options || '<option disabled>No matching materials</option>'}</select>
      ${selected ? `<p class="debug-selected"><strong>${escapeDebugText(selected.name)}</strong> <code>${escapeDebugText(selected.id)}</code> · stored ${Number(game.player.materials?.[selected.id]) || 0}</p>` : ""}
      <div class="debug-direct-row"><label>Quantity <input id="debug-material-quantity" type="number" min="1" step="1" value="1"></label><button type="button" data-debug-action="give-material" ${selected ? "" : "disabled"}>Give</button><button type="button" data-debug-action="remove-material" ${selected ? "" : "disabled"}>Remove</button></div>
      <p class="debug-muted">Permanent storage is separate from the active expedition Material Bag (${expedition ? `${MaterialRules.expeditionTotal(expedition)} / ${MaterialRules.capacity()}` : "no active expedition"}).</p>
      <pre id="debug-material-bag-state">${escapeDebugText(JSON.stringify(bag, null, 2))}</pre>
    </div>
  </details>`;
}

function renderDebugProgressionSection() {
  const recipes = filteredDebugRecipes();
  const recipe = RECIPE_DEFINITIONS[selectedRecipeId()];
  const recipeOptions = recipes.map((entry) => `<option value="${escapeDebugText(entry.id)}" ${entry.id === recipe?.id ? "selected" : ""}>${escapeDebugText(entry.name)} [${escapeDebugText(entry.id)}] · ${game.player.learnedRecipes?.includes(entry.id) ? "learned" : "unlearned"}</option>`).join("");
  const knowledge = filteredDebugKnowledge();
  const knowledgeEntry = KNOWLEDGE_DEFINITIONS[selectedKnowledgeId()];
  const knowledgeOptions = knowledge.map((entry) => `<option value="${escapeDebugText(entry.id)}" ${entry.id === knowledgeEntry?.id ? "selected" : ""}>${escapeDebugText(entry.name)} [${escapeDebugText(entry.id)}] · ${game.player.learnedKnowledge?.includes(entry.id) ? "known" : "unknown"}</option>`).join("");
  const companions = Object.values(COMPANION_DEFINITIONS).map((companion) => `<div class="debug-stat-row"><span>${escapeDebugText(companion.name)} <code>${escapeDebugText(companion.id)}</code></span><strong>${game.player.unlockedCompanions?.includes(companion.id) ? "unlocked" : "locked"}</strong><button type="button" data-debug-action="toggle-companion" data-companion-id="${escapeDebugText(companion.id)}">${game.player.unlockedCompanions?.includes(companion.id) ? "Lock" : "Unlock"}</button></div>`).join("");
  const flags = debugCampaignFlags().map((flag) => `<label class="debug-flag-row"><input type="checkbox" data-debug-action="toggle-campaign-flag" data-flag="${escapeDebugText(flag)}" ${game.player.campaignFlags?.[flag] === true ? "checked" : ""}> <code>${escapeDebugText(flag)}</code></label>`).join("");
  const expeditions = Object.values(EXPEDITION_DEFINITIONS).map((expedition) => {
    const unlocked = ExpeditionCatalog.isUnlocked(game.player, expedition.id);
    const selectedExpedition = game.player.selectedExpeditionId === expedition.id;
    const missing = ExpeditionCatalog.missingPrerequisites(game.player, expedition.id);
    return `<div class="debug-stat-row"><span>${escapeDebugText(expedition.name)} <code>${escapeDebugText(expedition.id)}</code></span><strong>${unlocked ? "unlocked" : `needs ${missing.join(", ")}`}</strong><button type="button" data-debug-action="${unlocked ? "select-expedition" : "unlock-expedition"}" data-expedition-id="${escapeDebugText(expedition.id)}">${unlocked ? (selectedExpedition ? "Selected" : "Select") : "Grant needs"}</button></div>`;
  }).join("");
  return `<details class="debug-section">
    <summary>Recipes / Knowledge / Progression</summary><div class="debug-section-content">
      <label>Recipe search <input id="debug-recipe-filter" type="search" value="${escapeDebugText(debugToolsState.recipeFilter)}" placeholder="Name or stable ID"></label>
      <select id="debug-recipe-select" class="debug-catalog-select" size="3" aria-label="Debug recipe selector">${recipeOptions || '<option disabled>No matching recipes</option>'}</select>
      ${recipe ? `<p class="debug-selected"><strong>${escapeDebugText(recipe.name)}</strong> <code>${escapeDebugText(recipe.id)}</code> · ${game.player.learnedRecipes?.includes(recipe.id) ? "learned" : "unlearned"}</p>` : ""}
      <div class="debug-actions"><button type="button" data-debug-action="learn-recipe" ${recipe ? "" : "disabled"}>Learn</button><button type="button" data-debug-action="forget-recipe" ${recipe ? "" : "disabled"}>Forget</button></div>
      <label>Knowledge search <input id="debug-knowledge-filter" type="search" value="${escapeDebugText(debugToolsState.knowledgeFilter)}" placeholder="Name or stable ID"></label>
      <select id="debug-knowledge-select" class="debug-catalog-select" size="2" aria-label="Debug knowledge selector">${knowledgeOptions || '<option disabled>No matching knowledge</option>'}</select>
      ${knowledgeEntry ? `<p class="debug-selected"><strong>${escapeDebugText(knowledgeEntry.name)}</strong> <code>${escapeDebugText(knowledgeEntry.id)}</code> · ${game.player.learnedKnowledge?.includes(knowledgeEntry.id) ? "known" : "unknown"}</p>` : ""}
      <div class="debug-actions"><button type="button" data-debug-action="grant-knowledge" ${knowledgeEntry ? "" : "disabled"}>Grant</button><button type="button" data-debug-action="remove-knowledge" ${knowledgeEntry ? "" : "disabled"}>Remove</button></div>
      <h4>Companions</h4>${companions}
      <h4>Campaign flags</h4><div class="debug-flag-list">${flags || '<span class="debug-muted">No known flags</span>'}</div>
      <h4>Expeditions</h4>${expeditions}
    </div>
  </details>`;
}

function renderDebugExpeditionSection() {
  const expedition = game.expedition;
  const active = Boolean(expedition?.status === "active");
  const encounterOptions = Object.values(ENCOUNTER_DEFINITIONS).map((entry) => `<option value="${escapeDebugText(entry.id)}" ${entry.id === selectedEncounterId() ? "selected" : ""}>${escapeDebugText(entry.title)} [${escapeDebugText(entry.id)}]</option>`).join("");
  const combatOptions = Object.values(COMBAT_DEFINITIONS).map((entry) => {
    const enemies = entry.enemyIds.map((enemyId) => COMBAT_ENEMY_DEFINITIONS[enemyId]?.name ?? enemyId).join(", ");
    return `<option value="${escapeDebugText(entry.id)}" ${entry.id === selectedCombatId() ? "selected" : ""}>${escapeDebugText(entry.id)} · ${escapeDebugText(enemies)}</option>`;
  }).join("");
  const expeditionReadout = active ? `<div class="debug-readout-grid"><span>Distance</span><strong>${Number(expedition.distance).toFixed(1)}</strong><span>Direction</span><strong>${escapeDebugText(expedition.direction)}</strong><span>Path</span><strong>${escapeDebugText(expedition.currentPathId)}</strong><span>Provisions</span><strong>${Number(expedition.provisions).toFixed(1)}</strong></div>
    <pre id="debug-expedition-state">${escapeDebugText(debugExpeditionSnapshot(expedition))}</pre>` : '<p class="debug-muted">No active expedition. Start one through normal preparation.</p>';
  return `<details class="debug-section" open>
    <summary>Encounters / Expedition</summary><div class="debug-section-content">
      <select id="debug-encounter-select" aria-label="Encounter to trigger">${encounterOptions}</select>
      <div class="debug-actions"><button type="button" data-debug-action="trigger-encounter" ${active ? "" : "disabled"}>Trigger Selected</button><button type="button" data-debug-action="next-encounter" ${active ? "" : "disabled"}>Next Encounter Soon</button></div>
      <select id="debug-combat-select" aria-label="Combat definition to start">${combatOptions}</select>
      <button type="button" data-debug-action="start-combat" ${active ? "" : "disabled"}>Start Selected Combat</button>
      ${active ? `<div class="debug-direct-row"><label>Set distance <input id="debug-distance-set" type="number" min="0" step="0.1" value="${Number(expedition.distance).toFixed(1)}"></label><button type="button" data-debug-action="set-distance">Set</button><button type="button" data-debug-action="add-distance" data-amount="10">+10</button><button type="button" data-debug-action="add-distance" data-amount="50">+50</button></div>
        <div class="debug-actions"><button type="button" data-debug-action="force-return">Begin Return</button>${expedition.travelState === "paused" ? '<button type="button" data-debug-action="resume-travel">Resume</button>' : '<button type="button" data-debug-action="pause-travel">Pause</button>'}</div>` : ""}
      ${expeditionReadout}
      ${active ? `<details><summary>Equipment / carried state</summary><pre>${escapeDebugText(JSON.stringify({ equipment: expedition.selectedEquipment, carriedItems: expedition.carriedItems, materialBag: MaterialRules.expeditionContents(expedition), unsecuredLoot: expedition.unsecuredLoot, unsecuredMaterials: expedition.materialBag?.unsecured ?? expedition.unsecuredMaterials }, null, 2))}</pre></details>` : ""}
    </div>
  </details>`;
}

function renderDebugCombatSection() {
  const combat = game.expedition?.combat;
  const enemies = combat?.enemies ?? [];
  const enemyOptions = enemies.filter((enemy) => enemy.hp > 0).map((enemy) => `<option value="${escapeDebugText(enemy.id)}" ${enemy.id === debugToolsState.combatEnemyId ? "selected" : ""}>${escapeDebugText(enemy.name)}</option>`).join("");
  const statusOptions = Object.values(COMBAT_STATUS_DEFINITIONS).map((status) => `<option value="${escapeDebugText(status.id)}" ${status.id === debugToolsState.combatStatusId ? "selected" : ""}>${escapeDebugText(status.name)} [${escapeDebugText(status.id)}]</option>`).join("");
  return `<details class="debug-section" open>
    <summary>Combat Debug</summary><div class="debug-section-content">
      <div id="debug-combat-state">${renderCombatDebugReadout(combat)}</div>
      ${combat ? `<div class="debug-direct-row"><label>Enemy <select id="debug-combat-enemy">${enemyOptions || '<option disabled>No living enemies</option>'}</select></label><label>Status <select id="debug-combat-status">${statusOptions}</select></label><button type="button" data-debug-action="apply-combat-status">Apply</button></div>` : ""}
    </div>
  </details>`;
}

function renderDebugSaveSection() {
  return `<details class="debug-section">
    <summary>Save / State</summary><div class="debug-section-content">
      <div class="debug-actions"><button type="button" data-debug-action="save-now">Save Now</button><button type="button" data-debug-action="reset-save">Reset Save</button></div>
      <div class="debug-actions"><button type="button" data-debug-action="copy-player">Copy Player State JSON</button><button type="button" data-debug-action="copy-expedition" ${game.expedition ? "" : "disabled"}>Copy Active Expedition JSON</button></div>
    </div>
  </details>`;
}

function updateDebugAvailability() {
  if (!debugToolsPanel) return;
  const disabled = debugReplayActive();
  debugToolsPanel.querySelectorAll("[data-debug-action]").forEach((control) => {
    if (["close", "open", "copy-player", "copy-expedition"].includes(control.dataset.debugAction)) return;
    control.disabled = disabled || control.dataset.baseDisabled === "true";
  });
  if (debugToolsToggle) debugToolsToggle.hidden = debugToolsState.open;
}

function updateDebugCatalog(filterId) {
  const mapping = {
    "debug-item-filter": ["#debug-item-select", filteredDebugItems],
    "debug-material-filter": ["#debug-material-select", filteredDebugMaterials],
    "debug-recipe-filter": ["#debug-recipe-select", filteredDebugRecipes],
    "debug-knowledge-filter": ["#debug-knowledge-select", filteredDebugKnowledge],
  };
  const entry = mapping[filterId];
  if (!entry) return;
  const select = debugToolsPanel.querySelector(entry[0]);
  if (!select) return;
  const catalog = entry[1]();
  const selectedId = select.value;
  select.innerHTML = catalog.map((definition) => {
    const quantity = definition.id in ITEM_DEFINITIONS
      ? ` · owned ${Number(game.player.ownedItems?.[definition.id]) || 0}`
      : definition.id in MATERIAL_DEFINITIONS || MaterialRules.isMaterialId(definition.id)
        ? ` · stored ${Number(game.player.materials?.[definition.id]) || 0}` : "";
    return `<option value="${escapeDebugText(definition.id)}">${escapeDebugText(definition.name)} [${escapeDebugText(definition.id)}]${quantity}</option>`;
  }).join("") || '<option disabled>No matches</option>';
  if ([...select.options].some((option) => option.value === selectedId)) select.value = selectedId;
  else if (select.value) select.selectedIndex = 0;
}

function debugPlayerSummary() {
  return `${Math.floor(game.player.currentGold ?? 0)}g · ${Math.floor(game.player.provisions ?? 0)} provisions`;
}

function debugHealthCharacterIds() {
  const ids = ["arthur", ...(game.player.unlockedCompanions ?? []), ...(game.player.selectedCompanions ?? [])];
  return [...new Set(ids)].filter((id) => id === "arthur" || COMPANION_DEFINITIONS[id]);
}

function characterNameForDebug(characterId) {
  return characterId === "arthur" ? PLAYER_CHARACTER_DEFINITION.name : COMPANION_DEFINITIONS[characterId]?.name ?? characterId;
}

function debugMaximumHealth(characterId) {
  return InjuryRules.effectiveMaxHealth(game.player, characterId);
}

function debugCurrentHealth(characterId) {
  return characterId === "arthur"
    ? Math.max(0, Number(game.player.arthurHealth) || 0)
    : Math.max(0, Number(game.player.companionStates?.[characterId]?.health) || 0);
}

function setDebugHealth(characterId, value) {
  if (characterId === "arthur") {
    game.player.arthurHealth = clampDebugNumber(value, 0, debugMaximumHealth(characterId));
  } else if (COMPANION_DEFINITIONS[characterId]) {
    game.player.companionStates ??= {};
    game.player.companionStates[characterId] = {
      ...(game.player.companionStates[characterId] ?? {}),
      health: clampDebugNumber(value, 0, debugMaximumHealth(characterId)),
    };
  }
  finishDebugMutation(`${characterNameForDebug(characterId)} health updated`);
}

function healDebugParty() {
  debugHealthCharacterIds().filter((id) => id === "arthur" || game.player.selectedCompanions?.includes(id)).forEach((characterId) => {
    if (characterId === "arthur") game.player.arthurHealth = debugMaximumHealth(characterId);
    else {
      game.player.companionStates ??= {};
      game.player.companionStates[characterId] = { ...(game.player.companionStates[characterId] ?? {}), health: debugMaximumHealth(characterId) };
    }
  });
  if (game.expedition?.status === "active" && !game.expedition.combat) {
    HealingRules.restExpeditionParty(game.expedition, Number.MAX_SAFE_INTEGER);
  }
  finishDebugMutation("Active party healed");
}

function addDebugInjury() {
  const result = InjuryRules.apply(game.player, debugToolsState.injuryTarget, debugToolsState.injuryId ?? Object.keys(INJURY_DEFINITIONS)[0], { source: "debug-tools" });
  if (result.applied) finishDebugMutation(`${result.definition.name} added`);
  else setDebugStatus(`Injury not added: ${result.reason}`);
}

function mutateMaterial(materialId, amount) {
  if (!MaterialRules.isMaterialId(materialId)) return;
  game.player.materials ??= {};
  const next = Math.max(0, Math.floor(Number(game.player.materials[materialId]) || 0) + Math.floor(Number(amount) || 0));
  if (next > 0) game.player.materials[materialId] = next;
  else delete game.player.materials[materialId];
  if (typeof ExpeditionRules?.normalizePackedState === "function") ExpeditionRules.normalizePackedState(game.player);
  finishDebugMutation(`${MaterialRules.definition(materialId).name} updated`);
}

function equipDebugItem(itemId) {
  const result = EquipmentRules.equip(game.player, itemId);
  if (!result.applied) {
    setDebugStatus("That item is not an owned, valid piece of equipment.");
    return;
  }
  finishDebugMutation(`Equipped ${ITEM_DEFINITIONS[itemId].name}`);
}

function removePersistentItem(itemId, quantity) {
  const current = Math.max(0, Math.floor(Number(game.player.ownedItems?.[itemId]) || 0));
  const next = Math.max(0, current - quantity);
  if (next > 0) game.player.ownedItems[itemId] = next;
  else delete game.player.ownedItems[itemId];
  if (next <= 0) {
    game.player.packedItems = (game.player.packedItems ?? []).filter((entry) => entry !== itemId);
    Object.keys(game.player.equippedItems ?? {}).forEach((slot) => {
      if (game.player.equippedItems[slot] === itemId) delete game.player.equippedItems[slot];
    });
  }
  if (typeof ExpeditionRules?.normalizePackedState === "function") ExpeditionRules.normalizePackedState(game.player);
}

function setMembership(holder, field, id, enabled) {
  if (!id) return;
  const values = new Set(Array.isArray(holder[field]) ? holder[field] : []);
  if (enabled) values.add(id); else values.delete(id);
  holder[field] = [...values];
}

function toggleDebugCompanion(companionId) {
  if (!COMPANION_DEFINITIONS[companionId]) return;
  game.player.unlockedCompanions ??= [];
  if (game.player.unlockedCompanions.includes(companionId)) {
    game.player.unlockedCompanions = game.player.unlockedCompanions.filter((id) => id !== companionId);
    game.player.selectedCompanions = (game.player.selectedCompanions ?? []).filter((id) => id !== companionId);
    game.player.selectedCompanion = game.player.selectedCompanions[0] ?? null;
  } else {
    game.player.unlockedCompanions.push(companionId);
  }
  finishDebugMutation("Companion progression updated");
}

function toggleDebugCampaignFlag(flag) {
  if (!flag) return;
  game.player.campaignFlags ??= {};
  game.player.campaignFlags[flag] = game.player.campaignFlags[flag] !== true;
  finishDebugMutation(`Campaign flag ${flag} updated`);
}

function grantExpeditionPrerequisites(expeditionId) {
  const expedition = EXPEDITION_DEFINITIONS[expeditionId];
  if (!expedition) return;
  expedition.prerequisites.forEach((itemId) => {
    if (ITEM_DEFINITIONS[itemId] && !MaterialRules.isMaterialId(itemId)) {
      game.player.ownedItems[itemId] = Math.max(1, Number(game.player.ownedItems[itemId]) || 0);
    }
  });
  finishDebugMutation(`Granted prerequisites for ${expedition.name}`);
}

function selectDebugExpedition(expeditionId) {
  if (!EXPEDITION_DEFINITIONS[expeditionId] || !ExpeditionCatalog.isUnlocked(game.player, expeditionId)) return;
  game.player.selectedExpeditionId = expeditionId;
  finishDebugMutation(`Selected ${EXPEDITION_DEFINITIONS[expeditionId].name}`);
}

function triggerDebugEncounterFromPanel() {
  if (!canUseActiveExpedition() || game.expedition.activeEncounter || game.expedition.combat) return;
  const encounterId = selectedEncounterId();
  if (ENCOUNTER_DEFINITIONS[encounterId] && EncounterManager.force(game.expedition, encounterId)) {
    renderScreen();
    DebugTools.refreshState();
    setDebugStatus(`Triggered ${ENCOUNTER_DEFINITIONS[encounterId].title}`);
  }
}

function startDebugCombatFromPanel() {
  if (!canUseActiveExpedition() || game.expedition.activeEncounter || game.expedition.combat) return;
  const combatId = selectedCombatId();
  if (COMBAT_DEFINITIONS[combatId] && startCombat(game.expedition, combatId)) {
    renderScreen();
    DebugTools.refresh();
    setDebugStatus(`Started ${combatId}`);
  }
}

function setDebugDistance(distance) {
  if (!canUseActiveExpedition() || game.expedition.activeEncounter || game.expedition.combat) return;
  if (ExpeditionRules.setDistance(game.expedition, distance)) {
    renderScreen();
    DebugTools.refreshState();
    setDebugStatus("Expedition distance updated");
  }
}

function applyDebugCombatStatus() {
  const combat = game.expedition?.combat;
  if (!combat) return;
  const result = CombatSystem.applyStatus(combat, debugToolsState.combatEnemyId, debugToolsState.combatStatusId ?? Object.keys(COMBAT_STATUS_DEFINITIONS)[0], { source: "debug-tools" });
  if (result.applied) {
    renderScreen();
    DebugTools.refreshState();
    setDebugStatus(`Applied ${COMBAT_STATUS_DEFINITIONS[result.statusId].name}`);
  } else setDebugStatus(`Status not applied: ${result.reason}`);
}

function saveDebugNow() {
  if (typeof savePlayer === "function") savePlayer();
  else SaveSystem.save(game.player);
  renderDebugTools();
  setDebugStatus("Saved locally");
}

async function copyDebugState(value, message) {
  if (value == null) {
    setDebugStatus("No state is available to copy");
    return;
  }
  const text = JSON.stringify(value, null, 2);
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
    else {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.append(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    setDebugStatus(message);
  } catch (error) {
    setDebugStatus(`Clipboard unavailable: ${error.message}`);
  }
}

function finishDebugMutation(message) {
  if (typeof savePlayer === "function") savePlayer();
  else SaveSystem.save(game.player);
  if (typeof renderScreen === "function") renderScreen();
  renderDebugTools();
  setDebugStatus(message);
}

function debugMutationAllowed() {
  if (!debugReplayActive()) return true;
  setDebugStatus("Replay sandbox: debug mutations are disabled");
  return false;
}

function debugReplayActive() {
  return (typeof ReplayController !== "undefined" && ReplayController.isActive())
    || (typeof CampaignReplayController !== "undefined" && CampaignReplayController.isActive());
}

function canUseActiveExpedition() {
  return Boolean(game.expedition?.status === "active");
}

function selectedItemId() {
  return debugToolsPanel?.querySelector("#debug-item-select")?.value
    ?? debugToolsState.itemId
    ?? Object.keys(ITEM_DEFINITIONS).find((id) => !MaterialRules.isMaterialId(id));
}

function selectedMaterialId() {
  return debugToolsPanel?.querySelector("#debug-material-select")?.value
    ?? debugToolsState.materialId
    ?? debugMaterialCatalog()[0]?.id;
}

function selectedRecipeId() {
  return debugToolsPanel?.querySelector("#debug-recipe-select")?.value
    ?? debugToolsState.recipeId ?? Object.keys(RECIPE_DEFINITIONS)[0];
}

function selectedKnowledgeId() {
  return debugToolsPanel?.querySelector("#debug-knowledge-select")?.value
    ?? debugToolsState.knowledgeId ?? Object.keys(KNOWLEDGE_DEFINITIONS)[0];
}

function selectedEncounterId() {
  return debugToolsPanel?.querySelector("#debug-encounter-select")?.value
    ?? debugToolsState.encounterId ?? Object.keys(ENCOUNTER_DEFINITIONS)[0];
}

function selectedCombatId() {
  return debugToolsPanel?.querySelector("#debug-combat-select")?.value
    ?? debugToolsState.combatId ?? Object.keys(COMBAT_DEFINITIONS)[0];
}

function debugMaterialCatalog() {
  const ids = [...new Set([...Object.keys(MATERIAL_DEFINITIONS), ...Object.keys(ITEM_DEFINITIONS).filter((id) => MaterialRules.isMaterialId(id))])];
  return ids.map((id) => debugMaterialDefinition(id)).filter(Boolean).sort((left, right) => left.name.localeCompare(right.name));
}

function debugMaterialDefinition(materialId) {
  return MaterialRules.isMaterialId(materialId) ? { ...MaterialRules.definition(materialId), id: materialId } : null;
}

function filteredDebugCatalog(catalog, filter) {
  const query = String(filter ?? "").trim().toLowerCase();
  return catalog.filter((entry) => !query || `${entry.name} ${entry.id}`.toLowerCase().includes(query));
}

function filteredDebugItems() {
  return filteredDebugCatalog(Object.values(ITEM_DEFINITIONS).filter((item) => !MaterialRules.isMaterialId(item.id)), debugToolsState.itemFilter);
}

function filteredDebugMaterials() {
  return filteredDebugCatalog(debugMaterialCatalog(), debugToolsState.materialFilter);
}

function filteredDebugRecipes() {
  return filteredDebugCatalog(Object.values(RECIPE_DEFINITIONS), debugToolsState.recipeFilter);
}

function filteredDebugKnowledge() {
  return filteredDebugCatalog(Object.values(KNOWLEDGE_DEFINITIONS), debugToolsState.knowledgeFilter);
}

function debugCampaignFlags() {
  const flags = new Set(Object.keys(game.player.campaignFlags ?? {}));
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    if ((value.type === "setCampaignFlag" || value.type === "campaignFlag") && typeof value.flag === "string") flags.add(value.flag);
    Object.values(value).forEach(visit);
  };
  [ENCOUNTER_DEFINITIONS, CAMP_EVENT_DEFINITIONS, DIALOGUE_DEFINITIONS].forEach(visit);
  return [...flags].sort();
}

function debugExpeditionSnapshot(expedition) {
  if (!expedition) return "No active expedition.";
  return typeof debugExpeditionState === "function"
    ? debugExpeditionState(expedition)
    : JSON.stringify(expedition, null, 2);
}

function renderCombatDebugReadout(combat) {
  if (!combat) return '<p class="debug-muted">No active combat.</p>';
  const rows = [...(combat.allies ?? []), ...(combat.enemies ?? [])].map((combatant) => {
    const statuses = Object.values(combatant.statuses ?? {}).map((status) => `${COMBAT_STATUS_DEFINITIONS[status.statusId]?.name ?? status.statusId} (${status.remainingActivations ?? "?"})`).join(", ") || "none";
    const intent = combatant.intentId ? COMBAT_ENEMY_ACTION_DEFINITIONS[combatant.intentId]?.name ?? combatant.intentId : "—";
    return `<div class="debug-combatant-row"><strong>${escapeDebugText(combatant.name)}</strong><span>HP ${Math.ceil(combatant.hp)} / ${combatant.maxHp}</span><span>Gauge ${Number(combatant.gauge).toFixed(1)}</span><span>Intent ${escapeDebugText(intent)}</span><span>Status ${escapeDebugText(statuses)}</span></div>`;
  }).join("");
  const arthur = combat.allies?.find((ally) => ally.id === "arthur");
  const effects = arthur?.equippedCombatEffects ?? {};
  return `<p class="debug-muted">${escapeDebugText(combat.id)} · ${escapeDebugText(combat.status)} · active actor ${escapeDebugText(combat.activeActorId ?? "none")}</p><div class="debug-combatant-list">${rows}</div><details><summary>Arthur equipment effects / charges</summary><pre>${escapeDebugText(JSON.stringify({ equipment: combat.expedition?.selectedEquipment ?? {}, sourceItems: arthur?.sourceItemIds ?? [], effects, charges: arthur?.combatCharges ?? {} }, null, 2))}</pre></details>`;
}

function debugQuantityFrom(inputId) {
  return debugPositiveQuantity(debugToolsPanel?.querySelector(`#${inputId}`)?.value);
}

function debugNonNegativeInput(inputId) {
  return Math.max(0, Math.floor(Number(debugToolsPanel?.querySelector(`#${inputId}`)?.value) || 0));
}

function debugPositiveQuantity(value) {
  return Math.max(1, Math.floor(Number(value) || 1));
}

function clampDebugNumber(value, minimum, maximum) {
  const number = Number(value);
  return Math.min(Math.max(Number.isFinite(number) ? number : maximum, minimum), maximum);
}

function setDebugStatus(message) {
  const status = debugToolsPanel?.querySelector("#debug-tools-status");
  if (status) status.textContent = message;
}

function escapeDebugText(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[character]));
}
