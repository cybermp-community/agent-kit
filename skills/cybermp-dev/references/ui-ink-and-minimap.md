---
title: INK HUD and minimap
description: Choose between a point marker, an INK HUD shape, a separate world map UI, and server geometry. SetTintColor and world-coordinate projection require their own checks.
environment: mixed
verificationStatus: static-cross-check
aliases: [radar, HUD, QuestArea, inkCircleWidget, inkShapeWidget, Map marker, миникарта, полигон, зона спавна]
priorityAliases: [minimap, zone, polygon, AddBlipForArea, AddBlipForCoord, SetTintColor, зона миникарты, world map polygon]
---
# INK HUD and minimap

- **Point marker** at a coordinate: use the client `MappinSystem.RegisterMappin` path for a POI. In FiveM the coordinate analogue is `AddBlipForCoord`. `AddBlipForArea` creates a rectangular area in FiveM and requires a separate design in CyberMP.
- **Native minimap HUD shape**: `inkCircleWidget` has a segment count in the client declarations. The postmortem records a visible six-segment figure. SetTintColor, positioning and clipping require tests on the intended game build.
- **Custom world map UI**: a CEF map can draw changing territories in SVG or Canvas. This is a separate UI. The available sources do not establish a native runtime API for drawing arbitrary regions on the game's world map.
- **Server geometry**: evaluate whether a world-space point is inside a polygon on the server. Use that result for rules such as a spawn zone or territory capture. This computation does not draw anything.

See the [minimap diagnostic](recipes/minimap-zones.md), [world interaction marker](recipes/world-interaction.md), and [server geometry](server-mechanics.md#4-3d-zones--polygon-collision).

## Getting the HUD controller

The client native bridge requires `use_game_natives = true` in the resource manifest. The declarations in `@cybermp/client-types@2.7.1` include `gameuiMinimapContainerController.OnInitialize` and the widget references `unclampedMappinContainer` and `worldGeometryContainer`. A reference can exist while its target widget is unavailable. The diagnostic uses one container, checks the reference, and removes its own widget on resource stop.

CyberMP documents `mp.game.observeAfter` as queued after the original method. Register it early, and record whether it fires on the target build. An already initialized HUD may require a different discovery path. A client can inspect INK layers and the layer's virtual window where that path is available. Avoid installing raw hooks or walking the entire widget tree per frame as part of a first test.

Sources. [CyberMP observers](https://docs.cyber.mp/guides/client/observes/) · [Game natives](https://docs.cyber.mp/reference/client/working-with-game-natives/) · [CyberMP Types](https://github.com/Cyber-MP/CyberMP-Types).

## Geometry, color and projection

- **`inkCircleWidget`** exposes `SetSegmentsNumber`. A four-segment example with 45° rotation is a candidate for a square. Its size in the example is in widget coordinates.
- **`inkShapeWidget`** exposes resource-related fields in the declarations. Start from a known shape asset if using this path. The postmortem records an invisible instance in its resource-free attempt.
- **`inkRectangleWidget`** appeared dark in the postmortem. The original experiment changed several color and style paths. It did not isolate a default material or shader.
- **`inkWidget.SetTintColor`** declares overloads for `Color`, `HDRColor`, and four `number` arguments. The diagnostic tests one `Color` with byte-like 0–255 channel values. The declaration of four numbers does not specify conversion or range. Check that overload separately before relying on it, and keep HDR color separate.

A widget attached to a HUD container needs a projection if it must stay at a target world position while the player moves. Validate the coordinate origin, axis direction, scale, rotation and clipping across changes in HUD zoom, movement on foot, and a vehicle. Use the native client for local updates when the requirement forbids sending coordinates to CEF each frame. A screen-centered figure does not demonstrate projection.

## World edits and large maps

World Builder documents authoring Area Nodes with outlines and exporting them to WolvenKit. That workflow addresses authored world areas. It does not establish how the large map can be drawn at runtime. Choose the display based on the required surface. For a separate map, the server can supply territory geometry and state changes while the UI handles local drawing and interactions.

Sources. [FiveM coordinate blip](https://github.com/citizenfx/natives/blob/master/HUD/AddBlipForCoord.md) · [FiveM area blip](https://github.com/citizenfx/natives/blob/master/HUD/AddBlipForArea.md) · [World Builder area nodes](https://wiki.redmodding.org/cyberpunk-2077-modding/modding-guides/world-editing/object-spawner/features-and-guides/setting-area-outlines) · [CyberMP CEF](https://docs.cyber.mp/guides/client/first-cef-ui/).
