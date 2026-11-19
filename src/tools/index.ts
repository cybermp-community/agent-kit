import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerGetEventTool } from './get-event.js';
import { registerGetTypeTool } from './get-type.js';
import { registerGetRpcFlowTool } from './get-rpc-flow.js';
import { registerSearchDocsTool } from './search-docs.js';

export * from './get-event.js';
export * from './get-type.js';
export * from './get-rpc-flow.js';
export * from './search-docs.js';

export function registerAllTools(server: McpServer): void {
  registerGetEventTool(server);
  registerGetTypeTool(server);
  registerGetRpcFlowTool(server);
  registerSearchDocsTool(server);
}
