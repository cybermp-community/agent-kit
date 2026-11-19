# MCP REDengine Types & Docs Indexer Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bridge the architectural gap between MCP tools and offline documentation by enabling `cybermp_get_type` to resolve all 19,176 native REDengine classes (`mp.game.*`), integrating skill references into `cybermp_search_docs`, and incorporating official SDK subsystems into the reference guides.

**Architecture:**
1. Extend `types-engine.ts` with on-demand parsing of `@cybermp/client-types/out/game.d.ts` when a type query is not found in `types.json`, extracting methods, properties, inheritance, and static systems (`ScriptGameInstance`, `TeleportationFacility`, `MountingFacility`).
2. Update `scripts/build-index.ts` and `docs-engine.ts` to index `skills/cybermp-dev/references/*.md` alongside Astro guides, enabling full-text search across deep gameplay recipes via `cybermp_search_docs`.
3. Document official SDK subsystems (`mp.discord`, `mp.storage`, client `mp.commands`, `vehicle.seats`, `player.mute`, `entity.owner`) in `skills/cybermp-dev/references/`.
4. Rebuild static data indexes (`pnpm run build-index`) and verify with complete test suite.

**Tech Stack:** TypeScript, Node.js `fs`/`path`, `minisearch`, `ts-morph`, `vitest`.

**Spec:** Chat design alignment for unifying MCP tools and reference guides.

## Global Constraints

- Never break existing MCP tool schemas (`cybermp_get_type`, `cybermp_get_event`, `cybermp_search_docs`, `cybermp_get_rpc_flow`).
- Maintain sub-50ms latency for on-demand REDengine class resolution.
- TDD mandatory: write failing test, run failure, implement minimal code, verify pass, commit.
- Procedural `mp.*` style in all documentation; zero DI/Inversify boilerplate.

## Review Focus

1. **Class Inheritance Resolution**: When querying a derived class like `TeleportationFacility`, if the derived class has no own methods, resolve or display base class methods (`gameTeleportationFacility.Teleport`).
2. **Case-Insensitive & Prefix Matching**: `ScriptGameInstance` vs `scriptgameinstance` vs `Teleportation` must match correctly.
3. **Empty or Missing Docs Fallback**: If `tmp/docs` is absent, guide indexing must still succeed on `skills/cybermp-dev/references`.
4. **Performance & Memory**: On-demand file reading of `game.d.ts` (8.2MB) should be cached in-memory as a string after first read to avoid repeated disk I/O.
5. **No Regressions on Existing Types**: Querying existing `MpPlayer`, `MpVehicle`, `MpPickup` must still return data from `types.json`.

---

### Task 1: On-Demand REDengine Type Search in `types-engine.ts`

**Files:**
- Modify: `src/engine/types-engine.ts:70-179`
- Test: `tests/engine.test.ts`

**Interfaces:**
- Consumes: `@cybermp/client-types/out/game.d.ts`
- Produces: `getTypeInfo(name: string, env?: string): GetTypeInfoResult` returning `TypeRecord` for native REDengine classes.

- [ ] **Step 1: Write the failing test in `tests/engine.test.ts`**

Add tests asserting that `getTypeInfo` returns definitions for `TeleportationFacility`, `gameTeleportationFacility`, `ScriptGameInstance`, and `MountingFacility`:

```typescript
it('resolves native REDengine classes from game.d.ts on demand', () => {
  const result = getTypeInfo('TeleportationFacility');
  expect(result.type).toBeDefined();
  expect(result.type?.name).toBe('TeleportationFacility');
  expect(result.type?.env).toBe('client');
  expect(result.type?.source).toBe('REDengine');
  expect(result.formattedText).toContain('gameTeleportationFacility');
});

it('extracts methods and static functions from ScriptGameInstance', () => {
  const result = getTypeInfo('ScriptGameInstance');
  expect(result.type).toBeDefined();
  expect(result.type?.methods.length).toBeGreaterThan(50);
  expect(result.formattedText).toContain('GetTeleportationFacility');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/engine.test.ts -t "resolves native REDengine classes"`
Expected: FAIL with `expected undefined to be defined`

- [ ] **Step 3: Implement on-demand REDengine parser in `src/engine/types-engine.ts`**

Add in-memory cached reading of `game.d.ts` and regex extraction for `export class/interface <Name>`:

```typescript
let cachedGameDts: string | null = null;

function getGameDtsContent(): string | null {
  if (cachedGameDts !== null) return cachedGameDts;
  try {
    const gameDtsPath = path.resolve(__dirname, '../../../node_modules/@cybermp/client-types/out/game.d.ts');
    if (fs.existsSync(gameDtsPath)) {
      cachedGameDts = fs.readFileSync(gameDtsPath, 'utf-8');
    }
  } catch {
    cachedGameDts = null;
  }
  return cachedGameDts;
}

export function parseRedengineType(name: string): TypeRecord | null {
  const content = getGameDtsContent();
  if (!content) return null;

  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`export\\s+(class|interface)\\s+(${escaped})\\b(?:\\s+extends\\s+([^{]+))?\\s*\\{([\\s\\S]*?)\\n\\}`, 'i');
  const match = content.match(regex);
  if (!match) return null;

  const kind = match[1] as 'class' | 'interface';
  const matchedName = match[2];
  const extendsClause = match[3] ? match[3].trim().split(/\s*,\s*/) : [];
  const body = match[4];

  const methods: MethodRecord[] = [];
  const properties: PropertyRecord[] = [];

  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const methodMatch = trimmed.match(/^(?:(static)\s+)?"([^"]+)"\s*\(([^)]*)\)\s*:\s*([^;]+);/);
    if (methodMatch) {
      const isStatic = !!methodMatch[1];
      const methodName = methodMatch[2];
      const rawParams = methodMatch[3];
      const returnType = methodMatch[4].trim();
      const params = rawParams ? rawParams.split(',').map((p) => {
        const [pName, pType] = p.split(':').map((s) => s.trim());
        return { name: pName || 'param', type: pType || 'any' };
      }) : [];

      methods.push({
        name: methodName,
        signature: `${isStatic ? 'static ' : ''}${methodName}(${rawParams}): ${returnType}`,
        parameters: params,
        returnType,
      });
      continue;
    }

    const propMatch = trimmed.match(/^([a-zA-Z0-9_]+)(\?)?\s*:\s*([^;]+);/);
    if (propMatch) {
      properties.push({
        name: propMatch[1],
        optional: !!propMatch[2],
        type: propMatch[3].trim(),
      });
    }
  }

  // If class has no own methods but extends a base class, also inspect base class
  if (methods.length === 0 && extendsClause.length > 0) {
    const baseType = parseRedengineType(extendsClause[0]);
    if (baseType) {
      methods.push(...baseType.methods);
      properties.push(...baseType.properties);
    }
  }

  return {
    name: matchedName,
    kind,
    env: 'client',
    source: 'REDengine',
    category: 'GameNatives',
    extends: extendsClause,
    methods,
    properties,
    description: 'REDengine native class available under mp.game.* when use_game_natives = true',
  };
}
```

Wire `parseRedengineType` into `getTypeInfo`: if `!exactMatch && (!env || env === 'client')`, call `parseRedengineType(name)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/engine.test.ts`
Expected: PASS (all engine tests passing)

- [ ] **Step 5: Commit**

```bash
git add src/engine/types-engine.ts tests/engine.test.ts
git commit -m "feat(engine): add on-demand REDengine class parser for game.d.ts"
```

---

### Task 2: Index `skills/cybermp-dev/references/` in `scripts/build-index.ts` & `docs-engine.ts`

**Files:**
- Modify: `scripts/build-index.ts:660-705`
- Test: `tests/build-index.test.ts`
- Test: `tests/engine.test.ts`

**Interfaces:**
- Consumes: `skills/cybermp-dev/references/*.md`
- Produces: `src/data/guides.json` with records covering both Astro guides and modular references.

- [ ] **Step 1: Write the failing test in `tests/build-index.test.ts`**

```typescript
it('indexes skills/cybermp-dev/references markdown guides alongside external docs', () => {
  const guides = parseGuides();
  const refGuides = guides.filter((g) => g.slug.startsWith('references/'));
  expect(refGuides.length).toBeGreaterThanOrEqual(8);
  expect(refGuides.some((g) => g.title.includes('Vehicles & Physics'))).toBe(true);
  expect(refGuides.some((g) => g.title.includes('Player Mechanics'))).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/build-index.test.ts -t "indexes skills/cybermp-dev/references"`
Expected: FAIL with `refGuides.length 0`

- [ ] **Step 3: Update `parseGuides` in `scripts/build-index.ts`**

Extend `parseGuides` to scan `skills/cybermp-dev/references/*.md`:

```typescript
// After processing targetDir, scan referencesDir:
const referencesDir = path.resolve(projectRoot, 'skills/cybermp-dev/references');
if (fs.existsSync(referencesDir)) {
  const refFiles = fs.readdirSync(referencesDir).filter((f) => f.endsWith('.md'));
  for (const file of refFiles) {
    const fullPath = path.join(referencesDir, file);
    const content = fs.readFileSync(fullPath, 'utf-8');
    const slug = `references/${file.replace(/\.md$/, '')}`;
    const url = `skills/cybermp-dev/references/${file}`;
    const { title, description } = extractDocMetadata(content);
    const codeSnippets = extractCodeSnippets(content);
    const plainText = extractPlainText(content);

    guides.push({
      title: title || file.replace(/\.md$/, ''),
      description: description || `Offline reference guide for ${file}`,
      slug,
      url,
      codeSnippets,
      plainText,
    });
  }
}
```

- [ ] **Step 4: Re-run build-index and test to verify it passes**

Run: `pnpm vitest run tests/build-index.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/build-index.ts tests/build-index.test.ts
git commit -m "feat(indexer): index skills references alongside external docs in guides.json"
```

---

### Task 3: Document Official SDK Subsystems in `skills/cybermp-dev/references/`

**Files:**
- Modify: `skills/cybermp-dev/references/cameras-input-cef.md`
- Modify: `skills/cybermp-dev/references/server-mechanics.md`
- Modify: `skills/cybermp-dev/references/game-natives.md`
- Test: `tests/skills.test.ts`
- Test: `tests/coverage.test.ts`

**Interfaces:**
- Consumes: `@cybermp/client-types/precomputed` (`MpDiscord`, `MpLocalStorage`, `MpCommands`, `MpLocal`, `MpNetwork`)
- Produces: Complete reference documentation for `mp.discord`, `mp.storage`, client `mp.commands`, `vehicle.seats`, `player.mute`, `entity.owner`.

- [ ] **Step 1: Write assertions in `tests/skills.test.ts`**

Add tests verifying presence of:
- `mp.discord.updateRichPresence`
- `mp.storage.set`
- `mp.commands.add` (client commands)
- `vehicle.seats.driver`
- `player.mute`
- `entity.owner`

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/skills.test.ts`
Expected: FAIL on missing SDK assertions

- [ ] **Step 3: Document official SDK subsystems**

1. In `cameras-input-cef.md`:
   - Add Section 5: **Discord Integration (`mp.discord`)**: `updateRichPresence(state, details)`, `getOAuth2Token(appId, scopes)`.
   - Add Section 6: **Client Storage (`mp.storage`)**: `set(key, val)`, `get(key)`, `delete(key)`, `deleteAll()`, `save()`.
   - Add Section 7: **Client Commands (`mp.commands`)**: `add(cmd, (id, args) => ...)`, `remove(cmd)`.
2. In `server-mechanics.md`:
   - Add Section 14: **Vehicle Seats & Occupants**: `vehicle.seats.driver`, `vehicle.lastSeats`, `getPlayerInSeat`, `getLastPlayerInSeat`.
   - Add Section 15: **Player Voice & Moderation**: `player.mute()`, `player.velocity`, `player.lastVehicle`, `player.emit()`, `mp.players.kick()`.
   - Add Section 16: **Entity Physics Ownership & Synchronization**: `entity.owner` (sync host), `entity.streamingRadius`, `entity.exist`.
3. In `game-natives.md`:
   - Add Section 18: **Client-Side Entity Spawning (`mp.local`)**: `mp.local.spawnPed`, `mp.local.despawnPed`, `mp.local.spawnVehicle`, `mp.local.despawnVehicle`.

- [ ] **Step 4: Run tests to verify all pass**

Run: `pnpm vitest run tests/skills.test.ts tests/coverage.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add skills/ tests/
git commit -m "docs(skills): document mp.discord, mp.storage, client commands, vehicle seats, and entity owner"
```

---

### Task 4: Full Index Rebuild and Verification

**Files:**
- Output: `src/data/types.json`, `src/data/events.json`, `src/data/guides.json`
- Test: All test suites (`tests/*.test.ts`)

- [ ] **Step 1: Rebuild data indexes**

Run: `pnpm run build-index`
Expected: Success with increased records in `guides.json` (38+ records).

- [ ] **Step 2: Run complete Vitest suite**

Run: `pnpm test`
Expected: All 9 test files pass (100+ tests).

- [ ] **Step 3: Run TypeScript project build**

Run: `pnpm run build`
Expected: Exit code 0, clean build under `dist/`.

- [ ] **Step 4: Commit generated data**

```bash
git add src/data/
git commit -m "chore(data): rebuild indexes with expanded reference guides"
```
