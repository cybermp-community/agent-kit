---
title: CyberMP archive mod compatibility
description: Identify the mod's assets and loaders. Verify file delivery, engine loading, local behavior and multiplayer replication on the target CyberMP build.
environment: mixed
verificationStatus: static-cross-check
aliases: [archive compatibility, mod dependencies, archive dependencies, совместимость модов, зависимости модов, CET Lua, RED4ext, Codeware, TweakXL, REDmod, redscript]
priorityAliases: [archive compatibility, mod dependencies, archive dependencies, совместимость модов, зависимости модов, CET Lua, RED4ext compatibility, Codeware compatibility, TweakXL compatibility, REDmod compatibility, redscript compatibility]
---
# CyberMP archive mod compatibility

Start with the desired behavior in single-player. The assets, records and native systems in Cyberpunk 2077 give you possible implementations. For a specific mod, establish file delivery, engine loading, local behavior and multiplayer replication separately. Record the target game and CyberMP versions, DLC, the original mod release and dependency versions. Use the [original diagnostic prop](recipes/archive-prop.md) for a small baseline.

## Inspect the mod package

1. Read the release requirements and list the package contents. Record the files under `archive/pc/mod`, `mods/<name>`, `r6/scripts`, `r6/tweaks`, `red4ext/plugins` and CET's mod directory when present. Keep the paths from the original release so you can identify the intended consumer of each file.
2. Inspect the archive in WolvenKit's mod browser. Record the exact internal depot paths for the entry asset and referenced resources. For a prop, follow the `.ent` to its mesh, appearances and materials. Check whether each dependency comes from the game, DLC, this archive or another mod. For an item, also trace the TweakDB record and entity factory if the item uses one. [WolvenKit Asset Browser](https://wiki.redmodding.org/wolvenkit/wolvenkit-app/editor/asset-browser) · [ArchiveXL features](https://github.com/psiberx/cp2077-archive-xl)
3. Inspect accompanying config and script files. Note which exact section, function or record creates the desired behavior. A visual replacement may use a vanilla depot path. A new item, interaction or world placement may also require registration or initialization. Use a verified depot path, appearance or TweakDB record for the selected API.

## Determine the loader and runtime

| Package evidence | What it identifies | Acceptance check in CyberMP |
|---|---|---|
| `.archive` with an entity or replacement | REDengine assets. CyberMP documents resource file delivery. [Resource files](https://docs.cyber.mp/guides/resources/adding-resource-files/) | Verify delivery, resolution of the depot path and dependencies, and visible spawn or replacement on a clean client. |
| `.xl` or `.archive.xl` with an ArchiveXL extension | ArchiveXL can add or extend resources, including factories, localization and appearances. Its upstream release specifies loader requirements. [ArchiveXL](https://github.com/psiberx/cp2077-archive-xl) | Verify the exact feature used, such as a streamed block or a named appearance, on the target CyberMP build. |
| `.tweak`, `.yaml` or `.yml` using TweakXL syntax | TweakXL supports declarative YAML and RED tweaks. A YAML extension by itself leaves its consumer unknown. [TweakXL](https://github.com/psiberx/cp2077-tweak-xl) | Verify one exact TweakDB record or flat after cold start and test the game behavior that reads it. |
| `.reds` source or compiled `.redscripts` | REDscript source is compiled. CyberMP documents delivering compiled `.redscripts`. [redscript compiler](https://github.com/jac3km4/redscript) · [Resource files](https://docs.cyber.mp/guides/resources/adding-resource-files/) | Establish the target script cache, compiler and dependency contract. Test the compiled output with the target build after a cold launch. |
| REDmod layout | REDmod has its own deployment flow for archives, scripts and tweaks. [CDPR REDmod manual](https://cdn-l-cyberpunk.cdprojektred.com/REDmod-docs.pdf) | Identify which individual outputs the CyberMP resource consumes. Test those files and their behavior. |
| RED4ext plugin or Codeware API calls | RED4ext's standalone installer and Codeware's library and version requirements belong to the game client environment. [RED4ext](https://docs.red4ext.com/getting-started/installing-red4ext) · [Codeware](https://github.com/psiberx/cp2077-codeware) | Establish the exact supported dependency and API for the target client before depending on it. Check a harmless feature call and its result. |
| CET Lua or ImGui code | Cyber Engine Tweaks provides a Lua scripting and ImGui environment. CyberMP resource Lua has its own entry points and API. [CET](https://github.com/maximegmd/CyberEngineTweaks) · [CyberMP Lua client API](https://docs.cyber.mp/reference/lua/client/) | Identify calls that require CET. If adapting the mod, replace those calls with supported CyberMP resource code where equivalents exist and test the reimplemented behavior. |

## Freeroam example of an archive and XL file

The official Freeroam resource includes `dust2.archive` and `dust2.xl` through its `assets/de_dust2/*` manifest entry. In the inspected Freeroam source, the XL points to `ctrlsec/dust2/all.streamingblock`. This is a concrete example of resource configuration for streamed placement data. The example establishes file arrangement and an XL feature to investigate on the target build. [Freeroam manifest](https://github.com/Cyber-MP/CyberMP-Freeroam/blob/main/resources/freeroam/resource.toml) · [Public asset directory](https://github.com/Cyber-MP/CyberMP-Freeroam/tree/main/resources/freeroam/assets/de_dust2)

Use `file` in `resource.toml` for the mod's resource files. Use server `core.files` to select built-in core files. Keep `client_script` and `cef_url` for the resource's executable client bundle and browser entry point. For CDN delivery, rebuild the packed resource after file changes. After an archive or compiled script change, restart the game client. [Server configuration](https://docs.cyber.mp/reference/server/configuration/) · [CDN](https://docs.cyber.mp/guides/server/cdn/) · [Hotreload limits](https://docs.cyber.mp/guides/recipes/hotreload/)

## Confirm compatibility one step at a time

| Stage | Evidence to record |
|---|---|
| 1. Baseline | Record game, DLC and CyberMP builds, enabled core files and declared mod dependencies. Use a clean client without a manually installed copy of the tested asset. |
| 2. Delivery | Compare the packaged resource and the downloaded file by name and hash. Record whether delivery used the server or CDN. |
| 3. Engine loading | Record the resolved asset, named appearance, streamed block or TweakDB record, with the relevant client log or visible result. Add one companion file or loader feature at a time. |
| 4. Local behavior | Exercise the feature from the normal resource entry point. Check cleanup, rejoin and another cold launch where relevant. |
| 5. Multiplayer behavior | Run on two clients with the same required files. Check visibility, state changes, late join and streaming where the feature requires replication. For a client-local feature, verify the expected local scope. |

Report the last stage with positive evidence when a stage fails. For a dependency with unknown availability, record the observed failure and the specific API, record or asset still needed. This comparison lets an agent choose between reusing the existing asset and porting the mod's behavior to CyberMP resource code.
