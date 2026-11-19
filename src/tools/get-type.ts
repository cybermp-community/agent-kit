import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getTypeInfo } from '../engine/index.js';

export const getTypeSchema = {
  name: z
    .string()
    .describe('Exact or partial name of interface, class, enum, or type (e.g. "MpPlayer", "MpVehicle", "EntityType")'),
  env: z
    .enum(['server', 'client', 'browser'])
    .optional()
    .describe('Filter types by environment: server, client, or browser'),
};

export function registerGetTypeTool(server: McpServer): void {
  server.tool(
    'cybermp_get_type',
    'Lookup TypeScript types, classes, interfaces, properties, methods, and enums from official CyberMP packages (@cybermp/server-types, @cybermp/client-types, @cybermp/browser-types).',
    getTypeSchema,
    async ({ name, env }) => {
      const result = getTypeInfo(name, env);
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
