/*
 * Generic deterministic replay support.
 *
 * Replay playback owns a cloned player and expedition, then calls the same
 * production rules used by normal play. The viewer is deliberately not a
 * second telemetry renderer: game.js continues to render the active replay
 * state through the ordinary expedition, encounter, camp, and combat views.
 */

const ReplayData = Object.freeze({
  normalize(input = {}) {
    const root = input?.replay ? input : {};
    const raw = input?.replay ?? input;
    const startingPlayerState = raw?.startingPlayerState;
    if (!raw || !startingPlayerState || !Array.isArray(raw.decisions)) {
      throw new Error("This run does not contain a complete replay payload.");
    }

    const rootPolicy = root.turnaroundPolicy;
    const turnaroundPolicy = raw.turnaroundPolicy ?? (
      rootPolicy && typeof rootPolicy === "object"
        ? { name: rootPolicy.name ?? "fixed-distance", configuration: rootPolicy.configuration ?? {} }
        : {
          name: root.turnaroundPolicy ?? "fixed-distance",
          configuration: root.turnaroundConfiguration ?? {},
        }
    );
    const state = deepClone(startingPlayerState);
    const companions = raw.companions
      ?? root.companions
      ?? state.selectedCompanions
      ?? (state.selectedCompanion ? [state.selectedCompanion] : []);
    const loadout = raw.loadout ?? root.loadout ?? state.equippedItems ?? {};
    const packedItems = raw.packedItems ?? root.packedItems ?? state.packedItems ?? [];
    const packedMaterials = raw.packedMaterials
      ?? root.startingMaterialBag?.contents
      ?? state.packedMaterials
      ?? {};

    return deepClone({
      version: Number(raw.version) || 1,
      runId: root.runId ?? raw.runId ?? `${raw.seed ?? root.seed ?? "replay"}`,
      seed: String(raw.seed ?? root.seed ?? ""),
      startingPlayerState: state,
      expeditionId: raw.expeditionId ?? root.expeditionId ?? state.selectedExpeditionId ?? "old_forest_road",
      regionId: raw.regionId ?? root.regionId ?? "broceliande",
      pathId: raw.pathId ?? root.pathId ?? "old_forest_road",
      startingProvisions: Number(raw.startingProvisions ?? root.startingProvisions ?? state.provisions) || 0,
      companions: [...new Set((Array.isArray(companions) ? companions : [companions]).filter(Boolean))].slice(0, 2),
      loadout,
      packedItems,
      packedMaterials,
      paceId: raw.paceId ?? root.paceSelectedAtDeparture ?? "normal",
      rationId: raw.rationId ?? root.rationSelectedAtDeparture ?? "normal",
      turnaroundPolicy: {
        name: turnaroundPolicy.name ?? "fixed-distance",
        configuration: deepClone(turnaroundPolicy.configuration ?? {}),
      },
      travelStepDistance: Math.max(
        0.1,
        Number(raw.travelStepDistance ?? root.scenario?.travelStepDistance) || 1,
      ),
      decisions: deepClone(raw.decisions),
      expected: {
        outcome: root.outcome ?? raw.outcome ?? null,
        maximumDistance: root.maximumDistance ?? raw.maximumDistance ?? null,
        finalPartyHealth: deepClone(root.finalPartyHealth ?? raw.finalPartyHealth ?? null),
        provisionsRemaining: root.provisionsRemaining ?? raw.provisionsRemaining ?? null,
        encounterCount: root.encounterCount ?? raw.encounterCount ?? null,
        combatCount: root.combatCount ?? raw.combatCount ?? null,
      },
    });
  },

  createPlayer(data) {
    const defaults = SaveSystem.createDefaultPlayerState();
    const snapshot = deepClone(data.startingPlayerState);
    const merged = {
      ...defaults,
      ...snapshot,
      equippedItems: { ...defaults.equippedItems, ...(snapshot.equippedItems ?? {}) },
      companionStates: { ...defaults.companionStates, ...(snapshot.companionStates ?? {}) },
      campaignFlags: { ...defaults.campaignFlags, ...(snapshot.campaignFlags ?? {}) },
    };
    const player = sanitizePlayerState(merged, defaults);
    player.selectedExpeditionId = EXPEDITION_DEFINITIONS[data.expeditionId]
      ? data.expeditionId : defaults.selectedExpeditionId;
    player.equippedItems = { ...player.equippedItems, ...data.loadout };
    Object.values(player.equippedItems).filter(Boolean).forEach((itemId) => {
      if (ITEM_DEFINITIONS[itemId]) player.ownedItems[itemId] ??= 1;
    });
    player.packedItems = (Array.isArray(data.packedItems)
      ? data.packedItems
      : Object.keys(data.packedItems ?? {}))
      .filter((itemId) => ITEM_DEFINITIONS[itemId]?.carriable
        && !MaterialRules.isMaterialId(itemId)
        && player.ownedItems[itemId]
        && !Object.values(player.equippedItems).includes(itemId))
      .slice(0, EXPEDITION_TUNING.packSlots);
    player.packedMaterials = MaterialRules.selectionFromRequest(
      data.packedMaterials,
      player.materials,
    );
    player.selectedCompanions = data.companions.filter((companionId) => (
      COMPANION_DEFINITIONS[companionId] && player.unlockedCompanions.includes(companionId)
    ));
    player.selectedCompanion = player.selectedCompanions[0] ?? null;
    player.unlockedCompanions = [...new Set([
      ...player.unlockedCompanions,
      ...player.selectedCompanions,
    ])];
    return player;
  },
});

let replayState = null;
let replayControls = null;

const ReplayController = Object.freeze({
  isActive() {
    return Boolean(replayState);
  },

  state() {
    return replayState;
  },

  start(input) {
    if (replayState) this.exit();
    let data;
    try {
      data = ReplayData.normalize(input);
    } catch (error) {
      this.mountControls();
      replayState = { status: "desync", error: { message: error.message, decisionIndex: 0 } };
      document.body.classList.add("replay-active");
      this.renderControls();
      return false;
    }

    const realGameState = {
      player: game.player,
      expedition: game.expedition,
      screen: game.screen,
      summary: game.summary,
      activeDestinationId: game.activeDestinationId,
      dialogueSession: game.dialogueSession,
      preparationStep: game.preparationStep,
      preparationMode: game.preparationMode,
      preparationSupplies: game.preparationSupplies,
      shopTab: game.shopTab,
      innTab: game.innTab,
      campTab: game.campTab,
      provisionShopStock: game.provisionShopStock,
      itemShopStock: game.itemShopStock,
      craftingAction: game.craftingAction,
      restAction: game.restAction,
      elapsedSeconds: game.elapsedSeconds,
      lastTimestamp: game.lastTimestamp,
      hudAccumulator: game.hudAccumulator,
      saveStatus: ui.saveStatus?.textContent ?? "Saved locally",
    };
    replayState = {
      data,
      realGameState,
      player: null,
      expedition: null,
      random: null,
      decisionIndex: 0,
      preparedCampCycle: null,
      encounterCount: 0,
      combatCount: 0,
      presentationWait: 0,
      renderAccumulator: 0,
      playing: true,
      speed: 1,
      autoSkipTravel: false,
      silent: false,
      status: "playing",
      warning: null,
      error: null,
    };
    document.body.classList.add("replay-active");
    this.mountControls();
    this.restart();
    return true;
  },

  restart() {
    if (!replayState?.data) return false;
    const data = replayState.data;
    const player = ReplayData.createPlayer(data);
    const random = GameRandom.create(data.seed);
    const expedition = ExpeditionRules.startExpedition(player, {
      expeditionId: data.expeditionId,
      provisions: Math.min(data.startingProvisions, player.provisions),
      companions: data.companions,
      equipment: data.loadout,
      packedItems: data.packedItems,
      packedMaterials: data.packedMaterials,
      regionId: data.regionId,
      pathId: data.pathId,
      paceId: data.paceId,
      rationId: data.rationId,
      health: Number.isFinite(Number(data.startingPlayerState.arthurHealth))
        ? Number(data.startingPlayerState.arthurHealth) : undefined,
      random: random.random,
    });
    replayState.player = player;
    replayState.expedition = expedition;
    replayState.random = random;
    replayState.decisionIndex = 0;
    replayState.preparedCampCycle = null;
    replayState.encounterCount = 0;
    replayState.combatCount = 0;
    replayState.presentationWait = 0;
    replayState.renderAccumulator = 0;
    replayState.playing = true;
    replayState.status = "playing";
    replayState.warning = null;
    replayState.error = null;
    game.player = player;
    game.expedition = expedition;
    game.summary = null;
    game.dialogueSession = null;
    game.campTab = "rest";
    showScreen("expedition");
    this.renderControls();
    return true;
  },

  pause() {
    if (!replayState || replayState.status !== "playing") return;
    replayState.playing = false;
    replayState.status = "paused";
    this.renderControls();
  },

  play() {
    if (!replayState || replayState.status === "desync" || replayState.status === "completed") return;
    replayState.playing = true;
    replayState.status = "playing";
    this.renderControls();
  },

  setSpeed(value) {
    if (!replayState) return;
    const speed = Number(value);
    replayState.speed = [0.25, 0.5, 1, 2, 4, 8].includes(speed) ? speed : 1;
    this.renderControls();
  },

  setAutoSkip(enabled) {
    if (!replayState) return;
    replayState.autoSkipTravel = Boolean(enabled);
    this.renderControls();
  },

  step() {
    if (!replayState || replayState.status === "completed" || replayState.status === "desync") return;
    replayState.playing = false;
    replayState.status = "paused";
    replayState.presentationWait = 0;
    const before = this.progressSignature();
    let steps = 0;
    do {
      this.advanceLogicalStep();
      steps += 1;
    } while (replayState.status === "paused"
      && steps < 10000
      && this.progressSignature() === before);
    this.renderControls();
  },

  skipTo(kind) {
    if (!replayState || replayState.status === "completed" || replayState.status === "desync") return;
    replayState.playing = false;
    replayState.status = "paused";
    replayState.presentationWait = 0;
    const initial = {
      encounters: replayState.encounterCount,
      combats: replayState.combatCount,
      camp: replayState.expedition?.campCycle ?? 0,
      returning: replayState.expedition?.direction === "returning",
    };
    let steps = 0;
    while (replayState.status !== "completed" && replayState.status !== "desync" && steps < 30000) {
      this.advanceLogicalStep();
      steps += 1;
      const expedition = replayState.expedition;
      const reached = kind === "encounter" && replayState.encounterCount > initial.encounters
        || kind === "combat" && replayState.combatCount > initial.combats
        || kind === "camp" && (expedition?.campCycle ?? 0) > initial.camp
        || kind === "turnaround" && !initial.returning && expedition?.direction === "returning"
        || kind === "end" && replayState.status === "completed";
      if (reached) break;
    }
    this.renderReplayGame();
    this.renderControls();
  },

  seek(targetIndex) {
    if (!replayState?.data || replayState.status === "desync") return;
    const target = Math.max(
      0,
      Math.min(replayState.data.decisions.length, Math.floor(Number(targetIndex) || 0)),
    );
    this.restart();
    replayState.playing = false;
    replayState.status = "paused";
    replayState.silent = true;
    let steps = 0;
    while (replayState.decisionIndex < target
      && replayState.status !== "completed"
      && replayState.status !== "desync"
      && steps < 30000) {
      replayState.presentationWait = 0;
      this.advanceLogicalStep();
      steps += 1;
    }
    replayState.silent = false;
    this.renderReplayGame();
    this.renderControls();
  },

  exit() {
    if (!replayState) return;
    const previous = replayState.realGameState;
    const previousSaveStatus = previous?.saveStatus;
    this.clearControls();
    if (pendingEncounterActionTimer !== null) {
      window.clearTimeout(pendingEncounterActionTimer);
      pendingEncounterActionTimer = null;
    }
    if (previous) {
      const restoreState = { ...previous };
      delete restoreState.saveStatus;
      Object.assign(game, restoreState);
    }
    if (ui.saveStatus && previousSaveStatus !== undefined) ui.saveStatus.textContent = previousSaveStatus;
    replayState = null;
    document.body.classList.remove("replay-active");
    renderScreen();
  },

  update(deltaSeconds) {
    if (!replayState || replayState.status !== "playing") return;
    if (replayState.presentationWait > 0) {
      replayState.presentationWait = Math.max(
        0,
        replayState.presentationWait - deltaSeconds * replayState.speed,
      );
      return;
    }

    const interval = 0.12 / replayState.speed;
    replayState.renderAccumulator += deltaSeconds;
    let logicalSteps = 0;
    while (replayState.renderAccumulator >= interval
      && replayState.status === "playing"
      && logicalSteps < (replayState.autoSkipTravel ? 32 : 1)) {
      replayState.renderAccumulator -= interval;
      const result = this.advanceLogicalStep();
      logicalSteps += 1;
      if (result?.meaningful || !replayState.autoSkipTravel) break;
    }
    if (logicalSteps > 0 && replayState.status === "playing" && replayState.expedition?.status === "active") {
      this.renderReplayGame();
    }
    this.renderControls();
  },

  advanceLogicalStep() {
    if (!replayState || !["playing", "paused"].includes(replayState.status)) return { meaningful: false };
    const expedition = replayState.expedition;
    if (!expedition || expedition.status !== "active") {
      this.finishIfEnded();
      return { meaningful: true };
    }
    if (expedition.combat) return this.advanceCombat();
    if (expedition.activeEncounter) return this.advanceEncounter();
    if (expedition.travelState === "camped") return this.advanceCamp();
    return this.advanceTravel();
  },

  advanceTravel() {
    const expedition = replayState.expedition;
    const next = this.nextDecision();
    if (next && ["pace-change", "ration-change"].includes(next.type)
      && this.decisionDistanceIsReady(next)) {
      if (next.direction && next.direction !== expedition.direction) {
        return this.desync("A travel-setting decision targeted the wrong direction.", next);
      }
      if (next.type === "pace-change") {
        if (next.from !== expedition.paceId || !EXPEDITION_TUNING.travelPaces[next.to]) {
          return this.desync("The recorded pace change is invalid for the current journey.", next);
        }
        ExpeditionRules.setPace(expedition, next.to);
      } else {
        if (next.from !== expedition.rationId || !EXPEDITION_TUNING.rationLevels[next.to]) {
          return this.desync("The recorded ration change is invalid for the current journey.", next);
        }
        ExpeditionRules.setRation(expedition, next.to);
      }
      this.consumeDecision();
      this.holdPresentation(0.3);
      this.renderReplayGame();
      return { meaningful: true, decision: true };
    }

    if (next && ["turnaround", "emergency-provision-turnaround"].includes(next.type)
      && this.decisionDistanceIsReady(next)) {
      if (expedition.direction !== "outbound") {
        return this.desync("The recorded turnaround arrived after the expedition had already turned back.", next);
      }
      ExpeditionRules.beginReturn(expedition);
      this.consumeDecision();
      this.holdPresentation(0.7);
      this.renderReplayGame();
      return { meaningful: true, decision: true };
    }

    if (next?.type === "expedition-action" && this.decisionDistanceIsReady(next)) {
      if (!["brief-rest", "camp"].includes(next.action)) {
        return this.desync("The recorded expedition action is not supported in Phase 1.", next);
      }
      if (!ExpeditionRules.pause(expedition)) {
        return this.desync("The recorded expedition action could not pause the journey.", next);
      }
      if (next.action === "brief-rest") {
        ExpeditionRules.briefRest(expedition);
        ExpeditionRules.resume(expedition);
      } else if (!ExpeditionRules.enterCamp(expedition)) {
        return this.desync("The recorded camp action could not enter camp.", next);
      } else {
        replayState.preparedCampCycle = null;
      }
      this.consumeDecision();
      this.holdPresentation(next.action === "camp" ? 0.8 : 0.5);
      this.renderReplayGame();
      return { meaningful: true, decision: true };
    }

    if (next && this.decisionIsOverdue(next)) {
      return this.desync("The next recorded decision was passed without reaching its recorded state.", next);
    }

    let travelDistance = replayState.data.travelStepDistance
      * (expedition.direction === "returning" ? EXPEDITION_TUNING.returnSpeedMultiplier : 1)
      * ExpeditionRules.paceDefinition(expedition.paceId).speedMultiplier
      * ExpeditionRules.travelSpeedMultiplier(expedition);
    const distanceToEncounter = expedition.nextEncounterAt - expedition.encounterTravelDistance;
    if (distanceToEncounter > 0) travelDistance = Math.min(travelDistance, distanceToEncounter);
    if (expedition.direction === "outbound"
      && replayState.data.turnaroundPolicy.name === "fixed-distance") {
      travelDistance = Math.min(
        travelDistance,
        Math.max(0, Number(replayState.data.turnaroundPolicy.configuration.distance) - expedition.distance),
      );
    }
    const travel = ExpeditionRules.travel(expedition, replayState.player, travelDistance);
    if (travel.failureReason) {
      this.fail(travel.failureReason);
      return { meaningful: true };
    }
    if (travel.reachedSafety) {
      expedition.status = "returned";
      completeReturn();
      this.finishIfEnded();
      return { meaningful: true };
    }
    if (travel.encounter) {
      replayState.encounterCount += 1;
      this.holdPresentation(0.65);
      this.renderReplayGame();
      return { meaningful: true };
    }
    return { meaningful: false };
  },

  advanceEncounter() {
    const expedition = replayState.expedition;
    const active = expedition.activeEncounter;
    const definition = EncounterManager.definitionFor(expedition, active);
    if (!definition) return this.desync("The active encounter definition is missing.", this.nextDecision());
    if (active.phase === "pending") {
      const result = EncounterManager.completePendingAction(
        expedition,
        replayState.player,
        active.pendingToken,
        this.encounterCallbacks(),
      );
      if (!result.resolved) return this.desync("A recorded encounter action could not complete.", this.nextDecision());
      this.holdPresentation(0.7);
      this.renderReplayGame();
      return { meaningful: true };
    }
    if (active.phase === "result") {
      if (!EncounterManager.continueJourney(expedition)) {
        return this.desync("The encounter result could not continue the journey.", this.nextDecision());
      }
      this.holdPresentation(0.55);
      this.renderReplayGame();
      return { meaningful: true };
    }
    if (active.phase !== "choice") {
      return this.desync("The replay reached an unsupported encounter phase.", this.nextDecision());
    }
    const decision = this.nextDecision();
    if (!decision || !["encounter-choice", "camp-event-choice"].includes(decision.type)) {
      return this.desync("The next recorded decision is not the active encounter choice.", decision);
    }
    if (decision.encounterId !== active.encounterId
      || decision.stageId !== active.stageId
      || (active.eventKind === "camp" && decision.type !== "camp-event-choice")
      || (active.eventKind !== "camp" && decision.type !== "encounter-choice")) {
      return this.desync("The recorded encounter choice does not match the current stage.", decision);
    }
    const stage = definition.stages[active.stageId];
    const choice = stage?.choices.find((entry) => entry.id === decision.choiceId);
    if (!choice || !EncounterRequirements.choiceAvailability(choice, {
      expedition, player: replayState.player,
    }).available) {
      return this.desync("The recorded encounter choice is unavailable in the current replay state.", decision);
    }
    const result = EncounterManager.resolveChoice(
      expedition,
      replayState.player,
      decision.choiceId,
      this.encounterCallbacks(),
    );
    if (!result.resolved) return this.desync("The recorded encounter choice could not resolve.", decision);
    this.consumeDecision();
    this.holdPresentation(result.pending ? 0.35 : result.combatStarted ? 0.8 : 0.65);
    this.renderReplayGame();
    return { meaningful: true, decision: true };
  },

  advanceCamp() {
    const expedition = replayState.expedition;
    if (replayState.preparedCampCycle !== expedition.campCycle) {
      const next = this.nextDecision();
      if (next?.type === "cook-recipe") {
        const result = CraftingRules.craft(
          replayState.player,
          next.recipeId,
          "campfire",
          { expedition },
        );
        if (!result.applied) return this.desync("The recorded camp recipe is not craftable.", next);
        this.consumeDecision();
        this.holdPresentation(0.7);
        this.renderReplayGame();
        return { meaningful: true, decision: true };
      }
      const rest = ExpeditionRules.restAtCamp(expedition, replayState.player);
      if (!rest.applied && rest.reason !== "insufficient-provisions") {
        return this.desync("The recorded camp rest could not resolve.", next);
      }
      if (!rest.applied) {
        const skipped = this.nextDecision();
        if (skipped?.type !== "camp-rest-skipped") {
          return this.desync("The replay expected a camp-rest skip record.", skipped);
        }
        this.consumeDecision();
      }
      replayState.preparedCampCycle = expedition.campCycle;
      this.holdPresentation(rest.applied ? 0.9 : 0.45);
      this.renderReplayGame();
      return { meaningful: true, decision: Boolean(!rest.applied) };
    }
    if (expedition.activeEncounter) return this.advanceEncounter();
    const decision = this.nextDecision();
    if (decision?.type !== "leave-camp") {
      return this.desync("The company reached the end of camp without a recorded leave-camp decision.", decision);
    }
    if (!ExpeditionRules.leaveCamp(expedition) || !ExpeditionRules.resume(expedition)) {
      return this.desync("The recorded leave-camp decision could not resume travel.", decision);
    }
    this.consumeDecision();
    this.holdPresentation(0.5);
    this.renderReplayGame();
    return { meaningful: true, decision: true };
  },

  advanceCombat() {
    const expedition = replayState.expedition;
    const combat = expedition.combat;
    if (!combat) return { meaningful: false };
    if (combat.status === "awaitingAction") {
      const decision = this.nextDecision();
      if (!decision || decision.type !== "combat-action") {
        return this.desync("The next recorded decision is not the active combat action.", decision);
      }
      if (decision.combatId !== combat.id || decision.actorId !== combat.activeActorId) {
        return this.desync("The recorded combat actor or combat ID does not match playback.", decision);
      }
      const result = this.applyRecordedCombatAction(combat, decision);
      if (!result?.resolved) return this.desync("The recorded combat action was unavailable.", decision);
      this.consumeDecision();
      if (combat.result) {
        finishCombatResolution(expedition);
        this.holdPresentation(0.8);
      }
      this.renderReplayGame();
      return { meaningful: true, decision: true };
    }
    const living = [...combat.allies, ...combat.enemies].filter((entry) => entry.hp > 0);
    const secondsToReady = Math.min(...living.map((entry) => (
      (COMBAT_TUNING.actionGaugeMaximum - entry.gauge)
        / (entry.speed * COMBAT_TUNING.actionGaugeRate)
    )).filter((value) => value >= 0));
    if (!Number.isFinite(secondsToReady)) return this.desync("Combat has no living actor able to advance.", this.nextDecision());
    const update = CombatSystem.update(combat, expedition, Math.max(0.0001, secondsToReady));
    if (update.result) {
      finishCombatResolution(expedition);
      this.holdPresentation(0.8);
    }
    this.renderReplayGame();
    return { meaningful: Boolean(update.changed || update.result) };
  },

  applyRecordedCombatAction(combat, decision) {
    const expedition = replayState.expedition;
    const actionId = decision.actionId;
    if (actionId === "abilities") {
      if (!decision.abilityId) return null;
      const menu = CombatSystem.chooseAction(combat, expedition, "abilities");
      if (menu.unavailable || menu.menu !== "abilities") return null;
      return CombatSystem.chooseAbility(combat, expedition, decision.abilityId, decision.targetId ?? null);
    }
    if (actionId === "items") {
      if (!decision.itemId) return null;
      const menu = CombatSystem.chooseAction(combat, expedition, "items");
      if (menu.unavailable || menu.menu !== "items") return null;
      return CombatSystem.chooseItem(combat, expedition, decision.itemId, decision.targetId ?? null);
    }
    return CombatSystem.chooseAction(combat, expedition, actionId, decision.targetId ?? null);
  },

  encounterCallbacks() {
    return {
      failExpedition: (reason) => this.fail(reason),
      startCombat: (combatId) => this.startCombat(combatId),
      skipPresentationDelay: true,
    };
  },

  startCombat(combatId) {
    const expedition = replayState.expedition;
    if (!expedition || expedition.combat) return false;
    const combat = CombatSystem.create(expedition, combatId, { random: expedition.random });
    if (!combat) return false;
    expedition.combat = combat;
    replayState.combatCount += 1;
    return true;
  },

  fail(reason) {
    if (!replayState?.expedition || replayState.expedition.status !== "active") return;
    failExpedition(reason);
    this.finishIfEnded();
  },

  finishIfEnded() {
    if (!replayState || replayState.expedition?.status === "active") return;
    replayState.playing = false;
    replayState.status = "completed";
    replayState.warning = this.compareFinalState();
    this.renderControls();
  },

  compareFinalState() {
    const expected = replayState.data.expected;
    const actual = {
      outcome: game.summary?.outcome ?? replayState.expedition?.status,
      maximumDistance: replayState.expedition?.maxDistanceReached,
      finalPartyHealth: {
        arthur: replayState.expedition?.health,
        ...replayState.expedition?.companionCombatHp,
      },
      provisionsRemaining: replayState.expedition?.provisions,
      encounterCount: replayState.encounterCount,
      combatCount: replayState.combatCount,
    };
    const mismatches = [];
    if (expected.outcome && expected.outcome !== actual.outcome) mismatches.push(`outcome ${actual.outcome} (expected ${expected.outcome})`);
    if (Number.isFinite(Number(expected.maximumDistance))
      && Math.abs(Number(expected.maximumDistance) - Number(actual.maximumDistance)) > 0.01) {
      mismatches.push(`maximum distance ${actual.maximumDistance} (expected ${expected.maximumDistance})`);
    }
    if (Number.isFinite(Number(expected.provisionsRemaining))
      && Math.abs(Number(expected.provisionsRemaining) - Number(actual.provisionsRemaining)) > 0.01) {
      mismatches.push(`provisions ${actual.provisionsRemaining} (expected ${expected.provisionsRemaining})`);
    }
    Object.entries(expected.finalPartyHealth ?? {}).forEach(([characterId, expectedHealth]) => {
      const actualHealth = actual.finalPartyHealth[characterId];
      if (Number.isFinite(Number(expectedHealth)) && Number.isFinite(Number(actualHealth))
        && Math.abs(Number(expectedHealth) - Number(actualHealth)) > 0.01) {
        mismatches.push(`${characterId} HP ${actualHealth} (expected ${expectedHealth})`);
      }
    });
    if (Number.isFinite(Number(expected.encounterCount)) && expected.encounterCount !== actual.encounterCount) mismatches.push(`encounters ${actual.encounterCount} (expected ${expected.encounterCount})`);
    if (Number.isFinite(Number(expected.combatCount)) && expected.combatCount !== actual.combatCount) mismatches.push(`combats ${actual.combatCount} (expected ${expected.combatCount})`);
    return mismatches.length > 0 ? `Playback completed with differences: ${mismatches.join("; ")}.` : null;
  },

  nextDecision() {
    return replayState?.data.decisions[replayState.decisionIndex] ?? null;
  },

  consumeDecision() {
    replayState.decisionIndex += 1;
  },

  decisionDistanceIsReady(decision) {
    const current = Number(replayState.expedition?.distance) || 0;
    const target = Number(decision?.distance);
    if (!Number.isFinite(target)) return true;
    return replayState.expedition?.direction === "returning"
      ? target >= current - 0.0001
      : target <= current + 0.0001;
  },

  decisionIsOverdue(decision) {
    if (!Number.isFinite(Number(decision?.distance))) return false;
    const current = Number(replayState.expedition?.distance) || 0;
    return replayState.expedition?.direction === "returning"
      ? Number(decision.distance) > current + 0.05
      : Number(decision.distance) < current - 0.05;
  },

  progressSignature() {
    const expedition = replayState?.expedition;
    return JSON.stringify({
      decisionIndex: replayState?.decisionIndex,
      distance: expedition?.distance,
      direction: expedition?.direction,
      travelState: expedition?.travelState,
      encounter: expedition?.activeEncounter?.encounterId,
      combat: expedition?.combat?.id,
      encounterCount: replayState?.encounterCount,
      combatCount: replayState?.combatCount,
      status: replayState?.status,
    });
  },

  holdPresentation(seconds) {
    replayState.presentationWait = Math.max(replayState.presentationWait, seconds);
  },

  desync(message, decision) {
    const expedition = replayState?.expedition;
    replayState.playing = false;
    replayState.status = "desync";
    replayState.error = {
      message,
      decisionIndex: replayState.decisionIndex,
      expectedDecision: deepClone(decision ?? null),
      currentReplayState: {
        status: expedition?.status,
        distance: expedition?.distance,
        direction: expedition?.direction,
        travelState: expedition?.travelState,
        paceId: expedition?.paceId,
        rationId: expedition?.rationId,
        encounter: expedition?.activeEncounter
          ? { id: expedition.activeEncounter.encounterId, phase: expedition.activeEncounter.phase, stageId: expedition.activeEncounter.stageId }
          : null,
        combat: expedition?.combat
          ? { id: expedition.combat.id, status: expedition.combat.status, actorId: expedition.combat.activeActorId }
          : null,
      },
    };
    this.renderReplayGame();
    this.renderControls();
    return { meaningful: true, desync: true };
  },

  renderReplayGame() {
    if (!replayState?.silent && replayState?.expedition && game.screen === "expedition") renderExpedition();
  },

  mountControls() {
    if (replayControls) return;
    replayControls = document.createElement("aside");
    replayControls.className = "replay-controls";
    replayControls.setAttribute("aria-label", "Replay controls");
    replayControls.addEventListener("click", (event) => {
      const action = event.target.closest("[data-replay-action]")?.dataset.replayAction;
      if (!action) return;
      if (action === "play") this.play();
      if (action === "pause") this.pause();
      if (action === "restart") this.restart();
      if (action === "step") this.step();
      if (action === "skip-encounter") this.skipTo("encounter");
      if (action === "skip-combat") this.skipTo("combat");
      if (action === "skip-camp") this.skipTo("camp");
      if (action === "skip-turnaround") this.skipTo("turnaround");
      if (action === "skip-end") this.skipTo("end");
      if (action === "exit") this.exit();
    });
    replayControls.addEventListener("change", (event) => {
      if (event.target.matches("[data-replay-speed]")) this.setSpeed(event.target.value);
      if (event.target.matches("[data-replay-autoskip]")) this.setAutoSkip(event.target.checked);
      if (event.target.matches("[data-replay-seek]")) this.seek(event.target.value);
    });
    document.body.append(replayControls);
  },

  clearControls() {
    replayControls?.remove();
    replayControls = null;
  },

  renderControls() {
    if (!replayControls || !replayState) return;
    const data = replayState.data;
    const expedition = replayState.expedition;
    const status = replayState.status === "playing" ? "Playing"
      : replayState.status === "paused" ? "Paused"
        : replayState.status === "completed" ? "Complete" : "Replay desync";
    const canPlay = !["completed", "desync"].includes(replayState.status);
    replayControls.innerHTML = `
      <div class="replay-controls-heading">
        <div><span class="replay-eyebrow">REPLAY</span><strong>${status}</strong></div>
        <span>Seed: ${data.seed} · Run: ${data.runId}</span>
      </div>
      <div class="replay-controls-row replay-primary-controls">
        <button type="button" data-replay-action="play" ${canPlay ? "" : "disabled"}>Play</button>
        <button type="button" data-replay-action="pause" ${canPlay ? "" : "disabled"}>Pause</button>
        <button type="button" data-replay-action="restart">Restart</button>
        <button type="button" data-replay-action="step" ${canPlay ? "" : "disabled"}>Step</button>
        <label>Speed <select data-replay-speed>${[0.25, 0.5, 1, 2, 4, 8].map((speed) => `<option value="${speed}" ${replayState.speed === speed ? "selected" : ""}>${speed}×</option>`).join("")}</select></label>
        <label class="replay-checkbox"><input type="checkbox" data-replay-autoskip ${replayState.autoSkipTravel ? "checked" : ""}> Auto-skip travel</label>
      </div>
      <div class="replay-controls-row replay-skip-controls">
        <button type="button" data-replay-action="skip-encounter" ${canPlay ? "" : "disabled"}>Next Encounter</button>
        <button type="button" data-replay-action="skip-combat" ${canPlay ? "" : "disabled"}>Next Combat</button>
        <button type="button" data-replay-action="skip-camp" ${canPlay ? "" : "disabled"}>Next Camp/Rest</button>
        <button type="button" data-replay-action="skip-turnaround" ${canPlay ? "" : "disabled"}>Next Turnaround</button>
        <button type="button" data-replay-action="skip-end" ${canPlay ? "" : "disabled"}>Skip to End</button>
      </div>
      <div class="replay-progress-row">
        <span>Decision ${Math.min(replayState.decisionIndex + 1, data.decisions.length)} / ${data.decisions.length}</span>
        <span>Distance: ${expedition ? formatDistance(expedition.distance) : "—"}</span>
        <span>Speed: ${replayState.speed}×</span>
        <input class="replay-seek" type="range" data-replay-seek min="0" max="${data.decisions.length}" value="${replayState.decisionIndex}" aria-label="Seek replay decision">
      </div>
      ${replayState.error ? `<pre class="replay-error" role="alert">${escapeReplayText(JSON.stringify(replayState.error, null, 2))}</pre>` : ""}
      ${replayState.warning ? `<p class="replay-warning" role="status">${escapeReplayText(replayState.warning)}</p>` : ""}
      <button class="replay-exit-button" type="button" data-replay-action="exit">Exit Replay</button>`;
  },
});

function escapeReplayText(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[character]));
}
