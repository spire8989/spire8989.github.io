"use strict";

const DialogueSystem = Object.freeze({
  start(sequenceId, _context = {}) {
    const sequence = DIALOGUE_DEFINITIONS[sequenceId];
    if (!sequence?.nodes?.[sequence.start]) return null;
    return { sequenceId, nodeId: sequence.start };
  },

  sequence(session) {
    return session ? DIALOGUE_DEFINITIONS[session.sequenceId] : null;
  },

  currentNode(session) {
    return this.sequence(session)?.nodes?.[session.nodeId] ?? null;
  },

  conditionsMet(conditions = [], context = {}) {
    return conditions.every((condition) => {
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
      .filter((choice) => this.conditionsMet(choice.conditions ?? [], context));
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
    return this.moveFromNode(session, { ...node, ...choice }, context);
  },

  moveFromNode(session, node, context) {
    const effectResult = this.applyEffects(context.player, node.effects ?? []);
    const nextNodeId = node.next;
    if (!nextNodeId || node.end) {
      return { session: null, ended: true, effects: effectResult.effects, toasts: effectResult.toasts };
    }
    return {
      session: { ...session, nodeId: nextNodeId },
      ended: false,
      effects: effectResult.effects,
      toasts: effectResult.toasts,
    };
  },

  applyEffects(player, effects = []) {
    player.campaignFlags ??= {};
    player.unlockedCompanions ??= [];
    const applied = [];
    const toasts = [];
    effects.forEach((effect) => {
      switch (effect.type) {
        case "setFlag":
          player.campaignFlags[effect.flag] = effect.value ?? true;
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
          }
          applied.push(effect);
          break;
        case "giveItem": {
          const item = ITEM_DEFINITIONS[effect.itemId];
          if (item && (!item.unique || !player.ownedItems[effect.itemId])) {
            player.ownedItems[effect.itemId] = (player.ownedItems[effect.itemId] ?? 0) + (effect.quantity ?? 1);
            applied.push(effect);
          }
          break;
        }
        case "showToast":
          toasts.push(effect);
          applied.push(effect);
          break;
        default:
          console.warn(`Unknown dialogue effect type: ${effect.type}`);
      }
    });
    return { effects: applied, toasts };
  },
});
