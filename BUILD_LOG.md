# Build Log

## 2026-08-13 - Expedition Simulation Production-System Parity

### Goal

Teach single-expedition and multi-expedition simulations to use the authored pace, ration, rest, camping, camp-event, and cooking systems without changing game balance or adding chapter selection.

### Human prompt and direction

The human developer supplied a focused simulation-parity guide requesting strategy-driven pace/ration choices, deterministic brief-rest and camp decisions, production camp-event resolution, real campfire cooking, persistent campaign state, replay telemetry, and focused tests. Automatic rebalance work and new quest/chapter selection were explicitly deferred. A Git commit and push were requested for this pass.

### AI-assisted implementation

- Added deterministic strategy travel policy defaults: Cautious uses Cautious pace and can select Generous rations when healthy, Normal/Random stays Normal/Normal, and Aggressive uses Hard Push with Sparse available under supply pressure. Ration changes during travel use the live return margin and are recorded.
- Extended `SimulationRunner` to choose continue, brief rest, or camp from current party health, provisions, direction/distance, strategy, and recent action locations. Brief rests, camp entry, camp rest, camp-event resolution, leaving camp, and seeded choice outcomes all use the production rules.
- Added camp cooking decisions that quote available authored campfire recipes and apply successful recipes through `CraftingRules`, consuming carried/unsecured ingredients and adding real provision outputs through `ExpeditionRules`.
- Carried departure settings and all in-expedition decisions through `CampaignSimulationRunner`, preserving settled health, provisions, consumables, recipes, materials, gold, and replay data across expeditions. Added run/campaign JSON, CSV, aggregate, event, and replay telemetry for pace/rations, rests, camps, events, cooking, ingredients, outputs, and resource changes.
- Added focused deterministic coverage for strategy settings, production provision effects, rest/camp/cooking flows, seeded camp events, campaign persistence, replay decisions, and native-random guards. Updated simulation documentation for the new automation phase.

### Manual changes

The human developer supplied the simulation-parity guide and requested the resulting changes be committed and pushed. No manual code edits were reported.

### Verification and resulting prototype state

Automation now manages authored travel pace and rations, takes deterministic recovery actions, resolves camp events, cooks useful campfire recipes, and carries the resulting persistent state into later campaign expeditions. No tuning values or game balance definitions were changed.

Verified 388 UI/provision/location browser assertions, 23 deterministic simulation assertions, 66 campaign/health/Inn assertions, clean production-page startup through local HTTP, no simulation-local `Math.random()` calls, and `git diff --check`.

## 2026-08-13 - BrocÃ©liande Destination Text Deduplication

### Goal

Remove repeated destination identity text from the current village interior screens while preserving useful service content, navigation, and gameplay behavior.

### Human prompt and direction

The human developer requested a small cleanup pass for duplicated atmospheric descriptions on The Hall, The Inn, Merchant, Blacksmith, and Apothecary. The description should remain in the hero, the compact navigation name should remain, and NPC/service cards, objectives, tabs, dialogue, crafting, shopping, and resting should remain intact.

### AI-assisted implementation

- Removed the shared lower `.destination-heading` category/description block from `renderDestination()`; destination data definitions remain unchanged and hero rendering still owns the atmospheric description.
- Kept the destination navigation bar and all NPC/service interaction renderers, then removed the old first-card top margin so useful destination content begins directly within the existing interaction padding.
- Added browser coverage confirming hero-only descriptions, navigation names, Hall objective, NPC/service cards, and first-content spacing across the destination screens while preserving existing interaction tests.

### Manual changes

The human developer supplied the focused destination text cleanup guide and requested another local Git commit. No manual code edits were reported.

### Resulting prototype state

Destination screens now introduce the location once in the hero, retain a compact breadcrumb in the navigation bar, and move directly into the relevant NPC/service card and interaction content without redundant category or description text.

### Verification

Verified 369 UI/provision/location browser assertions, 16 deterministic simulation assertions, 65 campaign/health/Inn assertions, clean production startup through the browser regression server, and `git diff --check`. Changes were committed locally; no push was performed.

## 2026-08-13 - BrocÃ©liande Destination Hero Ratio Adjustment

### Goal

Reduce the vertical footprint of the existing village destination/interior hero visuals while preserving their composition and all other visual regions.

### Human prompt and direction

The human developer requested a tiny follow-up to change only `.destination-visual` from an explicit 16:9 frame to a responsive 2:1 banner for the Hall, Inn, Merchant, Blacksmith, and Apothecary. Companion wording and all gameplay/UI systems were to remain untouched.

### AI-assisted implementation

- Changed `.destination-visual` to `aspect-ratio: 2 / 1`; width, responsive sizing, clipping, gradients, emblem, and title/description composition remain unchanged.
- Updated destination aspect assertions for all five interiors and expanded the existing portrait-width checks to verify the Hall emblem and title panel remain contained at each mobile viewport size.
- Left Village map, expedition travel, combat, encounter, dialogue, preparation, toast, and destination interaction content unchanged.

### Manual changes

The human developer supplied the focused 2:1 destination-hero adjustment and requested another local Git commit. No manual code edits were reported.

### Resulting prototype state

Destination interiors now use a shorter wide 2:1 hero banner, leaving more vertical room for their interactive content while remaining ready for future `cover`-positioned artwork.

### Verification

Verified 364 UI/provision/location browser assertions, 16 deterministic simulation assertions, 65 campaign/health/Inn assertions, clean production startup through the browser regression server, and `git diff --check`. Changes were committed locally; no push was performed.

## 2026-08-13 - BrocÃ©liande Destination Visual Cleanup

### Goal

Make two small presentation-only cleanup changes in the current BrocÃ©liande implementation: clarify empty companion slots and make destination/interior hero visuals explicit 16:9 artwork frames.

### Human prompt and direction

The human developer requested a narrowly scoped follow-up pass. Empty companion options should say `None` with concise empty-slot wording, while only village destination visuals should receive an explicit 16:9 constraint. Village maps, expedition travel, combat, encounter visuals, party mechanics, and campaign behavior were to remain unchanged.

### AI-assisted implementation

- Changed the empty companion option label to `None` and its description to `Leave this companion slot empty.` without changing selection, save, party, provision, or combat logic.
- Removed the aspect-ratio declaration from the generic `.visual-frame` rule and explicitly applied `aspect-ratio: 16 / 9` to `.destination-visual`; travel and combat retain their existing shared aspect rule through their own selectors.
- Added browser assertions for both empty companion slots, explicit destination aspect styling and rendered ratios for Hall, Inn, Merchant, Blacksmith, and Apothecary, plus containment of the Hall emblem/title frame.

### Manual changes

The human developer supplied the focused UI cleanup guide and requested another local Git commit. No manual code edits were reported.

### Resulting prototype state

Companion slot placeholders no longer imply that Arthur is traveling alone, and destination interiors now have a clear 16:9 frame contract for future artwork while preserving the existing composition and all non-destination visual regions.

### Verification

Verified 360 UI/provision/location browser assertions, 16 deterministic simulation assertions, 65 campaign/health/Inn assertions, clean production startup through the browser regression server, and `git diff --check`. Changes were committed locally; no push was performed.

## 2026-08-13 - BrocÃ©liande Mobile Preparation Flow Polish

### Goal

Make the existing BrocÃ©liande dialogue and expedition preparation screens easier to use on portrait phones without changing story content, saved campaign state, simulation behavior, or toast behavior.

### Human prompt and direction

The human developer supplied a focused mobile UX guide requesting a substantially darker translucent dialogue backdrop and a compact four-step preparation flow: Route, Gear & Pack, Company & Supplies, and Review & Depart. The guide also required persistent preparation state, top Village escape, bottom Back/Continue controls, scroll reset on step transitions, mobile overflow checks, regression coverage, and a local commit without pushing.

### AI-assisted implementation

- Added transient `game.preparationStep` navigation for the four preparation stages while keeping equipment, pack, route, companion, and provision mutations on their existing handlers and save model.
- Split the unified preparation renderer into isolated Route, Gear & Pack, Company & Supplies, and Review & Depart views with a compact stepper, Arthur/companion summary, route danger, loadout, pack, provision, and travel-speed review details.
- Added step-aware Back/Continue controls, reset preparation scroll when changing stages, retained top Village escape on every stage, and preserved scroll while editing equipment, pack, company, or provisions.
- Strengthened the dialogue backdrop to a 70â€“78% dark translucent gradient while preserving the centered responsive card, click prevention, and existing dialogue content.
- Extended the location browser regression flow for step isolation, state persistence, mobile footer visibility, review navigation, and the stronger backdrop assertion.

### Manual changes

The human developer supplied the mobile UX polish guide and requested another local Git commit. No manual code edits were reported.

### Resulting prototype state

BrocÃ©liande preparation is now a compact guided flow that remains compatible with the existing expedition state and mobile scrolling behavior. Dialogue scenes read more clearly against the artwork while remaining visibly translucent and responsive.

### Verification

Verified 357 UI/provision/location browser assertions, 16 deterministic simulation assertions, 65 campaign/health/Inn assertions, clean production startup through the browser regression server, and `git diff --check`. Changes were committed locally; no push was performed.

## 2026-08-13 - BrocÃ©liande Dialogue and Notification Polish

### Goal

Polish the existing BrocÃ©liande dialogue and notification presentation without changing the dialogue architecture, village layout, or story content.

### Human prompt and direction

The human developer requested a focused UI pass: move the RPG dialogue card upward, reduce background dimming, route all NPC Talk and Rumor interactions through the reusable dialogue system, retire the old inline dialogue message, improve mobile text/choice handling, move toasts closer beneath the permanent header, preserve layering and click protection, and add regression coverage before committing.

### AI-assisted implementation

- Added a transient one-node dialogue-session helper for ambient NPC speech and routed Innkeeper, Merchant, Blacksmith, Apothecary, and fallback rumor interactions through the existing RPG dialogue overlay.
- Removed the legacy `dialogueMessage` state, inline destination quote block, and unused presentation styling. Story sequences and Hall behavior remain unchanged.
- Repositioned the dialogue overlay into a responsive middle/lower-middle placement, reduced its dimming gradient, constrained the card to the portrait viewport, preserved future portrait space, and added internal text handling plus mobile-safe choice layout.
- Anchored toast notifications just below the permanent header with a safe minimum offset and retained their stacking, semantic styling, timers, pointer behavior, and motion support.
- Expanded browser coverage for overlay placement, dimming, mobile containment, long text, three choices, click-layer properties, all NPC Talk/Rumor paths, no-rumor fallback, toast placement, and intro completion feedback.

### Manual changes

The human developer supplied the dialogue/UI polish guide and requested another local Git commit. No manual code edits were reported.

### Resulting prototype state

Conversation now feels attached to the destination scene instead of reading as a bottom sheet. Ambient NPC speech, rumors, and story dialogue share one presentation path, while destination pages remain free of inline conversational quote blocks. Toasts sit closer to the game header, and longer dialogue or multiple choices remain usable on portrait phones.

### Verification

Verified 349 UI/provision/location browser assertions, 16 deterministic simulation assertions, 65 campaign/health/Inn assertions, and `git diff --check`. Changes were committed locally; no push was performed.

## 2026-08-13 - First BrocÃ©liande Campaign Structure

### Goal

Establish the first data-driven BrocÃ©liande campaign structure while keeping the chapter content intentionally thin and compatible with the existing expedition, encounter, village, save, preparation, combat, and simulation systems.

### Human prompt and direction

The human developer supplied a structural campaign guide requesting three selectable normal expeditions, one prerequisite-locked Search for Merlin route, skull danger ratings, campaign-item progression, conditional Fountain and Val sans Retour encounters, a two-companion party with Llamrei, a central Hall, reusable RPG dialogue, first-entry onboarding, safe save migration, automation support, regression coverage, and a commit without pushing.

### AI-assisted implementation

- Added data-driven Old Forest Road, Fountain of Barenton, Val sans Retour, and Search for Merlin expedition definitions. Preparation now preserves loadout state while selecting routes, renders restrained SVG skull danger ratings, shows missing campaign prerequisites, and launches the selected route.
- Added protected unique campaign items for Merlin's Flask, Water of Barenton, and Morgan's Token, plus conditional Fountain content, Old Forest Road Flask/Llamrei discoveries, Morgan's Voice, a summoned guardian combat placeholder, and a 100â€“125 league Merlin placeholder encounter.
- Expanded party state to two companion slots with legacy single-companion migration. Added capability-driven Llamrei behavior, provision and travel bonuses, Kick/Charge combat content, restricted human actions, and non-permanent defeat handling.
- Added The Hall and Reeve content, moved the Apothecary southeast, and introduced reusable data-driven dialogue sequences with portrait placeholders, choices, explicit effects, mobile-sized overlay controls, and a five-node first-entry introduction.
- Added the fresh-save Hall-only village gate, immediate intro save/unlock behavior, campaign prerequisite helpers, route-aware encounters, and multi-party simulation/campaign telemetry and planning support.
- Expanded browser regression coverage for route structure, campaign items, conditional outcomes, three-member parties, Llamrei capabilities and travel, Hall onboarding, dialogue choices, and migration compatibility.

### Manual changes

The human developer supplied the campaign structure guide and requested a commit without pushing. No manual code edits were reported.

### Resulting prototype state

BrocÃ©liande now has a playable structural campaign loop: a new save enters through The Hall, the three normal routes can be explored freely, the first campaign key items can be secured through thin placeholder content, and Search for Merlin becomes available once both prerequisites are owned. Final encounter writing, Morgan's identity and boss design, Merlin's finale, Llamrei balance, exact distances, and portraits remain intentionally tunable placeholders.

### Verification

Verified 334 UI/provision/location browser assertions, 16 deterministic simulation assertions, 65 campaign/health/Inn assertions, clean production startup over local HTTP, and `git diff --check`. Changes were committed locally; no push was performed.

## 2026-08-13 - Focused Expedition UI Pass

### Goal

Improve expedition readability and interaction without expanding the game systems: present discoveries as persistent reward cards, clarify unsecured loot, make multi-enemy targeting direct, and separate return-tier rewards from the expedition haul.

### Human prompt and direction

The human developer supplied a focused UI/UX guide requesting reusable item/material/gold/recipe reward presentation, an actual unsecured-loot HUD summary, persistent enemy selection during paused combat, a clearer returned-expedition report, no combat balance or reward changes, regression coverage, and commit/push when complete.

### AI-assisted implementation

- Added a reusable reward-card renderer with category labels, item metadata, rarity treatment, quantities, descriptions, unsecured/secured status, entrance animation, and reduced-motion behavior. Encounter discoveries remain persistent until Continue Journey and are no longer duplicated as plain reward messages.
- Reworked the expedition resource HUD to show a prominent Unsecured Loot count plus item, material, and gold quantities from the actual staged state.
- Added persistent selected-enemy state, gold selection highlighting, selectable enemy cards while combat is paused, direct basic attacks against the selected living enemy, and automatic reselection after a target is defeated. Existing ability/item target semantics remain intact.
- Moved return-tier loot into a separate transient reward bucket, settled it through the same authoritative lifecycle, preserved simulation/campaign totals, and rendered the report as distinct Expedition Haul and distance-tier Return Reward sections.
- Updated the browser regression coverage for reward cards, unsecured quantities, separated return rewards, persistent combat selection, dead-target fallback, direct Attack behavior, and short portrait report containment.

### Manual changes

The human developer supplied the focused UI guide and requested commit/push authorization. No manual code edits were reported.

### Resulting prototype state

Expedition discoveries now read as durable, contextual rewards; unsecured progress is easy to understand at a glance; combat target selection is faster and remains visible between turns; and return reports distinguish what was found on the road from the distance-based bonus.

### Verification

Verified 269 UI/provision/location browser assertions, 16 deterministic simulation assertions, 65 campaign/health/Inn assertions, clean production startup over local HTTP, and `git diff --check`.

## 2026-08-13 â€” Combat Hit Flash Lifecycle Fix

### Goal

Stop combat nameplates from replaying the red hit animation whenever the combat panel rerenders for a ready turn, submenu, or target-selection action.

### Human prompt and direction

The human developer reported that a nameplate correctly flashed when attacked but continued flash…23681 tokens truncated…vider, ingredient, output, optional gold, and rarity data; learned IDs live only in campaign state. Strong Tonic and Repair Kit validate mixed material/gold costs.
- Added one generic crafting rule set used by both providers. It quotes known/provider/material/gold/unique-item requirements, performs an atomic no-failure mutation, creates existing item definitions, saves through the normal UI path, and records concise debug telemetry.
- Extended the Blacksmith with a Craft tab and added an Apothecary destination/NPC/shop with Buy, Sell, Talk, and Craft actions. Craft views hide unknown recipes, show owned/required materials and gold, and use one repeatable Craft button.
- Added reusable weighted loot tables for common/uncommon/rare/forest materials, Apothecary recipe pools, encounter forage, and five return tiers. Table entries can award gold, materials, items, recipes, or nested tables; rarity remains display metadata and never controls probability.
- Added generic eligibility filtering without mutating definitions. Learned or already-staged recipes are skipped, exhausted child tables safely disappear from the weighted pool, unique owned items are ineligible, and ancestor/depth guards prevent recursive table loops.
- Routed Abandoned Camp through the generic encounter loot resolver as a second reward source. Expedition loot stages materials and recipe knowledge alongside existing unsecured items/gold, then shared settlement either secures all four reward types or loses unsecured discoveries on failure.
- Added Minor, Low, Medium, High, and Deep successful-return reward tiers at 0, 20, 40, 60, and 90 maximum leagues reached. Shared settlement rolls the configured tables exactly once, including voluntary returns, and reports tier/results/debug traces.
- Migrated saves to version 7 with safe stable-ID sanitization for material quantities and learned recipes. Fresh campaigns know Bandages and Repair Kit and hold a small test material supply so both provider loops can be exercised immediately.
- Propagated material, recipe, return-reward, and loot-trace state through deterministic expedition and persistent campaign simulation. Between-expedition automation now crafts useful known Bandages before buying only the remaining strategy target.
- Updated player-facing architecture and simulation documentation and expanded browser coverage for provider UI, atomic crafting, separate inventory state, save migration, nested resolution, cycle protection, learned-recipe filtering, return tiers, idempotent settlement, telemetry, and cross-expedition persistence.
- Verified 235 UI/provision/location browser assertions, 16 deterministic simulation assertions, 65 campaign/health/Inn assertions, clean production-page startup through local HTTP, and `git diff --check`.

### Manual changes

The human developer provided the complete design guide, content scale, architectural constraints, validation checklist, and authorization to commit and push after successful completion. No manual code edits were reported.

### Resulting prototype state

Materials found in authored encounters or successful-return tables now feed a persistent provider-specific crafting loop: players can buy expensive finished remedies immediately, or discover permanent recipes and turn secured resources into the same ordinary item/ability system. The framework supports future providers, rare equipment outputs, unique authored loot pools, and additional reward sources without provider switches or parallel inventory/effect systems.

Intentional first-pass limits remain: Antidote and Repair Kit have no poison/durability action yet; no such subsystem was invented for this pass. The current expedition has no authored story-completion boundary, so 90+ leagues uses the best generic Deep return tier rather than claiming chapter completion. Loot traces are available to debug/simulation output and the browser console, while the normal UI shows only concise rewards.

## 2026-08-12 â€” Scroll Preservation and Apothecary Hub Fix

### Goal

Prevent same-screen interaction rerenders from resetting scrollable panels, and move the Apothecary hotspot out from behind the village foreground road.

### Human prompt and direction

The human developer reported that buying shop items jumped the interaction scrollbar to the top, requested an audit of other scroll boxes and buttons against the already-correct inventory/loadout behavior, identified the new Apothecary hotspot as obscured, and authorized committing and pushing the completed fix.

### AI-assisted implementation

- Added one reusable same-screen rerender helper that snapshots and restores the active scroller's `scrollTop`.
- Routed Buy, Buy Provisions, Sell, Craft, shop-tab, NPC dialogue, and Inn-rest destination updates through a scroll-preserving destination refresh.
- Refactored the existing preparation refresh to use the same helper without changing its established behavior.
- Routed combat submenu, target-selection, cancel/back, and changed-state rerenders through a scroll-preserving combat refresh. True destination, expedition phase, and combat-result transitions still render normally at their natural starting position.
- Moved the Apothecary from the bottom-center hotspot row to the open center of the village scene, above the foreground road.
- Added portrait-browser assertions for centered/unobscured Apothecary placement and preserved Buy, Sell, shop-tab, and preparation scroll positions.
- Verified 242 UI/provision/location assertions, 16 deterministic simulation assertions, and 65 campaign/health/Inn assertions.

### Manual changes

The human developer supplied the bug report, screenshot, desired placement direction, cross-screen audit request, and commit/push authorization. No manual code edits were reported.

### Resulting prototype state

Players can repeatedly transact in long shop lists without being returned to the top. Other normal-play same-screen scrollers now share one preservation mechanism, while intentional navigation and phase changes remain unaffected. The Apothecary is fully visible in the center of the village scene across the tested portrait sizes.

## 2026-08-12 â€” Centered Apothecary Press-State Fix

### Goal

Stop the centered Apothecary hotspot from jumping sideways while pressed without changing the shared button feedback used elsewhere.

### Human prompt and direction

The human developer reported the centered Apothecary button shifting horizontally during pointer-down, supplied before/pressed screenshots, and authorized committing and pushing the fix.

### AI-assisted implementation

- Identified the generic `button:active` transform as overriding the hotspot's required `translate(-50%, -50%)` centering transform.
- Added a more specific centered-hotspot pressed/active rule that retains both centering translations while applying the existing slight downward movement and scale feedback.
- Added browser coverage that holds the Apothecary in its scripted pressed class and verifies its center point remains aligned with the village scene at all three tested portrait sizes.
- Verified 245 UI/provision/location assertions, 16 deterministic simulation assertions, 65 campaign/health/Inn assertions, and `git diff --check`.

### Manual changes

The human developer supplied the bug report, visual evidence, and commit/push authorization. No manual code edits were reported.

### Resulting prototype state

The Apothecary remains stationary and comfortably clickable during pointer-down while preserving the same tactile press feedback as the other village hotspots.

## 2026-08-13 â€” Focused Mobile UI Cleanup Pass

### Goal

Reduce visual weight in reward summaries and clean up the remaining phone-tested expedition, Inn, and combat presentation rough spots without changing game content, balance, or progression scope.

### Human prompt and direction

The human developer supplied a focused UI/UX guide requesting compact-versus-important reward presentation, coherent medieval category icons, a full-width Unsecured Loot HUD, wrapping expedition collections, a simpler Inn rest state, combat controls immediately above the log, and a compact Returned to Safety report that preserves separate Expedition Haul and distance-tier Return Reward data. Dialogue, tutorials, and location unlocking were explicitly deferred. Commit and push were intentionally not authorized for this pass.

### AI-assisted implementation

- Replaced reward placeholder labels and weak item symbols with a reusable inline-SVG category icon system covering weapons, armor, potions/healing, herbs, wood/materials, currency, gems, relics, recipes, rope, torches, tools, treasure, and curiosity fallbacks. Reused the mapping through shop, crafting, inventory, material, encounter, expedition, and summary renderers.
- Added data-driven reward significance classification: routine rewards render compact rows, uncommon/interesting rewards receive restrained emphasis, and recipes, relics, quest items, and exceptional discoveries retain full reward cards. Encounter results keep the full discovery treatment while summary reports use compact collections.
- Made Unsecured Loot a full-width bar below the primary expedition resource grid with live item/material/gold counts, category icons, and a clean zero state. Loadout, Carried, and Discoveries now use wrapping item chips with quantities instead of ellipsized text.
- Simplified Inn presentation to show party health and current-to-post-rest values, actual cost, and a concise fully-rested state while preserving HealingRules, repeated rests, prices, and toast feedback.
- Reordered combat to Battlefield, current turn/selected target, action controls, and bounded scrolling Combat Log. Persistent target selection, submenu behavior, and mechanics remain unchanged.
- Restored a compact Returned to Safety report with grouped Expedition Haul and distance-tier Return Reward sections. Routine rewards use short rows; major discoveries stand out individually, while settlement and source buckets remain separate.
- Expanded browser assertions for icon fallback, reward hierarchy, zero-state/full-width loot, wrapping expedition data, Inn states, combat ordering at portrait sizes, and compact source-separated reports.

### Manual changes

The human developer supplied the design guide and requested local changes only. No manual code edits were reported.

### Verification and resulting prototype state

The prototype now presents routine information quickly on narrow screens while reserving visual emphasis for discoveries that merit it. Village, shops, inventory/loadout structure, encounter hierarchy, toast behavior, travel artwork, combat targeting, save behavior, reward tables, and balance were intentionally left unchanged.

Verified 284 UI/provision/location browser assertions, 16 deterministic simulation assertions, 65 campaign/health/Inn assertions, clean production-page startup through local HTTP, and `git diff --check`. Changes remain unstaged and uncommitted for the human developer to commit and push.

## 2026-08-13 - Expedition Return Provision Warning

### Goal

Give the expedition Provisions stat a focused advisory warning as the party approaches the provision requirement for returning safely, without changing push-your-luck travel behavior or provision balance.

### Human prompt and direction

The human developer supplied a focused expedition UX guide requiring an authoritative return estimate, proportional warning threshold, safe/warning/danger states, restrained motion, reduced-motion support, portrait/mobile verification, and no automatic turnaround or travel restrictions. Commit and push were intentionally not authorized for this pass.

### AI-assisted implementation

- Centralized provision cost per distance and return estimation in `ExpeditionRules`, reusing the expedition's snapshotted party consumption multiplier and the same base rate used by actual travel. Simulation planning now uses the shared cost helper where it models passive travel cost.
- Added a named `returnProvisionWarningMarginRatio` tuning value of 0.2. Warning begins when current provisions are still at least the estimated return requirement but no more than 20% above it; danger begins strictly below the estimate.
- Added a compact contextual return estimate to the Provisions card only in warning/danger states. Warning uses aged gold with a slow 1.8-second pulse; danger uses muted oxblood/red with a somewhat stronger 1.6-second pulse. Neither state disables continued travel.
- Added browser coverage for safe start state, proportional warning and strict danger transitions, recovery back to warning/safe, party multiplier effects, reduced-motion colors without animation, and the four intended portrait viewport sizes.

### Manual changes

The human developer supplied the UX guide and requested local changes only. No manual code edits were reported.

### Verification and resulting prototype state

Expedition supplies now communicate whether the current push is comfortably return-covered, approaching the return requirement, or already below it. The warning is based on the actual distance and party consumption rules, remains advisory, and updates as distance or provisions change. Existing travel, return, encounter, save, and simulation behavior remain unchanged.

Verified 293 UI/provision/location browser assertions, 16 deterministic simulation assertions, 65 campaign/health/Inn assertions, clean production-page startup through local HTTP, and `git diff --check`. Changes remain unstaged and uncommitted for the human developer to commit and push.

## 2026-08-13 - Unified Village Expedition Preparation

### Goal

Simplify the Village to Inventory to Expedition path by making Prepare for Expedition the single inventory, equipment, packing, party, provision, and expedition setup screen.

### Human prompt and direction

The human developer supplied a focused mobile UX guide requesting removal of the redundant Forest Gate destination and separate Inventory / Pack navigation, actionable permanent inventory controls, top Village navigation, preserved expedition rules, location-based crafting, and removal of the new provision warning explanation line. Commit and push were not requested for this pass.

### AI-assisted implementation

- Removed Forest Gate from the village destination definitions, clickable hotspots, destination interaction, icon mapping, and unused presentation styles. The village now keeps the Inn, Merchant, Apothecary, and Blacksmith, with the existing scene composition left otherwise intact.
- Replaced the village Inventory / Pack button with the oxblood Prepare for Expedition primary action. Legacy runtime callers of the old inventory action are routed into the same unified preparation screen rather than a separate mode.
- Reframed preparation as Prepare for Expedition and kept its existing Equipped Gear, Expedition Pack, Permanent Inventory, Party, Provisions, and Begin Expedition sections together. Permanent inventory continues to expose the existing Equip, Pack, Packed, and valid disabled states governed by current equipment and pack rules.
- Added an immediate top-level â† Village navigation control and removed the bottom-only Back action. Begin Expedition remains the final commit action at the bottom of the flow.
- Removed only the explanatory line from the Provisions warning card. The authoritative return estimate, safe/warning/danger state colors, restrained pulses, and reduced-motion behavior remain unchanged.
- Expanded portrait-browser coverage for the consolidated path, direct inventory actions, packing removal and limits, Forest Gate absence, top/back navigation, end-of-flow commit placement, mobile containment, and text-free provision states.

### Manual changes

The human developer supplied the UX consolidation guide and requested local changes only. No manual code edits were reported.

### Verification and resulting prototype state

The village now leads directly into one practical preparation screen. Players can inspect owned items, equip valid gear, manage the expedition pack, select the company, choose provisions, and begin the expedition without passing through a physical gate or a duplicate inventory screen. Crafting remains location-based, and existing save, travel, combat, reward, and simulation behavior remains intact.

Verified 308 UI/provision/location browser assertions, 16 deterministic simulation assertions, 65 campaign/health/Inn assertions, clean production-page startup through local HTTP, and `git diff --check`. Changes remain unstaged and uncommitted for the human developer to commit and push.

## 2026-08-13 - Exploration Management: Pace, Rations, Rest, Camping, and Cooking

### Goal

Add the first exploration-management layer for player-directed travel pace, ration choices, pausing, brief rest, rough camping, contextual camp events, cooking, and unusual resting-place discoveries.

### Human prompt and direction

The human developer supplied the exploration-management guide and requested a functional, data-driven first pass that reuses the existing expedition, encounter, loot, crafting, healing, combat, and automation architecture. Fatigue, spoilage, mandatory camping equipment, day/night, and complex automation were explicitly deferred. Local changes were requested to be committed without pushing.

### AI-assisted implementation

- Added data-driven Cautious, Normal, and Hard Push pace definitions plus Sparse, Normal, and Generous ration definitions. Pace changes travel speed and contributes to the shared provision-rate calculation; rations remain independent.
- Added explicit expedition `travelState` handling for Traveling, Paused, and Camped. Pause is free and inert, Brief Rest uses shared expedition-party healing, and Camp Rest is stronger, provision-costed, and limited to one contextual event roll per camp site/cycle even across leave-and-re-enter actions.
- Extended the existing staged encounter resolver to support camp events through separate reusable camp-event tables. Forest, wildlife, traveler, and deep-forest pools now feed a modest mix of friendly, neutral, strange, beneficial, risky, and occasionally hostile camp content, including a weighted wolf outcome that reuses combat.
- Extended recipes to support item ingredients and direct provision outputs. Added Raw Meat, Wild Berries, Mushrooms, Fresh Herbs, and Honey, a starter campfire recipe set, a forest ingredient loot table, and camp cooking UI. Existing material-to-item crafting remains compatible.
- Added Ancient Spring and A Welcoming Grove as normal travel encounters, including recovery choices and the deliberately suspicious resting-place branch.
- Added simulation scenario support for pace and ration IDs while keeping existing automation on Normal pace and Normal rations by default.
- Added focused browser assertions for pace/ration modifiers, paused travel, brief rest, camp-cycle protection, cooking settlement, and weighted camp-to-combat handoff; updated content-count/recipe validation for the new authored data.

### Manual changes

The human developer supplied the exploration guide and requested implementation plus a local commit. No manual code edits were reported.

### Verification and resulting prototype state

The prototype now lets a player change pace and rations while traveling, pause without resource loss, take a brief rest, make camp anywhere, cook expedition ingredients into provisions, rest into a contextual camp event, resolve choices or camp combat, leave camp still paused, and resume travel. Camp events do not reroll merely because camp is reopened at the same site.

Verified 375 UI/provision/location browser assertions, 16 deterministic simulation assertions, 65 campaign/health/Inn assertions, a clean local-HTTP manual pause/cook/camp-event/reopen flow with zero runtime errors, and `git diff --check` before commit.

