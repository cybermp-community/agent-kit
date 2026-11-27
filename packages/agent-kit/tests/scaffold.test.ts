import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import packageJson from '../package.json';

describe('Project Scaffold', () => {
  it('has valid package metadata and required dependencies', () => {
    expect(packageJson.name).toBe('@cybermp-community/agent-kit');
    expect(packageJson.version).toBe('2.0.0');
    expect(packageJson.license).toBe('MIT');
    expect(packageJson.bin).toHaveProperty('cybermp-agent-kit');
    expect(packageJson.dependencies).toHaveProperty('@modelcontextprotocol/sdk');
    expect(packageJson.devDependencies).toHaveProperty('ts-morph');
    expect(packageJson.devDependencies).toHaveProperty('@cybermp/server-types');
  });

  it('ships MIT for its own code and keeps third-party notices', () => {
    const root = path.resolve(__dirname, '../../..');
    for (const licensePath of [
      path.join(root, 'LICENSE'),
      path.join(root, 'packages/agent-kit/LICENSE'),
      path.join(root, 'packages/bridge/LICENSE'),
    ]) {
      const text = fs.readFileSync(licensePath, 'utf8');
      expect(text, licensePath).toContain('MIT License');
      expect(text, licensePath).toContain('Copyright (c) 2026 Nikita Kudiyarov and contributors');
    }

    const bridge = JSON.parse(
      fs.readFileSync(path.join(root, 'packages/bridge/package.json'), 'utf8'),
    );
    expect(bridge.name).toBe('@cybermp-community/agent-kit-bridge');
    expect(bridge.version).toBe(packageJson.version);
    expect(bridge.license).toBe('MIT');

    const resource = JSON.parse(
      fs.readFileSync(path.join(root, 'resources/mcp-bridge/package.json'), 'utf8'),
    );
    expect(resource.name).toBe('@cybermp-community/agent-kit-bridge-resource');
    expect(resource.private).toBe(true);
    expect(resource.license).toBe('MIT');
    expect(resource.dependencies).toHaveProperty('@cybermp-community/agent-kit-bridge');
    expect(resource.dependencies).not.toHaveProperty('cybermp-agent-kit-bridge');

    for (const notice of ['data/LICENSE-cybermp-client-types', 'data/LICENSE-ink-minimap']) {
      expect(fs.existsSync(path.join(root, 'packages/agent-kit', notice)), notice).toBe(true);
    }
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
