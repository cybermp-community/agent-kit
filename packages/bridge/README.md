# cybermp-agent-kit-bridge

Localhost RPC bridge so the MCP server of
[`cybermp-agent-kit`](https://github.com/mo3g666/cybermp-agent-kit) can inspect
and drive a CyberMP server.

```ts
import { createBridge, defineMethod } from 'cybermp-agent-kit-bridge';
import z from 'zod';

const bridge = createBridge({
  token: process.env.DEVTOOLS_TOKEN ?? '', // empty = bridge disabled
  port: 2080,                               // default
  methods: {
    'server.info': defineMethod({ // internal, used by server_status
      kind: 'read',
      params: z.object({}).default({}),
      handler: () => ({ players: mp.players.toArray().length }),
    }),
    'players.kick': defineMethod({
      tool: 'kick_player',
      title: 'Kick player',
      description: 'Disconnects a player.',
      kind: 'destructive', // read | write | destructive (write/destructive are logged)
      params: z.object({ playerId: z.number().int() }),
      handler: ({ playerId }) => mp.players.at(playerId).kick('Kicked'),
    }),
  },
});

// Or start from the ready-made server.info / list_players / kick_player:
//   methods: { ...basicMethods(mp), ...yours }
//
// Optional: react to the MCP client coming and going
//   onPresence: (state) => state // 'connected' | 'listening' | 'disconnected'

// on resource shutdown / hot reload
bridge.stop();
```

Methods with a `tool` name become MCP tools automatically (the bridge serves
their JSON Schema via `bridge.describe`). Binds `127.0.0.1` only; every call
needs `Authorization: Bearer <token>`.

## Letting players talk to the agent

`createAgentInbox` is a generic game -> agent request channel. Your game mode
decides who may ask and calls `submit`; the agent gets the tools
`get_agent_requests` and `reply_agent_request`.

```ts
const inbox = createAgentInbox<{ playerId: number }>({
  onReply: ({ meta }, message) => chat.send(meta.playerId, `[Agent] ${message}`),
  onExpire: ({ meta }, reason) => chat.send(meta.playerId, 'No answer, sorry'),
  // acceptWhenOffline: true, // queue even when no agent is attached
});

createBridge({
  token,
  methods: { ...basicMethods(mp), ...inbox.methods },
  onPresence: (state) => inbox.onPresence(state), // returns { pending }
});

// in your command handler:
const result = inbox.submit({ from: player.nickname, text, meta: { playerId: player.id } });
if (!result.ok) chat.send(player.id, result.message); // 'no-agent' | 'queue-full'

// on shutdown / hot reload
inbox.dispose();
```

The agent is often not attached. By default `submit` refuses at once with
`no-agent`; with `acceptWhenOffline` requests wait until `requestTtlMs`
(10 min). Requests nobody read expire through `onExpire`, and ones the agent
already took stay answerable for `replyWindowMs` (1 h), even across a
reconnect. The request text is written by players, so treat it as untrusted.

## What happened? Event log

```ts
const events = createEventLog(mp, { events: 'default' /* | 'all' | ['playerDeath', ...] */ });
createBridge({ token, methods: { ...basicMethods(mp), ...events.methods } });
events.record('matchStart', { mode: 'race' }); // your own events
events.dispose(); // on shutdown / hot reload
```

Tools: `get_recent_events` (cursor with `since` = `lastSeq`) and
`wait_for_events` (returns as soon as something new matches, up to 10 s, so an
agent can watch live without polling). Rare events (connects, deaths,
vehicle enter/exit, explosions, resource start/stop) are recorded by default,
therefore `'all'` adds the noisy ones (damage, shooting, meta changes), trimmed
to the useful fields. Listeners return nothing, so they can never cancel an
event. The log is in memory (1000 entries by default) and is lost on restart.

## Audit trail

```ts
createBridge({ token, methods, onAudit: fileAudit('logs/mcp-audit.jsonl') });
```

One JSON line per `write`/`destructive` call, including time, method, tool,
params, success or error, duration. Reads are not audited.

## World and resources

```ts
methods: {
  ...entityMethods(mp, { spawn: true }), // spawn: false (default) = read-only listings
  ...resourceMethods(mp, { protect: ['hotreload'] }),
}
```

| Tool | Kind | Notes |
| --- | --- | --- |
| `list_vehicles`, `list_peds`, `list_objects` | read | Optional `dimension` filter, `limit` (max 500) |
| `hash_name` | read | `tweakdbid` / `cname` / `resref` name -> decimal hash string (`spawn: true` only) |
| `spawn_vehicle`, `spawn_ped`, `spawn_object` | write | `spawn: true` only |
| `destroy_entity` | destructive | `spawn: true` only |
| `get_server_config` | read | Keys that look like secrets (token, password, private...) are redacted |
| `list_resources` | read | State of each configured resource |
| `start_resource` | write | |
| `stop_resource`, `restart_resource` | destructive | Refuse the resource hosting the bridge and anything in `protect` |

Hashes are strings composed of a raw number (`"7454566152498118096"`), an
explicit kind (`"tweakdbid:Vehicle.x"`, `"cname:x"`, `"resref:x"`), or, for
vehicles only, a bare name (model -> `Vehicle.<name>` TweakDB id, appearance
-> CName). Peds and objects never guess the kind.

A game mode that tracks its own entities (spawners, matches) is not told about
ones destroyed through these tools. To keep an agent from spawning or removing
things, leave `spawn` off or use `CYBERMP_MCP_DENY=spawn_*,destroy_entity` in
the MCP server's environment.

## Ready-made player tools

`basicMethods(mp)` also gives `mute_player` (destructive since the API has no
unmute) and `set_player_dimension` (write). Pick single ones out of the map if
your game mode owns dimensions: `{ 'player.mute': basicMethods(mp)['player.mute'] }`.

## Contributing tools from another resource

With the `mcp-bridge` resource running, `registerMcpProvider({ mp, rpc, scope, methods })`
registers your `methods` over CyberMP RPC, and `createProviderHost` is what the
resource uses to receive them. Both use JSON strings on the wire and an RPC
server named `mcp-bridge` on the host side. See the resource README for the
walkthrough.

### Scopes

Every provider has a scope, and its tools reach the agent as
`<scope>__<tool>`: `scope: 'economy'` plus `tool: 'set_money'` gives
`economy__set_money`. The bridge's own tools are in the `core` scope and keep
bare names (`list_players`). So every tool shows which resource it comes from,
and two resources can't fight over a name.

- `scope` defaults to the resource name, made valid (`My_Mode` -> `my-mode`).
- A scope is lower-case letters, digits and `-`, up to 20 characters, starting
  with a letter; `core` is reserved. Tool names are snake_case, and the full
  name may be at most 48 characters (clients add their own prefix, such as
  `mcp__cybermp__`, within a 64-character limit).
- A scope held by another running resource, an invalid name or a duplicate tool
  rejects the whole registration. The provider logs the reason (`logger`,
  default `console`) and keeps retrying every 30 s, so stopping the other
  resource is enough.
- `bridge.describe` reports `scope` and `resource` for each method, and the
  `list_scopes` tool lists them for the agent.
- Allow/deny lists can target a scope: `CYBERMP_MCP_DENY=economy__*`. `createBridge({ methods })` also accepts a function, evaluated on
every request.
