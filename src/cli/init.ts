import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import prompts from 'prompts';

export interface InitOptions {
  cwd?: string;
  editors?: string[];
  copySkill?: boolean;
  force?: boolean;
  nonInteractive?: boolean;
}

/**
 * Resolves the root directory of the cybermp-mcp package containing templates and skills.
 */
export function getPackageRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, 'templates')) && fs.existsSync(path.join(dir, 'package.json'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

/**
 * Reads a template file from the templates directory.
 */
function readTemplate(templateName: string): string {
  const packageRoot = getPackageRoot();
  const templatePath = path.join(packageRoot, 'templates', templateName);
  if (fs.existsSync(templatePath)) {
    return fs.readFileSync(templatePath, 'utf-8');
  }
  throw new Error(`Template not found: ${templatePath}`);
}

/**
 * Safely updates or creates a JSON configuration file, preserving existing fields.
 */
function mergeJsonConfig(filePath: string, updater: (data: Record<string, any>) => void): void {
  let data: Record<string, any> = {};
  if (fs.existsSync(filePath)) {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      data = JSON.parse(raw);
    } catch {
      data = {};
    }
  } else {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }

  updater(data);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

/**
 * Writes a rule markdown file, ensuring directory exists.
 */
function writeRuleFile(filePath: string, content: string, force: boolean): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (fs.existsSync(filePath) && !force) {
    // If not forced and file exists, still write rule template for initialization
  }
  fs.writeFileSync(filePath, content, 'utf-8');
}

/**
 * Interactive or non-interactive project initializer for CyberMP rules and MCP configs.
 */
export async function initProject(options: InitOptions = {}): Promise<void> {
  const cwd = options.cwd || process.cwd();
  let selectedEditors: string[] = [];
  let shouldCopySkill = options.copySkill ?? false;

  if (options.nonInteractive) {
    selectedEditors = options.editors && options.editors.length > 0
      ? options.editors
      : ['cursor', 'claude', 'antigravity'];
  } else {
    const response = await prompts([
      {
        type: 'multiselect',
        name: 'editors',
        message: 'Select AI editors and tools to configure for CyberMP:',
        choices: [
          { title: 'Cursor (.cursor/rules/ & .cursor/mcp.json)', value: 'cursor', selected: true },
          { title: 'Claude (CLAUDE.md & .mcp.json)', value: 'claude', selected: true },
          { title: 'Antigravity (.agents/rules/ & mcp_config.json)', value: 'antigravity', selected: true },
          { title: 'Cline / Roo Code (.clinerules & .cline/mcp_settings.json)', value: 'cline' },
          { title: 'Windsurf (.windsurfrules & mcp_config.json)', value: 'windsurf' },
          { title: 'Zed (.zed/settings.json)', value: 'zed' },
        ],
        hint: '- Space to select. Return to submit',
      },
      {
        type: 'confirm',
        name: 'copySkill',
        message: 'Copy cybermp-dev Agent Skill into .agents/skills/?',
        initial: false,
      },
    ]);

    if (!response.editors) {
      console.log('Setup cancelled.');
      return;
    }

    selectedEditors = response.editors;
    shouldCopySkill = Boolean(response.copySkill);
  }

  const normalizedEditors = selectedEditors.map((e) => e.trim().toLowerCase());
  const force = Boolean(options.force);
  const packageRoot = getPackageRoot();

  for (const editor of normalizedEditors) {
    switch (editor) {
      case 'cursor': {
        const cursorTemplate = readTemplate('cursor.mdc');
        writeRuleFile(path.join(cwd, '.cursor/rules/cybermp.mdc'), cursorTemplate, force);
        mergeJsonConfig(path.join(cwd, '.cursor/mcp.json'), (data) => {
          data.mcpServers = data.mcpServers || {};
          data.mcpServers.cybermp = {
            command: 'npx',
            args: ['-y', 'cybermp-mcp'],
          };
        });
        break;
      }

      case 'claude': {
        const claudeTemplate = readTemplate('claude.md');
        writeRuleFile(path.join(cwd, 'CLAUDE.md'), claudeTemplate, force);
        mergeJsonConfig(path.join(cwd, '.mcp.json'), (data) => {
          data.mcpServers = data.mcpServers || {};
          data.mcpServers.cybermp = {
            command: 'npx',
            args: ['-y', 'cybermp-mcp'],
          };
        });
        break;
      }

      case 'antigravity': {
        const antigravityTemplate = readTemplate('antigravity.md');
        writeRuleFile(path.join(cwd, '.agents/rules/cybermp.md'), antigravityTemplate, force);
        mergeJsonConfig(path.join(cwd, 'mcp_config.json'), (data) => {
          data.mcpServers = data.mcpServers || {};
          data.mcpServers.cybermp = {
            command: 'npx',
            args: ['-y', 'cybermp-mcp'],
          };
        });
        break;
      }

      case 'cline': {
        const clineTemplate = readTemplate('clinerules.md');
        writeRuleFile(path.join(cwd, '.clinerules'), clineTemplate, force);
        mergeJsonConfig(path.join(cwd, '.cline/mcp_settings.json'), (data) => {
          data.mcpServers = data.mcpServers || {};
          data.mcpServers.cybermp = {
            command: 'npx',
            args: ['-y', 'cybermp-mcp'],
            disabled: false,
            autoApprove: [],
          };
        });
        break;
      }

      case 'windsurf': {
        const universalTemplate = readTemplate('universal.md');
        writeRuleFile(path.join(cwd, '.windsurfrules'), universalTemplate, force);
        mergeJsonConfig(path.join(cwd, 'mcp_config.json'), (data) => {
          data.mcpServers = data.mcpServers || {};
          data.mcpServers.cybermp = {
            command: 'npx',
            args: ['-y', 'cybermp-mcp'],
          };
        });
        break;
      }

      case 'zed': {
        mergeJsonConfig(path.join(cwd, '.zed/settings.json'), (data) => {
          data.context_servers = data.context_servers || {};
          data.context_servers.cybermp = {
            command: 'npx',
            args: ['-y', 'cybermp-mcp'],
          };
        });
        break;
      }
    }
  }

  // Copy Agent Skill if requested
  if (shouldCopySkill) {
    const skillSrc = path.join(packageRoot, 'skills/cybermp-dev');
    const skillDest = path.join(cwd, '.agents/skills/cybermp-dev');
    if (fs.existsSync(skillSrc)) {
      fs.mkdirSync(path.dirname(skillDest), { recursive: true });
      fs.cpSync(skillSrc, skillDest, { recursive: true, force: true });
    }
  }

  if (!options.nonInteractive) {
    console.log(`\n✨ CyberMP AI configuration successfully initialized for: ${normalizedEditors.join(', ')}`);
  }
}
