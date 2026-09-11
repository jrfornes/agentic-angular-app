import { RunAgentInputSchema } from '@ag-ui/core';
import cors from 'cors';
import express from 'express';

import { pipeEventsToSse } from './ag-ui/sse.js';
import { createAgent } from './agents/create-agent.js';
import { config } from './config.js';
import { connectMcpTools } from './mcp/mcp-tools.js';

/**
 * The AG-UI endpoint. One HTTP POST per *run*: the body is a `RunAgentInput`
 * (thread id, run id, messages, client tools, context, forwarded props), the
 * response is a stream of AG-UI events encoded as Server-Sent Events.
 *
 * That is the whole contract between the Angular client and this server.
 */
async function main(): Promise<void> {
  const mcp = await connectMcpTools(config.mcp.serverUrl);
  const agent = createAgent(mcp);

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));

  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      provider: config.provider,
      mcpTools: mcp?.tools.map((tool) => tool.name) ?? [],
    });
  });

  app.post('/ag-ui/board-agent', (req, res) => {
    const parsed = RunAgentInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid RunAgentInput', issues: parsed.error.issues });
      return;
    }
    const input = parsed.data;
    console.log(
      `[run] thread=${input.threadId} run=${input.runId} messages=${input.messages.length} clientTools=${input.tools.map((t) => t.name).join(',')}`,
    );
    pipeEventsToSse(agent.run(input), res, { log: config.logEvents });
  });

  app.listen(config.port, () => {
    console.log(`AG-UI agent server listening on http://localhost:${config.port}/ag-ui/board-agent`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
