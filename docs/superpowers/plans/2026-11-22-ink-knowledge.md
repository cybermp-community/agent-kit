# INK knowledge extraction implementation plan

> Execute inline in the current checkout; the user approved the proposed split.

**Goal:** Teach general INK widget handling separately from minimap projection.
**Architecture:** Add a general client reference and a minimap recipe; link them from the skill and existing guides. Keep a hashed source inventory, attribution and evidence limits. No MCP bridge or runtime integration.
**Tech stack:** Markdown, generated MCP guide index, existing Vitest checks.

- [x] Add retrieval regression cases and observe the missing references.
- [x] Record source provenance and MIT notice; distinguish author reports, source code and fake-game tests.
- [x] Add general widget guidance and a small typed example; document minimap-specific projection and streaming separately.
- [x] Update existing discovery links, inventory and changelog; regenerate the guide index.
- [x] Run retrieval tests, all reference type checks, build and the full suite with workspace TEMP. Review the diff.

Verification: 200 Kit tests passed, one skipped; declaration checks and TypeScript build passed. All 65 supplied pure resource tests passed. Source hashes verified for 24 files. No live game run was performed.
