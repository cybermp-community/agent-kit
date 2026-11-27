import { afterEach, describe, expect, it, vi } from 'vitest';
import { type AgentInbox, type AgentInboxOptions, createAgentInbox } from '../src/inbox.ts';

describe('createAgentInbox', () => {
  let inbox: AgentInbox<{ playerId: number }> | undefined;

  afterEach(() => {
    inbox?.dispose();
    vi.useRealTimers();
  });

  const setup = (options: Partial<AgentInboxOptions<{ playerId: number }>> = {}) => {
    const replies: Array<[string, string]> = [];
    const expired: Array<[string, string]> = [];

    inbox = createAgentInbox<{ playerId: number }>({
      onReply: (request, message) => {
        replies.push([request.id, message]);
      },
      onExpire: (request, reason) => {
        expired.push([request.id, reason]);
      },
      ...options,
    });

    const take = () => inbox!.methods['agent.take'].handler({}) as any[];
    const reply = (requestId: string, message: string) =>
      inbox!.methods['agent.reply'].handler({ requestId, message }) as Promise<any>;

    return { inbox, replies, expired, take, reply };
  };

  const ask = (text = 'help') => inbox!.submit({ from: 'Neo', text, meta: { playerId: 1 } });

  it('refuses requests while no agent is attached', () => {
    setup();

    expect(ask()).toMatchObject({ ok: false, reason: 'no-agent' });
  });

  it('hands each request out once and routes the reply', async () => {
    const { take, reply, replies } = setup();

    inbox!.onPresence('connected');
    const submitted = ask('where is my car?');

    expect(submitted).toMatchObject({ ok: true, listening: false });

    const taken = take();

    expect(taken).toMatchObject([{ id: '1', from: 'Neo', text: 'where is my car?' }]);
    // meta is never shown to the agent
    expect(taken[0].meta).toBeUndefined();
    expect(take()).toEqual([]);
    expect(await reply('1', 'At the docks')).toEqual({ sent: true });
    expect(replies).toEqual([['1', 'At the docks']]);
    expect(await reply('99', 'nope')).toMatchObject({ sent: false });
  });

  it('reports a listening agent and counts pending requests in presence answers', () => {
    setup();

    inbox!.onPresence('listening');
    expect(ask()).toMatchObject({ ok: true, listening: true });
    expect(inbox!.onPresence('connected')).toEqual({ pending: 1 });
  });

  it('refuses when the queue is full', () => {
    setup({ maxQueue: 1 });

    inbox!.onPresence('connected');
    ask();

    expect(ask()).toMatchObject({ ok: false, reason: 'queue-full' });
  });

  it('expires queued requests when the agent leaves', () => {
    const { expired } = setup();

    inbox!.onPresence('connected');
    ask();
    inbox!.onPresence('disconnected');

    expect(expired).toEqual([['1', 'agent-left']]);
    expect(inbox!.pendingCount()).toBe(0);
  });

  it('expires unanswered requests after requestTtlMs', () => {
    vi.useFakeTimers();
    const { expired } = setup({ acceptWhenOffline: true, requestTtlMs: 1_000 });

    ask();
    vi.advanceTimersByTime(5_000);

    expect(expired).toEqual([['1', 'unanswered']]);
  });

  it('treats an agent silent for presenceTtlMs as gone', () => {
    vi.useFakeTimers();
    setup({ presenceTtlMs: 1_000 });

    inbox!.onPresence('connected');
    expect(inbox!.isConnected()).toBe(true);
    vi.advanceTimersByTime(1_500);

    expect(inbox!.isConnected()).toBe(false);
  });

  it('carries the queue and ids across a reload', async () => {
    setup({ acceptWhenOffline: true });
    ask('first');
    const state = inbox!.exportState();
    inbox!.dispose();

    const { take } = setup({ acceptWhenOffline: true, restore: state });

    expect(take().map((r) => r.text)).toEqual(['first']);
    expect(ask('second')).toMatchObject({ ok: true, request: { id: '2' } });
  });

  it('reports a failed delivery', async () => {
    const { take, reply } = setup({
      onReply: () => {
        throw new Error('Player left');
      },
    });

    inbox!.onPresence('connected');
    ask();
    take();

    expect(await reply('1', 'hi')).toEqual({ sent: false, reason: 'Player left' });
  });
});
