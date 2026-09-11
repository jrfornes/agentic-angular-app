import { randomUUID } from '@ag-ui/client';
import type { Signal } from '@angular/core';
import type { AgentStore, CopilotKit } from '@copilotkit/angular';

/**
 * Thin wrappers around the agent store. The detour via `copilotKit.core.runAgent`
 * matters: only then do the registered frontend tools take part in the run.
 */
export async function sendMessage(
  copilotKit: CopilotKit,
  store: Signal<AgentStore>,
  content: string,
): Promise<void> {
  const agent = store().agent;
  agent.addMessage({ id: randomUUID(), role: 'user', content });
  await copilotKit.core.runAgent({ agent });
}

/**
 * Reports something the *application* did (e.g. "user submitted the A2UI form")
 * as a developer message so the agent can react without the user typing.
 */
export async function sendDeveloperMessage(
  copilotKit: CopilotKit,
  store: Signal<AgentStore>,
  content: string,
): Promise<void> {
  const agent = store().agent;
  agent.addMessage({ id: randomUUID(), role: 'developer', content });
  await copilotKit.core.runAgent({ agent });
}

export function stopRun(store: Signal<AgentStore>): void {
  store().agent.abortRun();
}

export function resetConversation(store: Signal<AgentStore>): void {
  const agent = store().agent;
  agent.abortRun();
  // `setMessages` notifies subscribers (and thereby the CopilotKit store signal);
  // assigning `agent.messages` directly would not.
  agent.setMessages([]);
  agent.threadId = randomUUID();
}
