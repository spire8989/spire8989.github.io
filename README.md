# Quest for the Holy Grail — HTML5 Prototype

This repository is a browser-only portrait prototype for an Arthurian survival and resource-management adventure. It uses placeholder presentation and intentionally contains no frameworks, build tools, backend code, art assets, or third-party libraries.

## Current prototype

The playable vertical slice begins at a deliberately non-canonical fake campaign menu. Chapter III opens the Village at the Edge of BrocÃ©liande, a full-screen portrait hub with an inn, merchant, blacksmith, and forest gate. Buildings and expeditions reserve a responsive 16:9 visual frame above a larger interaction area, while campaign, inventory, and preparation use the full screen for management UI. The inn offers simple data-driven conversation and rumors. The two specialized vendors share one shop system for buying supplies, selling recovered valuables, and protecting equipped, packed, or special items from accidental sale. The merchant also sells persistent provisions at a location-specific price. The forest gate leads to expedition preparation, where the player can inspect permanent inventory, choose one weapon, armor piece, and relic, fill a six-slot expedition pack, travel with Sir Kay, and commit owned provisions.

Equipped gear and packed items are snapshotted when the expedition begins, so encounter options can distinguish what Arthur owns from what the company actually brought. Selected provisions are removed from the village stockpile and consumed during travel. Unused purchased food returns after either outcome; food found on the road is immediately usable and returns to the stockpile only after a successful return. A growing pool of data-driven encounters pauses travel and presents resource, equipment, knowledge, path, and risk/reward choices. Main Road and Overgrown Trail content differ, as do outbound and return encounter pools. Discovered loot remains unsecured: a successful return banks it into the permanent inventory, while failure discards it without removing equipment or packed items owned before the run. Both outcomes return to the village for the next local gameplay loop.

Distance influences which encounters are eligible, but does not directly award loot. Rewards currently come from encounter choices.

Progress is stored in the browser with `localStorage`. The reset button in the top-right corner restores the initial prototype save.

## Project layout

- `index.html` defines the game page, persistent header, screen container, and script loading order. Think of it as the initial level/UI hierarchy.
- `css/style.css` controls presentation, the fixed 9:16 game viewport, responsive scaling, input feedback, and the reusable `--interaction-visual-aspect` value for 16:9 active visual frames.
- `js/data.js` contains data-driven item, knowledge, companion, and placeholder chapter definitions with stable string IDs.
- `js/tuning.js` centralizes expedition speed, provision cost, pack capacity, encounter spacing, and post-encounter breathing-room values for playtesting.
- `js/location-data.js` contains reusable location, destination, NPC, and specialized shop definitions.
- `js/encounter-data.js` contains the authored encounter definitions, stages, choices, requirements, costs, and outcomes.
- `js/encounters.js` contains reusable encounter selection, requirement checking, outcome application, and stage-flow systems.
- `js/storage.js` owns the persistent player-state defaults, validation, local save/load, and reset behavior.
- `js/game.js` owns screen flow, input, temporary expedition state, travel simulation, encounter presentation, loot resolution, and the `requestAnimationFrame` loop.
- `tests/location_system_test.py` serves the game and drives headless Chrome through its DevTools protocol to cover the village, shops, loadout, encounters, and return flow.
- `assets/` is reserved for future images, audio, fonts, and other game content.
- `vendor/` is reserved for any third-party browser libraries added later. It is empty for now.

## Run locally

The project has no install or build step. From a terminal opened in this folder, run:

```sh
python -m http.server 8000
```

If `python` is not recognized on Windows, the Python launcher often works instead:

```sh
py -m http.server 8000
```

Then visit [http://localhost:8000](http://localhost:8000) in Chrome or Edge. Stop the server with `Ctrl+C` in the terminal.

Run the current automated browser regression flow with:

```sh
python tests/location_system_test.py
```

### Encounter debug controls

During development, visit [http://localhost:8000/?debug=1](http://localhost:8000/?debug=1). Once an expedition begins, an unobtrusive **Encounter Debug** section appears in the lower travel interface. It can trigger any encounter by stable ID, shorten the wait until the next random encounter, and display the current run state. These controls are absent from the normal URL.

## Why use a local HTTP server?

Double-clicking `index.html` loads it through a `file://` URL. Browsers apply extra security restrictions to local files, so features commonly used by games—such as loading JSON, modules, audio, or other assets—may fail even though the same code works when published. Serving the folder over `http://localhost` makes development behave much more like a real website and avoids those surprises.

## Find JavaScript errors

In Chrome or Edge, open DevTools with `F12` or `Ctrl+Shift+I`, then select the **Console** tab. JavaScript errors appear there in red, usually with a clickable file name and line number. The **Sources** tab is useful for setting breakpoints and stepping through `js/game.js`.
