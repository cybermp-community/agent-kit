/**
 * Minimal CyberMP Starter Resource - Client Script
 *
 * Runs inside Cyberpunk 2077 V8 engine runtime.
 * Responsible for rendering, local entity streaming, and UI bridging.
 */

// 1. Listen for Server-to-Client RPC events
events.onServer('chat:receiveMessage', (payload: { sender: string; text: string; timestamp: number }) => {
  console.log(`[Client Chat] ${payload.sender}: ${payload.text}`);

  // Optional: forward to local CEF browser HUD
  events.emitCef('hud:chatMessage', payload);
});

events.onServer('player:healed', (healthAmount: number) => {
  console.log(`[Client] Received heal from server: ${healthAmount} HP`);
});

// 2. Send Client-to-Server RPC event
// The server automatically identifies the sending player
function sendChatMessage(text: string) {
  events.emitServer('chat:sendMessage', text);
}

// Example: Send greeting upon resource startup
events.on('resourceStart', (resourceName: string) => {
  console.log(`[Client] Resource ${resourceName} started. Connecting to chat...`);
  sendChatMessage('Hello Night City!');
});
