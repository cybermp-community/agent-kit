---
title: Player spawn and health diagnostics
description: Diagnose falling through the map, zero health and missing respawn by tracing spawn ownership, readiness and health initialization.
environment: client
verificationStatus: static-cross-check
aliases: [spawnPlayer, respawn, zero HP, падаем под карту, здоровье 0, респавн, mira_utils]
---
# Player spawn and health diagnostics

Use this recipe for falling through the map after connecting, zero HP or missing respawn. Client native calls require `use_game_natives = true`; authorization and match rules remain server responsibilities.

## 1. Establish one spawn owner

Before changing coordinates, inspect enabled resources in `server.toml`, their configuration and every `spawnPlayer` call. Include utility autospawn (for example `mira_utils` if installed), starter placeholders, connection handlers, team/base spawn and death handlers. Log resource name, player/session ID, request ID, reason and destination at dispatch and at the client call. Count actual calls for one join or respawn: one authoritative flow should issue one request. Disable competing autospawn through its supported configuration or remove the redundant placeholder. Check other utility responsibilities before disabling an entire resource.

If two paths change together, record the combined result; isolate them before attributing the cause to one. Raising Z alone does not establish correct ownership, collision or streaming.

## 2. Separate request acceptance from readiness

Register lifecycle observation before issuing the request. `mp.local.spawnPlayer(...)` returning `true` means the request started. It does not establish puppet availability, health initialization or world collision. Observe `mp.game.onLocalPlayerSpawned`, resolve the current puppet and verify the active request before follow-up native calls. See [player mechanics](../player-mechanics.md#player-spawning-implementation) and the [official lifecycle guide](https://docs.cyber.mp/guides/client/lifecycle/).

Use a bounded wait and a request/session generation. Cancel pending work on disconnect, resource stop, a newer request or a phase change that invalidates it. An old callback must not grant equipment or report a newer spawn complete. Check destination streaming and collision separately; a fixed delay is not proof of readiness.

## 3. Initialize maximum health before current HP

Follow the [official health initialization sequence](https://docs.cyber.mp/guides/client/spawning-player/#initializing-health-stat-pools) and compare the [Freeroam health service](https://github.com/Cyber-MP/CyberMP-Freeroam/blob/main/resources/freeroam/client/src/modules/game/health/health.service.ts) for the target versions. Once the current puppet is ready:

1. Establish the intended maximum through the Health stat and modifiers owned by the mode.
2. Set current health in explicit units. The `perc` argument selects percent or absolute points; 100% of a zero maximum remains zero. 300 HP is a mode choice, not a CyberMP default.
3. Read back maximum and current HP after native updates take effect. Repeating initialization must not stack maximum-health modifiers. Remove or replace only owned modifiers; preserve other systems' modifiers.

The [requestHealthPoints helper](../player-mechanics.md#health-modification-implementation) only requests current HP; it is not a complete spawn initializer. Test an initial maximum of zero, death and a second respawn. Mocks should model maximum, units and clamping rather than return positive HP for every request.

## 4. Check game rules before changing APIs

Log phase, team, alive/present state, respawn eligibility and queue deadline. For capture also log zone membership, owner, progress, presence by team and score timer. Explain these cases according to the project rules:

- `waiting`: check whether respawn and capture are permitted with the current player count.
- An owned point at 100%: a stationary capture bar can coexist with an advancing score timer.
- Equal opposing presence (1:1): check configured contest and scoring rules.

These are diagnostic cases, not universal CyberMP rules. Expose state in HUD or diagnostic output so players can distinguish waiting from failure.

## 5. Verify the complete lifecycle

Exercise join, death, respawn, delayed puppet readiness, superseded requests, disconnect, resource stop and restart. Check one spawn per transition, initialized HP without maximum growth, loadout only after readiness and no callbacks after cancellation. Clean up owned listeners, commands and timers on `resourceStop`; repeated cleanup should be safe.

In game, verify destination collision, movement, HP, equipment and a second client's observations. Record actual CyberMP client/server and game builds, declaration versions and kit revision. Compilation establishes declared compatibility; mocks establish modeled behavior. Neither proves native physics or streaming. Supplied session reports describe user-confirmed recovery after removing competing spawn paths and fixing health initialization, with actual runtime builds unconfirmed; this does not establish compatibility on other builds.
