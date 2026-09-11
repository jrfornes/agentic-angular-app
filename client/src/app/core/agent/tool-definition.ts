import type { FrontendToolConfig, RenderToolCallConfig } from '@copilotkit/angular';

const TERMINAL_TOOL_HINT =
  '\n\nCalling this tool ENDS your turn – the agent is not invoked again afterwards. ' +
  'Gather all data and call other tools BEFORE it and emit it as the LAST tool call of the turn.';

/**
 * Identity helper for a browser-executed frontend tool.
 *
 * It exists for type inference only: TypeScript derives `Args` from the Zod
 * `parameters` schema, so the `handler` receives typed arguments without
 * repeating the type. For widgets (`followUp: false`) the description gets a
 * hint so the *model* also treats the call as the end of its turn.
 */
export function createFrontendTool<Args extends Record<string, unknown>>(
  tool: FrontendToolConfig<Args>,
): FrontendToolConfig<Args> {
  if (tool.followUp === false && !tool.description.includes(TERMINAL_TOOL_HINT)) {
    return { ...tool, description: tool.description + TERMINAL_TOOL_HINT };
  }
  return tool;
}

/**
 * Identity helper for rendering a tool call the *server* executes. Pure
 * presentation: schema + component, no handler.
 */
export function createRenderToolCall<Args extends Record<string, unknown>>(
  toolCall: RenderToolCallConfig<Args>,
): RenderToolCallConfig<Args> {
  return toolCall;
}
