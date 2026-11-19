#!/usr/bin/env node
import { Command } from 'commander';
import { startServer } from '../src/server.js';
import { initProject } from '../src/cli/init.js';
import { getConfigSnippet } from '../src/cli/print-config.js';

const program = new Command();

program
  .name('cybermp-agent-kit')
  .description('CyberMP AI Agent Toolkit & MCP Server')
  .version('1.0.0');

program
  .command('run', { isDefault: true })
  .description('Launch stdio MCP server (default)')
  .action(async () => {
    try {
      await startServer();
    } catch (error) {
      console.error('Failed to start CyberMP MCP server:', error);
      process.exit(1);
    }
  });

program
  .command('start')
  .description('Launch stdio MCP server')
  .action(async () => {
    try {
      await startServer();
    } catch (error) {
      console.error('Failed to start CyberMP MCP server:', error);
      process.exit(1);
    }
  });

program
  .command('init')
  .description('Initialize CyberMP rules and MCP configuration in the current project')
  .option('-e, --editors <editors...>', 'Target editors (cursor, claude, antigravity, cline, windsurf, zed)')
  .option('--skill', 'Copy cybermp-dev Agent Skill into .agents/skills/')
  .option('-y, --yes', 'Non-interactive mode with default settings')
  .option('-f, --force', 'Overwrite existing files')
  .action(async (options) => {
    try {
      await initProject({
        editors: options.editors,
        copySkill: options.skill,
        nonInteractive: options.yes,
        force: options.force,
      });
    } catch (error) {
      console.error('Failed to initialize project:', error);
      process.exit(1);
    }
  });

program
  .command('config [editor]')
  .description('Print MCP configuration snippet for the specified editor (cursor, claude, antigravity, cline, windsurf, zed, all)')
  .action((editor) => {
    try {
      const snippet = getConfigSnippet(editor || 'all');
      console.log(snippet);
    } catch (error: any) {
      console.error(error.message);
      process.exit(1);
    }
  });

program.parse(process.argv);
