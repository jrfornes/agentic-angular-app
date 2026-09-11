import { computed, Injectable, signal } from '@angular/core';

import type { Task, TaskPriority, TaskStatus } from './task.model';

const SEED: Task[] = [
  { id: 't-1', title: 'Add dark mode toggle', status: 'in-progress', priority: 'high', estimateHours: 5, createdAt: iso(-3) },
  { id: 't-2', title: 'Fix login redirect loop', status: 'backlog', priority: 'high', estimateHours: 3, createdAt: iso(-2) },
  { id: 't-3', title: 'Write onboarding docs', status: 'done', priority: 'low', estimateHours: 2, createdAt: iso(-6) },
  { id: 't-4', title: 'Migrate board store to signals', status: 'done', priority: 'medium', estimateHours: 4, createdAt: iso(-5) },
  { id: 't-5', title: 'Add e2e test for task creation', status: 'backlog', priority: 'medium', estimateHours: 3, createdAt: iso(-1) },
];

/**
 * Plain signal store for the task board. Nothing in here knows about agents –
 * the assistant's frontend tools call these methods exactly like a button would.
 */
@Injectable({ providedIn: 'root' })
export class BoardStore {
  private readonly tasksState = signal<Task[]>(SEED);
  private readonly highlightedState = signal<string | null>(null);

  readonly tasks = this.tasksState.asReadonly();
  readonly highlightedTaskId = this.highlightedState.asReadonly();

  readonly byStatus = computed(() => {
    const groups: Record<TaskStatus, Task[]> = { backlog: [], 'in-progress': [], done: [] };
    for (const task of this.tasksState()) {
      groups[task.status].push(task);
    }
    return groups;
  });

  readonly stats = computed(() => {
    const tasks = this.tasksState();
    return {
      total: tasks.length,
      done: tasks.filter((t) => t.status === 'done').length,
      hours: tasks.reduce((sum, t) => sum + (t.estimateHours ?? 0), 0),
    };
  });

  add(input: { title: string; priority?: TaskPriority; estimateHours?: number }): Task {
    const task: Task = {
      id: `t-${Date.now().toString(36)}`,
      title: input.title.trim(),
      status: 'backlog',
      priority: input.priority ?? 'medium',
      estimateHours: input.estimateHours,
      createdAt: new Date().toISOString(),
    };
    this.tasksState.update((tasks) => [task, ...tasks]);
    this.highlight(task.id);
    return task;
  }

  move(id: string, status: TaskStatus): Task | undefined {
    let moved: Task | undefined;
    this.tasksState.update((tasks) =>
      tasks.map((task) => {
        if (task.id !== id) return task;
        moved = { ...task, status };
        return moved;
      }),
    );
    if (moved) this.highlight(moved.id);
    return moved;
  }

  remove(id: string): void {
    this.tasksState.update((tasks) => tasks.filter((task) => task.id !== id));
  }

  find(idOrTitle: string): Task | undefined {
    const needle = idOrTitle.trim().toLowerCase();
    return (
      this.tasksState().find((task) => task.id.toLowerCase() === needle) ??
      this.tasksState().find((task) => task.title.toLowerCase() === needle) ??
      this.tasksState().find((task) => task.title.toLowerCase().includes(needle))
    );
  }

  highlight(id: string | null): void {
    this.highlightedState.set(id);
    if (id) {
      setTimeout(() => {
        if (this.highlightedState() === id) this.highlightedState.set(null);
      }, 2500);
    }
  }
}

function iso(daysAgo: number): string {
  return new Date(Date.now() + daysAgo * 86_400_000).toISOString();
}
