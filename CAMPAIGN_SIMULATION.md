# Multi-Expedition Campaign Simulation

## Shared production architecture

```text
Player/save state
      |
CampaignRules ---- EconomyRules ---- HealingRules
      |                                  |
ExpeditionRules                    Inn rest action
      |
CampRules / CraftingRules
      |
normal game / single-run simulator / campaign simulator
```

The campaign runner extends rather than replaces `SimulationRunner`. Each campaign expedition is still a complete deterministic production-rule simulation. Its settled ending player state becomes the next expedition's starting state.

`CampaignRules` owns town-entry provision-floor behavior, real merchant sales, and real provision/item purchases. `HealingRules` owns the Inn quote and mutation. The normal UI and automated between-expedition policies invoke these same objects.

## Persistent health

Arthur's authoritative base maximum is `PLAYER_CHARACTER_DEFINITION.combat.maxHp`, currently **40 HP**. Companion maxima remain in each companion definition; Sir Kay is currently **50 HP**. `HealingRules.arthurMaxHealth(player)` is the future extension point for equipment, relic, injury, buff, or progression modifiers. Combat damage was not rescaled.

Save schema 6 adds:

```js
{
  arthurHealth: 40,
  companionStates: {
    sir_kay: { health: 50 }
  }
}
```

`ExpeditionRules.startExpedition` snapshots persistent health. `ExpeditionRules.settle` writes surviving Arthur and companion health back after success or failure. Entering town and starting another expedition do not heal anyone implicitly. Old saves migrate without changing the localStorage key, and sanitization clamps stored health to current data-defined maxima; a former Kay value above 50 therefore loads as 50.

## Inn healing

The currently implemented playable settlement is the Village at the Edge of Brocéliande; there is no separate Camelot location in this prototype. Its existing Inn is therefore the player-facing recovery location rather than inventing a new settlement.

Current centralized rest tuning:

```js
HEALING_TUNING.innRestoration = 10;
HEALING_TUNING.innRestGoldCost = 3;
```

The Inn shows current/max health, exact healing amount, and resulting health for Arthur and the selected companion. `HealingRules.quoteInnRest` is non-mutating. `HealingRules.restAtInn` applies one party operation: each active member restores up to 10 HP, each is capped at their own maximum, and the shared action costs 3 gold once. It charges only when at least one active member can heal and the player can afford it, persists immediately through the normal save path, and never charges when the whole active party is full. The player can invoke that same action repeatedly in one Inn visit; every successful rest saves, rerenders the next quote, and charges separately until the party is full or the next rest is unaffordable. With no selected companion, only Arthur participates.

Campaign policies automate this exact same action and consider every active party member when applying their healing threshold. A policy repeats production rests while any active member remains below its target and gold remains available; reaching the threshold, reaching full health, or failing the next payment stops the loop. Healing telemetry records quoted/potential recovery separately from actual applied recovery: an unaffordable rest retains `quotedHealthAfter`, `quotedHealingAmount`, and `quotedGoldCost`, while actual `healthAfter` remains unchanged and actual healing/cost remain zero. Per-member detail remains in `partyMembers` and `healingByPartyMember`, and every attempted production call remains in `restActions`. Per-expedition CSV exposes `arthurHealing`, `companionId`, `companionHealing`, and `healingCost`. A zero-health companion is marked unavailable only if the companion remains at zero after normal between-expedition actions.

## Running a campaign

```js
const campaign = CampaignSimulationRunner.run({
  id: "aggressive-75",
  seed: "campaign-test-1",
  expeditions: 10,
  strategy: "aggressive",
  betweenExpeditionPolicy: "conservative-sustainer",
  turnaroundDistance: 75,
  healingEnabled: true,
  startingState: {
    currentGold: 100,
    provisions: 30,
    arthurHealth: 40,
  },
});
```

Use `expeditionPlan` for a repeated distance list:

```js
CampaignSimulationRunner.run({
  seed: "graduated-plan",
  expeditions: 5,
  expeditionPlan: [50, 50, 75, 75, 100],
});
```

Expedition seeds are stable and derived as:

```text
<campaign seed>:expedition-0
<campaign seed>:expedition-1
...
```

## Between-expedition policies

- `conservative-sustainer`: heals at or below 75%, plans with a five-unit provision margin, and shortens expeditions more readily when supplies are constrained.
- `aggressive-reinvestor`: heals Arthur below 50%; below 25%, if one rest still leaves Arthur below 50%, it strongly prioritizes one additional affordable production Inn rest. It can still rest for a selected companion below its policy threshold, plans with a three-unit provision margin, and accepts longer expeditions than conservative from the same constrained stock.
- `minimal-restock`: heals at or below 25%, plans with a one-unit provision margin, and avoids discretionary reserves.

Configured expedition distances are nominal targets. Each policy buys toward its preferred round-trip stock, selects authored pace/rations (Cautious/Generous when healthy, Normal/Normal for Random/Normal, Hard Push/Normal with Sparse allowed for constrained Aggressive), estimates the maximum supported out-and-back distance from the resulting production multiplier, adds its policy margin, then adds a fixed expected encounter-cost reserve based on expedition strategy: Cautious 4, Random/Normal 3, Aggressive 2, and Greedy 3 provisions. It uses the lesser of nominal and supported distance. Missing a preferred buffer reduces the target rather than ending the campaign. An unaffordable preferred rest is likewise recorded without stopping a viable departure. If a selected companion remains at zero after normal rest attempts, the campaign records the constraint and launches the next viable expedition without that companion. Policy decisions record desired/actual distance, selected pace/rations, passive food estimate, configured and actually used encounter reserve, total requirement, reduction and reason, safety margin, provision stock before/after purchase, affordable stock, gold before/after preparation, and party health before/after healing.

The reserve is deterministic and does not inspect future encounter identities, outcomes, costs, spacing rolls, or loot. If supplies cannot cover every preference, planning first drops the policy margin, then the fixed encounter reserve only as a last resort before declaring a true inability to launch. During outbound simulation, current distance and current provisions are rechecked against the passive return estimate plus the strategy reserve after resolved events. If that known-state requirement becomes unsafe, the expedition turns back immediately. Replay, run, campaign, and CSV telemetry record the emergency decision, trigger distance, passive return estimate, reserve, original target, and actual turnaround distance.

Town provision safety grants, persistent merchant stock, provision prices, item sale protection, sale values, expedition settlement, and Inn costs are production rules. By default recovered sellable loot is auto-sold through the real village merchant rules. `autoSellRecoveredLoot: false` disables that simulation convenience. Gear spending is reported as zero because the current default loadout already owns the available combat equipment and no useful upgrade-selection policy has been authored.

## Automated consumable purchasing

Between-expedition preparation first uses the same known Bandage recipe and generic crafting mutation as player-facing Apothecary crafting. If materials cannot meet the strategy target, it uses the authored General Goods offer and stock rules for the shortfall. Healing and provisions are resolved first; remaining gold can fund purchases without changing the existing combat item behavior. Each campaign owns persistent material/recipe state and a deterministic Bandage stock pool (currently eight at five gold each), and purchases reduce both gold and stock before the next expedition.

Bandage targets are strategy-driven: Aggressive targets 3 with a minimum preference of 1, Cautious targets 2, and Random makes a seeded purchase decision for 0–2. A small rest-cost reserve prevents a discretionary purchase from consuming the gold needed for an immediately available Inn rest. Existing packed utility items remain in place, and Bandages are added only when a free slot remains within the six-slot pack. Exact pack quantities are passed into `ExpeditionRules`, so only purchased/carried quantities can be consumed in combat.

Campaign and expedition telemetry reports crafting actions, Bandages crafted, `itemsPurchasedById`, `itemPurchaseGoldSpentById`, `itemsPackedById`, `itemsConsumedById`, `itemsReturnedById`, recovered materials, learned recipes, return-reward tiers/results, Bandage purchase/pack/use/return counts, Bandage healing performed, and total item-purchase spending. Decisions also record preferred targets and constraints when materials, stock, gold, or pack capacity prevent the preference from being met. Item stock is persistent for one simulated campaign and remains session-scoped in the normal browser shop, matching the existing provision-stock behavior.

## In-expedition management

Each campaign expedition delegates its live travel decisions to `SimulationRunner`. The strategy uses known party HP, provisions, direction/distance, and recent rest/camp locations to choose between continuing, a production `briefRest`, or the production pause → camp → `restAtCamp` lifecycle. Camp events use the existing contextual tables and seeded expedition RNG, then resolve through the same strategy encounter-choice function used by normal travel. Available campfire recipes are quoted and applied through `CraftingRules`; ingredients are consumed from the expedition's ten-unit Material Bag (secured town materials and newly found materials share the same capacity), and authored provision outputs are added through `ExpeditionRules`.

Per-expedition campaign telemetry preserves departure pace/rations, any changes during travel, brief-rest and camp-rest records, camp event IDs and choices, cooked recipes, consumed ingredients, output gains, Material Bag capacity/overflow/found/returned/lost fields, and health/provision deltas. Campaign totals and CSV exports aggregate these records, while each expedition replay retains the selected bag contents and decisions needed for a later visual replay. Settlement then carries the resulting persistent health, provisions, owned consumables, materials, learned recipes, gold, and other player state into the next expedition.

## Stops and outcomes

Campaign stop reasons currently include:

- `max-expeditions-reached`
- `arthur-died`
- `expedition-resource-exhaustion`
- `cannot-support-any-expedition`
- `simulation-safety-limit`

Telemetry classifies `arthur-died`, `expedition-resource-exhaustion`, and `cannot-support-any-expedition` as hard failures. `cannot-support-any-expedition` means the player cannot meet the production minimum and support even a distance-one round trip after normal preparation, including a last-resort calculation without the preferred safety margin. Unaffordable healing, unavailable preferred provision buffers, reduced target distances, and continuing without an incapacitated companion are separate strategy constraints; none ends a campaign while a viable expedition remains. `simulation-safety-limit` is classified separately as a simulation error, and `max-expeditions-reached` as completion. JSON and CSV telemetry expose the stop category, hard-failure reason, and constraint types.

## Batches and aggregation

```js
const batch = CampaignSimulationRunner.runBatch({
  scenarios: [{
    id: "cautious-50",
    strategy: "cautious",
    betweenExpeditionPolicy: "conservative-sustainer",
    turnaroundDistance: 50,
    startingState: { currentGold: 100, provisions: 30 },
  }],
  campaignsPerScenario: 100,
  expeditionsPerCampaign: 10,
});
```

Aggregation reports completion, true insolvency, death, desired/actual distance, target-reduction frequency/amount, selected pace/rations, brief rests, camp rests/events, cooking actions and outputs, consumed ingredients, low-HP and critical healing triggers, emergency aggressive actions, combats entered below 50%/25%, Arthur-versus-companion attacks and damage, ending gold/health, net campaign wealth, healing/provision/item spending, Bandages purchased/packed/used/returned, Bandage healing, recovered value, damage, combats, and economic growth. Results group by expedition strategy, between-expedition policy, and plan. `completedPlan` and completion rate require `max-expeditions-reached`; dying during the final expedition is never completion. Individual campaigns also report health thresholds, cumulative damage, healing efficiency, net-gold median/average, ROI, break-even rate, and one of:

- `economically-growing`
- `roughly-sustainable`
- `slowly-declining`
- `rapidly-unsustainable`

## Developer panel and export

Open `?sim=1` and use **Campaign Simulation**. It supports campaign count, expeditions per campaign, expedition strategy, between-run policy, turnaround distance, starting gold/food/health, and healing enablement. A campaign timeline is individually inspectable.

Exports:

```js
CampaignSimulationTelemetry.toJson(batch);
CampaignSimulationTelemetry.toCompactJson(batch); // primary analysis artifact
CampaignSimulationTelemetry.campaignsToCsv(batch);   // one row per campaign
CampaignSimulationTelemetry.expeditionsToCsv(batch); // one row per expedition
```

The Compact JSON export has `compactExportVersion: 2` and is organized as
`exportMetadata`, `batchSummary`, and a `campaigns` array. Each campaign contains
its aggregate `campaignSummary`, compact per-expedition records, and a sparse
`notableEvents` array. It preserves campaign and expedition seeds, path/region
IDs, configuration, progression, economy, provisions, health, injuries, travel,
rest, crafting, materials, encounters, combat, bandit, companion, and equipment
telemetry using stable IDs, counts, values, and outcomes. It intentionally omits
full state snapshots, replay decisions, generic event streams, combat action
sequences, encounter descriptions/choice labels, and other frame-level data.

`toCompactJson` is a projection of the existing campaign and expedition
telemetry, so the full JSON remains available for forensic inspection and future
replay work. Version 2 omits empty/null optional fields (missing means none or
zero where the field is a count/map), filters expedition encounter details to
combat, resource/health/item/material/progression changes, camp, notable, and
non-default-choice results, and keeps one canonical location for pace/ration
changes and campaign configuration. Homogeneous `batchSummary.groups` dimensions
are omitted; mixed dimensions remain available. `serializationStats` reports
campaign/expedition totals and kept/dropped encounter-detail counts.

`compactToJson` is retained as an equivalent method name for code that prefers
export-oriented naming. These v2 conventions apply only to Compact JSON; the
full JSON/replay export remains unchanged.

## Determinism and replay

```js
CampaignSimulationRunner.verifyDeterminism(configuration, "known-campaign-seed");
```

The replay payload retains campaign starting/ending state, campaign seed, derived expedition seeds, between-expedition decisions, purchases, healing, sales, settlement snapshots, and every expedition replay payload. Phase 1 can watch an individual full simulation expedition through the developer panel using its replay payload; full campaign/town sequencing remains future work. Compact JSON remains an analysis artifact and intentionally omits the decisions needed for playback.

## Tests

```sh
python tests/campaign_system_test.py
python tests/simulation_system_test.py
python tests/replay_system_test.py
python tests/location_system_test.py
```

The focused campaign suite covers save migration and clamping, player-facing active-party Inn behavior, flat-cost capped party healing, normal-game health persistence, shared campaign healing parity, exact policy thresholds, strategy pace/ration planning, failed-healing quote/application semantics, adaptive policy distances, production camp/cooking persistence, true insolvency, deterministic campaigns, persistent economy, summaries/CSV, and replay metadata.

## Current limitations

- The only production settlement is Brocéliande village; Camelot has not been authored.
- Companion health persists and the selected companion shares the player-facing Inn rest. An unselected companion is not healed; a selected incapacitated companion stops a campaign only if still at zero after normal preparation.
- Policies do not buy equipment because no meaningful upgrade path is currently available from the default loadout; Bandages are the current automated consumable purchase.
- Merchant stock persists within a simulated campaign exactly like the current browser session but is not saved in localStorage by the normal game.
- There is no injury, disease, fatigue, durability, chapter progression, optimal shopping, or balance recommendation system.
