import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, it, expect } from 'vitest';
import { eventReferenceWithCatalog } from '../scripts/event-reference.js';
import type { Project } from 'ts-morph';
import {
  createAstProject,
  parseEventsFromAst,
  parseTypesFromAst,
  parseGuides,
  buildIndex,
} from '../scripts/build-index';

describe('AST Type Indexer', () => {
  let project: Project;

  beforeAll(() => {
    project = createAstProject();
  });

  it('keeps the checked-in event catalog synchronized with the installed declarations', () => {
    const source = fs.readFileSync('skills/cybermp-dev/references/events.md', 'utf8');
    expect(eventReferenceWithCatalog(source, parseEventsFromAst({ project }))).toBe(source);
  });

  it('extracts server damage events and types correctly', () => {
    const events = parseEventsFromAst({ project });
    expect(events.length).toBeGreaterThan(0);
    const damageEvent = events.find((e) => e.name === 'playerDamage' || e.name === 'damage');
    expect(damageEvent).toBeDefined();
    expect(damageEvent?.env).toBe('server');
    expect(damageEvent?.parameters.length).toBeGreaterThan(0);

    const types = parseTypesFromAst({ project });
    const playerType = types.find((t) => t.name === 'MpPlayer');
    expect(playerType).toBeDefined();
    expect(playerType?.methods.some((m) => m.name === 'kick')).toBe(true);
    expect(playerType?.methods.some((m) => m.name === 'setMeta')).toBe(true);
    expect(playerType?.properties.length).toBeGreaterThan(0);
  });

  it('extracts client events including CEF and stream events', () => {
    const events = parseEventsFromAst({ project });
    const clientEvents = events.filter((e) => e.env === 'client');
    expect(clientEvents.length).toBeGreaterThan(0);

    const domReady = clientEvents.find((e) => e.name === 'domReady');
    expect(domReady).toBeDefined();
    expect(domReady?.env).toBe('client');

    const streamIn = clientEvents.find((e) => e.name === 'vehicleStreamIn');
    expect(streamIn).toBeDefined();
    expect(streamIn?.env).toBe('client');
  });

  it('extracts browser events from MpEvents', () => {
    const events = parseEventsFromAst({ project });
    const browserEvents = events.filter((e) => e.env === 'browser');
    expect(browserEvents.length).toBeGreaterThan(0);
    expect(browserEvents.some((e) => e.name === 'on')).toBe(true);
    expect(browserEvents.some((e) => e.name === 'emit')).toBe(true);
  });

  it('extracts server entities, enums, and types', () => {
    const types = parseTypesFromAst({ project });
    const entityTypeEnum = types.find((t) => t.name === 'EntityType');
    expect(entityTypeEnum).toBeDefined();
    expect(entityTypeEnum?.kind).toBe('enum');
    expect(entityTypeEnum?.enumMembers?.some((m) => m.name === 'Player')).toBe(true);

    const vehicleType = types.find((t) => t.name === 'MpVehicle');
    expect(vehicleType).toBeDefined();

    const entityType = types.find((t) => t.name === 'MpEntity');
    expect(entityType).toBeDefined();
    expect(entityType?.methods.some((m) => m.name === 'setMeta')).toBe(true);
  });

  it('extracts exported classes from client types', () => {
    const types = parseTypesFromAst({ project });
    const mpSystem = types.find((t) => t.name === 'MultiplayerSystem');
    expect(mpSystem).toBeDefined();
    expect(mpSystem?.kind).toBe('class');
    expect(mpSystem?.env).toBe('client');
    expect(mpSystem?.methods.some((m) => m.name === 'SetDefaultSpawnPosition')).toBe(true);

    const loadingSystem = types.find((t) => t.name === 'LoadingScreenSystem');
    expect(loadingSystem).toBeDefined();
    expect(loadingSystem?.kind).toBe('class');
    expect(loadingSystem?.methods.some((m) => m.name === 'GetLoadingScreenState')).toBe(true);
  });

  it('parses guides with code snippets and metadata', () => {
    const guides = parseGuides();
    expect(guides.length).toBeGreaterThan(0);

    const guide = guides.find((g) => g.codeSnippets.length > 0)!;
    expect(guide).toBeDefined();
    expect(guide.title.length).toBeGreaterThan(0);
    expect(guide.url.length).toBeGreaterThan(0);
    expect(guide.codeSnippets.length).toBeGreaterThan(0);
    expect(guide.plainText.length).toBeGreaterThan(0);
  });

  it('indexes skills/cybermp-dev/references markdown guides alongside external docs', () => {
    const guides = parseGuides();
    const refGuides = guides.filter((g) => g.slug.startsWith('references/'));
    expect(refGuides.length).toBeGreaterThanOrEqual(8);
    expect(refGuides.some((g) => g.title.includes('Vehicles & Physics'))).toBe(true);
    expect(refGuides.some((g) => g.title.includes('Player Mechanics'))).toBe(true);
  });

  it('gracefully indexes skills references when docsDir does not exist', () => {
    const nonexistentDocsDir = path.resolve('tmp/nonexistent-docs-dir-xyz');
    const guides = parseGuides(nonexistentDocsDir);
    expect(guides.length).toBeGreaterThanOrEqual(8);
    expect(guides.every((g) => g.slug.startsWith('references/'))).toBe(true);
  });

  it('throws an error if both docsDir and referencesDir do not exist', () => {
    const nonexistentDocsDir = path.resolve('tmp/nonexistent-docs-dir-xyz');
    const nonexistentProjectRoot = path.resolve('tmp/nonexistent-project-root-xyz');
    expect(() => parseGuides(nonexistentDocsDir, nonexistentProjectRoot)).toThrow(
      /Docs directory does not exist/,
    );
  });

  it('buildIndex generates valid JSON files', async () => {
    const tempOutDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cybermp-build-index-'));
    try {
      const result = await buildIndex({ project, outDir: tempOutDir });
      expect(result.eventsCount).toBeGreaterThan(0);
      expect(result.typesCount).toBeGreaterThan(0);
      expect(result.guidesCount).toBeGreaterThan(0);

      const eventsPath = path.join(tempOutDir, 'events.json');
      const typesPath = path.join(tempOutDir, 'types.json');
      const guidesPath = path.join(tempOutDir, 'guides.json');

      expect(fs.existsSync(eventsPath)).toBe(true);
      expect(fs.existsSync(typesPath)).toBe(true);
      expect(fs.existsSync(guidesPath)).toBe(true);

      const eventsJson = JSON.parse(fs.readFileSync(eventsPath, 'utf-8'));
      const typesJson = JSON.parse(fs.readFileSync(typesPath, 'utf-8'));
      const guidesJson = JSON.parse(fs.readFileSync(guidesPath, 'utf-8'));

      expect(Array.isArray(eventsJson)).toBe(true);
      expect(Array.isArray(typesJson)).toBe(true);
      expect(Array.isArray(guidesJson)).toBe(true);

      expect(eventsJson.length).toBe(result.eventsCount);
      expect(typesJson.length).toBe(result.typesCount);
      expect(guidesJson.length).toBe(result.guidesCount);

      // Verify total size < 700 KB budget
      const totalSize =
        fs.statSync(eventsPath).size +
        fs.statSync(typesPath).size +
        fs.statSync(guidesPath).size;
      expect(totalSize).toBeLessThan(700 * 1024);
    } finally {
      fs.rmSync(tempOutDir, { recursive: true, force: true });
    }
  });
});
