import type { MpClient } from '@cybermp/client-types';
import { events, isPropAsset, propPaths } from './protocol.js';

declare const mp: MpClient;

let localHandle: number | undefined;
let trackedNetworkId: number | null = null;
let streamState: boolean | undefined;

function trackSharedObject(id: number | null): void {
  if (trackedNetworkId === id) return;
  trackedNetworkId = id;
  streamState = undefined;
  if (id === null) {
    console.log('[kitprop] shared streaming notifications disabled');
    return;
  }
  const gameId = mp.network.getObjectGameId(id);
  streamState = gameId > 0;
  console.log(`[kitprop] tracking shared Network ID=${id}, local Game ID=${gameId}, initial state=${streamState ? 'IN' : 'OUT'}`);
}

function reportStreaming(netId: number, gameId: number, inStream: boolean): void {
  if (netId !== trackedNetworkId || streamState === inStream) return;
  streamState = inStream;
  console.log(`[kitprop] ${inStream ? 'STREAM_IN' : 'STREAM_OUT'} Network ID=${netId}, local Game ID=${gameId}`);
  const message = inStream ? 'Стена вернулась в стриминг' : 'Стена вышла из стриминга';
  try {
    mp.game.GetPlayer()?.SetWarningMessage(`${message} (Network ID=${netId})`);
  } catch (error) {
    console.warn('[kitprop] HUD notification unavailable; see STREAM_IN/STREAM_OUT log:', error);
  }
}

function onObjectStreamIn(netId: number, gameId: number): void {
  reportStreaming(netId, gameId, true);
}

function onObjectStreamOut(netId: number, gameId: number): void {
  reportStreaming(netId, gameId, false);
}

mp.events.onServer(events.track, trackSharedObject);
mp.events.on('objectStreamIn', onObjectStreamIn);
mp.events.on('objectStreamOut', onObjectStreamOut);

function clearLocalObject(): void {
  if (localHandle === undefined) return;
  mp.local.despawnObject(localHandle);
  console.log(`[kitprop] removed local handle ${localHandle}`);
  localHandle = undefined;
}

mp.events.onServer(events.local, (asset: unknown) => {
  if (!isPropAsset(asset)) return;
  const player = mp.game.GetPlayer();
  if (!player) {
    console.warn('[kitprop] local player is unavailable. Wait for your game mode to spawn you.');
    return;
  }

  clearLocalObject();
  const path = propPaths[asset];
  const hash = mp.game.redResourceReferenceScriptToken.GetHash(path);
  const position = player.GetWorldPosition();
  const x = position.x + 3;
  const y = position.y;
  const z = position.z + 1;
  localHandle = mp.local.spawnObject(hash, 0, x, y, z, 0, 0, 0, true);
  console.log(`[kitprop] local request ${asset}, ${path}, handle=${localHandle}, position=${x},${y},${z}`);
});

mp.events.onServer(events.status, (sharedNetworkId: number | null) => {
  trackSharedObject(sharedNetworkId);
  const gameId = sharedNetworkId === null ? null : mp.network.getObjectGameId(sharedNetworkId);
  console.log(`[kitprop] local handle=${localHandle ?? 'none'}, shared Network ID=${sharedNetworkId ?? 'none'}, local Game ID=${gameId ?? 'none'}`);
});
mp.events.onServer(events.clear, clearLocalObject);
mp.events.on('resourceStop', () => {
  trackedNetworkId = null;
  streamState = undefined;
  mp.events.off('objectStreamIn', onObjectStreamIn);
  mp.events.off('objectStreamOut', onObjectStreamOut);
  clearLocalObject();
});
