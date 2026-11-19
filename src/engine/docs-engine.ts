import MiniSearch from 'minisearch';
import guidesData from '../data/guides.json' with { type: 'json' };
import type { GuideRecord } from '../types/index.js';
import { checkForeignApi } from './anti-hallucination.js';

export interface SearchDocsResult {
  results: GuideRecord[];
  formattedText: string;
}

const allGuides = guidesData as GuideRecord[];
const guideMap = new Map<string, GuideRecord>(allGuides.map((g) => [g.slug, g]));

const miniSearch = new MiniSearch<GuideRecord>({
  fields: ['title', 'description', 'plainText'],
  storeFields: ['slug'],
  idField: 'slug',
  searchOptions: {
    boost: { title: 3, description: 2, plainText: 1 },
    fuzzy: 0.2,
    prefix: true,
  },
});

miniSearch.addAll(allGuides);

/**
 * Fast offline full-text search across official CyberMP guides,
 * recipes, and tutorials using MiniSearch.
 */
export function searchDocs(query: string, limit: number = 3): SearchDocsResult {
  const foreignWarning = query ? checkForeignApi(query) : null;
  const q = query ? query.trim() : '';
  const maxLimit = Math.max(1, limit);

  let results: GuideRecord[] = [];

  if (q) {
    const rawResults = miniSearch.search(q);
    const seen = new Set<string>();

    for (const r of rawResults) {
      const guide = guideMap.get(r.id);
      if (guide && !seen.has(guide.slug)) {
        seen.add(guide.slug);
        results.push(guide);
        if (results.length >= maxLimit) break;
      }
    }

    // Substring fallback if MiniSearch returned fewer than requested limit
    if (results.length < maxLimit) {
      const qLower = q.toLowerCase();
      for (const guide of allGuides) {
        if (!seen.has(guide.slug)) {
          if (
            guide.title.toLowerCase().includes(qLower) ||
            guide.description.toLowerCase().includes(qLower) ||
            guide.plainText.toLowerCase().includes(qLower)
          ) {
            seen.add(guide.slug);
            results.push(guide);
            if (results.length >= maxLimit) break;
          }
        }
      }
    }
  } else {
    results = allGuides.slice(0, maxLimit);
  }

  const sections: string[] = [];

  if (foreignWarning) {
    sections.push(foreignWarning);
  }

  if (results.length > 0) {
    const lines: string[] = [
      `## CyberMP Documentation Guides (${results.length} found for "${query}")`,
      '',
    ];

    for (const guide of results) {
      lines.push(`### [${guide.title}](${guide.url})`);
      if (guide.description) {
        lines.push(`**Description:** ${guide.description}`);
      }
      lines.push(`**URL:** ${guide.url}`);

      if (guide.codeSnippets && guide.codeSnippets.length > 0) {
        lines.push('\n**Example:**');
        lines.push('```typescript');
        lines.push(guide.codeSnippets[0]);
        lines.push('```');
      }
      lines.push('');
    }

    sections.push(lines.join('\n'));
  } else {
    sections.push(`No CyberMP documentation guides found matching "${query}".`);
  }

  return {
    results,
    formattedText: sections.join('\n\n'),
  };
}
