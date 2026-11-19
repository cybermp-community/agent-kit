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

  it('syncs real guides from /Users/user/CyberMP-Docs if present', async () => {
    const realGuidesDir = '/Users/user/CyberMP-Docs/src/content/docs/guides';
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

  it('falls back to raw GitHub fetch when local docs are absent and git clone fails', async () => {
    const originalFetch = global.fetch;
    const mockMdx = `---
title: Remote Guide
description: Fetched remotely
---
import { Tabs } from '@astrojs/starlight/components';

# Remote Guide Content
<Tabs>
Tab Content
</Tabs>`;

    global.fetch = async (url: string | URL | Request) => {
      if (url.toString().includes('getting-started.mdx')) {
        return {
          ok: true,
          text: async () => mockMdx,
        } as unknown as Response;
      }
      return { ok: false, status: 404 } as unknown as Response;
    };

    try {
      const synced = await syncDocs({
        forceRemote: true,
        remoteUrl: 'file:///nonexistent-git-repo',
        targetDir: testTmpDir,
      });

      expect(synced).toContain('getting-started.md');
      const savedFile = path.join(testTmpDir, 'getting-started.md');
      expect(fs.existsSync(savedFile)).toBe(true);
      const content = fs.readFileSync(savedFile, 'utf-8');
      expect(content).not.toContain('<Tabs>');
      expect(content).toContain('# Remote Guide Content');
    } finally {
      global.fetch = originalFetch;
    }
  });
});
