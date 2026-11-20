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
