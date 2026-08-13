# Quest for the Holy Grail — HTML5 Prototype

This repository is a browser-only portrait prototype for an Arthurian survival and resource-management adventure. It uses placeholder presentation and intentionally contains no frameworks, build tools, backend code, art assets, or third-party libraries.

## Current prototype

The playable vertical slice begins at a deliberately non-canonical fake campaign menu. Chapter III opens the Village at the Edge of BrocÃ©liande, a full-screen portrait hub with an inn, merchant, blacksmith, and forest gate. Buildings and expeditions reserve a responsive 16:9 visual frame above a larger interaction area, while campaign, inventory, and preparation use the full screen for management UI. The inn offers simple data-driven conversation and rumors. The two specialized vendors share one shop system for buying supplies, selling recovered valuables, and protecting equipped, packed, or special items from accidental sale. The merchant also sells persistent provisions at a location-specific price. The forest gate leads to expedition preparation, where the player can inspect permanent inventory, choose one weapon, armor piece, and relic, fill a six-slot expedition pack, travel with Sir Kay, and commit owned provisions.

Equipped gear and packed items are snapshotted when the expedition begins, so encounter options can distinguish what Arthur owns from what the company actually brought. Selected provisions are removed from the village stockpile and consumed during travel. Unused purchased food returns after either outcome; food found on the road is immediately usable and returns to the stockpile only after a successful return. A growing pool of data-driven encounters pauses travel and presents resource, equipment, knowledge, path, and risk/reward choices. Main Road and Overgrown Trail content differ, as do outbound and return encounter pools. Hostile choices can launch reusable active-time combat: the Wild Boar demonstrates one sturdy, heavily telegraphed threat, while Wolves in the Brush creates three fast individual enemies with independent HP, intent, and action gauges. Arthur and the expedition's actually selected companion are directly controlled through Attack, Defend, character abilities, and Flee. Attacking multiple living enemies pauses on direct lineup target selection, with Cancel returning to the action menu; one remaining enemy is targeted automatically. Combat damage remains part of the expedition instead of disappearing after a fight. Discovered loot remains unsecured: a successful return banks it into the permanent inventory, while failure discards it without removing equipment or packed items owned before the run. Both outcomes return to the village for the next local gameplay loop.

Automated campaign preparation uses the real General Goods Bandage offer after healing and provision planning. Aggressive, Cautious, and Random strategies choose deterministic targets, spend gold against finite stock, preserve existing utility pack items, and report purchases, packing, consumption, returns, and healing in campaign telemetry. See `CAMPAIGN_SIMULATION.md` for the policy and export details.

Combat actions stay compact on mobile: Attack, Defend, Abilities, Items, and Flee. Abilities are gathered for the active
combatant from innate data and equipped gear, so the Iron Longsword grants the data-defined Pommel Strike without an
Arthur-specific branch. Pommel Strike deals reduced weapon damage and pushes one enemy gauge backward. The Items
submenu reads the actual carried expedition inventory; Bandages heal 8 HP on one living injured ally, consume
immediately on successful use, and remain synchronized with Arthur's or Kay's run HP. Menus and enemy or ally targeting
pause the ATB gauges, while Intercede remains active until Kay intercepts one applicable Arthur attack.

Distance influences which encounters are eligible, but does not directly award loot. Rewards currently come from encounter choices.

Progress is stored in the browser with `localStorage`. The reset button in the top-right corner restores the initial prototype save.

## Project layout

- `index.html` defines the game page, persistent header, screen container, and script loading order. Think of it as the initial level/UI hierarchy.
- `css/style.css` controls presentation, the fixed 9:16 game viewport, responsive scaling, input feedback, and the reusable `--interaction-visual-aspect` value for 16:9 active visual frames.
- `js/data.js` contains data-driven item, knowledge, companion, and placeholder chapter definitions with stable string IDs, including equipment-granted abilities and combat item effects.
- `js/tuning.js` centralizes expedition and combat pacing, resource, gauge, defense, and flee values for playtesting.
- `js/combat-data.js` defines reusable combat encounters, enemies, enemy actions, and player-facing ability metadata.
- `js/location-data.js` contains reusable location, destination, NPC, and specialized shop definitions.
- `js/encounter-data.js` contains the authored encounter definitions, stages, choices, requirements, costs, and outcomes.
- `js/encounters.js` contains reusable encounter selection, requirement checking, outcome application, and stage-flow systems.
- `js/combat.js` owns transient combat state, delta-time action gauges, targeting, damage, enemy intent/AI, abilities, HP synchronization, and battle results.
- `js/random.js`, `js/expedition-rules.js`, and `js/simulation.js` provide seeded gameplay randomness, shared expedition rules, and instant deterministic balance simulations.
- `js/healing-rules.js`, `js/economy-rules.js`, `js/campaign-rules.js`, and `js/campaign-simulation.js` share persistent party health, repeatable flat-cost active-party Inn recovery, trading/restocking, automated Bandage purchasing, and provision-aware repeated-expedition campaign simulation.
- `js/storage.js` owns the persistent player-state defaults, validation, local save/load, and reset behavior.
- `js/game.js` owns screen flow, input, temporary expedition state, travel/combat presentation, loot resolution, and the shared `requestAnimationFrame` loop.
- `tests/location_system_test.py`, `tests/simulation_system_test.py`, and `tests/campaign_system_test.py` serve the game and drive headless Chrome through its DevTools protocol to cover the village, shops, loadout, encounters, combat, simulation, campaign, and return flow.
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
python tests/campaign_system_test.py
python tests/simulation_system_test.py
python tests/location_system_test.py
```

### Encounter debug controls

During development, visit [http://localhost:8000/?debug=1](http://localhost:8000/?debug=1). Once an expedition begins, an unobtrusive **Encounter Debug** section appears in the lower travel interface. It can trigger any encounter by stable ID, directly start either Wild Boar or three-wolf combat, shorten the wait until the next random encounter, and display the current run state. These controls are absent from the normal URL.

### Balance simulation tools

Visit [http://localhost:8000/?sim=1](http://localhost:8000/?sim=1) for the developer-only instant simulation panel. It can run the current loadout, a standard strategy suite, and encounter-distribution batches, inspect individual telemetry, and export JSON or CSV. See [SIMULATION.md](SIMULATION.md) for the console API, scenario/strategy/policy interfaces, telemetry schema, and replay foundation.

The same panel also runs persistent multi-expedition campaigns with between-run healing, selling, and provision restocking. See [CAMPAIGN_SIMULATION.md](CAMPAIGN_SIMULATION.md) for campaign policies, telemetry, exports, replay data, and limitations.

## Why use a local HTTP server?

Double-clicking `index.html` loads it through a `file://` URL. Browsers apply extra security restrictions to local files, so features commonly used by games—such as loading JSON, modules, audio, or other assets—may fail even though the same code works when published. Serving the folder over `http://localhost` makes development behave much more like a real website and avoids those surprises.

## Find JavaScript errors

In Chrome or Edge, open DevTools with `F12` or `Ctrl+Shift+I`, then select the **Console** tab. JavaScript errors appear there in red, usually with a clickable file name and line number. The **Sources** tab is useful for setting breakpoints and stepping through `js/game.js`.
