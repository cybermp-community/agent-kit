#!/usr/bin/env node
/**
 * Stages the CyberMP resource template inside the published CLI package.
 *
 * `resources/mcp-bridge` is a private workspace package that depends on the
 * local bridge through `workspace:*`. A published tarball cannot contain a
 * workspace protocol, so this copies the template into the CLI package and
 * pins the bridge to the exact version being released. Build output and
 * installed dependencies are never copied.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.resolve(packageRoot, '../../resources/mcp-bridge');
const destination = path.join(packageRoot, 'resources/mcp-bridge');
const bridgeManifestPath = path.resolve(packageRoot, '../bridge/package.json');

if (!fs.existsSync(source)) {
  throw new Error(`Resource template not found at ${source}`);
}

const bridge = JSON.parse(fs.readFileSync(bridgeManifestPath, 'utf8')) as {
  name: string;
  version: string;
};

fs.rmSync(destination, { recursive: true, force: true });
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.cpSync(source, destination, {
  recursive: true,
  filter: (file) => !/(^|[\\/])(node_modules|dist|server)([\\/]|$)/.test(path.relative(source, file)),
});

const manifestPath = path.join(destination, 'package.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
  dependencies?: Record<string, string>;
};

manifest.dependencies ??= {};
for (const [name, specifier] of Object.entries(manifest.dependencies)) {
  if (specifier.startsWith('workspace:')) {
    delete manifest.dependencies[name];
  }
}
manifest.dependencies[bridge.name] = bridge.version;

fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const serialized = fs.readFileSync(manifestPath, 'utf8');
if (serialized.includes('workspace:')) {
  throw new Error('Staged resource manifest still contains a workspace: dependency');
}

console.log(
  `Staged resources/mcp-bridge with ${bridge.name}@${bridge.version} in ${path.relative(process.cwd(), destination)}`,
);
