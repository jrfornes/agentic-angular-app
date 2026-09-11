import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import type { Task, TaskStatus } from './task.model';

/**
 * Presentational task card. Used by the board columns AND by the agent's
 * `taskCard` widget – the same component, whether a human or the agent
 * decided to show it.
 */
@Component({
  selector: 'app-task-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="card" [class.card--highlight]="highlighted()" [attr.data-priority]="task().priority">
      <header class="card__header">
        <span class="card__priority">{{ task().priority }}</span>
        <span class="card__status">{{ task().status }}</span>
      </header>
      <h4 class="card__title">{{ task().title }}</h4>
      <footer class="card__footer">
        <span class="card__meta">{{ task().estimateHours ? task().estimateHours + ' h' : 'no estimate' }}</span>
        @if (!readonly()) {
          <span class="card__actions">
            @if (task().status !== 'in-progress') {
              <button type="button" (click)="move.emit('in-progress')">Start</button>
            }
            @if (task().status !== 'done') {
              <button type="button" (click)="move.emit('done')">Done</button>
            }
            @if (task().status === 'done') {
              <button type="button" (click)="move.emit('backlog')">Reopen</button>
            }
          </span>
        }
      </footer>
    </article>
  `,
  styles: `
    .card {
      display: grid; gap: 6px; padding: 10px 12px;
      border: 1px solid var(--border); border-left: 3px solid var(--priority-medium);
      border-radius: 10px; background: var(--surface); transition: box-shadow .2s, transform .2s;
    }
    .card[data-priority='high'] { border-left-color: var(--priority-high); }
    .card[data-priority='low'] { border-left-color: var(--priority-low); }
    .card--highlight { box-shadow: 0 0 0 3px var(--accent-soft); transform: translateY(-1px); }
    .card__header, .card__footer { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
    .card__priority, .card__status { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: var(--text-muted); }
    .card__title { margin: 0; font-size: 14px; font-weight: 600; }
    .card__meta { font-size: 12px; color: var(--text-muted); }
    .card__actions { display: flex; gap: 4px; }
    button {
      font: inherit; font-size: 11px; padding: 2px 8px; border-radius: 6px;
      border: 1px solid var(--border); background: var(--surface-2); color: var(--text); cursor: pointer;
    }
    button:hover { border-color: var(--accent); color: var(--accent); }
  `,
})
export class TaskCard {
  readonly task = input.required<Task>();
  readonly readonly = input(false);
  readonly highlighted = input(false);
  readonly move = output<TaskStatus>();
}
