# cybermp-mcp

CyberMP AI Agent Extension & MCP Server.

An offline-first Model Context Protocol (MCP) server, universal agent skills, and anti-hallucination rules for CyberMP multiplayer modding development.

## Features

- **Anti-Hallucination Guard**: Immediate detection and correction for foreign multiplayer framework APIs (FiveM, alt:V, RAGE:MP).
- **Fast Type & Event Introspection**: Offline AST-indexed documentation and types for `@cybermp/server`, `@cybermp/client`, and `@cybermp/browser`.
- **Directional RPC Validation**: Validates cross-boundary event emission and handlers (`emitClient` / `onServer`, `emitCef` / `events.on`).
- **Universal Agent Support**: Agent skills and configuration templates for Claude Code, Cursor, Windsurf, Copilot, and more.

## Installation & Setup

```bash
pnpm install
pnpm test
```

## CLI Usage

```bash
cybermp-mcp init
```
