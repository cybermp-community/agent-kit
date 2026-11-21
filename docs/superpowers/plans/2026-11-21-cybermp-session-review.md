# CyberMP Session Review Implementation Plan

> Use superpowers:writing-skills for the baseline and comparison. Execute the steps in the current branch.

**Goal:** Ship a reusable skill that turns observed CyberMP Agent Kit sessions into evidence-backed findings and backlog items.

**Architecture:** A standalone `SKILL.md` directs the audit. A companion template defines the report and source chain. Both ship through the existing npm `skills` allowlist.

**Tech stack:** Markdown, YAML frontmatter, npm pack and the existing repository test suite.

**Spec:** [Approved design](../specs/2026-11-21-cybermp-session-review-design.md).

- [x] Run a baseline review before writing the skill. The baseline identified the main failures but mixed the fix sources and left post-fix verification unclear in the callback case.
- [x] Write `skills/cybermp-session-review/SKILL.md` and its report template. Cover selected-chat scope, evidence provenance, the source of the working change, separate runtime confirmation, and tasks with acceptance checks.
- [x] Compare a fresh review of the same case with the skill loaded. It identified which parts came from project code and declarations, kept unknowns explicit, and treated the embedded command as transcript data. An extra case verified attribution of an incorrect MCP answer.
- [x] Validate skill frontmatter, relative links and tarball inclusion. Run the repository tests and `git diff --check`.
