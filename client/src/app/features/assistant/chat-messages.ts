import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { type Message, RenderToolCalls } from '@copilotkit/angular';

import { type ActivityMessageLike, CopilotActivity } from '../../core/agent/copilot-activity';
import { Markdown } from './markdown';

type AssistantMessage = Extract<Message, { role: 'assistant' }>;

interface MessageView {
  id: string;
  variant: 'user' | 'assistant';
  text: string;
  /** One entry per tool call so every call gets its own bubble. */
  toolCalls: { id: string; message: AssistantMessage }[];
  activity: ActivityMessageLike | null;
}

/**
 * Turns the agent store's message list into chat bubbles. Three kinds of
 * content exist in AG-UI: text, tool calls (rendered by CopilotKit's
 * RenderToolCalls with the registered components) and activities (rendered by
 * the activity renderer matching their activityType).
 */
@Component({
  selector: 'app-chat-messages',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RenderToolCalls, CopilotActivity, Markdown],
  template: `
    <article class="msg msg--assistant">
      <div class="bubble"><app-markdown [content]="greeting()" /></div>
    </article>

    @for (view of views(); track view.id) {
      @if (view.text) {
        <article class="msg" [class]="'msg--' + view.variant">
          <div class="bubble"><app-markdown [content]="view.text" /></div>
        </article>
      }
      @for (call of view.toolCalls; track call.id) {
        <article class="msg msg--assistant msg--tool">
          <copilot-render-tool-calls
            [message]="call.message"
            [messages]="messages()"
            [agentId]="agentId()"
            [isLoading]="isRunning()" />
        </article>
      }
      @if (view.activity; as activity) {
        <article class="msg msg--assistant msg--activity">
          <div class="bubble bubble--surface">
            <app-copilot-activity [message]="activity" [agentId]="agentId()" />
          </div>
        </article>
      }
    }

    @if (isRunning()) {
      <article class="msg msg--assistant">
        <div class="bubble typing"><span></span><span></span><span></span></div>
      </article>
    }
  `,
  styleUrl: './chat-messages.css',
})
export class ChatMessages {
  readonly messages = input.required<Message[]>();
  readonly agentId = input.required<string>();
  readonly isRunning = input(false);
  readonly greeting = input('Hi! I can read and change your board. Type **help** to see what I can do.');

  protected readonly views = computed(() => this.messages().map(toView).filter((view): view is MessageView => view !== null));
}

function toView(message: Message): MessageView | null {
  switch (message.role) {
    case 'user':
      return { id: message.id, variant: 'user', text: contentToText(message.content), toolCalls: [], activity: null };
    case 'assistant':
      return {
        id: message.id,
        variant: 'assistant',
        text: message.content ?? '',
        toolCalls: (message.toolCalls ?? []).map((toolCall) => ({
          id: toolCall.id,
          message: { ...message, toolCalls: [toolCall] },
        })),
        activity: null,
      };
    case 'activity':
      return { id: message.id, variant: 'assistant', text: '', toolCalls: [], activity: message as ActivityMessageLike };
    default:
      // tool results, developer and system messages are not shown as bubbles
      return null;
  }
}

function contentToText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (part && typeof part === 'object' && 'text' in part ? String((part as { text: unknown }).text) : ''))
      .join(' ');
  }
  return '';
}
