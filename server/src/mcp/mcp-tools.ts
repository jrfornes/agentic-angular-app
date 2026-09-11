import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

/**
 * MCP (Model Context Protocol) standardises how *agents* connect to *tools*.
 * AG-UI standardises how *clients* connect to *agents*. They are complementary:
 *
 *   Angular  ──AG-UI──▶  agent server  ──MCP──▶  MCP server(s)
 *
 * The browser never talks to the MCP server. From the client's point of view an
 * MCP tool is just another server-side tool call in the AG-UI stream.
 */
export interface McpToolDescriptor {
  name: string;
  description: string;
  /** JSON Schema of the tool input, as published by the MCP server. */
  inputSchema: Record<string, unknown>;
  call: (args: Record<string, unknown>) => Promise<unknown>;
}

export interface McpConnection {
  serverName: string;
  tools: McpToolDescriptor[];
  close: () => Promise<void>;
}

export async function connectMcpTools(url: string): Promise<McpConnection | null> {
  if (!url) {
    return null;
  }
  const client = new Client({ name: 'agentic-angular-agent', version: '1.0.0' });
  let tools: Awaited<ReturnType<Client['listTools']>>['tools'];
  try {
    const transport = new StreamableHTTPClientTransport(new URL(url));
    await client.connect(transport);
    tools = (await client.listTools()).tools;
  } catch (error) {
    console.warn(
      `[mcp] could not connect to ${url} (${error instanceof Error ? error.message : error}). Continuing without MCP tools.`,
    );
    return null;
  }

  const descriptors: McpToolDescriptor[] = tools.map((tool) => ({
    name: tool.name,
    description: tool.description ?? tool.name,
    inputSchema: tool.inputSchema as Record<string, unknown>,
    call: async (args) => {
      const result = await client.callTool({ name: tool.name, arguments: args });
      if (result.structuredContent) {
        return result.structuredContent;
      }
      const content = result.content as Array<{ type: string; text?: string }>;
      return content
        .filter((part) => part.type === 'text')
        .map((part) => part.text ?? '')
        .join('\n');
    },
  }));

  const serverName = client.getServerVersion()?.name ?? url;
  console.log(`[mcp] connected to "${serverName}", tools: ${descriptors.map((t) => t.name).join(', ')}`);

  return { serverName, tools: descriptors, close: () => client.close() };
}
