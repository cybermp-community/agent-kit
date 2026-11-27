import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import YAML from 'yaml';
import {
  PUBLIC_PACKAGES,
  ReleaseError,
  resolveDistTag,
  assertTagMatches,
  readPublicPackages,
  publishCommandFor,
  releasePackages,
  tarballName,
  verifyTarballs,
} from '../../../scripts/release.mjs';

const rootDir = path.resolve(__dirname, '../../..');
const workflowsDir = path.join(rootDir, '.github', 'workflows');
const testWorkflowPath = path.join(workflowsDir, 'test.yml');
const autoUpdateWorkflowPath = path.join(workflowsDir, 'auto-update.yml');
const releaseWorkflowPath = path.join(workflowsDir, 'release.yml');

const parseWorkflow = (file: string) => YAML.parse(fs.readFileSync(file, 'utf-8'));
// YAML 1.2 keeps `on` as a string; older schemas may fold it into `true`.
const triggersOf = (doc: any) => doc.on ?? doc.true;
const stepsOf = (job: any) => (job.steps ?? []) as any[];
const runText = (job: any) => stepsOf(job).map((step) => step.run ?? '').join('\n');
const usesText = (job: any) => stepsOf(job).map((step) => step.uses ?? '').join('\n');
const jobNamed = (doc: any, fragment: string) => {
  const entry = Object.entries(doc.jobs).find(([key, job]: [string, any]) =>
    key === fragment || job.name?.toLowerCase().includes(fragment.toLowerCase()));
  expect(entry, `job ${fragment} must exist`).toBeDefined();
  return (entry as [string, any])[1];
};

function compareVersions(a: number[], b: number[]) {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

/**
 * Minimal check for the engine ranges used by the build toolchain. A bare
 * major (`22`) resolves to the newest release of that line, so it is compared
 * as the top of the range rather than as x.0.0.
 */
function satisfiesEngines(version: string, engines: string) {
  const parts = version.split('.').map(Number);
  const target = parts.length < 2 ? [parts[0], 99, 99] : [parts[0], parts[1] ?? 0, parts[2] ?? 0];
  return engines.split('||').some((raw) => {
    const match = /^\s*(\^|>=)?\s*(\d+)(?:\.(\d+))?(?:\.(\d+))?\s*$/.exec(raw);
    if (!match) throw new Error(`Unsupported engine range: ${raw}`);
    const min = [Number(match[2]), Number(match[3] ?? 0), Number(match[4] ?? 0)];
    if (match[1] === '^') return target[0] === min[0] && compareVersions(target, min) >= 0;
    return compareVersions(target, min) >= 0;
  });
}

function findTsdownEngines(): string {
  const candidates = [
    path.join(rootDir, 'resources/mcp-bridge/node_modules/tsdown/package.json'),
    ...fs.readdirSync(path.join(rootDir, 'node_modules/.pnpm'))
      .filter((entry) => entry.startsWith('tsdown@'))
      .map((entry) => path.join(rootDir, 'node_modules/.pnpm', entry, 'node_modules/tsdown/package.json')),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return JSON.parse(fs.readFileSync(candidate, 'utf8')).engines.node;
  }
  throw new Error('tsdown must be installed to confirm the resource toolchain Node version');
}

type RegistryAnswer = 'published' | 'missing' | { status: number; version?: string };

/** Registry stub that records every probe so order can be asserted. */
function fakeRegistry(answers: Record<string, RegistryAnswer>, timeline: string[]) {
  return async (url: string) => {
    // https://registry.npmjs.org/@scope/name/2.0.0 -> @scope/name@2.0.0
    const [, name, version] = /^[a-z]+:\/\/[^/]+\/(.+)\/([^/]+)$/.exec(decodeURIComponent(url)) ?? [];
    const key = `${name}@${version}`;
    if (!(key in answers)) throw new Error(`Unexpected registry request: ${decodeURIComponent(url)}`);
    timeline.push(`probe:${key}`);
    const answer = answers[key];
    if (answer === 'missing') return { ok: false, status: 404, json: async () => ({}) };
    if (answer === 'published') {
      const version = key.slice(key.lastIndexOf('@') + 1);
      return { ok: true, status: 200, json: async () => ({ version }) };
    }
    return {
      ok: answer.status === 200,
      status: answer.status,
      json: async () => ({ version: answer.version }),
    };
  };
}

describe('GitHub Actions Workflows', () => {
  it('keeps all three workflow files in .github/workflows/', () => {
    for (const file of [testWorkflowPath, autoUpdateWorkflowPath, releaseWorkflowPath]) {
      expect(fs.existsSync(file), `${path.basename(file)} must exist`).toBe(true);
      expect(parseWorkflow(file).name).toBeTypeOf('string');
    }
  });

  it('publishes with the supported Node floor and does not test end-of-life versions', () => {
    const manifests = [
      path.join(rootDir, 'package.json'),
      path.join(rootDir, 'packages/agent-kit/package.json'),
      path.join(rootDir, 'packages/bridge/package.json'),
    ];
    for (const manifest of manifests) {
      const engines = JSON.parse(fs.readFileSync(manifest, 'utf8')).engines?.node;
      expect(engines, `${manifest} must declare its Node floor`).toBe('>=22.0.0');
    }

    const readme = fs.readFileSync(path.join(rootDir, 'README.md'), 'utf8');
    expect(readme).toContain('Node.js 22 or newer is required.');
    expect(readme).toContain('Node.js-%3E%3D22');
    expect(readme).not.toContain('%3E%3D20');
  });

  it('pins one pnpm major through packageManager instead of per-workflow versions', () => {
    const rootManifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
    expect(rootManifest.packageManager, 'packageManager must pin the CI pnpm major').toMatch(/^pnpm@10\./);

    for (const file of [testWorkflowPath, autoUpdateWorkflowPath, releaseWorkflowPath]) {
      const doc = parseWorkflow(file);
      for (const job of Object.values(doc.jobs) as any[]) {
        const setup = stepsOf(job).find((step) => step.uses?.startsWith('pnpm/action-setup'));
        expect(setup, `${path.basename(file)} must set up pnpm`).toBeDefined();
        expect(setup.with?.version, `${path.basename(file)} must not duplicate the pnpm pin`)
          .toBeUndefined();
      }
    }
  });
});

describe('test.yml Configuration', () => {
  it('runs on pushes to main and pull requests', () => {
    const doc = parseWorkflow(testWorkflowPath);
    const on = triggersOf(doc);
    expect(on.push.branches).toContain('main');
    expect(on.pull_request).toBeDefined();
  });

  it('tests and packs the public packages on Node 22 and Node 26', () => {
    const doc = parseWorkflow(testWorkflowPath);
    const job = jobNamed(doc, 'public');
    expect(job['runs-on']).toContain('ubuntu-latest');
    const versions = job.strategy?.matrix?.['node-version'];
    expect(versions.map(String)).toEqual(['22', '26']);

    const runs = runText(job);
    expect(runs).toContain('pnpm install --frozen-lockfile');
    expect(runs).toMatch(/pnpm test/);
    expect(runs).toContain('pnpm --dir packages/bridge run build');
    expect(runs).toContain('pnpm --dir packages/agent-kit run build');
    expect(runs).toContain('pnpm run check:examples');
    expect(runs).toContain('pnpm run test:packed');

    // The resource has its own toolchain and its own job.
    expect(runs).not.toMatch(/build:resource|resources\/mcp-bridge/);
    expect(usesText(job)).toContain('actions/checkout');
    expect(usesText(job)).toContain('pnpm/action-setup');
  });

  it('builds the private resource on a Node that satisfies tsdown engines', () => {
    const doc = parseWorkflow(testWorkflowPath);
    const job = jobNamed(doc, 'resource');
    const versions = job.strategy?.matrix?.['node-version'];
    expect(Array.isArray(versions) && versions.length).toBeTruthy();

    const engines = findTsdownEngines();
    for (const version of versions) {
      expect(satisfiesEngines(String(version), engines),
        `resource job Node ${version} must satisfy tsdown engines ${engines}`).toBe(true);
    }

    const runs = runText(job);
    expect(runs).toContain('pnpm install --frozen-lockfile');
    expect(runs).toContain('pnpm --dir packages/bridge run build');
    expect(runs).toMatch(/pnpm run build:resource/);
    expect(runs).toContain('resources/mcp-bridge/server/dist/index.js');
    expect(runs).not.toMatch(/test:packed|check:examples/);
  });

  it('keeps the public matrix and the resource job separate', () => {
    const doc = parseWorkflow(testWorkflowPath);
    const publicJob = jobNamed(doc, 'public');
    const resourceJob = jobNamed(doc, 'resource');
    expect(publicJob).not.toBe(resourceJob);
    expect(runText(publicJob)).not.toMatch(/tsdown|build:resource/);
  });
});

describe('auto-update.yml Configuration', () => {
  it('triggers weekly and on demand with PR permissions', () => {
    const doc = parseWorkflow(autoUpdateWorkflowPath);
    const on = triggersOf(doc);
    expect(on.schedule[0].cron).toBeDefined();
    expect(on.workflow_dispatch).toBeDefined();
    expect(doc.permissions.contents).toBe('write');
    expect(doc.permissions['pull-requests']).toBe('write');
  });

  it('updates the CLI package where the type devDependencies live', () => {
    const doc = parseWorkflow(autoUpdateWorkflowPath);
    const job = jobNamed(doc, 'auto-update');
    const runs = runText(job);

    // The root manifest has no dependencies, so a root-level update is a no-op.
    expect(runs).toMatch(/pnpm --dir packages\/agent-kit update @cybermp\/server-types/);
    for (const name of ['@cybermp/server-types', '@cybermp/client-types', '@cybermp/browser-types']) {
      expect(runs).toContain(name);
    }
    expect(runs).not.toMatch(/^\s*pnpm update /m);
  });

  it('verifies the lockfile, regenerated paths and the build before opening a PR', () => {
    const doc = parseWorkflow(autoUpdateWorkflowPath);
    const job = jobNamed(doc, 'auto-update');
    const runs = runText(job);

    expect(runs).toMatch(/pnpm install --frozen-lockfile/);
    expect(runs).toMatch(/pnpm run sync:docs/);
    expect(runs).toMatch(/pnpm run build:index/);
    expect(runs).toMatch(/pnpm test/);
    expect(runs).toMatch(/pnpm run build/);
    // Regenerated documentation and indices live in the CLI package now.
    expect(runs).toContain('packages/agent-kit');
    expect(usesText(job)).toContain('peter-evans/create-pull-request');
  });
});

describe('release.yml Configuration', () => {
  it('is triggered by a version tag only, never by the GitHub release event', () => {
    const doc = parseWorkflow(releaseWorkflowPath);
    const on = triggersOf(doc);
    expect(on.push.tags).toEqual(['v*']);
    expect(on.release).toBeUndefined();
    expect(on.workflow_dispatch.inputs.tag.required).toBe(true);
  });

  it('installs, builds and packs exactly the two public packages', () => {
    const doc = parseWorkflow(releaseWorkflowPath);
    const job = jobNamed(doc, 'release');
    const runs = runText(job);

    expect(runs).toContain('pnpm install --frozen-lockfile');
    // A tag can point at a commit nobody tested: the release runs the suite too
    expect(runs).toContain('pnpm test');
    expect(runs).toContain('node scripts/release.mjs check-tag');
    expect(runs).toContain('pnpm --dir packages/bridge run build');
    expect(runs).toContain('pnpm --dir packages/agent-kit run build');
    expect(runs).not.toMatch(/build:resource|resources\/mcp-bridge run (build|publish)/);

    // Two tarballs, packed from the package directories into one artifact dir.
    const packs = runs.split('\n').filter((line) => line.includes(' pack '));
    expect(packs).toHaveLength(2);
    expect(packs[0]).toContain('--dir packages/bridge');
    expect(packs[1]).toContain('--dir packages/agent-kit');
    for (const line of packs) {
      expect(line).toContain('--pack-destination "$GITHUB_WORKSPACE/artifacts"');
    }

    expect(runs).toContain('node scripts/release.mjs verify --artifacts artifacts');
    // Verification must happen before the publish command.
    expect(runs.indexOf('verify --artifacts')).toBeLessThan(runs.indexOf('release.mjs publish'));
    expect(runs).toContain('node scripts/release.mjs publish --artifacts artifacts');
    // Root-level publish would target the private workspace orchestrator.
    expect(runs).not.toMatch(/^\s*pnpm publish/m);
  });

  it('publishes in dependency order from the package directories', () => {
    expect(PUBLIC_PACKAGES.map((pkg: any) => pkg.name)).toEqual([
      '@cybermp-community/agent-kit-bridge',
      '@cybermp-community/agent-kit',
    ]);

    const published = publishCommandFor({
      dir: '/repo/packages/bridge',
      tarball: '/repo/artifacts/cybermp-community-agent-kit-bridge-2.0.0.tgz',
      distTag: 'latest',
    });
    expect(published.cwd).toBe('/repo/packages/bridge');
    expect(published.args).toContain('/repo/artifacts/cybermp-community-agent-kit-bridge-2.0.0.tgz');
    expect(published.args).toContain('--tag');
  });

  it('never lets a prerelease take the latest tag', () => {
    expect(resolveDistTag('2.0.0', undefined)).toBe('latest');
    expect(resolveDistTag('2.1.0-beta.1', undefined)).toBe('beta');
    expect(resolveDistTag('2.1.0-beta.1', 'next')).toBe('next');
    expect(() => resolveDistTag('2.1.0-beta.1', 'latest')).toThrow(/prerelease/i);
    expect(() => resolveDistTag('2.0.0', 'bad tag')).toThrow(/Invalid dist-tag/i);

    const doc = parseWorkflow(releaseWorkflowPath);
    const job = jobNamed(doc, 'release');
    const publishStep = stepsOf(job).find((step) => step.run?.includes('release.mjs publish'));
    // The default is computed from the version in the script, not in YAML
    expect(publishStep.env.DIST_TAG).toBe('${{ inputs.dist-tag }}');

    const upload = stepsOf(job).find((step) => step.uses?.startsWith('softprops/action-gh-release'));
    expect(upload.with.prerelease).toContain("contains(");
  });

  it('configures npm auth from the token secret without a fallback login', () => {
    const doc = parseWorkflow(releaseWorkflowPath);
    const job = jobNamed(doc, 'release');
    const steps = stepsOf(job);
    const setupNode = steps.find((step) => step.uses?.startsWith('actions/setup-node'));

    expect(setupNode.with['registry-url']).toBe('https://registry.npmjs.org');
    const publishStep = steps.find((step) => step.run?.includes('release.mjs publish'));
    expect(publishStep.env.NODE_AUTH_TOKEN).toBe('${{ secrets.NPM_TOKEN }}');

    const runs = runText(job);
    expect(runs).not.toContain('npm install -g npm@latest');
    expect(runs).not.toContain('unset NODE_AUTH_TOKEN');
    expect(runs).not.toContain('npm login');
    // Publishing the private resource is never an option.
    expect(runs).not.toMatch(/publish[^\n]*resources/);
  });

  it('attaches the same verified tarballs to the GitHub release', () => {
    const doc = parseWorkflow(releaseWorkflowPath);
    const job = jobNamed(doc, 'release');
    const upload = stepsOf(job).find((step) => step.uses?.startsWith('softprops/action-gh-release'));
    expect(upload).toBeDefined();
    expect(upload.with.files).toBe('artifacts/*.tgz');
    expect(upload.if).toContain("startsWith(github.ref, 'refs/tags/')");
    expect(doc.concurrency, 'reruns must not publish twice concurrently').toBeDefined();
  });
});

describe('release ordering and resumability', () => {
  const packages = readPublicPackages(rootDir);
  const bridge = packages[0];
  const cli = packages[1];
  const key = (pkg: any) => `${pkg.name}@${pkg.version}`;

  it('describes exactly the two public packages and their tarball names', () => {
    expect(PUBLIC_PACKAGES).toHaveLength(2);
    expect(PUBLIC_PACKAGES.map((pkg: any) => pkg.dir)).toEqual(['packages/bridge', 'packages/agent-kit']);
    expect(packages.map((pkg: any) => pkg.version)).toEqual(['2.0.0', '2.0.0']);
    expect(tarballName('@cybermp-community/agent-kit', '2.0.0'))
      .toBe('cybermp-community-agent-kit-2.0.0.tgz');
    expect(tarballName('@cybermp-community/agent-kit-bridge', '2.0.0'))
      .toBe('cybermp-community-agent-kit-bridge-2.0.0.tgz');
  });

  it('skips only versions that already resolve with the same number', async () => {
    const timeline: string[] = [];
    const published: string[] = [];
    const results = await releasePackages({
      packages: [bridge, cli],
      fetchImpl: fakeRegistry({ [key(bridge)]: 'published', [key(cli)]: 'published' }, timeline),
      publish: async (pkg: any) => published.push(pkg.name),
      sleep: async () => {},
    });

    expect(published).toEqual([]);
    expect(results.map((result: any) => result.action)).toEqual(['skipped', 'skipped']);
  });

  it('publishes only the missing CLI and only after the bridge version resolves', async () => {
    const timeline: string[] = [];
    const answers: Record<string, any> = { [key(bridge)]: 'published', [key(cli)]: 'missing' };
    const published: string[] = [];

    const results = await releasePackages({
      packages: [bridge, cli],
      fetchImpl: fakeRegistry(answers, timeline),
      publish: async (pkg: any) => {
        published.push(pkg.name);
        timeline.push(`publish:${pkg.name}`);
        answers[key(pkg)] = 'published';
      },
      sleep: async () => {},
    });

    expect(published).toEqual(['@cybermp-community/agent-kit']);
    expect(results).toEqual([
      { name: bridge.name, version: bridge.version, action: 'skipped' },
      { name: cli.name, version: cli.version, action: 'published' },
    ]);
    // The bridge was confirmed present before the CLI was uploaded.
    expect(timeline.indexOf(`probe:${key(bridge)}`))
      .toBeLessThan(timeline.indexOf(`publish:${cli.name}`));
  });

  it('publishes the bridge first and waits for it before the CLI', async () => {
    const timeline: string[] = [];
    const answers: Record<string, any> = { [key(bridge)]: 'missing', [key(cli)]: 'missing' };

    await releasePackages({
      packages: [bridge, cli],
      fetchImpl: fakeRegistry(answers, timeline),
      publish: async (pkg: any) => {
        timeline.push(`publish:${pkg.name}`);
        answers[key(pkg)] = 'published';
      },
      sleep: async () => {},
    });

    expect(timeline).toEqual([
      `probe:${key(bridge)}`,
      `publish:${bridge.name}`,
      `probe:${key(bridge)}`,
      `probe:${key(cli)}`,
      `publish:${cli.name}`,
      `probe:${key(cli)}`,
    ]);
  });

  it('polls until the just-published version is visible', async () => {
    let requests = 0;
    const timeline: string[] = [];
    const fetchImpl = async () => {
      requests += 1;
      return requests < 3
        ? { ok: false, status: 404, json: async () => ({}) }
        : { ok: true, status: 200, json: async () => ({ version: bridge.version }) };
    };

    await releasePackages({
      packages: [bridge],
      fetchImpl,
      publish: async () => { timeline.push('publish'); },
      attempts: 5,
      sleep: async () => {},
    });

    expect(requests).toBe(3);
    expect(timeline).toEqual(['publish']);
  });

  it('fails when a published version never resolves', async () => {
    await expect(releasePackages({
      packages: [bridge],
      fetchImpl: async () => ({ ok: false, status: 404, json: async () => ({}) }),
      publish: async () => {},
      attempts: 3,
      sleep: async () => {},
    })).rejects.toBeInstanceOf(ReleaseError);
  });

  it('treats any registry error other than 404 as a failed release', async () => {
    for (const status of [401, 403, 500, 503]) {
      const published: string[] = [];
      const timeline: string[] = [];
      await expect(releasePackages({
        packages: [bridge, cli],
        fetchImpl: fakeRegistry({ [key(bridge)]: { status }, [key(cli)]: 'missing' }, timeline),
        publish: async (pkg: any) => published.push(pkg.name),
        sleep: async () => {},
      }), `status ${status}`).rejects.toThrow(String(status));
      expect(published, `status ${status} must not publish`).toEqual([]);
    }
  });

  it('fails when the registry answers with a different version', async () => {
    const timeline: string[] = [];
    await expect(releasePackages({
      packages: [bridge],
      fetchImpl: fakeRegistry({ [key(bridge)]: { status: 200, version: '2.0.1' } }, timeline),
      publish: async () => {},
    })).rejects.toBeInstanceOf(ReleaseError);
  });

  it('rejects a release that has no tag, a mixed version or a mismatched tag', () => {
    const packages = [
      { name: bridge.name, version: '2.0.0' },
      { name: cli.name, version: '2.0.0' },
    ];
    expect(() => assertTagMatches('v2.0.0', packages)).not.toThrow();
    expect(() => assertTagMatches('', packages)).toThrow(ReleaseError);
    expect(() => assertTagMatches('v2.1.0', packages)).toThrow(/does not match/);
    expect(() => assertTagMatches('v2.0.0', [packages[0], { ...packages[1], version: '2.0.1' }]))
      .toThrow(/share one version/);
  });

  it('refuses to verify an artifacts directory with extra or missing tarballs', () => {
    const artifacts = fs.mkdtempSync(path.join(path.dirname(rootDir), 'release-artifacts-'));
    try {
      expect(() => verifyTarballs(rootDir, artifacts)).toThrow(ReleaseError);
      fs.writeFileSync(path.join(artifacts, 'unexpected-resource-0.1.0.tgz'), '');
      expect(() => verifyTarballs(rootDir, artifacts)).toThrow(/Expected 2 tarballs/);
    } finally {
      fs.rmSync(artifacts, { recursive: true, force: true });
    }
  });
});
