"use strict";

// Brocéliande routes are intentionally thin content definitions. The rules and
// preparation UI consume these stable IDs so the chapter can grow without
// hardcoding route names into travel logic.
const EXPEDITION_DEFINITIONS = Object.freeze({
  old_forest_road: {
    id: "old_forest_road",
    name: "Old Forest Road",
    description: "A grounded road beneath increasingly ancient trees.",
    danger: 1,
    regionId: "broceliande",
    pathId: "old_forest_road",
    travelVisualAssetId: "expedition_old_forest_road_bg",
    campVisualAssetId: "expedition_old_forest_road_camp_bg",
    travelAmbienceAssetId: null,
    campAmbienceAssetId: null,
    kind: "normal",
    campEventTableIds: ["forest_wildlife", "road_travelers"],
    prerequisites: [],
    travelScenes: [
      {
        minDistance: 0,
        visualAssetId: "expedition_old_forest_road_woodcut",
        travelParallaxAssetId: "expedition_old_forest_road_woodcut_parallax"
      },
      {
        visualAssetId: "expedition_old_forest_road_woodcut_3",
        motion: "loop",
        minDistance: 17.5
      },
      {
        minDistance: 40,
        visualAssetId: "expedition_old_forest_road_woodcut_2",
        motion: "loop",
        showSeamForegroundBetweenLoops: false
      }
    ],
    travelSeamForegroundAssetId: "expedition_old_forest_road_tree_6"
  },
  fountain_of_barenton: Object.freeze({
    id: "fountain_of_barenton",
    name: "Fountain of Barenton",
    description: "A dangerous route toward a fountain where stone, water, and storm answer one another.",
    danger: 2,
    regionId: "broceliande",
    pathId: "fountain_of_barenton",
    travelVisualAssetId: null,
    campVisualAssetId: null,
    travelAmbienceAssetId: null,
    campAmbienceAssetId: null,
    kind: "normal",
    campEventTableIds: ["deep_forest"],
    prerequisites: [],
  }),
  val_sans_retour: Object.freeze({
    id: "val_sans_retour",
    name: "Val sans Retour",
    description: "An enchanted valley from which travelers rarely return unchanged.",
    danger: 2,
    regionId: "broceliande",
    pathId: "val_sans_retour",
    travelVisualAssetId: null,
    campVisualAssetId: null,
    travelAmbienceAssetId: null,
    campAmbienceAssetId: null,
    kind: "normal",
    campEventTableIds: ["deep_forest", "val_supernatural"],
    prerequisites: [],
  }),
  search_for_merlin: Object.freeze({
    id: "search_for_merlin",
    name: "Search for Merlin",
    description: "A campaign route into the deepest reaches of Brocéliande.",
    danger: 3,
    regionId: "broceliande",
    pathId: "search_for_merlin",
    travelVisualAssetId: null,
    campVisualAssetId: null,
    travelAmbienceAssetId: null,
    campAmbienceAssetId: null,
    kind: "campaign",
    minimumObjectiveDistance: 120,
    campEventTableIds: ["deep_forest"],
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
