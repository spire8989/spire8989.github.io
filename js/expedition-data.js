"use strict";

// Brocéliande routes are intentionally thin content definitions. The rules and
// preparation UI consume these stable IDs so the chapter can grow without
// hardcoding route names into travel logic.
const EXPEDITION_DEFINITIONS = Object.freeze({
  old_forest_road: Object.freeze({
    id: "old_forest_road",
    name: "Old Forest Road",
    description: "A grounded road beneath increasingly ancient trees.",
    danger: 1,
    regionId: "broceliande",
    pathId: "old_forest_road",
    kind: "normal",
    prerequisites: [],
  }),
  fountain_of_barenton: Object.freeze({
    id: "fountain_of_barenton",
    name: "Fountain of Barenton",
    description: "A dangerous route toward a place tied to old enchantments.",
    danger: 2,
    regionId: "broceliande",
    pathId: "fountain_of_barenton",
    kind: "normal",
    prerequisites: [],
  }),
  val_sans_retour: Object.freeze({
    id: "val_sans_retour",
    name: "Val sans Retour",
    description: "An enchanted valley from which travelers rarely return unchanged.",
    danger: 2,
    regionId: "broceliande",
    pathId: "val_sans_retour",
    kind: "normal",
    prerequisites: [],
  }),
  search_for_merlin: Object.freeze({
    id: "search_for_merlin",
    name: "Search for Merlin",
    description: "A campaign route into the deepest reaches of Brocéliande.",
    danger: 3,
    regionId: "broceliande",
    pathId: "search_for_merlin",
    kind: "campaign",
    prerequisites: ["water_of_barenton", "morgans_token"],
  }),
});

const EXPEDITION_ORDER = Object.freeze([
  "old_forest_road",
  "fountain_of_barenton",
  "val_sans_retour",
  "search_for_merlin",
]);

const ExpeditionCatalog = Object.freeze({
  get(expeditionId) {
    return EXPEDITION_DEFINITIONS[expeditionId] ?? EXPEDITION_DEFINITIONS.old_forest_road;
  },

  ownsPrerequisite(player, itemId) {
    return Boolean(player?.ownedItems?.[itemId]);
  },

  missingPrerequisites(player, expeditionId) {
    return (this.get(expeditionId).prerequisites ?? [])
      .filter((itemId) => !this.ownsPrerequisite(player, itemId));
  },

  isUnlocked(player, expeditionId) {
    return this.missingPrerequisites(player, expeditionId).length === 0;
  },
});
