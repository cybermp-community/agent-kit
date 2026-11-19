import typesData from '../data/types.json' with { type: 'json' };
import type { TypeRecord, PropertyRecord, MethodRecord, EnumMemberRecord } from '../types/index.js';
import { checkForeignApi } from './anti-hallucination.js';

export interface GetTypeInfoResult {
  type?: TypeRecord;
  matches: TypeRecord[];
  formattedText: string;
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
