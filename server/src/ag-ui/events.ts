import { type BaseEvent, EventType } from '@ag-ui/core';
import { randomUUID } from 'node:crypto';

/**
 * Small, typed helpers for producing AG-UI events. They exist so both agents
 * (scripted and LLM-backed) speak exactly the same dialect, and so the
 * protocol stays visible instead of being buried inside an agent framework.
 */

export function runStarted(threadId: string, runId: string): BaseEvent {
  return { type: EventType.RUN_STARTED, threadId, runId } as BaseEvent;
}

export function runFinished(threadId: string, runId: string): BaseEvent {
  return { type: EventType.RUN_FINISHED, threadId, runId } as BaseEvent;
}

export function runError(message: string, code = 'run_error'): BaseEvent {
  return { type: EventType.RUN_ERROR, message, code } as BaseEvent;
}

/** A complete assistant text message as the three AG-UI text events. */
export function textMessage(content: string, messageId: string = randomUUID()): BaseEvent[] {
  return [
    { type: EventType.TEXT_MESSAGE_START, messageId, role: 'assistant' } as BaseEvent,
    { type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: content } as BaseEvent,
    { type: EventType.TEXT_MESSAGE_END, messageId } as BaseEvent,
  ];
}

/** Splits text into word chunks to make streaming visible in the UI. */
export function* streamedTextMessage(
  content: string,
  messageId: string = randomUUID(),
): Generator<BaseEvent> {
  yield { type: EventType.TEXT_MESSAGE_START, messageId, role: 'assistant' } as BaseEvent;
  const words = content.split(/(\s+)/);
  let buffer = '';
  for (const word of words) {
    buffer += word;
    if (buffer.length >= 12) {
      yield { type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: buffer } as BaseEvent;
      buffer = '';
    }
  }
  if (buffer) {
    yield { type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: buffer } as BaseEvent;
  }
  yield { type: EventType.TEXT_MESSAGE_END, messageId } as BaseEvent;
}

/**
 * Announces a tool call (server- or client-side, AG-UI does not distinguish here).
 * `parentMessageId` links the call to the assistant message it belongs to.
 */
export function toolCall(
  toolCallName: string,
  args: unknown,
  ids: { toolCallId?: string; parentMessageId?: string } = {},
): { toolCallId: string; events: BaseEvent[] } {
  const toolCallId = ids.toolCallId ?? randomUUID();
  const parentMessageId = ids.parentMessageId ?? randomUUID();
  return {
    toolCallId,
    events: [
      {
        type: EventType.TOOL_CALL_START,
        toolCallId,
        toolCallName,
        parentMessageId,
      } as BaseEvent,
      {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId,
        delta: JSON.stringify(args ?? {}),
      } as BaseEvent,
      { type: EventType.TOOL_CALL_END, toolCallId } as BaseEvent,
    ],
  };
}

/** Result of a tool the *server* executed. Client tools answer in the next run instead. */
export function toolCallResult(toolCallId: string, result: unknown): BaseEvent {
  return {
    type: EventType.TOOL_CALL_RESULT,
    toolCallId,
    messageId: randomUUID(),
    role: 'tool',
    content: typeof result === 'string' ? result : JSON.stringify(result),
  } as BaseEvent;
}

/**
 * Carries a non-text artefact (an A2UI surface, an MCP App reference, ...).
 * The `activityType` tells the client which renderer to use.
 */
export function activitySnapshot(
  activityType: string,
  content: Record<string, unknown>,
  messageId: string = randomUUID(),
): BaseEvent {
  return {
    type: EventType.ACTIVITY_SNAPSHOT,
    messageId,
    activityType,
    content,
  } as BaseEvent;
}

export const A2UI_ACTIVITY_TYPE = 'a2ui-surface';

/** Recognises a tool result that carries an A2UI surface and wraps it as an activity. */
export function a2uiActivityFromToolResult(result: unknown): BaseEvent | null {
  if (!result || typeof result !== 'object') {
    return null;
  }
  const record = result as Record<string, unknown>;
  const surfaceId = record['surfaceId'];
  const operations = record['messages'];
  if (typeof surfaceId !== 'string' || !Array.isArray(operations) || operations.length === 0) {
    return null;
  }
  // The activity is keyed by the surface id: AG-UI replaces an existing message with
  // the same id, so reusing the assistant message id would overwrite that message.
  return activitySnapshot(A2UI_ACTIVITY_TYPE, { operations }, surfaceId);
}
