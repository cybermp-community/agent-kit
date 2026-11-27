export type RpcRuntime = 'server' | 'client' | 'browser';

export interface RpcFlowResult {
  title: string;
  senderCode: string;
  receiverCode: string;
  notes?: string;
}

export function normalizeEndpoint(val: unknown): string {
  if (typeof val !== 'string') return '';
  const clean = val.trim().toLowerCase();
  if (clean === 'cef') return 'browser';
  return clean;
}

export function parseRpcFlowArgs(args: Record<string, any>): { from: string; to: string } {
  let from = args.from || args.source;
  let to = args.to || args.target;

  if (typeof args.flow === 'string' && args.flow.trim()) {
    const parts = args.flow.toLowerCase().split(/[-_>:\s]+/).filter((p) => Boolean(p) && p !== 'to');
    if (parts.length >= 2) {
      from = from || parts[0];
      to = to || parts[1];
    } else {
      throw new Error(`Cannot determine RPC endpoints from flow: "${args.flow}". Expected format: "server-client" or "client->browser".`);
    }
  }

  from = normalizeEndpoint(from);
  to = normalizeEndpoint(to);

  if (!from || !to) {
    throw new Error('Missing source and target endpoints for RPC flow. Specify "flow", or "source"/"from" and "target"/"to".');
  }

  return { from, to };
}

/**
 * Returns paired RPC code snippets and guidance between
 * CyberMP execution environments (Server, Client, CEF Browser).
 */
export function getRpcFlow(from: RpcRuntime, to: RpcRuntime): RpcFlowResult {
  if (from === 'server' && to === 'client') {
    return {
      title: 'Server to Client RPC',
      senderCode: `// Server:\nmp.events.on('playerSpawn', (playerId) => {\n  mp.events.emitClient(playerId, 'customEvent', { score: 100 });\n});`,
      receiverCode: `// Client:\nmp.events.onServer('customEvent', (data) => {\n  console.log('Received:', data);\n});`,
      notes: 'Server emits to a specific player by ID. Client listens with mp.events.onServer.',
    };
  }

  if (from === 'client' && to === 'server') {
    return {
      title: 'Client to Server RPC',
      senderCode: `// Client:\nmp.events.emitServer('requestScore', 42);`,
      receiverCode: `// Server:\nmp.events.onClient('requestScore', (player, payload) => {\n  console.log(player.nickname, 'sent:', payload);\n});`,
      notes: 'Client emits to server. Server callback receives the sending MpPlayer instance as the first argument.',
    };
  }

  if (from === 'client' && to === 'browser') {
    return {
      title: 'Client to Browser (CEF) Bridge',
      senderCode: `// Client:\nmp.events.emitCef('updateHealth', 95);`,
      receiverCode: `// CEF Web UI:\nmp.events.on('updateHealth', (hp) => {\n  const healthLabel = document.getElementById('hp');\n  if (healthLabel) healthLabel.textContent = String(hp);\n});`,
      notes: 'Client emits to CEF browser using mp.events.emitCef. CEF listens using mp.events.on.',
    };
  }

  if (from === 'browser' && to === 'client') {
    return {
      title: 'Browser (CEF) to Client Bridge',
      senderCode: `// CEF Web UI:\nmp.events.emit('closeUi');`,
      receiverCode: `// Client:\nmp.events.onCef('closeUi', () => {\n  console.log('UI closed');\n});`,
      notes: 'CEF browser emits using mp.events.emit. Client listens using mp.events.onCef.',
    };
  }

  throw new Error(
    `Invalid RPC direction: ${from} -> ${to}. In CyberMP, Server and Browser (CEF) cannot communicate directly; route events through Client.`
  );
}
