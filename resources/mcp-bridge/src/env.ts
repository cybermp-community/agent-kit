import { readFileSync } from 'node:fs';

export type Config = Record<string, string | undefined>;

/** `KEY=value` lines; surrounding quotes are removed */
export const parseEnv = (content: string) => {
  const env: Record<string, string> = {};

  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^[ \t]*([A-Za-z_][A-Za-z0-9_]*)[ \t]*=[ \t]*(.*?)[ \t]*$/);

    if (match) {
      env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }

  return env;
};

/** `.env` in the working directory, then the one next to `server.toml` */
const defaultPaths = () => {
  const paths = ['.env'];

  if (typeof __dirname !== 'undefined') {
    paths.push(`${__dirname}/../../../../.env`);
  }

  return paths;
};

/**
 * Environment variables, with `.env` files filling the gaps. The first file
 * that has a key wins.
 */
export const loadConfig = (
  options: { paths?: string[]; env?: Config } = {},
): Config => {
  const fromFiles: Record<string, string> = {};

  for (const path of options.paths ?? defaultPaths()) {
    try {
      for (const [key, value] of Object.entries(parseEnv(readFileSync(path, 'utf8')))) {
        fromFiles[key] ??= value;
      }
    } catch {
      // No such file
    }
  }

  return { ...fromFiles, ...(options.env ?? process.env) };
};

export const DEFAULT_START_DELAY_MS = 30_000;

/** `DEVTOOLS_START_DELAY_MS`: A whole, non-negative number of milisseconds;
 * anything else gives the default
 */
export const startDelayMs = (config: Config) => {
  const raw = config.DEVTOOLS_START_DELAY_MS?.trim();

  if (!raw || !/^\d+$/.test(raw)) {
    return DEFAULT_START_DELAY_MS;
  }

  return Number(raw);
};

/**
 * `DEVTOOLS_PORT`: undefined when unset (the bridge's default), else a port
 * number. Invalid values come back as `NaN`, so the bridge refuses to start
 * and says why, instead of listening somewhere the MCP server won't look.
 */
export const bridgePort = (config: Config) => {
  const raw = config.DEVTOOLS_PORT?.trim();

  if (!raw) {
    return undefined;
  }

  const port = /^\d+$/.test(raw) ? Number(raw) : Number.NaN;

  return port >= 1 && port <= 65_535 ? port : Number.NaN;
};
