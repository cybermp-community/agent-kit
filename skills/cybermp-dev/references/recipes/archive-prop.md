---
title: Build and load an archive prop
description: Generate an original diagnostic asset, pack it with WolvenKit, deliver it through resource.toml, and verify ArchiveXL requirements separately from .archive loading.
environment: mixed
verificationStatus: static-cross-check
aliases: [custom prop, resource assets, ArchiveXL, TweakXL, Codeware, ассет, архив модов, мод из архива]
priorityAliases: [archive, WolvenKit, ArchiveXL, архив, архивный проп]
---
# Build and load an archive prop

Generate the original cube geometry from the [example source](../../examples/archive-prop/make-cube.py). Import into a REDengine mesh in WolvenKit and package an entity and its resources in an `.archive`. List the archive in `resource.toml`, then test loading it on a clean CyberMP client through the sample script.

Warning: the generator and TypeScript sample can be checked without the game. The WolvenKit import, packaged archive, appearance and client spawn must be verified on the target builds. ArchiveXL is a separate dependency when the mod uses its features.

## Build an original diagnostic cube

1. Create a WolvenKit project named `cybermp_kit_cube`. Add a simple non-skinned single-submesh mesh container from a local game installation, or use one you have permission to redistribute. Copy it to `cybermp_kit\\diagnostics\\cube.mesh` in the project. Choose a clearly visible opaque material and check its dependencies. Keep all original game files in the author's local game installation as the source for any required template and record the template path used.
2. Generate the input with `python3 make-cube.py cube.glb`. Place the file under the matching raw path `cybermp_kit/diagnostics/cube.glb`. Use WolvenKit's Import/Export tool to import into `cube.mesh`. The generator writes one triangulated submesh with normals, UV coordinates and tangents. Check the log and mesh preview. Confirm that the selected mesh container has a compatible material slot.
3. Create or derive a simple static entity at `cybermp_kit\\diagnostics\\cube.ent`. Use a mesh component which references `cube.mesh`. If the selected entity uses appearances, include the necessary resources and record the tested appearance name. Verify references in WolvenKit. The example uses the default appearance candidate `0`. Replace it with the appropriate CName hash if the chosen entity needs a named appearance. Record that change with the generated asset.
4. Pack and inspect `cybermp_kit_cube.archive`. Confirm the entity and mesh use the expected depot paths. Make a local single-player test installation and spawn the entity by its depot path using a suitable tool such as World Builder. Record the tool and version. Remove that local test installation from the CyberMP test environment before checking resource delivery.

Sources. [WolvenKit mesh import](https://wiki.redmodding.org/wolvenkit/wolvenkit-app/usage/import-export/models) · [WolvenKit project layout](https://wiki.redmodding.org/wolvenkit/wolvenkit-app/usage/wolvenkit-projects) · [World Builder custom resource inspection](https://wiki.redmodding.org/cyberpunk-2077-modding/modding-guides/world-editing/object-spawner/features-and-guides/adding-custom-resources-props).

## Deliver and spawn in CyberMP

1. Place the packed archive in `assets/cybermp_kit_cube.archive` inside a test resource. Use the [example manifest](../../examples/archive-prop/resource.toml). Bundle the [client script](../../examples/archive-prop/client.ts) to `dist/client.js` with the client build command from the [CyberMP TypeScript guide](https://docs.cyber.mp/guides/recipes/typescript/#building-for-production).
2. Enable the resource on the test server. Use a test client without a locally installed copy of the archive. Confirm that the resource files were downloaded or served from the intended CDN package. After changes to the manifest, refresh the server's resource index. After changes to a compiled game archive or redscript, restart the game client. If using CDN, repack and deploy the updated client files.
3. Spawn the player in a clear area. The example computes a resource-path hash with `redResourceReferenceScriptToken.GetHash` and passes it to `mp.local.spawnObject`. Freeroam uses this combination for a camera entity. Treat the returned handle as evidence of a request. Take a screenshot and verify the cube is visible next to the player as separate evidence of rendering.
4. Stop the resource and check that the prop disappears. Log game, client, server and WolvenKit versions, the archive hash, depot path, appearance and observed result. For a synchronized server prop, make a separate test with server creation and two clients.

Sources. [CyberMP resource file delivery](https://docs.cyber.mp/guides/resources/adding-resource-files/) · [Local entity API](https://docs.cyber.mp/reference/client/api/global/mplocal/) · [Official Freeroam](https://github.com/Cyber-MP/CyberMP-Freeroam) · [Hotreload limits](https://docs.cyber.mp/guides/recipes/hotreload/) · [CDN](https://docs.cyber.mp/guides/server/cdn/).

## Identify the loader and its dependencies

| Input or mechanism | What the sources establish | What to confirm in CyberMP |
| --- | --- | --- |
| `.archive` | WolvenKit packages REDengine assets. CyberMP lists it as a supported resource file type. | Internal depot paths, asset conflicts, visible spawn and cleanup. |
| `.xl` / ArchiveXL | CyberMP lists `.xl` files. ArchiveXL documents the features and versions of its loader. | Which loader features are available on the tested client and whether the extension is applied. |
| `.tweak` / YAML / TweakXL | CyberMP lists these extensions. TweakXL defines its own input formats. | File interpretation, TweakDB registration and patch compatibility. |
| `.redscripts` | CyberMP's file reference describes compiled redscripts. | Compiler target, dependencies, initialization and behavior after a cold launch. |
| REDmod | CDPR documents a separate install and deployment workflow for REDmods. | Which individual outputs can be supplied as CyberMP resource files. |
| RED4ext / Codeware / CET | These are separate loaders or runtime libraries with their own version requirements. | Availability and behavior on the target CyberMP client. Keep any test with dependencies distinct from the baseline. |

Local installation uses the game's mod loader and folder layout. CyberMP `file` delivers assets for that resource. `core.files` selects files from the built-in core resource. `client_script` loads the bundled client program and `cef_url` points to browser UI. For nested asset directories add explicit file entries or a documented directory-local pattern.

Sources. [CDPR REDmod](https://www.cyberpunk.net/en/modding-support) · [CyberMP core configuration](https://docs.cyber.mp/reference/server/configuration) · [ArchiveXL](https://github.com/psiberx/cp2077-archive-xl) · [TweakXL](https://github.com/psiberx/cp2077-tweak-xl) · [Codeware](https://github.com/psiberx/cp2077-codeware) · [RED4ext](https://docs.red4ext.com/) · [Cyber Engine Tweaks](https://wiki.redmodding.org/cyber-engine-tweaks).
