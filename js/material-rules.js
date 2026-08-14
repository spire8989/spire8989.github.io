"use strict";

// Material Bag rules are shared by the normal expedition, crafting, loot, and
// both simulation runners. Permanent materials remain in the player's town
// store; an expedition carries a secured snapshot plus unsecured discoveries.
const MaterialRules = Object.freeze({
  capacity() {
    return Math.max(1, Math.floor(Number(EXPEDITION_TUNING.materialBagCapacity) || 10));
  },

  isMaterialId(materialId) {
    const item = ITEM_DEFINITIONS[materialId];
    return Boolean(MATERIAL_DEFINITIONS[materialId]
      || item?.category === "ingredient"
      || item?.tags?.includes("ingredient"));
  },

  definition(materialId) {
    return MATERIAL_DEFINITIONS[materialId]
      ?? ITEM_DEFINITIONS[materialId]
      ?? { id: materialId, name: materialId, description: "" };
  },

  normalizeCollection(value) {
    return Object.fromEntries(Object.entries(value ?? {})
      .filter(([materialId, quantity]) => this.isMaterialId(materialId)
        && Number.isFinite(Number(quantity))
        && Number(quantity) > 0)
      .map(([materialId, quantity]) => [
        materialId,
        Math.floor(Number(quantity)),
      ])
      .filter(([, quantity]) => quantity > 0));
  },

  collectionTotal(collection) {
    return Object.values(collection ?? {})
      .reduce((total, quantity) => total + Math.max(0, Math.floor(Number(quantity) || 0)), 0);
  },

  migratePlayerMaterials(player) {
    player.materials ??= {};
    player.ownedItems ??= {};
    Object.entries(player.ownedItems).forEach(([itemId, quantity]) => {
      if (!this.isMaterialId(itemId)) return;
      player.materials[itemId] = (player.materials[itemId] ?? 0) + Math.max(0, Math.floor(Number(quantity) || 0));
      delete player.ownedItems[itemId];
    });
    player.materials = this.normalizeCollection(player.materials);
    return player.materials;
  },

  selectionFromRequest(request, materials) {
    if (Array.isArray(request)) {
      return Object.fromEntries(request
        .filter((materialId) => this.isMaterialId(materialId))
        .map((materialId) => [materialId, materials[materialId] ?? 1]));
    }
    return this.normalizeCollection(request);
  },

  automaticSelection(materials) {
    const ids = Object.keys(materials);
    const ingredients = ids.filter((materialId) => ITEM_DEFINITIONS[materialId]?.tags?.includes("ingredient"));
    const craftMaterials = ids.filter((materialId) => !ingredients.includes(materialId));
    return [...ingredients, ...craftMaterials].reduce((selection, materialId) => {
      const remaining = this.capacity() - this.collectionTotal(selection);
      if (remaining > 0) selection[materialId] = Math.min(materials[materialId], remaining);
      return selection;
    }, {});
  },

  createExpeditionBag(player, request) {
    const materials = this.migratePlayerMaterials(player);
    const requested = request !== undefined
      ? this.selectionFromRequest(request, materials)
      : this.selectionFromRequest(player.packedMaterials, materials);
    const selection = Object.keys(requested).length > 0
      ? requested
      : request === undefined && !player.packedMaterials
        ? this.automaticSelection(materials)
        : requested;
    const secured = {};
    const rejected = {};
    let remainingCapacity = this.capacity();
    Object.entries(selection).forEach(([materialId, requestedQuantity]) => {
      if (remainingCapacity <= 0) {
        rejected[materialId] = Math.max(0, Math.floor(Number(requestedQuantity) || 0));
        return;
      }
      const requestedAmount = Math.max(0, Math.floor(Number(requestedQuantity) || 0));
      const accepted = Math.min(materials[materialId] ?? 0, requestedAmount, remainingCapacity);
      if (accepted > 0) {
        secured[materialId] = accepted;
        remainingCapacity -= accepted;
      }
      if (requestedAmount > accepted) rejected[materialId] = requestedAmount - accepted;
    });
    return {
      capacity: this.capacity(),
      secured,
      unsecured: {},
      rejected,
    };
  },

  ensureExpeditionBag(expedition) {
    expedition.materialBag ??= {
      capacity: this.capacity(),
      secured: {},
      unsecured: expedition.unsecuredMaterials ?? {},
    };
    expedition.materialBag.capacity = this.capacity();
    expedition.materialBag.secured ??= {};
    expedition.materialBag.unsecured ??= expedition.unsecuredMaterials ?? {};
    expedition.unsecuredMaterials = expedition.materialBag.unsecured;
    return expedition.materialBag;
  },

  expeditionQuantity(expedition, materialId) {
    const bag = this.ensureExpeditionBag(expedition);
    return (bag.secured[materialId] ?? 0) + (bag.unsecured[materialId] ?? 0)
      + (expedition.carriedItems?.[materialId] ?? 0);
  },

  expeditionContents(expedition) {
    const bag = this.ensureExpeditionBag(expedition);
    return Object.fromEntries(Object.keys({ ...bag.secured, ...bag.unsecured })
      .map((materialId) => [materialId, this.expeditionQuantity(expedition, materialId)])
      .filter(([, quantity]) => quantity > 0));
  },

  expeditionTotal(expedition) {
    const bag = this.ensureExpeditionBag(expedition);
    return this.collectionTotal(bag.secured) + this.collectionTotal(bag.unsecured);
  },

  addUnsecured(expedition, materialId, quantity) {
    const bag = this.ensureExpeditionBag(expedition);
    const requested = Math.max(0, Math.floor(Number(quantity) || 0));
    const available = Math.max(0, bag.capacity - this.expeditionTotal(expedition));
    const accepted = Math.min(requested, available);
    const rejected = requested - accepted;
    if (accepted > 0) bag.unsecured[materialId] = (bag.unsecured[materialId] ?? 0) + accepted;
    expedition.materialsFound ??= {};
    if (accepted > 0) expedition.materialsFound[materialId] = (expedition.materialsFound[materialId] ?? 0) + accepted;
    if (rejected > 0) {
      expedition.materialBagRejected ??= {};
      expedition.materialBagRejected[materialId] = (expedition.materialBagRejected[materialId] ?? 0) + rejected;
    }
    return { accepted, rejected, capacity: bag.capacity, used: this.expeditionTotal(expedition) };
  },

  consumeFromExpedition(player, expedition, materialId, quantity) {
    const bag = this.ensureExpeditionBag(expedition);
    const requested = Math.max(0, Math.floor(Number(quantity) || 0));
    let remaining = requested;
    let unsecured = 0;
    let secured = 0;
    const legacyCarried = Math.min(expedition.carriedItems?.[materialId] ?? 0, remaining);
    if (legacyCarried > 0) {
      expedition.carriedItems[materialId] -= legacyCarried;
      if (expedition.carriedItems[materialId] <= 0) delete expedition.carriedItems[materialId];
      expedition.consumedItems[materialId] = (expedition.consumedItems[materialId] ?? 0) + legacyCarried;
      remaining -= legacyCarried;
    }
    const unsecuredAvailable = bag.unsecured[materialId] ?? 0;
    unsecured = Math.min(unsecuredAvailable, remaining);
    if (unsecured > 0) {
      bag.unsecured[materialId] -= unsecured;
      if (bag.unsecured[materialId] <= 0) delete bag.unsecured[materialId];
      remaining -= unsecured;
    }
    const securedAvailable = Math.min(
      bag.secured[materialId] ?? 0,
      player?.materials?.[materialId] ?? 0,
    );
    secured = Math.min(securedAvailable, remaining);
    if (secured > 0) {
      bag.secured[materialId] -= secured;
      if (bag.secured[materialId] <= 0) delete bag.secured[materialId];
      player.materials[materialId] -= secured;
      if (player.materials[materialId] <= 0) delete player.materials[materialId];
      remaining -= secured;
    }
    return {
      applied: remaining <= 0,
      requested,
      consumed: legacyCarried + unsecured + secured,
      unsecured,
      secured,
      remaining,
    };
  },

  settle(player, expedition, returnedSafely) {
    if (expedition.materialsSettled) return;
    const bag = this.ensureExpeditionBag(expedition);
    const unsecured = this.normalizeCollection(bag.unsecured);
    if (returnedSafely) {
      Object.entries(unsecured).forEach(([materialId, quantity]) => {
        player.materials[materialId] = (player.materials[materialId] ?? 0) + quantity;
      });
      expedition.materialsReturned = unsecured;
      expedition.materialsLost = {};
    } else {
      expedition.materialsReturned = {};
      expedition.materialsLost = unsecured;
    }
    expedition.materialsSettled = true;
  },
});
