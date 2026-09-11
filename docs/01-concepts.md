# 1. Concepts: Agentic UI without vendor lock-in

This guide is the "why" behind the code in this repo. It condenses the Angular
Architects series on Agentic UI (AG-UI, A2UI, MCP Apps, CopilotKit for Angular)
and the `flights42` reference project into the ideas you need to reason about
your own app.

## 1.1 What "Agentic UI" means

A classic app is *imperative*: the user clicks, the code you wrote runs. An
agentic app adds a second actor, an LLM-driven **agent**, that can

- read the state of the UI,
- perform actions inside the UI (call functions you expose),
- and *answer with UI*, not only with text.

The interesting engineering problem is not "call an LLM". It is: how do the
browser and the agent talk to each other in a way that survives you swapping
the model, the agent framework, or the backend language?

## 1.2 The three protocols

| Protocol | Question it answers | Who talks to whom |
| --- | --- | --- |
| **MCP** (Model Context Protocol) | How does an *agent* discover and call tools/resources of *other systems*? | Agent ⇄ tool servers |
| **AG-UI** (Agent-User Interaction) | How does a *frontend* run an agent, stream its output, and let the agent use the frontend's tools? | Browser ⇄ agent |
| **A2UI** (Agent-to-UI) | How does an agent describe a *UI* it wants rendered, without shipping code? | Agent → renderer (transported via AG-UI) |

They compose: the browser uses AG-UI to talk to the agent; the agent uses MCP
to talk to tool servers; and one of the things the agent can put on the AG-UI
stream is an A2UI surface.

```
Angular ──AG-UI (HTTP+SSE)──▶ Agent ──MCP (Streamable HTTP)──▶ MCP servers
   ▲                            │
   └── events: text, tool calls, A2UI surfaces (ACTIVITY_SNAPSHOT) ◀──┘
```

### AG-UI in one paragraph

AG-UI is an event protocol. The client POSTs a `RunAgentInput` (thread id, run
id, full message history, the *tools the client offers*, context) and the agent
streams back a sequence of typed events, usually over Server-Sent Events:

- lifecycle: `RUN_STARTED`, `RUN_FINISHED`, `RUN_ERROR`, `STEP_STARTED/FINISHED`
- text: `TEXT_MESSAGE_START`, `TEXT_MESSAGE_CONTENT` (delta), `TEXT_MESSAGE_END`
- tools: `TOOL_CALL_START`, `TOOL_CALL_ARGS` (delta), `TOOL_CALL_END`, `TOOL_CALL_RESULT`
- state: `STATE_SNAPSHOT`, `STATE_DELTA`, `MESSAGES_SNAPSHOT`
- custom: `ACTIVITY_SNAPSHOT` (with an `activityType`), `CUSTOM`

Two properties matter for architecture:

1. **The client is the source of truth for the conversation.** Every run sends
   the full history. The agent process can be stateless; a run can be served by
   any instance, in any language.
2. **Tools live on both sides.** The client advertises *frontend tools* (with
   JSON schema) in every run. When the agent emits a tool call for one of them,
   the run ends, the *browser* executes the tool, appends a `tool` message with
   the result, and starts a new run. Server tools are executed by the agent and
   only show up as `TOOL_CALL_*` + `TOOL_CALL_RESULT` events for transparency.

Open the **AG-UI events** tab in the app and send "dashboard" to see this
exact sequence.

### A2UI in one paragraph

A2UI is a JSON format for describing UI against a **catalog** of components
the client already has. A surface is created with `createSurface`, populated
with `updateComponents` (a flat list of components referencing each other by
id) and `updateDataModel` (the data the components bind to). Components can

- bind text/values to a data path (`{ "path": "/stats/backlog" }`),
- iterate a list with a template (`children: { componentId, path }`),
- call catalog functions (`{ "call": "formatString", "args": {...} }`),
- and fire *events* back to the host (`action: { event: { name, context } }`).

The client renders with its own components and styles. No code, no HTML, no
iframes cross the wire, which is what makes it safe to let an LLM author UI.

### MCP and MCP Apps in one paragraph

MCP standardises tools, resources and prompts an agent can use. In this repo the
agent connects to a small MCP server (`mcp-server/`) and exposes its tools to
the model like any other tool. **MCP Apps** extend MCP so a tool can return a
*UI resource* (an HTML app rendered in a sandboxed iframe that talks to the host
over `postMessage`). It is the right choice when a third party wants to ship a
rich, self-contained widget together with its tool. CopilotKit for Angular ships
`provideMCPApps()` and AG-UI has `@ag-ui/mcp-apps-middleware` to bridge this
into the same chat. It is documented as a lab in `03-labs.md`; A2UI is used for
the built-in dynamic UI because it stays in your design system and needs no
sandbox.

## 1.3 The patterns you will see in the code

| Pattern | Where | What it teaches |
| --- | --- | --- |
| **Frontend tool** | `client/.../tools/board.tools.ts` | The agent calls into the browser (`getBoard`, `createTask`, `moveTask`, `navigateTo`). The browser owns the state; the agent only asks. |
| **Widget (rendering tool)** | `client/.../widgets/task-card-widget.ts` | A frontend tool whose only job is to render a component. `followUp: false` ends the turn, so the widget *is* the answer. |
| **Fallback tool card** | `client/src/app/core/agent/fallback-tool-card.ts` | A `*` renderer so every tool call (incl. MCP tools) is visible even without a bespoke component. |
| **Server tool** | `server/src/tools/server-tools.ts` | Deterministic logic next to the agent (`estimateTask`), plus UI-producing tools. |
| **MCP tool** | `server/src/mcp/mcp-tools.ts` | Tools discovered at runtime from another process and forwarded to the model. |
| **A2UI surface (templated)** | `server/src/a2ui/surfaces.ts` | The server builds UI from data with a small DSL; the LLM only decides *to* show it and *with what data*. |
| **A2UI surface (raw)** | `renderA2ui` in `server-tools.ts` + `a2ui/validate.ts` | The LLM authors A2UI JSON itself; the server validates before forwarding. |
| **A2UI actions** | `client/.../board-agent-store.ts` | Buttons inside generated UI fire events the *app* handles (`openTask`, `createTaskFromForm`). |
| **Developer message** | `agent-store-helpers.ts` → `sendDeveloperMessage` | Telling the agent what the app did (form submitted) without the user typing. |
| **Activity renderer** | `client/.../a2ui/a2ui-activity-renderer.ts` | Mapping an `ACTIVITY_SNAPSHOT` `activityType` to an Angular component. |
| **Protocol inspector** | `protocol-inspector.ts` | Learning by watching the raw event stream. |

## 1.4 Question 1: How do I avoid coupling to the server stack and the LLM?

Short answer: **put a protocol, not an SDK, between the browser and the
agent** and keep each side free to change behind it.

Concretely, this repo enforces the following seams:

1. **The browser only knows an AG-UI URL.** `HttpAgent({ url })` in
   `init-agent-store.ts` is the entire client-side knowledge about the backend.
   Nothing in Angular imports an LLM SDK, a LangGraph/Mastra/ADK client, or
   vendor types. You could rewrite `server/` in Python (LangGraph, Pydantic AI,
   Google ADK all speak AG-UI) and the client would not change.

2. **The agent implementation is pluggable behind one factory.**
   `server/src/agents/create-agent.ts` returns a `ScriptedAgent` (no LLM, for
   learning and CI) or an `LlmAgent`. Both extend `AbstractAgent` from
   `@ag-ui/client` and produce the same event stream. The tests and the UI cannot
   tell them apart.

3. **The LLM is a config value.** `LlmAgent` uses the Vercel AI SDK's provider
   abstraction (`createModel()` in `llm-agent.ts`). `LLM_PROVIDER`,
   `OPENAI_BASE_URL` (any OpenAI-compatible server: Azure, Ollama, vLLM,
   OpenRouter) or `GOOGLE_GENERATIVE_AI_API_KEY` decide the model. The prompt and
   tool definitions are provider-neutral (JSON schema via zod).

4. **Tools are described by schema, not by code sharing.** Frontend tools are
   sent as JSON schema in `RunAgentInput.tools`; MCP tools arrive as JSON schema
   from `listTools()`. No type is shared across processes.

5. **Dynamic UI is data.** A2UI surfaces are JSON against a catalog. The agent
   does not know whether the client is Angular, React or Flutter. The client does
   not know which model produced the JSON.

6. **Everything is observable.** Because it is a protocol, you can log it
   (`server/src/ag-ui/sse.ts` logs every event, the inspector tab in the UI shows them)
   and replay it in tests without a model.

What you *do* couple to is the AG-UI event vocabulary and the A2UI catalog. Both
are open specifications with multiple independent implementations, which is the
kind of coupling you want.

## 1.5 Question 2: How do I support dynamic UI as an answer from the agent?

There are three levels, and you will typically use all of them:

### Level 1 – Widgets: the agent picks a component, you own the component

Register a frontend tool with a `component` and `followUp: false`
(`task-card-widget.ts`). The model calls `taskCard({ taskId })` and CopilotKit
renders `TaskCardWidget` inside the chat. The component reads *live* data from
the signal store, so it stays in sync when the board changes later. Use this
when the set of possible UIs is known up front.

Strengths: full type safety, full design system, trivial to test.
Limits: the agent can only choose among pre-built components and fill their
inputs; it cannot compose a new layout.

### Level 2 – A2UI surfaces: the agent composes UI from a catalog

The agent (or a server tool on its behalf) emits A2UI messages inside an
`ACTIVITY_SNAPSHOT` event with `activityType: 'a2ui-surface'`. The Angular
side maps that activity type to `A2uiActivityRenderer`, which hands the messages
to `@a2ui/angular`'s renderer. Buttons fire events the app subscribes to via
`registerA2uiActionHandlers`.

Two ways to produce the JSON:

- **Templated / DSL (recommended default).** `boardDashboardSurface(tasks)` and
  `newTaskFormSurface()` in `server/src/a2ui/surfaces.ts` build the layout in
  code; the LLM only supplies the data by calling `showBoardDashboard` or
  `showNewTaskForm`. Robust, cheap in tokens, easy to unit test.
- **Raw.** `renderA2ui({ messages })` lets the model author the A2UI itself.
  `validateA2uiSurface` checks it against the spec schema *and* for referential
  integrity before it reaches the browser. Use for genuinely open-ended UIs, and
  expect to iterate on the prompt.

Strengths: agent can compose forms, lists, cards, dialogs on the fly; still your
components and styling; safe (declarative JSON, no code).
Limits: bounded by the catalog. When you need more, extend the catalog with your
own components (lab 1 in `03-labs.md`) rather than reaching for raw HTML.

### Level 3 – MCP Apps: a third party ships the UI with the tool

When the UI belongs to someone else (a payment provider, a monitoring vendor),
MCP Apps deliver an HTML bundle as an MCP resource and render it in a sandboxed
iframe with a `postMessage` bridge. Nothing to build on your side beyond
`provideMCPApps()` and the AG-UI middleware. The trade-off is that the iframe
does not share your design system or state.

### Choosing

```
Known component, known inputs?       → Widget (frontend tool + component)
Agent must compose layout/forms?     → A2UI (templated first, raw if needed)
UI owned by an external tool vendor? → MCP Apps
```

## 1.6 Human-in-the-loop, state, memory (where to go next)

- **Human in the loop**: a frontend tool that shows a confirmation component
  and resolves its handler only when the user clicks. Because the run waits for
  the tool result, the agent is naturally paused. (Lab 2.)
- **Shared state**: AG-UI `STATE_SNAPSHOT`/`STATE_DELTA` let the agent and the
  UI share a JSON document; CopilotKit exposes it as a signal on the store.
- **Server-side memory**: switch `RunAgentInput` handling to a thread store so
  the client sends only the new message (`useServerMemory` style). Keep this
  behind the same AG-UI URL so the client does not change.

## 1.7 Further reading

- AG-UI: https://docs.ag-ui.com
- A2UI spec v0.9: https://a2ui.org
- MCP and MCP Apps: https://modelcontextprotocol.io
- CopilotKit for Angular: https://docs.copilotkit.ai/angular
- Angular Architects article series and `flights42` (branch `agentic`):
  https://www.angulararchitects.io/en/blog/ and
  https://github.com/angular-architects/flights42/tree/agentic
