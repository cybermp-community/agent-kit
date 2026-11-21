import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

const source = new URL('../skills/cybermp-dev/examples/archive-probe/', import.meta.url);

function loadScript(name: string, mp: unknown) {
  const read = (file: string) => ts.transpileModule(fs.readFileSync(new URL(file, source), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const protocol = {};
  const output = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
  vm.runInNewContext(read('protocol.ts'), { exports: protocol });
  vm.runInNewContext(read(name), {
    exports: {}, require: () => protocol, mp,
    console: output,
  });
  return output;
}

describe('Portable archive probe', () => {
  it('dispatches local tests and replaces or clears its own shared object', () => {
    type Player = { id: number; position: [number, number, number]; dimension: number };
    type Command = (player: Player | null, args: string[]) => void;
    const create = vi.fn(() => ({ id: 9, exist: true, destroy: vi.fn() }));
    const emitClient = vi.fn();
    let command: Command | undefined;
    const remove = vi.fn();
    const events = new Map<string, (...args: number[]) => void>();
    loadScript('server.ts', {
      commands: { add: (_: string, callback: Command) => { command = callback; }, remove },
      events: { emitClient, on: (name: string, callback: (...args: number[]) => void) => events.set(name, callback), off: vi.fn() },
      players: { toArray: () => [player, { ...player, id: 3 }] },
      objects: { create }, hashes: { resref: vi.fn(() => 123n) },
    });
    const player: Player = { id: 2, position: [10, 20, 30], dimension: 4 };
    command!(player, ['local', 'base']);
    expect(emitClient).toHaveBeenCalledWith(player, 'kit-archive-probe:local', 'base');
    command!(player, ['shared', 'unexpected']);
    expect(create).not.toHaveBeenCalled();
    command!(player, ['shared', 'base']);
    expect(create).toHaveBeenCalledWith({ model: 123n, position: [13, 20, 31], dimension: 4, dynamic: false });
    expect(emitClient).toHaveBeenCalledWith(player, 'kit-archive-probe:track', 9);
    expect(emitClient).toHaveBeenCalledWith(expect.objectContaining({ id: 3 }), 'kit-archive-probe:track', 9);
    events.get('playerSpawn')!(3);
    expect(emitClient).toHaveBeenCalledWith(3, 'kit-archive-probe:track', 9);
    command!(player, ['shared', 'archive']);
    expect(create.mock.results[0].value.destroy).toHaveBeenCalledOnce();
    events.get('resourceStop')!();
    expect(emitClient).toHaveBeenCalledWith(player, 'kit-archive-probe:track', null);
    expect(create.mock.results[1].value.destroy).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith('kitprop');
  });

  it('uses the archive depot path and despawns the local handle once', () => {
    const handlers = new Map<string, (asset?: string) => void>();
    const hash = vi.fn(() => 456n);
    const spawnObject = vi.fn(() => 12);
    const despawnObject = vi.fn();
    const bind = (name: string, callback: (asset?: string) => void) => handlers.set(name, callback);
    loadScript('client.ts', {
      events: { onServer: bind, on: bind, off: vi.fn() },
      game: {
        GetPlayer: () => ({ GetWorldPosition: () => ({ x: 1, y: 2, z: 3 }) }),
        redResourceReferenceScriptToken: { GetHash: hash },
      },
      local: { spawnObject, despawnObject },
    });
    handlers.get('kit-archive-probe:local')!('archive');
    expect(hash).toHaveBeenCalledWith(['cybermp_kit', 'diagnostics', 'cube.ent'].join(String.fromCharCode(92)));
    expect(spawnObject).toHaveBeenCalledWith(456n, 0, 4, 2, 4, 0, 0, 0, true);
    handlers.get('resourceStop')!();
    handlers.get('kit-archive-probe:clear')!();
    expect(despawnObject).toHaveBeenCalledExactlyOnceWith(12);
  });

  it('notifies only for the tracked wall, suppresses duplicate events, and resets on replacement and stop', () => {
    type Handler = (...args: any[]) => void;
    const handlers = new Map<string, Handler>();
    const bind = (name: string, callback: Handler) => handlers.set(name, callback);
    const notify = vi.fn();
    const off = vi.fn();
    const output = loadScript('client.ts', {
      events: { onServer: bind, on: bind, off },
      network: { getObjectGameId: () => 101 },
      game: { GetPlayer: () => ({ SetWarningMessage: notify }) },
    });
    handlers.get('kit-archive-probe:track')!(7);
    handlers.get('objectStreamOut')!(99, 999);
    expect(notify).not.toHaveBeenCalled();
    handlers.get('objectStreamOut')!(7, 101);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(output.log).toHaveBeenCalledWith(expect.stringContaining('STREAM_OUT Network ID=7, local Game ID=101'));
    handlers.get('objectStreamOut')!(7, 101);
    expect(notify).toHaveBeenCalledTimes(1);
    handlers.get('objectStreamIn')!(7, 202);
    expect(notify).toHaveBeenCalledTimes(2);
    expect(output.log).toHaveBeenCalledWith(expect.stringContaining('STREAM_IN Network ID=7, local Game ID=202'));
    handlers.get('kit-archive-probe:track')!(null);
    handlers.get('objectStreamOut')!(7, 202);
    expect(notify).toHaveBeenCalledTimes(2);
    handlers.get('kit-archive-probe:status')!(8);
    handlers.get('objectStreamOut')!(7, 202);
    expect(notify).toHaveBeenCalledTimes(2);
    handlers.get('objectStreamOut')!(8, 303);
    expect(notify).toHaveBeenCalledTimes(3);
    handlers.get('resourceStop')!();
    handlers.get('objectStreamIn')!(8, 404);
    expect(notify).toHaveBeenCalledTimes(3);
    expect(off).toHaveBeenCalledWith('objectStreamOut', expect.any(Function));
    expect(off).toHaveBeenCalledWith('objectStreamIn', expect.any(Function));
  });
});
