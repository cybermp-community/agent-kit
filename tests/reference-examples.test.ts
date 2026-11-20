import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { parseGuides } from '../scripts/build-index.js';
import indexedGuides from '../src/data/guides.json' with { type: 'json' };

const root = process.cwd();
const guides = parseGuides().filter((guide) => guide.sourceKind === 'kit-reference');
const runtimeTypes = {
  client: 'MpClient',
  server: 'MpServer',
  browser: 'MpBrowser',
  tooling: undefined,
} as const;
type Environment = keyof typeof runtimeTypes;

const examples = guides.flatMap((guide) => guide.codeSnippets.flatMap((code, index) => {
  if (!/^(?:ts|typescript|js|javascript)$/i.test(guide.codeLanguages?.[index] ?? '')) return [];
  const context = guide.exampleContexts?.[index];
  return [{
    label: `${guide.slug} (example ${index + 1})`,
    environment: context?.environment ?? guide.environment,
    checkedAgainst: context?.checkedAgainst,
    code,
  }];
}));

describe('Reference examples', () => {
  it('records the intended runtime for every JavaScript or TypeScript example', () => {
    expect(examples.length).toBeGreaterThan(0);
    const unspecified = examples.filter(({ environment }) => !environment || !Object.hasOwn(runtimeTypes, environment));
    expect(unspecified.map(({ label }) => label)).toEqual([]);
  });

  it.each(Object.keys(runtimeTypes) as Environment[])('type-checks %s examples against the installed declarations', (environment) => {
    const selected = examples.filter((example) => example.environment === environment);
    if (!selected.length) return;

    const packageName = `@cybermp/${environment}-types`;
    const runtime = runtimeTypes[environment];
    const declaration = runtime ? `declare const mp: import('${packageName}').${runtime};\n` : '';
    if (runtime) {
      const manifest = JSON.parse(fs.readFileSync(path.join(root, 'node_modules', packageName, 'package.json'), 'utf8'));
      const installed = `${packageName}@${manifest.version}`;
      for (const example of selected) {
        if (example.checkedAgainst && example.checkedAgainst !== installed) {
          console.warn(`${example.label}: recorded ${example.checkedAgainst}, checking against ${installed}`);
        }
      }
    }

    const virtualFiles = new Map(selected.map((example, index) => [
      path.join(root, `reference-example-${environment}-${index}.ts`),
      { label: example.label, source: `${declaration}export {};\n${example.code}\n` },
    ]));
    const options: ts.CompilerOptions = {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      noEmit: true,
      strict: true,
      skipLibCheck: true,
      types: environment === 'server' || environment === 'tooling' ? ['node'] : [],
      lib: environment === 'server' || environment === 'tooling' ? ['lib.es2022.d.ts'] : ['lib.es2022.d.ts', 'lib.dom.d.ts'],
    };
    const host = ts.createCompilerHost(options);
    const { readFile, fileExists } = host;
    host.readFile = (file) => virtualFiles.get(file)?.source ?? readFile(file);
    host.fileExists = (file) => virtualFiles.has(file) || fileExists(file);
    const program = ts.createProgram([...virtualFiles.keys()], options, host);
    const diagnostics = ts.getPreEmitDiagnostics(program).map((diagnostic) => {
      const file = diagnostic.file;
      const example = file && virtualFiles.get(file.fileName);
      const line = file && diagnostic.start !== undefined
        ? file.getLineAndCharacterOfPosition(diagnostic.start).line + 1 - (runtime ? 2 : 1)
        : undefined;
      const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ');
      const location = example ? `${example.label}, line ${line}` : file?.fileName ?? environment;
      return `${location}: TS${diagnostic.code}: ${message}`;
    });
    expect(diagnostics).toEqual([]);
  });

  it('ships the same reference sections and example metadata that are checked', () => {
    const checked = new Map(guides.map((guide) => [guide.slug, JSON.stringify(guide)]));
    const packaged = new Map(indexedGuides.filter((guide) => guide.sourceKind === 'kit-reference')
      .map((guide) => [guide.slug, JSON.stringify(guide)]));
    const mismatches = [...new Set([...checked.keys(), ...packaged.keys()])]
      .filter((slug) => checked.get(slug) !== packaged.get(slug));
    expect(mismatches, 'Run pnpm run build:index to regenerate the MCP reference index.').toEqual([]);
  });
});
