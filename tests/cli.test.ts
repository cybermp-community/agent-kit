import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getConfigSnippet, getEditorSnippets } from '../src/cli/print-config.js';
import { initProject, resolveMcpServerCommand } from '../src/cli/init.js';

describe('CLI Config Generator', () => {
  it('returns valid JSON snippet for Cursor and Claude', () => {
    const cursorConfig = getConfigSnippet('cursor', { isWindows: false });
    expect(cursorConfig).toContain('"command": "npx"');
    expect(cursorConfig).toContain('"cybermp-agent-kit"');
    const parsedCursor = JSON.parse(cursorConfig);
    expect(parsedCursor.mcpServers.cybermp).toBeDefined();

    const claudeConfig = getConfigSnippet('claude', { isWindows: false });
    expect(claudeConfig).toContain('"command": "npx"');
    expect(claudeConfig).toContain('"cybermp-agent-kit"');
    const parsedClaude = JSON.parse(claudeConfig);
    expect(parsedClaude.mcpServers.cybermp).toBeDefined();
  });

  it('supports Windows platform override with npx.cmd', () => {
    const winConfig = getConfigSnippet('cursor', { isWindows: true });
    expect(winConfig).toContain('"command": "npx.cmd"');
    const parsed = JSON.parse(winConfig);
    expect(parsed.mcpServers.cybermp.command).toBe('npx.cmd');

    const winSnippets = getEditorSnippets(true);
    expect((winSnippets.antigravity as any).mcpServers.cybermp.command).toBe('npx.cmd');
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

describe('MCP Server Command Resolution', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cybermp-resolve-test-'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('resolves npx on Unix and npx.cmd on Windows when package is not local', () => {
    const unixCmd = resolveMcpServerCommand(tempDir, false);
    expect(unixCmd).toEqual({ command: 'npx', args: ['-y', 'cybermp-agent-kit'] });

    const winCmd = resolveMcpServerCommand(tempDir, true);
    expect(winCmd).toEqual({ command: 'npx.cmd', args: ['-y', 'cybermp-agent-kit'] });
  });

  it('resolves direct node execution when installed locally in node_modules', () => {
    const localCliPath = path.join(tempDir, 'node_modules/cybermp-agent-kit/dist/bin/cli.js');
    fs.mkdirSync(path.dirname(localCliPath), { recursive: true });
    fs.writeFileSync(localCliPath, '#!/usr/bin/env node\n', 'utf-8');

    const resolved = resolveMcpServerCommand(tempDir);
    expect(resolved.command).toBe('node');
    expect(resolved.args).toEqual(['./node_modules/cybermp-agent-kit/dist/bin/cli.js']);
  });
});

describe('CLI Init Wizard', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cybermp-init-test-'));
    vi.spyOn(os, 'homedir').mockReturnValue(path.join(tempDir, 'home'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('does not touch global Antigravity settings by default', async () => {
    await initProject({ cwd: tempDir, nonInteractive: true });

    expect(fs.existsSync(path.join(tempDir, '.agents/rules/cybermp.md'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'home/.gemini/config/mcp_config.json'))).toBe(false);
  });

  it.each(['', '{', 'null', '[]', '{"mcpServers": []}'])(
    'preserves invalid config %j even with force',
    async (original) => {
      const config = path.join(tempDir, '.cursor/mcp.json');
      fs.mkdirSync(path.dirname(config));
      fs.writeFileSync(config, original);
      await expect(initProject({
        cwd: tempDir, editors: ['cursor'], nonInteractive: true, force: true,
      })).rejects.toThrow(/mcp\.json/);
      expect(fs.readFileSync(config, 'utf8')).toBe(original);
    },
  );

  it('replaces only the existing CyberMP entry with force', async () => {
    const config = path.join(tempDir, '.cursor/mcp.json');
    fs.mkdirSync(path.dirname(config));
    const original = '{"mcpServers":{"cybermp":{"command":"custom"},"other":{"command":"other"}}}';
    fs.writeFileSync(config, original);
    const options = { cwd: tempDir, editors: ['cursor'], nonInteractive: true, isWindows: false };
    await initProject(options);
    expect(fs.readFileSync(config, 'utf8')).toBe(original);
    await initProject({ ...options, force: true });
    expect(JSON.parse(fs.readFileSync(config, 'utf8')).mcpServers).toMatchObject({
      cybermp: { command: 'npx' }, other: { command: 'other' },
    });
  });

  it('initializes Cursor configuration and rules without existing files', async () => {
    await initProject({
      cwd: tempDir,
      editors: ['cursor'],
      isWindows: false,
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
      isWindows: false,
      nonInteractive: true,
    });

    const updatedMcp = JSON.parse(fs.readFileSync(path.join(cursorDir, 'mcp.json'), 'utf-8'));
    expect(updatedMcp.customField).toBe('preserved');
    expect(updatedMcp.mcpServers['existing-server']).toBeDefined();
    expect(updatedMcp.mcpServers['existing-server'].env.KEY).toBe('VALUE');
    expect(updatedMcp.mcpServers.cybermp).toBeDefined();
  });

  it('configures Antigravity into global config directory and writes rule to .agents/rules/', async () => {
    const fakeGeminiConfig = path.join(tempDir, '.gemini/config');

    await initProject({
      cwd: tempDir,
      editors: ['antigravity'],
      geminiConfigDir: fakeGeminiConfig,
      isWindows: false,
      nonInteractive: true,
    });

    // Rule in project workspace
    expect(fs.existsSync(path.join(tempDir, '.agents/rules/cybermp.md'))).toBe(true);

    // Global MCP config updated
    const globalMcpPath = path.join(fakeGeminiConfig, 'mcp_config.json');
    expect(fs.existsSync(globalMcpPath)).toBe(true);
    const globalMcp = JSON.parse(fs.readFileSync(globalMcpPath, 'utf-8'));
    expect(globalMcp.mcpServers.cybermp).toBeDefined();
    expect(globalMcp.mcpServers.cybermp.command).toBe('npx');

    // Root mcp_config.json should NOT be created for antigravity
    expect(fs.existsSync(path.join(tempDir, 'mcp_config.json'))).toBe(false);
  });

  it('configures Claude, Cline, Windsurf, and Zed', async () => {
    await initProject({
      cwd: tempDir,
      editors: ['claude', 'cline', 'windsurf', 'zed'],
      copySkill: true,
      isWindows: false,
      nonInteractive: true,
    });

    // Claude
    expect(fs.existsSync(path.join(tempDir, 'CLAUDE.md'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, '.mcp.json'))).toBe(true);

    // Copied Skill
    const skillPath = path.join(tempDir, '.agents/skills/cybermp-dev/SKILL.md');
    expect(fs.existsSync(skillPath)).toBe(true);
    const skillContent = fs.readFileSync(skillPath, 'utf-8');
    expect(skillContent).toContain('name: cybermp-dev');

    // Cline
    expect(fs.existsSync(path.join(tempDir, '.clinerules'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, '.cline/mcp_settings.json'))).toBe(true);

    // Windsurf (Windsurf uses project root mcp_config.json)
    expect(fs.existsSync(path.join(tempDir, '.windsurfrules'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'mcp_config.json'))).toBe(true);

    // Zed
    const zedSettingsPath = path.join(tempDir, '.zed/settings.json');
    expect(fs.existsSync(zedSettingsPath)).toBe(true);
    const zedSettings = JSON.parse(fs.readFileSync(zedSettingsPath, 'utf-8'));
    expect(zedSettings.context_servers.cybermp).toBeDefined();
  });

  it('installs Antigravity plugin into .agents/plugins/cybermp when --plugin is passed', async () => {
    await initProject({
      cwd: tempDir,
      editors: [],
      plugin: true,
      nonInteractive: true,
    });

    const pluginDir = path.join(tempDir, '.agents/plugins/cybermp');
    expect(fs.existsSync(path.join(pluginDir, 'plugin.json'))).toBe(true);
    expect(fs.existsSync(path.join(pluginDir, 'mcp_config.json'))).toBe(true);
    expect(fs.existsSync(path.join(pluginDir, 'skills/cybermp-dev/SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(pluginDir, 'rules/cybermp.md'))).toBe(true);

    const pluginJson = JSON.parse(fs.readFileSync(path.join(pluginDir, 'plugin.json'), 'utf-8'));
    expect(pluginJson.name).toBe('cybermp');
    expect(pluginJson.skills).toContain('skills/cybermp-dev');
  });

  it('respects force option: does not overwrite existing rule files or skills when force is false, but overwrites when force is true', async () => {
    const claudePath = path.join(tempDir, 'CLAUDE.md');
    fs.writeFileSync(claudePath, '# User Custom Guidelines', 'utf-8');

    const skillDir = path.join(tempDir, '.agents/skills/cybermp-dev');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Custom User Skill', 'utf-8');

    // Run without force (force: false)
    await initProject({
      cwd: tempDir,
      editors: ['claude'],
      copySkill: true,
      force: false,
      nonInteractive: true,
    });

    expect(fs.readFileSync(claudePath, 'utf-8')).toBe('# User Custom Guidelines');
    expect(fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf-8')).toBe('# Custom User Skill');

    // Run with force (force: true)
    await initProject({
      cwd: tempDir,
      editors: ['claude'],
      copySkill: true,
      force: true,
      nonInteractive: true,
    });

    expect(fs.readFileSync(claudePath, 'utf-8')).not.toBe('# User Custom Guidelines');
    expect(fs.readFileSync(claudePath, 'utf-8')).toContain('CyberMP');
    expect(fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf-8')).not.toBe('# Custom User Skill');
    expect(fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf-8')).toContain('name: cybermp-dev');
  });

  it('extracts skill by default in non-interactive mode when copySkill is omitted', async () => {
    await initProject({
      cwd: tempDir,
      editors: ['antigravity'],
      nonInteractive: true,
    });

    const skillPath = path.join(tempDir, '.agents/skills/cybermp-dev/SKILL.md');
    expect(fs.existsSync(skillPath)).toBe(true);
    expect(fs.readFileSync(skillPath, 'utf-8')).toContain('name: cybermp-dev');
  });

  it('does not extract skill when copySkill is explicitly false', async () => {
    await initProject({
      cwd: tempDir,
      editors: ['antigravity'],
      copySkill: false,
      nonInteractive: true,
    });

    const skillPath = path.join(tempDir, '.agents/skills/cybermp-dev');
    expect(fs.existsSync(skillPath)).toBe(false);
  });
});
