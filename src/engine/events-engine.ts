import eventsData from '../data/events.json' with { type: 'json' };
import type { EventRecord, EventParameter } from '../types/index.js';
import { checkForeignApi } from './anti-hallucination.js';

export interface GetEventInfoOptions {
  env?: 'server' | 'client' | 'browser';
  name?: string;
  category?: string;
}

export interface GetEventInfoResult {
  exactMatch?: EventRecord;
  matches: EventRecord[];
  formattedText: string;
}

const EVENT_ALIASES: Record<string, string> = {
  playerdamage: 'damage',
  player_damage: 'damage',
};

const allEvents = eventsData as EventRecord[];

function generateListenerSyntax(event: EventRecord): string {
  const paramNames = event.parameters.map((p) => p.name).join(', ');
  if (event.env === 'server') {
    return `// Server listener:\nmp.events.on('${event.name}', (${paramNames}) => {\n  // Handler implementation\n});`;
  }
  if (event.env === 'client') {
    if (event.source === 'MpCefEventsMap') {
      return `// Client listener for CEF event:\nmp.events.onCef('${event.name}', (${paramNames}) => {\n  // Handle CEF event\n});`;
    }
    return `// Client listener:\nmp.events.on('${event.name}', (${paramNames}) => {\n  // Handler implementation\n});`;
  }
  if (event.env === 'browser') {
    return `// CEF Web UI listener:\nmp.events.on('${event.name}', (${paramNames}) => {\n  // Browser handler\n});`;
  }
  return `mp.events.on('${event.name}', (${paramNames}) => {});`;
}

function formatParametersTable(parameters: EventParameter[]): string {
  if (!parameters || parameters.length === 0) {
    return 'No parameters (empty payload).';
  }

  const rows = parameters.map((p) => {
    const opt = p.optional ? 'Yes' : 'No';
    const desc = p.description ? p.description.replace(/\|/g, '\\|') : '-';
    return `| \`${p.name}\` | \`${p.type}\` | ${opt} | ${desc} |`;
  });

  return [
    '| Parameter | Type | Optional | Description |',
    '| --- | --- | --- | --- |',
    ...rows,
  ].join('\n');
}

/**
 * Queries the pre-indexed CyberMP event catalog with exact matching,
 * partial substring filtering, execution environment filtering,
 * and anti-hallucination guard notices.
 */
export function getEventInfo(options: GetEventInfoOptions = {}): GetEventInfoResult {
  const foreignWarning = options.name ? checkForeignApi(options.name) : null;

  let filtered = allEvents;
  if (options.env) {
    filtered = filtered.filter((e) => e.env === options.env);
  }
  if (options.category) {
    const cat = options.category.toLowerCase();
    filtered = filtered.filter((e) => e.category?.toLowerCase().includes(cat));
  }

  let exactMatch: EventRecord | undefined;
  let matches: EventRecord[] = [];

  if (options.name) {
    const q = options.name.trim().toLowerCase();

    // 1. Direct exact name match
    exactMatch = filtered.find((e) => e.name.toLowerCase() === q);
    if (!exactMatch && !options.env) {
      exactMatch = allEvents.find((e) => e.name.toLowerCase() === q);
    }

    // 2. Known alias match (e.g. playerDamage -> damage)
    if (!exactMatch && EVENT_ALIASES[q]) {
      const aliasTarget = EVENT_ALIASES[q];
      exactMatch = filtered.find((e) => e.name.toLowerCase() === aliasTarget);
      if (!exactMatch && !options.env) {
        exactMatch = allEvents.find((e) => e.name.toLowerCase() === aliasTarget);
      }
    }

    // 3. Partial matches
    matches = filtered.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        (e.description && e.description.toLowerCase().includes(q))
    );

    // If exact match exists, ensure it is the first in matches
    if (exactMatch && (!options.env || exactMatch.env === options.env)) {
      matches = [exactMatch, ...matches.filter((m) => m !== exactMatch)];
    }
  } else {
    matches = filtered;
  }

  // Format output text
  const sections: string[] = [];

  if (foreignWarning) {
    sections.push(foreignWarning);
  }

  if (exactMatch) {
    const lines: string[] = [
      `## Event: ${exactMatch.name} [${exactMatch.env}]`,
      `- **Category:** ${exactMatch.category || 'General'}`,
      `- **Source Interface:** ${exactMatch.source || 'N/A'}`,
      `- **Environment:** ${exactMatch.env}`,
    ];

    if (exactMatch.description) {
      lines.push(`\n> ${exactMatch.description}`);
    }

    lines.push('\n### Signature');
    lines.push('```typescript');
    lines.push(exactMatch.signature);
    lines.push('```');

    lines.push('\n### Listener Syntax');
    lines.push('```typescript');
    lines.push(generateListenerSyntax(exactMatch));
    lines.push('```');

    lines.push('\n### Parameters');
    lines.push(formatParametersTable(exactMatch.parameters));

    const otherMatches = matches.filter((m) => m !== exactMatch);
    if (otherMatches.length > 0) {
      lines.push(`\n### Related Events (${otherMatches.length})`);
      for (const m of otherMatches.slice(0, 5)) {
        lines.push(`- **${m.name}** [${m.env}] \`${m.signature}\``);
      }
    }

    sections.push(lines.join('\n'));
  } else if (matches.length > 0) {
    const lines: string[] = [
      `## CyberMP Events (${matches.length} found)`,
    ];
    if (options.env) lines.push(`**Environment Filter:** \`${options.env}\``);
    if (options.category) lines.push(`**Category Filter:** \`${options.category}\``);
    if (options.name) lines.push(`**Query:** \`${options.name}\``);
    lines.push('');

    for (const m of matches) {
      const desc = m.description ? ` — ${m.description}` : '';
      lines.push(`- **${m.name}** [${m.env}] \`${m.signature}\`${desc}`);
    }

    sections.push(lines.join('\n'));
  } else {
    sections.push(
      `No CyberMP events found matching name: "${options.name || ''}"${
        options.env ? ` (env: ${options.env})` : ''
      }${options.category ? ` (category: ${options.category})` : ''}.`
    );
  }

  return {
    exactMatch,
    matches,
    formattedText: sections.join('\n\n'),
  };
}
