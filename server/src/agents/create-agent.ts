import type { AbstractAgent } from '@ag-ui/client';

import { config } from '../config.js';
import type { McpConnection } from '../mcp/mcp-tools.js';
import { LlmAgent } from './llm-agent.js';
import { ScriptedAgent } from './scripted-agent.js';

/**
 * The only place that knows which agent implementation is in use.
 * Both implementations produce the same AG-UI events, so the client cannot
 * tell them apart – and that is exactly the point.
 */
export function createAgent(mcp: McpConnection | null): AbstractAgent {
  if (config.provider === 'scripted') {
    console.log('[agent] scripted agent (no LLM). Set OPENAI_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY to use a model.');
    return new ScriptedAgent(mcp);
  }
  console.log(`[agent] LLM agent via Vercel AI SDK, provider=${config.provider}`);
  return new LlmAgent(mcp);
}
