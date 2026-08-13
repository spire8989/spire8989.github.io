"use strict";

const HealingRules = Object.freeze({
  arthurMaxHealth(_player = null) {
    // This is the extension point for later equipment, relic, injury, or progression modifiers.
    return PLAYER_CHARACTER_DEFINITION.combat.maxHp;
  },

  arthurHealth(player) {
    return clampHealingNumber(player.arthurHealth, 0, this.arthurMaxHealth(player));
  },

  activeParty(player) {
    const members = [{
      id: PLAYER_CHARACTER_DEFINITION.id,
      name: PLAYER_CHARACTER_DEFINITION.name,
      health: this.arthurHealth(player),
      maxHealth: this.arthurMaxHealth(player),
    }];
    selectedCompanionIds(player).forEach((companionId) => {
      const companion = COMPANION_DEFINITIONS[companionId];
      if (!companion) return;
      const maxHealth = companion.combat?.maxHp ?? 0;
      members.push({
        id: companion.id,
        name: companion.name,
        health: clampHealingNumber(
          player.companionStates?.[companion.id]?.health,
          0,
          maxHealth,
        ),
        maxHealth,
      });
    });
    return members;
  },

  quoteInnRest(player) {
    const partyMembers = this.activeParty(player).map((member) => {
      const healingAmount = Math.min(HEALING_TUNING.innRestoration, member.maxHealth - member.health);
      return {
        id: member.id,
        name: member.name,
        healthBefore: member.health,
        healthAfter: member.health + healingAmount,
        quotedHealthAfter: member.health + healingAmount,
        maxHealth: member.maxHealth,
        healingAmount,
        quotedHealingAmount: healingAmount,
      };
    });
    const arthur = partyMembers[0];
    const totalHealingAmount = partyMembers.reduce((sum, member) => sum + member.healingAmount, 0);
    return {
      available: totalHealingAmount > 0 && player.currentGold >= HEALING_TUNING.innRestGoldCost,
      fullHealth: totalHealingAmount <= 0,
      affordable: player.currentGold >= HEALING_TUNING.innRestGoldCost,
      healthBefore: arthur.healthBefore,
      healthAfter: arthur.healthAfter,
      healingAmount: arthur.healingAmount,
      quotedHealthAfter: arthur.healthAfter,
      quotedHealingAmount: arthur.healingAmount,
      totalHealingAmount,
      quotedTotalHealingAmount: totalHealingAmount,
      partyMembers,
      healingByPartyMember: Object.fromEntries(partyMembers.map(
        (member) => [member.id, member.healingAmount],
      )),
      goldCost: totalHealingAmount > 0 ? HEALING_TUNING.innRestGoldCost : 0,
      quotedGoldCost: totalHealingAmount > 0 ? HEALING_TUNING.innRestGoldCost : 0,
      resource: "gold",
    };
  },

  restAtInn(player) {
    const quote = this.quoteInnRest(player);
    if (!quote.available) {
      return {
        ...quote,
        applied: false,
        healthAfter: quote.healthBefore,
        healingAmount: 0,
        totalHealingAmount: 0,
        goldCost: 0,
        partyMembers: quote.partyMembers.map((member) => ({
          ...member,
          healthAfter: member.healthBefore,
          healingAmount: 0,
        })),
        healingByPartyMember: Object.fromEntries(quote.partyMembers.map(
          (member) => [member.id, 0],
        )),
      };
    }
    player.currentGold -= quote.goldCost;
    quote.partyMembers.forEach((member) => {
      if (member.id === PLAYER_CHARACTER_DEFINITION.id) {
        player.arthurHealth = member.healthAfter;
        return;
      }
      player.companionStates ??= {};
      player.companionStates[member.id] = {
        ...(player.companionStates[member.id] ?? {}),
        health: member.healthAfter,
      };
    });
    return { ...quote, applied: true };
  },
});

function clampHealingNumber(value, minimum, maximum) {
  const number = Number(value);
  return Math.min(Math.max(Number.isFinite(number) ? number : maximum, minimum), maximum);
}
