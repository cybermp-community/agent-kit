import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

export type Env = Record<string, string | undefined>;

/**
 * Project root of the game server. Resolution order:
 * CYBERMP_ROOT, CLAUDE_PROJECT_DIR (set by some MCP clients), current directory.
 */
export const getRoot = (env: Env = process.env) =>
  resolve(env.CYBERMP_ROOT || env.CLAUDE_PROJECT_DIR || process.cwd());

/**
 * Where a CyberMP server keeps its logs, relative to the root: next to the
 * server binary in a plain install, or under `mp/<platform>` when the server
 * lives in a subfolder of a development repository.
 */
export const LOG_DIR_CANDIDATES = ['logs', 'mp/linux/logs', 'mp/win/logs'];

const isDirectory = (path: string) => {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
};

/**
 * `CYBERMP_LOGS_DIR` (relative to the root, or absolute), else the first
 * existing candidate. Undefined when there is no logs folder: the log tools
 * stay hidden.
 */
export const findLogsDir = (env: Env) => {
  const root = getRoot(env);

  if (env.CYBERMP_LOGS_DIR) {
    const dir = resolve(root, env.CYBERMP_LOGS_DIR);

    return isDirectory(dir) ? dir : undefined;
  }

  return LOG_DIR_CANDIDATES.map((candidate) => resolve(root, candidate)).find(isDirectory);
};

/** Executable name used to find the running server process */
export const getProcessName = (env: Env) => env.CYBERMP_PROCESS || 'cybermp-server';

export const parseDotenv = (content: string) => {
  const env: Record<string, string> = {};

  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);

    if (match) {
      const [, key, raw] = match;
      env[key] = raw.replace(/^(['"])(.*)\1$/, '$2');
    }
  }

  return env;
};

/**
 * Real environment variables win; `<root>/.env` fills the gaps. Re-read on
 * every call, so a token or port change is picked up without a restart.
 */
export const readEnv = (base: Env = process.env): Env => {
  const path = resolve(getRoot(base), '.env');
  let fromFile: Record<string, string> = {};

  if (existsSync(path)) {
    try {
      fromFile = parseDotenv(readFileSync(path, 'utf8'));
    } catch {
      // Unreadable .env: environment variables only
    }
  }

  return { ...fromFile, ...base };
};
