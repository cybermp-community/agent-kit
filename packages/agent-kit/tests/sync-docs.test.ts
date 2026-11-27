import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanMdxContent, extractDocMetadata, syncDocs } from '../scripts/sync-docs';

describe('Doc Sync Parser', () => {
  it('strips JSX tags and extracts code blocks cleanly', () => {
    const rawMdx = `---
title: Live updates
description: Fast iteration
---
import { Steps } from '@astrojs/starlight/components';

# Live Updates
<Steps>
1. Modify script:
\`\`\`js
console.log('updated');
\`\`\`
</Steps>`;

    const { title, description } = extractDocMetadata(rawMdx);
    expect(title).toBe('Live updates');
    expect(description).toBe('Fast iteration');

    const cleaned = cleanMdxContent(rawMdx);
    expect(cleaned).not.toContain('<Steps>');
    expect(cleaned).not.toContain('import { Steps }');
    expect(cleaned).toContain("console.log('updated');");
  });

  it('converts TabItem tags to markdown headers and removes container Tabs', () => {
    const rawMdx = `import { Tabs, TabItem } from '@astrojs/starlight/components';

<Tabs syncKey="execute-method">
  <TabItem label="Docker">
    Pull the latest server image:
    \`\`\`shell
    docker pull ghcr.io/cyber-mp/server:latest
    \`\`\`
  </TabItem>
  <TabItem label="Binary">
    Download the binary archive.
  </TabItem>
</Tabs>`;

    const cleaned = cleanMdxContent(rawMdx);
    expect(cleaned).not.toContain('<Tabs');
    expect(cleaned).not.toContain('</Tabs>');
    expect(cleaned).not.toContain('</TabItem>');
    expect(cleaned).toContain('#### Docker:');
    expect(cleaned).toContain('#### Binary:');
    expect(cleaned).toContain('docker pull ghcr.io/cyber-mp/server:latest');
    expect(cleaned).toContain('Download the binary archive.');
  });

  it('strips FileTree and other Starlight JSX components and comments', () => {
    const rawMdx = `{/* Commented out block */}
import { FileTree } from '@astrojs/starlight/components';

<FileTree>
- resources
  - server.toml
</FileTree>`;

    const cleaned = cleanMdxContent(rawMdx);
    expect(cleaned).not.toContain('Commented out block');
    expect(cleaned).not.toContain('<FileTree>');
    expect(cleaned).not.toContain('</FileTree>');
    expect(cleaned).toContain('- resources');
    expect(cleaned).toContain('- server.toml');
  });

  it('preserves unindented import statements inside code blocks while stripping outer imports', () => {
    const rawMdx = `import { Steps } from '@astrojs/starlight/components';
import CustomCard from '../components/CustomCard.astro';

# TypeScript Server Guide

Here is an example server script:

\`\`\`ts
import type { PlayerPuppet } from '@cybermp/client-types/game';
import { events } from '@cybermp/server';

events.on('init', () => {
  console.log('Server started');
});
\`\`\`

Another block:
\`\`\`javascript
import fs from 'node:fs';
\`\`\``;

    const cleaned = cleanMdxContent(rawMdx);
    expect(cleaned).not.toContain("from '@astrojs/starlight/components'");
    expect(cleaned).not.toContain("from '../components/CustomCard.astro'");
    expect(cleaned).toContain("import type { PlayerPuppet } from '@cybermp/client-types/game';");
    expect(cleaned).toContain("import { events } from '@cybermp/server';");
    expect(cleaned).toContain("import fs from 'node:fs';");
  });

  it('handles metadata extraction with quotes and fallbacks', () => {
    const quoted = `---
title: "Quoted Title"
description: 'Single Quoted Description'
---`;
    const empty = `---
---`;

    const metaQuoted = extractDocMetadata(quoted);
    expect(metaQuoted.title).toBe('Quoted Title');
    expect(metaQuoted.description).toBe('Single Quoted Description');

    const metaEmpty = extractDocMetadata(empty);
    expect(metaEmpty.title).toBe('Untitled');
    expect(metaEmpty.description).toBe('');
  });
});

describe('Doc Sync Runner', () => {
  const testTmpDir = path.resolve(__dirname, '../tmp/test-docs');
  const testFixturesDir = path.resolve(__dirname, '../tmp/test-fixtures');

  beforeEach(() => {
    fs.rmSync(testTmpDir, { recursive: true, force: true });
    fs.rmSync(testFixturesDir, { recursive: true, force: true });
    fs.mkdirSync(testFixturesDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testTmpDir, { recursive: true, force: true });
    fs.rmSync(testFixturesDir, { recursive: true, force: true });
  });

  it('syncs docs from a local directory, normalizes extensions to .md, and cleans content', async () => {
    // Create dummy mdx guide in fixtures
    const nestedDir = path.join(testFixturesDir, 'server');
    fs.mkdirSync(nestedDir, { recursive: true });
    fs.writeFileSync(
      path.join(nestedDir, 'commands.mdx'),
      `---
title: Commands
description: Server commands guide
---
import { Steps } from '@astrojs/starlight/components';

# Commands
<Steps>
1. Register command
</Steps>`
    );

    const synced = await syncDocs({
      sourceDir: testFixturesDir,
      targetDir: testTmpDir,
    });

    expect(synced.length).toBe(1);
    const expectedOutFile = path.join(testTmpDir, 'server/commands.md');
    expect(fs.existsSync(expectedOutFile)).toBe(true);

    const outContent = fs.readFileSync(expectedOutFile, 'utf-8');
    expect(outContent).not.toContain('<Steps>');
    expect(outContent).toContain('# Commands');
    expect(outContent).toContain('1. Register command');
  });

  it('syncs real guides from local CyberMP-Docs directory if present', async () => {
    const realGuidesDir =
      process.env.CYBERMP_DOCS_DIR ||
      path.resolve(__dirname, '../../../CyberMP-Docs/src/content/docs/guides');
    if (!fs.existsSync(realGuidesDir)) {
      return; // Skip if directory absent
    }

    const synced = await syncDocs({
      sourceDir: realGuidesDir,
      targetDir: testTmpDir,
    });

    expect(synced.length).toBeGreaterThan(5);
    expect(fs.existsSync(path.join(testTmpDir, 'getting-started.md'))).toBe(true);
    expect(fs.existsSync(path.join(testTmpDir, 'resources/live-updates.md'))).toBe(true);
  });

  it('keeps the previous snapshot when a pinned fetch is partial', async () => {
    fs.mkdirSync(testTmpDir, { recursive: true });
    const sentinel = path.join(testTmpDir, 'existing.md');
    fs.writeFileSync(sentinel, 'previous');
    const originalFetch = global.fetch;
    const urls: string[] = [];
    global.fetch = async (url) => {
      urls.push(String(url));
      return String(url).endsWith('getting-started.mdx')
        ? new Response('---\ntitle: Test\n---\n# Fetched')
        : new Response('', { status: 404 });
    };
    try {
      await expect(syncDocs({
        forceRemote: true,
        targetDir: testTmpDir,
        expectedFiles: ['getting-started.mdx', 'missing.mdx'],
      })).rejects.toThrow(/missing\.mdx/);
      expect(fs.readdirSync(testTmpDir)).toEqual(['existing.md']);
      expect(fs.readFileSync(sentinel, 'utf8')).toBe('previous');
      expect(urls.every((url) => url.includes('/909c0c08d7810ad136ab8b0ff2b8e0b4fdc6d569/'))).toBe(true);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('exits nonzero when an explicit source is missing', () => {
    const run = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/sync-docs.ts', '--local', testFixturesDir + '-missing']);
    expect(run.status).toBe(1);
    expect(run.stderr.toString()).toContain(testFixturesDir + '-missing');
  });
});
