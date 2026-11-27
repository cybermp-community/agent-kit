import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { packageVersion } from './version.js';
import { registerAllTools } from './tools/index.js';
import {
  findLogsDir,
  LIVE_INSTRUCTIONS,
  type LiveFeatures,
  type LiveOptions,
  readEnv,
  registerLiveFeatures,
} from './live/index.js';

export type CyberMpServerOptions = {
  /**
   * Live server features (logs, server status, game bridge tools). On by
   * default; each part switches itself on when configured. `false` leaves
   * only the offline docs tools.
   */
  live?: LiveOptions | false;
};

/**
 * Creates the CyberMP MCP server, including the 5 offline docs tools, plus
 * the live server features (see {@link registerLiveFeatures}).
 */
export function createCyberMpServer(options: CyberMpServerOptions = {}): McpServer {
  return createCyberMpServerWithLive(options).server;
}

/** {@link createCyberMpServer}, also returning the live features' controller */
export function createCyberMpServerWithLive(options: CyberMpServerOptions = {}): {
  server: McpServer;
  live?: LiveFeatures;
} {
  const liveOptions = options.live === false ? undefined : (options.live ?? {});
  const env = liveOptions ? (liveOptions.env ?? (() => readEnv()))() : {};
  // Fixed at startup: mention the live tools only where a server is configured
  const liveAtStart = Boolean(liveOptions && (env.DEVTOOLS_TOKEN || findLogsDir(env)));
  const instructions = [liveAtStart ? LIVE_INSTRUCTIONS : undefined, env.CYBERMP_MCP_INSTRUCTIONS]
    .filter(Boolean)
    .join(' ');

  const server = new McpServer(
    { name: 'cybermp-community-agent-kit', version: packageVersion },
    instructions ? { instructions } : undefined,
  );

  registerAllTools(server);

  const live = liveOptions ? registerLiveFeatures(server, liveOptions) : undefined;

  return { server, live };
}

/** Longest wait for the bridge before answering the client; slower bridges show up later */
const FIRST_SYNC_MS = 6_000;

/**
 * Starts the CyberMP MCP server over standard I/O (stdio).
 */
export async function startServer(): Promise<void> {
  const { server, live } = createCyberMpServerWithLive();

  if (live) {
    // Have the bridge tools in the first tool list when the game is up
    await Promise.race([
      live.sync().catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, FIRST_SYNC_MS).unref()),
    ]);
  }

  await server.connect(new StdioServerTransport());

  if (!live) {
    return;
  }

  live.start();

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;

    try {
      await live.stop();
    } finally {
      process.exit(0);
    }
  };

  process.stdin.on('end', shutdown);
  process.stdin.on('close', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
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
