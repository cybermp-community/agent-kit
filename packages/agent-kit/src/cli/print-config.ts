/**
 * Generates copy-pasteable MCP server configuration snippets for supported AI editors.
 */

export function getEditorSnippets(isWindows: boolean = process.platform === 'win32'): Record<string, object> {
  const npxCmd = isWindows ? 'npx.cmd' : 'npx';
  return {
    cursor: {
      mcpServers: {
        cybermp: {
          command: npxCmd,
          args: ['-y', '@cybermp-community/agent-kit'],
        },
      },
    },
    claude: {
      mcpServers: {
        cybermp: {
          command: npxCmd,
          args: ['-y', '@cybermp-community/agent-kit'],
        },
      },
    },
    antigravity: {
      mcpServers: {
        cybermp: {
          command: npxCmd,
          args: ['-y', '@cybermp-community/agent-kit'],
        },
      },
    },
    cline: {
      mcpServers: {
        cybermp: {
          command: npxCmd,
          args: ['-y', '@cybermp-community/agent-kit'],
          disabled: false,
          autoApprove: [],
        },
      },
    },
    windsurf: {
      mcpServers: {
        cybermp: {
          command: npxCmd,
          args: ['-y', '@cybermp-community/agent-kit'],
        },
      },
    },
    zed: {
      context_servers: {
        cybermp: {
          command: npxCmd,
          args: ['-y', '@cybermp-community/agent-kit'],
        },
      },
    },
  };
}

/**
 * Hermes keeps MCP servers in its own profile, so it takes a command rather
 * than a JSON fragment a project would commit.
 */
export function getHermesCommand(isWindows: boolean = process.platform === 'win32'): string {
  const npxCmd = isWindows ? 'npx.cmd' : 'npx';
  return `hermes mcp add cybermp --command ${npxCmd} --args -y @cybermp-community/agent-kit run`;
}

export const CONFIG_SNIPPETS: Record<string, object> = getEditorSnippets(false);

/**
 * Returns formatted JSON configuration snippet for a given target editor.
 *
 * @param target Supported: 'cursor', 'claude', 'antigravity', 'cline', 'windsurf', 'zed', 'hermes', 'all'.
 *               Every target but 'hermes' returns JSON; Hermes returns a shell command.
 * @param options Optional platform overrides (e.g. isWindows)
 */
export function getConfigSnippet(target: string, options?: { isWindows?: boolean }): string {
  const isWindows = options?.isWindows ?? process.platform === 'win32';
  const snippets = getEditorSnippets(isWindows);
  const normalized = target.trim().toLowerCase();

  if (normalized === 'hermes') {
    return getHermesCommand(isWindows);
  }

  if (normalized === 'all') {
    return JSON.stringify({ ...snippets, hermes: { command: getHermesCommand(isWindows) } }, null, 2);
  }

  const snippet = snippets[normalized];
  if (!snippet) {
    const validTargets = [...Object.keys(snippets), 'hermes', 'all'].join(', ');
    throw new Error(`Unknown target editor: "${target}". Supported targets: ${validTargets}`);
  }

  return JSON.stringify(snippet, null, 2);
}
