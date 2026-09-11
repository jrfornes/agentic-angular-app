import { AbstractAgent } from '@ag-ui/client';
import type { BaseEvent, RunAgentInput } from '@ag-ui/core';
import { Observable } from 'rxjs';

import {
  a2uiActivityFromToolResult,
  runFinished,
  runStarted,
  streamedTextMessage,
  toolCall,
  toolCallResult,
} from '../ag-ui/events.js';
import type { McpConnection } from '../mcp/mcp-tools.js';
import { estimateTask, showBoardDashboard, showNewTaskForm } from '../tools/server-tools.js';
import { hasClientTool, lastMessage, lastUserMessage, toolResultsSince } from './conversation.js';

/**
 * An AG-UI agent that needs **no language model**.
 *
 * Why does this exist? Because everything that makes a UI "agentic" – streaming
 * text, server tools, client tools, widgets, dynamic A2UI surfaces, MCP calls –
 * is visible in the *protocol*, not in the model. Emitting the events by hand
 * makes the protocol tangible and gives you a deterministic playground.
 *
 * Every branch below corresponds to an AG-UI pattern:
 *   - text only                       → TEXT_MESSAGE_*
 *   - server tool                     → TOOL_CALL_* + TOOL_CALL_RESULT (executed here)
 *   - client tool                     → TOOL_CALL_* (executed by Angular, result arrives in the next run)
 *   - widget                          → client tool with a component, no follow-up run
 *   - dynamic UI                      → server tool result → ACTIVITY_SNAPSHOT (a2ui-surface)
 *   - MCP                             → server tool that is proxied to an MCP server
 */
export class ScriptedAgent extends AbstractAgent {
  constructor(private readonly mcp: McpConnection | null) {
    super();
  }

  run(input: RunAgentInput): Observable<BaseEvent> {
    return new Observable<BaseEvent>((observer) => {
      let cancelled = false;
      const emit = (events: Iterable<BaseEvent>) => {
        for (const event of events) {
          if (cancelled) return;
          observer.next(event);
        }
      };

      (async () => {
        emit([runStarted(input.threadId, input.runId)]);
        try {
          await this.handle(input, emit);
          emit([runFinished(input.threadId, input.runId)]);
          observer.complete();
        } catch (error) {
          observer.error(error);
        }
      })();

      return () => {
        cancelled = true;
      };
    });
  }

  private async handle(input: RunAgentInput, emit: (events: Iterable<BaseEvent>) => void): Promise<void> {
    const last = lastMessage(input);

    // The Angular app reports UI events (e.g. an A2UI form was submitted) as
    // developer messages. Acknowledge them instead of re-parsing the user text.
    if (last?.role === 'developer') {
      const created = tryParseJson(last.content) as { task?: TaskLike } | null;
      if (created?.task && hasClientTool(input, 'taskCard')) {
        emit(streamedTextMessage(`Done – "${created.task.title}" is on the board now.`));
        emit(toolCall('taskCard', { task: created.task }).events);
      } else {
        emit(streamedTextMessage('Noted.'));
      }
      return;
    }

    const user = lastUserMessage(input);
    if (!user) {
      emit(streamedTextMessage('Hi! Ask me about your task board, e.g. "show the board" or "dashboard".'));
      return;
    }

    const text = user.text.trim();
    const lower = text.toLowerCase();
    const results = toolResultsSince(input, user.index);
    const board = results.get('getBoard')?.result as { tasks?: TaskLike[] } | undefined;

    // --- help -----------------------------------------------------------------
    if (/^(help|\?|what can you do)/.test(lower)) {
      emit(
        streamedTextMessage(
          [
            'I am the **scripted** agent – no LLM involved, every response is hand-written AG-UI. Try:',
            '',
            '- `show the board` → client tool `getBoard` + task-card widgets',
            '- `dashboard` → client tool, then server tool `showBoardDashboard` → **A2UI** surface',
            '- `new task form` → server tool `showNewTaskForm` → interactive **A2UI** form',
            '- `create task Add dark mode` → client tool `createTask`',
            '- `start <task title>` / `finish <task title>` → client tool `moveTask`',
            '- `estimate Migrate auth to OAuth` → server tool `estimateTask`',
            '- `ci status` / `docs signals` → tools proxied to the **MCP** server',
            '',
            'Set `OPENAI_API_KEY` (or `GOOGLE_GENERATIVE_AI_API_KEY`) on the server to swap me for a real model – the Angular app stays untouched.',
          ].join('\n'),
        ),
      );
      return;
    }

    // --- create task ----------------------------------------------------------
    const create = /^(?:create|add)\s+(?:a\s+)?task[:\s]+(.+)$/i.exec(text);
    if (create) {
      const created = results.get('createTask')?.result as { task?: TaskLike } | undefined;
      if (!created) {
        const priority = /urgent|high|asap/.test(lower) ? 'high' : /low|minor/.test(lower) ? 'low' : 'medium';
        emit(toolCall('createTask', { title: create[1].trim(), priority }).events);
        return; // Angular executes createTask and re-runs us with the result.
      }
      emit(streamedTextMessage(`Created "${created.task?.title}".`));
      if (created.task && hasClientTool(input, 'taskCard')) {
        emit(toolCall('taskCard', { task: created.task }).events);
      }
      return;
    }

    // --- move task ------------------------------------------------------------
    const move = /^(start|begin|finish|complete|done|reopen)\s+(?:task\s+)?(.+)$/i.exec(text);
    if (move) {
      const moved = results.get('moveTask')?.result as { task?: TaskLike; error?: string } | undefined;
      if (!moved) {
        const verb = move[1].toLowerCase();
        const status = /start|begin/.test(verb) ? 'in-progress' : /reopen/.test(verb) ? 'backlog' : 'done';
        emit(toolCall('moveTask', { query: move[2].trim(), status }).events);
        return;
      }
      if (moved.error) {
        emit(streamedTextMessage(`I could not do that: ${moved.error}`));
      } else {
        emit(streamedTextMessage(`Moved "${moved.task?.title}" to **${moved.task?.status}**.`));
        if (moved.task && hasClientTool(input, 'taskCard')) {
          emit(toolCall('taskCard', { task: moved.task }).events);
        }
      }
      return;
    }

    // --- new task form (A2UI) ---------------------------------------------------
    if (/form/.test(lower)) {
      const titleMatch = /for\s+(.+)$/i.exec(text);
      await this.runServerTool(emit, showNewTaskForm, {
        title: titleMatch?.[1]?.trim(),
        priority: /high|urgent/.test(lower) ? 'high' : undefined,
      });
      emit(streamedTextMessage('Fill in the form and hit *Create task* – the button fires an A2UI event that the Angular app handles locally.'));
      return;
    }

    // --- dashboard (client tool → server tool → A2UI) ---------------------------
    if (/dashboard|summary|overview|stats/.test(lower)) {
      if (!board) {
        emit(toolCall('getBoard', {}).events);
        return;
      }
      await this.runServerTool(emit, showBoardDashboard, { tasks: board.tasks ?? [] });
      emit(streamedTextMessage('Here is your dashboard. The *Open* buttons are A2UI events handled by the client.'));
      return;
    }

    // --- show board (client tool → text + widgets) -----------------------------
    if (/board|tasks|what.*(working|doing)|list/.test(lower)) {
      if (!board) {
        emit(toolCall('getBoard', {}).events);
        return;
      }
      const tasks = board.tasks ?? [];
      const inProgress = tasks.filter((task) => task.status === 'in-progress');
      const summary =
        `You have **${tasks.length}** tasks: ` +
        `${count(tasks, 'backlog')} in backlog, ${inProgress.length} in progress, ${count(tasks, 'done')} done.` +
        (inProgress.length ? ' Currently in progress:' : '');
      emit(streamedTextMessage(summary));
      if (hasClientTool(input, 'taskCard')) {
        for (const task of inProgress.slice(0, 3)) {
          emit(toolCall('taskCard', { task }).events);
        }
      }
      return;
    }

    // --- estimate (server tool) -------------------------------------------------
    const estimate = /^(?:estimate|how long)[:\s]+(.+)$/i.exec(text);
    if (estimate) {
      const result = (await this.runServerTool(emit, estimateTask, { title: estimate[1].trim() })) as {
        hours: number;
        confidence: string;
      };
      emit(
        streamedTextMessage(
          `Roughly **${result.hours} hours** (confidence: ${result.confidence}). The estimate came from a server-side tool; you only saw the call and its result via AG-UI.`,
        ),
      );
      return;
    }

    // --- MCP tools --------------------------------------------------------------
    if (this.mcp) {
      const ci = /ci|pipeline|build status/.test(lower) ? this.mcp.tools.find((t) => t.name === 'get_ci_status') : undefined;
      if (ci) {
        const branch = /(?:branch|for|of)\s+([\w\/-]+)$/i.exec(text)?.[1] ?? 'main';
        const status = (await this.runMcpTool(emit, ci.name, { branch })) as Record<string, unknown>;
        emit(streamedTextMessage(`CI for \`${branch}\`: **${status['status']}** – ${status['summary']}. (Answered by the MCP server.)`));
        return;
      }
      const docs = /docs?|guideline|how (do|should) (we|i)/.test(lower) ? this.mcp.tools.find((t) => t.name === 'search_docs') : undefined;
      if (docs) {
        const query = text.replace(/^(search\s+)?docs?\s*(for|about)?/i, '').trim() || text;
        const found = (await this.runMcpTool(emit, docs.name, { query })) as { results?: Array<{ title: string; excerpt: string }> };
        const lines = (found.results ?? []).map((hit) => `- **${hit.title}** – ${hit.excerpt}`);
        emit(streamedTextMessage(lines.length ? `From the team guidelines (via MCP):\n\n${lines.join('\n')}` : `No guideline matched "${query}".`));
        return;
      }
    }

    // --- fallback ---------------------------------------------------------------
    emit(
      streamedTextMessage(
        `I am running in scripted mode and did not recognise "${text}". Type **help** to see what I can demonstrate, or configure an LLM on the server for free-form conversation.`,
      ),
    );
  }

  /** Executes a server tool and emits the AG-UI events describing it (plus an A2UI activity if applicable). */
  private async runServerTool<Args>(
    emit: (events: Iterable<BaseEvent>) => void,
    tool: { name: string; execute: (args: Args) => Promise<unknown> },
    args: Args,
  ): Promise<unknown> {
    const call = toolCall(tool.name, args);
    emit(call.events);
    const result = await tool.execute(args);
    emit([toolCallResult(call.toolCallId, result)]);
    const activity = a2uiActivityFromToolResult(result);
    if (activity) {
      emit([activity]);
    }
    return result;
  }

  private async runMcpTool(
    emit: (events: Iterable<BaseEvent>) => void,
    name: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const tool = this.mcp?.tools.find((candidate) => candidate.name === name);
    if (!tool) {
      throw new Error(`MCP tool ${name} not available`);
    }
    return this.runServerTool(emit, { name, execute: tool.call }, args);
  }
}

interface TaskLike {
  id: string;
  title: string;
  status: 'backlog' | 'in-progress' | 'done';
  priority: 'low' | 'medium' | 'high';
  estimateHours?: number;
}

function count(tasks: TaskLike[], status: TaskLike['status']): number {
  return tasks.filter((task) => task.status === status).length;
}

function tryParseJson(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
