#!/usr/bin/env node
/**
 * Ordered, resumable release for the public workspace packages.
 *
 * The workspace publishes exactly two packages, always in dependency order:
 * the bridge first, then the CLI that depends on it. A release tag (`v2.0.0`)
 * coordinates both. Each step is safe to rerun:
 *
 * - a version that already resolves with the same number is skipped;
 * - a missing version is published once and then polled until it resolves;
 * - any other registry answer (auth, permissions, server error, mismatched
 *   version) aborts the release instead of being treated as "published".
 *
 * The tarballs are built and verified once, then published as-is; publishing
 * the package directory would rerun prepack and replace the verified artifact.
 * `npm publish <tarball>` in the package directory keeps the working directory
 * and the publishConfig of that package while uploading the exact file.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REGISTRY = 'https://registry.npmjs.org';

/** Publish order: dependency first. */
export const PUBLIC_PACKAGES = [
  { name: '@cybermp-community/agent-kit-bridge', dir: 'packages/bridge' },
  { name: '@cybermp-community/agent-kit', dir: 'packages/agent-kit' },
];

/** Private workspace package: built in CI, never packed or published. */
export const PRIVATE_PACKAGE_DIR = 'resources/mcp-bridge';

export const POLL_ATTEMPTS = 30;
export const POLL_DELAY_MS = 5_000;

export class ReleaseError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ReleaseError';
  }
}

export function tarballName(name, version) {
  return `${name.replace(/^@/, '').replace(/\//g, '-')}-${version}.tgz`;
}

export function readPublicPackages(root) {
  return PUBLIC_PACKAGES.map(({ name, dir }) => {
    const manifestPath = path.join(root, dir, 'package.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (manifest.name !== name) {
      throw new ReleaseError(`${manifestPath} declares ${manifest.name}, expected ${name}`);
    }
    if (manifest.version === undefined || typeof manifest.version !== 'string') {
      throw new ReleaseError(`${manifestPath} has no version`);
    }
    if (manifest.private === true) {
      throw new ReleaseError(`${manifestPath} is private and cannot be published`);
    }
    return { name, version: manifest.version, dir, manifest };
  });
}

export function assertTagMatches(tag, packages) {
  if (!tag) throw new ReleaseError('A release tag such as v2.0.0 is required');
  const version = tag.startsWith('v') ? tag.slice(1) : tag;
  const versions = new Set(packages.map((pkg) => pkg.version));
  if (versions.size !== 1) {
    throw new ReleaseError(
      `Public packages must share one version, found ${[...versions].join(', ')}`,
    );
  }
  const [declared] = versions;
  if (declared !== version) {
    throw new ReleaseError(`Tag ${tag} does not match the manifest version ${declared}`);
  }
}

/**
 * Resolves the exact version against the registry.
 * @returns {Promise<'published'|'missing'>}
 * @throws {ReleaseError} for anything that is not 200 or 404.
 */
export async function registryState({
  name,
  version,
  registry = REGISTRY,
  fetchImpl = globalThis.fetch,
}) {
  const url = `${registry}/${encodeURIComponent(name)}/${encodeURIComponent(version)}`;
  let response;
  try {
    response = await fetchImpl(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw new ReleaseError(`Registry request for ${name}@${version} failed: ${error.message}`);
  }

  if (response.status === 404) return 'missing';
  if (!response.ok) {
    throw new ReleaseError(
      `Registry answered ${response.status} for ${name}@${version}; refusing to continue`,
    );
  }

  const document = await response.json();
  if (document?.version !== version) {
    throw new ReleaseError(
      `Registry returned ${document?.version ?? 'no version'} for ${name}@${version}`,
    );
  }
  return 'published';
}

export async function waitForPublished({
  name,
  version,
  registry = REGISTRY,
  fetchImpl,
  attempts = POLL_ATTEMPTS,
  delayMs = POLL_DELAY_MS,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  log = () => {},
}) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (await registryState({ name, version, registry, fetchImpl }) === 'published') {
      log(`${name}@${version} is visible in the registry`);
      return;
    }
    if (attempt < attempts) await sleep(delayMs);
  }
  throw new ReleaseError(
    `${name}@${version} did not become visible after ${attempts} registry checks`,
  );
}

/**
 * Publishes the missing packages in order and waits for each one to resolve
 * before moving on to its dependents.
 */
export async function releasePackages({
  packages,
  fetchImpl,
  publish,
  registry = REGISTRY,
  attempts = POLL_ATTEMPTS,
  delayMs = POLL_DELAY_MS,
  sleep,
  log = () => {},
}) {
  const results = [];
  for (const pkg of packages) {
    const state = await registryState({
      name: pkg.name, version: pkg.version, registry, fetchImpl,
    });
    if (state === 'published') {
      log(`Skipping ${pkg.name}@${pkg.version}: already published`);
      results.push({ name: pkg.name, version: pkg.version, action: 'skipped' });
      continue;
    }

    log(`Publishing ${pkg.name}@${pkg.version}`);
    await publish(pkg);
    await waitForPublished({
      name: pkg.name, version: pkg.version, registry, fetchImpl, attempts, delayMs, sleep, log,
    });
    results.push({ name: pkg.name, version: pkg.version, action: 'published' });
  }
  return results;
}

/** Command that uploads one verified tarball from inside its package directory. */
export function publishCommandFor({ dir, tarball, distTag = 'latest' }) {
  return {
    command: 'npm',
    args: ['publish', tarball, '--tag', distTag],
    cwd: dir,
  };
}

function tarList(file) {
  return execFileSync('tar', ['-tzf', file], { encoding: 'utf8' }).split('\n').filter(Boolean);
}

function tarRead(file, member) {
  return execFileSync('tar', ['-xOzf', file, member], { encoding: 'utf8' });
}

function readManifest(root) {
  return JSON.parse(fs.readFileSync(path.join(root, PRIVATE_PACKAGE_DIR, 'package.json'), 'utf8'));
}

/**
 * Verifies that the artifacts directory holds exactly the two public tarballs
 * and that their contents match what the release promises.
 */
export function verifyTarballs(root, artifactsDir) {
  const packages = readPublicPackages(root);
  const expected = packages.map((pkg) => tarballName(pkg.name, pkg.version));
  const actual = fs.readdirSync(artifactsDir).filter((file) => file.endsWith('.tgz')).sort();

  if (actual.length !== expected.length) {
    throw new ReleaseError(
      `Expected ${expected.length} tarballs (${expected.join(', ')}), found ${actual.length}: ${actual.join(', ')}`,
    );
  }
  for (const file of expected) {
    if (!actual.includes(file)) {
      throw new ReleaseError(`Missing expected tarball ${file}; found ${actual.join(', ')}`);
    }
  }

  const privateManifest = readManifest(root);
  if (privateManifest.private !== true) {
    throw new ReleaseError(`${PRIVATE_PACKAGE_DIR} must stay private`);
  }
  if (actual.some((file) => file.includes('bridge-resource'))) {
    throw new ReleaseError('The private resource package must never be packed for release');
  }

  for (const pkg of packages) {
    const file = path.join(artifactsDir, tarballName(pkg.name, pkg.version));
    const manifest = JSON.parse(tarRead(file, 'package/package.json'));
    if (manifest.name !== pkg.name || manifest.version !== pkg.version) {
      throw new ReleaseError(
        `${path.basename(file)} contains ${manifest.name}@${manifest.version}, expected ${pkg.name}@${pkg.version}`,
      );
    }
    if (manifest.license !== 'MIT') {
      throw new ReleaseError(`${pkg.name}@${pkg.version} must be MIT, found ${manifest.license}`);
    }
    if (JSON.stringify(manifest.dependencies ?? {}).includes('workspace:')) {
      throw new ReleaseError(`${pkg.name}@${pkg.version} still depends on a workspace: specifier`);
    }

    const entries = tarList(file);
    if (!entries.includes('package/LICENSE')) {
      throw new ReleaseError(`${pkg.name}@${pkg.version} does not ship LICENSE`);
    }

    if (pkg.name.endsWith('-bridge')) {
      for (const entry of ['package/dist/index.js', 'package/dist/index.d.ts']) {
        if (!entries.includes(entry)) {
          throw new ReleaseError(`${pkg.name}@${pkg.version} is missing ${entry}`);
        }
      }
      continue;
    }

    for (const entry of ['package/dist/bin/cli.js', 'package/resources/mcp-bridge/package.json']) {
      if (!entries.includes(entry)) {
        throw new ReleaseError(`${pkg.name}@${pkg.version} is missing ${entry}`);
      }
    }
    if (entries.some((entry) => entry.startsWith('package/resources/mcp-bridge/node_modules/'))) {
      throw new ReleaseError(`${pkg.name}@${pkg.version} stages resource node_modules`);
    }
    const staged = JSON.parse(tarRead(file, 'package/resources/mcp-bridge/package.json'));
    const bridge = packages.find((candidate) => candidate.name.endsWith('-bridge'));
    if (staged.dependencies?.[bridge.name] !== bridge.version) {
      throw new ReleaseError(
        `Staged resource pins ${staged.dependencies?.[bridge.name]}, expected ${bridge.version}`,
      );
    }
  }

  return { artifacts: expected.map((file) => path.join(artifactsDir, file)), packages };
}

function flag(args, name, fallback) {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
}

async function main(argv) {
  const [command, ...args] = argv;
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const packages = readPublicPackages(root);

  if (command === 'check-tag') {
    const tag = flag(args, 'tag', process.env.RELEASE_TAG);
    assertTagMatches(tag, packages);
    console.log(`Tag ${tag} matches ${packages[0].version}`);
    return;
  }

  if (command === 'verify') {
    const { artifacts } = verifyTarballs(root, path.resolve(flag(args, 'artifacts', 'artifacts')));
    console.log(`Verified ${artifacts.length} release tarballs: ${artifacts.map((file) => path.basename(file)).join(', ')}`);
    return;
  }

  if (command === 'publish') {
    const artifactsDir = path.resolve(flag(args, 'artifacts', 'artifacts'));
    const distTag = flag(args, 'dist-tag', 'latest');
    const registry = flag(args, 'registry', REGISTRY);
    verifyTarballs(root, artifactsDir);
    const results = await releasePackages({
      packages,
      registry,
      log: (message) => console.log(message),
      publish: (pkg) => {
        const { command: executable, args: publishArgs, cwd } = publishCommandFor({
          dir: path.join(root, pkg.dir),
          tarball: path.join(artifactsDir, tarballName(pkg.name, pkg.version)),
          distTag,
        });
        execFileSync(executable, publishArgs, {
          cwd,
          stdio: 'inherit',
          env: { ...process.env, npm_config_registry: registry },
        });
      },
    });
    for (const result of results) console.log(`${result.action}: ${result.name}@${result.version}`);
    return;
  }

  throw new ReleaseError(`Unknown command: ${command ?? '(none)'}; use check-tag, verify or publish`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof ReleaseError ? `release: ${error.message}` : error);
    process.exitCode = 1;
  });
}
