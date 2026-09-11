import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { AgUiEventLog } from '../../core/agent/event-log';

/**
 * Shows the raw AG-UI events as they arrive. Seeing RUN_STARTED, TOOL_CALL_*,
 * TEXT_MESSAGE_CONTENT, ACTIVITY_SNAPSHOT and RUN_FINISHED next to the chat is
 * the fastest way to understand what the client library does for you.
 */
@Component({
  selector: 'app-protocol-inspector',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe],
  template: `
    <div class="inspector__toolbar">
      <label class="inspector__filter">
        <input type="checkbox" [checked]="hideDeltas()" (change)="hideDeltas.set(!hideDeltas())" />
        hide streaming deltas
      </label>
      <span class="inspector__count">{{ visible().length }} / {{ log.count() }} events</span>
      <button type="button" (click)="log.clear()">Clear</button>
    </div>
    <ol class="inspector__list">
      @for (entry of visible(); track entry.id) {
        <li class="event" [attr.data-kind]="kind(entry.type)">
          <button type="button" class="event__head" (click)="toggle(entry.id)">
            <span class="event__time">{{ entry.at | date: 'HH:mm:ss.SSS' }}</span>
            <span class="event__type">{{ entry.type }}</span>
            <span class="event__summary">{{ summary(entry.event) }}</span>
          </button>
          @if (expanded() === entry.id) {
            <pre class="event__json">{{ pretty(entry.event) }}</pre>
          }
        </li>
      } @empty {
        <li class="inspector__empty">Send a message – every AG-UI event will show up here.</li>
      }
    </ol>
  `,
  styles: `
    :host { display: flex; flex-direction: column; min-height: 0; font-size: 12px; }
    .inspector__toolbar { display: flex; align-items: center; gap: 12px; padding: 8px 0; color: var(--text-muted); }
    .inspector__filter { display: flex; gap: 6px; align-items: center; }
    .inspector__count { margin-left: auto; }
    .inspector__list { list-style: none; margin: 0; padding: 0; overflow: auto; display: grid; gap: 4px; }
    .inspector__empty { color: var(--text-muted); padding: 24px 0; text-align: center; }
    .event { border: 1px solid var(--border); border-radius: 8px; background: var(--surface-2); overflow: hidden; }
    .event__head { display: grid; grid-template-columns: 84px 170px 1fr; gap: 8px; width: 100%; padding: 6px 8px;
      border: 0; background: none; font: inherit; text-align: left; cursor: pointer; color: var(--text); }
    .event__time { color: var(--text-muted); font-family: var(--font-mono); }
    .event__type { font-family: var(--font-mono); font-weight: 600; }
    .event__summary { color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .event__json { margin: 0; padding: 8px; border-top: 1px solid var(--border); background: var(--surface);
      font-size: 11px; white-space: pre-wrap; word-break: break-word; max-height: 260px; overflow: auto; }
    .event[data-kind='lifecycle'] .event__type { color: var(--text-muted); }
    .event[data-kind='text'] .event__type { color: var(--accent); }
    .event[data-kind='tool'] .event__type { color: var(--warning); }
    .event[data-kind='activity'] .event__type { color: var(--success); }
    .event[data-kind='error'] .event__type { color: var(--priority-high); }
    button { font: inherit; }
  `,
})
export class ProtocolInspector {
  protected readonly log = inject(AgUiEventLog);
  protected readonly hideDeltas = signal(true);
  protected readonly expanded = signal<number | null>(null);

  protected readonly visible = computed(() =>
    this.log
      .events()
      .filter((entry) => !this.hideDeltas() || !['TEXT_MESSAGE_CONTENT', 'TOOL_CALL_ARGS'].includes(entry.type)),
  );

  protected toggle(id: number): void {
    this.expanded.update((current) => (current === id ? null : id));
  }

  protected kind(type: string): string {
    if (type.startsWith('RUN_ERROR')) return 'error';
    if (type.startsWith('RUN_') || type.startsWith('STEP_')) return 'lifecycle';
    if (type.startsWith('TEXT_')) return 'text';
    if (type.startsWith('TOOL_')) return 'tool';
    if (type.startsWith('ACTIVITY')) return 'activity';
    return 'other';
  }

  protected summary(event: Record<string, unknown>): string {
    if ('toolCallName' in event) return String(event['toolCallName']);
    if ('activityType' in event) return `activityType=${event['activityType']}`;
    if ('delta' in event) return JSON.stringify(event['delta']);
    if ('content' in event && typeof event['content'] === 'string') return String(event['content']).slice(0, 80);
    if ('runId' in event) return `run ${String(event['runId']).slice(0, 8)}`;
    return '';
  }

  protected pretty(event: Record<string, unknown>): string {
    return JSON.stringify(event, null, 2);
  }
}
