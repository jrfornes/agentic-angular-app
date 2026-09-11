import { type A2uiMessage, A2uiMessageListWrapperSchema } from '@a2ui/web_core/v0_9';

/**
 * LLMs are not guaranteed to produce valid A2UI. When the model authors A2UI
 * directly (see the `renderA2ui` tool), the server validates the result and
 * throws a *descriptive* error. The tool error goes back to the model, which
 * can self-correct, and only consistent structures ever reach the browser.
 */
export function validateA2uiSurface(input: unknown): { surfaceId: string; messages: A2uiMessage[] } {
  const parsed = A2uiMessageListWrapperSchema.safeParse(input);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 5)
      .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
      .join('; ');
    throw new Error(`A2UI schema validation failed: ${issues}`);
  }

  const messages = parsed.data.messages as A2uiMessage[];
  if (messages.length === 0) {
    throw new Error('A2UI: messages must not be empty');
  }

  const createSurface = messages.filter((m) => 'createSurface' in m);
  if (createSurface.length !== 1) {
    throw new Error(`A2UI: expected exactly one createSurface message, got ${createSurface.length}`);
  }
  const surfaceId = (createSurface[0] as { createSurface: { surfaceId: string } }).createSurface.surfaceId;

  for (const message of messages) {
    if (surfaceIdOf(message) !== surfaceId) {
      throw new Error(`A2UI: all messages must share the surfaceId "${surfaceId}"`);
    }
  }

  const updates = messages.filter((m) => 'updateComponents' in m) as Array<{
    updateComponents: { components: Array<Record<string, unknown>> };
  }>;
  if (updates.length !== 1) {
    throw new Error(`A2UI: expected exactly one updateComponents message, got ${updates.length}`);
  }

  const components = updates[0].updateComponents.components;
  const ids = new Set(components.map((c) => c['id'] as string));
  if (!ids.has('root')) {
    throw new Error('A2UI: updateComponents.components must define a component with id "root"');
  }

  const singleChild = new Set(['Card', 'Button', 'Modal']);
  const multiChild = new Set(['Row', 'Column', 'List']);
  for (const component of components) {
    const name = component['component'] as string;
    const id = component['id'] as string;
    if (singleChild.has(name) && Array.isArray(component['children'])) {
      throw new Error(
        `A2UI: "${id}" (${name}) uses "children" but ${name} takes a single "child" id. Wrap multiple elements in a Column or Row.`,
      );
    }
    if (multiChild.has(name) && typeof component['child'] === 'string') {
      throw new Error(`A2UI: "${id}" (${name}) uses "child" but ${name} takes a "children" array.`);
    }
    for (const ref of referencedIds(component)) {
      if (!ids.has(ref)) {
        throw new Error(`A2UI: "${id}" references unknown component id "${ref}"`);
      }
    }
  }

  return { surfaceId, messages };
}

function surfaceIdOf(message: A2uiMessage): string {
  if ('createSurface' in message) return message.createSurface.surfaceId;
  if ('updateComponents' in message) return message.updateComponents.surfaceId;
  if ('updateDataModel' in message) return message.updateDataModel.surfaceId;
  if ('deleteSurface' in message) return message.deleteSurface.surfaceId;
  throw new Error('A2UI: message without recognizable type');
}

function referencedIds(component: Record<string, unknown>): string[] {
  const ids: string[] = [];
  if (typeof component['child'] === 'string') ids.push(component['child']);
  const children = component['children'];
  if (Array.isArray(children)) {
    ids.push(...children.filter((c): c is string => typeof c === 'string'));
  } else if (children && typeof children === 'object' && typeof (children as Record<string, unknown>)['componentId'] === 'string') {
    ids.push((children as { componentId: string }).componentId);
  }
  return ids;
}
