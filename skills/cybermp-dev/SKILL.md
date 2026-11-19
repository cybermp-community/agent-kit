---
name: cybermp-dev
description: Comprehensive developer guide and runbook for building CyberMP multiplayer resources (Cyberpunk 2077). Use when creating resources, writing server/client scripts, wiring CEF web UIs, or configuring multiplayer TypeScript environments.
---

# CyberMP Development Runbook & Agent Skill

Welcome to the CyberMP development guide. This skill provides AI agents and human developers with authoritative instructions, runbooks, context boundaries, and anti-hallucination rules for building multiplayer modifications and resources for **Cyberpunk 2077** using the **CyberMP** platform.

---

## 1. The Three-Tier Architecture & Context Separation

CyberMP isolates execution across three completely separate JavaScript runtimes. Never mix their APIs or assumptions:

```
┌────────────────────────────────┐         ┌────────────────────────────────┐         ┌────────────────────────────────┐
│             Server             │         │             Client             │         │          CEF Browser           │
│         (Node.js Host)         │ ◄─────► │        (Game Client V8)        │ ◄─────► │        (Chromium UI)           │
├────────────────────────────────┤         ├────────────────────────────────┤         ├────────────────────────────────┤
│ • Authority over state         │         │ • Runs in Cyberpunk 2077       │         │ • HTML, CSS, React, Vue        │
│ • Database & file system       │         │ • Local entities, streaming    │         │ • Isolated web DOM context     │
│ • events.on (engine events)    │         │ • Camera, sound, input binding │         │ • window.cybermp.events.on     │
│ • events.onClient(name, (p)...)│         │ • events.onServer(name, cb)    │         │ • window.cybermp.events.emit   │
│ • events.emitClient(player...) │         │ • events.emitServer(name, args)│         │                                │
│ • commands.add(name, cb)       │         │ • events.emitCef(name, args)   │         │                                │
│ • @cybermp/server-types        │         │ • events.onCef(name, cb)       │         │ • @cybermp/browser-types       │
│                                │         │ • @cybermp/client-types        │         │                                │
└────────────────────────────────┘         └────────────────────────────────┘         └────────────────────────────────┘
```

### Context Boundary Rules
1. **Server $\leftrightarrow$ Client**: Communicates via network RPC:
   - Server sends to Client: `events.emitClient(player, eventName, ...args)`
   - Client listens from Server: `events.onServer(eventName, (...args) => ...)`
   - Client sends to Server: `events.emitServer(eventName, ...args)`
   - Server listens from Client: `events.onClient(eventName, (player: MpPlayer, ...args) => ...)`
2. **Client $\leftrightarrow$ CEF Browser**: Communicates via local IPC bridge:
   - Client sends to CEF: `events.emitCef(eventName, ...args)`
   - CEF listens from Client: `cybermp.events.on(eventName, (...args) => ...)`
   - CEF sends to Client: `cybermp.events.emit(eventName, ...args)`
   - Client listens from CEF: `events.onCef(eventName, (...args) => ...)`
3. **Server $\leftrightarrow$ CEF Browser**: **DIRECT COMMUNICATION IS IMPOSSIBLE.** The server and CEF browser cannot connect directly. Every event between server and UI must be forwarded through the client script.

---

## 2. Strict Negative Constraints & Anti-Hallucination Rules

Because CyberMP is newer than legacy multiplayer platforms (FiveM, alt:V, RAGEMP, SA-MP), LLMs often hallucinate incorrect APIs. You must **NEVER** use foreign multiplayer platform APIs.

### ⛔ Prohibited Foreign Functions & Correct CyberMP Equivalents

| Prohibited Foreign API | Platform | Official CyberMP Equivalent |
|---|---|---|
| `RegisterNetEvent('ev')` / `onNet('ev', cb)` | FiveM | `events.onClient('ev', (player, ...args) => ...)` (Server) or `events.onServer('ev', cb)` (Client) |
| `TriggerServerEvent('ev', ...args)` | FiveM | `events.emitServer('ev', ...args)` (Client) |
| `TriggerClientEvent('ev', id, ...args)` | FiveM | `events.emitClient(player, 'ev', ...args)` (Server) |
| `AddEventHandler('ev', cb)` | FiveM | `events.on('ev', cb)` |
| `GetPlayerPed(-1)` | FiveM | `player` instance / local player context |
| `SetEntityCoords(ped, x, y, z)` | FiveM | `entity.position = new Vector3(x, y, z)` |
| `alt.onClient('ev', cb)` / `alt.onServer` | alt:V | `events.onClient('ev', (player, ...args) => ...)` / `events.onServer('ev', cb)` |
| `alt.emitClient(p, 'ev', ...args)` | alt:V | `events.emitClient(player, 'ev', ...args)` |
| `alt.emitServer('ev', ...args)` | alt:V | `events.emitServer('ev', ...args)` |
| `alt.Player.local` | alt:V | Client-side player entity streaming / reference |
| `mp.events.add('ev', cb)` | RAGEMP | `events.on('ev', cb)` |
| `mp.events.callRemote('ev', ...args)` | RAGEMP | `events.emitServer('ev', ...args)` |
| `mp.events.callClient(p, 'ev', ...args)`| RAGEMP | `events.emitClient(player, 'ev', ...args)` |
| `mp.players.local` | RAGEMP | Local client player context |
| `OnPlayerConnect` / `SetPlayerPos` | SA-MP | `events.on('playerConnected', (id, tempId) => ...)` / `player.position` |

---

## 3. Step-by-Step Resource Creation Runbook

Follow this checklist whenever creating or scaffolding a new CyberMP resource:

### Step 1: Scaffolding Directory Structure
Create a dedicated resource directory in your server's resources folder:
```
my-resource/
├── package.json
├── tsconfig.json
├── tsconfig.server.json
├── tsconfig.client.json
├── src/
│   ├── server/index.ts
│   ├── client/index.ts
│   └── cef/
│       ├── index.html
│       └── app.ts
└── dist/
```

### Step 2: Initialize `package.json`
Install the official TypeScript type packages:
```bash
npm install -D @cybermp/server-types @cybermp/client-types @cybermp/browser-types typescript esbuild
```

### Step 3: Configure `tsconfig.json` Files
- Base `tsconfig.json`: Target ES2022, NodeNext module resolution.
- `tsconfig.server.json`: Include `@cybermp/server-types`, outDir `dist/server`.
- `tsconfig.client.json`: Include `@cybermp/client-types`, outDir `dist/client`.

### Step 4: Write Core Scripts
1. **Server (`src/server/index.ts`)**:
   ```typescript
   import type { MpPlayer } from '@cybermp/server-types';

   events.on('playerConnected', (playerId: number, tempId: string) => {
     console.log(`Player ${playerId} joined`);
   });

   events.onClient('ping', (player: MpPlayer) => {
     events.emitClient(player, 'pong', Date.now());
   });
   ```

2. **Client (`src/client/index.ts`)**:
   ```typescript
   events.onServer('pong', (serverTime: number) => {
     console.log('Pong received from server at:', serverTime);
   });

   events.emitServer('ping');
   ```

### Step 5: Bundle and Register
Build scripts with `esbuild` or `tsc`. Register the resource in `server.toml`:
```toml
resources = ["my-resource"]
```

---

## 4. CEF Web UI Bridge Guide

CyberMP includes an embedded Chromium environment for rich interactive user interfaces (HUDs, inventories, dialogs, character creators).

### 1. Client Setup
In your client script (`src/client/index.ts`), initialize the webview:
```typescript
// Client registers CEF event listeners
events.onCef('login:submit', (credentials: { username: string; hash: string }) => {
  // Forward to server for verification
  events.emitServer('auth:verify', credentials);
});

// Update the UI from game client events
events.onServer('auth:success', (userData) => {
  events.emitCef('ui:setLoggedIn', userData);
});
```

### 2. Browser Web Application (`src/cef/app.ts`)
The game engine automatically injects the `window.cybermp` object into the DOM:
```javascript
// Listen for events sent from client-side script
cybermp.events.on('ui:setLoggedIn', (userData) => {
  document.getElementById('login-modal').style.display = 'none';
  document.getElementById('welcome-user').innerText = userData.name;
});

// Send events to client-side script upon user actions
document.getElementById('submit-btn').addEventListener('click', () => {
  const username = document.getElementById('user-input').value;
  cybermp.events.emit('login:submit', { username });
});
```

---

## 5. Player Lifecycle & Commands

### Player Lifecycle Events on Server
```typescript
// 1. Connection negotiation
events.on('playerConnecting', (tempId: string, ip: string) => {
  console.log(`Connecting: ${tempId} from ${ip}`);
});

// 2. Fully connected and assigned an ID
events.on('playerConnected', (playerId: number, tempId: string) => {
  console.log(`Connected: ${playerId}`);
});

// 3. Spawning into the world
events.on('playerSpawn', (playerId: number) => {
  console.log(`Spawned player: ${playerId}`);
});

// 4. Damage handling (authoritative, return false to cancel damage)
events.on('damage', (playerId: number, data: DamageEventData) => {
  console.log(`Player ${playerId} took ${data.totalDamage} damage from ${data.killerId}`);
});

// 5. Player death
events.on('playerDeath', (playerId: number, killerId: number, reason: number) => {
  console.log(`Player ${playerId} killed by ${killerId} (reason: ${reason})`);
});

// 6. Disconnect
events.on('playerDisconnected', (playerId: number, reason: number) => {
  console.log(`Player ${playerId} disconnected (code: ${reason})`);
});
```

### Custom Chat & Console Commands
Register commands using `commands.add`:
```typescript
commands.add('teleport', (player: MpPlayer, x: string, y: string, z: string) => {
  if (!x || !y || !z) {
    events.emitClient(player, 'chat:notify', 'Usage: /teleport <x> <y> <z>');
    return;
  }
  player.position = new Vector3(parseFloat(x), parseFloat(y), parseFloat(z));
});
```

---

## 6. MCP Tool Call Instructions

When this agent environment is connected to the `cybermp-mcp` server, query the specialized tools before writing code:

1. **`cybermp_get_event`**:
   - Query exact event callback parameters and JSDocs.
   - Example: `cybermp_get_event({ env: "server", name: "damage" })`
2. **`cybermp_get_type`**:
   - Look up class, interface, and enum definitions from `@cybermp/*-types`.
   - Example: `cybermp_get_type({ name: "MpPlayer", env: "server" })`
3. **`cybermp_get_rpc_flow`**:
   - Obtain verified paired snippets for RPC transmission.
   - Example: `cybermp_get_rpc_flow({ from: "client", to: "server" })`
4. **`cybermp_search_docs`**:
   - Search official guides for recipes and implementation patterns.
   - Example: `cybermp_search_docs({ query: "live reload" })`

---

## 7. Offline Fallback Instructions (Without MCP)

If the MCP server is unavailable or running in a skill-only mode:
1. **Consult Local References in `references/`**:
   - [Core Events Catalog](references/events.md): Full listener signatures and event parameters for Server, Client, Browser.
   - [RPC Flows Matrix](references/rpc-flows.md): Complete paired code snippets for inter-process communication.
   - [Resource Structure & Toolchain](references/resource-structure.md): Standard directory layout, `package.json`, and `tsconfig.json`.
2. **Inspect Installed Types**:
   Check the TypeScript definition files directly in `node_modules/@cybermp/`:
   - Server: `node_modules/@cybermp/server-types/src/index.ts`
   - Client: `node_modules/@cybermp/client-types/precomputed/index.d.ts`
   - Browser: `node_modules/@cybermp/browser-types/index.d.ts`
3. **Starter Examples**:
   - [Server Starter Example](examples/basic-resource/server.ts)
   - [Client Starter Example](examples/basic-resource/client.ts)
