import { describe, it, expect } from 'vitest';
import packageJson from '../package.json';

describe('Project Scaffold', () => {
  it('has valid package metadata and required dependencies', () => {
    expect(packageJson.name).toBe('cybermp-agent-kit');
    expect(packageJson.bin).toHaveProperty('cybermp-agent-kit');
    expect(packageJson.dependencies).toHaveProperty('@modelcontextprotocol/sdk');
    expect(packageJson.devDependencies).toHaveProperty('ts-morph');
    expect(packageJson.devDependencies).toHaveProperty('@cybermp/server-types');
  });
});
