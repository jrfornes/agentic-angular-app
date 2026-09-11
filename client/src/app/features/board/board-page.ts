import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { BoardStore } from './board.store';
import { TaskCard } from './task-card';
import { TASK_STATUSES, type TaskPriority } from './task.model';

/**
 * The "conventional" UI. It works without any AI – the assistant is a sidecar
 * that can drive the same store through frontend tools.
 */
@Component({
  selector: 'app-board-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TaskCard],
  template: `
    <section class="toolbar">
      <form class="new-task" (ngSubmit)="add()">
        <input name="title" placeholder="New task title…" [(ngModel)]="title" required />
        <select name="priority" [(ngModel)]="priority">
          <option value="low">low</option>
          <option value="medium">medium</option>
          <option value="high">high</option>
        </select>
        <button type="submit" class="primary" [disabled]="!title().trim()">Add</button>
      </form>
      <div class="stats">
        {{ store.stats().done }}/{{ store.stats().total }} done · {{ store.stats().hours }} h estimated
      </div>
    </section>

    <section class="columns">
      @for (column of columns; track column.value) {
        <div class="column">
          <h3 class="column__title">
            {{ column.label }}
            <span class="column__count">{{ store.byStatus()[column.value].length }}</span>
          </h3>
          <div class="column__cards">
            @for (task of store.byStatus()[column.value]; track task.id) {
              <app-task-card
                [task]="task"
                [highlighted]="store.highlightedTaskId() === task.id"
                (move)="store.move(task.id, $event)" />
            } @empty {
              <p class="column__empty">Nothing here.</p>
            }
          </div>
        </div>
      }
    </section>
  `,
  styles: `
    :host { display: grid; gap: 16px; }
    .toolbar { display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; }
    .new-task { display: flex; gap: 8px; }
    .new-task input { min-width: 260px; }
    .stats { font-size: 13px; color: var(--text-muted); }
    .columns { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
    .column { background: var(--surface-2); border: 1px solid var(--border); border-radius: 14px; padding: 12px; min-height: 300px; }
    .column__title { margin: 0 0 12px; font-size: 13px; text-transform: uppercase; letter-spacing: .06em; color: var(--text-muted); display: flex; justify-content: space-between; }
    .column__count { background: var(--surface); border-radius: 999px; padding: 0 8px; font-size: 12px; }
    .column__cards { display: grid; gap: 10px; }
    .column__empty { color: var(--text-muted); font-size: 13px; text-align: center; margin: 24px 0; }
    @media (max-width: 900px) { .columns { grid-template-columns: 1fr; } }
  `,
})
export class BoardPage {
  protected readonly store = inject(BoardStore);
  protected readonly columns = TASK_STATUSES;
  protected readonly title = signal('');
  protected readonly priority = signal<TaskPriority>('medium');

  protected add(): void {
    if (!this.title().trim()) return;
    this.store.add({ title: this.title(), priority: this.priority() });
    this.title.set('');
  }
}
