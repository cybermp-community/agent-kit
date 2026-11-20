import { describe, it, expect } from 'vitest';
import { lookupTweakDb } from '../src/engine/tweakdb-engine.js';

describe('TweakDB Lookup Engine', () => {
  it('returns status effects when queried for burning or category status_effects', () => {
    const result = lookupTweakDb('burning', 'status_effects');
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results[0].id).toBe('BaseStatusEffect.Burning');
    expect(result.formattedText).toContain('BaseStatusEffect.Burning');
  });

  it('filters by category for armed vehicles', () => {
    const result = lookupTweakDb('', 'vehicles');
    expect(result.results.length).toBeGreaterThan(0);
    const hasHellhoundOrQuadra = result.results.some((r) => r.id.includes('v_sport') || r.id.includes('v_utility'));
    expect(hasHellhoundOrQuadra).toBe(true);
  });

  it('handles empty or non-existent queries gracefully', () => {
    const emptyResult = lookupTweakDb('non_existent_xyz_123');
    expect(emptyResult.results).toHaveLength(0);
    expect(emptyResult.formattedText).toContain('No TweakDB records found');
  });

  it('searches across all categories when category is all or omitted', () => {
    const result = lookupTweakDb('katana');
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results[0].id).toContain('Preset_Katana');
  });

  it('finds quickhacks, workspots, and clothing by category and query', () => {
    const quickhacks = lookupTweakDb('suicide', 'quickhacks');
    expect(quickhacks.results.length).toBeGreaterThan(0);
    expect(quickhacks.results[0].id).toBe('Items.SuicideLvl4Program');

    const workspots = lookupTweakDb('chair', 'workspots');
    expect(workspots.results.length).toBeGreaterThan(0);
    expect(workspots.results[0].id).toBe('Workspot.SitChair');

    const clothing = lookupTweakDb('coat', 'clothing');
    expect(clothing.results.length).toBeGreaterThan(0);
    expect(clothing.results[0].id).toBe('Items.Coat_01_basic_01');
  });

  it('respects limit and clamps between 1 and 50', () => {
    const limited = lookupTweakDb('', 'all', 2);
    expect(limited.results).toHaveLength(2);

    const clampedMax = lookupTweakDb('', 'all', 100);
    expect(clampedMax.results.length).toBeLessThanOrEqual(50);
  });

  it('reports evidence per identifier without treating mentions as runtime verification', () => {
    const burning = lookupTweakDb('BaseStatusEffect.Burning');
    expect(burning.formattedText).toContain('ID found in source');
    expect(burning.formattedText).toContain('tweakdb-BaseStatusEffect.txt');
    expect(burning.formattedText).toContain('Runtime behavior is unverified');

    const workspot = lookupTweakDb('Workspot.SitChair');
    expect(workspot.formattedText).toContain('Unconfirmed ID');
    expect(workspot.formattedText).not.toContain('ID found in source');
  });

  it('keeps a suspect ID searchable and labels the alternative as a candidate', () => {
    const result = lookupTweakDb('v_sport2_porsche_911_turbo_player');
    expect(result.results[0]?.id).toBe('Vehicle.v_sport2_porsche_911_turbo_player');
    expect(result.formattedText).toContain('ID needs recheck');
    expect(result.formattedText).toContain('Candidate: `Vehicle.v_sport2_porsche_911turbo_player`');
  });
});
