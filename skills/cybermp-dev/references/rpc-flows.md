# CyberMP RPC Flows Reference

This guide provides the complete inter-process communication (RPC) matrix for CyberMP. It defines how data moves between **Server**, **Client**, and **CEF Browser**, with copy-pasteable code patterns and critical guardrails.

---

## 1. RPC Architecture & Communication Matrix

CyberMP uses a three-tier architecture with strictly defined directional boundaries:

```
┌──────────────────┐               ┌──────────────────┐               ┌──────────────────┐
│   Node.js Host   │ ◄───────────► │  Game Client V8  │ ◄───────────► │   CEF Web UI     │
│     (Server)     │               │     (Client)     │               │    (Browser)     │
└──────────────────┘               └──────────────────┘               └──────────────────┘
         ▲                                                                      ▲
         │                                                                      │
         └────────────────────── ❌ DIRECT LINK FORBIDDEN ──────────────────────┘
```

> ⚠️ **CRITICAL CONTEXT RULE:**
> Server and Browser (CEF) **cannot** communicate directly. Any communication between the server and the web UI must be routed through the Game Client as an intermediate bridge.

| Direction | Sender Method | Receiver Method | Receiver Arguments | Notes |
|---|---|---|---|---|
| **Server $\rightarrow$ Client** | `mp.events.emitClient(player, event, ...args)` | `mp.events.onServer(event, (...args) => ...)` | Exact args sent by server | Target single player or iterate |
| **Client $\rightarrow$ Server** | `mp.events.emitServer(event, ...args)` | `mp.events.onClient(event, (player, ...args) => ...)` | **`player: MpPlayer` is automatically injected as arg 0** | Never pass sender ID from client |
| **Client $\rightarrow$ Browser** | `mp.events.emitCef(event, ...args)` | `mp.events.on(event, (...args) => ...)` | Exact args sent by client | Delivers to Chromium DOM context |
| **Browser $\rightarrow$ Client** | `mp.events.emit(event, ...args)` | `mp.events.onCef(event, (...args) => ...)` | Exact args sent by web UI | Handles UI clicks, form inputs |
| **Server $\leftrightarrow$ Browser** | *Route via Client* | *Route via Client* | Chained bridge | Client forwards payloads |

---

## 2. Copy-Pasteable Implementation Patterns

### Pattern A: Server $\rightarrow$ Client (Push Notification / State Sync)

**Server (`src/server/index.ts`):**
```typescript env=server
import type { MpPlayer } from '@cybermp/server-types';

// Emit to an individual player (mp.events and mp.players are global in server runtime)
function notifyPlayer(player: MpPlayer, message: string) {
  mp.events.emitClient(player, 'chat:notify', {
    type: 'info',
    text: message,
    timestamp: Date.now(),
  });
}

// Broadcast to all connected players
function broadcastMessage(message: string) {
  for (const player of mp.players.toArray()) {
    mp.events.emitClient(player, 'chat:notify', {
      type: 'broadcast',
      text: message,
      timestamp: Date.now(),
    });
  }
}
```

**Client (`src/client/index.ts`):**
```typescript env=client
// In CyberMP client scripts, `mp.events` is a global runtime object
mp.events.onServer('chat:notify', (data: { type: string; text: string; timestamp: number }) => {
  console.log(`[Notification ${data.type}] ${data.text}`);
  // Forward to CEF HUD if active
  mp.events.emitCef('hud:showNotification', data);
});
```

---

### Pattern B: Client $\rightarrow$ Server (Action Request)

**Client (`src/client/index.ts`):**
```typescript env=client
// Client requests to buy a vehicle (mp.events is a global runtime object)
function requestVehiclePurchase(modelId: string) {
  mp.events.emitServer('dealership:purchaseVehicle', modelId);
}
```

**Server (`src/server/index.ts`):**
```typescript env=server
import type { MpPlayer } from '@cybermp/server-types';

// Notice: player is ALWAYS prepended by the engine as the first parameter
mp.events.onClient('dealership:purchaseVehicle', (player: MpPlayer, modelId: string) => {
  console.log(`Purchase request from player: ${player.nickname} (ID: ${player.id}) for ${modelId}`);

  // Acknowledge receipt. Validate model, price, and player permissions
  // on the server before implementing a purchase.
  mp.events.emitClient(player, 'dealership:purchaseReceived', modelId);
});
```

---

### Pattern C: Client $\rightarrow$ Browser (Updating Web UI / HUD)

**Client (`src/client/index.ts`):**
```typescript env=client
// Update player stats in web HUD (mp.events is a global runtime object)
function syncHud(health: number, armor: number, eddies: number) {
  mp.events.emitCef('hud:updateStats', {
    hp: health,
    ap: armor,
    money: eddies,
  });
}
```

**CEF Browser (`src/cef/app.ts` / HTML):**
```javascript env=browser
// Web UI JavaScript (window.mp.events is injected into DOM by game engine)
mp.events.on('hud:updateStats', (stats) => {
  const healthBar = document.getElementById('hp-bar');
  const armorBar = document.getElementById('ap-bar');
  const counter = document.getElementById('eddies-counter');
  if (healthBar) healthBar.style.width = `${stats.hp}%`;
  if (armorBar) armorBar.style.width = `${stats.ap}%`;
  if (counter) counter.textContent = `$${stats.money.toLocaleString()}`;
});
```

---

### Pattern D: Browser $\rightarrow$ Client (Web UI User Interaction)

**CEF Browser (`src/cef/app.ts`):**
```javascript env=browser
// User submits character customization form
document.getElementById('save-char-btn')?.addEventListener('click', () => {
  const voice = document.getElementById('voice-select');
  const hair = document.getElementById('hair-color-picker');
  if (!(voice instanceof HTMLSelectElement) || !(hair instanceof HTMLInputElement)) return;

  const selectedVoice = voice.value;
  const hairColor = hair.value;

  mp.events.emit('ui:saveCharacter', {
    voice: selectedVoice,
    hairColor: hairColor,
  });
});
```

**Client (`src/client/index.ts`):**
```typescript env=client
// Listen for events sent from CEF web view (mp.events is a global runtime object)
mp.events.onCef('ui:saveCharacter', (data: { voice: string; hairColor: string }) => {
  console.log('Received customization from UI:', data);
  // Forward to server to persist character in database
  mp.events.emitServer('char:saveAppearance', data);
});
```

---

### Pattern E: Full 3-Tier Roundtrip (CEF UI $\leftrightarrow$ Client $\leftrightarrow$ Server)

A CEF clock can request the current server time through the client bridge:

1. **CEF Browser** requests a timestamp.
   ```javascript env=browser
   mp.events.emit('clock:request');
   ```
2. **Client** forwards the request to the server.
   ```typescript env=client
   mp.events.onCef('clock:request', () => {
     mp.events.emitServer('clock:request');
   });
   ```
3. **Server** replies to the player supplied by `onClient`.
   ```typescript env=server
   mp.events.onClient('clock:request', (player) => {
     mp.events.emitClient(player, 'clock:result', Date.now());
   });
   ```
4. **Client** forwards the timestamp to CEF.
   ```typescript env=client
   mp.events.onServer('clock:result', (serverTime: number) => {
     mp.events.emitCef('clock:result', serverTime);
   });
   ```
5. **CEF Browser** updates its view.
   ```javascript env=browser
   mp.events.on('clock:result', (serverTime) => {
     const label = document.getElementById('server-time');
     if (label) label.textContent = new Date(serverTime).toISOString();
   });
   ```

---

## 3. Anti-Patterns & Common Traps

| Prohibited Anti-Pattern | Correct CyberMP Pattern |
|---|---|
| `mp.events.emitServer` inside Server script | Only valid on **Client**; server uses `mp.events.emitClient(player, ...)` |
| `mp.events.emitClient` inside Client script | Only valid on **Server**; client uses `mp.events.emitServer(...)` or `mp.events.emitCef(...)` |
| `mp.events.onClient('foo', (arg1, arg2) => ...)` | First parameter is **always** `(player: MpPlayer, arg1, arg2)` |
| Passing client player ID as an RPC argument: `mp.events.emitServer('pay', playerId, 100)` | **Security vulnerability!** The server already knows the sender identity via the prepended `player` object |
| Calling CEF from Server directly | Route through Client script using `mp.events.emitClient` $\rightarrow$ `mp.events.emitCef` |
| Passing complex class instances or functions over RPC | Only pass JSON-serializable primitives, arrays, and plain objects |
