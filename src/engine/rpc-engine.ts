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
      senderCode: `// Server:\nevents.emitClient(player, 'customEvent', { score: 100 });`,
      receiverCode: `// Client:\nevents.onServer('customEvent', (data) => {\n  console.log('Received:', data);\n});`,
      notes: 'Server emits to a specific player instance. Client listens with events.onServer.',
    };
  }

  if (from === 'client' && to === 'server') {
    return {
      title: 'Client to Server RPC',
      senderCode: `// Client:\nevents.emitServer('requestScore', 42);`,
      receiverCode: `// Server:\nevents.onClient('requestScore', (player, payload) => {\n  console.log(player.name, 'sent:', payload);\n});`,
      notes: 'Client emits to server. Server callback receives the sending MpPlayer instance as the first argument.',
    };
  }

  if (from === 'client' && to === 'browser') {
    return {
      title: 'Client to Browser (CEF) Bridge',
      senderCode: `// Client:\nevents.emitCef('updateHealth', 95);`,
      receiverCode: `// CEF Web UI:\ncybermp.events.on('updateHealth', (hp) => {\n  document.getElementById('hp').innerText = hp;\n});`,
      notes: 'Client emits to CEF browser using events.emitCef. CEF listens using cybermp.events.on.',
    };
  }

  if (from === 'browser' && to === 'client') {
    return {
      title: 'Browser (CEF) to Client Bridge',
      senderCode: `// CEF Web UI:\ncybermp.events.emit('closeUi');`,
      receiverCode: `// Client:\nevents.onCef('closeUi', () => {\n  console.log('UI closed');\n});`,
      notes: 'CEF browser emits using cybermp.events.emit. Client listens using events.onCef.',
    };
  }

  throw new Error(
    `Invalid RPC direction: ${from} -> ${to}. In CyberMP, Server and Browser (CEF) cannot communicate directly; route events through Client.`
  );
}
