# Live server tools

Besides the offline docs tools, the MCP server can inspect and drive a CyberMP
server running on the same machine. Nothing here is active until configured:
with no logs folder and no token, clients see only the five docs tools.

```
 MCP client ──stdio── cybermp-agent-kit ──HTTP 127.0.0.1:2080── mcp-bridge resource ──RPC── your resources
                         │                                         (cybermp-agent-kit-bridge)
                         └── reads logs/ and the process list
```

## Setup

1. In the server folder (the one with `server.toml` and `resources/`):
   `npx cybermp-agent-kit init --bridge`. This copies
   [`resources/mcp-bridge`](../resources/mcp-bridge/README.md) and writes a
   random `DEVTOOLS_TOKEN` to `.env`. Both the resource and the MCP server read
   that file, so the token never goes into an editor configuration.
2. Build the resource (`pnpm install && pnpm build` in `resources/mcp-bridge`)
   and add `"mcp-bridge"` to `resources` in `server.toml`.
3. Start the server. Within 10 seconds the MCP server lists the game tools
   (the bridge opens its port 30 s after a server start, see the resource
   README).

If the editor starts the MCP server from another folder, point it at the server
with `CYBERMP_ROOT`, or set `DEVTOOLS_TOKEN` in its environment.

## Settings (MCP server)

Real environment variables win over `<root>/.env`. Everything except
`CYBERMP_MCP_INSTRUCTIONS` is re-read on each use, so changes need no restart.

| Variable | Default | |
|---|---|---|
| `CYBERMP_ROOT` | `CLAUDE_PROJECT_DIR` if the client sets it, else the current directory | Server folder: where `.env` and the logs are looked for |
| `CYBERMP_LOGS_DIR` | first of `logs`, `mp/linux/logs`, `mp/win/logs` | Relative to the root, or absolute |
| `CYBERMP_PROCESS` | `cybermp-server` | Executable name for `server_status` (`.exe` added on Windows) |
| `DEVTOOLS_TOKEN` | none | Shared secret with the bridge; turns the game tools on |
| `DEVTOOLS_PORT` | `2080` | Bridge port on 127.0.0.1 |
| `CYBERMP_MCP_MODE` | | `readonly`: only read tools are listed or callable. Any value other than `full`, `write`, `readwrite` or `read-write` (a typo included) also means read-only |
| `CYBERMP_MCP_ALLOW` | | Comma-separated tool names with `*` wildcards; nothing else is exposed. Set but empty: no bridge tools |
| `CYBERMP_MCP_DENY` | | Same syntax; always wins. `economy__*` hides a whole scope |
| `CYBERMP_MCP_INSTRUCTIONS` | | Appended to the server instructions (server-specific rules). Read once when the MCP server starts: changing it needs a restart of the MCP server |

## What appears when

| Condition | Tools, resources, prompts |
|---|---|
| A logs folder exists | `list_server_logs`, `read_server_log` (last 500 lines max, optional filter), `server_status`, resources `cybermp://logs/<file>` (20 newest) |
| `DEVTOOLS_TOKEN` is set | `server_status`; every tool from `bridge.describe` that the policy allows; the prompts `triage-server`, `investigate-player` (argument `player`), `post-crash-analysis` |

`server_status` reports the process (pid, uptime, memory; no uptime on
Windows), the bridge's `server.info` and the scopes in use. The tool list
follows the game: when the server stops or the bridge resource reloads, its
tools disappear and the client is told (`notifications/tools/list_changed`);
they come back with the server. A call to a tool that vanished since the last
heartbeat fails with a clear error instead of reaching the game.

While a session is open the MCP server reports `bridge.presence`
(`connected` every 10 s, `disconnected` on exit). Game modes use it, for
example, to accept in-game requests for the agent only while one is attached
(see `createAgentInbox` in the bridge library).

## Scopes

Tools the bridge resource serves itself are in the `core` scope and keep bare
names (`list_players`). Tools another resource adds reach the agent as
`<scope>__<tool>` (`economy__set_money`), with `[scope]` before their title,
the resource in their description and `_meta` keys `cybermp/scope` and
`cybermp/resource`. The `list_scopes` tool lists every scope with its resource
and tools. Rules for choosing a scope are in the
[bridge library README](../packages/bridge/README.md#scopes).

## Safety

- The bridge listens on 127.0.0.1 only and needs the token on every call.
  Anything holding the token can call it directly, so keep `.env` private (`init
  --bridge` adds it to `.gitignore`, and creates that file if the project has
  none).
- Spawning and destroying entities is off unless the resource sets
  `DEVTOOLS_ALLOW_SPAWN=1`; the resource hosting the bridge, and anything in
  `DEVTOOLS_PROTECT_RESOURCES`, can't be stopped or restarted by the agent.
- `DEVTOOLS_AUDIT_FILE` on the resource writes one JSON line per write or
  destructive call.
- Player nicknames, chat, agent requests and log lines are written by players.
  The server instructions and prompts tell the agent to treat them as data.

## Bridge protocol

For servers that want to implement the bridge without the library.

`POST http://127.0.0.1:<port>/rpc` with `Authorization: Bearer <token>` and a
JSON body `{"method": string, "params"?: object}` (64 KB max). Answers are
HTTP 200 with `{"ok": true, "result": ...}` or `{"ok": false, "error": string}`;
401 for a wrong token, 404 for any other path. `bigint` values are sent as
strings.

| Method | Params | Result |
|---|---|---|
| `bridge.describe` | none | Array of `{method, tool, title, description, kind, scope, resource?, inputSchema}`. `kind` is `read`, `write` or `destructive`; `inputSchema` is a JSON Schema object; `tool` is the full name the agent sees. Older bridges omit `scope` and `resource` |
| `bridge.presence` | `{state: "connected" \| "listening" \| "disconnected", session?: string, seq?: number}` | Anything; returned to the caller. `session` identifies a CLI run, and `seq` increases within that run. Both may be omitted by legacy callers. |
| `server.info` | none | Object merged into `server_status` (players, uptime...) |
| any described `method` | its `inputSchema` | The tool's result |

Only methods with a `tool` become MCP tools; others (like `server.info`) are
internal.

Upgrade the CLI, bridge library, and `mcp-bridge` resource together. Presence
protection requires both `session` and `seq` to reach the receiver unchanged,
including through any custom `onPresence(state, meta)` callback. A newcomer takes
ownership on its second report, so one last heartbeat from a process that already
stopped cannot steal it; a `disconnected` is final for its own session only, and
a waiting session takes over as soon as the owner reports that it stopped. A
report the server accepted before the disconnect can still land out of order:
presence may then look wrong until the live process has two accepted reports in a
row, without an intervening contender. See the
[bridge library README](../packages/bridge/README.md#letting-players-talk-to-the-agent)
for integration and timing options.
