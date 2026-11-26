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
    const seen: string[] = [];
    let port: number;
    ({ bridge, port } = await started({
      token: TOKEN,
      methods,
      onPresence: (state) => {
        seen.push(state);
        return { pending: 2 };
      },
    }));

    expect((await call(port, { method: 'bridge.presence', params: { state: 'connected' } })).body).toEqual({
      ok: true,
      result: { pending: 2 },
    });
    expect(seen).toEqual(['connected']);
  });

  it('stays off without a token', () => {
    const lines: string[] = [];

    createBridge({ token: '', methods, logger: { info: (m) => lines.push(m) } }).stop();

    expect(lines).toEqual(['MCP bridge disabled (no token configured)']);
  });
});
