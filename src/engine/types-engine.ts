import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import typesData from '../data/types.json' with { type: 'json' };
import type { TypeRecord, PropertyRecord, MethodRecord, EnumMemberRecord } from '../types/index.js';
import { checkForeignApi } from './anti-hallucination.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface GetTypeInfoResult {
  type?: TypeRecord;
  matches: TypeRecord[];
  formattedText: string;
}

export function resolveTypeName(args: Record<string, any>): string {
  const raw = args.name ?? args.type_name ?? args.typeName ?? args.type;
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new Error("Missing required argument: 'name' or 'type_name' must be provided.");
  }
  return raw.trim();
}

const allTypes = typesData as TypeRecord[];

function formatPropertiesTable(properties: PropertyRecord[]): string {
  if (!properties || properties.length === 0) {
    return 'No exposed properties.';
  }

  const rows = properties.map((p) => {
    const modifiers = [
      p.readonly ? 'readonly' : '',
      p.optional ? 'optional' : '',
    ]
      .filter(Boolean)
      .join(', ') || '-';
    const desc = p.description ? p.description.replace(/\|/g, '\\|') : '-';
    return `| \`${p.name}\` | \`${p.type}\` | ${modifiers} | ${desc} |`;
  });

  return [
    '| Property | Type | Modifiers | Description |',
    '| --- | --- | --- | --- |',
    ...rows,
  ].join('\n');
}

function formatMethodsList(methods: MethodRecord[]): string {
  if (!methods || methods.length === 0) {
    return 'No exposed methods.';
  }

  const lines = methods.map((m) => {
    const comment = m.description ? ` // ${m.description}` : '';
    return `  ${m.signature};${comment}`;
  });

  return ['```typescript', ...lines, '```'].join('\n');
}

function formatEnumMembersTable(members: EnumMemberRecord[]): string {
  if (!members || members.length === 0) {
    return 'No enum members.';
  }

  const rows = members.map((m) => {
    const val = m.value !== undefined ? String(m.value) : '-';
    const desc = m.description ? m.description.replace(/\|/g, '\\|') : '-';
    return `| \`${m.name}\` | \`${val}\` | ${desc} |`;
  });

  return [
    '| Member | Value | Description |',
    '| --- | --- | --- |',
    ...rows,
  ].join('\n');
}

let cachedGameDts: string | null = null;
let dtsLoadAttempted = false;
const parsedRedengineCache = new Map<string, TypeRecord | null>();

function getGameDtsContent(): string | null {
  if (dtsLoadAttempted) return cachedGameDts;
  dtsLoadAttempted = true;
  try {
    const candidatePaths = [
      path.resolve(__dirname, '../../node_modules/@cybermp/client-types/out/game.d.ts'),
      path.resolve(__dirname, '../../../node_modules/@cybermp/client-types/out/game.d.ts'),
      path.resolve(process.cwd(), 'node_modules/@cybermp/client-types/out/game.d.ts'),
    ];

    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        cachedGameDts = fs.readFileSync(p, 'utf-8');
        break;
      }
    }
  } catch {
    cachedGameDts = null;
  }
  return cachedGameDts;
}

export function parseRedengineType(name: string, visited = new Set<string>()): TypeRecord | null {
  const q = name ? name.trim() : '';
  if (!q) return null;

  const cacheKey = q.toLowerCase();
  if (parsedRedengineCache.has(cacheKey)) {
    return parsedRedengineCache.get(cacheKey) || null;
  }
  if (visited.has(cacheKey)) return null;
  visited.add(cacheKey);

  const content = getGameDtsContent();
  if (!content) return null;

  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // 1. Exact match (case-insensitive)
  const exactRegex = new RegExp(`export\\s+(class|interface)\\s+(${escaped})\\b(?:\\s+extends\\s+([^{]+))?\\s*\\{([\\s\\S]*?)\\n\\}`, 'i');
  let match = content.match(exactRegex);

  // 2. Controlled REDengine subsystem prefix match for PascalCase queries (e.g. gamemountingMountingFacility)
  if (!match) {
    const capitalized = q.charAt(0).toUpperCase() + q.slice(1);
    const prefixRegex = new RegExp(`export\\s+(class|interface)\\s+(game[a-z]*${capitalized})\\b(?:\\s+extends\\s+([^{]+))?\\s*\\{([\\s\\S]*?)\\n\\}`);
    match = content.match(prefixRegex);
  }

  if (!match) {
    parsedRedengineCache.set(cacheKey, null);
    return null;
  }

  const kind = match[1] as 'class' | 'interface';
  const matchedName = match[2];
  const extendsClause = match[3] ? match[3].trim().split(/\s*,\s*/) : [];
  const body = match[4];

  const methods: MethodRecord[] = [];
  const properties: PropertyRecord[] = [];

  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const methodMatch = trimmed.match(/^(?:(static)\s+)?(?:"([^"]+)"|([a-zA-Z0-9_]+))\s*\(([^)]*)\)\s*:\s*([^;]+);/);
    if (methodMatch) {
      const isStatic = !!methodMatch[1];
      const methodName = methodMatch[2] || methodMatch[3];
      const rawParams = methodMatch[4];
      const returnType = methodMatch[5].trim();
      const params = rawParams
        ? rawParams.split(',').map((p) => {
            const colonIdx = p.indexOf(':');
            if (colonIdx !== -1) {
              const pName = p.slice(0, colonIdx).trim();
              const pType = p.slice(colonIdx + 1).trim();
              return { name: pName || 'param', type: pType || 'any' };
            }
            return { name: p.trim() || 'param', type: 'any' };
          })
        : [];

      methods.push({
        name: methodName,
        signature: `${isStatic ? 'static ' : ''}${methodName}(${rawParams}): ${returnType}`,
        parameters: params,
        returnType,
      });
      continue;
    }

    const propMatch = trimmed.match(/^(?:"([^"]+)"|([a-zA-Z0-9_]+))(\?)?\s*:\s*([^;]+);/);
    if (propMatch) {
      properties.push({
        name: propMatch[1] || propMatch[2],
        optional: !!propMatch[3],
        type: propMatch[4].trim(),
      });
    }
  }

  // If class has no own methods but extends a base class, also inspect base class
  if (methods.length === 0 && extendsClause.length > 0) {
    const baseType = parseRedengineType(extendsClause[0], visited);
    if (baseType) {
      methods.push(...baseType.methods);
      properties.push(...baseType.properties);
    }
  }

  const record: TypeRecord = {
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

  parsedRedengineCache.set(matchedName.toLowerCase(), record);
  parsedRedengineCache.set(cacheKey, record);

  return record;
}

/**
 * Looks up TypeScript interfaces, classes, enums, and types from official
 * `@cybermp/*-types` declarations. Returns exact signature and JSDoc details.
 */
export function getTypeInfo(name: string, env?: string): GetTypeInfoResult {
  const foreignWarning = name ? checkForeignApi(name) : null;

  let filtered = allTypes;
  if (env) {
    filtered = filtered.filter((t) => t.env === env || t.env === 'shared');
  }

  const q = name ? name.trim().toLowerCase() : '';

  // Exact match
  let exactMatch: TypeRecord | undefined;
  if (q) {
    exactMatch = filtered.find((t) => t.name.toLowerCase() === q);
    if (!exactMatch && env) {
      exactMatch = allTypes.find((t) => t.name.toLowerCase() === q);
    }
  }

  // Matches
  let matches = filtered.filter(
    (t) =>
      t.name.toLowerCase().includes(q) ||
      (t.description && t.description.toLowerCase().includes(q))
  );

  if (!exactMatch && (!env || env === 'client') && q) {
    const redengineType = parseRedengineType(name);
    if (redengineType) {
      const isExactMatch = redengineType.name.toLowerCase() === q;
      // If CyberMP types matched and this is only a prefix-fallback match, do not hijack
      if (isExactMatch || matches.length === 0) {
        exactMatch = redengineType;
      }
    }
  }

  if (exactMatch) {
    matches = [exactMatch, ...matches.filter((m) => m !== exactMatch)];
  }

  // Format text
  const sections: string[] = [];

  if (foreignWarning) {
    sections.push(foreignWarning);
  }

  if (exactMatch) {
    const lines: string[] = [
      `## Type: ${exactMatch.name} (${exactMatch.kind}) [${exactMatch.env}]`,
      `- **Category:** ${exactMatch.category || 'General'}`,
      `- **Environment:** ${exactMatch.env}`,
    ];

    if (exactMatch.extends && exactMatch.extends.length > 0) {
      lines.push(`- **Extends:** \`${exactMatch.extends.join(', ')}\``);
    }

    if (exactMatch.description) {
      lines.push(`\n> ${exactMatch.description}`);
    }

    if (exactMatch.kind === 'enum') {
      lines.push('\n### Enum Members');
      lines.push(formatEnumMembersTable(exactMatch.enumMembers || []));
    } else {
      if (exactMatch.rawDefinition) {
        lines.push('\n### Definition');
        lines.push('```typescript');
        lines.push(exactMatch.rawDefinition);
        lines.push('```');
      }

      if (exactMatch.properties.length > 0) {
        lines.push(`\n### Properties (${exactMatch.properties.length})`);
        lines.push(formatPropertiesTable(exactMatch.properties));
      }

      if (exactMatch.methods.length > 0) {
        lines.push(`\n### Methods (${exactMatch.methods.length})`);
        lines.push(formatMethodsList(exactMatch.methods));
      }
    }

    const otherMatches = matches.filter((m) => m !== exactMatch);
    if (otherMatches.length > 0) {
      lines.push(`\n### Related Types (${otherMatches.length})`);
      for (const m of otherMatches.slice(0, 5)) {
        lines.push(`- **${m.name}** (${m.kind}) [${m.env}]`);
      }
    }

    sections.push(lines.join('\n'));
  } else if (matches.length > 0) {
    const lines: string[] = [
      `## CyberMP Types (${matches.length} found)`,
    ];
    if (env) lines.push(`**Environment Filter:** \`${env}\``);
    if (name) lines.push(`**Query:** \`${name}\``);
    lines.push('');

    for (const m of matches) {
      const desc = m.description ? ` — ${m.description}` : '';
      lines.push(`- **${m.name}** (${m.kind}) [${m.env}]${desc}`);
    }

    sections.push(lines.join('\n'));
  } else {
    sections.push(
      `No CyberMP types found matching "${name}"${env ? ` for environment "${env}"` : ''}.`
    );
  }

  return {
    type: exactMatch,
    matches,
    formattedText: sections.join('\n\n'),
  };
}
