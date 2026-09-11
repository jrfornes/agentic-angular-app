import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CopilotKit } from '@copilotkit/angular';

import { resetConversation, sendMessage, stopRun } from '../../core/agent/agent-store-helpers';
import { BOARD_AGENT_ID, BOARD_AGENT_URL, injectBoardAgentStore } from './board-agent-store';
import { ChatMessages } from './chat-messages';
import { ProtocolInspector } from './protocol-inspector';

const SUGGESTIONS = [
  'help',
  'show the board',
  'dashboard',
  'new task form',
  'create task Add keyboard shortcuts',
  'start Fix login redirect loop',
  'estimate Migrate auth to OAuth',
  'ci status for main',
  'docs signals',
];

/**
 * The assistant sidecar in *headless* mode: CopilotKit provides state and
 * behaviour (agent store, tool execution, streaming), this component owns the
 * presentation entirely.
 */
@Component({
  selector: 'app-assistant-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ChatMessages, ProtocolInspector],
  template: `
    <header class="panel__header">
      <div>
        <h2 class="panel__title">Assistant</h2>
        <p class="panel__subtitle" title="{{ agentUrl }}">AG-UI · {{ agentId }}</p>
      </div>
      <nav class="tabs">
        <button type="button" [class.active]="tab() === 'chat'" (click)="tab.set('chat')">Chat</button>
        <button type="button" [class.active]="tab() === 'events'" (click)="tab.set('events')">
          AG-UI events
        </button>
      </nav>
      <button type="button" class="ghost" (click)="reset()" title="New conversation">↺</button>
    </header>

    @if (tab() === 'chat') {
      <div class="panel__body" #scroller>
        <app-chat-messages [messages]="messages()" [agentId]="agentId" [isRunning]="isRunning()" />
      </div>

      <div class="suggestions">
        @for (suggestion of suggestions; track suggestion) {
          <button type="button" (click)="send(suggestion)" [disabled]="isRunning()">{{ suggestion }}</button>
        }
      </div>

      <form class="composer" (ngSubmit)="send(draft())">
        <input
          name="draft"
          placeholder="Ask about your board or tell me what to do…"
          [(ngModel)]="draft"
          autocomplete="off" />
        @if (isRunning()) {
          <button type="button" class="ghost" (click)="stop()">Stop</button>
        } @else {
          <button type="submit" class="primary" [disabled]="!draft().trim()">Send</button>
        }
      </form>
    } @else {
      <div class="panel__body panel__body--events">
        <app-protocol-inspector />
      </div>
    }
  `,
  styleUrl: './assistant-panel.css',
})
export class AssistantPanel {
  private readonly copilotKit = inject(CopilotKit);
  private readonly store = injectBoardAgentStore();
  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');

  protected readonly agentId = BOARD_AGENT_ID;
  protected readonly agentUrl = BOARD_AGENT_URL;
  protected readonly suggestions = SUGGESTIONS;
  protected readonly tab = signal<'chat' | 'events'>('chat');
  protected readonly draft = signal('');

  protected readonly messages = computed(() => this.store().messages());
  protected readonly isRunning = computed(() => this.store().isRunning());

  constructor() {
    effect(() => {
      this.messages();
      this.isRunning();
      const element = this.scroller()?.nativeElement;
      if (element) {
        requestAnimationFrame(() => element.scrollTo({ top: element.scrollHeight }));
      }
    });
  }

  protected send(text: string): void {
    const content = text.trim();
    if (!content || this.isRunning()) return;
    this.draft.set('');
    void sendMessage(this.copilotKit, this.store, content).catch((error) => console.error('[assistant]', error));
  }

  protected stop(): void {
    stopRun(this.store);
  }

  protected reset(): void {
    resetConversation(this.store);
  }
}
