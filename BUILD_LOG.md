# Build Log

## 2026-08-26 - Authored Campaign Progression Distances

### Goal

Make campaign progression resolve encounter-backed milestone distances from
the authored encounter definitions so Content Editor distance changes are
immediately reflected by the simulator.

### Human direction

- Use the normal encounter data as the source of truth for White Hart grace,
  hidden village, Thorn-Crowned Hart, and Verdant Altar progression distances.
- Replace the hardcoded Verdant Warden final target while preserving
  `expeditionPlan` as a fallback for non-progression/repeated simulations.
- Fail clearly when a required progression encounter or authored distance is
  missing or invalid; do not rebalance encounter content or other systems.
- Add/update tests, update this log, and add/commit/push the finished change.

### AI-assisted implementation

- Added `resolveProgressionEncounterDistance()` to validate and read an
  encounter's authored minimum/fixed distance, including invalid range
  diagnostics.
- Routed Old Forest White Hart, hidden village, Thorn-Crowned Hart, and
  Verdant Altar goals, preparation metadata, and village resupply planning
  through authored distances at assessment time.
- Kept Woodcraft and town crafting/enchantment targets behavioral, and kept
  configured distances authoritative for repeated simulations.
- Added fixture-mutation coverage for dynamic authored distances, plan
  override behavior, earlier milestones, invalid data, and non-progression
  targets.

### Reported manual changes

- The user authorized inclusion of pre-existing in-progress combat tuning,
  crafting recipe, and encounter-content edits in the same Game commit. Those
  edits are outside the simulator distance-resolution change.

### Verification and resulting prototype state

- Current-campaign progression browser suite passes 10 assertions.
- Replay suite passes 15 assertions.
- Existing campaign and single-expedition suites currently stop on unrelated
  expectations affected by the authorized in-progress combat/content edits;
  those edits were preserved rather than rewritten for this task.

## 2026-08-26 - Expedition-Specific Travel and Encounter Cadence

### Goal

Move encounter spacing and return travel speed from global-only tuning to
optional expedition-level overrides, fixing return-trip encounter frequency
without changing encounter content, travel pace, provisions, or rewards.

### Human direction

- Keep the global encounter spacing and return speed as fallback defaults.
- Author `old_forest_road` with outbound 7-10 leagues, returning 14-20
  leagues, and return speed 4x.
- Update normal gameplay, encounter scheduling, instant simulation, replay,
  and the Expedition editor while preserving optional-field round trips.
- Add/commit/push the coordinated game and Content Editor change without other
  balance changes.

### AI-assisted implementation

- Added `ExpeditionRules.encounterSpacing()` and
  `ExpeditionRules.returnSpeedMultiplier()` with direction-aware overrides,
  outbound fallback for missing returning values, safe numeric validation, and
  global tuning fallback without mutating authored data.
- Routed gameplay travel visuals/updates, encounter initialization and
  rescheduling, simulation, replay, and exhausted-pool scheduling through the
  shared helpers.
- Added the requested Old Forest Road fields only; other expeditions continue
  using global defaults.
- Added the Content Editor's Travel &amp; Encounter Cadence section, dynamic
  global-default hints from `EXPEDITION_TUNING`, optional nested-field cleanup,
  field-specific validation, and surgical round-trip coverage.

### Reported manual changes

- None beyond the requested Old Forest Road cadence override. Encounter
  weights, direction filters, provision consumption, pace definitions, combat,
  loot, rewards, safe-distance tuning, and expedition distances were unchanged.

### Verification and resulting prototype state

- Expedition cadence browser suite passes 4 assertions, including global
  fallback, authored outbound/return scheduling, invalid-value safety, and
  simulation parity.
- Replay suite passes 15 assertions. Focused Content Editor cadence
  validation/round-trip and Expedition browser UI tests pass.
- Broader current-branch location/editor suites retain unrelated stale fixture
  expectations (village/shop/layout/content counts); they were not changed to
  mask this pacing fix.

## 2026-08-26 - Generic Reactive Equipment Triggers

### Goal

Add the reusable equipment foundation for status retaliation, flat reflected
damage, and action-gauge retaliation when the wearer takes damage, while
preserving existing combat behavior and authored data.

### Human direction

- Add generic `damageTaken` equipment triggers with `eventSource` targeting.
- Support Apply Status, flat Deal Damage, Modify Gauge, and Random Chance
  effects across weapon, shield, armor, and relic equipment.
- Preserve Resolve/store-charge triggers, existing statuses and equipment
  behavior, deterministic replay/simulation, and surgical editor saves.
- Do not create Splinterbark Shield, statuses, slots, stats, or rebalanced
  equipment in this pass; update both repositories, tests, and this log.

### AI-assisted implementation

- Kept listener owner, event source, and event target as separate combat
  context fields, and added `target: "eventSource"` to the shared effect
  resolver.
- Normalized generic and legacy equipment combat triggers into the existing
  passive dispatcher. Reactive damage is marked non-reflectable, and indirect
  status damage does not start reflection loops.
- Added equipment-originated event metadata for item, slot, trigger, effect,
  target, and chance outcome where applicable.
- Added Content Editor validation and controls for generic trigger events,
  conditions, effect types, targets, statuses, numeric amounts, chances, and
  nested Random Chance effects while retaining legacy Resolve authoring.
- Added focused runtime, editor validation/round-trip, and editor-browser
  regressions covering event-source targeting, all three reactions, loop
  prevention, all equipment slots, legacy data, and surgical saves.

### Reported manual changes

- None. Existing Splinterbark Shield data was left untouched, and no new
  reactive item or combat rebalance was authored.

### Verification and resulting prototype state

- Reactive equipment suite passes 8 assertions; equipment suite passes 14;
  replay suite passes 15.
- Focused Content Editor generic/legacy validation and round-trip tests pass;
  generic-trigger UI and existing item-filter browser regressions pass.
- The current branch's broader combat and simulation suites still stop on an
  unrelated stale Pommel Strike expectation because the default
  `arthur_sword` fixture does not grant that ability. No unrelated data or
  balance was changed to mask it.
- No new status, slot, stat, percentage reflection, or authored reactive item
  was added.

## 2026-08-26 - Shield Slot and Two-Handed Compatibility

### Goal

Add the four-slot equipment model (Weapon, Shield, Armor, Relic), additive
shield defense, simple two-handed weapon compatibility, and Content Editor
authoring support without changing acquisition, progression, or existing
weapon balance.

### Human direction

- Add exactly `weathered_round_shield` (2 defense) and
  `knights_kite_shield` (4 defense), with no loot, shop, recipe, encounter,
  reward, or starting-inventory references.
- Treat `twoHanded: true` as a shield conflict everywhere equipment is
  equipped, loaded, snapshotted, simulated, or replayed; keep existing
  weapons one-handed by default.
- Update both repositories, focused tests, this build log, and the GitHub
  branches.

### AI-assisted implementation

- Centralized the four conventional slots and compatibility normalization in
  `EquipmentRules`; manual equip, persistence, expeditions, debug tools,
  simulations, campaign automation, and replay now share the rule.
- Made equipped combat effects generic, summed armor and shield defense, and
  updated preparation/review UI, item labels, shield iconography, and the
  responsive equipment grid.
- Added the two exact shield definitions only, plus Content Editor category,
  slot, typed defense, two-handed checkbox, validation, starting-state, and
  surgical round-trip support.
- Added focused browser and editor regressions covering shield defense,
  compatibility repair, save compatibility, snapshots, auto-equipping,
  simulation, filtering, and round-tripping.

### Reported manual changes

- None beyond the requested shield/two-handed design and repository
  integration work. No existing weapon was marked two-handed or rebalanced.

### Verification and resulting prototype state

- Focused game equipment suite passes 14 assertions; combat passes 43 and
  replay passes 15 assertions.
- Focused Content Editor round-trip and Shield-filter tests pass.
- The broader current-branch simulation, campaign, location, and Content
  Editor suites retain unrelated pre-existing stale expectation failures;
  none are caused by the equipment changes. `git diff --check` is clean.

## 2026-08-26 - Structural Combat Loot Ownership Pass

### Goal

Link reusable Combat and Enemy definitions to the existing expedition loot
pipeline while preserving encounter rewards, safe-return settlement, and
deterministic simulation/replay behavior.

### Human direction

- Add optional per-enemy `lootSources` and per-combat
  `victoryLootSources` layers.
- Resolve enemy instance loot, combat loot, and encounter victory rewards in
  that order only after a complete victory.
- Move the Briar Knight's intrinsic material/Thorn drops into enemy data while
  keeping Thornbound Crossing's `antler_fragment` encounter-specific reward.
- Surface both new schemas and their loot-table references in the Content
  Editor, then validate and commit the two repositories.

### AI-assisted implementation

- Added an idempotent `CombatSystem.resolveVictoryLoot()` boundary shared by
  normal play, simulation, and replay. It resolves each defeated enemy
  instance once, then combat-level sources once, and stages all physical loot
  through the existing unsecured expedition fields.
- Added source provenance to loot results/debug events (`enemy`, `combat`, or
  `encounter`, with relevant IDs), while preserving unique-item eligibility,
  material capacity, and safe-return/failure behavior.
- Added `briar_knight_loot`, moved the Briar Knight's 75% uncommon-material,
  forest-material, and 30% Thorn rolls to its enemy definition, and removed
  only the duplicate Thorn/material outcomes from the dedicated encounter.
  The generic materials were judged intrinsic to the defeated knight; the
  crossing's antler remains an encounter reward.
- Added editor rows for enemy/combat loot sources, ordering and table-entry
  summaries, reverse references, validation for malformed/missing/invalid
  sources, and backward-compatible empty defaults.
- Added deterministic Briar, multi-enemy, defeat/flee, safe-return, and editor
  round-trip regressions. Updated the combat-equipment regression to recognize
  the new Briar enemy-loot ownership.

### Reported manual changes

- None beyond the requested structural loot migration. Existing unrelated
  working-tree edits were preserved and not included in the Grail commit.

### Verification and resulting prototype state

- Combat browser suite passes 43 assertions.
- Simulation suite passes 62 assertions; replay suite passes 15 assertions.
- The focused Content Editor loot-source round-trip/validation test passes.
- The full Content Editor suite runs 81 tests; its four remaining failures are
  unrelated stale expectations for current encounter layout/path counts from
  pre-existing workspace data. The loot-table count expectation was updated
  from 19 to 20 for the new Briar table, and the focused loot test passes.
- No combat balance, encounter weight/distance, item stats, or safe-return
  rules were rebalanced by this pass.

## 2026-08-26 - Cautious Old Forest Warden Readiness Fix

### Goal

Stop Cautious Old Forest progression from looping on shallow preparation runs
when the hidden village makes the 180-league Warden attempt physically viable.

### AI-assisted implementation

- Split progression readiness into reserve-free hard feasibility and preferred
  strategy safety. Hard projections use actual travel consumption, capacity,
  current provisions, hidden-village stock/price, gold, and reach-to-village
  cost; Cautious margin, encounter reserve, and uncertainty remain preferred
  safety signals.
- Allow a hard-feasible Warden objective to launch at its real 180-league
  target when only preferred safety is short. The single-expedition simulator
  temporarily suppresses only the optional emergency-return reserve for that
  explicitly authorized progression attempt; ordinary consumption and safe
  return/commit rules remain authoritative.
- Added blocker-specific readiness semantics and
  `canPreparationRunImproveReadiness`, so capacity limits, fixed village stock,
  and already-satisfied hard feasibility do not schedule futile supply loops.
- Preserved the readiness details in campaign decisions, expedition records,
  compact JSON, and campaign-level telemetry, including hard/preferred support,
  requirements, blocker, supply-run usefulness, and safety-shortfall attempt
  authorization.

### Verification and resulting prototype state

- Added three focused regressions for hard-feasible Cautious Warden launch,
  genuine hard shortfall classification, and futile preparation detection;
  the Old Forest planning suite now passes 36 assertions.
- Deterministic simulation, current-campaign progression, and replay suites
  pass (62, 5, and 15 assertions respectively).
- No combat, enemy, gear, recipe, encounter, milestone, provision capacity,
  shop, or expedition-cap balance values changed.

## 2026-08-26 - Druid-Favor Ingredient-Aware Simulator Pass

### Goal

Prevent Old Forest progression simulations from stalling while gathering the
Druid's mixed material/inventory recipe, without changing gameplay balance.

### AI-assisted implementation

- Replaced the generic Druid preparation decision with a shared
  `CraftingRules.quote()` analysis that reports exact missing items, materials,
  and gold shortfall. Preparation now names an authored acquisition source:
  hidden-village shop stock for honey/fresh herbs, or forest forage/loot for
  rare and medicinal herbs.
- Added hidden-village item purchasing through the existing economy rules and
  directed forage preparation toward the overgrown trail when that is the
  selected source. Invalid source plans now block with a specific reason
  instead of scheduling an unproductive loop.
- Protected the exact Druid recipe quantities from optional inn/camp cooking;
  surplus ingredients remain available for normal cooking. Once requirements
  are present, the existing town progression service crafts immediately and
  completes the favor/Heart awakening through the normal crafting path.
- Preserved and expanded full/compact/decision/per-expedition telemetry for
  Druid craftability, missing requirements, source plan, protection, and prep
  reason. Hidden-village ingredient purchases are included in item/economy
  telemetry.

### Verification and resulting prototype state

- Added regressions for honey-only acquisition, exact ingredient protection,
  immediate Druid completion and planner advance, no-source blocking, and
  compact telemetry preservation.
- Focused Old Forest campaign planning suite passes 33 assertions.
- No recipe ingredients/yields, encounter rewards/weights/distances, shop
  values, capacity, milestone, enemy, or expedition-cap balance values were
  changed.

## 2026-08-26 - Old Forest Simulator Correctness Pass

### Goal

Make the Old Forest campaign simulator able to represent a legitimate Warden
attempt and stop misreporting preparation runs as objective-floor failures,
without changing authored gameplay balance.

### AI-assisted implementation

- Made the Warden progression preparation prioritize and pack the owned
  `enchanted_verdant_heart` quest item, while retaining the normal six-slot
  limit and never inventing an item. This is Warden-specific because the
  Heart is an explicit `availableExpeditionItem` requirement at the altar.
- Replaced the duplicated Druid ingredient check with the shared
  `CraftingRules.quote()` result. The real recipe now correctly reads
  `rare_herbs` and `medicinal_herbs` from the Material Bag and `honey` and
  `fresh_herbs` from persistent inventory; town service continues to craft
  and consume the draught through `CraftingRules.craft()`.
- Split objective-floor telemetry into `objectiveDistanceFloorApplied` and
  `objectiveDistanceFloorViolated`. Supply and preparation runs can be below
  a future milestone without counting as violations; a violation is recorded
  only for an actual progression attempt whose executed distance stayed below
  its required floor. Compact and CSV exports preserve both fields.
- Kept 140 leagues as the canonical Thorn-Crowned Hart planner milestone;
  the authored 132-146 appearance band remains unchanged, so the encounter
  may technically appear before the planner's reliable milestone target.

### Verification and resulting prototype state

- Added deterministic regressions for Heart packing/altar/Warden startup,
  unsecured Flask and safe-return commit semantics, mixed Druid recipe
  ingredients, objective-floor telemetry, and Thorn-Crowned Hart distance
  interpretation.
- No encounter, enemy, recipe, provision, economy, healing, or expedition-cap
  balance values were changed.

## 2026-08-26 - Resupply-Aware Old Forest Readiness and Flask Default

### Goal

Make Old Forest progression readiness agree with the live hidden-village
resupply service, prevent shallow runs from counting as hard milestone
attempts, and make the Flask objective the new progression default without
removing Full Campaign mode.

### AI-assisted implementation

- Replaced the Camelot-only readiness assumption with a pure Old Forest
  projection for the known village at 95 leagues. The projection evaluates the
  reach-to-village segment, authored hidden-shop price and finite stock, player
  gold, capacity, current provisions, strategy reserve, and the post-resupply
  village-to-target plus return segments. It never mutates gold, provisions, or
  stock; the existing expedition location-stop purchase remains the only real
  purchase path.
- Allowed a progression target to remain a true attempt when the village makes
  the hard distance viable, and made post-preparation readiness use the same
  projection so equipment/healing mutations cannot create a false plan.
- Set `secure-wrath-shard` and `defeat-verdant-warden` minimum attempt floors
  to their actual mandatory encounter distances of 140 and 180. Lower-distance
  runs remain explicit preparation/supply runs.
- Made the supply-run food heuristic aware of a reachable, funded, stocked
  known village, preventing a simple low-provisions check from forcing shallow
  loops when mid-route refill can support the milestone.
- Added full, compact, CSV, decision, and per-expedition readiness telemetry
  for resupply location, distance, reach cost, projected provisions/purchase,
  projected gold and stock, post-resupply support, and target reachability.
- Changed new progression simulator sessions and the visible selector default
  to `old_forest_flask`; explicit `full_campaign` remains available and is
  preserved in exports/configuration.
- Added deterministic Old Forest tests covering 140/180 resupply viability,
  unavailable service fallback, hard milestone floors, and objective defaults.

### Verification and resulting prototype state

- `python tests/old_forest_campaign_planning_test.py` - passed 21 assertions.
- `python tests/progression_system_test.py` - passed 5 current-campaign
  progression assertions.
- `python tests/simulation_system_test.py` - passed 62 deterministic
  simulation assertions.
- `python tests/replay_system_test.py` - passed 15 replay assertions.
- `python tests/old_forest_progression_test.py` stops at its existing authored
  service fixture, which still expects the prior price `2` while the user's
  preserved `js/location-data.js` edit sets the service to `0.01`.
- `python tests/campaign_system_test.py` and the campaign replay suite remain
  stopped at their existing unrelated packing/camp-cooking fixtures.
- `git diff --check` passed. No provision capacity, drops, recipes, enemy
  stats, authored route milestone distances, village authored values, or
  combat balance were changed; the existing user edit to `js/location-data.js`
  remains unstaged.

## 2026-08-26 - Hidden Forest Village Simulator Resupply

### Goal

Make automated Old Forest campaigns use the hidden forest village's authored
provision service during an expedition, so Content Editor price and finite-stock
changes affect progression simulation without changing gameplay balance.

### AI-assisted implementation

- Added location-aware provision-shop resolution and a campaign service hook at
  the hidden-village location stop.
- Reused `EconomyRules.buyProvisions` for price, gold, integer quantity, and
  finite-stock validation, then transferred the purchased provisions through
  the active expedition's normal committed-provision path so safe settlement
  returns unused food correctly.
- Added milestone-aware targets using current distance, expected outbound and
  return travel, strategy reserve, carrying capacity, and available gold.
  Cautious runs use the larger authored safety reserve; aggressive runs use a
  smaller reserve; normal/random runs use the shared moderate policy.
- Preserved the campaign's shared shop-stock object across expeditions, and
  added full, CSV, compact, per-expedition, and campaign aggregate telemetry
  for purchase counts, quantities, gold, stock before/after, provision levels,
  reasons, and detailed location-service actions.
- Added `tests/hidden_village_provision_test.py`, including authored `0.01`
  price / `240` stock coverage, unavailable-service comparison, canonical
  purchase effects, and persistent finite-stock behavior.

### Verification and resulting prototype state

- `python tests/hidden_village_provision_test.py` - passed 3 hidden-village
  provision assertions.
- `python tests/simulation_system_test.py` - passed 62 deterministic
  simulation assertions.
- `python tests/progression_system_test.py` - passed 5 current-campaign
  progression assertions.
- `python tests/old_forest_progression_test.py` - passed 9 assertions.
- `python tests/old_forest_campaign_planning_test.py` - passed 15 assertions.
- The existing campaign/health suite remains stopped at its pre-existing
  bandage-packing fixture assertion, and the replay suites remain stopped at
  their existing wilderness-cooking / replay-UI fixture failures. The broader
  discovery and expedition-content suites likewise stop at their existing
  discovery-completion and Fountain Knight reward fixtures; the soak wrapper
  therefore stops when it reaches the same campaign fixture.
- `git diff --check` passed. No capacity, drops, recipes, distances, enemy
  values, or Warden balance values were changed; `Tools/` was unchanged.

## 2026-08-25 - Content Editor Starting State

### Goal

Make the player's new-campaign resources, materials, items, loadout, progress,
position, and companion selection editable without mixing those defaults into
Arthur's reusable character definition.

### AI-assisted implementation

- Promoted the authored portion of SaveSystem.createDefaultPlayerState() to
  the canonical STARTING_PLAYER_STATE source in js/storage.js; Arthur health,
  companion health, and injury snapshots remain derived at runtime.
- Added the Content Editor's singleton Starting State category with typed
  resource, item, material, ability, recipe, knowledge, companion, expedition,
  and location controls plus an advanced JSON escape hatch.
- Added source-aware validation for quantities, ownership/equipment
  relationships, packed contents, known references, and loadout/unlock
  relationships, preserving surgical writes, source hashes, and backups.

### Verification and resulting prototype state

- Added a Content Editor regression covering Starting State loading, validation,
  resource/material/item round-trip saving, source backup creation, and the
  editor surface.
- python -m py_compile Tools/ContentEditor/content_editor_core.py passed.
- Temporary-project Starting State save/load round trip passed.

## 2026-08-24 - Expedition Rest Timing and Camp Interruption

### Goal

Give Brief Rest and Camp Rest visible, time-based presentation while allowing the existing one-per-camp contextual event to interrupt a Camp Rest without changing rest costs, healing values, travel pacing, or simulation throughput.

### Human prompt and direction

The human developer supplied the Expedition Rest Timing / Camp Interruption guide and requested a Grail-only implementation, build-log update, verification, and local commit. The guide required reuse of the existing delayed-action loop, 1000 ms Brief Rest and 2000 ms Camp Rest tuning, deterministic event preparation with presentation-only interruption randomness, clean cancellation/token safety, and unchanged automated simulation/replay behavior.

Reported manual changes: None.

### AI-assisted implementation

- Extended the existing rest action state and elapsed-time update loop to cover Inn Rest, Brief Rest, and Camp Rest with unique tokens, context/expedition ownership, progress presentation, and stale-action cancellation.
- Added tunable `actionDurationMs` values to expedition tuning and rendered `Resting...` / `Resting at Camp...` progress without rerendering the scene each frame.
- Split camp rest preparation from commitment: the existing deterministic camp-event selection is consumed once at action start, while provisions, healing, injury recovery, and the rest log are committed only after an uninterrupted rest completes.
- Scheduled an already-prepared camp event at a presentation-only randomized 25%-85% point, stopping the progress and entering the existing CampRules/EncounterManager path without charging the interrupted rest or resuming it afterward.
- Locked incompatible expedition/camp controls, prevented duplicate actions, and cancelled pending work on navigation, reset, return, failure, debug context changes, and stale expedition ownership.
- Kept the immediate rules path used by simulation and replay, so automated runs do not wait for wall-clock presentation time.

### Verification and resulting prototype state

- `python tests/simulation_system_test.py` - passed 62 deterministic simulation assertions.
- `python tests/campaign_system_test.py` - passed 99 campaign/health/Inn assertions.
- Targeted local browser smoke - passed Brief Rest timing, Camp Rest timing, no-benefit-before-interruption, one-time camp-event interruption, post-event return to Camp, and second-rest completion checks.
- `git diff --check` passed; `Tools/` was unchanged.
- `python tests/location_system_test.py` still stops at the pre-existing village hotspot coordinate fixture mismatch before reaching later expedition assertions.

Brief Rest now visibly resolves after approximately one second. Camp Rest visibly resolves after approximately two seconds when uninterrupted, or yields once to its prepared camp event during the rest and can then be attempted again normally.

## 2026-08-24 - Reward Reveal Presentation Pass

### Goal

Make newly received items, materials, gold, recipes, and other discoveries feel like a brief authored moment while preserving the existing persistent reward cards and game flow.

### Human prompt and direction

The human developer requested the attached Reward Reveal Presentation guide be followed across encounter discoveries, combat rewards, travel-facing discoveries, and appropriate major return rewards. The pass was to remain presentation-only, avoid changing simulation or travel rendering, update this build log, and commit the finished game changes.

Reported manual changes: None.

### AI-assisted implementation

- Added a stable `#reward-reveal-host` presentation layer with a reusable queued reveal system and event-token deduplication.
- Added data-driven minor, normal, and major tiers from the existing reward category, rarity, quest, relic, recipe, and equipment metadata.
- Grouped minor quantities into compact non-blocking chips; normal and major rewards use centered framed medallions, subtle dimming, one-shot gold shimmer, concise labels, and restrained enter/hold/exit timing.
- Hooked newly appended authoritative rewards from encounter, dialogue, and combat completion paths, plus distance-tier return rewards, without replaying on rerender or changing loot amounts, RNG, inventory rules, simulation, or travel scene lifecycle.
- Added an accessibility announcement path, reduced-motion timing/style behavior, temporary interaction protection for normal/major reveals, and a future-ready `visualAssetId` field in the presentation model.
- Added the semantic `majorLoot` audio hook without adding an audio asset.
- Added focused browser coverage for the Glint in the Mud reveal, queue grouping/deduplication, major reveal treatment, locking, and cancellation.

### Verification and resulting prototype state

- `python tests/reward_reveal_system_test.py` — passed 10 assertions.
- `python tests/combat_system_test.py` — passed 37 Tier 1 assertions.
- `python tests/travel_stability_test.py` — passed.
- Production page startup through local HTTP — passed; no runtime exceptions reported by the focused reveal test.
- `asset_audio_system_test.py` and `location_system_test.py` stop at pre-existing workspace baseline assertions before reaching this pass: the former expects empty asset catalogs while authored assets are present, and the latter expects older village hotspot coordinates.

## 2026-08-23 - Companion 2 Back-Slot Travel Spacing

### Goal

Give the final travel companion slot a little more room behind the party while retaining the prior Arthur and Companion 1 travel positions.

### Human prompt and direction

The human developer confirmed the general companion spacing was better and requested only Companion 2, the back slot, move slightly farther back.

### AI-assisted implementation

- Added an additional normal-travel-only offset to the final companion slot, changing its effective horizontal translation from `-2rem` to `-5rem`.
- Left Arthur, Companion 1, encounter-authored layouts, combat formation offsets, and character scales unchanged.
- Added focused browser coverage confirming Companion 2 is farther back than Companion 1.

### Verification and resulting prototype state

The slot-specific travel spacing check is included with the existing travel-party regression; the debug suite continues to stop later on its unrelated character-sprite fixture assertion.

## 2026-08-23 - Travel Companion Spacing

### Goal

Give the two ordinary-travel companions more breathing room while keeping Arthur's travel anchor fixed and leaving authored encounter layouts unchanged.

### Human prompt and direction

The human developer requested a decent increase to both companion gaps in the travel scene, with Arthur remaining where he is.

### AI-assisted implementation

- Added a normal-travel-only `-1.25rem` horizontal translation to companion wrappers, moving both companions farther behind Arthur without changing the parent travel anchor.
- Excluded `.is-encounter-layout`, preserving authored encounter coordinates and editor-driven placement.
- Added focused browser coverage confirming both companions receive the offset while Arthur remains unshifted.

### Verification and resulting prototype state

The new travel spacing check passed in the debug browser suite. That suite then stopped on its existing unrelated character-sprite fixture assertion; no travel-spacing assertion failed.

## 2026-08-23 - Arthur Inward Tuning

### Goal

Finish the three-ally framing pass by moving only Arthur a little farther toward the battlefield center after the vertical composition was confirmed.

### Human prompt and direction

The human developer confirmed the top and bottom framing now read correctly and requested a small additional rightward adjustment for Arthur, with Kay and Llamrei left unchanged.

### AI-assisted implementation

- Increased only Arthur's three-ally horizontal combatant-anchor offset from `3rem` to `5rem`.
- Preserved the three-ally formation Y framing, density scale, top/bottom slot offsets, z-order, HUD anchors, character scales, and all enemy layouts.

### Verification and resulting prototype state

The focused combat regression remains the verification gate for the complete three-ally framing pass; no one-ally, two-ally, or enemy presentation rule was changed.

## 2026-08-23 - Three-Ally Combat Vertical Framing

### Goal

Reframe the compact three-ally combat party so its top HUD has reliable headroom and its bottom visual remains inside the battlefield, without changing density scale, enemy layout, or the established horizontal stagger.

### Human prompt and direction

The human developer clarified from the combat screenshot that Arthur needed a little more inward/right movement and a slight downward shift, the top ally needed to come down substantially, and the bottom ally needed to move upward modestly. The adjustment must work when either Sir Kay or Llamrei occupies the top slot.

### AI-assisted implementation

- Added a three-ally-only `0.6rem` downward formation translation, leaving one-ally, two-ally, and enemy formation anchors unchanged.
- Preserved the existing z-order and horizontal offsets while nudging Arthur farther inward and down, moving the top row down, and compensating the bottom row upward so the large visual stays framed.
- Kept the combat density multiplier, authored character scales, HUD markup, and enemy positioning untouched.
- Added browser coverage for both Sir Kay-top and Llamrei-top party orders, top HUD headroom, in-frame visual bounds, and retained stagger directions.

### Verification and resulting prototype state

The focused combat browser suite passed 37 Tier 1 assertions. Both three-ally orders keep the top HUD inside the combat scene, retain Arthur's inward position, keep the compact overlap, and keep all party visuals within the frame.

## 2026-08-23 - Three-Unit Combat Density Scale

### Goal

Give three-unit combat formations modest visual breathing room while preserving the latest staggered anchors, HUD sizing, character-level combat scales, and the existing one- and two-unit presentation.

### Human prompt and direction

The human developer requested an additional presentation-only density factor of `1.0` for one or two units and approximately `0.87` for three units on either side. The factor should reduce sprite visuals only, preserve Llamrei's relative size, and leave the existing Arthur/Kay/Llamrei offsets unchanged.

### AI-assisted implementation

- Added `combatFormationDensityScale()` to the existing combat visual scale pipeline and multiplied it after the current formation context normalization, before authored character visual and slot scales are applied.
- Kept the density factor off the combatant/HUD anchor, so names, HP/Faith/ATB bars, anchor offsets, and formation positions remain unchanged.
- Added focused coverage confirming one/two-unit density stays at `1`, three-unit density is `0.87`, per-character relative scale is preserved, and the existing three-unit stagger remains active.

### Verification and resulting prototype state

The focused combat browser suite passed 36 Tier 1 assertions. The three-unit party retains the inward Arthur and vertical Kay/Llamrei offsets while all three visual scale values receive the same density multiplier; one- and two-unit scale factors remain unchanged.

## 2026-08-23 - Compact Combat Formation Stagger

### Goal

Make the three-ally combat composition read as a compact inward stagger without changing combatant order, authored character scales, gameplay, or sprite normalization.

### Human prompt and direction

The human developer requested modest combatant-anchor offsets: Arthur inward/right, Sir Kay slightly down, and Llamrei slightly up. The HUD must follow each anchor. A mirrored middle-enemy stagger should apply only to three-humanoid formations; the existing three-wolf composition should remain unchanged.

### AI-assisted implementation

- Added presentation-only `translate` offsets to the existing three-ally combatant row rules, preserving their grid rows and z-order while moving the HUD and visual together through the combatant anchor.
- Added an explicit humanoid enemy whitelist and a three-humanoid formation class; only the middle enemy receives a modest inward offset, while wolves and other large-creature formations retain their current layout.
- Added focused browser coverage for the three-ally anchor offsets, HUD/visual alignment, wolf exclusion, and temporary three-humanoid enemy verification.

### Verification and resulting prototype state

The focused combat browser suite passed 35 Tier 1 assertions. The browser probe confirmed Arthur `25.6px` inward, Kay `-5.6px / +5.6px`, Llamrei `-5.6px / -5.6px`, aligned HUD/visual anchors, no humanoid class on wolves, and a `-12px` middle-only shift for three humanoid enemies. `git diff --check` passed after the implementation and documentation updates.

## 2026-08-23 - Encounter Layout Editor Visual Preview Pass

### Goal

Make encounter authoring show the same grounded Idle character composition used by the game, while keeping normalized ground-anchor coordinates and editor-only companion preview choices clear and safe.

### Human prompt and direction

The human developer supplied the Encounter Layout Editor Visual Preview guide and directed the pass toward actual Arthur/companion Idle sprites, editor-only preview companion selection, grounded placement, optional facing/scale/layer/visibility controls, runtime compatibility, and surgical authoring saves. Follow-up visual direction clarified that the existing `travelOffsetY` framing correction must apply to authored encounters as well as ordinary travel.

### AI-assisted implementation

- Replaced marker-only encounter layout controls in the Content Editor with cached-alpha Idle previews, visible ground anchors, drag-to-place normalized coordinates, editor-only Sir Kay/Llamrei preview selectors, facing, scale, layer, visibility, reset, and ground-align controls.
- Matched editor sprite metadata to the game’s anchored union canvas so multi-frame sheets stay bounded to the slot instead of expanding the yellow control behind the artwork; guarded unloaded images before alpha scanning.
- Matched the editor’s preview slot dimensions to the game’s `cqw` traveler wrapper and mirrored the preview immediately when an authored left-facing value is selected, while keeping the layout scale separate from each character’s base visual scale.
- Added encounter layout validation for optional facing/scale/layer fields and hidden slots, preserving partial visual overrides and existing save compatibility.
- Extended game encounter visual-state resolution to merge optional layout properties per slot, apply facing and authored scale/layer, use the ground anchor for placement, and retain each definition’s `travelOffsetY` in authored encounters.

### Verification and resulting prototype state

Focused Content Editor Python tests, compile checks, the focused encounter-layout browser regression, and both repositories’ `git diff --check` completed successfully. A direct game browser probe confirmed authored encounter wrapper coordinates, per-slot scale, and Llamrei’s 38% travel offset. The broader legacy location/debug suites still stop on unrelated existing fixture assertions (town hotspot coordinates and a character-sheet expectation); no encounter-layout assertion failed after the ground-anchor expectation was updated. The editor now presents bounded, grounded Idle previews with the yellow anchor remaining the authoritative placement point.

## 2026-08-23 - Party Presentation Adjustment

### Goal

Make the three-ally party read as Sir Kay/Companion 1, Arthur, Llamrei/Companion 2 in combat, keep Arthur centered without spreading the intentional overlap, modestly reduce Llamrei only in combat, and keep the travel party on one shared ground baseline.

### Human prompt and direction

The human developer requested a surgical presentation pass: preserve the Arthur-first gameplay/combatant order, current compact overlapping battlefield composition, authored slot scales, travel direction, and sprite normalization while correcting the three-ally visual rows and large-companion travel alignment.

### AI-assisted implementation

- Reassigned only the three-ally party grid rows in CSS, leaving the combat array and all combat rules unchanged: Sir Kay/Companion 1 above, Arthur in the middle, and Llamrei/Companion 2 below. The presentation layer is explicitly Kay behind Arthur behind Llamrei, so Arthur covers only the intended Kay overlap.
- Added generic `combatVisualScale` support with a `visualScale` fallback and authored Llamrei's modest combat-only reduction; travel scale and per-slot scale multiplication remain unchanged.
- Made travel wrapper bottom alignment explicit, widened only the normal-travel companion gap while keeping Arthur centered, and added the generic zero-default `travelOffsetY` presentation hook using Llamrei's source-framing correction without companion-index staggering or horse-specific CSS.

### Verification and resulting prototype state

Focused presentation probing confirmed the unchanged Arthur-first combat array, Kay/Arthur/Llamrei visual row order, retained overlap, shared travel wrapper bottom edge, and Llamrei's larger-but-reduced combat visual. Combat (34 assertions), deterministic simulation (62 assertions), campaign/health (99 assertions), production HTTP startup, and `git diff --check` passed. Existing unrelated Llamrei asset/data worktree changes were preserved and not included in this pass.

## 2026-08-23 - Encounter Seam Blocker Synchronization

### Goal

Prevent travel seam trees from floating across stationary characters during encounters while preserving normal loop-boundary presentation and pause/resume behavior.

### Human prompt and direction

The human developer requested a focused seam-blocker repair: keep normal travel motion unchanged, pause seam foregrounds with the base and parallax layers during ordinary encounters and manual pauses, remove all travel-only seam layers over dedicated encounter artwork, and recreate synchronized seam handling when travel resumes.

### AI-assisted implementation

- Added encounter-aware seam-layer synchronization that freezes ordinary travel seam animation at the current base-track time, removes orphaned carry layers, and explicitly keeps seam animation play state paused whenever the scene is paused or an encounter is active.
- Added dedicated-art cleanup for all seam foreground/carry layers, guarded transition carry creation during encounters, and resume-time re-evaluation through the existing current-track/active-tile path so normal seam flags and boundary behavior return without duplicate layers.

### Verification and resulting prototype state

Focused real-art browser coverage passed normal synchronized seam motion, ordinary Fallen Tree encounter pause/time hold, manual Pause/Resume synchronization, dedicated encounter artwork with no travel seam layers, and no duplicate carry layers. The production page loaded over local HTTP without runtime errors. Unrelated Llamrei assets/data changes were preserved and not staged. No Tools changes were added.

## 2026-08-23 - Character Sprite Stable Anchor Pass

### Goal

Keep characters planted while switching between differently sized union canvases, especially when an authored Attack sheet extends asymmetrically around the body anchor.

### Human prompt and direction

The human developer supplied the Stable Anchor guide: retain the union-canvas clipping repair, do not change authored scale or offsets, map one internal character/ground anchor to the same combat/world anchor for Idle, Walk, and Attack, preserve mirrored enemy behavior, and verify combat and travel transitions.

### AI-assisted implementation

- Stored the logical anchor coordinates inside each union canvas as metadata and exposed their normalized positions through CSS custom properties.
- Repositioned the shared sprite canvas from its internal anchor rather than centering its outer rectangle or attaching its bottom edge. Percentage-based transforms account for responsive rendered CSS scale and work for mirrored enemies without an Attack-specific compensation.

### Verification and resulting prototype state

Focused browser coverage passed Arthur, Sir Kay, and mirrored Bandit Idle → Attack → Idle: feet/world anchors and HUD geometry stayed stable, union canvases remained intact, and authored Attack motion remained visible. Walk ↔ Idle travel coverage passed with stable anchors and no fallback flash. Deterministic simulation (62 assertions), campaign/health (99 assertions), and `git diff --check` passed. Unrelated Llamrei asset/data worktree changes were preserved and not staged. No Tools changes were added.

## 2026-08-23 - Combat Sprite Canvas and Return Travel Stability Repair

### Goal

Repair attack-sheet clipping and make the outbound-to-returning travel presentation rebuild from one coherent visual track without changing gameplay state or authored presentation data.

### Human prompt and direction

The human developer supplied the focused Combat Sprite Canvas + Return Travel Stability guide: union all anchored attack-frame extents into each sprite canvas, preserve existing scale/normalization/layout and mirroring, and clear stale return transitions, tiles, parallax, seam carry, and snapshots before rebuilding the correct scene at the current distance.

### AI-assisted implementation

- Changed cached sprite metadata to calculate anchored union bounds across every frame, include authored offsets in those bounds, store origin compensation, and draw each cropped frame relative to the compensated union origin. The existing asset cache, frame counts, FPS, normalization, scale, and layout APIs remain intact.
- Added a dedicated direction-change visual reset that preserves only the expedition distance, cancels stale transition/preload state, removes all old tracks and transient seam/parallax layers, clears the outbound visual snapshot, and creates exactly one current returning track. A loaded current image is reused to avoid a blank reset frame; normal preload and loop/parallax setup continue through the existing renderer.

### Verification and resulting prototype state

Focused browser probes passed for Arthur, Sir Kay, and Bandit attack assets: every authored frame rendered into its union canvas with no fallback or clipping. A corrupted return-state probe passed the one-current-track/no-next/no-fading/no-carry invariant, correct returning asset/direction, valid loop/parallax/seam setup, and unchanged distance/health/provisions. Production HTTP startup, deterministic simulation (62 assertions), and campaign/health (99 assertions) passed. The broader location and debug suites still stop at existing stale fixture assertions for newer Hall/character data before reaching this change. `git diff --check` passed. No manual changes or Tools changes were added.

## 2026-08-23 - Expedition Departure Title Presentation

### Goal

Turn the deliberate first-load pause into a polished expedition departure card while giving the initial Idle and Walk animations a clean, intentional handoff into travel.

### Human prompt and direction

The human developer supplied the Expedition Departure Banner guide: preserve the existing cold-cache scene and character readiness gates, show the fully loaded party in actively animating Idle during a roughly two-second title card, keep distance/provisions/background motion and encounter processing paused, then transition once to normal traveling and Walk. The departure presentation must be normal-player-start-only, data-driven, replay/simulation-safe, accessible, and free of dialogue or new graphic assets.

### AI-assisted implementation

- Added a presentation-only `departure` state to the normal UI start path. It keeps the existing expedition scene paused, prevents travel rules from advancing distance, provisions, injuries, or encounters, and switches to `traveling` exactly once through an expedition-instance-guarded timer.
- Preloaded selected-party Idle visuals alongside the existing Walk, base-scene, and parallax readiness gates. The first visible scene explicitly renders active Idle sprites, then performs the existing cache-backed Idle -> Walk transition without changing authored frame counts, FPS, scale, normalization, offsets, or layout.
- Added optional expedition `regionTitle` metadata and a responsive HTML/CSS title card with an uppercase route title, muted-gold region subtitle, translucent Arthurian backing, pointer-event isolation, reduced-motion handling, and safe cancellation when navigation/reset/debug changes the active screen.

### Verification and resulting prototype state

The focused browser smoke passed the visible banner, active Idle animation, unchanged distance/provisions/background during departure, one-time Idle -> Walk/travel start, and later Pause -> Idle / Resume -> Walk flow. Combat (34 assertions), deterministic simulation (62 assertions), and campaign/health (99 assertions) passed. `git diff --check` passed. No dialogue, graphic asset, replay-data, or Tools changes were added; unrelated existing combat/data worktree changes were preserved.

## 2026-08-23 - First-Load Travel Scene Readiness and Walk Activation

### Goal

Remove first-render travel/encounter scene popping and the initial frozen Walk pose while preserving the existing cached sprite and scene presentation systems.

### Human prompt and direction

The human developer supplied the first-load travel/encounter scene visual-popping guide and requested a focused cleanup: hold Preparation until the initial base travel scene, parallax, and selected-party Walk visuals are ready; keep old scene art during later scene loads; and ensure the first visible expedition frame already has a running Walk animation instance without changing FPS, frame counts, scale, normalization, layout, or gameplay timing.

### AI-assisted implementation

- Extended the existing `travelScenePreloadCache` entries with load/decode readiness and failure state, then gated initial expedition entry on the initial base/parallax scene assets alongside the selected party's Walk preload.
- Kept the current scene until a later travel or dedicated encounter background is decoded, switching base and parallax presentation atomically and retaining the prior scene on base-art failure. Unready tracks remain hidden instead of exposing procedural fallback or parallax-first flashes.
- Preserved the immediate character activation path (`startedAt`, instance registration, frame-zero draw, and scheduler call) and cleared only a stale pending marker when a completed cached image had no live instance, preventing cached Walk activation from being suppressed.

### Verification and resulting prototype state

Cold-cache initial-entry and dedicated-encounter browser smokes passed: Preparation remained visible until the initial scene art was ready, the expedition appeared with no fallback flash, Arthur/Kay Walk instances were active immediately, and frames advanced shortly after display. The focused combat (34 assertions), deterministic simulation (62 assertions), and campaign/health (99 assertions) suites passed. The debug suite remains stopped at its stale character metadata fixture assertion, and the broader location suite remains stopped at its existing Hall hotspot fixture mismatch before expedition coverage. `git diff --check` passed. No Tools changes or manual changes were reported.

## 2026-08-23 - Initial Expedition Walk Preload

### Goal

Remove the remaining knight/rook placeholder flash when an expedition first opens, while keeping the existing transition cache and all authored character presentation unchanged.

### Human prompt and direction

The human developer supplied the initial expedition character placeholder guide: await only the selected party's Walk image, metadata, alpha bounds, and normalization before showing the expedition; tolerate failed optional art; guard repeated Start Expedition clicks; keep the Preparation screen visible during a short load; preserve background preloads and direct-entry fallback behavior; and do not alter sprite sizing, FPS, layout, combat, or gameplay timing.

### AI-assisted implementation

- Made the normal Start Expedition path await Arthur and each selected companion's `preloadCharacterVisualSlot(..., "walk")` with `Promise.allSettled`, so the first travel render can use the already prepared Walk cache.
- Added a pending-start guard and subtle `Preparing...` button state, created the expedition exactly once, saved the committed player state before awaiting art, retained the existing broader Idle/Attack preload, and prevented a late async completion from overriding an alternate debug/test path.
- Left the transition-cache renderer, direct `renderExpedition()` fallback behavior, authored metadata, scale, normalization, layout, animation, combat, and gameplay systems unchanged.

### Verification and resulting prototype state

The focused initial-entry browser smoke passed cold-start-style deferred Walk loading, duplicate-start protection, ready Arthur/Kay Walk canvases, and hidden fallbacks. Combat (34 assertions), deterministic simulation (62 assertions), campaign/health (99 assertions), and `git diff --check` passed. The broader location suite remains stopped at its pre-existing Hall hotspot fixture mismatch before reaching expedition-start coverage. No Tools changes or manual changes were reported.

## 2026-08-23 - Character Sprite Transition Cache / No-Pop Pass

### Goal

Eliminate visible sprite flashes during Walk ↔ Idle and Idle ↔ Attack transitions without changing authored presentation, combat choreography, layout, normalization, or gameplay.

### Human prompt and direction

The human developer supplied the Character Sprite Transition Cache / No-Pop guide: retain the current valid canvas during slot changes; share decoded images by asset ID; preload relevant party and combat slots plus metadata; keep the hidden source image out of transition ownership; preserve callback/version, mirror, scale, frame, FPS, offset, and normalization behavior; and verify repeated transitions under normal and throttled conditions.

### AI-assisted implementation

- Added a shared asset-ID image cache that reuses one decoded `Image` and one metadata/normalization path for authored Idle, Walk, and Attack slots. Relevant party visuals begin preloading at expedition start/render, and combat party/enemy visuals begin preloading when combat is created.
- Refactored state changes to keep the same `.character-sprite` and canvas mounted. The prior valid frame remains ready while the requested cached image resolves; the new image draws frame 0 before the transition is considered active. Failed optional transitions retain valid prior art and only use fallback on initial/final asset failure.
- Preserved Combat Presentation Pass 1 callbacks, impact timing, action version safety, authored scale/normalization, mirroring, offsets, frame counts, FPS, travel/combat layout, and gameplay systems.

### Verification and resulting prototype state

Normal cache/no-pop browser smoke, cached combat presentation smoke, and throttled uncached transition smoke passed with no console errors. Combat (34 assertions), deterministic simulation (62 assertions), campaign/health (99 assertions), and `git diff --check` passed. No GrailTools changes were needed; no authored data values were changed.

## 2026-08-23 - Combat Presentation Pass 1

### Goal

Separate resolved combat simulation from authored attack presentation so attacks read as Idle → Attack → impact → Idle without changing combat timing, damage, targeting, AI, RNG, or ATB behavior.

### Human prompt and direction

The human developer supplied the Combat Presentation Pass 1 guide: use the existing sprite renderer for Arthur, Sir Kay, and Bandit attacks; honor authored frame-count/FPS completion and an optional impact frame; serialize lightweight presentation actions; keep target hit reaction and visible HP at impact; preserve mirroring, normalization, layout, and missing-art Idle fallback; add the editor field and commit only focused changes.

### AI-assisted implementation

- Extended the existing character sprite state API with optional impact-frame metadata, exactly-once impact/completion callbacks, and version-safe action callbacks. Combat attack scale now uses the authored attack-to-Idle ratio while the existing normalized combat layout is locked to the Idle anchor, preventing attack-sheet bounds from moving HUDs or feet.
- Added a per-combat presentation queue keyed by resolved action events. Attack sprites run asynchronously through the existing renderer; characters without attack art advance immediately. Impact dispatches a generic `combat-presentation-impact` event, applies the existing target hit reaction, and reveals the already-resolved HP at the authored frame. Final combat teardown waits for queued presentation completion.
- Added GrailTools Attack Impact frame editing and validation, with a default of about 60% of the authored frame count when omitted. No CombatSystem simulation code, sprite slicing, travel formation, or gameplay timing was changed.

### Verification and resulting prototype state

The focused browser presentation smoke, Tier 1 combat suite (34 assertions), deterministic simulation suite (62 assertions), campaign/health suite (99 assertions), and focused GrailTools Impact-frame tests passed. The full Tools suite ran 114 tests with two pre-existing encounter-layout fixture failures; those expected `arthur` normalized slot values differ from the current fixture and are unrelated to this pass. The temporary browser harness was removed, and no manual changes were reported.

## 2026-08-23 - Character Pass 2.9 Runtime Fixes

### Goal

Keep ordinary encounter travelers in the normal visible travel formation and trigger the authored attack sprite slots during resolved combat actions without changing combat gameplay or sprite sizing.

### Human prompt and direction

The human developer supplied the Character Pass 2.9 fix guide: preserve ordinary travel formation and Idle presentation unless an encounter or visual override explicitly authors a layout slot; wire Arthur, Sir Kay, and Bandit attack assets through the existing renderer; use frame-count/FPS completion and rapid-action safety; preserve enemy mirroring, normalization, layout, and all combat timing; update only the Grail repository and commit the focused result.

### AI-assisted implementation

- Changed encounter layout activation to require an explicitly authored base or visual-override slot, while keeping live ordinary encounter positions and explicit hidden slots data-driven.
- Extended the existing character sprite state API with frame-completion callbacks and action version tokens, then added Arthur/Sir Kay basic attack and Bandit `bandit_slash` transitions without a combat rerender for animation.
- Kept missing attack assets on Idle and left combat HUD, HP, ATB, targeting, damage, RNG, AI, timing, mirroring, normalization, and layout behavior unchanged.

### Verification and resulting prototype state

Combat and simulation suites passed. A focused browser smoke check passed ordinary/authored layout behavior, hidden-slot handling, Arthur and Bandit attack playback, and missing-attack Idle fallback with no console errors. The existing debug suite still stops at its pre-existing stale character metadata assertion, and the broader location suite still stops at its documented Hall hotspot fixture mismatch. No manual changes were reported.

## 2026-08-22 - Character Pass 2.7 Combat HUD and Travel Party Continuity

### Goal

Finish the presentation pass by giving combat HUDs readable independent width and a shared character anchor, preserving ordinary encounter positions, and making travel party order lead correctly in both directions.

### Human prompt and direction

The human developer supplied the Character Pass 2.7 guide: preserve the Pass 2.6 sprite/layout systems and combat size, avoid scene enlargement or renderer redesign, prevent normal names such as Wild Boar from truncating, keep HUDs centered over small and large characters, inherit live travel positions for encounters without authored layout, honor authored layout when present, and keep Arthur as the directional leader.

### AI-assisted implementation

- Reworked each combatant into one centered HUD → visual → status stack. HUD width is now independent of sprite width, normal names fit within the portrait viewport, and the actual visual remains centered on the same anchor.
- Moved both combat formations modestly inward while preserving the central battlefield and current character sizing.
- Added transient live travel-party position capture when entering an encounter. Ordinary encounters use those positions; authored encounter or visual-override layouts still take precedence. The snapshot is cleared when travel resumes.
- Made the travel party use deterministic leader-first ordering with direction-aware row reversal and the existing return-facing mirror. Selected companion order remains data-driven.
- Added regression checks for wide Wild Boar HUD readability/centering, ordinary encounter position inheritance, and outbound/return party ordering.

### Verification and resulting prototype state

The Grail debug browser suite passed 36 assertions. `git diff --check` passed. The broader location suite remains blocked at its pre-existing Hall hotspot fixture mismatch before reaching later combat checks. Focused GrailTools tests were not changed by this runtime-only pass. No sprite assets, normalization, authored encounter layouts, gameplay, attack animation, VFX, damage numbers, or combat sound were changed.

## 2026-08-22 - Character Pass 2.6 Combat Layout and Travel Scale Correction

### Goal

Remove the remaining travel Idle scale exception and make combat HUD placement follow the real character visual layout without changing sprite slicing, normalization, assets, or the existing battlefield ratios.

### Human prompt and direction

The human developer supplied the Character Pass 2.6 guide after the prior presentation pass: Walk and Idle must use the same travel scale, combat sizing must affect DOM layout instead of permanent sprite transforms, Faith and ATB must be visually separated, and the current readable combat target must be preserved.

### AI-assisted implementation

- Removed the hardcoded travel Idle `0.82` context scale. Walk and Idle now use the same context scale and retain the existing frame-cell/bottom anchor path.
- Added combat layout synchronization from the rendered sprite root to its `.combat-unit-visual`. Formation presentation scale, definition visual scale, slot scale, and asynchronous slot normalization now enlarge the real visual region; combat sprite roots remain at identity scale except for mirroring.
- Changed combatants to normal HUD → visual → status rows so the HUD is positioned from the actual reserved character area. The two-unit presentation remains in the unchanged `1.2` scene ratio, with modestly reduced two-unit density to keep Arthur, Kay, their HUDs, and full bodies separated.
- Restacked Faith as a readable heading/value plus blue bar, increased the resource bar thickness, and added separation before the thinner action gauge. Enemy HUDs continue to omit the resource row.
- Updated the browser regression checks for equal Walk/Idle travel scale, identity combat sprite transforms, real combat visual layout, full-body bounds, HUD placement, two-unit ratio, fallback separation, and continuing Idle animation.

### Verification and resulting prototype state

The Grail debug browser suite passed 33 assertions. `git diff --check` passed. The broader location suite was attempted and still stops at its existing Hall hotspot fixture mismatch before reaching combat checks. No sprite assets, frame counts, columns, FPS, alpha bounds, frame-cell anchors, battlefield aspect ratios, gameplay, attack FX, or combat sound were changed.

## 2026-08-22 - Character Pass 2.5 Combat Readability and Pause Anchor Lock

### Goal

Increase combat readability without changing authored travel/encounter scale, and stop the Walk-to-Idle pause transition from moving Arthur's rendered feet or world anchor.

### Human prompt and direction

The human developer supplied the focused Character Pass 2.5 guide: preserve normalization and the current two-unit battlefield size, add a combat-only character/HUD presentation scale, verify one-, two-, and three-unit formations, and lock/reuse the existing traveler element during pause/resume state changes.

### AI-assisted implementation

- Added explicit combat context scale metadata separate from `visualScale` and slot scale: 1.8 for one-unit formations, 1.6 for two-unit formations, and 1.35 for three-unit formations. Travel, pause, encounter, and authored scale values remain unchanged.
- Increased combat-only name, HP, Faith, intent, resource, HP-bar, and action-gauge readability without changing the battlefield aspect ratios.
- Anchored the sprite canvas absolutely to the bottom-center of its existing traveler/unit root. Walk and Idle sheets retain their current authored sizes while no longer extending from different top/bottom positions when their aspect ratios change.
- Kept pause/resume on the existing live travel scene and added a browser regression check for the outer traveler left/bottom/size across Walk → Idle → Walk. Two-unit party anchors were adjusted to 28% / 72% to give the larger bodies room in the unchanged battlefield.

### Verification and resulting prototype state

The Grail debug browser suite passed 33 assertions, including the outer traveler anchor lock, rendered Walk/Idle/Walk feet position, solo Arthur combat scale, two-ally full-body separation, readable HUD/gauge bounds, unchanged 1.2 two-unit scene ratio, and continuing Idle animation. Python source parsing and `git diff --check` passed. The broader location suite was attempted but stopped on its existing Hall hotspot fixture mismatch before reaching combat checks. No sprite assets, normalization values, travel/encounter scales, attack FX, or combat sound were changed.

## 2026-08-22 - Character Pass 2.4 Correction: Frame Anchors and Combat Clipping

### Goal

Correct the remaining Character Pass 2 regressions without changing the established character scale, frame counts, columns, or automatic height normalization.

### AI-assisted implementation

- Narrowed combat text truncation selectors so `.combatant span` no longer applies `overflow: hidden` to the animated `.character-sprite` root. Combat sprite roots and canvases explicitly remain visible.
- Restored the two-ally combat scene aspect ratio to `1.2` in the base, narrow-width, and container rules. The real-character two-unit visual dimensions remain unchanged.
- Extended sprite metadata with integer frame-cell bounds, opaque bounds, per-frame opaque offsets, a common frame-cell anchor, and a stable bottom gap. Alpha-cropped frames are now drawn at their authored frame-cell position instead of being independently recentered.
- Reset Arthur's temporary Idle/Walk offset guesses to zero. Optional normalized `offsetX` / `offsetY` controls remain available in the game data and GrailTools preview for measured fine tuning.

### Verification and resulting prototype state

The Grail debug browser suite passed 32 assertions, including rendered Walk/Idle/Walk anchor checks, solo Arthur combat pixel-bound checks, two-ally full-body pixel-bound checks, visible HUD/gauge bounds, 1.2 battlefield ratio, Kay separation, and continuing Idle animation. Focused GrailTools character-visual tests, Python source parsing, and `git diff --check` were also run. No sprite assets, scale values, frame counts, columns, combat FX, or combat sound were changed.

## 2026-08-22 - Character Pass 2.4 Presentation Offsets and Two-Ally Fit

### Goal

Correct the remaining Character Pass 2 travel position shift and two-ally combat clipping without redesigning the sprite renderer or changing the established travel scale.

### Human prompt and direction

The human developer requested optional authored Idle/Walk/Attack presentation offsets, matching GrailTools controls and Scale Comparison preview updates, stable feet/body anchoring, removal of the icon-sized two-ally combat visual override, complete Arthur combat-body visibility, preserved 34% / 66% ally placement, and verification of the Arthur + Sir Kay encounter.

### AI-assisted implementation

- Added optional signed `offsetX` and `offsetY` values to the shared character visual configuration. Values use normalized canvas pixels, default to zero, and are applied after shared frame normalization before final canvas draw positioning.
- Added Idle, Walk, and Attack Offset X / Offset Y controls to GrailTools, including live preview synchronization and Scale Comparison rendering, plus validation and round-trip coverage.
- Authored Arthur's small per-sheet horizontal corrections (`idle: 3`, `walk: 4`) with zero vertical offset; scale and normalization behavior remain unchanged.
- Replaced the two-ally `1.8–2.7rem` square visual rule with a modest real character-sized area and increased only the two-unit battlefield height enough to keep the complete HUD, character, and gauge bounds separated at the existing 34% / 66% anchors.

### Manual changes

The human developer supplied the focused Character Pass 2 presentation-fix guide and authorized updating and committing both repositories. No sprite assets were reimported, no attack FX or sound was added, and no combat mechanics or travel scale tuning was changed.

### Verification and resulting prototype state

Focused Content Editor offset validation and metadata round-trip tests passed. The Grail debug browser suite passed 30 assertions, including Arthur offset metadata, Idle/Walk state switching, Arthur combat Idle animation continuity, full-body two-ally bounds, and the authored battlefield. Python source parsing and `git diff --check` were also verified. Arthur now keeps a stable authored travel anchor when switching Walk and Idle, while Arthur + Sir Kay retain readable, non-overlapping full-body combat units.

## 2026-08-22 - Authored Combat Battlefield Background Support

### Goal

Let combat use authored static battlefield scenes while preserving the existing combat mechanics, unit HUD, travel renderer, and generic gradient fallback.

### Human prompt and direction

The human developer requested optional `combatVisualAssetId` fields on expeditions and encounter definitions, encounter override priority over expedition defaults, static 16:9 rendering in `.combat-scene`, graceful image failure fallback, and matching GrailTools editor support. Battlefield art was to remain separate from transparent combat cutouts, with no standalone path database or combat-mechanics changes.

### AI-assisted implementation

- Added the encounter override → expedition default → gradient resolver used by `renderCombat()`. Authored assets are validated as `combat_scene` images, and failed image loads remove the authored layer so the existing CSS gradient remains visible.
- Rendered static battlefield artwork as an object-fit-cover image beneath the formations and HUD, with a restrained dark edge overlay and open center for future FX.
- Added the `combat_scene` asset category and Scene 16:9 import mapping in GrailTools. Expedition and encounter editors now expose Default Combat Background / Combat Background Override selectors with Upload New support and explanatory copy.
- Extended editor reference/category validation and regression coverage. Null or absent fields remain valid; deleted or incompatible assets are rejected by the existing reference validation.
- Preserved the authored Old Forest Road battlefield asset `combat_scene_old_forest_road_combat` and its expedition default once it appeared in the shared workspace; no travel image was reused as a combat background.

### Manual changes

The human developer supplied the combat-background direction, requested both repositories be updated, and provided the authored Old Forest Road battlefield asset during the pass. The final two-unit formation spacing was tuned to 38% / 62% after an additional visual check.

### Verification and resulting prototype state

Focused editor tests passed for selector rendering, compatible `combat_scene` references, null references, and incompatible travel-art references. The full Content Editor suite was attempted but exceeded the 120-second test limit and reported an unrelated pre-existing `abandoned_camp` encounter-layout fixture mismatch. Node.js is not installed in the environment, so JavaScript syntax was checked by source review and the game asset was verified as a 1280×720 WebP. `git diff --check` passed.

## 2026-08-22 - Combat Formation and Background Resolver Pass

### Goal

Refine the combat formation spacing and establish a data-driven static battlefield background path before Combat Pass 2 attack effects.

### Human prompt and direction

The human developer requested centered one-unit formations, two-unit formations around 35% and 65% of the battlefield, preserved one-to-three support, and a background priority of encounter override, path/distance, path default, expedition default, then the existing gradient fallback. Combat logic, HUD structure, scrolling travel presentation, and attack FX were unchanged. Debug tools were also required to reflect the new resolver.

### AI-assisted implementation

- Positioned two-unit formations directly at 35% and 65% using the existing formation containers; one-unit and three-unit layouts remain centered and top/middle/bottom respectively.
- Added `COMBAT_BACKGROUND_PATH_DEFINITIONS` for static path/distance bands and a resolver that validates authored assets before falling through the requested priority chain.
- Added a non-scrolling combat background layer with dark edge treatment and an open center for future FX, while retaining the generic gradient when no authored background is available.
- Updated the debug combat panel to report the resolved background source and asset and refresh that readout with live state changes.

### Manual changes

The human developer supplied the formation/background direction, requested debug-tool coverage, and required local add/commit operations. No separate manual source changes were reported.

### Verification and resulting prototype state

Focused local-HTTP Chrome checks verified 1/2/3-unit formation placement, 35%/65% two-unit centers, static background rendering, 0/20/50 distance bands, encounter override priority, gradient fallback, no center obstruction, and no horizontal overflow at portrait widths. Combat passed 34 assertions, deterministic simulation passed 62 assertions, campaign/health/Inn passed 99 assertions, debug tools passed, and `git diff --check` passed. No combat mechanics or scrolling travel scenes were changed.

## 2026-08-22 - Combat Unit Spacing Cleanup

### Goal

Give the refined combat units a little more readable breathing room and separate each action gauge from its ground shadow without changing combat behavior.

### Human prompt and direction

The human developer reported that the centered combat HUD had become too compressed and that the action bar visually overlapped the unit shadow. The existing unit-based presentation, palette, mobile layout, and combat mechanics were to remain intact.

### AI-assisted implementation

- Added small scoped spacing between enemy intent, name/HP, Faith, and the attached bars while keeping each HUD centered around its visual.
- Moved the ATB/action gauge down from the visual shadow and added a clear compact-width formation adjustment only for dense three-row layouts.
- Preserved the normal 16:9 combat scene for ordinary formations and kept all targeting, state, and simulation behavior unchanged.

### Manual changes

The human developer supplied the visual feedback and requested local add/commit operations. No separate manual source changes were reported.

### Verification and resulting prototype state

Focused local-HTTP Chrome checks passed at 320px, 360px, 390px, and 500px portrait widths for ordinary and three-row formations: no overlap, clipping, horizontal overflow, or gauge/shadow collision. Deterministic simulation passed 62 assertions, campaign/health/Inn passed 99 assertions, combat passed 34 assertions, and `git diff --check` passed.

## 2026-08-22 - Combat Pass 1.5 Battlefield Refinement

### Goal

Refine the new unit-based combat battlefield before attack presentation work, keeping formation architecture, targeting, combat mechanics, lower action UI, simulation, and replay behavior unchanged.

### Human prompt and direction

The human developer requested free-standing, art-ready combat visuals; larger and more dominant unit presentation; compact differentiated HP, ATB, and Faith information; removal of the center ornament and global Faith/target badge treatment; clearer active and selected states; and a restrained hit reaction. Pass 2 attack effects, damage numbers, lunges, SFX, and other combat spectacle were explicitly deferred.

### AI-assisted implementation

- Removed circular character frames and the center battlefield ornament, leaving each unit as a free-standing visual with a subtle ground shadow and room for future transparent art assets.
- Tightened each unit HUD into a centered compact column around its visual, keeping names, HP, enemy intent, resource details, and gauges from stretching across the battlefield. Three-row formations now fit cleanly at 320px portrait width.
- Differentiated substantial red HP bars, thinner gold ATB bars, and the smaller Arthur-only Faith resource display; removed the global Faith summary while retaining selected-target and target-prompt context in the header.
- Added restrained gold target/active emphasis and a reliable short red hit flash/nudge driven by transient presentation state only; no damage resolution or combat state rules changed.

### Manual changes

The human developer supplied the refinement guide, the follow-up centered-HUD direction, and required local add/commit operations. No separate manual source changes were reported.

### Verification and resulting prototype state

Focused local-HTTP Chrome checks passed at 320px, 360px, 390px, and 500px portrait widths for compact one-to-three-unit formations, including a 3v3 layout and long-name ellipsis without page overflow. The checks confirmed centered HUD bounds, Arthur-only Faith, no global Faith summary, no old TARGET badge, no unit overlap or clipping, target/active presentation, and attached enemy intent. Tier 1 combat passed 34 assertions, deterministic simulation passed 62 assertions, campaign/health/Inn passed 99 assertions, and `git diff --check` passed. No combat mechanics or simulation files were changed.

## 2026-08-22 - Combat Pass 1 Battlefield and Combatant Presentation

### Goal

Rebuild the combat battlefield presentation around readable ally and enemy units while preserving all combat mechanics, targeting behavior, lower action UI, combat rules, simulation, and replay behavior.

### Human prompt and direction

The human developer requested a foundation pass that replaces the current nameplate columns with deterministic one-to-three combatant formations, makes the character visual primary, attaches compact HP/intent/status/ATB information to each unit, clarifies target and active states, and fixes combat-facing separator encoding. Slash effects, damage numbers, attack presentation, weapon-specific visuals, SFX, screen shake, and lower action UI redesign were explicitly deferred.

### AI-assisted implementation

- Replaced the combat scene's party/enemy columns with three-slot ally and enemy formation areas supporting centered one-unit layouts, upper/lower two-unit layouts, and top/middle/bottom three-unit layouts.
- Rebuilt each combatant as a visual unit with an art-ready visual container, attached name/HP/HP-bar HUD, enemy intent, ATB gauge, and compact status line. Reused the travel marker language for Arthur, humanoid companions, and mounts when no combat visual asset exists.
- Moved target emphasis from the old TARGET badge/nameplate treatment to unit visual rings, gold selection accents, hover/focus states, and distinct active-unit glow without changing target resolution.
- Kept the combat log and lower action/submenu UI functionally unchanged, removed obsolete nameplate/token CSS, and normalized combat-facing separators and item quantity markup.

### Manual changes

The human developer supplied the combat presentation direction and required local add/commit operations. No separate manual source changes were reported.

### Verification and resulting prototype state

Focused local-HTTP Chrome checks passed for Wild Boar, Bandit Ambush, and Wolves across 1–3 allies and 1–3 enemies at 320px, 360px, and 768px widths. The checks confirmed no unit overlap, clipping, or horizontal overflow; attached enemy intent; target switching; ally-target mode; active and defeated states; ability and item submenus; no old TARGET badge; and no runtime console errors. Tier 1 combat passed 34 assertions, deterministic simulation passed 62 assertions, campaign/health/Inn passed 99 assertions, and `git diff --check` passed. No combat mechanics or simulation files were changed.

## 2026-08-22 - Expedition Travel, Encounter, Camp, and Return UX Pass

### Goal

Give the active expedition flow a clearer mobile-first HUD and hierarchy across outbound travel, paused travel, camp, encounters, returning travel, and the final report without changing expedition rules, outcomes, inventories, simulation, or combat behavior.

### Human prompt and direction

The human developer requested a restrained visual/UX pass for travel and encounters: a six-stat travel/return HUD, contextual camp/encounter stats, clearer paused controls, stronger choice-state differentiation, more deliberate camp details, and a return report that promotes reward tiers and highlighted discoveries. Existing artwork, scrolling, portrait responsiveness, and the current combat presentation were to be preserved.

### AI-assisted implementation

- Reworked the shared expedition resource renderer into an exact six-stat 3x2 layout ordered Distance, Unsecured Loot, Provisions, Material Bag, Health, and Faith; removed Max reached from the primary HUD while retaining turnaround/farthest detail where useful.
- Added a contextual four-stat subset for Camp and Encounter panels, with distance and unsecured loot available in Camp Expedition Details rather than competing with camp actions.
- Removed the duplicate paused pace/ration summary and gave paused travel its own cohesive editable control panel with Brief Rest and Make Camp actions.
- Added restrained encounter choice tones for ordinary, dangerous, and item/equipment/knowledge-specific choices without changing availability or outcome resolution.
- Promoted return rewards before the ordinary expedition haul and placed highlighted discoveries before routine report groups; preserved the existing Return to Village action.

### Manual changes

The human developer supplied the visual direction and required local add/commit operations. The existing compact Prepare for Expedition title-fit tweak was preserved alongside this pass.

### Verification and resulting prototype state

Focused local-HTTP Chrome checks passed for outbound travel, paused pace/ration editing, Camp Rest/Cook/Craft tabs, encounter choices, returning travel details, and the return report. The six-stat and four-stat orders were verified, no console errors occurred, and 320px, 360px, 390px, and 430px portrait checks reported no horizontal overflow. Deterministic simulation passed 62 assertions, campaign/health/Inn passed 99 assertions, combat passed 34 assertions, and `git diff --check` passed. The existing location suite still stops before its UI assertions on the unchanged stale Hall hotspot coordinate expectation; no unrelated location data or test was changed.

## 2026-08-22 - Town Navigation and Preparation Stepper UX Pass

### Goal

Make a small usability pass on the current pre-expedition town UI without redesigning the screens or changing expedition behavior.

### Human prompt and direction

The human developer requested clearer Village back navigation, a scoped Inn Cook heading fix, direct interactive preparation-step navigation, and a compact preparation header. Progression, inventories, recipes, costs, validation, and simulation behavior were to remain unchanged.

### AI-assisted implementation

- Added one reusable dark green/gold Village secondary-button treatment to town interiors and Prepare for Expedition, including mobile sizing and hover/pressed states.
- Added scoped spacing and a divider between Inn tabs and the Cook panel, with a responsive two-part heading for Cook for the Road and Town Materials → Provisions.
- Converted the preparation stepper labels into accessible buttons with delegated `preparation-step` actions and direct Route/Gear/Company/Review navigation through the existing `setPreparationStep` scroll-reset path.
- Kept final expedition validation in the existing Begin Expedition flow and placed the stronger Village control alongside the compact preparation heading.

### Manual changes

The human developer supplied the UX direction and requested local add/commit operations. No separate manual source changes were reported.

### Verification and resulting prototype state

Verified 28 focused local-HTTP Chrome checks covering Inn Rest/Cook switching, Cook scrolling and heading separation, Village returns from Inn and preparation, direct forward/backward preparation jumps, scroll reset, and 320px, 360px, 390px, and 430px portrait widths with no horizontal overflow. Python test syntax passed; deterministic simulation passed 62 assertions; campaign/health/Inn passed 99 assertions; and `git diff --check` passed. The existing location suite still stops before its UI assertions on the unchanged stale Hall hotspot coordinate expectation.

## 2026-08-22 - Pre-Expedition UI Polish Pass

### Goal

Polish the mobile-first pre-expedition UI into a finished illustrated indie-game presentation while preserving the existing art direction, functionality, progression, and responsive behavior.

### Human prompt and direction

The human developer requested a focused pass over Campaign Select, town interiors and shops, the persistent header, interior artwork presence, button states, typography/spacing, and cook/material tokens. Village hub label behavior, existing artwork, game logic, inventories, dialogue gating, and encounter systems were explicitly kept unchanged.

### AI-assisted implementation

- Reframed Campaign Select as a compact chapter record with a connected chronology, clearer completed/current/locked states, a restrained active Chapter III treatment, a persistent red Enter action, and integrated Best expedition/Treasury metrics.
- Reduced the persistent header height and save-status prominence while keeping title, audio, and reset functionality available.
- Applied a shared building-interior hierarchy: artwork, location rail, NPC/shop identity, tabs/actions, then scannable item/content rows. Shopkeeper and NPC identity blocks now use simple divider treatments while item rows remain cards.
- Increased destination artwork presence from a 2:1 frame to a responsive 1.82:1 frame with the existing cover crop behavior, strengthened enabled secondary controls, clarified selected gold states, and dimmed disabled controls.
- Standardized section/title spacing and subtly reshaped material and crafting requirement chips into compact inventory tokens without changing readability or behavior.

### Manual changes

The human developer supplied the visual direction and required local add/commit operations. No separate manual source changes were reported.

### Verification and resulting prototype state

Verified 39 focused local-HTTP Chrome UI checks covering Campaign Select, the village hub, Inn cooking/materials, Merchant, Blacksmith, Apothecary, Hall/dialogue, Prepare for Expedition, and 320px, 360px, 390px, and 430px portrait widths with no runtime exceptions or horizontal overflow. Python test syntax passed; deterministic simulation passed 62 assertions; campaign/health/Inn passed 99 assertions; and `git diff --check` passed. The existing location suite remains blocked before UI checks by its stale Hall hotspot coordinate expectation (`0.543269... / 0.458333...` versus the live `0.478846... / 0.434936...`); no unrelated test or content data was changed.

## 2026-08-20 - Pair Incoming Travel Foreground Cutouts

### Goal

Keep a distance-based travel panorama's aligned foreground cutout visible with
the incoming background as the scene transition approaches.

### AI-assisted implementation

- Preloaded each next scene's optional foreground asset alongside its panorama.
- Made the foreground layer mirror the base track's primary and incoming loop
  tiles independently, so the incoming crop is installed at the same handoff
  as the incoming background.
- Kept the existing 1.0x phase, pause/encounter handling, and seam/tree layer
  ordering unchanged; scenes without a foreground still use the prior path.

### Verification and resulting prototype state

Focused browser smoke coverage confirmed that the incoming base and foreground
tiles are paired while the first scene remains current. The location browser
regression still stops before its travel assertions at the unrelated Hall
hotspot expectation mismatch in `tests/location_system_test.py`.

## 2026-08-20 - Aligned Travel Foreground Cutouts

### Goal

Prototype an optional SAM-selected foreground cutout that stays aligned with
the unchanged travel panorama while drawing above the traveling party.

### AI-assisted implementation

- Added an optional SAM JSON file to the GrailTools travel image import. The
  importer applies the mask and its offset/bounds to a separate transparent
  WebP, without storing or shipping the SAM JSON in Grail.
- Added `travelParallaxAssetId` controls for legacy and distance-based travel
  backgrounds. GrailTools now crops the transparent SAM foreground to its
  content bounds and records the source-space offset/canvas size.
- The game renders that cropped foreground at the same 1.0x animation and
  phase as the panorama, with the party between the base image and cutout so
  foreground pixels can occlude travelers.
- Raised the existing seam/tree transition layer above the aligned foreground
  so seam-hiding artwork remains the top travel scenery layer.
- Kept the existing seam-hiding/tree foreground path unchanged and retained
  the exact prior behavior when no parallax image is assigned.

### Verification and resulting prototype state

Passed the focused GrailTools import/upload/editor checks after adding cropped
foreground alignment assertions. The location browser regression currently
stops before travel assertions at an unrelated Hall hotspot expectation
mismatch in `tests/location_system_test.py`; the aligned foreground assertion
is retained immediately after the real travel-art check.

## 2026-08-19 - Preserve Pending Travel Scenes Through Encounters

### Goal

Keep a pending distance-based Travel Scene transition queued when an encounter
interrupts travel before the next safe panorama seam.

### AI-assisted implementation

- Preserve the active travel presentation when resolving the post-encounter
  screen, including when dedicated encounter artwork was temporarily visible.
- Keep pending scene state intact while the current panorama is restored and
  frozen, then resume the normal seam-aware transition afterward.
- Separate the preserved visible asset from the incoming transition target so
  preloaded replacement images still activate at the seam.

### Verification and resulting prototype state

Passed the focused location browser flow with 441 assertions and
`git diff --check`.

## 2026-08-19 - Seam-Aware Travel Scene Transitions

### Goal

Make distance-based Travel Scene changes feel deliberate instead of replacing
the active panorama mid-scroll.

### AI-assisted implementation

- Queue different scene assets until a Loop seam or Pan endpoint, preload the
  incoming artwork, then crossfade it in without changing expedition state.
- Added an optional expedition travel-transition artwork selector with safe
  crossfade fallback when the foreground asset is unavailable.
- Preserve pause, return direction, encounter freeze/resume, and same-asset
  continuity while safely recovering from failed incoming images.

### Verification and resulting prototype state

Passed the focused location browser flow with 440 assertions, the two focused
Content Editor travel-asset checks, and `git diff --check`.

## 2026-08-19 - Fix Travel Scene Threshold Swaps

### Goal

Ensure a distance threshold activates the newly selected Travel Scene when its
asset differs from the current panorama.

### AI-assisted implementation

- Made same-asset continuity compare the active track's asset and motion
  metadata rather than a wrapper value that could already describe a pending
  crossfade.
- Promote scene and wrapper presentation metadata only after the replacement
  image becomes active; clear stale asset/motion metadata on fallback failure.

### Verification and resulting prototype state

The focused location browser regression now checks 0, 14, 15, and 24 league
selection plus same-asset continuity. Passed `python tests/location_system_test.py`
with 440 browser assertions and `git diff --check`.

## 2026-08-18 - Configurable Travel Scene Motion

### Goal

Give each expedition Travel Scene an explicit Loop or Pan presentation mode
without changing the existing panorama assets, thresholds, or encounter flow.

### AI-assisted implementation

- Added backward-compatible `motion: "loop"` defaults plus compact Loop/Pan
  controls and validation in the Content Editor.
- Loop mode repeats the panorama at a constant pace; Pan mode travels once
  across the available overflow and holds at the edge. Direction changes alone
  reverse the presentation, preserving pause and encounter freeze/resume state.
- Kept same-asset/same-motion scenes stable, while distance and motion changes
  continue to use the existing preload/crossfade and fallback behavior.

### Verification and resulting prototype state

Passed `python tests/location_system_test.py` with 440 browser assertions,
plus the focused Content Editor tests for Travel Scene motion controls and
travel-scene validation. `git diff --check` passed.

## 2026-08-18 - Freeze Travel Backdrop During Unillustrated Encounters

### Goal

Keep encounters without dedicated artwork anchored to the exact travel
panorama position where they begin, rather than briefly restarting the scene.

### AI-assisted implementation

- Distinguished valid dedicated encounter artwork from the travel panorama
  being reused as an encounter backdrop.
- Restored and froze the saved travel animation time for the reused backdrop,
  retained that state through the encounter, and resumed it after Continue
  Journey. Dedicated encounter artwork remains isolated from travel state.
- Invalid encounter artwork IDs now safely fall back to the current travel
  asset without inheriting unrelated presentation state.

### Verification and resulting prototype state

Passed `python tests/location_system_test.py` with 440 browser assertions,
including exact no-artwork freeze/resume, dedicated encounter artwork,
distance-scene state clearing, pause, direction, and crossfade coverage.

## 2026-08-18 - Preserve Travel Panorama Position Across Encounters

### Goal

Keep the active travel artwork at its current horizontal animation position
when an encounter interrupts travel and the same scene resumes afterward.

### AI-assisted implementation

- Captured transient travel presentation state at the travel-to-encounter
  render boundary, associated with the live expedition and asset ID.
- Deferred restoration until the encounter view ends, so encounter-specific
  artwork takes precedence and cannot consume the saved travel position.
- Cleared the saved state when a distance threshold selects a different travel
  asset; pause, direction, pace, and existing crossfade behavior remain intact.

### Verification and resulting prototype state

Passed `python tests/location_system_test.py` with 439 browser assertions,
including encounter interruption/restoration, encounter artwork precedence,
changed-scene state clearing, panorama direction, pause, fallback, and
distance-scene coverage.

## 2026-08-18 - Ultra-Wide Expedition Travel Panoramas

### Goal

Allow Expedition Travel Scenes to use approximately 3:1 panoramic artwork
inside the existing 16:9 travel frame, while keeping Camp and other Scene art
on the normal 16:9 workflow and preserving distance-based scene transitions.

### AI-assisted implementation

- Added the Content Editor Travel Panorama profile at approximately 2400x800
  WebP, quality 85, with crop-to-fill for non-panoramic sources and the
  existing no-upscale behavior for smaller sources.
- Travel Scene rows now infer Travel Panorama automatically and identify the
  recommended 3:1 artwork; the generic Asset Browser exposes both Scene 16:9
  and Travel Panorama 3:1 profiles. Camp Visual continues to infer Scene.
- Added aspect-aware runtime presentation: panoramic images fill the frame by
  height and pan across their measured horizontal overflow with paced,
  direction-aware motion, while existing 16:9 travel art keeps the cinematic
  fallback drift. Pause retains the artwork position and party markers remain
  fixed over the moving environment.
- Kept the existing distance threshold preload/crossfade, fallback scenery,
  Camp rendering, route banner, and simulation state behavior unchanged.

### Manual changes

Existing authored assets and catalog edits remain preserved. No new artwork or
audio was generated by this pass; current user-provided assets continue to
render through the backward-compatible 16:9 path until a 3:1 Travel Panorama
is uploaded.

### Verification and resulting prototype state

Passed:

- `python -m unittest discover -s tests -p 'test_asset_pipeline.py' -v` - 16
  image optimization/upload tests.
- `python -m unittest discover -s tests -p 'test_content_editor.py' -v` - 67
  Content Editor tests.
- `python -m unittest discover -s tests -p 'test_asset_server.py' -v` - asset
  preview/upload server coverage.
- `python tests/location_system_test.py` - 438 browser assertions, including
  panorama sizing/range/direction/pause/pace/marker coverage and fallback,
  crossfade, and Camp behavior.
- `python tests/simulation_system_test.py` - 62 deterministic simulation
  assertions.
- `python tests/campaign_system_test.py` - 99 campaign/health/Inn assertions.

## 2026-08-18 - Distance-Based Expedition Travel Presentation

### Goal

Polish the expedition travel screen with distance-aware artwork transitions and
paced motion while preserving the existing route UI, party markers, CSS
fallback scenery, camp presentation, and saved-expedition compatibility.

### AI-assisted implementation

- Added optional `travelScenes` resolution by current expedition distance,
  falling back to the legacy `travelVisualAssetId` when no distance scene is
  authored or available. Return travel selects the scene for the live distance
  rather than the maximum distance reached.
- Added eager travel artwork loading, next-scene preloading, a 720ms
  crossfade, subtle 105–109% cinematic drift, reversed return motion, paced
  motion durations, pause freeze/dim treatment, and restrained 2px party-marker
  bobbing. Failed or missing artwork restores the existing CSS environment.
- Extended the Expedition Content Editor with Travel Scenes rows for minimum
  distance, expedition image selection, upload/optimized scene profile, preview,
  add, and remove operations. Added validation for non-negative numeric values,
  ascending deterministic order, duplicate thresholds, missing references, and
  expedition image categories.
- Kept `campVisualAssetId` and all Camp rendering behavior unchanged.

### Manual changes

No artwork or audio was generated. Existing authored expedition assets and the
legacy single travel visual remain valid without requiring `travelScenes`.

### Verification and resulting prototype state

Passed:

- `python -B tests/location_system_test.py` - 437 browser assertions,
  including distance-scene crossfade, return selection, paused motion,
  fallback scenery, and camp artwork behavior.
- `python -B tests/test_content_editor.py -v` - 66 Content Editor tests.
- `python -B tests/test_asset_pipeline.py -v` - 12 asset upload/optimization
  tests.
- `git diff --check` in both repositories.

## 2026-08-18 - First Graphics and Audio Asset Pipeline

### Goal

Introduce the first real asset workflow across the game and sibling Content
Editor while preserving the existing placeholder presentation and save/data
compatibility.

### AI-assisted implementation

- Added stable image/audio asset catalog constants and category folders under
  `assets/images/` and `assets/audio/`; the shipped catalog remains empty until
  final files are authored.
- Added runtime asset resolution with graceful image-load fallback for village,
  destination, expedition travel, route-scoped camp, encounter, dialogue
  portrait, and combat visuals. Travel/camp visuals and ambience resolve from
  the current expedition definition rather than a global setting.
- Added `AudioManager` with gesture unlock, persisted mute/SFX/ambience
  preferences, semantic gameplay hooks, duplicate-ambience protection, and a
  compact header settings panel.
- Extended authored definitions with optional asset IDs while leaving the
  existing placeholder rendering and deterministic simulation paths intact.
- Added Content Editor asset browsing, preview, upload, explicit replacement,
  stable-ID selectors, source-preserving/atomic writes, binary/source backups,
  path/category/reference validation, and focused asset pipeline tests.

### Manual changes

No final artwork or audio was generated. Empty catalog definitions and
`.gitkeep` files are intentional first-pass placeholders.

### Verification and resulting prototype state

Passed:

- `python -B tests/asset_audio_system_test.py` - runtime asset/audio smoke
  coverage.
- `python -B tests/location_system_test.py` - existing location/UI coverage.
- `python -B tests/simulation_system_test.py` - deterministic simulation
  coverage.
- `python -B tests/test_content_editor.py` - existing Content Editor source
  preservation/reference suite.
- `python -B tests/test_asset_pipeline.py` - upload/replace/validation
  coverage.
- Content Editor browser smoke - asset category, selector, and empty-catalog
  fallback coverage.
- `git diff --check`.

## 2026-08-17 - Progression Planner Regression Fix

### Goal

Restore current-campaign progression after the aggressive provisioning pass
without changing combat, player/enemy stats, route distances, Faith,
equipment, encounter frequency, or economy values.

### Human prompt and direction

The human developer supplied a focused regression guide after the previous
planner patch caused shortened Old Forest progression attempts and repeated
Cautious supply runs. The guide required local simulation/project changes and
an add/commit when complete.

### AI-assisted implementation

- Made `progressionRequiredDistance` a hard departure floor for every
  progression route. Ordinary expeditions retain adaptive target reduction,
  while a progression plan either reaches its floor or defers before departure.
- Split the hard `minimumViableProvisionRequirement` from the optional
  `preferredProvisionTarget`. Carry capacity now caps the preferred buffer
  first; a viable route can depart with a recorded
  `preferred-provision-buffer-unavailable` constraint and a
  `ready-with-constraints` readiness state.
- Re-quoted readiness using the stock and ration mode preparation can actually
  reach, preventing threshold-crossing cooking/purchases from creating a false
  preflight result.
- Added material-benefit checks and per-route supply-run history. Capacity
  blockers and repeated supply runs without improved provisions, gold, shop
  stock, capacity, or supported distance become incomplete blocked states and
  emit `supply-run-suppressed-no-benefit` telemetry.
- Extended campaign entry, compact, CSV, and decision diagnostics with the
  progression floor, minimum/preferred requirements, capacity, packed stock,
  shortfall, readiness, blocker, and supply-run benefit fields. Added focused
  deterministic coverage for aggressive 105-league planning, compact
  diagnostics, underprepared Old Forest deferral, and non-improving supply
  loops.

### Manual changes

No manual code edits were reported. The supplied regression guide and
repository `AGENTS.md` were used as the implementation constraints.

### Verification and resulting prototype state

Passed:

- `python tests/progression_system_test.py` — 40 current-campaign
  progression assertions.
- `python tests/campaign_system_test.py` — 99 campaign/health/Inn
  assertions.
- `python tests/simulation_system_test.py` — 62 deterministic simulation
  assertions.
- `python tests/location_system_test.py` — 429 UI/provision/location browser
  assertions.
- `python tests/campaign_replay_system_test.py` — 27 campaign replay
  assertions.
- `python tests/replay_system_test.py` — 15 replay assertions.
- `git diff --check`.

The required fresh 100-campaign progression validation used a 105-league
target, 20-expedition cap, default authored player state with 20 starting gold
and 15 starting provisions, and the requested policy/strategy pairs. Aggressive
recorded 96% Old Forest completion, 0 planned progression target reductions,
1.04 average Old Forest attempts, 18% resource-exhaustion stops, 55% death
stops, 13% campaign completion, and 29.30 average packed provisions. Cautious
recorded 99% Old Forest, 92% Barenton, 78% Val, 61% Search-for-Merlin reach,
20% campaign completion, 13% attempt-cap failure, 0% resource exhaustion, and
29.29 average packed provisions. Cautious supply runs averaged 1.98 per
campaign; repeated non-improving routes were stopped as blocked rather than
consuming the attempt cap. The guide's broken baselines were approximately 9%
Old Forest and 99% target reduction for Aggressive, and 93% attempt-cap
failure for Cautious; the new runs show progression attempts occurring at
their authored floors. The aggressive resource-exhaustion rate remains below
the pre-provisioning-patch 63% reference.

## 2026-08-17 - Aggressive Campaign Simulation Strategy Patch

### Goal

Correct aggressive campaign preparation and travel policy so it remains
aggressive without knowingly underfunding long expeditions.

### Human prompt and direction

The human developer supplied a focused simulation-strategy guide after the
combat overhaul and requested local add/commit work when the sim and project
updates were complete. Combat and player/enemy balance were explicitly out of
scope.

### AI-assisted implementation

- Added a deterministic Aggressive provision uncertainty buffer of
  `ceil(distance / 25)`, clamped to 1–4 provisions, with re-quoting after
  purchases when the departure ration changes from Sparse to Normal.
- Reworked the shared runtime return check to compare current provisions with
  passive return cost, encounter reserve, and strategy tolerance on every
  travel-loop pass. Aggressive uses a one-unit tolerance, returns with Sparse
  rations at the same boundary, and records trigger diagnostics.
- Made the Aggressive preparation floor explicit: effective provisions and
  minimum Bandages are funded before discretionary crafting or Smithy gear.
  Deferred equipment records its item, cost, available gold, required food
  spend, and effective target.
- Extended campaign/simulation compact and CSV telemetry and updated the
  campaign/simulation documentation.

### Manual changes

No manual code edits were reported. The supplied strategy guide and repository
`AGENTS.md` were used as the implementation constraints.

### Verification and resulting prototype state

Passed:

- `python tests/campaign_system_test.py` — 99 campaign/health/Inn assertions.
- `python tests/simulation_system_test.py` — 62 deterministic simulation
  assertions.
- A fresh 100-campaign Aggressive progression batch at a 105-league target,
  20-expedition cap, and `aggressive-reinvestor` policy reduced hard failure
  from the supplied 100% baseline to 34%, resource exhaustion from 63% to 2%,
  and death from 37% to 32%. Barenton completion was 10% versus 28%, Val
  completion was 4% versus 4%, and campaign completion remained 0% in this
  batch. Average provisions packed were 28.76, with 16 emergency turnarounds
  and gear spending still present; the result indicates starvation was sharply
  reduced without tuning combat stats, while progression completion remains a
  follow-up balance/policy concern.


## 2026-08-17 - Combat Content Authoring, Faith, and Mixed Crafting Pass 3

### Goal

Turn the generalized combat runtime into a practical authoring surface with a
usable active/passive catalog, real event-driven passive hooks, broader Faith
content, and typed mixed-source crafting that can grow without bespoke UI or
runtime branches.

### Human prompt and direction

The human developer supplied the Pass 3 guide, asked to proceed immediately
after the small Pass 2 follow-up, required all AGENTS.md instructions to remain
authoritative, and requested local add/commit work in both repositories when
finished.

### AI-assisted implementation

- Added four martial/Faith/mystical active abilities (Sweeping Cut, Guard
  Break, Smite, and Call the Storm) and four event-driven passives (Pilgrim's
  Resolve, Unyielding, Battle Prayer, and Threefold Concord) using the shared
  target, condition, effect, cost, cooldown, charge, and lifecycle contracts.
- Expanded the GrailTools Abilities editor into one schema-aware active/passive
  editor with metadata, tags, generic resources, trigger conditions, nested
  effects, used-by references, and a raw JSON escape hatch. Added ability
  filters and validation for live events, conditions, effect fields, and
  nested structures.
- Added canonical typed recipe ingredients with item/material source checks,
  atomic quote/consume behavior, typed editor rows, legacy map normalization,
  reverse-reference support, and the mixed Threefold Seal recipe.
- Added protected Threefold Seal component items, route rewards, chapel/shrine/
  camp Faith hooks, Barenton/Val ability hooks, a sensible starting loadout,
  and generic Faith/ability metadata in preparation and combat UI.
- Updated simulation ingredient scoring, focused combat/location/content-editor
  coverage, crafting/combat documentation, and this build log.

### Manual changes

No manual code edits were reported. The supplied guide and repository
AGENTS.md files were used as the implementation constraints.

### Verification and resulting prototype state

Passed:

- `python tests/combat_system_test.py` — 34 Tier 1 combat assertions.
- `python tests/simulation_system_test.py` — 62 deterministic simulation
  assertions; `campaign_system_test.py` — 92 campaign/health/Inn assertions.
- `python tests/location_system_test.py` — 429 UI/provision/location
  assertions; `debug_tools_test.py` — 16; `replay_system_test.py` — 15;
  `campaign_replay_system_test.py` — 27; `progression_system_test.py` — 36;
  `discovery_progression_test.py` — 10; and `expedition_content_test.py` — 10.
- `python tests/soak_regression_test.py` — all 3 deterministic soak suites:
  simulation (62), campaign (92), and campaign replay (30).
- `python -m unittest Tools.ContentEditor.tests.test_content_editor` — 65
  tests; `python -m unittest Tools.ContentEditor.tests.test_phase6_filters` —
  16 tests.
- `git diff --check` in both repositories.

The prototype remains dependency-free and portrait/mobile-compatible. The
editor still keeps Grail content as the source of truth and writes only
explicitly validated changes. No XP, skill-tree, elemental, or replacement
combat-menu system was introduced, and no changes were pushed to a remote.

## 2026-08-17 - Combat Ability Loadouts and Resource Pass 2

### Goal

Finish the next combat-system pass by making learned abilities, temporary
grants, Faith costs, cooldowns, charges, passives, UI loadouts, simulation,
replay, and authoring validation share one extensible runtime contract.

### Human prompt and direction

The human developer supplied the Pass 2 guide, requested one small follow-up
fix from the prior combat pass before entering Pass 2, required all AGENTS.md
instructions to remain authoritative, and requested local add/commit work in
both repositories when finished.

### AI-assisted implementation

- Made successful `weaponDamage` emit `attackHit` by default, including lethal
  hits, before defeat events. Added the documented `triggersOnHit: false`
  opt-out while preserving the legacy `onHit: false` alias; dead targets no
  longer receive newly applied statuses.
- Added persistent learned abilities, validated 3-active/2-passive loadouts,
  duplicate-safe learning with compatible-slot auto-equip, and separate
  temporary grants from equipment, companions, and statuses.
- Added real Faith abilities (Healing Prayer and Steady Heart), generic
  resource ownership/mutation, persistent Faith display and saving, generic
  actor-activation cooldowns, per-combat charges, canonical availability
  checks, and action-event telemetry for Faith/cooldown/charge results.
- Kept Attack, Defend, Flee, Pommel Strike, Intercede, and Charge behavior
  intact while moving ability menu construction, passive registration,
  companion support, and simulation choice logic onto shared definition/effect
  inspection. Added ability reward presentation for encounter learning.
- Preserved learned/loadout state through save migration, campaign simulation,
  replay snapshots, and state comparisons. Extended GrailTools validation for
  ability cooldowns, charges, on-hit controls, resource outcomes, and
  `learnAbility` outcomes.
- Updated focused combat, simulation, campaign, progression, replay, UI, and
  content-editor coverage plus the combat architecture documentation.

### Manual changes

No manual code edits were reported. The supplied guide and repository
AGENTS.md files were used as the implementation constraints.

### Verification and resulting prototype state

Passed:

- `python tests/combat_system_test.py` — 28 Tier 1 combat assertions.
- `python tests/simulation_system_test.py` — 62 deterministic simulation
  assertions.
- `python tests/campaign_system_test.py` — 92 campaign/health/Inn assertions.
- `python tests/progression_system_test.py` — 36 current-campaign progression
  assertions; `discovery_progression_test.py` — 10 assertions; and
  `expedition_content_test.py` — 10 assertions.
- `python tests/replay_system_test.py` — 15 replay assertions;
  `campaign_replay_system_test.py` — 27 focused assertions; and
  `soak_regression_test.py` — simulation, campaign, and 30-run campaign-replay
  soak suites.
- `python tests/location_system_test.py` — 429 UI/provision/location
  assertions; `debug_tools_test.py` — 16 debug-tools assertions.
- GrailTools ContentEditor unittest suite — 79 tests passed.
- `git diff --check` in both repositories.

The prototype remains dependency-free and portrait/mobile-compatible. No new
large ability catalog, skill tree, XP system, elemental system, or replacement
ContentEditor UX was introduced. No changes were pushed to a remote.

## 2026-08-17 - Shared Combat Runtime Overhaul

### Goal

Replace the branch-heavy combat resolution path with a deterministic,
data-driven action/effect lifecycle that can grow to support future abilities,
passives, statuses, resources, enemy behavior, equipment reactions, and replay
without expanding the player-facing combat menu.

### Human prompt and direction

The human developer supplied the Pass 1 combat overhaul guide, requested that
all AGENTS.md instructions remain authoritative, asked for BUILD_LOG.md to be
updated, and requested local add/commit work in both repositories when
finished.

### AI-assisted implementation

- Added shared target, condition, effect, and event modules with stable
  listener ordering, action/damage/death lifecycle events, deterministic
  injected RNG, target filtering, status triggers, and once-per-combat
  conditions.
- Migrated Attack, Defend, Flee, Pommel Strike, Intercede, Charge, Bleeding,
  Poisoned, equipment combat effects, Resolve charges, and Bound Warden
  regeneration/suppression through the shared resolver. Legacy authored aliases
  remain readable while runtime behavior converges on definitions and effects.
- Added generic active/passive definition metadata, Faith persistence and
  cost validation, save compatibility, and a non-enumerable expedition player
  reference so combat resource mutations persist without entering replay
  snapshots.
- Extended the GrailTools validator for active/passive kinds, target modes,
  tags, costs, conditions, and the shared authored effect vocabulary.
- Added focused combat coverage, a soak-suite wrapper, combat architecture
  documentation, README/SIMULATION verification guidance, and corrected an
  obsolete stochastic Campaign 40 replay fixture to assert ownership and
  replay invariants instead of a random inventory snapshot.

### Manual changes

No manual code edits were reported. The supplied guide and repository
AGENTS.md files were used as the implementation constraints.

### Verification and resulting prototype state

Passed:

- python tests/combat_system_test.py — 19 Tier 1 combat assertions.
- python tests/simulation_system_test.py — 62 deterministic simulation
  assertions.
- python tests/debug_tools_test.py — 16 debug-tools assertions.
- python tests/campaign_system_test.py — 92 campaign/health/Inn assertions.
- python tests/replay_system_test.py — 15 replay assertions.
- python tests/campaign_replay_system_test.py — 27 focused campaign-replay
  assertions.
- python tests/soak_regression_test.py — simulation, campaign, and long
  campaign-replay suites; 62, 92, and 30 assertions respectively.
- python tests/location_system_test.py — 429 UI/provision/location assertions.
- python tests/progression_system_test.py — 36 current-campaign progression
  assertions; discovery_progression_test.py — 10 assertions; and
  expedition_content_test.py — 10 assertions.
- GrailTools ContentEditor unittest suite — 78 tests passed.
- git diff --check in both repositories.

The prototype remains dependency-free and portrait/mobile-compatible. No new
combat UI or authored ability catalog expansion was introduced. No changes
were pushed to a remote.

## 2026-08-17 - Discovery-Gated Barenton and Val Progression

### Goal

Rebalance the Barenton and Val expeditions so their story knowledge gates make
them meaningful progression attempts without changing the existing combat,
loot, food, or authored objective balance.

### Human prompt and direction

The human developer supplied a campaign rebalancing guide requiring persistent
knowledge to settle only on safe return, same-run discovery support, nested
requirements, explicit Morgan/Guardian gating, deterministic simulation choices,
campaign discovery telemetry, focused regression coverage, and local commits.

### AI-assisted implementation

- Added reusable recursive `anyOf`/`allOf` requirements and a generic
  `setCampaignFlagOnSafeReturn` effect. The new Barenton flags are
  `barenton_ritual_understood` and `barenton_approach_known`; the new Val flag
  is `val_way_understood`. Run-local flags allow discoveries made earlier in
  the same expedition, while failed expeditions discard their staged flags.
- Barenton ritual access now requires both ritual understanding and approach
  knowledge, each satisfied by the current run or a safely settled campaign
  flag. Sources are the meaningful rumor/Keeper choices and the still-forest or
  stone-marker approach choices.
- Val's Morgan offer now requires the revealed boundary plus current-run or
  persistent understanding. The Guardian now requires an actual current-run
  refused/asked Morgan offer, so no offer produces no Guardian and accepting
  the gift still prevents it. Guardian victory remains the unsecured Token
  path.
- Updated cautious/aggressive authored simulation choices to make the new
  discoveries, reject Val comforts, refuse Morgan, and challenge the Guardian
  when available. Random/normal strategies remain seed-driven.
- Added per-expedition staged/settled discovery telemetry, first-discovery and
  discovery-return campaign metrics, Morgan Offer/Guardian counts, completion
  attempt distributions, and compact notable events distinguishing secured
  discoveries from staged-and-lost discoveries.
- Exposed the new effect and nested requirement groups in GrailTools and added
  validation for encounter-level nested requirements and safe-return flag
  effects.

### Verification and resulting prototype state

Passed:

- `python tests/discovery_progression_test.py` — 10 assertions.
- `python tests/progression_system_test.py` — 36 assertions, updated for
  multi-attempt Barenton/Val progression and replay route preservation.
- `python tests/simulation_system_test.py` — 62 assertions.
- `python tests/campaign_system_test.py` — 92 assertions.
- `python tests/debug_tools_test.py` — 16 assertions.
- GrailTools unittest suite — 77 tests passed.
- `git diff --check` in both repositories.

The existing standalone `expedition_content_test.py`, `location_system_test.py`,
`replay_system_test.py`, and `campaign_replay_system_test.py` also encountered
pre-existing/headless fixture issues in this environment (missing runtime
globals or inaccessible local storage); no unrelated replay fixture was
changed. Existing Flask odds, Green Vial odds, Glimmering Sword behavior,
Thorn/Lazarus rewards, Fountain Knight/Guardian/Warden stats, food tuning,
attempt limits, Search objective distance, and combat getaway behavior remain
unchanged.

## 2026-08-16 - Campaign Simulation Default Configuration

### Goal

Make the Campaign Simulation panel open with the requested current-campaign
progression configuration.

### AI-assisted implementation

- Set the defaults to 100 campaigns, current campaign progression, 20 maximum
  attempts, aggressive strategy, aggressive-reinvestor policy, and a 105-league
  turnaround distance.
- Added a browser regression assertion for the visible default controls.

### Verification and resulting prototype state

The new default-control assertion passed in the focused progression browser
suite, which then stopped at the existing hard-failed Flask prerequisite
expectation. `git diff --check` passed.

## 2026-08-16 - Debug Panel View-State Persistence

### Goal

Keep the developer debug panel stable while its data refreshes after control
changes and mutations.

### AI-assisted implementation

- Preserved open/closed state for all debug sections, nested expedition and
  combat readouts, panel scroll position, and the active control across panel
  rebuilds.
- Preserved the same view state when the live combat readout refreshes, so
  runtime updates do not unexpectedly reopen or collapse its details.
- Added focused browser coverage for section-state and focus persistence.

### Verification and resulting prototype state

The focused debug browser suite passed 16 assertions, including the new
view-state regression check. `git diff --check` passed.

## 2026-08-16 - Extensible Combat Equipment and Status Effects

### Goal

Extend the combat simulation with reusable equipment passives, canonical
enemy statuses, deterministic charge triggers, and three rare expedition
rewards while keeping the existing relic slot, combat balance, and item-driven
runtime architecture intact.

### Human prompt and direction

The human developer supplied a combat/equipment extension guide covering
equipment speed, on-hit status effects, Bleeding and Poisoned activation ticks,
generic Defend charge triggers, Thorn of the Dolorous Vale, Reliquary of Saint
Lazarus, Shard of the Perron, deterministic simulation scoring and telemetry,
and schema-aware GrailTools editing/validation. The requested workspace scope
included coordinated changes to Grail and GrailTools, BUILD_LOG maintenance,
and local commits for both repositories.

### AI-assisted implementation

- Added canonical `bleeding` and `poisoned` combat status definitions with
  authored periodic damage, activation duration, refresh behavior, status
  ticks/expiry events, deterministic logs, and pre-action enemy death checks.
- Added a shared equipped-combat-effects aggregator for speed, on-hit status
  effects, and combat triggers; Arthur normal attacks now apply successful
  on-hit effects from weapon, armor, and relic slots.
- Added generic equipment trigger/charge handling for actually prevented
  Defend damage and next-normal-attack spending, including the Shard of the
  Perron Resolve cap and ability non-consumption behavior.
- Added the three unique, non-shop, protected rare items and their 30% reward
  hooks on the Briar Knight, Leper Knight, and Barenton ritual paths.
- Extended simulation and campaign telemetry with status applications/damage,
  passive trigger records, Resolve stored/spent totals, and equipment
  acquisition/equip summaries/events. Updated score-based equipment selection
  to value the new passive effects without item-ID branches.
- Added GrailTools combat-status catalog editing, status dropdown references,
  item speed/on-hit/trigger controls, schema validation, and reference-safe
  status deletion behavior.

### Manual changes

The human developer supplied the implementation guide and requested local
verification plus repository commits. No manual gameplay or content-value
changes were reported.

### Verification and resulting prototype state

Verified 59 deterministic browser simulation assertions covering speed,
on-hit effects, status durations/refresh, pre-action status death, Resolve
storage/cap/spend behavior, reward wiring, scoring, and telemetry export. The
focused GrailTools schema test passed, and the real catalog reported no
validation errors. The full Tools suite ran 61 tests with five existing
content-era count/path fixture failures unrelated to this pass; those failures
remain documented for handoff. Both repositories passed `git diff --check`.

## 2026-08-16 - Generic Town Equipment Crafting Simulation

### Goal

Teach between-expedition campaign preparation to recognize, craft, and equip
useful learned equipment recipes without special-casing Glimmering Sword or
changing authored equipment stats, recipes, loot odds, or combat balance.

### Human prompt and direction

The human developer supplied a town-preparation guide requiring generic
crafted-equipment candidates, score-based upgrade selection, survival-first
economics, final equipment reconciliation, deterministic telemetry, focused
Glimmering Sword coverage, and a compatibility audit of the sibling Tools
content editor. The requested workspace scope included local add/commit work
for each repository that actually changed.

### AI-assisted implementation

- Added `craftUsefulCampaignEquipment` to campaign preparation. It enumerates
  learned recipes from providers available in the current town, quotes each
  recipe through `CraftingRules`, filters to valid equippable outputs, compares
  `EquipmentRules.scoreItem` against `bestOwnedForSlot`, and ranks candidates
  deterministically by score, slot, and recipe ID.
- Placed discretionary equipment crafting after healing, injury treatment,
  Inn cooking, provisioning, and minimum Bandage readiness. Smithy purchases
  follow crafting, and a final `equipBestOwned` pass records only actual
  changes before packing and departure.
- Preserved the existing crafting result shape while exposing equipment craft
  actions with recipe, output, provider, slot, cost, and consumed material/item
  details. Compact campaign summaries now include equipment craft counts,
  preparation numbers, crafted equipment records, replacement-aware equip
  actions, and notable craft/equip events.
- Added narrowly scoped recipe/item-definition injection to `CraftingRules`
  so deterministic tests can exercise future authored equipment shapes without
  adding gameplay content. Updated stale campaign recipe-count and equipment
  fixtures to the current `glimmering_sword` content ID.

### Manual changes

The human developer supplied the implementation guide and requested local
verification plus repository commits. No manual gameplay or content-value
changes were reported.

### Verification and resulting prototype state

Verified 92 campaign/health/Inn assertions, 53 deterministic expedition
assertions, four focused Tools recipe/provider/reference tests, focused
campaign replay of craft/equip through completion, clean browser startup, and
`git diff --check` in both repositories. The full legacy Campaign 40 replay,
single-run replay, location, and Tools suites still contain pre-existing
content-era fixture failures; baseline `HEAD` reproduces the Campaign 40 and
single-run replay failures. Tools required no compatibility code changes: its
current recipe output, item reference, provider, and equipment validation
already cover this runtime-only telemetry addition.

## 2026-08-16 - Barenton and Val Encounter Density Pass

### Goal

Expand the two deep expeditions with focused, repeatable content while
preserving the existing progression milestones, combat framework, camp flow,
and seeded simulation/replay contract.

### Human prompt and direction

The human developer supplied a Barenton/Val encounter guide and directed a
rescan of the latest main game repo before implementation. The guide called
for Barenton wilderness, purification, and moral-ordeal content; Val
temptation, captivity, memory, and unreality content; reusable combat and
camp authoring; concise dialogue where useful; no new progression gates; and
no broad rebalance of existing content.

### AI-assisted implementation

- Added Barenton's white-hart extension, Leper Knight, Serpent at the Spring,
  Black Boar, Charcoal Burner, Red/White Springs, and Pilgrims at the Wrong
  Fountain.
- Added Barenton's Bell Beneath the Earth camp event and registered it through
  the existing contextual camp tables.
- Added Val's forgotten-name knight, Morgan's Huntsmen, Briar Knight,
  Immaculate Sleeping Camp, roadside Feast That Never Cools, Woman at the
  Ford, and Returning Knight.
- Added Val's Familiar Voice Beyond the Fire and Knight Who Asks to Join camp
  events, reusing the existing camp selection and combat resolution systems.
- Added reusable serpent, black boar, Leper Knight, Morgan's Huntsman, and
  Briar Knight enemy/action/combat definitions with existing injury types and
  material/loot tables.
- Added concise encounter dialogue sequences for the Leper Knight, Charcoal
  Burner, wrong-fountain pilgrims, forgotten knight, woman at the ford, and
  familiar voice.
- Kept simulation dialogue callbacks compatible with encounter and
  combat-to-dialogue resume paths so seeded progression runs cannot stall.

### Verification and resulting prototype state

Verified 10 existing Barenton/Val browser-content assertions, 53 deterministic
simulation assertions, focused new-ID/combat/dialogue/camp registration checks,
replay determinism, clean HTTP startup, and exact 101-league seeded Barenton
and Val progression reward runs. The broader campaign and location suites
remain blocked by their documented pre-existing stale glimmering_blade and
recipe-count fixtures. No new files were staged or committed; the user will
review and commit the current worktree.

## 2026-08-16 - Campaign Flask Prerequisite Simulation Fix

### Goal

Keep current-campaign progression truthful when Old Forest Road completes
before Merlin's Flask has been secured.

### Human prompt and direction

The human developer supplied a focused simulation guide requesting an
Old Forest prerequisite/search run before Fountain of Barenton, without
changing encounter content, Flask odds, rewards, combat, economy, or the
player-facing unlock state. The change was limited to the Grail game repo.

### AI-assisted implementation

- Added prerequisite-aware progression selection for the Fountain objective:
  missing Flask selects Old Forest Road while the progression objective stays
  Fountain; secured Water bypasses the Flask search rule.
- Kept prerequisite runs separate from normal progression attempts and supply
  runs, while counting each real expedition toward the campaign cap.
- Added prerequisite status, reason, objective, route, acquisition, summary,
  compact-export, CSV, notable-event, and replay telemetry.
- Added deterministic progression coverage for repeated searches, safe Flask
  recovery, existing Flask/Water cases, hard failure, cap accounting, and
  compact export separation.

### Verification and resulting prototype state

Verified 28 current-campaign progression assertions, 53 deterministic
simulation assertions, and `git diff --check`. The broader campaign suite
remains blocked by its pre-existing stale `glimmering_blade` equipment fixture;
no content files were changed for this fix.

## 2026-08-15 - Phase 6 Content Authoring and Travel Injury Systems

### Goal

Extend the live game and separate Content Editor with narrow, data-driven
authoring support for direct recipe rewards, recipe-specific crafting timing,
generic travel-damage injuries, and the material catalog.

### Human prompt and direction

The human developer requested a focused Phase 6 pass across the actual Grail
game and `Tools/ContentEditor`, using the latest `main` content. The guide
required direct recipe rewards without disturbing loot-table recipe rewards,
optional per-recipe crafting duration with compatibility defaults, generic
periodic injury damage based on distance, a Poisoned-only authoring pass, and
Materials CRUD/reference editing. It explicitly prohibited combat or existing
recipe balance changes and Infection retuning.

### AI-assisted implementation

- Added the generic `learnRecipe` encounter outcome. It validates the recipe,
  stages an unsecured recipe reward, works through nested combat Victory/Fled
  outcomes, and deduplicates recipes already known or already staged during
  the expedition.
- Added optional `craftingDurationMs` recipe support. Crafting and cooking
  progress actions use the authored duration when present and retain the
  existing provider/default timing when absent or invalid.
- Added generic injury `travelDamageAmount` and `travelDamageInterval`
  processing with remainder accumulation, multiple-interval handling,
  Arthur/companion health updates, journey-log entries, and deterministic
  `injury-travel-damage` telemetry. Poisoned is authored as one damage every
  five leagues; Infection remains unchanged.
- Added the Content Editor Materials category backed by
  `MATERIAL_DEFINITIONS`, including add/edit/delete, identity/name/
  description/rarity fields, reference-aware deletion protection, and live
  material selectors for recipe ingredients and loot entries.
- Added schema-aware recipe duration and `learnRecipe` editor controls plus
  focused game, core-editor, and browser regressions.

### Verification and resulting prototype state

Verified 51 deterministic game simulation assertions, 54 Content Editor unit
tests, and 11 headless browser regression tests. Coverage includes nested
combat recipe rewards and deduplication, provider/default duration fallback,
multi-interval Poisoned ticks, cure/removal stopping future ticks, companion
damage determinism, Materials add/edit/delete/reference validation, direct
recipe outcome editing, and recipe duration editing.

No combat balance, encounter balance, existing recipe costs/outputs, or
Infection behavior was changed. Existing saves remain compatible because the
new recipe duration and injury travel-distance fields are optional and
default on read.

The broader legacy location/campaign smoke suites still contain unrelated
pre-existing assumptions from an older content snapshot: one expects nine
recipes while current `main` has ten, and several campaign checks reference
the removed `glimmering_blade` ID while current content uses
`glimmering_sword`. Those stale assertions were not changed in this focused
pass.

## 2026-08-15 - Generalized Campaign Equipment Automation

### Goal

Make campaign preparation evaluate owned equipment generically so recovered
weapons, armor, relics, and future authored gear can be equipped after safe
return and can suppress inferior shop purchases.

### Human prompt and direction

The human developer reported that the content editor's new `glimmering_blade`
loot weapon was recovered by simulation but ignored by automation, and
requested generalized equipment evaluation without item-ID special cases.
The human's content changes added the weapon and Bandit Leader loot entry.

### AI-assisted implementation

- Added shared `EquipmentRules` evaluation across all owned equippable items,
  with deterministic slot/item tie-breaking and combat-aware weapon, armor,
  and granted-ability scoring.
- Campaign preparation now equips owned upgrades at the next legal town phase,
  after safe settlement; smithy purchases compare against the best owned gear
  rather than only the currently equipped item.
- Recorded owned-inventory equipment changes in preparation/replay actions and
  preserved compact notable equipment events.
- Added regressions for loot weapon and armor upgrades, inferior loot,
  arbitrary fixture IDs, safe-return timing, purchase suppression, replay/
  compact telemetry, and a deterministic recovered Glimmering Blade campaign.

### Verification and resulting prototype state

Verified 47 deterministic simulation assertions, 22 progression assertions,
85 campaign assertions, and 429 UI/provision/location assertions. A seeded
campaign recovered `glimmering_blade` from current Bandit Leader loot and
equipped it during the following preparation. No authored gameplay values were
changed by this automation pass.

## 2026-08-15 - Standalone Grail Content Editor Phase 1

### Goal

Create a local authoring tool that makes the game's data-driven content safer
and faster to browse and edit without migrating the Grail runtime or content
format.

### Human prompt and direction

The human developer supplied the Phase 1 Content Editor guide and directed
implementation under the separate `Tools` workspace. The guide explicitly
limited the first phase to encounters and shops and required validation,
explicit saving, temporary-copy testing, documentation, and this milestone
entry. No manual Grail gameplay or content edits were reported.

### AI-assisted implementation

- Added `Tools/ContentEditor`, a dependency-free Python local server and
  browser editor with category navigation, search, add/duplicate/delete,
  schema-aware encounter and shop forms, advanced JSON escape hatches, and an
  unsaved-change indicator.
- Added a constrained JavaScript object-literal parser/serializer that reads
  the live `encounter-data.js` and `location-data.js` constants and replaces
  only the targeted definition block when saving.
- Added reference-aware validation for required encounter structure, item,
  combat, injury, path, region, and loot IDs, chance ranges, distance ranges,
  shop prices/stock, and shop deletion references from understood locations.
- Added stale-file conflict detection, validation-before-save, atomic writes,
  and recovery backups under `Tools/ContentEditor/.backups/`.

### Verification and resulting prototype state

The editor loads the current 54 encounters, 3 shops, and 44 item IDs. It is
launched with `python Tools/ContentEditor/server.py` and defaults to the
sibling `Grail` project. It edits encounters and shops in memory until
explicit Save Changes; it does not autosave or add runtime dependencies to
the contest submission.

Verified 8 Content Editor unit tests, including real-definition loading,
semantic round-trip, encounter save/parse, shop price/stock save/parse,
invalid-reference reporting, deletion blocking, stale-source rejection, and
unrelated-file preservation. Also verified a clean local browser startup,
zero validation errors on the current content, `git diff --check`, and an
unchanged Grail worktree before this log-only update. No Grail gameplay or
content definition files were modified.

### Source-preservation fix pass

Reworked saves to replace only changed definition-property source spans rather
than reserializing or reordering unrelated content. Added regression coverage
for minimal scalar/nested diffs, ordering, add/delete behavior, shop isolation,
and stale-file protection. The temporary Fallen Tree road-to-path reproduction
now produces exactly two changed content lines.

### Phase 2 Items editor

Extended the separate `Tools/ContentEditor` with an Items category backed by
the live `Grail/js/data.js` `ITEM_DEFINITIONS`: identity, category, rarity,
tags, inventory flags, equipment slots, stack limits, weapon damage, armor
defense, granted combat abilities, combat-use fields, treatment injury IDs,
raw JSON escape hatches, and reference-aware Used By browsing. Existing
encounter and shop item selectors now use live in-memory items, so a newly
created item can be used before or after saving. Added a focused drop panel for
adding/removing an item and editing its weight in an existing loot table,
including `bandit_leader_loot`, without introducing a general loot editor.

Added surgical writes for item definitions and focused loot-table changes,
preserving untouched definitions, ordering, comments, delimiters, and other
source spans. Validation now covers item IDs and required fields, categories,
equipment slots, max stacks, nested effects, damage ranges, ability and injury
references, invalid item references, and unsafe item deletion. Verified 23
Content Editor tests plus local API/static and headless Chrome UI smoke checks;
the Grail worktree remained clean and no runtime dependency or authored game
content was added by this tooling milestone.

### Phase 3 Combat, Abilities, and Loot Tables editor

Extended the separate `Tools/ContentEditor` with Combat, Abilities, and Loot
Tables categories backed by the live `combat-data.js` and `loot-data.js`
definitions. Combat editing supports multi-enemy rosters plus shared enemy
stats and action patterns; Abilities exposes the authored shared combat
ability fields; Loot Tables supports weighted gold, item, material, recipe,
and nested-table entries with fixed or min/max quantities. Cross-content Open
actions connect encounter combat/loot references, item ability grants, enemy
action references, and nested loot tables.

Added source-preserving grouped saves for the combat definitions, enemy
definitions, enemy actions, and abilities that share `combat-data.js`, along
with loot-table saves, stale-source checks, reference-aware validation, and
deletion blocking. The complete Bandit Leader encounter-to-combat-to-loot
workflow was verified in the local browser. Verified 32 Content Editor unit
tests, live zero-error catalog validation, and browser smoke coverage for all
Phase 3 categories. No live Grail content definitions or runtime code were
modified; this milestone only records the development-tool capability.

Follow-up: Encounter `startCombat` outcomes now expose schema-aware Combat,
Victory, and Fled editing without requiring raw JSON. Loot-table and direct
item rewards use typed selectors with Open navigation, nested references are
included in validation and Used By reporting, and temporary-fixture tests
verified source-preserving edits that change only the owning encounter.

## 2026-08-15 - Provision Preparation and Supply-Run Balance Patch

### Goal

Make a small preparation pass for 101-league progression play without
changing travel consumption, combat balance, encounter frequency, or quest
content. The patch also makes wolf and ordinary bandit field rewards more
intuitive while keeping all seeded simulation and replay paths compatible.

### Human prompt and direction

The human developer supplied the provision/preparation balance guide and
requested finite town availability improvements, intentional Old Forest Road
supply runs when a deep progression objective is not reasonably provisionable,
seeded three-wolf and ordinary-bandit food rewards, validation, and a local
git commit. Bandit Leader rewards and the broader game balance were explicitly
left unchanged.

### AI-assisted implementation

- Increased the General Goods provision stock from 50 to 70 and added a
  finite 12-provision town restock on location entry, shared by live play,
  campaign simulation, and campaign replay through `CampaignRules`.
- Added high-level progression preparation logic that, when Barenton or Val
  cannot safely support the current deep objective, launches a strategy-sized
  Old Forest Road supply run at 60, 65, or 75 leagues. The progression stage
  remains unchanged, and telemetry distinguishes the supply route, objective
  route, target, route attempts, compact export, and replay actions.
- Changed three-wolf victory to stage exactly 3 Raw Meat. Added a seeded 35%
  ordinary-bandit victory branch that grants 2–4 provisions. Bandit Leader
  content was not modified.
- Updated focused regression fixtures for the new wolf reward and preserved a
  deterministic replay fixture with its intended camp/cooking coverage.

### Manual changes

The human developer supplied the balance guide and requested implementation,
verification, and local commit. No manual code edits were reported.

### Verification and resulting prototype state

The town supply remains finite per stock pool and replenishes only up to the
70-provision merchant cap. A seeded progression smoke case with a 101-league
deep objective produced a marked 65-league Old Forest supply run, without
incrementing a Barenton attempt. Three-wolf victory staged 3 Raw Meat, and a
seeded ordinary-bandit victory granted 2 provisions from the 2–4 branch.

Verified 22 progression assertions, 47 deterministic simulation assertions,
78 campaign/health/Inn assertions, 15 single-expedition replay assertions,
30 campaign-replay assertions, 10 Barenton/Val content assertions, 429
UI/provision/location assertions, and `git diff --check`. The remaining
provision bottleneck is the finite 30-provision default Arthur/Sir Kay party
capacity: a 101-league run can still be target-reduced or require a supply run
when cooking, gold, or merchant stock cannot cover the preferred buffer.

## 2026-08-15 - Current Campaign Progression Simulation

### Goal

Make campaign simulations exercise the current playable route sequence—Old
Forest Road, Fountain of Barenton, and Val sans Retour—then stop, while
preserving the existing repeated-route mode and deterministic replay/export
contracts.

### Human prompt and direction

The human developer supplied the campaign-progression simulation guide and
requested that the existing simulations actually perform the new content,
follow the repository guidance, and be added and committed locally. The guide
explicitly deferred Search for Merlin, live unlock redesign, and broad balance
changes.

### AI-assisted implementation

- Added an explicit `campaignMode: "progression"` state machine with a
  maximum-attempt cap. Old Forest completes only after a safe return at the
  requested target distance; Barenton completes only after safely securing
  Water of Barenton; Val completes only after safely securing Morgan's Token.
  Safe incomplete returns retry their current route, hard failures stop the
  campaign, and successful Val completion stops immediately.
- Set the route before route-specific preparation, including Flask packing,
  and recorded route selection as a replayable town action. Per-expedition
  telemetry now reports route/stage, attempt number, completion status,
  completion reason, and secured quest item.
- Added campaign progression state, route attempt/completion data, quest-item
  security, final stage, route transitions, and compact route summaries. Batch
  telemetry now reports progression funnel rates, attempts by route, cap
  failures, route failure counts, and per-route averages.
- Added the simulation UI campaign-type selector while retaining repeated
  routes. Fresh UI campaign simulations now default Arthur to the authoritative
  full 45/45 health; the explicit starting-health control remains editable.
  Authored non-random simulation strategies recover the existing Old Forest
  Flask discovery when encountered.
- Added 19 focused browser assertions covering progression, retries, hard
  failures, funnel telemetry, compact export, UI selection, route-switch
  replay playback, determinism, Search-for-Merlin exclusion, and starting
  health.

### Manual changes

The human developer supplied the progression guide and requested local
verification and commit. No manual code edits were reported.

### Verification and resulting prototype state

With a Flask available, deterministic cautious and aggressive 101-league
samples completed in three attempts with the route sequence
`old_forest_road -> fountain_of_barenton -> val_sans_retour` and stopped after
Morgan's Token. A seeded random 101-league sample remained a truthful
incomplete baseline after reaching Val and exhausting expedition resources;
no completion-rate tuning was applied.

Verified 19 progression assertions, 10 Barenton/Val content assertions, 45
deterministic simulation assertions, 78 campaign/health/Inn assertions, 15
single-expedition replay assertions, 30 campaign-replay assertions, 429
UI/provision/location assertions, clean local-HTTP production startup, and
`git diff --check`.

## 2026-08-15 - Barenton and Val sans Retour Expedition Content

### Goal

Fill out the two remaining normal Brocéliande expeditions with authored
Arthurian story beats while preserving the current travel pacing, combat
balance, quest-item settlement, simulation determinism, and replay/export
contracts.

### Human prompt and direction

The human developer supplied the Part 2 expedition-content guide and requested
implementation from the latest `main`, focused validation, a build-log entry,
and a local git commit. The guide explicitly deferred Search for Merlin, XP,
global combat/economy rebalance, and broad provision changes.

### AI-assisted implementation

- Added Barenton rumors, the Keeper of Bulls, still-forest and stone-marker
  approach beats, and a deep Perron milestone. Filling Merlin's Flask before
  the ordeal now produces a subtle empty-vessel result; pouring water across
  the stone stages the supernatural storm and aftermath before a balanced
  solo Fountain Knight trial. Water of Barenton is awarded as unsecured loot
  only after victory and settles only on a safe return.
- Added Val sans Retour comfort, delay, false-knight, repeated-road, boundary,
  faithful-lady, chapel, mirror, Great Hall, Morgan's Offer, and return beats.
  Morgan's campfire appearance uses the existing camp-event system; accepting
  comfort can be immediately beneficial while setting route flags. Morgan is
  not a combatant; refusing the deep offer leads to Morgan's Guardian, whose
  deliberate victory reward is unsecured Morgan's Token.
- Added route-aware milestone selection that preserves encounter spacing except
  for the deep guardian threshold needed to resolve a 100-league target, and
  extended the normal travel pool with a restrained mix of forest, weather,
  shrine, stream, shelter, and return content. Existing legacy fountain data
  remains unreachable in production but is retained for old replay/test shape
  compatibility.
- Added Fountain Knight, False Knight, and Morgan's Guardian enemy definitions
  without changing the global combat formula. Simulation strategies now make
  explicit Barenton/Val choices while Random remains seeded and genuinely
  variable. Simulation route selection now carries `expeditionId` into replay.
- Added focused Barenton/Val browser regression coverage and updated the
  encounter-pool count assertion.

### Manual changes

The human developer supplied the content guide and requested implementation,
verification, and a local commit. No manual code edits were reported.

### Verification and resulting prototype state

The two routes now reach their deep milestones near 94–100 leagues in focused
100-league simulations. The sampled full round trips produced 14–18 total
encounters, 0–1 combats, and no content-specific provision failure; the normal
route pool remains mixed with story, forest, weather, recovery, and return
events. Cautious, Random, and Aggressive runs all terminated cleanly, while
the focused deterministic sample safely settled both quest rewards.

Verified 10 Barenton/Val content assertions, 45 deterministic simulation
assertions, 78 campaign/health/Inn assertions, 15 single-expedition replay
assertions, 30 campaign-replay assertions, 429 UI/provision/location browser
assertions, clean local-HTTP production startup, and `git diff --check`.

## 2026-08-15 - Expedition Survivability and Equipment Progression Balance

### Goal

Apply the narrow survivability patch from the balance brief without changing
travel speed, encounter frequency, encounter spacing, provision consumption,
enemy damage, healing amounts, inventory capacity, or future Barenton/Val/XP
content.

### Human prompt and direction

The human developer reported cumulative combat attrition in deep aggressive
campaigns and asked for a modest Arthur health increase, more meaningful armor,
and aggressive-reinvestor prioritization of permanent upgrades over surplus
consumables. The developer explicitly requested local add/commit only, with no
push.

### AI-assisted implementation

- Raised Arthur's authoritative base/max HP from 40 to 45 while leaving Sir
  Kay at 50. Save defaults, sanitization, expedition snapshots, healing, UI,
  campaign state, simulation, and replay continue to read the shared data and
  rules.
- Raised Chainmail Hauberk defense from 3 to 4 and Reinforced Mail defense
  from 5 to 6. Combat still uses the same flat `max(1, rawDamage - defense)`
  mitigation formula; enemy damage and combat tuning were not globally
  reduced.
- Changed only aggressive campaign preparation ordering: required provisions,
  recovery, and minimum Bandages remain protected; an affordable permanent
  Smithy upgrade is then evaluated before discretionary Bandages. Aggressive
  gear comparison uses the authored combat damage/defense definitions and
  gives starter-armor mitigation its repeated-hit value without a scripted
  expedition-number sequence. Non-aggressive purchasing behavior remains
  unchanged.
- Kept campaign expedition execution on `SimulationRunner` and production
  `CombatSystem`; added a small replay comparison tolerance for floating-point
  injury recovery distances so the changed combat progression remains replay
  deterministic without weakening state checks.

### Manual changes

The human developer supplied the balance targets and explicit exclusions. No
manual code edits were reported.

### Verification and resulting prototype state

Representative 50-campaign smoke batches with 100/101-league targets and
100 gold/30 provisions showed aggressive Reinforced Mail purchases on all
sampled campaigns, followed by Knightly Longsword purchases in nearly all
campaigns. Aggressive 101 campaigns averaged about 4.49 combats, 29.11 damage,
and 30.74 ending HP per attempted expedition in the post-change sample; the
same pre-change sample averaged 4.49 combats, 43.76 damage, and 18.52 ending
HP. Cautious remained safer in the comparison sample, with 0 deaths and 49/50
completed campaigns versus aggressive's 1 death and 31/50 completed campaigns;
the remaining aggressive stops were primarily resource exhaustion rather than
Arthur deaths. Starter armor remains materially riskier than Reinforced Mail
in direct 101-league smoke runs.

Focused browser suites passed: simulation (45 assertions), campaign (78),
single-expedition replay (15), campaign replay (30), and location/UI (429).


## 2026-08-15 - Expedition Travel-Scale Rebalance

### Goal

Rebalance the league scale so a 100-league expedition has substantially more
room for authored encounters without making interruptions arrive much more
often in real-world play time or doubling baseline provision pressure.

### Human prompt and direction

The human developer supplied a rebalance guide and asked for a fresh codebase
rescan, implementation, and a local add/commit. The guide explicitly deferred
new Barenton/Val sans Retour content, XP, combat, camping, and unrelated
cleanup.

### AI-assisted implementation

- Rescanned the current travel loop, `ExpeditionRules`, encounter scheduler,
  simulation, campaign simulation, compact export, and replay playback before
  editing.
- Reduced the shared outbound presentation speed from `2.25` to `1.0`
  league/second, approximately 44% of the former progression rate. The return
  multiplier and pace identities remain unchanged.
- Tightened shared encounter rolls from `14–22` to `7–10` leagues and reduced
  the post-encounter safety floor from `8` to `4.5` leagues. Existing weighted
  selection, route/direction filters, occurrence limits, requirements, seeded
  RNG, and minimum/maximum authored distances remain intact.
- Kept provisions distance-based through `ExpeditionRules`; no new time-based
  food cost was introduced. Baseline 100-league round trips therefore retain
  their existing pressure while pace and ration multipliers remain active.
- Updated the production UI assertion and replay coverage fixture for the new
  scale. Simulation, campaign, compact export, and replay continue to consume
  the shared tuning rather than receiving separate rebalance constants.

### Manual changes

The human developer supplied the rebalance targets and scope limits. No manual
code edits were reported.

### Verification and resulting prototype state

The prototype now advances through league distance at approximately 44% of the
former normal rate while rolling encounters in a 7–10 league window. A
representative 32-seed normal batch averaged about 8.3 leagues between outbound
encounters and 9.7 outbound encounters on a 100-league target; the former
configured roll average was 18 leagues, or roughly 5–6 slots. Arthur plus Kay
normal round-trip provision costs remain approximately 13.26, 17.68, and 17.86
for 75, 100, and 101 leagues respectively.

Verified 429 UI/provision/location assertions, 45 deterministic simulation
assertions, 78 campaign/health/Inn assertions, 15 replay assertions, and
`git diff --check`. The changes are intended for a local commit only; nothing
was pushed.

## 2026-08-14 - Campaign Replay Controls, Context, and Fast-Forward Fixes

### Goal

Fix the full Campaign Replay Viewer bugs found in campaign 51-style playback:
keep controls clickable during active playback, preserve town action ordering,
replay Inn cooking through the correct production context, and keep long seeks
and skips responsive without changing deterministic outcomes.

### Human prompt and direction

The human developer supplied the campaign replay bug guide, added the
requirement for yielding long skip/seek operations and a regression harness,
and requested add/commit without pushing.

### AI-assisted implementation

- Mounted campaign replay controls once and changed playback updates to mutate
  stable text, value, disabled, progress, timeline, annotation, and error
  properties instead of rebuilding the control DOM every frame.
- Tagged recorded town actions with the expedition they precede and normalized
  legacy unnumbered actions in order, restoring the sequence of preparation,
  expedition, return/settlement, and the next preparation phase.
- Added explicit crafting production contexts: Inn cooking records `inn`,
  wilderness cooking records `camp`, camp context requires a real expedition,
  and town replay compares recipe, context, ingredients, provisions, gold, and
  item results where recorded. Legacy town `providerId: "campfire"` cooking is
  normalized to the Inn context.
- Reworked campaign `skipTo()` and `seek()` into bounded 120-step batches that
  yield with `setTimeout(0)`. Pause, Play, Restart, Step, Seek, and Exit cancel
  pending work safely while preserving recorded state semantics.
- Expanded the campaign replay browser suite with stable-node, pause/speed,
  skip, Inn/camp cooking, exact Hunter's Stew ingredient, legacy normalization,
  ordering, and long-seek event-loop-yield assertions. Updated replay docs.

### Manual changes

The human developer supplied the bug guide and responsive fast-forward section.
No manual code edits were reported.

### Verification and resulting prototype state

Campaign replay controls remain interactable during fast playback and long
seeks yield back to the browser. Inn preparation actions replay after the
correct return phase, while wilderness cooking remains expedition-scoped.

Verified 23 campaign replay assertions, 15 single-expedition replay
assertions, 45 deterministic simulation assertions, 78 campaign/health/Inn
assertions, 429 UI/provision/location browser assertions, and `git diff
--check`. No balance changes were made. Changes are intended for a local
commit only; nothing was pushed.

## 2026-08-14 - Full Campaign Replay Viewer

### Goal

Upgrade the single-expedition visual replay into a deterministic full-campaign
viewer that shows recorded town preparation between expeditions, including
healing, economy, crafting, equipment, packing, settlement, and the next
expedition, without changing balance or the real save.

### Human prompt and direction

The human developer supplied the full-campaign replay guide, asked that the
existing expedition replay remain working, explicitly deferred human-run
recording, and requested add/commit without pushing.

### AI-assisted implementation

- Extended campaign simulation telemetry with ordered `townActions` and a
  version-2 campaign replay payload containing campaign state, town actions,
  expedition replay entries, settlement context, timeline metadata, and the
  expected ending state.
- Recorded Inn rests/cooking, injury treatment, provision and item purchases,
  sales, crafting, equipment purchase/equip replacement, companion changes,
  pack/Material Bag preparation, town entry, and departure in authoritative
  order. Compact JSON remains analysis-focused and is not used for replay.
- Added `CampaignReplayData.normalize` and `CampaignReplayController` in
  `js/replay.js`. The campaign controller owns town/return sequencing and
  delegates every expedition to the existing `ReplayController` in a nested
  sandbox, preserving normal village, destination, preparation, expedition,
  combat, camp, and summary rendering.
- Added campaign Play/Pause, Restart, Step, 0.25x-8x speed, seek, auto-skip,
  Next Town/Expedition/Purchase/Combat/Camp/Return, campaign-end skip, a
  clickable timeline, phase/resource/equipment status, annotations, final
  state comparison, legacy-payload reconstruction warnings, and structured
  town desync errors.
- Added `tests/campaign_replay_system_test.py` and updated simulation and
  campaign replay documentation.

### Manual changes

The human developer supplied the campaign replay guide and requested local
staging/commit. No manual code edits were reported.

### Verification and resulting prototype state

Campaign Simulation now exposes **Watch Campaign Replay** and optional replay
JSON download beside campaign inspection. A selected campaign can visibly move
through the village economy, Inn, preparation screen, expedition replay,
return summary, and the next town while applying only recorded actions. Older
campaign payloads are accepted through aggregate-action reconstruction and are
marked as legacy/partially reconstructed. Invalid town actions pause with the
campaign expedition number, town step, expected action, and current state.

Verified 14 campaign replay assertions, 15 single-expedition replay
assertions, 45 deterministic simulation assertions, 78 campaign/health/Inn
assertions, 429 UI/provision/location browser assertions, and `git diff
--check`. No balance changes were made.

## 2026-08-14 - Phase 1 Visual Expedition Replay Viewer

### Goal

Add a focused visual replay viewer for one simulated expedition. The viewer
must consume the recorded decision stream, reuse production gameplay rules and
the normal expedition/encounter/camp/combat renderer, sandbox all mutations,
and stop clearly on desync rather than selecting new AI decisions.

### Human prompt and direction

The human developer supplied the Phase 1 replay guide, emphasized deterministic
recorded-decision playback and sandboxing, explicitly deferred campaign replay
and human-run recording, and authorized staging, committing, and pushing the
finished implementation.

### AI-assisted implementation

- Added generic `ReplayData.normalize` and `ReplayController` layers in
  `js/replay.js`. Full simulation runs remain the replay source; Compact JSON
  remains analysis-only.
- Extended the existing replay metadata with expedition ID, companions,
  starting provisions, loadout, packed items and Material Bag contents,
  turnaround configuration, and travel-step information.
- Created an isolated replay player/expedition from the recorded starting
  snapshot and seeded RNG. Replay settlement, crafting, and other mutation
  paths never write localStorage; Exit Replay restores the previous game
  object references and screen.
- Enforced recorded pace/ration, turnaround and emergency-turnaround,
  brief-rest/camp, cooking, camp-event, encounter-choice, leave-camp, and
  combat action/ability/item/target decisions. Invalid or unavailable records
  pause with decision index, expected decision, current state, encounter, and
  combat context.
- Added Play/Pause, Restart, decision Step, 0.25x–8x speed, forward skip,
  restart-and-replay seeking, auto-skip travel, completion comparison, Exit
  Replay, Watch Replay, and Download Replay JSON developer controls.
- Preserved the ordinary expedition, camp, encounter, combat, summary, HUD,
  and gauge rendering rather than creating a telemetry-only replay scene.
- Added focused browser coverage for normalization, sandbox/save isolation,
  deterministic completion, camp/cooking/combat decision enforcement, target
  desync, restart, seek, exit restoration, and invalid decision reporting.

### Manual changes

The human developer supplied the replay guide and requested the implementation
be committed and pushed. No manual code edits were reported.

### Verification and resulting prototype state

The `?sim=1` developer panel can now launch one selected simulation expedition
into a labeled REPLAY session. At normal speed it shows production travel,
encounter choices/results, combat gauges and actions, rest, campfire cooking,
camp events, resource changes, and return/failure presentation. Playback can
be paused, stepped, sped up, skipped, sought by replay decision, restarted, or
exited without changing the real save.

Verified 15 replay assertions, 45 deterministic simulation assertions, 78
campaign/health/Inn assertions, 429 UI/provision/location browser assertions,
and `git diff --check`. Full campaign/town replay and real-human recording
remain intentionally out of scope for Phase 1.

## 2026-08-14 - Compact Campaign Export v2 Size Reduction

### Goal

Reduce redundant and high-volume data in the Compact Campaign JSON export while
preserving its role as the primary analysis artifact and retaining replay seeds,
campaign behavior context, and full JSON/replay behavior.

### Human prompt and direction

The human developer supplied a focused size-reduction guide after the first
Compact Export pass and requested the v2 implementation, verification, and git
commit. The guide explicitly required preserving analytical categories rather
than replacing the export with a shallow summary.

### AI-assisted implementation

- Bumped `compactExportVersion` from 1 to 2 and kept the existing metadata,
  batch summary, campaign, expedition, and notable-event hierarchy.
- Filtered per-expedition `encounters.results` to combat, HP/resource/item/
  material/progression changes, camp, notable, emergency, injury-related, and
  non-default-choice encounters, using a smaller readable shape (`id`, distance,
  direction, choices, combat, HP/resources/items/materials, and exceptional state).
- Removed duplicate campaign aliases and duplicate expedition planning/healing/
  combat fields, kept one canonical pace/ration change location, trimmed state
  snapshots to analytical progression/equipment/material fields, and omitted
  empty/null optional values and zero-only aggregate counters.
- Omitted homogeneous strategy/policy/plan grouping summaries while retaining
  grouping for mixed batches, and added `serializationStats` for kept/dropped
  encounter details.
- Left simulation behavior, telemetry collection, and full JSON/replay exports
  unchanged; updated the Compact Export regression coverage and documentation.

### Verification and resulting prototype state

On a representative 100-campaign, 10-expedition aggressive-101 batch, Compact
JSON measured approximately 23.3 MB in v1 and 15.8 MB in v2 (about 32% smaller),
while full JSON remained approximately 167.2 MB. Verified 77 campaign/health/Inn
assertions, 45 deterministic simulation assertions, 429 UI/provision/location
browser assertions, and `git diff --check`.

## 2026-08-14 - Compact Campaign Analysis Export

### Goal

Add a stable, analysis-oriented Compact Campaign JSON export alongside the
existing full JSON and CSV simulation exports, while preserving the seeds and
identifiers needed for future replay selection.

### Human prompt and direction

The human developer supplied a Compact Campaign Export guide and requested that
the implementation follow the project guidance, use the existing authoritative
campaign telemetry, and update this build log.

### AI-assisted implementation

- Added `CampaignSimulationTelemetry.toCompactJson` (and equivalent
  `toCompact`/`compactToJson` methods) with `compactExportVersion: 1`, batch
  metadata, configuration and seeded-RNG metadata, preserved campaign/expedition
  IDs and seeds, campaign summaries, compact expedition records, and sparse
  notable events.
- Projected existing economy, provisions, crafting, materials, equipment,
  progression, injury, health/rest, travel, encounter, combat, bandit, and
  companion telemetry into stable ID/count/value maps and outcome records.
- Excluded replay decisions, generic event streams, combat action histories,
  encounter/UI text, repeated full state snapshots, and other high-volume
  forensic data from Compact JSON while keeping the full JSON export available
  for forensic inspection.
- Added a developer-panel Compact JSON download and documented the schema/API in
  `CAMPAIGN_SIMULATION.md`.

### Verification and resulting prototype state

Verified 74 campaign/health/Inn assertions, 45 deterministic simulation
assertions, 429 UI/provision/location browser assertions, and `git diff --check`.
The developer panel now offers full campaign JSON, Compact JSON, and both CSV
views from the same completed campaign batch.

## 2026-08-14 - Bandit Chain, Town Crafting, and Simulation Parity

### Goal

Add the next focused gameplay/content pass: a small bandit escalation chain, clearer town crafting and Inn rest interactions, and simulation parity for the authored travel, rest, camp, cooking, loot, and equipment systems.

### Human prompt and direction

The human developer supplied the attached gameplay/UI/content polish guide and requested the completed files be added, committed, and pushed to `main` for testing. The guide called for a small implementation with no automatic balance rebalance.

### AI-assisted implementation

- Added regular Bandit Ambush and conditional Bandit Leader encounters with distinct combat definitions, modest shared loot tables, seeded run-flag eligibility, normal victory settlement, and Fountain of Barenton gating at 90 leagues.
- Added Knightly Longsword and Reinforced Mail as expensive Smithy upgrades, and taught campaign preparation to buy and equip one affordable upgrade when provision needs are covered.
- Moved crafting/cooking progress into the active recipe card, disabled conflicting station actions while busy, added a town Inn Cook tab using the real campfire recipes/material mutations, and added a centralized 2.2-second Inn rest completion delay with completion-only healing and charging.
- Updated Strong Tonic to produce two items and reduced only the campfire visual; removed the large summary emblem and added modest mobile town touch/readability rules.
- Extended single-expedition and campaign simulations with explicit travel-setting handling, Inn cooking, equipment purchasing, bandit combat/eligibility/loot telemetry, and replay/CSV fields while retaining seeded production rules and no simulator-only healing.
- Added focused browser assertions for rest/craft delays, Bandit content, Fountain gating, Inn cooking, campaign persistence, Strong Tonic output, and deterministic bandit simulation behavior.

### Verification and resulting prototype state

The prototype now presents active town work in its owning card, completes Inn recovery through the real healing rule, and lets seeded campaign simulations make the same authored travel, camp, cooking, combat, and loot decisions as production. No existing global balance constants were rebased.

Verified 429 UI/provision/location browser assertions, 45 deterministic simulation assertions, 73 campaign/health/Inn assertions, and `git diff --check`.

## 2026-08-14 - Focused Expedition Injury HUD Cleanup

### Goal

Make persistent injury information quiet and readable during travel while removing empty or competing injury UI from expedition interruption states.

### Human prompt and direction

The human developer requested the next focused expedition-HUD polish pass for injury presentation and asked for the completed files to be added and committed locally.

### AI-assisted implementation

- Removed the empty injury panel and its "No persistent injuries" message when Arthur and the active party are healthy.
- Added a compact, wrapped injury row for ordinary traveling and paused-travel states only, using authored readable injury names and muted amber for recoverable injuries or muted rust for serious Deep Cut, Poisoned, and Infection states.
- Kept detailed injury descriptions, recovery status, and treatment controls in town panels, while keeping encounter choice/pending/result, camp, and combat presentation free of compact injury UI.
- Added regression coverage for healthy, single/multiple-party injuries, paused travel, camp, active encounter priority, combat suppression, and 320–430px portrait layouts.

### Verification and resulting prototype state

Travel now shows injury context only when it is actionable and relevant to route decisions; encounter and interruption screens retain their status-first hierarchy without blank reserved space. No injury mechanics or balance values changed.

Verified 425 UI/provision/location browser assertions, 44 deterministic simulation assertions, 68 campaign/health/Inn assertions, and `git diff --check`.

## 2026-08-14 - Corrective Injury Recovery and Expedition Rest Pass

### Goal

Correct the latest 75-league simulation issues without changing global combat, encounter, reward, economy, or provision balance.

### Human prompt and direction

The human developer supplied a corrective mechanics guide covering useless bot rests, cautious camp preference, natural injury recovery, Deep Cut infection, treatment acceleration, persistent injury migration, and single-count injury telemetry, then requested a local add/commit.

### AI-assisted implementation

- Converted persistent injuries to normalized instances with one seeded recovery-distance roll for Sprained Ankle, Bruised Ribs, and Deep Cut, while migrating legacy injury-ID arrays safely.
- Added travel-based recovery, Camp/Inn recovery acceleration, Deep Cut's one-time 12-league infection check at 25%, the distinct Infection status, and metadata-driven medical treatment coverage.
- Prevented zero-benefit Brief Rests and unsafe optional rests in simulation policy; Cautious now prefers a reasonable Camp Rest for Exhaustion and all strategies avoid useless full-health rests.
- Removed the duplicate injury-gain event path and added natural recovery, infection, stabilization, recovery-distance, and corrected exhaustion telemetry to single-expedition and campaign exports/replays.
- Updated injury UI feedback and incremented the save schema from 10 to 11 with legacy migration support.

### Verification and resulting prototype state

The production expedition, rest, camp, town-treatment, and campaign flows now preserve injury instances, advance recoveries deterministically, surface meaningful recovery/infection feedback, and retain one telemetry record per applied injury. No balance values outside the requested recovery/infection/treatment mechanics were changed.

Verified 416 UI/provision/location browser assertions, 44 deterministic simulation assertions, 68 campaign/health/Inn assertions, and `git diff --check`.

## 2026-08-14 - Expedition Status Grid Cleanup

### Goal

Reduce expedition HUD density by making Unsecured Loot a normal sixth status cell and moving its detailed breakdown into Expedition Details.

### Human prompt and direction

The human developer supplied an attached expedition-HUD cleanup guide and requested a narrowly scoped local add/commit without changing the recently polished route, Journey, Camp, dialogue, combat, or reward UI.

### AI-assisted implementation

- Updated the shared expedition resource renderer to use six consistent two-column status cells: Distance, Max reached, Provisions, Health, Material Bag, and Unsecured Loot.
- Replaced the old full-width unsecured breakdown with compact physical-plus-gold values such as `3`, `12g`, and `3 + 8g`.
- Preserved detailed item/material/gold chips inside Expedition Details under an explicit `Unsecured: ...` summary, and removed obsolete unsecured-row presentation CSS.
- Added browser coverage for zero, mixed, gold-only, physical-plus-gold, encounter-result, Camp, and expanded-details states.

### Verification and resulting prototype state

Expedition Status now remains a compact 2 × 3 grid across active travel, encounter results, and Camp. The Journey section moves directly below it, while detailed at-risk discoveries remain available on demand.

Verified 415 UI/provision/location browser assertions, 26 deterministic simulation assertions, 66 campaign/health/Inn assertions, and `git diff --check`.

## 2026-08-14 - Intrinsic Dialogue Continue Action

### Goal

Correct the remaining dialogue hierarchy issue by stopping simple Continue actions from stretching across the dialogue copy column while preserving wide, comfortable player-choice buttons.

### Human prompt and direction

The human developer supplied a dialogue-only correction guide identifying the overlapping shared `width: 100%` rule and requested CSS cleanup, narrow/normal portrait verification, and a local add/commit.

### AI-assisted implementation

- Removed the obsolete shared dialogue-action width block and consolidated the subdued action treatment into one focused section.
- Made `.dialogue-continue` intrinsic-width, right-aligned, and minimum 7.5rem wide while retaining a 36–40px touch target.
- Kept `.dialogue-choice` buttons full-width for readable wrapping and comfortable choice selection, without changing encounter or other gameplay buttons.
- Added browser checks for normal-viewport Reeve and Blacksmith Continue actions, narrow-phone Continue sizing, and full-width multi-choice buttons.

### Verification and resulting prototype state

Simple Continue now sits as a modest right-aligned action beneath the dialogue text at both normal and narrow portrait sizes. Player-choice buttons remain wide and touch-friendly.

Verified 415 UI/provision/location browser assertions and `git diff --check`.

## 2026-08-14 - Dialogue Action Weight Tweak

### Goal

Reduce the visual dominance of dialogue Continue and choice buttons while preserving phone-friendly touch targets, readable dialogue text, and the existing dialogue card layout.

### Human prompt and direction

The human developer requested one final dialogue-only polish tweak and asked that unrelated UI remain unchanged, followed by a local add/commit.

### AI-assisted implementation

- Scoped quieter oxblood styling, smaller typography, reduced vertical padding, a softer border, and no hover glow to `.dialogue-continue` and `.dialogue-choices .game-button` only.
- Kept global focus and pressed behavior intact, retained full-width actions, and allowed wrapped multi-choice labels to grow naturally.
- Added browser checks for short Reeve dialogue, short Blacksmith dialogue, and multi-choice dialogue action sizing and visual treatment.

### Verification and resulting prototype state

Dialogue text remains the focal point, with Continue and choice actions reading as modest but clearly interactive controls in the 36–40px range. The dialogue card, encounter buttons, and other gameplay buttons are unchanged.

Verified 414 UI/provision/location browser assertions and `git diff --check`.

## 2026-08-14 - Corrective Dialogue and Reward Presentation Pass

### Goal

Repair the dialogue regression and make a focused cleanup pass over crafting cards, Camp actions, capacity-limited rewards, animal result wording, encounter spacing, and Journey Log prose without changing the expedition systems.

### Human prompt and direction

The human developer supplied a corrective cleanup guide after dialogue sizing was damaged by the previous UI pass and requested the local changes be added and committed. The guide required natural dialogue sizing, touch-friendly crafting actions, an external opaque Camp footer, generalized material reward lookup, clear partial/full capacity feedback, clean combined Journey Log entries, and no zero-discovery presentation.

### AI-assisted implementation

- Removed the dialogue card's fixed height while retaining readable typography, bounded long-copy scrolling, choice containment, portraits, and touch actions.
- Increased crafting card spacing and made Craft/Cook actions touch-sized while keeping ingredient chips and cooking-only output labels.
- Moved Leave Camp outside the Camp scroller into a full-width opaque divided footer, reduced encounter-result dead space, and preserved the expedition action-bar pattern.
- Routed material rewards through `MaterialRules.definition()`, including Raw Meat, added partial/overflow capacity status, filtered zero rewards, and replaced raw discovery labels with concise acquisition prose.
- Combined encounter narrative and reward details into one cleaned Journey Log entry, normalized resource/rope/path language, and removed misleading animal “secures” wording.
- Expanded location browser assertions for natural dialogue sizing, external Camp structure, touch-sized crafting, ingredient reward fallback, partial/full capacity handling, and Journey Log cleanup.

### Manual changes

The human developer supplied the corrective cleanup guide and requested the local add/commit. No additional manual code edits were reported.

### Verification and resulting prototype state

Dialogue now grows to its content without a large dead area, Camp actions remain visible as a stable bottom shelf, animal rewards explain what was collected or left behind, and Journey history reads as concise player-facing prose rather than internal reward operations. Existing expedition, combat, crafting, save, and simulation behavior remains intact.

Verified 410 UI/provision/location browser assertions, 26 deterministic simulation assertions, 66 campaign/health/Inn assertions, clean local-HTTP production-page startup through the browser flow, and `git diff --check`.

## 2026-08-14 - Focused UI/Content Polish Pass

### Goal

Make one more focused phone-first polish pass over dialogue, crafting, expedition state, camp actions, Journey history, combat targeting, and animal rewards without changing save compatibility or introducing new runtime dependencies.

### Human prompt and direction

The human developer supplied an attached guide requesting more readable dialogue, clearer crafting hierarchy, opaque sticky camp actions, balanced expedition actions, route/state banners, a real current-run Journey Log, live-gauge combat target selection, and Raw Meat rewards for victorious wolves and boars. Existing simulation parity, touch targets, the Material Bag/cooking loop, Combat Log separation, and local Git add/commit were preserved; no push was requested.

### AI-assisted implementation

- Added transient shared `JourneyLog` state with meaningful entries for encounters, rewards, provisions, path changes, return, camp, rest, and cooking/crafting, plus a compact closed preview and bounded expanded history on travel, camp, and encounter panels.
- Removed the active travel panel's repeated Chapter III/large route title and made the visual banner identify route plus Traveling Outbound, Paused, Returning, or Camped state. Rebalanced expedition actions to a roughly two-thirds primary / one-third Return split and made the camp footer fully opaque.
- Increased dialogue body readability while reducing action height, added spacing and hierarchy to crafting cards, and hid redundant item output labels while retaining cooking provision output labels.
- Allowed persistent enemy target selection during live combat gauges while preserving explicit enemy/ally targeting rules. Wolves now stage 2 Raw Meat and Wild Boar stages 3 Raw Meat through existing data-driven reward handling; flee remains rewardless, including the camp wolf combat branch.
- Extended browser assertions for the new HUD, Journey Log, sticky footer, action proportions, live target selection, crafting labels, and animal reward outcomes.

### Manual changes

The human developer supplied the attached next-pass guide and requested the local add/commit. No additional manual code edits were reported.

### Verification and resulting prototype state

The prototype now presents route context directly in the expedition artwork, keeps action controls readable and anchored, exposes a useful current-run history without gauge spam, and turns animal victories into cookable expedition materials while preserving existing settlement rules.

Verified 405 UI/provision/location browser assertions, 26 deterministic simulation assertions, 66 campaign/health/Inn assertions, clean local HTTP startup through the browser flows, and `git diff --check`.

## 2026-08-14 - Focused Mobile UI/UX Polish Pass

### Goal

Improve readability, spacing, interaction hierarchy, and phone-first navigation across the current game without redesigning systems, changing save compatibility, or adding art/audio.

### Human prompt and direction

The human developer supplied a focused UI/UX guide covering dialogue and NPC spacing, contained crafting requirements, simplified active Journey controls, a shorter Return label, unmistakable combat targeting, balanced Rope obstacle outcomes, lower Combat Log placement, artwork-ready destination visuals, sticky Camp navigation, and larger tertiary typography. Existing functionality, simulation parity, dark green/blue-green with cream/gold and oxblood styling, and portrait mobile layout were explicitly preserved. A local Git add/commit was requested; no push was authorized.

### AI-assisted implementation

- Added shared spacing corrections for dialogue copy/actions and Hall/Inn NPC cards, then raised the affected tertiary text sizes for resources, Journey, crafting, expedition details, and combat metadata.
- Replaced joined crafting separators with wrapping ingredient and gold requirement chips. The shared renderer covers Blacksmith, Apothecary, and camp recipes, with missing ingredients retaining oxblood emphasis.
- Hid editable Pace/Rations controls while travel is active, restored them while paused, renamed the expedition action to `Return`, and made Camp tabs plus Leave Camp persistent inside the Camp scroller.
- Removed destination name/description overlays from the Hall, Inn, Blacksmith, Merchant, and Apothecary visual frames while retaining the emblem and interaction header identity.
- Added a strong selected combat target border/glow and `TARGET` badge while toning down merely selectable enemies.
- Added data-driven Rope loss outcomes for Fallen Tree, Woodland Stream, and Broken Bridge at 12%, 16%, and 18%. Fallen Tree and Woodland Stream reuse their existing seeded obstacle roll so unrelated simulation sequences remain stable; all losses still use the existing consumed-item and encounter telemetry path.
- Extended the browser regression coverage for the new active/paused Journey states, contained crafting chips, destination visuals, Camp sticky navigation, combat target badge, and Rope retention/loss branches.

### Manual changes

The human developer supplied the attached polish guide and requested the local add/commit. No additional manual code edits were reported.

### Verification and resulting prototype state

The prototype now presents a calmer, more readable phone UI while preserving the current systems and palette. Active travel is concise, paused travel is configurable, camp navigation remains available while browsing recipes, and selected combat targets are immediately legible. Rope remains a favorable obstacle tool but can be sacrificed in authored crossings.

Verified 394 UI/provision/location browser assertions, 26 deterministic simulation assertions, 66 campaign/health/Inn assertions, clean local HTTP startup through the browser flows, and `git diff --check`.

## 2026-08-13 - Expedition Material Bag and Field-Cooking Parity

### Goal

Separate expedition materials from the six-slot utility Pack, make found materials immediately usable at camp, and carry the authored material/cooking behavior through single and campaign simulations without changing balance.

### Human prompt and direction

The human developer supplied a focused inventory/crafting guide requesting a ten-unit Material Bag, secured versus unsecured material settlement, same-expedition cooking/crafting access, UI visibility, simulation/campaign persistence, telemetry/replay coverage, and deterministic tests. Recipe definitions, loot rates, combat, provisions, and economy were explicitly left unchanged. The requested commit should be local only; no push was authorized.

### AI-assisted implementation

- Added `MaterialRules` and a centralized ten-unit expedition Material Bag. Ingredient and crafting-material IDs are removed from the normal Pack, legacy saves migrate them from `ownedItems`, town selections become secured bag contents, and expedition-found materials enter the unsecured bag with explicit overflow telemetry.
- Routed loot, encounter requirements, crafting/cooking consumption, expedition settlement, and return/failure handling through the shared bag rules. Remaining found materials secure only on a successful return; consumed ingredients remain consumed on either outcome.
- Added preparation, travel, and camp Material Bag presentation with capacity usage, secured/newly found contents, and material selection controls while preserving the existing six-slot utility Pack.
- Extended simulation and campaign replay/telemetry with bag snapshots, capacity, found/rejected/returned/lost materials, bag changes, consumed ingredients, and recipe input/output state. Campaign state continues to carry materials, recipes, health, provisions, consumables, and gold between expeditions.
- Added focused browser coverage for save migration, bag capacity and classification, found-material cooking, success/failure settlement, production simulation parity, campaign persistence, replay fields, CSV fields, determinism, and native-random guards.

### Manual changes

The human developer supplied the inventory/crafting guide and requested the local add/commit. No additional manual code edits were reported.

### Verification and resulting prototype state

The prototype now keeps utility gear in the six-slot Pack and ingredients/crafting materials in a ten-unit Material Bag. Newly found materials can be cooked or crafted during the same expedition, while settlement preserves the existing success/failure rules. No recipe, loot, combat, provision, or economy tuning values were changed.

Verified 391 UI/provision/location browser assertions, 26 deterministic simulation assertions, 66 campaign/health/Inn assertions, clean local HTTP startup through those browser flows, no simulation-local `Math.random()` calls, and `git diff --check` before commit.

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

## 2026-08-13 - Brocéliande Destination Text Deduplication

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

## 2026-08-13 - Brocéliande Destination Hero Ratio Adjustment

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

## 2026-08-13 - Brocéliande Destination Visual Cleanup

### Goal

Make two small presentation-only cleanup changes in the current Brocéliande implementation: clarify empty companion slots and make destination/interior hero visuals explicit 16:9 artwork frames.

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

## 2026-08-13 - Brocéliande Mobile Preparation Flow Polish

### Goal

Make the existing Brocéliande dialogue and expedition preparation screens easier to use on portrait phones without changing story content, saved campaign state, simulation behavior, or toast behavior.

### Human prompt and direction

The human developer supplied a focused mobile UX guide requesting a substantially darker translucent dialogue backdrop and a compact four-step preparation flow: Route, Gear & Pack, Company & Supplies, and Review & Depart. The guide also required persistent preparation state, top Village escape, bottom Back/Continue controls, scroll reset on step transitions, mobile overflow checks, regression coverage, and a local commit without pushing.

### AI-assisted implementation

- Added transient `game.preparationStep` navigation for the four preparation stages while keeping equipment, pack, route, companion, and provision mutations on their existing handlers and save model.
- Split the unified preparation renderer into isolated Route, Gear & Pack, Company & Supplies, and Review & Depart views with a compact stepper, Arthur/companion summary, route danger, loadout, pack, provision, and travel-speed review details.
- Added step-aware Back/Continue controls, reset preparation scroll when changing stages, retained top Village escape on every stage, and preserved scroll while editing equipment, pack, company, or provisions.
- Strengthened the dialogue backdrop to a 70–78% dark translucent gradient while preserving the centered responsive card, click prevention, and existing dialogue content.
- Extended the location browser regression flow for step isolation, state persistence, mobile footer visibility, review navigation, and the stronger backdrop assertion.

### Manual changes

The human developer supplied the mobile UX polish guide and requested another local Git commit. No manual code edits were reported.

### Resulting prototype state

Brocéliande preparation is now a compact guided flow that remains compatible with the existing expedition state and mobile scrolling behavior. Dialogue scenes read more clearly against the artwork while remaining visibly translucent and responsive.

### Verification

Verified 357 UI/provision/location browser assertions, 16 deterministic simulation assertions, 65 campaign/health/Inn assertions, clean production startup through the browser regression server, and `git diff --check`. Changes were committed locally; no push was performed.

## 2026-08-13 - Brocéliande Dialogue and Notification Polish

### Goal

Polish the existing Brocéliande dialogue and notification presentation without changing the dialogue architecture, village layout, or story content.

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

## 2026-08-13 - First Brocéliande Campaign Structure

### Goal

Establish the first data-driven Brocéliande campaign structure while keeping the chapter content intentionally thin and compatible with the existing expedition, encounter, village, save, preparation, combat, and simulation systems.

### Human prompt and direction

The human developer supplied a structural campaign guide requesting three selectable normal expeditions, one prerequisite-locked Search for Merlin route, skull danger ratings, campaign-item progression, conditional Fountain and Val sans Retour encounters, a two-companion party with Llamrei, a central Hall, reusable RPG dialogue, first-entry onboarding, safe save migration, automation support, regression coverage, and a commit without pushing.

### AI-assisted implementation

- Added data-driven Old Forest Road, Fountain of Barenton, Val sans Retour, and Search for Merlin expedition definitions. Preparation now preserves loadout state while selecting routes, renders restrained SVG skull danger ratings, shows missing campaign prerequisites, and launches the selected route.
- Added protected unique campaign items for Merlin's Flask, Water of Barenton, and Morgan's Token, plus conditional Fountain content, Old Forest Road Flask/Llamrei discoveries, Morgan's Voice, a summoned guardian combat placeholder, and a 100–125 league Merlin placeholder encounter.
- Expanded party state to two companion slots with legacy single-companion migration. Added capability-driven Llamrei behavior, provision and travel bonuses, Kick/Charge combat content, restricted human actions, and non-permanent defeat handling.
- Added The Hall and Reeve content, moved the Apothecary southeast, and introduced reusable data-driven dialogue sequences with portrait placeholders, choices, explicit effects, mobile-sized overlay controls, and a five-node first-entry introduction.
- Added the fresh-save Hall-only village gate, immediate intro save/unlock behavior, campaign prerequisite helpers, route-aware encounters, and multi-party simulation/campaign telemetry and planning support.
- Expanded browser regression coverage for route structure, campaign items, conditional outcomes, three-member parties, Llamrei capabilities and travel, Hall onboarding, dialogue choices, and migration compatibility.

### Manual changes

The human developer supplied the campaign structure guide and requested a commit without pushing. No manual code edits were reported.

### Resulting prototype state

Brocéliande now has a playable structural campaign loop: a new save enters through The Hall, the three normal routes can be explored freely, the first campaign key items can be secured through thin placeholder content, and Search for Merlin becomes available once both prerequisites are owned. Final encounter writing, Morgan's identity and boss design, Merlin's finale, Llamrei balance, exact distances, and portraits remain intentionally tunable placeholders.

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

## 2026-08-13 — Combat Hit Flash Lifecycle Fix

### Goal

Stop combat nameplates from replaying the red hit animation whenever the combat panel rerenders for a ready turn, submenu, or target-selection action.

### Human prompt and direction

The human developer reported that a nameplate correctly flashed when attacked but continued flashing after unrelated combat actions. The requested scope was to identify and fix the UI state lifecycle, preserve the intentional hit feedback, add regression coverage, and commit/push the fix.

### AI-assisted implementation

- Traced the behavior to `lastHitEvent` remaining truthy after the initial hit, while `renderCombatant` reapplied the `.was-hit` CSS animation on every full combat-panel render.
- Changed nameplate rendering to consume the hit marker after emitting one `.was-hit` class, so the 220ms flash remains visible for the hit render but cannot restart on later menu, target, or ready-state updates.
- Added a browser regression assertion that verifies the attacked nameplate flashes once and is clear on the next render.

### Manual changes

The human developer supplied the observed UI regression and commit/push authorization. No manual code edits were reported.

### Resulting prototype state

Combat hit feedback remains immediate and readable, while Abilities, Items, target selection, and turn-ready rerenders no longer replay stale damage flashes.

### Verification

Verified 264 UI/provision/location browser assertions, 16 deterministic simulation assertions, 65 campaign/health/Inn assertions, and `git diff --check`.

## 2026-08-13 — Upper-Viewport Toast Placement

### Goal

Move transient toast feedback out of the lower interactive area and into passive upper viewport space without changing the existing notification system.

### Human prompt and direction

The human developer confirmed that bottom-center toasts looked good but could cover shop items, expedition options, and other controls during actual play. The requested fix was limited to upper placement below the permanent header, downward entrance motion, upward dismissal, portrait safety, and short-viewport verification.

### AI-assisted implementation

- Changed only the toast overlay anchor from the lower viewport to a top-center position with a safe header-clearing offset. The overlay remains outside document flow and pointer-transparent.
- Reversed the entrance motion so new toasts fade and slide slightly downward into place; retained the existing upward fade-out, timeout, reduced-motion handling, semantic types, API, and three-toast cap.
- Added browser assertions across the intended portrait sizes and a shorter viewport to confirm the toast stack stays inside the viewport, clears the permanent header, and does not obscure the location title card.

### Manual changes

The human developer supplied the placement correction and viewport requirements. No manual code edits were reported.

### Resulting prototype state

Temporary feedback now occupies upper visual space below the game header, leaving the lower shop, preparation, and expedition controls available while notifications are visible.

### Verification

Verified 263 UI/provision/location assertions, 65 campaign/health/Inn assertions, 16 deterministic simulation assertions, and `git diff --check` after the CSS and viewport-test change.

## 2026-08-12 — Reusable Toast Notifications

### Goal

Replace temporary inline action confirmations with a reusable, layout-neutral notification layer that supports crafting, commerce, healing, preparation, and combat consumable feedback.

### Human prompt and direction

The human developer reported that the new crafting flow exposed an inline Apothecary confirmation that changed page height and supplied a guide requesting a lightweight, portrait-safe toast system with stacking, semantic types, accessible announcements, cleanup, and regression coverage. The guide also asked that dialogue and decision-critical information remain persistent UI.

### AI-assisted implementation

- Added `js/toast.js` with the global `showToast({ title, message, type, duration })` API and `ToastNotifications` lifecycle controls. Toasts render in a persistent overlay, use safe text nodes, cap visible notifications at three, remove expired entries, and provide normal, success, warning, and major styling hooks.
- Added the portrait viewport toast region and dark green/gold presentation in `index.html` and `css/style.css`, including reduced-motion behavior, ARIA live-region semantics, and pointer-event isolation so bottom controls remain usable.
- Converted Apothecary crafting, merchant buying/selling, provision purchases, Inn rest results, equipment changes, pack/party changes, and combat consumable use toasts. Blocked craft, purchase, provision, sale, and rest attempts now explain actionable failures where the action can be invoked.
- Kept NPC dialogue, encounter outcomes, combat state, expedition discoveries, and the final expedition report as persistent UI because those messages require reading, context, or player decisions. Renamed the remaining destination message state to `dialogueMessage` so it does not compete with the toast API.
- Expanded browser assertions for craft success/failure, buy/sell/rest feedback, overlay layout stability, portrait containment, stacking limits, and timer cleanup.

### Manual changes

The human developer supplied the toast behavior, visual, accessibility, and migration requirements. No manual code edits were reported.

### Resulting prototype state

Transient feedback now appears as compact animated overlays that survive screen rerenders without shifting game content. Future gameplay code can call the same semantic API without creating page-flow status markup.

### Verification

Verified 253 UI/provision/location assertions, 65 campaign/health/Inn assertions, 16 deterministic simulation assertions, clean production startup over local HTTP, and `git diff --check`.

This log documents the AI-assisted development of **Quest for the Holy Grail**, an HTML5 prototype being created for an AI-assisted game prototype competition. Entries focus on meaningful milestones, the human direction provided, the AI-assisted work performed, any manual changes, and the resulting state of the prototype.

## 2026-08-12 — Campaign Automation Consumable Purchasing

### Goal

Make repeated campaign automation buy and carry usable combat consumables through the authored shop and pack systems, while preserving healing/provision priorities, utility gear, finite stock, and deterministic simulation behavior.

### Human prompt and direction

The human developer reported that automation never purchased items and supplied the next item-focused upgrade guide. It requested strategy-aware Bandage targets, real shop spending and stock, exact pack quantities, combat use, generic purchase/use/return telemetry, regression coverage, and a finished commit and push.

### AI-assisted implementation

- Added finite Bandage stock and a shared `EconomyRules.buyItem`/`CampaignRules.buyItemsTo` path used by both the normal shop and campaign preparation. Purchases deduct authored gold costs, reduce session/campaign stock, and record shortfalls without ending a viable expedition.
- Added deterministic strategy targets: Aggressive prefers 3 (minimum 1), Cautious prefers 2, and Random makes a seeded 0–2 purchase decision. Healing and provisions are funded first, with a small rest-cost reserve protecting the next Inn action.
- Preserved existing packed utility items and six-slot capacity, added Bandages only when space exists, and passed exact item quantities through `ExpeditionRules` into simulation combat. Existing Bandage use and settlement remain authoritative.
- Added run, expedition, campaign, batch, JSON, and CSV telemetry for item purchases, gold by item, packed/consumed/returned inventories, Bandage counts, healing, and aggregate item spending. Updated the campaign and player-facing documentation.
- Added focused browser assertions for shop price/stock, strategy targets, pack preservation, campaign purchase telemetry, exact simulation quantities, and consumable settlement.

### Manual changes

The human developer supplied the strategy targets, purchasing priorities, capacity/stock constraints, telemetry requirements, and Git authorization. No manual code edits were reported.

### Resulting prototype state

Automated campaigns now participate in the same item economy as the player: they can buy stocked Bandages, carry the selected quantity into combat, consume them through the existing ATB item flow, and expose every material resource change for deterministic analysis. Utility gear and provision-safe departure planning remain intact.

### Verification

Verified 65 campaign/health/Inn assertions, 219 UI/provision/location browser assertions, 15 deterministic simulation assertions, and `git diff --check`.

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

## 2026-08-12 — Combat Abilities and Items Pass

### Goal

Add the next focused combat interaction layer without replacing the existing ATB, multi-enemy, expedition, or campaign architecture: character-specific abilities, equipment-granted Pommel Strike, functional combat Items, Bandage healing, friendly targeting, and corrected Intercede duration.

### Human prompt and direction

The human developer requested a rescan of the newest repository state and implementation of the attached combat guide. The pass was explicitly constrained to a small, data-driven proving ground with no new content systems, large UI redesign, or extra abilities/items.

### AI-assisted implementation

- Added consistent Attack / Defend / Abilities / Items / Flee top-level actions with paused Abilities and Items submenus, reusable Back/Cancel transitions, and enemy or ally plate targeting.
- Added generic ability gathering from innate definitions and equipped weapon, armor, and relic effects. The Iron Longsword now grants Pommel Strike through `grantedAbilityIds`; the ability uses tunable reduced weapon damage and clamped gauge pushback.
- Added data-defined combat effects for Bandages. The Items submenu reads carried expedition quantities, heals one living injured ally for 8 HP without overhealing or reviving, and immediately records consumption through shared expedition inventory rules.
- Kept combat HP synchronized with expedition Arthur health and run-specific companion HP, and separated persistent Intercede duration from one-ready-state Defend expiry. Intercede now remains until it redirects one applicable Arthur attack, incapacitation, or combat resolution.
- Updated deterministic simulation strategies to use Pommel Strike and Bandages in simple health/gauge situations. Run, combat, campaign, JSON, CSV, and aggregate telemetry now expose ability uses, item uses, healing performed, and gauge control.
- Added focused browser assertions for equipment grants, no-grant loadouts, submenu pause/back behavior, multi-enemy Pommel targeting and gauge clamping, Bandage healing/consumption/friendly targeting, and Intercede persistence. Existing location, simulation, and campaign coverage remains intact.

### Manual changes

The human developer supplied the combat interaction goals, tuning ranges, data-driven boundaries, target-selection semantics, inventory/HP persistence requirements, and commit/push authorization. No manual code edits were reported.

### Resulting prototype state

Combat now offers meaningful ATB decisions without expanding the action grid: Arthur can manipulate a nearly-ready enemy with Pommel Strike or spend a turn treating an injured ally with a real packed Bandage, while Kay's Intercede behaves as a one-interception defensive effect. Automated expeditions and campaigns exercise and report these choices for later balance tuning.

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

## 2026-08-12 — Provision-Safe Simulation Planning and Repeatable Inn Rest

### Goal

Reduce avoidable simulation provision exhaustion through deterministic departure and return planning, while allowing both players and campaign policies to repeat the existing shared Inn action when more healing is appropriate and affordable.

### Human prompt and direction

The human developer requested fixed first-pass encounter reserves ordered Cautious above Random above Aggressive, a known-state emergency food turnaround, replay and aggregate telemetry, repeatable 10 HP/3 gold Inn rests, no changes to protected provision, reward, combat, health, healing, or strategy-choice balance, and a finished commit and push.

### AI-assisted implementation

- Added deterministic expected encounter-cost reserves of 4 provisions for Cautious, 3 for Random, 2 for Aggressive, and 3 for Greedy. Campaign requirements now report passive round-trip food, policy margin, configured/used encounter reserve, and total estimated provisions.
- Planning retains the existing preference fallback hierarchy: it can drop the policy margin and, only as a last resort, the encounter reserve before declaring a true inability to launch a minimal expedition.
- Added an outbound emergency turnaround that compares only current distance, current provisions, the snapshotted party consumption multiplier, passive return cost, and the strategy reserve. It never reads future encounter identity, spacing, outcomes, costs, or loot.
- Added run, replay, expedition, campaign, CSV, and batch telemetry for original/departure targets, passive estimates, reserves, total requirements, emergency trigger/distance, actual turnaround, and provision-exhaustion failures.
- Confirmed the player-facing Inn already supports repeated production rests through its existing click/save/rerender loop, and added explicit coverage for three consecutive rests, separate 3 gold charges, party caps, full-health blocking, and insufficient-gold blocking.
- Expanded campaign policy healing to repeat `HealingRules.restAtInn` while party health remains below the policy target and gold remains available. Every applied or failed attempt stays in `restActions`; no alternate healing formula was added.
- Added focused assertions for reserve ordering and planning impact, emergency known-state behavior and replay, multiple player/campaign rests, shared-rule equivalence, telemetry/CSV fields, and preserved deterministic behavior.
- Verified 52 campaign/health/Inn assertions, 209 UI/provision/location browser assertions, 9 deterministic simulation assertions, and `git diff --check`.
- Ran 100 ten-expedition campaigns per strategy at desired distance 75 with 20 starting gold and 15 provisions. Random with the conservative policy completed 95%, died 0%, exhausted provisions 5%, and averaged 35.77 actual distance. Aggressive with aggressive-reinvestor completed 64%, died 26%, exhausted provisions 10%, and averaged 60.51 distance. Emergency turnaround averaged 0.05 activations per Random campaign and 0.11 per Aggressive campaign. No follow-on tuning was made.

### Manual changes

The human developer supplied the reserve ordering, emergency-turnaround boundaries, repeatable-rest requirements, prohibited balance changes, batch request, and Git authorization. No manual code edits were reported.

### Resulting prototype state

Campaign preparation now budgets for ordinary encounter pressure rather than only passive travel, and expeditions can abandon an overextended outbound target using current food state before exhaustion becomes inevitable. Random is broadly sustainable in the measured batch, while Aggressive remains longer-ranging and primarily constrained by combat death. Inn recovery remains one production action that can be repeated by either a player or an automated policy, with every rest independently charged and persisted.

## 2026-08-12 — Combat Menu Integration Fix Pass

### Goal

Repair the focused combat submenu and target-selection integration bugs without changing the broader combat design or balance.

### Human prompt and direction

The human developer reported that Abilities and Items changed combat state without redrawing, target Cancel lost its originating submenu, and ally prompts were too specifically worded. The requested scope was limited to state transitions, generic prompting, browser coverage, and regression verification.

### AI-assisted implementation

- Centralized combat interaction-result handling in `game.js` so menu transitions, target selection, unavailable states, and resolutions all update the rendered combat panel immediately.
- Added generic target-selection return state and cleanup. Attack Cancel returns to Main, Pommel Strike Cancel returns to Abilities, and Bandage Cancel returns to Items without consuming gauges, damage, or inventory.
- Added data-defined selection prompts for attack, Pommel Strike, and Bandages, with generic ally/enemy fallbacks for future actions.
- Added browser integration assertions that click the rendered Abilities and Items controls, verify submenu redraws, exercise both target Cancel paths, and confirm basic Attack still returns to Main.

### Manual changes

The human developer supplied the reported integration failures, desired state transitions, prompt generalization, and commit/push authorization. No manual code edits were reported.

### Resulting prototype state

Combat submenu navigation now visibly follows the paused state machine, target selection remembers its originating context, and future ally-target actions can provide their own concise prompt without changing the UI renderer.

## 2026-08-12 — Data-Driven Crafting, Materials, and Loot Tables

### Goal

Establish an extensible first-pass campaign crafting framework with separate materials, permanent recipe knowledge, provider-specific town crafting, reusable nested loot tables, and distance-scaled successful-return rewards without replacing existing item, shop, encounter, settlement, save, or simulation systems.

### Human prompt and direction

The human developer supplied a detailed implementation guide requiring a functional Blacksmith extension, a new Apothecary, data-driven recipes/materials/rarity, weighted and nested loot tables with recipe eligibility and cycle protection, successful-return tiers based on maximum distance, safe save migration, automation compatibility, observability, regression verification, and commit/push authorization after completion.

### AI-assisted implementation

- Added ten stable-ID materials in a dedicated persistent collection: Medicinal Herbs, Cloth, Leather, Iron, Wood, Silver, Rare Herbs, Alchemical Reagents, Sacred Oil, and Relic Fragment. Materials never enter ordinary item inventory or expedition loadout selection.
- Added five stable-ID recipes: Bandages, Healing Poultice, Antidote, Strong Tonic, and Repair Kit. Recipes carry provider, ingredient, output, optional gold, and rarity data; learned IDs live only in campaign state. Strong Tonic and Repair Kit validate mixed material/gold costs.
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

## 2026-08-12 — Scroll Preservation and Apothecary Hub Fix

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

## 2026-08-12 — Centered Apothecary Press-State Fix

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

## 2026-08-13 — Focused Mobile UI Cleanup Pass

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
- Added an immediate top-level ← Village navigation control and removed the bottom-only Back action. Begin Expedition remains the final commit action at the bottom of the flow.
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

## 2026-08-14 - Timed Crafting and Persistent Expedition Injuries

### Goal

Expand the exploration systems with a short player-facing crafting action and a small persistent injury layer while keeping production rules, camp cooking, Material Bag behavior, and simulations aligned.

### Human prompt and direction

The human developer supplied the gameplay-mechanics guide and requested a codebase rescan, implementation, focused tests, and a local commit without pushing.

### AI-assisted implementation

- Added data-driven Sprained Ankle, Deep Cut, Bruised Ribs, Exhaustion, and Poisoned definitions with a two-active-injury cap, duplicate protection, persistent save migration, effective health, travel, defense, incoming-damage, and combat-gauge effects.
- Routed injury application through generic encounter outcomes, authored dangerous encounter branches, selected combat actions, seeded expedition risk checks, and settlement. Inn rest only clears Exhaustion; Healing Poultice treats Deep Cut; Antidote treats Poisoned; Strong Tonic treats Exhaustion; Bandages remain HP-only.
- Centralized pace/ration modifiers: Cautious is slower and safer with more discovery weighting, Normal is baseline, Hard Push is faster and riskier; Sparse reduces rest recovery and raises Exhaustion risk, while Generous improves rest recovery and reduces that risk. Discovery weighting is tag-based and does not alter combat probabilities.
- Added visible timed Apothecary, Blacksmith, and campfire crafting progress. Quotes are checked at completion and `CraftingRules` remains the only mutation path; simulations continue to craft instantly through the same rules.
- Added compact injury displays to expedition and village healing views, Apothecary treatment controls, journey-log injury feedback, and a small toast cleanup fix exposed by delayed crafting feedback.
- Updated single-expedition and campaign simulations to carry injuries, choose pace/rations/rest/camping with injury-aware policies, treat appropriate injuries during campaign preparation, preserve state across expeditions, and report injury, treatment, exhaustion, pace/ration distance, rest-modifier, camp-event, and crafting telemetry/replay data.
- Added focused regression coverage for timed crafting, injury caps/effects/persistence/migration/treatment, pace/ration risk and rest behavior, deterministic camp events, real recipe mutations, simulation parity, and campaign carry-over metrics.

### Manual changes

The human developer supplied the gameplay guide and requested implementation plus a local commit. No manual code edits were reported.

### Verification and resulting prototype state

Players can now see crafting progress before any materials or gold are consumed, return from expeditions with persistent injuries, understand and treat those injuries in the village, and make safer or riskier travel choices through shared pace/ration rules. Simulations and campaigns use the same production mutations and retain injury/material/recipe/health/provision state between runs.

Verified 416 UI/provision/location browser assertions, 33 deterministic simulation assertions, 68 campaign/health/Inn assertions, clean production-page startup through local HTTP, and `git diff --check`. The milestone is committed locally; nothing is pushed.

## 2026-08-14 - Compact Campaign Replay Viewer Layout

### Goal

Make the full Campaign Replay Viewer easier to use on desktop and mobile without changing replay state, sequencing, determinism, or gameplay behavior.

### Human prompt and direction

The human developer supplied a focused Replay Viewer CSS/layout guide and requested the changes be added and committed locally without pushing.

### AI-assisted implementation

- Constrained the desktop replay game column to a readable portrait size and reserved the right-side development/simulation panel, while keeping the replay dock associated with the game column.
- Reorganized the campaign dock into a compact primary row with Play, Pause, speed, Next Event, glance status, More, and Exit. Restart, Step, autoskip, specialized skip actions, detailed status, annotations, and diagnostics are available through the stable More panel.
- Added compact clickable campaign timeline pills (`T`, `E1`, `E2`, and so on) with current/completed styling and horizontal overflow handling.
- Added a compact inline desync message with expandable full JSON diagnostics instead of allowing an error block to push the game off-screen.
- Added responsive mobile rules for a touch-sized 48–60px bottom control strip, safe-area spacing, a readable advanced bottom sheet, and usable horizontal timeline/control overflow.
- Exposed Next Event through the existing chunked fast-forward path so town actions and expedition events retain their existing replay semantics.

### Manual changes

The human developer supplied the layout guide and requested a local add/commit. No manual code edits were reported.

### Verification and resulting prototype state

The Campaign Replay Viewer now keeps the game readable beside the `?sim=1` panel on desktop, presents only the most important controls by default, and provides a touch-friendly compact mobile overlay with advanced controls on demand. Replay controls remain stable across rendering, and full error details stay expandable.

Verified 45 deterministic simulation assertions, 78 campaign/health/Inn assertions, 15 single-replay assertions, 26 campaign-replay assertions including desktop/mobile geometry checks, 429 UI/provision/location browser assertions, clean local-HTTP browser startup, and `git diff --check`. The milestone is ready for a local commit; nothing is pushed.

## 2026-08-14 - Campaign Replay Inventory and Checkpoint Corrections

### Goal

Fix the Campaign 40 replay divergence that left Rope and Material Bag contents inconsistent before a later recorded pack action, then keep long replay seeking usable.

### Human prompt and direction

The human developer supplied the replay bug report and requested root-cause tracing, inventory/material validation, regression coverage, and a local add/commit without pushing.

### AI-assisted implementation

- Normalized persistent packed items and packed materials after expedition settlement and before campaign packing so consumed, lost, or unavailable entries cannot remain stale.
- Made campaign expedition simulation snapshots authoritative for carried inventory, preventing default Rope ownership from being reintroduced after production settlement removed it.
- Preserved persistent injury state in expedition replay snapshots so later combat actor scheduling remains deterministic.
- Made replay pack application validate the complete item and Material Bag request before mutating either packed field, with detailed failure reasons.
- Added campaign state checkpoints before town preparation and after nested expedition settlement, comparing gold, provisions, health, companions, equipment, items, materials, recipes, knowledge, injuries, and other persistent state. Added packed-item/material invariants to the diagnostics.
- Changed campaign fast-forward stall detection to require a sustained no-progress streak, allowing legitimate combat/travel microsteps to complete while retaining a safety bound.
- Added settlement, atomic-pack, packed-state, Campaign 40 Expedition 3, action-76+, and later-seek regression assertions.

### Manual changes

The human developer supplied the replay bug guide and requested implementation plus a local add/commit. No manual code edits were reported.

### Verification and resulting prototype state

Campaign Replay now reproduces the production inventory and Material Bag state through Expedition 3 and later expeditions, reports useful checkpoint differences at the first divergence, and can seek beyond action 76 without the prior Rope/material desync.

Verified 45 deterministic simulation assertions, 78 campaign/health/Inn assertions, 15 single-replay assertions, 30 campaign-replay assertions, 429 UI/provision/location browser assertions, clean local-HTTP browser startup, and `git diff --check`. The milestone is ready for a local commit; nothing is pushed.

## 2026-08-15 - Content Editor Phase 4 Paths and Expeditions

### Goal

Extend the standalone Content Editor so authored travel paths and expeditions can be inspected and edited safely without creating a second content source.

### AI-assisted implementation

- Added canonical Expedition editing backed by `Grail/js/expedition-data.js`, including metadata, region/path references, danger, kind, camp-event tables, prerequisites, raw JSON, reverse references, surgical saves, and source-hash conflict checks.
- Added a derived Paths browser from live encounter `pathIds` and expedition `pathId` relationships. Paths expose linked metadata, encounter counts, filters, sorting, reverse encounter navigation, and membership-only add/remove operations.
- Connected Encounter, Path, and Expedition navigation and expanded reference validation/deletion protection for path and expedition IDs while preserving unrelated authored fields and definitions.
- Documented the distributed path architecture and Phase 4 workflow in the standalone `Tools/ContentEditor` README.

### Verification and resulting prototype state

The editor now reports six live derived paths and four canonical expeditions; `fountain_of_barenton` currently has 14 encounter memberships. Path membership edits preserve the encounter and its other path memberships, while Expedition edits remain source-of-truth writes to `expedition-data.js`. No live authored game definitions were changed for this milestone; write tests use temporary Grail copies.

Verified 43 Content Editor unit/regression tests, clean local-HTTP browser startup, Paths/Expeditions navigation, Fountain reverse browsing, in-memory membership add/remove, Expedition editing, and `git diff --check`. The current game has no standalone `PATH_DEFINITIONS` constant, so Paths intentionally remain a derived view rather than an independently editable definition type.

## 2026-08-15 - Content Editor Phase 5 Recipes and Crafting Providers

### Goal

Add schema-aware recipe and crafting authoring while preserving the Phase 4 editor and correcting derived Path counter accumulation.

### AI-assisted implementation

- Added canonical Recipes and Crafting Providers categories backed by `Grail/js/crafting-data.js`, with material-map and item-map ingredient editing, item/provisions outputs, provider assignment, rarity, starter flags, gold cost, add/duplicate/remove controls, and advanced JSON.
- Added equipment recipe support through generic Item output selectors, Item `Produced By` and `Used As Ingredient In` reverse references, provider recipe grouping, and cross-content Open navigation.
- Integrated the actual direct loot-table `type: "recipe"` unlock architecture with recipe selectors, validation, Used By references, and Open Recipe links; no recipe-scroll item system was invented.
- Fixed derived Path rebuilding so repeated navigation resets encounter counts instead of accumulating them.
- Added recipe/provider/material/output/ingredient validation and reference-safe deletion while retaining surgical, source-preserving writes and stale-file protection.

### Verification and resulting prototype state

The editor currently loads nine recipes and three providers: recipes use material or item ingredient maps, produce an item or provisions, and assign one of the authored providers Apothecary, Blacksmith, or Campfire. New equipment Items can be created and selected as recipe outputs entirely in the editor, including unsaved in-memory reverse relationships. Loot Tables can directly unlock recipes through the existing runtime entry shape.

Verified 52 Content Editor regression tests, repeated Paths navigation with stable Fountain counts, unsaved Recipe-to-Item reverse browsing, recipe-unlock Loot Table navigation, clean local-HTTP startup, and `git diff --check`. Content Editor remains external/local development tooling and no live gameplay or authored content values were changed; the pre-existing `js/loot-data.js` worktree modification was preserved.

## 2026-08-15 - Content Editor Phase 6 List Filtering and Navigation Polish

### Goal

Make Item and Encounter browsing fast and practical without adding gameplay systems or changing authored content.

### AI-assisted implementation

- Added combinable, in-memory Item filters for live categories, rarity, equippable state, equipment slot, tri-state inventory flags, and all/any tag matching.
- Added Encounter path, region, direction, overlap-distance, repeatable, tag, combat, and requirement-presence filters, with text search and result/active-filter counts.
- Preserved filter/search state through selection and cross-content navigation, including unsaved draft fields and path memberships; added the compact `Crafting` left-nav label.
- Added focused browser regression coverage for filter combinations, no-results behavior, navigation persistence, unsaved filtering, and the existing Phase 1–5 test suite. The editor remains local/external tooling and is not runtime/submission code.

### Verification and resulting prototype state

Verified 55 Content Editor tests (52 existing Python regressions plus 3 local-HTTP Chrome filter flows), including Item and Encounter filtering, search stacking, active/result counts, unsaved updates, and the `Crafting` label. No live gameplay/content values were modified for this phase; existing unrelated Grail worktree changes were preserved. BUILD_LOG is the only Grail file changed by this phase.

## 2026-08-15 - Content Editor Phase 7 Part 1 Authoring Systems

### Goal

Expand the standalone Content Editor for recursive encounter/camp authoring and first-class Injury and Camp Event editing without changing gameplay behavior or authored game values.

### Human prompt and direction

The human developer supplied the Phase 7 Part 1 guide and requested implementation across the sibling Tools and Grail repositories, followed by local add/commit operations in both repositories.

### AI-assisted implementation

- Added recursive schema-aware editing for nested effects, requirements, random chance branches, random-one options, secondary outcomes, and combat Victory/Fled outcomes, with add/remove controls and Advanced JSON retained as an escape hatch.
- Added canonical Injury editing backed by `js/injury-data.js`, including treatment references, recovery/infection/travel-damage fields, generic effect multipliers, reverse references, validation, and reference-safe deletion.
- Added canonical Camp Event editing backed by `js/camp-data.js`, linked expedition table entries to editable events, reused staged encounter controls, and extended nested reference validation.
- Kept the game runtime and authored gameplay content unchanged; the Grail-side change is this milestone record only.

### Manual changes

The human developer supplied the authoring guide and requested local commits. No manual code edits were reported.

### Verification and resulting prototype state

The editor now loads and safely edits the six live Injuries and six live Camp Events, supports nested conditional requirements/effects and combat branches, and preserves surgical source writes. Verified 56 Content Editor Python tests, focused local-HTTP Chrome coverage for recursive authoring, Injury editing, Camp Event editing, existing Phase 6 flows, clean Python syntax, and `git diff --check`. Both repositories are ready for local commits; nothing is pushed.

## 2026-08-15 - Content Editor Phase 7 Part 2 Enemy Authoring

### Goal

Make combat enemy definitions and enemy actions first-class, reusable Content Editor data while keeping Combat definitions focused on roster composition and preserving gameplay behavior.

### Human prompt and direction

The human developer supplied the Phase 7 Part 2 guide and requested implementation across the sibling Tools and Grail repositories, followed by local add/commit operations in both repositories.

### AI-assisted implementation

- Added first-class Enemies and Enemy Actions categories backed by the existing `COMBAT_ENEMY_DEFINITIONS` and `COMBAT_ENEMY_ACTION_DEFINITIONS` catalogs, including CRUD, duplication, schema-aware fields, action-pattern references, injury selectors, reverse references, Open navigation, Advanced JSON, and reference-safe deletion.
- Simplified Combat editing to metadata plus reusable enemy roster IDs with add/remove/reorder controls and Open Enemy navigation; shared enemy stats and action definitions are no longer edited through inline Combat copies.
- Preserved the existing combat data shapes and values. No game runtime, combat balance, enemy stats, action damage, encounter content, or simulation strategy changes were required.
- Added focused editor write/reload, surgical-save, reference-validation, safe-deletion, reverse-navigation, and composition UI coverage, and documented the new authoring workflow in `Tools/ContentEditor/README.md`.

### Manual changes

The human developer supplied the authoring guide and requested local commits. No manual code edits were reported.

### Verification and resulting prototype state

The editor now exposes the seven live enemy definitions and eleven live enemy actions as reusable authoring catalogs. Combat rosters reference enemy IDs, enemy action patterns reference action IDs, and enemy actions reference live injuries. No game-side data normalization or migration is needed; the existing canonical definitions remain the source of truth. Uncommon future enemy/action fields remain available through Advanced JSON.

Verified 58 Content Editor Python tests, 15 local-HTTP Chrome browser tests including first-class enemy/action and Combat composition flows, clean Python syntax, and `git diff --check`. The Grail runtime/content values remain unchanged; this log entry is the only Grail-side change for the milestone. Both repositories are ready for local commits; nothing is pushed.

## 2026-08-15 - Dialogue, NPC, Destination, and Location Authoring Pass

### Goal

Make reusable dialogue and the existing village content definitions first-class authoring systems while preserving current story text, IDs, gameplay balance, and the separate GrailTools/game repository boundary.

### Human prompt and direction

The human developer supplied the dialogue/NPC/location pass guide and requested a thorough implementation across both repositories, followed by local add/commit operations without pushing.

### AI-assisted implementation

- Added first-class GrailTools categories for Dialogue, NPCs, Destinations, and Locations, backed directly by the live `DIALOGUE_DEFINITIONS`, `NPC_DEFINITIONS`, `DESTINATION_DEFINITIONS`, and `LOCATION_DEFINITIONS` catalogs.
- Added schema-aware dialogue node/choice editing, speaker and link selectors, portrait fields, shared recursive requirements/effects, reorder controls, reverse references, Open navigation, surgical writes, and reference-safe deletion validation.
- Exposed all current NPC, destination, and location fields, including simple dialogue/rumors, sequence hooks, location membership, scene positions, shops/providers, visual keys, quest lists, and shared location requirements.
- Adapted DialogueSystem to the shared encounter requirement/effect vocabulary with safe town-versus-expedition context handling, and added generic `startDialogue` suspension/resume across encounter, camp, and combat-resolution routes. Renamed the internal encounter queue helper to avoid a global collision with the game UI helper.
- Added deterministic simulation dialogue choice handling and dialogue telemetry, plus replay decision consumption and parent-flow resume support. Existing Reeve and simple NPC dialogue behavior remains intact; no new authored story content was added.

### Manual changes

The human developer supplied the pass guide and requested local commits. The existing unrelated `Grail/js/crafting-data.js` worktree change adding the Glimmering Sword recipe and duration was preserved and is not part of the dialogue implementation.

### Verification and resulting prototype state

Verified the full current dialogue/NPC/destination/location catalogs load with zero editor validation errors; focused editor CRUD, surgical round-trip, link validation, and safe-deletion tests; a local-HTTP Chrome authoring flow; 53 deterministic simulation assertions including combat-victory dialogue suspension/resume and town-context requirement safety; and clean Python syntax plus `git diff --check`. The existing location suite remains blocked by its stale expectation of nine recipes while the preserved worktree contains ten, and the existing campaign suite still expects the older `glimmering_blade` ID; neither failure is caused by this pass. Nothing was pushed.

## 2026-08-16 - General Game Debug Panel

### Goal

Turn the existing `?debug=1` encounter controls into a compact, general-purpose developer panel for testing authored items, equipment, progression, encounters, expeditions, and combat without editing saves in the browser console.

### Human prompt and direction

The human developer supplied the Game Debug panel guide and requested the implementation, documentation update, verification, and local commits for the affected repositories.

### AI-assisted implementation

- Added the developer-only `js/debug-tools.js` overlay with collapsible Player, Items, Materials, Progression, Encounters/Expedition, Combat Debug, and Save/State sections.
- Made item/material selectors, recipes, knowledge, injuries, companions, campaign flags, expeditions, encounters, combat definitions, and combat statuses derive from the live production catalogs. Item removal clamps and cleans zero quantities; equipment uses shared `EquipmentRules`; health/injuries use `HealingRules` and `InjuryRules`; combat status application uses a canonical `CombatSystem` API.
- Preserved encounter forcing and next-encounter controls while replacing the Wild Boar/Wolves-only launcher with the full `COMBAT_DEFINITIONS` catalog. Added safe expedition distance controls, production return/pause/resume controls, live expedition/combat inspection, save/copy conveniences, and replay mutation isolation.
- Removed the duplicate in-travel debug rendering, retained the normal `?sim=1` simulation panel, and kept `Tools` unchanged.

### Manual changes

The human developer supplied the debug-panel guide and requested local commits. No manual code edits were reported.

### Verification and resulting prototype state

Added `tests/debug_tools_test.py` covering normal/debug URL gating, combined debug/simulation startup, item grant/remove/equip, materials, recipe and knowledge progression, healing, encounter forcing, data-driven combat launch, canonical status application, and replay protection. The focused debug suite passed 15 assertions and the deterministic simulation suite passed 59 assertions; existing location/campaign/replay suites still stop on their pre-existing stale content expectations. The panel remains absent unless `?debug=1` is present and all persistent mutations save through the existing save path.
## 2026-08-16 - Search for Merlin Final Campaign Expedition

### Goal

Complete the final story, campaign, and expedition route for the vertical-slice prototype.

### Human prompt and direction

The human developer supplied the final expedition guide and requested coordinated implementation across the Grail runtime/content project and GrailTools, including this build-log update.

### AI-assisted implementation

- Added the four-route Search for Merlin expedition with Water of Barenton and Morgan's Token prerequisites, objective-distance gating, authored route encounters, the Black Hound, the Bound Warden, and the Merlin finale.
- Added the unique protected Merlin's Seal reward and campaign completion state, including campaign summaries, replay data, compact output, CSV telemetry, and progression UI support.
- Added reusable Bound Warden regeneration and status-based suppression traits, telegraphed heavy attacks, generic equipment-aware Defend strategy handling, and campaign combat telemetry for regeneration, suppression, heavy attacks, and Defend actions.
- Extended GrailTools expedition/enemy/enemy-action authoring and validation for objective distances, enemy traits, suppression statuses, and telegraphed actions.

### Verification and resulting prototype state

Verified the location suite (429 assertions), deterministic simulation suite (62 assertions), campaign suite (92 assertions), current-campaign progression suite (31 assertions), and GrailTools content-editor suite (61 tests). Strong aggressive and cautious campaign seeds both reach Merlin and secure Merlin's Seal. `git diff --check` passed in both repositories; no commits or pushes were made.
## 2026-08-17 - Progression Objective Readiness and Supply Runs

### Goal

Prevent progression simulations from knowingly launching below an authored route objective distance while preserving adaptive target reduction for ordinary expeditions and supply runs.

### Human prompt and direction

The human developer supplied a focused simulation-planning guide after observing Cautious Search for Merlin runs repeatedly departing below the route's 120-league objective. The guide required a generic metadata-driven fix, deterministic preparation behavior, compact telemetry, focused tests, and local commits in the affected repositories.

### AI-assisted implementation

- Added a generic progression-readiness assessment that uses `minimumObjectiveDistance` as the progression floor after the configured target is raised with `max(configuredTargetDistance, routeObjectiveDistance)`.
- Changed underprepared progression routes to select the existing marked Old Forest supply-run path instead of launching a shortened progression attempt. Supply runs remain shorter, do not increment route attempts, and continue to use existing preparation/economy rules.
- Added a final safety check for preparation drift so a true progression expedition cannot depart below its positive objective floor.
- Added compact, planning, CSV, campaign-summary, and notable-event telemetry for readiness, deferral reasons, required/supported distances, supply-run separation, and objective-floor violations.
- Added deterministic progression coverage for generic objective routes, 105-to-120 target flooring, Cautious deferral and supply behavior, Aggressive floor enforcement, Merlin completion, compact export, and replay preservation.

### Manual changes

The human developer supplied the simulation-planning guide and explicitly authorized adding and committing the finished files. `Tools/` was intentionally left untouched because the existing editor already supports `minimumObjectiveDistance`.

### Verification and resulting prototype state

The focused progression suite passed 36 assertions; the deterministic simulation suite passed 62 assertions; and the campaign/health/Inn suite passed 92 assertions. Cautious Merlin campaigns now record preparation runs before a committed 120-league attempt, Aggressive may proceed sooner but also never targets below 120, and validated campaigns recorded zero objective-floor violations. `git diff --check` passed. The standalone replay suite still has its unrelated camp/combat decision-coverage fixture failure, and the campaign replay suite still has its unrelated Campaign 40 loadout fixture failure; both are documented for handoff. No Tools files were changed.

## 2026-08-19 - Travel Debug Controls

### Goal

Make distance-based travel-scene and encounter presentation testing quick without changing normal gameplay or persisted state.

### Human prompt and direction

The human developer supplied a focused guide for three transient `?debug` travel controls and requested a Grail-only implementation with a commit and push.

### AI-assisted implementation

- Added a transient Disable Random Encounters checkbox that suppresses only the normal travel encounter roll while leaving authored milestone and explicitly forced encounters available.
- Grouped the existing expedition distance setter with the travel debug controls so distance changes immediately refresh travel presentation through the existing canonical setter.
- Added Outbound and Return direction overrides that refresh the active travel presentation without changing distance, provisions, objectives, or save data.

### Verification and resulting prototype state

Verified the debug-only controls and narrow encounter suppression path with the focused browser smoke checks, confirmed normal URL gating, and passed `git diff --check`. The debug overrides reset on reload and `Tools/` remains unchanged.

## 2026-08-19 - Tile-Based Travel Scene Transitions

### Goal

Replace full-cycle loop-scene swaps with seam-aware in-place panorama transitions while preserving authored travel motion and interruption behavior.

### Human prompt and direction

The human developer supplied a focused guide for reworking Loop travel-scene transitions and requested a Grail-only implementation with local add/commit operations.

### AI-assisted implementation

- Reworked looping travel panoramas into direction-aware leading/upcoming tiles, preloading the pending scene into the upcoming tile while the active scene remains unchanged.
- Detects the actual tile seam crossing the party/viewport anchor, then promotes the pending scene in place so the presentation becomes the new scene on both tiles without the old full-cycle track restart.
- Preserved Pan transitions, pause behavior, return-direction ordering, encounter freeze/resume, optional transition artwork, and same-asset/same-motion continuity.
- Kept pending scene state through encounter rerenders and updated the focused location assertion for the A/B-to-B/B seam transition.

### Verification and resulting prototype state

Verified focused outbound and returning A/B tile transitions, encounter preservation and Continue Journey restoration, same-asset continuity, Python test syntax, and `git diff --check`. `Tools/` remains unchanged.

## 2026-08-20 - Travel Seam Foreground Assets

### Goal

Add an optional transparent expedition foreground asset that travels with each
panorama seam, allowing repeated joins to use authored trees or similar
foreground landmarks without replacing the existing Travel Transition system.

### AI-assisted implementation

- Added `travelSeamForegroundAssetId` to expedition presentation data and a
  Content Editor selector with transparent-image preview and normal save/load
  behavior.
- Rendered the selected foreground at panorama joins for outbound and return
  travel, above the travel artwork and below travelers/UI, with graceful
  fallback when the field or asset is missing.
- Added per-loop `showSeamForegroundBetweenLoops` controls so authors can hide
  the foreground between repeated copies of the same scene while retaining it
  for scene changes.

### Verification and resulting prototype state

Verified focused seam-asset/editor coverage and the browser travel transition
checks, including reverse travel and missing-asset fallback. `Tools/` remains
unchanged by the runtime seam work.

## 2026-08-22 - Character Pass 1

### Goal

Establish an editable, shared character-visual foundation across Arthur, companions, and enemies without changing combat, travel, progression, or runtime animation behavior.

### Human prompt and direction

The human developer supplied the Character Pass 1 guide for the Grail game and GrailTools repositories. The pass required separate player/companion/enemy definitions, optional Idle/Walk/Attack visual metadata, first-class companion editing, safe references, and preservation of existing static visual fallbacks.

### AI-assisted implementation

- Added `js/character-visuals.js` with the shared optional data-only visual-slot shape and a static asset resolver that preserves combat visual and placeholder fallbacks.
- Wired Arthur, companions, and enemies through the resolver without adding playback, sprite-sheet processing, CSS animation, or combat-mechanics changes.
- Added Player Character singleton and Companions categories to GrailTools, including Arthur stats, companion CRUD, current combat/provision fields, portrait/static combat visuals, and optional Idle/Walk/Attack selectors with frame metadata.
- Extended the enemy editor with the same Character Visuals section and preserved its existing identity, combat, action-pattern, trait, and static visual fields.
- Added source-aware validation for optional character visuals, image asset existence/category compatibility, malformed metadata, null slots, companion references, and singleton/player saves. Added `assetId` reverse-reference handling for future visual slots.
- Updated GrailTools documentation and focused regression coverage for player singleton saves, companion edits/reference blocking, and character visual validation.

### Manual changes

The human developer supplied the character-pass guide and authorized adding and committing the finished files in both repositories. No new bitmap assets or gameplay definitions were invented; authored visual slots remain optional.

### Verification and resulting prototype state

The focused character editor tests passed 3/3, the real catalog load passed, Python source compilation passed, and `git diff --check` passed in both repositories. The broader editor/browser suite remains limited by the existing encounter-layout fixture failure and a later browser test timeout in this environment; those unrelated limitations are retained for handoff. No combat simulation or replay behavior was changed.

## 2026-08-22 - Character Visual Asset Category Regression Fix

### Goal

Correct Content Editor validation for the overloaded `combatVisualAssetId` field without changing its existing game meaning or runtime rendering.

### AI-assisted implementation

- Made image-category validation source-aware: character definitions use `combat`, while expedition and encounter battlefield overrides use `combat_scene`.
- Kept enemy `visualAssetId` and character visual-slot `assetId` validation on the `combat` category.
- Preserved the existing Old Forest Road `combat_scene_old_forest_road_combat` assignment as valid and kept the corresponding editor selectors on their existing categories.

### Verification and resulting prototype state

Focused character and combat-background editor tests passed 2/2, including the Old Forest Road regression case. No game runtime or combat-background resolver files were changed.

## 2026-08-22 - Character Pass 2 Runtime Visuals

### Goal

Make the optional Character Pass 1 visual slots work in the game and in GrailTools while preserving combat, travel, progression, simulation, and replay behavior.

### Human prompt and direction

The human developer supplied the Character Pass 2 guide and requested coordinated Game/Tools work: shared sprite-sheet playback, optional visual scale, authored import handling, travel/combat fallback states, reduced-motion support, and focused verification. Attack playback was prepared but not triggered; no Combat Pass 2 FX or choreography was added.

### AI-assisted implementation

- Replaced the data-only character visual helper with one shared canvas renderer for static and multi-row sprite-sheet assets. It derives rows from frame count and columns, plays left-to-right/top-to-bottom, applies authored FPS defaults, respects `prefers-reduced-motion`, cleans disconnected instances, and falls back through the requested slot, idle, static combat visual, and placeholder.
- Wired travel travelers to Walk while moving and Idle while paused/camped, including returning-direction mirroring. Wired combatants to Idle while preserving HUD, selection, hit presentation, and combat simulation behavior.
- Added optional `visualScale` editing/validation for player, companions, and enemies, plus the authored Arthur Idle/Walk assets and 14-frame, four-column Walk sheet already present in the project.
- Added the Content Editor Character Visuals preview with animated Play/Pause controls and compact frame/columns/FPS fields. Character uploads select a transparent full-sheet Sprite Sheet profile; static character combat visuals remain on the Combat Cutout profile.
- Added Sprite Sheet image processing with alpha preservation and no scene/travel/portrait/combat crop, plus round-trip and validation coverage.

### Manual changes

The human developer supplied the Character Pass 2 guide and authorized adding and committing the finished files in both repositories. No combat mechanics, progression rules, encounter resolution, inventories, simulation, or replay behavior were changed.

### Verification and resulting prototype state

The focused Content Editor character metadata tests and sprite-sheet pipeline test passed, the complete asset pipeline suite passed 19/19, and the debug browser suite passed 27 assertions including multi-row canvas slicing, state switching, authored Old Forest Road combat background resolution, and combat character rendering. The broader Content Editor suite retains one pre-existing encounter-layout coordinate fixture mismatch; the broader location browser suite stops on its pre-existing village hotspot fixture mismatch. `git diff --check` passed. Character art now uses authored runtime assets where assigned and graceful existing fallbacks everywhere else.

## 2026-08-22 - Character Pass 2.1 Sprite Sizing and Transparent-Frame Normalization

### Goal

Refine the Character Pass 2 presentation so authored transparent sprite sheets render at stable, readable sizes across travel, combat, and editor previews without changing combat or expedition behavior.

### AI-assisted implementation

- Added alpha-aware per-frame metadata caching with stable maximum-height normalization, horizontal centering, and bottom alignment for game and Content Editor sprite rendering.
- Preserved authored frame aspect ratios and added optional per-slot `scale` metadata, applied after the existing context and definition scales and validated from 0.25 through 3.
- Reworked travel and combat containers to provide real portrait-mode display area, keep formations readable, keep fallback glyph sizing independent, and leave transform ownership with the inner character sprite rather than the outer combat layout.
- Added explicit post-render sprite initialization for travel and combat screens while retaining image-load fallback behavior, including cached-image state switches.
- Updated focused browser/editor coverage and documentation for normalized frames, slot scale, and reliable Arthur authored/fallback coexistence.

### Manual changes

The human developer supplied the Character Pass 2.1 guide and authorized adding and committing the finished files in both repositories. No new art assets, combat mechanics, progression rules, or simulation/replay behavior were changed.

### Verification and resulting prototype state

Focused character validation, editor save, sprite-sheet pipeline, and debug browser checks passed after the normalization changes. `git diff --check` passed in both repositories. Broader suites retain the previously documented unrelated encounter-layout and village-hotspot fixture limitations.

## 2026-08-22 - Character Pass 2.2 Shared Sprite Scale and Combat Fit

### Goal

Correct the remaining transparent-frame normalization pop and bring authored combat characters back into a bounded HUD-to-ATB unit layout while preserving the successful Character Pass 2.1 renderer and travel presentation.

### AI-assisted implementation

- Replaced per-frame visible-height rescaling with one cached shared animation scale; each frame now preserves its authored relative size while sharing a centered, bottom-aligned normalization box.
- Added a live Content Editor Scale Comparison for Idle, Walk, and Attack, using the same normalized preview renderer and updating with per-slot scale edits.
- Reduced only the normal combat visual context, added clearer HUD/visual/ATB separation, reduced the 3-unit context again, and kept fallback glyph sizing independent from authored sprite sizing.
- Added regression coverage for Arthur's 14-frame, four-column Walk sheet ordering, stable canvas dimensions, complete frame metadata, and shared-scale behavior.

### Manual changes

The human developer supplied the Character Pass 2.2 guide and visual examples and authorized adding and committing the finished files in both repositories. No authored animation frames, combat mechanics, FX, simulation, replay behavior, travel sizing, or fallback rules were changed.

### Verification and resulting prototype state

Focused character/editor checks, the sprite asset pipeline, and the debug browser regression suite pass after the shared-scale and combat-fit corrections. `git diff --check` passes in both repositories.

## 2026-08-22 - Character Pass 2.3 Animation Continuity and Combat Unit Cleanup

### Goal

Finish the authored Idle/Walk presentation pass without reimporting the existing sprite sheets or changing combat behavior.

### AI-assisted implementation

- Made game and Content Editor sprite-sheet sampling use the same integer cell boundaries, absolute source bounds, direct source rectangles, shared animation metadata, and stable bottom-aligned canvases.
- Added cached character-level reference-height normalization, preferring Walk, so Idle/Walk/Attack use comparable authored scale while retaining definition and per-slot scale controls.
- Made sprite initialization idempotent so travel state updates and combat HUD updates do not reset an active animation back to frame 0. Arthur's authored 19-frame Idle sheet now continues in combat.
- Reworked two-ally combat spacing and bounded unit sizing around the real sprite, keeping fallback glyphs independent and keeping HP/Faith, the action gauge, character art, and status content readable together.
- Moved each combatant's action gauge into the HUD directly below HP/Faith and above the character visual, matching the intended visual hierarchy.

### Manual changes

The human developer supplied the Character Pass 2.3 guide and follow-up visual feedback and authorized adding and committing the finished files in both repositories. No sprite assets were reimported and no authored animation frames, combat mechanics, progression, simulation, replay behavior, or FX were changed.

### Verification and resulting prototype state

The debug browser suite passes 29 assertions, including Walk sheet frame metadata, Idle state switching, combat Idle continuity, authored battlefield rendering, and the mixed Arthur/Sir Kay two-ally layout. Focused Content Editor character/combat-background tests pass 4/4, and the asset pipeline suite passes 19/19. The broader Content Editor suite still has the existing abandoned-camp encounter-layout fixture mismatch; `git diff --check` passes in both repositories.

## 2026-08-22 - Character Pass 2.3 Follow-up Render Stability

### Goal

Correct the remaining visible mismatch between travel Idle, combat Idle, and the GrailTools Idle preview without requiring asset reimport.

### AI-assisted implementation

- Changed game and editor character initialization to draw the authored frame immediately at its base/slot scale, then apply cached cross-slot normalization in place when the reference metadata is available.
- Removed the normalization-promise delay that could leave the editor preview on “Preview unavailable” and could make a travel state transition feel like a visual resize.
- Added restrained brightness/saturation and a soft silhouette treatment to combat character canvases so the complete authored body remains readable against the dark battlefield without changing sprite scale or artwork.

### Verification and resulting prototype state

The debug browser suite passes 29 assertions, focused character/combat-background editor coverage passes 4/4, and the asset pipeline passes 19/19. No sprite assets were reimported and no gameplay, simulation, replay, or combat rules changed.

## 2026-08-22 - Character Pass 2.3 Mobile Scale Correction

### Goal

Match the authored Arthur presentation across traveling, paused/encounter, and combat contexts on narrow portrait screens.

### AI-assisted implementation

- Added an explicit travel/encounter Idle context scale so the paused and encounter pose does not visually enlarge relative to the established traveling Walk size; combat keeps its separate unit scale.
- Increased only the restrained combat sprite readability treatment, preserving the authored sprite dimensions while giving the complete lower silhouette enough contrast against the dark battlefield.

### Verification and resulting prototype state

The debug browser suite passes 30 assertions after the mobile scale correction, including an explicit traveling Walk to paused Idle scale check. No sprite assets were reimported and no gameplay, simulation, replay, or combat rules changed.

## 2026-08-25 - Old Forest Road Contest Pass 1

### Goal

Make Old Forest Road the contest-ready focus route: support deeper progression, reliable exploration beats, and a clear Flask gate for the other visible expeditions without attempting the full four-expedition chapter.

### AI-assisted implementation

- Extended Old Forest Road progression through 180 leagues, added distance scenes through 200+, added nonlinear late return reward tiers at 120, 160, and 200 leagues, and gave this route a data-driven +30 provision-capacity bonus so the contest objective is supportable without changing the party baseline elsewhere.
- Added a bounded Overgrown Trail route with a map-enabled turnoff near 20, a normal turnoff near 40, automatic Main Road rejoin near 80, and correct return behavior toward the entrance.
- Added Old Forester's Map as a rare forest find and a 25-gold Camelot supply, plus a full-screen hidden forest village stop around 95 with persistent safe-return discovery, limited expensive supplies, an inn, and an apothecary/Druid placeholder.
- Added the Verdant scaffold IDs and a placeholder grove rite, a final altar near 180, a minimal Verdant Warden combat definition, and safe-return Flask ownership only after that boss victory. Fountain of Barenton and Val sans Retour remain visibly gated by Flask.
- Generalized location stops, route transitions, safe-return flag staging, inn pricing, replay auto-leave behavior, and simulator auto-leave behavior without adding a second location system or requiring Woodcraft for the new final gate.
- Added focused browser regressions for route bounds, village persistence/full-screen leave flow, late rewards, Flask source removal/gating, Verdant victory rewards, and current-campaign Old Forest focus. Updated the Content Editor expedition validator and expedition view so bounded route configuration remains visible and raw-editable.

### Manual changes

The human developer supplied the contest direction and Pass 1 guide and authorized adding and committing the finished files in both repositories. No new art assets were introduced. The hostile stag, Druid quest dialogue, White Hart puzzle, and full Verdant Warden mechanics remain intentionally scaffolded for a later pass.

### Verification and resulting prototype state

The focused Old Forest browser suite passes 8 assertions, the current-campaign progression suite passes 5 assertions, the deterministic simulation suite passes 62 assertions, the combat suite passes 37 assertions, the replay suite passes 15 assertions, and the live Content Editor catalog validates with zero errors. The broader location/editor suites retain previously documented fixture mismatches in village hotspot coordinates, encounter layout fixtures, derived path counts, and an existing campaign packing fixture; those unrelated fixtures were not folded into this contest pass. `git diff --check` passes in both repositories.

## 2026-08-25 - Old Forest Road Contest Pass 1 Corrective Follow-up

### Goal

Keep Old Forest Road progression-focused without treating the 180-league objective as an immediately sustainable run.

### AI-assisted implementation

- Removed the Old Forest route-specific +30 provision-capacity bonus; the route now uses the same global and companion capacity rules as every other expedition.
- Retained the generalized optional route-capacity plumbing in `ExpeditionRules` for future tuning, but no current expedition definition uses it.
- Removed campaign-simulator deep-run forcing, including the automatic sparse-ration override and locked travel settings. Restored the normal supply-run targets so unsupported deep attempts defer naturally.
- Updated the campaign regressions to expect an early Old Forest supply/defer result rather than guaranteed 180-league reach, while retaining direct Flask gate coverage and repeated-run route focus checks.
- Kept 180 leagues as the late-game Old Forest objective. Pass 2 can add earned cooking, ingredients, forage, Woodcraft, village resupply, gear, and other progression that improves supported depth without a global capacity rebalance.

### Verification and resulting prototype state

The focused Old Forest browser suite passes 9 assertions, the current-campaign progression suite passes 5 assertions, the deterministic simulation suite passes 62 assertions, the combat suite passes 37 assertions, and the replay suite passes 15 assertions. The route map, bounded trail rejoin, village stop, Flask gating, Verdant Warden reward scaffold, and Content Editor route-branch support remain covered. The live Content Editor catalog validates with zero errors and the targeted editor definition tests pass 2/2. The broader location/editor fixture mismatches and existing campaign packing fixture remain outside this corrective follow-up.

## 2026-08-25 - Old Forest Road Contest Pass 2

### Goal

Make Old Forest Road a progression-friendly contest route built around earned Woodcraft, two Verdant shards, the hidden-village Druid favor, and a visible altar finish, while preserving the bounded-supply correction from Pass 1.

### AI-assisted implementation

- Gated the early Overgrown fork near league 20 behind Old Forester's Map while keeping the normal map-independent turnoff near league 40.
- Replaced the placeholder deep route event with the Thornbound Crossing and added Woodcraft branches to practical forest encounters. The Injured Hunter now teaches Woodcraft reliably, with the Mossbound Guide as an alternate route.
- Removed the Bandit Leader's unrelated Threefold Seal recipe reward and kept the Glimmering Sword/Sweeping Strike progression focused. Glimmering Sword now has a meaningful bonus against Verdant and enchanted targets.
- Reworked the White Hart into a peaceful multi-stage meeting around leagues 50-80. Calm or observant choices can secure the persistent Grace shard; pursuit or aggression makes it flee, with a later campaign opportunity and no shard farming.
- Added the guaranteed Thorn-Crowned Hart around league 140 with dedicated combat, the persistent Wrath shard, a defeat flag, and no post-victory respawn.
- Added the protected unique Verdant Heart recipe, the Druid's one-time favor chain, the Communion Draught, Song of the Forest, Heart awakening, and several Woodcraft-enabled food/provision recipes.
- Made the altar remain visible with friendly retry hints until the expedition has Song of the Forest and an enchanted Heart. Its Warden encounter is stronger, telegraphed, status-aware, and regeneration-suppressible; Glimmering Sword helps without being mandatory.
- Added protected mid-route armor and utility/relic rewards, optional 200+ league discoveries, and deep-avoidance pressure beyond leagues 80, 120, and 150 without making Woodcraft mandatory.
- Added first-time-only knowledge/ability/recipe reward reveals, generic knowledge support in the game reward model, simulator pursuit of Old Forest progression services, and telemetry for shards, Heart, Warden attempts, depth, Glimmering Sword, and return failures.

### Manual changes

The contest guide and Pass 1 follow-up supplied the design direction and acceptance criteria. No new art was required. The Content Editor was left unchanged because the pass uses its existing generic encounter, dialogue, item, recipe, requirement, and reward validation paths.

### Verification and resulting prototype state

The Pass 2 Old Forest browser suite passes 11 assertions. The existing Old Forest progression suite passes 9, current-campaign progression passes 5, deterministic simulation passes 62, combat passes 37, and replay passes 15. Five targeted Content Editor definition/validation tests pass. Browser tests were run sequentially because the shared local browser harness is not safe for parallel startup. The broader editor fixture suite still contains previously documented fixture mismatches and was not treated as a Pass 2 gate.

## 2026-08-25 - Old Forest Campaign Simulator Planning Correction

### Goal

Replace the Old Forest simulator's repeated generic 180-league readiness check and shallow supply loop with explicit next-milestone planning. The simulator should explain its current goal, pursue the authored chain, and stop only when the actual next milestone has no viable preparation path.

### AI-assisted implementation

- Added `assessOldForestProgressionGoal` with structured goals for Woodcraft, Grace, village discovery, Druid favor, Wrath, Heart forging, Heart enchantment, and the Verdant Warden.
- Old Forest progression now targets approximately 70, 75, 95, 100, 140, 80/95, and 180 leagues as the campaign state advances, while retaining the final 180-league route objective for completion accounting.
- Added reasonable-attempt readiness floors so a slightly constrained milestone attempt is preferred over an unnecessary supply loop. Supply runs remain conditional on a goal-specific material benefit and are tracked per goal rather than suppressing later milestones.
- Made simulator route choices goal-aware: early goals use the Overgrown route, village/Druid goals enter the hidden village, the Grace goal follows the peaceful White Hart sequence, the Wrath goal fights the Thorn-Crowned Hart, and the final goal sings at the altar. Random retains weaker general choices while still understanding mandatory authored progression.
- Added goal-aware aggressive milestone travel settings for the critical Hart and Warden attempts, avoiding a simulator-created hard-push return failure without changing capacity, food, encounter, combat, or boss tuning values.
- Exposed `oldForestCurrentGoal`, `oldForestTargetMilestoneDistance`, `oldForestGoalReason`, `oldForestSupplyRunReason`, and per-expedition goal history in campaign telemetry, compact export, and CSV output.
- Kept Old Forest completion tied to the secured Verdant Warden flag instead of marking the route complete merely because an early milestone distance was reached.

### Manual changes

The attached simulator/planning guide supplied the state-machine goals, strategy expectations, telemetry fields, and no-rebalance constraint. No gameplay balance values were changed. Concurrent workspace changes to town assets/data were left untouched and are not part of this simulator commit.

### Verification and resulting prototype state

The focused campaign-planning suite passes 8 assertions. The current-campaign progression suite passes 5, deterministic simulation passes 62, Old Forest progression passes 9, replay passes 15, Pass 2 Old Forest regressions pass 11, and the targeted Content Editor tests remain green from Pass 2. A diagnostic batch of 100 Aggressive, 100 Cautious, and 100 Random campaigns at an 18-expedition cap showed explicit village/Wrath goal selection and average desired distances of 89.74, 93.02, and 72.28 respectively; the run remains useful for later balance/reliability tuning, with Warden attempts still limited by the current encounter/failure rates rather than a planner stuck on the fixed 180 objective.

## 2026-08-25 - Old Forest Cooking Economy and Simulator Follow-Up

### Goal

Make Old Forest Road more progression-friendly through a moderate ingredient-economy correction and a small simulator upgrade. Keep the 10-slot Material Bag, route capacity, and authored recipe outputs bounded while reducing the chance that a run finds ingredients but cannot turn them into useful provisions.

### AI-assisted implementation

- Increased common cooking access without making honey routine: the forest ingredient table now weights Wild Berries at 30, Mushrooms at 30, Fresh Herbs at 21, Raw Meat at 18, and Honey at 8. Woodcraft foraging now produces deliberate Mushrooms/Fresh Herbs or Berries/Fresh Herbs bundles, and additional Woodcraft branches add Berries, Mushrooms, Fresh Herbs, and small Rare Herb chances. Honey also has uncommon Abandoned Camp, Hidden Hollow, and Hermit's Fire sources.
- Added limited Hidden Village provisions stock: Wild Berries 10g/3, Mushrooms 12g/2, Fresh Herbs 14g/2, and Honey 28g/1. The shop accepts ingredient-tagged food, but the stock is intentionally too small and expensive to replace expedition gathering.
- Reduced the repeatable Wild Boar and Wolves in the Brush Raw Meat reward from 3 to 2, preserving light meat pressure without changing route capacity or the 20/30 base party provision capacity.
- Reworked simulator cooking to score the full known recipe set, account for round-trip and campaign-goal deficits, favor Forestwarden Stew/Honeyed Forest Preserves for deep preparation when appropriate, and cook repeatedly at camp or the Inn up to the current preparation target. Normal return planning now keeps a small extra encounter reserve and does not trigger an emergency turnaround when an available camp cooking opportunity can solve the immediate food deficit.
- Added simulator-only material priority selection and unsecured-material replacement under bag pressure. Useful recipe ingredients now displace redundant Raw Meat before the run changes permanent bag capacity or secured loot behavior. Campaign preparation uses the same recipe-aware selection for its packed materials.
- Added cooking and supply telemetry for materials found, priority discards, recipes used, provisions gained by recipe, ingredient shortages by recipe, and missed cooking opportunities. Campaign telemetry additionally reports the percentage of campaigns learning and using each major food recipe in compact, CSV, and aggregate summaries.

### Manual changes

The attached balance guide supplied the ingredient availability, limited-stock, Raw Meat, simulator, and reporting direction. No new art was required, no recipe provision output was increased, and the Content Editor was left unchanged.

### Verification and resulting prototype state

The focused Old Forest balance suite passes 9 assertions, including Woodcraft ingredient bundles, limited village stock, recipe-aware packing, strong-recipe use, cooking-before-failure, Normal reserve tuning, simulation-only bag replacement, and the unchanged route capacity contract. Campaign planning passes 11, deterministic simulation passes 62, current-campaign progression passes 5, Old Forest progression passes 9, Pass 2 Old Forest regressions pass 11, combat passes 37, and replay passes 15. The broader campaign suite still stops at a pre-existing fixture that expects `wayfarers_cloak` and `rope` in the default packed loadout while the current authored default contains only `torch`; the location suite likewise has pre-existing Hall/artwork and content-count expectations that disagree with `HEAD`. Those stale fixtures were not changed as part of this balance pass.

For the next 100 Aggressive / 100 Cautious / 100 Random campaign batch, watch `oldForestCompletionRate`, `oldForestReachedRate`, goal-specific trip counts, food-recipe learning and usage rates, `recipesUsedById`, cooking provisions by recipe, ingredient shortages, `cookingOpportunityMissedCount`, materials found by ingredient, priority discards, emergency turnarounds, provision exhaustion/death rates, and return failures by depth. The desired outcome is more reliable milestone preparation and stronger recipe usage without a capacity increase, a flood of Honey, or a new simulator-created hard-push failure.

## 2026-08-26 - Old Forest Flask Objective-Limited Campaign Simulation

### Goal

Allow campaign simulations to stop at the current Old Forest objective instead of continuing into Barenton, Val sans Retour, and Search for Merlin. The existing full `campaignMode: "progression"` behavior remains the default when no completion objective is selected.

### Implementation

- Added `completionObjective: "old_forest_flask"` for progression simulations. It keeps the existing Old Forest milestone planner active, holds the route on Old Forest, and stops with `completion-objective-achieved` only after the Verdant Warden flag and Merlin's Flask are both present after a safe return.
- Added objective-aware `completed`/`completedPlan` semantics, Flask completion rates, Warden attempt/victory rates, Flask trip statistics, and compact JSON/CSV configuration metadata.
- Added the simulator UI objective selector with Full Campaign and Old Forest: Secure Merlin's Flask options.
- Added focused regressions for safe-return semantics, no later-route leakage, no false completion at 180 without the Flask, immediate stop after success, metrics/export metadata, and UI behavior. No gameplay balance values changed.

### Verification

The objective planning suite passes 15 assertions; current-campaign progression passes 5, deterministic simulation passes 62, Old Forest progression passes 9, and replay passes 15. The broader campaign fixture still has its documented stale packed-loadout expectation for `wayfarers_cloak` and `rope`; it is unrelated to objective-limited simulation.

## 2026-08-25 - Old Forest Material Reward Validation Correction

The three new Woodcraft Rare Herb rewards in Woodland Foraging, Beneath the Roots, and Ancient Spring now roll the existing one-entry `rare_herb_find` loot table. Its `type: "material"` entry uses `materialId: "rare_herbs"`, so the reward is staged in the expedition Material Bag without creating an inventory item. The focused browser balance regression now confirms the in-game reward path; the full Content Editor catalog validation and its material-reward regression are also part of the verification gate.

## 2026-08-26 - Path-Based Encounter Eligibility Cleanup

### Goal

Make encounter applicability path-based so an encounter's authored `pathIds` are the single source of truth, while preserving alternate routes and legacy content compatibility.

### AI-assisted implementation

- Removed the encounter-level `expeditionIds` eligibility check from `EncounterManager`; current-path membership, direction, distance, requirements, occurrence limits, and existing flags remain active.
- Removed all 47 redundant encounter `expeditionIds` fields from `js/encounter-data.js`. The `fountain_barenton` compatibility fixture remains on `legacy_fountain`, while Leper Knight now explicitly uses both `old_forest_road` and `fountain_of_barenton`.
- Added a focused path-eligibility browser regression covering Old Forest Road, shared Leper Knight availability on both routes, Overgrown Trail-only content, and a conflicting legacy `expeditionIds` field.

### Manual changes

The attached cleanup guide supplied the path-source-of-truth migration, Leper Knight regression, backward-compatibility, and no-rebalance requirements. No expedition definitions, encounter weights, combat stats, loot chances, economy, distances, or simulator strategy behavior were changed.

### Verification and resulting prototype state

The Content Editor now preserves legacy encounter `expeditionIds` in raw content but ignores them for references and emits `Legacy encounter expeditionIds field is ignored; use pathIds instead.` as a warning. Its README documents path-based applicability. Focused Game and Content Editor tests pass, alternate paths continue matching the player's current path, and legacy `expeditionIds` no longer affect encounter eligibility.
## 2026-08-26 - Outcome-Based Cautious Simulator Choice Safety

### Goal

Make the Cautious simulator choose authored safe positive outcomes, including loot and recipe rewards, without inferring danger from choice labels or encounter-specific item names. Preserve conservative behavior around combat, injury, resource loss, harmful random branches, dangerous transitions, and unknown deferred consequences.

### AI-assisted implementation

- Replaced Cautious's generic label/ID keyword scoring with the reusable `SimulationChoiceSafety` classifier. It recursively inspects choice costs, outcomes, branches, `randomChance`, `conditional`, and `randomOne` effects and reports `clearly-safe`, `bounded-risk`, `dangerous`, or `unknown` with positive utility, risk score, and a short reason.
- Safe item/loot/material, recipe, knowledge, access, and positive-resource outcomes now provide generic positive utility. Combat, injuries, resource/item costs, expedition failure, path changes, harmful nested branches, and deferred dialogue are scored conservatively. Aggressive and authored encounter-planning behavior were not changed.
- Added selected-choice telemetry containing encounter ID, choice ID, safety classification, positive utility, risk score, and reason, plus per-run and batch safety counts and encounter-level safety distributions.
- Audited Old Forest choices: safe positives previously rejected by the keyword penalty now include abandoned camp search, abandoned cart search, discarded bundle opening, and lost purse pickup. Deferred Leper Knight dialogue remains unknown; no unrecognized Old Forest outcome type is treated as safe.

### Manual changes

The attached simulator guide supplied the outcome-based classifier, Cautious preference, telemetry, audit, and no-balance-change requirements. No encounter content, loot tables, combat values, economy, or Aggressive behavior changed.

### Verification and resulting prototype state

The focused deterministic simulation suite passes 64 assertions, including safe loot/recipe preference, combat/health/random/unknown-risk cases, neutral-choice ties, selected-choice telemetry, CSV fields, and batch summaries. The Old Forest balance suite passes 10 assertions. Broader campaign, progression, and replay suites were also attempted but retain unrelated current-branch fixture failures from the separate recipe/content work; none of those files were modified here. `git diff --check` passes.

## 2026-08-26 - Corrective Context-Aware Cautious Simulator Policy

### Goal

Repair the severe starvation regression introduced by the previous safety pass while preserving its safe-positive loot and recipe choices.

### AI-assisted implementation

- Restored Cautious to a contextual strategic score layered with `SimulationChoiceSafety`; the classifier is now a safe-positive override and risk adjustment rather than an absolute policy.
- Cautious now uses current Arthur/party health, carried healing, provisions versus projected return cost and encounter reserve, outbound/returning direction, turnaround distance, unsecured loot value, equipment quality, campaign-goal context, and enemy metadata.
- Manageable combat is opportunistic when Arthur is healthy and supported, while critical health without healing, scarce provisions, late return travel, and valuable unsecured cargo reduce combat willingness. Provision-loss penalties scale with return-safety slack.
- Added deterministic regressions for healthy/critical combat decisions, provision scarcity, returning cargo, outbound combat willingness, non-absolute combat scoring, harmful random branches, safe-positive override, and a small campaign batch. Aggressive behavior and game content were unchanged.

### Manual changes

The corrective guide identified the regression as the static safety score replacing contextual strategy. This pass changes simulator strategy logic and tests only; no encounter outcomes, costs, enemy stats, loot, recipes, item values, weights, or distances changed.

### Verification and resulting prototype state

The focused deterministic simulation suite passes 66 assertions. A 12-campaign × 5-expedition Cautious batch improved from the reported broken baseline of 0% completion, 96% resource exhaustion, 2.08 average expeditions, median 1, and 0.18 combats to 100% completion, 0% resource exhaustion/death, 5 average and median expeditions, and 10.08 average combats, while retaining safe-positive selections.
