import { z } from 'zod';

import { boardDashboardSurface, newTaskFormSurface } from '../a2ui/surfaces.js';
import { validateA2uiSurface } from '../a2ui/validate.js';

/**
 * Server-side tools: executed by the agent itself, results go back to the model.
 * The client only *sees* these calls (AG-UI TOOL_CALL_* + TOOL_CALL_RESULT
 * events) so it can visualise them; it never executes them.
 *
 * The shape below is deliberately framework-neutral. Both the scripted agent
 * and the LLM agent (via the Vercel AI SDK adapter in llm-agent.ts) use it.
 */
export interface ServerTool<Args = unknown> {
  name: string;
  description: string;
  parameters: z.ZodType<Args>;
  execute: (args: Args) => Promise<unknown>;
}

function defineTool<Args>(tool: ServerTool<Args>): ServerTool<Args> {
  return tool;
}

const taskSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.enum(['backlog', 'in-progress', 'done']),
  priority: z.enum(['low', 'medium', 'high']),
  estimateHours: z.number().optional(),
});

export const estimateTask = defineTool({
  name: 'estimateTask',
  description:
    'Estimates the effort of a development task in hours. Use it when the user asks how long something takes or wants an estimate.',
  parameters: z.object({
    title: z.string().describe('Short title of the task'),
    description: z.string().optional().describe('Optional details'),
  }),
  execute: async ({ title, description }) => {
    // Deterministic pseudo-estimation so the demo behaves the same for everyone.
    const text = `${title} ${description ?? ''}`.toLowerCase();
    let hours = 2;
    if (/refactor|migrat|architect|auth|security/.test(text)) hours += 6;
    if (/test|spec|e2e/.test(text)) hours += 2;
    if (/ui|component|form|page|dialog/.test(text)) hours += 3;
    if (/api|endpoint|backend|database|db/.test(text)) hours += 4;
    hours += Math.min(6, Math.floor(text.length / 40));
    return {
      hours,
      confidence: hours > 10 ? 'low' : hours > 5 ? 'medium' : 'high',
      rationale: `Heuristic estimate based on keywords in "${title}".`,
    };
  },
});

export const showBoardDashboard = defineTool({
  name: 'showBoardDashboard',
  description:
    'Renders an interactive dashboard (counters per column, open high-priority tasks) for the given tasks. Call getBoard first to obtain the tasks, then pass them here. The dashboard IS the answer; add at most one short sentence of text.',
  parameters: z.object({ tasks: z.array(taskSummarySchema) }),
  execute: async ({ tasks }) => boardDashboardSurface(tasks),
});

export const showNewTaskForm = defineTool({
  name: 'showNewTaskForm',
  description:
    'Shows an interactive form the user can fill in to create a task. Use it when the user wants to create a task but has not given all details, or explicitly asks for a form. Optionally pre-fill the title and priority.',
  parameters: z.object({
    title: z.string().optional(),
    priority: z.enum(['low', 'medium', 'high']).optional(),
  }),
  execute: async (defaults) => newTaskFormSurface(defaults),
});

export const renderA2ui = defineTool({
  name: 'renderA2ui',
  description: `Renders a custom user interface described as A2UI v0.9 messages. Only use this when none of the other UI tools fit.
Input: { "messages": A2uiMessage[] } for ONE surface:
 1) exactly one createSurface with a fresh surfaceId and catalogId "https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json"
 2) exactly one updateComponents whose components define an entry with id "root"
 3) any number of updateDataModel messages providing values bound via { "path": "/..." }.
Rules: all messages use version "v0.9" and the same surfaceId. Row/Column/List take a "children" array of ids; Card/Button/Modal take a single "child" id. Every referenced id must be defined. Text has "text" and optional "variant" (h1..h5, body, caption). Buttons use action: { event: { name, context } }.`,
  parameters: z.object({
    messages: z.array(z.record(z.string(), z.unknown())),
  }),
  execute: async (input) => validateA2uiSurface(input),
});

export const serverTools: ServerTool<any>[] = [
  estimateTask,
  showBoardDashboard,
  showNewTaskForm,
  renderA2ui,
];
