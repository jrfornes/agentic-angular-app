# 2. Architecture of this repo

Three processes, three protocols, one small domain (a developer task board) so
the agentic parts stay in focus.

```
┌──────────────────────────────┐   AG-UI (HTTP POST + SSE)   ┌──────────────────────────────┐   MCP (Streamable HTTP)  ┌────────────────────────┐
│ client/  Angular 22          │ ───────────────────────────▶│ server/  AG-UI agent         │ ────────────────────────▶│ mcp-server/            │
│ • CopilotKit headless        │ ◀─────────────────────────── │ • ScriptedAgent | LlmAgent   │ ◀──────────────────────── │ • search_docs          │
│ • frontend tools + widget    │  RUN_*, TEXT_*, TOOL_CALL_*, │ • server tools (estimate,    │  listTools / callTool     │ • get_ci_status        │
│ • A2UI renderer + actions    │  ACTIVITY_SNAPSHOT (A2UI)    │   A2UI surfaces, renderA2ui) │                           └────────────────────────┘
│ • task board (signals)       │                              │ • MCP client                 │
│ • protocol inspector         │                              └──────────────────────────────┘
└──────────────────────────────┘
        :4200                                   :3001                                     :3002
```

## 2.1 Client (`client/`)

Angular 22, standalone, signals, zoneless. Two layers:

### `src/app/core/agent/` – reusable, domain-agnostic glue

| File | Responsibility |
| --- | --- |
| `init-agent-store.ts` | `initAgentStore({ agentId, url, frontendTools })`: creates an `HttpAgent` for an AG-UI URL, registers it with CopilotKit at runtime (`updateRuntime({ selfManagedAgents })`), registers the feature's frontend tools with `registerFrontendTool`, installs the `*` fallback renderer. Lets a *feature* own its agent. |
| `agent-store-helpers.ts` | `sendMessage`, `sendDeveloperMessage`, `stopRun`, `resetConversation`. Runs always go through `copilotKit.core.runAgent` so frontend tools participate. |
| `tool-definition.ts` | `createFrontendTool` / `createRenderToolCall` helpers (typed, appends a "this ends your turn" hint when `followUp: false`). |
| `fallback-tool-card.ts` | Expandable pill showing name/args/result of any tool call without a dedicated renderer. |
| `event-log.ts` | Signal-based log of every AG-UI event (feeds the inspector). |
| `copilot-activity.ts` | Renders an `ACTIVITY_SNAPSHOT` message by looking up the renderer registered for its `activityType`. |
| `a2ui/provide-a2ui.ts` | `provideA2ui()`: `@a2ui/angular` renderer with the Basic Catalog + markdown. |
| `a2ui/a2ui-activity-renderer.ts` | Activity renderer for `activityType: 'a2ui-surface'`; validates content with zod, feeds `A2uiRendererService.processMessages`, hosts `<a2ui-v09-surface>`. |
| `a2ui/a2ui-actions.ts` | `registerA2uiActionHandlers({ eventName: handler })` on `surfaceGroup.onAction`. |

### `src/app/features/` – the app

- `board/` – `BoardStore` (signals: `tasks`, `byStatus`, `stats`, `add`,
  `move`, `find`, `highlight`), `BoardPage`, `TaskCard`. Plain Angular, no
  agent knowledge.
- `assistant/` – the chat panel.
  - `board-agent-store.ts` wires the agent: URL, tools, widget, A2UI action
    handlers (`openTask`, `createTaskFromForm`). This is the only file that
    knows both the board and the agent.
  - `tools/board.tools.ts` – frontend tools `getBoard`, `createTask`,
    `moveTask`, `navigateTo`.
  - `widgets/task-card-widget.ts` – the `taskCard` rendering tool.
  - `chat-messages.ts` – headless rendering of the CopilotKit message list
    (text bubbles, `copilot-render-tool-calls`, activities).
  - `protocol-inspector.ts` – raw AG-UI event list.
  - `assistant-panel.ts` – tabs, suggestions, composer.
- `about/` – in-app architecture explanation.

`app.config.ts` provides the router, `provideCopilotKit({ renderActivityMessages:
[a2uiActivityRendererConfig] })` and `provideA2ui()`.

## 2.2 Agent server (`server/`)

Node + Express + TypeScript, speaks AG-UI on `POST /ag-ui/board-agent`.

| File | Responsibility |
| --- | --- |
| `index.ts` | Parses `RunAgentInputSchema`, pipes `agent.run(input)` to SSE. `GET /health` shows provider and MCP tools. |
| `ag-ui/sse.ts` | Observable of AG-UI events → SSE response, `RUN_ERROR` on failure. |
| `ag-ui/events.ts` | Small builders for AG-UI events (`textMessage`, `toolCall`, `activitySnapshot`, `a2uiActivityFromToolResult`). |
| `agents/create-agent.ts` | Picks `ScriptedAgent` or `LlmAgent` from config. The seam that makes the model optional. |
| `agents/scripted-agent.ts` | Deterministic, keyword-driven agent. Emits the same events an LLM would. Use it to learn the protocol and in CI. |
| `agents/llm-agent.ts` | Vercel AI SDK `streamText` → AG-UI events. Server tools via `tool()`, MCP tools via `dynamicTool` + `jsonSchema`, frontend tools as `dynamicTool` *without* `execute` (so the loop stops and the client executes). |
| `agents/message-conversion.ts` | AG-UI messages → model messages (developer messages become "[application event]" user turns; activities are skipped). |
| `agents/system-prompt.ts` | Provider-neutral instructions about tools and widgets. |
| `agents/conversation.ts` | Helpers to find the last user message and tool results since a given index (used by the scripted agent to do client-tool round trips). |
| `tools/server-tools.ts` | `estimateTask`, `showBoardDashboard`, `showNewTaskForm`, `renderA2ui`. UI-producing tools return `{ surfaceId, messages }`. |
| `a2ui/surfaces.ts` | Templated A2UI builders (`boardDashboardSurface`, `newTaskFormSurface`). |
| `a2ui/validate.ts` | Schema + referential-integrity validation for LLM-authored A2UI. |
| `mcp/mcp-tools.ts` | MCP client: connect, `listTools`, wrap each into a callable descriptor. |
| `config.ts` | Env-driven provider selection. |

### One run, end to end ("dashboard" with the scripted agent)

1. Client: `sendMessage` → `runAgent` → `POST /ag-ui/board-agent` with messages + frontend tool schemas.
2. Server: `RUN_STARTED`, then `TOOL_CALL_START/ARGS/END` for **frontend** tool `getBoard`, `RUN_FINISHED`.
3. Client (CopilotKit): executes `getBoard` handler in the browser, appends a `tool` message, starts run 2 automatically.
4. Server: sees the `getBoard` result, emits `TOOL_CALL_*` + `TOOL_CALL_RESULT` for **server** tool `showBoardDashboard`, then `ACTIVITY_SNAPSHOT { activityType: 'a2ui-surface', content: { operations } }`, a short text, `RUN_FINISHED`.
5. Client: `A2uiActivityRenderer` renders the surface. Clicking "Open" fires A2UI event `openTask` → `board.highlight(id)`. No server involved.

## 2.3 MCP server (`mcp-server/`)

`@modelcontextprotocol/sdk` `McpServer` with two tools (`search_docs`,
`get_ci_status`) over stateless Streamable HTTP on `:3002/mcp`. A fresh
`McpServer` + transport per request keeps it trivially scalable. The agent
discovers the tools at startup and offers them to the model; the browser never
talks to MCP directly.

## 2.4 What is deliberately *not* shared

- No TypeScript types cross process boundaries. Tools are JSON schema.
- No LLM SDK in the client. No Angular in the server.
- No UI code from the server. A2UI is data; widgets are client code selected by name.

## 2.5 Configuration

| Variable | Effect |
| --- | --- |
| *(none)* | Scripted agent, no model needed. |
| `OPENAI_API_KEY` [+ `OPENAI_MODEL`, `OPENAI_BASE_URL`] | `LlmAgent` with OpenAI or any OpenAI-compatible endpoint. |
| `GOOGLE_GENERATIVE_AI_API_KEY` [+ `GOOGLE_MODEL`] | `LlmAgent` with Gemini. |
| `LLM_PROVIDER=scripted\|openai\|google` | Force a provider. |
| `MCP_SERVER_URL` | Default `http://127.0.0.1:3002/mcp`. |
| `LOG_AG_UI_EVENTS=false` | Silence the per-event server log (on by default). |
| `MCP_PORT` | MCP server port (default 3002). |
| `PORT` | Agent server port (default 3001). |
