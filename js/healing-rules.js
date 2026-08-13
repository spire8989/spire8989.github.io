"use strict";

const HealingRules = Object.freeze({
  arthurMaxHealth(_player = null) {
    // This is the extension point for later equipment, relic, injury, or progression modifiers.
    return PLAYER_CHARACTER_DEFINITION.combat.maxHp;
  },

  arthurHealth(player) {
    return clampHealingNumber(player.arthurHealth, 0, this.arthurMaxHealth(player));
  },

  quoteInnRest(player) {
    const before = this.arthurHealth(player);
    const maxHealth = this.arthurMaxHealth(player);
    const amount = Math.min(HEALING_TUNING.innRestoration, maxHealth - before);
    return {
      available: amount > 0 && player.currentGold >= HEALING_TUNING.innRestGoldCost,
      fullHealth: amount <= 0,
      affordable: player.currentGold >= HEALING_TUNING.innRestGoldCost,
      healthBefore: before,
      healthAfter: before + amount,
      healingAmount: amount,
      goldCost: amount > 0 ? HEALING_TUNING.innRestGoldCost : 0,
      resource: "gold",
    };
  },

  restAtInn(player) {
    const quote = this.quoteInnRest(player);
    if (!quote.available) {
      return { ...quote, applied: false };
    }
    player.currentGold -= quote.goldCost;
    player.arthurHealth = quote.healthAfter;
    return { ...quote, applied: true };
  },
});

function clampHealingNumber(value, minimum, maximum) {
  const number = Number(value);
  return Math.min(Math.max(Number.isFinite(number) ? number : maximum, minimum), maximum);
}
