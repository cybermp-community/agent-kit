---
title: CyberMP Lua events and runtime
description: Use mp.events.add for local events in CyberMP Lua on both client and server. Use mp.events.on for local events in CyberMP JavaScript and TypeScript.
environment: mixed
verificationStatus: static-cross-check
aliases: [Lua events, Lua API, mp.events.add, mp.events.addClient, mp.events.addServer, mp.events.triggerClient, mp.events.triggerServer, события Lua]
priorityAliases: [Lua events, Lua API, mp.events.add, mp.events.addClient, mp.events.addServer, mp.events.triggerClient, mp.events.triggerServer, события Lua]
---
# CyberMP Lua events and runtime

Determine the script language and runtime from `client_script` or `server_script` in `resource.toml`. The kit's generated event index and RPC code describe JavaScript and TypeScript. Use the documented Lua bindings for `.lua` resource scripts. [Client Lua API](https://docs.cyber.mp/reference/lua/client/#client-events-mpevents) · [Server Lua API](https://docs.cyber.mp/reference/lua/server/#server-events)

## Event routing in CyberMP Lua

| Direction | Sender | Listener |
| --- | --- | --- |
| Inside the same Lua runtime | `mp.events.trigger(name, ...)` | `mp.events.add(name, fn)` on server or client |
| Lua client to Lua server | `mp.events.triggerServer(name, ...)` | `mp.events.addClient(name, fn)` on the server. The first callback argument is the sender's player object. |
| Lua server to Lua client | `mp.events.triggerClient(playerOrId, name, ...)` | `mp.events.addServer(name, fn)` on the client. The callback receives the event payload. |
| Lua client to CEF page | `mp.events.triggerCef(name, ...)` | `mp.events.on(name, fn)` in CEF JavaScript. |
| CEF page to Lua client | `mp.events.emit(name, ...)` in CEF JavaScript | `mp.events.addCef(name, fn)` on the Lua client. |

Save the numeric handler ID from `mp.events.add`, `mp.events.addServer` or `mp.events.addClient` for `mp.events.remove(name, id)`. On the Lua client, pass the token table from `mp.events.addCef` to `mp.events.removeCef(name, token)`. Use distinct local and network event names when managing handlers with the same removal API. [Client registration and removal](https://docs.cyber.mp/reference/lua/client/#registration-and-removal) · [Server registration and triggers](https://docs.cyber.mp/reference/lua/server/#registration-and-triggers)

## REDengine calls from Lua

Set `use_game_natives = true` in the resource manifest to enable the Lua client game bridge. Use `Game` for game access and wait for the relevant lifecycle stage. For player-dependent work verify `Game.GetPlayer()` returns a puppet after spawning. Lua instance methods use colon syntax, as in `player:GetEntityID()`. Pure asset delivery and dependencies of existing CET mods are covered in the archive compatibility guide. [Working with game natives](https://docs.cyber.mp/reference/client/working-with-game-natives/) · [Archive mod compatibility](archive-mod-compatibility.md)
