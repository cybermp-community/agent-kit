import type { MpServer } from '@cybermp/server-types';
import { RpcServer } from '@cybermp/rpc-server';
import {
  basicMethods,
  createBridge,
  createEventLog,
  createProviderHost,
  entityMethods,
  fileAudit,
  MCP_BRIDGE_RPC_NAME,
  resourceMethods,
} from '@cybermp-community/agent-kit-bridge';
import { bridgePort, loadConfig, startDelayMs } from './env';

const mp = (globalThis as any).mp as MpServer;
const config = loadConfig();

const log = {
  info: (message: string) => console.log(`[mcp-bridge] ${message}`),
  success: (message: string) => console.log(`[mcp-bridge] ${message}`),
  warn: (message: string, detail?: unknown) =>
    console.warn(`[mcp-bridge] ${message}`, detail ?? ''),
};

const rpc = new RpcServer({ name: MCP_BRIDGE_RPC_NAME, pendingTimeout: 15_000 });
const host = createProviderHost({ mp, rpc, logger: log });

const token = config.DEVTOOLS_TOKEN ?? '';

const eventLog = token
  ? createEventLog(mp, {
      events: config.DEVTOOLS_EVENTS === 'all' ? 'all' : 'default',
    })
  : undefined;

const core = {
  ...basicMethods(mp),
  ...eventLog?.methods,
  ...resourceMethods(mp, {
    protect: (config.DEVTOOLS_PROTECT_RESOURCES ?? '')
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean),
  }),
  ...entityMethods(mp, { spawn: config.DEVTOOLS_ALLOW_SPAWN === '1' }),
};

const port = bridgePort(config);

if (Number.isNaN(port)) {
  log.warn(`DEVTOOLS_PORT=${config.DEVTOOLS_PORT} is not a port (1-65535)`);
}

const START_DELAY_MS = startDelayMs(config);
const serverJustStarted = process.uptime() < 60;

const bridge = createBridge({
  token,
  port,
  listenDelayMs: serverJustStarted ? START_DELAY_MS : 0,
  methods: () => host.methods(core),
  onPresence: host.onPresence,
  onAudit: config.DEVTOOLS_AUDIT_FILE
    ? fileAudit(config.DEVTOOLS_AUDIT_FILE)
    : undefined,
  logger: log,
});

mp.events.on('resourceStop', () => {
  bridge.stop();
  eventLog?.dispose();
  host.dispose();
});
