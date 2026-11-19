import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { createCyberMpServer } from '../src/server.js';

describe('CyberMP MCP Server', () => {
  let client: Client;
  let serverTransport: InMemoryTransport;
  let clientTransport: InMemoryTransport;

  beforeAll(async () => {
    const server = createCyberMpServer();
    [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    client = new Client(
      { name: 'test-cybermp-client', version: '1.0.0' },
      { capabilities: {} }
    );
    await client.connect(clientTransport);
  });

  afterAll(async () => {
    await client.close();
  });

  describe('Tool Registration', () => {
    it('registers all 5 core CyberMP tools', async () => {
      const response = await client.listTools();
      const toolNames = response.tools.map((t) => t.name);

      expect(toolNames).toHaveLength(5);
      expect(toolNames).toContain('cybermp_get_event');
      expect(toolNames).toContain('cybermp_get_type');
      expect(toolNames).toContain('cybermp_get_rpc_flow');
      expect(toolNames).toContain('cybermp_search_docs');
      expect(toolNames).toContain('cybermp_lookup_tweakdb');
    });

    it('defines accurate schemas and descriptions for all tools', async () => {
      const response = await client.listTools();
      const tools = new Map(response.tools.map((t) => [t.name, t]));

      const getEvent = tools.get('cybermp_get_event');
      expect(getEvent?.description).toBeDefined();
      expect(getEvent?.inputSchema.properties).toHaveProperty('env');
      expect(getEvent?.inputSchema.properties).toHaveProperty('name');
      expect(getEvent?.inputSchema.properties).toHaveProperty('category');

      const getType = tools.get('cybermp_get_type');
      expect(getType?.description).toBeDefined();
      expect(getType?.inputSchema.properties).toHaveProperty('name');
      expect(getType?.inputSchema.properties).toHaveProperty('type_name');

      const getRpc = tools.get('cybermp_get_rpc_flow');
      expect(getRpc?.description).toBeDefined();
      expect(getRpc?.inputSchema.properties).toHaveProperty('flow');
      expect(getRpc?.inputSchema.properties).toHaveProperty('from');
      expect(getRpc?.inputSchema.properties).toHaveProperty('to');

      const searchDocs = tools.get('cybermp_search_docs');
      expect(searchDocs?.description).toBeDefined();
      expect(searchDocs?.inputSchema.required).toContain('query');

      const lookupTweakDb = tools.get('cybermp_lookup_tweakdb');
      expect(lookupTweakDb?.description).toBeDefined();
      expect(lookupTweakDb?.inputSchema.properties).toHaveProperty('query');
      expect(lookupTweakDb?.inputSchema.properties).toHaveProperty('category');
      expect(lookupTweakDb?.inputSchema.properties).toHaveProperty('limit');
    });
  });

  describe('Tool Invocation: cybermp_get_event', () => {
    it('retrieves damage event for server with signature and listener', async () => {
      const result = await client.callTool({
        name: 'cybermp_get_event',
        arguments: { name: 'damage', env: 'server' },
      });

      expect(result.isError).toBeFalsy();
      const text = (result.content as any)[0].text;
      expect(text).toContain('damage(playerId: number, data: DamageEventData)');
      expect(text).toContain("events.on('damage'");
      expect(text).toContain('DamageEventData');
    });

    it('resolves alias playerDamage to damage event', async () => {
      const result = await client.callTool({
        name: 'cybermp_get_event',
        arguments: { name: 'playerDamage' },
      });

      expect(result.isError).toBeFalsy();
      const text = (result.content as any)[0].text;
      expect(text).toContain('damage');
    });

    it('returns anti-hallucination warning when querying foreign FiveM event', async () => {
      const result = await client.callTool({
        name: 'cybermp_get_event',
        arguments: { name: 'RegisterNetEvent' },
      });

      const text = (result.content as any)[0].text;
      expect(text).toContain('⚠️ Warning');
      expect(text).toContain('FiveM');
      expect(text).toContain('events.onClient');
    });
  });

  describe('Tool Invocation: cybermp_get_type', () => {
    it('retrieves MpPlayer type information with methods and properties', async () => {
      const result = await client.callTool({
        name: 'cybermp_get_type',
        arguments: { name: 'MpPlayer' },
      });

      expect(result.isError).toBeFalsy();
      const text = (result.content as any)[0].text;
      expect(text).toContain('MpPlayer');
      expect(text).toContain('health');
      expect(text).toContain('kick(reason?: string): void');
    });

    it('retrieves EntityType enum members', async () => {
      const result = await client.callTool({
        name: 'cybermp_get_type',
        arguments: { name: 'EntityType' },
      });

      expect(result.isError).toBeFalsy();
      const text = (result.content as any)[0].text;
      expect(text).toContain('Player');
      expect(text).toContain('Vehicle');
    });

    it('returns anti-hallucination warning when querying foreign alt:V type', async () => {
      const result = await client.callTool({
        name: 'cybermp_get_type',
        arguments: { name: 'alt.Player' },
      });

      const text = (result.content as any)[0].text;
      expect(text).toContain('⚠️ Warning');
      expect(text).toContain('alt:V');
      expect(text).toContain('MpPlayer');
    });

    it('retrieves type using type_name alias', async () => {
      const result = await client.callTool({
        name: 'cybermp_get_type',
        arguments: { type_name: 'MpPlayer' },
      });

      expect(result.isError).toBeFalsy();
      const text = (result.content as any)[0].text;
      expect(text).toContain('MpPlayer');
    });

    it('returns error when type name is missing or empty', async () => {
      const result = await client.callTool({
        name: 'cybermp_get_type',
        arguments: {},
      });

      expect(result.isError).toBe(true);
      const text = (result.content as any)[0].text;
      expect(text).toContain('Missing required argument');
    });
  });

  describe('Tool Invocation: cybermp_get_rpc_flow', () => {
    it('returns server to client paired RPC flow code', async () => {
      const result = await client.callTool({
        name: 'cybermp_get_rpc_flow',
        arguments: { from: 'server', to: 'client' },
      });

      expect(result.isError).toBeFalsy();
      const text = (result.content as any)[0].text;
      expect(text).toContain('Server to Client RPC');
      expect(text).toContain('mp.events.emitClient');
      expect(text).toContain('mp.events.onServer');
    });

    it('returns server to client paired RPC flow code with flow alias', async () => {
      const result = await client.callTool({
        name: 'cybermp_get_rpc_flow',
        arguments: { flow: 'server-client' },
      });

      expect(result.isError).toBeFalsy();
      const text = (result.content as any)[0].text;
      expect(text).toContain('Server to Client RPC');
      expect(text).toContain('mp.events.emitClient');
    });

    it('returns client to CEF browser paired bridge code with source and target aliases', async () => {
      const result = await client.callTool({
        name: 'cybermp_get_rpc_flow',
        arguments: { source: 'client', target: 'cef' },
      });

      expect(result.isError).toBeFalsy();
      const text = (result.content as any)[0].text;
      expect(text).toContain('Client to Browser (CEF) Bridge');
    });

    it('handles malformed flow string safely with error', async () => {
      const result = await client.callTool({
        name: 'cybermp_get_rpc_flow',
        arguments: { flow: 'invalid' },
      });

      expect(result.isError).toBe(true);
      const text = (result.content as any)[0].text;
      expect(text).toContain('Cannot determine RPC endpoints');
    });

    it('returns client to CEF browser paired bridge code', async () => {
      const result = await client.callTool({
        name: 'cybermp_get_rpc_flow',
        arguments: { from: 'client', to: 'browser' },
      });

      expect(result.isError).toBeFalsy();
      const text = (result.content as any)[0].text;
      expect(text).toContain('Client to Browser (CEF) Bridge');
      expect(text).toContain('mp.events.emitCef');
      expect(text).toContain('mp.events.on');
    });

    it('handles invalid server to browser direct RPC direction safely with error', async () => {
      const result = await client.callTool({
        name: 'cybermp_get_rpc_flow',
        arguments: { from: 'server', to: 'browser' },
      });

      expect(result.isError).toBe(true);
      const text = (result.content as any)[0].text;
      expect(text).toContain('Invalid RPC direction');
      expect(text).toContain('route events through Client');
    });
  });

  describe('Tool Invocation: cybermp_search_docs', () => {
    it('finds guides for rpc with code snippets and links', async () => {
      const result = await client.callTool({
        name: 'cybermp_search_docs',
        arguments: { query: 'rpc', limit: 2 },
      });

      expect(result.isError).toBeFalsy();
      const text = (result.content as any)[0].text;
      expect(text).toContain('CyberMP Documentation Guides');
      expect(text).toContain('https://docs.cyber.mp/guides/');
    });

    it('returns anti-hallucination warning when querying foreign API in docs search', async () => {
      const result = await client.callTool({
        name: 'cybermp_search_docs',
        arguments: { query: 'TriggerClientEvent' },
      });

      const text = (result.content as any)[0].text;
      expect(text).toContain('⚠️ Warning');
      expect(text).toContain('FiveM');
      expect(text).toContain('events.emitClient');
    });
  });

  describe('Tool Invocation: cybermp_lookup_tweakdb', () => {
    it('retrieves TweakDB records for status effects via MCP tool', async () => {
      const result = await client.callTool({
        name: 'cybermp_lookup_tweakdb',
        arguments: { query: 'burning', category: 'status_effects' },
      });

      expect(result.isError).toBeFalsy();
      const text = (result.content as any)[0].text;
      expect(text).toContain('BaseStatusEffect.Burning');
      expect(text).toContain('thermal damage');
    });

    it('returns empty message when no records match', async () => {
      const result = await client.callTool({
        name: 'cybermp_lookup_tweakdb',
        arguments: { query: 'non_existent_xyz_123' },
      });

      expect(result.isError).toBeFalsy();
      const text = (result.content as any)[0].text;
      expect(text).toContain('No TweakDB records found');
    });
  });
});
