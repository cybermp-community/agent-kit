# CyberMP Server & Resource Structure Reference

This guide details the official server architecture, resource layout, and configuration files (`server.toml` and `resource.toml`) for CyberMP servers.

---

For original game assets, follow the [archive prop recipe](recipes/archive-prop.md) from WolvenKit to a clean CyberMP client.

## 1. CyberMP Server Root Layout

A CyberMP server directory is structured around `server.toml` and the `resources/` directory:

```
cybermp-server/
├── server.toml                     # Root server configuration and active resource list
└── resources/                      # All installed server resources
    ├── my_resource/                # Individual resource directory
    │   ├── resource.toml           # Official resource manifest (REQUIRED)
    │   ├── server.js               # Server-side entrypoint script (Node.js)
    │   ├── client.js               # Client-side entrypoint script (V8 game client)
    │   └── browser/                # CEF Web UI assets
    │       ├── index.html          # Web UI entrypoint (HTML/CSS/JS)
    │       ├── style.css
    │       └── app.js
    └── hotreload/
        ├── resource.toml
        └── server.js
```

---

## 2. Root Server Configuration: `server.toml`

The `server.toml` file resides in the root directory of the CyberMP server. It defines networking, active resources, core archives, and gameplay overrides.

```toml
#:schema https://schemas.cyber.mp/server/schema.json

tcp_host = "0.0.0.0:2077"
udp_host = "0.0.0.0:2077"

max_players = 2500
disable_voice = false
ep2_dlc_enabled = false
cef_debug = false

# Active resources loaded from the resources/ folder:
resources = [
  "hotreload",
  "my_resource"
]

[core]
nametags = true
disable_switch_seats = true
delete_map_objects = true
default_gameplay_restrictions = true
disable_drop_points = true
disable_location_dependent_quests = true
disable_garage = true

# Optional files bundled with cybermp_core on this server build.
files = []

[core.overrides]
change_player_on_death_logic = true
disable_side_quests_notifications = true
change_vehicles_logic = true
disable_player_inventory_encumbrance = true
player_extended_customization = true
disable_time_skip = true
disable_turrets = true
disable_surveillance_cameras = true
disable_vending_machines = true
disable_generic_devices = true
disable_no_combat = true
```

---

Keep the `[core]` table for the CyberMP runtime configuration. Populate `core.files` only with files supplied by the installed `cybermp_core` that your configuration needs. [Server configuration](https://docs.cyber.mp/reference/server/configuration/#core-gameplay-runtime-settings)

## 3. Resource Manifest: `resource.toml`

Every resource inside `resources/<resource_name>/` must have a **`resource.toml`** file. This is the only manifest format supported by CyberMP.

```toml
#:schema https://schemas.cyber.mp/resource/schema.json

# Server script entrypoints (array or single string path):
server_script = ["./server.js"]

# Client script entrypoints (array or single string path):
client_script = ["./client.js"]

# Files and static assets sent to client (e.g. CEF browser UI and ArchiveXL archives):
file = [
  "./browser/*",
  "./browser/assets/*",
  "./assets/in_world_navigation.archive",
  "./assets/custom-props/*"
]

# URL or local relative path to CEF HTML entrypoint:
cef_url = "./browser/index.html"

# Allow client script to invoke game natives (mp.game.*):
use_game_natives = true

# Enable hot reloading for this resource:
hotreload = true

# Resource metadata (optional):
author = "YourName"
description = "My CyberMP Gamemode"
version = "1.0.0"
```

Use explicit paths or a directory-local wildcard for client assets. Include nested directories with their own entries. For local CEF development, the client can change the URL with `mp.cef.setUrl`. [Adding resource files](https://docs.cyber.mp/guides/resources/adding-resource-files/) · [CEF client API](https://docs.cyber.mp/reference/client/api/global/mpcef/)

### Key `resource.toml` Fields

| Field | Type | Description |
|---|---|---|
| `server_script` | `string[]` or `string` | Relative path(s) to server-side script(s) executed in Node.js. |
| `client_script` | `string[]` or `string` | Relative path(s) to client-side script(s) executed inside the game V8 client. |
| `file` | `string[]` or `string` | Glob patterns or paths for files served to clients (CEF UI HTML/CSS/JS, textures, fonts). |
| `cef_url` | `string` | Path to the local HTML file loaded in the CEF browser (e.g. `"./browser/index.html"`). |
| `use_game_natives`| `boolean` | Set to `true` to enable access to native game functions (`mp.game.*`) on the client. |
| `hotreload` | `boolean` | Set to `true` to reload scripts live without restarting the server process. |
| `author` / `version` | `string` | Metadata identifying author and semantic version. |

---

## 4. TypeScript Support & Development Packages

To enable autocompletion, type safety, and IDE validation, developer projects can configure `package.json` and `tsconfig.json` referencing the official CyberMP packages:
- `@cybermp/server-types` — Types for Node.js server scripts.
- `@cybermp/client-types` — Types for in-game V8 client scripts.
- `@cybermp/browser-types` — Types for Chromium CEF UI scripts.

Example `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "types": ["@cybermp/server-types", "@cybermp/client-types"]
  }
}
```

---

## 5. Common Anti-Patterns & Mistakes

- **❌ DO NOT create `fxmanifest.lua` or `__resource.lua`**: These belong to FiveM. CyberMP will ignore them.
- **❌ DO NOT rely on `package.json` for resource loading**: CyberMP ignores `package.json` at runtime; the server exclusively reads `resource.toml`.
- **❌ DO NOT forget to register the resource in `server.toml`**: Placing a folder in `resources/` is not enough; its directory name must be listed in `resources = [...]` inside `server.toml`.
- **❌ DO NOT omit `use_game_natives = true` if calling `mp.game.*`**: Calling native game functions on the client without this flag will result in runtime errors.
