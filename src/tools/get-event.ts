import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getEventInfo } from '../engine/index.js';

export const getEventSchema = {
  env: z
    .enum(['server', 'client', 'browser'])
    .optional()
    .describe('Filter events by execution environment: server, client, or browser (CEF)'),
  name: z
    .string()
    .optional()
    .describe('Event name or substring to search for (e.g. "damage", "playerDamage", "vehicle")'),
  category: z
    .string()
    .optional()
    .describe('Filter events by category (e.g. "Events/Players", "Events/Vehicles")'),
};

export function registerGetEventTool(server: McpServer): void {
  server.tool(
    'cybermp_get_event',
    'Query CyberMP server, client, or CEF browser events by name, environment, or category. Returns signatures, parameter descriptions, listener syntax, and anti-hallucination guidance.',
    getEventSchema,
    async ({ env, name, category }) => {
      const result = getEventInfo({ env, name, category });
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
