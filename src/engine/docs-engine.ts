import MiniSearch from 'minisearch';
import guidesData from '../data/guides.json' with { type: 'json' };
import type { GuideRecord } from '../types/index.js';
import { checkForeignApi } from './anti-hallucination.js';

export interface SearchDocsResult {
  results: GuideRecord[];
  formattedText: string;
}

const allGuides = guidesData as GuideRecord[];
const guidesBySlug = new Map(allGuides.map((guide) => [guide.slug, guide]));
const priorityAliases = new Map<string, GuideRecord>();
for (const guide of allGuides) {
  for (const alias of guide.priorityAliases ?? []) priorityAliases.set(alias.toLowerCase(), guide);
}

const index = new MiniSearch<GuideRecord>({
  fields: ['sectionTitle', 'title', 'description', 'plainText', 'aliases'],
  extractField(record, fieldName) {
    if (fieldName === 'aliases') return record.aliases?.join(' ');
    return record[fieldName as keyof GuideRecord];
  },
  idField: 'slug',
  searchOptions: {
    boost: { sectionTitle: 5, title: 2, aliases: 8 },
    fuzzy: 0.2,
    prefix: true,
  },
});
index.addAll(allGuides);

const verificationLabels = {
  'upstream-summary': 'Summary of upstream documentation',
  'static-cross-check': 'Cross-checked in sources. Runtime behavior requires separate evidence.',
  unreviewed: 'Community reference. Runtime and version applicability have not been independently verified.',
};

function excerpt(guide: GuideRecord, terms: string[], exampleNotes?: string): string {
  const paragraphs = guide.paragraphs ?? [guide.plainText];
  const score = (paragraph: string) => {
    const words = new Set(identifiers(paragraph));
    return terms.filter((term) => words.has(term)).length;
  };
  const ranked = [...paragraphs].sort((left, right) => score(right) - score(left));
  const matching = ranked[0] && score(ranked[0]) > 0 ? ranked[0] : exampleNotes ?? ranked[0];
  const warning = paragraphs.find((paragraph) => /^(?:⚠️\s*)?(warning|limitation|caution|important)\b/i.test(paragraph));
  return [...new Set([matching, warning])].filter(Boolean).map((paragraph) => {
    const position = terms.reduce((first, term) => {
      const index = paragraph!.toLowerCase().indexOf(term);
      return index < 0 ? first : Math.min(first, index);
    }, Infinity);
    const text = paragraph!;
    const start = Number.isFinite(position) && position > 550 ? Math.max(0, position - 100) : 0;
    return (start > 0 ? '…' : '') + text.slice(start, start + 680) + (text.length > start + 680 ? '…' : '');
  }).join('\n\n');
}

function identifiers(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? [];
}

function qualifiedIdentifiers(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}_]+(?:[.:/\\-][\p{L}\p{N}_]+)+/gu) ?? [];
}

const queryConnectors = new Set(['a', 'an', 'and', 'for', 'from', 'how', 'in', 'of', 'or', 'the', 'to', 'use', 'using', 'with']);

function selectExample(guide: GuideRecord, query: string, terms: string[]): number | undefined {
  const keywords = [...new Set(terms)].filter((term) => !queryConnectors.has(term));
  if (!keywords.length || !guide.codeSnippets.length) return;

  const qualified = [...new Set(qualifiedIdentifiers(query))];
  const matches = (parts: string[], words: Set<string>) => parts.filter((part) => words.has(part)).length;
  const ranked = guide.codeSnippets.map((code, index) => {
    const codeTerms = new Set(identifiers(code));
    const qualifiedMatches = matches(qualified, new Set(qualifiedIdentifiers(code)));
    const score = qualified.length && !qualifiedMatches
      ? 0
      : matches(keywords, codeTerms) + (keywords.length + 1) * qualifiedMatches;
    return { index, score };
  }).sort((a, b) => b.score - a.score);

  const [best, next] = ranked;
  if (best.score > 0 && best.score !== next?.score) return best.index;
  if (!next && guide.sectionTitle && matches(keywords, new Set(identifiers(guide.sectionTitle))) === keywords.length) {
    return best.index;
  }
}

export function formatGuide(guide: GuideRecord, query: string): string {
  const terms = identifiers(query);
  const heading = guide.sectionTitle ? `${guide.title} -> ${guide.sectionTitle}` : guide.title;
  const source = guide.sourceKind === 'cybermp-docs' ? 'CyberMP Docs' : 'CyberMP Agent Kit';
  const lines = [
    `### [${heading}](${guide.url})`,
    `**Source:** ${source} · **Environment:** ${guide.environment ?? 'unspecified'} · **Revision:** ${guide.sourceRevision ?? 'unspecified'}`,
    `**Evidence:** ${verificationLabels[guide.verificationStatus ?? 'unreviewed']}`,
  ];
  if (guide.sourceUrl) lines.push(`[Pinned source](${guide.sourceUrl})`);
  if (guide.description) lines.push(guide.description);
  const selected = selectExample(guide, query, terms);
  const context = selected === undefined ? undefined : guide.exampleContexts?.[selected];
  const relevant = excerpt(guide, terms, context?.notes);
  if (relevant && relevant !== guide.description) lines.push(relevant);
  if (selected !== undefined) {
    const code = guide.codeSnippets[selected];
    const environment = context?.environment ?? (guide.environment === 'mixed' ? undefined : guide.environment);
    const evidence = context?.checkedAgainst
      ? `Type-checked against ${context.checkedAgainst}. Runtime behavior requires separate evidence.`
      : 'See section evidence above.';
    lines.push(`**Example environment:** ${environment ?? 'unspecified'} · **Example evidence:** ${evidence}`);
    if (context?.notes && !relevant.includes(context.notes) && context.notes !== guide.description) {
      lines.push(`**Example context:** ${context.notes}`);
    }
    if (code.length <= 850) {
      const fence = code.includes('```') ? '~~~~' : '```';
      lines.push(`${fence}${guide.codeLanguages?.[selected] ?? ''}\n${code}\n${fence}`);
    } else {
      lines.push(`[Full example](${guide.url})`);
    }
  }
  return lines.join('\n\n');
}

export function searchDocs(query: string, limit = 3): SearchDocsResult {
  const normalized = query.trim().toLowerCase().replace(/\s+/g, ' ');
  const maxResults = Math.min(10, Math.max(1, limit));
  const preferred = priorityAliases.get(normalized);
  const results = normalized
    ? [
      ...(preferred ? [preferred] : []),
      ...index.search(normalized).map((match) => guidesBySlug.get(match.id)!).filter((guide) => guide !== preferred),
    ].slice(0, maxResults)
    : allGuides.slice(0, maxResults);
  const warning = checkForeignApi(query);
  const body = results.length
    ? `## CyberMP documentation (${results.length} results)\n\n${results.map((guide) => formatGuide(guide, query)).join('\n\n')}`
    : `No matching CyberMP documentation for "${query}". This index covers a limited set of guides and recipes.`;
  return { results, formattedText: warning ? `${warning}\n\n${body}` : body };
}
