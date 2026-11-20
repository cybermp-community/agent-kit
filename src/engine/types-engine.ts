import fs from 'node:fs';
import { createRequire } from 'node:module';
import { gunzipSync } from 'node:zlib';
import typesData from '../data/types.json' with { type: 'json' };
import type { TypeRecord, PropertyRecord, MethodRecord, EnumMemberRecord, NativeTypeIndex } from '../types/index.js';
import { checkForeignApi } from './anti-hallucination.js';

const require = createRequire(import.meta.url);

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
      p.static ? 'static' : '',
      p.readonly ? 'readonly' : '',
      p.optional ? 'optional' : '',
    ]
      .filter(Boolean)
      .join(', ') || '-';
    const desc = [p.declaredIn ? `Inherited from \`${p.declaredIn}\`` : '', p.description?.replace(/\|/g, '\\|')].filter(Boolean).join('. ') || '-';
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
    const detail = [m.declaredIn ? `inherited from ${m.declaredIn}` : '', m.description].filter(Boolean).join('. ');
    const comment = detail ? ` // ${detail}` : '';
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

let nativeVersion: string | undefined;
const nativeNames = new Map<string, TypeRecord>();
const nativeAliases = new Map<string, TypeRecord[]>();
const resolvedTypes = new Map<string, TypeRecord>();

function loadNativeIndex(): void {
  if (nativeVersion !== undefined) return;
  const file = require.resolve('#native-types');
  const index: NativeTypeIndex = JSON.parse(gunzipSync(fs.readFileSync(file)).toString('utf8'));
  for (const type of index.types) {
    nativeNames.set(type.name.toLowerCase(), type);
    const alias = /^game[a-z]*([A-Z].*)$/.exec(type.name)?.[1]?.toLowerCase();
    if (alias) {
      const candidates = nativeAliases.get(alias) ?? [];
      candidates.push(type);
      nativeAliases.set(alias, candidates);
    }
  }
  nativeVersion = index.packageVersion;
}

function nativeMatches(name: string): TypeRecord[] {
  loadNativeIndex();
  const exact = nativeNames.get(name);
  return exact ? [exact] : nativeAliases.get(name) ?? [];
}

export function parseRedengineType(name: string): TypeRecord | null {
  const query = name.trim().toLowerCase();
  if (!query) return null;
  const [type, ...otherMatches] = nativeMatches(query);
  if (!type || otherMatches.length > 0) return null;
  const key = type.name.toLowerCase();
  const cached = resolvedTypes.get(key);
  if (cached) return cached;

  const methods: MethodRecord[] = [];
  const properties: PropertyRecord[] = [];
  const visited = new Set<string>();
  const overriddenMethods = new Set<string>();
  const inheritedProperties = new Set<string>();
  function collect(owner: TypeRecord): void {
    if (visited.has(owner.name)) return;
    visited.add(owner.name);
    const methodKeys = new Set<string>();
    for (const method of owner.methods) {
      const key = method.signature.startsWith('static ') ? `static ${method.name}` : method.name;
      if (overriddenMethods.has(key)) continue;
      methodKeys.add(key);
      methods.push(owner === type ? method : { ...method, declaredIn: owner.name });
    }
    for (const methodKey of methodKeys) overriddenMethods.add(methodKey);
    for (const property of owner.properties) {
      const key = property.static ? `static ${property.name}` : property.name;
      if (inheritedProperties.has(key)) continue;
      inheritedProperties.add(key);
      properties.push(owner === type ? property : { ...property, declaredIn: owner.name });
    }
    for (const baseName of owner.extends ?? []) {
      const base = nativeNames.get(baseName.toLowerCase());
      if (base) collect(base);
    }
  }
  collect(type);
  const record: TypeRecord = {
    ...type,
    source: 'REDengine',
    category: 'GameNatives',
    description: 'Native declaration for the CyberMP client. Verify runtime behavior in your client build.',
    methods,
    properties,
  };
  resolvedTypes.set(key, record);
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
    } else if (matches.length === 0) {
      matches = nativeMatches(q);
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

    if (exactMatch.source === 'REDengine' && nativeVersion) {
      lines.push(`- **Declaration source:** @cybermp/client-types@${nativeVersion}/game`);
    }

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
