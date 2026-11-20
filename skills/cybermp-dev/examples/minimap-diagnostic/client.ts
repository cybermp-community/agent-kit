import type { MpClient } from '@cybermp/client-types';
import type { inkCircleWidget, inkCompoundWidgetReference } from '@cybermp/client-types/game';

declare const mp: MpClient;

let active: { parent: inkCompoundWidgetReference; widget: inkCircleWidget } | undefined;

function removeSample(): void {
  if (!active) return;
  const { parent, widget } = active;
  active = undefined;
  if (mp.game.inkWidgetRef.Get(parent)) mp.game.inkCompoundRef.RemoveChild(parent, widget);
}

mp.game.onInit(() => {
  mp.game.observeAfter('gameuiMinimapContainerController', 'OnInitialize', (controller) => {
    removeSample();
    const parent = controller.unclampedMappinContainer;
    if (!parent || !mp.game.inkWidgetRef.Get(parent)) {
      console.warn('[minimap-diagnostic] HUD controller found without a usable container');
      return;
    }

    const widget = new mp.game.inkCircleWidget();
    widget.SetName('cybermp_kit_minimap_diagnostic');
    widget.SetSegmentsNumber(4);
    widget.SetSize(32, 32);
    widget.SetAnchorPoint(0.5, 0.5);
    widget.SetRotation(45);
    widget.SetTintColor(Object.assign(new mp.game.Color(), {
      Red: 255, Green: 215, Blue: 0, Alpha: 255,
    }));

    mp.game.inkCompoundRef.AddChildWidget(parent, widget);
    active = { parent, widget };
    console.log('[minimap-diagnostic] attached test widget');
  });
});

mp.events.on('resourceStop', removeSample);
