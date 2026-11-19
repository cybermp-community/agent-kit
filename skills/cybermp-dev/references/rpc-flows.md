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
```typescript
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
  for (const player of mp.players.all) {
    mp.events.emitClient(player, 'chat:notify', {
      type: 'broadcast',
      text: message,
      timestamp: Date.now(),
    });
  }
}
```

**Client (`src/client/index.ts`):**
```typescript
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
```typescript
// Client requests to buy a vehicle (mp.events is a global runtime object)
function requestVehiclePurchase(modelId: string) {
  mp.events.emitServer('dealership:purchaseVehicle', modelId);
}
```

**Server (`src/server/index.ts`):**
```typescript
import type { MpPlayer } from '@cybermp/server-types';

// Notice: player is ALWAYS prepended by the engine as the first parameter
mp.events.onClient('dealership:purchaseVehicle', (player: MpPlayer, modelId: string) => {
  console.log(`Purchase request from player: ${player.name} (ID: ${player.id}) for ${modelId}`);

  // Validate server-authoritative state (e.g., money check)
  const playerCash = getPlayerCash(player);
  const cost = getVehicleCost(modelId);

  if (playerCash < cost) {
    mp.events.emitClient(player, 'dealership:purchaseFailed', 'Insufficient funds in account');
    return;
  }

  deductCash(player, cost);
  spawnVehicleForPlayer(player, modelId);
  mp.events.emitClient(player, 'dealership:purchaseSuccess', modelId);
});
```

---

### Pattern C: Client $\rightarrow$ Browser (Updating Web UI / HUD)

**Client (`src/client/index.ts`):**
```typescript
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
```javascript
// Web UI JavaScript (window.mp.events is injected into DOM by game engine)
mp.events.on('hud:updateStats', (stats) => {
  document.getElementById('hp-bar').style.width = `${stats.hp}%`;
  document.getElementById('ap-bar').style.width = `${stats.ap}%`;
  document.getElementById('eddies-counter').innerText = `$${stats.money.toLocaleString()}`;
});
```

---

### Pattern D: Browser $\rightarrow$ Client (Web UI User Interaction)

**CEF Browser (`src/cef/app.ts`):**
```javascript
// User submits character customization form
document.getElementById('save-char-btn').addEventListener('click', () => {
  const selectedVoice = document.getElementById('voice-select').value;
  const hairColor = document.getElementById('hair-color-picker').value;

  mp.events.emit('ui:saveCharacter', {
    voice: selectedVoice,
    hairColor: hairColor,
  });
});
```

**Client (`src/client/index.ts`):**
```typescript
// Listen for events sent from CEF web view (mp.events is a global runtime object)
mp.events.onCef('ui:saveCharacter', (data: { voice: string; hairColor: string }) => {
  console.log('Received customization from UI:', data);
  // Forward to server to persist character in database
  mp.events.emitServer('char:saveAppearance', data);
});
```

---

### Pattern E: Full 3-Tier Roundtrip (CEF UI $\leftrightarrow$ Client $\leftrightarrow$ Server)

When a web UI requests persistent server data (e.g., banking withdrawal):

1. **CEF Browser** emits user intent:
   ```javascript
   mp.events.emit('bank:withdraw', { amount: 500 });
   ```
2. **Client** catches event and forwards to server:
   ```typescript
   mp.events.onCef('bank:withdraw', (payload) => {
     mp.events.emitServer('bank:processWithdrawal', payload.amount);
   });
   ```
3. **Server** validates authority and responds:
   ```typescript
   mp.events.onClient('bank:processWithdrawal', (player, amount) => {
     const success = withdraw(player, amount);
     mp.events.emitClient(player, 'bank:withdrawalResult', { success, newBalance: getBalance(player) });
   });
   ```
4. **Client** receives result and pushes into UI:
   ```typescript
   mp.events.onServer('bank:withdrawalResult', (result) => {
     mp.events.emitCef('bank:displayResult', result);
   });
   ```
5. **CEF Browser** renders confirmation:
   ```javascript
   mp.events.on('bank:displayResult', (result) => {
     alert(result.success ? 'Withdrawal successful!' : 'Transaction rejected');
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
