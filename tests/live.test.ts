import fs from 'node:fs';
import { createServer, type AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createServer as createHttpServer } from 'node:http';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ToolListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import {
  basicMethods,
  type Bridge,
  createBridge,
  defineMethod,
  type MethodDef,
} from '../packages/bridge/src/index.ts';
import {
  createProviderHost,
  type McpProvider,
  type ProviderHost,
  registerMcpProvider,
} from '../packages/bridge/src/rpc.ts';
import { createWorld, flush } from '../packages/bridge/tests/fakes.ts';
import { createCyberMpServerWithLive } from '../src/server.js';
import type { Env } from '../src/live/env.js';
import { parsePs, parseTasklist } from '../src/live/process.js';
import { isReadOnlyMode, isToolAllowed } from '../src/live/policy.js';
import { BridgeError, callBridge } from '../src/live/bridge.js';
import { listLogFiles } from '../src/live/logs.js';
import { toInputSchema } from '../src/live/bridge-tools.js';
import { describeMethods } from '../packages/bridge/src/index.ts';
import {
  createAgentInbox,
  createEventLog,
  entityMethods,
  resourceMethods,
} from '../packages/bridge/src/index.ts';

const DOCS_TOOLS = [
  'cybermp_get_event',
  'cybermp_get_rpc_flow',
  'cybermp_get_type',
  'cybermp_lookup_tweakdb',
  'cybermp_search_docs',
];
const TOKEN = 'live-test-token';

const freePort = () =>
  new Promise<number>((resolve) => {
    const probe = createServer();

    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as AddressInfo;
      probe.close(() => resolve(port));
    });
  });

const temps: string[] = [];

afterAll(() => {
  for (const dir of temps.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/** A fresh folder in the system temp dir, removed after the tests */
const makeTemp = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cybermp-live-'));

  temps.push(dir);

  return dir;
};

const tempRoot = (withLogs: boolean) => {
  const root = makeTemp();

  if (withLogs) {
    const logs = path.join(root, 'logs');

    fs.mkdirSync(logs);
    fs.writeFileSync(path.join(logs, 'server_old.log'), 'old start\nERROR old crash\n');
    fs.writeFileSync(
      path.join(logs, 'server_new.log'),
      `boot\n[warn] slow tick\nERROR something broke\n${'x'.repeat(1_500)}\n`,
    );
    fs.utimesSync(path.join(logs, 'server_old.log'), new Date(1_000_000), new Date(1_000_000));
    fs.writeFileSync(path.join(root, 'secret.log'), 'outside the logs folder');
  }

  return root;
};

const player = {
  id: 0,
  nickname: 'Neo',
  ping: 20,
  health: 100,
  position: {},
  dimension: 0,
  kick() {},
  mute() {},
};

const fakePlayers = {
  config: { max_players: 32 },
  players: {
    toArray: () => [player],
    exists: (id: number) => id === 0,
    at: () => player,
  },
};

const economy: Record<string, MethodDef> = {
  'economy.setMoney': defineMethod({
    tool: 'set_money',
    title: 'Set money',
    description: "Sets a player's money.",
    kind: 'write',
    params: z.object({ playerId: z.number().int(), amount: z.number().int() }),
    handler: ({ playerId, amount }) => ({ playerId, money: amount }),
  }),
  'economy.wealth': defineMethod({
    tool: 'wealth',
    title: 'Money players keep',
    kind: 'read',
    params: z.object({}).default({}),
    handler: () => ({ total: 1234 }),
  }),
};

/** A game server with the bridge resource with a scoped provider, on a free port */
const startGame = async () => {
  const world = createWorld();
  const host: ProviderHost = createProviderHost({
    mp: world.mpFor('mcp-bridge'),
    rpc: world.rpcFor('mcp-bridge'),
    logger: {},
  });
  const providers: McpProvider[] = [
    registerMcpProvider({
      mp: world.mpFor('game-economy'),
      rpc: world.rpcFor('game-economy'),
      scope: 'economy',
      methods: economy,
      logger: {},
    }),
  ];
  await flush();

  const presence: string[] = [];
  /** Slows `connected` reports down, as a busy server would */
  const slow = { connectedMs: 0 };
  const core: Record<string, MethodDef> = {
    ...basicMethods(fakePlayers),
    // A bridge tool with the same name as a built-in must be skipped
    'demo.status': defineMethod({
      tool: 'server_status',
      kind: 'read',
      params: z.object({}).default({}),
      handler: () => 'from the bridge',
    }),
  };
  const port = await freePort();
  let bridge!: Bridge;

  await new Promise<void>((resolve) => {
    bridge = createBridge({
      token: TOKEN,
      port,
      methods: () => host.methods(core),
      onPresence: async (state) => {
        if (state === 'connected' && slow.connectedMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, slow.connectedMs));
        }
        presence.push(state);
        return null;
      },
      logger: { success: () => resolve() },
    });
  });

  return {
    port,
    presence,
    slow,
    world,
    core,
    async stop() {
      bridge.stop();
      await Promise.all(providers.map((p) => p.unregister()));
      host.dispose();
    },
  };
};

type Game = Awaited<ReturnType<typeof startGame>>;

describe('live server features', () => {
  const cleanup: Array<() => unknown> = [];

  afterEach(async () => {
    vi.useRealTimers();
    for (const fn of cleanup.splice(0).reverse()) {
      await fn();
    }
  });

  /** An MCP server + client over memory, with a mutable environment */
  const connect = async (env: Env) => {
    const { server, live } = createCyberMpServerWithLive({ live: { env: () => env } });
    await live!.sync();

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    const client = new Client({ name: 'test', version: '1.0.0' });
    const changes = { count: 0 };

    client.setNotificationHandler(ToolListChangedNotificationSchema, () => {
      changes.count += 1;
    });
    await client.connect(clientTransport);

    cleanup.push(() => client.close(), () => live!.stop());

    const tools = async () => (await client.listTools()).tools;
    const names = async () => (await tools()).map((t) => t.name).sort();
    const call = async (name: string, args: Record<string, unknown> = {}) => {
      const result = (await client.callTool({ name, arguments: args })) as {
        content: Array<{ text: string }>;
        isError?: boolean;
      };
      const text = result.content[0]?.text ?? '';
      let json: any;

      try {
        json = JSON.parse(text);
      } catch {
        json = undefined;
      }

      return { text, json, isError: Boolean(result.isError) };
    };

    return { client, live: live!, server, tools, names, call, changes };
  };

  const withGame = async () => {
    const game = await startGame();

    cleanup.push(() => game.stop());

    return game;
  };

  const bridgeEnv = (game: Game, extra: Env = {}): Env => ({
    CYBERMP_ROOT: '/nonexistent',
    DEVTOOLS_TOKEN: TOKEN,
    DEVTOOLS_PORT: String(game.port),
    ...extra,
  });

  it('offers only the docs tools when nothing is configured', async () => {
    const { names, client } = await connect({ CYBERMP_ROOT: '/nonexistent' });

    expect(await names()).toEqual(DOCS_TOOLS);
    expect((await client.listPrompts()).prompts).toEqual([]);
    expect((await client.listResources()).resources).toEqual([]);
    expect(client.getInstructions()).toBeUndefined();
  });

  describe('with a logs folder', () => {
    it('adds the log tools and server_status, but no prompts', async () => {
      const root = tempRoot(true);
      const { names, client } = await connect({ CYBERMP_ROOT: root });

      expect(await names()).toEqual(
        [...DOCS_TOOLS, 'list_server_logs', 'read_server_log', 'server_status'].sort(),
      );
      expect((await client.listPrompts()).prompts).toEqual([]);
      expect(client.getInstructions()).toContain('untrusted');
    });

    it('lists logs newest first and reads the newest by default', async () => {
      const root = tempRoot(true);
      const { call } = await connect({ CYBERMP_ROOT: root });

      expect((await call('list_server_logs')).json.map((f: any) => f.name)).toEqual([
        'server_new.log',
        'server_old.log',
      ]);

      const log = (await call('read_server_log', { filter: 'error' })).json;

      expect(log).toMatchObject({ file: 'server_new.log', matched: 1, lines: ['ERROR something broke'] });

      const long = (await call('read_server_log', { lines: 2 })).json.lines;

      expect(long[0]).toMatch(/… \[truncated\]$/);
      expect((await call('read_server_log', { file: 'server_old.log', lines: 1 })).json.lines).toEqual([
        '',
      ]);
    });

    it('refuses files outside the logs folder', async () => {
      const root = tempRoot(true);
      const { call } = await connect({ CYBERMP_ROOT: root });
      const result = await call('read_server_log', { file: '../secret.log' });

      expect(result.isError).toBe(true);
      expect(result.text).toBe('Log file ../secret.log not found');
    });

    it('serves logs as resources', async () => {
      const root = tempRoot(true);
      const { client } = await connect({ CYBERMP_ROOT: root });
      const { resources } = await client.listResources();

      expect(resources.map((r) => r.uri)).toEqual([
        'cybermp://logs/server_new.log',
        'cybermp://logs/server_old.log',
      ]);

      const read = await client.readResource({ uri: 'cybermp://logs/server_old.log' });

      expect((read.contents[0] as { text: string }).text).toContain('ERROR old crash');
    });

    it('finds the logs of a development layout and honours CYBERMP_LOGS_DIR', async () => {
      const root = makeTemp();

      fs.mkdirSync(path.join(root, 'mp/linux/logs'), { recursive: true });
      fs.mkdirSync(path.join(root, 'elsewhere'));
      fs.writeFileSync(path.join(root, 'elsewhere/a.log'), 'custom');

      const dev = await connect({ CYBERMP_ROOT: root });
      expect(await dev.names()).toContain('list_server_logs');

      const custom = await connect({ CYBERMP_ROOT: root, CYBERMP_LOGS_DIR: 'elsewhere' });
      expect((await custom.call('list_server_logs')).json.map((f: any) => f.name)).toEqual(['a.log']);
    });
  });

  describe('with the game bridge', () => {
    it('exposes core tools bare and provider tools scoped', async () => {
      const game = await withGame();
      const { names, tools } = await connect(bridgeEnv(game));

      expect(await names()).toEqual(
        [
          ...DOCS_TOOLS,
          'server_status',
          'list_players',
          'kick_player',
          'mute_player',
          'set_player_dimension',
          'list_scopes',
          'economy__set_money',
          'economy__wealth',
        ].sort(),
      );

      const setMoney = (await tools()).find((t) => t.name === 'economy__set_money')!;

      expect(setMoney.title).toBe('[economy] Set money');
      expect(setMoney.description).toBe(
        "Sets a player's money.\n\nFrom resource game-economy (scope economy).",
      );
      expect(setMoney._meta).toEqual({
        'cybermp/scope': 'economy',
        'cybermp/resource': 'game-economy',
      });
      expect(setMoney.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
      expect(setMoney.inputSchema.required).toEqual(['playerId', 'amount']);

      const kick = (await tools()).find((t) => t.name === 'kick_player')!;

      expect(kick.title).toBe('Kick player');
      expect(kick.annotations).toMatchObject({ destructiveHint: true });
    });

    it('calls core and provider tools through the bridge', async () => {
      const game = await withGame();
      const { call } = await connect(bridgeEnv(game));

      expect((await call('list_players')).json).toEqual([
        { id: 0, nickname: 'Neo', ping: 20, health: 100, position: {}, dimension: 0 },
      ]);
      expect((await call('economy__set_money', { playerId: 0, amount: 50 })).json).toEqual({
        playerId: 0,
        money: 50,
      });
      expect((await call('economy__wealth')).json).toEqual({ total: 1234 });
      expect((await call('list_scopes')).json.map((s: any) => s.scope)).toEqual(['core', 'economy']);
    });

    it('validates arguments before calling', async () => {
      const game = await withGame();
      const { call } = await connect(bridgeEnv(game));
      const result = await call('economy__set_money', { playerId: 'zero', amount: 1 });

      expect(result.isError).toBe(true);
      expect(result.text).toMatch(/playerId/);
    });

    it('keeps the built-in server_status when the bridge offers the same name', async () => {
      const game = await withGame();
      const { call } = await connect(bridgeEnv(game));
      const status = (await call('server_status')).json;

      expect(status.game).toMatchObject({ players: 1, maxPlayers: 32 });
      expect(status.scopes).toEqual([
        { scope: 'core', tools: 5 },
        { scope: 'economy', resource: 'game-economy', tools: 2 },
      ]);
    });

    it('offers the prompts', async () => {
      const game = await withGame();
      const { client } = await connect(bridgeEnv(game));

      expect((await client.listPrompts()).prompts.map((p) => p.name)).toEqual([
        'triage-server',
        'investigate-player',
        'post-crash-analysis',
      ]);

      const prompt = await client.getPrompt({ name: 'investigate-player', arguments: { player: 'Neo' } });

      expect((prompt.messages[0].content as { text: string }).text).toContain('Investigate the player "Neo"');
      await expect(
        client.getPrompt({ name: 'investigate-player', arguments: { player: '  ' } }),
      ).rejects.toThrow();
    });

    it('applies readonly mode and allow/deny lists, scopes included', async () => {
      const game = await withGame();

      const readonly = await connect(bridgeEnv(game, { CYBERMP_MCP_MODE: 'readonly' }));
      const readonlyNames = await readonly.names();

      expect(readonlyNames).toContain('economy__wealth');
      expect(readonlyNames).not.toContain('economy__set_money');
      expect(readonlyNames).not.toContain('kick_player');

      const denied = await connect(bridgeEnv(game, { CYBERMP_MCP_DENY: 'economy__*' }));
      expect((await denied.names()).filter((n) => n.startsWith('economy__'))).toEqual([]);

      const allowed = await connect(bridgeEnv(game, { CYBERMP_MCP_ALLOW: 'list_*' }));
      expect((await allowed.names()).filter((n) => !n.startsWith('cybermp_'))).toEqual([
        'list_players',
        'list_scopes',
        'server_status',
      ]);
    });

    it('follows the game: tools change with reloads and go away when it stops', async () => {
      const game = await withGame();
      const env = bridgeEnv(game);
      const { names, call, live, changes } = await connect(env);

      // A core method disappears (e.g. the bridge resource reloaded without it)
      delete game.core['player.mute'];
      await live.sync();
      await flush();

      expect(await names()).not.toContain('mute_player');
      expect(changes.count).toBeGreaterThan(0);

      // The provider's resource stops
      game.world.stopResource('game-economy');
      await live.sync();

      expect((await names()).filter((n) => n.startsWith('economy__'))).toEqual([]);

      // The whole game stops, built-ins stay, bridge tools go
      await game.stop();
      await live.sync();

      expect(await names()).toEqual([...DOCS_TOOLS, 'server_status'].sort());
      expect((await call('server_status')).json.game.unavailable).toMatch(/unreachable/);
    });

    it('fails cleanly when a listed tool vanished between two heartbeats', async () => {
      const game = await withGame();
      const { call } = await connect(bridgeEnv(game));

      delete game.core['player.kick'];

      const result = await call('kick_player', { playerId: 0 });

      expect(result.isError).toBe(true);
      expect(result.text).toMatch(/no longer offers it/);
    });

    it('picks up a token added while running', async () => {
      const game = await withGame();
      const env: Env = { CYBERMP_ROOT: '/nonexistent' };
      const { names, live, client } = await connect(env);

      expect(await names()).toEqual(DOCS_TOOLS);

      Object.assign(env, bridgeEnv(game));
      await live.sync();

      expect(await names()).toContain('economy__set_money');
      expect((await client.listPrompts()).prompts).toHaveLength(3);
    });

    it('reports a wrong token without exposing bridge tools', async () => {
      const game = await withGame();
      const { names, call } = await connect(bridgeEnv(game, { DEVTOOLS_TOKEN: 'wrong' }));

      expect(await names()).toEqual([...DOCS_TOOLS, 'server_status'].sort());
      expect((await call('server_status')).json.game.unavailable).toMatch(/rejected the token/);
    });

    it('reports presence while running and on stop', async () => {
      const game = await withGame();
      const { live } = await connect(bridgeEnv(game));

      live.start();
      await new Promise((resolve) => setTimeout(resolve, 50));
      await live.stop();

      expect(game.presence[0]).toBe('connected');
      expect(game.presence.at(-1)).toBe('disconnected');
    });

    it('never lets a slow connected report land after disconnected', async () => {
      const game = await withGame();
      const { live } = await connect(bridgeEnv(game));

      game.slow.connectedMs = 200;
      live.start();
      await new Promise((resolve) => setTimeout(resolve, 20));

      const started = Date.now();
      await live.stop();
      const elapsed = Date.now() - started;

      // The heartbeat is cancelled instead of awaited: stop does not wait for it,
      // and the stopped session's late report is ignored by the game's inbox
      expect(elapsed).toBeLessThan(500);
      await new Promise((resolve) => setTimeout(resolve, 250));
      expect(game.presence.filter((state) => state === 'disconnected')).toHaveLength(1);
    });

    it('does not revive a stopped session when the heartbeat arrives late', async () => {
      const world = createWorld();
      const inbox = createAgentInbox({ onReply: () => {} });
      cleanup.push(() => inbox.dispose());

      const host = createProviderHost({
        mp: world.mpFor('mcp-bridge'),
        rpc: world.rpcFor('mcp-bridge'),
        logger: {},
      });
      const provider = registerMcpProvider({
        mp: world.mpFor('game-inbox'),
        rpc: world.rpcFor('game-inbox'),
        scope: 'inbox',
        methods: inbox.methods,
        onPresence: (state, meta) => inbox.onPresence(state, meta),
        logger: {},
      });
      await flush();

      const reports: Array<{ state: string; meta: any }> = [];
      const port = await freePort();
      let bridge!: Bridge;

      await new Promise<void>((resolve) => {
        bridge = createBridge({
          token: TOKEN,
          port,
          methods: () => host.methods(basicMethods(fakePlayers)),
          onPresence: (state, meta) => {
            reports.push({ state, meta });
            return host.onPresence(state, meta);
          },
          logger: { success: () => resolve() },
        });
      });

      cleanup.push(async () => {
        bridge.stop();
        await provider.unregister();
        host.dispose();
      });

      const { live } = await connect({
        CYBERMP_ROOT: '/nonexistent',
        DEVTOOLS_TOKEN: TOKEN,
        DEVTOOLS_PORT: String(port),
      });

      live.start();
      await vi.waitFor(() => expect(reports.some((r) => r.state === 'connected')).toBe(true));
      await live.stop();

      expect(inbox.isConnected()).toBe(false);

      // The stopped run's heartbeat reaches the game late; its own disconnect
      // has already terminated the session, so it cannot come back
      const connectedReport = reports.find((r) => r.state === 'connected')!;
      inbox.onPresence('connected', connectedReport.meta);
      expect(inbox.isConnected()).toBe(false);
    });

    it('isolates a restarted session from an in-flight heartbeat of the previous run', async () => {
      const world = createWorld();
      const inbox = createAgentInbox({ onReply: () => {} });
      cleanup.push(() => inbox.dispose());

      const host = createProviderHost({
        mp: world.mpFor('mcp-bridge'),
        rpc: world.rpcFor('mcp-bridge'),
        logger: {},
      });
      const provider = registerMcpProvider({
        mp: world.mpFor('game-inbox'),
        rpc: world.rpcFor('game-inbox'),
        scope: 'inbox',
        methods: inbox.methods,
        onPresence: (state, meta) => inbox.onPresence(state, meta),
        logger: {},
      });
      await flush();

      let enteredFirst!: () => void;
      const firstEntered = new Promise<void>((resolve) => {
        enteredFirst = resolve;
      });
      let releaseFirst!: () => void;
      const firstGate = new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      let finishFirst!: () => void;
      const firstDone = new Promise<void>((resolve) => {
        finishFirst = resolve;
      });
      let finishSecond!: () => void;
      const secondDone = new Promise<void>((resolve) => {
        finishSecond = resolve;
      });

      let count = 0;
      const port = await freePort();
      let bridge!: Bridge;

      await new Promise<void>((resolve) => {
        bridge = createBridge({
          token: TOKEN,
          port,
          methods: () => host.methods(basicMethods(fakePlayers)),
          onPresence: async (state, meta) => {
            if (state === 'connected') {
              count += 1;
              if (count === 1) {
                enteredFirst();
                await firstGate;
                const res = await host.onPresence(state, meta);
                finishFirst();
                return res;
              }
              const res = await host.onPresence(state, meta);
              finishSecond();
              return res;
            }
            return host.onPresence(state, meta);
          },
          logger: { success: () => resolve() },
        });
      });

      cleanup.push(async () => {
        bridge.stop();
        await provider.unregister();
        host.dispose();
      });

      const { live } = await connect({
        CYBERMP_ROOT: '/nonexistent',
        DEVTOOLS_TOKEN: TOKEN,
        DEVTOOLS_PORT: String(port),
      });

      vi.useFakeTimers({
        toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
      });
      live.start();
      await firstEntered;

      const stopPromise = live.stop();
      await vi.advanceTimersByTimeAsync(1_500);
      await stopPromise;
      expect(inbox.isConnected()).toBe(false);

      // Restart before the first run's connected request finishes
      live.start();
      await secondDone;
      expect(inbox.isConnected()).toBe(true);

      releaseFirst();
      await firstDone;
      expect(inbox.isConnected()).toBe(true);
    });

    it('never sends a sessionless disconnect when stopped without starting or stopped twice', async () => {
      const seen: Array<{ state: string; meta: unknown }> = [];
      const port = await freePort();
      let bridge!: Bridge;

      await new Promise<void>((resolve) => {
        bridge = createBridge({
          token: TOKEN,
          port,
          methods: basicMethods(fakePlayers),
          onPresence: (state, meta) => {
            seen.push({ state, meta });
            return { pending: 0 };
          },
          logger: { success: () => resolve() },
        });
      });

      cleanup.push(() => bridge.stop());

      const { live } = await connect({
        CYBERMP_ROOT: '/nonexistent',
        DEVTOOLS_TOKEN: TOKEN,
        DEVTOOLS_PORT: String(port),
      });

      await live.stop();
      expect(seen).toEqual([]);

      live.start();
      await vi.waitFor(() => expect(seen.length).toBeGreaterThanOrEqual(1));
      await live.stop();
      await live.stop();

      const disconnects = seen.filter((entry) => entry.state === 'disconnected');
      expect(disconnects).toHaveLength(1);
      expect(disconnects[0].meta).toMatchObject({
        session: expect.any(String),
        seq: expect.any(Number),
      });
    });

    it('snapshots and detaches stopped session before await when start overlaps stop', async () => {
      const world = createWorld();
      const inbox = createAgentInbox({ onReply: () => {} });
      cleanup.push(() => inbox.dispose());

      const host = createProviderHost({
        mp: world.mpFor('mcp-bridge'),
        rpc: world.rpcFor('mcp-bridge'),
        logger: {},
      });
      const provider = registerMcpProvider({
        mp: world.mpFor('game-inbox'),
        rpc: world.rpcFor('game-inbox'),
        scope: 'inbox',
        methods: inbox.methods,
        onPresence: (state, meta) => inbox.onPresence(state, meta),
        logger: {},
      });
      await flush();

      let enteredFirst!: () => void;
      const firstEntered = new Promise<void>((resolve) => {
        enteredFirst = resolve;
      });
      let releaseFirst!: () => void;
      const firstGate = new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      let finishFirst!: () => void;
      const firstDone = new Promise<void>((resolve) => {
        finishFirst = resolve;
      });
      let finishSecond!: () => void;
      const secondDone = new Promise<void>((resolve) => {
        finishSecond = resolve;
      });

      const seen: Array<{ state: string; meta: any }> = [];
      let connectedCount = 0;
      const port = await freePort();
      let bridge!: Bridge;

      await new Promise<void>((resolve) => {
        bridge = createBridge({
          token: TOKEN,
          port,
          methods: () => host.methods(basicMethods(fakePlayers)),
          onPresence: async (state, meta) => {
            seen.push({ state, meta });
            if (state === 'connected') {
              connectedCount += 1;
              if (connectedCount === 1) {
                enteredFirst();
                await firstGate;
                const res = await host.onPresence(state, meta);
                finishFirst();
                return res;
              }
              const res = await host.onPresence(state, meta);
              finishSecond();
              return res;
            }
            return host.onPresence(state, meta);
          },
          logger: { success: () => resolve() },
        });
      });

      cleanup.push(async () => {
        bridge.stop();
        await provider.unregister();
        host.dispose();
      });

      const { live } = await connect({
        CYBERMP_ROOT: '/nonexistent',
        DEVTOOLS_TOKEN: TOKEN,
        DEVTOOLS_PORT: String(port),
      });

      live.start();
      await firstEntered;

      // Start stop() while first connected heartbeat is still in flight, then immediately start() a new session
      const stopPromise = live.stop();
      live.start();
      await secondDone;
      expect(inbox.isConnected()).toBe(true);

      // The stopped run's heartbeat is cancelled, so its late report cannot
      // outlive the session and the restart keeps the inbox online
      releaseFirst();
      await firstDone;
      await stopPromise;

      expect(inbox.isConnected()).toBe(true);
      const disconnects = seen.filter((entry) => entry.state === 'disconnected');
      expect(disconnects).toHaveLength(1);
      expect(disconnects[0].meta.session).toBe(seen[0].meta.session);
      expect(disconnects[0].meta.seq).toBeGreaterThan(seen[0].meta.seq);
      const restarted = seen.find(
        (entry) => entry.state === 'connected' && entry.meta.session !== seen[0].meta.session,
      );
      expect(restarted).toBeDefined();
    });
  });
});

describe('live helpers', () => {
  it('turns every schema the bridge library makes into an MCP input schema', () => {
    const mp = {
      ...fakePlayers,
      events: { add() {}, remove() {}, on() {}, off() {} },
      vehicles: { toArray: () => [] },
      peds: { toArray: () => [] },
      objects: { toArray: () => [] },
      resources: { toArray: () => [], getCurrentName: () => 'mcp-bridge' },
      config: { max_players: 32 },
    } as any;
    const inbox = createAgentInbox({ onReply: () => {} });
    const methods = {
      ...inbox.methods,
      ...basicMethods(mp),
      ...economy,
      ...entityMethods(mp, { spawn: true }),
      ...resourceMethods(mp, {}),
      ...createEventLog(mp, { events: [] }).methods,
    };

    const described = describeMethods(methods);

    expect(described.map((m) => m.tool)).toEqual(
      expect.arrayContaining(['get_agent_requests', 'reply_agent_request', 'spawn_vehicle', 'wait_for_events']),
    );

    for (const method of described) {
      const schema = toInputSchema(method.inputSchema);
      const props = Object.keys((method.inputSchema.properties as object) ?? {});

      expect(Object.keys(schema.shape), method.tool).toEqual(props);
    }

    inbox.dispose();
  });

  it('parses ps and tasklist output', () => {
    expect(parsePs(' 4242   3600  204800 ./cybermp-server --config server.toml\n')).toEqual([
      { pid: 4242, uptimeSec: 3600, memoryMb: 200, command: './cybermp-server --config server.toml' },
    ]);
    expect(
      parseTasklist('"cybermp-server.exe","4242","Console","1","204,800 K"\r\nINFO: nothing\r\n'),
    ).toEqual([{ pid: 4242, uptimeSec: null, memoryMb: 200, command: 'cybermp-server.exe' }]);
  });

  it('matches allow/deny wildcards', () => {
    const env = { CYBERMP_MCP_DENY: 'spawn_*, destroy_entity' };

    expect(isToolAllowed({ tool: 'spawn_vehicle', kind: 'write' }, env)).toBe(false);
    expect(isToolAllowed({ tool: 'destroy_entity', kind: 'destructive' }, env)).toBe(false);
    expect(isToolAllowed({ tool: 'list_players', kind: 'read' }, env)).toBe(true);
    expect(isToolAllowed({ tool: 'a.b', kind: 'read' }, { CYBERMP_MCP_ALLOW: 'a?b' })).toBe(false);
  });

  it('fails closed on read-only mode spellings, and an empty allow list allows nothing', () => {
    for (const mode of ['readonly', 'read-only', ' READONLY ', 'read_only', 'raedonly']) {
      expect(isReadOnlyMode({ CYBERMP_MCP_MODE: mode }), mode).toBe(true);
      expect(isToolAllowed({ tool: 'kick_player', kind: 'destructive' }, { CYBERMP_MCP_MODE: mode })).toBe(false);
    }
    for (const mode of [undefined, '', ' ', 'full', 'Write', 'read-write']) {
      expect(isReadOnlyMode({ CYBERMP_MCP_MODE: mode }), String(mode)).toBe(false);
    }

    expect(isToolAllowed({ tool: 'list_players', kind: 'read' }, { CYBERMP_MCP_ALLOW: '' })).toBe(false);
    expect(isToolAllowed({ tool: 'list_players', kind: 'read' }, { CYBERMP_MCP_ALLOW: ' , ' })).toBe(false);
    expect(isToolAllowed({ tool: 'list_players', kind: 'read' }, {})).toBe(true);
  });

  it('accepts a missing input schema', () => {
    expect(toInputSchema(undefined as never)).toBeInstanceOf(z.ZodObject);
  });

  it('skips directories and broken symlinks named *.log', async () => {
    const dir = makeTemp();

    fs.writeFileSync(path.join(dir, 'server_1.log'), 'boot\n');
    fs.mkdirSync(path.join(dir, 'archive.log'));
    fs.symlinkSync(path.join(dir, 'gone'), path.join(dir, 'broken.log'));

    expect((await listLogFiles(dir)).map((f) => f.name)).toEqual(['server_1.log']);
  });

  it('reports another program on the bridge port as a BridgeError', async () => {
    const other = createHttpServer((_req, res) => {
      res.writeHead(500, { 'content-type': 'text/html' });
      res.end('<h1>Internal Server Error</h1>');
    });
    const port = await new Promise<number>((resolve) =>
      other.listen(0, '127.0.0.1', () => resolve((other.address() as AddressInfo).port)),
    );

    try {
      await expect(
        callBridge('bridge.describe', {}, { env: { DEVTOOLS_TOKEN: 't', DEVTOOLS_PORT: String(port) } }),
      ).rejects.toMatchObject({ name: 'BridgeError', message: expect.stringMatching(/HTTP 500 without a bridge reply/) });
    } finally {
      await new Promise((resolve) => other.close(resolve));
    }
  });

  it('sends nothing when its caller signal is already aborted', async () => {
    let calls = 0;
    const server = createHttpServer((_req, res) => {
      calls += 1;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"ok":true,"result":null}');
    });
    const port = await new Promise<number>((resolve) =>
      server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port)),
    );

    try {
      const controller = new AbortController();
      controller.abort();
      await expect(
        callBridge(
          'bridge.presence',
          {},
          {
            env: { DEVTOOLS_TOKEN: 't', DEVTOOLS_PORT: String(port) },
            timeoutMs: 1_000,
            signal: controller.signal,
          },
        ),
      ).rejects.toBeInstanceOf(BridgeError);
      expect(calls).toBe(0);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('applies the RPC deadline to a stalled body, not only to headers', async () => {
    const stalled = createHttpServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.write('{"ok":');
    });
    const port = await new Promise<number>((resolve) =>
      stalled.listen(0, '127.0.0.1', () => resolve((stalled.address() as AddressInfo).port)),
    );

    try {
      const started = Date.now();
      await expect(
        callBridge(
          'bridge.presence',
          {},
          { env: { DEVTOOLS_TOKEN: 't', DEVTOOLS_PORT: String(port) }, timeoutMs: 100 },
        ),
      ).rejects.toBeInstanceOf(BridgeError);
      expect(Date.now() - started).toBeLessThan(1_000);
    } finally {
      stalled.closeAllConnections();
      await new Promise((resolve) => stalled.close(resolve));
    }
  });

  it('cancels a bridge call at once when its caller aborts', async () => {
    // A bridge that sends headers and then stalls the body
    const stalled = createHttpServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.write('{"ok":');
    });
    const port = await new Promise<number>((resolve) =>
      stalled.listen(0, '127.0.0.1', () => resolve((stalled.address() as AddressInfo).port)),
    );

    try {
      const controller = new AbortController();
      const started = Date.now();
      const call = callBridge(
        'bridge.presence',
        { state: 'connected' },
        {
          env: { DEVTOOLS_TOKEN: 't', DEVTOOLS_PORT: String(port) },
          timeoutMs: 60_000,
          signal: controller.signal,
        },
      );

      setTimeout(() => controller.abort(), 50);
      await expect(call).rejects.toBeInstanceOf(BridgeError);
      // Without forwarding the signal the call would hang for the full timeout
      expect(Date.now() - started).toBeLessThan(1_000);
    } finally {
      stalled.closeAllConnections();
      await new Promise((resolve) => stalled.close(resolve));
    }
  });
});
