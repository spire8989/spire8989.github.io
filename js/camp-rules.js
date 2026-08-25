"use strict";

const CampRules = Object.freeze({
  tableIdsFor(expedition) {
    const definition = ExpeditionCatalog.get(expedition?.expeditionId);
    return [...new Set([
      ...(CAMP_EVENT_CONTEXT_TABLES.regions[expedition?.regionId] ?? []),
      ...(CAMP_EVENT_CONTEXT_TABLES.paths[expedition?.currentPathId] ?? []),
      ...(definition?.campEventTableIds ?? []),
    ])];
  },

  eligibleEvents(expedition, player) {
    const eventIds = new Set();
    this.tableIdsFor(expedition).forEach((tableId) => {
      CAMP_EVENT_TABLE_DEFINITIONS[tableId]?.entries.forEach((entry) => eventIds.add(entry.eventId));
    });
    return [...eventIds]
      .map((eventId) => CAMP_EVENT_DEFINITIONS[eventId])
      .filter((event) => event
        && (!event.regionId || event.regionId === expedition.regionId)
        && (!event.pathIds || event.pathIds.includes(expedition.currentPathId))
        && EncounterRequirements.meetsAll(event.requirements, { expedition, player }));
  },

  selectEvent(expedition, player) {
    const eligible = this.eligibleEvents(expedition, player);
    const weightedEntries = [];
    this.tableIdsFor(expedition).forEach((tableId) => {
      const table = CAMP_EVENT_TABLE_DEFINITIONS[tableId];
      table?.entries.forEach((entry) => {
        if (eligible.some((event) => event.id === entry.eventId)) weightedEntries.push(entry);
      });
    });
    const selected = weightedChoice(weightedEntries, expedition.random);
    return selected ? CAMP_EVENT_DEFINITIONS[selected.eventId] : null;
  },

  prepareCampEvent(expedition, player) {
    if (!expedition || expedition.travelState !== "camped" || expedition.campEventRolled) return null;
    expedition.campEventRolled = true;
    const event = this.selectEvent(expedition, player);
    expedition.campEventId = event?.id ?? null;
    return event;
  },

  startPreparedCampEvent(expedition, eventId) {
    if (!expedition || !eventId || expedition.campEventId !== eventId) return false;
    return EncounterManager.beginCamp(expedition, eventId);
  },

  rollForCampEvent(expedition, player) {
    const event = this.prepareCampEvent(expedition, player);
    if (event) this.startPreparedCampEvent(expedition, event.id);
    return event;
  },
});
