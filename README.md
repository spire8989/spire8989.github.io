# Quest for the Holy Grail — HTML5 Prototype

This repository is a browser-only portrait prototype for an Arthurian survival and resource-management adventure. It uses placeholder presentation and intentionally contains no frameworks, build tools, backend code, art assets, or third-party libraries.

## Current prototype

The playable vertical slice begins at a deliberately non-canonical fake campaign menu. Chapter III leads to expedition preparation, where the player can inspect permanent inventory, equip owned items, travel with Sir Kay, and select provisions. During an expedition, distance increases and provisions decrease until the player returns to safety or fails. Procedural encounters pause travel and require a choice before the journey continues. Encounter eligibility changes between outbound and return travel. Discovered loot remains unsecured: a successful return banks it into the permanent inventory, while failure discards it without removing equipment brought into the run.

Distance influences which encounters are eligible, but does not directly award loot. Rewards currently come from encounter choices.

Progress is stored in the browser with `localStorage`. The reset button in the top-right corner restores the initial prototype save.

## Project layout

- `index.html` defines the game page, persistent header, screen container, and script loading order. Think of it as the initial level/UI hierarchy.
- `css/style.css` controls presentation, the fixed 9:16 game viewport, responsive scaling, and input feedback. `--world-panel-height` controls the expedition view/interface split.
- `js/data.js` contains data-driven item, knowledge, companion, and placeholder chapter definitions with stable string IDs.
- `js/encounter-data.js` contains the authored encounter definitions, stages, choices, requirements, costs, and outcomes.
- `js/encounters.js` contains reusable encounter selection, requirement checking, outcome application, and stage-flow systems.
- `js/storage.js` owns the persistent player-state defaults, validation, local save/load, and reset behavior.
- `js/game.js` owns screen flow, input, temporary expedition state, travel simulation, encounter presentation, loot resolution, and the `requestAnimationFrame` loop.
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

### Encounter debug controls

During development, visit [http://localhost:8000/?debug=1](http://localhost:8000/?debug=1). Once an expedition begins, an unobtrusive **Encounter Debug** section appears in the lower travel interface. It can trigger any encounter by stable ID, shorten the wait until the next random encounter, and display the current run state. These controls are absent from the normal URL.

## Why use a local HTTP server?

Double-clicking `index.html` loads it through a `file://` URL. Browsers apply extra security restrictions to local files, so features commonly used by games—such as loading JSON, modules, audio, or other assets—may fail even though the same code works when published. Serving the folder over `http://localhost` makes development behave much more like a real website and avoids those surprises.

## Find JavaScript errors

In Chrome or Edge, open DevTools with `F12` or `Ctrl+Shift+I`, then select the **Console** tab. JavaScript errors appear there in red, usually with a clickable file name and line number. The **Sources** tab is useful for setting breakpoints and stepping through `js/game.js`.
