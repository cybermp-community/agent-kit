import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { getDefaultEnvironment, StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = fileURLToPath(new URL('../', import.meta.url));

function pack(destination: string): string {
  const packageManager = process.env.npm_execpath || 'pnpm';
  const args = ['pack', '--pack-destination', destination];
  const isScript = /\.[cm]?js$/i.test(packageManager);
  return execFileSync(isScript ? process.execPath : packageManager,
    isScript ? [packageManager, ...args] : args,
    { cwd: root, encoding: 'utf8' }).trim().split('\n').at(-1)!;
}

it('serves the installed package with the locked production dependencies', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'cybermp-pack-'));
  try {
    const tarball = process.env.CYBERMP_AUDIT_TARBALL
      || pack(temp);
    execFileSync('tar', ['-xzf', tarball, '-C', temp]);
    const installed = path.join(temp, 'package');
    const metadata = JSON.parse(fs.readFileSync(path.join(installed, 'package.json'), 'utf8'));
    for (const name of Object.keys(metadata.dependencies)) {
      const target = path.join(installed, 'node_modules', name);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.symlinkSync(fs.realpathSync(path.join(root, 'node_modules', name)), target, 'junction');
    }
    expect(fs.existsSync(path.join(installed, 'node_modules/@cybermp/client-types'))).toBe(false);
    // Every shipped runtime asset lives in the CLI package, not at the repository root
    const packedFiles = execFileSync('tar', ['-tzf', tarball], { encoding: 'utf8' }).split('\n');
    for (const asset of ['data', 'docs/live-server.md', 'plugins', 'rules', 'skills', 'templates']) {
      expect(
        packedFiles.some((file) => file === `package/${asset}` || file.startsWith(`package/${asset}/`)),
        asset,
      ).toBe(true);
    }
    // The staged resource keeps a plain, exact bridge version rather than workspace:*
    const resourceManifest = JSON.parse(execFileSync(
      'tar', ['-xzf', tarball, '-O', 'package/resources/mcp-bridge/package.json'], { encoding: 'utf8' },
    ));
    const bridgeVersion = JSON.parse(
      fs.readFileSync(path.join(root, '../bridge/package.json'), 'utf8'),
    ).version;
    expect(resourceManifest.dependencies['cybermp-agent-kit-bridge']).toBe(bridgeVersion);
    // The resource template `init --bridge` copies ships in the tarball, without build leftovers
    for (const file of ['resource.toml', 'package.json', 'tsconfig.json', 'src/index.ts', 'src/env.ts', 'README.md']) {
      expect(packedFiles, file).toContain(`package/resources/mcp-bridge/${file}`);
    }
    expect(packedFiles.filter((file) => /resources\/mcp-bridge\/node_modules\//.test(file))).toEqual([]);
    // The installed package resolves its own root, #imports and public exports
    const consumer = path.join(temp, 'consumer');
    fs.mkdirSync(path.join(consumer, 'node_modules'), { recursive: true });
    fs.symlinkSync(installed, path.join(consumer, 'node_modules', metadata.name), 'junction');
    const probe = execFileSync(process.execPath, ['--input-type=module', '-e', `
      const { getPackageRoot } = await import(${JSON.stringify(pathToFileURL(path.join(installed, 'dist/src/cli/init.js')).href)});
      const { packageVersion } = await import(${JSON.stringify(pathToFileURL(path.join(installed, 'dist/src/version.js')).href)});
      const { getTypeInfo } = await import(${JSON.stringify(pathToFileURL(path.join(installed, 'dist/src/engine/types-engine.js')).href)});
      const root = await import(${JSON.stringify(metadata.name)});
      const client = await import(${JSON.stringify(`${metadata.name}/client`)});
      console.log(JSON.stringify({
        packageRoot: getPackageRoot(),
        version: packageVersion,
        nativeType: getTypeInfo('inkCircleWidget', 'client').type?.name ?? null,
        clientExports: Object.keys(client).sort(),
        rootExport: typeof root.callBridge,
      }));
    `], { cwd: consumer, encoding: 'utf8' });
    const resolved = JSON.parse(probe.trim().split('\n').at(-1)!);
    expect(resolved.packageRoot).toBe(fs.realpathSync(installed));
    expect(resolved.version).toBe(metadata.version);
    expect(resolved.nativeType).toBe('inkCircleWidget');
    expect(resolved.clientExports).toContain('callBridge');
    expect(resolved.rootExport).toBe('function');
    // `init --bridge` from the installed package sets up a fresh server project
    const project = path.join(temp, 'project');
    fs.mkdirSync(project);
    execFileSync(process.execPath, [
      path.join(installed, metadata.bin['cybermp-agent-kit']),
      'init', '--bridge', '--yes', '--no-skill', '--editors', 'claude',
    ], { cwd: project, encoding: 'utf8' });
    expect(fs.existsSync(path.join(project, 'resources/mcp-bridge/resource.toml'))).toBe(true);
    expect(fs.readFileSync(path.join(project, 'resources/mcp-bridge/src/index.ts'), 'utf8'))
      .toContain("from 'cybermp-agent-kit-bridge'");
    expect(fs.existsSync(path.join(project, 'resources/mcp-bridge/dist'))).toBe(false);
    expect(fs.readFileSync(path.join(project, '.env'), 'utf8')).toMatch(/^DEVTOOLS_TOKEN=[0-9a-f]{48}$/m);
    expect(fs.readFileSync(path.join(project, '.gitignore'), 'utf8')).toBe('.env\n');
    expect(fs.readFileSync(path.join(project, '.mcp.json'), 'utf8')).not.toContain('DEVTOOLS_TOKEN');
    const foreign = path.join(temp, 'foreign');
    const foreignTypes = path.join(foreign, 'node_modules/@cybermp/client-types/out');
    fs.mkdirSync(foreignTypes, { recursive: true });
    fs.writeFileSync(path.join(foreignTypes, 'game.d.ts'), 'export class inkCircleWidget { wrong: boolean; }\n');

    const times: number[] = [];
    const nativeAnswers: string[] = [];
    for (const cwd of [temp, foreign, temp, foreign, temp]) {
      const client = new Client({ name: 'packed-mcp-tests', version: '1.0.0' });
      const start = performance.now();
      await client.connect(new StdioClientTransport({
        command: process.execPath,
        args: [path.join(installed, metadata.bin['cybermp-agent-kit'])],
        cwd,
      }));
      times.push(performance.now() - start);
      try {
        const result = await client.callTool({
          name: 'cybermp_get_type', arguments: { name: 'inkCircleWidget', env: 'client' },
        });
        const blocks = result.content as Array<{ type: string; text: string }>;
        nativeAnswers.push(blocks.map((block) => block.text).join('\n'));
      } finally {
        await client.close();
      }
    }
    times.sort((a, b) => a - b);
    console.log(`Tarball: ${fs.statSync(tarball).size} bytes. MCP initialization median: ${times[2].toFixed(1)} ms.`);
    const client = new Client({ name: 'packed-mcp-contract', version: '1.0.0' });
    await client.connect(new StdioClientTransport({
      command: process.execPath,
      args: [path.join(installed, metadata.bin['cybermp-agent-kit'])],
      cwd: temp,
    }));
    try {
      expect(client.getServerVersion()?.version).toBe(metadata.version);
      expect((await client.listTools()).tools.map((tool) => tool.name).sort()).toEqual([
        'cybermp_get_event', 'cybermp_get_rpc_flow', 'cybermp_get_type',
        'cybermp_lookup_tweakdb', 'cybermp_search_docs',
      ]);
      const result = await client.callTool({
        name: 'cybermp_get_type', arguments: { name: 'MpCef', env: 'server' },
      });
      expect(JSON.stringify(result.content)).not.toContain('Type: MpCef');
      for (const query of [
        'minimap', 'zone', 'polygon', 'AddBlipForArea', 'AddBlipForCoord',
        'SetTintColor', 'зона миникарты', 'world map polygon',
      ]) {
        const response = await client.callTool({
          name: 'cybermp_search_docs', arguments: { query, limit: 1 },
        });
        const answer = (response.content as Array<{ text: string }>)[0].text;
        expect(answer, query).toContain('INK HUD and minimap');
        expect(answer, query).toContain('point marker');
        expect(answer, query).toContain('world map');
        expect(answer, query).toContain('server geometry');
        expect(answer, query).toContain('SetTintColor');
      }
      for (const query of ['archive', 'WolvenKit', 'ArchiveXL']) {
        const response = await client.callTool({
          name: 'cybermp_search_docs', arguments: { query, limit: 1 },
        });
        const answer = (response.content as Array<{ text: string }>)[0].text;
        expect(answer, query).toContain('Build and load an archive prop');
        expect(answer, query).toContain('resource.toml');
        expect(answer, query).toContain('WolvenKit');
        expect(answer, query).toContain('ArchiveXL');
      }
      for (const query of ['archive compatibility', 'mod dependencies', 'CET Lua', 'совместимость модов']) {
        const response = await client.callTool({
          name: 'cybermp_search_docs', arguments: { query, limit: 1 },
        });
        const answer = (response.content as Array<{ text: string }>)[0].text;
        expect(answer, query).toContain('CyberMP archive mod compatibility');
        expect(answer, query).toContain('file delivery, engine loading, local behavior and multiplayer replication');
      }
      const luaEvents = await client.callTool({
        name: 'cybermp_search_docs', arguments: { query: 'mp.events.add', limit: 1 },
      });
      const luaText = (luaEvents.content as Array<{ text: string }>)[0].text;
      expect(luaText).toContain('CyberMP Lua events and runtime');
      expect(luaText).toContain('mp.events.on for local events in CyberMP JavaScript and TypeScript');
      expect(luaText).not.toContain('is from RAGEMP');
      for (const [query, heading, detail] of [
        ['resource.toml', 'Resource Manifest', 'client_script'],
        ['core.files', 'Core file delivery', 'cybermp_core/files/'],
      ]) {
        const response = await client.callTool({
          name: 'cybermp_search_docs', arguments: { query, limit: 1 },
        });
        const answer = (response.content as Array<{ text: string }>)[0].text;
        expect(answer, query).toContain(heading);
        expect(answer, query).toContain(detail);
      }
      const referenceId = 'Vehicle.v_sport2_porsche_911turbo_player';
      const vehicle = await client.callTool({
        name: 'cybermp_lookup_tweakdb', arguments: { query: referenceId, category: 'vehicles', limit: 1 },
      });
      const vehicleText = (vehicle.content as Array<{ text: string }>)[0].text;
      expect(vehicleText).toContain(referenceId);
      expect(vehicleText).toContain('Exact record name in WolvenKit index');
      const nativeBridge = await client.callTool({
        name: 'cybermp_search_docs', arguments: { query: 'Working with Game Natives', limit: 1 },
      });
      const nativeBridgeText = (nativeBridge.content as Array<{ text: string }>)[0].text;
      expect(nativeBridgeText).toContain('CyberMP native bridge');
      expect(nativeBridgeText).toContain('use_game_natives = true');
      expect(nativeBridgeText).toContain('Game.GetPlayer()');
      expect(nativeBridgeText).toContain('https://docs.cyber.mp/reference/client/working-with-game-natives/');
      const cefReadiness = await client.callTool({
        name: 'cybermp_search_docs', arguments: { query: 'ui:ready' },
      });
      const cefText = (cefReadiness.content as Array<{ text: string }>)[0].text;
      expect(cefText).toContain("mp.events.onCef('ui:ready'");
      expect(cefText).toContain("mp.events.emit('ui:ready')");
      expect(cefText).toContain('Example environment:** browser');
      expect(cefText).toContain('Example environment:** client');
      expect(cefText).toContain('Type-checked against @cybermp/browser-types@2.0.1');
      const camera = await client.callTool({
        name: 'cybermp_search_docs', arguments: { query: 'simple_free_camera.ent', limit: 1 },
      });
      const cameraText = (camera.content as Array<{ text: string }>)[0].text;
      expect(cameraText).toContain('polls for the entity with a deadline');
      const interior = await client.callTool({
        name: 'cybermp_search_docs', arguments: { query: 'interior streaming', limit: 1 },
      });
      const interiorText = (interior.content as Array<{ text: string }>)[0].text;
      expect(interiorText).toContain('collision-readiness signal');
      expect(interiorText).not.toContain('enterInteriorSafely');
      for (const [query, expected] of [
        ['coordinate teleportation', ['close', 'GetPlayerObject()', 'puppet.GetMountedVehicle()']],
        ['health max health god mode', ['perc argument', 'units of the current value']],
        ['EquipCyberwareByTDBID', ['takes a PlayerPuppet', 'equipmentSystem.EquipCyberwareByTDBID(player, itemKey)']],
        ['door manipulation helper', ['state.IsSealed()', 'door.OpenDoor()', 'door.CloseDoor()']],
        ['PlayInDeviceSimple', ['GetPlayerObject()', 'system.PlayInDeviceSimple(device, actor']],
        ['speedometer cef bridge', ['vehicle.GetCurrentSpeed()', 'kmh: null', 'RPM and gear require']],
        ['controlling doors hood and trunk', ['vehicle.GetVehiclePS()?.GetVehicleControllerPS()', 'controller.SetDoorState']],
        ['TrackMappin', ['Environment:** client', "typeof system?.TrackMappin !== 'function'"]],
        ['GetSlotTransform', ['success flag', 'if (found) return']],
        ['SendInputHintData', ['Interaction Point Probe', 'after world load', 'remove the point, hint and timer']],
        ['authoritative server damage protection', ['Environment:** server', 'data.victimId', 'mp.cancelEvent() synchronously']],
        ['cross-resource exports pipeline', ['@cybermp/server-types@3.2.8', 'has no MpServer.exports member']],
      ] as const) {
        const response = await client.callTool({
          name: 'cybermp_search_docs', arguments: { query, limit: 1 },
        });
        const answer = (response.content as Array<{ text: string }>)[0].text;
        for (const text of expected) expect(answer, query).toContain(text);
      }
      for (const [name, env, signature, method] of [
        ['vehicleStreamIn', 'client', 'vehicleStreamIn(netID: number, gameID: number)', 'mp.events.on'],
        ['playerConnecting', 'server', 'playerConnecting(tempId: number, name: string)', 'mp.events.on'],
        ['resourceStart', 'client', 'resourceStart(): void', 'mp.events.on'],
        ['domReady', 'client', 'domReady(name: string)', 'mp.events.onCef'],
      ]) {
        const event = await client.callTool({ name: 'cybermp_get_event', arguments: { name, env } });
        const docs = await client.callTool({ name: 'cybermp_search_docs', arguments: { query: name, limit: 10 } });
        const eventText = (event.content as Array<{ text: string }>)[0].text;
        const docsText = (docs.content as Array<{ text: string }>)[0].text;
        expect(eventText, name).toContain(signature);
        expect(eventText, name).toContain(`${method}('${name}'`);
        expect(docsText, name).toContain(signature);
        expect(docsText, name).not.toContain('vehicleStreamIn (vehicle: MpVehicle)');
        expect(docsText, name).not.toContain('resourceStart (name: string)');
      }
      const dropped = await client.callTool({
        name: 'cybermp_search_docs', arguments: { query: 'playerQuit' },
      });
      expect((dropped.content as Array<{ text: string }>)[0].text).not.toContain('playerQuit (player: MpPlayer)');
      const rpc = await client.callTool({
        name: 'cybermp_get_rpc_flow', arguments: { from: 'client', to: 'server' },
      });
      expect((rpc.content as Array<{ text: string }>)[0].text).toContain('player.nickname');
      const disputedId = await client.callTool({
        name: 'cybermp_lookup_tweakdb', arguments: { query: 'porsche', category: 'vehicles' },
      });
      const evidence = (disputedId.content as Array<{ text: string }>)[0].text;
      expect(evidence).toContain('ID needs recheck');
      expect(evidence).toContain('Candidate: `Vehicle.v_sport2_porsche_911turbo_player`');
      const quickhack = await client.callTool({
        name: 'cybermp_lookup_tweakdb', arguments: { query: 'Items.DisableCyberwareLvl4Program', category: 'quickhacks' },
      });
      const quickhackText = (quickhack.content as Array<{ text: string }>)[0].text;
      expect(quickhackText).toContain('Items.CyberwareMalfunctionLvl4Program');
      expect(quickhackText).toContain('Candidate: `Items.DisableCyberwareLvl4Program`');
      for (const [category, query] of [
        ['ammo', 'Ammo.RifleAmmo'],
        ['cyberware', 'Items.AdvancedMantisBladesLegendaryPlus'],
        ['consumables', 'Items.HealthBooster'],
      ]) {
        const response = await client.callTool({
          name: 'cybermp_lookup_tweakdb', arguments: { category, query, limit: 1 },
        });
        const answer = (response.content as Array<{ text: string }>)[0].text;
        expect(answer, category).toContain(`\`${query}\``);
        expect(answer, category).toContain('Exact record name in WolvenKit index');
      }
      const workspot = await client.callTool({
        name: 'cybermp_lookup_tweakdb', arguments: { query: 'Workspot.SitChair' },
      });
      const workspotText = (workspot.content as Array<{ text: string }>)[0].text;
      expect(workspotText).toContain('Workspot search label');
      expect(workspotText).toContain('PlayInDeviceSimple');
    } finally {
      await client.close();
    }
    // Live features switch on by themselves next to a server's logs folder
    const serverRoot = path.join(temp, 'server');
    fs.mkdirSync(path.join(serverRoot, 'logs'), { recursive: true });
    fs.writeFileSync(path.join(serverRoot, 'logs/server_1.log'), 'boot\nERROR packed check\n');
    const live = new Client({ name: 'packed-mcp-live', version: '1.0.0' });
    await live.connect(new StdioClientTransport({
      command: process.execPath,
      args: [path.join(installed, metadata.bin['cybermp-agent-kit'])],
      cwd: temp,
      env: { ...getDefaultEnvironment(), CYBERMP_ROOT: serverRoot },
    }));
    try {
      const names = (await live.listTools()).tools.map((tool) => tool.name);
      expect(names).toEqual(expect.arrayContaining(['server_status', 'list_server_logs', 'read_server_log']));
      const log = await live.callTool({ name: 'read_server_log', arguments: { filter: 'error' } });
      expect((log.content as Array<{ text: string }>)[0].text).toContain('ERROR packed check');
    } finally {
      await live.close();
    }
    expect(new Set(nativeAnswers).size).toBe(1);
    expect(nativeAnswers[0]).toContain('segmentsNumber');
    expect(nativeAnswers[0]).toContain('@cybermp/client-types@');
    expect(nativeAnswers[0].match(/^\s+SetTintColor\(/gm)).toHaveLength(3);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}, 30_000);
