import tweakDbData from '../data/tweakdb.json' with { type: 'json' };

export const tweakDbCategories = [
  'status_effects', 'weapons', 'vehicles', 'clothing', 'quickhacks', 'workspots',
  'ammo', 'cyberware', 'consumables',
] as const;

export interface TweakDbRecord {
  id: string;
  category: typeof tweakDbCategories[number];
  name: string;
  description: string;
  kind?: 'workspot-search-label';
  evidence?:
    | { status: 'source-match' | 'record-name-index'; sourceUrl: string }
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
        r.description.toLowerCase().includes(q) ||
        (r.evidence?.status === 'needs-recheck' && r.evidence.candidateId?.toLowerCase().includes(q))
    );
    const exact = filtered.findIndex((record) => record.id.toLowerCase() === q);
    if (exact > 0) filtered = [filtered[exact], ...filtered.slice(0, exact), ...filtered.slice(exact + 1)];
  }

  const results = filtered.slice(0, maxLimit);
  if (results.length === 0) {
    return {
      results: [],
      formattedText: `No TweakDB records found in the curated catalog matching query "${query}" in category "${category}".`,
    };
  }

  const lines = [
    `## TweakDB Lookup Results (${results.length} shown of ${filtered.length} matches)`,
    '',
    'Curated candidates. Runtime behavior is unverified. An exact name match establishes an entry in the source index. Check record type, display name, tier, DLC and availability in the target game build.',
    '',
    '| Identifier | Category | Name | Evidence | Catalog note (unverified) |',
    '| :--- | :--- | :--- | :--- | :--- |',
  ];

  for (const r of results) {
    const evidence = r.evidence;
    let evidenceText = 'Unconfirmed ID';
    if (r.kind === 'workspot-search-label') {
      evidenceText = 'Unconfirmed ID. Workspot search label';
    } else if (evidence?.status === 'record-name-index') {
      evidenceText = `[Exact record name in WolvenKit index](${evidence.sourceUrl})`;
    } else if (evidence?.status === 'source-match') {
      evidenceText = `[ID found in source](${evidence.sourceUrl})`;
    } else if (evidence?.status === 'needs-recheck') {
      evidenceText = `[ID needs recheck](${evidence.sourceUrl})`;
      if (evidence.candidateId) evidenceText += `. Candidate: \`${evidence.candidateId}\``;
    }
    lines.push(`| \`${r.id}\` | \`${r.category}\` | **${r.name}** | ${evidenceText} | ${r.description.replace(/\|/g, '\\|')} |`);
  }

  if (results.some((record) => record.kind === 'workspot-search-label')) {
    lines.push('', 'For `PlayInDeviceSimple`, resolve the device and actor in the client. Inspect the device and its `.workspot` asset in the target build.',
      '[Workspot asset and playback guide](https://github.com/mo3g666/cybermp-agent-kit/blob/main/skills/cybermp-dev/references/animations-and-workspots.md)');
  }

  return {
    results,
    formattedText: lines.join('\n'),
  };
}
