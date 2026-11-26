# mcp-bridge (CyberMP resource)

Lets an LLM agent inspect and drive your server through
[`cybermp-mcp`](../../tools/mcp).

## Install

1. Copy this folder's `resource.toml` and `server/dist/index.js` (build it with
   `pnpm build` in a checkout) to `resources/mcp-bridge/` on your server.
2. Add it to `server.toml`:
   ```toml
   resources = ["mcp-bridge", "your-gamemode"]
   ```
3. Set `DEVTOOLS_TOKEN` (environment variable or a `.env` next to
   `server.toml`). Without a token the HTTP bridge stays off.
4. Point `cybermp-mcp` at the same token (see its README).

## Settings

Environment variables, or `.env` (the real environment wins):

| Variable | Default | |
| --- | --- | --- |
| `DEVTOOLS_TOKEN` | none | Required. Shared secret with `cybermp-mcp` |
| `DEVTOOLS_PORT` | `2080` | Listens on `127.0.0.1` only |
| `DEVTOOLS_AUDIT_FILE` | none | JSONL trail of every write/destructive call |
| `DEVTOOLS_EVENTS` | `default` | `all` also records noisy events (damage, shooting, meta) |
| `DEVTOOLS_ALLOW_SPAWN` | off | `1` enables spawn/destroy of vehicles, peds, objects |
| `DEVTOOLS_PROTECT_RESOURCES` | none | Comma-separated resources the agent may not stop or restart (this one is always protected) |
| `DEVTOOLS_START_DELAY_MS` | `30000` | Right after a server start, the port opens only after this long (the server has crashed on early connections) |

## Built-in tools

`list_players`, `kick_player`, `mute_player`, `set_player_dimension`,
`get_recent_events`, `wait_for_events`, `get_server_config` (secrets
redacted), `list_resources`, `start_resource`, `stop_resource`,
`restart_resource`, `list_vehicles`, `list_peds`, `list_objects`, and with
`DEVTOOLS_ALLOW_SPAWN=1`: `hash_name`, `spawn_vehicle`, `spawn_ped`,
`spawn_object`, `destroy_entity`.

## Adding tools from your own resource

Any resource can contribute tools over CyberMP RPC. Use the RPC server your
resource already has:

```ts
import { RpcServer } from '@cybermp/rpc-server';
import { defineMethod, registerMcpProvider } from 'cybermp-mcp-bridge';
import z from 'zod';

const rpc = new RpcServer({ name: 'my-gamemode' });

const provider = registerMcpProvider({
  mp,
  rpc,
  methods: {
    'bank.give': defineMethod({
      tool: 'give_money', // what the agent sees
      title: 'Give money',
      description: 'Adds money to a player.',
      kind: 'write', // read | write | destructive
      params: z.object({ playerId: z.number().int(), amount: z.number().int().min(1) }),
      handler: ({ playerId, amount }) => bank.give(playerId, amount),
    }),
  },
  // optional: react to an agent attaching/detaching, e.g. enable a feature
  onPresence: (state) => ({ pending: inbox.pendingCount() }),
});

// when your resource stops
await provider.unregister();
```

- **Order doesn't matter.** The bridge can start before or after you, or
  restart, as registration is retried and renewed every 30 s, and the bridge
  announces itself on start.
- **Names.** A provider's tool replaces a built-in tool of the same name (so
  your `list_players` can show your own data). Between two providers the first
  to register keeps the name; the other is logged and ignored. A method named
  `server.info` (no `tool`) is merged into `server_status`.
- **Safety applies to you too.** Calls to your tools go through the bridge's
  audit trail and through the MCP server's read-only / allow / deny settings.
- **Everything is JSON.** Arguments, results and errors cross resources as JSON
  strings; `bigint` results arrive as strings. Throw `BridgeError` for
  expected failures so the agent sees the message.
- **Trust.** Registration is not authenticated, so every server resource is
  trusted code, as with any `mp.exports` or RPC call.
- A provider that stops (or whose resource is no longer running) disappears
  from the tool list within a request.
