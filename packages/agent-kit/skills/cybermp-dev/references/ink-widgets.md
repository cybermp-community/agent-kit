---
title: INK widgets - lifecycle, layout and diagnostics
description: General INK widget creation, Reparent order, canvas composition, color, pooling, delayed readback and ownership for native game UI.
environment: client
verificationStatus: static-cross-check
aliases: [INK, widget, виджет, canvas, HUD, Reparent, inkCanvasWidget, inkRectangleWidget]
priorityAliases: [INK widgets, виджеты INK, виджет]
sectionPriorityAliases:
  compose-shapes-through-canvases: [inkCanvasWidget, SetMargin]
  color-and-geometric-primitives: [inkCircleWidget, inkRectangleWidget, HDRColor]
  attachment-and-transform-order: [Reparent, widget attachment, порядок настройки виджета]
  pooling-and-creation-budgets: [widget pooling, пул виджетов]
  delayed-readback-and-recovery: [widget readback, виджет не двигается]
---
# INK widgets - lifecycle, layout and diagnostics

INK widgets are native game UI elements for HUDs, panels, labels and geometric overlays. A minimap resource supplies the case study here; its coordinate projection is a separate [minimap recipe](recipes/minimap-projection.md). These APIs are client-side and require `use_game_natives = true`.

Warning: the supplied `cybermp-mcp-minimap` snapshot reports observations on CyberMP server v4.0.5-beta.2 (Linux). The client and game builds are unspecified. Code and fake-game tests establish implementation and modeled behavior, not general engine guarantees. See the [source audit](https://github.com/cybermp-community/agent-kit/blob/main/packages/agent-kit/docs/audits/2026-11-22-ink-minimap.md), [hashed inventory](https://github.com/cybermp-community/agent-kit/blob/main/data/ink-minimap-source.json) and [MIT notice](https://github.com/cybermp-community/agent-kit/blob/main/data/LICENSE-ink-minimap).

## Find a live UI owner

Choose the INK layer and controller belonging to the intended screen. `ScriptGameInstance.GetInkSystem()`, layer `GetGameControllers()` and controller type inspection locate an existing UI; an initialization observer covers later creation. The source `game.ts:createGame` looks in `inkHUDLayer` and resolves a minimap controller reference on each lookup because held references can become stale. The layer/controller choice is screen-specific; the need to detect missing or replaced owners is general.

Resolve widget references to actual widgets before using them; a controller or reference existing does not prove its target is available. The supplied adapter uses `ref.widget` or `inkWidgetReference.Get`, while the existing Kit diagnostic uses the typed `inkWidgetRef.Get` path. These are source-specific strategies, not interchangeable overloads established by this audit. Validate the chosen path against the declarations and target client. Reacquire the owner on UI reinitialization, and release your old subtree rather than modifying unrelated game widgets.

## Attachment and transform order

`Reparent` attaches a widget to a parent. In `engine.ts:make`, the resource configures visibility, tint, segment count and base size, attaches a wrapper canvas and then the shape, and writes rotation, scale and position after attachment. Its author reports lost scale/position writes before attachment. Use this sequence as a diagnostic starting point for a dynamic HUD; it does not imply all properties must be set after attachment.

Warning: the supplied resource uses `SetSize(width, height)` successfully according to its report; the earlier Kit minimap diagnostic read back zero with that overload and worked with `SetSize(Vector2)`. Keep those observations separate. Type compatibility does not select a working bridge overload for every build. Test the same attached widget with one overload at a time and record readback and visibility.

A parent owns a local coordinate space, anchor and layout. `SetMargin`, `SetTranslation`, `SetScale` and `SetRotation` act within that hierarchy, not directly in world meters. Pick one positioning strategy for each layer. Test a known local offset before adding world projection. The following fragment assumes a current, caller-selected compound widget. It creates one owned canvas with a circle child, sets transforms after attachment, and returns explicit removal. It does not discover a HUD, draw at a world coordinate, or verify rendering. Call removal before owner replacement or resource stop while the parent is still valid.

```typescript env=client checked=@cybermp/client-types@2.7.1
import type { inkCompoundWidget } from '@cybermp/client-types/game';

export function attachHudDisc(parent: inkCompoundWidget) {
  const box = new mp.game.inkCanvasWidget();
  box.Reparent(parent);
  box.SetSize(Object.assign(new mp.game.Vector2(), { x: 1, y: 1 }));
  const disc = new mp.game.inkCircleWidget();
  disc.Reparent(box);
  disc.SetSegmentsNumber(64);
  disc.SetSize(Object.assign(new mp.game.Vector2(), { x: 32, y: 32 }));
  disc.SetScale({ x: 1, y: 1 });
  disc.SetRotation(0);
  disc.SetTintColor(Object.assign(new mp.game.HDRColor(), {
    Red: 1, Green: 0.5, Blue: 0, Alpha: 1,
  }));
  disc.SetOpacity(1);
  disc.SetVisible(true);
  box.SetMargin(20, 20, 0, 0);
  let removed = false;
  return {
    move(x: number, y: number) {
      if (!removed && Number.isFinite(x) && Number.isFinite(y)) box.SetMargin(x, y, 0, 0);
    },
    remove() {
      if (removed) return;
      removed = true;
      parent.RemoveChild(box);
    },
  };
}
```

## Compose shapes through canvases

`inkCanvasWidget` can separate placement from a child shape's appearance. The supplied tree is owner → outer canvas → translating canvas → per-shape canvas → circle/rectangle. The general technique is to move a wrapper with `SetMargin` while its child keeps a fixed local position and receives size, rotation and tint. The multiple outer layers implement minimap translation/rotation; another HUD may only need one wrapper.

The author reports circles and rectangles stopped accepting position writes after vehicle exits, crashes and in the Ho-oh club, while wrapper canvases continued accepting margins. This makes canvas composition a candidate workaround for that symptom, not a requirement that every INK widget must be wrapped. The host canvas can also freeze; wrapping is not a universal cure. Check the owner, wrapper and child separately.

## Color and geometric primitives

`inkCircleWidget.SetSegmentsNumber` controls a circle's segmentation; the source uses 64 for a circle and 3–12 for regular polygons. `inkRectangleWidget` supplies rectangles. A thick line can be composed from rectangles: segment midpoint is its center, distance is length, `atan2` supplies angle, and width is thickness. Ignore zero-length segments. This composition is reusable in native UI; the source's `90 - angle` correction belongs to its swapped world/screen axes. It does not implement arbitrary filled polygons.

The supplied adapter creates `HDRColor`, normalizes input RGB bytes by 255, sets alpha to 1 and assigns `widget.tintColor`; region opacity is applied separately with `SetOpacity`. The earlier Kit diagnostic uses `SetTintColor(HDRColor)`. These are distinct write paths. Compare them independently when diagnosing tint. Inspect parent visibility, opacity, clipping and bound styles as well as the child's color.

Warning: the author reports invisible `inkShapeWidget` vertex geometry and atlas images even when writes read back. This does not prove those widget classes are unusable in every UI or build. A missing asset, material, layout or bridge behavior requires its own isolated experiment. Do not replace an observed rendering failure with a universal API prohibition.

## Pooling and creation budgets

Widget pooling reuses attached widgets instead of repeatedly constructing, detaching and reattaching them. In `engine.ts:assign/reuse`, a stable item key keeps its widget; otherwise an available widget of the same kind is restyled. Unused widgets are hidden with `SetVisible(false)` and retained. Keep active and spare sets separate, and track total creations as well as live widgets. This is useful for changing HUD lists and overlays independently of minimap projection.

Warning: 1024 creations is this resource's protective policy, not an engine limit. The reported collapse near 1260–1400 cumulative creations and the claim that script reload does not reset the count were not independently reproduced here. Do not infer that removing a widget replenishes an engine allocation budget. Measure long sessions and repeated UI rebuilds on the target build.

The source rebuilds the host when a larger pool is needed because it reports newly attached widgets on an already laid-out canvas ignoring position changes. This is an observed workaround, not a general requirement to rebuild every growing HUD. Its empty-list path destroys the host; hiding existing items preserves the pool. Balance reuse with explicit final cleanup so hidden widgets are not mistaken for released objects.

## Delayed readback and recovery

Widget readback can lag writes. Keep a bounded history of sent positions and accept a match against recent writes within a tolerance; do not compare only with the newest write. Give new widgets time to settle. During a continuously changing transform, suspend or adapt failure judgments until that transform stabilizes. The source uses four historical writes, a 2 px tolerance and a 600 ms grace period: tunable heuristics, not INK contracts.

Warning: a successful readback does not prove visible rendering. A static widget should keep a static readback; declare it frozen only when requested writes have moved beyond tolerance and reads stay stale through the observation window. Distinguish delayed reads, unchanged requested values, a missing owner, position rejection and collapsed size. Confirm the picture separately in game.

`Recovery` counts consecutive bad rounds and increases the interval between failed rebuilds, with a creation budget and eventual stop. The source hides a mispositioned host instead of continuing to display drifting zones. Bound retries, expose the failure reason, and reset recovery only after sustained evidence of health. Automatic reconstruction should never turn one bad UI state into an unbounded creation loop.

## Lifetime and diagnostic recording

The supplied engine exposes `destroy()`, but its client entry point does not wire it to a stop handler or retain cancellation handles for its tick, pull loop and restart retry timers. Do not copy that entry point as a complete cleanup example.

Stop owned ticks, timers and observers using the APIs available in the target runtime; detach your subtree when the owner remains valid. Reinitialization should leave at most one active subtree. The source's opacity tag `0.9991` identifies its host, but can collide with another widget and changes visual opacity. Prefer explicit ownership references or a validated identity scheme; never delete arbitrary matching game UI. Hiding a widget is not removal.

`ZoomRecorder` records only an armed transition (120 frames) and sends batches. Generalize this to a short capture of requested values, readbacks, timestamps, parent identity and rebuild causes. Keep expensive status aggregation and log formatting out of an unconditional frame loop. `IdleRecorder` correlates input/idle transitions with redraws; correlation does not establish why a canvas froze. Register optional observers independently so one unavailable class does not disable all recording; retain registration failures in diagnostics.

The source still performs a 500 ms keep-alive write with a tiny nudge, although its README says it did not prevent freezes. Preserve it as an unsuccessful experiment, not recommended prevention. The author also reports self-restart crashing the server and restart from another resource recovering the UI. Treat resource restart as a build-specific last resort with coordination and cooldown; the general widget lifecycle does not require a server restart.

## Validate on the intended screen

Start with one visible child in the chosen owner and a known local offset. Check attach → size/color → move → hide/show → reuse → remove. Then exercise UI reinitialization, resource stop, vehicle transitions, interiors and a long idle/resume period as relevant. Record client/server/game versions, declaration version, call order, readbacks and screenshots. Compare two positioning or overload strategies one at a time. Fake-game tests can validate your recovery and reuse logic without establishing engine rendering behavior.
