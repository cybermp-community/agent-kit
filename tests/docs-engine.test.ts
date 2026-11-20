import { describe, it, expect } from 'vitest';
import { searchDocs } from '../src/engine/docs-engine.js';

describe('Granular Docs Search Engine', () => {
  it('returns section-level match with heading anchor and relevant code snippet for "burning"', () => {
    const result = searchDocs('burning', 3);
    expect(result.results.length).toBeGreaterThan(0);
    const burningMatch = result.results.find((r) => r.slug.includes('player-mechanics') || r.plainText.includes('Burning'));
    expect(burningMatch).toBeDefined();
    expect(burningMatch?.slug).toContain('#combat-status-effects');
    expect(burningMatch?.guideTitle).toBe('Player Mechanics & Inventory Reference');
    expect(burningMatch?.sectionTitle).toBe('Combat Status Effects & Damage-over-Time (DoT)');
    expect(burningMatch?.codeSnippets).toBeDefined();
    expect(burningMatch?.codeSnippets[0]).toContain('ApplyStatusEffect');
    // Must NOT contain createVector3 as the primary snippet for burning
    if (burningMatch?.codeSnippets && burningMatch.codeSnippets.length > 0) {
      expect(burningMatch.codeSnippets[0]).not.toContain('createVector3');
    }
  });

  it('formats output with section hierarchy [Guide -> Section]', () => {
    const result = searchDocs('teleport', 1);
    expect(result.formattedText).toMatch(/\[.*->.*\]|\.md#/);
  });
});

it('returns the relevant limitation past the first 500 characters', async () => {
  const { parseMarkdownSections } = await import('../scripts/build-index.js');
  const { formatGuide } = await import('../src/engine/docs-engine.js');
  const content = [
    '# Fixture', '## Color and geometry', 'filler '.repeat(100), '',
    'Warning: tint cannot create a geometry resource.', '',
    '```lua', 'print("tint")', '```', '',
    '```toml', 'file = []', '```',
  ].join('\n');
  const guide = parseMarkdownSections(content, 'fixture', 'https://example.org/fixture', 'Fixture', '')[1];
  expect(guide.plainText).toContain('tint cannot create a geometry resource');
  expect(guide.codeLanguages).toEqual(['lua', 'toml']);
  const answer = formatGuide(guide, 'tint');
  expect(answer).toContain('tint cannot create a geometry resource');
  expect(answer).toContain('```lua\nprint("tint")\n```');
});

it('keeps Markdown headings inside fenced code', async () => {
  const { parseMarkdownSections } = await import('../scripts/build-index.js');
  const guide = parseMarkdownSections(
    '# Example\n## Shell\n```bash\n## a shell comment\necho safe\n```',
    'fixture', 'https://example.org/fixture', 'Fixture', '',
  );
  expect(guide.map((record) => record.sectionTitle)).toEqual([undefined, 'Shell']);
  expect(guide[1].codeSnippets).toEqual(['## a shell comment\necho safe']);
});

it('preserves literal depot paths, underscores and generic arguments in inline code', async () => {
  const { parseMarkdownSections } = await import('../scripts/build-index.js');
  const [guide] = parseMarkdownSections(
    'Pack `cybermp_kit_cube.archive` with `cybermp_kit\\diagnostics\\cube.ent` and call `get<Foo | Bar>`.',
    'fixture', 'https://example.org/fixture', 'Fixture', '',
  );
  expect(guide.plainText).toContain('cybermp_kit_cube.archive');
  expect(guide.plainText).toContain('cybermp_kit\\diagnostics\\cube.ent');
  expect(guide.plainText).toContain('get<Foo | Bar>');
});

it('links a documented upstream result to the recorded revision', () => {
  const result = searchDocs('Observing Game Methods', 10);
  const guide = result.results.find(({ slug }) => slug === 'client/observes');
  expect(guide?.sourceUrl).toContain(`/blob/${guide?.sourceRevision}/`);
  expect(result.formattedText).toContain(guide!.sourceUrl);
});

it('omits an unconnected example and avoids guessing between tied examples', async () => {
  const { parseMarkdownSections } = await import('../scripts/build-index.js');
  const { formatGuide } = await import('../src/engine/docs-engine.js');
  const [, guide] = parseMarkdownSections([
    '# Fixture', '## UI notes', 'A loading overlay needs a separate lifecycle.', '',
    '```typescript', "mp.events.emitServer('ready');", '```', '',
    '```typescript', "mp.events.emitCef('ready');", '```',
  ].join('\n'), 'fixture', 'https://example.org/fixture', 'Fixture', '');
  expect(formatGuide(guide, 'loading overlay')).not.toContain('```');
  expect(formatGuide(guide, 'ready')).not.toContain('```');
  expect(formatGuide(guide, 'mp.events.emitCef')).toContain("mp.events.emitCef('ready')");
  expect(formatGuide(guide, 'mp.events.emitCef')).not.toContain("mp.events.emitServer('ready')");
  expect(formatGuide({ ...guide, codeSnippets: [guide.codeSnippets[0]] }, 'mp.events.unknown')).not.toContain('```');
});

it('uses the selected example environment, checked version and prerequisites', async () => {
  const { parseMarkdownSections } = await import('../scripts/build-index.js');
  const { formatGuide } = await import('../src/engine/docs-engine.js');
  const [, guide] = parseMarkdownSections([
    '---', 'environment: mixed', '---', '# Fixture', '## Sending events',
    'Client code runs after the resource starts.', '',
    '```typescript env=client checked=@cybermp/client-types@2.7.1',
    "mp.events.emitServer('status');", '```', '',
    'Register the browser handler before reporting readiness.', '',
    '```typescript env=browser checked=@cybermp/browser-types@2.0.1',
    "mp.events.emit('ui:ready');", '```',
  ].join('\n'), 'fixture', 'https://example.org/fixture', 'Fixture', '');
  const answer = formatGuide(guide, 'ui:ready');
  expect(answer).toContain('Example environment:** browser');
  expect(answer).toContain('@cybermp/browser-types@2.0.1');
  expect(answer).toContain('Register the browser handler before reporting readiness.');
  expect(answer).not.toContain('Client code runs after the resource starts.');
  expect(answer).not.toContain('@cybermp/client-types@2.7.1');
  expect(answer).not.toContain('emitServer(');
});
