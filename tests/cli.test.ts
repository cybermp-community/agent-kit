import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getConfigSnippet } from '../src/cli/print-config.js';
import { initProject } from '../src/cli/init.js';

describe('CLI Config Generator', () => {
  it('returns valid JSON snippet for Cursor and Claude', () => {
    const cursorConfig = getConfigSnippet('cursor');
    expect(cursorConfig).toContain('"command": "npx"');
    expect(cursorConfig).toContain('"cybermp-mcp"');
    const parsedCursor = JSON.parse(cursorConfig);
    expect(parsedCursor.mcpServers.cybermp).toBeDefined();

    const claudeConfig = getConfigSnippet('claude');
    expect(claudeConfig).toContain('"command": "npx"');
    expect(claudeConfig).toContain('"cybermp-mcp"');
    const parsedClaude = JSON.parse(claudeConfig);
    expect(parsedClaude.mcpServers.cybermp).toBeDefined();
  });

  it('supports all target platforms: antigravity, cline, windsurf, zed, all', () => {
    const antigravity = getConfigSnippet('antigravity');
    expect(antigravity).toContain('"cybermp"');
    const parsedAntigravity = JSON.parse(antigravity);
    expect(parsedAntigravity.mcpServers.cybermp).toBeDefined();

    const cline = getConfigSnippet('cline');
    expect(cline).toContain('"cybermp"');
    const parsedCline = JSON.parse(cline);
    expect(parsedCline.mcpServers.cybermp).toBeDefined();

    const windsurf = getConfigSnippet('windsurf');
    expect(windsurf).toContain('"cybermp"');
    const parsedWindsurf = JSON.parse(windsurf);
    expect(parsedWindsurf.mcpServers.cybermp).toBeDefined();

    const zed = getConfigSnippet('zed');
    expect(zed).toContain('"cybermp"');
    const parsedZed = JSON.parse(zed);
    expect(parsedZed.context_servers).toBeDefined();

    const all = getConfigSnippet('all');
    const parsedAll = JSON.parse(all);
    expect(parsedAll.cursor).toBeDefined();
    expect(parsedAll.claude).toBeDefined();
    expect(parsedAll.antigravity).toBeDefined();
    expect(parsedAll.cline).toBeDefined();
    expect(parsedAll.windsurf).toBeDefined();
    expect(parsedAll.zed).toBeDefined();
  });

  it('normalizes target name case and whitespace', () => {
    const cursorUpper = getConfigSnippet('  CURSOR  ');
    expect(cursorUpper).toContain('"cybermp"');
    const zedMixed = getConfigSnippet('ZeD');
    expect(zedMixed).toContain('"cybermp"');
  });

  it('throws for unsupported target editor', () => {
    expect(() => getConfigSnippet('unknown-editor')).toThrow(/Unknown target editor/i);
  });
});

describe('Templates & Rules Files', () => {
  const rootDir = process.cwd();

  it('has all required template and rule files', () => {
    const files = [
      'templates/cursor.mdc',
      'templates/claude.md',
      'templates/antigravity.md',
      'templates/clinerules.md',
      'templates/universal.md',
      'rules/cybermp.md',
    ];

    for (const file of files) {
      const fullPath = path.join(rootDir, file);
      expect(fs.existsSync(fullPath), `Expected ${file} to exist`).toBe(true);
      const content = fs.readFileSync(fullPath, 'utf-8');
      expect(content.length).toBeGreaterThan(100);
      expect(content).toMatch(/CyberMP/i);
      expect(content).toMatch(/Anti-Hallucination|Prohibited/i);
    }
  });

  it('verifies rules/cybermp.md matches antigravity rule template', () => {
    const antigravityTemplate = fs.readFileSync(path.join(rootDir, 'templates/antigravity.md'), 'utf-8');
    const cybermpRule = fs.readFileSync(path.join(rootDir, 'rules/cybermp.md'), 'utf-8');
    expect(cybermpRule.trim()).toBe(antigravityTemplate.trim());
  });
});

describe('CLI Init Wizard', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cybermp-init-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('initializes Cursor configuration and rules without existing files', async () => {
    await initProject({
      cwd: tempDir,
      editors: ['cursor'],
      nonInteractive: true,
    });

    const mdcPath = path.join(tempDir, '.cursor/rules/cybermp.mdc');
    const mcpPath = path.join(tempDir, '.cursor/mcp.json');

    expect(fs.existsSync(mdcPath)).toBe(true);
    expect(fs.existsSync(mcpPath)).toBe(true);

    const mdcContent = fs.readFileSync(mdcPath, 'utf-8');
    expect(mdcContent).toContain('CyberMP');
    expect(mdcContent).toContain('anti-hallucination');

    const mcpContent = JSON.parse(fs.readFileSync(mcpPath, 'utf-8'));
    expect(mcpContent.mcpServers.cybermp).toBeDefined();
    expect(mcpContent.mcpServers.cybermp.command).toBe('npx');
  });

  it('merges with existing MCP configuration without corrupting existing entries', async () => {
    const cursorDir = path.join(tempDir, '.cursor');
    fs.mkdirSync(cursorDir, { recursive: true });
    const existingMcp = {
      mcpServers: {
        'existing-server': {
          command: 'node',
          args: ['./custom.js'],
          env: { KEY: 'VALUE' },
        },
      },
      customField: 'preserved',
    };
    fs.writeFileSync(path.join(cursorDir, 'mcp.json'), JSON.stringify(existingMcp, null, 2));

    await initProject({
      cwd: tempDir,
      editors: ['cursor'],
      nonInteractive: true,
    });

    const updatedMcp = JSON.parse(fs.readFileSync(path.join(cursorDir, 'mcp.json'), 'utf-8'));
    expect(updatedMcp.customField).toBe('preserved');
    expect(updatedMcp.mcpServers['existing-server']).toBeDefined();
    expect(updatedMcp.mcpServers['existing-server'].env.KEY).toBe('VALUE');
    expect(updatedMcp.mcpServers.cybermp).toBeDefined();
  });

  it('configures Claude, Antigravity, Cline, Windsurf, and Zed', async () => {
    await initProject({
      cwd: tempDir,
      editors: ['claude', 'antigravity', 'cline', 'windsurf', 'zed'],
      copySkill: true,
      nonInteractive: true,
    });

    // Claude
    expect(fs.existsSync(path.join(tempDir, 'CLAUDE.md'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, '.mcp.json'))).toBe(true);

    // Antigravity
    expect(fs.existsSync(path.join(tempDir, '.agents/rules/cybermp.md'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'mcp_config.json'))).toBe(true);

    // Copied Skill
    const skillPath = path.join(tempDir, '.agents/skills/cybermp-dev/SKILL.md');
    expect(fs.existsSync(skillPath)).toBe(true);
    const skillContent = fs.readFileSync(skillPath, 'utf-8');
    expect(skillContent).toContain('name: cybermp-dev');

    // Cline
    expect(fs.existsSync(path.join(tempDir, '.clinerules'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, '.cline/mcp_settings.json'))).toBe(true);

    // Windsurf
    expect(fs.existsSync(path.join(tempDir, '.windsurfrules'))).toBe(true);

    // Zed
    const zedSettingsPath = path.join(tempDir, '.zed/settings.json');
    expect(fs.existsSync(zedSettingsPath)).toBe(true);
    const zedSettings = JSON.parse(fs.readFileSync(zedSettingsPath, 'utf-8'));
    expect(zedSettings.context_servers.cybermp).toBeDefined();
  });
});
