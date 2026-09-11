import type { A2uiMessage } from '@a2ui/web_core/v0_9';
import { randomUUID } from 'node:crypto';

/**
 * A2UI (Agent-to-UI) lets the agent answer with *UI structure* instead of text.
 * The agent decides the "what" (which catalog components, which data), the
 * client decides the "how" (styling, actual components). No foreign code ever
 * ships to the browser – only JSON that references a shared catalog.
 *
 * The functions in this file build A2UI v0.9 message sequences from plain
 * domain data. This is the "DSL / templated" approach from the article series
 * (part 8): the LLM only supplies data, the server owns the layout. It is far
 * more robust (and cheaper in tokens) than asking the model to emit raw A2UI.
 * `renderA2ui` in tools/server-tools.ts shows the raw approach for comparison.
 */

/** Must match the id of the catalog the Angular renderer is configured with. */
export const BASIC_CATALOG_ID =
  'https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json';

export interface A2uiSurface {
  surfaceId: string;
  messages: A2uiMessage[];
}

export interface BoardTaskSummary {
  id: string;
  title: string;
  status: 'backlog' | 'in-progress' | 'done';
  priority: 'low' | 'medium' | 'high';
  estimateHours?: number;
}

type Component = Record<string, unknown> & { id: string; component: string };

function surface(surfaceId: string, components: Component[], data: Record<string, unknown>): A2uiSurface {
  const messages: A2uiMessage[] = [
    { version: 'v0.9', createSurface: { surfaceId, catalogId: BASIC_CATALOG_ID } },
    {
      version: 'v0.9',
      updateComponents: { surfaceId, components },
    } as unknown as A2uiMessage,
  ];
  for (const [key, value] of Object.entries(data)) {
    messages.push({
      version: 'v0.9',
      updateDataModel: { surfaceId, path: `/${key}`, value },
    } as unknown as A2uiMessage);
  }
  return { surfaceId, messages };
}

function text(id: string, content: string | { path: string }, variant?: string): Component {
  return { id, component: 'Text', text: content, ...(variant ? { variant } : {}) };
}

/**
 * A dashboard for the task board: counters per column plus a list of the
 * open high-priority tasks. Each task row has a button that fires an A2UI
 * *event* (`openTask`) which the Angular client handles locally.
 */
export function boardDashboardSurface(tasks: BoardTaskSummary[]): A2uiSurface {
  const surfaceId = `dashboard-${randomUUID().slice(0, 8)}`;
  const count = (status: BoardTaskSummary['status']) =>
    tasks.filter((task) => task.status === status).length;
  const totalHours = tasks.reduce((sum, task) => sum + (task.estimateHours ?? 0), 0);
  const highPriorityOpen = tasks.filter(
    (task) => task.priority === 'high' && task.status !== 'done',
  );

  const stat = (id: string, label: string, valuePath: string): Component[] => [
    { id: `${id}-card`, component: 'Card', child: `${id}-col`, weight: 1 },
    { id: `${id}-col`, component: 'Column', children: [`${id}-value`, `${id}-label`], align: 'center' },
    text(`${id}-value`, { path: valuePath }, 'h2'),
    text(`${id}-label`, label, 'caption'),
  ];

  const components: Component[] = [
    { id: 'root', component: 'Column', children: ['title', 'stats', 'divider', 'focus-title', 'focus-list', 'hours'] },
    text('title', 'Board dashboard', 'h3'),
    { id: 'stats', component: 'Row', children: ['backlog-card', 'progress-card', 'done-card'], justify: 'spaceBetween' },
    ...stat('backlog', 'Backlog', '/stats/backlog'),
    ...stat('progress', 'In progress', '/stats/inProgress'),
    ...stat('done', 'Done', '/stats/done'),
    { id: 'divider', component: 'Divider' },
    text('focus-title', highPriorityOpen.length ? 'High priority, still open' : 'No open high-priority tasks. Nice.', 'h4'),
    // A *template* child list: one `focus-item` per entry under /focus.
    { id: 'focus-list', component: 'List', children: { componentId: 'focus-item', path: '/focus' } },
    { id: 'focus-item', component: 'Row', children: ['focus-item-title', 'focus-item-button'], justify: 'spaceBetween', align: 'center' },
    text('focus-item-title', { path: 'title' }),
    {
      id: 'focus-item-button',
      component: 'Button',
      child: 'focus-item-button-label',
      variant: 'borderless',
      action: { event: { name: 'openTask', context: { taskId: { path: 'id' } } } },
    },
    text('focus-item-button-label', 'Open'),
    // A catalog *function* call: the renderer interpolates `${...}` from the data model.
    text(
      'hours',
      { call: 'formatString', args: { value: 'Total estimate: ${/stats/hours} h' }, returnType: 'string' } as unknown as { path: string },
      'caption',
    ),
  ];

  return surface(surfaceId, components, {
    stats: {
      backlog: String(count('backlog')),
      inProgress: String(count('in-progress')),
      done: String(count('done')),
      hours: String(totalHours),
    },
    focus: highPriorityOpen.map((task) => ({ id: task.id, title: task.title })),
  });
}

/**
 * An input form generated by the agent. The `submit` button fires the
 * `createTaskFromForm` event with the form values from the surface's data
 * model as context; the client turns it into a real task.
 */
export function newTaskFormSurface(defaults: { title?: string; priority?: string } = {}): A2uiSurface {
  const surfaceId = `new-task-${randomUUID().slice(0, 8)}`;
  const components: Component[] = [
    { id: 'root', component: 'Card', child: 'form' },
    { id: 'form', component: 'Column', children: ['heading', 'title-field', 'priority', 'actions'] },
    text('heading', 'New task', 'h4'),
    { id: 'title-field', component: 'TextField', label: 'Title', value: { path: '/form/title' } },
    {
      id: 'priority',
      component: 'ChoicePicker',
      label: 'Priority',
      variant: 'mutuallyExclusive',
      displayStyle: 'chips',
      options: [
        { label: 'Low', value: 'low' },
        { label: 'Medium', value: 'medium' },
        { label: 'High', value: 'high' },
      ],
      value: { path: '/form/priority' },
    },
    { id: 'actions', component: 'Row', children: ['submit'], justify: 'end' },
    {
      id: 'submit',
      component: 'Button',
      child: 'submit-label',
      variant: 'primary',
      action: {
        event: {
          name: 'createTaskFromForm',
          context: { title: { path: '/form/title' }, priority: { path: '/form/priority' } },
        },
      },
    },
    text('submit-label', 'Create task'),
  ];

  return surface(surfaceId, components, {
    form: { title: defaults.title ?? '', priority: [defaults.priority ?? 'medium'] },
  });
}
