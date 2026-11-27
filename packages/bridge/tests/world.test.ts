import { describe, expect, it } from 'vitest';
import { type EntitiesMp, entityMethods } from '../src/entities.ts';
import { isBridgeError } from '../src/index.ts';
import { type ResourcesMp, resourceMethods } from '../src/resources.ts';

const run = async (methods: Record<string, any>, name: string, params: unknown = {}) =>
  methods[name].handler(methods[name].params.parse(params));

const rejection = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (e) {
    expect(isBridgeError(e)).toBe(true);
    return (e as Error).message;
  }
  throw new Error('expected a BridgeError');
};

describe('resourceMethods', () => {
  const setup = (protect?: string[]) => {
    const calls: string[] = [];
    const mp: ResourcesMp = {
      config: {
        resources: ['mcp-bridge', 'gamemode', 'races'],
        max_players: 32,
        devtools_token: 'abc',
        nested: { apiKey: 'k', password: 'p', host: 'example' },
      },
      resources: {
        getCurrentName: () => 'mcp-bridge',
        getState: (name) => ({ 'mcp-bridge': 2, gamemode: 2, races: 0 })[name] ?? 0,
        start: (name) => calls.push(`start ${name}`),
        stop: (name) => calls.push(`stop ${name}`),
        restart: (name) => calls.push(`restart ${name}`),
      },
    };

    return { calls, methods: resourceMethods(mp, { protect }) };
  };

  it('redacts secrets in the server config', async () => {
    const { methods } = setup();

    expect(await run(methods, 'server.config')).toMatchObject({
      max_players: 32,
      devtools_token: '[redacted]',
      nested: { apiKey: '[redacted]', password: '[redacted]', host: 'example' },
    });
  });

  it('lists resources with state and protection', async () => {
    const { methods } = setup(['races']);

    expect(await run(methods, 'resources.list')).toEqual([
      { name: 'mcp-bridge', state: 'Running', protected: true },
      { name: 'gamemode', state: 'Running', protected: false },
      { name: 'races', state: 'NotRunning', protected: true },
    ]);
  });

  it('starts, stops and restarts configured resources', async () => {
    const { methods, calls } = setup();

    await run(methods, 'resources.start', { name: 'races' });
    await run(methods, 'resources.stop', { name: 'gamemode' });
    await run(methods, 'resources.restart', { name: 'gamemode' });

    expect(calls).toEqual(['start races', 'stop gamemode', 'restart gamemode']);
  });

  it('refuses unknown and protected resources', async () => {
    const { methods, calls } = setup(['races']);

    expect(await rejection(run(methods, 'resources.start', { name: 'nope' }))).toMatch(/Unknown resource nope/);
    expect(await rejection(run(methods, 'resources.stop', { name: 'mcp-bridge' }))).toMatch(/Refusing to stop/);
    expect(await rejection(run(methods, 'resources.restart', { name: 'races' }))).toMatch(/Refusing to restart/);
    expect(calls).toEqual([]);
  });
});

describe('entityMethods', () => {
  const collection = <T extends { id: number }>(items: T[]) => {
    const created: unknown[] = [];

    return {
      created,
      items,
      create(options: any) {
        created.push(options);
        return { id: 100 + created.length } as unknown as T;
      },
      destroy(id: number) {
        items.splice(items.findIndex((i) => i.id === id), 1);
      },
      exists: (id: number) => items.some((i) => i.id === id),
      at: (id: number) => items.find((i) => i.id === id)!,
      toArray: () => items,
    };
  };

  const entity = (id: number, dimension = 0, exist = true) => ({
    id,
    position: [1, 2, 3] as [number, number, number],
    yaw: 90,
    dimension,
    owner: id === 1 ? { id: 7 } : null,
    exist,
  });

  const setup = (spawn = false) => {
    type Seats = Record<string, { id: number } | null>;
    const vehicles = collection([
      { ...entity(1), model: 11n, appearance: 12n, health: 80, seats: { driver: { id: 7 }, passenger: null } as Seats },
      { ...entity(2, 5), model: 21n, appearance: 22n, health: 100, seats: {} as Seats },
      { ...entity(3, 0, false), model: 31n, appearance: 32n, health: 0, seats: {} as Seats },
    ]);
    const peds = collection([{ ...entity(4), model: 41n, appearance: 42n, health: 50 }]);
    const objects = collection([{ ...entity(5), model: 51n }]);
    const mp: EntitiesMp = {
      hashes: {
        tweakdbid: (path) => BigInt(path.length) * 1000n,
        cname: (path) => BigInt(path.length) * 10n,
        resref: (path) => BigInt(path.length),
      },
      vehicles,
      peds,
      objects,
    };

    return { vehicles, peds, objects, methods: entityMethods(mp, { spawn }) };
  };

  it('lists existing vehicles with hashes as strings, seats as player ids, per dimension', async () => {
    const { methods } = setup();
    const all = await run(methods, 'vehicles.list');

    expect(all.total).toBe(2);
    expect(all.entities[0]).toEqual({
      id: 1,
      position: [1, 2, 3],
      yaw: 90,
      dimension: 0,
      ownerId: 7,
      model: '11',
      appearance: '12',
      health: 80,
      seats: { driver: 7, passenger: null },
    });
    expect((await run(methods, 'vehicles.list', { dimension: 5 })).entities.map((e: any) => e.id)).toEqual([2]);
    expect((await run(methods, 'vehicles.list', { limit: 1 })).entities).toHaveLength(1);
    expect((await run(methods, 'peds.list')).entities[0]).toMatchObject({ id: 4, model: '41' });
    expect((await run(methods, 'objects.list')).entities[0]).toMatchObject({ id: 5, model: '51' });
  });

  it('offers spawn tools only when enabled', () => {
    expect(Object.keys(setup(false).methods)).toEqual(['vehicles.list', 'peds.list', 'objects.list']);
    expect(Object.keys(setup(true).methods)).toEqual(
      expect.arrayContaining(['hash.name', 'vehicles.spawn', 'peds.spawn', 'objects.spawn', 'entities.destroy']),
    );
  });

  it('turns names into hashes', async () => {
    const { methods, vehicles, peds } = setup(true);

    expect(await run(methods, 'hash.name', { kind: 'cname', name: 'abc' })).toEqual({ hash: '30' });

    await run(methods, 'vehicles.spawn', { model: 'v_x', appearance: 'blue', position: [0, 0, 0] });
    // "Vehicle." is added to a bare model name; the appearance is a CName
    expect(vehicles.created[0]).toMatchObject({ model: 11_000n, appearance: 40n });

    await run(methods, 'peds.spawn', { model: '123', appearance: 'cname:ab', position: [0, 0, 0] });
    expect(peds.created[0]).toMatchObject({ model: 123n, appearance: 20n });

    expect(
      await rejection(run(methods, 'peds.spawn', { model: 'bare', appearance: '1', position: [0, 0, 0] })),
    ).toMatch(/Cannot tell which hash kind/);
  });

  it('destroys existing entities only', async () => {
    const { methods, objects } = setup(true);

    expect(await run(methods, 'entities.destroy', { type: 'object', id: 5 })).toEqual({ destroyed: true });
    expect(objects.items).toEqual([]);
    expect(await rejection(run(methods, 'entities.destroy', { type: 'ped', id: 99 }))).toBe('No ped with id 99');
  });
});
