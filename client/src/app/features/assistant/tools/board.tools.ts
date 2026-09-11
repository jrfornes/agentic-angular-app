import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { z } from 'zod';

import { createFrontendTool } from '../../../core/agent/tool-definition';
import { BoardStore } from '../../board/board.store';
import type { Task } from '../../board/task.model';

/**
 * Frontend tools: functions the agent may call, executed *in the browser*.
 * They give the agent eyes (getBoard) and hands (createTask, moveTask,
 * navigateTo) inside the application – without the server ever holding UI state.
 *
 * Handlers run in an injection context, so `inject()` works.
 */

const toolTask = (task: Task) => ({
  id: task.id,
  title: task.title,
  status: task.status,
  priority: task.priority,
  estimateHours: task.estimateHours,
});

export const getBoardTool = createFrontendTool({
  name: 'getBoard',
  description:
    'Returns all tasks on the board with id, title, status (backlog | in-progress | done), priority and estimate. Call this before answering anything about tasks.',
  parameters: z.object({}),
  handler: async () => {
    const store = inject(BoardStore);
    return { tasks: store.tasks().map(toolTask) };
  },
});

export const createTaskTool = createFrontendTool({
  name: 'createTask',
  description: 'Creates a new task in the backlog column and returns it.',
  parameters: z.object({
    title: z.string().min(1).describe('Task title'),
    priority: z.enum(['low', 'medium', 'high']).optional().describe('Defaults to medium'),
    estimateHours: z.number().optional().describe('Estimated effort in hours'),
  }),
  handler: async ({ title, priority, estimateHours }) => {
    const store = inject(BoardStore);
    const task = store.add({ title, priority, estimateHours });
    return { task: toolTask(task) };
  },
});

export const moveTaskTool = createFrontendTool({
  name: 'moveTask',
  description: 'Moves a task (identified by id or a title fragment) to another column.',
  parameters: z.object({
    query: z.string().describe('Task id or (part of) the task title'),
    status: z.enum(['backlog', 'in-progress', 'done']),
  }),
  handler: async ({ query, status }) => {
    const store = inject(BoardStore);
    const task = store.find(query);
    if (!task) {
      return { error: `No task matches "${query}"` };
    }
    const moved = store.move(task.id, status);
    return { task: moved ? toolTask(moved) : undefined };
  },
});

export const navigateToTool = createFrontendTool({
  name: 'navigateTo',
  description: 'Navigates the app to a page. Available pages: "board", "about".',
  parameters: z.object({ page: z.enum(['board', 'about']) }),
  handler: async ({ page }) => {
    await inject(Router).navigate([`/${page}`]);
    return { ok: true };
  },
});

export const boardTools = [getBoardTool, createTaskTool, moveTaskTool, navigateToTool];
