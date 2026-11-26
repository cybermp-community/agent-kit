import z from 'zod';
import {
  type BridgeLogger,
  BridgeError,
  defineMethod,
  describeMethods,
  isBridgeError,
  jsonReplacer,
  type MethodDef,
  type MethodKind,
  type PresenceState,
} from './index.ts';

/**
 * Lets any resource add its own tools to the MCP server, over CyberMP RPC.
 *
 * - The bridge resource runs an RPC server named {@link MCP_BRIDGE_RPC_NAME}
 *   and calls {@link createProviderHost} on it.
 * - A resource that wants to contribute calls {@link registerMcpProvider}
 *   with its own RPC server and its methods.
 * - Registration, calls and presence travel as JSON strings, so no value type
 *   has to survive the trip between resources.
 *
 * All server resources are trusted code, therefore a provider can declare any
 * `kind` and replace generic tools of the same name.
 */
export const MCP_BRIDGE_RPC_NAME = 'mcp-bridge';
/** Emitted (shared event) when a bridge starts, so providers re-register at once */
export const MCP_READY_EVENT = 'mcp-bridge:ready';

const RPC = {
  register: 'mcp.register',
  unregister: 'mcp.unregister',
  call: 'mcp.call',
  presence: 'mcp.presence',
} as const;

/** What {@link registerMcpProvider} and {@link createProviderHost} need from an `RpcServer` */
export type McpRpc = {
  /** The instance name other resources address it by */
  name: string;
  register(method: string, handler: (ctx: { data: any }) => unknown): void;
  unregister(method: string): void;
  callServer(
    method: string,
    config: { data?: unknown; name?: string; timeout?: number },
  ): Promise<any>;
};

type RpcMp = {
  events: {
    on(name: string, callback: (...args: any[]) => void): void;
    off(name: string, callback: (...args: any[]) => void): void;
    emit(name: string, ...args: any[]): void;
  };
  resources: { getCurrentName(): string; getState(name: string): number };
};

const RESOURCE_RUNNING = 2;

type Reply = { ok: true; result: unknown } | { ok: false; error: string };

const reply = (value: Reply) => JSON.stringify(value, jsonReplacer);

// ---------------------------------------------------------------- provider

export type McpProviderOptions = {
  mp: RpcMp;
  /** Your resource's own RPC server (the same one you use for other RPC) */
  rpc: McpRpc;
  methods: Record<string, MethodDef>;
  /** Called when an agent attaches/detaches; the result is merged into the bridge's reply */
  onPresence?(state: PresenceState): unknown;
  /** RPC name of the bridge resource. Default {@link MCP_BRIDGE_RPC_NAME} */
  bridgeName?: string;
  /** Re-register this often (the bridge forgets silent providers). Default 30 s */
  heartbeatMs?: number;
  /** Retry this often until the bridge answers. Default 3 s */
  retryMs?: number;
  /** Default 3 s */
  callTimeoutMs?: number;
};

export type McpProvider = {
  /** Stops registering and tells the bridge to forget this resource */
  unregister(): Promise<void>;
};

/**
 * Registers `methods` with the bridge resource and serves calls to them. The
 * bridge may start before or after you, and may restart, so this keeps
 * registering until it is heard.
 */
export const registerMcpProvider = (options: McpProviderOptions): McpProvider => {
  const { mp, rpc, methods } = options;
  const bridgeName = options.bridgeName ?? MCP_BRIDGE_RPC_NAME;
  const heartbeatMs = options.heartbeatMs ?? 30_000;
  const retryMs = options.retryMs ?? 3_000;
  const timeout = options.callTimeoutMs ?? 3_000;
  const resource = mp.resources.getCurrentName();

  rpc.register(RPC.call, async (ctx) => {
    try {
      const { method, params } = JSON.parse(ctx.data) as {
        method: string;
        params?: unknown;
      };
      const def = methods[method];

      if (!def) {
        return reply({ ok: false, error: `Unknown method: ${method}` });
      }

      const parsed = def.params.safeParse(params ?? {});

      if (!parsed.success) {
        return reply({
          ok: false,
          error: `Invalid params: ${z.prettifyError(parsed.error)}`,
        });
      }

      return reply({ ok: true, result: await def.handler(parsed.data) });
    } catch (e) {
      return reply({
        ok: false,
        error:
          isBridgeError(e)
            ? e.message
            : `Internal error: ${(e as Error)?.message ?? e}`,
      });
    }
  });

  rpc.register(RPC.presence, async (ctx) => {
    const { state } = JSON.parse(ctx.data) as { state: PresenceState };

    return JSON.stringify((await options.onPresence?.(state)) ?? null, jsonReplacer);
  });

  let stopped = false;
  let registered = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const register = async () => {
    try {
      await rpc.callServer(RPC.register, {
        name: bridgeName,
        timeout,
        data: JSON.stringify({
          resource,
          rpcName: rpc.name,
          methods: describeMethods(methods, true),
        }),
      });
      registered = true;
    } catch {
      // Bridge not running (yet): retried below
      registered = false;
    }
  };

  const tick = () => {
    if (stopped) {
      return;
    }

    void register().finally(() => {
      if (!stopped) {
        timer = setTimeout(tick, registered ? heartbeatMs : retryMs);
      }
    });
  };

  const onReady = () => {
    void register();
  };

  mp.events.on(MCP_READY_EVENT, onReady);
  tick();

  return {
    async unregister() {
      stopped = true;
      clearTimeout(timer);
      mp.events.off(MCP_READY_EVENT, onReady);

      await rpc
        .callServer(RPC.unregister, {
          name: bridgeName,
          timeout: 1_000,
          data: JSON.stringify({ resource }),
        })
        .catch(() => {});

      rpc.unregister(RPC.call);
      rpc.unregister(RPC.presence);
    },
  };
};

// -------------------------------------------------------------------- host

const descriptorSchema = z.object({
  method: z.string().min(1).max(100),
  tool: z.string().min(1).max(100).optional(),
  title: z.string().max(200).optional(),
  description: z.string().max(4000).optional(),
  kind: z.enum(['read', 'write', 'destructive']),
  inputSchema: z.record(z.string(), z.unknown()).optional(),
});

const registrationSchema = z.object({
  resource: z.string().min(1).max(100),
  rpcName: z.string().min(1).max(100),
  methods: z.array(descriptorSchema).max(200),
});

type Registration = z.infer<typeof registrationSchema> & { lastSeen: number };

export type ProviderHostOptions = {
  mp: RpcMp;
  /** The bridge resource's RPC server, named {@link MCP_BRIDGE_RPC_NAME} */
  rpc: McpRpc;
  /** A provider silent for this long is dropped. Default 90 s */
  ttlMs?: number;
  /** Must stay under the MCP server's own timeout (15 s). Default 12 s */
  callTimeoutMs?: number;
  logger?: BridgeLogger;
};

export type ProviderHost = {
  /**
   * `core` plus every provider's methods (namespaced `resource/method`). A
   * provider tool replaces a core tool of the same name; between providers
   * the first to register wins. Pass it as `createBridge({ methods })`
   * wrapped in a function so it is re-read on every request.
   */
  methods(core: Record<string, MethodDef>): Record<string, MethodDef>;
  /** Forwards presence to every provider; merges their answers (numbers add up) */
  onPresence(state: PresenceState): Promise<Record<string, unknown>>;
  providers(): Array<{ resource: string; tools: string[] }>;
  dispose(): void;
};

export const createProviderHost = (options: ProviderHostOptions): ProviderHost => {
  const { mp, rpc, logger = {} } = options;
  const ttlMs = options.ttlMs ?? 90_000;
  const timeout = options.callTimeoutMs ?? 12_000;
  const registry = new Map<string, Registration>();
  const warned = new Set<string>();

  const prune = () => {
    const now = Date.now();

    for (const [resource, entry] of registry) {
      let running = true;

      try {
        running = mp.resources.getState(resource) === RESOURCE_RUNNING;
      } catch {
        // State unknown, so rely on the heartbeat timeout
      }

      if (!running || now - entry.lastSeen > ttlMs) {
        registry.delete(resource);
        logger.info?.(`MCP provider ${resource} gone`);
      }
    }
  };

  rpc.register(RPC.register, (ctx) => {
    const parsed = registrationSchema.safeParse(JSON.parse(ctx.data));

    if (!parsed.success) {
      throw new BridgeError(`Invalid registration: ${z.prettifyError(parsed.error)}`);
    }

    const known = registry.has(parsed.data.resource);

    registry.set(parsed.data.resource, { ...parsed.data, lastSeen: Date.now() });

    if (!known) {
      logger.success?.(
        `MCP provider ${parsed.data.resource} registered ${parsed.data.methods.length} method(s)`,
      );
    }

    return 'ok';
  });

  rpc.register(RPC.unregister, (ctx) => {
    const { resource } = JSON.parse(ctx.data) as { resource: string };

    registry.delete(resource);

    return 'ok';
  });

  const callProvider = async (
    entry: Registration,
    rpcMethod: string,
    data: unknown,
  ) => {
    try {
      return await rpc.callServer(rpcMethod, {
        name: entry.rpcName,
        data: JSON.stringify(data),
        timeout,
      });
    } catch (e) {
      throw new BridgeError(
        `Resource ${entry.resource} did not answer (${(e as Error)?.message ?? e}): it may be restarting`,
      );
    }
  };

  const callMethod = async (entry: Registration, method: string, params: unknown) => {
    const response = JSON.parse(
      await callProvider(entry, RPC.call, { method, params }),
    ) as Reply;

    if (!response.ok) {
      throw new BridgeError(response.error);
    }

    return response.result;
  };

  mp.events.emit(MCP_READY_EVENT);

  return {
    methods(core) {
      prune();

      const result = { ...core };
      const taken = new Set<string>();
      const infoProviders: Registration[] = [];

      for (const entry of registry.values()) {
        for (const d of entry.methods) {
          if (d.method === 'server.info') {
            infoProviders.push(entry);
          }

          if (d.tool) {
            if (taken.has(d.tool)) {
              const warning = `${entry.resource}:${d.tool}`;

              if (!warned.has(warning)) {
                warned.add(warning);
                logger.warn?.(
                  `MCP tool ${d.tool} from ${entry.resource} ignored: already provided by another resource`,
                );
              }

              continue;
            }

            taken.add(d.tool);
          }

          result[`${entry.resource}/${d.method}`] = defineMethod({
            tool: d.tool,
            title: d.title,
            description: d.description,
            kind: d.kind as MethodKind,
            params: z.record(z.string(), z.unknown()).default({}),
            inputSchema: d.inputSchema,
            handler: (params) => callMethod(entry, d.method, params),
          });
        }
      }

      for (const [key, def] of Object.entries(core)) {
        if (def.tool && taken.has(def.tool)) {
          delete result[key];
        }
      }

      if (infoProviders.length > 0) {
        // server_status shows the core info plus whatever the game modes add
        result['server.info'] = defineMethod({
          kind: 'read',
          params: z.object({}).default({}),
          handler: async () => {
            const info: Record<string, unknown> = {
              ...((await core['server.info']?.handler({})) as object | undefined),
            };

            for (const entry of infoProviders) {
              try {
                Object.assign(info, await callMethod(entry, 'server.info', {}));
              } catch {
                // A provider that is down must not break server_status
              }
            }

            return info;
          },
        });
      }

      return result;
    },

    async onPresence(state) {
      prune();

      const merged: Record<string, unknown> = {};
      const answers = await Promise.all(
        [...registry.values()].map(async (entry) => {
          try {
            return JSON.parse(await callProvider(entry, RPC.presence, { state }));
          } catch {
            return null;
          }
        }),
      );

      for (const answer of answers) {
        if (!answer || typeof answer !== 'object') {
          continue;
        }

        for (const [key, value] of Object.entries(answer)) {
          merged[key] =
            typeof value === 'number' && typeof merged[key] === 'number'
              ? (merged[key] as number) + value
              : value;
        }
      }

      return merged;
    },

    providers() {
      prune();

      return [...registry.values()].map((entry) => ({
        resource: entry.resource,
        tools: entry.methods.flatMap((m) => (m.tool ? [m.tool] : [])),
      }));
    },

    dispose() {
      rpc.unregister(RPC.register);
      rpc.unregister(RPC.unregister);
      registry.clear();
    },
  };
};
