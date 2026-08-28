"use strict";

const Minigames = Object.freeze({
  definition(minigameId) {
    return MINIGAME_DEFINITIONS[minigameId] ?? null;
  },

  definitionForEncounter(outcome) {
    return this.definition(outcome?.minigameId);
  },

  createSession(minigameId, context = {}) {
    const definition = this.definition(minigameId);
    if (!definition || definition.type !== "fishing") return null;
    if (MinigameRules.validateDefinition(definition).length > 0) return null;
    return MinigameRules.createFishingSession(definition, context);
  },

  simulate(minigameId, context = {}) {
    const definition = this.definition(minigameId);
    if (!definition || definition.type !== "fishing") return null;
    if (MinigameRules.validateDefinition(definition).length > 0) return null;
    return MinigameRules.simulateFishing(definition, context);
  },
});
