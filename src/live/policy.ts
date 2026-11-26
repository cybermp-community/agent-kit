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

/**
 * Which bridge tools the agent may see and call. Built-in tools are all
 * read-only and always available.
 *
 * - `CYBERMP_MCP_MODE=readonly`: only `read` tools
 * - `CYBERMP_MCP_ALLOW`: comma-separated tool names (with `*` wildcards);
 *   when set, nothing else is exposed. `economy__*` matches a whole scope.
 * - `CYBERMP_MCP_DENY`: same syntax; always wins
 */
export const isToolAllowed = (method: Pick<BridgeMethod, 'tool' | 'kind'>, env: Env) => {
  const allow = parseList(env.CYBERMP_MCP_ALLOW);
  const deny = parseList(env.CYBERMP_MCP_DENY);

  if (deny.some((re) => re.test(method.tool))) {
    return false;
  }

  if (allow.length > 0 && !allow.some((re) => re.test(method.tool))) {
    return false;
  }

  return env.CYBERMP_MCP_MODE?.toLowerCase() !== 'readonly' || method.kind === 'read';
};
