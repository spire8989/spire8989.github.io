"use strict";

// Add ?debug=1 to the URL to expose the developer-only Game Debug panel.
const DEBUG_TOOLS_ENABLED = new URLSearchParams(window.location.search).has("debug");

const game = {
  player: SaveSystem.load(),
  expedition: null,
  screen: "campaign",
  preparationSupplies: 18,
  // Retained as a compatibility field for older runtime callers; preparation
  // is now always the unified expedition setup screen.
  preparationMode: "expedition",
  preparationStep: "route",
  activeDestinationId: null,
  shopTab: "buy",
  innTab: "rest",
  campTab: "rest",
  provisionShopStock: createProvisionShopStock(),
  itemShopStock: createItemShopStock(),
  dialogueSession: null,
  summary: null,
  elapsedSeconds: 0,
  lastTimestamp: null,
  hudAccumulator: 0,
  travelVisualState: null,
  craftingAction: null,
  restAction: null,
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
  document.addEventListener("input", handleAudioSettingInput);
  document.addEventListener("pointerdown", showPressedState);
  document.addEventListener("pointerup", clearPressedState);
  document.addEventListener("pointercancel", clearPressedState);
  AudioManager.initialize();
  renderScreen();
  requestAnimationFrame(gameLoop);
}

function handleAction(event) {
  const control = event.target.closest("[data-action]");
  if (!control || control.disabled) {
    return;
  }

  const { action, itemId, materialId, recipeId, companionId, choiceId, destinationId, slotIndex, expeditionId, abilityId } = control.dataset;

  // Replay playback owns an isolated game state. Keep the real gameplay
  // controls visible for faithful rendering, but do not let them mutate the
  // sandbox while the recorded decisions are driving it.
  if ((typeof ReplayController !== "undefined" && ReplayController.isActive())
    || (typeof CampaignReplayController !== "undefined" && CampaignReplayController.isActive())) {
    return;
  }

  AudioManager.unlock();
  AudioManager.playAction(action);

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
    case "dialogue-continue":
      advanceDialogue();
      break;
    case "dialogue-choice":
      chooseDialogue(choiceId);
      break;
    case "npc-talk":
      showNpcDialogue(control.dataset.npcId, "dialogue");
      break;
    case "hear-rumor":
      showNpcDialogue(control.dataset.npcId, "rumors");
      break;
    case "rest-at-inn":
      beginInnRest();
      break;
    case "inn-tab":
      game.innTab = ["rest", "cook"].includes(control.dataset.tab) ? control.dataset.tab : "rest";
      refreshDestination();
      break;
    case "shop-tab":
      game.shopTab = ["buy", "sell", "craft"].includes(control.dataset.tab)
        ? control.dataset.tab : "buy";
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
    case "inn-cook-recipe":
      cookInnRecipe(recipeId);
      break;
    case "treat-injury":
      treatInjury(control.dataset.targetId, itemId);
      break;
    case "view-inventory":
    case "prepare-expedition":
      game.preparationMode = "expedition";
      game.preparationStep = "route";
      game.preparationSupplies = Math.min(
        Math.max(game.preparationSupplies, EXPEDITION_TUNING.minimumStartingProvisions),
        game.player.provisions,
        partyProvisionCapacity(selectedCompanionIds(game.player)),
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
    case "change-material-bag":
      changeMaterialBag(materialId, Number(control.dataset.amount));
      break;
    case "select-companion":
      selectCompanion(companionId, Number(slotIndex) || 0);
      break;
    case "toggle-ability-loadout":
      toggleAbilityLoadout(abilityId);
      break;
    case "select-expedition":
      selectExpedition(expeditionId);
      break;
    case "preparation-continue":
      advancePreparationStep();
      break;
    case "preparation-back":
      retreatPreparationStep();
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
    case "set-pace":
      setExpeditionPace(control.dataset.paceId);
      break;
    case "set-rations":
      setExpeditionRations(control.dataset.rationId);
      break;
    case "pause-travel":
      pauseTravel();
      break;
    case "resume-travel":
      resumeTravel();
      break;
    case "brief-rest":
      briefRest();
      break;
    case "make-camp":
      makeCamp();
      break;
    case "camp-tab":
      setCampTab(control.dataset.tab);
      break;
    case "camp-rest":
      campRest();
      break;
    case "cook-recipe":
      cookRecipe(recipeId);
      break;
    case "camp-craft-item":
      craftCampItem(recipeId);
      break;
    case "leave-camp":
      leaveCamp();
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
    case "toggle-audio-settings":
      AudioManager.toggleSettings();
      break;
    case "toggle-audio-mute":
      AudioManager.setMuted(!AudioManager.settings().muted);
      break;
    default:
      break;
  }
}

function showPressedState(event) {
  AudioManager.unlock();
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
  if (game.screen !== "expedition") AudioManager.stopAmbience();
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
  const locationEntry = CampaignRules.enterLocation(game.player, game.provisionShopStock);
  if (locationEntry.provisionsGranted > 0 || locationEntry.shopProvisionsRestocked > 0) {
    savePlayer();
  }
  game.activeDestinationId = null;
  game.dialogueSession = null;
  showScreen("location");
}

function handleAudioSettingInput(event) {
  const setting = event.target?.dataset?.audioSetting;
  if (setting === "sfxVolume") AudioManager.setSfxVolume(event.target.value);
  if (setting === "ambienceVolume") AudioManager.setAmbienceVolume(event.target.value);
}

function assetAttribute(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function renderImageAsset(assetId, className = "", alt = "") {
  const path = AssetCatalog.imagePath(assetId);
  if (!path) return "";
  const loadHandler = "const frame=this.closest('[data-asset-frame]');frame?.classList.add('asset-image-active');frame?.classList.remove('asset-load-failed')";
  const failureHandler = "this.hidden=true;const frame=this.closest('[data-asset-frame]');frame?.classList.remove('asset-image-active');frame?.classList.add('asset-load-failed');frame?.querySelector('.portrait-fallback')?.classList.add('is-visible')";
  return `<img class="asset-image ${className}" src="${assetAttribute(path)}" alt="${assetAttribute(alt)}" loading="lazy" decoding="async" onload="${loadHandler}" onerror="${failureHandler}">`;
}

const travelScenePreloadCache = new Map();

function orderedTravelScenes(definition) {
  return (Array.isArray(definition?.travelScenes) ? definition.travelScenes : [])
    .map((scene, index) => ({
      ...scene,
      minDistance: Number(scene?.minDistance),
      _authoredIndex: index,
    }))
    .filter((scene) => Number.isFinite(scene.minDistance)
      && scene.minDistance >= 0
      && typeof scene.visualAssetId === "string"
      && scene.visualAssetId)
    .sort((left, right) => left.minDistance - right.minDistance || left._authoredIndex - right._authoredIndex);
}

function resolveTravelSceneAssetId(expedition) {
  const definition = expeditionDefinition(expedition);
  const distance = Math.max(0, Number(expedition?.distance) || 0);
  const activeScene = orderedTravelScenes(definition)
    .filter((scene) => scene.minDistance <= distance)
    .at(-1);
  return activeScene?.visualAssetId ?? definition?.travelVisualAssetId ?? null;
}

function renderTravelVisualAsset(assetId, alt) {
  const path = AssetCatalog.imagePath(assetId);
  const image = path
    ? `<img class="asset-image travel-visual-asset is-visible" data-travel-layer="current" data-travel-asset-id="${assetAttribute(assetId)}" src="${assetAttribute(path)}" alt="${assetAttribute(alt)}" loading="eager" fetchpriority="high" decoding="async" onload="markTravelImageActive(this.closest('[data-asset-frame]'), this)" onerror="markTravelImageFailed(this.closest('[data-asset-frame]'), this)">`
    : "";
  return `<div class="travel-art" id="travel-art" data-travel-asset-id="${assetAttribute(assetId ?? "")}">${image}</div>`;
}

function isTravelPanorama(image) {
  const width = Number(image?.naturalWidth);
  const height = Number(image?.naturalHeight);
  return width > 0 && height > 0 && width / height >= 2.2;
}

function updateTravelImagePresentation(scene, image) {
  if (!scene?.isConnected || !image?.isConnected) return;
  const art = image.closest("#travel-art");
  const panorama = isTravelPanorama(image);
  image.classList.toggle("is-panorama", panorama);
  image.dataset.travelAspect = panorama ? "panorama" : "standard";
  scene.classList.toggle("has-travel-panorama", panorama);
  if (!panorama) {
    image.style.removeProperty("--travel-pan-range");
    return;
  }
  const frameWidth = art?.clientWidth ?? scene.clientWidth;
  const renderedWidth = image.offsetWidth;
  const range = Math.max(0, renderedWidth - frameWidth);
  image.style.setProperty("--travel-pan-range", `${range}px`);
  if (renderedWidth <= frameWidth) {
    window.requestAnimationFrame(() => {
      if (image.isConnected) updateTravelImagePresentation(scene, image);
    });
  }
}

function travelImageAnimation(image) {
  const animations = image?.getAnimations?.() ?? [];
  return animations.find((animation) => (
    animation.animationName === "travel-panorama" || animation.animationName === "travel-art-drift"
  )) ?? animations[0] ?? null;
}

function captureTravelVisualState(expedition = game.expedition) {
  const image = document.querySelector("#travel-art .travel-visual-asset.is-visible:not([hidden])");
  if (!image) return null;
  const animation = travelImageAnimation(image);
  const currentTime = Number(animation?.currentTime);
  return {
    expedition,
    expeditionId: expedition?.expeditionId ?? expedition?.id ?? "",
    assetId: image.dataset.travelAssetId || "",
    currentTime: Number.isFinite(currentTime) ? currentTime : null,
  };
}

function restoreTravelVisualState(image) {
  const saved = game.travelVisualState;
  const expedition = game.expedition;
  const encounter = expedition?.activeEncounter
    ? EncounterManager.definitionFor(expedition)
    : null;
  const hasDedicatedEncounterArtwork = Boolean(
    encounter?.visualAssetId && AssetCatalog.imagePath(encounter.visualAssetId),
  );
  const isEncounterTravelFallback = Boolean(expedition?.activeEncounter)
    && !hasDedicatedEncounterArtwork
    && saved?.assetId === image?.dataset.travelAssetId;
  if (!saved || (expedition?.activeEncounter && !isEncounterTravelFallback)) return;
  if (saved.expedition !== expedition
    || saved.expeditionId !== (expedition?.expeditionId ?? expedition?.id ?? "")
    || saved.assetId !== image?.dataset.travelAssetId) {
    if (saved.expedition === expedition) game.travelVisualState = null;
    return;
  }
  window.requestAnimationFrame(() => {
    if (!image.isConnected || game.travelVisualState !== saved) return;
    const animation = travelImageAnimation(image);
    if (animation && saved.currentTime !== null) animation.currentTime = saved.currentTime;
    if (!isEncounterTravelFallback) game.travelVisualState = null;
  });
}

function markTravelImageActive(scene, image) {
  if (!scene?.isConnected || !image?.isConnected) return;
  const art = image.closest("#travel-art");
  image.hidden = false;
  image.classList.remove("is-fading-out");
  image.classList.add("is-visible");
  scene.classList.remove("asset-load-failed");
  scene.classList.add("asset-image-active");
  scene.dataset.travelAssetFailedId = "";
  if (art) art.dataset.travelAssetFailedId = "";
  updateTravelImagePresentation(scene, image);
  restoreTravelVisualState(image);
}

function markTravelImageFailed(scene, image) {
  if (!scene?.isConnected) return;
  const art = image?.closest("#travel-art") ?? scene.querySelector("#travel-art");
  const failedId = image?.dataset.travelAssetId || scene.dataset.travelDesiredAssetId || "";
  scene.querySelectorAll(".travel-visual-asset").forEach((candidate) => {
    candidate.hidden = true;
    candidate.classList.remove("is-visible", "is-fading-out");
  });
  scene.classList.remove("asset-image-active");
  scene.classList.remove("has-travel-panorama");
  scene.classList.add("asset-load-failed");
  scene.dataset.travelAssetId = "";
  scene.dataset.travelAssetFailedId = failedId;
  if (art) {
    art.dataset.travelAssetId = "";
    art.dataset.travelAssetFailedId = failedId;
    art.querySelector("[data-travel-layer='next']")?.remove();
  }
}

function bindTravelImage(scene, image) {
  if (!scene || !image || image.dataset.travelBound === "true") return;
  image.dataset.travelBound = "true";
  image.addEventListener("load", () => {
    if (!image.isConnected || image.dataset.travelAssetId !== scene.dataset.travelDesiredAssetId) {
      if (image.dataset.travelLayer === "next") image.remove();
      return;
    }
    const oldImage = scene.querySelector("[data-travel-layer='current']");
    const isTransition = image.dataset.travelLayer === "next" && oldImage && oldImage !== image;
    if (isTransition) oldImage.classList.add("is-fading-out");
    markTravelImageActive(scene, image);
    scene.dataset.travelAssetId = image.dataset.travelAssetId;
    if (image.dataset.travelLayer === "next") {
      image.dataset.travelLayer = "current";
      window.setTimeout(() => {
        if (oldImage?.isConnected && oldImage !== image) oldImage.remove();
      }, 760);
    }
  });
  image.addEventListener("error", () => markTravelImageFailed(scene, image));
  if (image.complete) {
    if (image.naturalWidth > 0) image.dispatchEvent(new Event("load"));
    else if (image.currentSrc || image.src) image.dispatchEvent(new Event("error"));
  }
}

function preloadNextTravelScene(expedition) {
  const definition = expeditionDefinition(expedition);
  const scenes = orderedTravelScenes(definition);
  if (!scenes.length) return;
  const distance = Math.max(0, Number(expedition?.distance) || 0);
  const activeIndex = scenes.reduce((index, scene, sceneIndex) => (
    scene.minDistance <= distance ? sceneIndex : index
  ), -1);
  const nextIndex = expedition?.direction === "returning" ? activeIndex - 1 : activeIndex + 1;
  const nextScene = scenes[nextIndex];
  const path = AssetCatalog.imagePath(nextScene?.visualAssetId);
  if (!path || travelScenePreloadCache.has(nextScene.visualAssetId)) return;
  const image = new Image();
  image.decoding = "async";
  image.src = path;
  travelScenePreloadCache.set(nextScene.visualAssetId, image);
}

function syncTravelVisual(expedition, activeEncounter) {
  const scene = document.querySelector("#travel-scene");
  const art = document.querySelector("#travel-art");
  if (!scene || !art) return;
  const desiredAssetId = resolveExpeditionVisualAssetId(expedition, "travel", activeEncounter);
  const desiredPath = AssetCatalog.imagePath(desiredAssetId);
  if (!activeEncounter && game.travelVisualState
    && (game.travelVisualState.expedition !== expedition
      || game.travelVisualState.assetId !== desiredAssetId)) {
    game.travelVisualState = null;
  }
  art.dataset.travelDesiredAssetId = desiredAssetId ?? "";
  scene.dataset.travelDesiredAssetId = desiredAssetId ?? "";
  if (!desiredPath) {
    art.querySelectorAll(".travel-visual-asset").forEach((image) => image.remove());
    scene.classList.remove("asset-image-active", "asset-load-failed");
    art.dataset.travelAssetId = "";
    art.dataset.travelAssetFailedId = "";
    return;
  }
  if (art.dataset.travelAssetFailedId === desiredAssetId) return;
  const current = art.querySelector("[data-travel-layer='current']");
  const pending = art.querySelector("[data-travel-layer='next']");
  if (current && art.dataset.travelAssetId === desiredAssetId && !current.hidden) {
    bindTravelImage(scene, current);
    return;
  }
  if (pending?.dataset.travelAssetId === desiredAssetId) {
    bindTravelImage(scene, pending);
    return;
  }
  if (current && !scene.classList.contains("asset-image-active")) current.remove();
  pending?.remove();
  const next = document.createElement("img");
  next.className = "asset-image travel-visual-asset";
  next.dataset.travelLayer = current && scene.classList.contains("asset-image-active") ? "next" : "current";
  next.dataset.travelAssetId = desiredAssetId;
  next.alt = activeEncounter?.title ?? expeditionDefinition(expedition).name;
  next.loading = "eager";
  next.decoding = "async";
  next.fetchPriority = "high";
  next.src = desiredPath;
  art.append(next);
  art.dataset.travelAssetId = desiredAssetId;
  bindTravelImage(scene, next);
}

function renderPortraitAsset(assetId, initials, alt) {
  const fallbackVisibility = AssetCatalog.imagePath(assetId) ? "" : " is-visible";
  return `${renderImageAsset(assetId, "dialogue-portrait-image", alt)}<span class="portrait-fallback${fallbackVisibility}">${initials}</span>`;
}

function renderCombatVisual(assetId, fallback, alt) {
  return `${renderImageAsset(assetId, "combat-visual-image", alt)}<span class="combat-visual-fallback">${fallback}</span>`;
}

function expeditionDefinition(expedition) {
  return ExpeditionCatalog.get(expedition?.expeditionId ?? expedition?.id);
}

function resolveExpeditionVisualAssetId(expedition, mode = "travel", encounter = null) {
  const definition = expeditionDefinition(expedition);
  const encounterAssetId = encounter?.visualAssetId && AssetCatalog.imagePath(encounter.visualAssetId)
    ? encounter.visualAssetId
    : null;
  return encounterAssetId
    ?? (mode === "camp" ? definition.campVisualAssetId : resolveTravelSceneAssetId(expedition))
    ?? null;
}

function syncExpeditionAmbience(expedition, mode = "travel", encounter = null) {
  const definition = expeditionDefinition(expedition);
  const assetId = encounter?.ambienceAssetId
    ?? (mode === "camp" ? definition.campAmbienceAssetId : definition.travelAmbienceAssetId)
    ?? null;
  AudioManager.setAmbience(assetId);
}

function playEncounterAudio(encounter) {
  if (encounter?.stingAssetId && AudioManager.playSfx(encounter.stingAssetId)) return;
  AudioManager.playSemantic("encounter");
}

function resolveDialoguePortraitAssetId(node, speaker) {
  const nodeAssetId = node?.portraitAssetId;
  const speakerAssetId = speaker?.portraitAssetId;
  return AssetCatalog.hasImage(nodeAssetId) ? nodeAssetId
    : AssetCatalog.hasImage(speakerAssetId) ? speakerAssetId
      : null;
}

function renderLocation() {
  const location = LOCATION_DEFINITIONS[game.player.currentLocationId];
  if (!location) {
    showScreen("campaign");
    return;
  }

  const villageUnlocked = isVillageUnlocked();
  const destinations = location.destinations.map((destinationId) => {
    const destination = DESTINATION_DEFINITIONS[destinationId];
    const locked = destination.requiresIntro !== false && !villageUnlocked;
    return `
      <button class="hub-hotspot position-${destination.scenePosition} ${destination.type === "story" ? "is-story-destination" : ""} ${locked ? "is-locked" : ""}" type="button"
        data-action="open-destination" data-destination-id="${destination.id}" ${locked ? "disabled aria-disabled=\"true\"" : ""}>
        <span class="hub-building-icon" aria-hidden="true">${destinationIcon(destination.type)}</span>
        <strong>${destination.name}</strong>
        ${locked ? "<span class=\"hub-lock-label\">Available after the Hall</span>" : ""}
      </button>`;
  }).join("");

  ui.screenRoot.innerHTML = `
    <section class="screen location-screen" aria-labelledby="location-title">
      <div data-asset-frame="location" class="location-scene" aria-label="Village scene with five destinations">
        ${renderImageAsset(location.visualAssetId, "location-visual-asset", location.name)}
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
          <span><strong>${game.player.faith}/${game.player.maxFaith}</strong> Faith</span>
          <span><strong>${Math.ceil(HealingRules.arthurHealth(game.player))}/${HealingRules.arthurMaxHealth(game.player)}</strong> Health</span>
        </div>
        <div class="hub-actions">
          <button class="text-button" type="button" data-action="show-campaign">Chapter Select</button>
          <button class="game-button" type="button" data-action="prepare-expedition" ${villageUnlocked ? "" : "disabled"}>Prepare for Expedition</button>
        </div>
      </div>
    </section>`;
}

function openDestination(destinationId) {
  const location = LOCATION_DEFINITIONS[game.player.currentLocationId];
  if (!location?.destinations.includes(destinationId) || !DESTINATION_DEFINITIONS[destinationId]) {
    return;
  }
  const destination = DESTINATION_DEFINITIONS[destinationId];
  if (destination.requiresIntro !== false && !isVillageUnlocked()) return;
  game.activeDestinationId = destinationId;
  game.shopTab = "buy";
  game.innTab = "rest";
  game.campTab = "rest";
  game.dialogueSession = null;
  const npc = NPC_DEFINITIONS[destination.npcIds[0]];
  if (destination.type === "story" && !isVillageUnlocked()) {
    game.dialogueSession = DialogueSystem.start(npc?.introDialogueSequenceId, {
      player: game.player,
      returnContext: { type: "destination", destinationId },
    });
  }
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

  if (destination.type === "story") {
    interaction = renderHallInteraction(destination, npc);
  } else if (destination.shopId) {
    interaction = renderShopInteraction(destination, npc);
  } else {
    interaction = renderInnInteraction(destination, npc);
  }

  ui.screenRoot.innerHTML = `
    <section class="screen destination-screen" aria-labelledby="destination-title">
      <div data-asset-frame="destination" class="visual-frame destination-visual visual-${destination.visualKey}">
        ${renderImageAsset(destination.visualAssetId, "destination-visual-asset", destination.name)}
        <span class="destination-emblem" aria-hidden="true">${destinationIcon(destination.type)}</span>
      </div>
      <div class="destination-panel">
        <header class="interaction-header">
          <button class="interaction-back" type="button" data-action="show-location">← Village</button>
          <strong id="destination-title">${destination.name}</strong>
          <span>${Math.floor(game.player.currentGold)}g · ${game.player.provisions} food</span>
        </header>
        <div class="interaction-scroll">
          ${interaction}
        </div>
      </div>
      ${game.dialogueSession ? renderDialogueOverlay(game.dialogueSession) : ""}
    </section>`;
}

function renderHallInteraction(destination, npc) {
  const objective = isVillageUnlocked()
    ? "Find a way to reach Merlin."
    : "Speak with the Reeve to learn why Arthur has come to Brocéliande.";
  return `
    <article class="npc-card hall-leader-card">
      <div><strong>${npc.name}</strong><span>${npc.role}</span></div>
      <p>${npc.description}</p>
      <button class="small-button" type="button" data-action="npc-talk" data-npc-id="${npc.id}">Talk</button>
    </article>
    <section class="hall-objective" aria-labelledby="hall-objective-title">
      <p class="eyebrow" id="hall-objective-title">Current Objective</p>
      <strong>${objective}</strong>
    </section>`;
}

function renderInnInteraction(destination, npc) {
  const cookingSelected = game.innTab === "cook";
  const taskBusy = Boolean(game.restAction || game.craftingAction);
  const tabs = `
    <div class="inn-tabs" role="tablist" aria-label="Inn actions">
      <button class="${cookingSelected ? "" : "is-selected"}" type="button" role="tab" aria-selected="${!cookingSelected}" data-action="inn-tab" data-tab="rest" ${taskBusy ? "disabled" : ""}>Rest</button>
      <button class="${cookingSelected ? "is-selected" : ""}" type="button" role="tab" aria-selected="${cookingSelected}" data-action="inn-tab" data-tab="cook" ${taskBusy ? "disabled" : ""}>Cook</button>
    </div>`;
  if (cookingSelected) {
    return `
      <article class="npc-card">
        <div><strong>${npc.name}</strong><span>${npc.role}</span></div>
        <p>${npc.description}</p>
      </article>
      <div class="interaction-actions">
        <button class="small-button" type="button" data-action="npc-talk" data-npc-id="${npc.id}">Talk</button>
        <button class="small-button" type="button" data-action="hear-rumor" data-npc-id="${npc.id}">Hear Rumor</button>
      </div>
      ${tabs}
      ${renderInnCookingPanel(destination)}`;
  }
  const rest = HealingRules.quoteInnRest(game.player);
  const restBusy = Boolean(game.restAction);
  const partyHealth = rest.partyMembers.map((member) => `
    <div class="inn-health-row">
      <strong>${member.name}</strong>
      <span>${rest.fullHealth ? `${member.healthBefore} / ${member.maxHealth}` : `${member.healthBefore} / ${member.maxHealth} &rarr; ${member.healthAfter} / ${member.maxHealth}`}</span>
      <span class="inn-health-result">${rest.fullHealth ? "Full Health" : `+${member.healingAmount} HP`}</span>
    </div>`).join("");
  const restAction = rest.fullHealth
    ? `<p class="inn-rest-complete">Everyone is fully rested.</p>`
    : restBusy
      ? renderInnRestProgress(game.restAction)
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
    ${tabs}
    <article class="provision-offer inn-rest-offer">
      <div class="inn-rest-heading"><strong>Rest the Company</strong><span>${rest.fullHealth ? "No payment needed" : "One rest"}</span></div>
      <div class="inn-health-list">${partyHealth}</div>
      ${renderPersistentInjuryPanel(game.player, { title: "Persistent injuries", includeTreatment: false })}
      ${restAction}
    </article>`;
}

function renderInnCookingPanel(destination) {
  const recipes = CraftingRules.knownRecipesForProvider(game.player, destination.craftingProviderId ?? "campfire");
  const rows = recipes.map((recipe) => craftingRow(recipe, "campfire", { action: "inn-cook-recipe" })).join("");
  return `
    <section class="inn-cooking-panel" aria-labelledby="inn-cooking-title">
      <div class="section-title-row"><h2 id="inn-cooking-title">Cook for the Road</h2><span>Town Materials → Provisions</span></div>
      <p class="section-help">Use known campfire recipes without starting an expedition. Finished meals go directly into the village provision stores.</p>
      ${renderCookingIngredientInventory()}
      ${renderMaterialInventory()}
      <div class="shop-list inn-recipe-list">${rows || '<p class="empty-loot">No recipes are known at this hearth.</p>'}</div>
    </section>`;
}

function renderInnRestProgress(action) {
  const percent = Math.round((action.progress ?? 0) * 100);
  return `<div class="inn-rest-progress" aria-live="polite"><div class="inn-rest-progress-heading"><strong>Resting...</strong><span>${percent}%</span></div><div class="crafting-progress-track"><div class="crafting-progress-fill" style="width:${percent}%"></div></div><p>Healing and recovery apply when the rest is complete.</p></div>`;
}

function beginInnRest() {
  if (game.activeDestinationId !== "inn") return;
  if (game.restAction || game.craftingAction) return;
  const quote = HealingRules.quoteInnRest(game.player);
  if (quote.fullHealth || !quote.available) {
    restAtInn();
    return;
  }
  game.restAction = {
    startedAt: performance.now(),
    durationMs: HEALING_TUNING.innRestDurationMs,
    progress: 0,
  };
  refreshDestination();
}

function restAtInn() {
  if (game.activeDestinationId !== "inn") return;
  const result = HealingRules.restAtInn(game.player);
  if (result.applied) {
    const recovery = result.partyMembers.map(
      (member) => `${member.name} recovers ${member.healingAmount} health`,
    ).join("; ");
    const treated = (result.injuriesTreated ?? []).map((entry) => entry.definition?.name).filter(Boolean);
    showToast({
      title: "Rested at the Inn",
      message: `${recovery}${treated.length ? `. Eased ${treated.join(", ")}` : ""}. ${result.goldCost} gold was paid.`,
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
  const taskBusy = game.craftingAction ? "disabled" : "";
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
  const treatmentPanel = destination.craftingProviderId === "apothecary"
    ? renderPersistentInjuryPanel(game.player, { title: "Treat injuries", includeTreatment: true }) : "";

  return `
    <div class="shopkeeper-row">
      <div><strong>${npc.name}</strong><span>${npc.role}</span></div>
      <span class="gold-display">${Math.floor(game.player.currentGold)} gold</span>
    </div>
    <div class="shop-tabs" role="tablist" aria-label="Shop actions">
      <button class="${buySelected ? "is-selected" : ""}" type="button" role="tab" aria-selected="${buySelected}" data-action="shop-tab" data-tab="buy" ${taskBusy}>Buy</button>
      <button class="${sellSelected ? "is-selected" : ""}" type="button" role="tab" aria-selected="${sellSelected}" data-action="shop-tab" data-tab="sell" ${taskBusy}>Sell</button>
      ${destination.craftingProviderId ? `<button class="${craftSelected ? "is-selected" : ""}" type="button" role="tab" aria-selected="${craftSelected}" data-action="shop-tab" data-tab="craft" ${taskBusy}>Craft</button>` : ""}
      <button type="button" data-action="npc-talk" data-npc-id="${npc.id}" ${taskBusy}>Talk</button>
    </div>
    ${provisionOffer}
    ${materials}
    ${treatmentPanel}
    <div class="shop-list">${rows || '<p class="empty-loot">Nothing available.</p>'}</div>`;
}

function renderMaterialInventory() {
  const entries = Object.entries(game.player.materials)
    .filter(([, quantity]) => quantity > 0)
    .sort(([left], [right]) => (RARITY_DEFINITIONS[MaterialRules.definition(left).rarity]?.rank ?? 0)
      - (RARITY_DEFINITIONS[MaterialRules.definition(right).rarity]?.rank ?? 0)
      || MaterialRules.definition(left).name.localeCompare(MaterialRules.definition(right).name));
  const chips = entries.map(([materialId, quantity]) => (
    `<span class="material-chip rarity-${MaterialRules.definition(materialId).rarity}">${itemIcon("material", { ...MaterialRules.definition(materialId), id: materialId, category: "material" })}<span>${MaterialRules.definition(materialId).name}</span> <strong>${quantity}</strong></span>`
  )).join("");
  return `<div class="material-inventory"><span>Materials</span><div>${chips || '<em>None owned</em>'}</div></div>`;
}

function renderCookingIngredientInventory() {
  const ingredientIds = [...new Set(Object.values(RECIPE_DEFINITIONS)
    .filter((recipe) => recipe.craftingProvider === "campfire")
    .flatMap((recipe) => CraftingRules.normalizeRecipeIngredients(recipe)
      .filter((ingredient) => ingredient.type === "item")
      .map((ingredient) => ingredient.id)))];
  const chips = ingredientIds
    .map((itemId) => ({ itemId, item: ITEM_DEFINITIONS[itemId], quantity: game.player.materials[itemId] ?? game.player.ownedItems[itemId] ?? 0 }))
    .filter((entry) => entry.item && entry.quantity > 0)
    .map(({ item, quantity }) => (
      `<span class="material-chip"><span>${itemIcon(item.category, item)}${item.name}</span> <strong>${quantity}</strong></span>`
    )).join("");
  return `<div class="material-inventory"><span>Town Ingredients</span><div>${chips || '<em>None owned</em>'}</div></div>`;
}

function renderMaterialBagChips(expedition, emptyLabel = "None") {
  const entries = Object.entries(MaterialRules.expeditionContents(expedition))
    .filter(([, quantity]) => quantity > 0)
    .map(([materialId, quantity]) => `<span class="material-chip">${itemIcon("material", { ...MaterialRules.definition(materialId), id: materialId, category: "material" })}<span>${MaterialRules.definition(materialId).name}</span> <strong>${quantity}</strong></span>`)
    .join("");
  return entries || `<em>${emptyLabel}</em>`;
}

function craftingRow(recipe, providerId, options = {}) {
  const quote = CraftingRules.quote(game.player, recipe.id, providerId, options);
  const ingredients = quote.ingredientStatus.map(({ type, ingredientId, materialId, itemId, required, owned, sufficient }) => {
    const name = type === "item"
      ? ITEM_DEFINITIONS[itemId ?? ingredientId]?.name ?? itemId ?? "Item"
      : MaterialRules.definition(materialId ?? ingredientId)?.name ?? materialId ?? "Material";
    return `<span class="crafting-requirement crafting-ingredient ${sufficient ? "" : "is-missing"}">${name} ${owned}/${required}</span>`;
  }).join("");
  const cost = recipe.goldCost > 0
    ? `<span class="crafting-requirement crafting-gold">${recipe.goldCost} gold</span>`
    : "";
  const output = recipe.output.provisions > 0
    ? `${recipe.output.provisions} Provisions`
    : `${quote.item?.name ?? "Unknown item"}${recipe.output.quantity > 1 ? ` ×${recipe.output.quantity}` : ""}`;
  const outputLabel = `<span class="crafting-output">Creates ${output}</span>`;
  const action = options.action ?? "craft-item";
  const busy = Boolean(game.craftingAction || game.restAction);
  const active = game.craftingAction?.recipeId === recipe.id;
  const progress = active ? renderCraftingProgress(game.craftingAction, { inline: true }) : "";
  return `
    <article class="shop-item-row crafting-row ${quote.available ? "" : "is-blocked"} ${active ? "is-busy" : ""}" data-recipe-id="${recipe.id}">
      <div class="item-icon" aria-hidden="true">${recipe.output.provisions > 0 ? categoryIcon("healing") : itemIcon(quote.item?.category, quote.item)}</div>
      <div><strong>${recipe.name} <span class="rarity-label">${capitalize(recipe.rarity)}</span></strong><span>${recipe.description}</span><span class="crafting-cost"><span class="crafting-requirements">${ingredients}${cost}</span></span>${outputLabel}${progress}</div>
      <button class="small-button" type="button" data-action="${action}" data-recipe-id="${recipe.id}" ${busy ? "disabled" : ""}>${active ? "Working..." : busy ? "Busy" : providerId === "campfire" ? "Cook" : "Craft"}</button>
    </article>`;
}

function renderPersistentInjuryPanel(holder, options = {}) {
  const entries = InjuryRules.characterIds()
    .filter((characterId) => characterId === "arthur" || selectedCompanionIds(holder).includes(characterId))
    .flatMap((characterId) => InjuryRules.forCharacter(holder, characterId)
      .map((instance) => ({ characterId, instance, injuryId: InjuryRules.idOf(instance) })));
  if (!entries.length) return "";
  const rows = entries.map(({ characterId, injuryId, instance }) => {
    const injury = INJURY_DEFINITIONS[injuryId];
    const itemId = InjuryRules.treatmentItemFor(injuryId);
    const canTreat = options.includeTreatment && itemId && (holder.ownedItems?.[itemId] ?? 0) > 0;
    const recovery = Number(instance.remainingRecoveryDistance) > 0
      ? `<span>${Math.ceil(instance.remainingRecoveryDistance)} leagues until recovery${instance.stabilized ? " · Stabilized" : ""}</span>`
      : instance.stabilized ? "<span>Stabilized</span>" : "";
    return `<div class="injury-row"><div><strong>${characterNameForUi(characterId)} · <span class="injury-name ${injurySemanticTone(injuryId)}">${injury.name}</span></strong><span>${injury.description}</span>${recovery}</div>${canTreat ? `<button class="small-button" type="button" data-action="treat-injury" data-target-id="${characterId}" data-item-id="${itemId}">Use ${ITEM_DEFINITIONS[itemId].name}</button>` : itemId && options.includeTreatment ? `<span class="injury-treatment-missing">Need ${ITEM_DEFINITIONS[itemId].name}</span>` : ""}</div>`;
  }).join("");
  return `<section class="injury-panel" aria-label="${options.title ?? "Injuries"}"><div class="section-title-row"><strong>${options.title ?? "Injuries"}</strong><span>${entries.length}/${InjuryRules.maximumActive} active</span></div>${rows}</section>`;
}

function characterNameForUi(characterId) {
  return characterId === "arthur" ? PLAYER_CHARACTER_DEFINITION.name : COMPANION_DEFINITIONS[characterId]?.name ?? characterId;
}

function renderCraftingProgress(action, options = {}) {
  const recipe = RECIPE_DEFINITIONS[action.recipeId];
  const percent = Math.round((action.progress ?? 0) * 100);
  const verb = action.providerId === "campfire" ? "Cooking" : "Crafting";
  return `<div class="crafting-progress ${options.inline ? "crafting-progress-inline" : ""}" data-recipe-id="${action.recipeId}" aria-live="polite"><div class="crafting-progress-heading"><strong>${verb} ${recipe?.name ?? "item"}...</strong><span>${percent}%</span></div><div class="crafting-progress-track"><div class="crafting-progress-fill" style="width:${percent}%"></div></div><p>Ingredients are only consumed when complete.</p></div>`;
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
  const craftingDestination = DESTINATION_DEFINITIONS[game.activeDestinationId];
  beginCraftingAction(recipeId, craftingDestination?.craftingProviderId, { screen: "destination", destinationId: game.activeDestinationId });
  return;
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

function cookInnRecipe(recipeId) {
  if (game.activeDestinationId !== "inn") return;
  beginCraftingAction(recipeId, "campfire", {
    screen: "destination", destinationId: "inn", context: "inn",
  });
}

function beginCraftingAction(recipeId, providerId, context = {}) {
  if (game.craftingAction || game.restAction || !providerId) return;
  const expedition = context.expedition ?? null;
  const quote = CraftingRules.quote(game.player, recipeId, providerId, {
    ...context,
    ...(expedition ? { expedition } : {}),
  });
  if (!quote.available) {
    const reason = craftingBlockReasonForUi(quote);
    showToast({ title: craftingFailureTitle({ reason, quote }), message: craftingFailureMessage({ reason, quote }), type: "warning" });
    return;
  }
  game.craftingAction = {
    recipeId,
    providerId,
    context: context.context ?? (expedition ? "camp" : providerId === "campfire" ? "inn" : "town"),
    expedition,
    screen: context.screen ?? game.screen,
    destinationId: context.destinationId ?? game.activeDestinationId,
    startedAt: performance.now(),
    durationMs: CraftingRules.durationMs(providerId, quote.recipe),
    progress: 0,
  };
  if (game.screen === "destination") refreshDestination();
  else if (game.screen === "expedition") refreshExpedition();
}

function craftingBlockReasonForUi(quote) {
  if (!quote.recipe || !quote.validOutput) return "invalid-recipe";
  if (!quote.known) return "recipe-unknown";
  if (!quote.correctProvider) return "wrong-provider";
  if (!quote.contextValid) return quote.context === "camp" ? "camp-requires-expedition" : "inn-requires-town";
  if (quote.uniqueAlreadyOwned) return "unique-item-owned";
  if (!quote.affordable) return "insufficient-gold";
  if (quote.ingredientStatus.some((entry) => !entry.sufficient)) return "insufficient-materials";
  return "unavailable";
}

function completeCraftingAction() {
  const action = game.craftingAction;
  if (!action) return;
  game.craftingAction = null;
  const stillValid = action.screen === game.screen
    && (action.screen !== "destination" || action.destinationId === game.activeDestinationId)
    && (!action.expedition || action.expedition === game.expedition)
    && (!action.expedition || action.expedition.travelState === "camped");
  if (!stillValid) {
    showToast({ title: "Crafting Cancelled", message: "The crafting station is no longer available.", type: "warning" });
    return;
  }
  const result = CraftingRules.craft(game.player, action.recipeId, action.providerId, {
    context: action.context,
    ...(action.expedition ? { expedition: action.expedition } : {}),
  });
  if (!result.applied) {
    showToast({ title: craftingFailureTitle(result), message: craftingFailureMessage(result), type: "warning" });
  } else if (result.provisions > 0) {
    showToast({ title: "Meal Cooked", message: `The meal adds ${result.provisions} provisions.`, type: "success" });
    savePlayer();
  } else {
    const item = ITEM_DEFINITIONS[result.itemId];
    showToast({ title: `Crafted ${item?.name ?? "Item"}`, message: `${result.quantity} ${item?.name ?? "item"} added to your inventory`, type: "success" });
    savePlayer();
  }
  if (game.screen === "destination") refreshDestination();
  else if (game.screen === "expedition") refreshExpedition();
}

function treatInjury(targetId, itemId) {
  if (game.activeDestinationId !== "apothecary") return;
  const result = InjuryRules.treatWithItem(game.player, targetId, itemId);
  if (!result.applied) {
    showToast({ title: "Treatment Unavailable", message: result.reason === "item-missing" ? "That treatment is not in your inventory." : "That item does not treat this injury.", type: "warning" });
    return;
  }
  savePlayer();
  const message = result.deepCutStabilized
    ? `${INJURY_DEFINITIONS[result.injuryId].name} was cleaned and stabilized with ${ITEM_DEFINITIONS[itemId].name}.`
    : `${INJURY_DEFINITIONS[result.injuryId].name} was treated with ${ITEM_DEFINITIONS[itemId].name}.`;
  showToast({ title: "Injury Treated", message, type: "success" });
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
      .map((entry) => {
        const name = entry.type === "item"
          ? ITEM_DEFINITIONS[entry.itemId ?? entry.ingredientId]?.name ?? entry.itemId ?? "Item"
          : MaterialRules.definition(entry.materialId ?? entry.ingredientId)?.name ?? entry.materialId ?? "Material";
        return `${name} ${entry.owned}/${entry.required}`;
      })
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
  if (field === "dialogue" && npc?.dialogueSequenceId) {
    game.dialogueSession = DialogueSystem.start(npc.dialogueSequenceId, {
      player: game.player,
      returnContext: { type: "destination", destinationId: game.activeDestinationId },
    });
    renderDestination();
    return;
  }
  const lines = Array.isArray(npc?.[field]) ? npc[field] : [];
  const fallback = field === "rumors"
    ? "They have heard nothing new."
    : "They have nothing more to say for now.";
  const text = lines.length > 0
    ? lines[Math.floor(Math.random() * lines.length)]
    : fallback;
  game.dialogueSession = DialogueSystem.startSimple(
    npc?.id ?? npcId ?? "village_reeve",
    text,
    npc?.portraitKey ?? npc?.id ?? "placeholder",
    { returnContext: { type: "destination", destinationId: game.activeDestinationId } },
  );
  renderDestination();
}

function isVillageUnlocked() {
  return game.player.campaignFlags?.broceliande_intro_complete === true;
}

function advanceDialogue() {
  const previousSession = game.dialogueSession;
  const result = DialogueSystem.advance(previousSession, dialogueRuntimeContext(previousSession));
  if (!result.session && !result.ended) return;
  game.dialogueSession = result.session;
  applyDialogueResult(result, previousSession?.context);
}

function chooseDialogue(choiceId) {
  const previousSession = game.dialogueSession;
  const result = DialogueSystem.choose(previousSession, choiceId, dialogueRuntimeContext(previousSession));
  if (!result.session && !result.ended) return;
  game.dialogueSession = result.session;
  applyDialogueResult(result, previousSession?.context);
}

function dialogueRuntimeContext(session = game.dialogueSession) {
  return {
    player: game.player,
    ...(session?.context?.type === "encounter" ? { expedition: game.expedition } : {}),
  };
}

function applyDialogueResult(result, returnContext = null) {
  (result.toasts ?? []).forEach((toast) => showToast({
    title: toast.title ?? "Story Updated",
    message: toast.message ?? "",
    type: toast.toastType ?? "normal",
  }));
  if (returnContext?.type === "encounter" && result.ended && game.expedition?.activeEncounter) {
    const completed = EncounterManager.completeDialogue(
      game.expedition,
      game.player,
      result,
      {
        failExpedition,
        startCombat: (combatId) => startCombat(game.expedition, combatId),
        startDialogue: (dialogueId) => startEncounterDialogue(game.expedition, dialogueId),
      },
    );
    game.dialogueSession = null;
    if ((result.effects ?? []).length > 0) savePlayer();
    if (completed.resolved && game.expedition.status === "active") {
      renderExpedition();
    }
    return;
  }
  if ((result.effects ?? []).length > 0) savePlayer();
  if (game.screen === "destination") renderDestination();
  else if (game.screen === "expedition") renderExpedition();
}

function renderDialogueOverlay(session) {
  const node = DialogueSystem.currentNode(session);
  if (!node) return "";
  const speaker = node.speakerId === PLAYER_CHARACTER_DEFINITION.id
    ? PLAYER_CHARACTER_DEFINITION
    : NPC_DEFINITIONS[node.speakerId] ?? { name: "Unknown Speaker" };
  const choices = DialogueSystem.availableChoices(session, dialogueRuntimeContext(session));
  const initials = (speaker.name ?? "?")
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const portraitAssetId = resolveDialoguePortraitAssetId(node, speaker);
  const actions = choices.length > 0
    ? `<div class="dialogue-choices">${choices.map((choice) => `<button class="game-button dialogue-choice" type="button" data-action="dialogue-choice" data-choice-id="${choice.id}">${choice.label}</button>`).join("")}</div>`
    : `<button class="game-button dialogue-continue" type="button" data-action="dialogue-continue">Continue</button>`;
  return `
    <div class="dialogue-overlay" role="dialog" aria-modal="true" aria-labelledby="dialogue-speaker" aria-describedby="dialogue-text">
      <div class="dialogue-box">
        <div data-asset-frame="portrait" class="dialogue-portrait" data-portrait-key="${node.portraitKey ?? "placeholder"}" aria-label="Portrait for ${speaker.name}">${renderPortraitAsset(portraitAssetId, initials, `Portrait of ${speaker.name}`)}</div>
        <div class="dialogue-copy">
          <strong id="dialogue-speaker">${speaker.name}</strong>
          <p id="dialogue-text">${node.text}</p>
          ${actions}
        </div>
      </div>
    </div>`;
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

function partyTravelSpeedMultiplier(selectedCompanions) {
  return ExpeditionRules.partyTravelSpeedMultiplier(selectedCompanions);
}

function destinationIcon(type) {
  return ({ inn: "⌂", shop: "◆", story: "✦" })[type] ?? "•";
}

function dangerRatingMarkup(rating) {
  return Array.from({ length: Math.max(0, Number(rating) || 0) }, () => categoryIcon("skull")).join("");
}

const PREPARATION_STEPS = Object.freeze([
  { id: "route", label: "Route", title: "Choose Expedition" },
  { id: "gear", label: "Gear & Pack", title: "Gear & Pack" },
  { id: "company", label: "Company", title: "Company & Supplies" },
  { id: "review", label: "Review", title: "Review & Depart" },
]);

function preparationStepIndex() {
  const index = PREPARATION_STEPS.findIndex((step) => step.id === game.preparationStep);
  if (index >= 0) return index;
  game.preparationStep = PREPARATION_STEPS[0].id;
  return 0;
}

function preparationStepper() {
  const currentIndex = preparationStepIndex();
  return `
    <ol class="preparation-stepper" aria-label="Expedition preparation steps">
      ${PREPARATION_STEPS.map((step, index) => `
        <li class="preparation-step ${index === currentIndex ? "is-current" : ""} ${index < currentIndex ? "is-complete" : ""}" ${index === currentIndex ? 'aria-current="step"' : ""}>
          <span class="preparation-step-number">${index + 1}</span>
          <span>${step.label}</span>
        </li>`).join("")}
    </ol>`;
}

function preparationCanStart() {
  const selectedCompanions = selectedCompanionIds(game.player);
  const provisionCapacity = partyProvisionCapacity(selectedCompanions);
  return game.preparationSupplies > 0
    && HealingRules.arthurHealth(game.player) > 0
    && ExpeditionCatalog.isUnlocked(game.player, game.player.selectedExpeditionId)
    && game.preparationSupplies <= game.player.provisions
    && game.preparationSupplies <= provisionCapacity;
}

function preparationFooter() {
  const currentIndex = preparationStepIndex();
  const isLastStep = currentIndex === PREPARATION_STEPS.length - 1;
  const continueDisabled = currentIndex === 0
    && !ExpeditionCatalog.isUnlocked(game.player, game.player.selectedExpeditionId);
  const backButton = currentIndex > 0
    ? '<button class="text-button" type="button" data-action="preparation-back">Back</button>'
    : "";
  const primaryButton = isLastStep
    ? `<button class="game-button" type="button" data-action="start-expedition" ${preparationCanStart() ? "" : "disabled"}>Begin Expedition</button>`
    : `<button class="game-button preparation-next" type="button" data-action="preparation-continue" ${continueDisabled ? "disabled" : ""}>Continue to ${PREPARATION_STEPS[currentIndex + 1].label}</button>`;

  return `
    <div class="footer-actions preparation-footer" aria-label="Preparation navigation">
      ${backButton}
      ${primaryButton}
    </div>`;
}

function renderPreparation() {
  const currentStep = PREPARATION_STEPS[preparationStepIndex()];

  ui.screenRoot.innerHTML = `
    <section class="screen preparation-screen" aria-labelledby="preparation-title">
      <button class="text-button preparation-back" type="button" data-action="show-location">← Village</button>
      <div class="screen-heading compact-heading">
        <p class="eyebrow">Chapter III — Brocéliande</p>
        <h1 id="preparation-title">Prepare for Expedition</h1>
      </div>
      ${preparationStepper()}
      <div class="preparation-step-heading">
        <p class="eyebrow">Step ${preparationStepIndex() + 1} of ${PREPARATION_STEPS.length}</p>
        <h2>${currentStep.title}</h2>
      </div>
      ${renderPreparationStep(currentStep.id)}
      ${preparationFooter()}
    </section>`;
}

function renderPreparationStep(stepId) {
  switch (stepId) {
    case "gear":
      return renderPreparationGear();
    case "company":
      return renderPreparationCompany();
    case "review":
      return renderPreparationReview();
    case "route":
    default:
      return renderPreparationRoute();
  }
}

function renderPreparationRoute() {
  const expedition = ExpeditionCatalog.get(game.player.selectedExpeditionId);
  return `
    <section class="preparation-section expedition-selection-section" aria-labelledby="expedition-selection-title">
      <div class="section-title-row">
        <h2 id="expedition-selection-title">Choose Expedition</h2>
        <span>${expedition.kind === "campaign" ? "Campaign route" : "Choose a route"}</span>
      </div>
      <p class="section-help">Select a destination. Your gear and company will be ready on the next step.</p>
      <div class="expedition-option-list">${EXPEDITION_ORDER.map(renderExpeditionOption).join("")}</div>
    </section>`;
}

function renderPreparationGear() {
  const inventory = Object.entries(game.player.ownedItems)
    .filter(([itemId]) => !MaterialRules.isMaterialId(itemId))
    .map(([itemId, quantity]) => inventoryCard(ITEM_DEFINITIONS[itemId], quantity))
    .join("");
  const equipment = ["weapon", "armor", "relic"]
    .map((slot) => equipmentSlotCard(slot, game.player.equippedItems[slot]))
    .join("");
  const packedItems = game.player.packedItems
    .filter((itemId) => !MaterialRules.isMaterialId(itemId))
    .map((itemId) => packItemCard(ITEM_DEFINITIONS[itemId], game.player.ownedItems[itemId]))
    .join("");
  const emptyPackSlots = EXPEDITION_TUNING.packSlots - game.player.packedItems.length;

  return `
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

    ${renderPreparationMaterialBag()}

    <section class="preparation-section" aria-labelledby="inventory-title">
      <div class="section-title-row">
        <h2 id="inventory-title">Permanent Inventory</h2>
        <span>${Object.keys(game.player.ownedItems).length} items</span>
      </div>
      <div class="inventory-list">${inventory}</div>
    </section>`;
}

function renderPreparationMaterialBag() {
  const entries = Object.entries(game.player.materials ?? {})
    .filter(([, quantity]) => quantity > 0)
    .sort(([left], [right]) => MaterialRules.definition(left).name.localeCompare(MaterialRules.definition(right).name));
  const used = MaterialRules.collectionTotal(game.player.packedMaterials);
  const rows = entries.map(([materialId, quantity]) => {
    const definition = MaterialRules.definition(materialId);
    const selected = game.player.packedMaterials?.[materialId] ?? 0;
    const availableToAdd = Math.min(quantity - selected, EXPEDITION_TUNING.materialBagCapacity - used);
    return `
      <article class="material-bag-row">
        <div class="material-bag-row-copy">
          ${itemIcon("material", { ...definition, id: materialId, category: "material" })}
          <div><strong>${definition.name}</strong><span>Owned ${quantity} · Bag ${selected}</span></div>
        </div>
        <div class="material-bag-stepper" aria-label="Choose ${definition.name} for the Material Bag">
          <button type="button" data-action="change-material-bag" data-material-id="${materialId}" data-amount="-1" ${selected > 0 ? "" : "disabled"}>−</button>
          <strong>${selected}</strong>
          <button type="button" data-action="change-material-bag" data-material-id="${materialId}" data-amount="1" ${availableToAdd > 0 ? "" : "disabled"}>+</button>
        </div>
      </article>`;
  }).join("");
  return `
    <section class="preparation-section material-bag-section" aria-labelledby="material-bag-title">
      <div class="section-title-row">
        <h2 id="material-bag-title">Material Bag</h2>
        <span>${used}/${EXPEDITION_TUNING.materialBagCapacity} units</span>
      </div>
      <p class="section-help">Ingredients and crafting materials travel separately from the ${EXPEDITION_TUNING.packSlots}-slot expedition pack.</p>
      <div class="material-bag-list">${rows || '<p class="empty-loot">No materials owned.</p>'}</div>
    </section>`;
}

function renderPreparationCompany() {
  const selectedCompanions = selectedCompanionIds(game.player);
  const provisionCapacity = partyProvisionCapacity(selectedCompanions);
  const provisionConsumptionMultiplier = partyProvisionConsumptionMultiplier(selectedCompanions);
  const companionSlots = [0, 1]
    .map((slot) => renderCompanionSlot(slot, selectedCompanions[slot] ?? null))
    .join("");

  return `
    <section class="preparation-section" aria-labelledby="companion-title">
      <div class="section-title-row">
        <h2 id="companion-title">Company</h2>
        <span>${PLAYER_CHARACTER_DEFINITION.name}${selectedCompanions.length > 0 ? ` · ${selectedCompanions.map((id) => COMPANION_DEFINITIONS[id]?.name).join(" · ")}` : " · Traveling Alone"}</span>
      </div>
      <div class="party-lead-card"><strong>${PLAYER_CHARACTER_DEFINITION.name}</strong><span>Party leader</span></div>
      <div class="party-slot-list">${companionSlots}</div>
    </section>

    ${renderCombatLoadout()}

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
    </section>`;
}

function renderCombatLoadout() {
  const learned = AbilityRules.sanitizeLearned(game.player.learnedAbilityIds);
  const active = learned.filter((abilityId) => AbilityRules.kind(abilityId) === "active");
  const passive = learned.filter((abilityId) => AbilityRules.kind(abilityId) === "passive");
  const renderEntry = (abilityId, kind) => {
    const ability = AbilityRules.definition(abilityId);
    const selected = AbilityRules.isSelected(game.player, abilityId);
    const list = kind === "passive" ? game.player.selectedPassiveAbilityIds : game.player.selectedActiveAbilityIds;
    const full = !selected && list.length >= AbilityRules.capacity(kind);
    const cost = ability.cost?.resource ? `${capitalize(ability.cost.resource)} ${ability.cost.amount}` : "No resource cost";
    const limit = kind === "active" ? `Active ${list.length}/${AbilityRules.capacity(kind)}` : `Passive ${list.length}/${AbilityRules.capacity(kind)}`;
    const tags = Array.isArray(ability.tags) && ability.tags.length ? ` · ${ability.tags.join(", ")}` : "";
    return `<button class="ability-loadout-entry ${selected ? "is-selected" : ""}" type="button" data-action="toggle-ability-loadout" data-ability-id="${abilityId}" ${full ? "disabled" : ""}>
      <span class="ability-loadout-entry-heading"><strong>${ability.name}</strong><small>${selected ? limit : "Unequipped"}</small></span>
      <span>${ability.description ?? ""}</span><small>${cost}${ability.cooldownActivations ? ` · Cooldown ${ability.cooldownActivations}` : ""}${ability.chargesPerCombat ? ` · ${ability.chargesPerCombat}/combat` : ""}${tags}</small>
    </button>`;
  };
  return `<section class="preparation-section ability-loadout-section" aria-labelledby="ability-loadout-title">
    <div class="section-title-row"><h2 id="ability-loadout-title">Combat Loadout</h2><span>Faith ${game.player.faith}/${game.player.maxFaith}</span></div>
    <p class="section-help">Learned actives use the ${ABILITY_TUNING.activeLoadoutCapacity}-slot bar. Learned passives use ${ABILITY_TUNING.passiveLoadoutCapacity} slots. Equipment and companions grant their own abilities.</p>
    <div class="ability-loadout-group"><strong>Actives</strong><div class="ability-loadout-list">${active.map((id) => renderEntry(id, "active")).join("") || '<p class="empty-loot">No learned active abilities.</p>'}</div></div>
    <div class="ability-loadout-group"><strong>Passives</strong><div class="ability-loadout-list">${passive.map((id) => renderEntry(id, "passive")).join("") || '<p class="empty-loot">No learned passive abilities.</p>'}</div></div>
  </section>`;
}

function renderPreparationReview() {
  const expedition = ExpeditionCatalog.get(game.player.selectedExpeditionId);
  const selectedCompanions = selectedCompanionIds(game.player);
  const companionNames = selectedCompanions.length > 0
    ? selectedCompanions.map((id) => COMPANION_DEFINITIONS[id]?.name).filter(Boolean)
    : ["Traveling Alone"];
  const equippedNames = ["weapon", "armor", "relic"]
    .map((slot) => ITEM_DEFINITIONS[game.player.equippedItems[slot]]?.name ?? "Empty")
    .join(" · ");
  const packedNames = game.player.packedItems.length > 0
    ? game.player.packedItems.map((itemId) => {
      const item = ITEM_DEFINITIONS[itemId];
      const quantity = Math.min(game.player.ownedItems[itemId], item.maxStack ?? 1);
      return `${item.name}${quantity > 1 ? ` ×${quantity}` : ""}`;
    }).join(" · ")
    : "Pack is empty";
  const materialBagNames = Object.entries(game.player.packedMaterials ?? {})
    .filter(([, quantity]) => quantity > 0)
    .map(([materialId, quantity]) => `${MaterialRules.definition(materialId).name}${quantity > 1 ? ` ×${quantity}` : ""}`)
    .join(" · ") || "Material Bag is empty";
  const travelSpeed = partyTravelSpeedMultiplier(selectedCompanions);
  const travelSpeedLabel = travelSpeed === 1 ? "Standard" : `+${Math.round((travelSpeed - 1) * 100)}% faster`;
  const danger = dangerRatingMarkup(expedition.danger);
  const provisionCapacity = partyProvisionCapacity(selectedCompanions);
  const consumption = partyProvisionConsumptionMultiplier(selectedCompanions);

  return `
    <section class="preparation-review" aria-label="Expedition review">
      <article class="review-card review-route-card">
        <div class="review-card-heading"><h2>Route</h2><span class="danger-rating" aria-label="${expedition.danger} skull danger">${danger}</span></div>
        <strong>${expedition.name}</strong>
        <p>${expedition.description}</p>
      </article>
      <article class="review-card">
        <div class="review-card-heading"><h2>Company</h2><span>${travelSpeedLabel}</span></div>
        <p><strong>Arthur</strong> · ${companionNames.join(" · ")}</p>
        <p>${equippedNames}</p>
      </article>
      <article class="review-card">
        <div class="review-card-heading"><h2>Pack & Provisions</h2><span>${game.preparationSupplies}/${provisionCapacity}</span></div>
        <p>${packedNames}</p>
        <p>${game.preparationSupplies} provisions · ${consumption.toFixed(2)}× consumption</p>
      </article>
      <article class="review-card">
        <div class="review-card-heading"><h2>Material Bag</h2><span>${MaterialRules.collectionTotal(game.player.packedMaterials)}/${EXPEDITION_TUNING.materialBagCapacity}</span></div>
        <p>${materialBagNames}</p>
        <p>Ingredients and crafting materials are secured separately from the pack.</p>
      </article>
    </section>`;
}

function advancePreparationStep() {
  const currentIndex = preparationStepIndex();
  if (currentIndex >= PREPARATION_STEPS.length - 1) return;
  if (currentIndex === 0 && !ExpeditionCatalog.isUnlocked(game.player, game.player.selectedExpeditionId)) return;
  setPreparationStep(PREPARATION_STEPS[currentIndex + 1].id);
}

function retreatPreparationStep() {
  const currentIndex = preparationStepIndex();
  if (currentIndex <= 0) return;
  setPreparationStep(PREPARATION_STEPS[currentIndex - 1].id);
}

function setPreparationStep(stepId) {
  if (!PREPARATION_STEPS.some((step) => step.id === stepId)) return;
  game.preparationStep = stepId;
  renderPreparation();
  const preparationScreen = document.querySelector(".preparation-screen");
  if (preparationScreen) preparationScreen.scrollTop = 0;
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

function renderExpeditionOption(expeditionId) {
  const expedition = ExpeditionCatalog.get(expeditionId);
  const selected = game.player.selectedExpeditionId === expeditionId;
  const missing = ExpeditionCatalog.missingPrerequisites(game.player, expeditionId);
  const locked = missing.length > 0;
  const skulls = dangerRatingMarkup(expedition.danger);
  const requirements = expedition.prerequisites.length > 0
    ? `<div class="expedition-requirements"><span>Required</span>${expedition.prerequisites.map((itemId) => `<span class="requirement-${game.player.ownedItems[itemId] ? "met" : "missing"}">${game.player.ownedItems[itemId] ? "✓" : "✕"} ${ITEM_DEFINITIONS[itemId]?.name ?? itemId}</span>`).join("")}</div>`
    : "";
  return `
    <button class="expedition-option ${selected ? "is-selected" : ""} ${locked ? "is-locked" : ""}" type="button"
      data-action="select-expedition" data-expedition-id="${expedition.id}" ${locked ? "disabled" : ""}>
      <span class="expedition-option-heading"><strong>${expedition.name}</strong><span class="danger-rating" aria-label="${expedition.danger} skull danger">${skulls}</span></span>
      <span>${expedition.description}</span>
      ${expedition.kind === "campaign" ? "<small class=\"expedition-kind\">Campaign Expedition</small>" : ""}
      ${Number.isFinite(expedition.minimumObjectiveDistance) ? `<small class="expedition-objective-distance">Required objective · ${formatDistance(expedition.minimumObjectiveDistance)}</small>` : ""}
      ${requirements}
      ${locked ? "<small class=\"expedition-lock-label\">Locked until the required discoveries are secured.</small>" : ""}
    </button>`;
}

function renderCompanionSlot(slotIndex, selectedCompanion) {
  const options = [null, ...game.player.unlockedCompanions]
    .map((companionId) => companionId ? COMPANION_DEFINITIONS[companionId] : null)
    .map((companion) => companionCard(companion, slotIndex, selectedCompanion))
    .join("");
  return `<section class="party-slot" aria-labelledby="party-slot-${slotIndex}-title">
    <div class="party-slot-heading"><strong id="party-slot-${slotIndex}-title">Companion ${slotIndex + 1}</strong><span>${selectedCompanion ? COMPANION_DEFINITIONS[selectedCompanion]?.name : "None"}</span></div>
    <div class="choice-list">${options}</div>
  </section>`;
}

function companionCard(companion, slotIndex = 0, selectedCompanion = null) {
  const selected = selectedCompanion === (companion?.id ?? null);
  const alreadyInOtherSlot = companion?.id
    && selectedCompanionIds(game.player).some((id, index) => id === companion.id && index !== slotIndex);
  const name = companion?.name ?? "None";
  const description = companion
    ? `${companion.description} +${companion.provisionCapacityBonus} capacity · +${companion.provisionConsumptionBonus.toFixed(2)}× consumption.`
    : "Leave this companion slot empty.";
  return `
    <button class="choice-card ${selected ? "is-selected" : ""} ${alreadyInOtherSlot ? "is-unavailable" : ""}" type="button" data-action="select-companion" data-companion-id="${companion?.id ?? ""}" data-slot-index="${slotIndex}" ${alreadyInOtherSlot ? "disabled" : ""}>
      <strong>${name}</strong>
      <span>${description}</span>
    </button>`;
}

function equipItem(itemId) {
  const item = ITEM_DEFINITIONS[itemId];
  const result = EquipmentRules.equip(game.player, itemId);
  if (!result.applied) {
    return;
  }

  showToast({
    title: `Equipped ${item.name}`,
    message: result.previousItemId && result.previousItemId !== itemId
      ? `Replaced ${ITEM_DEFINITIONS[result.previousItemId]?.name ?? "previous gear"}.`
      : "Ready for the next expedition.",
    type: "success",
  });
  savePlayer();
  refreshPreparation();
}

function togglePackItem(itemId) {
  const item = ITEM_DEFINITIONS[itemId];
  if (!item?.carriable
    || MaterialRules.isMaterialId(itemId)
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

function selectCompanion(companionId, slotIndex = 0) {
  const selectedCompanion = companionId || null;
  if (selectedCompanion && !game.player.unlockedCompanions.includes(selectedCompanion)) {
    return;
  }
  const selectedCompanions = selectedCompanionIds(game.player);
  if (selectedCompanion && selectedCompanions.some((id, index) => id === selectedCompanion && index !== slotIndex)) {
    return;
  }
  while (selectedCompanions.length <= slotIndex) selectedCompanions.push(null);
  const previousCompanion = selectedCompanions[slotIndex];
  selectedCompanions[slotIndex] = selectedCompanion;
  game.player.selectedCompanions = selectedCompanions.filter(Boolean).slice(0, 2);
  game.player.selectedCompanion = game.player.selectedCompanions[0] ?? null;
  game.preparationSupplies = Math.min(
    game.preparationSupplies,
    partyProvisionCapacity(game.player.selectedCompanions),
    game.player.provisions,
  );
  if (previousCompanion !== selectedCompanion) {
    showToast({
      title: selectedCompanion
        ? `${COMPANION_DEFINITIONS[selectedCompanion].name} Joined the Party`
        : "Traveling Alone",
      message: selectedCompanion
        ? "The company is ready to depart."
        : "This companion slot is open.",
      type: "success",
    });
  }
  savePlayer();
  refreshPreparation();
}

function toggleAbilityLoadout(abilityId) {
  const result = AbilityRules.toggleLoadout(game.player, abilityId);
  if (!result.applied) {
    if (result.reason === "loadout-full") {
      showToast({ title: "Loadout Full", message: `The ${result.kind} loadout has no open slots.`, type: "warning" });
    }
    return;
  }
  savePlayer();
  refreshPreparation();
}

function changeMaterialBag(materialId, amount) {
  if (!MaterialRules.isMaterialId(materialId) || !game.player.materials?.[materialId]) return;
  game.player.packedMaterials ??= {};
  const current = game.player.packedMaterials[materialId] ?? 0;
  const requested = current + (Number(amount) || 0);
  const capacityLimit = requested > current
    ? current + (EXPEDITION_TUNING.materialBagCapacity - MaterialRules.collectionTotal(game.player.packedMaterials))
    : game.player.materials[materialId];
  const next = clamp(
    requested,
    0,
    Math.min(game.player.materials[materialId], capacityLimit),
  );
  if (next > 0) game.player.packedMaterials[materialId] = next;
  else delete game.player.packedMaterials[materialId];
  savePlayer();
  refreshPreparation();
}

function selectExpedition(expeditionId) {
  if (!EXPEDITION_DEFINITIONS[expeditionId]
    || !ExpeditionCatalog.isUnlocked(game.player, expeditionId)) return;
  if (game.player.selectedExpeditionId === expeditionId) return;
  game.player.selectedExpeditionId = expeditionId;
  savePlayer();
  refreshPreparation();
}

function changeSupplies(amount) {
  game.preparationSupplies = clamp(
    game.preparationSupplies + amount,
    0,
    Math.min(partyProvisionCapacity(selectedCompanionIds(game.player)), game.player.provisions),
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
  if (!isVillageUnlocked() || !ExpeditionCatalog.isUnlocked(game.player, game.player.selectedExpeditionId)) return;
  const selectedCompanions = selectedCompanionIds(game.player);
  const provisionCapacity = partyProvisionCapacity(selectedCompanions);
  if (game.preparationSupplies <= 0
    || HealingRules.arthurHealth(game.player) <= 0
    || game.preparationSupplies > game.player.provisions
    || game.preparationSupplies > provisionCapacity) {
    return;
  }
  const committedProvisions = game.preparationSupplies;
  game.expedition = ExpeditionRules.startExpedition(game.player, {
    provisions: committedProvisions,
    companions: selectedCompanions,
    expeditionId: game.player.selectedExpeditionId,
    packedMaterials: game.player.packedMaterials,
  });
  savePlayer();
  showScreen("expedition");
}

function renderExpedition() {
  const expedition = game.expedition;
  if (expedition?.activeEncounter && !document.querySelector(".encounter-panel")) {
    game.travelVisualState = captureTravelVisualState(expedition) ?? game.travelVisualState;
  }
  if (expedition.combat) {
    renderCombat(expedition, expedition.combat);
    return;
  }
  if (expedition.travelState === "camped") {
    renderCamp(expedition);
    return;
  }
  const companions = selectedCompanionIds(expedition)
    .map((companionId) => COMPANION_DEFINITIONS[companionId])
    .filter(Boolean);
  const activeEncounter = expedition.activeEncounter
    ? EncounterManager.definitionFor(expedition)
    : null;
  syncExpeditionAmbience(expedition, "travel", activeEncounter);
  const travelVisualAssetId = resolveExpeditionVisualAssetId(expedition, "travel", activeEncounter);
  const loadoutEntries = Object.values(expedition.selectedEquipment)
    .map((itemId) => ({ itemId, quantity: 1 }))
    .filter(({ itemId }) => ITEM_DEFINITIONS[itemId]);

  ui.screenRoot.innerHTML = `
    <section class="screen expedition-screen" aria-label="Brocéliande expedition">
      <div data-asset-frame="travel" class="visual-frame travel-scene ${activeEncounter ? "is-paused" : ""}" id="travel-scene">
        ${renderTravelVisualAsset(travelVisualAssetId, activeEncounter?.title ?? expeditionDefinition(expedition).name)}
        <div class="moon" aria-hidden="true"></div>
        <div class="forest forest-far" aria-hidden="true"></div>
        <div class="forest forest-near" aria-hidden="true"></div>
        <div class="travelers" id="travelers" aria-hidden="true">
          <span class="arthur">♞</span>${companions.map((companion) => `<span class="companion companion-${companion.type}">${companion.type === "mount" ? "♞" : "♜"}</span>`).join("")}
        </div>
        <div class="ground" aria-hidden="true"></div>
        <div class="direction-banner" id="direction-banner">${travelBannerText(expedition, activeEncounter)}</div>
      </div>
      ${activeEncounter
        ? renderEncounterPanel(expedition, activeEncounter)
         : `${renderTravelPanel(expedition, companions, loadoutEntries)}${renderExpeditionActionBar(expedition)}`}
    </section>`;
  updateTravelHud();
}

function refreshExpedition() {
  if (!game.expedition?.activeEncounter) {
    game.travelVisualState = captureTravelVisualState(game.expedition);
  }
  const currentPanel = document.querySelector(".camp-panel, .travel-panel");
  const currentMode = currentPanel?.classList.contains("camp-panel") ? "camp" : "travel";
  const scrollTop = currentPanel?.scrollTop ?? 0;
  renderExpedition();
  const refreshedPanel = currentMode === "camp"
    ? document.querySelector(".camp-panel")
    : document.querySelector(".travel-panel");
  if (refreshedPanel) {
    refreshedPanel.scrollTop = scrollTop;
  }
}

function renderCamp(expedition) {
  const activeEvent = expedition.activeEncounter
    ? EncounterManager.definitionFor(expedition)
    : null;
  syncExpeditionAmbience(expedition, "camp", activeEvent);
  const campVisualAssetId = resolveExpeditionVisualAssetId(expedition, "camp", activeEvent);
  if (activeEvent) {
    ui.screenRoot.innerHTML = `
      <section class="screen expedition-screen camp-screen" aria-label="Camp event">
        <div data-asset-frame="camp" class="visual-frame camp-scene is-paused" aria-label="Camp environment">
          ${renderImageAsset(campVisualAssetId, "camp-visual-asset", activeEvent.title)}
          <div class="camp-moon"></div>
          <div class="camp-fire"><span></span><span></span><span></span></div>
          <div class="camp-silhouette"></div>
          <div class="direction-banner">Camped · ${pathLabel(expedition.currentPathId)}</div>
        </div>
        ${renderCampEventPanel(expedition, activeEvent)}
      </section>`;
    updateTravelHud();
    return;
  }
  const tabs = [
    ["rest", "Rest"],
    ["cook", "Cook"],
    ["craft", "Craft"],
  ].map(([tabId, label]) => `<button class="camp-tab ${game.campTab === tabId ? "is-selected" : ""}" type="button" data-action="camp-tab" data-tab="${tabId}" aria-pressed="${game.campTab === tabId}" ${game.craftingAction ? "disabled" : ""}>${label}</button>`).join("");
  const tabContent = game.campTab === "cook"
    ? renderCampCookPanel(expedition)
    : game.campTab === "craft"
      ? renderCampCraftPanel(expedition)
      : renderCampRestPanel(expedition);

  ui.screenRoot.innerHTML = `
    <section class="screen expedition-screen camp-screen" aria-label="Camp">
      <div data-asset-frame="camp" class="visual-frame camp-scene" aria-label="Camp environment">
        ${renderImageAsset(campVisualAssetId, "camp-visual-asset", expeditionDefinition(expedition).name)}
        <div class="camp-moon"></div>
        <div class="camp-fire"><span></span><span></span><span></span></div>
        <div class="camp-silhouette"></div>
        <div class="direction-banner">Camped · ${pathLabel(expedition.currentPathId)}</div>
      </div>
      <div class="camp-panel">
        <div class="screen-heading travel-heading">
          <p class="eyebrow">Expedition Paused · Camp</p>
          <h1>Campfire</h1>
          <p>Arthur can sleep rough anywhere. The company can leave camp and remain paused until it is ready to travel.</p>
        </div>
        ${renderExpeditionResources(expedition)}
        ${renderJourneyLog(expedition)}
        <div class="camp-tabs" role="tablist" aria-label="Camp actions">${tabs}</div>
        ${tabContent}
      </div>
      <div class="footer-actions camp-actions">
        <button class="text-button" type="button" data-action="leave-camp">Leave Camp</button>
      </div>
    </section>`;
  updateTravelHud();
}

function renderCampRestPanel(expedition) {
  const cost = EXPEDITION_TUNING.campRest.provisionCost;
  const canRest = expedition.provisions >= cost;
  const eventStatus = expedition.campEventRolled
    ? expedition.lastCampEventResult
      ? `<p class="camp-event-status">This camp's event has resolved: ${expedition.lastCampEventResult}</p>`
      : '<p class="camp-event-status">This camp has already had its one event roll.</p>'
    : '<p class="camp-event-status">A proper rest may reveal one contextual camp event.</p>';
  return `
    <section class="camp-content camp-rest-content" aria-labelledby="camp-rest-title">
      <div class="section-title-row"><h2 id="camp-rest-title">Rest at Camp</h2><span>Costs ${cost} provisions</span></div>
      <p class="section-help">A camp rest restores more health than a brief roadside pause and can trigger one event for this camp cycle.</p>
      ${eventStatus}
      <button class="game-button" type="button" data-action="camp-rest" ${canRest ? "" : "disabled"}>${canRest ? `Rest · ${cost} Provisions` : `Need ${cost} Provisions`}</button>
    </section>`;
}

function renderCampCookPanel(expedition) {
  const recipes = CraftingRules.knownRecipesForProvider(game.player, "campfire");
  const rows = recipes.map((recipe) => craftingRow(recipe, "campfire", { expedition, action: "cook-recipe" })).join("");
  const ingredients = Object.entries(MaterialRules.expeditionContents(expedition))
    .filter(([materialId, quantity]) => ITEM_DEFINITIONS[materialId]?.tags?.includes("ingredient") && quantity > 0)
    .map(([materialId, quantity]) => `<span class="material-chip">${itemIcon("material", { ...MaterialRules.definition(materialId), id: materialId, category: "material" })}<span>${MaterialRules.definition(materialId).name}</span> <strong>${quantity}</strong></span>`)
    .join("");
  return `
    <section class="camp-content" aria-labelledby="camp-cook-title">
      <div class="section-title-row"><h2 id="camp-cook-title">Cook</h2><span>Ingredients → Provisions</span></div>
      <p class="section-help">Cooked meals use secured and newly discovered ingredients from the Material Bag. The result becomes expedition provisions.</p>
      <div class="material-inventory camp-ingredients"><span>Material Bag · ${MaterialRules.expeditionTotal(expedition)}/${MaterialRules.capacity()}</span><div>${ingredients || "<em>No cooking ingredients available</em>"}</div></div>
      <div class="shop-list camp-recipe-list">${rows || '<p class="empty-loot">No recipes are available at this fire.</p>'}</div>
    </section>`;
}

function renderCampCraftPanel(expedition) {
  const recipes = CraftingRules.knownRecipesForProvider(game.player, "blacksmith");
  const rows = recipes.map((recipe) => craftingRow(recipe, "blacksmith", { expedition, action: "camp-craft-item" })).join("");
  return `
    <section class="camp-content" aria-labelledby="camp-craft-title">
      <div class="section-title-row"><h2 id="camp-craft-title">Field Craft</h2><span>Use Material Bag</span></div>
      <p class="section-help">A campfire can support simple field repairs. Apothecary work still belongs in the village.</p>
      <div class="material-inventory camp-ingredients"><span>Material Bag · ${MaterialRules.expeditionTotal(expedition)}/${MaterialRules.capacity()}</span><div>${renderMaterialBagChips(expedition, "No materials carried")}</div></div>
      <div class="shop-list camp-recipe-list">${rows || '<p class="empty-loot">No field recipes are known.</p>'}</div>
    </section>`;
}

function renderCampEventPanel(expedition, event) {
  const panel = renderEncounterPanel(expedition, event);
  return panel.replace("travel-panel", "travel-panel camp-event-panel");
}

function renderExpeditionActionBar(expedition) {
  return `
    <div class="expedition-action-bar" role="group" aria-label="Expedition travel actions">
      ${expedition.travelState === "paused"
        ? `<button id="resume-button" class="game-button travel-action-primary" type="button" data-action="resume-travel">Resume Travel</button>`
        : `<button id="pause-button" class="game-button travel-action-primary" type="button" data-action="pause-travel">Pause Travel</button>`}
      <button id="return-button" class="small-button travel-return-button" type="button" data-action="return-to-safety">Return</button>
    </div>`;
}

function travelBannerText(expedition, activeEncounter = null) {
  const route = pathLabel(expedition.currentPathId);
  if (activeEncounter) {
    return activeEncounter.eventKind === "camp"
      ? `Camped · ${route}`
      : `${route} · Encounter: ${activeEncounter.title}`;
  }
  if (expedition.travelState === "paused") return `${route} · Paused`;
  if (expedition.direction === "returning") return `${route} · Returning ←`;
  return `${route} · Traveling Outbound →`;
}

function journeyLogPreview(expedition) {
  const latest = expedition?.journeyLog?.at(-1);
  return latest?.message ?? "No meaningful events yet.";
}

function renderJourneyLog(expedition) {
  const entries = expedition?.journeyLog ?? [];
  const history = entries.slice().reverse().map((entry) => `
    <li class="journey-log-entry">
      <span class="journey-log-distance">${formatDistance(Number(entry.distance) || 0)}</span>
      <p>${entry.message}</p>
    </li>`).join("");
  return `
    <details class="run-details journey-log" aria-label="Journey Log">
      <summary class="run-details-summary journey-log-summary">
        <span class="run-details-heading">Journey Log</span>
        <span class="run-details-summary-text" id="journey-log-preview">${journeyLogPreview(expedition)}</span>
      </summary>
      <ol class="journey-log-content">${history || '<li class="journey-log-empty">No meaningful events yet.</li>'}</ol>
    </details>`;
}

function renderTravelPanel(expedition, companions, loadout) {
  const companyLabel = [PLAYER_CHARACTER_DEFINITION.name, ...companions.map((companion) => companion.name)].join(" &amp; ");
  const carriedQuantity = Object.values(expedition.carriedItems ?? {}).reduce((sum, quantity) => sum + (Number(quantity) || 0), 0);

  return `
    <div class="travel-panel">
      <section class="expedition-status" aria-labelledby="expedition-status-title">
        <p class="eyebrow" id="expedition-status-title">Expedition Status</p>
        ${renderExpeditionResources(expedition)}
      </section>
      ${renderCompactExpeditionInjurySummary(expedition)}
      ${renderTravelSettings(expedition)}
      <div class="progress-track" aria-label="Current return distance">
        <div class="progress-fill" id="distance-progress"></div>
      </div>
      ${renderJourneyLog(expedition)}
      <details class="run-details expedition-details">
        <summary class="run-details-summary">
          <span class="run-details-heading">Expedition Details</span>
          <span class="run-details-summary-text">${companyLabel} &middot; ${pathLabel(expedition.currentPathId)} &middot; ${carriedQuantity} carried items</span>
        </summary>
        <div class="run-details-content">
        <p><span>Company</span><strong>${companyLabel}</strong></p>
        <p><span>Path</span><strong id="path-value">${pathLabel(expedition.currentPathId)}</strong></p>
        <div class="run-detail-collection"><span>Loadout</span><div class="run-item-list">${renderItemChips(loadout, "No equipment selected")}</div></div>
        <div class="run-detail-collection"><span>Carried</span><div class="run-item-list">${formatCarriedItems(expedition.carriedItems)}</div></div>
        <div class="run-detail-collection"><span>Material Bag</span><div class="run-item-list">${renderMaterialBagChips(expedition, "No materials carried")}</div></div>
        <div class="run-detail-collection"><span>Unsecured</span><div class="unsecured-detail"><p class="unsecured-detail-summary">${unsecuredLootSummary(expedition)}</p><div id="loot-list" class="loot-list">${renderDiscoveryList(expedition)}</div></div></div>
        </div>
        <div class="run-details-actions">
          <button class="text-button danger-button abandon-button" type="button" data-action="abandon-expedition">Abandon Expedition</button>
        </div>
      </details>
    </div>`;
}

function renderTravelSettings(expedition) {
  const paceButtons = Object.values(EXPEDITION_TUNING.travelPaces).map((pace) => (
    `<button class="setting-button ${expedition.paceId === pace.id ? "is-selected" : ""}" type="button" data-action="set-pace" data-pace-id="${pace.id}" aria-pressed="${expedition.paceId === pace.id}" title="${pace.description}">${pace.name}</button>`
  )).join("");
  const rationButtons = Object.values(EXPEDITION_TUNING.rationLevels).map((ration) => (
    `<button class="setting-button ${expedition.rationId === ration.id ? "is-selected" : ""}" type="button" data-action="set-rations" data-ration-id="${ration.id}" aria-pressed="${expedition.rationId === ration.id}" title="${ration.description}">${ration.name}</button>`
  )).join("");
  const pace = ExpeditionRules.paceDefinition(expedition.paceId);
  const ration = ExpeditionRules.rationDefinition(expedition.rationId);
  const paused = expedition.travelState === "paused";
  const settingControls = paused
    ? `<div class="setting-row"><span>Pace</span><div class="setting-buttons">${paceButtons}</div></div>
       <div class="setting-row"><span>Rations</span><div class="setting-buttons">${rationButtons}</div></div>`
    : "";
  return `
    <section class="travel-settings journey-controls" aria-labelledby="journey-controls-title">
      <div class="journey-heading">
        <p class="eyebrow" id="journey-controls-title">Journey</p>
        <span class="journey-state">${paused ? "Paused" : expedition.direction === "returning" ? "Returning" : "Traveling"}</span>
      </div>
      ${settingControls}
      <p class="journey-summary ${paused ? "is-editable-summary" : "is-compact-summary"}">${pace.name} pace &middot; ${ration.name} rations</p>
      ${paused
        ? `<div class="paused-actions">
             <p class="eyebrow">Paused Actions</p>
             <div class="paused-action-buttons">
               <button class="small-button" type="button" data-action="brief-rest" ${expedition.provisions >= EXPEDITION_TUNING.briefRest.provisionCost ? "" : "disabled"}>Brief Rest &middot; ${EXPEDITION_TUNING.briefRest.provisionCost} Food</button>
               <button class="small-button make-camp-button" type="button" data-action="make-camp">Make Camp</button>
             </div>
           </div>`
         : ""}
    </section>`;
}

function renderEncounterPanel(expedition, encounter) {
  const active = expedition.activeEncounter;
  if (active.phase === "dialogue") {
    return `
      <div class="travel-panel encounter-panel encounter-dialogue-panel" aria-live="polite">
        ${renderExpeditionResources(expedition)}
        <div class="encounter-heading">
          <p class="eyebrow">Travel Paused · Dialogue</p>
          <h1>${encounter.title}</h1>
          <p class="encounter-description">The company pauses to listen before the encounter continues.</p>
        </div>
        ${game.dialogueSession ? renderDialogueOverlay(game.dialogueSession) : ""}
        ${renderJourneyLog(expedition)}
      </div>`;
  }
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
      ${renderJourneyLog(expedition)}
    </div>`;
}

function nonRewardOutcomeMessages(messages = []) {
  return messages.filter((message) => !/^(ITEM FOUND|MATERIAL FOUND|RECIPE FOUND|\+\d+ gold|Found |Collected |Recovered |Discovered the .+ recipe\.)/.test(message));
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
      ${renderJourneyLog(expedition)}
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
          <strong>${active.eventKind === "camp" ? "Continue at Camp" : "Continue Journey"}</strong>
        </button>
      </div>
      ${renderJourneyLog(expedition)}
    </div>`;
}

function renderCombat(expedition, combat) {
  syncExpeditionAmbience(expedition, "travel");
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
          <span class="combat-target-summary">Faith ${game.player.faith}/${game.player.maxFaith} Â· ${selectedEnemy ? `${selectedEnemy.name} selected` : choosingTarget ? "Choose a target" : "No target selected"}</span>
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
    (["running", "awaitingAction"].includes(combat.status) && combat.interactionMode === "main" && combatant.side === "enemy")
    || (combat.interactionMode === "enemyTarget" && combatant.side === "enemy")
    || (combat.interactionMode === "allyTarget" && combatant.side === "ally" && combatant.hp < combatant.maxHp)
  );
  const selected = combatant.side === "enemy" && combatant.id === combat.selectedEnemyId;
  const intent = combatant.side === "enemy" && !defeated
    ? `<div class="combat-intent">${COMBAT_ENEMY_ACTION_DEFINITIONS[combatant.intentId]?.name ?? "Attack"}</div>`
    : "";
  const statuses = combatant.side === "enemy"
    ? Object.values(combatant.statuses ?? {}).map((status) => (
      `${COMBAT_STATUS_DEFINITIONS[status.statusId]?.name ?? status.statusId} ${status.remainingActivations}`
    ))
    : [];
  const effects = [combatant.defending ? "DEFENDING" : "", combatant.interceding ? "INTERCEDING" : "", ...statuses]
    .filter(Boolean).join(" · ");
  const tag = selectable ? "button" : "article";
  const targetAttributes = selectable
    ? `type="button" data-action="combat-target" data-target-id="${combatant.id}" aria-label="Target ${combatant.name}"${combatant.side === "enemy" ? ` aria-pressed="${selected}"` : ""}`
    : "";
  const markup = `
    <${tag} class="combatant ${combatant.side} ${defeated ? "is-defeated" : ""} ${ready ? "is-ready" : ""} ${selectable ? "is-selectable" : ""} ${selected ? "is-selected" : ""} ${wasHit ? "was-hit" : ""}"
      data-combatant-id="${combatant.id}" ${targetAttributes}>
      <div data-asset-frame="combat" class="combatant-token" aria-hidden="true">${renderCombatVisual(combatant.visualAssetId, combatant.side === "ally" ? "♞" : "◆", combatant.name)}</div>
      ${selected ? '<span class="combat-target-badge" aria-hidden="true">TARGET</span>' : ""}
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
    const abilities = CombatSystem.abilityEntries(combat, game.expedition);
    const entries = abilities.length > 0
      ? abilities.map((ability) => {
        const availability = ability.availability;
        const cost = ability.cost?.resource ? `${capitalize(ability.cost.resource)} ${availability.cost.amount}` : "No resource cost";
        const limits = [
          cost,
          availability.cooldownRemaining > 0 ? `Cooldown ${availability.cooldownRemaining}` : "",
          availability.chargesRemaining !== null ? `${availability.chargesRemaining} charge${availability.chargesRemaining === 1 ? "" : "s"}` : "",
          availability.reason ? availability.reason.replaceAll("-", " ") : "Ready",
        ].filter(Boolean).join(" Â· ");
        const tags = Array.isArray(ability.tags) && ability.tags.length ? ` · ${ability.tags.join(", ")}` : "";
        return `<button type="button" data-action="combat-ability" data-ability-id="${ability.id}" ${availability.usable ? "" : "disabled"}><strong>${ability.name}</strong><span>${ability.description ?? ""}</span><small class="combat-ability-meta">${limits}${tags}</small></button>`;
      }).join("")
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
  return Object.values(expedition?.materialBag?.unsecured ?? expedition?.unsecuredMaterials ?? {})
    .reduce((sum, quantity) => sum + (Number(quantity) || 0), 0);
}

function unsecuredLootDisplayValue(expedition) {
  const physicalQuantity = unsecuredItemQuantity(expedition) + unsecuredMaterialQuantity(expedition);
  const goldQuantity = Math.max(0, Math.floor(Number(expedition?.goldCarried) || 0));
  if (physicalQuantity > 0 && goldQuantity > 0) return `${physicalQuantity} + ${goldQuantity}g`;
  if (goldQuantity > 0) return `${goldQuantity}g`;
  return `${physicalQuantity}`;
}

function unsecuredLootSummary(expedition) {
  const itemQuantity = unsecuredItemQuantity(expedition);
  const materialQuantity = unsecuredMaterialQuantity(expedition);
  const goldQuantity = Math.max(0, Math.floor(Number(expedition?.goldCarried) || 0));
  const parts = [];
  if (itemQuantity > 0) parts.push(`${itemQuantity} item${itemQuantity === 1 ? "" : "s"}`);
  if (materialQuantity > 0) parts.push(`${materialQuantity} material${materialQuantity === 1 ? "" : "s"}`);
  if (goldQuantity > 0) parts.push(`${goldQuantity} gold`);
  return parts.length > 0 ? `Unsecured: ${parts.join(" · ")}` : "Unsecured: None";
}

function renderExpeditionResources(expedition) {
  const materialBagUsed = MaterialRules.expeditionTotal(expedition);
  const provisionStatus = ExpeditionRules.returnProvisionStatus(expedition);
  return `
    <div class="resource-grid compact-resources">
      <div class="resource-card"><span>Distance</span><strong id="distance-value">${formatDistance(expedition.distance)}</strong></div>
      <div class="resource-card"><span>Max reached</span><strong id="max-distance-value">${formatDistance(expedition.maxDistanceReached)}</strong></div>
      <div id="provisions-card" class="resource-card provisions-card provision-state-${provisionStatus.state}" data-provision-state="${provisionStatus.state}">
        <span>Provisions</span>
        <strong id="provisions-value">${formatResource(expedition.provisions)}</strong>
      </div>
      <div class="resource-card"><span>Health</span><strong id="health-value">${Math.ceil(expedition.health)} / ${InjuryRules.effectiveMaxHealth(expedition, "arthur")}</strong></div>
      <div class="resource-card"><span>Faith</span><strong id="faith-value">${game.player.faith} / ${game.player.maxFaith}</strong></div>
      <div class="resource-card material-bag-card"><span>Material Bag</span><strong id="material-bag-count">${materialBagUsed} / ${MaterialRules.capacity()}</strong></div>
      <div class="resource-card"><span>Unsecured Loot</span><strong id="loot-count">${unsecuredLootDisplayValue(expedition)}</strong></div>
    </div>`;
}

function renderCompactExpeditionInjurySummary(expedition) {
  if (!expedition || expedition.activeEncounter || expedition.combat || !["traveling", "paused"].includes(expedition.travelState)) return "";
  const entries = ["arthur", ...selectedCompanionIds(expedition)]
    .flatMap((characterId) => InjuryRules.forCharacter(expedition, characterId)
      .map((instance) => ({ characterId, injuryId: InjuryRules.idOf(instance) })));
  if (!entries.length) return "";
  const rows = entries.map(({ characterId, injuryId }) => {
    const injury = INJURY_DEFINITIONS[injuryId];
    return `<span class="expedition-injury-entry"><span class="expedition-injury-character">${characterNameForUi(characterId)}</span><span aria-hidden="true">—</span><span class="injury-name ${injurySemanticTone(injuryId)}">${injury.name}</span></span>`;
  }).join("");
  return `<section class="expedition-injury-summary" aria-label="Active injuries"><span class="expedition-injury-label">Injuries</span><div class="expedition-injury-list">${rows}</div></section>`;
}

function injurySemanticTone(injuryId) {
  return ["deep_cut", "poisoned", "infection"].includes(injuryId)
    ? "injury-tone-serious"
    : "injury-tone-recoverable";
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

function updateExpedition(deltaSeconds) {
  const expedition = game.expedition;
  if (!expedition || expedition.status !== "active" || expedition.activeEncounter || expedition.combat) {
    return;
  }

  const speedMultiplier = expedition.direction === "returning"
    ? EXPEDITION_TUNING.returnSpeedMultiplier
    : 1;
  const paceMultiplier = ExpeditionRules.paceDefinition(expedition.paceId).speedMultiplier;
  const travel = ExpeditionRules.travel(
    expedition,
    game.player,
    EXPEDITION_TUNING.outboundTravelSpeed
      * speedMultiplier
      * paceMultiplier
      * ExpeditionRules.travelSpeedMultiplier(expedition)
      * deltaSeconds,
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
    playEncounterAudio(EncounterManager.definitionFor(expedition));
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

function setExpeditionPace(paceId) {
  const expedition = game.expedition;
  if (!expedition || expedition.status !== "active" || expedition.activeEncounter || expedition.combat) return;
  if (ExpeditionRules.setPace(expedition, paceId)) refreshExpedition();
}

function setExpeditionRations(rationId) {
  const expedition = game.expedition;
  if (!expedition || expedition.status !== "active" || expedition.activeEncounter || expedition.combat) return;
  if (ExpeditionRules.setRation(expedition, rationId)) refreshExpedition();
}

function pauseTravel() {
  if (ExpeditionRules.pause(game.expedition)) refreshExpedition();
}

function resumeTravel() {
  if (ExpeditionRules.resume(game.expedition)) refreshExpedition();
}

function briefRest() {
  const result = ExpeditionRules.briefRest(game.expedition);
  if (!result.applied) {
    showToast({ title: "Cannot Rest", message: result.reason === "insufficient-provisions" ? "There are not enough provisions for a brief rest." : "Brief Rest is only available while paused.", type: "warning" });
    return;
  }
  showToast({ title: "Brief Rest", message: `The company recovers ${result.totalHealingAmount} health for ${result.cost} provision.`, type: "success" });
  refreshExpedition();
}

function makeCamp() {
  if (ExpeditionRules.enterCamp(game.expedition)) {
    game.campTab = "rest";
    refreshExpedition();
  }
}

function setCampTab(tabId) {
  if (!["rest", "cook", "craft"].includes(tabId) || game.expedition?.travelState !== "camped") return;
  game.campTab = tabId;
  refreshExpedition();
}

function campRest() {
  const result = ExpeditionRules.restAtCamp(game.expedition, game.player);
  if (!result.applied) {
    showToast({ title: "Cannot Rest", message: result.reason === "insufficient-provisions" ? "There are not enough provisions for a camp rest." : "The company is not settled at camp.", type: "warning" });
    return;
  }
  showToast({ title: "Camp Rest", message: result.eventId ? "The night's rest draws attention from the surrounding forest." : `The company recovers ${result.totalHealingAmount} health.`, type: "success" });
  refreshExpedition();
}

function leaveCamp() {
  if (ExpeditionRules.leaveCamp(game.expedition)) refreshExpedition();
}

function cookRecipe(recipeId) {
  const actionExpedition = game.expedition;
  if (!actionExpedition || actionExpedition.travelState !== "camped" || actionExpedition.activeEncounter) return;
  beginCraftingAction(recipeId, "campfire", { screen: "expedition", expedition: actionExpedition, context: "camp" });
  return;
  const expedition = game.expedition;
  if (!expedition || expedition.travelState !== "camped" || expedition.activeEncounter) return;
  const result = CraftingRules.craft(game.player, recipeId, "campfire", { expedition });
  if (!result.applied) {
    showToast({ title: "Cannot Cook", message: cookingFailureMessage(result), type: "warning" });
    return;
  }
  showToast({ title: "Meal Cooked", message: `The meal adds ${result.provisions} provisions.`, type: "success" });
  refreshExpedition();
}

function craftCampItem(recipeId) {
  const actionExpedition = game.expedition;
  if (!actionExpedition || actionExpedition.travelState !== "camped" || actionExpedition.activeEncounter) return;
  beginCraftingAction(recipeId, "blacksmith", { screen: "expedition", expedition: actionExpedition });
  return;
  const expedition = game.expedition;
  if (!expedition || expedition.travelState !== "camped" || expedition.activeEncounter) return;
  const result = CraftingRules.craft(game.player, recipeId, "blacksmith", { expedition });
  if (!result.applied) {
    showToast({ title: "Cannot Craft", message: craftingFailureMessage(result), type: "warning" });
    return;
  }
  savePlayer();
  showToast({ title: "Field Craft Complete", message: `Created ${ITEM_DEFINITIONS[result.itemId]?.name ?? "an item"}.`, type: "success" });
  refreshExpedition();
}

function cookingFailureMessage(result) {
  if (result.reason === "insufficient-materials") {
    return result.quote.ingredientStatus
      .filter((entry) => !entry.sufficient)
      .map((entry) => `${ITEM_DEFINITIONS[entry.itemId]?.name ?? MaterialRules.definition(entry.materialId ?? entry.ingredientId).name}: need ${entry.required}`)
      .join(" · ");
  }
  return "The required ingredients are not available in the Material Bag.";
}

function resolveEncounterChoice(choiceId) {
  const expedition = game.expedition;
  if (!expedition?.activeEncounter || expedition.status !== "active") {
    return;
  }

  const result = EncounterManager.resolveChoice(expedition, game.player, choiceId, {
    failExpedition,
    startCombat: (combatId) => startCombat(expedition, combatId),
    startDialogue: (dialogueId) => startEncounterDialogue(expedition, dialogueId),
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
        {
          failExpedition,
          startCombat: (combatId) => startCombat(pendingExpedition, combatId),
          startDialogue: (dialogueId) => startEncounterDialogue(pendingExpedition, dialogueId),
        },
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
  AudioManager.playSemantic("encounter");
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

function startEncounterDialogue(expedition, dialogueId) {
  if (!expedition || expedition.status !== "active") return false;
  const session = DialogueSystem.start(dialogueId, {
    player: game.player,
    expedition,
    returnContext: { type: "encounter" },
  });
  if (!session) return false;
  game.dialogueSession = session;
  return true;
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
    savePlayer();
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
  if (result === "victory") AudioManager.playSemantic("victory");
  expedition.combat = null;
  EncounterManager.completeCombat(expedition, game.player, result, {
    failExpedition,
    startDialogue: (dialogueId) => startEncounterDialogue(expedition, dialogueId),
  });
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
  if (!DEBUG_TOOLS_ENABLED || !game.expedition || game.expedition.activeEncounter) {
    return;
  }
  const encounterId = document.querySelector("#debug-encounter-select")?.value;
  if (EncounterManager.force(game.expedition, encounterId)) {
    renderExpedition();
  }
}

function forceNextEncounter() {
  if (!DEBUG_TOOLS_ENABLED || !game.expedition || game.expedition.activeEncounter) {
    return;
  }
  EncounterManager.forceNextSoon(game.expedition);
  renderExpedition();
}

function startDebugCombat() {
  const expedition = game.expedition;
  if (!DEBUG_TOOLS_ENABLED || !expedition || expedition.activeEncounter || expedition.combat) {
    return;
  }
  const combatId = document.querySelector("#debug-combat-select")?.value ?? "wild_boar";
  if (COMBAT_DEFINITIONS[combatId] && startCombat(expedition, combatId)) {
    renderExpedition();
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
    : reward.type === "material" ? MaterialRules.definition(reward.materialId)
      : reward.type === "recipe" ? RECIPE_DEFINITIONS[reward.recipeId]
        : reward.type === "ability" ? AbilityRules.definition(reward.abilityId) : null;
}

function rewardIconKind(reward) {
  if (reward.type === "gold") return "currency";
  if (reward.type === "material") {
    const definition = MaterialRules.definition(reward.materialId);
    return itemIconKind("material", { ...definition, id: reward.materialId, category: "material" });
  }
  if (reward.type === "recipe") return "recipe";
  if (reward.type === "ability") return "ability";
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
  if (reward.type === "material") return Number(reward.quantity) > 0 ? `×${reward.quantity}` : "";
  return reward.quantity > 1 ? `×${reward.quantity}` : "";
}

function rewardCategoryLabel(reward) {
  const definition = rewardDefinition(reward);
  return reward.type === "gold" ? "Currency"
    : reward.type === "material" ? "Crafting Material"
      : reward.type === "recipe" ? "Recipe"
        : reward.type === "ability" ? `${capitalize(definition?.kind ?? "")} Ability`
          : capitalize(definition?.category ?? "Item");
}

function renderRewardCard(reward, options = {}) {
  if (!rewardHasCollectedQuantity(reward)) return "";
  const definition = rewardDefinition(reward);
  const rarity = definition?.rarity ?? "common";
  const rarityName = RARITY_DEFINITIONS[rarity]?.name ?? capitalize(rarity);
  const name = rewardDisplayName(reward);
  const description = reward.type === "gold" ? "Coins recovered from the journey."
    : definition?.description ?? "A useful discovery from the road.";
  const quantity = rewardQuantityLabel(reward);
  const statusLabel = reward.statusLabel || rewardCapacityStatus(reward) || (reward.unsecured ? "UNSECURED" : "");
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

function rewardHasCollectedQuantity(reward) {
  return Number(reward?.quantity) > 0;
}

function rewardCapacityStatus(reward) {
  if (reward?.type !== "material" || Number(reward.rejectedQuantity) <= 0) return "";
  const collected = Math.max(0, Number(reward.quantity) || 0);
  return collected > 0
    ? `${collected} collected · ${reward.rejectedQuantity} left behind`
    : `Material Bag full · ${reward.rejectedQuantity} left behind`;
}

function renderRewardCards(rewards = [], options = {}) {
  const visibleRewards = rewards.filter(rewardHasCollectedQuantity);
  if (visibleRewards.length === 0) {
    return `<p class="empty-rewards">${options.emptyMessage ?? "No rewards this time."}</p>`;
  }
  return `<div class="reward-card-list">${visibleRewards.map((reward) => renderRewardCard(reward, options)).join("")}</div>`;
}

function renderCompactRewardRow(reward) {
  if (!rewardHasCollectedQuantity(reward)) return "";
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
  const visibleRewards = rewards.filter(rewardHasCollectedQuantity);
  if (visibleRewards.length === 0) {
    return `<p class="empty-rewards">${options.emptyMessage ?? "No rewards this time."}</p>`;
  }
  const routineAndNotable = visibleRewards.filter((reward) => rewardPresentation(reward) !== "major");
  const major = visibleRewards.filter((reward) => rewardPresentation(reward) === "major");
  const groups = [
    ["Items", routineAndNotable.filter((reward) => reward.type === "item")],
    ["Materials", routineAndNotable.filter((reward) => reward.type === "material")],
    ["Gold", routineAndNotable.filter((reward) => reward.type === "gold")],
    ["Combat Abilities", routineAndNotable.filter((reward) => reward.type === "ability")],
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
  setText("#health-value", `${Math.ceil(expedition.health)} / ${InjuryRules.effectiveMaxHealth(expedition, "arthur")}`);
  setText("#material-bag-count", `${MaterialRules.expeditionTotal(expedition)} / ${MaterialRules.capacity()}`);
  setText("#loot-count", unsecuredLootDisplayValue(expedition));
  setText(".unsecured-detail-summary", unsecuredLootSummary(expedition));

  const returning = expedition.direction === "returning";
  const activeEncounter = expedition.activeEncounter
    ? EncounterManager.definitionFor(expedition)
    : null;
  const directionBanner = document.querySelector("#direction-banner");
  const travelers = document.querySelector("#travelers");
  const returnButton = document.querySelector("#return-button");
  const progressFill = document.querySelector("#distance-progress");
  const scene = document.querySelector("#travel-scene");
  const isMoving = !activeEncounter && expedition.travelState === "traveling";

  if (directionBanner) {
    directionBanner.textContent = travelBannerText(expedition, activeEncounter);
  }
  travelers?.classList.toggle("is-returning", returning);
  travelers?.classList.toggle("is-paused", Boolean(activeEncounter) || expedition.travelState !== "traveling");
  travelers?.classList.toggle("is-moving", isMoving);
  if (returnButton) {
    returnButton.disabled = returning;
    returnButton.textContent = "Return";
  }
  if (progressFill) {
    const denominator = Math.max(expedition.maxDistanceReached, 1);
    progressFill.style.width = `${clamp((expedition.distance / denominator) * 100, 0, 100)}%`;
  }
  if (scene) {
    scene.classList.toggle("is-paused", Boolean(activeEncounter) || expedition.travelState !== "traveling");
    scene.classList.toggle("is-returning", returning);
    scene.classList.toggle("is-moving", isMoving);
    scene.style.setProperty("--travel-motion-duration", {
      cautious: "38s",
      normal: "30s",
      hard_push: "22s",
    }[expedition.paceId] ?? "30s");
    scene.style.setProperty("--travel-pan-duration", {
      cautious: "20s",
      normal: "16s",
      hard_push: "11s",
    }[expedition.paceId] ?? "16s");
    scene.style.setProperty("--travel-offset", `${expedition.sceneOffset % 160}px`);
    syncTravelVisual(expedition, activeEncounter);
    preloadNextTravelScene(expedition);
  }
  setText("#path-value", pathLabel(expedition.currentPathId));
  setText("#journey-log-preview", journeyLogPreview(expedition));
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
  setText("#journey-log-preview", journeyLogPreview(game.expedition));
  const lootList = document.querySelector("#loot-list");
  if (lootList) {
    lootList.innerHTML = renderDiscoveryList(game.expedition);
  }
}

function savePlayer() {
  if ((typeof ReplayController !== "undefined" && ReplayController.isActive())
    || (typeof CampaignReplayController !== "undefined" && CampaignReplayController.isActive())) {
    ui.saveStatus.textContent = "Replay sandbox";
    return false;
  }
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
  game.preparationStep = "route";
  game.shopTab = "buy";
  game.provisionShopStock = createProvisionShopStock();
  game.itemShopStock = createItemShopStock();
  game.craftingAction = null;
  game.restAction = null;
  game.dialogueSession = null;
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
  ability: '<path d="M12 3.5 14.2 9l5.3 2.2-5.3 2.3L12 19l-2.2-5.5-5.3-2.3L9.8 9 12 3.5Z"/><path d="M17.5 4v3m-1.5-1.5h3"/>',
  rope: '<path d="M7 5c-2.5 0-3.5 2.8-1.5 4.3l7.2 5.4c2 1.5 1 4.3-1.5 4.3-1.8 0-3.1-1.1-3.1-2.7 0-1.1.6-1.9 1.3-2.4"/><path d="M17 19c2.5 0 3.5-2.8 1.5-4.3l-7.2-5.4c-2-1.5-1-4.3 1.5-4.3 1.8 0 3.1 1.1 3.1 2.7 0 1.1-.6 1.9-1.3 2.4"/>',
  torch: '<path d="M10 12.5h4l1.2 7H8.8l1.2-7Z"/><path d="M12 3c2.8 2.3 3.4 4.2 1.7 6.2-.8.9-1.8 1.4-1.7 3.3-2.8-1.4-3.1-4-.9-6.4.4-.5.8-1.4.9-3.1Z"/>',
  tool: '<path d="m14.5 5.5 4 4M13 7l4-4 2 2-4 4M4 20l7.8-7.8 2 2L6 22H4v-2Z"/>',
  treasure: '<path d="M4 9h16v10H4z"/><path d="M4 9 6 5h12l2 4M9 13h6M12 10v6"/>',
  curiosity: '<path d="M12 3.5 14 8l4.5 2-4.5 2-2 4.5-2-4.5-4.5-2 4.5-2 2-4.5Z"/><circle cx="18.5" cy="5.5" r="1.2"/>',
  skull: '<path d="M7 10a5 5 0 0 1 10 0v3.5l-1.8 1.2v2.3H8.8v-2.3L7 13.5V10Z"/><path d="M9.3 18.2h5.4M10 10.2h.1m3.9 0h.1M10 13.5h4"/>',
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
  if (category === "quest") return "relic";
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
    materialBag: {
      capacity: MaterialRules.capacity(),
      contents: MaterialRules.expeditionContents(expedition),
      unsecured: expedition.materialBag?.unsecured ?? expedition.unsecuredMaterials,
      rejected: expedition.materialBagRejected,
    },
    unsecuredLoot: expedition.unsecuredLoot,
    consumedItems: expedition.consumedItems,
    path: expedition.currentPathId,
    direction: expedition.direction,
    travelState: expedition.travelState,
    pace: expedition.paceId,
    rations: expedition.rationId,
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
    camp: { cycle: expedition.campCycle, eventRolled: expedition.campEventRolled, eventId: expedition.campEventId },
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

  updateCraftingProgress(timestamp);
  updateInnRestProgress(timestamp);

  if (typeof CampaignReplayController !== "undefined" && CampaignReplayController.isActive()) {
    CampaignReplayController.update(deltaSeconds);
    game.hudAccumulator += deltaSeconds;
    if (game.hudAccumulator >= 0.05) {
      if (game.expedition?.combat) updateCombatHud();
      else if (game.screen === "expedition") updateTravelHud();
      game.hudAccumulator = 0;
      if (typeof DebugTools !== "undefined") DebugTools.refreshState();
    }
  } else if (game.screen === "expedition") {
    if (typeof ReplayController !== "undefined" && ReplayController.isActive()) {
      ReplayController.update(deltaSeconds);
    } else if (game.expedition?.combat) {
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
      if (typeof DebugTools !== "undefined") DebugTools.refreshState();
    }
  }

  requestAnimationFrame(gameLoop);
}

function updateCraftingProgress(timestamp) {
  const action = game.craftingAction;
  if (!action) return;
  action.progress = clamp((timestamp - action.startedAt) / action.durationMs, 0, 1);
  const progressFill = document.querySelector(".crafting-progress-fill");
  const progressLabel = document.querySelector(".crafting-progress-heading span");
  if (progressFill) progressFill.style.width = `${Math.round(action.progress * 100)}%`;
  if (progressLabel) progressLabel.textContent = `${Math.round(action.progress * 100)}%`;
  if (action.progress >= 1) completeCraftingAction();
}

function updateInnRestProgress(timestamp) {
  const action = game.restAction;
  if (!action) return;
  action.progress = clamp((timestamp - action.startedAt) / action.durationMs, 0, 1);
  const progressFill = document.querySelector(".inn-rest-progress .crafting-progress-fill");
  const progressLabel = document.querySelector(".inn-rest-progress-heading span");
  if (progressFill) progressFill.style.width = `${Math.round(action.progress * 100)}%`;
  if (progressLabel) progressLabel.textContent = `${Math.round(action.progress * 100)}%`;
  if (action.progress >= 1) {
    game.restAction = null;
    restAtInn();
  }
}

initializeGame();
