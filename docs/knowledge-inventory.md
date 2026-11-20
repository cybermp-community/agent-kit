# CyberMP Agent Kit knowledge inventory

| Source | What it can answer | Evidence and gaps |
| --- | --- | --- |
| Locked server, client and browser declaration packages | Names, environments, parameter types and callback shapes | Generated from the versions in `pnpm-lock.yaml`. Type information describes the declared interface. Confirm timing, conversions and effects on the target build. |
| Native declarations in `@cybermp/client-types` | REDengine class members, inheritance and overloads exposed to client tooling | The package includes the exact source version and reports it. The game may impose additional lifecycle, argument or resource constraints. |
| [Pinned CyberMP documentation summaries](../data/upstream-guides.json) | Resource setup, supported files, lifecycle, local entities, CEF, events and server operations | Original summaries with links to the upstream pages. The source manifest records the snapshot. Read the upstream page for full examples and any changes since the snapshot. |
| [TweakDB sample records](../src/data/tweakdb.json) | Starting points by category and ID | Exact record names can cite a pinned WolvenKit index. Verify the record type, display label, tier and availability in the target game database. |
| [Kit references](../skills/cybermp-dev/references/) | Recipes and patterns, including material drawn from Freeroam | Legacy guides are marked unreviewed in MCP. Many recipes lack a traceable upstream file and build. See the topical status below. |

## Reference coverage

| Reference | Best use | Status and next question |
| --- | --- | --- |
| Events and RPC flows | Select the correct listener or sender for each runtime | Check the actual payload contract, especially project-defined events. |
| Resource structure | Locate entry points, files and manifest settings | Check config types against the target build. The archive pilot gives the asset validation path. |
| Game natives and world interaction | Locate engine systems and implement a point prompt | Point versus area is clarified. Validate the remaining recipes and prerequisites before promotion. |
| Object spawning and streaming | Choose local or synchronized object handling | Verify candidate depot paths and required hash kinds on the target build. |
| Server mechanics | Entity lifecycle, data scope and polygon membership | Confirm server ownership and replication in a two-client check when used. |
| Player mechanics | Locate facilities for spawn, status and inventory | Confirm inputs and TweakDB IDs. Recipes from game modes may assume their server state. |
| Doors and devices | Find local controllers and redscript calls | Runtime confirmation is needed for lifecycle and multiplayer ownership. |
| Animations and workspots | Find interaction patterns | Verify the specific workspot and target multiplayer build. |
| Vehicles and physics, and vehicle tuning and combat | Find vehicle API patterns | Verify ownership, physics behavior and dependencies independently. |
| Cameras, input and CEF | Select UI and input systems | Confirm observer timing and lifetime before transferring recipes. |
| INK HUD and minimap, and minimap diagnostic | Distinguish a point marker, visual HUD shape, world map UI and server geometry | Cross-checked against public sources and the locked types. The diagnostic's rendering, tint and removal need a target-client run. World anchoring is a separate test. |
| Archive prop recipe | Build original geometry and test archive delivery and use | Geometry generator and TypeScript probe are independently testable. The WolvenKit import, packed archive and visible spawn need the game toolchain. |
| [Archive mod compatibility](../skills/cybermp-dev/references/archive-mod-compatibility.md) | Identify assets, companion files and the original mod's runtime before adapting a feature | Public sources establish file formats and delivery. Loader APIs and multiplayer behavior must be tested per feature on the target client. |

## Follow-up audit

Promote a legacy recommendation only after recording its source, revision, runtime, prerequisites and the assertion that was checked. Start with conflicts between the published docs, declarations and the kit's sample code. For each game experiment record the game and CyberMP builds, resource configuration, expected and actual behavior, and an observable artifact. Keep framework compatibility specific to the tested versions.

For an indexed code example, use a fenced language followed by `env=client`, `env=server`, `env=browser` or `env=tooling` when the runtime needs to be explicit. After a strict TypeScript check, record the exact declaration version with `checked=@cybermp/client-types@2.7.1` or the equivalent package for the chosen runtime. Put the prerequisites in the paragraph immediately before the fence. MCP links the source section and displays code when it can identify a relevant example. The declaration version records the static check. Game observations belong in the experiment record.

`pnpm test` checks every indexed JavaScript and TypeScript reference snippet independently in its declared runtime. Single-runtime references can declare `environment` in frontmatter. Use a fence-level `env` for examples in mixed references. A recorded check against an older package version is reported in the test output while the compiler checks the installed version. Regenerate the index with `pnpm run build:index` after changing a reference.
