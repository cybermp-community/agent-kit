---
title: World regions on the native minimap
description: Case study of world-to-minimap projection, measured zoom, rotation, shape decomposition and streaming with native INK widgets.
environment: client
verificationStatus: static-cross-check
aliases: [world minimap, projection, zoom, streaming, зоны миникарты, проекция]
sectionPriorityAliases:
  coordinate-transform: [minimap projection, проекция миникарты]
---
# World regions on the native minimap

This recipe describes the supplied `cybermp-mcp-minimap` implementation. Use [INK widgets](../ink-widgets.md) for general attachment, layout, color, pooling and readback; those techniques apply to other native game UI too. The existing [single-shape diagnostic](minimap-zones.md) remains a smaller rendering probe and contains no world projection.

Warning: rendering, vehicle/interior behavior and restart recovery below are author-reported observations on server v4.0.5-beta.2 Linux, with client and game builds unrecorded. The [audit](https://github.com/mo3g666/cybermp-agent-kit/blob/main/packages/agent-kit/docs/audits/2026-11-22-ink-minimap.md) identifies the supplied snapshot and separates source tests from game evidence. These formulas and tuning values need validation on the target HUD.

## Coordinate transform

The measured minimap projection uses pin-container translation in `layout.ts:measureLayout` is `T.x = -s * playerY` and `T.y = -s * playerX + c`, where `s` is pixels per world meter and `c` is a vertical shift. This implementation maps world Y to screen X and world X to screen Y. It derives `s = -T.x / playerY` when the denominator is sufficiently far from zero, then `c = T.y + s * playerX`. Near Y = 0 it uses the other component with the previous shift; if neither component is usable, it keeps the last valid layout. The 100 m denominator threshold is a numerical policy in this source.

For a region centered at `(cx, cy)`, its per-shape canvas margin is `(s * cy - BASE/2, s * cx - BASE/2)`. Its child is BASE = 100 widget units wide/high and scaled to `(worldWidth * s / BASE, worldHeight * s / BASE)`. The shared translating canvas is moved by `(-s * playerY, -s * playerX)`, while an outer canvas supplies camera rotation and vertical shift. Thus world deltas, rather than absolute distance from the world origin, dominate the error when the predicted zoom is imperfect. Anchor and pivot choices are part of this hierarchy; copying margins into a different parent is not equivalent.

Warning: shift 0 on foot, 112.5 px in a vehicle, default scale 3.182 and the accepted scale range 0.3–16 are source observations or defensive defaults, not universal minimap constants. Measure stationary points and known offsets before relying on the transform. This recipe establishes no world-map drawing API.

## Zoom and camera timing

The author reports container zoom and rotation reads one frame behind the rendered transform. `ZoomPredictor` predicts the next scale from recent changes, with decay and periodic jumps. Its time-based mode tracks jump rhythm in milliseconds so a cadence observed at about 38 FPS is not treated as the same frame count at 90 FPS. The first frame of a new motion is explicitly unpredictable. These are empirical estimates, not an engine-provided projection matrix.

`syncHost` extrapolates one angular step, normalizes wraparound and suppresses extrapolation for a jump over 30 degrees. The engine hides an implausible measured scale and judges readback failures only after the zoom has stabilized. Validate drift while accelerating, braking, entering a vehicle and entering low-ceiling interiors; replaying recorded samples in a unit test does not confirm new game conditions.

## Regions and streaming

`partsOf` converts a circle or regular polygon to one circle widget, a rectangle to one rectangle widget, and a polyline to one rectangle per nonzero segment. The source rotates widget axes by `90 - worldAngle`. A closed polyline can represent an outline, but it does not supply arbitrary polygon filling or specialized join/cap geometry. Validate corners, clipping and thick overlapping segments separately.

The engine selects nearby parts by distance to their extent, prioritizes nearest parts, and uses a wider removal radius to reduce boundary flicker. It reassigns attached widgets instead of creating one per world region visited. The supplied settings are 96 visible parts, 8192 known parts, a view radius of 800/zoom world meters, 1.3 removal hysteresis, culling every 15 frames or after 25 m movement or 5% zoom change, and at most eight slot changes per frame. Persistent overflow for 1.5 s grows the next pool by about 1.5x, still bounded by the visible-part cap. These are resource policies; none is an engine capacity guarantee.

Server and personal region layers, stable IDs and validated geometry feed this rendering process. Keep authoritative territory membership and scoring on the server; an overlay is a visualization. The supplied source additionally pulls a version/hash snapshot every two seconds to recover after missed update notifications. That is a resource-level synchronization strategy, separate from INK rendering and from any agent tooling.

## Frozen-host recovery

The source checks wrapper and host readbacks separately, hides a frozen host, and asks for coordinated resource restart only after continued failure or a freeze shortly after idle/resume. The author reports rebuilding within a script run did not recover this host, while a fresh resource run did. They also report self-restarting from the resource crashed the server; another resource initiated successful restarts. Do not turn that observation into a universal restart guarantee.

A restart affects every player using this resource. The source persists a cooldown across restarts: two minutes initially, doubling up to 32 minutes, with decay after quiet periods. Any adoption needs owner coordination, cancellation of pending work and explicit acceptance of the multiplayer impact. General widget handling should first diagnose and attempt bounded local recovery; no auto-restart mechanism is added to Kit by this documentation.

## Validation scenarios

Check a region at a known offset while walking and turning, then vehicle entry/exit, acceleration/braking, low-ceiling interiors and zoom transitions at different frame rates. Check region resize, recolor, removal, out-of-view streaming, pool growth, HUD recreation and resource stop/restart. Track creations versus reuses during a long drive and idle/resume. Capture actual pixels, requested/read transforms and version information; successful property reads alone are insufficient.

All 65 supplied resource tests passed during this review using Node's test runner and fake-game objects. They cover geometry, projection samples, delayed/frozen writes, reuse, streaming, layer storage and recovery decisions. The 17 km / 1000-region scenario is a simulation, not a new in-game drive performed for Kit.
