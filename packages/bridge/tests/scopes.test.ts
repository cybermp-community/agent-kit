import { afterEach, describe, expect, it } from 'vitest';
import z from 'zod';
import {
  basicMethods,
  defaultScope,
  defineMethod,
  describeMethods,
  type MethodDef,
  scopedToolName,
} from '../src/index.ts';
import {
  createProviderHost,
  type McpProvider,
  type ProviderHost,
  registerMcpProvider,
} from '../src/rpc.ts';
import { createWorld, flush, recordingLogger } from './fakes.ts';

const fakePlayersMp = {
  config: { max_players: 32 },
  players: { toArray: () => [], exists: () => false, at: () => undefined as never },
};

const moneyMethods: Record<string, MethodDef> = {
  'economy.setMoney': defineMethod({
    tool: 'set_money',
    title: 'Set money',
    description: "Sets a player's money.",
    kind: 'write',
    params: z.object({ playerId: z.number().int(), amount: z.number().int() }),
    handler: ({ playerId, amount }) => ({ playerId, amount }),
  }),
  'server.info': defineMethod({
    kind: 'read',
    params: z.object({}).default({}),
    handler: () => ({ economy: 'on' }),
  }),
};

describe('scoped provider tools', () => {
  let host: ProviderHost | undefined;
  const providers: McpProvider[] = [];

  afterEach(async () => {
    await Promise.all(providers.splice(0).map((p) => p.unregister()));
    host?.dispose();
  });

  const setup = () => {
    const world = createWorld();
    const hostLog = recordingLogger();

    host = createProviderHost({
      mp: world.mpFor('mcp-bridge'),
      rpc: world.rpcFor('mcp-bridge'),
      logger: hostLog.logger,
    });

    const provide = (
      resource: string,
      methods: Record<string, MethodDef>,
      scope?: string,
    ) => {
      const log = recordingLogger();

      providers.push(
        registerMcpProvider({
          mp: world.mpFor(resource),
          rpc: world.rpcFor(resource),
          methods,
          scope,
          logger: log.logger,
        }),
      );

      return log;
    };

    return { world, host: host!, hostLog, provide };
  };

  const toolNames = (methods: Record<string, MethodDef>) =>
    describeMethods(methods).map((d) => d.tool);

  it('names provider tools <scope>__<tool> and keeps core names bare', async () => {
    const { host, provide } = setup();

    provide('game-economy', moneyMethods, 'economy');
    await flush();

    const methods = host.methods(basicMethods(fakePlayersMp));
    const described = describeMethods(methods);

    expect(toolNames(methods)).toEqual(
      expect.arrayContaining(['list_players', 'kick_player', 'economy__set_money', 'list_scopes']),
    );
    expect(described.find((d) => d.tool === 'list_players')).toMatchObject({ scope: 'core' });
    expect(described.find((d) => d.tool === 'economy__set_money')).toMatchObject({
      scope: 'economy',
      resource: 'game-economy',
      kind: 'write',
      title: 'Set money',
    });
  });

  it('calls the provider through the scoped method', async () => {
    const { host, provide } = setup();

    provide('game-economy', moneyMethods, 'economy');
    await flush();

    const method = host.methods({})['game-economy/economy.setMoney'];

    expect(await method.handler({ playerId: 1, amount: 50 })).toEqual({ playerId: 1, amount: 50 });
  });

  it('lets two resources declare the same tool under different scopes', async () => {
    const { host, provide } = setup();

    provide('game-economy', moneyMethods, 'economy');
    provide('casino', moneyMethods, 'casino');
    await flush();

    expect(toolNames(host.methods({}))).toEqual(
      expect.arrayContaining(['economy__set_money', 'casino__set_money']),
    );
  });

  it('defaults the scope to the resource name', async () => {
    const { host, provide } = setup();

    provide('game-economy', moneyMethods);
    await flush();

    expect(toolNames(host.methods({}))).toContain('game-economy__set_money');
    expect(defaultScope('My_Gamemode 2')).toBe('my-gamemode-2');
    expect(defaultScope('123')).toBe('resource');
  });

  it('rejects a scope another resource holds, and tells that resource', async () => {
    const { host, hostLog, provide } = setup();

    provide('game-economy', moneyMethods, 'economy');
    await flush();
    const late = provide('other-economy', moneyMethods, 'economy');
    await flush();

    expect(host.providers().map((p) => p.resource)).toEqual(['game-economy']);
    expect(late.lines).toEqual([
      'warn MCP tools of other-economy not registered: scope "economy" is already used by resource game-economy',
    ]);
    expect(hostLog.lines.filter((l) => l.startsWith('warn'))).toHaveLength(1);
  });

  it('frees a scope when its resource stops', async () => {
    const { world, host, provide } = setup();

    provide('game-economy', moneyMethods, 'economy');
    await flush();
    world.stopResource('game-economy');

    expect(host.providers()).toEqual([]);
  });

  it.each([
    ['core', 'core'],
    ['upper case', 'Economy'],
    ['a dot', 'eco.nomy'],
    ['more than 20 characters', 'a'.repeat(21)],
  ])('rejects a scope with %s', async (_label, scope) => {
    const { host, provide } = setup();
    const log = provide('game-economy', moneyMethods, scope);
    await flush();

    expect(host.providers()).toEqual([]);
    expect(log.lines[0]).toMatch(/invalid scope/);
  });

  it('rejects tool names that are not snake_case or too long', async () => {
    const { host, provide } = setup();
    const tool = (name: string) => ({
      m: defineMethod({ tool: name, kind: 'read', params: z.object({}), handler: () => null }),
    });

    const camel = provide('a', tool('setMoney'), 'a');
    const long = provide('b', tool('x'.repeat(46)), 'b');
    await flush();

    expect(host.providers()).toEqual([]);
    expect(camel.lines[0]).toMatch(/must be snake_case/);
    expect(long.lines[0]).toMatch(/longer than 48/);
  });

  it('lists every scope with list_scopes', async () => {
    const { host, provide } = setup();

    provide('game-economy', moneyMethods, 'economy');
    await flush();

    const methods = host.methods(basicMethods(fakePlayersMp));
    const scopes = await methods['bridge.scopes'].handler({});

    expect(scopes).toEqual([
      {
        scope: 'core',
        resource: 'mcp-bridge',
        tools: ['list_players', 'kick_player', 'mute_player', 'set_player_dimension', 'list_scopes'],
      },
      { scope: 'economy', resource: 'game-economy', tools: ['economy__set_money'] },
    ]);
  });

  it('still merges server.info from providers', async () => {
    const { host, provide } = setup();

    provide('game-economy', moneyMethods, 'economy');
    await flush();

    const info = await host.methods(basicMethods(fakePlayersMp))['server.info'].handler({});

    expect(info).toMatchObject({ players: 0, maxPlayers: 32, economy: 'on' });
  });

  it('scopedToolName leaves core tools alone', () => {
    expect(scopedToolName('core', 'list_players')).toBe('list_players');
    expect(scopedToolName('economy', 'set_money')).toBe('economy__set_money');
  });
});

describe('provider host edge cases', () => {
  const descriptor = {
    method: 'demo.ping',
    tool: 'ping',
    kind: 'read',
    inputSchema: { type: 'object' },
  };

  const registration = (resource: string, rpcName = resource) =>
    JSON.stringify({ resource, scope: 'demo', rpcName, methods: [descriptor] });

  /** A host plus a hand-rolled provider RPC server whose answers the test controls */
  const setup = (ttlMs?: number) => {
    const world = createWorld();
    const host = createProviderHost({
      mp: world.mpFor('mcp-bridge'),
      rpc: world.rpcFor('mcp-bridge'),
      ttlMs,
      logger: recordingLogger().logger,
    });
    const caller = world.rpcFor('caller');
    world.mpFor('demo');
    const provider = world.rpcFor('demo');
    const send = (method: string, data: unknown) =>
      caller.callServer(method, { name: 'mcp-bridge', data });

    return { world, host, provider, send };
  };

  it('drops a provider that stops renewing after ttlMs', async () => {
    const { host, send } = setup(30);

    expect(await send('mcp.register', registration('demo'))).toBe('{"ok":true,"result":null}');
    expect(host.providers().map((p) => p.resource)).toEqual(['demo']);

    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(host.providers()).toEqual([]);
    expect(host.methods({})['demo/demo.ping']).toBeUndefined();
  });

  it('answers malformed registrations instead of throwing', async () => {
    const { host, send } = setup();

    expect(JSON.parse(await send('mcp.register', '{not json'))).toMatchObject({
      ok: false,
      error: expect.stringMatching(/^invalid registration/),
    });
    expect(await send('mcp.unregister', '{not json')).toBe('ok');
    expect(host.providers()).toEqual([]);
  });

  it('turns a malformed provider answer into a BridgeError', async () => {
    const { host, provider, send } = setup();

    provider.register('mcp.call', () => 'not json');
    await send('mcp.register', registration('demo'));

    await expect(host.methods({})['demo/demo.ping'].handler({})).rejects.toMatchObject({
      name: 'BridgeError',
      message: 'Resource demo sent a malformed answer to demo.ping',
    });
  });

  it('never lets provider JSON reach the prototype of presence or server.info answers', async () => {
    const { host, provider, send } = setup();
    const hostile = '{"__proto__":{"polluted":true},"constructor":1,"pending":2}';

    provider.register('mcp.presence', () => hostile);
    provider.register('mcp.call', () => `{"ok":true,"result":${hostile}}`);
    await send(
      'mcp.register',
      JSON.stringify({
        resource: 'demo',
        scope: 'demo',
        rpcName: 'demo',
        methods: [{ method: 'server.info', kind: 'read' }],
      }),
    );

    const presence = await host.onPresence('connected');
    const info = (await host.methods({})['server.info'].handler({})) as Record<string, unknown>;

    for (const answer of [presence, info]) {
      expect(answer).toEqual({ pending: 2 });
      expect(Object.getPrototypeOf(answer)).toBe(Object.prototype);
      expect((answer as { polluted?: boolean }).polluted).toBeUndefined();
    }
  });

  it('a provider treats __proto__ as an unknown method and ignores bad presence data', async () => {
    const world = createWorld();
    const rpc = world.rpcFor('demo');
    const provider = registerMcpProvider({
      mp: world.mpFor('demo'),
      rpc,
      methods: moneyMethods,
      logger: recordingLogger().logger,
      retryMs: 60_000,
    });
    const caller = world.rpcFor('caller');
    const call = (method: string, data: string) => caller.callServer(method, { name: 'demo', data });

    expect(JSON.parse(await call('mcp.call', '{"method":"__proto__"}'))).toEqual({
      ok: false,
      error: 'Unknown method: __proto__',
    });
    expect(JSON.parse(await call('mcp.call', 'garbage')).ok).toBe(false);
    expect(await call('mcp.presence', 'garbage')).toBe('null');

    await provider.unregister();
  });
});
