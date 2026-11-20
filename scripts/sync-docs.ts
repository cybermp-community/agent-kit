import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import upstream from '../data/upstream-guides.json' with { type: 'json' };

export interface SyncDocsOptions {
  sourceDir?: string;
  targetDir?: string;
  forceRemote?: boolean;
  expectedFiles?: string[];
}

export const KNOWN_GUIDES = upstream.guides.map(({ slug }) => `${slug}.mdx`);

export function extractDocMetadata(content: string): { title: string; description: string } {
  const titleMatch = content.match(/^title:\s*(.*)$/m);
  const descMatch = content.match(/^description:\s*(.*)$/m);

  const cleanValue = (val: string | undefined, defaultVal: string) => {
    if (!val) return defaultVal;
    let trimmed = val.trim();
    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
      trimmed = trimmed.slice(1, -1).trim();
    }
    return trimmed || defaultVal;
  };

  return {
    title: cleanValue(titleMatch?.[1], 'Untitled'),
    description: cleanValue(descMatch?.[1], ''),
  };
}

export function cleanMdxContent(content: string): string {
  // Stash code blocks (``` ... ``` or ~~~ ... ~~~) to prevent stripping code imports/tags
  const codeBlocks: string[] = [];
  const placeholder = '___CODE_BLOCK_PLACEHOLDER_';

  const withoutCode = content.replace(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/g, (match) => {
    const token = `${placeholder}${codeBlocks.length}___`;
    codeBlocks.push(match);
    return token;
  });

  const cleaned = withoutCode
    .replace(/^import\s+.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/<TabItem\b[^>]*\blabel=(["'])(.*?)\1[^>]*>/gi, '#### $2:\n')
    .replace(/<\/?(Steps|Tabs|TabItem|FileTree|CardGrid|LinkCard|Card|Badge|Icon)\b[^>]*\/?>/gi, '');

  const restored = cleaned.replace(new RegExp(`${placeholder}(\\d+)___`, 'g'), (_, index) => {
    return codeBlocks[Number(index)] ?? '';
  });

  return restored.trim();
}

function findDocFiles(dir: string, baseDir = dir): { relativePath: string; fullPath: string }[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: { relativePath: string; fullPath: string }[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findDocFiles(fullPath, baseDir));
    } else if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.mdx'))) {
      const relativePath = path.relative(baseDir, fullPath);
      files.push({ relativePath, fullPath });
    }
  }

  return files;
}

export async function syncDocs(options?: SyncDocsOptions): Promise<string[]> {
  const targetDir = path.resolve(options?.targetDir || 'tmp/docs');
  const sourceDir = options?.forceRemote ? undefined : options?.sourceDir || process.env.CYBERMP_DOCS_DIR;
  if (sourceDir && !fs.existsSync(sourceDir)) {
    throw new Error(`Documentation directory does not exist: ${sourceDir}`);
  }
  if (sourceDir && path.resolve(sourceDir) === targetDir) {
    throw new Error('The documentation source and destination must be different directories');
  }

  const available = sourceDir
    ? new Map(findDocFiles(sourceDir).map((file) => [file.relativePath.split(path.sep).join('/'), file.fullPath]))
    : undefined;
  const expected = [...(options?.expectedFiles ?? (available ? [...available.keys()] : KNOWN_GUIDES))].sort();
  if (expected.length === 0) throw new Error('No documentation inputs to sync');
  const repository = new URL(upstream.repository).pathname.replace(/\.git$/, '');
  const remoteBase = `https://raw.githubusercontent.com${repository}/${upstream.revision}/${upstream.contentRoot}`;

  const responses = await Promise.allSettled(expected.map(async (relativePath) => {
    if (!/^(?:[a-z0-9-]+\/)*[a-z0-9-]+\.mdx?$/i.test(relativePath)) {
      throw new Error(`Invalid documentation path: ${relativePath}`);
    }
    const file = available?.get(relativePath);
    let content: string;
    if (available) {
      if (!file) throw new Error('missing from checkout');
      content = fs.readFileSync(file, 'utf8');
    } else {
      const response = await fetch(`${remoteBase}/${relativePath}`, { signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      content = await response.text();
    }
    const cleaned = cleanMdxContent(content);
    if (!cleaned) throw new Error('empty document');
    return { relativePath: relativePath.replace(/\.mdx$/, '.md'), cleaned };
  }));

  const files = responses.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
  if (files.length !== expected.length) {
    const failures = responses.flatMap((result, index) =>
      result.status === 'rejected' ? [`${expected[index]} (${result.reason.message})`] : [],
    );
    throw new Error(`Incomplete documentation snapshot: ${failures.join(', ')}`);
  }
  if (new Set(files.map(({ relativePath }) => relativePath)).size !== files.length) {
    throw new Error('Multiple documentation inputs resolve to the same destination');
  }

  const parent = path.dirname(targetDir);
  fs.mkdirSync(parent, { recursive: true });
  const staging = fs.mkdtempSync(path.join(parent, '.cybermp-docs-'));
  const next = path.join(staging, 'next');
  const previous = path.join(staging, 'previous');
  let keepBackup = false;
  try {
    for (const { relativePath, cleaned } of files) {
      const target = path.join(next, relativePath);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, cleaned);
    }
    if (fs.existsSync(targetDir)) fs.renameSync(targetDir, previous);
    try {
      fs.renameSync(next, targetDir);
    } catch (error) {
      try {
        if (fs.existsSync(previous)) fs.renameSync(previous, targetDir);
      } catch (restoreError) {
        keepBackup = true;
        throw new Error(`Could not restore the previous snapshot. It is available at ${previous}`, { cause: restoreError });
      }
      throw error;
    }
  } finally {
    if (!keepBackup) fs.rmSync(staging, { recursive: true, force: true });
  }

  console.log(`Synced ${files.length} guides from ${sourceDir || upstream.revision} into ${targetDir}`);
  return files.map(({ relativePath }) => relativePath);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const localFlagIndex = args.findIndex((arg) => arg === '--local' || arg === '-l');
  const nextArg = args[localFlagIndex + 1];
  const sourceDir = localFlagIndex < 0
    ? undefined
    : nextArg && !nextArg.startsWith('-')
      ? path.resolve(nextArg)
      : path.resolve('../CyberMP-Docs/src/content/docs/guides');

  syncDocs({ sourceDir, expectedFiles: KNOWN_GUIDES }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
