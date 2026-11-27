import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { expect, it, vi } from 'vitest';
import * as enums from '@cybermp/client-types/enums';

it('attaches to an existing minimap without waiting for HUD initialization and removes its widget on stop', () => {
  const parent = {};
  const controller = { GetClassName: () => 'MinimapContainerController', unclampedMappinContainer: parent,
    GetRootWidget: () => rootContainer };
  let actualSize = { x: 0, y: 0 };
  class HDRColor { Red = 0; Green = 0; Blue = 0; Alpha = 0; }
  let actualTint = new HDRColor();
  const widget = {
    SetName() {}, SetSegmentsNumber() {},
    // Reproduce the observed bridge behavior: the numeric overload leaves size at zero.
    SetSize(value: unknown) {
      if (typeof value === 'object' && value !== null) actualSize = value as typeof actualSize;
    },
    SetAnchorPoint() {}, SetRotation() {},
    SetTintColor(value: unknown) {
      // A Color object must not be sent to the HDRColor overload.
      if (value instanceof HDRColor) actualTint = value;
    },
    SetAnchor: vi.fn(), SetHAlign: vi.fn(), SetVAlign: vi.fn(), SetVisible: vi.fn(), SetOpacity: vi.fn(),
    GetSize: () => actualSize, IsVisible: () => true, GetOpacity: () => 1,
    GetTintColor: () => actualTint, GetSegmentsNumber: () => 4,
  };
  const createChild = vi.fn(() => widget);
  const container = { AddChild: createChild, GetNumChildren: () => createChild.mock.calls.length,
    GetSize: () => ({ x: 300, y: 300 }), IsVisible: () => true, GetOpacity: () => 1 };
  const add = vi.fn();
  const remove = vi.fn();
  const rootRemove = vi.fn();
  const rootCreate = vi.fn(() => widget);
  const rootContainer = { ...container, AddChild: rootCreate, RemoveChild: rootRemove };
  const commands = new Map<string, (id: number, args?: string[]) => void>();
  const loaded: Array<() => void> = [];
  const stopped: Array<() => void> = [];
  const source = fs.readFileSync('skills/cybermp-dev/examples/minimap-diagnostic/client.ts', 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, {
    exports: {}, console, require: () => enums,
    mp: {
      game: {
        onInit: (callback: () => void) => callback(), observeAfter() {},
        onGameLoaded: (callback: () => void) => loaded.push(callback),
        ScriptGameInstance: { GetInkSystem: () => ({ GetLayers: () => [{ GetGameControllers: () => [controller] }] }) },
        inkCircleWidget: function () { return widget; }, Color: function () {}, HDRColor, Vector2: function () {},
        inkWidgetRef: { Get: () => container },
        inkCompoundRef: { AddChildWidget: add, RemoveChild: remove },
      },
      commands: { add: (name: string, callback: (id: number, args?: string[]) => void) => commands.set(name, callback) },
      events: { on: (_event: string, callback: () => void) => stopped.push(callback) },
    },
  });
  for (const callback of loaded) callback();
  expect(rootCreate).toHaveBeenCalledExactlyOnceWith('inkCircleWidget');
  expect(createChild).not.toHaveBeenCalled();
  expect(add).not.toHaveBeenCalled();
  expect(widget.SetAnchor).toHaveBeenCalledWith(enums.inkEAnchor.Centered);
  expect(widget.SetHAlign).toHaveBeenCalledWith(enums.inkEHorizontalAlign.Center);
  expect(widget.SetVAlign).toHaveBeenCalledWith(enums.inkEVerticalAlign.Center);
  expect(widget.SetVisible).toHaveBeenCalledWith(true);
  expect(widget.SetOpacity).toHaveBeenCalledWith(1);
  expect(actualSize).toMatchObject({ x: 32, y: 32 });
  expect(actualTint).toMatchObject({ Red: 1, Blue: 0, Alpha: 1 });
  expect(actualTint.Green).toBeCloseTo(215 / 255);
  commands.get('kitminimap')!(0, ['mappin']);
  expect(rootRemove).toHaveBeenCalledExactlyOnceWith(widget);
  expect(createChild).toHaveBeenCalledExactlyOnceWith('inkCircleWidget');
  commands.get('kitminimap')!(0, ['root']);
  expect(remove).toHaveBeenCalledExactlyOnceWith(parent, widget);
  expect(rootCreate).toHaveBeenCalledTimes(2);
  for (const callback of stopped) callback();
  expect(rootRemove).toHaveBeenCalledTimes(2);
});
