# Expedition Simulation Developer Guide

## Architecture

The simulator is a second caller of production gameplay rules, not a separate balance model:

```text
data.js / tuning.js / encounter-data.js / combat-data.js
                         |
       encounters.js / combat.js / expedition-rules.js
                    /                         \
             game.js UI                 simulation.js
```

`js/random.js` provides the common random source. Normal play uses live `Math.random()` through that API. A simulation creates a deterministic source from a numeric or string seed and injects its `random` function into the expedition. Encounter spacing, weighted encounter selection, branches, chance outcomes, random loot and amounts, pending-action delay rolls, combat damage, and flee rolls all consume that expedition source.

`js/expedition-rules.js` owns party provision capacity/consumption, expedition construction, distance-based travel cost, turnaround state, carried-item snapshots, and settlement. Both `game.js` and `simulation.js` call it. Encounter stages and effects run through `EncounterManager`; combat runs through `CombatSystem`. Simulation skips presentation time but does not skip pending-action resolution or active-time combat rules.

## Browser console

Serve the project over HTTP, open it, and use the browser console. A single run:

```js
const run = SimulationRunner.run({
  id: "kay-greedy-75",
  seed: "balance-pass-001",
  companion: "sir_kay",
  provisions: 24,
  loadout: {
    weapon: "arthur_sword",
    armor: "quilted_hauberk",
    relic: "silver_stag_medallion",
  },
  packContents: ["wayfarers_cloak", "rope", "torch"],
  strategy: "greedy",
  turnaroundPolicy: { type: "fixedDistance", distance: 75 },
});
```

A batch with arbitrary scenarios:

```js
const batch = SimulationRunner.runBatch({
  scenarios: [
    { id: "cautious-50", strategy: "cautious", turnaroundPolicy: { type: "fixedDistance", distance: 50 } },
    { id: "greedy-reserve", strategy: "greedy", turnaroundPolicy: { type: "provisionReserve", reserve: 2 } },
  ],
  runsPerScenario: 100,
});

console.table(batch.summary.groups.strategy);
console.table(batch.summary.encounters);
```

`runBatchAsync` accepts the same request and yields to the browser every `yieldEvery` runs (100 by default). Use it for large interactive batches:

```js
const batch = await SimulationRunner.runBatchAsync({
  scenarios: [{ strategy: "random" }],
  runsPerScenario: 5000,
  yieldEvery: 100,
});
```

## Scenario fields

- `id` / `scenarioId`: stable grouping label.
- `seed`: numeric or string deterministic seed. Batch runs suffix it with their run index.
- `companion`: companion ID or `null`.
- `provisions`: committed departure provisions, clamped to real party capacity.
- `loadout`: equipment-slot-to-item-ID object. `{ equipment: {...} }` is also accepted.
- `packContents`: item ID array or item-to-quantity object.
- `strategy`: built-in strategy name or an object implementing the strategy interface.
- `turnaroundPolicy`: fixed-distance/resource-reserve configuration or a policy object.
- `startingState`: optional player-state overrides such as owned items, knowledge, flags, health, or provision stock.
- `maxSimulationSteps`, `maxCombatSteps`: infinite-loop safeguards.
- `travelStepDistance`: rule-step size in leagues; defaults to one.

Built-in strategies are `random`, `cautious`, `aggressive`, and `greedy`. They score only choices that pass the production requirement and affordability checks. Built-in policies are created by `TurnaroundPolicies.fixedDistance(distance)` and `TurnaroundPolicies.provisionReserve({ reserve, minimumDistance })`.

## Adding behavior

A strategy needs a stable `name`, `chooseEncounter(availableChoices, context)`, `chooseCombatAction(combat, expedition, context)`, and `chooseCombatTarget(combat, expedition, context)`. Pass the object as `scenario.strategy`; no runner change is required. The context includes the seeded random source.

A turnaround policy needs `name`, optional serializable `configuration`, and `shouldTurn(expedition, telemetry)`. Pass it as `scenario.turnaroundPolicy`.

## Telemetry and replay foundation

Each run contains identity/configuration fields, outcome/failure, distances, party health, provision accounting, gold, discovered/recovered loot and estimated merchant value, encounter/combat counts, step count, and duration. It also includes:

- `encounters`: availability at every stage, selected choices, path/direction/distance, resource and health deltas, gained/lost items, combat trigger, and result text.
- `combats`: enemies, before/after party HP, result/flee, damage totals, rounds/actions, and production combat events.
- `decisions`: the compact encounter and combat policy decisions.
- `events`: chronological human-readable expedition, encounter, combat, turnaround, and result events.
- `scenario` + `seed`: normalized configuration needed to rerun the deterministic rule stream.

The future replay system can rerun `scenario` with `seed` while consuming/asserting `decisions`, or present the recorded `events` directly. The event schema is intentionally plain JSON and uses stable content IDs.

Aggregates include rates, averages, median maximum distance, groups by strategy/companion/loadout/scenario/turnaround policy, and encounter frequency, direction, distance, and choice distributions.

## Debug panel and export

Open [http://localhost:8000/?sim=1](http://localhost:8000/?sim=1). The panel can run the current player loadout, a four-strategy suite, or a larger encounter-distribution sample. It shows compact aggregate results and lets you inspect individual runs. It is absent from ordinary URLs.

The panel downloads detailed JSON or one-row-per-run CSV. From code:

```js
const json = SimulationTelemetry.toJson(batch);
const csv = SimulationTelemetry.toCsv(batch);
```

## Automated verification

Run:

```sh
python tests/location_system_test.py
```

The dependency-light Chrome suite covers seeded determinism, different-seed variance, completion, batching, aggregation/invariants, normal-page debug isolation, and the existing end-to-end game flows.

## Current Phase 1 boundaries

All currently authored expedition encounters and both current combats use the simulator. Presentation delays are intentionally collapsed. The simulator does not yet drive a visual replay, enforce a recorded decision stream during replay, use a Web Worker, generate exhaustive loadout permutations, or model settlement shopping between multiple expeditions. `durationMs` and batch `generatedAt` are diagnostic metadata and are not deterministic replay fields.
