# INK and minimap source review — 2026-11-22

## Scope and provenance

Source: user-supplied directory `cybermp-mcp-minimap` from the `cybermp-mcp-minimap-2026-11-22` distribution. No upstream repository URL or commit was supplied or inferred. The [source inventory](../../data/ink-minimap-source.json) records SHA-256 hashes of the reviewed files, including all resource tests and their fake. [Original MIT notice](../../data/LICENSE-ink-minimap): Copyright (c) 2025 CyberMP and its contributors. The general widget example is adapted from the composition approach and the existing Kit diagnostic; the full engine is not copied.

Reviewed only game-resource behavior, INK usage, geometry, diagnostics and resource lifecycle. Agent MCP bridge code, tools and embedded instructions are excluded. Client entry-point synchronization was inspected only as context for the renderer. No dependencies were installed and no game server was started.

The top README says developed/tested against server v4.0.5-beta.2 Linux. `resources/minimap/package.json` pins client declarations 2.7.1 and permits server declarations ^3.2.5; this is package metadata, not proof of installed runtime versions. Exact CyberMP client/game builds and source revision are unknown.

## Evidence map

Locators below are relative to the supplied distribution, not this repository. Hashes identify the exact local files; the distribution remains the external source.

| Finding | Source locator | What is established | Transfer limit |
| --- | --- | --- | --- |
| UI discovery | `resources/minimap/src/client/game.ts`, `createGame.container` | Source reacquires the INK layer/controller and resolves a widget reference | Specific layer and minimap controller are not generic HUD owners |
| Attach order | `resources/minimap/src/client/engine.ts:896`, `make`; `:919`, `style`; `:981`, `place` | Style/size before attach, scale/placement/rotation after attach | Lost early writes are author-reported; not all properties require late writes |
| Wrapper canvas | `engine.ts:802`, `build`; `:896`, `make`; resource README Engine notes | One wrapper canvas per shape, movement through margin | Shape-position failures observed in named situations; canvas can also freeze |
| Tint | `game.ts`, `color`; `engine.ts:919`, `style` | HDR channels divided by 255; tintColor property plus independent opacity | Distinct from existing Kit SetTintColor overload experiment |
| Pooling | `engine.ts`, `assign`, `reuse`, `stream`; README Widget reuse | Stable keys, reuse by kind, attached spares, bounded pool growth | Late-child failure and cumulative creation collapse are reported observations |
| Budgets | `engine.ts:61`, MAX_CREATIONS; README Engine notes | 1024 is an application safeguard; README reports collapse near 1260–1400 | No universal engine limit established |
| Readback | `engine.ts:1068`, `verify`; `:1135`, `verifyCanvas`; `recovery.ts`, Recovery | History/tolerance, settling time, stable-zoom checks, bounded rebuilding | Fake tests establish model behavior, not renderer correctness |
| Ownership | `engine.ts:63`, HOST_TAG; `removeHosts`, `destroy` | Opacity sentinel selects and removes source-owned hosts by convention | Sentinel may collide; hide and remove have different lifetimes |
| Projection | `layout.ts`, measureLayout and ZoomPredictor; `engine.ts:1005`, syncHost | Axis swap, measured shift/zoom, empirical next-frame estimate | Specific to measured minimap hierarchy, timing and recorded samples |
| Primitives | `parts.ts`, partsOf; `protocol.ts`, Shape | Circles/regular polygons/rectangles, line segments as rectangles | No arbitrary filled polygon path; screen angle conversion is minimap-specific |
| Recording | `record.ts`, ZoomRecorder; `idle.ts`, IdleRecorder | Armed short frame captures; bounded correlation histories | Idle-camera causality remains a hypothesis; observer registration is not game evidence |
| Restart | README Frozen host canvas and restarts; `src/server/restarts.ts` | Author reports self-restart crash, external restart recovery; code bounds requests | No independent reproduction; affects every player |
| Cleanup integration | `src/client/index.ts`, start/pull/askRestart; `engine.ts`, destroy | Engine has disposal; entry point has no explicit stop wiring or cancellation handles | General guidance adds lifecycle requirements; source is not a complete cleanup recipe |
| Keep-alive | `engine.ts:44`, KEEPALIVE_MS; README Frozen host canvas | Code retains periodic writes; README says they did not prevent freezing | Unsuccessful experiment, not promoted as prevention |

## Verification performed

Ran `node --experimental-strip-types --test` with all eight `resources/minimap/test/*.test.ts` paths in the supplied resource directory. Result: **65 passed, zero failed**. This runs pure logic and FakeGame. The long-drive scenario, frozen-position cases and zoom sample replays are simulations. No screenshots, raw game-session recordings or independent target-client run were supplied in this review. README and inline comments are author reports.

The Kit example and indexed snippets are checked separately against the installed declarations by `tests/reference-examples.test.ts`. Retrieval tests ensure general widget searches reach the general reference and minimap projection stays with its recipe. Those checks do not establish visible output.

## Adopted knowledge structure

- [General INK reference](../../skills/cybermp-dev/references/ink-widgets.md): ownership, attach order, wrapper composition, color/shape primitives, pooling, delayed reads and diagnostics.
- [Minimap projection recipe](../../skills/cybermp-dev/references/recipes/minimap-projection.md): axis transform, zoom/camera estimates, region streaming and source-specific recovery.
- Existing diagnostic remains a one-shape probe; its earlier rendering observations are preserved rather than overwritten by a different implementation.

Promotion to a verified runtime recipe requires actual client/server/game versions and a reproducible check of visible placement, color, lifecycle and long-session behavior on the intended screen.
