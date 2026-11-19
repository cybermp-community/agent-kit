import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getRpcFlow } from '../engine/index.js';

export const getRpcFlowSchema = {
  from: z
    .enum(['server', 'client', 'browser'])
    .describe('Source execution runtime (server, client, or browser)'),
  to: z
    .enum(['server', 'client', 'browser'])
    .describe('Target execution runtime (server, client, or browser)'),
};

export function registerGetRpcFlowTool(server: McpServer): void {
  server.tool(
    'cybermp_get_rpc_flow',
    'Generate verified paired RPC communication code and listener patterns between CyberMP runtimes (Server, Client, CEF Browser).',
    getRpcFlowSchema,
    async ({ from, to }) => {
      try {
        const flow = getRpcFlow(from, to);
        const lines: string[] = [
          `## ${flow.title}`,
          '',
          `### Sender (${from})`,
          '```typescript',
          flow.senderCode,
          '```',
          '',
          `### Receiver (${to})`,
          '```typescript',
          flow.receiverCode,
          '```',
        ];
        if (flow.notes) {
          lines.push('', `> **Notes:** ${flow.notes}`);
        }
        return {
          content: [
            {
              type: 'text',
              text: lines.join('\n'),
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
