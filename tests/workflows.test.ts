import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import YAML from 'yaml';

describe('GitHub Actions Workflows', () => {
  const rootDir = path.resolve(__dirname, '..');
  const workflowsDir = path.join(rootDir, '.github', 'workflows');

  const testWorkflowPath = path.join(workflowsDir, 'test.yml');
  const autoUpdateWorkflowPath = path.join(workflowsDir, 'auto-update.yml');
  const releaseWorkflowPath = path.join(workflowsDir, 'release.yml');

  describe('Workflow File Existence', () => {
    it('all three workflow files exist in .github/workflows/', () => {
      expect(fs.existsSync(testWorkflowPath), 'test.yml must exist').toBe(true);
      expect(fs.existsSync(autoUpdateWorkflowPath), 'auto-update.yml must exist').toBe(true);
      expect(fs.existsSync(releaseWorkflowPath), 'release.yml must exist').toBe(true);
    });
  });

  describe('YAML Syntax Validity', () => {
    it('parses test.yml without syntax errors', () => {
      const content = fs.readFileSync(testWorkflowPath, 'utf-8');
      const doc = YAML.parse(content);
      expect(doc).toBeTypeOf('object');
      expect(doc.name).toBeDefined();
    });

    it('parses auto-update.yml without syntax errors', () => {
      const content = fs.readFileSync(autoUpdateWorkflowPath, 'utf-8');
      const doc = YAML.parse(content);
      expect(doc).toBeTypeOf('object');
      expect(doc.name).toBeDefined();
    });

    it('parses release.yml without syntax errors', () => {
      const content = fs.readFileSync(releaseWorkflowPath, 'utf-8');
      const doc = YAML.parse(content);
      expect(doc).toBeTypeOf('object');
      expect(doc.name).toBeDefined();
    });
  });

  describe('test.yml Configuration', () => {
    it('triggers on push to main and pull_request', () => {
      const doc = YAML.parse(fs.readFileSync(testWorkflowPath, 'utf-8'));
      const on = doc.on || doc.true; // YAML parser may treat 'on' as boolean if unquoted, but standard YAML 1.2 treats it as string
      expect(on).toBeDefined();

      expect(on.push).toBeDefined();
      expect(on.push.branches).toContain('main');
      expect(on.pull_request).toBeDefined();
    });

    it('defines a test job testing Node 20 and Node 22 matrix', () => {
      const doc = YAML.parse(fs.readFileSync(testWorkflowPath, 'utf-8'));
      const jobs = doc.jobs;
      expect(jobs).toBeDefined();

      const testJob = jobs.test || jobs.build || Object.values(jobs)[0] as any;
      expect(testJob).toBeDefined();
      expect(testJob['runs-on']).toContain('ubuntu-latest');

      // Strategy matrix with Node 20 and 22
      const matrix = testJob.strategy?.matrix;
      expect(matrix).toBeDefined();
      const nodeVersions = matrix['node-version'] || matrix.node;
      expect(nodeVersions).toBeDefined();
      const stringifiedVersions = nodeVersions.map((v: any) => String(v));
      expect(stringifiedVersions).toContain('20');
      expect(stringifiedVersions).toContain('22');
    });

    it('includes required steps: checkout, pnpm setup, node setup, install, test, and build', () => {
      const doc = YAML.parse(fs.readFileSync(testWorkflowPath, 'utf-8'));
      const testJob = doc.jobs.test || doc.jobs.build || Object.values(doc.jobs)[0] as any;
      const steps = testJob.steps as any[];
      expect(Array.isArray(steps)).toBe(true);

      const stepUses = steps.map((s: any) => s.uses || '');
      const stepRuns = steps.map((s: any) => s.run || '');

      expect(stepUses.some((u: string) => u.startsWith('actions/checkout'))).toBe(true);
      expect(stepUses.some((u: string) => u.startsWith('pnpm/action-setup'))).toBe(true);
      expect(stepUses.some((u: string) => u.startsWith('actions/setup-node'))).toBe(true);

      const runCommands = stepRuns.join('\n');
      expect(runCommands).toMatch(/pnpm\s+(install|i)/);
      expect(runCommands).toMatch(/pnpm\s+test/);
      expect(runCommands).toMatch(/pnpm\s+(run\s+)?build/);
    });
  });

  describe('auto-update.yml Configuration', () => {
    it('triggers on weekly schedule and workflow_dispatch', () => {
      const doc = YAML.parse(fs.readFileSync(autoUpdateWorkflowPath, 'utf-8'));
      const on = doc.on;
      expect(on).toBeDefined();

      expect(on.schedule).toBeDefined();
      expect(Array.isArray(on.schedule)).toBe(true);
      expect(on.schedule[0].cron).toBeDefined();
      expect(on.workflow_dispatch).toBeDefined();
    });

    it('declares permissions for writing repository content and pull requests', () => {
      const doc = YAML.parse(fs.readFileSync(autoUpdateWorkflowPath, 'utf-8'));
      expect(doc.permissions).toBeDefined();
      expect(doc.permissions.contents).toBe('write');
      expect(doc.permissions['pull-requests']).toBe('write');
    });

    it('checks for type updates, runs sync:docs, build:index, tests, and creates PR', () => {
      const doc = YAML.parse(fs.readFileSync(autoUpdateWorkflowPath, 'utf-8'));
      const job = doc.jobs.update || doc.jobs['auto-update'] || Object.values(doc.jobs)[0] as any;
      const steps = job.steps as any[];
      const stepRuns = steps.map((s: any) => s.run || '').join('\n');
      const stepUses = steps.map((s: any) => s.uses || '').join('\n');

      // Checks for updates to @cybermp packages
      expect(stepRuns).toContain('@cybermp/server-types');
      expect(stepRuns).toContain('@cybermp/client-types');
      expect(stepRuns).toContain('@cybermp/browser-types');

      // Runs sync:docs and build:index
      expect(stepRuns).toMatch(/pnpm\s+run\s+sync:docs|pnpm\s+sync:docs/);
      expect(stepRuns).toMatch(/pnpm\s+run\s+build:index|pnpm\s+build:index/);

      // Verifies test suite passes
      expect(stepRuns).toMatch(/pnpm\s+test/);
      expect(stepRuns).toMatch(/pnpm\s+(run\s+)?build/);

      // PR creation step (e.g. peter-evans/create-pull-request or gh pr create)
      const hasPrAction = stepUses.includes('peter-evans/create-pull-request');
      const hasGhPr = stepRuns.includes('gh pr create');
      expect(hasPrAction || hasGhPr).toBe(true);
    });
  });

  describe('release.yml Configuration', () => {
    it('triggers on release published and workflow_dispatch', () => {
      const doc = YAML.parse(fs.readFileSync(releaseWorkflowPath, 'utf-8'));
      const on = doc.on;
      expect(on).toBeDefined();

      expect(on.release).toBeDefined();
      expect(on.release.types).toContain('published');
      expect(on.workflow_dispatch).toBeDefined();
    });

    it('configures npm registry and auth token for publishing', () => {
      const doc = YAML.parse(fs.readFileSync(releaseWorkflowPath, 'utf-8'));
      const job = doc.jobs.release || doc.jobs.publish || Object.values(doc.jobs)[0] as any;
      const steps = job.steps as any[];

      const setupNodeStep = steps.find((s: any) => s.uses?.startsWith('actions/setup-node'));
      expect(setupNodeStep).toBeDefined();
      expect(setupNodeStep.with?.['registry-url']).toBe('https://registry.npmjs.org');

      const publishStep = steps.find((s: any) => s.run?.includes('pnpm publish') || s.run?.includes('npm publish'));
      expect(publishStep).toBeDefined();
      expect(publishStep.env?.NODE_AUTH_TOKEN).toBe('${{ secrets.NPM_TOKEN }}');
    });

    it('runs test and build prior to publish', () => {
      const doc = YAML.parse(fs.readFileSync(releaseWorkflowPath, 'utf-8'));
      const job = doc.jobs.release || doc.jobs.publish || Object.values(doc.jobs)[0] as any;
      const steps = job.steps as any[];
      const stepRuns = steps.map((s: any) => s.run || '').join('\n');

      expect(stepRuns).toMatch(/pnpm\s+(install|i)/);
      expect(stepRuns).toMatch(/pnpm\s+test/);
      expect(stepRuns).toMatch(/pnpm\s+(run\s+)?build/);
    });
  });
});
