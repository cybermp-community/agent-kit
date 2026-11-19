import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { lookupTweakDb } from '../engine/tweakdb-engine.js';

export const lookupTweakDbSchema = {
  query: z.string().optional().describe('Search query for TweakDB ID or name (e.g. "burning", "hellhound", "katana")'),
  category: z
    .enum(['all', 'status_effects', 'weapons', 'vehicles', 'clothing', 'quickhacks', 'workspots'])
    .optional()
    .describe('Filter records by category'),
  limit: z.number().optional().describe('Max records to return (default 10, max 50)'),
};

export function registerLookupTweakDbTool(server: McpServer): void {
  server.tool(
    'cybermp_lookup_tweakdb',
    'Lookup verified Cyberpunk 2077 TweakDB IDs for status effects, armed vehicles, weapons, workspots, and gear.',
    lookupTweakDbSchema,
    async ({ query, category, limit }) => {
      const result = lookupTweakDb(query, category, limit);
      return {
        content: [{ type: 'text', text: result.formattedText }],
      };
    }
  );
}
