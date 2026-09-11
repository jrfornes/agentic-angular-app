import { A2uiRendererService } from '@a2ui/angular/v0_9';
import type { A2uiClientAction } from '@a2ui/web_core/v0_9';
import {
  assertInInjectionContext,
  DestroyRef,
  EnvironmentInjector,
  inject,
  runInInjectionContext,
} from '@angular/core';

export type A2uiActionHandlers = Record<string, (action: A2uiClientAction) => void>;

/**
 * A2UI buttons declare `action: { event: { name, context } }`. The renderer
 * emits them on `surfaceGroup.onAction`; this helper dispatches by name and
 * runs the handler in an injection context so it can use `inject()`.
 *
 * This is the "client decides what an event means" half of A2UI: the agent
 * only named the event, the application owns the behaviour.
 */
export function registerA2uiActionHandlers(handlers: A2uiActionHandlers): void {
  assertInInjectionContext(registerA2uiActionHandlers);

  const renderer = inject(A2uiRendererService);
  const destroyRef = inject(DestroyRef);
  const environmentInjector = inject(EnvironmentInjector);

  const subscription = renderer.surfaceGroup.onAction.subscribe((action: A2uiClientAction) => {
    const handler = handlers[action.name];
    if (!handler) {
      console.warn(`[a2ui] no handler registered for action "${action.name}"`, action);
      return;
    }
    runInInjectionContext(environmentInjector, () => handler(action));
  });

  destroyRef.onDestroy(() => subscription.unsubscribe());
}
