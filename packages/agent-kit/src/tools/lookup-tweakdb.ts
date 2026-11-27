import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { lookupTweakDb, tweakDbCategories } from '../engine/tweakdb-engine.js';

export const lookupTweakDbSchema = {
  query: z.string().optional().describe('Search query for TweakDB ID or name (e.g. "burning", "hellhound", "katana")'),
  category: z
    .enum(['all', ...tweakDbCategories])
    .optional()
    .describe('Filter records by category'),
  limit: z.number().optional().describe('Max records to return (default 10, max 50)'),
};

export function registerLookupTweakDbTool(server: McpServer): void {
  server.tool(
    'cybermp_lookup_tweakdb',
    'Search a curated set of Cyberpunk 2077 TweakDB candidates and view the evidence and any known ID discrepancies.',
    lookupTweakDbSchema,
    async ({ query, category, limit }) => {
      const result = lookupTweakDb(query, category, limit);
      return {
        content: [{ type: 'text', text: result.formattedText }],
      };
    }
  );
}
