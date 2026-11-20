import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getRpcFlow, parseRpcFlowArgs, type RpcRuntime } from '../engine/index.js';

export const getRpcFlowSchema = {
  flow: z.string().optional().describe('Combined flow string (e.g. "server-client", "client->browser", "cef_to_server")'),
  from: z.string().optional().describe('Source execution runtime (server, client, browser, or cef)'),
  source: z.string().optional().describe('Alias for source execution runtime'),
  to: z.string().optional().describe('Target execution runtime (server, client, browser, or cef)'),
  target: z.string().optional().describe('Alias for target execution runtime'),
};

export function registerGetRpcFlowTool(server: McpServer): void {
  server.tool(
    'cybermp_get_rpc_flow',
    'Generate paired RPC communication examples and listener patterns between CyberMP runtimes (Server, Client, CEF Browser).',
    getRpcFlowSchema,
    async (args) => {
      try {
        const { from, to } = parseRpcFlowArgs(args);
        const flow = getRpcFlow(from as RpcRuntime, to as RpcRuntime);
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
