import type { MpClient } from '@cybermp/client-types';
import { events, isPropAsset, propPaths } from './protocol.js';

declare const mp: MpClient;

let localHandle: number | undefined;

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
  const gameId = sharedNetworkId === null ? null : mp.network.getObjectGameId(sharedNetworkId);
  console.log(`[kitprop] local handle=${localHandle ?? 'none'}, shared Network ID=${sharedNetworkId ?? 'none'}, local Game ID=${gameId ?? 'none'}`);
});
mp.events.onServer(events.clear, clearLocalObject);
mp.events.on('resourceStop', clearLocalObject);
