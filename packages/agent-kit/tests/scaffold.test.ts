import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import packageJson from '../package.json';

describe('Project Scaffold', () => {
  it('has valid package metadata and required dependencies', () => {
    expect(packageJson.name).toBe('cybermp-agent-kit');
    expect(packageJson.license).toBe('GPL-3.0-or-later');
    expect(packageJson.bin).toHaveProperty('cybermp-agent-kit');
    expect(packageJson.dependencies).toHaveProperty('@modelcontextprotocol/sdk');
    expect(packageJson.devDependencies).toHaveProperty('ts-morph');
    expect(packageJson.devDependencies).toHaveProperty('@cybermp/server-types');
  });

  it('lives in a private workspace whose root only orchestrates checks', () => {
    const root = path.resolve(__dirname, '../../..');
    const workspace = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    expect(workspace.private).toBe(true);
    expect(workspace.name).not.toBe(packageJson.name);
    expect(workspace.dependencies ?? {}).toEqual({});
    expect(workspace.devDependencies ?? {}).toEqual({});
    expect(workspace.scripts.test).toContain('test:agent-kit');
    expect(workspace.scripts.build).toContain('build:agent-kit');
  });
});
