import { A2uiRendererService, SurfaceComponent } from '@a2ui/angular/v0_9';
import type { A2uiMessage } from '@a2ui/web_core/v0_9';
import type { AbstractAgent, ActivityMessage } from '@ag-ui/client';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
} from '@angular/core';
import type { ActivityRenderer, RenderActivityMessageConfig } from '@copilotkit/angular';
import { z } from 'zod';

/** Content of an `ACTIVITY_SNAPSHOT` with `activityType: 'a2ui-surface'`. */
export const a2uiSurfaceContentSchema = z.object({
  operations: z.array(z.custom<A2uiMessage>()),
});
export type A2uiSurfaceContent = z.infer<typeof a2uiSurfaceContentSchema>;

export const A2UI_ACTIVITY_TYPE = 'a2ui-surface';

/**
 * CopilotKit activity renderer that hands A2UI operations to the A2UI renderer
 * and shows the resulting surface. The component owns the surface's lifetime.
 */
@Component({
  selector: 'app-a2ui-activity-renderer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SurfaceComponent],
  host: { class: 'a2ui-surface' },
  template: `
    @let surface = surfaceId();
    @if (surface) {
      <a2ui-v09-surface [surfaceId]="surface" />
    }
  `,
})
export class A2uiActivityRenderer implements ActivityRenderer<A2uiSurfaceContent> {
  readonly activityType = input.required<string>();
  readonly content = input.required<A2uiSurfaceContent>();
  readonly message = input.required<ActivityMessage>();
  readonly agent = input.required<AbstractAgent | undefined>();

  private readonly renderer = inject(A2uiRendererService);
  private renderedSurfaceId: string | null = null;

  protected readonly surfaceId = computed(() => getSurfaceId(this.content().operations));

  constructor() {
    // processMessages() mutates renderer state – a side effect, hence `effect` not `computed`.
    effect(() => {
      const operations = this.content().operations;
      const surfaceId = getSurfaceId(operations);
      if (!surfaceId || surfaceId === this.renderedSurfaceId) {
        return;
      }
      this.releaseSurface();
      this.renderedSurfaceId = surfaceId;
      this.renderer.processMessages(operations);
    });

    inject(DestroyRef).onDestroy(() => this.releaseSurface());
  }

  private releaseSurface(): void {
    if (this.renderedSurfaceId) {
      this.renderer.surfaceGroup.deleteSurface(this.renderedSurfaceId);
      this.renderedSurfaceId = null;
    }
  }
}

export const a2uiActivityRendererConfig: RenderActivityMessageConfig<A2uiSurfaceContent> = {
  activityType: A2UI_ACTIVITY_TYPE,
  content: a2uiSurfaceContentSchema,
  component: A2uiActivityRenderer,
};

function getSurfaceId(operations: A2uiMessage[]): string | null {
  for (const operation of operations) {
    if ('createSurface' in operation) return operation.createSurface.surfaceId;
    if ('updateComponents' in operation) return operation.updateComponents.surfaceId;
    if ('updateDataModel' in operation) return operation.updateDataModel.surfaceId;
  }
  return null;
}
