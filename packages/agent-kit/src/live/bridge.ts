import { type Env, readEnv } from './env.js';

export class BridgeError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'BridgeError';
  }
}

export const DEFAULT_BRIDGE_PORT = 2080;
const TIMEOUT_MS = 15_000;

type BridgeResponse = { ok: true; result: unknown } | { ok: false; error: string };

/** The bridge is configured: there is a token to call it with */
export const hasBridgeToken = (env: Env) => Boolean(env.DEVTOOLS_TOKEN);

/**
 * Calls the bridge (`@cybermp-community/agent-kit-bridge`) running inside a server
 * resource, on 127.0.0.1.
 */
export const callBridge = async (
  method: string,
  params: Record<string, unknown> = {},
  options: { env?: Env; timeoutMs?: number; signal?: AbortSignal } = {},
) => {
  const env = options.env ?? readEnv();
  const token = env.DEVTOOLS_TOKEN;
  const port = Number.parseInt(env.DEVTOOLS_PORT ?? '', 10) || DEFAULT_BRIDGE_PORT;

  if (!token) {
    throw new BridgeError(
      'DEVTOOLS_TOKEN is not set (environment or <root>/.env), so the game bridge is disabled',
    );
  }

  // `AbortSignal.any` needs Node 20.3, and the CLI supports 20.0
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), options.timeoutMs ?? TIMEOUT_MS);
  const cancel = () => controller.abort();
  options.signal?.addEventListener('abort', cancel, { once: true });

  // A signal that is already aborted must not send the request at all
  if (options.signal?.aborted) {
    controller.abort();
  }

  try {
    let response: Response;

    try {
      response = await fetch(`http://127.0.0.1:${port}/rpc`, {
        method: 'POST',
        headers: {
          authorization: ['Bearer', token].join(' '),
          'content-type': 'application/json',
        },
        body: JSON.stringify({ method, params }),
        signal: controller.signal,
      });
    } catch (e) {
      const cause = (e as { cause?: { code?: string } })?.cause?.code ?? (e as Error).name;

      throw new BridgeError(
        `Game bridge unreachable at 127.0.0.1:${port} (${cause}). Either the server is stopped, the resource hosting the bridge is restarting (retry in a few seconds), or it does not run the bridge. Use server_status to check the process.`,
      );
    }

    if (response.status === 401) {
      throw new BridgeError(
        'The game bridge rejected the token: DEVTOOLS_TOKEN differs from the one the server loaded at startup',
      );
    }

    let body: Partial<BridgeResponse> | null = null;

    try {
      // The deadline covers the body too: a bridge that sends headers and
      // stalls must not hold a caller (or `stop()`) past the timeout
      body = (await response.json()) as Partial<BridgeResponse> | null;
    } catch {
      // Not JSON, so we handle it below
    }

    if (!body || typeof body !== 'object' || typeof body.ok !== 'boolean') {
      throw new BridgeError(
        `127.0.0.1:${port} answered HTTP ${response.status} without a bridge reply: another program may be using the port (see DEVTOOLS_PORT), or the bridge is outdated`,
      );
    }

    if (!body.ok) {
      throw new BridgeError(String((body as { error?: unknown }).error ?? `HTTP ${response.status}`));
    }

    return body.result;
  } finally {
    clearTimeout(deadline);
    options.signal?.removeEventListener('abort', cancel);
  }
};

/** One entry of `bridge.describe` */
export type BridgeMethod = {
  method: string;
  tool: string;
  title: string;
  description: string;
  kind: 'read' | 'write' | 'destructive';
  inputSchema: Record<string, unknown>;
  /** `core` or the providing resource's scope. Missing from older bridges */
  scope?: string;
  /** Providing resource; missing for core methods */
  resource?: string;
};

/** Methods the running bridge offers; each becomes an MCP tool */
export const describeBridge = async (options: { env?: Env; timeoutMs?: number } = {}) =>
  (await callBridge('bridge.describe', {}, options)) as BridgeMethod[];
