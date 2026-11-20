import tweakDbData from '../data/tweakdb.json' with { type: 'json' };

export interface TweakDbRecord {
  id: string;
  category: 'status_effects' | 'weapons' | 'vehicles' | 'clothing' | 'quickhacks' | 'workspots';
  name: string;
  description: string;
  evidence?:
    | { status: 'source-match'; sourceUrl: string }
    | { status: 'needs-recheck'; sourceUrl: string; candidateId?: string };
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
      formattedText: `No TweakDB records found in the curated catalog matching query "${query}" in category "${category}".`,
    };
  }

  const lines = [
    `## TweakDB Lookup Results (${results.length} found)`,
    '',
    'Curated candidates. Runtime behavior is unverified. A source match establishes an ID mention, with game version and description still subject to verification.',
    '',
    '| TweakDB ID | Category | Name | Evidence | Catalog note (unverified) |',
    '| :--- | :--- | :--- | :--- | :--- |',
  ];

  for (const r of results) {
    const evidence = r.evidence;
    let evidenceText = 'Unconfirmed ID';
    if (evidence?.status === 'source-match') {
      evidenceText = `[ID found in source](${evidence.sourceUrl})`;
    } else if (evidence?.status === 'needs-recheck') {
      evidenceText = `[ID needs recheck](${evidence.sourceUrl})`;
      if (evidence.candidateId) evidenceText += `. Candidate: \`${evidence.candidateId}\``;
    }
    lines.push(`| \`${r.id}\` | \`${r.category}\` | **${r.name}** | ${evidenceText} | ${r.description.replace(/\|/g, '\\|')} |`);
  }

  return {
    results,
    formattedText: lines.join('\n'),
  };
}
