# Build Log

This log documents the AI-assisted development of **Quest for the Holy Grail**, an HTML5 prototype being created for an AI-assisted game prototype competition. Entries focus on meaningful milestones, the human direction provided, the AI-assisted work performed, any manual changes, and the resulting state of the prototype.

## 2026-08-11 — Initial HTML5 Project Foundation

### Goal

Create a minimal, reliable browser-game foundation for a future Oregon Trail-style adventure featuring the Knights of the Round Table. This milestone was limited to project setup and a placeholder screen; no game mechanics were requested.

### Human prompt and direction

The project was requested as plain HTML, CSS, and JavaScript with no frameworks, build tools, third-party libraries, backend, or server-side code. The instructions called for a responsive, centered 9:16 portrait game viewport; prevention of unwanted page scrolling; mouse and touchscreen support through pointer events; a simple title screen and responsive button; a `requestAnimationFrame` game loop with delta-time tracking; organized UI/rendering code; explanatory comments; and local-development documentation.

### AI-assisted implementation

- Created the base project structure: `index.html`, `css/style.css`, `js/game.js`, `assets/`, and `vendor/`.
- Added a responsive 9:16 portrait viewport that remains centered and fully visible within the browser window while preserving its aspect ratio.
- Added a placeholder title screen for **Quest for the Holy Grail** with a button that visibly responds to mouse, touch, pen, and keyboard activation.
- Added unified pointer-event handling and disabled unwanted scrolling, panning, overscroll, and text selection during play.
- Added a `requestAnimationFrame` loop with delta time measured in seconds, protection against large time steps after tab switching, and separate `update()` and `render()` extension points.
- Added a README explaining the project layout, local HTTP serving with `python -m http.server 8000`, why `file://` should be avoided, and where to find JavaScript errors in Chrome or Edge DevTools.
- Verified that the project and JavaScript file were served successfully over local HTTP and checked that the final stylesheet contains the intended 9:16 viewport rules.

### Manual changes

No manual file edits were reported for this milestone.

### Resulting prototype state

The project now runs entirely in a browser as a clean, dependency-free HTML5 skeleton. It presents a scalable portrait title screen and working placeholder button, and includes an active real-time game loop ready for future systems. No actual travel, party-management, resource, event, combat, or Grail-quest mechanics have been implemented yet.

## 2026-08-11 — GitHub Pages Hosting

The project is now hosted as a GitHub Pages site from the `main` branch of the [`spire8989.github.io`](https://github.com/spire8989/spire8989.github.io) repository. The published game can be accessed at [https://spire8989.github.io/](https://spire8989.github.io/).

## 2026-08-11 — Brocéliande Expedition Vertical Slice

### Goal

Turn the HTML5 skeleton into a small mid-game vertical slice that proves the expedition's push-your-luck resource and loot loop without adding combat, encounters, dialogue, or the full campaign.

### Human prompt and direction

The human developer supplied the initial game design document and requested a fake chapter menu, persistent inventory and equipment, companion and supply preparation, real-time travel, resource consumption, unsecured loot, return travel, failure handling, and a run summary. Portrait presentation was confirmed, with an approximately 44/56 split between a side-scrolling world view and a contextual lower interface.

### AI-assisted implementation

- Added data-driven definitions for items, companions, chapters, and distance-based prototype rewards using stable string IDs.
- Separated persistent player state and `localStorage` handling from temporary expedition state.
- Built campaign, preparation, expedition, and outcome-summary screens in plain HTML, CSS, and JavaScript.
- Added equipment and companion selection, adjustable provisions, outward and reversed return travel, distance and provision simulation, loot discovery, permanent loot banking, and failure loss rules.
- Kept brought equipment safe on failure and added a local-save reset control.
- Added a portrait side-scrolling placeholder scene with an adjustable world/interface divider.
- Ran an automated headless-browser flow covering successful return and failed-run loot loss; all functional assertions passed.

### Manual changes

The human developer created and supplied `Initial Game Design Document.md`, confirmed portrait orientation, and clarified the intended world/interface composition. No manual code edits were reported for this milestone.

### Resulting prototype state

The prototype now contains one repeatable Brocéliande expedition loop. Players can prepare a persistent loadout, push outward while consuming provisions, discover unsecured rewards, turn back to bank them, or fail and lose only that run's discoveries. Advanced encounters and the broader campaign remain intentionally unimplemented.

## 2026-08-11 — Procedural Encounter System

### Goal

Make encounters the primary interactive interruption during expeditions while preserving the existing portrait travel, resource, return, loot, and persistence systems.

### Human prompt and direction

The human developer supplied a detailed encounter-system guide defining reusable data, multi-stage choices, requirements, outcomes, weighted random selection, paused travel behavior, debug tooling, and five initial encounters. The guide also established that Sir Kay is currently Arthur's only companion and that the deeper Brocéliande mystery must remain unresolved in this milestone.

### AI-assisted implementation

- Separated five authored encounter definitions from reusable selection, requirement, outcome, and stage-flow code.
- Added randomized distance spacing, region/path/distance eligibility, encounter weights, repeat rules, and per-run seen tracking.
- Added Fallen Tree, Abandoned Camp, Fork in the Road, Ancient Standing Stone, and Wild Boar encounters.
- Added locked and hidden item-dependent choices, resource costs and rewards, randomized consequences, unsecured mundane loot, path changes, and run-local flags.
- Made active encounters pause scenery, distance, and normal provision use while the lower portrait interface switches to touch-friendly choices.
- Removed Merlin from companion selection, retained Sir Kay as the only companion, and added the Silver Stag Medallion without resolving its purpose.
- Added optional `?debug=1` controls for triggering encounter IDs, shortening encounter distance, and inspecting run state.
- Ran 18 automated headless-browser assertions covering all five encounters plus existing return, banking, and failure behavior; every assertion passed.

### Manual changes

The human developer supplied the authored system/content guide and clarified the current character and story constraints. No manual code edits were reported for this milestone.

### Resulting prototype state

Expeditions now alternate between real-time travel and procedural decision encounters. Choices can branch across stages, query the current run, apply reusable consequences, alter the route, and award unsecured loot before travel resumes. Combat, Merlin's discovery, puzzles, and broader narrative systems remain intentionally unimplemented.

## 2026-08-12 — Content Cleanup and Return Encounters

### Goal

Remove unintended story assumptions and predetermined rewards, then make encounter selection distinguish between outbound and return travel without redesigning the expedition loop.

### Human prompt and direction

The human developer established the authoritative mid-campaign prototype state, requested generic campaign placeholders, removed undesigned distance rewards and campaign items, formalized Arthur's basic wilderness knowledge, and specified direction eligibility for every encounter. A single return-only Fading Light encounter was requested to prove the new direction system.

### AI-assisted implementation

- Replaced invented past and future chapter names with completed and unknown placeholders.
- Removed the fixed-distance loot table, its runtime award logic, the Waystone Fragment, and the other undesigned distance rewards.
- Preserved the unexplained Silver Stag Medallion as starting equipment and migrated older saves to the cleaned item set.
- Added a data-driven `woodcraft` knowledge definition and migration from the earlier raw `forest_road_lore` string.
- Added direction arrays to encounter definitions and direction filtering to weighted encounter eligibility.
- Configured physical/survival encounters for both directions and exploration/path encounters for outbound travel only.
- Added the non-repeatable, return-only Fading Light encounter and a mundane consumable Torch with persistent consumption handling.
- Ran 24 automated browser assertions across story state, save migration, direction pools, encounter pausing, repeatability, reward removal, consumable use, failure loss, successful banking, and runtime errors; all passed.

### Manual changes

The human developer tested the prior phone build and supplied the authoritative cleanup and encounter-direction guide. No manual code edits were reported for this milestone.

### Resulting prototype state

The prototype's menu and content no longer establish undesigned campaign canon. Loot comes from decisions rather than predetermined distance thresholds, and the return journey now has a distinct encounter pool that retains survival threats, excludes deeper-exploration choices, and introduces one return-only navigation hazard.

## 2026-08-12 — Expedition Pacing and Encounter UX

### Goal

Give travel and encounters more weight by slowing the frequency of interruptions, improving consequence readability, extending provisions, and compressing the real-world duration of return travel.

### Human prompt and direction

The human developer reported that encounters occurred too frequently, repeated content lost meaning, provisions depleted too quickly, return travel lasted too long, and consequences disappeared before they could be read. The requested pass explicitly limited changes to pacing and UX rather than adding content or new gameplay systems.

### AI-assisted implementation

- Added one centralized expedition-tuning object for outbound speed, return multiplier, provision cost per distance, random encounter spacing, safe post-encounter distance, and starting provision limits.
- Increased random spacing from 5–9 leagues to 14–22 leagues and guaranteed breathing room after every resolved encounter.
- Marked all six current encounters non-repeatable for one expedition while preserving data-level repeatability support.
- Added a generic encounter-result phase that keeps narrative and accumulated consequences visible until the player explicitly selects **Continue Journey**.
- Kept distance, normal provision consumption, scenery, return progress, and further encounter selection paused throughout choices and results.
- Changed provisions from time-based depletion to a shared per-league cost of `0.16` in both directions.
- Set return movement to four times outbound speed while retaining equal baseline provision cost for equal distance.
- Ran 21 automated browser assertions covering spacing, exhaustion, repeatability, results, pausing, post-encounter safety, resource economics, direction pools, return banking, failure loss, and runtime errors; every assertion passed.

### Manual changes

The human developer playtested the previous phone build and supplied the pacing and encounter-UX requirements. No manual code edits were reported for this milestone.

### Resulting prototype state

Expeditions now contain longer stretches of visible travel between unique events. Encounter consequences remain readable for as long as needed, provisions support substantially greater travel distance, and the return journey is compressed in real time without becoming cheaper per league.

## 2026-08-12 — Brocéliande Encounters and Loot

### Goal

Increase expedition variety through additional data-driven encounters, path identity, useful discoveries, and persistent loot progression while preserving the improved pacing and existing story boundaries.

### Human prompt and direction

The human developer first reported that preparation controls reset the scroll position after every equipment or provision change. They then supplied twelve specific encounters, eight loot definitions, rarity guidance, path-content goals, item and knowledge interactions, and strict constraints against adding campaign, Merlin, Grail, combat, or puzzle content.

### AI-assisted implementation

- Preserved the preparation screen's scroll position across equipment, companion, and provision rerenders.
- Added common, uncommon, and rare metadata to the requested mundane and mysterious loot definitions.
- Added Woodland Stream, Woodland Foraging, Abandoned Cart, The White Hart, Whispering Oak, The Road Behind You, Hidden Hollow, Sudden Storm, Strange Lights, Injured Hunter, Something in the Thorns, and Shelter Before Nightfall.
- Differentiated Main Road, Overgrown Trail, outbound, both-direction, and return-only encounter pools without changing encounter spacing.
- Extended generic outcomes with conditional effects and terminal result stages while retaining data-driven multi-stage decisions.
- Added clearly formatted `ITEM FOUND`, item description, and `UNSECURED` feedback to encounter results.
- Made found consumables usable during the current run and ensured their use removes the unsecured copy rather than granting a free effect.
- Verified that a Fine Hunting Knife can be found, secured by returning, equipped on a later expedition, and used to unlock a safer choice.
- Ran 28 automated browser assertions covering scroll preservation, encounter pools, requirements, hidden choices, multi-stage flow, consumables, rarity, unsecured feedback, successful banking, failed-run loss, pacing preservation, and runtime errors; all passed.

### Manual changes

The human developer identified the preparation scrolling issue through playtesting and supplied the complete authored content guide. No manual code edits were reported for this milestone.

### Resulting prototype state

Brocéliande now supports eighteen non-repeatable encounters with meaningfully different road and trail pools. Expeditions can yield items worth protecting, and discoveries such as the Fine Hunting Knife create persistent advantages in later runs. Preparation controls remain usable without jumping back to the top of the screen.
