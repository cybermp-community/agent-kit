import type { MpClient } from '@cybermp/client-types';
import { inkEAnchor, inkEHorizontalAlign, inkEVerticalAlign } from '@cybermp/client-types/enums';
import type { gameuiMinimapContainerController, inkCircleWidget, inkCompoundWidget, inkCompoundWidgetReference } from '@cybermp/client-types/game';

declare const mp: MpClient;

console.log('[minimap-diagnostic] client script loaded (HDRColor probe v7)');

let target: 'mappin' | 'geom' | 'root' = 'root';
let active: { parent?: inkCompoundWidgetReference; container: inkCompoundWidget; widget: inkCircleWidget } | undefined;

function removeSample(): void {
  if (!active) return;
  const { parent, container, widget } = active;
  active = undefined;
  if (parent) {
    if (mp.game.inkWidgetRef.Get(parent)) mp.game.inkCompoundRef.RemoveChild(parent, widget);
  } else {
    container.RemoveChild(widget);
  }
}

function attachSample(controller: gameuiMinimapContainerController): void {
  removeSample();
  const parent = target === 'root' ? undefined : target === 'geom'
    ? controller.worldGeometryContainer : controller.unclampedMappinContainer;
  const container = (target === 'root' ? controller.GetRootWidget()
    : parent && mp.game.inkWidgetRef.Get(parent)) as inkCompoundWidget | undefined;
  if (!container) {
    console.warn('[minimap-diagnostic] HUD controller found without a usable container');
    return;
  }

  const before = container.GetNumChildren();
  const widget = container.AddChild('inkCircleWidget') as inkCircleWidget;
  if (!widget) {
    console.warn('[minimap-diagnostic] container.AddChild returned no widget');
    return;
  }
  active = { parent, container, widget };
  widget.SetName('cybermp_kit_minimap_diagnostic');
  widget.SetSegmentsNumber(4);
  widget.SetSize(Object.assign(new mp.game.Vector2(), { x: 32, y: 32 }));
  widget.SetAnchorPoint(0.5, 0.5);
  widget.SetAnchor(inkEAnchor.Centered);
  widget.SetHAlign(inkEHorizontalAlign.Center);
  widget.SetVAlign(inkEVerticalAlign.Center);
  widget.SetVisible(true);
  widget.SetOpacity(1);
  widget.SetRotation(45);
  widget.SetTintColor(Object.assign(new mp.game.HDRColor(), {
    Red: 1, Green: 215 / 255, Blue: 0, Alpha: 1,
  }));

  console.log(`[minimap-diagnostic] target=${target}; native child created; children=${before}->${container.GetNumChildren()}`);
  const parentSize = container.GetSize();
  const widgetSize = widget.GetSize();
  console.log(`[minimap-diagnostic] parent size=${parentSize.x}x${parentSize.y}, visible=${container.IsVisible()}, opacity=${container.GetOpacity()}`);
  console.log(`[minimap-diagnostic] widget size=${widgetSize.x}x${widgetSize.y}, visible=${widget.IsVisible()}, opacity=${widget.GetOpacity()}`);
  const tint = widget.GetTintColor();
  console.log(`[minimap-diagnostic] segments=${widget.GetSegmentsNumber()}; tint RGBA=${tint.Red},${tint.Green},${tint.Blue},${tint.Alpha}`);
}

function findExistingMinimap(): void {
  try {
    const layers = mp.game.ScriptGameInstance.GetInkSystem().GetLayers();
    for (const layer of layers) {
      for (const controller of layer.GetGameControllers()) {
        const className = String(controller.GetClassName());
        if (className === 'MinimapContainerController' || className === 'gameuiMinimapContainerController') {
          console.log(`[minimap-diagnostic] existing HUD controller found: ${className}`);
          attachSample(controller as unknown as gameuiMinimapContainerController);
          return;
        }
      }
    }
    console.warn('[minimap-diagnostic] existing controller not found among INK layer game controllers');
  } catch (error) {
    console.error('[minimap-diagnostic] existing HUD lookup failed:', error);
  }
}

mp.game.onInit(() => {
  for (const className of ['MinimapContainerController', 'gameuiMinimapContainerController'] as const) {
    try {
      mp.game.observeAfter(className, 'OnInitialize', (controller) => {
        console.log(`[minimap-diagnostic] HUD observer reached: ${className}`);
        attachSample(controller as unknown as gameuiMinimapContainerController);
      });
      console.log(`[minimap-diagnostic] HUD observer registered: ${className}`);
    } catch (error) {
      console.error(`[minimap-diagnostic] HUD observer registration failed: ${className}`, error);
    }
  }
});

mp.game.onGameLoaded(findExistingMinimap);
mp.commands.add('kitminimap', (_id: number, args?: string[]) => {
  const requested = args?.[0]?.toLowerCase();
  if (requested && requested !== 'mappin' && requested !== 'geom' && requested !== 'root') {
    console.log('[minimap-diagnostic] usage: kitminimap [mappin|geom|root]');
    return;
  }
  if (requested === 'mappin' || requested === 'geom' || requested === 'root') target = requested;
  findExistingMinimap();
});
mp.events.on('resourceStop', removeSample);
