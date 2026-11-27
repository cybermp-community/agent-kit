import { describe, expect, it } from 'vitest';
import { searchDocs } from '../src/engine/docs-engine.js';

describe('INK knowledge discovery', () => {
  it.each([
    ['виджет', 'references/ink-widgets'],
    ['inkCircleWidget', 'references/ink-widgets#color-and-geometric-primitives'],
    ['inkCanvasWidget', 'references/ink-widgets#compose-shapes-through-canvases'],
  ])('routes the general widget query %s independently of the minimap', (query, slug) => {
    expect(searchDocs(query, 1).results[0]?.slug).toBe(slug);
  });

  it('finds general attachment guidance without requiring a minimap query', () => {
    const { results, formattedText } = searchDocs('Reparent', 1);
    expect(results[0]?.slug).toBe('references/ink-widgets#attachment-and-transform-order');
    expect(formattedText).toContain('after attachment');
    expect(formattedText).toContain('Runtime behavior requires separate evidence');
  });

  it('finds widget reuse independently of minimap projection', () => {
    const { results, formattedText } = searchDocs('widget pooling', 1);
    expect(results[0]?.slug).toBe('references/ink-widgets#pooling-and-creation-budgets');
    expect(formattedText).toContain('not an engine limit');
  });

  it('keeps projection assumptions with the minimap recipe', () => {
    const { results, formattedText } = searchDocs('minimap projection', 1);
    expect(results[0]?.slug).toBe('references/recipes/minimap-projection#coordinate-transform');
    expect(formattedText).toContain('measured');
    expect(formattedText).toContain('T.x = -s * playerY');
    expect(formattedText).toContain('not universal minimap constants');
  });

  it('returns the delayed-read warning alongside widget verification advice', () => {
    const { results, formattedText } = searchDocs('widget readback', 1);
    expect(results[0]?.slug).toBe('references/ink-widgets#delayed-readback-and-recovery');
    expect(formattedText).toContain('does not prove visible rendering');
    expect(formattedText).toContain('history');
  });
});
