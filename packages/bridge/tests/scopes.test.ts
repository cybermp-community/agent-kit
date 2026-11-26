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

    provide('freemode-economy', moneyMethods, 'economy');
    await flush();

    const methods = host.methods(basicMethods(fakePlayersMp));
    const described = describeMethods(methods);

    expect(toolNames(methods)).toEqual(
      expect.arrayContaining(['list_players', 'kick_player', 'economy__set_money', 'list_scopes']),
    );
    expect(described.find((d) => d.tool === 'list_players')).toMatchObject({ scope: 'core' });
    expect(described.find((d) => d.tool === 'economy__set_money')).toMatchObject({
      scope: 'economy',
      resource: 'freemode-economy',
      kind: 'write',
      title: 'Set money',
    });
  });

  it('calls the provider through the scoped method', async () => {
    const { host, provide } = setup();

    provide('freemode-economy', moneyMethods, 'economy');
    await flush();

    const method = host.methods({})['freemode-economy/economy.setMoney'];

    expect(await method.handler({ playerId: 1, amount: 50 })).toEqual({ playerId: 1, amount: 50 });
  });

  it('lets two resources declare the same tool under different scopes', async () => {
    const { host, provide } = setup();

    provide('freemode-economy', moneyMethods, 'economy');
    provide('casino', moneyMethods, 'casino');
    await flush();

    expect(toolNames(host.methods({}))).toEqual(
      expect.arrayContaining(['economy__set_money', 'casino__set_money']),
    );
  });

  it('defaults the scope to the resource name', async () => {
    const { host, provide } = setup();

    provide('freemode-economy', moneyMethods);
    await flush();

    expect(toolNames(host.methods({}))).toContain('freemode-economy__set_money');
    expect(defaultScope('My_Gamemode 2')).toBe('my-gamemode-2');
    expect(defaultScope('123')).toBe('resource');
  });

  it('rejects a scope another resource holds, and tells that resource', async () => {
    const { host, hostLog, provide } = setup();

    provide('freemode-economy', moneyMethods, 'economy');
    await flush();
    const late = provide('other-economy', moneyMethods, 'economy');
    await flush();

    expect(host.providers().map((p) => p.resource)).toEqual(['freemode-economy']);
    expect(late.lines).toEqual([
      'warn MCP tools of other-economy not registered: scope "economy" is already used by resource freemode-economy',
    ]);
    expect(hostLog.lines.filter((l) => l.startsWith('warn'))).toHaveLength(1);
  });

  it('frees a scope when its resource stops', async () => {
    const { world, host, provide } = setup();

    provide('freemode-economy', moneyMethods, 'economy');
    await flush();
    world.stopResource('freemode-economy');

    expect(host.providers()).toEqual([]);
  });

  it.each([
    ['core', 'core'],
    ['upper case', 'Economy'],
    ['a dot', 'eco.nomy'],
    ['more than 20 characters', 'a'.repeat(21)],
  ])('rejects a scope with %s', async (_label, scope) => {
    const { host, provide } = setup();
    const log = provide('freemode-economy', moneyMethods, scope);
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

    provide('freemode-economy', moneyMethods, 'economy');
    await flush();

    const methods = host.methods(basicMethods(fakePlayersMp));
    const scopes = await methods['bridge.scopes'].handler({});

    expect(scopes).toEqual([
      {
        scope: 'core',
        resource: 'mcp-bridge',
        tools: ['list_players', 'kick_player', 'mute_player', 'set_player_dimension', 'list_scopes'],
      },
      { scope: 'economy', resource: 'freemode-economy', tools: ['economy__set_money'] },
    ]);
  });

  it('still merges server.info from providers', async () => {
    const { host, provide } = setup();

    provide('freemode-economy', moneyMethods, 'economy');
    await flush();

    const info = await host.methods(basicMethods(fakePlayersMp))['server.info'].handler({});

    expect(info).toMatchObject({ players: 0, maxPlayers: 32, economy: 'on' });
  });

  it('scopedToolName leaves core tools alone', () => {
    expect(scopedToolName('core', 'list_players')).toBe('list_players');
    expect(scopedToolName('economy', 'set_money')).toBe('economy__set_money');
  });
});
