# CyberMP Agent Kit

**Community AI Developer Toolkit & Model Context Protocol (MCP) Server for Cyberpunk 2077 Multiplayer (CyberMP)**

[![npm version](https://img.shields.io/npm/v/cybermp-agent-kit.svg)](https://www.npmjs.com/package/cybermp-agent-kit)
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
- 🤖 **Universal AI Editor Support**: Pre-configured rules and skills for Cursor, Claude Code / Desktop, Google Antigravity, Cline / Roo Code, Windsurf, and Zed.

---

## Quick Start

Initialize CyberMP rules and MCP configuration in your project with a single command:

```bash
npx cybermp-agent-kit init
```

The interactive wizard will ask which AI editors you use and configure them automatically.

### Command-Line Options

```bash
# Non-interactive initialization for default editors (Cursor, Claude, Antigravity)
npx cybermp-agent-kit init -y

# Configure specific editors
npx cybermp-agent-kit init -e cursor claude antigravity

# Configure the global Antigravity MCP separately
npx cybermp-agent-kit init -e antigravity --global-antigravity -y

# Install standalone Antigravity plugin into .agents/plugins/cybermp/
npx cybermp-agent-kit init --plugin

# Copy cybermp-dev Agent Skill into .agents/skills/
npx cybermp-agent-kit init --skill

# Overwrite existing configuration files
npx cybermp-agent-kit init -f
```

---

## MCP Configuration Snippets

You can view copy-pasteable configuration for any editor at any time:

```bash
npx cybermp-agent-kit config [cursor|claude|antigravity|cline|windsurf|zed|all]
```

### 1. Cursor (`.cursor/mcp.json`)
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

### 2. Claude Code & Claude Desktop (`.mcp.json` / `claude_desktop_config.json`)
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

### 3. Google Antigravity (`~/.gemini/config/mcp_config.json`)
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

### 4. Cline / Roo Code (`.cline/mcp_settings.json`)
```json
{
  "mcpServers": {
    "cybermp": {
      "command": "npx",
      "args": ["-y", "cybermp-agent-kit"],
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

### 5. Windsurf (`mcp_config.json`)
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

### 6. Zed (`.zed/settings.json`)
```json
{
  "context_servers": {
    "cybermp": {
      "command": "npx",
      "args": ["-y", "cybermp-agent-kit"]
    }
  }
}
```

*(Note: On Windows systems, `init` and `config` automatically configure `npx.cmd` to ensure safe child process spawning).*

---

## MCP Tools Reference

When connected, `cybermp-agent-kit` provides 4 specialized MCP tools:

| Tool | Description | Example Query |
|---|---|---|
| `cybermp_search_docs` | Full-text search across 38 offline guides and recipes | `{"query": "vehicle seats"}` |
| `cybermp_get_type` | Inspect TypeScript interfaces and 19k+ REDengine native classes | `{"name": "TeleportationFacility"}` |
| `cybermp_get_event` | Fetch event callback signatures and execution context | `{"name": "playerEnterVehicle", "env": "server"}` |
| `cybermp_get_rpc_flow` | Generate paired sender & receiver RPC boilerplate | `{"from": "client", "to": "browser"}` |

---

## Context Boundaries Reference

In CyberMP, all native engine calls and facilities run through the global `mp.*` namespace across all three execution environments:

1. **Server** (`@cybermp/server-types`): Node.js environment. Authoritative game state, player sessions, vehicle management, and commands.
   - Listen to events: `mp.events.on(name, callback)`
   - Listen to client RPC: `mp.events.onClient(name, (player: MpPlayer, ...args) => ...)`
   - Send to client: `mp.events.emitClient(player, name, ...args)`
   - Register commands: `mp.commands.add(name, (player: MpPlayer, ...args) => ...)`

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

## License

[GNU General Public License v3.0](LICENSE)
