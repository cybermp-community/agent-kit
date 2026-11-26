import { timingSafeEqual } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import z from 'zod';

/** Thrown by methods for expected failures; the message is shown to the caller as-is */
export class BridgeError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'BridgeError';
  }
}

/**
 * `instanceof` is not enough, because some runtimes (and separate bundles of
 * this library, one per resource) do not keep the prototype of `Error`
 * subclasses.
 */
export const isBridgeError = (e: unknown): e is BridgeError =>
  e instanceof BridgeError || (e as Error | undefined)?.name === 'BridgeError';

/**
 * - `read`: no side effects
 * - `write`: changes game state
 * - `destructive`: removes or disconnects things (kick, wipe...)
 */
export type MethodKind = 'read' | 'write' | 'destructive';

export type MethodDef<TSchema extends z.ZodType = z.ZodType> = {
  /**
   * Name of the MCP tool exposed for this method (snake_case). Leave it out
   * for internal methods, so they stay callable over RPC but are not listed.
   */
  tool?: string;
  title?: string;
  description?: string;
  kind: MethodKind;
  params: TSchema;
  /**
   * JSON Schema shown to the agent instead of one derived from `params`.
   * Used for methods that run in another resource (the schema was made there).
   */
  inputSchema?: Record<string, unknown>;
  /**
   * Set by the provider host for methods contributed by another resource
   * ({@link CORE_SCOPE} when left out). See {@link scopedToolName}.
   */
  scope?: string;
  /** Resource the method runs in, set by the provider host */
  resource?: string;
  handler(params: z.infer<TSchema>): unknown | Promise<unknown>;
};

/** Scope of the methods the bridge resource itself serves */
export const CORE_SCOPE = 'core';
/**
 * Between a provider's scope and its tool name: `economy__set_money`.
 * MCP clients such as Claude only allow `[A-Za-z0-9_-]` in tool names, and a
 * single `_` would be lost among snake_case words.
 */
export const SCOPE_SEPARATOR = '__';
/** Lower-case letters, digits and `-`, starting with a letter, 1-20 characters */
export const SCOPE_PATTERN = /^[a-z][a-z0-9-]{0,19}$/;
/** snake_case */
export const TOOL_PATTERN = /^[a-z][a-z0-9_]*$/;
/**
 * Longest tool name a provider may produce. Claude allows 64 characters, and
 * clients prefix the server key (`mcp__cybermp__` is 14 of them).
 */
export const MAX_TOOL_NAME_LENGTH = 48;

/** Name the agent sees for a provider tool. Core tools keep their bare name */
export const scopedToolName = (scope: string, tool: string) =>
  scope === CORE_SCOPE ? tool : `${scope}${SCOPE_SEPARATOR}${tool}`;

/** A resource name turned into a valid scope (`My_Gamemode` -> `my-gamemode`) */
export const defaultScope = (resource: string) => {
  const scope = resource
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^[^a-z]+/, '')
    .slice(0, 20)
    .replace(/-+$/, '');

  return SCOPE_PATTERN.test(scope) ? scope : 'resource';
};

export type MethodSource =
  | Record<string, MethodDef>
  | (() => Record<string, MethodDef> | Promise<Record<string, MethodDef>>);

export const defineMethod = <TSchema extends z.ZodType>(
  def: MethodDef<TSchema>,
) => def as unknown as MethodDef;

export type BridgeLogger = {
  info?(message: string): void;
  success?(message: string): void;
  warn?(message: string, detail?: unknown): void;
};

/**
 * `connected` is sent every few seconds while an MCP client session is open,
 * `listening` by helpers that wait for events, and `disconnected` once when
 * the session ends.
 */
export type PresenceState = 'connected' | 'listening' | 'disconnected';

export type AuditEntry = {
  time: string;
  method: string;
  tool?: string;
  kind: MethodKind;
  params: unknown;
  ok: boolean;
  error?: string;
  ms: number;
};

/** Appends one JSON line per audited call to `path` */
export const fileAudit = (path: string) => (entry: AuditEntry) => {
  try {
    appendFileSync(path, `${JSON.stringify(entry, jsonReplacer)}\n`);
  } catch {
    // An unwritable audit file must not break the game
  }
};

export type BridgeOptions = {
  /** Shared secret. The bridge stays disabled when empty */
  token: string;
  /**
   * Method name (e.g. `players.list`) -> definition. A function is called on
   * every request, so the set can change while the bridge runs (see
   * {@link createProviderHost}).
   */
  methods: MethodSource;
  port?: number;
  /**
   * Wait this long before listening. CyberMP servers have crashed right after
   * start when the first HTTP connections came in (V8 isolate mismatch in the
   * engine, not in this code), so a resource can keep the port closed while
   * the server settles.
   */
  listenDelayMs?: number;
  /** Defaults to 127.0.0.1. Do not expose this to a network */
  host?: string;
  logger?: BridgeLogger;
  /**
   * Called on every presence report. The return value is sent back to the
   * caller (e.g. a pending-events count for a waiter helper).
   */
  onPresence?(state: PresenceState): unknown;
  /**
   * Called after every `write` and `destructive` call (reads are not
   * audited), whether it succeeded or not. See {@link fileAudit}.
   */
  onAudit?(entry: AuditEntry): void;
};

export type Bridge = { stop(): void };

export const DEFAULT_PORT = 2080;
const DEFAULT_HOST = '127.0.0.1';
const MAX_BODY_BYTES = 64 * 1024;
const LISTEN_RETRIES = 20;
const LISTEN_RETRY_DELAY_MS = 500;

export const jsonReplacer = (_key: string, value: unknown) =>
  typeof value === 'bigint' ? value.toString() : value;

/** `includeInternal`: also list methods without a `tool` (for provider registration) */
export const describeMethods = (
  methods: Record<string, MethodDef>,
  includeInternal = false,
) =>
  Object.entries(methods).flatMap(([method, def]) =>
    def.tool || includeInternal
      ? [
          {
            method,
            tool: def.tool,
            title: def.title ?? def.tool ?? method,
            description: def.description ?? '',
            kind: def.kind,
            scope: def.scope ?? CORE_SCOPE,
            ...(def.resource ? { resource: def.resource } : {}),
            inputSchema:
              def.inputSchema ??
              z.toJSONSchema(def.params, {
                io: 'input',
                unrepresentable: 'any',
              }),
          },
        ]
      : [],
  );

const readBody = (req: IncomingMessage) =>
  new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new BridgeError('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });

const send = (res: ServerResponse, status: number, body: unknown) => {
  const json = JSON.stringify(body, jsonReplacer);

  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(json),
  });
  res.end(json);
};

/**
 * Starts the bridge with `POST /rpc {"method", "params"}` with
 * `Authorization: Bearer <token>`. The built-in method `bridge.describe`
 * lists every method with its JSON Schema and scope, so the MCP server can
 * expose them as tools without knowing the game server.
 */
export const createBridge = (options: BridgeOptions): Bridge => {
  const { token, logger = {} } = options;
  const getMethods = async () =>
    typeof options.methods === 'function' ? options.methods() : options.methods;
  const port = options.port || DEFAULT_PORT;
  const host = options.host ?? DEFAULT_HOST;

  if (!token) {
    logger.info?.('MCP bridge disabled (no token configured)');
    return { stop() {} };
  }

  const expected = Buffer.from(token);

  const isAuthorized = (req: IncomingMessage) => {
    const given = Buffer.from(
      (req.headers.authorization ?? '').replace(/^Bearer\s+/i, ''),
    );

    return given.length === expected.length && timingSafeEqual(given, expected);
  };

  const call = async (method: string, rawParams: unknown) => {
    if (method === 'bridge.describe') {
      return describeMethods(await getMethods());
    }

    if (method === 'bridge.presence') {
      const { state } = z
        .object({ state: z.enum(['connected', 'listening', 'disconnected']) })
        .parse(rawParams ?? {});

      return (await options.onPresence?.(state)) ?? null;
    }

    const def = (await getMethods())[method];

    if (!def) {
      throw new BridgeError(`Unknown method: ${method}`);
    }

    const parsed = def.params.safeParse(rawParams ?? {});

    if (!parsed.success) {
      throw new BridgeError(`Invalid params: ${z.prettifyError(parsed.error)}`);
    }

    if (def.kind === 'read') {
      return def.handler(parsed.data);
    }

    logger.info?.(`MCP ${def.kind} call: ${method} ${JSON.stringify(parsed.data, jsonReplacer)}`);

    const started = Date.now();
    const audit = (ok: boolean, error?: unknown) =>
      options.onAudit?.({
        time: new Date(started).toISOString(),
        method,
        tool: def.tool,
        kind: def.kind,
        params: parsed.data,
        ok,
        error: error === undefined ? undefined : ((error as Error)?.message ?? String(error)),
        ms: Date.now() - started,
      });

    try {
      const result = await def.handler(parsed.data);

      audit(true);

      return result;
    } catch (e) {
      audit(false, e);

      throw e;
    }
  };

  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== 'POST' || req.url !== '/rpc') {
      return send(res, 404, { ok: false, error: 'Not found' });
    }

    if (!isAuthorized(req)) {
      return send(res, 401, { ok: false, error: 'Unauthorized' });
    }

    let method = '?';

    try {
      const body = JSON.parse(await readBody(req)) as {
        method?: unknown;
        params?: unknown;
      };

      if (typeof body?.method !== 'string') {
        throw new BridgeError('Body must be {"method": string, "params"?: object}');
      }
      method = body.method;

      send(res, 200, { ok: true, result: await call(method, body.params) });
    } catch (e) {
      const known = isBridgeError(e) || e instanceof SyntaxError;

      if (!known) {
        logger.warn?.(`Bridge method ${method} failed`, e);
      }

      send(res, 200, {
        ok: false,
        error: known
          ? (e as Error).message
          : `Internal error in ${method}: ${(e as Error)?.message ?? e}`,
      });
    }
  };

  let server: Server | undefined;
  let stopped = false;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  /** Hot reloads can race the previous instance's socket close */
  const listen = (attempt = 1) => {
    if (stopped) {
      return;
    }

    const candidate = createServer((req, res) => {
      void handle(req, res);
    });

    candidate.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE' && attempt < LISTEN_RETRIES) {
        retryTimer = setTimeout(() => listen(attempt + 1), LISTEN_RETRY_DELAY_MS);
        return;
      }

      logger.warn?.(`MCP bridge could not listen on ${host}:${port}`, err.message);
    });

    candidate.listen(port, host, () => {
      server = candidate;
      logger.success?.(`MCP bridge listening on http://${host}:${port}/rpc`);
    });
  };

  if (options.listenDelayMs && options.listenDelayMs > 0) {
    logger.info?.(`MCP bridge opens in ${Math.round(options.listenDelayMs / 1000)} s (server just started)`);
    retryTimer = setTimeout(() => listen(), options.listenDelayMs);
  } else {
    listen();
  }

  return {
    stop() {
      stopped = true;

      if (retryTimer) {
        clearTimeout(retryTimer);
      }

      server?.closeAllConnections();
      server?.close();
      server = undefined;
    },
  };
};

/** The slice of the `mp` global that {@link basicMethods} needs */
type BasicMp = {
  config: { max_players: number };
  players: {
    toArray(): BasicPlayer[];
    exists(id: number): boolean;
    at(id: number): BasicPlayer;
  };
};

type BasicPlayer = {
  id: number;
  nickname: string;
  ping: number;
  health: number;
  position: unknown;
  dimension: number;
  kick(reason: string): void;
  mute(): void;
};

/**
 * Ready-made methods that work on any CyberMP server, including
 * `server.info` (used by `server_status`), `list_players`, `kick_player`,
 * `mute_player` and `set_player_dimension`.
 * Spread them into `methods` and add your own on top.
 */
export const basicMethods = (mp: BasicMp): Record<string, MethodDef> => {
  const getPlayer = (id: number) => {
    if (!mp.players.exists(id)) {
      throw new BridgeError(`Player ${id} is not online`);
    }

    return mp.players.at(id);
  };

  return {
    'server.info': defineMethod({
      kind: 'read',
      params: z.object({}).default({}),
      handler: () => ({
        uptimeSec: Math.round(process.uptime()),
        players: mp.players.toArray().length,
        maxPlayers: mp.config.max_players,
        time: new Date().toISOString(),
      }),
    }),

    'players.list': defineMethod({
      tool: 'list_players',
      title: 'List players',
      description:
        'Online players: id, nickname, ping, health, position, dimension.',
      kind: 'read',
      params: z.object({}).default({}),
      handler: () =>
        mp.players.toArray().map((p) => ({
          id: p.id,
          nickname: p.nickname,
          ping: p.ping,
          health: p.health,
          position: p.position,
          dimension: p.dimension,
        })),
    }),

    'player.kick': defineMethod({
      tool: 'kick_player',
      title: 'Kick player',
      description: 'Disconnects a player from the server.',
      kind: 'destructive',
      params: z.object({
        playerId: z.number().int().nonnegative().describe('Server player id'),
        reason: z.string().max(200).default('Kicked by server'),
      }),
      handler: ({ playerId, reason }) => {
        getPlayer(playerId).kick(reason);

        return { kicked: true };
      },
    }),

    'player.mute': defineMethod({
      tool: 'mute_player',
      title: 'Mute player',
      description:
        'Mutes a player (voice). The server API has no unmute: it lasts until the player reconnects, if then.',
      kind: 'destructive',
      params: z.object({
        playerId: z.number().int().nonnegative().describe('Server player id'),
      }),
      handler: ({ playerId }) => {
        getPlayer(playerId).mute();

        return { muted: true };
      },
    }),

    'player.setDimension': defineMethod({
      tool: 'set_player_dimension',
      title: 'Set player dimension',
      description:
        'Moves a player to another virtual world. Players only see each other within the same dimension. A game mode that uses dimensions for its own matches may not expect this: check list_players first.',
      kind: 'write',
      params: z.object({
        playerId: z.number().int().nonnegative().describe('Server player id'),
        dimension: z.number().int().min(0),
      }),
      handler: ({ playerId, dimension }) => {
        const player = getPlayer(playerId);
        const previous = player.dimension;

        player.dimension = dimension;

        return { previous, dimension };
      },
    }),
  };
};
export * from './inbox.ts';
export * from './events.ts';
export * from './entities.ts';
export * from './resources.ts';
export * from './rpc.ts';
