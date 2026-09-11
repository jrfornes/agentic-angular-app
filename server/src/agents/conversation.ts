import type { Message, RunAgentInput, Tool } from '@ag-ui/core';

/**
 * Helpers for reading an AG-UI `RunAgentInput`. AG-UI sends the whole
 * conversation with every run (unless the server keeps memory), so an agent can
 * be completely stateless: everything it needs is in `input.messages`.
 */

export function lastMessage(input: RunAgentInput): Message | undefined {
  return input.messages.at(-1);
}

export function lastUserMessage(input: RunAgentInput): { index: number; text: string } | null {
  for (let index = input.messages.length - 1; index >= 0; index--) {
    const message = input.messages[index];
    if (message.role === 'user') {
      return { index, text: contentToText(message.content) };
    }
  }
  return null;
}

export function contentToText(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => (part && typeof part === 'object' && 'text' in part ? String(part.text) : ''))
      .join(' ')
      .trim();
  }
  return '';
}

/**
 * Collects results of tool calls that happened *after* the given message index –
 * i.e. the client tool results that arrived in response to our previous run.
 */
export function toolResultsSince(
  input: RunAgentInput,
  fromIndex: number,
): Map<string, { toolCallId: string; args: unknown; result: unknown }> {
  const callsById = new Map<string, { name: string; args: unknown }>();
  const results = new Map<string, { toolCallId: string; args: unknown; result: unknown }>();

  for (const message of input.messages.slice(fromIndex + 1)) {
    if (message.role === 'assistant') {
      for (const call of message.toolCalls ?? []) {
        callsById.set(call.id, {
          name: call.function.name,
          args: safeJsonParse(call.function.arguments),
        });
      }
    }
    if (message.role === 'tool') {
      const call = callsById.get(message.toolCallId);
      if (call) {
        results.set(call.name, {
          toolCallId: message.toolCallId,
          args: call.args,
          result: safeJsonParse(message.content),
        });
      }
    }
  }
  return results;
}

export function hasClientTool(input: RunAgentInput, name: string): Tool | undefined {
  return input.tools.find((tool) => tool.name === name);
}

export function safeJsonParse(value: string | undefined): unknown {
  if (value === undefined) {
    return undefined;
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
