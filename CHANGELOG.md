# Changelog

## 1.3.0 — 2026-11-21

- Ship `cybermp-session-review`, a standalone skill for reviewing Agent Kit's contribution to a selected development chat. It traces the sources of working changes, records verification evidence, and proposes a prioritized backlog.

## 1.2.0 — 2026-11-21

- Align offline event references and RPC examples with the indexed CyberMP declarations; improve resource configuration, Lua and native bridge search.
- Expand TweakDB to 206 unique identifiers with source evidence and explicit candidate status.
- Add portable prop diagnostics with per-client stream-in/out notifications. Base-game props were tested on two clients, including late connection, re-streaming and cleanup on resource stop.
- Update minimap diagnostics with a tested root HUD widget, `Vector2` size and `HDRColor` tint. World-coordinate projection remains unverified.
- Fix Windows build, index generation and example-validation portability; verify the installed MCP package independently of local developer types.

Runtime observations apply to the tested stand and assets. Custom archive delivery, dependencies and the remaining camera/CEF scenarios are not claimed as verified.
