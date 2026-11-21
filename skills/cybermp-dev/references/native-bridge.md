---
title: CyberMP native bridge
description: Enable use_game_natives in resource.toml and choose the client bridge for JavaScript, TypeScript or Lua.
environment: client
verificationStatus: static-cross-check
aliases: [Working with Game Natives, native bridge, REDengine bridge, use_game_natives, Lua game natives]
priorityAliases: [Working with Game Natives, native bridge, REDengine bridge, use_game_natives, Lua game natives]
---
# CyberMP native bridge

Set `use_game_natives = true` in `resource.toml` and point `client_script` to the built `.js` file or the `.lua` script. JavaScript and compiled TypeScript use `mp.game`. Lua uses the global `Game` object. Wait for the world before querying engine systems. The local player puppet can appear later. For player-dependent work verify that `mp.game.GetPlayer()` or `Game.GetPlayer()` returns an object. https://docs.cyber.mp/reference/client/working-with-game-natives/

## JavaScript and TypeScript player access

For a TypeScript client with natives enabled, register `mp.game.onLocalPlayerSpawned` before spawning. Read the puppet inside the callback and guard the result. Use `mp.game.onceGameLoaded` for work that only needs the loaded world. [Client lifecycle](https://docs.cyber.mp/guides/client/lifecycle/)

```typescript env=client checked=@cybermp/client-types@2.7.1
mp.game.onLocalPlayerSpawned(() => {
  const player = mp.game.GetPlayer();
  if (player) console.log(player.GetEntityID());
});
```

## Lua player access

With natives enabled in a Lua client script, `mp.registerGameState('onGameLoaded', fn)` can observe world loading. This diagnostic only logs the puppet ID if one exists at that point. For work that requires a newly spawned player, check for the puppet after the spawn request. Use dot syntax for `Game.GetPlayer()` and colon syntax for methods on the returned object. [Lua client reference](https://docs.cyber.mp/reference/lua/client/)

```lua env=client
mp.registerGameState('onGameLoaded', function()
  local player = Game.GetPlayer()
  if player then
    print(player:GetEntityID())
  end
end)
```

## Bridge values and asset hashes

Use the declared struct fields for JavaScript vector arguments, such as `x` and `y` for a `Vector2`. Lua uses engine struct constructors such as `Vector4.new`. For a JavaScript parameter of type `Variant`, check the native value type before using `mp.game.toVariant(value, typeName)`. [Native bridge conversions](https://docs.cyber.mp/reference/client/working-with-game-natives/#bridge-gotchas--rules)

Use `mp.game.hashes.toResref` for a client JavaScript depot path and `mp.hashes.toResref` for a client Lua depot path. These helpers return strings. Convert according to the receiving API. For example, JavaScript local entity creation can take `BigInt(hash)` for a 64-bit model identifier. Choose `toCname` for an appearance name and `toTweakdbid` for a TweakDB record. The server JavaScript API has its own `mp.hashes.resref` method. [Client hash types](https://docs.cyber.mp/reference/client/api/natives/mpgamehashes/) · [Local entities](https://docs.cyber.mp/guides/client/local-entities/) · [Server hash types](https://docs.cyber.mp/reference/server/api/global/mphashes/)
