"use strict";

const HealingRules = Object.freeze({
  arthurMaxHealth(player = null) {
    return InjuryRules.effectiveMaxHealth(player ?? {}, PLAYER_CHARACTER_DEFINITION.id);
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
      const maxHealth = InjuryRules.effectiveMaxHealth(player, companion.id);
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
    const exhaustionMembers = partyMembers.filter((member) => InjuryRules.has(player, member.id, "exhaustion"));
    const needsRest = totalHealingAmount > 0 || exhaustionMembers.length > 0;
    return {
      available: needsRest && player.currentGold >= HEALING_TUNING.innRestGoldCost,
      fullHealth: !needsRest,
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
      exhaustionMembers: exhaustionMembers.map((member) => member.id),
      goldCost: needsRest ? HEALING_TUNING.innRestGoldCost : 0,
      quotedGoldCost: needsRest ? HEALING_TUNING.innRestGoldCost : 0,
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
        injuriesTreated: [],
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
    const injuriesTreated = quote.exhaustionMembers
      .map((characterId) => InjuryRules.recoverExhaustion(player, characterId, "inn"))
      .filter((result) => result.applied);
    return { ...quote, applied: true, injuriesTreated };
  },

  restExpeditionParty(expedition, amount) {
    const requested = Math.max(0, Number(amount) || 0);
    const healingByPartyMember = {};
    let totalHealingAmount = 0;
    const arthurMaximum = InjuryRules.effectiveMaxHealth(expedition, "arthur");
    const arthurBefore = clampHealingNumber(expedition.health, 0, arthurMaximum);
    const arthurHealing = Math.min(requested, arthurMaximum - arthurBefore);
    expedition.health = arthurBefore + arthurHealing;
    healingByPartyMember.arthur = arthurHealing;
    totalHealingAmount += arthurHealing;

    Object.entries(expedition.companionCombatHp ?? {}).forEach(([companionId, health]) => {
      const maximum = InjuryRules.effectiveMaxHealth(expedition, companionId);
      const before = clampHealingNumber(health, 0, maximum);
      const healing = Math.min(requested, maximum - before);
      expedition.companionCombatHp[companionId] = before + healing;
      healingByPartyMember[companionId] = healing;
      totalHealingAmount += healing;
    });

    return {
      healingByPartyMember,
      totalHealingAmount,
      arthurHealthBefore: arthurBefore,
      arthurHealthAfter: expedition.health,
    };
  },
});

function clampHealingNumber(value, minimum, maximum) {
  const number = Number(value);
  return Math.min(Math.max(Number.isFinite(number) ? number : maximum, minimum), maximum);
}
