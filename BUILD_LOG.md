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

## 2026-08-12 — Expedition Loadouts and Carried Inventory

### Goal

Make equipment and expedition preparation more legible and meaningful by separating permanent ownership, equipped gear, packed supplies, consumed items, and unsecured discoveries.

### Human prompt and direction

The human developer supplied a focused loadout guide defining three equipment slots, a six-slot expedition pack, starting gear and supplies, migration expectations, and encounter-specific distinctions between owned, equipped, carried, and currently available items. The pass was constrained to existing systems and content rather than adding new encounters or gameplay features.

### AI-assisted implementation

- Added explicit item metadata for equipment slots, pack eligibility, consumable status, and stack limits.
- Added Weapon, Armor, and Relic equipment slots with Iron Longsword, Chainmail Hauberk, and Silver Stag Medallion equipped by default.
- Added a six-slot expedition pack, initially containing the Traveler's Cloak, Rope, and Torches, with clear Equipped, Packed, and Owned states in preparation.
- Snapshotted equipped gear and packed quantities separately when a run begins, while retaining distinct consumed-item and unsecured-loot records.
- Added reusable encounter requirements for permanent ownership, equipped items, carried items, and items available from either the pack or discoveries made during the current run.
- Updated existing encounters so the Silver Stag Medallion must be equipped, Rope and the Traveler's Cloak must be packed, and Bandages or the Fine Hunting Knife may be packed or found during the expedition.
- Migrated older saves into the new equipment and pack model without requiring a reset, including older utility-slot selections.
- Expanded the optional debug state to expose all inventory layers for playtesting.
- Ran 26 automated headless-browser assertions covering defaults, migration, capacity, preparation scroll position, UI states, run snapshots, encounter requirements, consumption, banking, failure loss, direction filtering, pacing, debug data, and runtime errors; every assertion passed.

### Manual changes

The human developer supplied the authored loadout/equipment guide. No manual code edits were reported for this milestone.

### Resulting prototype state

Players now make a concrete pre-expedition loadout decision: permanent inventory remains safe, three equipped items provide equipment-specific access, and up to six packed item types are available on the road. Discovered loot remains usable where intended but unsecured until a successful return, while failed expeditions preserve all previously owned gear and supplies except consumables actually used during the run.

## 2026-08-12 â€” BrocÃ©liande Village Hub and Trading

### Goal

Add a reusable location layer between Chapter Select and expeditions, proving a small inhabited hub where the player can interact, trade, prepare, leave for the forest, and return after either expedition outcome.

### Human prompt and direction

The human developer supplied a focused location-system guide defining a portrait visual hub, four initial destinations, simple NPC interactions, specialized shops, persistent gold and inventory rules, protected-item safeguards, revised expedition navigation, and strict limits against settlement management or additional story canon.

### AI-assisted implementation

- Added separate data definitions for locations, destinations, NPCs, rumors, and shops, including a persistent `currentLocationId` and save migration to schema version 4.
- Added the placeholder Village at the Edge of BrocÃ©liande as Chapter III's hub, with directly tappable Inn, Merchant, Blacksmith, and Forest Gate regions in a portrait village scene.
- Added reusable split-screen building views with a visual upper panel, interaction lower panel, clear current-place labels, and a consistent Return to Village action.
- Added minimal data-driven innkeeper dialogue and two atmospheric rumors without introducing new campaign or Arthurian canon.
- Added one reusable buy/sell implementation shared by the merchant and blacksmith, with centralized stock, fixed prices, accepted categories/tags, persistent gold changes, and permanent-inventory mutation.
- Configured the merchant for Rope, Torches, Bandages, Dried Herbs, mundane goods, and Old Silver Coins; configured the blacksmith for the Iron Longsword, Chainmail Hauberk, Fine Hunting Knife, and appropriate metal/tool purchases.
- Added explicit protection and clear blocked-sale reasons for special, equipped, packed, and vendor-inappropriate items. The Silver Stag Medallion cannot be sold.
- Reused the existing inventory, equipment, pack, companion, provision, expedition, encounter, loot, and settlement systems rather than creating parallel versions.
- Changed the local loop to Chapter Select â†’ Village â†’ Forest Gate â†’ Preparation â†’ Expedition â†’ Summary â†’ Village for both successful and failed runs.
- Added a dependency-light Chrome regression suite and ran 42 browser assertions covering destinations, portrait split views, dialogue, vendor stock and specialization, buying and selling, gold and inventory persistence, all sale safeguards, Forest Gate preparation, encounter pausing, secure and unsecured loot, both expedition outcomes, loadout preservation, reset state, and runtime exceptions; all passed.

### Manual changes

The human developer supplied the authored village/location guide and requested that development continue to be documented in this build log. No manual code edits were reported for this milestone.

### Resulting prototype state

Chapter III now has a small inhabited base between expeditions. Players can hear local atmosphere, convert suitable recovered loot into gold, purchase practical supplies or equipment from specialized vendors, adjust their existing loadout, and choose when to depart. The implementation establishes the reusable Campaign â†’ Location â†’ Destination â†’ Interaction architecture while keeping the prototype limited to one village and four destinations.

## 2026-08-12 — UI Layout and Persistent Provision Economy

### Goal

Clarify the portrait interface around three distinct screen types, reserve true 16:9 visual frames for active interactions, make the village scene-first, and turn provisions from a free preparation value into a persistent settlement resource.

### Human prompt and direction

The human developer supplied a corrective guide after testing the first village pass. It specified full-screen visual hubs, reusable 16:9 building/expedition frames, larger lower interaction areas, always-visible building navigation, persistent and location-priced provisions, explicit shop terminology, duplicate-equipment protection, and a strict separation between Village Inventory and Forest Gate preparation.

### AI-assisted implementation

- Replaced the former percentage-based expedition/building split with a reusable CSS `aspect-ratio: 16 / 9` visual frame shared by travel, encounters, the Inn, Merchant, Blacksmith, and Forest Gate.
- Expanded the lower active-interaction area and kept its navigation header structurally fixed while only the detailed building content scrolls.
- Converted the village into a full-height portrait scene with compact identity, gold, provision, inventory, and Chapter Select overlays instead of a large static description panel.
- Split management contexts so Village Inventory supports equipment and pack organization but never exposes **Begin Expedition**; that action remains exclusive to Forest Gate preparation.
- Added persistent `player.provisions`, save-version 5 migration, a 24-provision reset default, and a preparation selector capped by both owned stock and expedition carrying limits.
- Added data-driven provision price and availability to the Brocéliande merchant, multi-quantity purchase controls, persistent gold/stock changes, and explicit `itemsForSale` item-price objects in place of ambiguous shop stock values.
- Prevented purchases of duplicate unique Iron Longswords, Chainmail Hauberks, and Fine Hunting Knives when already owned.
- Added explicit expedition accounting for committed and encounter-found food. Found food is immediately usable and consumed first; unused purchased food returns after either outcome, unused found food returns only after success, and consumed food is never restored.
- Preserved encounter pausing/results, direction filtering, return travel, equipment and pack snapshots, unsecured loot settlement, shops, gold, and local-save compatibility.
- Expanded the dependency-light Chrome regression suite to 76 assertions covering screen geometry, full-screen hubs, all 16:9 frames, sticky navigation, internal shop scrolling, provision buying and availability, unique-item protection, preparation contexts, provision commitment/consumption/settlement, encounters, return travel, loot success/failure, save migration, reset state, and runtime exceptions; all passed.

### Manual changes

The human developer playtested the first village implementation and supplied the complete UI-layout and provision-economy correction guide. No manual code edits were reported for this milestone.

### Resulting prototype state

The prototype now presents settlements as spatial portrait hubs and reserves standardized artwork-ready 16:9 frames only for active places and adventures. Its lower interfaces have substantially more usable space and reliable escape navigation. Provisions now connect trading to survival: recovered valuables fund food, preparation commits owned supplies rather than creating them, road discoveries remain useful, and expedition outcomes settle food without duplication.

## 2026-08-12 — Village Hub HUD Separation Fix

### Goal

Remove the portrait-screen collision between the village's lower building hotspots and its resource/navigation controls without changing any game system or non-hub screen.

### Human prompt and direction

The human developer identified overlapping Blacksmith and Forest Gate hotspots after the full-screen hub revision and requested a narrow presentation fix: keep the village scene dominant, reserve a compact 12–15% bottom HUD, contain every hotspot within the scene, and reduce the title card's footprint.

### AI-assisted implementation

- Split the Village Hub into a flexible artwork/hotspot scene and a structurally separate bottom HUD containing Gold, Provisions, Chapter Select, and Inventory / Pack.
- Reserved a responsive 14% HUD region with practical minimum and maximum heights while leaving the scene as the dominant portrait area.
- Positioned Blacksmith and Forest Gate relative to the bottom of the scene container, which now ends above the HUD.
- Compacted the location identity card through smaller padding and responsive title text.
- Left the location system, shops, provisions, equipment, expedition flow, encounters, story, and all 16:9 interaction screens unchanged.
- Expanded the Chrome regression suite from 76 to 86 assertions, adding scene/HUD boundary, hotspot containment, overlap, and title-size checks at 360×640, 390×844, and 430×932 portrait viewports; all passed.

### Manual changes

The human developer reported the overlap and supplied the focused layout specification. No manual code edits were reported for this fix.

### Resulting prototype state

The village remains a full-screen-feeling portrait location, but its resource and navigation controls now occupy a reserved footer that cannot cover tappable buildings. All four destinations remain within the responsive village scene across the tested phone sizes.

## 2026-08-12 — Encounter Action Timing and Result Feedback

### Goal

Give investigation and search choices a brief sense of anticipation while ensuring every randomized encounter result clearly matches the consequence that actually occurred.

### Human prompt and direction

The human developer supplied a focused encounter-feedback guide requesting optional data-driven action delays, outcome-specific narrative branches, explicit no-result feedback, correct Continue Journey timing, timer cleanup, and preservation of all existing encounter content and expedition systems.

### AI-assisted implementation

- Added a generic pending-action encounter phase with centrally tuned randomized delays, authored action text, input locking, and a subtle reduced-motion-aware progress indicator.
- Kept travel, distance, provisions, and encounter selection paused throughout pending actions; **Continue Journey** appears only after the final narrative and mechanical consequences resolve.
- Added generic result-text propagation through `randomChance`, `randomOne`, and conditional outcome branches without hard-coding encounter IDs into the engine or UI.
- Added delayed actions to Hidden Hollow, Whispering Oak, Abandoned Cart tracking, Strange Lights, Something in the Thorns, and Woodland Foraging.
- Added matching success/failure prose for those encounters plus Fallen Tree and Sudden Storm, including explicit text when searches find nothing and preserved `ITEM FOUND`, resource, and unsecured-loot feedback.
- Guarded pending completion with expedition identity, phase, and token checks, and canceled active timers when an expedition succeeds or fails.
- Expanded the Chrome regression suite from 86 to 100 assertions, covering pending UI/input behavior, duplicate-resolution prevention, timer cancellation, Continue timing, deterministic success and no-result branches, randomized injury text, existing location/provision flows, settlement, save migration, and runtime exceptions; all passed.

### Manual changes

The human developer supplied the authored encounter-action and result-text guide and requested continued build-log documentation. No manual code edits were reported for this milestone.

### Resulting prototype state

Time-consuming encounter choices now pause on a short action beat before revealing their result. Discoveries, injuries, safe outcomes, lost supplies, and empty searches each receive narrative feedback that agrees with the visible mechanical changes, while immediate choices and the wider expedition economy and pacing remain unchanged.

## 2026-08-12 — Encounter Pacing, Loot Variety, and Expedition Safeguards

### Goal

Apply pending-action pacing consistently, make searches and randomized consequences unambiguous, broaden the sellable loot economy, prevent provision softlocks, and keep long expeditions populated without increasing encounter frequency.

### Human prompt and direction

The human developer playtested the prior encounter pass and supplied a follow-up guide identifying remaining instant actions, unclear shelter feedback, overly reliable cart tracking, repetitive loot, a zero-gold/zero-provision softlock, distance-based eligibility dropoff, and the need for controlled future encounter recurrence. The pass remained constrained against new story, locations, combat systems, or campaign content.

### AI-assisted implementation

- Centralized physical, search, rest, and placeholder-combat delay profiles ranging from 0.8 to 2.6 seconds and applied them to every specifically requested climb, rope, search, tracking, crossing, fight, shelter, navigation, and rest action.
- Added generic weighted choice branches and used them to give Abandoned Cart's owner search a 70% trail-discovery branch and a 30% explicit no-trail conclusion.
- Completed the randomized-result audit so safe crossings, injuries, wasted supplies, successful finds, and empty searches—including Shelter Before Nightfall—have matching narrative and mechanical feedback.
- Added ten unsecured valuables: Silver Brooch, Amber Beads, Decorated Buckle, Merchant's Ring, Carved Ivory Token, Bronze Figurine, Polished Agate, Embroidered Gloves, Silver Cup, and Coin Purse.
- Assigned varied data-driven merchant values from 4 to 15 gold and diversified camp, cart, oak, hollow, thorn, and shelter loot pools while keeping the Fine Hunting Knife and Green Glass Vial uncommon or rare.
- Added a centrally tuned 10-provision safety floor whenever the player enters the village, without granting gold or adding real-time regeneration.
- Removed arbitrary upper distance caps from common obstacle, animal, navigation, water, foraging, weather, and return-shelter encounters while preserving limits on unique discoveries.
- Added generic `maxOccurrencesPerRun` support and enabled only Woodland Stream and Sudden Storm to recur, each at most twice per expedition; encounter spacing remains unchanged.
- Expanded the Chrome regression suite from 100 to 117 assertions, covering exact delayed choices, delay ranges, both cart branches, shelter no-result feedback, valuable definitions and selling, loot diversity, deep-run pools, recurrence caps, town provision recovery, settlement, save behavior, and runtime exceptions; all passed.

### Manual changes

The human developer supplied the complete pacing, loot-variety, anti-softlock, and long-run eligibility guide and requested that the finished pass be committed and pushed. No manual code edits were reported for this milestone.

### Resulting prototype state

Effortful encounter actions now consistently carry a short anticipation beat, and every search or random consequence tells the player what occurred. Ordinary valuables create more varied return-and-sell rewards, village entry guarantees enough food for another attempt, and deep expeditions retain common survival events with tightly capped recurrence rather than faster encounter spacing.

## 2026-08-12 — Party Provision Capacity and Consumption

### Goal

Replace the fixed expedition food cap with party-derived carrying capacity and make companions increase distance-based consumption by a useful but moderate amount.

### Human prompt and direction

The human developer reported that the existing provision balance was not fun and supplied a focused party-provision guide. It defined Arthur's 20-provision capacity and 1.0× consumption, Sir Kay's +10 capacity and +0.30× consumption, a new 0.07 baseline cost per league, visible preparation feedback, expedition snapshots, and preservation of the 10-provision town safety floor and all unrelated systems.

### AI-assisted implementation

- Added data-driven provision capacity and consumption values to Arthur and Sir Kay rather than referring to Kay by name in preparation or expedition calculations.
- Removed the fixed `maximumStartingProvisions` tuning value and replaced the former 0.16 shared rate with `baseProvisionsPerDistance: 0.07`.
- Made companion selection optional so Arthur can travel alone at 20 capacity and 1.00× consumption, while Arthur and Kay can carry 30 at 1.30× consumption.
- Updated preparation to show the selected party, owned food, selected food versus calculated capacity, and the current consumption multiplier.
- Clamped selected provisions immediately when party capacity decreases and continued to preserve preparation scroll position through party and provision changes.
- Snapshotted departure capacity, consumption multiplier, and carried provisions into expedition state so later player-state changes cannot alter an active run.
- Kept consumption fractional and distance-based in both directions: Arthur uses 0.07 provisions per league, while Arthur and Kay use 0.091 provisions per league regardless of return animation speed.
- Preserved encounter-found provisions above departure capacity, persistent provision settlement, prices, shops, the 10-provision village floor, and all encounter and campaign behavior.
- Expanded the Chrome regression suite from 117 to 130 assertions, covering party data, optional companion save state, capacity clamping, preparation feedback, expedition snapshots, solo rendering, effective rates, snapshot isolation, found-food overflow, equal outbound/return distance costs, settlement, reset behavior, and runtime exceptions; all passed.

### Manual changes

The human developer supplied the party capacity and consumption guide and requested that the verified result be committed and pushed. No manual code edits were reported for this milestone.

### Resulting prototype state

Provision planning now reflects the company Arthur chooses to bring. Traveling alone is lighter and more efficient, while bringing Kay increases food capacity enough to support longer expeditions at a moderate consumption cost. The active expedition remains stable after departure, and foraging can still push supplies above the town departure limit.
