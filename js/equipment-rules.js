"use strict";

// Campaign automation evaluates only effects the production combat system can
// currently use. New authored equipment participates through its slot and
// authored combat effects rather than through an item-specific preference list.
const EquipmentRules = Object.freeze({
  supportedSlots(definitions = ITEM_DEFINITIONS) {
    return [...new Set(Object.values(definitions ?? {})
      .filter((item) => item?.equippable && item.equipmentSlot)
      .map((item) => item.equipmentSlot))].sort();
  },

  aggregateEquippedCombatEffects(source, definitions = ITEM_DEFINITIONS) {
    const selectedEquipment = source?.selectedEquipment ?? source?.equippedItems ?? {};
    const items = ["weapon", "armor", "relic"]
      .map((equipmentSlot) => ({
        equipmentSlot,
        itemId: selectedEquipment[equipmentSlot] ?? null,
        item: definitions?.[selectedEquipment[equipmentSlot]],
      }))
      .filter((entry) => entry.item);
    return {
      items,
      combatSpeed: items.reduce(
        (total, entry) => total + (Number(entry.item.effects?.combatSpeed) || 0), 0,
      ),
      onHitEffects: items.flatMap((entry) => (entry.item.effects?.onHitEffects ?? [])
        .map((effect) => ({ ...effect, sourceItemId: entry.itemId, equipmentSlot: entry.equipmentSlot }))),
      combatTriggers: items.flatMap((entry) => (entry.item.effects?.combatTriggers ?? [])
        .map((trigger) => ({ ...trigger, sourceItemId: entry.itemId, equipmentSlot: entry.equipmentSlot }))),
    };
  },

  equippedCombatEffects(source, definitions = ITEM_DEFINITIONS) {
    return this.aggregateEquippedCombatEffects(source, definitions);
  },

  scoreItem(item, strategyName = "aggressive") {
    if (!item?.equippable || !item.equipmentSlot) return Number.NEGATIVE_INFINITY;
    const abilityValue = combatAbilityValue(item);
    const passiveValue = combatPassiveValue(item, strategyName);
    if (item.equipmentSlot === "weapon") {
      return weaponValue(item, strategyName) + abilityValue + passiveValue;
    }
    if (item.equipmentSlot === "armor") {
      return armorValue(item, strategyName) + abilityValue + passiveValue;
    }
    // Relics and future slots may grant passive effects without a direct stat.
    // Equal-value items retain the current equipment through the deterministic
    // tie-break in bestOwnedForSlot.
    return abilityValue + passiveValue;
  },

  bestOwnedForSlot(player, slot, strategyName = "aggressive", definitions = ITEM_DEFINITIONS) {
    const currentItemId = player?.equippedItems?.[slot] ?? null;
    return Object.entries(player?.ownedItems ?? {})
      .filter(([, quantity]) => Number(quantity) > 0)
      .map(([itemId]) => ({ itemId, item: definitions?.[itemId] }))
      .filter(({ item }) => item?.equippable && item.equipmentSlot === slot)
      .sort((left, right) => {
        const scoreDifference = this.scoreItem(right.item, strategyName)
          - this.scoreItem(left.item, strategyName);
        if (scoreDifference !== 0) return scoreDifference;
        if (left.itemId === currentItemId) return -1;
        if (right.itemId === currentItemId) return 1;
        return left.itemId.localeCompare(right.itemId);
      })[0] ?? null;
  },

  equipBestOwned(player, strategyName = "aggressive", options = {}) {
    if (!player) return [];
    const definitions = options.definitions ?? ITEM_DEFINITIONS;
    const slots = options.slots ?? this.supportedSlots(definitions);
    player.equippedItems ??= {};
    const changes = [];
    slots.forEach((slot) => {
      const best = this.bestOwnedForSlot(player, slot, strategyName, definitions);
      if (!best || player.equippedItems[slot] === best.itemId) return;
      const previousItemId = player.equippedItems[slot] ?? null;
      player.equippedItems[slot] = best.itemId;
      changes.push({
        itemId: best.itemId,
        equipmentSlot: slot,
        previousItemId,
        score: this.scoreItem(best.item, strategyName),
        source: "owned-inventory",
        strategy: strategyName,
      });
    });
    if (definitions === ITEM_DEFINITIONS
      && typeof ExpeditionRules !== "undefined"
      && typeof ExpeditionRules.normalizePackedState === "function") {
      ExpeditionRules.normalizePackedState(player);
    }
    return changes;
  },
});

function weaponValue(item, strategyName) {
  const range = item.effects?.combatDamage;
  if (strategyName !== "aggressive") return Number(range?.maximum) || 0;
  const enemyDefenses = Object.values(COMBAT_ENEMY_DEFINITIONS ?? {})
    .map((enemy) => Number(enemy.defense) || 0);
  if (!enemyDefenses.length) return averageDamageForRange(range, 0);
  return enemyDefenses.reduce(
    (sum, defense) => sum + averageDamageForRange(range, defense), 0,
  ) / enemyDefenses.length;
}

function armorValue(item, strategyName) {
  const defense = Number(item.effects?.combatDefense) || 0;
  if (strategyName !== "aggressive") return defense;
  const incomingActions = Object.values(COMBAT_ENEMY_ACTION_DEFINITIONS ?? {});
  if (!incomingActions.length) return defense;
  const averageReduction = incomingActions.reduce(
    (sum, action) => sum + averageDamageForRange(action.damage, 0)
      - averageDamageForRange(action.damage, defense), 0,
  ) / incomingActions.length;
  const enemyActionPatternLength = Object.values(COMBAT_ENEMY_DEFINITIONS ?? {})
    .reduce((sum, enemy) => sum + (enemy.actionPattern?.length ?? 0), 0)
    / Math.max(1, Object.keys(COMBAT_ENEMY_DEFINITIONS ?? {}).length);
  return averageReduction * enemyActionPatternLength;
}

function averageDamageForRange(range, defense) {
  const minimum = Math.ceil(Number(range?.minimum) || 0);
  const maximum = Math.floor(Number(range?.maximum) || 0);
  if (maximum < minimum) return 0;
  let total = 0;
  for (let rawDamage = minimum; rawDamage <= maximum; rawDamage += 1) {
    total += calculateCombatDamage(rawDamage, defense);
  }
  return total / (maximum - minimum + 1);
}

function combatAbilityValue(item) {
  return (item.effects?.grantedAbilityIds ?? []).reduce((total, abilityId) => {
    const ability = COMBAT_ABILITY_DEFINITIONS?.[abilityId];
    if (!ability || ability.category) return total;
    if (ability.effectType === "damageAndGauge") {
      return total + (Number(ability.damageMultiplier) || 0)
        + (Number(ability.gaugeReduction) || 0) / 100;
    }
    if (ability.effectType === "intercede") return total + 1;
    return total + 0.25;
  }, 0);
}

function combatPassiveValue(item, strategyName) {
  const speed = Number(item.effects?.combatSpeed) || 0;
  const strategyMultiplier = strategyName === "cautious" ? 0.9 : 1;
  const speedValue = speed * strategyMultiplier;
  const onHitValue = (item.effects?.onHitEffects ?? []).reduce((total, effect) => {
    const chance = Math.max(0, Math.min(1, Number(effect.chance) || 0));
    const status = COMBAT_STATUS_DEFINITIONS?.[effect.statusId];
    const damage = Number(status?.periodicDamage) || 0;
    const duration = Number(status?.durationActivations) || 1;
    return total + chance * (damage * duration * 0.8 || 1);
  }, 0);
  const triggerValue = (item.effects?.combatTriggers ?? []).reduce((total, trigger) => {
    if (trigger.effect === "storeCharge") return total + Math.max(0, Number(trigger.cap) || 0) * 0.2;
    if (trigger.effect === "consumeChargeForBonusDamage") return total + 0.25;
    return total;
  }, 0);
  return speedValue + onHitValue + triggerValue;
}
