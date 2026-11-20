import type { EventRecord } from '../src/types/index.js';

const start = '<!-- event-catalog:start -->';
const end = '<!-- event-catalog:end -->';

const sections = [
  ['Server game and resource events', 'server', 'mp.events.on'],
  ['Client game and resource events', 'client', 'mp.events.on'],
  ['Client CEF lifecycle events', 'client', 'mp.events.onCef'],
  ['Browser transport methods', 'browser', 'mp.events'],
] as const;

export function eventReferenceWithCatalog(source: string, events: EventRecord[]): string {
  const before = source.indexOf(start);
  const after = source.indexOf(end);
  if (before < 0 || after < before) {
    throw new Error('The events reference is missing its generated catalog markers');
  }

  const tables = sections.flatMap(([title, env, registration]) => {
    const rows = events.filter((event) =>
      event.env === env && (env !== 'client' || (event.source === 'MpCefEventsMap') === (registration === 'mp.events.onCef')),
    );
    const lines = [
      `## ${title}`,
      '',
      '| Signature | API |',
      '| --- | --- |',
    ];
    for (const event of rows) {
      const signature = event.signature.replace(/\|/g, '\\|');
      const api = env === 'browser' ? `${registration}.${event.name}` : registration;
      lines.push(`| \`${signature}\` | \`${api}\` |`);
    }
    return [...lines, ''];
  });

  return [
    source.slice(0, before + start.length),
    '',
    ...tables,
    source.slice(after),
  ].join('\n');
}
