"use strict";

const DialogueSystem = Object.freeze({
  start(sequenceId, context = {}) {
    const sequence = DIALOGUE_DEFINITIONS[sequenceId];
    if (!sequence?.nodes?.[sequence.start]) return null;
    return {
      sequenceId,
      nodeId: sequence.start,
      context: context.returnContext ?? context.dialogueContext ?? null,
    };
  },

  startSimple(speakerId, text, portraitKey = "placeholder", context = {}) {
    if (!speakerId || !text) return null;
    return {
      sequenceId: null,
      nodeId: "simple",
      context: context.returnContext ?? context.dialogueContext ?? null,
      transientSequence: {
        start: "simple",
        nodes: {
          simple: {
            speakerId,
            portraitKey,
            text,
          },
        },
      },
    };
  },

  sequence(session) {
    return session?.transientSequence
      ?? (session ? DIALOGUE_DEFINITIONS[session.sequenceId] : null);
  },

  currentNode(session) {
    return this.sequence(session)?.nodes?.[session.nodeId] ?? null;
  },

  conditionsMet(conditions = [], context = {}) {
    return conditions.every((condition) => {
      if (typeof EncounterRequirements !== "undefined") {
        return EncounterRequirements.meets(condition, context);
      }
      const player = context.player;
      switch (condition.type) {
        case "campaignFlag":
          return player?.campaignFlags?.[condition.flag] === (condition.value ?? true);
        case "ownsItem":
          return Boolean(player?.ownedItems?.[condition.itemId]);
        case "notOwnsItem":
          return !player?.ownedItems?.[condition.itemId];
        default:
          return false;
      }
    });
  },

  availableChoices(session, context = {}) {
    return (this.currentNode(session)?.choices ?? [])
      .filter((choice) => this.conditionsMet(
        [...(choice.requirements ?? []), ...(choice.conditions ?? [])],
        context,
      ));
  },

  advance(session, context = {}) {
    const node = this.currentNode(session);
    if (!node || (node.choices?.length ?? 0) > 0) return { session, ended: false, effects: [] };
    return this.moveFromNode(session, node, context);
  },

  choose(session, choiceId, context = {}) {
    const node = this.currentNode(session);
    const choice = this.availableChoices(session, context).find((entry) => entry.id === choiceId);
    if (!node || !choice) return { session, ended: false, effects: [] };
    return this.moveFromNode(session, {
      ...node,
      ...choice,
      effects: [...(node.effects ?? []), ...(choice.effects ?? [])],
    }, context);
  },

  moveFromNode(session, node, context) {
    const effectResult = this.applyEffects(context, node.effects ?? []);
    const nextNodeId = node.next;
    if (!nextNodeId || node.end) {
      return {
        session: null,
        ended: true,
        effects: effectResult.effects,
        messages: effectResult.messages,
        rewards: effectResult.rewards,
        toasts: effectResult.toasts,
      };
    }
    return {
      session: { ...session, nodeId: nextNodeId },
      ended: false,
      effects: effectResult.effects,
      messages: effectResult.messages,
      rewards: effectResult.rewards,
      toasts: effectResult.toasts,
    };
  },

  applyEffects(contextOrPlayer, effects = []) {
    const context = contextOrPlayer?.player
      ? contextOrPlayer
      : { player: contextOrPlayer };
    const player = context.player;
    if (!player) return { effects: [], messages: [], rewards: [], toasts: [] };
    player.campaignFlags ??= {};
    player.unlockedCompanions ??= [];
    player.ownedItems ??= {};
    player.learnedKnowledge ??= [];
    player.learnedRecipes ??= [];
    const applied = [];
    const messages = [];
    const rewards = [];
    const toasts = [];

    effects.forEach((effect) => {
      if (!effect?.type) return;
      switch (effect.type) {
        case "setFlag":
        case "setCampaignFlag":
          player.campaignFlags[effect.flag] = effect.value ?? true;
          if (effect.message) messages.push(effect.message);
          applied.push(effect);
          break;
        case "unlockVillage":
          player.campaignFlags.broceliande_intro_complete = true;
          applied.push(effect);
          break;
        case "unlockCompanion":
          if (COMPANION_DEFINITIONS[effect.companionId]
            && !player.unlockedCompanions.includes(effect.companionId)) {
            player.unlockedCompanions.push(effect.companionId);
            messages.push(`${COMPANION_DEFINITIONS[effect.companionId].name} is now available as a companion.`);
          }
          applied.push(effect);
          break;
        case "giveItem": {
          const item = ITEM_DEFINITIONS[effect.itemId];
          if (item && (!item.unique || !player.ownedItems[effect.itemId])) {
            player.ownedItems[effect.itemId] = (player.ownedItems[effect.itemId] ?? 0) + (effect.quantity ?? 1);
            messages.push(`Received ${effect.quantity ?? 1} ${item.name}.`);
            applied.push(effect);
          }
          break;
        }
        case "learnRecipe": {
          const recipe = RECIPE_DEFINITIONS[effect.recipeId];
          if (!recipe || player.learnedRecipes.includes(effect.recipeId)) break;
          if (context.expedition && typeof EncounterOutcomes !== "undefined") {
            const resolved = EncounterOutcomes.resolveAll([effect], context);
            messages.push(...resolved.messages);
            rewards.push(...resolved.rewards);
          } else {
            player.learnedRecipes.push(effect.recipeId);
            messages.push(`Learned the ${recipe.name} recipe.`);
          }
          applied.push(effect);
          break;
        }
        case "learnKnowledge":
          if (!player.learnedKnowledge.includes(effect.knowledgeId)) {
            player.learnedKnowledge.push(effect.knowledgeId);
            if (typeof KNOWLEDGE_DEFINITIONS !== "undefined" && KNOWLEDGE_DEFINITIONS[effect.knowledgeId]) {
              messages.push(`Knowledge learned: ${KNOWLEDGE_DEFINITIONS[effect.knowledgeId].name}`);
            }
            applied.push(effect);
          }
          break;
        case "modifyResource":
          if (context.expedition && typeof EncounterOutcomes !== "undefined") {
            const resolved = EncounterOutcomes.resolveAll([effect], context);
            messages.push(...resolved.messages);
            rewards.push(...resolved.rewards);
            applied.push(effect);
          } else if (effect.resource in player) {
            player[effect.resource] = Math.max(0, (Number(player[effect.resource]) || 0) + (Number(effect.amount) || 0));
            applied.push(effect);
          }
          break;
        case "showToast":
          toasts.push(effect);
          applied.push(effect);
          break;
        default:
          if (context.expedition && typeof EncounterOutcomes !== "undefined"
            && !["startDialogue", "startCombat", "setRunFlag", "changePath"].includes(effect.type)) {
            const resolved = EncounterOutcomes.resolveAll([effect], context);
            messages.push(...resolved.messages);
            rewards.push(...resolved.rewards);
            if (!resolved.dialogue && !resolved.combat) applied.push(effect);
          } else {
            console.warn(`Unsupported dialogue effect type without an expedition context: ${effect.type}`);
          }
          break;
      }
    });
    return { effects: applied, messages, rewards, toasts };
  },
});
