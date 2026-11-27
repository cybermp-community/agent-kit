# Changelog

## Unreleased

- Rename the published packages to `@cybermp-community/agent-kit` and `@cybermp-community/agent-kit-bridge` for the 2.0.0 release. The CLI binary `cybermp-agent-kit` and the game resource id `mcp-bridge` are unchanged; `cybermp-agent-kit` 1.3.1 stays the last unscoped release.
- License the project's own code under MIT. Third-party notices in `data/` are unchanged; releases up to 1.3.1 remain GPL-3.0-or-later.
- Add opt-in live server tools next to a CyberMP server, `server_status`, `list_server_logs`, `read_server_log` and log resources appear when a logs folder exists; with `DEVTOOLS_TOKEN` set, every tool the game server's bridge offers appears too, with the `triage-server`, `investigate-player` and `post-crash-analysis` prompts. The tool list follows the game (start, stop, hot reload) every 10 s. `CYBERMP_MCP_MODE=readonly`, `CYBERMP_MCP_ALLOW` and `CYBERMP_MCP_DENY` limit what the agent may use (any `CYBERMP_MCP_MODE` other than `full`/`write`, a typo included, means read-only; an empty `CYBERMP_MCP_ALLOW` allows no bridge tool). With nothing configured, only the five docs tools are listed, as before. See `docs/live-server.md`.
- Ship the bridge for server resources as a separate package, `@cybermp-community/agent-kit-bridge` (`packages/bridge`), and the resource that hosts it (`resources/mcp-bridge`). Tools added by a resource are named `<scope>__<tool>`; `list_scopes` shows which resource each tool comes from.
- `init --bridge` copies the resource and writes a random `DEVTOOLS_TOKEN` to `.env`, never into editor configurations.
- New export `@cybermp-community/agent-kit/client` (`callBridge`, `describeBridge`) for scripts.
- Raise `@modelcontextprotocol/sdk` to `^1.32.2`.

## 1.3.1 — 2026-11-22

- Extract general INK widget lifecycle, canvas composition, pooling and readback guidance from the supplied MIT minimap resource; keep projection in a separate recipe and preserve source/evidence limits.

- Remove server position assignment and Vector3 constructor advice; route authorized teleport requests to client handling.
- Add searchable spawn diagnostics for competing resources, asynchronous readiness, health initialization, match state and lifecycle verification.
- Clarify maximum-health initialization and prevention of modifier stacking on repeated respawn.

## 1.3.0 — 2026-11-21

- Ship `cybermp-session-review`, a standalone skill for reviewing Agent Kit's contribution to a selected development chat. It traces the sources of working changes, records verification evidence, and proposes a prioritized backlog.

## 1.2.0 — 2026-11-21

- Align offline event references and RPC examples with the indexed CyberMP declarations; improve resource configuration, Lua and native bridge search.
- Expand TweakDB to 206 unique identifiers with source evidence and explicit candidate status.
- Add portable prop diagnostics with per-client stream-in/out notifications. Base-game props were tested on two clients, including late connection, re-streaming and cleanup on resource stop.
- Update minimap diagnostics with a tested root HUD widget, `Vector2` size and `HDRColor` tint. World-coordinate projection remains unverified.
- Fix Windows build, index generation and example-validation portability; verify the installed MCP package independently of local developer types.

Runtime observations apply to the tested stand and assets. Custom archive delivery, dependencies and the remaining camera/CEF scenarios are not claimed as verified.
