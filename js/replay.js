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

  start(input, options = {}) {
    if (replayState) this.exit();
    let data;
    try {
      data = ReplayData.normalize(input);
    } catch (error) {
      if (!options.externalControls) this.mountControls();
      replayState = {
        status: "desync",
        externalControls: Boolean(options.externalControls),
        error: { message: error.message, decisionIndex: 0 },
      };
      if (!options.externalControls) document.body.classList.add("replay-active");
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
      externalControls: Boolean(options.externalControls),
    };
    document.body.classList.add("replay-active");
    if (!options.externalControls) this.mountControls();
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
    const externalControls = Boolean(replayState.externalControls);
    const previous = replayState.realGameState;
    const previousSaveStatus = previous?.saveStatus;
    if (!externalControls) this.clearControls();
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
    if (!externalControls) document.body.classList.remove("replay-active");
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
          { expedition, context: next.context ?? "camp" },
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

  decorateCampaignControls() {
    if (!campaignReplayControls || campaignReplayControls.dataset.decorated === "true") return;
    campaignReplayControls.dataset.decorated = "true";
    const primary = campaignReplayControls.querySelector(".replay-primary-controls");
    const skipControls = campaignReplayControls.querySelector(".replay-skip-controls");
    const status = campaignReplayControls.querySelector(".campaign-replay-status");
    const progress = campaignReplayControls.querySelector(".replay-progress-row");
    const annotation = campaignReplayControls.querySelector("[data-replay-annotation]");
    const error = campaignReplayControls.querySelector("[data-replay-error]");
    const warning = campaignReplayControls.querySelector("[data-replay-warning]");
    const exit = campaignReplayControls.querySelector("[data-replay-action=\"exit\"]");
    const speed = campaignReplayControls.querySelector("[data-replay-speed]");
    const restart = campaignReplayControls.querySelector("[data-replay-action=\"restart\"]");
    const step = campaignReplayControls.querySelector("[data-replay-action=\"step\"]");
    const autoSkip = campaignReplayControls.querySelector("[data-replay-autoskip]")?.closest("label");
    if (!primary || !skipControls || !status || !progress || !error || !exit) return;

    const glance = document.createElement("div");
    glance.className = "campaign-replay-glance";
    const glanceExpedition = document.createElement("span");
    glanceExpedition.dataset.replayGlanceExpedition = "";
    const glancePhase = document.createElement("span");
    glancePhase.dataset.replayGlancePhase = "";
    glance.append(glanceExpedition, glancePhase);

    const nextEvent = document.createElement("button");
    nextEvent.type = "button";
    nextEvent.dataset.replayAction = "next-event";
    nextEvent.textContent = "Next Event";
    nextEvent.disabled = Boolean(primary.querySelector("[data-replay-action=\"play\"]")?.disabled);

    const inlineError = document.createElement("span");
    inlineError.className = "replay-inline-error";
    inlineError.dataset.replayErrorInline = "";
    inlineError.hidden = true;

    const more = document.createElement("button");
    more.type = "button";
    more.className = "replay-more-button";
    more.dataset.replayAction = "toggle-more";
    more.setAttribute("aria-expanded", "false");
    more.textContent = "More";

    const speedLabel = speed?.closest("label");
    primary.insertBefore(nextEvent, speedLabel ?? primary.firstChild);
    primary.append(glance, inlineError, more, exit);

    const actionIndex = document.createElement("span");
    actionIndex.dataset.replayProgressActionIndex = "";
    progress.insertBefore(actionIndex, progress.firstChild);

    const advanced = document.createElement("div");
    advanced.className = "campaign-replay-advanced";
    advanced.dataset.replayAdvanced = "";
    advanced.hidden = true;
    const advancedActions = document.createElement("div");
    advancedActions.className = "replay-controls-row replay-advanced-actions";
    [restart, step, autoSkip].forEach((node) => {
      if (node) advancedActions.append(node);
    });
    advancedActions.append(skipControls);

    const errorDetails = document.createElement("details");
    errorDetails.className = "replay-error-details";
    errorDetails.dataset.replayErrorContainer = "";
    errorDetails.hidden = true;
    const errorSummary = document.createElement("summary");
    errorSummary.dataset.replayErrorDetailsSummary = "";
    errorSummary.textContent = "Replay error details";
    errorDetails.append(errorSummary, error);

    advanced.append(advancedActions, status);
    if (annotation) advanced.append(annotation);
    advanced.append(errorDetails);
    if (warning) advanced.append(warning);
    campaignReplayControls.querySelectorAll("[data-campaign-segment]").forEach((segment) => {
      const timelineSegment = campaignReplayState?.data?.timeline?.find((entry) => (
        String(entry.actionIndex) === segment.dataset.campaignSegment
      ));
      const label = segment.querySelector("strong");
      if (label && timelineSegment) {
        label.textContent = timelineSegment.kind === "town"
          ? "T"
          : `E${timelineSegment.expeditionNumber}`;
      }
    });
    campaignReplayControls.append(advanced);
  },

  renderControls() {
    if (!replayControls || !replayState || replayState.externalControls) return;
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

const CampaignReplayData = Object.freeze({
  normalize(input = {}) {
    const campaign = input?.campaign ?? input;
    const raw = campaign?.replay ?? input?.replay ?? input ?? {};
    const startingState = raw.startingState ?? campaign?.startingState;
    if (!startingState) throw new Error("This campaign does not contain a starting state.");

    const sourceEntries = raw.expeditions ?? campaign?.expeditions ?? [];
    const replayEntries = sourceEntries.map((entry, index) => {
      const replayInput = entry?.replay ?? entry?.expeditionReplay
        ?? raw.expeditionReplays?.[index] ?? campaign?.expeditions?.[index]?.replay;
      if (!replayInput) throw new Error(`Expedition ${index + 1} is missing its replay payload.`);
      return {
        expeditionNumber: Number(entry?.expeditionNumber) || index + 1,
        expeditionSeed: entry?.expeditionSeed ?? replayInput.seed,
        replay: ReplayData.normalize({
          ...(entry ?? {}),
          replay: replayInput,
        }),
        stateBefore: deepClone(entry?.stateBefore ?? campaign?.expeditions?.[index]?.stateBefore ?? null),
        stateAfter: deepClone(entry?.stateAfter ?? campaign?.expeditions?.[index]?.stateAfter ?? null),
        success: entry?.success ?? campaign?.expeditions?.[index]?.success ?? null,
        outcome: entry?.outcome ?? campaign?.expeditions?.[index]?.outcome ?? null,
        failureReason: entry?.failureReason ?? campaign?.expeditions?.[index]?.failureReason ?? null,
        hardFailureReason: entry?.hardFailureReason ?? campaign?.expeditions?.[index]?.hardFailureReason ?? null,
        actualMaximumDistance: entry?.actualMaximumDistance
          ?? campaign?.expeditions?.[index]?.actualMaximumDistance ?? null,
        townActions: deepClone(entry?.townActions ?? campaign?.expeditions?.[index]?.townActions ?? []),
      };
    });

    const legacy = !Array.isArray(raw.townActions) || raw.version < 2;
    const townActions = Array.isArray(raw.townActions) && raw.townActions.length
      ? deepClone(raw.townActions)
      : reconstructLegacyCampaignTownActions(campaign, raw, replayEntries);
    const normalizedActions = normalizeCampaignTownActions(townActions).map((action, index) => ({
      ...action,
      actionIndex: index,
    }));
    const towns = replayEntries.map((entry) => {
      const actions = normalizedActions.filter((action) => action.expeditionNumber === entry.expeditionNumber);
      const departureIndex = actions.findIndex((action) => action.type === "departure");
      return {
        expeditionNumber: entry.expeditionNumber,
        preparation: departureIndex >= 0 ? actions.slice(0, departureIndex + 1) : actions,
        returnActions: departureIndex >= 0 ? actions.slice(departureIndex + 1) : [],
      };
    });
    const finalTown = normalizedActions.filter((action) => (
      action.expeditionNumber > replayEntries.length
    ));
    if (finalTown.length) towns.push({
      expeditionNumber: replayEntries.length + 1,
      preparation: finalTown,
      returnActions: [],
    });

    const townActionCount = normalizedActions.length;
    const expeditionDecisionCount = replayEntries.reduce(
      (sum, entry) => sum + entry.replay.decisions.length, 0,
    );
    const timeline = [];
    let timelineActionIndex = 0;
    if (towns.length) timeline.push({ kind: "town", label: "Town", expeditionNumber: 1, actionIndex: 0 });
    replayEntries.forEach((entry, index) => {
      const town = towns[index] ?? { preparation: [], returnActions: [] };
      timeline.push({
        kind: "expedition",
        label: `Expedition ${entry.expeditionNumber}`,
        expeditionNumber: entry.expeditionNumber,
        actionIndex: timelineActionIndex + town.preparation.length,
        status: entry.success === null ? "unknown" : entry.success ? "returned" : "failed",
        maximumDistance: entry.actualMaximumDistance,
      });
      timelineActionIndex += town.preparation.length + entry.replay.decisions.length + town.returnActions.length;
      if (index < replayEntries.length - 1) {
        timeline.push({ kind: "town", label: "Town", expeditionNumber: entry.expeditionNumber + 1, actionIndex: timelineActionIndex });
      }
    });
    return deepClone({
      version: Number(raw.version) || 1,
      campaignId: campaign?.campaignId ?? raw.campaignId ?? "campaign-replay",
      seed: String(campaign?.seed ?? raw.campaignSeed ?? raw.seed ?? ""),
      startingState: deepClone(startingState),
      endingState: deepClone(raw.endingState ?? campaign?.endingState ?? null),
      expected: deepClone(raw.expected ?? {
        endingState: campaign?.endingState,
        expeditionsAttempted: campaign?.expeditionsAttempted ?? replayEntries.length,
        stopReason: campaign?.stopReason ?? null,
      }),
      expeditions: replayEntries,
      towns,
      townActions: normalizedActions,
      timeline,
      townActionCount,
      totalActionCount: townActionCount + expeditionDecisionCount,
      legacy,
      unsupported: legacy ? ["Town action ordering was reconstructed from aggregate legacy telemetry."] : [],
    });
  },
});

let campaignReplayState = null;
let campaignReplayControls = null;
const CAMPAIGN_REPLAY_FAST_FORWARD_CHUNK_SIZE = 120;

const CampaignReplayController = Object.freeze({
  isActive() {
    return Boolean(campaignReplayState);
  },

  state() {
    return campaignReplayState;
  },

  cancelFastForward() {
    const state = campaignReplayState;
    const job = state?.fastForwardJob;
    if (!job) return false;
    job.cancelled = true;
    state.fastForwardJob = null;
    state.silent = false;
    if (state.expeditionReplayActive && typeof ReplayController !== "undefined" && ReplayController.isActive()) {
      ReplayController.pause();
    }
    job.resolve(false);
    return true;
  },

  start(input) {
    if (campaignReplayState) this.exit();
    let data;
    try {
      data = CampaignReplayData.normalize(input);
    } catch (error) {
      this.mountControls();
      campaignReplayState = {
        data: { timeline: [], totalActionCount: 0, expeditions: [], seed: "", campaignId: "" },
        realGameState: captureReplayGameState(),
        player: SaveSystem.createDefaultPlayerState(),
        expeditionIndex: 0,
        phase: "Replay Error",
        status: "desync",
        error: { message: error.message, actionIndex: 0 },
        warning: null,
        fastForwardJob: null,
      };
      document.body.classList.add("replay-active");
      this.renderControls();
      return false;
    }
    if (typeof ReplayController !== "undefined" && ReplayController.isActive()) ReplayController.exit();
    campaignReplayState = {
      data,
      realGameState: captureReplayGameState(),
      player: null,
      shopStocks: null,
      expeditionIndex: 0,
      mode: "town",
      townCursor: 0,
      actionIndex: 0,
      expeditionActionBase: 0,
      expeditionReplayActive: false,
      presentationWait: 0,
      renderAccumulator: 0,
      playing: true,
      speed: 1,
      autoSkipTravel: false,
      silent: false,
      status: "playing",
      phase: "Town",
      warning: data.legacy ? data.unsupported.join(" ") : null,
      error: null,
      lastTownAction: null,
      lastExpeditionResult: null,
      actualStopReason: null,
      fastForwardJob: null,
      fastForwardYields: 0,
    };
    document.body.classList.add("replay-active");
    this.mountControls();
    this.restart();
    return true;
  },

  restart() {
    if (!campaignReplayState?.data) return false;
    this.cancelFastForward();
    if (typeof ReplayController !== "undefined" && ReplayController.isActive()) ReplayController.exit();
    const data = campaignReplayState.data;
    campaignReplayState.player = createCampaignReplayPlayer(data.startingState);
    campaignReplayState.shopStocks = { ...(data.startingState.shopStocks ?? CampaignRules.createShopStocks()) };
    campaignReplayState.expeditionIndex = 0;
    campaignReplayState.mode = "town";
    campaignReplayState.townCursor = 0;
    campaignReplayState.actionIndex = 0;
    campaignReplayState.expeditionActionBase = 0;
    campaignReplayState.expeditionReplayActive = false;
    campaignReplayState.presentationWait = 0;
    campaignReplayState.renderAccumulator = 0;
    campaignReplayState.playing = true;
    campaignReplayState.status = "playing";
    campaignReplayState.phase = "Town";
    campaignReplayState.silent = false;
    campaignReplayState.error = null;
    campaignReplayState.lastTownAction = null;
    campaignReplayState.lastExpeditionResult = null;
    campaignReplayState.actualStopReason = null;
    game.player = campaignReplayState.player;
    game.expedition = null;
    game.summary = null;
    game.activeDestinationId = null;
    game.dialogueSession = null;
    game.craftingAction = null;
    game.restAction = null;
    game.preparationStep = "route";
    game.preparationSupplies = 0;
    this.syncShopStocks();
    showScreen("location");
    this.renderControls();
    return true;
  },

  play() {
    if (!campaignReplayState || ["completed", "desync"].includes(campaignReplayState.status)) return;
    this.cancelFastForward();
    campaignReplayState.playing = true;
    campaignReplayState.status = "playing";
    if (campaignReplayState.expeditionReplayActive) ReplayController.play();
    this.renderControls();
  },

  pause() {
    if (!campaignReplayState || ["completed", "desync"].includes(campaignReplayState.status)) return;
    if (campaignReplayState.fastForwardJob) this.cancelFastForward();
    if (campaignReplayState.status !== "playing") {
      campaignReplayState.playing = false;
      campaignReplayState.status = "paused";
      campaignReplayState.silent = false;
      this.renderReplayGame();
      this.renderControls();
      return;
    }
    campaignReplayState.playing = false;
    campaignReplayState.status = "paused";
    if (campaignReplayState.expeditionReplayActive) ReplayController.pause();
    this.renderControls();
  },

  setSpeed(value) {
    if (!campaignReplayState) return;
    const speed = Number(value);
    campaignReplayState.speed = [0.25, 0.5, 1, 2, 4, 8].includes(speed) ? speed : 1;
    if (campaignReplayState.expeditionReplayActive) ReplayController.setSpeed(speed);
    this.renderControls();
  },

  setAutoSkip(enabled) {
    if (!campaignReplayState) return;
    campaignReplayState.autoSkipTravel = Boolean(enabled);
    if (campaignReplayState.expeditionReplayActive) ReplayController.setAutoSkip(enabled);
    this.renderControls();
  },

  toggleMore() {
    const advanced = campaignReplayControls?.querySelector("[data-replay-advanced]");
    const toggle = campaignReplayControls?.querySelector("[data-replay-action=\"toggle-more\"]");
    if (!advanced || !toggle) return;
    const expanded = advanced.hidden;
    advanced.hidden = !expanded;
    campaignReplayControls.dataset.expanded = String(expanded);
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.textContent = expanded ? "Less" : "More";
  },

  step() {
    if (!campaignReplayState || ["completed", "desync"].includes(campaignReplayState.status)) return;
    this.cancelFastForward();
    campaignReplayState.playing = false;
    campaignReplayState.status = "paused";
    campaignReplayState.presentationWait = 0;
    if (campaignReplayState.expeditionReplayActive) {
      ReplayController.step();
      this.finishExpeditionIfReady();
    } else {
      this.advanceLogicalStep();
    }
    this.renderControls();
  },

  skipTo(kind) {
    if (!campaignReplayState || ["completed", "desync"].includes(campaignReplayState.status)) return Promise.resolve(false);
    this.cancelFastForward();
    campaignReplayState.playing = false;
    campaignReplayState.status = "paused";
    campaignReplayState.presentationWait = 0;
    const initial = {
      signature: this.progressSignature(),
      expeditionIndex: campaignReplayState.expeditionIndex,
      mode: campaignReplayState.mode,
      expeditionActive: campaignReplayState.expeditionReplayActive,
      combatCount: ReplayController.isActive() ? ReplayController.state().combatCount : 0,
      campCycle: ReplayController.isActive() ? ReplayController.state().expedition?.campCycle ?? 0 : 0,
    };
    return new Promise((resolve) => {
      const job = {
        type: "skip",
        kind,
        initial,
        steps: 0,
        lastResult: null,
        stalled: false,
        reached: false,
        cancelled: false,
        resolve,
      };
      campaignReplayState.fastForwardJob = job;
      this.renderControls();
      this.processFastForwardJob(job);
    });
  },

  seek(targetIndex) {
    if (!campaignReplayState?.data || campaignReplayState.status === "desync") return Promise.resolve(false);
    const target = Math.max(0, Math.min(
      campaignReplayState.data.totalActionCount,
      Math.floor(Number(targetIndex) || 0),
    ));
    this.restart();
    campaignReplayState.playing = false;
    campaignReplayState.status = "paused";
    campaignReplayState.silent = true;
    return new Promise((resolve) => {
      const job = {
        type: "seek",
        target,
        steps: 0,
        lastResult: null,
        stalled: false,
        reached: false,
        cancelled: false,
        resolve,
      };
      campaignReplayState.fastForwardJob = job;
      this.renderControls();
      this.processFastForwardJob(job);
    });
  },

  processFastForwardJob(job) {
    const state = campaignReplayState;
    if (!state || state.fastForwardJob !== job || job.cancelled) return;
    if (job.type === "seek" && this.currentActionIndex() >= job.target) job.reached = true;
    let processed = 0;
    while (!job.reached && processed < CAMPAIGN_REPLAY_FAST_FORWARD_CHUNK_SIZE
      && state.status !== "completed" && state.status !== "desync") {
      const before = this.progressSignature();
      state.presentationWait = 0;
      const result = this.advanceLogicalStep();
      this.finishExpeditionIfReady();
      job.lastResult = result;
      job.steps += 1;
      processed += 1;
      if (job.type === "skip" && this.skipReached(job.kind, job.initial, before, result)) {
        job.reached = true;
        break;
      }
      if (job.type === "seek" && this.currentActionIndex() >= job.target) {
        job.reached = true;
        break;
      }
      if (this.progressSignature() === before && job.steps > 100) {
        job.stalled = true;
        break;
      }
    }
    const reached = job.reached || (job.type === "skip"
      ? this.skipReached(job.kind, job.initial, this.progressSignature(), job.lastResult)
      : this.currentActionIndex() >= job.target);
    if (job.stalled || reached || state.status === "completed" || state.status === "desync") {
      this.finishFastForwardJob(job, !job.stalled && state.status !== "desync");
      return;
    }
    this.renderReplayGame();
    this.renderControls();
    state.fastForwardYields += 1;
    window.setTimeout(() => this.processFastForwardJob(job), 0);
  },

  finishFastForwardJob(job, reached) {
    const state = campaignReplayState;
    if (!state || state.fastForwardJob !== job) return;
    state.fastForwardJob = null;
    state.silent = false;
    state.playing = false;
    if (!["completed", "desync"].includes(state.status)) state.status = "paused";
    this.renderReplayGame();
    this.renderControls();
    job.resolve(Boolean(reached));
  },

  update(deltaSeconds) {
    if (!campaignReplayState || campaignReplayState.status !== "playing") return;
    if (campaignReplayState.presentationWait > 0) {
      campaignReplayState.presentationWait = Math.max(
        0, campaignReplayState.presentationWait - deltaSeconds * campaignReplayState.speed,
      );
      return;
    }
    const interval = 0.12 / campaignReplayState.speed;
    campaignReplayState.renderAccumulator += deltaSeconds;
    let steps = 0;
    while (campaignReplayState.renderAccumulator >= interval
      && campaignReplayState.status === "playing" && steps < (campaignReplayState.autoSkipTravel ? 32 : 1)) {
      campaignReplayState.renderAccumulator -= interval;
      const result = this.advanceLogicalStep();
      this.finishExpeditionIfReady();
      steps += 1;
      if (result?.meaningful || !campaignReplayState.autoSkipTravel) break;
    }
    if (steps > 0) this.renderReplayGame();
    this.renderControls();
  },

  advanceLogicalStep() {
    if (!campaignReplayState || !["playing", "paused"].includes(campaignReplayState.status)) return { meaningful: false };
    if (campaignReplayState.expeditionReplayActive) {
      const result = ReplayController.advanceLogicalStep();
      this.finishExpeditionIfReady();
      return result;
    }
    return this.advanceTownAction();
  },

  advanceTownAction() {
    const state = campaignReplayState;
    const town = state.data.towns[state.expeditionIndex];
    if (!town) return this.completeCampaign();
    const actions = state.mode === "return" ? town.returnActions : town.preparation;
    if (state.townCursor >= actions.length) {
      if (state.mode === "return") return this.beginNextTown();
      if (!actions.some((action) => action.type === "departure")) return this.completeCampaign();
      return this.desync("The campaign replay reached the end of town preparation without departing.", null);
    }
    const action = actions[state.townCursor];
    const result = this.applyTownAction(action);
    if (result?.desync) return result;
    state.lastTownAction = deepClone(action);
    state.townCursor += 1;
    state.actionIndex += 1;
    if (action.type === "departure") {
      return this.beginExpedition(action);
    }
    this.holdPresentation(action.type === "town-entry" ? 0.25 : 0.55);
    this.renderReplayGame();
    return { meaningful: action.type !== "pack-loadout" };
  },

  applyTownAction(action) {
    const state = campaignReplayState;
    const player = state.player;
    const beforeGold = player.currentGold;
    let result = null;
    switch (action.type) {
      case "town-entry":
        result = CampaignRules.enterLocation(player);
        if (result.provisionsGranted !== Number(action.provisionsGranted ?? result.provisionsGranted)) {
          return this.desync("The recorded town entry granted different provisions.", action);
        }
        break;
      case "inn-rest":
        this.showTownDestination("inn", "rest");
        result = HealingRules.restAtInn(player);
        if (Boolean(result.applied) !== Boolean(action.applied)
          || result.goldCost !== Number(action.goldCost ?? result.goldCost)) {
          return this.desync("The recorded Inn rest is unavailable in the current replay state.", action);
        }
        break;
      case "buy-provisions":
        this.showTownDestination("merchant", "buy");
        result = EconomyRules.buyProvisions(
          player, SHOP_DEFINITIONS.village_general_goods, state.shopStocks, action.quantity,
        );
        if (!result.applied || result.quantity !== Number(action.quantity)
          || result.goldCost !== Number(action.goldCost)) {
          return this.desync("The recorded provision purchase could not be applied.", action);
        }
        break;
      case "buy-item":
        this.showTownDestination(action.shopId === "village_smithy" ? "blacksmith" : action.shopId === "village_apothecary_shop" ? "apothecary" : "merchant", "buy");
        result = EconomyRules.buyItem(
          player, SHOP_DEFINITIONS[action.shopId], state.shopStocks, action.itemId, action.quantity,
        );
        if (!result.applied || result.quantity !== Number(action.quantity)
          || result.goldCost !== Number(action.goldCost)) {
          return this.desync("The recorded item purchase could not be applied.", action);
        }
        break;
      case "sell-item":
        this.showTownDestination("merchant", "sell");
        result = EconomyRules.sellItem(player, SHOP_DEFINITIONS.village_general_goods, action.itemId);
        if (!result.applied || result.goldEarned !== Number(action.goldEarned)) {
          return this.desync("The recorded sale could not be applied to the current inventory.", action);
        }
        break;
      case "craft-item":
      case "cook-recipe":
        this.showTownDestination(action.providerId === "blacksmith" ? "blacksmith" : action.providerId === "apothecary" ? "apothecary" : "inn", "craft");
        result = CraftingRules.craft(player, action.recipeId, action.providerId, {
          context: action.context ?? (action.type === "cook-recipe" ? "inn" : "town"),
        });
        if (!result.applied) {
          return this.desync("The recorded town crafting action is unavailable.", action);
        }
        const craftDifferences = replayCraftDifferences(action, result);
        if (craftDifferences.length) {
          return this.desync(`The recorded town crafting result differs: ${craftDifferences.join("; ")}.`, action);
        }
        break;
      case "treat-injury":
        this.showTownDestination("apothecary", "craft");
        result = InjuryRules.treatWithItem(player, action.characterId, action.itemId, { source: "campaign-replay" });
        if (!result.applied) return this.desync("The recorded injury treatment is unavailable.", action);
        break;
      case "select-companions":
        this.showPreparationView();
        if (replayStable(selectedCompanionIds(player)) !== replayStable(action.companionsBefore ?? selectedCompanionIds(player))) {
          return this.desync("The recorded companion change started from a different party.", action);
        }
        const requestedCompanions = [...new Set((action.companions ?? []).filter((companionId) => (
          COMPANION_DEFINITIONS[companionId] && player.unlockedCompanions.includes(companionId)
        )))].slice(0, 2);
        if (requestedCompanions.length !== (action.companions ?? []).length) {
          return this.desync("The recorded companion selection contains an unavailable companion.", action);
        }
        player.selectedCompanions = requestedCompanions;
        player.selectedCompanion = requestedCompanions[0] ?? null;
        result = { applied: true };
        break;
      case "equip-item":
        this.showPreparationView();
        result = applyReplayEquipment(player, action.itemId, action.equipmentSlot);
        if (!result.applied || result.previousItemId !== (action.previousItemId ?? null)) {
          return this.desync("The recorded equipment change does not match the current loadout.", action);
        }
        break;
      case "pack-loadout":
        this.showPreparationView();
        result = applyReplayPack(player, action.packedItems, action.packedMaterials);
        if (!result.applied) return this.desync(result.reason, action);
        break;
      case "departure":
        this.showPreparationView();
        if (!this.matchesDeparture(action)) {
          return this.desync("The recorded departure loadout does not match town replay state.", action);
        }
        return null;
      default:
        return this.desync(`Town replay does not support action type ${action.type}.`, action);
    }
    this.syncShopStocks();
    if (action.type !== "town-entry" && Number.isFinite(Number(action.goldCost))
      && action.type !== "inn-rest" && result.goldCost !== Number(action.goldCost)) {
      return this.desync(`The recorded town action changed gold by ${result.goldCost}, expected ${action.goldCost}.`, action);
    }
    if (action.type === "inn-rest" && beforeGold - player.currentGold !== Number(action.goldCost ?? 0)) {
      return this.desync("The recorded Inn payment changed the treasury unexpectedly.", action);
    }
    return null;
  },

  beginExpedition(action) {
    const state = campaignReplayState;
    const entry = state.data.expeditions[state.expeditionIndex];
    if (!entry) return this.completeCampaign();
    state.mode = "expedition";
    state.phase = "Traveling";
    state.expeditionActionBase = state.actionIndex;
    state.expeditionReplayActive = true;
    const started = ReplayController.start(entry.replay, { externalControls: true });
    if (!started) return this.desync("The expedition replay could not start from the recorded departure.", action);
    ReplayController.setSpeed(state.speed);
    ReplayController.setAutoSkip(state.autoSkipTravel);
    this.renderControls();
    return { meaningful: true, decision: true };
  },

  finishExpeditionIfReady() {
    const state = campaignReplayState;
    if (!state?.expeditionReplayActive || !ReplayController.isActive()) return false;
    const sub = ReplayController.state();
    if (!sub || sub.status !== "completed") return false;
    const completedPlayer = deepClone(sub.player);
    const completedExpedition = deepClone(sub.expedition);
    const summary = deepClone(game.summary);
    ReplayController.exit();
    copyReplayObject(state.player, completedPlayer);
    game.player = state.player;
    game.expedition = completedExpedition;
    game.summary = summary;
    state.expeditionReplayActive = false;
    state.lastExpeditionResult = {
      expeditionNumber: state.expeditionIndex + 1,
      outcome: entryOutcome(sub, summary),
      failureReason: entryFailureReason(state.data.expeditions[state.expeditionIndex], summary),
      hardFailureReason: state.data.expeditions[state.expeditionIndex]?.hardFailureReason ?? null,
    };
    state.mode = "return";
    state.phase = "Return";
    state.actionIndex = state.expeditionActionBase + sub.data.decisions.length;
    state.townCursor = 0;
    showScreen("summary");
    this.holdPresentation(0.8);
    this.renderControls();
    return true;
  },

  beginNextTown() {
    const state = campaignReplayState;
    state.expeditionIndex += 1;
    state.townCursor = 0;
    state.mode = "town";
    state.phase = "Town";
    game.expedition = null;
    game.summary = null;
    game.activeDestinationId = null;
    if (!state.data.towns[state.expeditionIndex]) return this.completeCampaign();
    showScreen("location");
    this.holdPresentation(0.45);
    return { meaningful: true };
  },

  completeCampaign() {
    const state = campaignReplayState;
    if (!state.actualStopReason) {
      const currentTown = state.data.towns[state.expeditionIndex];
      const stoppedBeforeDeparture = state.mode === "town"
        && currentTown && !currentTown.preparation.some((action) => action.type === "departure");
      state.actualStopReason = stoppedBeforeDeparture
        ? state.data.expected?.stopReason ?? "cannot-support-any-expedition"
        : state.lastExpeditionResult
        ? state.lastExpeditionResult.hardFailureReason
          ?? campaignFailureReasonForReplay(state.lastExpeditionResult)
        : state.data.expeditions.length ? "max-expeditions-reached" : state.data.expected?.stopReason ?? null;
    }
    state.status = "completed";
    state.playing = false;
    state.mode = "complete";
    state.phase = "Campaign End";
    state.warning = this.compareFinalState();
    game.expedition = null;
    game.summary = null;
    showScreen("location");
    this.renderControls();
    return { meaningful: true };
  },

  compareFinalState() {
    const state = campaignReplayState;
    const expected = state.data.expected?.endingState ?? state.data.endingState;
    if (!expected) return "Campaign completed without an expected final state for comparison.";
    const actual = campaignReplayStateSnapshot(state.player, state.shopStocks, state.expeditionIndex);
    const mismatches = [];
    [["gold", actual.gold, expected.gold], ["provisionStock", actual.provisionStock, expected.provisionStock],
      ["arthurHealth", actual.arthurHealth, expected.arthurHealth]].forEach(([label, got, wanted]) => {
      if (wanted !== undefined && Number(got) !== Number(wanted)) mismatches.push(`${label} ${got} (expected ${wanted})`);
    });
    ["ownedItems", "equippedItems", "materials", "learnedRecipes", "shopStocks"].forEach((field) => {
      if (expected[field] !== undefined && replayStable(actual[field]) !== replayStable(expected[field])) {
        mismatches.push(`${field} differ from the recorded campaign`);
      }
    });
    const expectedAttempts = state.data.expected?.expeditionsAttempted;
    const actualAttempts = state.lastExpeditionResult?.expeditionNumber ?? 0;
    if (expectedAttempts !== undefined && Number(expectedAttempts) !== actualAttempts) {
      mismatches.push(`expeditions ${actualAttempts} (expected ${expectedAttempts})`);
    }
    const stopReason = state.data.expected?.stopReason;
    if (stopReason && state.actualStopReason && stopReason !== state.actualStopReason) mismatches.push(`stop reason ${state.actualStopReason} (expected ${stopReason})`);
    return mismatches.length ? `Campaign playback completed with differences: ${mismatches.join("; ")}.` : null;
  },

  currentActionIndex() {
    const state = campaignReplayState;
    if (!state) return 0;
    if (state.expeditionReplayActive && ReplayController.isActive()) {
      return state.expeditionActionBase + ReplayController.state().decisionIndex;
    }
    return state.actionIndex;
  },

  currentTownAction() {
    const state = campaignReplayState;
    const town = state?.data.towns[state.expeditionIndex];
    if (!town || state.mode === "expedition" || state.mode === "complete") return null;
    const actions = state.mode === "return" ? town.returnActions : town.preparation;
    return actions[state.townCursor] ?? null;
  },

  skipReached(kind, initial, before, result = null) {
    const state = campaignReplayState;
    const current = this.progressSignature();
    if (kind === "end") return state.status === "completed";
    if (kind === "town") return state.mode === "town"
      && state.expeditionIndex > initial.expeditionIndex;
    if (kind === "expedition") return state.expeditionReplayActive
      && (!initial.expeditionActive || state.expeditionIndex > initial.expeditionIndex);
    if (kind === "purchase") return current !== before && ["buy-item", "buy-provisions"].includes(state.lastTownAction?.type);
    if (kind === "combat") return ReplayController.isActive() && ReplayController.state()?.combatCount > initial.combatCount
      && ReplayController.state()?.expedition?.combat;
    if (kind === "camp") return ReplayController.isActive()
      && (ReplayController.state()?.expedition?.campCycle ?? 0) > initial.campCycle;
    if (kind === "return") return state.mode === "return"
      && (initial.mode !== "return" || state.expeditionIndex > initial.expeditionIndex);
    if (kind === "event") return Boolean(result?.meaningful);
    return false;
  },

  progressSignature() {
    const sub = ReplayController.isActive() ? ReplayController.state() : null;
    return JSON.stringify({
      expeditionIndex: campaignReplayState?.expeditionIndex,
      mode: campaignReplayState?.mode,
      townCursor: campaignReplayState?.townCursor,
      actionIndex: this.currentActionIndex(),
      expeditionDecisionIndex: sub?.decisionIndex,
      distance: sub?.expedition?.distance,
      combat: sub?.expedition?.combat?.id,
      camp: sub?.expedition?.campCycle,
      status: campaignReplayState?.status,
    });
  },

  holdPresentation(seconds) {
    if (campaignReplayState) campaignReplayState.presentationWait = Math.max(campaignReplayState.presentationWait, seconds);
  },

  renderReplayGame() {
    if (!campaignReplayState?.silent) {
      if (campaignReplayState.expeditionReplayActive) ReplayController.renderReplayGame();
      else renderScreen();
    }
  },

  showTownDestination(destinationId, tab = "buy") {
    game.player = campaignReplayState.player;
    game.activeDestinationId = destinationId;
    game.shopTab = tab;
    game.innTab = tab === "craft" ? "cook" : "rest";
    game.player.currentLocationId = "broceliande_village";
    game.screen = "destination";
    renderScreen();
  },

  showPreparationView() {
    game.player = campaignReplayState.player;
    game.activeDestinationId = null;
    game.preparationSupplies = Math.min(
      campaignReplayState.player.provisions,
      partyProvisionCapacity(selectedCompanionIds(campaignReplayState.player)),
    );
    game.screen = "preparation";
    renderScreen();
  },

  matchesDeparture(action) {
    const player = campaignReplayState.player;
    return player.selectedExpeditionId === action.expeditionId
      && replayStable(selectedCompanionIds(player)) === replayStable(action.companions)
      && replayStable(player.equippedItems) === replayStable(action.loadout)
      && replayStable(player.packedItems) === replayStable(Array.isArray(action.packedItems)
        ? action.packedItems : Object.keys(action.packedItems ?? {}))
      && replayStable(player.packedMaterials) === replayStable(action.packedMaterials ?? {})
      && player.provisions >= Number(action.provisions || 0);
  },

  syncShopStocks() {
    if (!campaignReplayState) return;
    const stocks = campaignReplayState.shopStocks;
    game.provisionShopStock = Object.fromEntries(Object.entries(stocks).filter(([key]) => !key.includes(":")));
    game.itemShopStock = Object.fromEntries(Object.entries(stocks).filter(([key]) => key.includes(":")));
  },

  mountControls() {
    if (campaignReplayControls) return;
    campaignReplayControls = document.createElement("aside");
    campaignReplayControls.className = "replay-controls campaign-replay-controls";
    campaignReplayControls.setAttribute("aria-label", "Campaign replay controls");
    campaignReplayControls.addEventListener("click", (event) => {
      const button = event.target.closest("[data-replay-action]");
      const segment = event.target.closest("[data-campaign-segment]");
      if (segment) this.seek(segment.dataset.campaignSegment);
      if (!button) return;
      const action = button.dataset.replayAction;
      if (action === "play") this.play();
      if (action === "pause") this.pause();
      if (action === "toggle-more") this.toggleMore();
      if (action === "next-event") this.skipTo("event");
      if (action === "restart") this.restart();
      if (action === "step") this.step();
      if (action === "skip-town") this.skipTo("town");
      if (action === "skip-expedition") this.skipTo("expedition");
      if (action === "skip-purchase") this.skipTo("purchase");
      if (action === "skip-combat") this.skipTo("combat");
      if (action === "skip-camp") this.skipTo("camp");
      if (action === "skip-return") this.skipTo("return");
      if (action === "skip-end") this.skipTo("end");
      if (action === "exit") this.exit();
    });
    campaignReplayControls.addEventListener("change", (event) => {
      if (event.target.matches("[data-replay-speed]")) this.setSpeed(event.target.value);
      if (event.target.matches("[data-replay-autoskip]")) this.setAutoSkip(event.target.checked);
      if (event.target.matches("[data-replay-seek]")) this.seek(event.target.value);
    });
    document.body.append(campaignReplayControls);
  },

  clearControls() {
    campaignReplayControls?.remove();
    campaignReplayControls = null;
  },

  buildControls() {
    if (!campaignReplayControls || !campaignReplayState) return;
    const state = campaignReplayState;
    const data = state.data ?? { timeline: [], totalActionCount: 0, expeditions: [], seed: "", campaignId: "" };
    const sub = ReplayController.isActive() ? ReplayController.state() : null;
    const player = sub?.player ?? state.player;
    const expedition = sub?.expedition;
    const status = state.status === "playing" ? "Playing" : state.status === "paused" ? "Paused"
      : state.status === "completed" ? "Complete" : "Replay desync";
    const canPlay = !["completed", "desync"].includes(state.status);
    const phase = expedition ? replayPhaseForExpedition(expedition) : state.phase;
    const equipment = Object.values(player?.equippedItems ?? {}).map((itemId) => ITEM_DEFINITIONS[itemId]?.name ?? itemId).join(" · ") || "None";
    const timeline = data.timeline.map((segment, index) => `<button type="button" class="campaign-replay-segment ${segment.kind} ${segment.expeditionNumber === state.expeditionIndex + 1 ? "is-current" : ""}" data-campaign-segment="${segment.actionIndex}" title="Seek to ${escapeReplayText(segment.label)}"><strong>${escapeReplayText(segment.label)}</strong>${segment.kind === "expedition" ? `<span>${segment.status} · ${segment.maximumDistance ?? "—"}</span>` : ""}</button>`).join("");
    campaignReplayControls.innerHTML = `
      <div class="replay-controls-heading"><div><span class="replay-eyebrow">CAMPAIGN REPLAY</span><strong data-replay-status>${status}</strong></div><span data-replay-meta>Seed: ${escapeReplayText(data.seed)} · ${escapeReplayText(data.campaignId)}</span></div>
      <div class="replay-controls-row replay-primary-controls"><button type="button" data-replay-action="play" ${canPlay ? "" : "disabled"}>Play</button><button type="button" data-replay-action="pause" ${canPlay ? "" : "disabled"}>Pause</button><button type="button" data-replay-action="restart">Restart</button><button type="button" data-replay-action="step" ${canPlay ? "" : "disabled"}>Step</button><label>Speed <select data-replay-speed>${[0.25, 0.5, 1, 2, 4, 8].map((speed) => `<option value="${speed}" ${state.speed === speed ? "selected" : ""}>${speed}×</option>`).join("")}</select></label><label class="replay-checkbox"><input type="checkbox" data-replay-autoskip ${state.autoSkipTravel ? "checked" : ""}> Auto-skip travel</label></div>
      <div class="replay-controls-row replay-skip-controls"><button type="button" data-replay-action="skip-town" ${canPlay ? "" : "disabled"}>Next Town</button><button type="button" data-replay-action="skip-expedition" ${canPlay ? "" : "disabled"}>Next Expedition</button><button type="button" data-replay-action="skip-purchase" ${canPlay ? "" : "disabled"}>Next Purchase</button><button type="button" data-replay-action="skip-combat" ${canPlay ? "" : "disabled"}>Next Combat</button><button type="button" data-replay-action="skip-camp" ${canPlay ? "" : "disabled"}>Next Camp</button><button type="button" data-replay-action="skip-return" ${canPlay ? "" : "disabled"}>Next Return</button><button type="button" data-replay-action="skip-end" ${canPlay ? "" : "disabled"}>Skip to Campaign End</button></div>
      <div class="campaign-replay-status"><span data-replay-expedition>Expedition ${Math.min(state.expeditionIndex + 1, Math.max(1, data.expeditions.length))} / ${data.expeditions.length}</span><span data-replay-phase>Phase: ${escapeReplayText(phase)}</span><span data-replay-action-index>Action ${Math.min(this.currentActionIndex() + 1, data.totalActionCount)} / ${data.totalActionCount}</span><span data-replay-gold>Gold: ${Math.floor(player?.currentGold ?? 0)}g</span><span data-replay-arthur>Arthur: ${Math.ceil(expedition?.health ?? HealingRules.arthurHealth(player))}/${Math.ceil(expedition ? InjuryRules.effectiveMaxHealth(expedition, "arthur") : HealingRules.arthurMaxHealth(player))}</span><span data-replay-provisions>Provisions: ${Math.floor(expedition?.provisions ?? player?.provisions ?? 0)}</span><span data-replay-equipment>Gear: ${escapeReplayText(equipment)}</span></div>
      <div class="campaign-replay-timeline">${timeline}</div>
      <div class="replay-progress-row"><input class="replay-seek" type="range" data-replay-seek min="0" max="${data.totalActionCount}" value="${this.currentActionIndex()}" aria-label="Seek campaign replay"><span data-replay-speed-label>Speed ${state.speed}×</span></div>
      <p class="replay-annotation" data-replay-annotation hidden>${state.lastTownAction ? escapeReplayText(campaignTownActionLabel(state.lastTownAction)) : ""}</p>
      <pre class="replay-error" data-replay-error role="alert" ${state.error ? "" : "hidden"}>${state.error ? escapeReplayText(JSON.stringify(state.error, null, 2)) : ""}</pre>
      <p class="replay-warning" data-replay-warning role="status" ${state.warning ? "" : "hidden"}>${state.warning ? escapeReplayText(state.warning) : ""}</p>
      <button class="replay-exit-button" type="button" data-replay-action="exit">Exit Replay</button>`;
    this.decorateCampaignControls();
  },

  decorateCampaignControls() {
    ReplayController.decorateCampaignControls();
  },

  renderControls() {
    if (!campaignReplayControls || !campaignReplayState) return;
    if (!campaignReplayControls.querySelector("[data-replay-status]")) this.buildControls();
    const state = campaignReplayState;
    const data = state.data ?? { timeline: [], totalActionCount: 0, expeditions: [], seed: "", campaignId: "" };
    const sub = ReplayController.isActive() ? ReplayController.state() : null;
    const player = sub?.player ?? state.player;
    const expedition = sub?.expedition;
    const status = state.fastForwardJob
      ? state.fastForwardJob.type === "seek" ? "Seeking" : "Skipping"
      : state.status === "playing" ? "Playing" : state.status === "paused" ? "Paused"
        : state.status === "completed" ? "Complete" : "Replay desync";
    const canPlay = !["completed", "desync"].includes(state.status);
    const phase = expedition ? replayPhaseForExpedition(expedition) : state.phase;
    const equipment = Object.values(player?.equippedItems ?? {}).map((itemId) => ITEM_DEFINITIONS[itemId]?.name ?? itemId).join(" · ") || "None";
    const actionIndex = this.currentActionIndex();
    const arthurHealth = player ? Math.ceil(expedition?.health ?? HealingRules.arthurHealth(player)) : "—";
    const arthurMaxHealth = player ? Math.ceil(expedition ? InjuryRules.effectiveMaxHealth(expedition, "arthur") : HealingRules.arthurMaxHealth(player)) : "—";
    const setText = (selector, value) => {
      const node = campaignReplayControls.querySelector(selector);
      if (node) node.textContent = String(value);
    };
    setText("[data-replay-status]", status);
    setText("[data-replay-meta]", `Seed: ${data.seed} · ${data.campaignId}`);
    setText("[data-replay-expedition]", `Expedition ${Math.min(state.expeditionIndex + 1, Math.max(1, data.expeditions.length))} / ${data.expeditions.length}`);
    setText("[data-replay-phase]", `Phase: ${phase}`);
    setText("[data-replay-action-index]", `Action ${Math.min(actionIndex + 1, data.totalActionCount)} / ${data.totalActionCount}`);
    setText("[data-replay-progress-action-index]", `Action ${Math.min(actionIndex + 1, data.totalActionCount)} / ${data.totalActionCount}`);
    setText("[data-replay-glance-expedition]", `Exp ${Math.min(state.expeditionIndex + 1, Math.max(1, data.expeditions.length))}/${data.expeditions.length}`);
    setText("[data-replay-glance-phase]", phase);
    setText("[data-replay-gold]", `Gold: ${Math.floor(player?.currentGold ?? 0)}g`);
    setText("[data-replay-arthur]", `Arthur: ${arthurHealth}/${arthurMaxHealth}`);
    setText("[data-replay-provisions]", `Provisions: ${Math.floor(expedition?.provisions ?? player?.provisions ?? 0)}`);
    setText("[data-replay-equipment]", `Gear: ${equipment}`);
    setText("[data-replay-speed-label]", `Speed ${state.speed}x`);
    ["play", "pause", "step", "next-event", "skip-town", "skip-expedition", "skip-purchase", "skip-combat", "skip-camp", "skip-return", "skip-end"].forEach((action) => {
      const button = campaignReplayControls.querySelector(`[data-replay-action="${action}"]`);
      if (button) button.disabled = !canPlay;
    });
    const speed = campaignReplayControls.querySelector("[data-replay-speed]");
    if (speed) speed.value = String(state.speed);
    const autoSkip = campaignReplayControls.querySelector("[data-replay-autoskip]");
    if (autoSkip) autoSkip.checked = Boolean(state.autoSkipTravel);
    const seek = campaignReplayControls.querySelector("[data-replay-seek]");
    if (seek) {
      seek.max = String(data.totalActionCount ?? 0);
      seek.value = String(Math.min(actionIndex, Number(data.totalActionCount) || 0));
    }
    campaignReplayControls.querySelectorAll("[data-campaign-segment]").forEach((segment) => {
      const timelineSegment = data.timeline?.find((entry) => String(entry.actionIndex) === segment.dataset.campaignSegment);
      segment.classList.toggle("is-current", timelineSegment?.expeditionNumber === state.expeditionIndex + 1);
    });
    const annotation = campaignReplayControls.querySelector("[data-replay-annotation]");
    if (annotation) {
      annotation.hidden = !state.lastTownAction;
      annotation.textContent = state.lastTownAction ? campaignTownActionLabel(state.lastTownAction) : "";
    }
    const error = campaignReplayControls.querySelector("[data-replay-error]");
    if (error) {
      error.hidden = !state.error;
      error.textContent = state.error ? JSON.stringify(state.error, null, 2) : "";
    }
    const errorContainer = campaignReplayControls.querySelector("[data-replay-error-container]");
    if (errorContainer) errorContainer.hidden = !state.error;
    const errorMessage = state.error ? `Replay desync: ${state.error.message ?? "Unknown replay error"}` : "";
    setText("[data-replay-error-inline]", errorMessage);
    const inlineError = campaignReplayControls.querySelector("[data-replay-error-inline]");
    if (inlineError) inlineError.hidden = !state.error;
    setText("[data-replay-error-details-summary]", errorMessage || "Replay error details");
    const warning = campaignReplayControls.querySelector("[data-replay-warning]");
    if (warning) {
      warning.hidden = !state.warning;
      warning.textContent = state.warning ?? "";
    }
  },

  desync(message, action) {
    const state = campaignReplayState;
    state.playing = false;
    state.status = "desync";
    state.error = {
      message,
      actionIndex: this.currentActionIndex(),
      expeditionNumber: state.expeditionIndex + 1,
      townStep: state.townCursor,
      expectedAction: deepClone(action ?? null),
      currentReplayState: campaignReplaySnapshotForError(),
    };
    this.renderReplayGame();
    this.renderControls();
    return { meaningful: true, desync: true };
  },

  exit() {
    if (!campaignReplayState) return;
    this.cancelFastForward();
    if (ReplayController.isActive()) ReplayController.exit();
    const previous = campaignReplayState.realGameState;
    this.clearControls();
    Object.assign(game, previous);
    if (ui.saveStatus && previous.saveStatus !== undefined) ui.saveStatus.textContent = previous.saveStatus;
    campaignReplayState = null;
    document.body.classList.remove("replay-active");
    renderScreen();
  },
});

function captureReplayGameState() {
  return {
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
}

function createCampaignReplayPlayer(snapshot = {}) {
  const defaults = SaveSystem.createDefaultPlayerState();
  const merged = {
    ...defaults,
    ...deepClone(snapshot),
    currentGold: snapshot.currentGold ?? snapshot.gold ?? defaults.currentGold,
    provisions: snapshot.provisions ?? snapshot.provisionStock ?? defaults.provisions,
    currentLocationId: snapshot.currentLocation ?? snapshot.currentLocationId ?? defaults.currentLocationId,
    equippedItems: { ...defaults.equippedItems, ...(snapshot.equippedItems ?? {}) },
    companionStates: { ...defaults.companionStates, ...(snapshot.companionStates ?? {}) },
    campaignFlags: { ...defaults.campaignFlags, ...(snapshot.campaignFlags ?? {}) },
  };
  const player = sanitizePlayerState(merged, defaults);
  player.currentGold = Number(merged.currentGold) || 0;
  player.provisions = Math.max(0, Number(merged.provisions) || 0);
  player.packedItems = [...(snapshot.packedItems ?? player.packedItems)];
  player.packedMaterials = { ...(snapshot.packedMaterials ?? player.packedMaterials) };
  player.selectedCompanions = [...(snapshot.selectedCompanions ?? (snapshot.selectedCompanion ? [snapshot.selectedCompanion] : player.selectedCompanions))];
  player.selectedCompanion = snapshot.selectedCompanion ?? player.selectedCompanions[0] ?? null;
  player.unlockedCompanions = [...new Set([...(player.unlockedCompanions ?? []), ...player.selectedCompanions])];
  return player;
}

function applyReplayEquipment(player, itemId, equipmentSlot) {
  const item = ITEM_DEFINITIONS[itemId];
  if (!item?.equippable || !player.ownedItems[itemId] || item.equipmentSlot !== equipmentSlot) {
    return { applied: false, reason: "The recorded equipment is not owned or does not fit the recorded slot." };
  }
  const previousItemId = player.equippedItems[equipmentSlot] ?? null;
  player.equippedItems[equipmentSlot] = itemId;
  player.packedItems = player.packedItems.filter((packedItemId) => packedItemId !== itemId);
  return { applied: true, previousItemId };
}

function applyReplayPack(player, packedItems, packedMaterials) {
  const ids = Array.isArray(packedItems) ? packedItems : Object.keys(packedItems ?? {});
  const valid = ids.length <= EXPEDITION_TUNING.packSlots
    && ids.every((itemId) => ITEM_DEFINITIONS[itemId]?.carriable
      && !MaterialRules.isMaterialId(itemId) && player.ownedItems[itemId]
      && !Object.values(player.equippedItems).includes(itemId));
  if (!valid) return { applied: false, reason: "The recorded pack contents exceed capacity or contain an unavailable item." };
  const selectedMaterials = MaterialRules.selectionFromRequest(packedMaterials ?? {}, player.materials);
  if (MaterialRules.collectionTotal(selectedMaterials) > EXPEDITION_TUNING.materialBagCapacity) {
    return { applied: false, reason: "The recorded Material Bag contents exceed capacity." };
  }
  player.packedItems = [...ids];
  player.packedMaterials = selectedMaterials;
  return { applied: true };
}

function copyReplayObject(target, source) {
  Object.keys(target ?? {}).forEach((key) => delete target[key]);
  Object.assign(target, deepClone(source));
}

function replayStable(value) {
  if (Array.isArray(value)) return `[${value.map(replayStable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${replayStable(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function replayCraftDifferences(action, result) {
  const differences = [];
  if (action.recipeId !== undefined && result.recipeId !== action.recipeId) {
    differences.push(`recipe ${result.recipeId} (expected ${action.recipeId})`);
  }
  if (action.context !== undefined && result.context !== action.context) {
    differences.push(`context ${result.context ?? "unknown"} (expected ${action.context})`);
  }
  const expectedIngredients = action.ingredientsConsumed
    ?? action.result?.ingredientsConsumed
    ?? action.result?.materialsConsumed
    ?? null;
  const actualIngredients = {
    ...(result.materialsConsumed ?? {}),
    ...(result.itemsConsumed ?? {}),
  };
  if (expectedIngredients && replayStable(replayQuantityMap(expectedIngredients))
    !== replayStable(replayQuantityMap(actualIngredients))) {
    differences.push(`ingredients ${replayStable(replayQuantityMap(actualIngredients))} (expected ${replayStable(replayQuantityMap(expectedIngredients))})`);
  }
  if (action.provisionsGained !== undefined
    && Number(result.provisions ?? 0) !== Number(action.provisionsGained)) {
    differences.push(`provisions ${result.provisions ?? 0} (expected ${action.provisionsGained})`);
  }
  if (action.goldCost !== undefined && Number(result.goldCost ?? 0) !== Number(action.goldCost)) {
    differences.push(`gold cost ${result.goldCost ?? 0} (expected ${action.goldCost})`);
  }
  if (action.itemId !== undefined && result.itemId !== action.itemId) {
    differences.push(`item ${result.itemId ?? "none"} (expected ${action.itemId})`);
  }
  if (action.quantity !== undefined && Number(result.quantity ?? 0) !== Number(action.quantity)) {
    differences.push(`quantity ${result.quantity ?? 0} (expected ${action.quantity})`);
  }
  return differences;
}

function replayQuantityMap(value) {
  return Object.fromEntries(Object.entries(value ?? {})
    .map(([key, quantity]) => [key, Number(quantity) || 0])
    .filter(([, quantity]) => quantity !== 0));
}

function campaignReplayPlayerSnapshot(player) {
  return {
    gold: player.currentGold,
    provisionStock: player.provisions,
    ownedItems: deepClone(player.ownedItems),
    equippedItems: deepClone(player.equippedItems),
    packedItems: deepClone(player.packedItems),
    packedMaterials: deepClone(player.packedMaterials),
    materials: deepClone(player.materials),
    learnedRecipes: deepClone(player.learnedRecipes),
    arthurHealth: HealingRules.arthurHealth(player),
    selectedCompanions: deepClone(selectedCompanionIds(player)),
    selectedCompanion: player.selectedCompanion,
    companionStates: deepClone(player.companionStates),
  };
}

function campaignReplayStateSnapshot(player, shopStocks, expeditionNumber) {
  return {
    ...campaignReplayPlayerSnapshot(player),
    expeditionNumber,
    shopStocks: deepClone(shopStocks),
  };
}

function campaignReplaySnapshotForError() {
  const state = campaignReplayState;
  const sub = ReplayController.isActive() ? ReplayController.state() : null;
  return {
    phase: state.phase,
    mode: state.mode,
    expeditionNumber: state.expeditionIndex + 1,
    townStep: state.townCursor,
    player: campaignReplayPlayerSnapshot(sub?.player ?? state.player),
    expedition: sub?.expedition ? {
      status: sub.expedition.status,
      distance: sub.expedition.distance,
      direction: sub.expedition.direction,
      travelState: sub.expedition.travelState,
      encounter: sub.expedition.activeEncounter?.encounterId ?? null,
      combat: sub.expedition.combat?.id ?? null,
    } : null,
  };
}

function replayPhaseForExpedition(expedition) {
  if (expedition.combat) return "Combat";
  if (expedition.travelState === "camped") return "Camp";
  if (expedition.activeEncounter) return expedition.activeEncounter.eventKind === "camp" ? "Camp" : "Encounter";
  if (expedition.direction === "returning") return "Return";
  return "Traveling";
}

function campaignTownActionLabel(action) {
  const itemName = ITEM_DEFINITIONS[action.itemId]?.name ?? action.itemId;
  const recipeName = RECIPE_DEFINITIONS[action.recipeId]?.name ?? action.recipeId;
  if (action.type === "town-entry") return action.provisionsGranted > 0 ? `Town entry granted ${action.provisionsGranted} provisions` : "Entered town";
  if (action.type === "inn-rest") return action.applied ? `Rested at the Inn · ${action.goldCost}g` : "Skipped unaffordable Inn rest";
  if (action.type === "buy-provisions") return `Bought ${action.quantity} provisions · ${action.goldCost}g`;
  if (action.type === "buy-item") return `Bought ${itemName} · ${action.goldCost}g`;
  if (action.type === "sell-item") return `Sold ${itemName} · +${action.goldEarned}g`;
  if (["craft-item", "cook-recipe"].includes(action.type)) return `Crafted ${recipeName}`;
  if (action.type === "equip-item") return `Equipped ${itemName}`;
  if (action.type === "select-companions") return `Selected companions: ${(action.companions ?? []).join(", ") || "traveling alone"}`;
  if (action.type === "pack-loadout") return "Prepared pack and Material Bag";
  if (action.type === "departure") return "Departed for the next expedition";
  return action.type;
}

function entryOutcome(subReplay, summary) {
  return summary?.outcome ?? (subReplay?.expedition?.status === "returned" ? "returned" : "failed");
}

function entryFailureReason(entry, summary) {
  return entry?.failureReason ?? (summary?.outcome === "failed" ? summary.message ?? null : null);
}

function campaignFailureReasonForReplay(result) {
  if (result.hardFailureReason) return result.hardFailureReason;
  if (result.outcome !== "failed") return "max-expeditions-reached";
  if (/Arthur was too badly injured|Arthur died/i.test(result.failureReason ?? "")) {
    return "arthur-died";
  }
  if (/exhausted its provisions|provision/i.test(result.failureReason ?? "")) {
    return "expedition-resource-exhaustion";
  }
  return "expedition-resource-exhaustion";
}

function reconstructLegacyCampaignTownActions(campaign, raw, entries) {
  const decisions = raw.betweenExpeditionDecisions ?? campaign?.betweenExpeditionDecisions ?? [];
  const actions = [];
  entries.forEach((entry, index) => {
    const expeditionNumber = entry.expeditionNumber;
    const decision = decisions[index] ?? {};
    actions.push({ type: "town-entry", expeditionNumber, provisionsGranted: decision.townProvisionGrant ?? 0 });
    (decision.healing?.restActions ?? []).forEach((rest) => actions.push({
      type: "inn-rest", expeditionNumber, applied: Boolean(rest.applied), goldCost: rest.goldCost ?? 0,
    }));
    (decision.innCookingActions ?? []).forEach((action) => actions.push({
      type: "cook-recipe", expeditionNumber, ...action, context: "inn",
    }));
    if (decision.provisionPurchase?.quantity > 0) actions.push({
      type: "buy-provisions", expeditionNumber, quantity: decision.provisionPurchase.quantity,
      goldCost: decision.provisionPurchase.goldCost,
    });
    (decision.craftingActions ?? []).forEach((action) => actions.push({ type: "craft-item", expeditionNumber, providerId: "apothecary", ...action }));
    if (decision.bandagePurchase?.quantity > 0) actions.push({
      type: "buy-item", expeditionNumber, shopId: "village_general_goods", itemId: "bandages",
      quantity: decision.bandagePurchase.quantity, goldCost: decision.bandagePurchase.goldCost,
    });
    (decision.equipmentPurchases ?? []).forEach((purchase) => {
      actions.push({ type: "buy-item", expeditionNumber, shopId: "village_smithy", ...purchase });
      actions.push({ type: "equip-item", expeditionNumber, itemId: purchase.itemId, equipmentSlot: purchase.equipmentSlot, previousItemId: purchase.previousItemId ?? null });
    });
    actions.push({
      type: "pack-loadout", expeditionNumber,
      packedItems: Object.keys(decision.packContents ?? {}), packedMaterials: decision.materialBagContents ?? {},
    });
    actions.push({
      type: "departure", expeditionNumber, expeditionId: entry.replay.expeditionId,
      expeditionSeed: entry.expeditionSeed, companions: entry.replay.companions,
      provisions: entry.replay.startingProvisions, paceId: entry.replay.paceId, rationId: entry.replay.rationId,
      loadout: entry.replay.loadout, packedItems: entry.replay.packedItems, packedMaterials: entry.replay.packedMaterials,
      legacyReconstructed: true,
    });
    (campaign?.expeditions?.[index]?.soldItems ?? []).forEach((sale) => actions.push({
      type: "sell-item", expeditionNumber, itemId: sale.itemId, quantity: 1, goldEarned: sale.goldEarned,
    }));
  });
  return actions;
}

function normalizeCampaignTownActions(actions) {
  let currentExpeditionNumber = 1;
  return actions.map((sourceAction) => {
    const action = deepClone(sourceAction ?? {});
    const explicitExpeditionNumber = Number(action.expeditionNumber);
    if (Number.isFinite(explicitExpeditionNumber) && explicitExpeditionNumber > 0) {
      currentExpeditionNumber = explicitExpeditionNumber;
    } else {
      action.expeditionNumber = currentExpeditionNumber;
    }
    if (action.type === "cook-recipe"
      && action.providerId === "campfire"
      && !action.context) {
      action.context = "inn";
    }
    action.expeditionNumber = Number(action.expeditionNumber) || currentExpeditionNumber;
    return action;
  });
}
