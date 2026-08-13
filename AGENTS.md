# Project Guidance for Codex Agents

This file records project-specific knowledge that should survive across Codex context windows. Read it before changing or testing the project.

## Project intent and constraints

- This is a dependency-free HTML5 game-jam prototype built with plain HTML, CSS, and JavaScript.
- Do not introduce Node.js, npm, React, Vue, TypeScript, bundlers, a backend, or third-party runtime libraries unless the user explicitly changes that direction.
- The intended viewport is **9:16 portrait**, centered in the browser and scaled so the entire game area remains visible. Preserve this behavior.
- Mobile/touch play is a first-class target. Keep controls comfortably tappable and use the existing delegated browser input approach.
- Keep placeholder presentation and favor readable, data-driven systems over polish or excessive abstraction.
- Do not invent campaign canon, future chapters, Grail story details, Merlin content, additional combat content, puzzles, or other systems unless the user explicitly supplies them.

## Important architecture

- `index.html` contains the persistent shell and classic deferred script order. The scripts share browser globals, so order matters.
- `css/style.css` owns the portrait viewport and all UI presentation. `--interaction-visual-aspect` defines the shared 16:9 artwork frame used by expeditions and building interactions; location hubs and management screens deliberately use different full-screen layouts.
- `js/data.js` contains stable-ID item, knowledge, companion, and chapter definitions.
- `js/tuning.js` centralizes pacing and pack capacity. Do not scatter tuning constants through UI code.
- `js/encounter-data.js` contains authored encounter content; `js/encounters.js` contains generic encounter selection, requirements, stages, costs, and outcomes.
- `js/combat-data.js` contains combat definitions and abilities; `js/combat.js` owns reusable combat simulation, targeting, damage, AI, and result reporting.
- `js/storage.js` owns defaults, localStorage, validation, and save migration.
- `js/healing-rules.js`, `js/economy-rules.js`, and `js/campaign-rules.js` own shared persistent health recovery, shop mutations, and between-expedition production rules. Normal UI and simulations must call them rather than duplicate formulas.
- `js/simulation.js` remains the isolated single-expedition runner; `js/campaign-simulation.js` strings settled production-style player states across repeated expeditions.
- `js/game.js` owns screen flow, input dispatch, UI rendering, expedition state, settlement, and the `requestAnimationFrame` loop.
- `js/location-data.js` and `tests/location_system_test.py` may be present as part of the data-driven village/location work. Check the worktree before touching them.
- `assets/` and `vendor/` are intentionally empty/reserved unless a later request changes that.

## State model that must remain distinct

- Permanent ownership: `player.ownedItems`.
- Equipped gear: weapon, armor, and relic in `player.equippedItems`.
- Pre-expedition selections: `player.packedItems`, limited by `EXPEDITION_TUNING.packSlots` (currently six).
- A run snapshots equipped gear and packed quantities into temporary expedition state.
- Newly discovered items stay in `expedition.unsecuredLoot` until a successful return.
- Used consumables are tracked separately in `expedition.consumedItems` and settled against permanent quantities.
- Failure loses unsecured discoveries only. Previously owned equipped and packed items remain owned, except consumables actually used.
- Persistent provisions live in `player.provisions`. Starting a run commits the selected amount; temporary expedition state tracks remaining purchased and found provisions separately. Found provisions are consumed first. Unused purchased provisions return after success or failure, while unused found provisions return only after success.
- Encounter requirements deliberately distinguish `ownsItem`, `equippedItem`, `carriedItem`, and `availableExpeditionItem`. The last may recognize an equipped, packed, or newly found unsecured item.
- `expedition.combat` is transient and never saved. Arthur's combat HP synchronizes directly with `expedition.health`; companion HP lives in `expedition.companionCombatHp` during a run, then settles into persistent `player.companionStates` for the next expedition.
- Combat parties must be derived from `expedition.selectedCompanion`. Never assume Sir Kay is present.
- Arthur's base maximum health is data-driven (currently 40), as is each companion maximum (Sir Kay is currently 50). `player.arthurHealth` and `player.companionStates` persist through save version 6, settlement, town entry, and the next expedition. One flat-cost Inn rest heals Arthur and the selected companion through the same `HealingRules` party operation used by campaign simulation; never add a separate simulator healing formula or per-character rest charge.
- Multi-enemy combat keeps independent objects in `combat.enemies`. Attack pauses in target-selection mode while multiple enemies live, rejects defeated targets, and may auto-target only when one valid enemy remains.

Default reset state currently equips the Iron Longsword, Chainmail Hauberk, and Silver Stag Medallion. The pack contains the Traveler's Cloak, Rope, and Torches. Sir Kay is the only selectable companion.

## Save compatibility

- The localStorage key intentionally remains `questForTheHolyGrail.save.v1`; schema evolution is handled by the internal numeric `saveVersion`.
- Never bump the schema without updating `sanitizePlayerState` so existing phone/browser saves migrate or safely fall back.
- Preserve migrations for the former generic `utility` equipment slot and the old `forest_road_lore` knowledge ID.
- Reset Save must always return a fully valid current state. Do not require players to manually clear localStorage.

## UI regressions to avoid

- Preparation has its own scrollable area. Equipment, pack, companion, and provision changes must preserve its `scrollTop`; do not rerender in a way that jumps the user to the top.
- Encounters pause distance, scenery, and ordinary provision consumption.
- Combat also pauses travel and provisions. Gauges advance only while combat status is `running`, never while a friendly action is awaiting input or after resolution.
- Combat victory and flee return through the originating encounter's result phase. Arthur reaching 0 HP delegates to the existing expedition failure flow; Kay reaching 0 does not fail the expedition.
- Keep combat's 16:9 scene as a light party/enemy lineup with open central battlefield space. Enemy intent belongs immediately beside its gauge, and the rendered log stays a compact recent-event strip rather than occupying the battlefield.
- Encounter consequences remain visible in the result phase until one **Continue Journey** action resumes travel. Do not recreate the earlier duplicate-result bug where the same dialogue appeared twice and required two continues.
- Return travel reverses the visual direction and reduces distance toward zero. Existing direction-filtered encounter pools and pacing must remain intact unless the task explicitly changes them.

## Running and verification on this machine

There is **no Node.js executable installed** in this workspace. That is expected and is not a project failure. Do not spend time trying `node --check`, npm, or a JavaScript build command.

Python 3 and browsers are available:

- `python --version` has worked.
- Chrome: `C:\Program Files\Google\Chrome\Application\chrome.exe`
- Edge: `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`

Serve the project over HTTP:

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

Then load `http://127.0.0.1:8000/`. Do not use `file://` for meaningful verification.

For the current location, shop, layout, and provision work, the dependency-light browser regression suite is:

```powershell
python tests/location_system_test.py
```

The focused deterministic and persistent-campaign suites are:

```powershell
python tests/simulation_system_test.py
python tests/campaign_system_test.py
```

It starts its own HTTP server and drives Chrome through the DevTools protocol. If that test belongs to active uncommitted work, inspect it and the worktree before modifying it.

For one-off smoke tests, a temporary HTML/JS harness served by Python and exercised in headless Chrome has worked well. A direct DOM-load fallback that worked when the newer GPU process crashed was:

```powershell
& 'C:\Program Files\Google\Chrome\Application\chrome.exe' --headless=old --no-sandbox --disable-gpu --disable-gpu-sandbox --disable-software-rasterizer --no-first-run --no-default-browser-check --user-data-dir='<workspace-specific-temp-profile>' --virtual-time-budget=3000 --dump-dom http://127.0.0.1:8000/
```

Chrome may print a Google Update registry warning in this environment. That browser-level warning is not a game console error. Verify the rendered DOM and capture `window.error`/`unhandledrejection` or DevTools `Runtime.exceptionThrown` events for actual game failures.

Temporary test harnesses and browser profiles must be removed after verification. Stop any HTTP server process started for the test.

At minimum, finish changes with:

- The relevant browser regression flow.
- A clean production-page startup through local HTTP.
- `git diff --check`.
- A review of `git status --short` to ensure only intended files changed.

## Shared-workspace and editing safety

- Other Codex windows may be editing this same worktree. Always inspect `git status --short` before acting.
- Existing modified or untracked files belong to the user or another active session. Preserve them and do not reset, overwrite, stage, or commit them unless they are clearly part of the current request.
- Use `apply_patch` for manual source and documentation edits.
- Keep temporary tests untracked and remove them when finished unless they are intentionally becoming part of the repository.

## Documentation and deployment

- `README.md` describes the current player-facing architecture and local run instructions.
- `BUILD_LOG.md` documents meaningful AI-assisted milestones. Add a concise entry when the user says a milestone is complete; include goal, human direction, AI implementation, reported manual changes, tests, and resulting prototype state.
- The repository publishes `main` through GitHub Pages at `https://spire8989.github.io/`.
- A successful `git push` does not prove deployment is live. When deployment is requested, verify the Pages workflow completed for the exact commit, request a changed public file with a cache-busting query, and load the public page in a clean browser profile.
- Do not commit or push merely because implementation is complete; follow the user's authorization for the current task and avoid including unrelated shared-workspace changes.
