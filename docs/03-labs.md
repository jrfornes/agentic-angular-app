# 3. Hands-on labs

Each lab is self-contained and builds on the running app (`npm run dev`). Keep
the **AG-UI events** tab open while you work; it is the best debugger you have.

Labs 0–3 work with the scripted agent (no API key). Labs 4+ are more fun with a
real model, see `02-architecture.md` § 2.5 for the env vars.

---

## Lab 0 – Read the protocol (15 min)

1. Send `help`, then `show board`, then `dashboard`.
2. In the events tab, for each message find:
   - the `RUN_STARTED` → `RUN_FINISHED` pairs. How many runs did `dashboard` need and why?
   - the `TOOL_CALL_START` whose `toolCallName` is `getBoard`. Who executed it? (Hint: there is no `TOOL_CALL_RESULT` from the server for it, but the next run's input contains a `tool` message.)
   - the `ACTIVITY_SNAPSHOT`. Expand it and locate the `createSurface`, `updateComponents`, `updateDataModel` messages.
3. Uncheck *hide streaming deltas* and watch `TEXT_MESSAGE_CONTENT` chunks.

Takeaway: the client library (CopilotKit) does the tool round trip for you; the
server never touches your app state.

---

## Lab 1 – Add a frontend tool (20 min)

Goal: let the agent *remove* a task.

1. In `client/src/app/features/assistant/tools/board.tools.ts` add:

```ts
export const removeTaskTool = createFrontendTool({
  name: 'removeTask',
  description: 'Deletes a task from the board. Ask the user first if unsure.',
  parameters: z.object({ idOrTitle: z.string() }),
  handler: async ({ idOrTitle }) => {
    const store = inject(BoardStore);
    const task = store.find(idOrTitle);
    if (!task) return { error: `No task matching "${idOrTitle}"` };
    store.remove(task.id);
    return { removed: task };
  },
});
```

   and add it to the `boardTools` array.
2. Scripted agent: in `server/src/agents/scripted-agent.ts` add a branch for
   `/^(remove|delete) (.+)/i` that calls the client tool `removeTask` and, in
   the follow-up run, confirms with text (mirror how `moveTask` is handled).
   LLM agent: nothing to do, the tool is advertised via `RunAgentInput.tools`.
3. Send `remove t-3`. Observe the fallback tool pill and the board updating.

Takeaway: adding a capability is one client file (plus, for the scripted
agent, a routing branch). No protocol changes.

---

## Lab 2 – Human in the loop (30 min)

Goal: destructive tools must be confirmed in the UI before they run.

1. Create `ConfirmCard` (a `ToolRenderer`) with two buttons that resolve a
   promise stored on the component.
2. Turn `removeTask` into a tool whose `handler` awaits the user's decision:
   create a `Deferred` in a small `ConfirmationService`, render the card via the
   tool's `component`, and only mutate the store when the promise resolves
   `true`. Return `{ cancelled: true }` otherwise.
3. Observe in the events tab that the run is *paused* between
   `TOOL_CALL_END` and the next `RUN_STARTED` for as long as the card is open.

Takeaway: because the client executes frontend tools, "wait for the human" is
just an unresolved promise. No agent-side state machine needed.

---

## Lab 3 – Extend the A2UI catalog with a domain component (45 min)

Goal: the agent can place a real `TaskCard` (your Angular component, your
styles) *inside* a generated A2UI layout.

1. Define the component API and Angular implementation:

```ts
// client/src/app/core/agent/a2ui/board-catalog.ts
import { CatalogComponent, type AngularComponentImplementation } from '@a2ui/angular/v0_9';
import { z } from 'zod';

const taskCardApi = {
  name: 'TaskCard',
  schema: z.object({
    taskId: z.union([z.string(), z.object({ path: z.string() })]),
    weight: z.number().optional(),
  }),
} as const;

@Component({
  selector: 'app-a2ui-task-card',
  imports: [TaskCard],
  template: `@let t = task(); @if (t) { <app-task-card [task]="t" readonly /> }`,
})
export class A2uiTaskCard extends CatalogComponent<typeof taskCardApi> {
  private readonly store = inject(BoardStore);
  protected readonly task = computed(() => {
    const id = this.props().taskId();          // BoundProperty → signal
    return this.store.tasks().find((t) => t.id === id) ?? null;
  });
}

export const BOARD_CATALOG_COMPONENTS: AngularComponentImplementation[] = [
  { ...taskCardApi, component: A2uiTaskCard },
];
```

2. Register it: in `provide-a2ui.ts` build the catalog with
   `new BasicCatalog({ id: BOARD_CATALOG_ID, extraComponents: BOARD_CATALOG_COMPONENTS })`
   (see `BasicCatalogOptions` in `@a2ui/angular/v0_9`), and export
   `BOARD_CATALOG_ID` (e.g. `urn:agentic-board:catalog:v1`).
3. Server: in `server/src/a2ui/surfaces.ts` set `BASIC_CATALOG_ID` to the same
   id and, in `boardDashboardSurface`, replace the `focus-item` Row with
   `{ id: 'focus-item', component: 'TaskCard', taskId: { path: 'id' } }`.
4. Send `dashboard`. The list now renders real task cards.

Takeaway: the catalog id is the contract. Both sides agree on names + schemas;
the client owns the implementation. This is how you avoid ever shipping UI code
from the server.

---

## Lab 4 – Let the LLM author raw A2UI (LLM required, 30 min)

1. Start the agent server with `OPENAI_API_KEY=...` (or a local
   OpenAI-compatible endpoint via `OPENAI_BASE_URL`).
2. Ask: *"Show me a two-column comparison of the in-progress and done tasks
   with a headline for each column."*
3. Watch the `renderA2ui` tool call. If validation fails, the model receives the
   error string as tool result and retries. Read `server/src/a2ui/validate.ts`
   to see what is checked.
4. Tighten the system prompt in `system-prompt.ts` until the model succeeds on
   the first try. Then compare token usage with `showBoardDashboard`.

Takeaway: raw A2UI is powerful but you pay in tokens and validation; templated
surfaces are the right default.

---

## Lab 5 – Swap the LLM, then swap the agent framework (LLM required)

1. `LLM_PROVIDER=google GOOGLE_GENERATIVE_AI_API_KEY=...` → same UI, same
   tools, different model. Nothing in `client/` changed.
2. Point `OPENAI_BASE_URL` at Ollama (`http://localhost:11434/v1`) with
   `OPENAI_MODEL=qwen2.5:7b`. Observe which tool-calling behaviours degrade.
3. Bigger: replace `LlmAgent` with a LangGraph (Python), Mastra or Google ADK
   agent exposing AG-UI. Only `BOARD_AGENT_URL` in the client changes. The
   frontend tools, widgets and A2UI handlers keep working because they are
   protocol-level features.

---

## Lab 6 – Add an MCP tool the agent can use (20 min)

1. In `mcp-server/src/server.ts` register `list_open_prs` returning a few
   fake PRs (`structuredContent` + `outputSchema`).
2. Restart; `GET http://localhost:3001/health` should list the new tool.
3. Scripted agent: add a `pr|pull request` branch using `this.mcp?.tools`.
   LLM agent: just ask *"which PRs are open?"*.
4. Optional: render the result with a dedicated `RenderToolCallConfig` named
   `list_open_prs` instead of the fallback pill.

Takeaway: MCP tools are discovered at runtime and flow into the same UI. The
browser still never talks to MCP.

---

## Lab 7 – MCP Apps (advanced)

Goal: a tool that ships its own UI in a sandboxed iframe.

1. In the MCP server, use the MCP Apps SDK (`@modelcontextprotocol/ext-apps`)
   to register an *app tool* with a companion HTML resource (`ui://…`).
2. In the agent server, wrap the agent with `@ag-ui/mcp-apps-middleware` so
   `TOOL_CALL_RESULT` for app tools carries the resource reference.
3. In the client, add `provideMCPApps()` from `@copilotkit/angular/mcp-apps`
   to `app.config.ts`. The chat renders the iframe and bridges `postMessage`.
4. Compare with lab 3: same *goal* (rich UI for a tool), different *ownership*
   (vendor-shipped vs. yours). Decide which one your product needs where.

---

## Lab 8 – Server-side memory (architecture exercise)

Today the client sends the full history on each run. Change the agent server to
store threads by `threadId` and accept only the newest message; keep the
endpoint URL and the event stream identical. Then verify that the client did
not need a single change. This is the litmus test for the decoupling described
in `01-concepts.md` § 1.4.
