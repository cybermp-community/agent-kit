import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  bridgePort,
  DEFAULT_START_DELAY_MS,
  loadConfig,
  parseEnv,
  startDelayMs,
} from '../../../resources/mcp-bridge/src/env.ts';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'cybermp-bridge-env-'));

afterAll(() => fs.rmSync(temp, { recursive: true, force: true }));

describe('mcp-bridge resource settings', () => {
  it('parses .env lines, quotes and comments', () => {
    expect(
      parseEnv('# comment\nDEVTOOLS_TOKEN = "abc"\r\nDEVTOOLS_PORT=2081\nEMPTY=\n  SPACED =  x y  \nnot a line\n'),
    ).toEqual({ DEVTOOLS_TOKEN: 'abc', DEVTOOLS_PORT: '2081', EMPTY: '', SPACED: 'x y' });
  });

  it('does not let an empty value take the next line', () => {
    expect(parseEnv('DEVTOOLS_TOKEN=\nOTHER=1\n')).toEqual({ DEVTOOLS_TOKEN: '', OTHER: '1' });
  });

  it('lets the environment win, and the first file with a key win over later ones', () => {
    const first = path.join(temp, 'first.env');
    const second = path.join(temp, 'second.env');

    fs.writeFileSync(first, 'A=from-first\n');
    fs.writeFileSync(second, 'A=from-second\nB=from-second\nC=from-second\n');

    expect(
      loadConfig({ paths: [first, path.join(temp, 'missing.env'), second], env: { C: 'from-env' } }),
    ).toEqual({ A: 'from-first', B: 'from-second', C: 'from-env' });
  });

  it.each([
    [undefined, DEFAULT_START_DELAY_MS],
    ['', DEFAULT_START_DELAY_MS],
    ['0', 0],
    [' 5000 ', 5000],
    ['-1', DEFAULT_START_DELAY_MS],
    ['soon', DEFAULT_START_DELAY_MS],
  ])('DEVTOOLS_START_DELAY_MS=%j gives %d', (value, expected) => {
    expect(startDelayMs({ DEVTOOLS_START_DELAY_MS: value })).toBe(expected);
  });

  it.each([
    [undefined, undefined],
    ['', undefined],
    ['2081', 2081],
    ['0', Number.NaN],
    ['-1', Number.NaN],
    ['70000', Number.NaN],
    ['20x', Number.NaN],
  ])('DEVTOOLS_PORT=%j gives %s', (value, expected) => {
    expect(bridgePort({ DEVTOOLS_PORT: value })).toBe(expected);
  });
});
