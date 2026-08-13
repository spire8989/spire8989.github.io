# Build Log

This log documents the AI-assisted development of **Quest for the Holy Grail**, an HTML5 prototype being created for an AI-assisted game prototype competition. Entries focus on meaningful milestones, the human direction provided, the AI-assisted work performed, any manual changes, and the resulting state of the prototype.

## 2026-08-12 — Multi-Enemy Wolves and Combat UI Refinement

### Goal

Convert Wolves in the Brush from an encounter-only damage roll into the first multi-enemy battle, then lighten the portrait combat interface to preserve space for future battle visuals.

### Human prompt and direction

The human developer reported that the first combat implementation worked well and supplied a focused second-pass guide. It requested three individual fast wolves, direct target selection with Cancel, verified Intercede behavior under multiple attackers, removal of fake wolf damage, a lighter combat lineup, no `VS` label, a compact recent-event log, responsive phone verification, and no rewrite or expansion into unrelated combat systems.

### AI-assisted implementation

- Added a data-defined 14 HP, 14 Speed, 0 Defense Wolf with 3–6 Bite and 5–8 Lunge actions, plus a three-wolf combat definition that creates independent enemy state and numbered log/UI labels.
- Converted **Stand Your Ground** into a generic `startCombat: wolves` outcome. Victory and flee preserve the encounter's existing no-reward character and return through its normal result/Continue Journey flow; Arthur's defeat still delegates to expedition failure.
- Hardened multi-enemy targeting so Attack pauses with all living enemies directly selectable, invalid or defeated target IDs cannot redirect an attack, the sole remaining enemy auto-targets, and Cancel returns to the same paused action menu.
- Verified that Kay's Intercede redirects exactly the next applicable wolf attack and is then consumed before subsequent wolves act.
- Removed `VS`, replaced heavy combatant cards with compact translucent lineup plates, placed enemy intent immediately above its action gauge, retained ready/target/hit feedback, and reserved an open central battlefield column for future presentation.
- Reduced the visible combat log to the four most recent lines in a compact status strip and kept the established action controls intact.
- Expanded the debug combat launcher to select either Wild Boar or Three Wolves while remaining hidden outside `?debug=1`.
- Expanded the Chrome regression suite from 174 to 198 assertions, covering wolf encounter integration, independent enemies, target selection/cancellation, dead and sole-target behavior, partial and complete victories, Intercede under multiple attacks, flee/results, Wild Boar regression, non-combat flows, compact log sizing, and combatant containment at 360×640, 390×844, and 430×932.

### Manual changes

The human developer playtested the first combat pass and supplied the complete wolves and combat-interface refinement guide. No manual code edits were reported for this milestone.

### Resulting prototype state

Combat now demonstrates two distinct tactical pressures without changing its foundation: the Wild Boar is one durable telegraphed threat, while three quick wolves force target prioritization as several independent gauges fill. The lighter lineup and compact log leave the middle of the 16:9 scene available for future character art and effects while remaining readable and fully contained on tested portrait phones.

## 2026-08-12 — Active-Time Party Combat Foundation

### Goal

Replace the Wild Boar's direct random-damage choice with a reusable, short, party-controlled active-time combat system that preserves expedition consequences.

### Human prompt and direction

The human developer supplied the first combat implementation guide. It requested frame-rate-independent action gauges, player control of Arthur and the actually selected Sir Kay, enemy intent telegraphs, Attack, Defend, Kay's Intercede, Flee, equipment-derived stats, expedition HP persistence, Wild Boar encounter integration, portrait UI, debug access, and deterministic browser coverage without expanding into levels, magic, bosses, formations, or campaign content.

### AI-assisted implementation

- Added separate combat content and simulation modules, with array-based allies/enemies, explicit transient battle state, ready queues, target validation, damage resolution, enemy action patterns, result reporting, and deterministic random injection.
- Added centralized gauge, defense, flee, and log tuning; gave the Iron Longsword 8–12 damage and the Chainmail Hauberk 3 flat defense through item data.
- Added Arthur and Sir Kay combat definitions. Kay joins only when selected, retains HP between battles in the same expedition, can be incapacitated without ending the run, and can redirect one Arthur-targeted attack with Intercede.
- Added a portrait combat scene with HP/action bars, visible enemy intent, ready/defeated/defending/interceding states, a compact event log, hit feedback, and touch-friendly action controls. Item is exposed as an intentionally disabled hook until a carried item has authored combat behavior.
- Integrated gauges into the existing `requestAnimationFrame` loop so combat and travel never advance together and action selection genuinely pauses battle time.
- Added a generic `startCombat` encounter outcome and combat-result continuation. Wild Boar Fight now launches a 32 HP boar that opens with Charge, awards +3 provisions only on victory, awards nothing on flee, and delegates Arthur's defeat to the established expedition-failure flow.
- Added a debug-only direct Wild Boar combat button under `?debug=1`.
- Expanded the Chrome regression suite from 156 to 174 assertions covering party derivation, gauges and pause behavior, equipment damage, Defend, Intercede, HP persistence, intent targeting, portrait combat layout, flee, victory reward/continuation, defeat delegation, existing encounters, locations, provisions, settlement, and runtime exceptions.

### Manual changes

The human developer supplied the complete first-combat guide and requested that durable project guidance and the build log be updated as implementation progressed. No manual code edits were reported for this milestone.

### Resulting prototype state

The Wild Boar is now a playable tactical battle rather than a delayed random-cost button. Arthur can fight alone or with Kay, react to a visible incoming Charge, and carry wounds forward into the journey. The encounter, resource, return, and failure systems remain authoritative around combat, while the new data/simulation split provides a compact foundation for later enemies, companion abilities, and authored combat items.

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

## 2026-08-12 — Brocéliande Discovery and Encounter Expansion

### Goal

Slightly tighten provision consumption while making repeated expeditions feel more varied and more likely to produce ordinary unsecured valuables without increasing encounter frequency.

### Human prompt and direction

The human developer reported that provisions drained slightly too slowly, loot opportunities remained sparse, and the encounter pool still repeated too noticeably across runs. The supplied guide requested four lightweight travel discoveries, five new Brocéliande encounters, weighted loot rarity, deep-run eligibility, preserved spacing and party capacity, and strict avoidance of new campaign, Merlin, Grail, combat, companion, or location content.

### AI-assisted implementation

- Increased `baseProvisionsPerDistance` from 0.07 to 0.08, producing effective rates of 0.08 for Arthur and 0.104 for Arthur with Sir Kay while leaving both capacity values and the town safety floor unchanged.
- Added generic weighted unsecured-item outcomes with item-name substitution in result prose, preserving the existing `ITEM FOUND` and `UNSECURED` mechanical feedback.
- Added four lightweight encounter-slot discoveries: Glint in the Mud, Discarded Bundle, Something Beneath the Roots, and Lost Purse.
- Added five fuller encounters: Broken Bridge, The Hermit's Fire, Wolves in the Brush, Ruined Wayside Shrine, and The Sunken Road.
- Kept all search, crossing, waiting, investigation, and placeholder-danger actions on the existing pending-action system; all final results still wait for **Continue Journey**.
- Added Rope interaction at the Broken Bridge, capped Glint and Wolves recurrence at twice per run, and added future-facing `waysideOfferingMade` and `sunkenRoadExplored` run flags without explaining or rewarding them supernaturally.
- Kept the absent hermit explicitly unidentified and added no Merlin implication, corpse, historical canon, new path, or campaign revelation.
- Reworked relevant camp, cart, oak, hollow, and shelter tables so common supplies and valuables outweigh uncommon and special finds; the Green Glass Vial remains the lowest-weight root discovery.
- Left Glint in the Mud, Broken Bridge, Wolves in the Brush, and other suitable generic events eligible on deep runs while preserving the existing 14–22 league encounter spacing and using no secondary loot timer.
- Expanded the Chrome regression suite from 130 to 156 assertions, covering all nine definitions, path and direction pools, deep-run eligibility, recurrence caps, weighted rarity, dynamic result names, pending actions, locked Rope access, run flags, live unsecured discovery feedback, explicit empty searches, revised consumption rates, existing settlement flows, and runtime exceptions; all passed.

### Manual changes

The human developer supplied the complete Brocéliande content, loot-variety, and provision-tuning guide and requested that the verified implementation be committed and pushed. No manual code edits were reported for this milestone.

### Resulting prototype state

Existing encounter slots can now produce simple profitable discoveries, atmospheric investigations, or new survival decisions alongside the established content. Loot remains uncertain and unsecured, ordinary finds outweigh rare curiosities, and deep expeditions retain meaningful discovery opportunities without becoming more frequently interrupted.
## 2026-08-12 — Deterministic Expedition Simulation Foundation

### Goal

Establish the first serious automated balance-testing layer: fast complete-expedition simulation using production rules, deterministic seeds, configurable decisions and turnaround, detailed replay-oriented telemetry, batching, aggregation, export, and developer access without changing the ordinary game loop.

### Human prompt and direction

The human developer supplied the Phase 1 automation guide and emphasized immediate end-to-end usefulness, production-rule reuse, deterministic future replay data, preservation of existing browser regression coverage, and ongoing build-log documentation.

### AI-assisted implementation

- Added a centralized seeded/unseeded random API and routed every gameplay-affecting encounter and combat roll through the expedition's injected source, while retaining live randomness and existing debug overrides in normal play.
- Extracted shared party capacity, consumption, expedition construction, travel/provision cost, turnaround, carried-item snapshot, and settlement rules into `ExpeditionRules`; the normal browser game and instant runner now call the same lifecycle code.
- Added complete instant simulation across outbound/return travel, encounter eligibility and spacing, staged and pending choices, authored costs/outcomes/loot/flags/knowledge, active-time multi-character combat, failure, safe return, and deposit/settlement behavior.
- Added extensible Random, Cautious, Aggressive, and Greedy encounter/combat strategies plus fixed-distance and provision-reserve turnaround policies.
- Added structured per-run identity, outcome, party/resource, loot/value, encounter, combat, decision, and chronological event telemetry designed for deterministic rerun or future event-stream replay.
- Added synchronous and periodically yielding batch APIs, aggregate rates/averages/median, grouping by strategy/companion/loadout/scenario/policy, encounter frequency/direction/distance/choice distributions, and detailed JSON plus flat CSV export.
- Added a developer-only `?sim=1` panel for current-loadout batches, a four-strategy suite, encounter-distribution testing, individual-run inspection, and downloads. Ordinary URLs remain unchanged.
- Added `SIMULATION.md` with architecture, API examples, extension interfaces, telemetry/export details, seeded replay guidance, and explicit Phase 1 boundaries.
- Expanded the dependency-light Chrome regression suite from 198 to 207 assertions with deterministic RNG, same-seed run equality, different-seed variance, representative completion, real-combat telemetry, batch/aggregation, invariants, and debug-UI isolation; all passed.
- Measured detailed cautious fixed-distance batches in headless Chrome: 100 runs in 24.5 ms and 1,000 runs in 120.1 ms on this machine, with no runtime exceptions. These are local indicative measurements rather than performance guarantees.

### Manual changes

The human developer supplied the complete Phase 1 simulation and automation guide. No manual code edits were reported for this milestone.

### Resulting prototype state

The project can now execute hundreds or thousands of real-rule expeditions without rendering or waiting, compare strategies and configurations, inspect encounter/combat histories, export balance data, and reproduce meaningful run behavior from seed plus normalized scenario and decision history. All currently authored encounters and both current combat definitions run through the simulator. Visual replay, recorded-decision enforcement, Workers, exhaustive loadout generation, inter-expedition shop modeling, analytics charts, and automated balance recommendations remain intentionally outside Phase 1.

## 2026-08-12 — Simulation Determinism and Parity Hardening

### Goal

Audit and correct the Phase 1 simulator's determinism, production-rule sharing, replay prerequisites, telemetry fidelity, and automated drift detection before using its results for balance decisions.

### Human prompt and direction

The human developer supplied a focused correction guide calling for a repository-wide randomness audit, explicit seeded ownership, normal-game use of shared expedition rules, meaningful same-seed and batch tests, native-random bypass detection, replay-metadata verification, and no Phase 2 feature expansion or gameplay rebalancing.

### AI-assisted implementation

- Confirmed and retained explicit expedition RNG injection for encounter spacing/selection, weighted branches, random outcomes/resources/loot, combat damage, and flee attempts; no gameplay-affecting direct `Math.random()` call remains.
- Separated cosmetic pending-action delay rolls from the gameplay RNG. Normal UI delays use a presentation source, while instant simulation requests zero delay without consuming native or seeded randomness.
- Consolidated departure provision commitment plus successful and failed normal-game settlement through `ExpeditionRules`, including consumed items, returned provisions, recovered loot, carried gold, and best distance, with an idempotent reward-settlement guard.
- Added region/path scenario configuration, actual pre-departure player-state snapshots, explicit turnaround decisions, and copied encounter/combat/turnaround decision history to versioned replay metadata.
- Corrected encounter telemetry to distinguish unsecured loot gained/lost from packed items consumed, finalize encounters interrupted by failure, derive discovered/recovered/lost loot from production before/after state, and report an explicit completion reason.
- Added `SimulationTelemetry.normalizeRun` and `SimulationRunner.verifyDeterminism`, including first-mismatch path/value reporting while excluding timing and batch-generation metadata.
- Added a dedicated headless-Chrome simulation suite with nine assertions covering same-seed equality, deterministic known-seed batches, robust multi-seed divergence, native `Math.random` throw guards, direct production encounter selection, replay completeness, telemetry invariants, and idempotent shared settlement.
- Hardened existing combat integration assertions so their provision baselines are captured only after combat has paused the live travel loop, removing a timing-sensitive false failure without changing gameplay.
- Preserved all tuning and authored content unchanged.

### Manual changes

The human developer supplied the complete determinism and production-parity correction guide. No manual code edits were reported for this correction pass.

### Resulting prototype state

Phase 1 now has an explicit regression boundary for deterministic gameplay: the same normalized scenario, seed, and decisions reproduce the same meaningful result, and seeded runs do not reach native randomness. Normal gameplay and simulation share the full core expedition lifecycle through settlement. Replay playback remains intentionally unbuilt, but the run output now retains the starting state, location/path, seed, and every player-controlled decision required to enforce or inspect a future replay.

## 2026-08-12 — Persistent Health, Inn Recovery, and Campaign Simulation

### Goal

Extend deterministic balance testing across repeated expeditions with one evolving player/economy state, while making persistent 40-point health and shared paid Inn recovery real player-facing production systems.

### Human prompt and direction

The human developer supplied the multi-expedition campaign guide and added an explicit correction that healing must exist in the playable Inn, persist through saves, and invoke the exact same production rule automated by campaign policies. The pass was constrained against Phase 2 replay UI, injuries, fatigue, durability, sophisticated shopping, story progression, charts, or balance recommendations.

### AI-assisted implementation

- Changed Arthur's authoritative data-defined maximum from 100 to 40 HP without rescaling combat damage, and converted simulator health tactics to percentage thresholds.
- Added save version 6 with persistent Arthur health and data-driven companion health states, safe old-save migration, expedition start snapshots, and success/failure settlement back into player state.
- Added centralized Inn recovery tuning: one rest restores up to 10 HP for 3 gold. The existing Brocéliande Inn shows current/max/resulting health and cost, blocks full-health and unaffordable rests, saves immediately, and uses the same `HealingRules` as campaign policies.
- Added shared production economy/campaign rules for town provision safety, persistent shop stock, provision buying, protected-item checks, real merchant sales, and recovered-loot auto-selling.
- Added Conservative Sustainer, Aggressive Reinvestor, and Minimal Restock between-expedition policies with percentage-based healing thresholds, distance-derived provision targets, structured skips/shortfalls, and explicit stop reasons.
- Added deterministic `CampaignSimulationRunner` single and batch APIs. Campaign expedition seeds derive as `<campaign-seed>:expedition-N`, and each settled ending player state becomes the next run's actual starting state.
- Added campaign, per-expedition, economy, health, sustainability, stop-reason, replay, aggregate, and derived telemetry plus detailed JSON, per-campaign CSV, and per-expedition CSV export.
- Extended `?sim=1` with practical campaign fields, one/batch execution, aggregate results, individual campaign timelines, and all three campaign exports.
- Added a dedicated campaign/health/Inn Chrome suite covering migration, healing display/cost/affordability/save parity, actual normal-game return and next-departure persistence, deterministic/divergent campaigns, insolvency, viable ten-run completion, economy carryover, batches/CSV, and replay payloads.
- Verified 19 focused campaign/health/Inn assertions, 9 single-expedition determinism assertions, and all 207 existing UI/location/browser assertions together; `git diff --check` also passed.
- Measured a representative cautious 50-league campaign at roughly 12.2 ms for 10 expeditions and 202.2 ms for 100 ten-expedition campaigns in headless Chrome on this machine.
- The measured 100-campaign sample completed all ten attempts 93% of the time, ended with 57.77 average gold from a 100-gold start, and averaged 25.57 ending health and 46.13 Arthur damage. This is descriptive test output, not an automatic balance recommendation.
- Preserved all encounter, provision, equipment, enemy, and combat damage values; no hidden rebalance was performed.

### Manual changes

The human developer supplied the complete campaign-simulation guide and the additional player-facing Inn healing requirement. No manual code edits were reported for this milestone.

### Resulting prototype state

Arthur and Kay now carry wounds beyond an expedition instead of resetting at town. Arthur can pay to recover at the existing playable Inn, and campaign policies automate precisely that action. Balance tests can follow gold, provisions, recovered goods, sales, healing, health, party availability, and expedition outcomes across deterministic campaign sequences and batches, revealing whether a plan grows, sustains, declines, dies, or becomes insolvent.

## 2026-08-12 — Active-Party Inn Healing Correction

### Goal

Set Sir Kay's data-defined maximum to 50 HP and make the existing flat-cost Inn rest heal the entire active party consistently in player gameplay and campaign simulation.

### Human prompt and direction

The human developer requested a focused pre-testing correction: preserve all combat, encounter, provision, and Inn tuning while adding shared party healing, per-member telemetry, safe old-save clamping, and post-healing companion availability checks.

### AI-assisted implementation

- Changed Sir Kay's companion-definition maximum from 85 to 50 HP without adding combat or simulation special cases.
- Expanded `HealingRules` to quote and mutate Arthur plus the selected companion in one operation, capped by each member's maximum and charged once at the existing 3-gold cost for up to 10 HP each.
- Updated the Inn to show both active members' current, maximum, healing, and resulting health, with whole-party confirmation and immediate persistent saving.
- Updated campaign policies to evaluate the active party, invoke the same production rest action, retain a single shared cost, record healing per member, and check zero-health companion availability after between-expedition actions.
- Kept save schema 6 and used its current data-driven sanitizer to clamp older Kay health values above 50 while preserving lower current values.
- Added focused browser assertions for the 20/40 Arthur and 30/50 Kay case, individual caps, one-time cost, save/reload, solo rest behavior, settlement/next-expedition persistence, campaign parity, per-member telemetry, and zero-health post-action ordering.
- Verified 23 focused campaign/health/Inn assertions, 9 deterministic simulation assertions, and all 207 existing UI/location/browser assertions; `git diff --check` also passed.

### Manual changes

The human developer supplied the correction requirements. No manual code edits were reported for this pass.

### Resulting prototype state

Sir Kay now has 50 maximum HP. A paid Inn rest serves the current active party as one economic action, and the campaign simulator automates that exact action with member-level health reporting rather than an Arthur-only approximation.

## 2026-08-12 — Adaptive Campaign-Agent Planning

### Goal

Correct unrealistic campaign-agent bailouts before further balance judgments by making healing thresholds explicit, adapting desired expedition distance to affordable supplies, and reserving insolvency for a genuinely unlaunchable campaign.

### Human prompt and direction

The human developer requested simulation-behavior corrections only: no changes to character HP, combat damage, encounters, provision tuning/prices, loot, healing amount, or healing price, and no rare high-value treasure experiment yet.

### AI-assisted implementation

- Raised the aggressive-reinvestor healing threshold from 35% to 60% while retaining conservative at 75%, and made all policy thresholds explicitly trigger at or below the boundary.
- Changed configured campaign distance into a desired target. Preparation buys toward nominal round-trip needs, derives a supported distance from shared provision tuning and party consumption, and reduces the actual turnaround instead of treating a missed preferred buffer as insolvency.
- Preserved policy identity through safety margins: conservative uses five provisions, aggressive three, and minimal restock one, so constrained conservative runs shorten at least as much as aggressive runs.
- Replaced misleading preferred-stock/healing shortfall stops with `cannot-support-any-expedition`, reserved for failure to support even a distance-one expedition after normal preparation. Planning respects pack capacity and, as a last resort, drops an unavailable preferred safety margin before declaring insolvency. The production ten-provision town floor therefore keeps ordinary broke campaigns moving at reduced distance.
- Expanded decision telemetry with desired/actual distance, reduction and reason, nominal/chosen provision estimates, safety margin, affordable and actual stock, purchase state, gold preparation flow, and party health before/after healing.
- Separated quoted Inn recovery and cost from actual mutation. An unaffordable attempt reports its potential result but records unchanged actual HP, zero actual healing, zero actual cost, and `applied: false`.
- Added desired/actual distance, reduction frequency/amount, true insolvency, completion, death, spending, loot, and net-wealth fields to summaries and adaptive-distance columns to CSV exports.
- Added focused browser coverage for healing boundaries, constrained-distance policy comparisons, production town-floor continuation, true no-expedition support, failed-healing telemetry, party-healing parity, updated summaries/CSV, and campaign determinism.
- Verified 30 focused campaign/health/Inn assertions, 9 deterministic single-expedition assertions, all 207 existing UI/location assertions, and `git diff --check`.
- Ran a descriptive 200-campaign sweep (100 conservative/cautious and 100 aggressive/aggressive, desired distance 75, ten planned expeditions, 20 starting gold, 15 provisions). Average actual distance was 38.24 conservative versus 64.35 aggressive; reduction frequency was 77.7% versus 32.6%; true insolvency was 0% for both. Conservative completed 98% of planned campaigns with 2% death, while aggressive completed 29% with 75% death. These are post-correction observations for human review, not balance changes or recommendations.

### Manual changes

The human developer supplied the focused campaign-agent correction guide. No manual code edits were reported for this pass.

### Resulting prototype state

Campaign agents now respond to scarce provisions by lowering ambition rather than falsely ending the campaign, while remaining observably distinct by policy. Logs cleanly separate planned versus executed distance and quoted versus applied healing, giving the next balance sweep a more trustworthy behavioral foundation.

## 2026-08-12 — Aggressive Survival Heuristic Pass

### Goal

Keep aggressive simulation meaningfully risk-seeking while preventing unconditional attacks in a clearly lethal combat window and making its wounded-party decisions inspectable.

### Human prompt and direction

The human developer requested a targeted aggressive AI pass while explicitly preserving Arthur and Kay HP, Inn amount/cost, combat damage, enemy statistics, provisions, loot, and all other balance values. Resulting sweep data was to be reported without automatic follow-on tuning.

### AI-assisted implementation

- Changed aggressive-reinvestor healing from the previous 60% boundary to Arthur strictly below 50%, with a distinct `arthur-critical-below-25-percent` priority. Healthy and exact-50% Arthur do not rest solely for Arthur; critical Arthur may automate one additional shared production Inn action when the first still leaves him below 50% and another is affordable. Each action still uses `HealingRules`, +10 HP, and 3 gold.
- Kept ordinary aggressive combat attack-first. On Arthur's turn only, the simulator now estimates maximum incoming damage from living enemies due before his next action; it intervenes only when that window is lethal, choosing Defend if mitigation becomes survivable and otherwise Flee.
- Kept the emergency heuristic deterministic and read-only over existing gauges, intents, speeds, defense, and damage definitions; no combat mechanics or values changed.
- Added per-decision healing trigger reasons, combat-entry HP and below-50%/25% flags, detailed emergency threat/damage/action payloads, run/campaign totals, batch averages, and CSV fields.
- Added focused browser assertions for healthy, exact-boundary, low, and critical aggressive healing; emergency Defend; ordinary healthy Attack; detailed emergency/entry telemetry; and existing same-seed determinism.
- Verified 33 focused campaign/health/Inn assertions, 9 deterministic simulation assertions, all 207 existing UI/location assertions, and `git diff --check`.
- Repeated the constrained aggressive sweep with the same 100 seeds, desired distance 75, ten planned expeditions, 20 starting gold, and 15 provisions. It averaged 63.25 actual distance, 6.14 expeditions, 2.38 emergency actions, 0.99 combats entered below 50%, 0.54 below 25%, 9.63 gold healing spend, 37.15 recovered loot value, 35% plan completion, and 66% death. Compared with the immediately prior 29% completion/75% death sample, survival improved while remaining substantially riskier than the cautious/conservative comparison; no further tuning was made.

### Manual changes

The human developer supplied the aggressive healing, emergency combat, telemetry, and regression requirements. No manual code edits were reported.

### Resulting prototype state

Aggressive simulation remains attack-oriented and materially riskier than cautious behavior, but its logs now distinguish low-health rest triggers and the narrow combat moments where it stops blindly attacking. The unchanged high death rate in the constrained sweep is preserved as evidence for the next human balance decision.

## 2026-08-12 — Shared Party Targeting and Completion Correctness

### Goal

Make persistent companion health meaningful by allowing production enemies to attack living companions, expose party damage distribution, and stop final-expedition deaths from inflating campaign completion.

### Human prompt and direction

The human developer requested a small combat-correctness pass with approximately 65% Arthur / 35% active-companion targeting through shared production combat and injected RNG, while preserving every existing HP, damage, healing, encounter, strategy, loot, and provision value.

### AI-assisted implementation

- Added centralized enemy target weights of 65% Arthur and 35% collectively across living active companions. No companion yields 100% Arthur; dead combatants are excluded; target draws use only the combat's injected RNG.
- Implemented selection in production `chooseEnemyTarget`, so playable combat and deterministic simulation share identical behavior. Existing Intercede still redirects attacks selected for Arthur.
- Expanded enemy action events with the originally selected target, final recipient, and Intercede redirect flag. Combat and run telemetry now aggregate attacks and damage received per party member, with flattened Arthur/companion campaign totals and batch averages.
- Retained companion settlement, save/load, shared Inn healing, and next-expedition snapshots, and added a regression that deals real production combat damage to Kay before exercising that complete lifecycle.
- Corrected `completedPlan` to require the genuine `max-expeditions-reached` terminal condition. A death on the configured final expedition is no longer completion merely because the attempt count equals the plan length.
- Added focused assertions for Arthur/Kay selection, dead and absent companion exclusion, seeded target-sequence equality, per-member damage telemetry, Kay persistence/healing, and final-expedition completion semantics.
- Verified 40 focused campaign/health/combat assertions, 9 deterministic simulation assertions, all 207 UI/location assertions, and `git diff --check`.
- A fixed-seed 1,000-draw example selected Arthur 652 times and Kay 348 times. In the comparable 100-campaign aggressive batch, enemies made 2,265 attacks for 6,599 damage against Arthur and 1,200 attacks for 4,632 damage against Kay. Corrected plan completion was 69%, death was 31%, average expeditions were 8.55, and average actual distance was 60.47. No follow-on balance changes were made.

### Manual changes

The human developer supplied the party-targeting, telemetry, persistence, completion-semantic, and regression requirements. No manual code edits were reported.

### Resulting prototype state

Kay now participates in combat risk as well as offense, making his persistent wounds and shared Inn recovery operationally relevant. Campaign logs distinguish target selection, actual recipients, and per-member damage, while completion rates now represent campaigns that truly reach their configured terminal condition alive.

## 2026-08-12 — Rare Treasure Loot-Economy Test Pass

### Goal

Add a small set of rare, higher-value discoveries for campaign economy testing without changing existing loot values or any combat, provision, healing, encounter-frequency, or strategy tuning.

### Human prompt and direction

The human developer requested four named sellable treasures worth 15–30 gold, progressively lower weighted rarity at higher values, reuse of existing unsecured-loot and merchant rules, minimal deterministic coverage, and a finished commit and push.

### AI-assisted implementation

- Added the rare Silver Reliquary (15 gold), Gilded Brooch (20 gold), Roman Signet (25 gold), and Jeweled Saint’s Locket (30 gold) as data-defined valuables accepted by General Goods.
- Added only low-weight entries to fitting existing pools: the reliquary and locket at the Ruined Wayside Shrine, the brooch at the Abandoned Cart, and the signet along the Sunken Road. Their respective weights are 0.8, 0.6, 0.4, and 0.2.
- Reused `gainWeightedRandomUnsecuredItem`, normal expedition settlement, and `CampaignRules.sellMerchantItems`; no treasure-specific award, loss, or simulation sale path was added.
- Added focused browser assertions that deterministically select every new weighted entry, verify failure loses the unsecured items, and verify successful recovery auto-sells them for exactly 15, 20, 25, and 30 gold.
- Verified 41 campaign/health/Inn assertions, 208 UI/provision/location browser assertions, 9 deterministic simulation assertions, and `git diff --check`.

### Manual changes

The human developer selected the treasure names and values and requested the constrained loot-economy pass. No manual code edits were reported.

### Resulting prototype state

Existing treasure searches now have a small chance to produce meaningfully valuable campaign finds, with value increasing as authored weight decreases. The items remain ordinary unsecured discoveries: failure loses them, safe return settles them, and campaign automation sells them through the same village merchant economy used by playable interactions.

## 2026-08-12 — Passive Provision Consumption Reduction

### Goal

Reduce passive expedition provision consumption by exactly 15% without changing any other economy, encounter, combat, healing, loot, or campaign-strategy setting.

### Human prompt and direction

The human developer requested one isolated balance adjustment and explicitly preserved starting provisions, prices, encounter rewards and frequency, loot, combat, healing, and campaign strategy behavior.

### AI-assisted implementation

- Reduced the centralized `baseProvisionsPerDistance` tuning value from 0.08 to 0.068.
- Updated the narrow browser assertions for the resulting Arthur rate of 0.068 provisions per league and Arthur-plus-Kay rate of 0.0884 provisions per league.
- Left all other production and tuning values unchanged.

### Manual changes

The human developer selected the exact percentage adjustment. No manual code edits were reported.

### Resulting prototype state

Expeditions consume provisions 15% more slowly through the same shared distance-based rule used by playable travel and simulation, with all other balance inputs unchanged.

## 2026-08-12 — Campaign Economy Continuation and Safe Wins

### Goal

Distinguish genuine campaign-ending failures from unmet strategy preferences, then give low-risk play a few modest economic wins without changing strategy logic or protected combat, health, healing, provision-price, or passive-drain balance.

### Human prompt and direction

The human developer identified premature campaign stops when preferred healing or provision behavior was unaffordable, requested explicit hard-failure versus strategy-constraint telemetry, and asked for a handful of 1–4 gold-equivalent rewards on existing safe outcomes. Aggressive behavior and all listed combat and economy constants were explicitly held fixed.

### AI-assisted implementation

- Removed the campaign-ending `required-companion-unavailable` path. Shared Inn healing still runs first; if an unaffordable rest leaves the selected companion at zero, telemetry records the constraint and the next viable expedition launches without that companion.
- Kept `arthur-died`, actual expedition provision exhaustion, and true inability to support even a minimum expedition as hard failures. Completion and simulation safety errors are classified separately.
- Added structured per-decision strategy constraints for unaffordable preferred healing, unavailable active companions, missed provision buffers, and reduced target distances. Campaign/expedition JSON, CSV, and batch summaries now expose constraint types, counts, stop category, and hard-failure reason.
- Added four small authored safe wins without altering choice heuristics: a 15% Dried Herbs find on the main road, a 20% Dried Herbs bonus while gathering safe plants, a 20% +1 provision recovery when using Rope at the fallen tree, and a 15% Hunting Supplies find when using Rope at the stream.
- Added deterministic assertions for viable continuation after unaffordable healing, solo continuation after an unaffordable companion rest, distance reduction, true inability to launch, death/resource-exhaustion classification, constraint CSV fields, and all four safe rewards.
- Verified 44 campaign/health/Inn assertions, 209 UI/provision/location browser assertions, 9 deterministic simulation assertions, and `git diff --check`.
- Ran 100 ten-expedition campaigns per strategy at desired distance 75 with 20 starting gold, 15 provisions, and the conservative policy for a controlled comparison. Cautious completed 98%, averaged 47.37 actual distance, 17.5 recovered loot value, 1.21 ending gold, and no resource-exhaustion stops. Random completed 50%, averaged 58.48 distance, 28.2 loot value, and 10.58 ending gold; 49% stopped on actual resource exhaustion and 1% on death. These are observations only, with no automatic follow-on balance changes.

### Manual changes

The human developer supplied the stop classification, safe-reward boundaries, target strategy outcomes, prohibited balance changes, and batch request. No manual code edits were reported.

### Resulting prototype state

Campaign agents now continue through affordable compromises instead of treating preferences as survival requirements, while genuine death, provision exhaustion, and inability to depart remain explicit terminal failures. Cautious play receives occasional low-value support from routes it already prefers, but longer and riskier play retains higher reward potential.
