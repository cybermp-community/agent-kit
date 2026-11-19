import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function getFiles(dir: string, exts: string[], files: string[] = []): string[] {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (
        !full.includes('node_modules') &&
        !full.includes('.git') &&
        !full.includes('/dist/assets') &&
        !full.includes('/browser/dist')
      ) {
        getFiles(full, exts, files);
      }
    } else if (exts.some((ext) => entry.name.endsWith(ext))) {
      files.push(full);
    }
  }
  return files;
}

describe('Deterministic Codebase & Symbol Coverage Audit', () => {
  const freeroamPath = '/Users/user/cybermp-freeroam';
  const referencesDir = path.resolve(__dirname, '../skills/cybermp-dev/references');

  it('verifies 100% of mp.* calls and events in freeroam are documented in references', () => {
    if (!fs.existsSync(freeroamPath)) {
      console.warn(`Freeroam path ${freeroamPath} not found, skipping local coverage test.`);
      return;
    }

    const codeFiles = getFiles(freeroamPath, ['.ts', '.js']);
    expect(codeFiles.length).toBeGreaterThan(0);

    const mpCalls = new Set<string>();
    const eventNames = new Set<string>();

    const mpRegex = /\bmp(?:\.[a-zA-Z0-9_]+)+/g;
    const eventRegex =
      /(?:events\.on(?:Client|Server|Cef)?|mp\.events\.on|cybermp\.events\.on)\(\s*['"]([^'"]+)['"]/g;

    for (const file of codeFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      let match: RegExpExecArray | null;
      while ((match = mpRegex.exec(content)) !== null) {
        // filter out file extensions like mp.webp or mp.js
        if (!match[0].endsWith('.webp') && !match[0].endsWith('.js') && !match[0].endsWith('.ts')) {
          mpCalls.add(match[0]);
        }
      }
      while ((match = eventRegex.exec(content)) !== null) {
        eventNames.add(match[1]);
      }
    }

    const docFiles = getFiles(referencesDir, ['.md']);
    expect(docFiles.length).toBeGreaterThan(0);
    const docContent = docFiles.map((f) => fs.readFileSync(f, 'utf-8')).join('\n');

    const missingCalls: string[] = [];
    for (const call of [...mpCalls].sort()) {
      const parts = call.split('.');
      const lastPart = parts[parts.length - 1];
      if (!docContent.includes(lastPart)) {
        missingCalls.push(call);
      }
    }

    const missingEvents: string[] = [];
    for (const ev of [...eventNames].sort()) {
      if (!docContent.includes(ev)) {
        missingEvents.push(ev);
      }
    }

    expect(
      missingCalls,
      `The following mp.* calls from cybermp-freeroam are missing from references:\n${missingCalls.join('\n')}`,
    ).toEqual([]);

    expect(
      missingEvents,
      `The following registered events from cybermp-freeroam are missing from references:\n${missingEvents.join('\n')}`,
    ).toEqual([]);
  });
});
