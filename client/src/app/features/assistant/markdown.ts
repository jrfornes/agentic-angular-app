import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { marked } from 'marked';

/** Renders assistant Markdown. Angular's `innerHTML` binding sanitises the output. */
@Component({
  selector: 'app-markdown',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="markdown" [innerHTML]="html()"></div>`,
  styles: `
    .markdown :is(p, ul, ol, pre) { margin: 0 0 8px; }
    .markdown :is(p, ul, ol, pre):last-child { margin-bottom: 0; }
    .markdown code { font-family: var(--font-mono); font-size: 12px; background: var(--surface-2); padding: 1px 5px; border-radius: 4px; }
    .markdown ul { padding-left: 18px; }
  `,
})
export class Markdown {
  readonly content = input.required<string>();
  protected readonly html = computed(() => marked.parse(this.content(), { async: false }) as string);
}
