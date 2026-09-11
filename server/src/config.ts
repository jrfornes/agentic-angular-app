/**
 * All environment-driven knobs in one place.
 *
 * The agent server is deliberately independent of a concrete LLM vendor:
 *  - `scripted` runs without any model (deterministic, great for learning the protocol),
 *  - `openai` talks to OpenAI or *any* OpenAI-compatible endpoint (Ollama, LM Studio, vLLM, ...),
 *  - `google` talks to Gemini.
 *
 * The Angular client never sees any of this: it only speaks AG-UI over HTTP/SSE.
 */
export type LlmProvider = 'scripted' | 'openai' | 'google';

function detectProvider(): LlmProvider {
  const explicit = process.env['LLM_PROVIDER'] as LlmProvider | undefined;
  if (explicit) {
    return explicit;
  }
  if (process.env['OPENAI_API_KEY'] || process.env['OPENAI_BASE_URL']) {
    return 'openai';
  }
  if (process.env['GOOGLE_GENERATIVE_AI_API_KEY']) {
    return 'google';
  }
  return 'scripted';
}

export const config = {
  port: Number(process.env['PORT'] ?? 3001),
  provider: detectProvider(),
  openai: {
    apiKey: process.env['OPENAI_API_KEY'] ?? 'not-needed-for-local-endpoints',
    baseUrl: process.env['OPENAI_BASE_URL'],
    model: process.env['OPENAI_MODEL'] ?? 'gpt-4.1-mini',
  },
  google: {
    model: process.env['GOOGLE_MODEL'] ?? 'gemini-2.5-flash',
  },
  mcp: {
    /** Set to an empty string to disable MCP integration. */
    serverUrl: process.env['MCP_SERVER_URL'] ?? 'http://127.0.0.1:3002/mcp',
  },
  /** Log every AG-UI event that leaves the server. Handy while learning the protocol. */
  logEvents: process.env['LOG_AG_UI_EVENTS'] !== 'false',
} as const;
