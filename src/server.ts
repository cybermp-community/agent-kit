import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerAllTools } from './tools/index.js';

/**
 * Creates and initializes the CyberMP MCP Server with all 4 core tools registered.
 */
export function createCyberMpServer(): McpServer {
  const server = new McpServer({
    name: 'cybermp-agent-kit',
    version: '1.0.0',
  });

  registerAllTools(server);

  return server;
}

/**
 * Starts the CyberMP MCP server over standard I/O (stdio).
 */
export async function startServer(): Promise<void> {
  const server = createCyberMpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Support direct invocation if run as a standalone script
if (
  process.argv[1] &&
  (process.argv[1].endsWith('server.js') || process.argv[1].endsWith('server.ts'))
) {
  startServer().catch((error) => {
    console.error('Failed to start CyberMP MCP server:', error);
    process.exit(1);
  });
}
