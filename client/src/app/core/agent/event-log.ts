import type { BaseEvent } from '@ag-ui/client';
import { Injectable, computed, signal } from '@angular/core';

export interface LoggedEvent {
  id: number;
  at: Date;
  direction: 'in' | 'out';
  type: string;
  event: Record<string, unknown>;
}

/**
 * Records every AG-UI event the agent emits so the app can show the raw
 * protocol next to the rendered chat. Purely a learning/debugging aid.
 */
@Injectable({ providedIn: 'root' })
export class AgUiEventLog {
  private readonly entries = signal<LoggedEvent[]>([]);
  private nextId = 1;

  readonly events = this.entries.asReadonly();
  readonly count = computed(() => this.entries().length);

  record(event: BaseEvent, direction: 'in' | 'out' = 'in'): void {
    const entry: LoggedEvent = {
      id: this.nextId++,
      at: new Date(),
      direction,
      type: String(event.type),
      event: event as unknown as Record<string, unknown>,
    };
    this.entries.update((list) => [...list.slice(-499), entry]);
  }

  clear(): void {
    this.entries.set([]);
  }
}
