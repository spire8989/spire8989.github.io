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

## Event lifecycle

Every action follows the same high-level sequence:

1. Validate the actor, definition, target mode, and resource cost.
2. Dispatch beforeAction.
3. Resolve the definition's effects for each resolved target.
4. Damage effects dispatch beforeDamage, damageDealt, damageTaken,
   damagePrevented when applicable, and afterDamage.
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

## Verification

Fast combat coverage reuses one headless Chrome session:

    python tests/combat_system_test.py

Focused integration coverage includes:

    python tests/simulation_system_test.py
    python tests/debug_tools_test.py
    python tests/replay_system_test.py
    python tests/campaign_system_test.py

The larger campaign/replay and content-distribution checks are grouped as
soak coverage:

    python tests/soak_regression_test.py

The soak wrapper sets GRAIL_RUN_SOAK=1 for long campaign and replay paths. Use
git diff --check before committing changes to either repository.
