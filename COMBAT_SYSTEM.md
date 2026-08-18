# Combat System

## Purpose

Combat is a data-driven active-time system. The combat.js module owns the ATB
state machine and presentation-facing orchestration; the shared runtime
modules own the rules that resolve actions, targets, conditions, effects,
statuses, and reactions.

The same resolver is used by normal play, deterministic simulation, debug
combat, and replay. Adding an ability or passive should extend a definition or
the shared effect vocabulary rather than add an actor-specific branch.

## Runtime modules

- combat-data.js contains authored combat encounters, enemies, actions,
  abilities, and statuses.
- combat-targets.js, combat-conditions.js, combat-effects.js, and
  combat-events.js provide shared target resolution, trigger conditions, effect
  resolution, and event dispatch.
- combat.js advances gauges, opens player menus, normalizes legacy enemy
  actions/equipment traits, and records combat results.
- ability-rules.js owns persistent learned abilities, the selected 3-active /
  2-passive loadout, duplicate/unknown-ID filtering, and persistent Faith
  mutation used by encounters, camp production, and combat.

## Abilities, loadouts, and grants

Player learned abilities are saved as canonical IDs in `learnedAbilityIds`.
Selected learned actives and passives are saved separately in
`selectedActiveAbilityIds` and `selectedPassiveAbilityIds`, with capacities of
three and two. The shared AbilityRules layer validates these arrays, removes
duplicates and unknown IDs, prevents cross-kind selection, and auto-equips a
newly learned ability when a compatible slot is open.

Equipment, companions, and statuses provide temporary combat grants through
`grantedAbilityIds`. They do not consume player loadout slots. Companion
abilities use the same active/passive definition model, while companion
passives never appear in the player's loadout UI. The combat menu is built
from selected learned actives plus current grants; passive abilities register
through the normal event listener path and are never rendered as buttons.

All active actions pass through `abilityAvailability`, which is the canonical
validation path for resource cost, cooldown, charges, target validity, and
actor readiness. UI, simulation, and action resolution consume the same
availability result.

Faith is persistent, capped by `maxFaith`, and never refills automatically.
The generic `modifyResource` effect bridges Faith to the owning player even
when an encounter, camp production, or active combat resolves it. Combat-only
cooldowns and `chargesPerCombat` are transient: successful uses consume them,
cooldowns are measured in the owning actor's completed activations, and both
reset for the next combat. Resolve's existing `combatCharges` remains a
separate legacy combat resource.

## Event lifecycle

Every action follows the same high-level sequence:

1. Validate the actor, definition, target mode, and resource cost.
2. Dispatch beforeAction.
3. Resolve the definition's effects for each resolved target.
4. Damage effects dispatch beforeDamage, damageDealt, damageTaken,
   damagePrevented when applicable, and afterDamage.
   Positive `weaponDamage` also dispatches `attackHit` here, including on a
   lethal hit, before defeat events. Authored effects can opt out with
   `triggersOnHit: false`; legacy `onHit: false` remains supported.
5. Dispatch actionUsed.
6. Record the compact action event and dispatch the actor's turnEnd.
7. Check victory/defeat and emit combatVictory or combatDefeat, followed by
   combatEnd.

Activation emits actorReady and turnStart. Status expiration happens after
activation triggers. Flee emits combatFled and uses the same end lifecycle.

Listener order is deterministic:

    actor statuses
    equipped passives
    learned passives
    target statuses
    target passives

Stable IDs sort listeners within each group. Listener effects execute as their
owner, but the event source and target remain stable for the enclosing action.
oncePerCombat is scoped to the owning combatant and listener ID.

## Definitions and effects

Active definitions use kind: active, a targetMode, optional tags, an optional
cost, and an effects array. Passive definitions use kind: passive and a
trigger such as { event: damageTaken }.

Supported target modes are self, singleEnemy, singleAlly, allEnemies,
allAllies, and none. The resolver filters dead actors and accepts an explicit
target ID when the mode requires one.

The shared effect vocabulary currently includes:

- weaponDamage and dealDamage
- heal and modifyGauge
- applyStatus and removeStatus
- modifyStat and modifyResource
- storeCharge and consumeCharge
- conditional and randomChance
- setDefending, setFlag, attemptFlee, and applyInjury

Legacy player abilities, enemy actions, equipment combat triggers, and Bound
Warden traits are normalized into this vocabulary at runtime. Legacy aliases
remain in authored data where the editor or older replay fixtures still read
them.

## Statuses and conditions

Statuses are generalized definitions with duration, refresh behavior, target
sides, and event-triggered effects. Bleeding and Poisoned use the same
turnStart trigger path; periodic-damage fields remain readable for old
content.

Conditions can combine all/any groups and inspect source/target side, health
thresholds, statuses, action/event IDs, first use, once-per-combat, and an
injected chance roll. Conditions and effects must not call native Math.random().

## Persistent resources and determinism

Faith is a persistent player resource with a default and maximum value. Ability
costs are validated before targeting and paid exactly once only after the
action is valid. Older saves without Faith load with defaults.

Combat receives its random function through the combat state. Normal play
provides the live game source; simulation and replay provide seeded sources.
Damage rolls, target selection, status chances, flee rolls, and effect chances
all use that injected source. Combat state keeps a non-enumerable player
reference only while active so Faith mutations persist without polluting
expedition snapshots or replay payloads.

Learned abilities and selected loadouts are included in save migration,
simulation setup, replay snapshots, and campaign-state comparisons. Unknown
IDs are ignored during migration. Replay payloads record the ability ID, actor,
target, Faith spent, and remaining cooldown/charges for compact action events;
transient cooldown state itself is not persisted between combats.

## Pass 3 authoring contract

Combat abilities are authored in `COMBAT_ABILITY_DEFINITIONS` and are edited
through the unified GrailTools Combat > Abilities view. Both active and passive
definitions use the same identity fields: `id`, `name`, `description`, `kind`,
`tags`, and target metadata. Actives may add `prompt`, `cost`,
`cooldownActivations`, `chargesPerCombat`, and `effects`; passives use a
`trigger` with one of the live lifecycle events and may add conditions,
`oncePerCombat`, chance, and effects. Conditions support nested `all`/`any`
groups and the editor provides structured controls for the production effect
vocabulary. Deeper or uncommon authored shapes remain available through the
raw JSON fallback rather than being discarded.

The current authored roster includes Pommel Strike, Intercede, Charge,
Healing Prayer, Sweeping Cut, Guard Break, Smite, and Call the Storm, plus
Steady Heart, Pilgrim's Resolve, Unyielding, Battle Prayer, and Threefold
Concord. The starting learned set is Guard Break and Healing Prayer. Chapel,
shrine, camp, Barenton, and Val hooks demonstrate Faith changes and ability
learning; the White Stag Shard, Barenton Stone, and Black Glass Tear route
rewards support the Threefold Seal recipe and its granted Concord passive.

When adding content, prefer a new definition, shared effect, condition, or
event hook over a combat-specific branch. The editor validates IDs, tags,
target modes, resource/cooldown/charge ranges, trigger events, condition
shapes, effect fields, nested depth, and used-by references before saving.

## Verification

Fast combat coverage reuses one headless Chrome session:

    python tests/combat_system_test.py

Focused integration coverage includes:

    python tests/simulation_system_test.py
    python tests/debug_tools_test.py
    python tests/replay_system_test.py
    python tests/campaign_system_test.py

Pass 3 content and crafting coverage also includes:

    python tests/location_system_test.py
    python -m unittest Tools.ContentEditor.tests.test_content_editor
    python -m unittest Tools.ContentEditor.tests.test_phase6_filters

The larger campaign/replay and content-distribution checks are grouped as
soak coverage:

    python tests/soak_regression_test.py

The soak wrapper sets GRAIL_RUN_SOAK=1 for long campaign and replay paths. Use
git diff --check before committing changes to either repository.
