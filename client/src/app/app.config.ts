import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideCopilotKit } from '@copilotkit/angular';

import { routes } from './app.routes';
import { a2uiActivityRendererConfig } from './core/agent/a2ui/a2ui-activity-renderer';
import { provideA2ui } from './core/agent/a2ui/provide-a2ui';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),

    // CopilotKit in headless mode. Agents and tools are registered at runtime by
    // the features that own them (see features/assistant/board-agent-store.ts);
    // only cross-cutting renderers live here.
    provideCopilotKit({
      renderActivityMessages: [a2uiActivityRendererConfig],
      enableInspector: false,
    }),

    // A2UI renderer + Basic Catalog for agent-generated UI.
    provideA2ui(),
  ],
};
