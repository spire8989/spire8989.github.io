"use strict";

// Brocéliande routes are intentionally thin content definitions. The rules and
// preparation UI consume these stable IDs so the chapter can grow without
// hardcoding route names into travel logic.
const EXPEDITION_DEFINITIONS = Object.freeze({
  old_forest_road: {
    id: "old_forest_road",
    name: "Old Forest Road",
    regionTitle: "Brocéliande",
    description: "A grounded road beneath increasingly ancient trees.",
    danger: 1,
    regionId: "broceliande",
    pathId: "old_forest_road",
    travelVisualAssetId: "expedition_old_forest_road_bg",
    campVisualAssetId: "expedition_old_forest_road_camp_bg",
    combatVisualAssetId: "combat_scene_old_forest_road_combat",
    travelAmbienceAssetId: null,
    campAmbienceAssetId: null,
    kind: "normal",
    minimumObjectiveDistance: 180,
    encounterSpacing: {
      outbound: {
        minimumDistance: 7,
        maximumDistance: 10
      },
      returning: {
        minimumDistance: 16,
        maximumDistance: 24
      }
    },
    returnSpeedMultiplier: 4,
    campEventTableIds: ["forest_wildlife", "road_travelers"],
    prerequisites: [],
    routeBranches: {
      overgrown_trail: {
        id: "overgrown_trail",
        name: "Overgrown Trail",
        entryPathId: "old_forest_road",
        entryDistance: 40,
        mapEntryDistance: 20,
        rejoinPathId: "old_forest_road",
        rejoinDistance: 80
      }
    },
    travelScenes: [
      {
        minDistance: 0,
        visualAssetId: "expedition_old_forest_road_woodcut",
        travelParallaxAssetId: "expedition_old_forest_road_woodcut_parallax"
      },
      {
        minDistance: 80,
        visualAssetId: "expedition_old_forest_road_woodcut_2",
        motion: "loop",
        travelParallaxAssetId: "expedition_old_forest_road_woodcut_2_parallax"
      },
      {
        minDistance: 120,
        visualAssetId: "expedition_old_forest_road_woodcut_3",
        motion: "loop",
        travelParallaxAssetId: "expedition_old_forest_road_woodcut_3_parallax"
      },
      {
        minDistance: 200,
        visualAssetId: "expedition_old_forest_road_woodcut_2",
        motion: "loop",
        travelParallaxAssetId: "expedition_old_forest_road_woodcut_2_parallax"
      }
    ],
    travelSeamForegroundAssetId: "expedition_old_forest_road_tree_6"
  },
  fountain_of_barenton: {
    id: "fountain_of_barenton",
    name: "Fountain of Barenton",
    regionTitle: "Brocéliande",
    description: "A dangerous route toward a fountain where stone, water, and storm answer one another.",
    danger: 2,
    regionId: "broceliande",
    pathId: "fountain_of_barenton",
    travelVisualAssetId: null,
    campVisualAssetId: null,
    combatVisualAssetId: null,
    travelAmbienceAssetId: null,
    campAmbienceAssetId: null,
    kind: "normal",
    campEventTableIds: ["deep_forest"],
    prerequisites: ["flask"]
  },
  val_sans_retour: {
    id: "val_sans_retour",
    name: "Val sans Retour",
    regionTitle: "Brocéliande",
    description: "An enchanted valley from which travelers rarely return unchanged.",
    danger: 2,
    regionId: "broceliande",
    pathId: "val_sans_retour",
    travelVisualAssetId: null,
    campVisualAssetId: null,
    combatVisualAssetId: null,
    travelAmbienceAssetId: null,
    campAmbienceAssetId: null,
    kind: "normal",
    campEventTableIds: ["deep_forest", "val_supernatural"],
    prerequisites: ["flask"]
  },
  search_for_merlin: Object.freeze({
    id: "search_for_merlin",
    name: "Search for Merlin",
    regionTitle: "Brocéliande",
    description: "A campaign route into the deepest reaches of Brocéliande.",
    danger: 3,
    regionId: "broceliande",
    pathId: "search_for_merlin",
    travelVisualAssetId: null,
    campVisualAssetId: null,
    combatVisualAssetId: null,
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
