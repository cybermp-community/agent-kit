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
          args: ['-y', 'cybermp-agent-kit'],
        },
      },
    },
    claude: {
      mcpServers: {
        cybermp: {
          command: npxCmd,
          args: ['-y', 'cybermp-agent-kit'],
        },
      },
    },
    antigravity: {
      mcpServers: {
        cybermp: {
          command: npxCmd,
          args: ['-y', 'cybermp-agent-kit'],
        },
      },
    },
    cline: {
      mcpServers: {
        cybermp: {
          command: npxCmd,
          args: ['-y', 'cybermp-agent-kit'],
          disabled: false,
          autoApprove: [],
        },
      },
    },
    windsurf: {
      mcpServers: {
        cybermp: {
          command: npxCmd,
          args: ['-y', 'cybermp-agent-kit'],
        },
      },
    },
    zed: {
      context_servers: {
        cybermp: {
          command: npxCmd,
          args: ['-y', 'cybermp-agent-kit'],
        },
      },
    },
  };
}

export const CONFIG_SNIPPETS: Record<string, object> = getEditorSnippets(false);

/**
 * Returns formatted JSON configuration snippet for a given target editor.
 *
 * @param target Supported: 'cursor', 'claude', 'antigravity', 'cline', 'windsurf', 'zed', 'all'
 * @param options Optional platform overrides (e.g. isWindows)
 */
export function getConfigSnippet(target: string, options?: { isWindows?: boolean }): string {
  const isWindows = options?.isWindows ?? process.platform === 'win32';
  const snippets = getEditorSnippets(isWindows);
  const normalized = target.trim().toLowerCase();

  if (normalized === 'all') {
    return JSON.stringify(snippets, null, 2);
  }

  const snippet = snippets[normalized];
  if (!snippet) {
    const validTargets = [...Object.keys(snippets), 'all'].join(', ');
    throw new Error(`Unknown target editor: "${target}". Supported targets: ${validTargets}`);
  }

  return JSON.stringify(snippet, null, 2);
}
