# CyberMP Community Agent Kit

**Community AI developer toolkit and Model Context Protocol (MCP) server for Cyberpunk 2077 Multiplayer (CyberMP)**

[![npm version](https://img.shields.io/npm/v/@cybermp-community/agent-kit.svg)](https://www.npmjs.com/package/@cybermp-community/agent-kit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22-green.svg)](https://nodejs.org/)

An offline-first MCP server, universal agent skills, and anti-hallucination rules for building multiplayer resources in [CyberMP](https://cyber.mp).

> [!NOTE]
> **Disclaimer:** This is an unofficial, community-developed open-source project designed to assist developers building multiplayer mods and resources for CyberMP. It is not affiliated with, endorsed by, or officially connected to the CyberMP core development team or CD PROJEKT RED.

---

## Key Features

- 🛡️ **Foreign API hints**: Flags selected FiveM, alt:V, SA-MP and RAGE:MP identifiers in lookup queries.
- 🔍 **Native REDengine Introspection**: Versioned declarations and inheritance resolution for REDengine classes such as `ScriptGameInstance`, `TeleportationFacility`, and `inkCircleWidget`.
- 📚 **Offline Guides & Recipes Search**: Full-text search across bundled references and upstream summaries covering vehicle mechanics, camera components, CEF UI integration, local storage (`mp.localStorage`), Discord Rich Presence, and 3D spatial math.
- 🔄 **Cross-Boundary RPC Verification**: Generates paired, type-safe RPC flow templates across isolated execution environments: Server (Node.js), Client (in-game V8), and CEF (Chromium).
- 🎮 **Live Server Tools (opt-in)**: Next to a running CyberMP server, the agent can read its status and logs and use tools the game server offers through a localhost bridge (players, events, resources, entities, and tools your own resources add). Off until configured; see [Live server setup](#live-server-setup).
- 🤖 **Universal AI Editor Support**: Pre-configured rules and skills for Cursor, Claude Code / Desktop, Google Antigravity, Cline / Roo Code, Windsurf, and Zed.

---

## Quick Start

Node.js 22 or newer is required. Initialize CyberMP rules and MCP configuration in your project with a single command:

```bash
npx @cybermp-community/agent-kit init
```

The interactive wizard asks which AI editors you use and configures them automatically. It also copies the `cybermp-dev` Agent Skill unless you pass `--no-skill`.

To pin the CLI in a project instead of running it through `npx`:

```bash
pnpm add -D @cybermp-community/agent-kit
pnpm exec cybermp-agent-kit init
```

The binary keeps the name `cybermp-agent-kit`.

### Command-line options

```bash
# Non-interactive initialization for default editors (Cursor, Claude, Antigravity)
npx @cybermp-community/agent-kit init -y

# Configure specific editors
npx @cybermp-community/agent-kit init -e cursor claude antigravity

# Configure the global Antigravity MCP separately
npx @cybermp-community/agent-kit init -e antigravity --global-antigravity -y

# Install standalone Antigravity plugin into .agents/plugins/cybermp/
npx @cybermp-community/agent-kit init --plugin

# Copy the cybermp-dev Agent Skill into .agents/skills/
npx @cybermp-community/agent-kit init --skill

# Overwrite existing configuration files
npx @cybermp-community/agent-kit init -f

# Copy the mcp-bridge resource and write a random DEVTOOLS_TOKEN to .env
npx @cybermp-community/agent-kit init --bridge
```

The binary is still named `cybermp-agent-kit`, so an existing install keeps working; run it through the scoped package:

```bash
npx @cybermp-community/agent-kit --version
```

The package also ships the [CyberMP session review skill](packages/agent-kit/skills/cybermp-session-review/SKILL.md). For Codex, copy the entire `skills/cybermp-session-review` directory into your personal or project `.agents/skills` directory. Invoke `$cybermp-session-review` in a chat you want to review.

---

## Editor Setup

`init` writes both the rule file and the MCP configuration for each selected editor:

| Editor | Files written |
|---|---|
| Cursor | `.cursor/rules/cybermp.mdc`, `.cursor/mcp.json` |
| Claude Code / Desktop | `CLAUDE.md`, `.mcp.json` |
| Google Antigravity | `.agents/rules/cybermp.md`; `--global-antigravity` also writes `~/.gemini/config/mcp_config.json` |
| Cline / Roo Code | `.clinerules`, `.cline/mcp_settings.json` |
| Windsurf | `.windsurfrules`, `mcp_config.json` |
| Zed | `.zed/settings.json` |
| Hermes Agent | `hermes mcp add`, `hermes skills install` (see below) |

You can print copy-pasteable configuration for any editor at any time:

```bash
npx @cybermp-community/agent-kit config [cursor|claude|antigravity|cline|windsurf|zed|hermes|all]
```

### Cursor (`.cursor/mcp.json`)

```json
{
  "mcpServers": {
    "cybermp": {
      "command": "npx",
      "args": ["-y", "@cybermp-community/agent-kit"]
    }
  }
}
```

### Claude Code & Claude Desktop (`.mcp.json` / `claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "cybermp": {
      "command": "npx",
      "args": ["-y", "@cybermp-community/agent-kit"]
    }
  }
}
```

### Google Antigravity (`~/.gemini/config/mcp_config.json`)

```json
{
  "mcpServers": {
    "cybermp": {
      "command": "npx",
      "args": ["-y", "@cybermp-community/agent-kit"]
    }
  }
}
```

### Cline / Roo Code (`.cline/mcp_settings.json`)

```json
{
  "mcpServers": {
    "cybermp": {
      "command": "npx",
      "args": ["-y", "@cybermp-community/agent-kit"],
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

### Windsurf (`mcp_config.json`)

```json
{
  "mcpServers": {
    "cybermp": {
      "command": "npx",
      "args": ["-y", "@cybermp-community/agent-kit"]
    }
  }
}
```

### Zed (`.zed/settings.json`)

```json
{
  "context_servers": {
    "cybermp": {
      "command": "npx",
      "args": ["-y", "@cybermp-community/agent-kit"]
    }
  }
}
```

On Windows, `init` and `config` automatically use `npx.cmd` so that editors can spawn the server without an `ENOENT` error.

### Hermes Agent

Hermes keeps MCP servers and skills in its own profile instead of a project file, so register them once:

```bash
npx @cybermp-community/agent-kit config hermes   # prints the command below
hermes mcp add cybermp --command npx --args -y @cybermp-community/agent-kit run
hermes mcp test cybermp
```

The `cybermp-dev` skill can be installed straight from this repository:

```bash
hermes skills install https://raw.githubusercontent.com/cybermp-community/agent-kit/main/packages/agent-kit/skills/cybermp-dev/SKILL.md
```

If a project carries its own copy under `.agents/skills/`, trust that folder instead with `hermes skills trust`. Live server tools need nothing extra beyond the setup below: the MCP server reads `DEVTOOLS_TOKEN` from the server folder, exactly as it does for other editors.

---

## Live Server Setup

Live server tools are a separate, opt-in setup. The docs tools work offline with nothing else installed; the live tools need the `mcp-bridge` game resource and the bridge library running inside your server.

1. In the server folder (the one with `server.toml` and `resources/`), run:

   ```bash
   npx @cybermp-community/agent-kit init --bridge
   ```

   This copies `resources/mcp-bridge`, pins the published bridge version in its manifest, and writes a random `DEVTOOLS_TOKEN` to `.env`. Both the resource and the MCP server read that file, so the token never goes into an editor configuration. `init --bridge` also adds `.env` to `.gitignore`.

2. Build the resource:

   ```bash
   cd resources/mcp-bridge
   pnpm install
   pnpm build
   ```

3. Add the game resource id `mcp-bridge` to `server.toml`:

   ```toml
   resources = ["mcp-bridge", "your-gamemode"]
   ```

4. Start the server. Within 10 seconds the MCP server lists the live tools. If the editor starts the MCP server from another folder, point it at the server with `CYBERMP_ROOT`, or set `DEVTOOLS_TOKEN` in its environment.

Both the logs features and the bridge are re-checked every 10 seconds, so starting the server or adding the token needs no restart.

| When | What appears |
|---|---|
| A server logs folder exists (`logs/`, `mp/linux/logs`, `mp/win/logs` under the project root, or `CYBERMP_LOGS_DIR`) | `server_status`, `list_server_logs`, `read_server_log`, logs as `cybermp://logs/<file>` resources |
| `DEVTOOLS_TOKEN` is set (environment or `<root>/.env`) | The `triage-server`, `investigate-player` and `post-crash-analysis` prompts |
| ...and the server runs the `mcp-bridge` resource | Every tool the bridge offers (`list_players`, `get_recent_events`, `list_resources`, ...) and tools added by your resources as `<scope>__<tool>` |

`CYBERMP_MCP_MODE=readonly`, `CYBERMP_MCP_ALLOW` and `CYBERMP_MCP_DENY` limit what the agent may use. Update the CLI, the bridge library, and the `mcp-bridge` resource together: the presence protocol relies on all three understanding the same session and sequence fields.

Details, all settings and the bridge protocol: [docs/live-server.md](packages/agent-kit/docs/live-server.md). The resource template has its own [README](resources/mcp-bridge/README.md).

---

## Package Map

| Package | Publication | Purpose |
|---|---|---|
| [`@cybermp-community/agent-kit`](packages/agent-kit) | Public, npm | CLI and MCP server, plus the bundled skills, rules, templates and `mcp-bridge` resource template. Binary: `cybermp-agent-kit` |
| [`@cybermp-community/agent-kit-bridge`](packages/bridge) | Public, npm | Bridge library that runs inside a CyberMP server resource |
| `@cybermp-community/agent-kit-bridge-resource` | Private workspace package | The `resources/mcp-bridge` resource template; built in CI, never published to npm. Game resource id: `mcp-bridge` |

Both public packages are released together at version `2.0.0` under the tag `v2.0.0`.

---

## MCP Tools Reference

When connected, the MCP server provides five offline tools:

| Tool | Description | Example Query |
|---|---|---|
| `cybermp_search_docs` | Find offline guidance with evidence and source links | `{"query": "vehicle seats"}` |
| `cybermp_get_type` | Inspect TypeScript interfaces and 19k+ REDengine native classes | `{"name": "TeleportationFacility"}` |
| `cybermp_get_event` | Fetch event callback signatures and execution context | `{"name": "playerEnterVehicle", "env": "server"}` |
| `cybermp_get_rpc_flow` | Generate paired sender & receiver RPC boilerplate | `{"from": "client", "to": "browser"}` |
| `cybermp_lookup_tweakdb` | Search a curated subset of TweakDB IDs | `{"query": "burning"}` |

Live tools appear only when configured, as described in [Live server setup](#live-server-setup).

---

## Execution Environments

In CyberMP, all native engine calls and facilities run through the global `mp.*` namespace across three execution environments:

1. **Server** (`@cybermp/server-types`): Node.js environment. Authoritative game state, player sessions, vehicle management, and commands.
   - Listen to events: `mp.events.on(name, callback)`
   - Listen to client RPC: `mp.events.onClient(name, (player: MpPlayer, ...args) => ...)`
   - Send to client: `mp.events.emitClient(player, name, ...args)`
   - Register commands: `mp.commands.add(name, (player: MpPlayer | null, args: string[]) => ...)`

2. **Client** (`@cybermp/client-types`): In-game V8 environment inside Cyberpunk 2077. Entities, camera, sound, inputs, and REDengine game natives (`mp.game.*`).
   - Listen to server: `mp.events.onServer(name, callback)`
   - Send to server: `mp.events.emitServer(name, ...args)`
   - Listen to CEF: `mp.events.onCef(name, callback)`
   - Send to CEF: `mp.events.emitCef(name, ...args)`

3. **CEF Browser** (`@cybermp/browser-types`): Chromium web runtime for HUD, menus, and custom UI.
   - Listen to client: `mp.events.on(name, callback)`
   - Send to client: `mp.events.emit(name, ...args)`
   - *Note: Server and CEF cannot communicate directly; all data must route through the Client.*

---

## Migration From `cybermp-agent-kit` 1.x

The project moved to the `@cybermp-community` npm scope and to MIT at version 2.0.0. The old unscoped `cybermp-agent-kit` package stays at 1.3.1 and receives no further updates.

| Before | After |
|---|---|
| `npx cybermp-agent-kit init` | `npx @cybermp-community/agent-kit init` |
| `pnpm add -D cybermp-agent-kit` | `pnpm add -D @cybermp-community/agent-kit` |
| `import ... from 'cybermp-agent-kit/client'` | `import ... from '@cybermp-community/agent-kit/client'` |
| `cybermp-agent-kit-bridge` | `@cybermp-community/agent-kit-bridge@2.0.0` |
| MCP config args `["-y", "cybermp-agent-kit"]` | `["-y", "@cybermp-community/agent-kit"]` |

What stays the same:

- The CLI binary is still `cybermp-agent-kit`, and the MCP server key in editor configurations is still `cybermp`.
- The game resource id is still `mcp-bridge`; `init --bridge` keeps writing `resources/mcp-bridge` and adding `"mcp-bridge"` to `server.toml`.

Steps for an existing project:

1. Re-run `npx @cybermp-community/agent-kit init -f` to rewrite editor configurations, or edit their `args` to the scoped package name by hand.
2. If you vendor the bridge library, replace `cybermp-agent-kit-bridge` with `@cybermp-community/agent-kit-bridge` in `package.json` and in imports, then reinstall.
3. If you copied `resources/mcp-bridge`, update its manifest and import the same way, or re-run `init --bridge --force` and rebuild the resource.
4. Update the CLI, bridge library and `mcp-bridge` resource together; mixed versions may mis-handle live presence.

The license changed from GPL-3.0-or-later to MIT for the project's own code starting with 2.0.0. Releases up to 1.3.1 remain under GPL-3.0-or-later. Third-party data notices are unchanged.

---

## Development

The repository is a private pnpm workspace with one lockfile:

```bash
pnpm install
pnpm test            # CLI/MCP and bridge unit tests
pnpm run build       # bridge, CLI and the mcp-bridge resource, in dependency order
pnpm run check:examples
pnpm run test:packed # packs both public packages and exercises the installed CLI
```

### Releases

One tag releases both public packages: the bridge is published first, then the
CLI, which pins that bridge version. Both packages share one version, and the
tag must match it.

```bash
# stable: 2.1.0
pnpm --dir packages/bridge pkg set version=2.1.0
pnpm --dir packages/agent-kit pkg set version=2.1.0
pnpm pkg set version=2.1.0
git commit -am "chore(release): 2.1.0"
git tag v2.1.0 && git push origin main v2.1.0
```

A prerelease follows the same steps with a semver suffix, for example
`2.1.0-beta.1` and tag `v2.1.0-beta.1`. Prereleases are published under the
`beta` dist-tag; asking for `latest` with a prerelease version fails the
release, so `npm install @cybermp-community/agent-kit` keeps resolving to the
last stable release while `npm install @cybermp-community/agent-kit@beta`
picks the beta.

`workflow_dispatch` runs the same pipeline for an existing tag and accepts both
`tag` and `dist-tag`, which is how a version is republished under another tag or
recovered after a partial failure: a rerun skips what is already published with
the same number and continues with the rest.

Publishing to npm is off until the repository variable `NPM_PUBLISH` is `true`
(Settings → Secrets and variables → Actions → Variables). While it is off, a
tag still runs the tests, builds and verifies both tarballs and attaches them to
the GitHub release, so a release can be prepared before the registry access
exists; nothing is uploaded to npm until the switch is on and `NPM_TOKEN`
holds a token that may publish to the scope.

| Path | Contents |
|---|---|
| `packages/agent-kit` | CLI, MCP server, runtime data, skills, rules, templates |
| `packages/bridge` | Bridge library |
| `resources/mcp-bridge` | Private resource template and build |
| `docs/` | Audits and design notes |

`pnpm run build:index` regenerates the shipped knowledge index from the checked-in guide summaries, kit references and locked type packages. `pnpm run sync:docs` fetches the pinned upstream guide snapshot for comparison. Release builds use the checked-in indices. See the [knowledge inventory](packages/agent-kit/docs/knowledge-inventory.md).

---

## Contributing

Contributions are welcome. See [CONTRIBUTORS.md](CONTRIBUTORS.md) for attribution and the project's maintainers.

Before opening a pull request, run the checks that CI runs:

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm run build
pnpm run check:examples
pnpm run test:packed
```

Keep third-party notices and generated data intact, and describe any protocol change that requires updating the CLI, bridge and resource together.

---

## License

Project code is licensed under the [MIT License](LICENSE). Copyright (c) 2026 Nikita Kudiyarov and contributors.

Bundled third-party material keeps its own notices:

- `packages/agent-kit/data/LICENSE-cybermp-client-types`
- `packages/agent-kit/data/LICENSE-ink-minimap`

Releases up to 1.3.1 of `cybermp-agent-kit` were published under GPL-3.0-or-later.
