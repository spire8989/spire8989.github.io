"use strict";

// Player ability progression is persistent; combat availability is resolved by
// CombatSystem from this canonical learned/loadout state plus temporary grants.
const ABILITY_TUNING = Object.freeze({
  activeLoadoutCapacity: 3,
  passiveLoadoutCapacity: 2,
});

const AbilityRules = Object.freeze({
  definition(abilityId) {
    return COMBAT_ABILITY_DEFINITIONS?.[abilityId] ?? null;
  },

  isLearnable(abilityId) {
    const ability = this.definition(abilityId);
    return Boolean(ability && ["active", "passive"].includes(ability.kind) && !ability.category);
  },

  kind(abilityId) {
    return this.definition(abilityId)?.kind ?? null;
  },

  capacity(kind) {
    return kind === "passive"
      ? ABILITY_TUNING.passiveLoadoutCapacity
      : ABILITY_TUNING.activeLoadoutCapacity;
  },

  sanitizeLearned(value, fallback = []) {
    const requested = Array.isArray(value) ? value : fallback;
    return [...new Set(requested.filter((abilityId) => this.isLearnable(abilityId)))];
  },

  sanitizeLoadout(value, learnedAbilityIds, kind) {
    const learned = new Set(this.sanitizeLearned(learnedAbilityIds));
    return [...new Set(Array.isArray(value) ? value : [])]
      .filter((abilityId) => learned.has(abilityId) && this.kind(abilityId) === kind)
      .slice(0, this.capacity(kind));
  },

  sanitizePlayerState(player, defaults = {}) {
    if (!player || typeof player !== "object") return player;
    const learnedFallback = this.sanitizeLearned(defaults.learnedAbilityIds ?? []);
    player.learnedAbilityIds = this.sanitizeLearned(player.learnedAbilityIds, learnedFallback);
    player.selectedActiveAbilityIds = this.sanitizeLoadout(
      player.selectedActiveAbilityIds,
      player.learnedAbilityIds,
      "active",
    );
    player.selectedPassiveAbilityIds = this.sanitizeLoadout(
      player.selectedPassiveAbilityIds,
      player.learnedAbilityIds,
      "passive",
    );
    return player;
  },

  learn(player, abilityId) {
    if (!player || !this.isLearnable(abilityId)) {
      return { applied: false, reason: "unknown-ability", abilityId };
    }
    this.sanitizePlayerState(player);
    if (player.learnedAbilityIds.includes(abilityId)) {
      return {
        applied: false,
        duplicate: true,
        reason: "already-learned",
        abilityId,
        kind: this.kind(abilityId),
        selected: this.isSelected(player, abilityId),
      };
    }
    player.learnedAbilityIds.push(abilityId);
    const kind = this.kind(abilityId);
    const selectedIds = kind === "passive"
      ? player.selectedPassiveAbilityIds
      : player.selectedActiveAbilityIds;
    const capacity = this.capacity(kind);
    const autoEquipped = selectedIds.length < capacity;
    if (autoEquipped) selectedIds.push(abilityId);
    return {
      applied: true,
      abilityId,
      kind,
      autoEquipped,
      selected: autoEquipped,
      learnedCount: player.learnedAbilityIds.length,
    };
  },

  isSelected(player, abilityId) {
    return Boolean(player?.selectedActiveAbilityIds?.includes(abilityId)
      || player?.selectedPassiveAbilityIds?.includes(abilityId));
  },

  toggleLoadout(player, abilityId) {
    if (!player || !this.isLearnable(abilityId)) {
      return { applied: false, reason: "unknown-ability", abilityId };
    }
    this.sanitizePlayerState(player);
    if (!player.learnedAbilityIds.includes(abilityId)) {
      return { applied: false, reason: "not-learned", abilityId };
    }
    const kind = this.kind(abilityId);
    const selectedIds = kind === "passive"
      ? player.selectedPassiveAbilityIds
      : player.selectedActiveAbilityIds;
    const selectedIndex = selectedIds.indexOf(abilityId);
    if (selectedIndex >= 0) {
      selectedIds.splice(selectedIndex, 1);
      return { applied: true, selected: false, abilityId, kind };
    }
    if (selectedIds.length >= this.capacity(kind)) {
      return { applied: false, reason: "loadout-full", selected: false, abilityId, kind };
    }
    selectedIds.push(abilityId);
    return { applied: true, selected: true, abilityId, kind };
  },

  persistentResourceOwner(player, expedition, resource) {
    return resource === "faith" ? player ?? expedition?.playerState ?? null : expedition;
  },

  modifyPersistentResource(player, expedition, resource, amount) {
    const owner = this.persistentResourceOwner(player, expedition, resource);
    if (!owner || typeof resource !== "string") return { applied: false, amount: 0 };
    const previous = Number(owner[resource]) || 0;
    const maximum = Number(owner[`max${resource.charAt(0).toUpperCase()}${resource.slice(1)}`]);
    const requested = Number(amount) || 0;
    const next = Number.isFinite(maximum)
      ? Math.min(Math.max(0, previous + requested), maximum)
      : Math.max(0, previous + requested);
    owner[resource] = next;
    return { applied: next !== previous, amount: next - previous, previous, value: next };
  },
});
