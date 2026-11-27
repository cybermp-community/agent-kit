import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getTypeInfo, resolveTypeName } from '../engine/index.js';

export const getTypeSchema = {
  name: z
    .string()
    .optional()
    .describe('Exact or partial name of interface, class, enum, or type (e.g. "MpPlayer", "MpVehicle", "EntityType")'),
  type_name: z
    .string()
    .optional()
    .describe('Alias for name: exact or partial name of interface, class, enum, or type'),
  typeName: z
    .string()
    .optional()
    .describe('Alias for name: camelCase variant'),
  type: z
    .string()
    .optional()
    .describe('Alias for name'),
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
    async (args) => {
      try {
        const resolvedName = resolveTypeName(args);
        const result = getTypeInfo(resolvedName, args.env);
        return {
          content: [
            {
              type: 'text',
              text: result.formattedText,
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: error.message || String(error),
            },
          ],
        };
      }
    }
  );
}
