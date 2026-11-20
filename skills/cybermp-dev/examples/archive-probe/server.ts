import type { MpObject, MpServer, Vector3 } from '@cybermp/server-types';
import { commandName, events, isPropAsset, propPaths } from './protocol.js';

declare const mp: MpServer;

let shared: MpObject | undefined;

function clearSharedObject(): void {
  if (shared?.exist) {
    const id = shared.id;
    shared.destroy();
    console.log(`[kitprop] removed shared Network ID=${id}`);
  }
  shared = undefined;
}

mp.commands.add(commandName, (player, [action, asset]) => {
  if (action === 'clear') {
    clearSharedObject();
    if (player) mp.events.emitClient(player, events.clear);
    return;
  }
  if (action === 'status') {
    const id = shared?.exist ? shared.id : null;
    console.log(`[kitprop] shared Network ID=${id ?? 'none'}`);
    if (player) mp.events.emitClient(player, events.status, id);
    return;
  }
  if (!player || !isPropAsset(asset) || (action !== 'local' && action !== 'shared')) {
    console.log('[kitprop] From in-game F8: kitprop local base, kitprop shared base, kitprop status, kitprop clear. Use archive after enabling the archive manifest.');
    return;
  }
  if (action === 'local') {
    mp.events.emitClient(player, events.local, asset);
    return;
  }

  const [x, y, z] = player.position;
  const position: Vector3 = [x + 3, y, z + 1];
  const path = propPaths[asset];
  clearSharedObject();
  shared = mp.objects.create({ model: mp.hashes.resref(path), position, dimension: player.dimension, dynamic: false });
  console.log(`[kitprop] shared request ${asset}, ${path}, Network ID=${shared.id}, dimension=${player.dimension}, position=${position.join(',')}`);
});

mp.events.on('resourceStop', () => {
  mp.commands.remove(commandName);
  clearSharedObject();
});
