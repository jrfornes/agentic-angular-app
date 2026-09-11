import { AbstractAgent } from '@ag-ui/client';
import { type BaseEvent, EventType, type RunAgentInput } from '@ag-ui/core';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { dynamicTool, jsonSchema, type LanguageModel, stepCountIs, streamText, tool, type ToolSet } from 'ai';
import { randomUUID } from 'node:crypto';
import { Observable } from 'rxjs';

import { a2uiActivityFromToolResult, runFinished, runStarted, toolCallResult } from '../ag-ui/events.js';
import { config } from '../config.js';
import type { McpConnection } from '../mcp/mcp-tools.js';
import { serverTools } from '../tools/server-tools.js';
import { toModelMessages } from './message-conversion.js';
import { SYSTEM_PROMPT } from './system-prompt.js';

/**
 * An AG-UI agent backed by a real language model through the Vercel AI SDK.
 *
 * The AI SDK is itself provider-agnostic, so the same code runs against OpenAI,
 * any OpenAI-compatible endpoint (Ollama, vLLM, LM Studio, Azure), or Gemini.
 * On top, AG-UI makes the *client* agnostic of this whole file: swap the AI SDK
 * for Mastra, LangGraph, Google ADK, Pydantic AI, ... and the Angular app keeps
 * working because it only consumes AG-UI events.
 */
export class LlmAgent extends AbstractAgent {
  private readonly model: LanguageModel;

  constructor(private readonly mcp: McpConnection | null) {
    super();
    this.model = createModel();
  }

  run(input: RunAgentInput): Observable<BaseEvent> {
    return new Observable<BaseEvent>((observer) => {
      const abort = new AbortController();
      this.execute(input, (event) => observer.next(event), abort.signal)
        .then(() => observer.complete())
        .catch((error) => observer.error(error));
      return () => abort.abort();
    });
  }

  private async execute(
    input: RunAgentInput,
    emit: (event: BaseEvent) => void,
    signal: AbortSignal,
  ): Promise<void> {
    emit(runStarted(input.threadId, input.runId));

    const tools = this.buildToolSet(input);
    const result = streamText({
      model: this.model,
      system: SYSTEM_PROMPT,
      messages: toModelMessages(input.messages),
      tools,
      // Server tools are executed and fed back to the model automatically; the
      // loop stops on its own when the model calls a *client* tool (no execute).
      stopWhen: stepCountIs(8),
      abortSignal: signal,
    });

    let stepMessageId = randomUUID();
    let textIdForStep: string | null = null;
    const startedToolCalls = new Set<string>();

    for await (const part of result.fullStream) {
      switch (part.type) {
        case 'start-step':
          stepMessageId = randomUUID();
          textIdForStep = null;
          break;

        case 'text-start': {
          // Text and tool calls of one step share an assistant message id.
          const messageId: string = textIdForStep ? part.id : stepMessageId;
          textIdForStep ??= messageId;
          emit({ type: EventType.TEXT_MESSAGE_START, messageId, role: 'assistant' } as BaseEvent);
          break;
        }
        case 'text-delta':
          emit({
            type: EventType.TEXT_MESSAGE_CONTENT,
            messageId: textIdForStep === stepMessageId ? stepMessageId : part.id,
            delta: part.text,
          } as BaseEvent);
          break;
        case 'text-end':
          emit({
            type: EventType.TEXT_MESSAGE_END,
            messageId: textIdForStep === stepMessageId ? stepMessageId : part.id,
          } as BaseEvent);
          break;

        case 'tool-input-start':
          startedToolCalls.add(part.id);
          emit({
            type: EventType.TOOL_CALL_START,
            toolCallId: part.id,
            toolCallName: part.toolName,
            parentMessageId: stepMessageId,
          } as BaseEvent);
          break;
        case 'tool-input-delta':
          emit({ type: EventType.TOOL_CALL_ARGS, toolCallId: part.id, delta: part.delta } as BaseEvent);
          break;
        case 'tool-input-end':
          emit({ type: EventType.TOOL_CALL_END, toolCallId: part.id } as BaseEvent);
          break;

        case 'tool-call':
          // Providers that do not stream tool arguments only emit this part.
          if (!startedToolCalls.has(part.toolCallId)) {
            startedToolCalls.add(part.toolCallId);
            emit({
              type: EventType.TOOL_CALL_START,
              toolCallId: part.toolCallId,
              toolCallName: part.toolName,
              parentMessageId: stepMessageId,
            } as BaseEvent);
            emit({
              type: EventType.TOOL_CALL_ARGS,
              toolCallId: part.toolCallId,
              delta: JSON.stringify(part.input ?? {}),
            } as BaseEvent);
            emit({ type: EventType.TOOL_CALL_END, toolCallId: part.toolCallId } as BaseEvent);
          }
          break;

        case 'tool-result': {
          emit(toolCallResult(part.toolCallId, part.output));
          const activity = a2uiActivityFromToolResult(part.output);
          if (activity) {
            emit(activity);
          }
          break;
        }
        case 'tool-error':
          // Sent back as a result so the model can self-correct (e.g. invalid A2UI).
          emit(toolCallResult(part.toolCallId, { error: String((part as { error: unknown }).error) }));
          break;

        case 'error':
          throw part.error instanceof Error ? part.error : new Error(String(part.error));

        default:
          break;
      }
    }

    emit(runFinished(input.threadId, input.runId));
  }

  /**
   * Server tools carry an `execute`; client tools (announced by the Angular app
   * in `input.tools`) do not – the AI SDK then hands the call back to us and
   * AG-UI transports it to the browser.
   */
  private buildToolSet(input: RunAgentInput): ToolSet {
    const toolSet: ToolSet = {};

    for (const serverTool of serverTools) {
      toolSet[serverTool.name] = tool({
        description: serverTool.description,
        inputSchema: serverTool.parameters,
        execute: (args) => serverTool.execute(args),
      });
    }

    for (const mcpTool of this.mcp?.tools ?? []) {
      toolSet[mcpTool.name] = dynamicTool({
        description: mcpTool.description,
        inputSchema: jsonSchema(mcpTool.inputSchema as Parameters<typeof jsonSchema>[0]),
        execute: (args) => mcpTool.call(args as Record<string, unknown>),
      });
    }

    for (const clientTool of input.tools) {
      toolSet[clientTool.name] = dynamicTool({
        description: clientTool.description,
        inputSchema: jsonSchema(clientTool.parameters as Parameters<typeof jsonSchema>[0]),
      });
    }

    return toolSet;
  }
}

function createModel(): LanguageModel {
  switch (config.provider) {
    case 'google':
      return createGoogleGenerativeAI()(config.google.model);
    case 'openai':
    default: {
      const openai = createOpenAI({ apiKey: config.openai.apiKey, baseURL: config.openai.baseUrl });
      // `.chat` is the plain chat-completions API – the widest compatible surface
      // for OpenAI-compatible servers such as Ollama.
      return config.openai.baseUrl ? openai.chat(config.openai.model) : openai(config.openai.model);
    }
  }
}
