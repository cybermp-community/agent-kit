import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

const source = new URL('../skills/cybermp-dev/examples/archive-probe/', import.meta.url);

function loadScript(name: string, mp: unknown): void {
  const read = (file: string) => ts.transpileModule(fs.readFileSync(new URL(file, source), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const protocol = {};
  vm.runInNewContext(read('protocol.ts'), { exports: protocol });
  vm.runInNewContext(read(name), {
    exports: {}, require: () => protocol, mp,
    console: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
  });
}

describe('Portable archive probe', () => {
  it('dispatches local tests and replaces or clears its own shared object', () => {
    type Player = { id: number; position: [number, number, number]; dimension: number };
    type Command = (player: Player | null, args: string[]) => void;
    const create = vi.fn(() => ({ id: 9, exist: true, destroy: vi.fn() }));
    const emitClient = vi.fn();
    let command: Command | undefined;
    const remove = vi.fn();
    const events = new Map<string, () => void>();
    loadScript('server.ts', {
      commands: { add: (_: string, callback: Command) => { command = callback; }, remove },
      events: { emitClient, on: (name: string, callback: () => void) => events.set(name, callback) },
      objects: { create }, hashes: { resref: vi.fn(() => 123n) },
    });
    const player: Player = { id: 2, position: [10, 20, 30], dimension: 4 };
    command!(player, ['local', 'base']);
    expect(emitClient).toHaveBeenCalledWith(player, 'kit-archive-probe:local', 'base');
    command!(player, ['shared', 'unexpected']);
    expect(create).not.toHaveBeenCalled();
    command!(player, ['shared', 'base']);
    expect(create).toHaveBeenCalledWith({ model: 123n, position: [13, 20, 31], dimension: 4, dynamic: false });
    command!(player, ['shared', 'archive']);
    expect(create.mock.results[0].value.destroy).toHaveBeenCalledOnce();
    events.get('resourceStop')!();
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
      events: { onServer: bind, on: bind },
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
});
