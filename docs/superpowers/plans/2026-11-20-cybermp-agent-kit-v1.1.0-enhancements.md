# cybermp-agent-kit v1.1.0 Comprehensive Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `cybermp-agent-kit` to v1.1.0 by adding MCP argument normalization, a fast offline TweakDB ID lookup tool, a granular section-level documentation search engine, and an exhaustive suite of native REDengine mechanics and recipes (HUD interaction prompts, doors/devices, object spawning, workspot animations, vehicle controls & combat).

**Architecture:**
- **MCP Server:** Zod schema expansion in `src/tools/` allowing flexible aliases (`flow`, `source`/`target`, `type_name`, `typeName`, `type`) with pure engine normalizers in `src/engine/`.
- **TweakDB Catalog:** Curated offline dataset in `src/data/tweakdb.json` accessed through `TweakDBEngine` and exposed via `cybermp_lookup_tweakdb`.
- **Docs & Search Engine:** Section-level AST chunking in `scripts/build-index.ts` indexing heading anchors (`file#heading`), returning contextual excerpts and section-specific code snippets.
- **Skill Knowledge Base:** Five new comprehensive reference and recipe guides in `skills/cybermp-dev/references/` covering verified REDengine native systems (`SendInputHintData`, `DoorControllerPS`, `mp.local.spawnObject`, `gameWorkspotGameSystem`, `vehicleControllerPS`, `DriverCombatFirearms`).

**Tech Stack:** TypeScript 5.7, Node.js 22, pnpm, Vitest, MiniSearch 7.1, Model Context Protocol (MCP) SDK, Zod, ts-morph.

**Spec:** [docs/superpowers/specs/2026-11-20-cybermp-agent-kit-v1.1.0-enhancements-design.md](file:///Users/user/cybermp-mcp/docs/superpowers/specs/2026-11-20-cybermp-agent-kit-v1.1.0-enhancements-design.md)

## Global Constraints

- All CyberMP client and server calls must use direct `mp.*` global namespace APIs (`mp.game.*`, `mp.local.*`, `mp.network.*`, `mp.cef.*`, `mp.events.*`, `mp.commands.*`).
- Anti-hallucination constraint: strictly prohibit FiveM (`RegisterNetEvent`, `TriggerClientEvent`, `SetEntityCoords`), alt:V (`alt.onClient`, `alt.Player`), and SA-MP natives.
- REDengine native type instantiations must use `Object.assign(new mp.game.<Type>(), { ... })`.
- Maintain strict backward compatibility for all existing MCP tool arguments (`from`/`to` in `get_rpc_flow`, `name` in `get_type`).
- All code and tests must compile cleanly with `pnpm run build` and pass all Vitest suites with 0 errors.

## Review Focus

1. `cybermp_get_rpc_flow` invoked with malformed or single-token `flow` string (e.g. `flow: "invalid"`): must throw an informative error explaining expected format (`"from-to"`).
2. `cybermp_get_type` invoked with empty object or whitespace `type_name`: must return a clear validation error rather than undefined crash.
3. `cybermp_search_docs` queried with non-existent keyword: must return an empty result notification without failing.
4. `cybermp_lookup_tweakdb` queried with unknown category: must fallback to searching all records and return empty array if no match.
5. Markdown reference guides containing code fences: must have syntactically valid TypeScript adhering strictly to `@cybermp/client-types`.

---

### Task 1: MCP Tool Argument Normalization (`get_rpc_flow` & `get_type`)

**Files:**
- Modify: `src/engine/rpc-engine.ts:1-75`
- Modify: `src/tools/get-rpc-flow.ts:1-60`
- Modify: `src/engine/types-engine.ts:1-60`
- Modify: `src/tools/get-type.ts:1-40`
- Modify: `tests/engine.test.ts:35-85`
- Modify: `tests/mcp-server.test.ts:40-100`

**Interfaces:**
- Consumes: `getRpcFlow(from, to)` from `rpc-engine.ts`, `getTypeInfo(name, env)` from `types-engine.ts`.
- Produces: `parseRpcFlowArgs(args: Record<string, any>): { from: string; to: string }`, `resolveTypeName(args: Record<string, any>): string`.

- [x] **Step 1: Write the failing tests for argument normalization**

Add to `tests/engine.test.ts`:
```typescript
import { parseRpcFlowArgs } from '../src/engine/rpc-engine.js';
import { resolveTypeName } from '../src/engine/types-engine.js';

describe('MCP Argument Normalization', () => {
  it('parses flow string formatted as server-client, client->browser, cef_server', () => {
    expect(parseRpcFlowArgs({ flow: 'server-client' })).toEqual({ from: 'server', to: 'client' });
    expect(parseRpcFlowArgs({ flow: 'client->browser' })).toEqual({ from: 'client', to: 'browser' });
    expect(parseRpcFlowArgs({ flow: 'cef_server' })).toEqual({ from: 'browser', to: 'server' });
  });

  it('parses source and target synonyms', () => {
    expect(parseRpcFlowArgs({ source: 'server', target: 'client' })).toEqual({ from: 'server', to: 'client' });
    expect(parseRpcFlowArgs({ from: 'client', target: 'cef' })).toEqual({ from: 'client', to: 'browser' });
  });

  it('throws on invalid or unresolvable flow args', () => {
    expect(() => parseRpcFlowArgs({ flow: 'invalid' })).toThrow(/Cannot determine RPC endpoints/);
    expect(() => parseRpcFlowArgs({})).toThrow(/Missing source and target/);
  });

  it('resolves typeName from aliases type_name, typeName, type, and name', () => {
    expect(resolveTypeName({ type_name: 'MpPlayer' })).toBe('MpPlayer');
    expect(resolveTypeName({ typeName: 'MpVehicle' })).toBe('MpVehicle');
    expect(resolveTypeName({ type: 'EntityType' })).toBe('EntityType');
    expect(resolveTypeName({ name: 'Vector3' })).toBe('Vector3');
  });

  it('throws when no type name alias is supplied', () => {
    expect(() => resolveTypeName({})).toThrow(/Missing required argument/);
    expect(() => resolveTypeName({ type_name: '   ' })).toThrow(/Missing required argument/);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/engine.test.ts`
Expected: FAIL with `parseRpcFlowArgs is not a function` or `resolveTypeName is not a function`.

- [x] **Step 3: Implement argument normalization in `rpc-engine.ts` and `types-engine.ts`**

In `src/engine/rpc-engine.ts`:
```typescript
export function normalizeEndpoint(val: unknown): string {
  if (typeof val !== 'string') return '';
  const clean = val.trim().toLowerCase();
  if (clean === 'cef') return 'browser';
  return clean;
}

export function parseRpcFlowArgs(args: Record<string, any>): { from: string; to: string } {
  let from = args.from || args.source;
  let to = args.to || args.target;

  if (typeof args.flow === 'string' && args.flow.trim()) {
    const parts = args.flow.toLowerCase().split(/[-_>:]+/).filter(Boolean);
    if (parts.length >= 2) {
      from = from || parts[0];
      to = to || parts[1];
    } else {
      throw new Error(`Cannot determine RPC endpoints from flow: "${args.flow}". Expected format: "server-client" or "client->browser".`);
    }
  }

  from = normalizeEndpoint(from);
  to = normalizeEndpoint(to);

  if (!from || !to) {
    throw new Error('Missing source and target endpoints for RPC flow. Specify "flow", or "source"/"from" and "target"/"to".');
  }

  return { from, to };
}
```

In `src/engine/types-engine.ts`:
```typescript
export function resolveTypeName(args: Record<string, any>): string {
  const raw = args.name ?? args.type_name ?? args.typeName ?? args.type;
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new Error("Missing required argument: 'name' or 'type_name' must be provided.");
  }
  return raw.trim();
}
```

Update `src/tools/get-rpc-flow.ts`:
```typescript
export const getRpcFlowSchema = {
  flow: z.string().optional().describe('Combined flow string (e.g. "server-client", "client->browser", "cef_to_server")'),
  from: z.string().optional().describe('Source execution runtime (server, client, browser, or cef)'),
  source: z.string().optional().describe('Alias for source execution runtime'),
  to: z.string().optional().describe('Target execution runtime (server, client, browser, or cef)'),
  target: z.string().optional().describe('Alias for target execution runtime'),
};
```
And inside `registerGetRpcFlowTool`, call `const { from, to } = parseRpcFlowArgs(args);`.

Update `src/tools/get-type.ts`:
```typescript
export const getTypeSchema = {
  name: z.string().optional().describe('Exact or partial name of interface, class, enum, or type (e.g. "MpPlayer", "MpVehicle", "EntityType")'),
  type_name: z.string().optional().describe('Alias for name: exact or partial name of interface, class, enum, or type'),
  typeName: z.string().optional().describe('Alias for name: camelCase variant'),
  type: z.string().optional().describe('Alias for name'),
  env: z.enum(['server', 'client', 'browser']).optional().describe('Filter types by environment: server, client, or browser'),
};
```
And inside `registerGetTypeTool`, call `const resolvedName = resolveTypeName(args);`.

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/engine.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/engine/rpc-engine.ts src/engine/types-engine.ts src/tools/get-rpc-flow.ts src/tools/get-type.ts tests/engine.test.ts
git commit -m "feat(mcp): normalize arguments for get_rpc_flow and get_type"
```

---

### Task 2: Offline TweakDB Data & Tool (`cybermp_lookup_tweakdb`)

**Files:**
- Create: `src/data/tweakdb.json`
- Create: `src/engine/tweakdb-engine.ts`
- Create: `src/tools/lookup-tweakdb.ts`
- Modify: `src/tools/index.ts`
- Modify: `src/server.ts:1-25`
- Test: `tests/tweakdb-engine.test.ts`
- Modify: `tests/mcp-server.test.ts:25-35`

**Interfaces:**
- Produces: `lookupTweakDb(query?: string, category?: string, limit?: number): TweakDbLookupResult`, `registerLookupTweakDbTool(server: McpServer): void`.

- [ ] **Step 1: Write the failing tests for TweakDB lookup**

Create `tests/tweakdb-engine.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { lookupTweakDb } from '../src/engine/tweakdb-engine.js';

describe('TweakDB Lookup Engine', () => {
  it('returns status effects when queried for burning or category status_effects', () => {
    const result = lookupTweakDb('burning', 'status_effects');
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results[0].id).toBe('BaseStatusEffect.Burning');
    expect(result.formattedText).toContain('BaseStatusEffect.Burning');
  });

  it('filters by category for armed vehicles', () => {
    const result = lookupTweakDb('', 'vehicles');
    expect(result.results.length).toBeGreaterThan(0);
    const hasHellhoundOrQuadra = result.results.some((r) => r.id.includes('v_sport') || r.id.includes('v_utility'));
    expect(hasHellhoundOrQuadra).toBe(true);
  });

  it('handles empty or non-existent queries gracefully', () => {
    const emptyResult = lookupTweakDb('non_existent_xyz_123');
    expect(emptyResult.results).toHaveLength(0);
    expect(emptyResult.formattedText).toContain('No TweakDB records found');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/tweakdb-engine.test.ts`
Expected: FAIL with `Cannot find module '../src/engine/tweakdb-engine.js'`.

- [ ] **Step 3: Implement `tweakdb.json`, `tweakdb-engine.ts`, and tool handler**

1. Create `src/data/tweakdb.json` with comprehensive curated records across categories (`status_effects`, `weapons`, `vehicles`, `clothing`, `quickhacks`, `workspots`).
2. Create `src/engine/tweakdb-engine.ts`:
```typescript
import tweakDbData from '../data/tweakdb.json' with { type: 'json' };

export interface TweakDbRecord {
  id: string;
  category: 'status_effects' | 'weapons' | 'vehicles' | 'clothing' | 'quickhacks' | 'workspots';
  name: string;
  description: string;
}

export interface TweakDbLookupResult {
  results: TweakDbRecord[];
  formattedText: string;
}

const allRecords = tweakDbData as TweakDbRecord[];

export function lookupTweakDb(query = '', category = 'all', limit = 10): TweakDbLookupResult {
  const q = query.trim().toLowerCase();
  const cat = category.trim().toLowerCase();
  const maxLimit = Math.min(50, Math.max(1, limit));

  let filtered = allRecords;
  if (cat && cat !== 'all') {
    filtered = filtered.filter((r) => r.category === cat);
  }

  if (q) {
    filtered = filtered.filter(
      (r) =>
        r.id.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q)
    );
  }

  const results = filtered.slice(0, maxLimit);
  if (results.length === 0) {
    return {
      results: [],
      formattedText: `No TweakDB records found matching query "${query}" in category "${category}".`,
    };
  }

  const lines = [
    `## TweakDB Lookup Results (${results.length} found)`,
    '',
    '| TweakDB ID | Category | Name | Description |',
    '| :--- | :--- | :--- | :--- |',
  ];

  for (const r of results) {
    lines.push(`| \`${r.id}\` | \`${r.category}\` | **${r.name}** | ${r.description} |`);
  }

  return {
    results,
    formattedText: lines.join('\n'),
  };
}
```

3. Create `src/tools/lookup-tweakdb.ts` with Zod schema:
```typescript
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { lookupTweakDb } from '../engine/tweakdb-engine.js';

export const lookupTweakDbSchema = {
  query: z.string().optional().describe('Search query for TweakDB ID or name (e.g. "burning", "hellhound", "katana")'),
  category: z
    .enum(['all', 'status_effects', 'weapons', 'vehicles', 'clothing', 'quickhacks', 'workspots'])
    .optional()
    .describe('Filter records by category'),
  limit: z.number().optional().describe('Max records to return (default 10, max 50)'),
};

export function registerLookupTweakDbTool(server: McpServer): void {
  server.tool(
    'cybermp_lookup_tweakdb',
    'Lookup verified Cyberpunk 2077 TweakDB IDs for status effects, armed vehicles, weapons, workspots, and gear.',
    lookupTweakDbSchema,
    async ({ query, category, limit }) => {
      const result = lookupTweakDb(query, category, limit);
      return {
        content: [{ type: 'text', text: result.formattedText }],
      };
    }
  );
}
```
4. Register in `src/tools/index.ts` and update `tests/mcp-server.test.ts` to expect 5 tools.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/tweakdb-engine.test.ts tests/mcp-server.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/data/tweakdb.json src/engine/tweakdb-engine.ts src/tools/lookup-tweakdb.ts src/tools/index.ts tests/tweakdb-engine.test.ts tests/mcp-server.test.ts
git commit -m "feat(mcp): add cybermp_lookup_tweakdb tool and curated database"
```

---

### Task 3: Granular Section Search & Docs Engine (`cybermp_search_docs`)

**Files:**
- Modify: `scripts/build-index.ts:630-740`
- Modify: `src/engine/docs-engine.ts:1-120`
- Modify: `src/types/index.ts`
- Test: `tests/docs-engine.test.ts`

**Interfaces:**
- Consumes: `GuideRecord` with `sectionTitle`, `guideTitle`, `url`, `codeSnippets`, `plainText`.
- Produces: Section-level `searchDocs(query, limit)` returning `#heading` slugs and matched code snippet.

- [ ] **Step 1: Write the failing tests for section-level search**

Create `tests/docs-engine.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { searchDocs } from '../src/engine/docs-engine.js';

describe('Granular Docs Search Engine', () => {
  it('returns section-level match with heading anchor and relevant code snippet for "burning"', () => {
    const result = searchDocs('burning', 3);
    expect(result.results.length).toBeGreaterThan(0);
    const burningMatch = result.results.find((r) => r.slug.includes('player-mechanics') || r.plainText.includes('Burning'));
    expect(burningMatch).toBeDefined();
    // Must NOT contain createVector3 as the primary snippet for burning
    if (burningMatch?.codeSnippets && burningMatch.codeSnippets.length > 0) {
      expect(burningMatch.codeSnippets[0]).not.toContain('createVector3');
    }
  });

  it('formats output with section hierarchy [Guide -> Section]', () => {
    const result = searchDocs('teleport', 1);
    expect(result.formattedText).toMatch(/\[.*->.*\]|\.md#/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/docs-engine.test.ts`
Expected: FAIL with snippet containing `createVector3` or missing heading anchor.

- [ ] **Step 3: Update `scripts/build-index.ts` and `src/engine/docs-engine.ts`**

1. In `scripts/build-index.ts`:
   - Update `parseGuides` to scan `references/` recursively.
   - Implement markdown section splitting:
     Split content on `\n(?=##+ )`.
     Extract heading title from `## <title>`.
     Generate heading anchor slug: `slug + '#' + toKebabCase(headingTitle)`.
     Extract code blocks strictly within that section.
     Push individual section records to `guides.json`.
2. In `src/engine/docs-engine.ts`:
   - Ensure MiniSearch searches `sectionTitle`, `title`, and `plainText`.
   - Format results as:
     `### [${guide.title} -> ${guide.sectionTitle}](${guide.url})`
     `**URL:** ${guide.url}`
     `**Example:**` (using the section's own `codeSnippets[0]`).
3. Run `pnpm run build:index` to regenerate `src/data/guides.json`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/docs-engine.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/build-index.ts src/engine/docs-engine.ts src/data/guides.json tests/docs-engine.test.ts
git commit -m "feat(docs): implement granular section-level search and snippet indexing"
```

---

### Task 4: Complete REDengine Native Guides & Recipes Suite

**Files:**
- Create: `skills/cybermp-dev/references/recipes/world-interaction.md`
- Create: `skills/cybermp-dev/references/doors-and-devices.md`
- Create: `skills/cybermp-dev/references/object-spawning-and-streaming.md`
- Create: `skills/cybermp-dev/references/animations-and-workspots.md`
- Create: `skills/cybermp-dev/references/vehicles-tuning-combat.md`
- Modify: `skills/cybermp-dev/references/player-mechanics.md`
- Modify: `skills/cybermp-dev/references/game-natives.md`
- Modify: `skills/cybermp-dev/SKILL.md`
- Modify: `rules/AGENTS.md`
- Modify: `templates/rules/AGENTS.md`
- Test: `tests/skills.test.ts`

**Interfaces:**
- Produces: Complete, verified reference guides conforming to `@cybermp/client-types`.

- [ ] **Step 1: Write the failing tests in `tests/skills.test.ts`**

Update `tests/skills.test.ts`:
```typescript
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

describe('CyberMP Skill Reference Files', () => {
  const referencesDir = path.resolve(__dirname, '../skills/cybermp-dev/references');

  const requiredFiles = [
    'recipes/world-interaction.md',
    'doors-and-devices.md',
    'object-spawning-and-streaming.md',
    'animations-and-workspots.md',
    'vehicles-tuning-combat.md',
    'player-mechanics.md',
    'game-natives.md',
  ];

  for (const relPath of requiredFiles) {
    it(`verifies existence of ${relPath}`, () => {
      const fullPath = path.join(referencesDir, relPath);
      expect(fs.existsSync(fullPath)).toBe(true);
      const content = fs.readFileSync(fullPath, 'utf-8');
      expect(content.length).toBeGreaterThan(100);
    });
  }

  it('verifies world-interaction.md includes SendInputHintData and ChoiceApply', () => {
    const content = fs.readFileSync(path.join(referencesDir, 'recipes/world-interaction.md'), 'utf-8');
    expect(content).toContain('SendInputHintData');
    expect(content).toContain('ChoiceApply');
    expect(content).toContain('MappinSystem');
  });

  it('verifies doors-and-devices.md includes DoorControllerPS and ActionSetOpened', () => {
    const content = fs.readFileSync(path.join(referencesDir, 'doors-and-devices.md'), 'utf-8');
    expect(content).toContain('DoorControllerPS');
    expect(content).toContain('ActionSetOpened');
  });

  it('verifies vehicles-tuning-combat.md includes vehicleControllerPS and hood/trunk', () => {
    const content = fs.readFileSync(path.join(referencesDir, 'vehicles-tuning-combat.md'), 'utf-8');
    expect(content).toContain('vehicleControllerPS');
    expect(content).toContain('hood');
    expect(content).toContain('trunk');
    expect(content).toContain('TurnEngineOn');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/skills.test.ts`
Expected: FAIL with missing reference files.

- [ ] **Step 3: Author all new and updated reference guides**

1. Create `skills/cybermp-dev/references/recipes/world-interaction.md`:
   - Native HUD button hint on `[F]` using `mp.game.SendInputHintData` (`action: 'ChoiceApply'`, `localizedLabel`).
   - In-world 3D marker using `MappinSystem.RegisterMappin` (`variant: gamedataMappinVariant.UseVariant`).
   - Direct key listener using `mp.game.onInputKeyEvent` (`EInputKey.IK_F`).
   - Scriptable devices caveat against singleplayer cutscene triggers (`MirrorDevice`).
2. Create `skills/cybermp-dev/references/doors-and-devices.md`:
   - Door manipulation via `DoorControllerPS` (`ActionSetOpened`, `ActionSetClosed`, `ActionToggleLock`).
   - Opening locked Night City interiors.
3. Create `skills/cybermp-dev/references/object-spawning-and-streaming.md`:
   - Client-local prop spawning via `mp.local.spawnObject` vs server `mp.objects.create`.
   - Curated `.ent` depot paths for street signs, neon, barriers, and furniture.
   - Interior streaming and occlusion handling.
4. Create `skills/cybermp-dev/references/animations-and-workspots.md`:
   - Workspots via `gameWorkspotGameSystem` (`PlayInDeviceSimple`, `SendFastExitSignal`, `SendSlowExitSignal`).
   - Catalog of verified workspot actions: sitting, smoking, leaning, drinking, dancing.
5. Create `skills/cybermp-dev/references/vehicles-tuning-combat.md`:
   - Door, hood, trunk, and window control via `vehicleControllerPS.SetDoorState` & `SetWindowState`.
   - Headlight modes, custom light colors, and engine toggle (`TurnEngineOn`).
   - CrystalCoat shader (`PlayVehicleVisualCustomizationShader`) and body detaching (`DetachPart`).
   - Vehicle Combat 2.0 (mounted turrets & window drive-by shooting).
6. Update `player-mechanics.md`:
   - Add Combat DoTs table and debounced `applyTemporaryStatusEffect`.
7. Update `SKILL.md` and `rules/AGENTS.md` with links to all new guides and negative constraints.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/skills.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add skills/cybermp-dev/ rules/ templates/ tests/skills.test.ts
git commit -m "docs(skills): add comprehensive native REDengine guides and recipes suite"
```

---

### Task 5: Re-Indexing, Full Build, Test Suite Verification & v1.1.0 Release Prep

**Files:**
- Modify: `package.json` (bump version to `1.1.0`)
- Run: `pnpm run build:index`
- Run: `pnpm run build`
- Run: `pnpm test`

- [ ] **Step 1: Re-build indices from updated codebase and references**

Run: `pnpm run build:index`
Expected: Successfully generates `src/data/guides.json`, `src/data/types.json`, and `src/data/events.json` without errors.

- [ ] **Step 2: Verify full test suite across all modules**

Run: `pnpm test`
Expected: 100% tests passing across all test files (0 failures, 0 regressions).

- [ ] **Step 3: Compile TypeScript to `dist/`**

Run: `pnpm run build`
Expected: Clean compilation with 0 TypeScript errors.

- [ ] **Step 4: Bump version to `1.1.0` in `package.json`**

Update `package.json`:
```json
"version": "1.1.0"
```

- [ ] **Step 5: Verify CLI version command**

Run: `node dist/bin/cli.js --version`
Expected: `1.1.0`

- [ ] **Step 6: Commit and tag v1.1.0**

```bash
git add package.json src/data/ dist/
git commit -m "chore(release): bump version to 1.1.0"
```
