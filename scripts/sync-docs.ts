import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

export interface SyncDocsOptions {
  sourceDir?: string;
  targetDir?: string;
  remoteUrl?: string;
  forceRemote?: boolean;
}

export const KNOWN_GUIDES: string[] = [
  'getting-started.mdx',
  'introduction.mdx',
  'client/discord.mdx',
  'client/events.mdx',
  'client/first-cef-ui.mdx',
  'client/lifecycle.mdx',
  'client/local-entities.mdx',
  'client/local-storage.mdx',
  'client/network-ids.mdx',
  'client/observes.mdx',
  'client/overrides.mdx',
  'client/spawning-player.mdx',
  'client/teleporting-player.mdx',
  'recipes/hotreload.mdx',
  'recipes/rpc.mdx',
  'recipes/typescript.mdx',
  'resources/adding-resource-files.mdx',
  'resources/creating-resource.mdx',
  'resources/exports.mdx',
  'resources/interacting-with-resources.mdx',
  'resources/introduction.mdx',
  'resources/live-updates.mdx',
  'server/cdn.mdx',
  'server/commands.mdx',
  'server/entities.mdx',
  'server/events.mdx',
  'server/hashes.mdx',
  'server/meta.mdx',
  'server/players.mdx',
  'server/vehicles.mdx',
];

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
  fs.mkdirSync(targetDir, { recursive: true });

  const potentialLocalDirs = [
    options?.sourceDir,
    process.env.CYBERMP_DOCS_DIR,
  ].filter((p): p is string => Boolean(p));

  let localSourceDir: string | null = null;
  if (!options?.forceRemote) {
    for (const candidate of potentialLocalDirs) {
      if (fs.existsSync(candidate)) {
        localSourceDir = candidate;
        break;
      }
    }
  }

  const syncedFiles: string[] = [];

  if (localSourceDir) {
    const docFiles = findDocFiles(localSourceDir);
    for (const file of docFiles) {
      const raw = fs.readFileSync(file.fullPath, 'utf-8');
      const cleaned = cleanMdxContent(raw);
      const targetRelPath = file.relativePath.replace(/\.mdx$/, '.md');
      const targetFilePath = path.join(targetDir, targetRelPath);

      fs.mkdirSync(path.dirname(targetFilePath), { recursive: true });
      fs.writeFileSync(targetFilePath, cleaned, 'utf-8');
      syncedFiles.push(targetRelPath);
    }
    console.log(`Docs synced locally from ${localSourceDir} into ${targetDir} (${syncedFiles.length} files)`);
    return syncedFiles;
  }

  // Fallback 1: Try shallow clone from Cyber-MP/CyberMP-Docs
  const tempCloneDir = path.resolve(targetDir, '.git-clone-temp');
  try {
    fs.rmSync(tempCloneDir, { recursive: true, force: true });
    const repoUrl = options?.remoteUrl || 'https://github.com/Cyber-MP/CyberMP-Docs.git';
    execSync(`git clone --depth 1 ${repoUrl} "${tempCloneDir}"`, { stdio: 'ignore' });
    const clonedGuidesDir = path.join(tempCloneDir, 'src/content/docs/guides');
    if (fs.existsSync(clonedGuidesDir)) {
      const docFiles = findDocFiles(clonedGuidesDir);
      for (const file of docFiles) {
        const raw = fs.readFileSync(file.fullPath, 'utf-8');
        const cleaned = cleanMdxContent(raw);
        const targetRelPath = file.relativePath.replace(/\.mdx$/, '.md');
        const targetFilePath = path.join(targetDir, targetRelPath);

        fs.mkdirSync(path.dirname(targetFilePath), { recursive: true });
        fs.writeFileSync(targetFilePath, cleaned, 'utf-8');
        syncedFiles.push(targetRelPath);
      }
      console.log(`Docs synced via shallow clone from ${repoUrl} into ${targetDir} (${syncedFiles.length} files)`);
      return syncedFiles;
    }
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn('Shallow clone fallback failed, attempting raw GitHub fetch...', err);
    }
  } finally {
    fs.rmSync(tempCloneDir, { recursive: true, force: true });
  }

  // Fallback 2: Direct HTTP fetch from raw.githubusercontent.com
  const rawBaseUrl = 'https://raw.githubusercontent.com/Cyber-MP/CyberMP-Docs/main/src/content/docs/guides';
  for (const relPath of KNOWN_GUIDES) {
    try {
      const url = `${rawBaseUrl}/${relPath}`;
      const res = await fetch(url);
      if (res.ok) {
        const raw = await res.text();
        const cleaned = cleanMdxContent(raw);
        const targetRelPath = relPath.replace(/\.mdx$/, '.md');
        const targetFilePath = path.join(targetDir, targetRelPath);

        fs.mkdirSync(path.dirname(targetFilePath), { recursive: true });
        fs.writeFileSync(targetFilePath, cleaned, 'utf-8');
        syncedFiles.push(targetRelPath);
      }
    } catch {
      // Ignore individual fetch errors in fallback
    }
  }

  if (syncedFiles.length === 0) {
    throw new Error('Unable to sync docs: no local docs directory found and remote fetch failed.');
  }

  console.log(`Docs synced via GitHub raw fetch into ${targetDir} (${syncedFiles.length} files)`);
  return syncedFiles;
}

const isDirectExecution = Boolean(
  process.argv[1] &&
  (process.argv[1].endsWith('sync-docs.ts') || process.argv[1].endsWith('sync-docs.js'))
);

if (isDirectExecution) {
  const args = process.argv.slice(2);
  const localFlagIndex = args.findIndex((arg) => arg === '--local' || arg === '-l');
  let sourceDir: string | undefined;
  if (localFlagIndex !== -1) {
    sourceDir =
      args[localFlagIndex + 1] && !args[localFlagIndex + 1].startsWith('-')
        ? path.resolve(process.cwd(), args[localFlagIndex + 1])
        : path.resolve(process.cwd(), '../CyberMP-Docs/src/content/docs/guides');
  }
  syncDocs({ sourceDir }).catch(console.error);
}
