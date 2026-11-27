import type { BridgeMethod } from './bridge.js';
import type { Env } from './env.js';

/** `kick_*,set_money` -> matchers. `*` matches any run of characters */
const parseList = (value: string | undefined) =>
  (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map(
      (pattern) =>
        new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`),
    );

/** `CYBERMP_MCP_MODE` values that allow write tools; unset or empty also does */
const WRITE_MODES = new Set(['full', 'write', 'readwrite', 'read-write']);

/**
 * True unless the mode allows writes. `read-only`, ` READONLY ` or a typo all
 * mean read-only.
 */
export const isReadOnlyMode = (env: Env) => {
  const mode = env.CYBERMP_MCP_MODE?.trim().toLowerCase();

  return Boolean(mode) && !WRITE_MODES.has(mode!);
};

/**
 * Which bridge tools the agent may see and call. Built-in tools are all
 * read-only and always available.
 *
 * - `CYBERMP_MCP_MODE`: `readonly` (or any value but `full`/`write`) allows only `read` tools
 * - `CYBERMP_MCP_ALLOW`: comma-separated tool names (with `*` wildcards);
 *   when set, nothing else is exposed (when set but empty, bridge tool is disabled).
 *   `economy__*` matches a whole scope.
 * - `CYBERMP_MCP_DENY`: same syntax; always wins
 */
export const isToolAllowed = (method: Pick<BridgeMethod, 'tool' | 'kind'>, env: Env) => {
  const deny = parseList(env.CYBERMP_MCP_DENY);

  if (deny.some((re) => re.test(method.tool))) {
    return false;
  }

  if (env.CYBERMP_MCP_ALLOW !== undefined) {
    const allow = parseList(env.CYBERMP_MCP_ALLOW);

    if (!allow.some((re) => re.test(method.tool))) {
      return false;
    }
  }

  return !isReadOnlyMode(env) || method.kind === 'read';
};
