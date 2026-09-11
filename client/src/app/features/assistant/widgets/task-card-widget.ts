import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { AngularToolCall, ToolRenderer } from '@copilotkit/angular';
import { z } from 'zod';

import { createFrontendTool } from '../../../core/agent/tool-definition';
import { BoardStore } from '../../board/board.store';
import { TaskCard } from '../../board/task-card';
import type { Task } from '../../board/task.model';

const taskSchema = z.object({
  id: z.string().describe('Task id'),
  title: z.string(),
  status: z.enum(['backlog', 'in-progress', 'done']),
  priority: z.enum(['low', 'medium', 'high']),
  estimateHours: z.number().optional(),
});

const taskCardArgsSchema = z.object({ task: taskSchema });
type TaskCardArgs = z.infer<typeof taskCardArgsSchema>;

/**
 * A *widget*: a frontend tool whose only job is to render a component.
 * The schema describes both the tool's parameters and the component's data.
 *
 * The rendered card is live: it reads the current task from the store (so it
 * updates when the task moves) and its buttons drive the store directly.
 */
@Component({
  selector: 'app-task-card-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TaskCard],
  template: `
    @let task = liveTask();
    @if (task) {
      <app-task-card [task]="task" (move)="store.move(task.id, $event)" />
    } @else {
      <p class="widget-hint">Loading card…</p>
    }
  `,
  styles: `:host { display: block; min-width: 260px; } .widget-hint { font-size: 12px; color: var(--text-muted); }`,
})
export class TaskCardWidget implements ToolRenderer<TaskCardArgs> {
  readonly toolCall = input.required<AngularToolCall<TaskCardArgs>>();
  protected readonly store = inject(BoardStore);

  protected readonly liveTask = computed<Task | null>(() => {
    const fromAgent = this.toolCall().args.task;
    if (!fromAgent?.id) {
      return null;
    }
    const inStore = this.store.tasks().find((task) => task.id === fromAgent.id);
    return (
      inStore ?? {
        id: fromAgent.id,
        title: fromAgent.title ?? '',
        status: fromAgent.status ?? 'backlog',
        priority: fromAgent.priority ?? 'medium',
        estimateHours: fromAgent.estimateHours,
        createdAt: new Date().toISOString(),
      }
    );
  });
}

export const taskCardWidget = createFrontendTool({
  name: 'taskCard',
  description:
    'Displays one task as an interactive card in the chat. Use it whenever you refer to a specific task. Pass the task exactly as returned by getBoard/createTask/moveTask.',
  parameters: taskCardArgsSchema,
  component: TaskCardWidget,
  followUp: false,
});
