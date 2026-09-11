import {
  A2UI_RENDERER_CONFIG,
  A2uiRendererService,
  BasicCatalog,
  provideMarkdownRenderer,
  type RendererConfiguration,
} from '@a2ui/angular/v0_9';
import { type EnvironmentProviders, inject, makeEnvironmentProviders } from '@angular/core';
import { marked } from 'marked';

/**
 * Wires the A2UI Angular renderer with the Basic Catalog.
 *
 * The catalog is the contract between agent and client: the agent may only
 * reference components that exist here, and the client decides how they look.
 * Extending it with your own domain components (a custom catalog) is the next
 * step – see docs/03-labs.md.
 */
export function provideA2ui(): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: A2UI_RENDERER_CONFIG,
      useFactory: (): RendererConfiguration => ({ catalogs: [inject(BasicCatalog)] }),
    },
    provideMarkdownRenderer(async (markdown) => marked.parse(String(markdown ?? ''))),
    A2uiRendererService,
  ]);
}
