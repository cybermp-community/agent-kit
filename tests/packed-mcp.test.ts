import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = fileURLToPath(new URL('../', import.meta.url));

it('serves the installed package with the locked production dependencies', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'cybermp-pack-'));
  try {
    const tarball = process.env.CYBERMP_AUDIT_TARBALL
      || execFileSync('pnpm', ['pack', '--pack-destination', temp], { cwd: root, encoding: 'utf8' }).trim().split('\n').at(-1)!;
    execFileSync('tar', ['-xzf', tarball, '-C', temp]);
    const installed = path.join(temp, 'package');
    const metadata = JSON.parse(fs.readFileSync(path.join(installed, 'package.json'), 'utf8'));
    for (const name of Object.keys(metadata.dependencies)) {
      const target = path.join(installed, 'node_modules', name);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.symlinkSync(fs.realpathSync(path.join(root, 'node_modules', name)), target, 'junction');
    }
    expect(fs.existsSync(path.join(installed, 'node_modules/@cybermp/client-types'))).toBe(false);
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
      const cefReadiness = await client.callTool({
        name: 'cybermp_search_docs', arguments: { query: 'ui:ready' },
      });
      const cefText = (cefReadiness.content as Array<{ text: string }>)[0].text;
      expect(cefText).toContain("mp.events.onCef('ui:ready'");
      expect(cefText).toContain("mp.events.emit('ui:ready')");
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
    } finally {
      await client.close();
    }
    expect(new Set(nativeAnswers).size).toBe(1);
    expect(nativeAnswers[0]).toContain('segmentsNumber');
    expect(nativeAnswers[0]).toContain('@cybermp/client-types@');
    expect(nativeAnswers[0].match(/^\s+SetTintColor\(/gm)).toHaveLength(3);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}, 30_000);
