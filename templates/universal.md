# CyberMP Multiplayer Development Rules (Universal)

Universal rules and reference for AI coding assistants developing CyberMP multiplayer resources for Cyberpunk 2077.

## Three-Tier Architecture

CyberMP code runs in three strictly isolated execution contexts:
- **Server**: Authoritative Node.js runtime (`@cybermp/server-types`).
  - Native engine events: `events.on(eventName, callback)`
  - Client RPC handler: `events.onClient(eventName, (player: MpPlayer, ...args) => ...)`
  - Emit to client: `events.emitClient(player, eventName, ...args)`
  - Server commands: `commands.add(commandName, callback)`
- **Client**: In-game client runtime (`@cybermp/client-types`).
  - Server RPC handler: `events.onServer(eventName, (...args) => ...)`
  - Emit to server: `events.emitServer(eventName, ...args)`
  - CEF IPC handler: `events.onCef(eventName, (...args) => ...)`
  - Emit to CEF: `events.emitCef(eventName, ...args)`
- **CEF**: Embedded Chromium UI (`@cybermp/browser-types`).
  - Client IPC handler: `cybermp.events.on(eventName, (...args) => ...)`
  - Emit to client: `cybermp.events.emit(eventName, ...args)`
  - Important: Server and CEF have no direct connection.

## Strict Anti-Hallucination Guardrails

Do not confuse CyberMP with older multiplayer platforms:
- Prohibited: `RegisterNetEvent`, `TriggerClientEvent`, `TriggerServerEvent`, `AddEventHandler` (FiveM).
- Prohibited: `alt.onClient`, `alt.emitServer`, `alt.Player.local` (alt:V).
- Prohibited: `mp.events.add`, `mp.events.callRemote`, `mp.players.local` (RAGEMP).
- Prohibited: `OnPlayerConnect`, `SetPlayerPos` (SA-MP).

Use CyberMP's native APIs and TypeScript type definitions.

## MCP Tools Integration

If the `cybermp-mcp` server is configured:
- `cybermp_get_event`: Query event names and listener callback signatures.
- `cybermp_get_type`: Inspect TypeScript interfaces, properties, and methods.
- `cybermp_get_rpc_flow`: Retrieve bidirectional sender/receiver RPC code snippets.
- `cybermp_search_docs`: Search guides, best practices, and runbooks.
