import { describe, it, expect } from 'vitest';
import { checkForeignApi } from '../src/engine/anti-hallucination';
import { getRpcFlow, parseRpcFlowArgs } from '../src/engine/rpc-engine';
import { getEventInfo } from '../src/engine/events-engine';
import { getTypeInfo, resolveTypeName } from '../src/engine/types-engine';
import { searchDocs } from '../src/engine/docs-engine';

describe('Anti-Hallucination Guard', () => {
  it('detects FiveM API calls and returns explicit warning with CyberMP alternative', () => {
    const rne = checkForeignApi('RegisterNetEvent');
    expect(rne).not.toBeNull();
    expect(rne).toContain('FiveM');
    expect(rne).toContain('events.onClient');

    const tce = checkForeignApi('TriggerClientEvent');
    expect(tce).not.toBeNull();
    expect(tce).toContain('FiveM');
    expect(tce).toContain('events.emitClient');

    const tse = checkForeignApi('TriggerServerEvent');
    expect(tse).not.toBeNull();
    expect(tse).toContain('FiveM');
    expect(tse).toContain('events.emitServer');

    const onNet = checkForeignApi('onNet');
    expect(onNet).not.toBeNull();
    expect(onNet).toContain('FiveM');
  });

  it('detects alt:V API calls and returns warnings', () => {
    const altOn = checkForeignApi('alt.on');
    expect(altOn).not.toBeNull();
    expect(altOn).toContain('alt:V');

    const altPlayer = checkForeignApi('alt.Player');
    expect(altPlayer).not.toBeNull();
    expect(altPlayer).toContain('alt:V');
    expect(altPlayer).toContain('MpPlayer');

    const altEmit = checkForeignApi('alt.emitClient');
    expect(altEmit).not.toBeNull();
    expect(altEmit).toContain('alt:V');
    expect(altEmit).toContain('events.emitClient');
  });

  it('detects RAGEMP API calls and returns warnings', () => {
    const mpAdd = checkForeignApi('mp.events.add');
    expect(mpAdd).not.toBeNull();
    expect(mpAdd).toContain('RAGEMP');

    const mpCallRemote = checkForeignApi('mp.events.callRemote');
    expect(mpCallRemote).not.toBeNull();
    expect(mpCallRemote).toContain('RAGEMP');
    expect(mpCallRemote).toContain('events.emitServer');
  });

  it('detects SA-MP API calls and returns warnings', () => {
    const sampConnect = checkForeignApi('OnPlayerConnect');
    expect(sampConnect).not.toBeNull();
    expect(sampConnect).toContain('SA-MP');
    expect(sampConnect).toContain('playerConnect');

    const sampMsg = checkForeignApi('SendClientMessage');
    expect(sampMsg).not.toBeNull();
    expect(sampMsg).toContain('SA-MP');
  });

  it('returns null for valid CyberMP APIs', () => {
    expect(checkForeignApi('events.onClient')).toBeNull();
    expect(checkForeignApi('MpPlayer')).toBeNull();
    expect(checkForeignApi('playerDamage')).toBeNull();
    expect(checkForeignApi('events.emitCef')).toBeNull();
  });

  it('does not falsely trigger on substring matches or valid queries like vehicle bonnet', () => {
    expect(checkForeignApi('vehicle bonnet')).toBeNull();
    expect(checkForeignApi('CreateVehicleOptions')).toBeNull();
  });
});

describe('RPC Flow Engine', () => {
  it('generates exact paired RPC code between server and client', () => {
    const serverToClient = getRpcFlow('server', 'client');
    expect(serverToClient.title).toBe('Server to Client RPC');
    expect(serverToClient.senderCode).toContain('mp.events.emitClient');
    expect(serverToClient.receiverCode).toContain('mp.events.onServer');

    const clientToServer = getRpcFlow('client', 'server');
    expect(clientToServer.title).toBe('Client to Server RPC');
    expect(clientToServer.senderCode).toContain('mp.events.emitServer');
    expect(clientToServer.receiverCode).toContain('mp.events.onClient');
  });

  it('generates exact paired RPC code between client and browser (CEF)', () => {
    const clientToBrowser = getRpcFlow('client', 'browser');
    expect(clientToBrowser.title).toBe('Client to Browser (CEF) Bridge');
    expect(clientToBrowser.senderCode).toContain('mp.events.emitCef');
    expect(clientToBrowser.receiverCode).toContain('mp.events.on');

    const browserToClient = getRpcFlow('browser', 'client');
    expect(browserToClient.title).toBe('Browser (CEF) to Client Bridge');
    expect(browserToClient.senderCode).toContain('mp.events.emit');
    expect(browserToClient.receiverCode).toContain('mp.events.onCef');
  });

  it('throws an error for direct server to browser communication', () => {
    expect(() => getRpcFlow('server', 'browser')).toThrow(/Invalid RPC direction/);
    expect(() => getRpcFlow('browser', 'server')).toThrow(/Invalid RPC direction/);
  });
});

describe('MCP Argument Normalization', () => {
  it('parses flow string formatted as server-client, client->browser, cef_server', () => {
    expect(parseRpcFlowArgs({ flow: 'server-client' })).toEqual({ from: 'server', to: 'client' });
    expect(parseRpcFlowArgs({ flow: 'client->browser' })).toEqual({ from: 'client', to: 'browser' });
    expect(parseRpcFlowArgs({ flow: 'cef_server' })).toEqual({ from: 'browser', to: 'server' });
  });

  it('parses source and target synonyms', () => {
    expect(parseRpcFlowArgs({ source: 'server', target: 'client' })).toEqual({ from: 'server', to: 'client' });
    expect(parseRpcFlowArgs({ from: 'client', target: 'cef' })).toEqual({ from: 'client', to: 'browser' });
  });

  it('throws on invalid or unresolvable flow args', () => {
    expect(() => parseRpcFlowArgs({ flow: 'invalid' })).toThrow(/Cannot determine RPC endpoints/);
    expect(() => parseRpcFlowArgs({})).toThrow(/Missing source and target/);
  });

  it('resolves typeName from aliases type_name, typeName, type, and name', () => {
    expect(resolveTypeName({ type_name: 'MpPlayer' })).toBe('MpPlayer');
    expect(resolveTypeName({ typeName: 'MpVehicle' })).toBe('MpVehicle');
    expect(resolveTypeName({ type: 'EntityType' })).toBe('EntityType');
    expect(resolveTypeName({ name: 'Vector3' })).toBe('Vector3');
  });

  it('throws when no type name alias is supplied', () => {
    expect(() => resolveTypeName({})).toThrow(/Missing required argument/);
    expect(() => resolveTypeName({ type_name: '   ' })).toThrow(/Missing required argument/);
  });
});

describe('Events Engine', () => {
  it('retrieves exact match for player damage event', () => {
    const result = getEventInfo({ name: 'damage', env: 'server' });
    expect(result.exactMatch).toBeDefined();
    expect(result.exactMatch?.name).toBe('damage');
    expect(result.exactMatch?.env).toBe('server');
    expect(result.exactMatch?.category).toBe('Events/Players');
    expect(result.formattedText).toContain('damage(playerId: number, data: DamageEventData)');
    expect(result.formattedText).toContain('events.on');
  });

  it('resolves playerDamage alias to damage event', () => {
    const result = getEventInfo({ name: 'playerDamage' });
    expect(result.exactMatch).toBeDefined();
    expect(result.exactMatch?.name).toBe('damage');
  });

  it('strictly respects env filter and does not inject server alias into client events', () => {
    const result = getEventInfo({ name: 'playerDamage', env: 'client' });
    expect(result.exactMatch).toBeUndefined();
    expect(result.matches.some((m) => m.name === 'damage')).toBe(false);
    expect(result.matches.every((m) => m.env === 'client')).toBe(true);
  });

  it('retrieves partial search matches for vehicle events', () => {
    const result = getEventInfo({ name: 'vehicle' });
    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.matches.some((m) => m.name.toLowerCase().includes('vehicle'))).toBe(true);
    expect(result.formattedText).toContain('vehicle');
  });

  it('filters events by execution environment', () => {
    const clientResult = getEventInfo({ env: 'client' });
    expect(clientResult.matches.length).toBeGreaterThan(0);
    expect(clientResult.matches.every((m) => m.env === 'client')).toBe(true);

    const serverResult = getEventInfo({ env: 'server' });
    expect(serverResult.matches.length).toBeGreaterThan(0);
    expect(serverResult.matches.every((m) => m.env === 'server')).toBe(true);
  });

  it('includes anti-hallucination warning in formattedText when foreign symbol is queried', () => {
    const result = getEventInfo({ name: 'RegisterNetEvent' });
    expect(result.formattedText).toContain('⚠️ Warning');
    expect(result.formattedText).toContain('FiveM');
  });
});

describe('Types Engine', () => {
  it('retrieves MpPlayer type with properties and methods', () => {
    const result = getTypeInfo('MpPlayer');
    expect(result.type).toBeDefined();
    expect(result.type?.name).toBe('MpPlayer');
    expect(result.type?.kind).toBe('interface');
    expect(result.type?.properties.some((p) => p.name === 'health')).toBe(true);
    expect(result.type?.methods.some((m) => m.name === 'kick')).toBe(true);
    expect(result.type?.methods.some((m) => m.name === 'setMeta')).toBe(true);
    expect(result.formattedText).toContain('MpPlayer');
    expect(result.formattedText).toContain('kick(reason?: string): void');
  });

  it('retrieves MpVehicle type with vehicle properties', () => {
    const result = getTypeInfo('MpVehicle');
    expect(result.type).toBeDefined();
    expect(result.type?.name).toBe('MpVehicle');
    expect(result.formattedText).toContain('MpVehicle');
  });

  it('retrieves EntityType enum with all enum members', () => {
    const result = getTypeInfo('EntityType');
    expect(result.type).toBeDefined();
    expect(result.type?.kind).toBe('enum');
    expect(result.type?.enumMembers?.some((m) => m.name === 'Player')).toBe(true);
    expect(result.type?.enumMembers?.some((m) => m.name === 'Vehicle')).toBe(true);
    expect(result.formattedText).toContain('Player');
    expect(result.formattedText).toContain('Vehicle');
  });

  it('retrieves CreateVehicleOptions without false-positive anti-hallucination warning', () => {
    const result = getTypeInfo('CreateVehicleOptions');
    expect(result.type).toBeDefined();
    expect(result.type?.name).toBe('CreateVehicleOptions');
    expect(result.formattedText).not.toContain('⚠️ Warning');
    expect(result.formattedText).not.toContain('SA-MP');
  });

  it('includes anti-hallucination warning when foreign type queried', () => {
    const result = getTypeInfo('alt.Player');
    expect(result.formattedText).toContain('⚠️ Warning');
    expect(result.formattedText).toContain('alt:V');
    expect(result.formattedText).toContain('MpPlayer');
  });

  it('resolves native REDengine classes from game.d.ts on demand', () => {
    const result = getTypeInfo('TeleportationFacility');
    expect(result.type).toBeDefined();
    expect(result.type?.name).toBe('TeleportationFacility');
    expect(result.type?.env).toBe('client');
    expect(result.type?.source).toBe('REDengine');
    expect(result.formattedText).toContain('gameTeleportationFacility');
  });

  it('extracts methods and static functions from ScriptGameInstance', () => {
    const result = getTypeInfo('ScriptGameInstance');
    expect(result.type).toBeDefined();
    expect(result.type?.methods.length).toBeGreaterThan(50);
    expect(result.formattedText).toContain('GetTeleportationFacility');
  });

  it('resolves gameTeleportationFacility directly', () => {
    const result = getTypeInfo('gameTeleportationFacility');
    expect(result.type).toBeDefined();
    expect(result.type?.name).toBe('gameTeleportationFacility');
    expect(result.type?.methods.length).toBeGreaterThan(0);
  });

  it('resolves MountingFacility', () => {
    const result = getTypeInfo('MountingFacility');
    expect(result.type).toBeDefined();
    expect(result.type?.methods.some((m) => m.name === 'Mount')).toBe(true);
  });

  it('caches REDengine classes under both prefix-matched name and original query key', () => {
    const res1 = getTypeInfo('MountingFacility');
    expect(res1.type).toBeDefined();

    // Second call should return instantly from in-memory cache
    const start = performance.now();
    const res2 = getTypeInfo('MountingFacility');
    const elapsed = performance.now() - start;

    expect(res2.type).toBe(res1.type);
    expect(elapsed).toBeLessThan(5);
  });

  it('does not hijack generic Player query with REDengine class and matches MpPlayer', () => {
    const result = getTypeInfo('Player');
    expect(result.type).toBeUndefined();
    expect(result.matches.some((m) => m.name === 'MpPlayer')).toBe(true);
    expect(result.formattedText).toContain('MpPlayer');
  });

  it('does not hijack generic Vehicle query with REDengine class and matches MpVehicle', () => {
    const result = getTypeInfo('Vehicle');
    expect(result.type).toBeUndefined();
    expect(result.matches.some((m) => m.name === 'MpVehicle')).toBe(true);
    expect(result.formattedText).toContain('MpVehicle');
  });

  it('does not resolve client REDengine classes when environment filter is server', () => {
    const result = getTypeInfo('TeleportationFacility', 'server');
    expect(result.type).toBeUndefined();
  });
});

describe('Docs Search Engine', () => {
  it('searches docs for rpc and returns guide results with code snippets', () => {
    const { results, formattedText } = searchDocs('rpc');
    expect(results.length).toBeGreaterThan(0);
    const rpcGuide = results.find((r) => r.slug.includes('rpc') || r.title.toLowerCase().includes('rpc'));
    expect(rpcGuide).toBeDefined();
    expect(rpcGuide?.url).toMatch(/https:\/\/docs\.cyber\.mp\/guides\/|skills\/cybermp-dev\/references\//);
    expect(formattedText).toContain(rpcGuide?.title);
  });

  it('searches docs and retrieves offline reference guides from skills/cybermp-dev/references', () => {
    const { results, formattedText } = searchDocs('vehicles physics');
    expect(results.length).toBeGreaterThan(0);
    const refGuide = results.find((r) => r.slug.startsWith('references/vehicles'));
    expect(refGuide).toBeDefined();
    expect(refGuide?.url).toBe('skills/cybermp-dev/references/vehicles-physics.md');
    expect(formattedText).toContain('Vehicles & Physics Reference');
  });

  it('searches docs for cef and returns UI guides', () => {
    const { results, formattedText } = searchDocs('cef');
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.slug.includes('cef') || r.title.toLowerCase().includes('cef'))).toBe(true);
    expect(formattedText).toContain('cef');
  });

  it('searches docs for live reload and metadata', () => {
    const hotreload = searchDocs('live reload');
    expect(hotreload.results.length).toBeGreaterThan(0);
    expect(hotreload.results.some((r) => r.slug.includes('hotreload') || r.plainText.toLowerCase().includes('reload'))).toBe(true);

    const meta = searchDocs('metadata');
    expect(meta.results.length).toBeGreaterThan(0);
    expect(meta.results.some((r) => r.slug.includes('meta'))).toBe(true);
  });

  it('respects custom result limit', () => {
    const { results } = searchDocs('server', 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });
});
