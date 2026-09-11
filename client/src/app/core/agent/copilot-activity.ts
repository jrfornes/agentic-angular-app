import type { AbstractAgent } from '@ag-ui/client';
import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, type Type } from '@angular/core';
import { type ActivityRenderer, CopilotKit, type RenderActivityMessageConfig } from '@copilotkit/angular';

export interface ActivityMessageLike {
  id: string;
  role: 'activity';
  activityType: string;
  content: Record<string, unknown>;
}

interface ResolvedActivity {
  component: Type<ActivityRenderer<unknown>>;
  inputs: {
    activityType: string;
    content: unknown;
    message: ActivityMessageLike;
    agent: AbstractAgent | undefined;
  };
}

/**
 * Picks the activity renderer registered for a message's `activityType` and
 * renders it. `ACTIVITY_SNAPSHOT` events become messages with role `activity`;
 * this is how non-text artefacts (A2UI surfaces, MCP Apps, ...) reach the chat.
 */
@Component({
  selector: 'app-copilot-activity',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgComponentOutlet],
  template: `
    @let view = resolved();
    @if (view) {
      <ng-container *ngComponentOutlet="view.component; inputs: view.inputs" />
    } @else {
      <div class="activity-unknown">No renderer for activity type "{{ message().activityType }}"</div>
    }
  `,
  styles: `.activity-unknown { font-size: 12px; color: var(--text-muted); }`,
})
export class CopilotActivity {
  private readonly copilotKit = inject(CopilotKit);

  readonly message = input.required<ActivityMessageLike>();
  readonly agentId = input.required<string>();

  protected readonly resolved = computed(() =>
    resolveActivityRenderer(
      this.copilotKit.activityMessageRenderConfigs(),
      this.message(),
      this.agentId(),
      this.copilotKit.getAgent(this.agentId()),
    ),
  );
}

export function resolveActivityRenderer(
  configs: RenderActivityMessageConfig[],
  message: ActivityMessageLike,
  agentId: string,
  agent: AbstractAgent | undefined,
): ResolvedActivity | null {
  const matches = configs.filter((config) => config.activityType === message.activityType);
  const config =
    matches.find((candidate) => candidate.agentId === agentId) ??
    matches.find((candidate) => candidate.agentId === undefined) ??
    configs.find((candidate) => candidate.activityType === '*');

  if (!config) {
    return null;
  }

  const parsed = config.content.safeParse(message.content);
  if (!parsed.success) {
    console.warn(`Invalid content for activity "${message.activityType}"`, parsed.error);
    return null;
  }

  return {
    component: config.component,
    inputs: { activityType: message.activityType, content: parsed.data, message, agent },
  };
}
