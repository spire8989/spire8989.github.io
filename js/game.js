"use strict";

// Add ?debug=1 to the URL to expose the developer-only Game Debug panel.
const DEBUG_TOOLS_ENABLED = new URLSearchParams(window.location.search).has("debug");

const game = {
  player: SaveSystem.load(),
  expedition: null,
  locationContext: null,
  screen: "campaign",
  preparationSupplies: 18,
  // Retained as a compatibility field for older runtime callers; preparation
  // is now always the unified expedition setup screen.
  preparationMode: "expedition",
  preparationStep: "route",
  expeditionStartPending: false,
  departurePresentation: null,
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
  travelPartyVisualState: null,
  travelScenePresentation: null,
  travelPresentationGeneration: 0,
  rewardPresentationContextId: 0,
  craftingAction: null,
  restAction: null,
  restActionVersion: 0,
};

const ui = {
  screenRoot: document.querySelector("#screen-root"),
  saveStatus: document.querySelector("#save-status"),
};

let pendingEncounterActionTimer = null;
const combatPresentationControllers = new WeakMap();

function initializeGame() {
  if (!ui.screenRoot || !ui.saveStatus) {
    throw new Error("Required game UI elements were not found.");
  }

  document.addEventListener("click", handleAction);
  document.addEventListener("input", handleAudioSettingInput);
  document.addEventListener("pointerdown", showPressedState);
  document.addEventListener("pointerup", clearPressedState);
  document.addEventListener("pointercancel", clearPressedState);
  window.addEventListener("resize", () => {
    if (game.screen === "location") window.requestAnimationFrame(clampTownHotspotsToScene);
    if (game.screen === "expedition") {
      const scene = document.querySelector("#travel-scene");
      const image = currentTravelTrack()?.querySelector("[data-travel-copy='primary']");
      if (scene && image) {
        queueTravelPresentationFrame(
          () => updateTravelImagePresentation(scene, image),
          travelPresentationToken(game.expedition, travelPresentationNodeGeneration(image) ?? currentTravelPresentationGeneration()),
          [scene, image],
        );
      }
    }
  });
  AudioManager.initialize();
  renderScreen();
  requestAnimationFrame(gameLoop);
}

function handleAction(event) {
  const control = event.target.closest("[data-action]");
  if (!control || control.disabled) {
    return;
  }

  const { action, itemId, materialId, recipeId, companionId, choiceId, destinationId, slotIndex, expeditionId, abilityId, stepId } = control.dataset;

  // Replay playback owns an isolated game state. Keep the real gameplay
  // controls visible for faithful rendering, but do not let them mutate the
  // sandbox while the recorded decisions are driving it.
  if ((typeof ReplayController !== "undefined" && ReplayController.isActive())
    || (typeof CampaignReplayController !== "undefined" && CampaignReplayController.isActive())) {
    return;
  }
  if (game.expeditionStartPending) return;

  if (typeof RewardRevealSystem !== "undefined"
    && RewardRevealSystem.isBlocking()
    && ["continue-journey", "return-to-safety", "new-expedition"].includes(action)) {
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
    case "leave-expedition-location":
      leaveExpeditionLocation();
      break;
    case "preparation-step":
      setPreparationStep(stepId);
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
        partyProvisionCapacity(selectedCompanionIds(game.player), game.player.selectedExpeditionId),
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
  if (typeof RewardRevealSystem !== "undefined") RewardRevealSystem.cancel();
  const restAction = game.restAction;
  if (restAction && (restAction.screen !== screen
    || (screen === "destination" && restAction.destinationId !== game.activeDestinationId))) {
    cancelRestAction({ silent: true });
  }
  if (screen !== "expedition" && game.screen === "expedition") {
    bumpTravelPresentationGeneration(game.expedition, "expedition-screen-exit");
  }
  if (screen !== "expedition") cancelDeparturePresentation();
  game.screen = screen;
  renderScreen();
}

function cancelDeparturePresentation() {
  const presentation = game.departurePresentation;
  if (!presentation) return;
  if (presentation.timerId !== null) window.clearTimeout(presentation.timerId);
  if (presentation.frameId !== null) window.cancelAnimationFrame(presentation.frameId);
  if (presentation.expedition === game.expedition
    && presentation.expedition.status === "active"
    && presentation.expedition.travelState === "departure") {
    presentation.expedition.travelState = "paused";
  }
  game.departurePresentation = null;
}

function finishDeparturePresentation(presentation) {
  const expedition = presentation?.expedition;
  if (game.departurePresentation !== presentation
    || game.screen !== "expedition"
    || game.expedition !== expedition
    || expedition?.status !== "active"
    || expedition.travelState !== "departure") return;
  document.querySelector(".departure-banner")?.remove();
  expedition.travelState = "traveling";
  game.departurePresentation = null;
  renderExpedition();
}

function beginDeparturePresentation(expedition) {
  cancelDeparturePresentation();
  const duration = Math.max(0, Number(EXPEDITION_TUNING.departurePresentationDurationMs) || 0);
  const presentation = { expedition, timerId: null, frameId: null };
  game.departurePresentation = presentation;
  presentation.timerId = window.setTimeout(() => finishDeparturePresentation(presentation), duration);
}

function renderScreen() {
  if (typeof RewardRevealSystem !== "undefined") RewardRevealSystem.cancel();
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
      : "";

    return `
      <article class="chapter-card ${stateClass}">
        <span class="chapter-marker" aria-hidden="true">${chapter.number}</span>
        <div class="chapter-copy">
          <p class="chapter-number">Chapter ${chapter.number}<span class="chapter-state">${stateLabel}</span></p>
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
      <div class="campaign-record">
        <div class="campaign-record-heading">
          <span>Chapter record</span>
          <span>Arthur's progress</span>
        </div>
        <div class="chapter-list">${chapters}</div>
        <div class="campaign-stats">
          <span><small>Best expedition</small><strong>${formatDistance(game.player.bestExpeditionDistance)}</strong></span>
          <span><small>Treasury</small><strong>${Math.floor(game.player.currentGold)} gold</strong></span>
        </div>
      </div>
    </section>`;
}

function enterLocation(locationId) {
  if (!LOCATION_DEFINITIONS[locationId]) {
    return;
  }
  if (game.expedition?.status === "active") return;
  game.locationContext = null;
  game.player.currentLocationId = locationId;
  savePlayer();
  showLocation();
}

function currentLocationForUi() {
  const locationId = game.locationContext?.locationId ?? game.player.currentLocationId;
  return LOCATION_DEFINITIONS[locationId] ?? null;
}

function locationIsUnlocked(location) {
  if (!location) return false;
  if (location.requiresIntro === false) return true;
  return isVillageUnlocked();
}

function showLocation() {
  const location = currentLocationForUi();
  if (!location) {
    showScreen("campaign");
    return;
  }
  const locationEntry = CampaignRules.enterLocationById(
    game.player,
    game.provisionShopStock,
    location.id,
  );
  if (locationEntry.provisionsGranted > 0 || locationEntry.shopProvisionsRestocked > 0) {
    savePlayer();
  }
  game.activeDestinationId = null;
  game.dialogueSession = null;
  showScreen("location");
}

function enterExpeditionLocation(expedition, locationId) {
  if (!expedition || expedition.status !== "active" || !LOCATION_DEFINITIONS[locationId]) return;
  game.locationContext = { type: "expedition", locationId };
  game.activeDestinationId = null;
  game.dialogueSession = null;
  showLocation();
}

function leaveExpeditionLocation() {
  const expedition = game.expedition;
  if (!game.locationContext?.type || !expedition || expedition.status !== "active") return;
  cancelRestAction();
  game.craftingAction = null;
  if (expedition.activeEncounter?.phase === "result") {
    EncounterManager.continueJourney(expedition);
  }
  expedition.locationStop = null;
  expedition.travelState = "paused";
  game.locationContext = null;
  game.activeDestinationId = null;
  game.dialogueSession = null;
  showScreen("expedition");
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
const travelPresentationAsyncWork = {
  frames: new Set(),
  timers: new Set(),
};

function currentTravelPresentationGeneration() {
  return Number(game.travelPresentationGeneration) || 0;
}

function travelPresentationToken(expedition = game.expedition, generation = currentTravelPresentationGeneration()) {
  return { expedition, generation };
}

function travelPresentationNodeGeneration(node) {
  const generation = Number(node?.dataset?.travelGeneration);
  return Number.isFinite(generation) ? generation : null;
}

function markTravelPresentationNode(node, generation = currentTravelPresentationGeneration()) {
  if (node?.dataset) node.dataset.travelGeneration = String(generation);
  return node;
}

function isCurrentTravelPresentation(token, nodes = []) {
  if (!token
    || token.generation !== currentTravelPresentationGeneration()
    || game.screen !== "expedition"
    || game.expedition !== token.expedition) {
    return false;
  }
  return nodes.filter(Boolean).every((node) => (
    node.isConnected
    && (travelPresentationNodeGeneration(node) === null
      || travelPresentationNodeGeneration(node) === token.generation)
  ));
}

function queueTravelPresentationFrame(callback, token = travelPresentationToken(), nodes = []) {
  let frameId = null;
  frameId = window.requestAnimationFrame(() => {
    travelPresentationAsyncWork.frames.delete(frameId);
    if (isCurrentTravelPresentation(token, nodes)) callback();
  });
  travelPresentationAsyncWork.frames.add(frameId);
  return frameId;
}

function scheduleTravelPresentationTimer(callback, delay, token = travelPresentationToken(), nodes = []) {
  let timerId = null;
  timerId = window.setTimeout(() => {
    travelPresentationAsyncWork.timers.delete(timerId);
    if (isCurrentTravelPresentation(token, nodes)) callback();
  }, delay);
  travelPresentationAsyncWork.timers.add(timerId);
  return timerId;
}

function clearTravelPresentationAsyncWork() {
  travelPresentationAsyncWork.frames.forEach((frameId) => window.cancelAnimationFrame(frameId));
  travelPresentationAsyncWork.frames.clear();
  travelPresentationAsyncWork.timers.forEach((timerId) => window.clearTimeout(timerId));
  travelPresentationAsyncWork.timers.clear();
}

function bumpTravelPresentationGeneration(expedition = game.expedition, reason = "presentation-change") {
  clearTravelPresentationAsyncWork();
  const generation = currentTravelPresentationGeneration() + 1;
  game.travelPresentationGeneration = generation;
  const state = game.travelScenePresentation;
  if (state?.expedition === expedition) {
    const priorPending = state.pending;
    const currentTrack = [...document.querySelectorAll("#travel-art .travel-visual-track[data-travel-layer='current']")][0];
    const preserveInstalledTile = reason.startsWith("encounter-")
      && priorPending?.tileMode
      && [...(currentTrack?.querySelectorAll(".travel-visual-asset") ?? [])]
        .some((tile) => tile.dataset.travelAssetId === priorPending.assetId);
    clearTravelTransitionTimers(state.transition);
    state.generation = generation;
    state.pending = preserveInstalledTile
      ? {
        ...priorPending,
        generation,
        expedition,
        tileInstallRequested: false,
        lastSampleAt: performance.now(),
      }
      : null;
    state.transition = null;
    state.sceneAssetLoad = null;
    state.failedAssetId = null;
  }
  document.querySelector("#travel-transition-art")?.classList.remove("is-active");
  const scene = document.querySelector("#travel-scene");
  const art = scene?.querySelector("#travel-art");
  scene?.querySelectorAll(".travel-visual-track[data-travel-layer='current']").forEach((track) => {
    markTravelPresentationNode(track, generation);
    track.querySelectorAll("*").forEach((node) => markTravelPresentationNode(node, generation));
  });
  scene?.querySelectorAll(".travel-parallax-layer, .travel-seam-foreground-layer, .travel-seam-foreground-carry")
    .forEach((layer) => layer.remove());
  scene?.querySelectorAll(".travel-visual-track").forEach((track) => {
    track._travelParallaxLayer = null;
    track._travelSeamForegroundLayer = null;
    track._travelSeamForeground = null;
    track._travelSeamForegrounds = null;
  });
  scene?.querySelectorAll(".travel-visual-track[data-travel-layer='outgoing']")
    .forEach((track) => track.remove());
  markTravelPresentationNode(scene, generation);
  markTravelPresentationNode(art, generation);
  document.querySelectorAll("#travel-art .travel-visual-track[data-travel-layer='next']")
    .forEach((track) => {
      removeTravelSeamForegroundLayer(track);
      removeTravelParallaxLayer(track);
      track.remove();
    });
  if (DEBUG_TOOLS_ENABLED) {
    console.debug(`[travel-presentation] generation ${generation}: ${reason}`);
  }
  return generation;
}

function assertTravelPresentationInvariant() {
  if (!DEBUG_TOOLS_ENABLED) return true;
  const scene = document.querySelector("#travel-scene");
  const art = scene?.querySelector("#travel-art");
  if (!scene || !art) return true;
  const tracks = [...art.querySelectorAll(".travel-visual-track")];
  const currentTracks = tracks.filter((track) => track.dataset.travelLayer === "current");
  const nextTracks = tracks.filter((track) => track.dataset.travelLayer === "next");
  const outgoingTracks = tracks.filter((track) => track.classList.contains("is-fading-out"));
  const layers = [...scene.querySelectorAll(".travel-parallax-layer, .travel-seam-foreground-layer")];
  const staleLayers = layers.filter((layer) => travelPresentationNodeGeneration(layer) !== currentTravelPresentationGeneration());
  const detachedOwners = [...scene.querySelectorAll(".travel-parallax-layer")].filter((layer) => {
    const owner = layer._travelParallaxTrack;
    return owner && !owner.isConnected;
  });
  const seamCarries = scene.querySelectorAll(".travel-seam-foreground-carry");
  const state = game.travelScenePresentation;
  const problems = [];
  if (currentTracks.length > 1) problems.push(`current=${currentTracks.length}`);
  if (nextTracks.length > 1) problems.push(`next=${nextTracks.length}`);
  if (outgoingTracks.some((track) => track.dataset.travelLayer !== "outgoing")) problems.push("unmarked-outgoing");
  if (staleLayers.length) problems.push(`stale-layers=${staleLayers.length}`);
  if (detachedOwners.length) problems.push(`detached-layer-owners=${detachedOwners.length}`);
  if (seamCarries.length > 1) problems.push(`seam-carries=${seamCarries.length}`);
  if (state && state.expedition !== game.expedition) problems.push("wrong-expedition-owner");
  if (currentTracks.some((track) => travelPresentationNodeGeneration(track) !== currentTravelPresentationGeneration())) {
    problems.push("stale-current-track");
  }
  const stableCurrent = currentTracks.length === 1
    && !state?.pending
    && !state?.transition
    && currentTracks[0].dataset.travelKind !== "encounter";
  if (stableCurrent && state?.activeAssetId
    && currentTracks[0].dataset.travelAssetId !== state.activeAssetId) {
    problems.push("current-asset-mismatch");
  }
  if (problems.length) {
    console.warn("[travel-presentation] invariant violation", {
      problems,
      generation: currentTravelPresentationGeneration(),
      expedition: game.expedition?.expeditionId ?? null,
      stateExpedition: state?.expedition?.expeditionId ?? null,
      tracks: tracks.map((track) => ({
        layer: track.dataset.travelLayer,
        assetId: track.dataset.travelAssetId,
        generation: track.dataset.travelGeneration,
        fading: track.classList.contains("is-fading-out"),
      })),
    });
    return false;
  }
  return true;
}

function normalizeTravelMotion(motion) {
  return motion === "pan" ? "pan" : "loop";
}

function orderedTravelScenes(definition) {
  return (Array.isArray(definition?.travelScenes) ? definition.travelScenes : [])
    .map((scene, index) => ({
      ...scene,
      minDistance: Number(scene?.minDistance),
      motion: normalizeTravelMotion(scene?.motion),
      showSeamForegroundBetweenLoops: scene?.showSeamForegroundBetweenLoops !== false,
      _authoredIndex: index,
    }))
    .filter((scene) => Number.isFinite(scene.minDistance)
      && scene.minDistance >= 0
      && typeof scene.visualAssetId === "string"
      && scene.visualAssetId)
    .sort((left, right) => left.minDistance - right.minDistance || left._authoredIndex - right._authoredIndex);
}

function resolveTravelSceneAtDistance(expedition, distance) {
  const definition = expeditionDefinition(expedition);
  const resolvedDistance = Math.max(0, Number(distance) || 0);
  const activeScene = orderedTravelScenes(definition)
    .filter((scene) => scene.minDistance <= resolvedDistance)
    .at(-1);
  if (activeScene) {
    return {
      assetId: activeScene.visualAssetId,
      travelParallaxAssetId: activeScene.travelParallaxAssetId ?? null,
      motion: activeScene.motion,
      showSeamForegroundBetweenLoops: activeScene.showSeamForegroundBetweenLoops,
      sceneKey: `scene:${activeScene._authoredIndex}:${activeScene.minDistance}`,
    };
  }
  return definition?.travelVisualAssetId
    ? {
      assetId: definition.travelVisualAssetId,
      travelParallaxAssetId: definition.travelParallaxAssetId ?? null,
      motion: "loop",
      showSeamForegroundBetweenLoops: true,
      sceneKey: "legacy-default",
    }
    : null;
}

function resolveTravelScene(expedition) {
  return resolveTravelSceneAtDistance(expedition, expedition?.distance);
}

function resolveTravelSceneAssetId(expedition) {
  return resolveTravelScene(expedition)?.assetId ?? null;
}

function renderTravelVisualAsset(assetId, alt, motion = "loop", sceneKey = "", presentationKind = "travel", showSeamForegroundBetweenLoops = true, visualSnapshot = null, travelParallaxAssetId = null) {
  const snapshotTiles = Array.isArray(visualSnapshot?.tiles) && visualSnapshot.tiles.length > 0
    ? visualSnapshot.tiles
    : [{ assetId, copy: "primary", tile: "leading" }];
  const trackAssetId = visualSnapshot?.trackAssetId || visualSnapshot?.assetId || assetId;
  const trackMotion = normalizeTravelMotion(visualSnapshot?.trackMotion ?? visualSnapshot?.motion ?? motion);
  const trackSceneKey = visualSnapshot?.trackSceneKey ?? visualSnapshot?.activeSceneKey ?? sceneKey;
  const trackTravelParallaxAssetId = visualSnapshot?.trackTravelParallaxAssetId
    ?? visualSnapshot?.travelParallaxAssetId
    ?? travelParallaxAssetId
    ?? resolveTravelScene(game.expedition)?.travelParallaxAssetId;
  const trackShowSeamForegroundBetweenLoops = visualSnapshot?.showSeamForegroundBetweenLoops
    ?? showSeamForegroundBetweenLoops;
  const isSnapshotTrack = Boolean(Array.isArray(visualSnapshot?.tiles) && visualSnapshot.tiles.length);
  const trackReady = snapshotTiles.every((tile) => travelSceneAssetReady(tile?.assetId));
  const visibleClass = trackReady ? " is-visible" : "";
  const tiles = snapshotTiles.map((tile, index) => {
    const tileAssetId = tile?.assetId;
    const path = AssetCatalog.imagePath(tileAssetId);
    if (!path) return "";
    const copy = tile?.copy === "loop" || index > 0 ? "loop" : "primary";
    const tileRole = copy === "primary" ? "leading" : "trailing";
    const tileTravelParallaxAssetId = tile?.travelParallaxAssetId ?? trackTravelParallaxAssetId;
    return `<img class="asset-image travel-visual-asset${visibleClass}" data-travel-generation="${currentTravelPresentationGeneration()}" data-travel-copy="${copy}" data-travel-tile="${tileRole}" data-travel-motion="${assetAttribute(trackMotion)}" data-travel-asset-id="${assetAttribute(tileAssetId)}" data-travel-parallax-asset-id="${assetAttribute(tileTravelParallaxAssetId ?? "")}" src="${assetAttribute(path)}" alt="${assetAttribute(alt)}" loading="eager" fetchpriority="high" decoding="async" onload="markTravelImageActive(this.closest('[data-asset-frame]'), this)" onerror="markTravelImageFailed(this.closest('[data-asset-frame]'), this)">`;
  }).filter(Boolean).join("");
  const image = tiles
    ? `<div class="travel-visual-track${visibleClass}" data-travel-generation="${currentTravelPresentationGeneration()}" data-travel-snapshot="${isSnapshotTrack ? "true" : "false"}" data-travel-layer="current" data-travel-kind="${assetAttribute(presentationKind)}" data-travel-scene-key="${assetAttribute(trackSceneKey)}" data-travel-asset-id="${assetAttribute(trackAssetId ?? "")}" data-travel-motion="${assetAttribute(trackMotion)}" data-travel-parallax-asset-id="${assetAttribute(trackTravelParallaxAssetId ?? "")}" data-travel-show-seam-between-loops="${trackShowSeamForegroundBetweenLoops === false ? "false" : "true"}">${tiles}</div>`
    : "";
  return `<div class="travel-art" id="travel-art" data-travel-generation="${currentTravelPresentationGeneration()}" data-travel-asset-id="${assetAttribute(trackAssetId ?? "")}" data-travel-motion="${assetAttribute(trackMotion)}">${image}</div>`;
}

function isTravelPanorama(image) {
  const width = Number(image?.naturalWidth);
  const height = Number(image?.naturalHeight);
  return width > 0 && height > 0 && width / height >= 2.2;
}

function travelMotionForImage(image) {
  return normalizeTravelMotion(
    image?.closest(".travel-visual-track")?.dataset.travelMotion ?? image?.dataset.travelMotion,
  );
}

function removeTravelParallaxLayer(track) {
  track?._travelParallaxLayer?.remove();
  if (track) track._travelParallaxLayer = null;
}

function syncTravelParallaxLayer(track) {
  const layer = track?._travelParallaxLayer;
  if (!layer?.isConnected) return;
  syncTravelParallaxTiles(track, layer);
  const sourceAnimation = travelImageAnimation(track);
  const sourceStyle = getComputedStyle(track);
  const scene = track.closest(".travel-scene");
  const direction = sourceStyle.animationDirection === "reverse" ? "reverse" : "normal";
  const shouldPlay = Boolean(scene?.classList.contains("is-moving")) && !scene.classList.contains("is-paused");
  const distance = sourceStyle.getPropertyValue("--travel-loop-distance").trim();
  if (distance) layer.style.setProperty("--travel-loop-distance", distance);
  const duration = sourceStyle.getPropertyValue("--travel-loop-duration").trim();
  if (duration) layer.style.setProperty("--travel-loop-duration", duration);
  layer.style.animationDirection = direction;
  layer.style.animationPlayState = shouldPlay ? "running" : "paused";
  layer.style.opacity = sourceStyle.opacity;
  const layerAnimation = travelImageAnimation(layer);
  const currentTime = Number(sourceAnimation?.currentTime);
  if (layerAnimation && Number.isFinite(currentTime)) {
    layerAnimation.currentTime = currentTime;
  }
}

function travelParallaxAssetForTile(track, tile) {
  if (!tile) return "";
  return tile.dataset.travelParallaxAssetId
    || (tile.dataset.travelCopy === "primary" ? track?.dataset.travelParallaxAssetId || "" : "");
}

function syncTravelParallaxTile(track, layer, baseTile, copy) {
  if (!track || !layer || !baseTile) return;
  let tile = [...layer.querySelectorAll(".travel-parallax-tile")]
    .find((candidate) => candidate.dataset.travelCopy === copy);
  if (!tile) {
    tile = document.createElement("div");
    tile.className = "travel-parallax-tile";
    tile.dataset.travelCopy = copy;
    layer.append(tile);
  }
  let foreground = tile.querySelector(".travel-parallax-foreground");
  if (!foreground) {
    foreground = document.createElement("img");
    foreground.className = "travel-parallax-foreground";
    foreground.alt = "";
    foreground.loading = "eager";
    foreground.decoding = "async";
    foreground.setAttribute("aria-hidden", "true");
    const token = travelPresentationToken(
      game.expedition,
      travelPresentationNodeGeneration(track) ?? currentTravelPresentationGeneration(),
    );
    foreground.addEventListener("load", () => {
      if (!isCurrentTravelPresentation(token, [track, layer, foreground])) return;
      foreground.hidden = false;
    });
    foreground.addEventListener("error", () => {
      if (!isCurrentTravelPresentation(token, [track, layer, foreground])) return;
      foreground.hidden = true;
    });
    tile.append(foreground);
  }
  foreground.dataset.travelCopy = copy;
  foreground.dataset.travelParallaxAssetId = travelParallaxAssetForTile(track, baseTile);
  const assetId = foreground.dataset.travelParallaxAssetId;
  const alignment = AssetCatalog.image(assetId)?.foregroundAlignment;
  const canvasWidth = Number(alignment?.canvas?.width) || Number(baseTile.naturalWidth) || 1;
  const canvasHeight = Number(alignment?.canvas?.height) || Number(baseTile.naturalHeight) || 1;
  const offsetX = Number(alignment?.offset?.x) || 0;
  const offsetY = Number(alignment?.offset?.y) || 0;
  const foregroundWidth = Number(alignment?.size?.width) || canvasWidth;
  const foregroundHeight = Number(alignment?.size?.height) || canvasHeight;
  tile.style.aspectRatio = `${canvasWidth} / ${canvasHeight}`;
  foreground.style.left = `${(offsetX / canvasWidth) * 100}%`;
  foreground.style.top = `${(offsetY / canvasHeight) * 100}%`;
  foreground.style.width = `${(foregroundWidth / canvasWidth) * 100}%`;
  foreground.style.height = `${(foregroundHeight / canvasHeight) * 100}%`;
  const path = assetId ? AssetCatalog.imagePath(assetId) : null;
  if (!path) {
    foreground.hidden = true;
    return;
  }
  const preloaded = travelScenePreloadCache.get(assetId);
  const sourceReady = travelSceneAssetReady(assetId);
  const sourceFailed = travelSceneAssetFailed(assetId);
  if (foreground.dataset.travelAssetId !== assetId) {
    foreground.dataset.travelAssetId = assetId;
    foreground.hidden = !(sourceReady || (!sourceFailed && foreground.complete && foreground.naturalWidth > 0));
    foreground.src = preloaded?.currentSrc || preloaded?.src || path;
  } else if (sourceFailed) {
    foreground.hidden = true;
  } else if (sourceReady || (foreground.complete && foreground.naturalWidth > 0)) {
    foreground.hidden = false;
  }
}

function syncTravelParallaxTiles(track, layer) {
  const baseTiles = [...(track?.querySelectorAll(".travel-visual-asset[data-travel-copy]") ?? [])];
  const copies = new Set();
  baseTiles.forEach((baseTile, index) => {
    const copy = baseTile.dataset.travelCopy === "loop" || index > 0 ? "loop" : "primary";
    copies.add(copy);
    syncTravelParallaxTile(track, layer, baseTile, copy);
  });
  layer?.querySelectorAll(".travel-parallax-tile").forEach((tile) => {
    if (!copies.has(tile.dataset.travelCopy)) tile.remove();
  });
  const primaryTile = baseTiles.find((tile) => tile.dataset.travelCopy !== "loop") || baseTiles[0];
  layer.dataset.travelParallaxAssetId = travelParallaxAssetForTile(track, primaryTile);
}

function ensureTravelParallaxForeground(image, panorama, motion) {
  const track = image?.closest(".travel-visual-track");
  const baseTiles = [...(track?.querySelectorAll(".travel-visual-asset[data-travel-copy]") ?? [])];
  const hasParallaxAsset = baseTiles.some((tile) => travelParallaxAssetForTile(track, tile));
  if (!track || track.dataset.travelKind === "encounter" || !panorama || motion !== "loop" || !hasParallaxAsset) {
    removeTravelParallaxLayer(track);
    return;
  }
  const scene = track.closest(".travel-scene");
  if (!scene) {
    removeTravelParallaxLayer(track);
    return;
  }
  if (track._travelParallaxLayer?.isConnected) {
    syncTravelParallaxLayer(track);
    return;
  }
  removeTravelParallaxLayer(track);
  const layer = document.createElement("div");
  layer.className = "travel-parallax-layer is-loop-motion is-visible";
  layer.dataset.travelSourceTrackLayer = track.dataset.travelLayer || "current";
  layer._travelParallaxTrack = track;
  markTravelPresentationNode(layer);
  scene.append(layer);
  track._travelParallaxLayer = layer;
  syncTravelParallaxLayer(track);
}

function resolveTravelSeamForegroundAssetId(expedition = game.expedition) {
  const assetId = expeditionDefinition(expedition)?.travelSeamForegroundAssetId;
  return assetId && AssetCatalog.imagePath(assetId) ? assetId : null;
}

function removeTravelSeamForegroundLayer(track) {
  const layer = track?._travelSeamForegroundLayer;
  layer?.remove();
  if (track) {
    track._travelSeamForegroundLayer = null;
    track._travelSeamForeground = null;
    track._travelSeamForegrounds = null;
  }
}

function removeTravelSeamForegroundLayers(scene, { carryOnly = false } = {}) {
  if (!scene) return;
  const selector = carryOnly
    ? ".travel-seam-foreground-carry"
    : ".travel-seam-foreground-layer, .travel-seam-foreground-carry";
  scene.querySelectorAll(selector).forEach((layer) => layer.remove());
  scene.querySelectorAll(".travel-visual-track").forEach((track) => {
    if (!track._travelSeamForegroundLayer?.isConnected) {
      track._travelSeamForegroundLayer = null;
      track._travelSeamForeground = null;
      track._travelSeamForegrounds = null;
    }
  });
}

function freezeTravelSeamForegroundLayer(layer, sourceTrack = null) {
  if (!layer?.isConnected) return;
  const sourceAnimation = travelImageAnimation(sourceTrack);
  const layerAnimation = travelImageAnimation(layer);
  const sourceTime = Number(sourceAnimation?.currentTime);
  const layerTime = Number(layerAnimation?.currentTime);
  if (layerAnimation && Number.isFinite(sourceTime)) layerAnimation.currentTime = sourceTime;
  else if (layerAnimation && Number.isFinite(layerTime)) layerAnimation.currentTime = layerTime;
  layer.style.animationPlayState = "paused";
}

function syncTravelSeamForegroundPresentation(scene, expedition, activeEncounter = null) {
  if (!scene || !expedition) return;
  const encounter = activeEncounter ?? expedition.activeEncounter;
  const encounterVisualState = resolveEncounterVisualState(activeEncounter, expedition.activeEncounter);
  const currentTrack = currentTravelTrack();
  if (encounter) {
    if (encounterVisualState.backgroundAssetId) {
      removeTravelSeamForegroundLayers(scene);
      return;
    }
    removeTravelSeamForegroundLayers(scene, { carryOnly: true });
    scene.querySelectorAll(".travel-seam-foreground-layer").forEach((layer) => {
      freezeTravelSeamForegroundLayer(layer, currentTrack);
    });
    return;
  }
  if (!currentTrack || currentTrack.dataset.travelKind === "encounter") {
    removeTravelSeamForegroundLayers(scene);
    return;
  }
  const activeTile = travelActiveTile(currentTrack, expedition)
    ?? currentTrack.querySelector(".travel-visual-asset[data-travel-copy='primary']");
  if (activeTile) {
    ensureTravelSeamForeground(
      activeTile,
      isTravelPanorama(activeTile),
      travelMotionForImage(activeTile),
      expedition,
    );
  }
  syncTravelSeamForegroundLayer(currentTrack);
}

function syncTravelSeamForegroundLayer(track) {
  const layer = track?._travelSeamForegroundLayer;
  if (!layer?.isConnected) return;
  const sourceAnimation = travelImageAnimation(track);
  const sourceStyle = getComputedStyle(track);
  const distance = sourceStyle.getPropertyValue("--travel-loop-distance").trim();
  const duration = sourceStyle.getPropertyValue("--travel-loop-duration").trim();
  if (distance) layer.style.setProperty("--travel-loop-distance", distance);
  if (duration) layer.style.setProperty("--travel-loop-duration", duration);
  layer.style.animationDirection = sourceStyle.animationDirection;
  const scene = track.closest(".travel-scene");
  const shouldPlay = Boolean(scene?.classList.contains("is-moving"))
    && !scene.classList.contains("is-paused")
    && !game.expedition?.activeEncounter;
  layer.style.animationPlayState = shouldPlay ? "running" : "paused";
  const layerAnimation = travelImageAnimation(layer);
  const currentTime = Number(sourceAnimation?.currentTime);
  if (layerAnimation && Number.isFinite(currentTime)) layerAnimation.currentTime = currentTime;
}

function ensureTravelSeamForeground(image, panorama, motion, expedition = game.expedition) {
  const track = image?.closest(".travel-visual-track");
  if (!track) return;
  const scene = track.closest(".travel-scene") ?? document.querySelector("#travel-scene");
  if (expedition?.activeEncounter || track.dataset.travelKind === "encounter") {
    removeTravelSeamForegroundLayer(track);
    return;
  }
  const showBetweenLoops = track.dataset.travelShowSeamBetweenLoops !== "false";
  const forceForSceneChange = track.dataset.travelSeamForegroundForce === "true";
  const assetId = track.dataset.travelKind !== "encounter" && panorama && motion === "loop"
    && (showBetweenLoops || forceForSceneChange)
    ? resolveTravelSeamForegroundAssetId(expedition)
    : null;
  let layer = track._travelSeamForegroundLayer;
  if (!layer?.isConnected) {
    const existingForeground = track.querySelector(".travel-seam-foreground");
    if (existingForeground) {
      layer = existingForeground.closest(".travel-seam-foreground-layer, .travel-seam-foreground-carry");
    }
  }
  if (!assetId) {
    removeTravelSeamForegroundLayer(track);
    return;
  }
  const path = AssetCatalog.imagePath(assetId);
  if (!path) {
    removeTravelSeamForegroundLayer(track);
    return;
  }
  if (!scene) return;
  if (!layer?.isConnected) {
    layer = document.createElement("div");
    layer.className = "travel-seam-foreground-layer is-loop-motion is-visible";
    layer.dataset.travelSeamForegroundLayer = "true";
    layer._travelSeamForegroundTrack = track;
    markTravelPresentationNode(layer);
    scene.append(layer);
    track._travelSeamForegroundLayer = layer;
  }
  const existingForegrounds = [...layer.querySelectorAll(".travel-seam-foreground")];
  const nextForeground = existingForegrounds.find((candidate) => candidate.dataset.travelSeamCopy === "next")
    ?? existingForegrounds[0]
    ?? null;
  if (nextForeground) nextForeground.dataset.travelSeamCopy = "next";
  const requiredCopies = showBetweenLoops ? ["previous", "next"] : ["next"];
  const foregrounds = new Map();
  requiredCopies.forEach((copy) => {
    const existing = existingForegrounds.find((candidate) => (
      candidate.dataset.travelSeamCopy === copy && !foregrounds.has(copy)
    ));
    const foreground = existing ?? document.createElement("img");
    foreground.className = "travel-seam-foreground";
    foreground.dataset.travelSeamCopy = copy;
    foreground.alt = "";
    foreground.setAttribute("aria-hidden", "true");
    foreground.loading = "eager";
    foreground.decoding = "async";
    if (!existing) {
      foreground.addEventListener("load", () => {
        if (!isCurrentTravelPresentation(
          travelPresentationToken(game.expedition, travelPresentationNodeGeneration(layer) ?? currentTravelPresentationGeneration()),
          [scene, track, layer, foreground],
        )) return;
        foreground.dataset.travelAssetFailed = "false";
        foreground.hidden = false;
      });
      foreground.addEventListener("error", () => {
        if (!isCurrentTravelPresentation(
          travelPresentationToken(game.expedition, travelPresentationNodeGeneration(layer) ?? currentTravelPresentationGeneration()),
          [scene, track, layer, foreground],
        )) return;
        foreground.dataset.travelAssetFailed = "true";
        foreground.hidden = true;
      });
      layer.append(foreground);
    }
    foregrounds.set(copy, foreground);
  });
  existingForegrounds
    .filter((foreground) => ![...foregrounds.values()].includes(foreground))
    .forEach((foreground) => foreground.remove());
  track._travelSeamForeground = foregrounds.get("next") ?? foregrounds.values().next().value;
  track._travelSeamForegrounds = [...foregrounds.values()];
  layer.dataset.travelSeamForegroundForce = forceForSceneChange ? "true" : "false";
  if (!forceForSceneChange) delete layer.dataset.travelSeamForegroundExitStarted;
  foregrounds.forEach((foreground) => {
    if (foreground.dataset.travelAssetId !== assetId) {
      foreground.dataset.travelAssetId = assetId;
      foreground.dataset.travelAssetFailed = "false";
      foreground.hidden = false;
      foreground.src = path;
    } else if (foreground.dataset.travelAssetFailed !== "true") {
      foreground.hidden = false;
    }
  });
  syncTravelSeamForegroundLayer(track);
}

function ensureTravelLoopCopies(image, panorama, motion) {
  const track = image.closest(".travel-visual-track");
  if (!track) return;
  track.classList.toggle("is-loop-motion", panorama && motion === "loop");
  track.classList.toggle("is-pan-motion", panorama && motion === "pan");
  track.classList.toggle("is-standard-motion", !panorama);
  image.dataset.travelMotion = motion;
  const imageCopy = image.dataset.travelCopy === "loop" ? "loop" : "primary";
  image.dataset.travelCopy = imageCopy;
  image.dataset.travelTile = imageCopy === "primary" ? "leading" : "trailing";
  ensureTravelSeamForeground(image, panorama, motion);
  if (track.dataset.travelSnapshot === "true" && panorama && motion === "loop") {
    track.querySelectorAll(".travel-visual-asset").forEach((tile) => {
      tile.classList.add("is-panorama");
      tile.dataset.travelAspect = "panorama";
    });
  }
  const loopCopy = track.querySelector("[data-travel-copy='loop']");
  const hasRestoredLoopComposition = track.dataset.travelSnapshot === "true"
    && panorama
    && motion === "loop"
    && track.querySelector("[data-travel-copy='primary']")
    && loopCopy;
  if (hasRestoredLoopComposition) {
    ensureTravelParallaxForeground(image, panorama, motion);
    return;
  }
  if (panorama && motion === "loop" && !loopCopy) {
    const copy = image.cloneNode(false);
    copy.removeAttribute("onload");
    copy.removeAttribute("onerror");
    copy.removeAttribute("data-travel-bound");
    copy.dataset.travelCopy = "loop";
    copy.dataset.travelTile = "trailing";
    copy.hidden = false;
    copy.classList.add("is-visible");
    track.append(copy);
  } else if ((!panorama || motion !== "loop") && loopCopy) {
    loopCopy.remove();
  }
  ensureTravelParallaxForeground(image, panorama, motion);
}

function travelTileFor(track, copy) {
  return track?.querySelector(`[data-travel-copy="${copy}"]`) ?? null;
}

function travelLoopDistance(track) {
  const distance = Number.parseFloat(
    getComputedStyle(track ?? document.body).getPropertyValue("--travel-loop-distance"),
  );
  return Number.isFinite(distance) && distance > 0 ? distance : null;
}

function travelActiveTile(track, expedition) {
  if (expedition?.direction !== "returning") return travelTileFor(track, "primary");
  const distance = travelLoopDistance(track);
  const transformX = travelTransformX(track);
  const returningCopy = Number.isFinite(distance) && transformX > -distance / 2
    ? "primary"
    : "loop";
  return travelTileFor(track, returningCopy);
}

function travelUpcomingTile(track, expedition) {
  if (expedition?.direction !== "returning") return travelTileFor(track, "loop");
  const active = travelActiveTile(track, expedition);
  return travelTileFor(track, active?.dataset.travelCopy === "primary" ? "loop" : "primary");
}

function travelTileIsOffscreen(tile, viewport, returning) {
  if (!tile || !viewport) return false;
  const box = tile.getBoundingClientRect();
  const tolerance = 3;
  return returning
    ? box.left >= viewport.right - tolerance
    : box.right <= viewport.left + tolerance;
}

function configureTravelTile(tile, assetId, motion, copy, panorama) {
  if (!tile || !assetId) return;
  tile.className = "asset-image travel-visual-asset is-visible";
  tile.dataset.travelCopy = copy;
  tile.dataset.travelTile = copy === "primary" ? "leading" : "trailing";
  tile.dataset.travelAssetId = assetId;
  tile.dataset.travelMotion = normalizeTravelMotion(motion);
  tile.dataset.travelAspect = panorama ? "panorama" : "standard";
  tile.classList.toggle("is-panorama", panorama);
  tile.hidden = false;
}

function setTravelTileImage(tile, source, assetId, motion, copy, travelParallaxAssetId = "") {
  if (!tile || !source || !assetId) return;
  const sourcePath = source.currentSrc || source.src;
  if (!sourcePath) return;
  const panorama = isTravelPanorama(source);
  tile.src = sourcePath;
  configureTravelTile(tile, assetId, motion, copy, panorama);
  tile.dataset.travelParallaxAssetId = travelParallaxAssetId;
}

function resetTravelPendingTile(expedition) {
  const track = currentTravelTrack();
  if (!track || track.dataset.travelKind === "encounter") return;
  const activeTile = travelActiveTile(track, expedition);
  const upcomingTile = travelUpcomingTile(track, expedition);
  const activeAssetId = track.dataset.travelAssetId || activeTile?.dataset.travelAssetId;
  if (!activeTile || !upcomingTile || !activeAssetId) return;
  setTravelTileImage(
    upcomingTile,
    activeTile,
    activeAssetId,
    track.dataset.travelMotion,
    upcomingTile.dataset.travelCopy || (expedition?.direction === "returning" ? "primary" : "loop"),
    track.dataset.travelParallaxAssetId || "",
  );
  syncTravelParallaxLayer(track);
}

function installTravelPendingTile(expedition, pending) {
  if (!pending?.tileMode) return;
  const state = travelScenePresentationFor(expedition);
  const track = currentTravelTrack();
  if (!state || state.pending !== pending || !track || track.dataset.travelKind === "encounter") return;
  const upcomingTile = travelUpcomingTile(track, expedition);
  const preloaded = preloadTravelAsset(pending.assetId);
  const preloadedParallax = pending.travelParallaxAssetId
    ? preloadTravelAsset(pending.travelParallaxAssetId)
    : null;
  if (!upcomingTile || !preloaded) return;
  if (upcomingTile.dataset.travelAssetId === pending.assetId
    && (upcomingTile.dataset.travelParallaxAssetId || "") === (pending.travelParallaxAssetId || "")) {
    pending.tileReady = true;
    return;
  }
  if (pending.tileReady) {
    pending.tileReady = false;
    pending.tileInstallRequested = false;
  }
  if (pending.tileInstallRequested) return;
  pending.tileInstallRequested = true;
  const scene = document.querySelector("#travel-scene");
  const token = travelPresentationToken(expedition, state.generation ?? currentTravelPresentationGeneration());
  const install = () => {
    if (!isCurrentTravelPresentation(token, [scene, track, upcomingTile])
      || state.pending !== pending || !preloaded.naturalWidth
      || (preloadedParallax && !preloadedParallax.complete)) return;
    const replacement = document.createElement("img");
    replacement.className = "asset-image travel-visual-asset is-visible";
    replacement.alt = upcomingTile.alt;
    replacement.loading = "eager";
    replacement.decoding = "async";
    markTravelPresentationNode(replacement, token.generation);
    setTravelTileImage(
      replacement,
      preloaded,
      pending.assetId,
      pending.motion,
      upcomingTile.dataset.travelCopy || (expedition?.direction === "returning" ? "primary" : "loop"),
      pending.travelParallaxAssetId || "",
    );
    upcomingTile.replaceWith(replacement);
    pending.tileReady = true;
    const activeTile = travelActiveTile(track, expedition);
    if (scene && activeTile) updateTravelImagePresentation(scene, activeTile);
  };
  const fail = () => {
    if (!isCurrentTravelPresentation(token, [scene, track, upcomingTile]) || state.pending !== pending) return;
    pending.tileInstallRequested = false;
    state.pending = null;
    state.failedAssetId = pending.assetId;
  };
  if (preloaded.naturalWidth > 0) {
    if (!preloadedParallax || preloadedParallax.complete) install();
    else {
      preloadedParallax.addEventListener("load", install, { once: true });
      preloadedParallax.addEventListener("error", install, { once: true });
    }
  } else if (preloaded.complete) {
    fail();
  } else {
    preloaded.addEventListener("load", install, { once: true });
    preloaded.addEventListener("error", fail, { once: true });
    if (preloadedParallax && !preloadedParallax.complete) {
      preloadedParallax.addEventListener("load", install, { once: true });
      preloadedParallax.addEventListener("error", install, { once: true });
    }
  }
}

function releaseTravelSeamForegroundAfterSceneChange(target, expedition) {
  const isLayer = target?.classList?.contains("travel-seam-foreground-layer")
    || target?.classList?.contains("travel-seam-foreground-carry");
  const layer = isLayer ? target : target?._travelSeamForegroundLayer;
  const track = isLayer ? layer?._travelSeamForegroundTrack : target;
  const token = travelPresentationToken(
    expedition,
    travelPresentationNodeGeneration(layer ?? track) ?? currentTravelPresentationGeneration(),
  );
  const isCarry = layer?.dataset.travelSeamForegroundCarry === "true";
  const force = track?.dataset.travelSeamForegroundForce === "true"
    || layer?.dataset.travelSeamForegroundForce === "true";
  if (!layer?.isConnected || (!isCarry && !force) || !isCurrentTravelPresentation(token, [layer, track])) return;
  const foregrounds = [...layer.querySelectorAll(".travel-seam-foreground")];
  const art = document.querySelector("#travel-art");
  if (!foregrounds.length || !art) return;
  if (foregrounds.some((foreground) => !foreground.complete || foreground.naturalWidth <= 0)) {
    queueTravelPresentationFrame(
      () => releaseTravelSeamForegroundAfterSceneChange(layer, expedition),
      token,
      [layer, track],
    );
    return;
  }
  if (foregrounds.every((foreground) => foreground.hidden)) {
    if (isCarry) layer.remove();
    else {
      delete track?.dataset.travelSeamForegroundForce;
      removeTravelSeamForegroundLayer(track);
    }
    return;
  }
  const frame = art.getBoundingClientRect();
  const bounds = foregrounds.map((foreground) => foreground.getBoundingClientRect());
  if (!isCarry && force && !layer.dataset.travelSeamForegroundExitStarted) {
    const enteringFromOutside = expedition?.direction === "returning"
      ? bounds.every((seam) => seam.right <= frame.left)
      : bounds.every((seam) => seam.left >= frame.right);
    if (enteringFromOutside) {
      queueTravelPresentationFrame(
        () => releaseTravelSeamForegroundAfterSceneChange(layer, expedition),
        token,
        [layer, track],
      );
      return;
    }
  }
  const offscreen = bounds.every((seam) => (
    seam.right <= frame.left
      || seam.left >= frame.right
      || seam.bottom <= frame.top
      || seam.top >= frame.bottom
  ));
  if (offscreen) {
    if (isCarry) {
      layer.remove();
      return;
    }
    delete track?.dataset.travelSeamForegroundForce;
    removeTravelSeamForegroundLayer(track);
    const activeTile = travelActiveTile(track, expedition);
    if (activeTile) {
      ensureTravelSeamForeground(activeTile, isTravelPanorama(activeTile), travelMotionForImage(activeTile), expedition);
    }
    return;
  }
  queueTravelPresentationFrame(
    () => releaseTravelSeamForegroundAfterSceneChange(layer, expedition),
    token,
    [layer, track],
  );
}

function recycleTravelLoopScene(expedition, scene, pending) {
  const state = travelScenePresentationFor(expedition);
  const track = currentTravelTrack();
  if (!state || !track || track.dataset.travelKind === "encounter") return false;
  const upcomingTile = travelUpcomingTile(track, expedition);
  const activeTile = travelActiveTile(track, expedition);
  if (!upcomingTile
    || !activeTile
    || activeTile.dataset.travelAssetId !== pending.outgoingAssetId
    || upcomingTile.dataset.travelAssetId !== pending.assetId) return false;
  const returning = expedition?.direction === "returning";
  const changedBackground = pending.outgoingAssetId !== pending.assetId;
  removeTravelParallaxLayer(track);
  if (track._travelSeamForegroundLayer?.isConnected
    && (changedBackground || pending.showSeamForegroundBetweenLoops !== false)) {
    carryTravelSeamForeground(track, scene);
  }
  let presentationImage;
  if (returning) {
    const replacement = upcomingTile.cloneNode(false);
    replacement.removeAttribute("onload");
    replacement.removeAttribute("onerror");
    replacement.removeAttribute("data-travel-bound");
    configureTravelTile(replacement, pending.assetId, pending.motion, "loop", isTravelPanorama(upcomingTile));
    replacement.dataset.travelParallaxAssetId = pending.travelParallaxAssetId || "";
    activeTile.replaceWith(replacement);
    presentationImage = upcomingTile;
  } else {
    const replacement = upcomingTile;
    configureTravelTile(replacement, pending.assetId, pending.motion, "primary", isTravelPanorama(replacement));
    replacement.dataset.travelParallaxAssetId = pending.travelParallaxAssetId || "";
    activeTile.replaceWith(replacement);
    const copy = replacement.cloneNode(false);
    copy.removeAttribute("onload");
    copy.removeAttribute("onerror");
    copy.removeAttribute("data-travel-bound");
    configureTravelTile(copy, pending.assetId, pending.motion, "loop", isTravelPanorama(replacement));
    copy.dataset.travelParallaxAssetId = pending.travelParallaxAssetId || "";
    track.append(copy);
    presentationImage = replacement;
  }
  track.dataset.travelAssetId = pending.assetId;
  track.dataset.travelMotion = normalizeTravelMotion(pending.motion);
  track.dataset.travelParallaxAssetId = pending.travelParallaxAssetId || "";
  track.dataset.travelShowSeamBetweenLoops = pending.showSeamForegroundBetweenLoops === false ? "false" : "true";
  if (changedBackground && pending.showSeamForegroundBetweenLoops === false) {
    track.dataset.travelSeamForegroundForce = "true";
  } else {
    delete track.dataset.travelSeamForegroundForce;
  }
  track.dataset.travelSceneKey = pending.sceneKey ?? "";
  const art = document.querySelector("#travel-art");
  if (art) {
    art.dataset.travelAssetId = pending.assetId;
    art.dataset.travelMotion = normalizeTravelMotion(pending.motion);
  }
  if (scene) {
    scene.classList.remove("asset-load-failed");
    scene.classList.add("asset-image-active");
    scene.dataset.travelAssetId = pending.assetId;
    scene.dataset.travelMotion = normalizeTravelMotion(pending.motion);
    scene.dataset.travelAssetFailedId = "";
  }
  const activeTileDistance = Number(pending.tileDistance);
  if (Number.isFinite(activeTileDistance)) {
    state.activeTileDistance = activeTileDistance;
  }
  const activeAnimation = travelImageAnimation(presentationImage);
  const activeAnimationCycle = travelAnimationCycle(activeAnimation);
  if (Number.isFinite(activeAnimationCycle)) {
    state.activeAnimationCycle = activeAnimationCycle;
  }
  setActiveTravelPresentation(expedition, pending);
  const transition = state.transition;
  clearTravelTransitionTimers(transition);
  state.pending = null;
  state.transition = null;
  document.querySelector("#travel-transition-art")?.classList.remove("is-active");
  if (scene && presentationImage) updateTravelImagePresentation(scene, presentationImage);
  if (changedBackground && track.dataset.travelSeamForegroundForce === "true") {
    releaseTravelSeamForegroundAfterSceneChange(track, expedition);
  }
  return true;
}

function updateTravelImagePresentation(scene, image, retryCount = 0) {
  const token = travelPresentationToken(
    game.expedition,
    travelPresentationNodeGeneration(image ?? scene) ?? currentTravelPresentationGeneration(),
  );
  if (!isCurrentTravelPresentation(token, [scene, image])) return;
  const art = image.closest("#travel-art");
  const track = image.closest(".travel-visual-track");
  const panorama = isTravelPanorama(image);
  const motion = travelMotionForImage(image);
  image.classList.toggle("is-panorama", panorama);
  image.dataset.travelAspect = panorama ? "panorama" : "standard";
  if (track) track.dataset.travelMotion = motion;
  ensureTravelLoopCopies(image, panorama, motion);
  scene.classList.toggle("has-travel-panorama", panorama);
  if (!panorama) {
    image.style.removeProperty("--travel-pan-range");
    track?.style.removeProperty("--travel-loop-distance");
    track?.style.removeProperty("--travel-loop-duration");
    removeTravelParallaxLayer(track);
    return;
  }
  const frameWidth = art?.clientWidth ?? scene.clientWidth;
  const renderedWidth = image.offsetWidth;
  if (frameWidth <= 0 || renderedWidth <= 0) {
    if (retryCount < 4) {
      queueTravelPresentationFrame(
        () => updateTravelImagePresentation(scene, image, retryCount + 1),
        token,
        [scene, image],
      );
    }
    return;
  }
  const range = Math.max(0, renderedWidth - frameWidth);
  image.style.setProperty("--travel-pan-range", `${range}px`);
  track?.style.setProperty("--travel-loop-distance", `${renderedWidth}px`);
  const loopSpeed = Number(scene.style.getPropertyValue("--travel-loop-speed")) || 72;
  track?.style.setProperty("--travel-loop-duration", `${Math.max(1, renderedWidth / loopSpeed)}s`);
  syncTravelSeamForegroundLayer(track);
  syncTravelParallaxLayer(track);
}

function travelImageAnimation(image) {
  const targets = [image?.closest(".travel-visual-track"), image].filter(Boolean);
  for (const target of targets) {
    const animations = target.getAnimations?.() ?? [];
    const animation = animations.find((candidate) => (
      candidate.animationName === "travel-panorama-loop"
      || candidate.animationName === "travel-panorama-pan"
    ));
    if (animation) return animation;
  }
  return null;
}

function travelAnimationCycle(animation) {
  const timing = animation?.effect?.getComputedTiming?.();
  const currentIteration = Number(timing?.currentIteration);
  if (Number.isFinite(currentIteration)) return currentIteration;
  const duration = Number(timing?.duration);
  const currentTime = Number(animation?.currentTime);
  return Number.isFinite(duration) && duration > 0 && Number.isFinite(currentTime)
    ? Math.floor(currentTime / duration)
    : null;
}

function travelScenePresentationFor(expedition = game.expedition) {
  if (!expedition) return null;
  const expeditionId = expedition.expeditionId ?? expedition.id ?? "";
  const current = game.travelScenePresentation;
  if (!current || current.expedition !== expedition || current.expeditionId !== expeditionId) {
    game.travelScenePresentation = {
      expedition,
      expeditionId,
      generation: currentTravelPresentationGeneration(),
      activeEncounterId: null,
      activeAssetId: null,
      activeTravelParallaxAssetId: "",
      activeMotion: null,
      activeShowSeamForegroundBetweenLoops: true,
      activeSceneKey: null,
      activeTileDistance: null,
      activeAnimationCycle: null,
      pending: null,
      transition: null,
      sceneAssetLoad: null,
      failedAssetId: null,
    };
  } else if (current.generation !== currentTravelPresentationGeneration()) {
    current.generation = currentTravelPresentationGeneration();
    current.pending = null;
    current.transition = null;
    current.sceneAssetLoad = null;
  }
  return game.travelScenePresentation;
}

function currentTravelTrack() {
  const tracks = [...document.querySelectorAll("#travel-art .travel-visual-track[data-travel-layer='current']")];
  return tracks.length === 1 ? tracks[0] : null;
}

function currentTravelPresentation() {
  const track = currentTravelTrack();
  if (!track?.dataset.travelAssetId) return null;
  return {
    assetId: track.dataset.travelAssetId,
    travelParallaxAssetId: track.dataset.travelParallaxAssetId || "",
    motion: normalizeTravelMotion(track.dataset.travelMotion),
    showSeamForegroundBetweenLoops: track.dataset.travelShowSeamBetweenLoops !== "false",
    sceneKey: track.dataset.travelSceneKey ?? "",
    kind: track.dataset.travelKind ?? "travel",
  };
}

function activeTravelPresentation(state) {
  if (!state?.activeAssetId) return null;
  return {
    assetId: state.activeAssetId,
    travelParallaxAssetId: state.activeTravelParallaxAssetId || "",
    motion: normalizeTravelMotion(state.activeMotion),
    showSeamForegroundBetweenLoops: state.activeShowSeamForegroundBetweenLoops !== false,
    sceneKey: state.activeSceneKey ?? "",
    kind: "travel",
  };
}

function setActiveTravelPresentation(expedition, presentation) {
  const state = travelScenePresentationFor(expedition);
  if (!state || !presentation?.assetId) return;
  state.failedAssetId = null;
  state.activeAssetId = presentation.assetId;
  state.activeTravelParallaxAssetId = presentation.travelParallaxAssetId ?? "";
  state.activeMotion = normalizeTravelMotion(presentation.motion);
  state.activeShowSeamForegroundBetweenLoops = presentation.showSeamForegroundBetweenLoops !== false;
  state.activeSceneKey = presentation.sceneKey ?? "";
  if (!Number.isFinite(state.activeTileDistance)) {
    state.activeTileDistance = Math.max(0, Number(expedition?.distance) || 0);
  }
}

function preloadTravelAsset(assetId) {
  const path = AssetCatalog.imagePath(assetId);
  if (!path) return null;
  if (travelScenePreloadCache.has(assetId)) return travelScenePreloadCache.get(assetId);
  const image = new Image();
  image.decoding = "async";
  let settled = false;
  image._travelSceneReady = false;
  image._travelSceneFailed = false;
  image._travelSceneReadyPromise = new Promise((resolve) => {
    const settle = async (failed = false) => {
      if (settled) return;
      if (failed || !image.naturalWidth || !image.naturalHeight) {
        settled = true;
        image._travelSceneFailed = true;
        resolve(null);
        return;
      }
      if (typeof image.decode === "function") {
        try {
          await image.decode();
        } catch (error) {
          // The image remains drawable when decode rejects after load.
        }
      }
      if (settled) return;
      settled = true;
      image._travelSceneReady = true;
      resolve(image);
    };
    image.addEventListener("load", () => settle(), { once: true });
    image.addEventListener("error", () => settle(true), { once: true });
  });
  image.src = path;
  travelScenePreloadCache.set(assetId, image);
  return image;
}

function preloadTravelSceneAsset(assetId) {
  const image = preloadTravelAsset(assetId);
  return image?._travelSceneReadyPromise ?? Promise.resolve(null);
}

function travelSceneAssetReady(assetId) {
  const image = travelScenePreloadCache.get(assetId);
  return Boolean(image?._travelSceneReady && image.naturalWidth > 0 && image.naturalHeight > 0);
}

function travelSceneAssetFailed(assetId) {
  return Boolean(travelScenePreloadCache.get(assetId)?._travelSceneFailed);
}

function travelPresentationAssetsReady(presentation) {
  return Boolean(
    presentation?.assetId
    && travelSceneAssetReady(presentation.assetId)
    && (!presentation.travelParallaxAssetId
      || travelSceneAssetReady(presentation.travelParallaxAssetId)
      || travelSceneAssetFailed(presentation.travelParallaxAssetId)),
  );
}

function waitForTravelPresentationAssets(expedition, presentation) {
  const state = travelScenePresentationFor(expedition);
  if (!state || !presentation?.assetId) return Promise.resolve(false);
  if (travelPresentationAssetsReady(presentation)) return Promise.resolve(true);
  const key = `${presentation.assetId}|${presentation.travelParallaxAssetId ?? ""}`;
  if (state.sceneAssetLoad?.key === key) return state.sceneAssetLoad.promise;
  const request = {
    key,
    generation: state.generation ?? currentTravelPresentationGeneration(),
    expedition,
    assetId: presentation.assetId,
    travelParallaxAssetId: presentation.travelParallaxAssetId ?? "",
    promise: null,
  };
  const loads = [
    preloadTravelSceneAsset(request.assetId),
    request.travelParallaxAssetId ? preloadTravelSceneAsset(request.travelParallaxAssetId) : Promise.resolve(null),
  ];
  request.promise = Promise.allSettled(loads).then(() => {
    if (!isCurrentTravelPresentation(
      travelPresentationToken(request.expedition, request.generation),
    ) || state.sceneAssetLoad !== request) return false;
    state.sceneAssetLoad = null;
    if (!travelSceneAssetReady(request.assetId)) {
      state.failedAssetId = request.assetId;
      if (state.pending?.assetId === request.assetId) state.pending = null;
      return false;
    }
    return travelPresentationAssetsReady(request);
  });
  state.sceneAssetLoad = request;
  return request.promise;
}

function clearTravelTransitionTimers(transition) {
  if (!transition) return;
  if (transition.overlayTimer) window.clearTimeout(transition.overlayTimer);
  if (transition.crossfadeTimer) window.clearTimeout(transition.crossfadeTimer);
  if (transition.finishTimer) window.clearTimeout(transition.finishTimer);
  if (transition.outgoingRemovalTimer) window.clearTimeout(transition.outgoingRemovalTimer);
}

function cancelTravelSceneTransition(expedition, preservePending = false) {
  const state = travelScenePresentationFor(expedition);
  const transition = state?.transition;
  if (!state || !transition) return;
  if (transition.tileMode || state.pending?.tileMode) resetTravelPendingTile(expedition);
  if (preservePending && !state.pending) {
    state.pending = {
      generation: transition.generation ?? state.generation ?? currentTravelPresentationGeneration(),
      expedition,
      assetId: transition.assetId,
      travelParallaxAssetId: transition.travelParallaxAssetId ?? "",
      motion: transition.motion,
      sceneKey: transition.sceneKey ?? "",
      showSeamForegroundBetweenLoops: transition.showSeamForegroundBetweenLoops !== false,
      tileMode: Boolean(transition.tileMode),
      tileReady: false,
      tileInstallRequested: false,
      outgoingAssetId: transition.outgoingAssetId ?? state.activeAssetId ?? "",
      seamCrossed: Boolean(transition.seamCrossed),
      elapsedMs: 0,
      lastSampleAt: performance.now(),
    };
  }
  clearTravelTransitionTimers(transition);
  state.transition = null;
  if (!preservePending) state.pending = null;
  const nextTrack = document.querySelector("#travel-art .travel-visual-track[data-travel-layer='next']");
  if (nextTrack) {
    removeTravelSeamForegroundLayer(nextTrack);
    removeTravelParallaxLayer(nextTrack);
    nextTrack.remove();
  }
  document.querySelector("#travel-transition-art")?.classList.remove("is-active");
}

function captureTravelVisualState(expedition = game.expedition) {
  const track = currentTravelTrack();
  const state = travelScenePresentationFor(expedition);
  const images = [...(track?.querySelectorAll(".travel-visual-asset.is-visible:not([hidden])") ?? [])];
  const image = images.find((candidate) => candidate.dataset.travelAssetId === state?.activeAssetId)
    ?? images[0];
  if (!image) return null;
  const animation = travelImageAnimation(track ?? image);
  const currentTime = Number(animation?.currentTime);
  const tiles = images.map((tile, index) => ({
    assetId: tile.dataset.travelAssetId || "",
    travelParallaxAssetId: tile.dataset.travelParallaxAssetId || track?.dataset.travelParallaxAssetId || "",
    copy: tile.dataset.travelCopy === "loop" || index > 0 ? "loop" : "primary",
    tile: tile.dataset.travelTile || (index > 0 ? "trailing" : "leading"),
  })).filter((tile) => tile.assetId);
  const trackMotion = normalizeTravelMotion(track?.dataset.travelMotion ?? travelMotionForImage(image));
  return {
    expedition,
    expeditionId: expedition?.expeditionId ?? expedition?.id ?? "",
    assetId: state?.activeAssetId || track?.dataset.travelAssetId || image.dataset.travelAssetId || "",
    travelParallaxAssetId: state?.activeTravelParallaxAssetId || track?.dataset.travelParallaxAssetId || image.dataset.travelParallaxAssetId || "",
    motion: normalizeTravelMotion(state?.activeMotion ?? travelMotionForImage(image)),
    currentTime: Number.isFinite(currentTime) ? currentTime : null,
    trackAssetId: track?.dataset.travelAssetId || image.dataset.travelAssetId || "",
    trackTravelParallaxAssetId: track?.dataset.travelParallaxAssetId || image.dataset.travelParallaxAssetId || "",
    trackMotion,
    showSeamForegroundBetweenLoops: track?.dataset.travelShowSeamBetweenLoops !== "false",
    trackSceneKey: track?.dataset.travelSceneKey ?? "",
    activeSceneKey: state?.activeSceneKey ?? "",
    tiles,
  };
}

function applyTravelVisualSnapshot(snapshot) {
  if (!snapshot || snapshot.currentTime === null) return;
  const animation = travelImageAnimation(currentTravelTrack());
  if (animation) animation.currentTime = snapshot.currentTime;
}

function restoreTravelVisualState(image) {
  const saved = game.travelVisualState;
  const expedition = game.expedition;
  const encounter = expedition?.activeEncounter
    ? EncounterManager.definitionFor(expedition)
    : null;
  const hasDedicatedEncounterArtwork = Boolean(
    resolveEncounterVisualState(encounter, expedition?.activeEncounter).backgroundAssetId,
  );
  const isEncounterTravelFallback = Boolean(expedition?.activeEncounter)
    && !hasDedicatedEncounterArtwork
    && saved?.assetId === image?.dataset.travelAssetId
    && saved?.motion === travelMotionForImage(image);
  if (!saved || (expedition?.activeEncounter && !isEncounterTravelFallback)) return;
  if (saved.expedition !== expedition
    || saved.expeditionId !== (expedition?.expeditionId ?? expedition?.id ?? "")
    || saved.assetId !== image?.dataset.travelAssetId
    || saved.travelParallaxAssetId !== (image?.dataset.travelParallaxAssetId || "")
    || saved.motion !== travelMotionForImage(image)) {
    if (saved.expedition === expedition) game.travelVisualState = null;
    return;
  }
  const animation = travelImageAnimation(image);
  if (animation && saved.currentTime !== null) animation.currentTime = saved.currentTime;
  const token = travelPresentationToken(
    expedition,
    travelPresentationNodeGeneration(image) ?? currentTravelPresentationGeneration(),
  );
  queueTravelPresentationFrame(() => {
    if (game.travelVisualState !== saved) return;
    const restoredAnimation = travelImageAnimation(image);
    if (restoredAnimation && saved.currentTime !== null) restoredAnimation.currentTime = saved.currentTime;
    if (!isEncounterTravelFallback) game.travelVisualState = null;
  }, token, [image]);
}

function markTravelImageActive(scene, image) {
  const token = travelPresentationToken(
    game.expedition,
    travelPresentationNodeGeneration(image ?? scene) ?? travelPresentationNodeGeneration(scene) ?? currentTravelPresentationGeneration(),
  );
  if (!isCurrentTravelPresentation(token, [scene, image])) return;
  const art = image.closest("#travel-art");
  const track = image.closest(".travel-visual-track");
  const motion = travelMotionForImage(image);
  const activeTile = travelActiveTile(track, game.expedition);
  const activeAssetId = activeTile?.dataset.travelAssetId || image.dataset.travelAssetId || "";
  image.hidden = false;
  image.classList.remove("is-fading-out");
  image.classList.add("is-visible");
  track?.classList.remove("is-fading-out");
  track?.classList.add("is-visible");
  scene.classList.remove("asset-load-failed");
  scene.classList.add("asset-image-active");
  scene.dataset.travelAssetId = activeAssetId;
  scene.dataset.travelMotion = motion;
  scene.dataset.travelAssetFailedId = "";
  if (art) {
    art.dataset.travelAssetId = activeAssetId;
    art.dataset.travelMotion = motion;
    art.dataset.travelAssetFailedId = "";
  }
  const presentationImage = activeTile?.naturalWidth > 0 ? activeTile : image;
  updateTravelImagePresentation(scene, presentationImage);
  const state = travelScenePresentationFor(game.expedition);
  if (track?.dataset.travelKind !== "encounter" && state?.pending?.tileMode) {
    installTravelPendingTile(game.expedition, state.pending);
  }
  restoreTravelVisualState(activeTile ?? image);
}

function markTravelImageFailed(scene, image) {
  const token = travelPresentationToken(
    game.expedition,
    travelPresentationNodeGeneration(image ?? scene) ?? travelPresentationNodeGeneration(scene) ?? currentTravelPresentationGeneration(),
  );
  if (!isCurrentTravelPresentation(token, [scene, image])) return;
  const art = image?.closest("#travel-art") ?? scene.querySelector("#travel-art");
  const failedTrack = image?.closest(".travel-visual-track");
  const failedId = image?.dataset.travelAssetId || scene.dataset.travelDesiredAssetId || "";
  const currentTrack = scene.querySelector(".travel-visual-track[data-travel-layer='current']");
  if (failedTrack?.dataset.travelLayer === "next" && currentTrack && failedTrack !== currentTrack) {
    failedTrack.remove();
    const state = travelScenePresentationFor(game.expedition);
    if (state) {
      clearTravelTransitionTimers(state.transition);
      state.transition = null;
      state.pending = null;
      state.failedAssetId = failedId;
    }
    art?.querySelector("#travel-transition-art")?.classList.remove("is-active");
    return;
  }
  scene.querySelectorAll(".travel-visual-asset").forEach((candidate) => {
    candidate.hidden = true;
    candidate.classList.remove("is-visible", "is-fading-out");
  });
  scene.querySelectorAll(".travel-visual-track").forEach((track) => {
    track.classList.remove("is-visible", "is-fading-out");
  });
  scene.classList.remove("asset-image-active");
  scene.classList.remove("has-travel-panorama");
  scene.classList.add("asset-load-failed");
  scene.dataset.travelAssetId = "";
  scene.dataset.travelMotion = "";
  scene.dataset.travelAssetFailedId = failedId;
  if (art) {
    art.dataset.travelAssetId = "";
    art.dataset.travelMotion = "";
    art.dataset.travelAssetFailedId = failedId;
    art.querySelector("[data-travel-layer='next']")?.remove();
  }
  scene.querySelectorAll(".travel-seam-foreground-layer").forEach((layer) => layer.remove());
  scene.querySelectorAll(".travel-parallax-layer").forEach((layer) => layer.remove());
}

function travelTransformX(element) {
  const transform = getComputedStyle(element).transform;
  if (!transform || transform === "none") return 0;
  const matrix3d = transform.match(/^matrix3d\((.+)\)$/);
  if (matrix3d) return Number(matrix3d[1].split(",")[12]) || 0;
  const matrix = transform.match(/^matrix\((.+)\)$/);
  return matrix ? Number(matrix[1].split(",")[4]) || 0 : 0;
}

function startTravelSeamForegroundExit(layer, track, expedition) {
  const foregrounds = [...(layer?.querySelectorAll(".travel-seam-foreground") ?? [])];
  if (!layer?.isConnected || !foregrounds.length
    || foregrounds.some((foreground) => !foreground.complete || foreground.naturalWidth <= 0)) return;
  const currentX = travelTransformX(layer);
  const frame = document.querySelector("#travel-art")?.getBoundingClientRect();
  const sourceStyle = getComputedStyle(track ?? layer);
  const loopDistance = Number.parseFloat(sourceStyle.getPropertyValue("--travel-loop-distance"));
  const durationValue = sourceStyle.getPropertyValue("--travel-loop-duration").trim();
  const durationNumber = Number.parseFloat(durationValue);
  const loopDurationMs = durationValue.endsWith("ms") ? durationNumber : durationNumber * 1000;
  const direction = sourceStyle.animationDirection === "reverse"
    || expedition?.direction === "returning"
    ? 1
    : -1;
  const foregroundBoxes = foregrounds.map((foreground) => foreground.getBoundingClientRect());
  const left = Math.min(...foregroundBoxes.map((box) => box.left));
  const right = Math.max(...foregroundBoxes.map((box) => box.right));
  const exitDelta = direction < 0
    ? (frame?.left ?? 0) - right - 1
    : (frame?.right ?? left) - left + 1;
  const exitDistance = Math.max(1, Math.abs(exitDelta));
  const speed = Number.isFinite(loopDistance) && loopDistance > 0
    && Number.isFinite(loopDurationMs) && loopDurationMs > 0
    ? loopDistance / loopDurationMs
    : 0.08;
  const exitDuration = Math.max(180, exitDistance / speed);
  layer.style.setProperty("--travel-seam-exit-start", `translate3d(${currentX}px, 0, 0)`);
  layer.style.setProperty(
    "--travel-seam-exit-end",
    `translate3d(${currentX + (direction < 0 ? -exitDistance : exitDistance)}px, 0, 0)`,
  );
  layer.style.animation = `travel-seam-foreground-exit ${exitDuration}ms linear 1 both`;
  layer.style.animationPlayState = "running";
  layer.dataset.travelSeamForegroundExitStarted = "true";
}

function carryTravelSeamForeground(track, scene) {
  if (game.expedition?.activeEncounter) {
    removeTravelSeamForegroundLayers(scene);
    return null;
  }
  const existingLayer = track?._travelSeamForegroundLayer;
  if (existingLayer?.isConnected && scene) {
    existingLayer.classList.add("travel-seam-foreground-carry");
    existingLayer.dataset.travelSeamForegroundCarry = "true";
    delete existingLayer.dataset.travelSeamForegroundForce;
    track._travelSeamForegroundLayer = null;
    track._travelSeamForeground = null;
    track._travelSeamForegrounds = null;
    startTravelSeamForegroundExit(existingLayer, track, game.expedition);
    const token = travelPresentationToken(
      game.expedition,
      travelPresentationNodeGeneration(existingLayer) ?? currentTravelPresentationGeneration(),
    );
    queueTravelPresentationFrame(
      () => releaseTravelSeamForegroundAfterSceneChange(existingLayer, game.expedition),
      token,
      [scene, existingLayer, track],
    );
    return existingLayer;
  }
  const foregrounds = [...(track?.querySelectorAll(".travel-seam-foreground") ?? [])];
  if (!foregrounds.length || !scene) return null;
  const sourceAnimation = travelImageAnimation(track);
  const sourceStyle = getComputedStyle(track);
  const carry = document.createElement("div");
  carry.className = "travel-seam-foreground-layer travel-seam-foreground-carry is-loop-motion is-visible";
  carry.dataset.travelSeamForegroundCarry = "true";
  carry._travelSeamForegroundTrack = track;
  markTravelPresentationNode(carry, travelPresentationNodeGeneration(track) ?? currentTravelPresentationGeneration());
  carry.style.setProperty("--travel-loop-distance", sourceStyle.getPropertyValue("--travel-loop-distance"));
  carry.style.setProperty("--travel-loop-duration", sourceStyle.getPropertyValue("--travel-loop-duration"));
  carry.style.animationDirection = sourceStyle.animationDirection;
  carry.style.animationPlayState = sourceStyle.animationPlayState;
  carry.append(...foregrounds);
  track._travelSeamForegrounds = null;
  scene.append(carry);
  const carryAnimation = travelImageAnimation(carry);
  if (carryAnimation && sourceAnimation) {
    carryAnimation.currentTime = sourceAnimation.currentTime;
  }
  startTravelSeamForegroundExit(carry, track, game.expedition);
  const token = travelPresentationToken(
    game.expedition,
    travelPresentationNodeGeneration(carry) ?? currentTravelPresentationGeneration(),
  );
  queueTravelPresentationFrame(
    () => releaseTravelSeamForegroundAfterSceneChange(carry, game.expedition),
    token,
    [scene, carry, track],
  );
  return carry;
}

function bindTravelImage(scene, image) {
  if (!scene || !image || image.dataset.travelBound === "true") return;
  image.dataset.travelBound = "true";
  const boundExpedition = game.expedition;
  const boundGeneration = travelPresentationNodeGeneration(image)
    ?? travelPresentationNodeGeneration(scene)
    ?? currentTravelPresentationGeneration();
  const token = travelPresentationToken(boundExpedition, boundGeneration);
  image.addEventListener("load", () => {
    const track = image.closest(".travel-visual-track");
    const activate = () => {
      const presentationIsCurrent = isCurrentTravelPresentation(token, [scene, image, track]);
      if (!presentationIsCurrent
        || (track?.dataset.travelLayer === "next"
        && image.dataset.travelAssetId !== scene.dataset.travelDesiredAssetId)) {
        if (track?.dataset.travelLayer === "next") track.remove();
        return;
      }
      const currentTracks = [...scene.querySelectorAll(".travel-visual-track[data-travel-layer='current']")];
      const oldTracks = currentTracks.filter((candidate) => candidate !== track);
      const oldTrack = oldTracks[0] ?? null;
      const isPromotion = Boolean(track && oldTracks.length);
      if (isPromotion) {
        if (game.expedition?.activeEncounter) removeTravelSeamForegroundLayers(scene);
        else carryTravelSeamForeground(oldTrack, scene);
        oldTracks.forEach((candidate) => {
          candidate.dataset.travelLayer = "outgoing";
          candidate.classList.add("is-fading-out");
          if (candidate !== oldTrack) {
            removeTravelSeamForegroundLayer(candidate);
            removeTravelParallaxLayer(candidate);
          }
        });
        track.dataset.travelLayer = "current";
      }
      markTravelImageActive(scene, image);
      syncTravelSeamForegroundPresentation(scene, game.expedition, game.expedition?.activeEncounter);
      scene.dataset.travelAssetId = image.dataset.travelAssetId;
      scene.dataset.travelMotion = travelMotionForImage(image);
      if (isPromotion || track?.dataset.travelLayer === "next") {
        track.dataset.travelLayer = "current";
        const state = travelScenePresentationFor(game.expedition);
        if (track.dataset.travelKind !== "encounter") {
          setActiveTravelPresentation(game.expedition, {
            assetId: image.dataset.travelAssetId,
            travelParallaxAssetId: track.dataset.travelParallaxAssetId || image.dataset.travelParallaxAssetId || "",
            motion: travelMotionForImage(image),
            sceneKey: track.dataset.travelSceneKey,
          });
        }
        if (state) {
          clearTravelTransitionTimers(state.transition);
          state.pending = null;
          state.transition = null;
          document.querySelector("#travel-transition-art")?.classList.remove("is-active");
        }
        if (track.dataset.travelSeamForegroundForce === "true"
          && track.dataset.travelShowSeamBetweenLoops === "false") {
          releaseTravelSeamForegroundAfterSceneChange(track, game.expedition);
        }
        if (oldTrack?.isConnected && oldTrack !== track) {
          oldTrack._travelOutgoingRemovalTimer = scheduleTravelPresentationTimer(() => {
            if (oldTrack.dataset.travelLayer !== "outgoing") return;
            removeTravelParallaxLayer(oldTrack);
            removeTravelSeamForegroundLayer(oldTrack);
            oldTrack.remove();
            assertTravelPresentationInvariant();
          }, 760, token, [scene, oldTrack, track]);
        }
      } else if (track?.dataset.travelKind !== "encounter") {
        setActiveTravelPresentation(game.expedition, {
          assetId: image.dataset.travelAssetId,
          travelParallaxAssetId: track.dataset.travelParallaxAssetId || image.dataset.travelParallaxAssetId || "",
          motion: travelMotionForImage(image),
          sceneKey: track.dataset.travelSceneKey,
        });
      }
    };
    const parallaxAssetId = track?.dataset.travelParallaxAssetId
      || image.dataset.travelParallaxAssetId
      || "";
    if (track?.dataset.travelLayer === "next" && parallaxAssetId && !travelSceneAssetReady(parallaxAssetId)) {
      preloadTravelSceneAsset(parallaxAssetId).then(() => {
        if (isCurrentTravelPresentation(token, [scene, image, track])) activate();
      });
      return;
    }
    activate();
  });
  image.addEventListener("error", () => markTravelImageFailed(scene, image));
  if (image.complete) {
    if (image.naturalWidth > 0) image.dispatchEvent(new Event("load"));
  }
}

function travelSpeedForVisualLookahead(expedition) {
  const paceMultiplier = EXPEDITION_TUNING.travelPaces?.[expedition?.paceId]?.speedMultiplier ?? 1;
  const directionMultiplier = expedition?.direction === "returning"
    ? EXPEDITION_TUNING.returnSpeedMultiplier
    : 1;
  const partyMultiplier = ExpeditionRules.travelSpeedMultiplier(expedition);
  return EXPEDITION_TUNING.outboundTravelSpeed * paceMultiplier * directionMultiplier * partyMultiplier;
}

function travelNextTileDistance(expedition, track) {
  if (!track || track.dataset.travelKind === "encounter") return null;
  const scene = document.querySelector("#travel-scene");
  if (!scene?.classList.contains("is-moving")) return null;
  const animation = travelImageAnimation(track);
  const duration = Number(animation?.effect?.getComputedTiming?.().duration);
  const currentTime = Number(animation?.currentTime);
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(currentTime)) return null;
  const elapsed = ((currentTime % duration) + duration) % duration;
  const remainingSeconds = (duration - elapsed) / 1000;
  const direction = expedition?.direction === "returning" ? -1 : 1;
  const state = travelScenePresentationFor(expedition);
  const animationCycle = travelAnimationCycle(animation);
  if (!Number.isFinite(state.activeTileDistance)) {
    state.activeTileDistance = Math.max(0, Number(expedition?.distance) || 0);
  }
  if (Number.isFinite(animationCycle)) {
    if (Number.isFinite(state.activeAnimationCycle) && animationCycle > state.activeAnimationCycle) {
      state.activeTileDistance += (animationCycle - state.activeAnimationCycle)
        * direction
        * (duration / 1000)
        * travelSpeedForVisualLookahead(expedition);
    }
    state.activeAnimationCycle = animationCycle;
  }
  return Math.max(
    0,
    state.activeTileDistance + direction * remainingSeconds * travelSpeedForVisualLookahead(expedition),
  );
}

function preloadNextTravelScene(expedition) {
  const definition = expeditionDefinition(expedition);
  const scenes = orderedTravelScenes(definition);
  if (!scenes.length) return;
  const state = travelScenePresentationFor(expedition);
  if (state?.pending) return;
  const track = currentTravelTrack();
  const projectedDistance = travelNextTileDistance(expedition, track);
  if (Number.isFinite(projectedDistance)) {
    const nextPresentation = resolveTravelSceneAtDistance(expedition, projectedDistance);
    preloadTravelAsset(nextPresentation?.assetId);
    preloadTravelAsset(nextPresentation?.travelParallaxAssetId);
    const activeImage = travelActiveTile(track, expedition);
    if (nextPresentation?.assetId && activeImage) {
      queueTravelSceneTransition(
        expedition,
        { ...nextPresentation, tileDistance: projectedDistance },
        activeImage,
      );
    }
    return;
  }
  const distance = Math.max(0, Number(expedition?.distance) || 0);
  const activeIndex = scenes.reduce((index, scene, sceneIndex) => (
    scene.minDistance <= distance ? sceneIndex : index
  ), -1);
  const nextIndex = expedition?.direction === "returning" ? activeIndex - 1 : activeIndex + 1;
  const nextScene = scenes[nextIndex];
  preloadTravelAsset(nextScene?.visualAssetId);
  preloadTravelAsset(nextScene?.travelParallaxAssetId);
}

function createTravelTrack(scene, art, expedition, presentation, activeEncounter = null, layer = "next") {
  const path = AssetCatalog.imagePath(presentation?.assetId);
  if (!path) return null;
  const next = document.createElement("div");
  const assetReady = travelSceneAssetReady(presentation.assetId);
  next.className = `travel-visual-track${layer === "current" && assetReady ? " is-visible" : ""}`;
  markTravelPresentationNode(next);
  next.dataset.travelLayer = layer;
  next.dataset.travelKind = activeEncounter ? "encounter" : "travel";
  next.dataset.travelSceneKey = presentation.sceneKey ?? "";
  next.dataset.travelAssetId = presentation.assetId;
  next.dataset.travelMotion = normalizeTravelMotion(presentation.motion);
  next.dataset.travelParallaxAssetId = presentation.travelParallaxAssetId ?? "";
  next.dataset.travelShowSeamBetweenLoops = presentation.showSeamForegroundBetweenLoops === false ? "false" : "true";
  if (layer === "next" && !activeEncounter) next.dataset.travelSeamForegroundForce = "true";
  const image = document.createElement("img");
  image.className = `asset-image travel-visual-asset${layer === "current" && assetReady ? " is-visible" : ""}`;
  image.dataset.travelCopy = "primary";
  image.dataset.travelAssetId = presentation.assetId;
  image.dataset.travelParallaxAssetId = presentation.travelParallaxAssetId ?? "";
  image.dataset.travelMotion = normalizeTravelMotion(presentation.motion);
  image.alt = activeEncounter?.title ?? expeditionDefinition(expedition).name;
  image.loading = "eager";
  image.decoding = "async";
  image.fetchPriority = "high";
  const preloaded = preloadTravelAsset(presentation.assetId);
  image.src = preloaded?.currentSrc || preloaded?.src || path;
  markTravelPresentationNode(image);
  image.hidden = false;
  next.append(image);
  art.append(next);
  if (layer === "current") {
    art.dataset.travelAssetId = presentation.assetId;
    art.dataset.travelMotion = normalizeTravelMotion(presentation.motion);
    scene.dataset.travelAssetId = presentation.assetId;
    scene.dataset.travelMotion = normalizeTravelMotion(presentation.motion);
  }
  bindTravelImage(scene, image);
  assertTravelPresentationInvariant();
  return image;
}

function queueTravelSceneTransition(expedition, desiredPresentation, currentImage) {
  const state = travelScenePresentationFor(expedition);
  if (!state || !desiredPresentation?.assetId || !currentImage) return;
  const currentTrack = currentImage.closest(".travel-visual-track");
  const currentAssetId = currentTrack?.dataset.travelAssetId ?? currentImage.dataset.travelAssetId;
  const currentTravelParallaxAssetId = currentTrack?.dataset.travelParallaxAssetId ?? currentImage.dataset.travelParallaxAssetId ?? "";
  const currentMotion = normalizeTravelMotion(currentTrack?.dataset.travelMotion ?? currentImage.dataset.travelMotion);
  const desiredMotion = normalizeTravelMotion(desiredPresentation.motion);
  if (currentAssetId === desiredPresentation.assetId
    && currentMotion === desiredMotion
    && currentTravelParallaxAssetId === (desiredPresentation.travelParallaxAssetId ?? "")) {
    if (state.pending) resetTravelPendingTile(expedition);
    state.pending = null;
    return;
  }
  if (state.failedAssetId === desiredPresentation.assetId) return;
  if (state.failedAssetId) state.failedAssetId = null;
  if (state.transition) return;
  if (state.pending
    && state.pending.assetId === desiredPresentation.assetId
    && state.pending.travelParallaxAssetId === (desiredPresentation.travelParallaxAssetId ?? "")
    && state.pending.motion === desiredMotion
    && state.pending.sceneKey === (desiredPresentation.sceneKey ?? "")) {
    installTravelPendingTile(expedition, state.pending);
    return;
  }
  if (state.pending) resetTravelPendingTile(expedition);
  const animation = travelImageAnimation(currentImage);
  const duration = Number(animation?.effect?.getComputedTiming?.().duration);
  const loop = animation?.animationName === "travel-panorama-loop" && Number.isFinite(duration) && duration > 0;
  const now = performance.now();
  state.pending = {
    generation: state.generation ?? currentTravelPresentationGeneration(),
    expedition,
    assetId: desiredPresentation.assetId,
    travelParallaxAssetId: desiredPresentation.travelParallaxAssetId ?? "",
    motion: desiredMotion,
    sceneKey: desiredPresentation.sceneKey ?? "",
    showSeamForegroundBetweenLoops: desiredPresentation.showSeamForegroundBetweenLoops !== false,
    tileDistance: Number.isFinite(Number(desiredPresentation.tileDistance))
      ? Number(desiredPresentation.tileDistance)
      : null,
    tileMode: loop && desiredMotion === "loop",
    tileReady: false,
    tileInstallRequested: false,
    outgoingAssetId: currentAssetId,
    seamCrossed: false,
    lastAnimationCycle: loop ? travelAnimationCycle(animation) : null,
    elapsedMs: 0,
    lastSampleAt: now,
  };
  if (currentTrack
    && currentTrack.dataset.travelKind !== "encounter"
    && currentMotion === "loop"
    && isTravelPanorama(currentImage)) {
    currentTrack.dataset.travelSeamForegroundForce = "true";
    ensureTravelSeamForeground(currentImage, true, currentMotion, expedition);
  }
  preloadTravelAsset(desiredPresentation.assetId);
  installTravelPendingTile(expedition, state.pending);
}

function startTravelSceneCrossfade(expedition, scene, pending) {
  const state = travelScenePresentationFor(expedition);
  const art = document.querySelector("#travel-art");
  const current = currentTravelTrack();
  if (!state || !art || !current || state.transition?.crossfadeStarted) return;
  const transition = state.transition ?? { ...pending };
  transition.crossfadeStarted = true;
  state.transition = transition;
  createTravelTrack(scene, art, expedition, pending, null, "next");
}

function beginTravelSceneTransition(expedition, scene, pending) {
  const state = travelScenePresentationFor(expedition);
  if (!state || state.transition) return;
  const overlay = document.querySelector("#travel-transition-art");
  const overlayImage = overlay?.querySelector("img");
  const transition = {
    ...pending,
    generation: state.generation ?? currentTravelPresentationGeneration(),
    expedition,
    crossfadeStarted: false,
    overlayActive: false,
  };
  const token = travelPresentationToken(expedition, transition.generation);
  state.transition = transition;
  const overlayReady = Boolean(overlayImage && !overlayImage.hidden && overlayImage.naturalWidth > 0);
  if (!overlayReady) {
    startTravelSceneCrossfade(expedition, scene, pending);
    return;
  }
  overlay.classList.remove("is-active");
  void overlay.offsetWidth;
  overlay.classList.add("is-active");
  transition.overlayActive = true;
  transition.overlayTimer = scheduleTravelPresentationTimer(() => {
    if (state.transition !== transition) return;
    startTravelSceneCrossfade(expedition, scene, pending);
  }, 260, token, [scene, overlay]);
  transition.finishTimer = scheduleTravelPresentationTimer(() => {
    overlay.classList.remove("is-active");
  }, 820, token, [scene, overlay]);
}

function advancePendingTravelScene(expedition, scene, activeEncounter) {
  const state = travelScenePresentationFor(expedition);
  const pending = state?.pending;
  if (!state || !pending || state.transition || activeEncounter) {
    if (pending) pending.lastSampleAt = performance.now();
    return;
  }
  if (pending.tileMode) {
    if (!travelPresentationAssetsReady(pending)) {
      waitForTravelPresentationAssets(expedition, pending).then((ready) => {
        if (ready && isCurrentTravelPresentation(
          travelPresentationToken(expedition, pending.generation ?? currentTravelPresentationGeneration()),
          [scene],
        )) updateTravelHud();
      });
      return;
    }
    installTravelPendingTile(expedition, pending);
    if (!scene.classList.contains("is-moving") || !pending.tileReady) return;
    const track = currentTravelTrack();
    const upcomingTile = travelUpcomingTile(track, expedition);
    if (!track || !upcomingTile || upcomingTile.dataset.travelAssetId !== pending.assetId) return;
    const activeTile = travelActiveTile(track, expedition);
    const animation = travelImageAnimation(activeTile);
    const animationCycle = travelAnimationCycle(animation);
    const loopAdvanced = Number.isFinite(animationCycle)
      && Number.isFinite(pending.lastAnimationCycle)
      && animationCycle > pending.lastAnimationCycle;
    if (Number.isFinite(animationCycle)) pending.lastAnimationCycle = animationCycle;
    const art = document.querySelector("#travel-art");
    const artBox = art?.getBoundingClientRect();
    const travelers = scene.querySelector(".travelers")?.getBoundingClientRect();
    const anchorX = travelers
      ? travelers.left + travelers.width / 2
      : artBox ? artBox.left + artBox.width / 2 : 0;
    const seamX = expedition.direction === "returning"
      ? upcomingTile.getBoundingClientRect().right
      : upcomingTile.getBoundingClientRect().left;
    const reachedAnchor = expedition.direction === "returning"
      ? seamX >= anchorX
      : seamX <= anchorX;
    if (!pending.seamCrossed && (reachedAnchor || loopAdvanced)) pending.seamCrossed = true;
    if (!pending.seamCrossed) return;
    const outgoingTile = activeTile;
    if (!outgoingTile || outgoingTile.dataset.travelAssetId !== pending.outgoingAssetId) return;
    if (loopAdvanced || travelTileIsOffscreen(outgoingTile, scene.getBoundingClientRect(), expedition.direction === "returning")) {
      recycleTravelLoopScene(expedition, scene, pending);
    }
    return;
  }
  if (!travelPresentationAssetsReady(pending)) {
    waitForTravelPresentationAssets(expedition, pending).then((ready) => {
      if (ready && isCurrentTravelPresentation(
        travelPresentationToken(expedition, pending.generation ?? currentTravelPresentationGeneration()),
        [scene],
      )) updateTravelHud();
    });
    return;
  }
  if (!scene.classList.contains("is-moving")) return;
  const now = performance.now();
  const elapsed = Math.min(250, Math.max(0, now - (pending.lastSampleAt ?? now)));
  pending.elapsedMs += elapsed;
  pending.lastSampleAt = now;
  const currentImage = currentTravelTrack()?.querySelector("[data-travel-copy='primary']");
  if (!currentImage) return;
  const animation = travelImageAnimation(currentImage);
  const duration = Number(animation?.effect?.getComputedTiming?.().duration);
  const currentTime = Number(animation?.currentTime);
  let safe = false;
  if (animation?.animationName === "travel-panorama-pan" && Number.isFinite(duration)) {
    safe = currentTime >= duration - 80 || pending.elapsedMs >= 1500;
  } else {
    safe = true;
  }
  if (safe) beginTravelSceneTransition(expedition, scene, pending);
}

function applyTravelMotionChange(scene, track, image, motion) {
  const animation = travelImageAnimation(image);
  const currentTime = Number(animation?.currentTime);
  track.dataset.travelMotion = normalizeTravelMotion(motion);
  image.dataset.travelMotion = normalizeTravelMotion(motion);
  updateTravelImagePresentation(scene, image);
  const token = travelPresentationToken(
    game.expedition,
    travelPresentationNodeGeneration(image) ?? currentTravelPresentationGeneration(),
  );
  queueTravelPresentationFrame(() => {
    if (!Number.isFinite(currentTime)) return;
    const nextAnimation = travelImageAnimation(image);
    const duration = Number(nextAnimation?.effect?.getComputedTiming?.().duration);
    if (nextAnimation && Number.isFinite(duration) && duration > 0) {
      nextAnimation.currentTime = Math.min(currentTime, duration);
    }
  }, token, [scene, track, image]);
}

function syncTravelVisual(expedition, activeEncounter) {
  const scene = document.querySelector("#travel-scene");
  const art = document.querySelector("#travel-art");
  if (!scene || !art) return;
  const state = travelScenePresentationFor(expedition);
  const encounterVisualState = resolveEncounterVisualState(activeEncounter, expedition?.activeEncounter);
  const encounterAssetId = encounterVisualState.backgroundAssetId;
  const resolvedTravel = resolveTravelScene(expedition) ?? { assetId: null, motion: "loop", sceneKey: "" };
  const resolvedPresentation = resolveExpeditionTravelPresentation(expedition, activeEncounter);
  const current = currentTravelTrack();
  const currentImage = current?.querySelector("[data-travel-copy='primary']");
  const currentPresentation = currentTravelPresentation();
  const desiredPresentation = encounterAssetId
    ? { assetId: encounterAssetId, motion: "loop", sceneKey: "encounter", kind: "encounter" }
    : activeEncounter && currentPresentation
      ? currentPresentation
      : resolvedPresentation;
  const desiredKind = desiredPresentation.kind ?? (activeEncounter && encounterAssetId ? "encounter" : "travel");
  const desiredAssetId = desiredPresentation.assetId;
  const desiredMotion = normalizeTravelMotion(desiredPresentation.motion);
  const desiredPath = AssetCatalog.imagePath(desiredAssetId);
  const presentationTargetAssetId = encounterAssetId
    ? desiredAssetId
    : state?.pending?.assetId ?? state?.transition?.assetId ?? desiredAssetId;
  const presentationTargetMotion = encounterAssetId
    ? desiredMotion
    : normalizeTravelMotion(state?.pending?.motion ?? state?.transition?.motion ?? desiredMotion);
  if (activeEncounter && !encounterAssetId && state?.transition) {
    cancelTravelSceneTransition(expedition, true);
  }
  const snapshotPreservesPending = Boolean(
    state?.pending
    && game.travelVisualState?.expedition === expedition
    && game.travelVisualState.assetId === state.activeAssetId
    && game.travelVisualState.tiles?.some((tile) => tile.assetId === state.pending.assetId),
  );
  if (!activeEncounter && game.travelVisualState
    && !snapshotPreservesPending
    && (game.travelVisualState.expedition !== expedition
      || game.travelVisualState.assetId !== resolvedTravel.assetId
      || game.travelVisualState.motion !== normalizeTravelMotion(resolvedTravel.motion))) {
    game.travelVisualState = null;
  }
  art.dataset.travelDesiredAssetId = presentationTargetAssetId ?? "";
  art.dataset.travelDesiredMotion = presentationTargetMotion;
  scene.dataset.travelDesiredAssetId = presentationTargetAssetId ?? "";
  scene.dataset.travelDesiredMotion = presentationTargetMotion;
  if (!desiredPath) {
    art.querySelectorAll(".travel-visual-track").forEach((track) => track.remove());
    art.querySelectorAll(".travel-parallax-layer").forEach((layer) => layer.remove());
    scene.classList.remove("asset-image-active", "asset-load-failed");
    scene.dataset.travelAssetId = "";
    scene.dataset.travelMotion = "";
    art.dataset.travelAssetId = "";
    art.dataset.travelMotion = "";
    art.dataset.travelAssetFailedId = "";
    return;
  }
  if (art.dataset.travelAssetFailedId === desiredAssetId) return;
  if (state?.failedAssetId === desiredAssetId) return;
  if (!travelPresentationAssetsReady(desiredPresentation)) {
    const token = travelPresentationToken(expedition, state?.generation ?? currentTravelPresentationGeneration());
    waitForTravelPresentationAssets(expedition, desiredPresentation).then((ready) => {
      if (ready && isCurrentTravelPresentation(token, [scene])) updateTravelHud();
    });
    return;
  }
  if (current
    && current.dataset.travelAssetId === desiredAssetId
    && current.dataset.travelMotion === desiredMotion
    && (current.dataset.travelParallaxAssetId || "") === (desiredPresentation.travelParallaxAssetId ?? "")
    && (current.dataset.travelKind || "travel") === desiredKind
    && currentImage
    && !currentImage.hidden) {
    if (!activeEncounter && state) {
      if (state.pending
        && state.pending.assetId === desiredAssetId
        && state.pending.motion === desiredMotion) {
        state.pending = null;
      }
      if (state.transition && state.transition.assetId !== desiredAssetId) {
        cancelTravelSceneTransition(expedition);
      }
    }
    bindTravelImage(scene, travelActiveTile(current, expedition) ?? currentImage);
    return;
  }
  if (current
    && current.dataset.travelAssetId === desiredAssetId
    && current.dataset.travelMotion !== desiredMotion) {
    applyTravelMotionChange(scene, current, currentImage, desiredMotion);
    if (state) state.pending = null;
    return;
  }
  if (current && current.dataset.travelKind !== "encounter" && !activeEncounter) {
    queueTravelSceneTransition(expedition, resolvedTravel, currentImage);
    return;
  }
  if (current
    && ((current.dataset.travelAssetId || "") !== desiredAssetId
      || (current.dataset.travelKind || "travel") !== desiredKind)) {
    if (state?.transition?.assetId === desiredAssetId && state.transition.kind === desiredKind) return;
    if (state?.transition) cancelTravelSceneTransition(expedition);
    if (state) {
      state.transition = {
        ...desiredPresentation,
        generation: state.generation ?? currentTravelPresentationGeneration(),
        expedition,
        kind: desiredKind,
        outgoingAssetId: current.dataset.travelAssetId || "",
        crossfadeStarted: false,
      };
    }
    createTravelTrack(scene, art, expedition, { ...desiredPresentation, kind: desiredKind }, activeEncounter, "next");
    return;
  }
  if (current && !scene.classList.contains("asset-image-active")) current.remove();
  createTravelTrack(scene, art, expedition, { ...desiredPresentation, kind: desiredKind }, activeEncounter, "current");
}

function resetTravelPresentationForDirectionChange(scene, expedition, direction) {
  const art = scene?.querySelector("#travel-art");
  if (!scene || !art || !expedition) return;

  // The distance is gameplay state. Everything else below is rebuilt from the
  // authored scene at that distance instead of carrying visual transition
  // state across the outbound/returning direction change.
  const currentDistance = Math.max(0, Number(expedition.distance) || 0);
  const resolvedPresentation = resolveTravelScene(expedition);

  const state = travelScenePresentationFor(expedition);
  if (state?.transition) clearTravelTransitionTimers(state.transition);
  if (state) {
    state.pending = null;
    state.transition = null;
    state.sceneAssetLoad = null;
    state.failedAssetId = null;
    state.activeTileDistance = currentDistance;
    state.activeAnimationCycle = null;
  }
  game.travelVisualState = null;

  art.querySelectorAll(".travel-visual-track").forEach((track) => {
    removeTravelSeamForegroundLayer(track);
    removeTravelParallaxLayer(track);
    track._travelSeamForegroundLayer = null;
    track._travelSeamForeground = null;
    track._travelSeamForegrounds = null;
    track.remove();
  });
  scene.querySelectorAll(".travel-seam-foreground-layer, .travel-seam-foreground-carry, .travel-parallax-layer")
    .forEach((layer) => layer.remove());
  document.querySelector("#travel-transition-art")?.classList.remove("is-active");

  markTravelPresentationNode(scene);
  markTravelPresentationNode(art);
  scene.classList.toggle("is-returning", direction === "returning");
  scene.classList.remove("asset-image-active", "asset-load-failed", "has-travel-panorama");
  scene.dataset.travelAssetId = "";
  scene.dataset.travelMotion = "";
  scene.dataset.travelAssetFailedId = "";
  art.dataset.travelAssetId = "";
  art.dataset.travelMotion = "";
  art.dataset.travelAssetFailedId = "";

  if (!resolvedPresentation?.assetId) return;
  art.dataset.travelDesiredAssetId = resolvedPresentation.assetId;
  art.dataset.travelDesiredMotion = normalizeTravelMotion(resolvedPresentation.motion);
  scene.dataset.travelDesiredAssetId = resolvedPresentation.assetId;
  scene.dataset.travelDesiredMotion = normalizeTravelMotion(resolvedPresentation.motion);
  preloadTravelAsset(resolvedPresentation.assetId);
  preloadTravelAsset(resolvedPresentation.travelParallaxAssetId);
  setActiveTravelPresentation(expedition, resolvedPresentation);
  createTravelTrack(
    scene,
    art,
    expedition,
    resolvedPresentation,
    null,
    "current",
  );
  assertTravelPresentationInvariant();
}

function preserveTravelDirectionPosition(scene, returning) {
  const direction = returning ? "returning" : "outbound";
  const previousDirection = scene.dataset.travelDirection;
  scene.dataset.travelDirection = direction;
  if (!previousDirection || previousDirection === direction) return false;
  const expedition = game.expedition;
  const generation = bumpTravelPresentationGeneration(expedition, `direction-change:${previousDirection}->${direction}`);
  resetTravelPresentationForDirectionChange(scene, game.expedition, direction);
  queueTravelPresentationFrame(
    () => syncTravelPresentation(expedition),
    travelPresentationToken(expedition, generation),
    [scene],
  );
  return true;
}

function renderPortraitAsset(assetId, initials, alt) {
  const fallbackVisibility = AssetCatalog.imagePath(assetId) ? "" : " is-visible";
  return `${renderImageAsset(assetId, "dialogue-portrait-image", alt)}<span class="portrait-fallback${fallbackVisibility}">${initials}</span>`;
}

function combatCharacterContextScale(formationCount) {
  return {
    1: 1.8,
    2: 1.4,
    3: 1.35,
  }[Math.max(1, Math.min(3, Number(formationCount) || 1))] ?? 1.8;
}

function combatFormationDensityScale(formationCount) {
  return {
    1: 1,
    2: 1,
    3: 0.87,
  }[Math.max(1, Math.min(3, Number(formationCount) || 1))] ?? 1;
}

function combatCharacterLayoutScale(combatant, formationCount) {
  const definition = characterDefinitionForCombatant(combatant);
  const config = characterVisualConfig(definition, "idle");
  return combatCharacterContextScale(formationCount)
    * combatFormationDensityScale(formationCount)
    * (config.combatVisualScale ?? config.visualScale)
    * config.slotScale;
}

function renderCombatVisual(combatant, fallback, alt) {
  return renderCharacterSprite(
    characterDefinitionForCombatant(combatant),
    "idle",
    "combat",
    fallback,
    alt,
    {
      className: "combat-visual",
      mirror: combatant?.side === "enemy",
    },
  );
}

function combatActionAnimationEvents(combat, events = []) {
  return events.filter((event) => {
    const actor = [...(combat?.allies ?? []), ...(combat?.enemies ?? [])]
      .find((combatant) => combatant.id === event.actor);
    if (!actor) return false;
    if (actor.side === "ally") return event.action === "attack";
    return typeof event.action === "string" && event.action.length > 0;
  });
}

function combatPresentationController(combat) {
  let controller = combatPresentationControllers.get(combat);
  if (!controller) {
    controller = {
      queue: [],
      active: null,
      version: 0,
      impactCounter: 0,
      presentationFinishPending: false,
      enqueuedEvents: new Set(),
      presentedEvents: new WeakSet(),
    };
    combatPresentationControllers.set(combat, controller);
  }
  return controller;
}

function combatPresentationEventTargets(event) {
  if (Array.isArray(event?.targetIds)) return event.targetIds.filter(Boolean);
  return event?.target ? [event.target] : [];
}

function combatPresentationHasPending(combat) {
  const controller = combatPresentationControllers.get(combat);
  return Boolean(controller?.active || controller?.queue.length);
}

function enqueueCombatActionPresentations(combat, events = []) {
  if (!combat) return;
  const controller = combatPresentationController(combat);
  combatActionAnimationEvents(combat, events).forEach((event) => {
    if (controller.enqueuedEvents.has(event)) return;
    controller.enqueuedEvents.add(event);
    controller.queue.push(event);
  });
}

function combatPresentationEventIsPending(combat, event) {
  const controller = combatPresentationControllers.get(combat);
  if (!controller || controller.presentedEvents.has(event)) return false;
  return controller.active?.event === event || controller.queue.includes(event);
}

function combatPresentationDisplayedHp(combat, combatant) {
  const maximum = Math.max(0, Number(combatant?.maxHp) || 0);
  let hp = Number(combatant?.hp) || 0;
  const controller = combatPresentationControllers.get(combat);
  const pendingEvents = [controller?.active?.event, ...(controller?.queue ?? [])].filter(Boolean);
  pendingEvents.forEach((event) => {
    if (!combatPresentationEventIsPending(combat, event) || !combatPresentationEventTargets(event).includes(combatant.id)) return;
    hp += Number(event.damage) || 0;
    hp -= Number(event.healingAmount) || 0;
  });
  return clamp(hp, 0, maximum || hp);
}

function combatPresentationCombatantElement(combatantId) {
  return [...document.querySelectorAll("[data-combatant-id]")]
    .find((element) => element.dataset.combatantId === combatantId) || null;
}

function presentCombatImpact(expedition, combat, event, presentationVersion) {
  if (!expedition || expedition.combat !== combat || !event) return;
  const controller = combatPresentationController(combat);
  if (controller.active?.event !== event || controller.active.version !== presentationVersion) return;
  if (controller.presentedEvents.has(event)) return;
  controller.presentedEvents.add(event);
  controller.impactCounter += 1;
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  const targetIds = combatPresentationEventTargets(event);
  targetIds.forEach((targetId) => {
    const target = [...combat.allies, ...combat.enemies].find((combatant) => combatant.id === targetId);
    if (!target) return;
    target.presentationHitEvent = controller.impactCounter;
    target.presentationHitUntil = now + 220;
    const element = combatPresentationCombatantElement(targetId);
    if (!element) return;
    element.classList.remove("was-hit");
    void element.offsetWidth;
    element.classList.add("was-hit");
    const clearHit = () => {
      if (!element.isConnected || element.dataset.combatantId !== targetId) return;
      const until = Number(target.presentationHitUntil) || 0;
      if (until > (typeof performance !== "undefined" ? performance.now() : Date.now())) {
        window.requestAnimationFrame(clearHit);
      } else {
        element.classList.remove("was-hit");
      }
    };
    window.requestAnimationFrame(clearHit);
  });
  updateCombatHud();
  document.dispatchEvent(new CustomEvent("combat-presentation-impact", {
    detail: {
      attackerId: event.actor ?? null,
      targetIds,
      actionId: event.action ?? null,
      abilityId: event.abilityId ?? null,
      damage: Number(event.damage) || 0,
      healingAmount: Number(event.healingAmount) || 0,
      tags: event.tags ?? COMBAT_ABILITY_DEFINITIONS[event.abilityId ?? event.action]?.tags ?? [],
      eventId: event.sequence ?? null,
      presentationVersion,
    },
  }));
}

function pumpCombatPresentation(expedition, combat) {
  if (!expedition || expedition.combat !== combat) return;
  const controller = combatPresentationController(combat);
  if (controller.active) return;
  const event = controller.queue.shift();
  if (!event) {
    if (controller.presentationFinishPending) {
      controller.presentationFinishPending = false;
      finishCombatResolution(expedition);
    }
    return;
  }
  const presentationVersion = ++controller.version;
  const active = { event, version: presentationVersion, finished: false };
  controller.active = active;
  const actor = [...combat.allies, ...combat.enemies].find((combatant) => combatant.id === event.actor);
  const actorElement = combatPresentationCombatantElement(event.actor);
  const definition = actor ? characterDefinitionForCombatant(actor) : null;
  const finish = () => {
    if (active.finished || controller.active !== active) return;
    active.finished = true;
    controller.active = null;
    if (controller.queue.length > 0) {
      refreshCombat(expedition, combat);
      pumpCombatPresentation(expedition, combat);
    } else if (controller.presentationFinishPending) {
      finishCombatResolution(expedition);
    } else {
      refreshCombat(expedition, combat);
    }
  };
  if (!actorElement || !definition || !characterVisualSlotIsUsable(definition, "attack")) {
    presentCombatImpact(expedition, combat, event, presentationVersion);
    finish();
    return;
  }
  const started = playCharacterVisualAction(actorElement, "attack", {
    mirror: actor.side === "enemy",
    onImpact: () => presentCombatImpact(expedition, combat, event, presentationVersion),
    onComplete: finish,
  });
  if (!started) {
    presentCombatImpact(expedition, combat, event, presentationVersion);
    finish();
  }
}

function expeditionDefinition(expedition) {
  return ExpeditionCatalog.get(expedition?.expeditionId ?? expedition?.id);
}

function validCombatBackgroundAssetId(assetId) {
  return typeof assetId === "string"
    && AssetCatalog.image(assetId)?.category === "combat_scene"
    && Boolean(AssetCatalog.imagePath(assetId));
}

function resolveCombatBackground(expedition, encounter = null) {
  const activeOverride = expedition?.activeEncounter?.combatVisualAssetId
    ?? null;
  const encounterOverride = encounter?.combatVisualAssetId;
  if (validCombatBackgroundAssetId(activeOverride)) {
    return { assetId: activeOverride, source: "encounter-override" };
  }
  if (validCombatBackgroundAssetId(encounterOverride)) {
    return { assetId: encounterOverride, source: "encounter-override" };
  }

  const expeditionDefault = expeditionDefinition(expedition)?.combatVisualAssetId;
  if (validCombatBackgroundAssetId(expeditionDefault)) {
    return { assetId: expeditionDefault, source: "expedition-default" };
  }
  return { assetId: null, source: "gradient-fallback" };
}

function resolveCombatBackgroundAssetId(expedition, encounter = null) {
  return resolveCombatBackground(expedition, encounter).assetId;
}

function resolveExpeditionVisualAssetId(expedition, mode = "travel", encounter = null) {
  const definition = expeditionDefinition(expedition);
  const encounterAssetId = resolveEncounterVisualState(encounter, expedition?.activeEncounter).backgroundAssetId;
  return encounterAssetId
    ?? (mode === "camp" ? definition.campVisualAssetId : resolveTravelSceneAssetId(expedition))
    ?? null;
}

function resolveExpeditionTravelPresentation(expedition, encounter = null) {
  const encounterAssetId = resolveEncounterVisualState(encounter, expedition?.activeEncounter).backgroundAssetId;
  if (encounterAssetId) {
    return { assetId: encounterAssetId, motion: "loop", sceneKey: "encounter", kind: "encounter" };
  }
  const resolved = resolveTravelScene(expedition) ?? { assetId: null, motion: "loop", sceneKey: "" };
  const current = currentTravelPresentation();
  const state = travelScenePresentationFor(expedition);
  const preserved = current?.kind !== "encounter"
    ? current
    : activeTravelPresentation(state);
  const ownsCurrentPresentation = state?.activeAssetId === current?.assetId;
  if (state?.pending || state?.transition) {
    return preserved ?? resolved;
  }
  if (current?.kind !== "encounter"
    && ownsCurrentPresentation
    && (current?.assetId !== resolved.assetId
      || current?.travelParallaxAssetId !== (resolved.travelParallaxAssetId ?? "")
      || current?.motion !== normalizeTravelMotion(resolved.motion))) {
    return preserved ?? resolved;
  }
  return resolved;
}

function resolveTravelTransitionAssetId(expedition) {
  const assetId = expeditionDefinition(expedition)?.travelTransitionAssetId;
  return assetId && AssetCatalog.imagePath(assetId) ? assetId : null;
}

function renderTravelTransitionAsset(expedition) {
  const assetId = resolveTravelTransitionAssetId(expedition);
  const path = assetId ? AssetCatalog.imagePath(assetId) : null;
  const image = path
    ? `<img class="travel-transition-image" data-travel-generation="${currentTravelPresentationGeneration()}" data-travel-transition-asset-id="${assetAttribute(assetId)}" src="${assetAttribute(path)}" alt="" aria-hidden="true" loading="eager" decoding="async" onload="this.classList.add('is-ready')" onerror="markTravelTransitionFailed(this)">`
    : "";
  return `<div class="travel-transition-art" id="travel-transition-art" aria-hidden="true">${image}</div>`;
}

function markTravelTransitionFailed(image) {
  if (!image) return;
  const scene = image.closest("#travel-scene");
  const token = travelPresentationToken(
    game.expedition,
    travelPresentationNodeGeneration(image) ?? travelPresentationNodeGeneration(scene) ?? currentTravelPresentationGeneration(),
  );
  if (!isCurrentTravelPresentation(token, [scene, image])) return;
  image.hidden = true;
  const overlay = image.closest("#travel-transition-art");
  overlay?.classList.remove("is-active");
  const state = travelScenePresentationFor(game.expedition);
  if (state?.transition && !state.transition.crossfadeStarted) {
    const scene = document.querySelector("#travel-scene");
    if (scene && state.pending) startTravelSceneCrossfade(game.expedition, scene, state.pending);
  }
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

const TOWN_HOTSPOT_FALLBACKS = Object.freeze({
  northwest: Object.freeze({ x: 0.18, y: 0.27 }),
  northeast: Object.freeze({ x: 0.82, y: 0.27 }),
  southwest: Object.freeze({ x: 0.22, y: 0.56 }),
  southeast: Object.freeze({ x: 0.78, y: 0.56 }),
  center: Object.freeze({ x: 0.50, y: 0.35 }),
});

function townHotspotForDestination(destination) {
  const authored = destination?.hotspot;
  const fallback = TOWN_HOTSPOT_FALLBACKS[destination?.scenePosition] || TOWN_HOTSPOT_FALLBACKS.center;
  const x = Number(authored?.x);
  const y = Number(authored?.y);
  return {
    x: Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : fallback.x,
    y: Number.isFinite(y) ? Math.min(1, Math.max(0, y)) : fallback.y,
  };
}

const TOWN_HOTSPOT_STYLES = Object.freeze(["tag", "ribbon", "ink"]);

function townHotspotStyle(location) {
  const override = typeof debugTownHotspotStyle === "function" ? debugTownHotspotStyle() : null;
  if (TOWN_HOTSPOT_STYLES.includes(override)) return override;
  return TOWN_HOTSPOT_STYLES.includes(location?.markerStyle) ? location.markerStyle : "tag";
}

function clampTownHotspotsToScene(scene = document.querySelector(".location-scene")) {
  if (!scene) return;
  const sceneBounds = scene.getBoundingClientRect();
  if (!sceneBounds.width || !sceneBounds.height) return;
  scene.querySelectorAll(".hub-hotspot").forEach((button) => {
    const authoredX = Number(button.dataset.hotspotX);
    const authoredY = Number(button.dataset.hotspotY);
    if (!Number.isFinite(authoredX) || !Number.isFinite(authoredY)) return;
    const markerBounds = button.getBoundingClientRect();
    const halfWidth = markerBounds.width / 2;
    const halfHeight = markerBounds.height / 2;
    const anchorX = sceneBounds.left + sceneBounds.width * authoredX;
    const anchorY = sceneBounds.top + sceneBounds.height * authoredY;
    const minX = sceneBounds.left + halfWidth;
    const maxX = sceneBounds.right - halfWidth;
    const minY = sceneBounds.top + halfHeight;
    const maxY = sceneBounds.bottom - halfHeight;
    const clampedX = clamp(anchorX, Math.min(minX, maxX), Math.max(minX, maxX));
    const clampedY = clamp(anchorY, Math.min(minY, maxY), Math.max(minY, maxY));
    button.style.left = `${((clampedX - sceneBounds.left) / sceneBounds.width) * 100}%`;
    button.style.top = `${((clampedY - sceneBounds.top) / sceneBounds.height) * 100}%`;
  });
}

function renderLocation() {
  const location = currentLocationForUi();
  if (!location) {
    showScreen("campaign");
    return;
  }

  const destinations = location.destinations.map((destinationId) => {
    const destination = DESTINATION_DEFINITIONS[destinationId];
    const locked = destination.requiresIntro !== false && !locationIsUnlocked(location);
    const hotspot = townHotspotForDestination(destination);
    return `
      <button class="hub-hotspot town-hotspot-style-${townHotspotStyle(location)} ${destination.type === "story" ? "is-story-destination" : ""} ${locked ? "is-locked" : ""}" type="button"
        style="left: ${hotspot.x * 100}%; top: ${hotspot.y * 100}%;" data-hotspot-x="${hotspot.x}" data-hotspot-y="${hotspot.y}" data-action="open-destination" data-destination-id="${destination.id}" ${locked ? "disabled aria-disabled=\"true\"" : ""}>
        <span class="hub-building-icon" aria-hidden="true">${destinationIcon(destination.type)}</span>
        <strong>${destination.name}</strong>
      </button>`;
  }).join("");

  ui.screenRoot.innerHTML = `
    <section class="screen location-screen" aria-labelledby="location-title">
      <div data-asset-frame="location" class="location-scene" aria-label="${assetAttribute(location.name)} scene">
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
          ${game.locationContext?.type === "expedition"
            ? `<button class="game-button" type="button" data-action="leave-expedition-location">Return to Expedition</button>`
            : `<button class="text-button" type="button" data-action="show-campaign">Chapter Select</button>
              <button class="game-button" type="button" data-action="prepare-expedition" ${locationIsUnlocked(location) ? "" : "disabled"}>Prepare for Expedition</button>`}
        </div>
      </div>
    </section>`;
  clampTownHotspotsToScene();
}

function openDestination(destinationId) {
  const location = currentLocationForUi();
  if (!location?.destinations.includes(destinationId) || !DESTINATION_DEFINITIONS[destinationId]) {
    return;
  }
  const destination = DESTINATION_DEFINITIONS[destinationId];
  if (destination.requiresIntro !== false && !locationIsUnlocked(location)) return;
  game.activeDestinationId = destinationId;
  game.shopTab = "buy";
  game.innTab = "rest";
  game.campTab = "rest";
  game.dialogueSession = null;
  const npc = NPC_DEFINITIONS[destination.npcIds[0]];
  if (destination.type === "story" && !locationIsUnlocked(location)) {
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
          <button class="interaction-back village-back-button" type="button" data-action="show-location">← Return</button>
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
  const rest = HealingRules.quoteInnRest(game.player, destination.restConfig);
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

function renderExpeditionRestProgress(action, label, message) {
  const percent = Math.round((action.progress ?? 0) * 100);
  return `<div class="crafting-progress expedition-rest-progress" data-rest-token="${action.token}" aria-live="polite"><div class="crafting-progress-heading"><strong>${label}</strong><span>${percent}%</span></div><div class="crafting-progress-track"><div class="crafting-progress-fill" style="width:${percent}%"></div></div><p>${message}</p></div>`;
}

function cancelRestAction({ silent = true } = {}) {
  const action = game.restAction;
  if (!action) return;
  if (action.interruptionTimerId !== null && action.interruptionTimerId !== undefined) {
    window.clearTimeout(action.interruptionTimerId);
    action.interruptionTimerId = null;
  }
  action.interruptionState = "cancelled";
  game.restAction = null;
  if (!silent) {
    showToast({ title: "Rest Cancelled", message: "The resting place is no longer available.", type: "warning" });
  }
}

function isCurrentRestAction(action) {
  if (!action || game.restAction !== action || action.token !== game.restActionVersion) return false;
  if (game.screen !== action.screen) return false;
  if (action.context === "inn-rest") {
    return game.activeDestinationId === action.destinationId;
  }
  return game.expedition === action.expedition
    && action.expedition?.status === "active"
    && action.expedition?.activeEncounter == null
    && action.expedition?.combat == null;
}

function beginRestAction(context, options = {}) {
  if (game.restAction || game.craftingAction) return null;
  const action = {
    token: game.restActionVersion + 1,
    context,
    expedition: options.expedition ?? null,
    screen: options.screen ?? game.screen,
    destinationId: options.destinationId ?? null,
    startedAt: performance.now(),
    durationMs: Math.max(0, Number(options.durationMs) || 0),
    progress: 0,
    eventId: options.eventId ?? null,
    eventDelayMs: options.eventDelayMs ?? null,
    interruptionState: options.eventId ? "scheduled" : "none",
    interruptionTimerId: null,
  };
  game.restActionVersion = action.token;
  game.restAction = action;
  if (action.eventId) {
    action.interruptionTimerId = window.setTimeout(
      () => interruptCampRest(action),
      Math.max(0, Number(action.eventDelayMs) || 0),
    );
  }
  return action;
}

function beginInnRest() {
  const destination = DESTINATION_DEFINITIONS[game.activeDestinationId];
  if (destination?.type !== "inn") return;
  if (game.restAction || game.craftingAction) return;
  const quote = HealingRules.quoteInnRest(game.player, destination.restConfig);
  if (quote.fullHealth || !quote.available) {
    restAtInn();
    return;
  }
  beginRestAction("inn-rest", {
    screen: "destination",
    destinationId: game.activeDestinationId,
    durationMs: HEALING_TUNING.innRestDurationMs,
  });
  refreshDestination();
}

function restAtInn() {
  const destination = DESTINATION_DEFINITIONS[game.activeDestinationId];
  if (destination?.type !== "inn") return;
  const result = HealingRules.restAtInn(game.player, destination.restConfig);
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
      if (!completed.combatStarted && !completed.dialogueStarted) {
        queueEncounterRewardReveal(game.expedition, "dialogue");
      }
      renderExpedition();
    }
    return;
  }
  if ((result.effects ?? []).length > 0) savePlayer();
  if ((result.rewards ?? []).length > 0) {
    queueRewardRevealPresentation(result.rewards, {
      source: "dialogue",
      eventId: `dialogue:${game.rewardPresentationContextId}:${returnContext?.destinationId ?? "npc"}:${(result.rewards ?? []).map((reward) => `${reward.type}:${reward.itemId ?? reward.recipeId ?? reward.abilityId ?? reward.knowledgeId ?? "reward"}`).join(",")}`,
    });
  }
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

function partyProvisionCapacity(selectedCompanionId, expeditionId = null) {
  return ExpeditionRules.partyProvisionCapacity(selectedCompanionId, expeditionId);
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
        <li class="preparation-step ${index === currentIndex ? "is-current" : ""} ${index < currentIndex ? "is-complete" : ""}">
          <button class="preparation-step-button" type="button" data-action="preparation-step" data-step-id="${step.id}" ${index === currentIndex ? 'aria-current="step"' : ""}>
            <span class="preparation-step-number">${index + 1}</span>
            <span>${step.label}</span>
          </button>
        </li>`).join("")}
    </ol>`;
}

function preparationCanStart() {
  const selectedCompanions = selectedCompanionIds(game.player);
  const provisionCapacity = partyProvisionCapacity(selectedCompanions, game.player.selectedExpeditionId);
  return !game.expeditionStartPending
    && game.preparationSupplies > 0
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
    ? `<button class="game-button" type="button" data-action="start-expedition" ${preparationCanStart() ? "" : "disabled"}>${game.expeditionStartPending ? "Preparing..." : "Begin Expedition"}</button>`
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
      <div class="preparation-heading-row">
        <button class="text-button preparation-back village-back-button" type="button" data-action="show-location">← Village</button>
        <div class="screen-heading compact-heading">
          <p class="eyebrow">Chapter III — Brocéliande</p>
          <h1 id="preparation-title">Prepare for Expedition</h1>
        </div>
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
  const equipment = EquipmentRules.equipmentSlots()
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
        <span>Weapon · Shield · Armor · Relic</span>
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
  const provisionCapacity = partyProvisionCapacity(selectedCompanions, game.player.selectedExpeditionId);
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
  const equippedNames = EquipmentRules.equipmentSlots()
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
  const provisionCapacity = partyProvisionCapacity(selectedCompanions, game.player.selectedExpeditionId);
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
        <span class="item-category">${item.equipmentSlot ?? item.category}${item.rarity ? ` · ${item.rarity}` : ""}${item.twoHanded === true ? " · Two-Handed" : ""}</span>
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
    message: [
      result.previousItemId && result.previousItemId !== itemId
        ? `Replaced ${ITEM_DEFINITIONS[result.previousItemId]?.name ?? "previous gear"}.`
        : "",
      ...(result.compatibilityChanges ?? []).map((change) =>
        `Unequipped ${ITEM_DEFINITIONS[change.itemId]?.name ?? "conflicting gear"}.`),
    ].filter(Boolean).join(" ") || "Ready for the next expedition.",
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
    partyProvisionCapacity(game.player.selectedCompanions, game.player.selectedExpeditionId),
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
    Math.min(
      partyProvisionCapacity(selectedCompanionIds(game.player), game.player.selectedExpeditionId),
      game.player.provisions,
    ),
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

async function startExpedition() {
  if (game.expeditionStartPending) return;
  if (!isVillageUnlocked() || !ExpeditionCatalog.isUnlocked(game.player, game.player.selectedExpeditionId)) return;
  const selectedCompanions = selectedCompanionIds(game.player);
  const provisionCapacity = partyProvisionCapacity(selectedCompanions, game.player.selectedExpeditionId);
  if (game.preparationSupplies <= 0
    || HealingRules.arthurHealth(game.player) <= 0
    || game.preparationSupplies > game.player.provisions
    || game.preparationSupplies > provisionCapacity) {
    return;
  }
  const committedProvisions = game.preparationSupplies;
  game.rewardPresentationContextId += 1;
  if (typeof RewardRevealSystem !== "undefined") RewardRevealSystem.cancel({ resetSeen: true });
  game.expeditionStartPending = true;
  refreshPreparation();
  game.expedition = ExpeditionRules.startExpedition(game.player, {
    provisions: committedProvisions,
    companions: selectedCompanions,
    expeditionId: game.player.selectedExpeditionId,
    packedMaterials: game.player.packedMaterials,
  });
  const startedExpedition = game.expedition;
  startedExpedition.travelState = "departure";
  savePlayer();
  const initialTravelScene = resolveTravelScene(startedExpedition);
  const initialVisualLoads = [
    preloadCharacterVisualSlot(PLAYER_CHARACTER_DEFINITION, "idle"),
    preloadCharacterVisualSlot(PLAYER_CHARACTER_DEFINITION, "walk"),
    ...selectedCompanions.map((companionId) => preloadCharacterVisualSlot(COMPANION_DEFINITIONS[companionId], "idle")),
    ...selectedCompanions.map((companionId) => preloadCharacterVisualSlot(COMPANION_DEFINITIONS[companionId], "walk")),
    ...(initialTravelScene?.assetId ? [preloadTravelSceneAsset(initialTravelScene.assetId)] : []),
    ...(initialTravelScene?.travelParallaxAssetId
      ? [preloadTravelSceneAsset(initialTravelScene.travelParallaxAssetId)]
      : []),
  ];
  await Promise.allSettled(initialVisualLoads);
  preloadCharacterVisuals(PLAYER_CHARACTER_DEFINITION);
  selectedCompanions.forEach((companionId) => preloadCharacterVisuals(COMPANION_DEFINITIONS[companionId]));
  game.expeditionStartPending = false;
  if (game.screen !== "preparation" || game.expedition !== startedExpedition || startedExpedition.status !== "active") return;
  showScreen("expedition");
  beginDeparturePresentation(startedExpedition);
}

const ENCOUNTER_PARTY_LAYOUT_FALLBACKS = Object.freeze({
  arthur: Object.freeze({ x: 0.42, y: 0.66 }),
  companion1: Object.freeze({ x: 0.58, y: 0.68 }),
  companion2: Object.freeze({ x: 0.70, y: 0.64 }),
});

const ENCOUNTER_PARTY_LAYOUT_SLOTS = Object.freeze(["arthur", "companion1", "companion2"]);

function encounterPartyLayoutPosition(encounter, slot) {
  const fallback = ENCOUNTER_PARTY_LAYOUT_FALLBACKS[slot] ?? ENCOUNTER_PARTY_LAYOUT_FALLBACKS.arthur;
  const authored = encounter?.encounterLayout?.[slot];
  const x = Number(authored?.x);
  const y = Number(authored?.y);
  return {
    x: clamp(Number.isFinite(x) ? x : fallback.x, 0, 1),
    y: clamp(Number.isFinite(y) ? y : fallback.y, 0, 1),
  };
}

function encounterPartyLayoutSlot(encounter, slot) {
  const position = encounterPartyLayoutPosition(encounter, slot);
  const authored = encounter?.encounterLayout?.[slot];
  const scale = Number(authored?.scale);
  const layer = Number(authored?.layer);
  return {
    ...position,
    facing: authored?.facing === "left" || authored?.facing === "right" ? authored.facing : null,
    scale: Number.isFinite(scale) && scale > 0 ? scale : 1,
    layer: Number.isInteger(layer) ? layer : null,
  };
}

function encounterHasExplicitPartyLayout(encounter, activeEncounter = null) {
  const hasAuthoredSlot = (layout) => Boolean(
    layout
    && typeof layout === "object"
    && !Array.isArray(layout)
    && ENCOUNTER_PARTY_LAYOUT_SLOTS.some((slot) => Object.prototype.hasOwnProperty.call(layout, slot)),
  );
  return hasAuthoredSlot(encounter?.encounterLayout)
    || hasAuthoredSlot(activeEncounter?.visualOverride?.encounterLayout);
}

function resolveEncounterVisualState(encounter, activeEncounter = null, livePartyLayout = null) {
  if (!encounter) {
    return { backgroundAssetId: null, layout: {}, hiddenSlots: new Set() };
  }
  const visualOverride = activeEncounter?.visualOverride;
  const authoredBackground = visualOverride?.backgroundAssetId;
  const baseBackground = encounter.visualAssetId;
  const backgroundAssetId = AssetCatalog.imagePath(authoredBackground)
    ? authoredBackground
    : AssetCatalog.imagePath(baseBackground)
      ? baseBackground
      : null;
  const useLivePartyLayout = !encounterHasExplicitPartyLayout(encounter, activeEncounter)
    && livePartyLayout?.layout;
  const layout = Object.fromEntries(ENCOUNTER_PARTY_LAYOUT_SLOTS.map((slot) => {
    const authoredBase = encounterPartyLayoutSlot(encounter, slot);
    const base = useLivePartyLayout && livePartyLayout.layout[slot]
      ? { ...authoredBase, ...livePartyLayout.layout[slot] }
      : authoredBase;
    const override = visualOverride?.encounterLayout?.[slot];
    return [slot, {
      x: clamp(Number.isFinite(Number(override?.x)) ? Number(override.x) : base.x, 0, 1),
      y: clamp(Number.isFinite(Number(override?.y)) ? Number(override.y) : base.y, 0, 1),
      facing: override?.facing === "left" || override?.facing === "right" ? override.facing : base.facing,
      scale: Number.isFinite(Number(override?.scale)) && Number(override.scale) > 0 ? Number(override.scale) : base.scale,
      layer: Number.isInteger(Number(override?.layer)) ? Number(override.layer) : base.layer,
    }];
  }));
  const hiddenSlots = new Set(
    [
      ...(Array.isArray(encounter.hiddenSlots) ? encounter.hiddenSlots : []),
      ...(Array.isArray(visualOverride?.hiddenSlots) ? visualOverride.hiddenSlots : []),
    ]
      .filter((slot) => ENCOUNTER_PARTY_LAYOUT_SLOTS.includes(slot)),
  );
  return { backgroundAssetId, layout, hiddenSlots };
}

function captureTravelPartyLayout() {
  const scene = document.querySelector("#travel-scene");
  const travelers = scene?.querySelector("#travelers");
  const sceneBox = scene?.getBoundingClientRect();
  if (!scene || !travelers || !sceneBox?.width || !sceneBox?.height) return null;
  const layout = Object.fromEntries([
    ["arthur", travelers.querySelector(".arthur")],
    ...[...travelers.querySelectorAll(".companion")].map((element, index) => [`companion${index + 1}`, element]),
  ].filter(([, element]) => element && !element.hidden).map(([slot, element]) => {
    const box = element.getBoundingClientRect();
    return [slot, {
      x: clamp((box.left + box.width / 2 - sceneBox.left) / sceneBox.width, 0, 1),
      y: clamp((box.top + box.height / 2 - sceneBox.top) / sceneBox.height, 0, 1),
    }];
  }));
  return { layout };
}

function encounterPartyLayoutAttributes(visualState, slot) {
  if (!visualState?.layout?.[slot]) return "";
  const position = visualState.layout[slot];
  const layer = position.layer === null ? "" : `;z-index:${position.layer}`;
  const facing = position.facing ? ` data-encounter-layout-facing="${position.facing}"` : "";
  return ` data-encounter-layout-slot="${slot}" data-encounter-layout-x="${position.x}" data-encounter-layout-y="${position.y}"${facing} style="--encounter-party-x:${position.x * 100}%;--encounter-party-y:${position.y * 100}%;--encounter-party-scale:${position.scale}${layer}"`;
}

function setEncounterPartyLayoutSlot(element, visualState, slot) {
  if (!element) return;
  if (!visualState?.layout?.[slot]) {
    element.removeAttribute("data-encounter-layout-slot");
    element.removeAttribute("data-encounter-layout-x");
    element.removeAttribute("data-encounter-layout-y");
    element.style.removeProperty("--encounter-party-x");
    element.style.removeProperty("--encounter-party-y");
    element.style.removeProperty("--encounter-party-scale");
    element.style.removeProperty("z-index");
    delete element.dataset.encounterLayoutFacing;
    return;
  }
  const position = visualState.layout[slot];
  element.dataset.encounterLayoutSlot = slot;
  element.dataset.encounterLayoutX = String(position.x);
  element.dataset.encounterLayoutY = String(position.y);
  element.style.setProperty("--encounter-party-x", `${position.x * 100}%`);
  element.style.setProperty("--encounter-party-y", `${position.y * 100}%`);
  element.style.setProperty("--encounter-party-scale", String(position.scale));
  if (position.layer === null) element.style.removeProperty("z-index");
  else element.style.zIndex = String(position.layer);
  if (position.facing) element.dataset.encounterLayoutFacing = position.facing;
  else delete element.dataset.encounterLayoutFacing;
}

function renderEncounterTravelers(companions, encounter, activeEncounter = null, livePartyLayout = null) {
  const visualState = resolveEncounterVisualState(encounter, activeEncounter, livePartyLayout);
  const hasAuthoredLayout = encounterHasExplicitPartyLayout(encounter, activeEncounter);
  const companionsMarkup = companions.map((companion, index) => {
    const slot = `companion${index + 1}`;
    const marker = companion.type === "mount" ? "&#x265e;" : "&#x265c;";
    const hidden = visualState.hiddenSlots.has(slot) ? " hidden" : "";
    return `<span class="companion companion-${companion.type}"${hidden}${encounterPartyLayoutAttributes(visualState, slot)}>${renderCharacterSprite(companion, "idle", "travel", marker, companion.name, { className: "traveler-character" })}</span>`;
  }).join("");
  const arthurHidden = visualState.hiddenSlots.has("arthur") ? " hidden" : "";
  return `<div class="travelers${hasAuthoredLayout ? " is-encounter-layout" : ""}" id="travelers" aria-hidden="true"><span class="arthur"${arthurHidden}${encounterPartyLayoutAttributes(visualState, "arthur")}>${renderCharacterSprite(PLAYER_CHARACTER_DEFINITION, "idle", "travel", "&#x265e;", PLAYER_CHARACTER_DEFINITION.name, { className: "traveler-character" })}</span>${companionsMarkup}</div>`;
}

function syncTravelerCharacterVisuals(expedition, activeEncounter = null) {
  const travelers = document.querySelector("#travelers");
  if (!travelers || !expedition) return;
  const moving = !activeEncounter && expedition.travelState === "traveling";
  const requestedSlot = moving ? "walk" : "idle";
  const mirrorInPlace = travelers.classList.contains("is-encounter-layout") && expedition.direction === "returning";
  const visualState = resolveEncounterVisualState(activeEncounter, expedition.activeEncounter);
  const mirrorForSlot = (slot) => visualState.layout?.[slot]?.facing
    ? visualState.layout[slot].facing === "left"
    : mirrorInPlace;
  setCharacterVisualState(travelers.querySelector(".arthur"), requestedSlot, { loop: true, mirror: mirrorForSlot("arthur") });
  travelers.querySelectorAll(".companion").forEach((element) => {
    const index = [...travelers.querySelectorAll(".companion")].indexOf(element);
    setCharacterVisualState(element, requestedSlot, { loop: true, mirror: mirrorForSlot(`companion${index + 1}`) });
  });
}

function applyEncounterPartyLayout(encounter, activeEncounter = null, livePartyLayout = null) {
  const travelers = document.querySelector("#travelers");
  if (!travelers) return;
  const visualState = resolveEncounterVisualState(encounter, activeEncounter, livePartyLayout);
  travelers.classList.toggle("is-encounter-layout", encounterHasExplicitPartyLayout(encounter, activeEncounter));
  const arthur = travelers.querySelector(".arthur");
  setEncounterPartyLayoutSlot(arthur, visualState, "arthur");
  if (arthur) arthur.hidden = visualState.hiddenSlots.has("arthur");
  [...travelers.querySelectorAll(".companion")].forEach((element, index) => {
    const slot = `companion${index + 1}`;
    setEncounterPartyLayoutSlot(element, visualState, slot);
    element.hidden = visualState.hiddenSlots.has(slot);
  });
}

function renderExpedition() {
  const expedition = game.expedition;
  const existingTravelScene = document.querySelector("#travel-scene");
  const previousPresentation = game.travelScenePresentation;
  const previousEncounterId = previousPresentation?.expedition === expedition
    ? previousPresentation.activeEncounterId ?? null
    : null;
  const nextEncounterId = expedition?.activeEncounter?.encounterId ?? null;
  const encounterOwnershipChanged = Boolean(
    existingTravelScene
    && previousPresentation?.expedition === expedition
    && previousEncounterId !== nextEncounterId,
  );
  if (previousPresentation?.expedition && previousPresentation.expedition !== expedition) {
    bumpTravelPresentationGeneration(expedition, "expedition-replacement");
  } else if (encounterOwnershipChanged) {
    bumpTravelPresentationGeneration(expedition, nextEncounterId ? "encounter-entry" : "encounter-exit");
  }
  const existingTravelTrack = currentTravelTrack();
  const activeEncounter = expedition?.activeEncounter
    ? EncounterManager.definitionFor(expedition)
    : null;
  if (activeEncounter && !game.travelPartyVisualState) {
    game.travelPartyVisualState = captureTravelPartyLayout();
  } else if (!activeEncounter) {
    game.travelPartyVisualState = null;
  }
  const companions = selectedCompanionIds(expedition)
    .map((companionId) => COMPANION_DEFINITIONS[companionId])
    .filter(Boolean);
  const preserveLiveTravelScene = Boolean(
    existingTravelScene
    && existingTravelTrack
    && game.travelScenePresentation?.expedition === expedition
    && !expedition?.combat
    && expedition?.travelState !== "camped",
  );
  if (expedition?.activeEncounter
    && !document.querySelector(".encounter-panel")
    && !preserveLiveTravelScene) {
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
  syncExpeditionAmbience(expedition, "travel", activeEncounter);
  const travelPresentation = resolveExpeditionTravelPresentation(expedition, activeEncounter);
  const travelBaseReady = !travelPresentation.assetId || travelSceneAssetReady(travelPresentation.assetId);
  const travelVisualSnapshot = !preserveLiveTravelScene
    && game.travelVisualState?.expedition === expedition
    && travelPresentation.kind !== "encounter"
    ? game.travelVisualState
    : null;
  const loadoutEntries = Object.values(expedition.selectedEquipment)
    .map((itemId) => ({ itemId, quantity: 1 }))
    .filter(({ itemId }) => ITEM_DEFINITIONS[itemId]);
  const expeditionPanelMarkup = activeEncounter
    ? renderEncounterPanel(expedition, activeEncounter)
    : `${renderTravelPanel(expedition, companions, loadoutEntries)}${renderExpeditionActionBar(expedition)}`;

  if (!preserveLiveTravelScene) {
    bumpTravelPresentationGeneration(expedition, "full-expedition-scene-rebuild");
  }
  const presentationState = travelScenePresentationFor(expedition);
  if (presentationState) presentationState.activeEncounterId = nextEncounterId;

  if (preserveLiveTravelScene) {
    const expeditionScreen = existingTravelScene.closest(".expedition-screen");
    if (expeditionScreen) {
      let panelHost = expeditionScreen.querySelector("#expedition-panel-host");
      if (!panelHost) {
        panelHost = document.createElement("div");
        panelHost.id = "expedition-panel-host";
      }
      [...expeditionScreen.children]
        .filter((child) => child !== existingTravelScene && child !== panelHost)
        .forEach((child) => child.remove());
      expeditionScreen.append(panelHost);
      panelHost.innerHTML = expeditionPanelMarkup;
      initializeCharacterSprites(expeditionScreen);
      applyEncounterPartyLayout(activeEncounter, expedition.activeEncounter, game.travelPartyVisualState);
      game.travelVisualState = null;
      updateTravelHud();
      return;
    }
  }

  ui.screenRoot.innerHTML = `
    <section class="screen expedition-screen" aria-label="Brocéliande expedition">
      <div data-asset-frame="travel" data-travel-generation="${currentTravelPresentationGeneration()}" class="visual-frame travel-scene ${activeEncounter ? "is-paused" : ""}${travelBaseReady ? " asset-image-active" : ""}" id="travel-scene">
        ${renderTravelVisualAsset(travelPresentation.assetId, activeEncounter?.title ?? expeditionDefinition(expedition).name, travelPresentation.motion, travelPresentation.sceneKey, travelPresentation.kind ?? (activeEncounter ? "encounter" : "travel"), travelPresentation.showSeamForegroundBetweenLoops, travelVisualSnapshot, travelPresentation.travelParallaxAssetId)}
        <div class="moon" aria-hidden="true"></div>
        <div class="forest forest-far" aria-hidden="true"></div>
        <div class="forest forest-near" aria-hidden="true"></div>
        ${renderEncounterTravelers(companions, activeEncounter, expedition.activeEncounter, game.travelPartyVisualState)}
        <div class="ground" aria-hidden="true"></div>
        ${renderTravelTransitionAsset(expedition)}
        <div class="direction-banner" id="direction-banner">${travelBannerText(expedition, activeEncounter)}</div>
        ${expedition.travelState === "departure" ? renderExpeditionDepartureBanner(expedition) : ""}
      </div>
      <div id="expedition-panel-host">${expeditionPanelMarkup}</div>
    </section>`;
  markTravelPresentationNode(document.querySelector("#travel-scene"));
  markTravelPresentationNode(document.querySelector("#travel-art"));
  initializeCharacterSprites(ui.screenRoot);
  applyTravelVisualSnapshot(travelVisualSnapshot);
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
  lockExpeditionRestControls();
}

function lockExpeditionRestControls() {
  const action = game.restAction;
  if (!action?.expedition || game.screen !== "expedition") return;
  document.querySelectorAll([
    '[data-action="pause-travel"]',
    '[data-action="resume-travel"]',
    '[data-action="return-to-safety"]',
    '[data-action="brief-rest"]',
    '[data-action="make-camp"]',
    '[data-action="set-pace"]',
    '[data-action="set-rations"]',
    '[data-action="abandon-expedition"]',
  ].join(",")).forEach((control) => {
    control.disabled = true;
  });
  const briefRestButton = document.querySelector('[data-action="brief-rest"]');
  if (briefRestButton) briefRestButton.closest(".paused-action-buttons")?.setAttribute("hidden", "");
}

function renderCamp(expedition) {
  bumpTravelPresentationGeneration(expedition, "camp-scene-entry");
  game.travelScenePresentation = null;
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
  const actionBusy = game.restAction?.expedition === expedition || Boolean(game.craftingAction);
  const tabs = [
    ["rest", "Rest"],
    ["cook", "Cook"],
    ["craft", "Craft"],
  ].map(([tabId, label]) => `<button class="camp-tab ${game.campTab === tabId ? "is-selected" : ""}" type="button" data-action="camp-tab" data-tab="${tabId}" aria-pressed="${game.campTab === tabId}" ${actionBusy ? "disabled" : ""}>${label}</button>`).join("");
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
        ${renderExpeditionResources(expedition, { contextual: true })}
        <details class="run-details expedition-details camp-resource-details">
          <summary class="run-details-summary">
            <span class="run-details-heading">Expedition Details</span>
            <span class="run-details-summary-text">${formatDistance(expedition.distance)} traveled · ${unsecuredLootDisplayValue(expedition)} unsecured</span>
          </summary>
          <div class="run-details-content">
            <p><span>Distance</span><strong>${formatDistance(expedition.distance)}</strong></p>
            <p><span>Unsecured Loot</span><strong>${unsecuredLootDisplayValue(expedition)}</strong></p>
          </div>
        </details>
        ${renderJourneyLog(expedition)}
        <div class="camp-tabs" role="tablist" aria-label="Camp actions">${tabs}</div>
        ${tabContent}
      </div>
      <div class="footer-actions camp-actions">
        <button class="text-button" type="button" data-action="leave-camp" ${actionBusy ? "disabled" : ""}>Leave Camp</button>
      </div>
    </section>`;
  updateTravelHud();
}

function renderCampRestPanel(expedition) {
  const cost = EXPEDITION_TUNING.campRest.provisionCost;
  const restAction = game.restAction?.context === "camp-rest"
    && game.restAction.expedition === expedition
    ? game.restAction
    : null;
  const actionBusy = Boolean(restAction || game.craftingAction);
  const canRest = expedition.provisions >= cost && !actionBusy;
  const eventStatus = expedition.campEventRolled
    ? expedition.lastCampEventResult
      ? `<p class="camp-event-status">This camp's event has resolved: ${expedition.lastCampEventResult}</p>`
      : '<p class="camp-event-status">This camp has already had its one event roll.</p>'
    : '<p class="camp-event-status">A proper rest may reveal one contextual camp event.</p>';
  return `
    <section class="camp-content camp-rest-content" aria-labelledby="camp-rest-title">
      <div class="section-title-row"><h2 id="camp-rest-title">Rest at Camp</h2><span>Costs ${cost} provisions</span></div>
      <p class="section-help">A camp rest restores more health than a brief roadside pause and can trigger one event for this camp cycle.</p>
      ${restAction
        ? renderExpeditionRestProgress(restAction, "Resting at Camp...", "Healing and recovery apply when the rest is complete.")
        : `${eventStatus}
          <button class="game-button" type="button" data-action="camp-rest" ${canRest ? "" : "disabled"}>${canRest ? `Rest · ${cost} Provisions` : `Need ${cost} Provisions`}</button>`}
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
  const restBusy = game.restAction?.expedition === expedition;
  if (expedition.travelState === "departure") {
    return `
      <div class="expedition-action-bar departure-action-bar" role="status" aria-live="polite">
        <span class="departure-action-status">Preparing to depart...</span>
        <button id="return-button" class="small-button travel-return-button" type="button" disabled>Return</button>
      </div>`;
  }
  return `
    <div class="expedition-action-bar" role="group" aria-label="Expedition travel actions">
      ${expedition.travelState === "paused"
        ? `<button id="resume-button" class="game-button travel-action-primary" type="button" data-action="resume-travel" ${restBusy ? "disabled" : ""}>Resume Travel</button>`
        : `<button id="pause-button" class="game-button travel-action-primary" type="button" data-action="pause-travel" ${restBusy ? "disabled" : ""}>Pause Travel</button>`}
      <button id="return-button" class="small-button travel-return-button" type="button" data-action="return-to-safety" ${restBusy ? "disabled" : ""}>Return</button>
    </div>`;
}

function travelBannerText(expedition, activeEncounter = null) {
  const route = pathLabel(expedition.currentPathId);
  if (!activeEncounter && expedition.travelState === "departure") return `${route} - Preparing to Depart`;
  if (activeEncounter) {
    return activeEncounter.eventKind === "camp"
      ? `Camped · ${route}`
      : `${route} · Encounter: ${activeEncounter.title}`;
  }
  if (expedition.travelState === "paused") return `${route} · Paused`;
  if (expedition.direction === "returning") return `${route} · Returning ←`;
  return `${route} · Traveling Outbound →`;
}

function renderExpeditionDepartureBanner(expedition) {
  const definition = expeditionDefinition(expedition);
  const title = definition?.departureTitle ?? definition?.name ?? pathLabel(expedition?.currentPathId);
  const regionTitle = definition?.regionTitle;
  const duration = Math.max(0, Number(EXPEDITION_TUNING.departurePresentationDurationMs) || 0);
  return `<div class="departure-banner is-visible" style="--departure-duration:${duration}ms" aria-hidden="true">
    <p class="departure-banner-title">${assetAttribute(title)}</p>
    ${regionTitle ? `<p class="departure-banner-region">${assetAttribute(regionTitle)}</p>` : ""}
  </div>`;
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
  const restBusy = game.restAction?.expedition === expedition;

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
        ${expedition.direction === "returning" ? `<p><span>Turned back at</span><strong>${formatDistance(expedition.maxDistanceReached)}</strong></p>` : ""}
        <div class="run-detail-collection"><span>Loadout</span><div class="run-item-list">${renderItemChips(loadout, "No equipment selected")}</div></div>
        <div class="run-detail-collection"><span>Carried</span><div class="run-item-list">${formatCarriedItems(expedition.carriedItems)}</div></div>
        <div class="run-detail-collection"><span>Material Bag</span><div class="run-item-list">${renderMaterialBagChips(expedition, "No materials carried")}</div></div>
        <div class="run-detail-collection"><span>Unsecured</span><div class="unsecured-detail"><p class="unsecured-detail-summary">${unsecuredLootSummary(expedition)}</p><div id="loot-list" class="loot-list">${renderDiscoveryList(expedition)}</div></div></div>
        </div>
        <div class="run-details-actions">
          <button class="text-button danger-button abandon-button" type="button" data-action="abandon-expedition" ${restBusy ? "disabled" : ""}>Abandon Expedition</button>
        </div>
      </details>
    </div>`;
}

function renderTravelSettings(expedition) {
  const restBusy = game.restAction?.expedition === expedition;
  const briefRestAction = game.restAction?.context === "brief-rest"
    && game.restAction.expedition === expedition
    ? game.restAction
    : null;
  const paceButtons = Object.values(EXPEDITION_TUNING.travelPaces).map((pace) => (
    `<button class="setting-button ${expedition.paceId === pace.id ? "is-selected" : ""}" type="button" data-action="set-pace" data-pace-id="${pace.id}" aria-pressed="${expedition.paceId === pace.id}" title="${pace.description}" ${restBusy ? "disabled" : ""}>${pace.name}</button>`
  )).join("");
  const rationButtons = Object.values(EXPEDITION_TUNING.rationLevels).map((ration) => (
    `<button class="setting-button ${expedition.rationId === ration.id ? "is-selected" : ""}" type="button" data-action="set-rations" data-ration-id="${ration.id}" aria-pressed="${expedition.rationId === ration.id}" title="${ration.description}" ${restBusy ? "disabled" : ""}>${ration.name}</button>`
  )).join("");
  const pace = ExpeditionRules.paceDefinition(expedition.paceId);
  const ration = ExpeditionRules.rationDefinition(expedition.rationId);
  const paused = expedition.travelState === "paused";
  const departing = expedition.travelState === "departure";
  const settingControls = paused
    ? `<div class="setting-row"><span>Pace</span><div class="setting-buttons">${paceButtons}</div></div>
       <div class="setting-row"><span>Rations</span><div class="setting-buttons">${rationButtons}</div></div>`
    : "";
  return `
    <section class="travel-settings journey-controls ${paused ? "is-paused" : ""}" aria-labelledby="journey-controls-title">
      <div class="journey-heading">
        <p class="eyebrow" id="journey-controls-title">Journey</p>
        <span class="journey-state">${departing ? "Departing" : paused ? "Paused" : expedition.direction === "returning" ? "Returning" : "Traveling"}</span>
      </div>
      ${settingControls}
      ${departing
        ? '<p class="journey-summary is-compact-summary">The company is making ready.</p>'
        : paused ? "" : `<p class="journey-summary is-compact-summary">${pace.name} pace &middot; ${ration.name} rations</p>`}
      ${paused
        ? `<div class="paused-actions">
             <p class="eyebrow">Paused Actions</p>
             <div class="paused-action-buttons">
               <button class="small-button" type="button" data-action="brief-rest" ${expedition.provisions >= EXPEDITION_TUNING.briefRest.provisionCost ? "" : "disabled"}>Brief Rest &middot; ${EXPEDITION_TUNING.briefRest.provisionCost} Food</button>
               <button class="small-button make-camp-button" type="button" data-action="make-camp">Make Camp</button>
             </div>
           </div>`
         : ""}
      ${briefRestAction
        ? renderExpeditionRestProgress(briefRestAction, "Resting...", "Healing and recovery apply when the rest is complete.")
        : ""}
    </section>`;
}

function renderEncounterPanel(expedition, encounter) {
  const active = expedition.activeEncounter;
  if (active.phase === "dialogue") {
    return `
      <div class="travel-panel encounter-panel encounter-dialogue-panel" aria-live="polite">
        ${renderExpeditionResources(expedition, { contextual: true })}
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
      ${renderExpeditionResources(expedition, { contextual: true })}
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
      ${renderExpeditionResources(expedition, { contextual: true })}
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
    <div class="travel-panel encounter-panel encounter-result-panel" aria-live="off">
      ${renderExpeditionResources(expedition, { contextual: true })}
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

function renderCombatPanelMarkup(combat) {
  const activeActor = combat.allies.find((ally) => ally.id === combat.activeActorId);
  const awaitingAction = combat.status === "awaitingAction";
  const choosingTarget = ["enemyTarget", "allyTarget"].includes(combat.interactionMode);
  const selectedEnemy = combat.enemies.find((enemy) => enemy.id === combat.selectedEnemyId && enemy.hp > 0);
  const targetSummary = selectedEnemy
    ? `${selectedEnemy.name} selected`
    : choosingTarget ? "Choose a target" : "";
  return `<div class="combat-state-line">
          <div>
            <p class="eyebrow">${awaitingAction ? "Current Turn" : "Battle in Progress"}</p>
            <strong>${activeActor ? `${activeActor.name}'s turn` : "Action gauges are filling"}</strong>
          </div>
          ${targetSummary ? `<span class="combat-target-summary">${targetSummary}</span>` : ""}
        </div>
        <div class="combat-controls">
          ${renderCombatControls(combat, activeActor)}
        </div>
        <div class="combat-log" aria-live="polite">
          <strong class="combat-log-label">Combat Log</strong>
          <div class="combat-log-entries">${combat.log.slice(-4).map((message) => `<p>${message}</p>`).join("")}</div>
        </div>`;
}

const COMBAT_HUMANOID_ENEMY_IDS = new Set([
  "bandit",
  "bandit_leader",
  "summoned_guardian",
  "fountain_knight",
  "false_knight",
  "leper_knight",
  "morgans_huntsman",
  "briar_knight",
  "bound_warden",
]);

function combatEnemyFormationClass(combat) {
  if (combat?.enemies?.length !== 3) return "";
  const isHumanoidFormation = combat.enemies.every((combatant) => {
    const definitionId = combatant.definitionId ?? combatant.id?.replace(/_\d+$/, "");
    return COMBAT_HUMANOID_ENEMY_IDS.has(definitionId);
  });
  return isHumanoidFormation ? " formation-three-humanoid" : "";
}

function renderCombat(expedition, combat) {
  syncExpeditionAmbience(expedition, "travel");
  const encounter = expedition?.activeEncounter
    ? EncounterManager.definitionFor(expedition)
    : null;
  const combatBackground = resolveCombatBackground(expedition, encounter);
  const combatBackgroundPath = combatBackground.assetId
    ? AssetCatalog.imagePath(combatBackground.assetId)
    : null;
  const awaitingAction = combat.status === "awaitingAction";
  const choosingTarget = ["enemyTarget", "allyTarget"].includes(combat.interactionMode);
  ui.screenRoot.innerHTML = `
    <section class="screen expedition-screen combat-screen" aria-label="Combat">
      <div class="visual-frame combat-scene ${awaitingAction ? "is-paused" : ""} ${choosingTarget ? "is-choosing-target" : ""} ${combatBackgroundPath ? "has-combat-background" : ""}"
        data-combat-background-source="${assetAttribute(combatBackground.source)}"
        data-combat-background-asset-id="${assetAttribute(combatBackground.assetId ?? "")}">
        ${combatBackgroundPath ? `<img class="combat-background" src="${assetAttribute(combatBackgroundPath)}" alt="" aria-hidden="true" loading="eager" decoding="async" onerror="this.hidden=true; this.closest('.combat-scene').classList.remove('has-combat-background')">` : ""}
        <div class="combat-formation combat-party formation-count-${combat.allies.length}" aria-label="Party">
          ${combat.allies.map((combatant) => renderCombatant(combatant, combat)).join("")}
        </div>
        <div class="combat-battlefield-space" aria-hidden="true"></div>
        <div class="combat-formation combat-enemies formation-count-${combat.enemies.length}${combatEnemyFormationClass(combat)}" aria-label="Enemies">
          ${combat.enemies.map((combatant) => renderCombatant(combatant, combat)).join("")}
        </div>
      </div>
      <div class="combat-panel">${renderCombatPanelMarkup(combat)}</div>
    </section>`;
  initializeCharacterSprites(ui.screenRoot);
  updateCombatHud();
}

function renderCombatant(combatant, combat) {
  const presentedHp = combatPresentationDisplayedHp(combat, combatant);
  const defeated = presentedHp <= 0;
  const ready = combatant.id === combat.activeActorId;
  const wasHit = combatantHitPresentationActive(combatant);
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
    .filter(Boolean).join(" &middot; ");
  const resource = combatResourceDisplay(combatant);
  const formationCount = combatant.side === "ally" ? combat.allies.length : combat.enemies.length;
  const combatLayoutScale = combatCharacterLayoutScale(combatant, formationCount);
  const tag = selectable ? "button" : "article";
  const targetAttributes = selectable
    ? `type="button" data-action="combat-target" data-target-id="${combatant.id}" aria-label="Target ${combatant.name}"${combatant.side === "enemy" ? ` aria-pressed="${selected}"` : ""}`
    : "";
  const markup = `
    <${tag} class="combatant ${combatant.side} ${defeated ? "is-defeated" : ""} ${ready ? "is-ready" : ""} ${selectable ? "is-selectable" : ""} ${selected ? "is-selected" : ""} ${wasHit ? "was-hit" : ""}"
      data-combatant-id="${combatant.id}" ${targetAttributes}>
      <div class="combat-unit-anchor">
        <div class="combat-unit-hud">
          ${intent}
          <div class="combatant-heading"><strong>${combatant.name}</strong><span class="combat-hp-label" id="combat-hp-${combatant.id}">${Math.ceil(presentedHp)} / ${combatant.maxHp}</span></div>
          <div class="combat-bar hp-bar"><span id="combat-hp-bar-${combatant.id}" style="width:${(presentedHp / combatant.maxHp) * 100}%"></span></div>
          ${resource ? `<div class="combatant-resource"><div class="combat-resource-heading"><span>${resource.label}</span><strong>${resource.current} / ${resource.maximum}</strong></div><div class="combat-bar resource-bar"><span style="width:${resource.percent}%"></span></div></div>` : ""}
          <div class="combat-bar gauge-bar"><span id="combat-gauge-${combatant.id}" style="width:${combatGaugePercent(combatant)}%"></span></div>
        </div>
        <div data-asset-frame="combat" class="combat-unit-visual" data-combat-base-scale="${combatLayoutScale}" style="--combat-character-layout-scale:${combatLayoutScale}" aria-hidden="true">${renderCombatVisual(combatant, combatFallbackVisual(combatant), combatant.name)}</div>
        ${effects ? `<small class="combatant-statuses">${effects}</small>` : ""}
      </div>
    </${tag}>`;
  return markup;
}

function combatResourceDisplay(combatant) {
  if (combatant.resourceDisplay) return combatant.resourceDisplay;
  if (combatant.id !== "arthur") return null;
  const maximum = Math.max(1, Number(game.player.maxFaith) || 1);
  const current = Math.max(0, Number(game.player.faith) || 0);
  return {
    label: "Faith",
    current,
    maximum,
    percent: clamp((current / maximum) * 100, 0, 100),
  };
}

function combatantHitPresentationActive(combatant) {
  const eventId = combatant.presentationHitEvent;
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  if (eventId !== combatant.lastRenderedPresentationHitEvent) {
    combatant.lastRenderedPresentationHitEvent = eventId;
    combatant.presentationHitUntil = eventId ? Number(combatant.presentationHitUntil) || now + 220 : 0;
  }
  return Number(combatant.presentationHitUntil) > now;
}

function combatFallbackVisual(combatant) {
  if (combatant.side === "enemy") return "&#x25c6;";
  if (combatant.id === "arthur") return "&#x265e;";
  const companion = COMPANION_DEFINITIONS[combatant.definitionId ?? combatant.id];
  return companion?.type === "mount" ? "&#x265e;" : "&#x265c;";
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
        ].filter(Boolean).join(" &middot; ");
        const tags = Array.isArray(ability.tags) && ability.tags.length ? ` &middot; ${ability.tags.join(", ")}` : "";
        return `<button type="button" data-action="combat-ability" data-ability-id="${ability.id}" ${availability.usable ? "" : "disabled"}><strong>${ability.name}</strong><span>${ability.description ?? ""}</span><small class="combat-ability-meta">${limits}${tags}</small></button>`;
      }).join("")
      : '<p class="combat-empty-menu">No usable abilities.</p>';
    return `<div class="combat-submenu-heading"><p>${activeActor.name}'s Abilities</p><button type="button" data-action="combat-menu-back">Back</button></div><div class="combat-action-grid combat-submenu-list">${entries}</div>`;
  }
  if (combat.interactionMode === "items") {
    const items = CombatSystem.availableItems(combat, game.expedition);
    const entries = items.length > 0
      ? items.map((entry) => `<button type="button" data-action="combat-item" data-item-id="${entry.itemId}"><strong>${entry.item.name} &times;${entry.quantity}</strong><span>${entry.item.effects.combat.description}</span></button>`).join("")
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
    const presentedHp = combatPresentationDisplayedHp(combat, combatant);
    const hpLabel = document.querySelector(`#combat-hp-${combatant.id}`);
    const hpBar = document.querySelector(`#combat-hp-bar-${combatant.id}`);
    if (hpLabel) hpLabel.textContent = `${Math.ceil(presentedHp)} / ${combatant.maxHp}`;
    if (hpBar) hpBar.style.width = `${clamp((presentedHp / combatant.maxHp) * 100, 0, 100)}%`;
    const element = combatPresentationCombatantElement(combatant.id);
    if (element) element.classList.toggle("is-defeated", presentedHp <= 0);
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

function renderExpeditionResources(expedition, options = {}) {
  const materialBagUsed = MaterialRules.expeditionTotal(expedition);
  const provisionStatus = ExpeditionRules.returnProvisionStatus(expedition);
  const contextual = options.contextual === true;
  const resourceCard = (label, value, id = "", className = "") => `
      <div class="resource-card ${className}"${id ? ` id="${id}-card"` : ""}>
        <span>${label}</span><strong${id ? ` id="${id}"` : ""}>${value}</strong>
      </div>`;
  const cards = contextual
    ? `
      <div id="provisions-card" class="resource-card provisions-card provision-state-${provisionStatus.state}" data-provision-state="${provisionStatus.state}">
        <span>Provisions</span><strong id="provisions-value">${formatResource(expedition.provisions)}</strong>
      </div>
      ${resourceCard("Material Bag", `${materialBagUsed} / ${MaterialRules.capacity()}`, "material-bag-count", "material-bag-card")}
      ${resourceCard("Health", `${Math.ceil(expedition.health)} / ${InjuryRules.effectiveMaxHealth(expedition, "arthur")}`, "health-value")}
      ${resourceCard("Faith", `${game.player.faith} / ${game.player.maxFaith}`, "faith-value")}`
    : `
      ${resourceCard("Distance", formatDistance(expedition.distance), "distance-value")}
      ${resourceCard("Unsecured Loot", unsecuredLootDisplayValue(expedition), "loot-count")}
      <div id="provisions-card" class="resource-card provisions-card provision-state-${provisionStatus.state}" data-provision-state="${provisionStatus.state}">
        <span>Provisions</span><strong id="provisions-value">${formatResource(expedition.provisions)}</strong>
      </div>
      ${resourceCard("Material Bag", `${materialBagUsed} / ${MaterialRules.capacity()}`, "material-bag-count", "material-bag-card")}
      ${resourceCard("Health", `${Math.ceil(expedition.health)} / ${InjuryRules.effectiveMaxHealth(expedition, "arthur")}`, "health-value")}
      ${resourceCard("Faith", `${game.player.faith} / ${game.player.maxFaith}`, "faith-value")}`;
  return `
    <div class="resource-grid compact-resources ${contextual ? "contextual-resources" : "full-resources"}">
      ${cards}
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
  const choiceTone = encounterChoiceTone(choice);
  return `
    <button class="encounter-choice ${choiceTone} ${locked ? "is-locked" : ""}" type="button"
      data-action="encounter-choice" data-choice-id="${choice.id}" ${locked ? "disabled" : ""}>
      <strong>${choice.label}</strong>
      ${locked ? `<span>Locked — ${availability.reason}</span>` : ""}
    </button>`;
}

function encounterChoiceTone(choice) {
  const requirements = choice.requirements ?? [];
  const hasSpecificRequirement = requirements.some((requirement) => [
    "availableExpeditionItem", "carriedItem", "equippedItem", "ownsItem", "companion", "knowledge",
  ].includes(requirement.type));
  const hasDangerousOutcome = (effects = []) => effects.some((effect) => {
    if (effect.type === "startCombat") return true;
    if (effect.type === "modifyResource" && effect.resource === "health" && Number(effect.amount) < 0) return true;
    return hasDangerousOutcome(effect.effects) || (effect.options ?? []).some((option) => hasDangerousOutcome(option.effects));
  });
  if (hasDangerousOutcome([...(choice.outcomes ?? []), ...(choice.costs ?? [])])) return "is-dangerous";
  if (hasSpecificRequirement) return "is-specific";
  return "is-ordinary";
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
    || game.restAction
    || expedition.activeEncounter
    || !["traveling", "paused"].includes(expedition.travelState)) {
    return;
  }

  ExpeditionRules.beginReturn(expedition);
  announceTravelEvent("The company turns back toward the forest edge.");
  updateTravelHud();
}

function setExpeditionPace(paceId) {
  const expedition = game.expedition;
  if (!expedition || expedition.status !== "active" || expedition.activeEncounter || expedition.combat
    || game.restAction || !["traveling", "paused"].includes(expedition.travelState)) return;
  if (ExpeditionRules.setPace(expedition, paceId)) refreshExpedition();
}

function setExpeditionRations(rationId) {
  const expedition = game.expedition;
  if (!expedition || expedition.status !== "active" || expedition.activeEncounter || expedition.combat
    || game.restAction || !["traveling", "paused"].includes(expedition.travelState)) return;
  if (ExpeditionRules.setRation(expedition, rationId)) refreshExpedition();
}

function pauseTravel() {
  if (game.restAction) return;
  if (ExpeditionRules.pause(game.expedition)) refreshExpedition();
}

function resumeTravel() {
  if (game.restAction) return;
  if (ExpeditionRules.resume(game.expedition)) refreshExpedition();
}

function briefRest() {
  const expedition = game.expedition;
  if (game.restAction || game.craftingAction) return;
  const quote = ExpeditionRules.briefRestQuote(expedition);
  if (!quote.available) {
    showToast({ title: "Cannot Rest", message: quote.reason === "insufficient-provisions" ? "There are not enough provisions for a brief rest." : "Brief Rest is only available while paused.", type: "warning" });
    return;
  }
  beginRestAction("brief-rest", {
    expedition,
    screen: "expedition",
    durationMs: EXPEDITION_TUNING.briefRest.actionDurationMs,
  });
  refreshExpedition();
}

function makeCamp() {
  if (game.restAction) return;
  if (ExpeditionRules.enterCamp(game.expedition)) {
    game.campTab = "rest";
    refreshExpedition();
  }
}

function setCampTab(tabId) {
  if (!["rest", "cook", "craft"].includes(tabId) || game.expedition?.travelState !== "camped" || game.restAction) return;
  game.campTab = tabId;
  refreshExpedition();
}

function campRest() {
  const expedition = game.expedition;
  if (game.restAction || game.craftingAction) return;
  const preparation = ExpeditionRules.prepareCampRest(expedition, game.player);
  if (!preparation.applied) {
    showToast({ title: "Cannot Rest", message: preparation.reason === "insufficient-provisions" ? "There are not enough provisions for a camp rest." : "The company is not settled at camp.", type: "warning" });
    return;
  }
  const durationMs = Math.max(0, Number(EXPEDITION_TUNING.campRest.actionDurationMs) || 0);
  const eventDelayMs = preparation.eventId
    ? durationMs * (0.25 + Math.random() * 0.6)
    : null;
  beginRestAction("camp-rest", {
    expedition,
    screen: "expedition",
    durationMs,
    eventId: preparation.eventId,
    eventDelayMs,
  });
  refreshExpedition();
}

function leaveCamp() {
  if (game.restAction) return;
  if (ExpeditionRules.leaveCamp(game.expedition)) refreshExpedition();
}

function completeExpeditionRestAction(action) {
  if (!isCurrentRestAction(action) || !["brief-rest", "camp-rest"].includes(action.context)) {
    if (game.restAction === action) cancelRestAction();
    return;
  }
  if (action.interruptionTimerId !== null) {
    window.clearTimeout(action.interruptionTimerId);
    action.interruptionTimerId = null;
  }
  action.interruptionState = "completed";
  game.restAction = null;
  const result = action.context === "brief-rest"
    ? ExpeditionRules.briefRest(action.expedition)
    : ExpeditionRules.commitCampRest(action.expedition, game.player, { eventId: action.eventId });
  if (!result.applied) {
    showToast({
      title: "Rest Cancelled",
      message: action.context === "brief-rest"
        ? "The company could not complete its brief rest."
        : "The company could not complete its camp rest.",
      type: "warning",
    });
    refreshExpedition();
    return;
  }
  if (action.context === "brief-rest") {
    showToast({ title: "Brief Rest", message: `The company recovers ${result.totalHealingAmount} health for ${result.cost} provision.`, type: "success" });
  } else {
    showToast({ title: "Camp Rest", message: `The company recovers ${result.totalHealingAmount} health.`, type: "success" });
  }
  refreshExpedition();
}

function interruptCampRest(action) {
  if (!isCurrentRestAction(action) || action.context !== "camp-rest" || !action.eventId) return;
  if (action.interruptionTimerId !== null) {
    window.clearTimeout(action.interruptionTimerId);
    action.interruptionTimerId = null;
  }
  action.interruptionState = "interrupted";
  game.restAction = null;
  if (!CampRules.startPreparedCampEvent(action.expedition, action.eventId)) {
    refreshExpedition();
    return;
  }
  renderExpedition();
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

  const rewardStartIndex = expedition.activeEncounter.rewards?.length ?? 0;
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
      finishEncounterResolution(completed, pendingExpedition, rewardStartIndex);
    }, result.delayMs);
    renderExpedition();
    return;
  }

  finishEncounterResolution(result, expedition, rewardStartIndex);
}

function finishEncounterResolution(result, expedition, rewardStartIndex = null) {
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

  if (result.locationStop?.locationId) {
    enterExpeditionLocation(expedition, result.locationStop.locationId);
    return;
  }

  if (!result.combatStarted && !result.dialogueStarted) {
    queueEncounterRewardReveal(expedition, "encounter", rewardStartIndex);
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
  [...combat.allies, ...combat.enemies].forEach((combatant) => {
    preloadCharacterVisuals(
      characterDefinitionForCombatant(combatant),
      combatant.side === "enemy" ? ["idle", "attack"] : CHARACTER_VISUAL_SLOTS,
    );
  });
  AudioManager.playSemantic("encounter");
  return true;
}

function chooseCombatAction(actionId) {
  const expedition = game.expedition;
  const combat = expedition?.combat;
  if (!combat) {
    return;
  }
  const eventStart = combat.events.length;
  const result = CombatSystem.chooseAction(combat, expedition, actionId);
  handleCombatInteractionResult(expedition, combat, result, combat.events.slice(eventStart));
}

function chooseCombatTarget(targetId) {
  const expedition = game.expedition;
  const combat = expedition?.combat;
  if (!combat) {
    return;
  }
  if (combat.pendingActionId) {
    const eventStart = combat.events.length;
    const result = CombatSystem.choosePendingTarget(combat, expedition, targetId);
    handleCombatInteractionResult(expedition, combat, result, combat.events.slice(eventStart));
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
  const eventStart = combat.events.length;
  const result = CombatSystem.chooseAbility(combat, expedition, abilityId);
  handleCombatInteractionResult(expedition, combat, result, combat.events.slice(eventStart));
}

function chooseCombatItem(itemId) {
  const expedition = game.expedition;
  const combat = expedition?.combat;
  if (!combat) return;
  const eventStart = combat.events.length;
  const result = CombatSystem.chooseItem(combat, expedition, itemId);
  handleCombatInteractionResult(expedition, combat, result, combat.events.slice(eventStart));
}

function handleCombatInteractionResult(expedition, combat, result, actionEvents = []) {
  if (result?.menu || result?.needsTarget || result?.unavailable) {
    refreshCombat(expedition, combat);
    return;
  }
  if (result?.resolved) {
    enqueueCombatActionPresentations(combat, actionEvents);
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
    if (expedition.combat === combat) pumpCombatPresentation(expedition, combat);
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
  const beforePresentation = combatPresentationKey(combat);
  const eventStart = combat.events.length;
  const update = CombatSystem.update(combat, expedition, deltaSeconds);
  const actionEvents = combat.events.slice(eventStart);
  enqueueCombatActionPresentations(combat, actionEvents);
  if (update.result) {
    finishCombatResolution(expedition);
    pumpCombatPresentation(expedition, combat);
  } else if (actionEvents.length > 0 || (update.changed && beforePresentation !== combatPresentationKey(combat))) {
    refreshCombat(expedition, combat);
    pumpCombatPresentation(expedition, combat);
  }
}

function combatPresentationKey(combat) {
  const combatants = [...(combat?.allies ?? []), ...(combat?.enemies ?? [])].map((combatant) => ({
    id: combatant.id,
    hp: combatant.hp,
    intentId: combatant.intentId,
    defending: combatant.defending,
    interceding: combatant.interceding,
    statuses: Object.fromEntries(Object.entries(combatant.statuses ?? {}).map(([id, status]) => [id, status.remainingActivations])),
  }));
  return JSON.stringify({
    status: combat?.status,
    result: combat?.result,
    activeActorId: combat?.activeActorId,
    interactionMode: combat?.interactionMode,
    selectedEnemyId: combat?.selectedEnemyId,
    pendingTargetPrompt: combat?.pendingTargetPrompt,
    readyQueue: combat?.readyQueue,
    logLength: combat?.log?.length,
    combatants,
  });
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
  if (combatPresentationHasPending(combat)) {
    const controller = combatPresentationController(combat);
    controller.presentationFinishPending = true;
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
  const completed = EncounterManager.completeCombat(expedition, game.player, result, {
    combat,
    failExpedition,
    startDialogue: (dialogueId) => startEncounterDialogue(expedition, dialogueId),
  });
  if (expedition.status === "active") {
    if (!completed.combatStarted && !completed.dialogueStarted) {
      queueEncounterRewardReveal(expedition, "combat");
    }
    renderExpedition();
  }
}

function refreshCombat(expedition, combat) {
  if (combatPresentationHasPending(combat) && document.querySelector(".combat-scene")) {
    const panel = document.querySelector(".combat-panel");
    if (panel) panel.innerHTML = renderCombatPanelMarkup(combat);
    updateCombatHud();
    return;
  }
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
  if (typeof RewardRevealSystem !== "undefined" && RewardRevealSystem.isBlocking()) return;
  if (!expedition || !EncounterManager.continueJourney(expedition)) {
    return;
  }
  renderExpedition();
}

function triggerDebugEncounter() {
  if (!DEBUG_TOOLS_ENABLED || !game.expedition || game.expedition.activeEncounter) {
    return;
  }
  cancelRestAction();
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
  cancelRestAction();
  const combatId = document.querySelector("#debug-combat-select")?.value ?? "wild_boar";
  if (COMBAT_DEFINITIONS[combatId] && startCombat(expedition, combatId)) {
    renderExpedition();
  }
}

function completeReturn() {
  const expedition = game.expedition;
  clearPendingEncounterActionTimer();
  cancelRestAction();
  game.locationContext = null;
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
  queueRewardRevealPresentation(
    rewardBucketEntries(expedition.returnRewardContents),
    {
      source: "return",
      eventId: `return:${game.rewardPresentationContextId}:${expedition.returnRewardTier ?? "none"}`,
    },
  );
}

function failExpedition(reason) {
  const expedition = game.expedition;
  if (!expedition || expedition.status !== "active") {
    return;
  }

  clearPendingEncounterActionTimer();
  cancelRestAction();
  game.locationContext = null;
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
        : reward.type === "ability" ? AbilityRules.definition(reward.abilityId)
          : reward.type === "knowledge" ? KNOWLEDGE_DEFINITIONS[reward.knowledgeId] : null;
}

function rewardIconKind(reward) {
  if (reward.type === "gold") return "currency";
  if (reward.type === "material") {
    const definition = MaterialRules.definition(reward.materialId);
    return itemIconKind("material", { ...definition, id: reward.materialId, category: "material" });
  }
  if (reward.type === "recipe") return "recipe";
  if (reward.type === "ability") return "ability";
  if (reward.type === "knowledge") return "knowledge";
  const definition = rewardDefinition(reward);
  return itemIconKind(definition?.category, definition);
}

function rewardPresentation(reward) {
  const definition = rewardDefinition(reward);
  const rarityRank = RARITY_DEFINITIONS[definition?.rarity ?? "common"]?.rank ?? 0;
  if (reward.type === "recipe" || definition?.questItem || definition?.category === "quest"
    || definition?.category === "relic" || rarityRank >= 3
    || (rarityRank >= 2 && definition?.category !== "valuable" && reward.type !== "material")) {
    return "major";
  }
  if (rarityRank >= 1 || ["valuable", "curiosity"].includes(definition?.category)) {
    return "notable";
  }
  return "routine";
}

function rewardRevealTier(reward) {
  return ({ routine: "minor", notable: "normal", major: "major" })[rewardPresentation(reward)] ?? "minor";
}

function rewardRevealLabel(reward, tier, definition) {
  if (tier !== "major") return "FOUND";
  if (reward.type === "recipe") return "RECIPE LEARNED";
  if (reward.type === "ability") return "ABILITY LEARNED";
  if (reward.type === "knowledge") return "KNOWLEDGE LEARNED";
  if (definition?.questItem || definition?.category === "quest") return "QUEST ITEM SECURED";
  if (definition?.category === "relic") return "RELIC FOUND";
  return "DISCOVERY FOUND";
}

function rewardRevealAnnouncement(reward, name) {
  const quantity = Math.max(0, Math.floor(Number(reward.quantity) || 0));
  if (reward.type === "recipe") return `Learned the ${name} recipe.`;
  if (reward.type === "ability") return `Learned ${name}.`;
  if (reward.type === "knowledge") return `Learned ${name}.`;
  return `Found ${quantity > 1 ? `${quantity} ` : ""}${name}.`;
}

function rewardRevealModel(reward) {
  if (!rewardHasCollectedQuantity(reward)) return null;
  const definition = rewardDefinition(reward);
  const rarity = definition?.rarity ?? "common";
  const tier = rewardRevealTier(reward);
  const name = rewardDisplayName(reward);
  return {
    type: reward.type,
    itemId: reward.itemId,
    materialId: reward.materialId,
    recipeId: reward.recipeId,
    abilityId: reward.abilityId,
    knowledgeId: reward.knowledgeId,
    visualAssetId: reward.visualAssetId ?? definition?.visualAssetId ?? null,
    name,
    quantity: Math.max(0, Math.floor(Number(reward.quantity) || 0)),
    tier,
    rarity,
    rarityName: RARITY_DEFINITIONS[rarity]?.name ?? capitalize(rarity),
    categoryLabel: rewardCategoryLabel(reward),
    description: reward.type === "gold"
      ? "Coins recovered from the journey."
      : definition?.description ?? "A useful discovery from the road.",
    iconHtml: categoryIcon(rewardIconKind(reward)),
    revealLabel: rewardRevealLabel(reward, tier, definition),
    announcement: rewardRevealAnnouncement(reward, name),
    soundRole: tier === "major" ? "majorLoot" : "loot",
  };
}

function queueRewardRevealPresentation(rewards = [], options = {}) {
  if (typeof RewardRevealSystem === "undefined") return false;
  const models = rewards.map(rewardRevealModel).filter(Boolean);
  if (models.length === 0) return false;
  return RewardRevealSystem.queue(models, {
    contextKey: `expedition:${game.rewardPresentationContextId}`,
    eventId: options.eventId ?? `${options.source ?? "reward"}:${game.rewardPresentationContextId}`,
  });
}

function queueEncounterRewardReveal(expedition, source = "encounter", rewardStartIndex = null) {
  const active = expedition?.activeEncounter;
  if (!active || !Array.isArray(active.rewards)) return false;
  const cursor = Number.isInteger(active.rewardRevealCursor) ? active.rewardRevealCursor : 0;
  const requestedStart = Number.isInteger(rewardStartIndex) ? rewardStartIndex : cursor;
  const start = Math.max(cursor, requestedStart, 0);
  const rewards = active.rewards.slice(start);
  if (rewards.length === 0) return false;
  const eventId = `${source}:${game.rewardPresentationContextId}:${active.eventKind ?? "encounter"}:${active.encounterId}:${start}:${active.rewards.length}`;
  const queued = queueRewardRevealPresentation(rewards, { source, eventId });
  if (queued) active.rewardRevealCursor = active.rewards.length;
  return queued;
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
          : reward.type === "knowledge" ? "Knowledge"
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
    ["Knowledge", routineAndNotable.filter((reward) => reward.type === "knowledge")],
  ].filter(([, group]) => group.length > 0);
  return `<div class="summary-reward-collection">
    ${major.length > 0 ? `<div class="summary-major-rewards"><h3>Highlighted Discoveries</h3>${renderRewardCards(major, { variant: "summary" })}</div>` : ""}
    ${groups.map(([label, group]) => `<div class="summary-reward-group"><h3>${label}</h3><ul class="summary-reward-list">${group.map(renderCompactRewardRow).join("")}</ul></div>`).join("")}
  </div>`;
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

        ${returned ? `
          <section class="summary-reward-section return-reward-section" aria-labelledby="return-reward-title">
            <div class="summary-reward-heading"><strong id="return-reward-title">${capitalize(summary.returnRewardTier ?? "minor")} Return Reward</strong><span>Distance-tier bonus</span></div>
            ${renderSummaryRewardCollection(returnRewards, { emptyMessage: "No additional return reward this time." })}
          </section>` : ""}

        <section class="summary-reward-section" aria-labelledby="expedition-haul-title">
          <div class="summary-reward-heading"><strong id="expedition-haul-title">Expedition Haul</strong><span>${returned ? "Secured on return" : "Lost with the expedition"}</span></div>
          ${renderSummaryRewardCollection(expeditionRewards, { emptyMessage: returned ? "No discoveries from the expedition." : "No unsecured discoveries were lost." })}
        </section>

        <p class="protected-note">Your original equipment and companion remain available.</p>
      </div>

      <div class="footer-actions summary-actions">
        <button class="game-button" type="button" data-action="new-expedition">Return to Village</button>
      </div>
    </section>`;
}

function updateTravelHudText(expedition = game.expedition) {
  if (game.screen !== "expedition" || !expedition) return;
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
  const activeEncounter = expedition.activeEncounter
    ? EncounterManager.definitionFor(expedition)
    : null;
  const directionBanner = document.querySelector("#direction-banner");
  const travelers = document.querySelector("#travelers");
  const returnButton = document.querySelector("#return-button");
  const progressFill = document.querySelector("#distance-progress");

  if (directionBanner) {
    directionBanner.textContent = travelBannerText(expedition, activeEncounter);
  }
  travelers?.classList.toggle("is-returning", expedition.direction === "returning");
  travelers?.classList.toggle("is-paused", Boolean(activeEncounter) || expedition.travelState !== "traveling");
  travelers?.classList.toggle("is-moving", !activeEncounter && expedition.travelState === "traveling");
  syncTravelerCharacterVisuals(expedition, activeEncounter);
  if (returnButton) {
    returnButton.disabled = expedition.direction === "returning";
    returnButton.textContent = "Return";
  }
  if (progressFill) {
    const denominator = Math.max(expedition.maxDistanceReached, 1);
    progressFill.style.width = `${clamp((expedition.distance / denominator) * 100, 0, 100)}%`;
  }
  setText("#path-value", pathLabel(expedition.currentPathId));
  setText("#journey-log-preview", journeyLogPreview(expedition));
}

function syncTravelPresentation(expedition = game.expedition) {
  if (game.screen !== "expedition" || !expedition) return;
  const scene = document.querySelector("#travel-scene");
  if (!scene) return;
  const activeEncounter = expedition.activeEncounter
    ? EncounterManager.definitionFor(expedition)
    : null;
  const returning = expedition.direction === "returning";
  const isMoving = !activeEncounter && expedition.travelState === "traveling";
  scene.classList.toggle("is-paused", Boolean(activeEncounter) || expedition.travelState !== "traveling");
  scene.classList.toggle("is-returning", returning);
  scene.classList.toggle("is-moving", isMoving);
  scene.style.setProperty("--travel-loop-speed", {
    cautious: "52",
    normal: "72",
    hard_push: "100",
  }[expedition.paceId] ?? "72");
  scene.style.setProperty("--travel-pan-duration", {
    cautious: "20s",
    normal: "16s",
    hard_push: "11s",
  }[expedition.paceId] ?? "16s");
  scene.style.setProperty("--travel-offset", `${expedition.sceneOffset % 160}px`);
  if (preserveTravelDirectionPosition(scene, returning)) {
    assertTravelPresentationInvariant();
    return;
  }
  syncTravelVisual(expedition, activeEncounter);
  syncTravelSeamForegroundPresentation(scene, expedition, activeEncounter);
  syncTravelParallaxLayer(currentTravelTrack());
  advancePendingTravelScene(expedition, scene, activeEncounter);
  preloadNextTravelScene(expedition);
  assertTravelPresentationInvariant();
}

function updateTravelHud() {
  const expedition = game.expedition;
  if (game.screen !== "expedition" || !expedition) return;
  updateTravelHudText(expedition);
  syncTravelPresentation(expedition);
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
  EquipmentRules.normalizeEquipmentCompatibility(game.player);
  const saved = SaveSystem.save(game.player);
  ui.saveStatus.textContent = saved ? "Saved locally" : "Save unavailable";
}

function resetSave() {
  if (!window.confirm("Reset all local progress and restore the prototype's starting inventory?")) {
    return;
  }

  cancelRestAction();
  game.player = SaveSystem.reset();
  if (typeof RewardRevealSystem !== "undefined") RewardRevealSystem.cancel({ resetSeen: true });
  game.expedition = null;
  game.expeditionStartPending = false;
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
  shield: '<path d="M12 3 19 6v5.3c0 4.5-2.8 7.6-7 9.7-4.2-2.1-7-5.2-7-9.7V6l7-3Z"/><path d="m8.5 12 2.2 2.2 4.8-4.8"/>',
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
  if (category === "shield") return "shield";
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
  if (game.departurePresentation
    && (game.screen !== "expedition" || game.expedition !== game.departurePresentation.expedition)) {
    cancelDeparturePresentation();
  }
  if (game.lastTimestamp === null) {
    game.lastTimestamp = timestamp;
  }

  const deltaSeconds = Math.min((timestamp - game.lastTimestamp) / 1000, 0.1);
  game.lastTimestamp = timestamp;
  game.elapsedSeconds += deltaSeconds;

  updateCraftingProgress(timestamp);
  updateRestProgress(timestamp);

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

function updateRestProgress(timestamp) {
  const action = game.restAction;
  if (!action) return;
  if (!isCurrentRestAction(action)) {
    if (game.restAction === action) cancelRestAction();
    return;
  }
  const elapsedMs = timestamp - action.startedAt;
  if (action.context === "camp-rest"
    && action.eventId
    && Number.isFinite(action.eventDelayMs)
    && elapsedMs >= action.eventDelayMs) {
    interruptCampRest(action);
    return;
  }
  action.progress = clamp((timestamp - action.startedAt) / action.durationMs, 0, 1);
  const progressRoot = action.context === "inn-rest"
    ? document.querySelector(".inn-rest-progress")
    : document.querySelector(`[data-rest-token="${action.token}"]`);
  const progressFill = progressRoot?.querySelector(".crafting-progress-fill");
  const progressLabel = progressRoot?.querySelector(".crafting-progress-heading span");
  if (progressFill) progressFill.style.width = `${Math.round(action.progress * 100)}%`;
  if (progressLabel) progressLabel.textContent = `${Math.round(action.progress * 100)}%`;
  if (action.progress >= 1) {
    if (action.context === "inn-rest") {
      game.restAction = null;
      action.interruptionState = "completed";
      restAtInn();
    } else {
      completeExpeditionRestAction(action);
    }
  }
}

function updateInnRestProgress(timestamp) {
  updateRestProgress(timestamp);
}

initializeGame();
