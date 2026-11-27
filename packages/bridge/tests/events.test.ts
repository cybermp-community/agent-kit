import { describe, expect, it } from 'vitest';
import { createEventLog, type EventLogOptions } from '../src/events.ts';

/** `mp` with events you can fire and a fixed player list */
const fakeMp = (players: Record<number, string> = { 1: 'Neo' }) => {
  const listeners = new Map<string, Set<(...args: any[]) => void>>();

  return {
    listeners,
    fire: (name: string, ...args: unknown[]) => {
      for (const cb of listeners.get(name) ?? []) {
        cb(...args);
      }
    },
    events: {
      on(name: string, cb: (...args: any[]) => void) {
        if (!listeners.has(name)) {
          listeners.set(name, new Set());
        }
        listeners.get(name)!.add(cb);
      },
      off(name: string, cb: (...args: any[]) => void) {
        listeners.get(name)?.delete(cb);
      },
    },
    players: {
      exists: (id: number) => id in players,
      at: (id: number) => ({ nickname: players[id] }),
    },
  };
};

const setup = (options?: EventLogOptions, players?: Record<number, string>) => {
  const mp = fakeMp(players);
  const log = createEventLog(mp, options);

  return {
    mp,
    log,
    recent: (params: Record<string, unknown> = {}) =>
      log.methods['events.recent'].handler(
        log.methods['events.recent'].params.parse(params),
      ) as any,
    wait: (params: Record<string, unknown> = {}) =>
      log.methods['events.wait'].handler(log.methods['events.wait'].params.parse(params)) as Promise<any>,
  };
};

describe('createEventLog', () => {
  it('records events as named fields with the nickname, and filters by since and type', async () => {
    const { mp, log, recent } = setup();

    mp.fire('playerSpawn', 1);
    mp.fire('playerDeath', 1, { killerId: 2 });
    log.record('matchStart', { map: 'docks' });

    const all = recent();

    expect(all.events.map((e: any) => e.type)).toEqual(['playerSpawn', 'playerDeath', 'matchStart']);
    expect(all.events[1].data).toEqual({ playerId: 1, data: { killerId: 2 }, nickname: 'Neo' });
    expect(all.lastSeq).toBe(3);
    expect(recent({ since: 2 }).events.map((e: any) => e.seq)).toEqual([3]);
    expect(recent({ types: ['playerDeath'] }).events).toHaveLength(1);
  });

  it('sanitizes payloads: bigints, long strings, deep objects', async () => {
    const { mp, recent } = setup();

    mp.fire('explosion', 1, { hash: 12345678901234567890n, name: 'y'.repeat(300), a: { b: { c: { d: 1 } } } });

    const { data } = recent().events[0].data;

    expect(data.hash).toBe('12345678901234567890');
    expect(data.name).toHaveLength(201);
    expect(data.a.b.c).toBe('[…]');
  });

  it('keeps at most `capacity` entries and reports truncation', async () => {
    const { log, recent } = setup({ capacity: 2 });

    for (let i = 0; i < 5; i++) {
      log.record('tick');
    }

    const result = recent();

    expect(result.events.map((e: any) => e.seq)).toEqual([4, 5]);
    expect(result.truncated).toBe(true);
    expect(recent({ since: 3 }).truncated).toBe(false);
  });

  it.each([0, -5, Number.NaN])('keeps a bounded buffer with capacity %s', async (capacity) => {
    const { log, recent } = setup({ capacity });

    for (let i = 0; i < 10; i++) {
      log.record('tick');
    }

    expect(recent().events).toHaveLength(1);
  });

  it('forgets nicknames of players who left, even when playerDisconnected is not recorded', async () => {
    const players: Record<number, string> = { 1: 'Neo' };
    const { mp, recent } = setup({ events: ['playerSpawn'] }, players);

    mp.fire('playerSpawn', 1);
    mp.fire('playerDisconnected', 1, 'quit');
    delete players[1];
    // The id is reused by someone the server no longer knows by name
    mp.fire('playerSpawn', 1);

    const events = recent().events;

    expect(events.map((e: any) => e.type)).toEqual(['playerSpawn', 'playerSpawn']);
    expect(events[1].data.nickname).toBeUndefined();
  });

  it('wait_for_events returns as soon as an event arrives', async () => {
    const { log, wait } = setup();
    const started = Date.now();
    const pending = wait({ timeoutMs: 5_000 });

    setTimeout(() => log.record('late'), 20);

    const result = await pending;

    expect(result.events.map((e: any) => e.type)).toEqual(['late']);
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it('wait_for_events keeps waiting through events of other types, then times out', async () => {
    const { log, wait } = setup();
    const pending = wait({ types: ['playerDeath'], timeoutMs: 150 });

    setTimeout(() => log.record('other'), 20);

    expect((await pending).events).toEqual([]);
  });

  it('dispose() ends pending waits at once and stops listening', async () => {
    const { mp, log, wait } = setup();
    const started = Date.now();
    const pending = wait({ timeoutMs: 10_000 });

    setTimeout(() => log.dispose(), 20);

    expect((await pending).events).toEqual([]);
    expect(Date.now() - started).toBeLessThan(1_000);
    expect([...mp.listeners.values()].every((set) => set.size === 0)).toBe(true);
  });

  it('dispose() empties the buffer and later records are ignored', async () => {
    const { log, recent } = setup();

    log.record('before');
    log.dispose();
    log.record('after');

    expect(recent().events).toEqual([]);
  });
});
