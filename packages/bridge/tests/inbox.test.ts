import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
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
    vi.useFakeTimers();
    const { expired } = setup({ presenceTtlMs: 1_000 });

    inbox!.onPresence('connected');
    ask();
    inbox!.onPresence('disconnected');

    // Queued requests get the presence TTL as grace: an out-of-order report may
    // hand the inbox straight back, and the request must survive that window
    expect(expired).toEqual([]);
    expect(inbox!.pendingCount()).toBe(1);

    vi.advanceTimersByTime(1_000);
    inbox!.pendingCount();
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

  it('ignores stale disconnect after reconnect', () => {
    vi.useFakeTimers();
    const { expired } = setup({ presenceTtlMs: 1_000 });

    inbox!.onPresence('connected', { session: 'session-a', seq: 1 });
    expect(inbox!.isConnected()).toBe(true);

    vi.advanceTimersByTime(500);
    inbox!.onPresence('connected', { session: 'session-b', seq: 1 });
    // One report only marks a newcomer as waiting: a stopped process sends one
    inbox!.onPresence('connected', { session: 'session-b', seq: 2 });
    expect(inbox!.exportState().activeSession).toBe('session-b');
    expect(ask('for b')).toMatchObject({ ok: true });

    // Late disconnect from session A must not take session B offline or expire B's queue
    inbox!.onPresence('disconnected', { session: 'session-a', seq: 2 });

    expect(inbox!.isConnected()).toBe(true);
    expect(expired).toEqual([]);
    expect(inbox!.pendingCount()).toBe(1);
  });

  it('expires session presence by TTL when no disconnect arrives and ignores stale listening', () => {
    vi.useFakeTimers();
    const { expired } = setup({ presenceTtlMs: 1_000, listeningTtlMs: 500 });

    inbox!.onPresence('connected', { session: 'session-a', seq: 1 });
    inbox!.onPresence('listening', { session: 'session-a', seq: 2 });
    expect(inbox!.isConnected()).toBe(true);
    expect(inbox!.isListening()).toBe(true);
    expect(ask('waiting')).toMatchObject({ ok: true, listening: true });

    vi.advanceTimersByTime(1_500);
    expect(inbox!.isConnected()).toBe(false);
    expect(inbox!.isListening()).toBe(false);
    // Requests wait out the presence TTL of grace before the inbox expires them
    expect(inbox!.pendingCount()).toBe(1);
    vi.advanceTimersByTime(1_000);
    expect(inbox!.pendingCount()).toBe(0);
    expect(expired).toEqual([['1', 'agent-left']]);

    // Explicit disconnect is terminal: stale listening from old session must not revive online
    inbox!.onPresence('connected', { session: 'session-b', seq: 1 });
    inbox!.onPresence('disconnected', { session: 'session-b', seq: 2 });
    expect(inbox!.isConnected()).toBe(false);

    inbox!.onPresence('listening', { session: 'session-b', seq: 1 });
    expect(inbox!.isConnected()).toBe(false);
    expect(inbox!.isListening()).toBe(false);

    // A retired session's late report may briefly own the inbox, but the live
    // session takes it back on its next beat instead of staying offline
    inbox!.onPresence('connected', { session: 'session-c', seq: 1 });
    inbox!.onPresence('listening', { session: 'session-a', seq: 3 });
    expect(inbox!.isConnected()).toBe(true);
    inbox!.onPresence('connected', { session: 'session-c', seq: 2 });
    expect(inbox!.exportState().activeSession).toBe('session-c');
    expect(inbox!.isConnected()).toBe(true);
  });

  it('restores session authority, sequence and tombstones across a reload', () => {
    vi.useFakeTimers();
    const options = { presenceTtlMs: 1_000 };
    setup(options);
    inbox!.onPresence('connected', { session: 'first', seq: 10 });
    inbox!.onPresence('disconnected', { session: 'ended', seq: 1 });
    vi.advanceTimersByTime(500);
    inbox!.onPresence('connected', { session: 'current', seq: 2 });
    // A newcomer takes over on its second report
    inbox!.onPresence('connected', { session: 'current', seq: 3 });

    const restore = inbox!.exportState();
    inbox!.dispose();
    setup({ ...options, restore });
    expect(inbox!.exportState().activeSession).toBe('current');
    inbox!.onPresence('listening', { session: 'current', seq: 4 });
    expect(inbox!.isListening()).toBe(true);

    // A newer process waits for its second report, then takes over
    inbox!.onPresence('listening', { session: 'fresh-competitor', seq: 1 });
    expect(inbox!.exportState().activeSession).toBe('current');
    inbox!.onPresence('listening', { session: 'fresh-competitor', seq: 2 });
    expect(inbox!.exportState().activeSession).toBe('fresh-competitor');

    inbox!.onPresence('listening', { session: 'current', seq: 5 });
    inbox!.onPresence('listening', { session: 'current', seq: 6 });
    expect(inbox!.exportState().activeSession).toBe('current');
    expect(inbox!.isListening()).toBe(true);
    inbox!.onPresence('disconnected', { session: 'current', seq: 7 });
    expect(inbox!.isConnected()).toBe(false);

    // A session terminated before the reload stays dead; a retired one may return
    inbox!.onPresence('connected', { session: 'ended', seq: 2 });
    expect(inbox!.isConnected()).toBe(false);
    inbox!.onPresence('connected', { session: 'first', seq: 11 });
    expect(inbox!.isConnected()).toBe(true);
  });

  it('retires a killed session after presenceTtlMs so a legacy caller works again', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    setup({ presenceTtlMs: 1_000 });

    inbox!.onPresence('connected', { session: 'killed', seq: 1 });
    expect(inbox!.isConnected()).toBe(true);

    // SIGKILL: no `disconnected` ever arrives
    vi.advanceTimersByTime(1_500);
    expect(inbox!.isConnected()).toBe(false);

    // A legacy sessionless caller must not stay locked out
    inbox!.onPresence('listening');
    expect(inbox!.isConnected()).toBe(true);
    expect(inbox!.isListening()).toBe(true);
    expect(ask('legacy works')).toMatchObject({ ok: true, listening: true });
  });

  it('keeps an explicitly disconnected session tombstoned until time-based eviction', () => {
    vi.useFakeTimers();
    setup({ presenceTtlMs: 1_000 });
    inbox!.onPresence('connected', { session: 'ended', seq: 3 });
    inbox!.onPresence('disconnected', { session: 'ended', seq: 2 });
    expect(inbox!.isConnected()).toBe(false);

    vi.advanceTimersByTime(5 * 60_000);
    inbox!.onPresence('listening', { session: 'ended', seq: 4 });
    expect(inbox!.isConnected()).toBe(false);

    vi.advanceTimersByTime(1);
    inbox!.pendingCount();
    inbox!.onPresence('connected', { session: 'ended', seq: 5 });
    expect(inbox!.isConnected()).toBe(true);
  });

  it('evicts the oldest updatedAt record first when the safety ceiling trims aged records', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(400_000));
    vi.advanceTimersByTime(0);

    // Restored state with insertion order deliberately opposite to recency;
    // every record is older than the ceiling floor but inside retention.
    const restored = setup({
      presenceTtlMs: 1_000,
      restore: {
        nextId: 1,
        queue: [],
        delivered: [],
        lastSeenAt: 0,
        lastListeningAt: 0,
        sessions: [
          { session: 'newest', lastSeq: 9, status: 'terminated', updatedAt: 390_000 },
          ...Array.from({ length: 10_001 }, (_, index) => ({
            session: `old-${index}`,
            lastSeq: 1,
            status: 'terminated' as const,
            updatedAt: 300_000 + index,
          })),
        ],
      },
    });

    // Records become evictable only after both the delivery window and the
    // sweep count have passed
    vi.advanceTimersByTime(70_000);
    restored.inbox.pendingCount();

    const remaining = restored.inbox
      .exportState()
      .sessions!.map((entry) => entry.session);

    expect(remaining.length).toBeLessThanOrEqual(10_000);
    expect(remaining).toContain('newest');
    expect(remaining).not.toContain('old-0');
  });

  it('ignores sessionless legacy reports only while a session is active', () => {
    vi.useFakeTimers();
    setup();
    inbox!.onPresence('listening');
    expect(inbox!.isListening()).toBe(true);

    inbox!.onPresence('connected', { session: 'tracked', seq: 1 });
    inbox!.onPresence('listening');
    inbox!.onPresence('disconnected');
    expect(inbox!.isConnected()).toBe(true);
    expect(inbox!.isListening()).toBe(false);

    inbox!.onPresence('disconnected', { session: 'tracked', seq: 2 });
    inbox!.onPresence('listening');
    expect(inbox!.isListening()).toBe(true);
  });

  it('keeps session records younger than the delivery window out of the safety ceiling', () => {
    vi.useFakeTimers();
    setup({ presenceTtlMs: 1_000 });
    inbox!.onPresence('connected', { session: 'active', seq: 1 });
    inbox!.onPresence('disconnected', { session: 'oldest', seq: 1 });
    for (let index = 0; index < 10_001; index++) {
      inbox!.onPresence('disconnected', { session: `other-${index}`, seq: 1 });
    }

    // Past the presence TTL but inside the delivery window (both the age and
    // the sweep count are checked), so the ceiling must not drop these
    vi.advanceTimersByTime(55_000);
    inbox!.onPresence('connected', { session: 'active', seq: 2 });
    inbox!.onPresence('disconnected', { session: 'newest', seq: 1 });

    const state = inbox!.exportState();
    const ids = state.sessions!.map(({ session }) => session);
    expect(ids.length).toBeGreaterThan(10_000);
    expect(ids).toContain('oldest');
    expect(ids).toContain('other-0');
    expect(ids).toContain('newest');
    expect(ids).toContain('active');
    expect(state.activeSession).toBe('active');

    // Once the delivery window has passed, the ceiling trims the oldest first
    vi.advanceTimersByTime(10_000);
    inbox!.pendingCount();
    const trimmed = inbox!.exportState().sessions!.map(({ session }) => session);
    expect(trimmed.length).toBeLessThanOrEqual(10_000);
    expect(trimmed).not.toContain('other-0');
    expect(trimmed).toContain('newest');
  });

  it('does not drop a tombstone on a forward clock step alone', () => {
    vi.useFakeTimers();
    setup({ presenceTtlMs: 1_000 });
    inbox!.onPresence('disconnected', { session: 'ended', seq: 1 });

    // Six minutes forward in one jump, with no sweep passing in between: the
    // retention age says "old", but the report may still be on the wire, so the
    // tombstone has to survive until the delivery window has actually elapsed
    vi.setSystemTime(Date.now() + 6 * 60_000);
    // Polling is not elapsed time: neither the wall clock nor repeated calls
    // may shorten the window
    for (let poll = 0; poll < 20; poll++) {
      inbox!.pendingCount();
    }

    expect(inbox!.exportState().sessions!.map(({ session }) => session)).toContain('ended');
  });

  it('promotes a waiting session across a hot reload instead of dropping its queue', () => {
    vi.useFakeTimers();
    const options = { presenceTtlMs: 1_000 };
    setup(options);
    inbox!.onPresence('connected', { session: 'owner', seq: 1 });
    inbox!.onPresence('connected', { session: 'waiter', seq: 1 });
    ask('for the waiter');

    const restore = inbox!.exportState();
    inbox!.dispose();
    setup({ ...options, restore });

    // The owner stops right after the reload; the waiter takes over and its
    // queued request survives
    inbox!.onPresence('disconnected', { session: 'owner', seq: 2 });
    expect(inbox!.exportState().activeSession).toBe('waiter');
    expect(inbox!.isConnected()).toBe(true);
    expect(inbox!.pendingCount()).toBe(1);
  });

  it('gives a legacy client the same grace after its disconnect', () => {
    vi.useFakeTimers();
    const { expired } = setup({ presenceTtlMs: 1_000 });
    vi.advanceTimersByTime(5_000);
    inbox!.onPresence('connected');
    ask('legacy');
    inbox!.onPresence('disconnected');

    expect(expired).toEqual([]);
    expect(inbox!.pendingCount()).toBe(1);
    vi.advanceTimersByTime(1_000);
    inbox!.pendingCount();
    expect(expired).toEqual([['1', 'agent-left']]);
  });

  it('does not extend a promoted session past its own last report', () => {
    vi.useFakeTimers();
    const { expired } = setup({ presenceTtlMs: 1_000 });
    inbox!.onPresence('connected', { session: 'owner', seq: 1 });
    vi.advanceTimersByTime(100);
    inbox!.onPresence('connected', { session: 'waiter', seq: 1 });
    ask('queued while the waiter waits');

    // The owner stops at +900 ms; the waiter's only report was at +100 ms
    vi.advanceTimersByTime(800);
    inbox!.onPresence('disconnected', { session: 'owner', seq: 2 });
    expect(inbox!.exportState().activeSession).toBe('waiter');

    // Its presence ends 1 s after that report, not 1 s after the promotion
    vi.advanceTimersByTime(201);
    inbox!.pendingCount();
    expect(inbox!.isConnected()).toBe(false);
    expect(expired).toEqual([]);

    // The queue still gets one presence TTL of grace before agent-left
    vi.advanceTimersByTime(1_000);
    inbox!.pendingCount();
    expect(expired).toEqual([['1', 'agent-left']]);
  });

  it('keeps a queued request when a delayed report takes the inbox back', () => {
    vi.useFakeTimers();
    const { expired } = setup({ presenceTtlMs: 1_000 });
    inbox!.onPresence('connected', { session: 'stopped', seq: 1 });
    inbox!.onPresence('connected', { session: 'live', seq: 1 });
    inbox!.onPresence('connected', { session: 'live', seq: 2 });
    ask('for the live agent');

    // Two reports that were already on the wire hand the inbox back to the
    // session that stopped
    inbox!.onPresence('connected', { session: 'stopped', seq: 2 });
    inbox!.onPresence('connected', { session: 'stopped', seq: 3 });
    inbox!.onPresence('disconnected', { session: 'stopped', seq: 4 });
    expect(expired).toEqual([]);
    expect(inbox!.pendingCount()).toBe(1);

    // The live agent reports again and gets its request back
    inbox!.onPresence('connected', { session: 'live', seq: 3 });
    expect(inbox!.exportState().activeSession).toBe('live');
    expect(inbox!.pendingCount()).toBe(1);
  });

  it('ignores a lower sequence restored from saved state', () => {
    vi.useFakeTimers();
    setup({
      restore: {
        nextId: 1,
        queue: [],
        delivered: [],
        lastSeenAt: Date.now(),
        lastListeningAt: 0,
        activeSession: 'tracked',
        sessions: [{ session: 'tracked', lastSeq: 7, status: 'active', updatedAt: Date.now() }],
      },
    });

    inbox!.onPresence('listening', { session: 'tracked', seq: 6 });
    expect(inbox!.isListening()).toBe(false);
    inbox!.onPresence('listening', { session: 'tracked', seq: 8 });
    expect(inbox!.isListening()).toBe(true);
  });

  describe('receiver-side presence authority', () => {
    it('rejects delayed heartbeats after a non-active session disconnects', () => {
      vi.useFakeTimers();
      setup();
      inbox!.onPresence('listening', { session: 'active', seq: 1 });
      const before = inbox!.exportState();
      vi.advanceTimersByTime(1);
      inbox!.onPresence('disconnected', { session: 'other', seq: 2 });
      expect(inbox!.exportState()).toMatchObject({
        activeSession: 'active',
        lastSeenAt: before.lastSeenAt,
        lastListeningAt: before.lastListeningAt,
      });

      inbox!.onPresence('disconnected', { session: 'active', seq: 2 });
      inbox!.onPresence('listening', { session: 'other', seq: 3 });
      expect(inbox!.isConnected()).toBe(false);
    });

    it('resumes the same live session with a higher sequence after a TTL gap', () => {
      vi.useFakeTimers();
      setup({ presenceTtlMs: 1_000 });
      inbox!.onPresence('listening', { session: 'live', seq: 4 });
      vi.advanceTimersByTime(1_001);
      inbox!.pendingCount();
      expect(inbox!.exportState()).toMatchObject({ lastSeenAt: 0, lastListeningAt: 0 });
      expect(inbox!.exportState().activeSession).toBeUndefined();

      inbox!.onPresence('listening', { session: 'live', seq: 4 });
      expect(inbox!.isConnected()).toBe(false);
      inbox!.onPresence('connected', { session: 'live', seq: 5 });
      expect(ask()).toMatchObject({ ok: true, listening: false });
    });

    it('lets the newest reporter take over on its second report and never drops a live one', () => {
      vi.useFakeTimers();
      setup({ presenceTtlMs: 1_000 });
      inbox!.onPresence('connected', { session: 'old', seq: 1 });
      vi.advanceTimersByTime(100);

      // One late report from a stopped process must not steal ownership
      inbox!.onPresence('listening', { session: 'new', seq: 1 });
      expect(inbox!.exportState().activeSession).toBe('old');
      expect(inbox!.isListening()).toBe(false);

      // A live process reports again and takes over
      inbox!.onPresence('listening', { session: 'new', seq: 2 });
      expect(inbox!.exportState().activeSession).toBe('new');
      expect(inbox!.isListening()).toBe(true);

      // The stopped process's delayed disconnect ends only its own session
      inbox!.onPresence('disconnected', { session: 'old', seq: 2 });
      expect(inbox!.isConnected()).toBe(true);
      expect(inbox!.isListening()).toBe(true);
      expect(ask()).toMatchObject({ ok: true, listening: true });

      // A session waiting for its second report takes over the moment the
      // owner reports that it stopped, so presence never drops
      inbox!.onPresence('connected', { session: 'third', seq: 1 });
      expect(inbox!.exportState().activeSession).toBe('new');
      inbox!.onPresence('disconnected', { session: 'new', seq: 3 });
      expect(inbox!.exportState().activeSession).toBe('third');
      expect(inbox!.isConnected()).toBe(true);

      // The stopped session stays dead for good
      inbox!.onPresence('connected', { session: 'new', seq: 4 });
      expect(inbox!.exportState().activeSession).toBe('third');
    });

    it('survives a backwards clock step without blocking a new session', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(100_000));
      setup({ presenceTtlMs: 1_000 });
      inbox!.onPresence('connected', { session: 'old', seq: 1 });

      // The receiver clock jumps a minute back: presence is cleared rather than
      // frozen, so a legacy caller is not locked out for the length of the step
      vi.setSystemTime(new Date(40_000));
      inbox!.pendingCount();
      expect(inbox!.isConnected()).toBe(false);
      inbox!.onPresence('listening');
      expect(inbox!.isListening()).toBe(true);

      // A metadata-carrying session is accepted too
      inbox!.onPresence('disconnected');
      vi.setSystemTime(new Date(41_000));
      inbox!.onPresence('listening', { session: 'new', seq: 1 });
      inbox!.onPresence('listening', { session: 'new', seq: 2 });
      expect(inbox!.exportState().activeSession).toBe('new');
      expect(inbox!.isListening()).toBe(true);

      inbox!.onPresence('disconnected', { session: 'new', seq: 3 });
      expect(inbox!.isConnected()).toBe(false);
    });

    it('keeps a fresh disconnect tombstone under normal cap pressure', () => {
      vi.useFakeTimers();
      setup({ presenceTtlMs: 1_000 });
      inbox!.onPresence('disconnected', { session: 'ended', seq: 2 });
      vi.advanceTimersByTime(1);
      for (let index = 0; index < 100; index++) {
        inbox!.onPresence('disconnected', { session: `other-${index}`, seq: 1 });
      }

      inbox!.onPresence('connected', { session: 'ended', seq: 3 });
      expect(inbox!.isConnected()).toBe(false);
    });

    it('forwards presence metadata in the README integration callback', () => {
      const { inbox } = setup();
      const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
      const example = readme.split('## Letting players talk to the agent')[1];
      const callback = example.match(/^  onPresence: (.+),[ \t]*(?:\/\/.*)?$/m)?.[1];
      expect(callback).toBeDefined();
      const onPresence = runInNewContext(`(${callback})`, { inbox }) as typeof inbox.onPresence;

      onPresence('connected', { session: 'documented', seq: 1 });
      expect(inbox.exportState().activeSession).toBe('documented');
    });
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
