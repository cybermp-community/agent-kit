import type { McpRpc } from '../src/rpc.ts';

type Handler = (ctx: { data: any }) => unknown;

/**
 * In-process stand-in for CyberMP: resources with a state, shared events and
 * named RPC servers that call each other like `@cybermp/rpc-server` does.
 */
export const createWorld = () => {
  const servers = new Map<string, Map<string, Handler>>();
  const states = new Map<string, number>();
  const listeners = new Map<string, Set<(...args: any[]) => void>>();

  const events = {
    on(name: string, cb: (...args: any[]) => void) {
      if (!listeners.has(name)) {
        listeners.set(name, new Set());
      }
      listeners.get(name)!.add(cb);
    },
    off(name: string, cb: (...args: any[]) => void) {
      listeners.get(name)?.delete(cb);
    },
    emit(name: string, ...args: any[]) {
      for (const cb of listeners.get(name) ?? []) {
        cb(...args);
      }
    },
  };

  /** The `mp` global as seen from inside `resource` */
  const mpFor = (resource: string) => {
    states.set(resource, 2);

    return {
      events,
      resources: {
        getCurrentName: () => resource,
        getState: (name: string) => states.get(name) ?? 0,
      },
    };
  };

  const rpcFor = (name: string): McpRpc => {
    const handlers = new Map<string, Handler>();

    servers.set(name, handlers);

    return {
      name,
      register(method, handler) {
        handlers.set(method, handler);
      },
      unregister(method) {
        handlers.delete(method);
      },
      async callServer(method, config) {
        const handler = servers.get(config.name ?? '')?.get(method);

        if (!handler) {
          throw new Error(`No RPC server ${config.name} with ${method}`);
        }

        return handler({ data: config.data });
      },
    };
  };

  return {
    mpFor,
    rpcFor,
    stopResource: (resource: string) => states.set(resource, 0),
  };
};

/** Collects log lines instead of printing them */
export const recordingLogger = () => {
  const lines: string[] = [];

  return {
    lines,
    logger: {
      info: (m: string) => lines.push(`info ${m}`),
      success: (m: string) => lines.push(`success ${m}`),
      warn: (m: string) => lines.push(`warn ${m}`),
    },
  };
};

/** Lets pending promise callbacks (registration round trips) run */
export const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
