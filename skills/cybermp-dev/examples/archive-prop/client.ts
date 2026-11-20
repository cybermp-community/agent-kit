import type { MpClient } from '@cybermp/client-types';

declare const mp: MpClient;

const entityPath = 'cybermp_kit\\diagnostics\\cube.ent';
let localObject: number | undefined;

function removeSample(): void {
  if (localObject === undefined) return;
  const handle = localObject;
  localObject = undefined;
  mp.local.despawnObject(handle);
}

mp.game.onLocalPlayerSpawned(() => {
  const player = mp.game.GetPlayer();
  if (!player) return;
  removeSample();

  const position = player.GetWorldPosition();
  const modelHash = mp.game.redResourceReferenceScriptToken.GetHash(entityPath);
  // The default appearance is a candidate to verify with the generated entity.
  const appearanceHash = 0;
  localObject = mp.local.spawnObject(
    modelHash, appearanceHash, position.x + 3, position.y, position.z + 1,
    0, 0, 0, true,
  );
  console.log(`[archive-prop] requested ${entityPath}, handle: ${localObject}`);
});

mp.events.on('resourceStop', removeSample);
