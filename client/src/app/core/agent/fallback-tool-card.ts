import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import type { AngularToolCall, ToolRenderer } from '@copilotkit/angular';
import { z } from 'zod';

import { createRenderToolCall } from './tool-definition';

const fallbackToolArgsSchema = z.record(z.string(), z.unknown());
export type FallbackToolArgs = z.infer<typeof fallbackToolArgsSchema>;

/**
 * Renders any tool call that has no dedicated component – typically the
 * agent's *server-side* tools (estimateTask, MCP tools, ...). The client does
 * not execute these, but showing them keeps the agent's work transparent.
 */
@Component({
  selector: 'app-fallback-tool-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" class="tool-call" (click)="expanded.set(!expanded())">
      <span class="tool-call__icon" [class.tool-call__icon--done]="status() === 'complete'">
        {{ status() === 'complete' ? '✓' : '⋯' }}
      </span>
      <span class="tool-call__label">{{ toolName() }}</span>
      <span class="tool-call__status">{{ status() }}</span>
      <span class="tool-call__caret">{{ expanded() ? '▾' : '▸' }}</span>
    </button>
    @if (expanded()) {
      <div class="tool-call__details">
        <div class="tool-call__section">arguments</div>
        <pre>{{ prettyArgs() }}</pre>
        @if (result(); as result) {
          <div class="tool-call__section">result</div>
          <pre>{{ result }}</pre>
        }
      </div>
    }
  `,
  styles: `
    :host { display: block; }
    .tool-call {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 4px 10px; border: 1px solid var(--border); border-radius: 999px;
      background: var(--surface-2); color: var(--text-muted);
      font: inherit; font-size: 12px; cursor: pointer;
    }
    .tool-call__icon { width: 16px; height: 16px; display: inline-grid; place-items: center;
      border-radius: 50%; background: var(--accent-soft); color: var(--accent); font-size: 10px; }
    .tool-call__icon--done { background: var(--success-soft); color: var(--success); }
    .tool-call__label { font-family: var(--font-mono); color: var(--text); }
    .tool-call__status { opacity: .7; }
    .tool-call__details { margin-top: 6px; padding: 8px 10px; border-radius: 8px;
      background: var(--surface-2); border: 1px solid var(--border); }
    .tool-call__section { font-size: 10px; text-transform: uppercase; letter-spacing: .06em;
      color: var(--text-muted); margin: 4px 0; }
    pre { margin: 0; font-size: 11px; white-space: pre-wrap; word-break: break-word; max-height: 220px; overflow: auto; }
  `,
})
export class FallbackToolCard implements ToolRenderer<FallbackToolArgs> {
  readonly toolCall = input.required<AngularToolCall<FallbackToolArgs>>();

  protected readonly expanded = signal(false);
  protected readonly toolName = computed(() => this.toolCall().name ?? 'unknown tool');
  protected readonly status = computed(() => this.toolCall().status);
  protected readonly prettyArgs = computed(() => JSON.stringify(this.toolCall().args ?? {}, null, 2));
  protected readonly result = computed(() => {
    const call = this.toolCall();
    if (call.status !== 'complete' || !call.result) {
      return null;
    }
    try {
      return JSON.stringify(JSON.parse(call.result), null, 2);
    } catch {
      return call.result;
    }
  });
}

/** `'*'` marks this renderer as the wildcard/fallback for all unmatched tool calls. */
export const fallbackToolCard = createRenderToolCall({
  name: '*',
  args: fallbackToolArgsSchema,
  component: FallbackToolCard,
});
