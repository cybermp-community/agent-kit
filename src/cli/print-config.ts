/**
 * Generates copy-pasteable MCP server configuration snippets for supported AI editors.
 */

export const CONFIG_SNIPPETS: Record<string, object> = {
  cursor: {
    mcpServers: {
      cybermp: {
        command: 'npx',
        args: ['-y', 'cybermp-agent-kit'],
      },
    },
  },
  claude: {
    mcpServers: {
      cybermp: {
        command: 'npx',
        args: ['-y', 'cybermp-agent-kit'],
      },
    },
  },
  antigravity: {
    mcpServers: {
      cybermp: {
        command: 'npx',
        args: ['-y', 'cybermp-agent-kit'],
      },
    },
  },
  cline: {
    mcpServers: {
      cybermp: {
        command: 'npx',
        args: ['-y', 'cybermp-agent-kit'],
        disabled: false,
        autoApprove: [],
      },
    },
  },
  windsurf: {
    mcpServers: {
      cybermp: {
        command: 'npx',
        args: ['-y', 'cybermp-agent-kit'],
      },
    },
  },
  zed: {
    context_servers: {
      cybermp: {
        command: 'npx',
        args: ['-y', 'cybermp-agent-kit'],
      },
    },
  },
};

/**
 * Returns formatted JSON configuration snippet for a given target editor.
 *
 * @param target Supported: 'cursor', 'claude', 'antigravity', 'cline', 'windsurf', 'zed', 'all'
 */
export function getConfigSnippet(target: string): string {
  const normalized = target.trim().toLowerCase();

  if (normalized === 'all') {
    return JSON.stringify(CONFIG_SNIPPETS, null, 2);
  }

  const snippet = CONFIG_SNIPPETS[normalized];
  if (!snippet) {
    const validTargets = [...Object.keys(CONFIG_SNIPPETS), 'all'].join(', ');
    throw new Error(`Unknown target editor: "${target}". Supported targets: ${validTargets}`);
  }

  return JSON.stringify(snippet, null, 2);
}
