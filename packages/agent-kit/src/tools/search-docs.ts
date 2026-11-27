import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { searchDocs } from '../engine/index.js';

export const searchDocsSchema = {
  query: z
    .string()
    .describe('Search term or topic for CyberMP guides and tutorials (e.g. "rpc", "cef", "live reload")'),
  limit: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Maximum number of guide results to return (default: 3)'),
};

export function registerSearchDocsTool(server: McpServer): void {
  server.tool(
    'cybermp_search_docs',
    'Search offline CyberMP documentation guides, recipes, and best practices with code snippets and doc links.',
    searchDocsSchema,
    async ({ query, limit }) => {
      const result = searchDocs(query, limit ?? 3);
      return {
        content: [
          {
            type: 'text',
            text: result.formattedText,
          },
        ],
      };
    }
  );
}
