import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import prompts from 'prompts';

export interface InitOptions {
  cwd?: string;
  editors?: string[];
  copySkill?: boolean;
  plugin?: boolean;
  geminiConfigDir?: string;
  globalAntigravity?: boolean;
  isWindows?: boolean;
  force?: boolean;
  nonInteractive?: boolean;
}

/**
 * Resolves the root directory of the cybermp-agent-kit package containing templates and skills.
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
 * Resolves the command and arguments to start the CyberMP MCP server.
 * Prefer local node_modules binary if available to avoid npx registry latency,
 * and use npx.cmd on Windows to prevent ENOENT spawn crashes.
 */
export function resolveMcpServerCommand(
  cwd: string = process.cwd(),
  isWindows: boolean = process.platform === 'win32'
): { command: string; args: string[] } {
  const localCli = path.join(cwd, 'node_modules', 'cybermp-agent-kit', 'dist', 'bin', 'cli.js');
  if (fs.existsSync(localCli)) {
    return { command: 'node', args: ['./node_modules/cybermp-agent-kit/dist/bin/cli.js'] };
  }
  return { command: isWindows ? 'npx.cmd' : 'npx', args: ['-y', 'cybermp-agent-kit'] };
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

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mergeJsonConfig(
  filePath: string,
  containerKey: 'mcpServers' | 'context_servers',
  entry: object,
  force: boolean,
): void {
  let data: Record<string, unknown> = {};
  let mode: number | undefined;

  const stat = fs.lstatSync(filePath, { throwIfNoEntry: false });
  if (stat) {
    if (!stat.isFile()) throw new Error(`Expected a regular JSON file at ${filePath}`);
    mode = stat.mode & 0o777;
    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (cause) {
      throw new Error(`Cannot read JSON configuration at ${filePath}`, { cause });
    }
    if (!isJsonObject(parsed)) throw new Error(`Expected a JSON object at ${filePath}`);
    data = parsed;
  }

  const current = Object.hasOwn(data, containerKey) ? data[containerKey] : {};
  if (!isJsonObject(current)) {
    throw new Error(`Expected a JSON object for ${containerKey} at ${filePath}`);
  }
  if (Object.hasOwn(current, 'cybermp') && !force) return;
  data[containerKey] = { ...current, cybermp: entry };

  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true });
  const temporaryDirectory = fs.mkdtempSync(path.join(directory, '.cybermp-config-'));
  try {
    const pending = path.join(temporaryDirectory, path.basename(filePath));
    fs.writeFileSync(pending, JSON.stringify(data, null, 2) + '\n', { mode: mode ?? 0o600 });
    if (mode !== undefined) fs.chmodSync(pending, mode);
    fs.renameSync(pending, filePath);
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

/**
 * Writes a rule markdown file, ensuring directory exists.
 */
function writeRuleFile(filePath: string, content: string, force: boolean): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (fs.existsSync(filePath) && !force) {
    console.log(`Skipping existing ${path.basename(filePath)} (use --force to overwrite)`);
    return;
  }
  fs.writeFileSync(filePath, content, 'utf-8');
}

/**
 * Interactive or non-interactive project initializer for CyberMP rules and MCP configs.
 */
export async function initProject(options: InitOptions = {}): Promise<void> {
  const cwd = options.cwd || process.cwd();
  const isWindows = options.isWindows ?? process.platform === 'win32';
  const mcpCmd = resolveMcpServerCommand(cwd, isWindows);
  let selectedEditors: string[] = [];
  let shouldCopySkill: boolean;

  if (options.nonInteractive) {
    selectedEditors = options.editors && options.editors.length > 0
      ? options.editors
      : ['cursor', 'claude', 'antigravity'];
    shouldCopySkill = options.copySkill ?? true;
  } else {
    const questions: prompts.PromptObject[] = [
      {
        type: 'multiselect',
        name: 'editors',
        message: 'Select AI editors and tools to configure for CyberMP:',
        choices: [
          { title: 'Cursor (.cursor/rules/ & .cursor/mcp.json)', value: 'cursor', selected: true },
          { title: 'Claude (CLAUDE.md & .mcp.json)', value: 'claude', selected: true },
          { title: 'Antigravity (.agents/rules/)', value: 'antigravity', selected: true },
          { title: 'Cline / Roo Code (.clinerules & .cline/mcp_settings.json)', value: 'cline' },
          { title: 'Windsurf (.windsurfrules & mcp_config.json)', value: 'windsurf' },
          { title: 'Zed (.zed/settings.json)', value: 'zed' },
        ],
        hint: '- Space to select. Return to submit',
      },
    ];

    if (options.copySkill === undefined) {
      questions.push({
        type: 'confirm',
        name: 'copySkill',
        message: 'Copy cybermp-dev Agent Skill into .agents/skills/?',
        initial: true,
      });
    }

    const response = await prompts(questions);

    if (!response.editors) {
      console.log('Setup cancelled.');
      return;
    }

    selectedEditors = response.editors;
    shouldCopySkill = options.copySkill !== undefined
      ? Boolean(options.copySkill)
      : Boolean(response.copySkill ?? true);
  }

  const normalizedEditors = selectedEditors.map((e) => e.trim().toLowerCase());
  const force = Boolean(options.force);
  const packageRoot = getPackageRoot();

  for (const editor of normalizedEditors) {
    switch (editor) {
      case 'cursor': {
        const cursorTemplate = readTemplate('cursor.mdc');
        writeRuleFile(path.join(cwd, '.cursor/rules/cybermp.mdc'), cursorTemplate, force);
        mergeJsonConfig(path.join(cwd, '.cursor/mcp.json'), 'mcpServers', mcpCmd, force);
        if (!options.nonInteractive) {
          console.log('Configured Cursor (.cursor/rules/cybermp.mdc & .cursor/mcp.json)');
        }
        break;
      }

      case 'claude': {
        const claudeTemplate = readTemplate('claude.md');
        writeRuleFile(path.join(cwd, 'CLAUDE.md'), claudeTemplate, force);
        mergeJsonConfig(path.join(cwd, '.mcp.json'), 'mcpServers', mcpCmd, force);
        if (!options.nonInteractive) {
          console.log('Configured Claude (CLAUDE.md & .mcp.json)');
        }
        break;
      }

      case 'antigravity': {
        const antigravityTemplate = readTemplate('antigravity.md');
        writeRuleFile(path.join(cwd, '.agents/rules/cybermp.md'), antigravityTemplate, force);

        if (!options.nonInteractive) console.log('Configured Antigravity workspace rules');
        break;
      }

      case 'cline': {
        const clineTemplate = readTemplate('clinerules.md');
        writeRuleFile(path.join(cwd, '.clinerules'), clineTemplate, force);
        mergeJsonConfig(path.join(cwd, '.cline/mcp_settings.json'), 'mcpServers', {
          ...mcpCmd,
          disabled: false,
          autoApprove: [],
        }, force);
        if (!options.nonInteractive) {
          console.log('Configured Cline (.clinerules & .cline/mcp_settings.json)');
        }
        break;
      }

      case 'windsurf': {
        const universalTemplate = readTemplate('universal.md');
        writeRuleFile(path.join(cwd, '.windsurfrules'), universalTemplate, force);
        mergeJsonConfig(path.join(cwd, 'mcp_config.json'), 'mcpServers', mcpCmd, force);
        if (!options.nonInteractive) {
          console.log('Configured Windsurf (.windsurfrules & mcp_config.json)');
        }
        break;
      }

      case 'zed': {
        mergeJsonConfig(path.join(cwd, '.zed/settings.json'), 'context_servers', mcpCmd, force);
        if (!options.nonInteractive) {
          console.log('Configured Zed (.zed/settings.json)');
        }
        break;
      }
    }
  }

  if (options.globalAntigravity || (options.geminiConfigDir && normalizedEditors.includes('antigravity'))) {
    const geminiConfigDir = options.geminiConfigDir || path.join(os.homedir(), '.gemini', 'config');
    const globalMcpPath = path.join(geminiConfigDir, 'mcp_config.json');
    const globalCmd = mcpCmd.command === 'node'
      ? { ...mcpCmd, args: [path.resolve(cwd, mcpCmd.args[0])] }
      : mcpCmd;
    mergeJsonConfig(globalMcpPath, 'mcpServers', globalCmd, force);
    if (!options.nonInteractive) console.log(`Configured Antigravity global MCP at ${globalMcpPath}`);
  }

  // Copy Agent Skill if requested
  if (shouldCopySkill) {
    const skillSrc = path.join(packageRoot, 'skills/cybermp-dev');
    const skillDest = path.join(cwd, '.agents/skills/cybermp-dev');
    if (fs.existsSync(skillSrc)) {
      const isExistingNonEmpty = fs.existsSync(skillDest) && fs.readdirSync(skillDest).length > 0;
      if (isExistingNonEmpty && !force) {
        console.log(`Skipping existing skill directory at .agents/skills/cybermp-dev (use --force to overwrite)`);
      } else {
        fs.mkdirSync(path.dirname(skillDest), { recursive: true });
        fs.cpSync(skillSrc, skillDest, { recursive: true, force: true });
        if (!options.nonInteractive) {
          console.log(`Extracted cybermp-dev skill into .agents/skills/cybermp-dev`);
        }
      }
    }
  }

  // Copy Antigravity workspace plugin if requested
  if (options.plugin) {
    const pluginSrc = path.join(packageRoot, 'plugins/cybermp');
    const pluginDest = path.join(cwd, '.agents/plugins/cybermp');
    if (fs.existsSync(pluginSrc)) {
      if (fs.existsSync(pluginDest) && !force) {
        console.log(`Skipping existing plugin directory (use --force to overwrite)`);
      } else {
        fs.mkdirSync(path.dirname(pluginDest), { recursive: true });
        fs.cpSync(pluginSrc, pluginDest, { recursive: true, force: true });

        // Ensure skills and rules are bundled inside the plugin folder
        const skillSrc = path.join(packageRoot, 'skills/cybermp-dev');
        const skillDest = path.join(pluginDest, 'skills/cybermp-dev');
        if (fs.existsSync(skillSrc)) {
          fs.mkdirSync(path.dirname(skillDest), { recursive: true });
          fs.cpSync(skillSrc, skillDest, { recursive: true, force: true });
        }

        const ruleSrc = path.join(packageRoot, 'rules/cybermp.md');
        const ruleDest = path.join(pluginDest, 'rules/cybermp.md');
        if (fs.existsSync(ruleSrc)) {
          fs.mkdirSync(path.dirname(ruleDest), { recursive: true });
          fs.copyFileSync(ruleSrc, ruleDest);
        }

        if (!options.nonInteractive) {
          console.log(`Installed CyberMP Antigravity plugin in ${pluginDest}`);
        }
      }
    }
  }

  if (!options.nonInteractive) {
    console.log(`\n✨ CyberMP AI configuration successfully initialized for: ${normalizedEditors.join(', ')}`);
  }
}
