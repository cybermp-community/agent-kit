export type RpcRuntime = 'server' | 'client' | 'browser';

export interface RpcFlowResult {
  title: string;
  senderCode: string;
  receiverCode: string;
  notes?: string;
}

/**
 * Returns exact verified paired RPC code snippets and guidance between
 * CyberMP execution environments (Server, Client, CEF Browser).
 */
export function getRpcFlow(from: RpcRuntime, to: RpcRuntime): RpcFlowResult {
  if (from === 'server' && to === 'client') {
    return {
      title: 'Server to Client RPC',
      senderCode: `// Server:\nmp.events.emitClient(player, 'customEvent', { score: 100 });`,
      receiverCode: `// Client:\nmp.events.onServer('customEvent', (data) => {\n  console.log('Received:', data);\n});`,
      notes: 'Server emits to a specific player instance. Client listens with mp.events.onServer.',
    };
  }

  if (from === 'client' && to === 'server') {
    return {
      title: 'Client to Server RPC',
      senderCode: `// Client:\nmp.events.emitServer('requestScore', 42);`,
      receiverCode: `// Server:\nmp.events.onClient('requestScore', (player, payload) => {\n  console.log(player.name, 'sent:', payload);\n});`,
      notes: 'Client emits to server. Server callback receives the sending MpPlayer instance as the first argument.',
    };
  }

  if (from === 'client' && to === 'browser') {
    return {
      title: 'Client to Browser (CEF) Bridge',
      senderCode: `// Client:\nmp.events.emitCef('updateHealth', 95);`,
      receiverCode: `// CEF Web UI:\nmp.events.on('updateHealth', (hp) => {\n  document.getElementById('hp').innerText = hp;\n});`,
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
