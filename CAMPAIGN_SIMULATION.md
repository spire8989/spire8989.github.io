# Multi-Expedition Campaign Simulation

## Shared production architecture

```text
Player/save state
      |
CampaignRules ---- EconomyRules ---- HealingRules
      |                                  |
ExpeditionRules                    Inn rest action
      |
normal game / single-run simulator / campaign simulator
```

The campaign runner extends rather than replaces `SimulationRunner`. Each campaign expedition is still a complete deterministic production-rule simulation. Its settled ending player state becomes the next expedition's starting state.

`CampaignRules` owns town-entry provision-floor behavior, real merchant sales, and real provision purchases. `HealingRules` owns the Inn quote and mutation. The normal UI and automated between-expedition policies invoke these same objects.

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

The Inn shows current/max health, exact healing amount, and resulting health for Arthur and the selected companion. `HealingRules.quoteInnRest` is non-mutating. `HealingRules.restAtInn` applies one party operation: each active member restores up to 10 HP, each is capped at their own maximum, and the shared action costs 3 gold once. It charges only when at least one active member can heal and the player can afford it, persists immediately through the normal save path, and never charges when the whole active party is full. With no selected companion, only Arthur participates.

Campaign policies automate this exact same action and consider every active party member when applying their healing threshold. Healing telemetry records before/after health and healing separately in `partyMembers` and `healingByPartyMember`, while retaining one shared rest cost. Per-expedition CSV also exposes `arthurHealing`, `companionId`, `companionHealing`, and `healingCost`. A zero-health companion is marked unavailable only if the companion remains at zero after the normal between-expedition action.

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

- `conservative-sustainer`: heals below 75%, buys round-trip provisions plus a five-unit margin, and stops if required restocking or healing is unaffordable.
- `aggressive-reinvestor`: heals below 35%, uses a smaller provision margin, and tolerates provision shortfalls when at least one provision can be packed.
- `minimal-restock`: heals only below 25%, buys the estimated round-trip requirement plus one, and avoids discretionary purchases.

Each policy returns a structured decision record. Later policies can add equipment purchases, recruitment, route selection, or dynamic targets without changing the campaign loop.

Town provision safety grants, persistent merchant stock, provision prices, item sale protection, sale values, expedition settlement, and Inn costs are production rules. By default recovered sellable loot is auto-sold through the real village merchant rules. `autoSellRecoveredLoot: false` disables that simulation convenience. Gear spending is reported as zero because the current default loadout already owns the available combat equipment and no useful upgrade-selection policy has been authored.

## Stops and outcomes

Campaign stop reasons currently include:

- `max-expeditions-reached`
- `arthur-died`
- `required-companion-unavailable`
- `cannot-afford-minimum-provisions`
- `cannot-afford-required-healing`
- `no-viable-expedition`
- `simulation-safety-limit`

Expedition failure does not automatically equal campaign death. A surviving Arthur retains health and resources and may continue if policy and economy permit.

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

Aggregation reports completion, expeditions survived, death/insolvency, ending gold/health, profit, healing/provision spending, recovered value, damage, combats, and economic growth. Results group by expedition strategy, between-expedition policy, and plan. Individual campaigns also report health thresholds, cumulative damage, healing efficiency, net-gold median/average, ROI, break-even rate, and one of:

- `economically-growing`
- `roughly-sustainable`
- `slowly-declining`
- `rapidly-unsustainable`

## Developer panel and export

Open `?sim=1` and use **Campaign Simulation**. It supports campaign count, expeditions per campaign, expedition strategy, between-run policy, turnaround distance, starting gold/food/health, and healing enablement. A campaign timeline is individually inspectable.

Exports:

```js
CampaignSimulationTelemetry.toJson(batch);
CampaignSimulationTelemetry.campaignsToCsv(batch);   // one row per campaign
CampaignSimulationTelemetry.expeditionsToCsv(batch); // one row per expedition
```

## Determinism and replay

```js
CampaignSimulationRunner.verifyDeterminism(configuration, "known-campaign-seed");
```

The replay payload retains campaign starting/ending state, campaign seed, derived expedition seeds, between-expedition decisions, purchases, healing, sales, settlement snapshots, and every expedition replay payload. Visual replay and recorded-decision enforcement remain future work.

## Tests

```sh
python tests/campaign_system_test.py
python tests/simulation_system_test.py
python tests/location_system_test.py
```

The focused campaign suite covers save migration and clamping, player-facing active-party Inn display/affordability/save behavior, flat-cost capped party healing, normal-game health persistence, shared campaign healing parity and per-member telemetry, campaign determinism/divergence, insolvency, ten-expedition completion, persistent economy, batch aggregation/CSV, and replay metadata.

## Current limitations

- The only production settlement is Brocéliande village; Camelot has not been authored.
- Companion health persists, but there is no player-facing companion healing action yet. A selected incapacitated companion stops a campaign as unavailable.
- Policies do not buy equipment because no meaningful upgrade path is currently available from the default loadout.
- Merchant stock persists within a simulated campaign exactly like the current browser session but is not saved in localStorage by the normal game.
- There is no injury, disease, fatigue, durability, chapter progression, optimal shopping, or balance recommendation system.
