import type { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { type BridgeMethod, callBridge, describeBridge } from './bridge.js';
import type { Env } from './env.js';
import { isToolAllowed } from './policy.js';

export const CORE_SCOPE = 'core';

export const text = (value: unknown) => ({
  content: [
    {
      type: 'text' as const,
      text: typeof value === 'string' ? value : JSON.stringify(value, null, 2),
    },
  ],
});

export const errorResult = (e: unknown) => ({
  ...text((e as Error)?.message ?? String(e)),
  isError: true,
});

/**
 * The bridge sends JSON Schema (made with `z.toJSONSchema`); `McpServer`
 * wants a zod schema. A schema zod can't read becomes a loose object, so the
 * tool still works and the bridge validates the arguments itself.
 */
export const toInputSchema = (json: Record<string, unknown>) => {
  try {
    // Inside the try, a bridge may send no schema at all
    const { $schema: _schema, default: _default, ...rest } = json;
    const schema = z.fromJSONSchema({ ...rest, type: 'object' } as Parameters<
      typeof z.fromJSONSchema
    >[0]);

    return schema instanceof z.ZodObject ? schema : z.looseObject({});
  } catch {
    return z.looseObject({});
  }
};

/** Title, description and metadata telling the agent where a tool comes from */
export const presentTool = (method: BridgeMethod) => {
  const scoped = Boolean(method.scope && method.scope !== CORE_SCOPE);
  const origin =
    scoped && method.resource
      ? `From resource ${method.resource} (scope ${method.scope}).`
      : undefined;

  return {
    title: scoped ? `[${method.scope}] ${method.title}` : method.title,
    description: [method.description, origin].filter(Boolean).join('\n\n'),
    annotations: {
      readOnlyHint: method.kind === 'read',
      destructiveHint: method.kind === 'destructive',
      openWorldHint: false,
    },
    _meta: method.scope
      ? {
          'cybermp/scope': method.scope,
          ...(method.resource ? { 'cybermp/resource': method.resource } : {}),
        }
      : undefined,
  };
};

export type ScopeSummary = { scope: string; resource?: string; tools: number };

/**
 * Keeps the server's registered tools equal to what the bridge offers
 * (after the policy). `McpServer` tells the client about every change.
 */
export const createBridgeTools = (
  server: McpServer,
  options: { getEnv(): Env },
) => {
  const registered = new Map<string, { tool: RegisteredTool; signature: string }>();
  let current: BridgeMethod[] = [];

  /** Undefined when the name belongs to another tool (a built-in or docs tool) */
  const register = (method: BridgeMethod): RegisteredTool | undefined => {
    try {
      return registerUnchecked(method);
    } catch {
      return undefined;
    }
  };

  const registerUnchecked = (method: BridgeMethod) =>
    server.registerTool(
      method.tool,
      { ...presentTool(method), inputSchema: toInputSchema(method.inputSchema) },
      async (args: Record<string, unknown>) => {
        try {
          // Re-checked on every call: the list the client holds can be a heartbeat old
          const env = options.getEnv();
          const live = (await describeBridge({ env })).find((m) => m.tool === method.tool);

          if (!live || !isToolAllowed(live, env)) {
            throw new Error(`Unknown tool: ${method.tool} (the game server no longer offers it)`);
          }

          return text(await callBridge(live.method, args, { env }));
        } catch (e) {
          return errorResult(e);
        }
      },
    );

  return {
    /** Methods currently exposed as tools */
    methods: () => current,

    scopes(): ScopeSummary[] {
      const byScope = new Map<string, ScopeSummary>();

      for (const m of current) {
        const scope = m.scope ?? CORE_SCOPE;
        const entry = byScope.get(scope) ?? { scope, resource: m.resource, tools: 0 };

        entry.tools += 1;
        byScope.set(scope, entry);
      }

      return [...byScope.values()];
    },

    /** Applies a new list of methods (an empty list removes every bridge tool) */
    apply(methods: BridgeMethod[]) {
      const env = options.getEnv();
      const wanted = new Map(
        methods.filter((m) => m.tool && isToolAllowed(m, env)).map((m) => [m.tool, m]),
      );

      for (const [name, entry] of registered) {
        if (!wanted.has(name)) {
          entry.tool.remove();
          registered.delete(name);
        }
      }

      for (const [name, method] of wanted) {
        const signature = JSON.stringify([
          method.title,
          method.description,
          method.kind,
          method.scope,
          method.resource,
          method.inputSchema,
        ]);
        const existing = registered.get(name);

        if (existing?.signature === signature) {
          continue;
        }

        existing?.tool.remove();
        registered.delete(name);

        const tool = register(method);

        if (tool) {
          registered.set(name, { tool, signature });
        }
      }

      current = [...wanted.values()].filter((m) => registered.has(m.tool));
    },

    /** Asks the bridge; on failure (game down, reloading) the bridge tools go away */
    async refresh(env: Env, timeoutMs: number) {
      let methods: BridgeMethod[] = [];

      try {
        methods = await describeBridge({ env, timeoutMs });
      } catch {
        // Game down or hot-reloading: only the built-in tools stay
      }

      this.apply(methods);
    },
  };
};
