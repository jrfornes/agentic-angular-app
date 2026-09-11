import { HttpAgent, randomUUID } from '@ag-ui/client';
import { inject } from '@angular/core';
import {
  CopilotKit,
  type FrontendToolConfig,
  registerFrontendTool,
  registerRenderToolCall,
  type RenderToolCallConfig,
} from '@copilotkit/angular';

import { AgUiEventLog } from './event-log';
import { FallbackToolCard, fallbackToolCard } from './fallback-tool-card';

export interface InitAgentStoreConfig {
  /** Id under which CopilotKit knows the agent; tools are bound to it. */
  agentId: string;
  /** The AG-UI endpoint. Anything that speaks AG-UI works here. */
  url: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  frontendTools?: readonly FrontendToolConfig<any>[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toolCallRenderers?: readonly RenderToolCallConfig<any>[];
}

/**
 * Registers an AG-UI agent with CopilotKit *at runtime* and binds the given
 * frontend tools/renderers to it. Must run in an injection context.
 *
 * Why not configure everything in `provideCopilotKit`? Because feature areas
 * (and their tools) should be lazy-loadable and self-contained. This helper
 * lets a feature own its agent setup.
 */
export function initAgentStore(config: InitAgentStoreConfig): void {
  const copilotKit = inject(CopilotKit);
  const eventLog = inject(AgUiEventLog);

  if (!copilotKit.agents()[config.agentId]) {
    const agent = new HttpAgent({ agentId: config.agentId, url: config.url, threadId: randomUUID() });
    agent.subscribe({ onEvent: ({ event }) => eventLog.record(event) });

    copilotKit.updateRuntime({
      selfManagedAgents: { ...copilotKit.agents(), [config.agentId]: agent },
    });
  }

  for (const tool of config.frontendTools ?? []) {
    registerFrontendTool({
      ...tool,
      component: tool.component ?? FallbackToolCard,
      agentId: config.agentId,
    });
  }

  const hasFallback = copilotKit.toolCallRenderConfigs().some((renderer) => renderer.name === '*');
  if (!hasFallback) {
    registerRenderToolCall(fallbackToolCard);
  }

  for (const renderer of config.toolCallRenderers ?? []) {
    registerRenderToolCall({ ...renderer, agentId: config.agentId });
  }
}
