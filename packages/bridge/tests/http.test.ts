import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createServer } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import z from 'zod';
import { type AuditEntry, type Bridge, createBridge, defineMethod } from '../src/index.ts';

const TOKEN = 'test-token';

/** A free localhost port */
const freePort = () =>
  new Promise<number>((resolve) => {
    const probe = createServer();

    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as AddressInfo;
      probe.close(() => resolve(port));
    });
  });

const call = async (port: number, body: unknown, token = TOKEN) => {
  const response = await fetch(`http://127.0.0.1:${port}/rpc`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  return { status: response.status, body: (await response.json()) as any };
};

/** Raw request, for headers and bodies `fetch` would not send as-is */
const rawCall = (port: number, body: string, authorization?: string) =>
  new Promise<{ status: number; body: any }>((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port,
        path: '/rpc',
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(authorization === undefined ? {} : { authorization }),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];

        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, body: JSON.parse(Buffer.concat(chunks).toString()) }),
        );
      },
    );

    // The server may close before the whole upload is out, the answer is what counts
    req.on('error', (e: NodeJS.ErrnoException) =>
      e.code === 'EPIPE' || e.code === 'ECONNRESET' ? undefined : reject(e),
    );
    req.end(body);
  });

/** The bridge logs once it listens */
const started = async (options: Omit<Parameters<typeof createBridge>[0], 'logger' | 'port'>) => {
  const port = await freePort();
  let bridge!: Bridge;

  await new Promise<void>((resolve) => {
    bridge = createBridge({ ...options, port, logger: { success: () => resolve() } });
  });

  return { bridge, port };
};

describe('createBridge over HTTP', () => {
  let bridge: Bridge | undefined;
  const audit: AuditEntry[] = [];

  afterEach(() => {
    bridge?.stop();
    audit.length = 0;
  });

  const methods = {
    'demo.echo': defineMethod({
      tool: 'echo',
      kind: 'read',
      params: z.object({ text: z.string() }),
      handler: ({ text }) => ({ text }),
    }),
    'demo.big': defineMethod({
      tool: 'big',
      kind: 'read',
      params: z.object({}).default({}),
      handler: () => ({ hash: 7454566152498118096n }),
    }),
    'demo.boom': defineMethod({
      tool: 'boom',
      kind: 'destructive',
      params: z.object({}).default({}),
      handler: () => {
        throw new Error('kaboom');
      },
    }),
  };

  it('rejects a wrong token', async () => {
    let port: number;
    ({ bridge, port } = await started({ token: TOKEN, methods }));

    expect((await call(port, { method: 'bridge.describe' }, 'nope')).status).toBe(401);
  });

  it('describes methods with their scope and schema', async () => {
    let port: number;
    ({ bridge, port } = await started({ token: TOKEN, methods }));

    const { body } = await call(port, { method: 'bridge.describe' });
    const echo = body.result.find((m: any) => m.tool === 'echo');

    expect(echo).toMatchObject({ method: 'demo.echo', kind: 'read', scope: 'core' });
    expect(echo.inputSchema.properties.text.type).toBe('string');
  });

  it('calls methods, validates params and serializes bigints', async () => {
    let port: number;
    ({ bridge, port } = await started({ token: TOKEN, methods }));

    expect((await call(port, { method: 'demo.echo', params: { text: 'hi' } })).body).toEqual({
      ok: true,
      result: { text: 'hi' },
    });
    expect((await call(port, { method: 'demo.echo', params: {} })).body.error).toMatch(
      /Invalid params/,
    );
    expect((await call(port, { method: 'demo.big' })).body.result).toEqual({
      hash: '7454566152498118096',
    });
    expect((await call(port, { method: 'nope' })).body.error).toBe('Unknown method: nope');
  });

  it('audits destructive calls, failed ones included', async () => {
    let port: number;
    ({ bridge, port } = await started({
      token: TOKEN,
      methods,
      onAudit: (entry) => audit.push(entry),
    }));

    const { body } = await call(port, { method: 'demo.boom' });

    expect(body).toEqual({ ok: false, error: 'Internal error in demo.boom: kaboom' });
    expect(audit).toMatchObject([{ method: 'demo.boom', kind: 'destructive', ok: false, error: 'kaboom' }]);
  });

  it('forwards presence', async () => {
    const seen: Array<[string, unknown]> = [];
    let port: number;
    ({ bridge, port } = await started({
      token: TOKEN,
      methods,
      onPresence: (state, meta) => {
        seen.push([state, meta]);
        return { pending: 2 };
      },
    }));

    expect((await call(port, { method: 'bridge.presence', params: { state: 'connected' } })).body).toEqual({
      ok: true,
      result: { pending: 2 },
    });
    expect(
      (
        await call(port, {
          method: 'bridge.presence',
          params: { state: 'disconnected', session: 's1', seq: 2 },
        })
      ).body,
    ).toEqual({
      ok: true,
      result: { pending: 2 },
    });
    expect(seen).toEqual([
      ['connected', undefined],
      ['disconnected', { session: 's1', seq: 2 }],
    ]);
  });

  it('answers an oversized body with a JSON error instead of dropping the connection', async () => {
    let port: number;
    ({ bridge, port } = await started({ token: TOKEN, methods }));

    const huge = JSON.stringify({ method: 'demo.echo', params: { text: 'x'.repeat(100 * 1024) } });
    const { status, body } = await rawCall(port, huge, `Bearer ${TOKEN}`);

    expect(status).toBe(200);
    expect(body).toEqual({ ok: false, error: 'Request body too large (max 65536 bytes)' });
    // Still serving afterwards
    expect((await call(port, { method: 'demo.echo', params: { text: 'ok' } })).body.ok).toBe(true);
  });

  it('requires the Bearer scheme', async () => {
    let port: number;
    ({ bridge, port } = await started({ token: TOKEN, methods }));
    const body = JSON.stringify({ method: 'bridge.describe' });

    expect((await rawCall(port, body, TOKEN)).status).toBe(401);
    expect((await rawCall(port, body)).status).toBe(401);
    expect((await rawCall(port, body, `Basic ${TOKEN}`)).status).toBe(401);
    expect((await rawCall(port, body, `Bearer ${TOKEN}x`)).status).toBe(401);
    expect((await rawCall(port, body, `bearer ${TOKEN}`)).status).toBe(200);
  });

  it.each(['__proto__', 'constructor', 'toString', 'hasOwnProperty'])(
    'treats %s as an unknown method',
    async (method) => {
      let port: number;
      ({ bridge, port } = await started({ token: TOKEN, methods }));

      expect((await call(port, { method })).body).toEqual({
        ok: false,
        error: `Unknown method: ${method}`,
      });
    },
  );

  it('reports invalid presence params as such', async () => {
    let port: number;
    ({ bridge, port } = await started({ token: TOKEN, methods, onPresence: () => null }));

    const { body } = await call(port, { method: 'bridge.presence', params: { state: 'asleep' } });

    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/^Invalid params/);
  });

  it('retries while the port is taken (EADDRINUSE), then listens', async () => {
    const port = await freePort();
    const blocker = createServer();

    await new Promise<void>((resolve) => blocker.listen(port, '127.0.0.1', resolve));

    const lines: string[] = [];
    const listening = new Promise<void>((resolve) => {
      bridge = createBridge({
        token: TOKEN,
        methods,
        port,
        logger: { success: () => resolve(), warn: (m) => lines.push(m) },
      });
    });

    // Freed after the first attempt failed (retries every 500 ms)
    await new Promise((resolve) => setTimeout(resolve, 200));
    await new Promise<void>((resolve) => blocker.close(() => resolve()));
    await listening;

    expect(lines).toEqual([]);
    expect((await call(port, { method: 'demo.echo', params: { text: 'hi' } })).body.ok).toBe(true);
  });

  it('does not keep the port when stopped before it listens', async () => {
    const port = await freePort();
    const lines: string[] = [];

    createBridge({
      token: TOKEN,
      methods,
      port,
      logger: { success: (m) => lines.push(m) },
    }).stop();

    await new Promise((resolve) => setTimeout(resolve, 100));

    // The port is free again
    const probe = createServer();
    await new Promise<void>((resolve, reject) => {
      probe.once('error', reject);
      probe.listen(port, '127.0.0.1', () => probe.close(() => resolve()));
    });
    expect(lines).toEqual([]);
  });

  it('refuses an invalid port instead of throwing', () => {
    const lines: string[] = [];

    expect(() =>
      createBridge({ token: TOKEN, methods, port: 70_000, logger: { warn: (m) => lines.push(m) } }),
    ).not.toThrow();
    expect(lines).toEqual(['MCP bridge disabled: invalid port 70000 (use 1-65535)']);
  });

  it('stays off without a token', () => {
    const lines: string[] = [];

    createBridge({ token: '', methods, logger: { info: (m) => lines.push(m) } }).stop();

    expect(lines).toEqual(['MCP bridge disabled (no token configured)']);
  });
});
