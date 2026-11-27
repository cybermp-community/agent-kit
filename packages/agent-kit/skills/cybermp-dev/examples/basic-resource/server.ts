import type { MpPlayer, MpServer } from '@cybermp/server-types';

declare const mp: MpServer;

/**
 * Minimal CyberMP Starter Resource - Server Script
 *
 * Runs on Node.js host environment.
 * Responsible for state authority, player lifecycle, and RPC handling.
 */

// 1. Listen for core engine lifecycle events
mp.events.on('playerConnected', (playerId: number, tempId: string) => {
  console.log(`[Server] Player connected with ID ${playerId} (tempId: ${tempId})`);
});

mp.events.on('playerDisconnected', (playerId, reason) => {
  console.log(`[Server] Player ID ${playerId} disconnected (reason: ${reason})`);
});

// 2. Listen for Client-to-Server RPC events
// In CyberMP, the sending player's MpPlayer instance is ALWAYS the first argument
mp.events.onClient('chat:sendMessage', (player: MpPlayer, message: string) => {
  console.log(`[Chat] ${player.nickname} (${player.id}): ${message}`);

  // Echo notification back to the client
  mp.events.emitClient(player, 'chat:receiveMessage', {
    sender: player.nickname,
    text: message,
    timestamp: Date.now(),
  });
});

// 3. Register a custom chat/console command
mp.commands.add('heal', (player) => {
  if (!player) return;
  // Demonstrates a client notification. Apply game state in your server logic.
  console.log(`[Command] Heal requested by ${player.nickname}`);
  mp.events.emitClient(player, 'player:healed', 100);
});

console.log('✅ CyberMP basic-resource server script initialized.');
