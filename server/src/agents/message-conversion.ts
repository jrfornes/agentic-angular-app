import type { Message } from '@ag-ui/core';
import type { ModelMessage } from 'ai';

import { contentToText, safeJsonParse } from './conversation.js';

/**
 * AG-UI messages → Vercel AI SDK `ModelMessage`s.
 *
 * This is the seam between the protocol (what the client speaks) and the agent
 * framework (what the model speaks). Swapping the AI SDK for LangGraph, Mastra,
 * ADK, ... means rewriting *this file and llm-agent.ts* – nothing in Angular.
 */
export function toModelMessages(messages: Message[]): ModelMessage[] {
  const toolNames = new Map<string, string>();
  const result: ModelMessage[] = [];

  for (const message of messages) {
    switch (message.role) {
      case 'system':
        result.push({ role: 'system', content: message.content });
        break;

      case 'developer':
        // The Angular app uses developer messages to report UI events (e.g. an
        // A2UI form submission). The model should treat them as trusted context.
        result.push({ role: 'user', content: `[application event] ${message.content}` });
        break;

      case 'user':
        result.push({ role: 'user', content: contentToText(message.content) });
        break;

      case 'assistant': {
        const parts: Array<
          | { type: 'text'; text: string }
          | { type: 'tool-call'; toolCallId: string; toolName: string; input: unknown }
        > = [];
        if (message.content) {
          parts.push({ type: 'text', text: message.content });
        }
        for (const call of message.toolCalls ?? []) {
          toolNames.set(call.id, call.function.name);
          parts.push({
            type: 'tool-call',
            toolCallId: call.id,
            toolName: call.function.name,
            input: safeJsonParse(call.function.arguments) ?? {},
          });
        }
        if (parts.length > 0) {
          result.push({ role: 'assistant', content: parts });
        }
        break;
      }

      case 'tool':
        result.push({
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: message.toolCallId,
              toolName: toolNames.get(message.toolCallId) ?? 'unknown',
              output: { type: 'text', value: message.content },
            },
          ],
        });
        break;

      default:
        // `activity` and `reasoning` messages are UI artefacts, not model context.
        break;
    }
  }

  return result;
}
