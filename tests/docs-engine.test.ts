import { describe, it, expect } from 'vitest';
import { searchDocs } from '../src/engine/docs-engine.js';

describe('Granular Docs Search Engine', () => {
  it('returns section-level match with heading anchor and relevant code snippet for "burning"', () => {
    const result = searchDocs('burning', 3);
    expect(result.results.length).toBeGreaterThan(0);
    const burningMatch = result.results.find((r) => r.slug.includes('player-mechanics') || r.plainText.includes('Burning'));
    expect(burningMatch).toBeDefined();
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
