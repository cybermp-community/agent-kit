# CyberMP Agent Kit

**Community AI Developer Toolkit & MCP Server for Cyberpunk 2077 Multiplayer (CyberMP)**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-green.svg)](https://nodejs.org/)

An offline-first Model Context Protocol (MCP) server, universal agent skills, and anti-hallucination rules for building multiplayer resources in [CyberMP](https://cyber.mp).

> [!NOTE]
> **Disclaimer:** This is an unofficial, community-developed open-source project designed to assist developers building multiplayer mods and resources for CyberMP. It is not affiliated with, endorsed by, or officially connected to the CyberMP core development team or CD PROJEKT RED.

---

## Key Features

- 🛡️ **Anti-Hallucination Guard**: Intercepts foreign multiplayer API hallucinations (FiveM `SetEntityCoords`, alt:V `alt.emitServer`, SA-MP, RAGE:MP) in real-time and directs agents to authentic CyberMP and REDengine native facilities.
- 🔍 **Native REDengine Introspection**: Dynamic on-demand parsing and inheritance resolution for **19,176 native REDengine classes** (such as `ScriptGameInstance`, `TeleportationFacility`, `MountingFacility`, `StatPoolsSystem`) directly from `@cybermp/client-types`.
- 📚 **Offline Guides & Recipes Search**: Instant full-text search across **38 guides** covering vehicle mechanics, camera components, CEF UI integration, local storage (`mp.localStorage`), Discord Rich Presence, and 3D spatial math.
- 🔄 **Cross-Boundary RPC Verification**: Generates paired, type-safe RPC flow templates across isolated execution environments: Server (Node.js), Client (in-game V8), and CEF (Chromium).
- 🤖 **Universal AI Agent Support**: Pre-configured rules and skills for OpenAI Codex, Cursor, Claude Code, Google Antigravity, Cline, Windsurf, and Zed.

---

## Quick Start

Initialize CyberMP development rules and MCP server configuration in your project with one command:

```bash
npx cybermp-agent-kit init
```

Flags:
- `-e, --editors <editors...>`: Target editors (`codex`, `cursor`, `claude`, `antigravity`, `cline`, `windsurf`, `zed`).
- `--skill`: Copies the `cybermp-dev` Agent Skill into `.agents/skills/`.
- `-y, --yes`: Non-interactive mode with default settings.
- `-f, --force`: Overwrites existing rule files if present.

---

## AI Editor & Agent Configuration

### 1. OpenAI Codex CLI / App (`~/.codex/config.toml`)

Add to `~/.codex/config.toml`:

```toml
[mcp_servers.cybermp]
command = "npx"
args = ["-y", "cybermp-agent-kit"]
```

To enable the offline developer skill:
```bash
ln -s /path/to/cybermp-agent-kit/skills/cybermp-dev ~/.codex/skills/cybermp-dev
```

### 2. Cursor (`.cursor/mcp.json`)

```json
{
  "mcpServers": {
    "cybermp": {
      "command": "npx",
      "args": ["-y", "cybermp-agent-kit"]
    }
  }
}
```

### 3. Claude Code & Claude Desktop (`.mcp.json` / `claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "cybermp": {
      "command": "npx",
      "args": ["-y", "cybermp-agent-kit"]
    }
  }
}
```

### 4. Google Antigravity (`mcp_config.json`)

```json
{
  "mcpServers": {
    "cybermp": {
      "command": "npx",
      "args": ["-y", "cybermp-agent-kit"]
    }
  }
}
```

---

## MCP Tools Reference

When connected, `cybermp-agent-kit` provides 4 specialized MCP tools:

| Tool | Description | Example Query |
|---|---|---|
| `cybermp_search_docs` | Full-text search across 38 offline guides and recipes | `{"query": "vehicle seats"}` |
| `cybermp_get_type` | Inspect TypeScript interfaces and 19k+ REDengine native classes | `{"name": "TeleportationFacility"}` |
| `cybermp_get_event` | Fetch event callback signatures and execution context | `{"name": "playerEnterVehicle", "env": "server"}` |
| `cybermp_get_rpc_flow` | Generate paired sender & receiver RPC boilerplate | `{"from": "client", "to": "server"}` |

---

## Context Boundaries

CyberMP operates in three distinct, isolated environments, all calling native methods and systems via the global `mp.*` namespace:

1. **Server** (`@cybermp/server-types`): Node.js environment. Authoritative game state, player sessions, vehicle management, and commands.
   - Listen to events: `mp.events.on(name, callback)`
   - Listen to client RPC: `mp.events.onClient(name, (player: MpPlayer, ...args) => ...)`
   - Send to client: `mp.events.emitClient(player, name, ...args)`
2. **Client** (`@cybermp/client-types`): In-game V8 environment inside Cyberpunk 2077. Entities, camera, sound, inputs, and REDengine game natives (`mp.game.*`).
   - Listen to server: `mp.events.onServer(name, callback)`
   - Send to server: `mp.events.emitServer(name, ...args)`
   - Listen to CEF: `mp.events.onCef(name, callback)`
   - Send to CEF: `mp.events.emitCef(name, ...args)`
3. **CEF Browser** (`@cybermp/browser-types`): Chromium web runtime for HUD, menus, and custom UI.
   - Listen to client: `mp.events.on(name, callback)`
   - Send to client: `mp.events.emit(name, ...args)`

---

## Development & Testing

```bash
# Install dependencies
pnpm install

# Run complete Vitest suite (108 tests)
pnpm test

# Rebuild static AST and markdown documentation indexes
pnpm run build:index

# Build TypeScript output into dist/
pnpm run build
```

---

## Publishing to npm

To publish `cybermp-agent-kit` to the public npm registry:

```bash
# Log in to npm
npm login

# Build, test, and publish
npm publish --access public
```

Once published, users can configure their AI editors seamlessly:
```bash
npx cybermp-agent-kit init
```

---

## License

[GNU General Public License v3.0](LICENSE)
