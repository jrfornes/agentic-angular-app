# Agentic Angular App

A hands-on learning project for **Agentic UI with Angular: dynamic interfaces
without vendor lock-in**. It is a small developer task board with an assistant
you can chat with. The assistant reads and changes the board through
**frontend tools**, answers with **widgets** and with agent-generated **A2UI**
surfaces, and reaches other systems through **MCP**. The browser and the agent
talk exclusively via **AG-UI**, so the agent framework and the LLM are swappable.

```
Angular 22 + CopilotKit ──AG-UI──▶ Node agent (scripted or any LLM) ──MCP──▶ dev-tools MCP server
```

Works out of the box **without any API key** (a deterministic "scripted" agent
emits real AG-UI events). Add a key to swap in an LLM without touching the client.

## Quick start

Requirements: Node `>=22.22` or `>=24.15` (Angular CLI 22), npm.

```bash
npm run install:all   # root + server + mcp-server + client (--legacy-peer-deps)
npm run dev           # MCP server :3002, agent server :3001, Angular :4200
```

Open http://localhost:4200 and try, in the assistant panel:

| Type | What happens | Pattern |
| --- | --- | --- |
| `help` | Text answer | streamed `TEXT_MESSAGE_*` |
| `show board` | Agent calls the browser's `getBoard` tool, replies with live task-card widgets | frontend tool + widget |
| `create task Write docs` | Agent calls `createTask` in the browser, shows the new card | frontend tool with side effect |
| `start Write docs` / `finish …` | `moveTask` | frontend tool |
| `dashboard` | Agent-generated A2UI surface (stats, list, buttons that highlight tasks) | A2UI, templated |
| `form` | Agent-generated A2UI form; submitting creates a task and notifies the agent | A2UI events + developer message |
| `estimate Refactor auth` | Server tool, shown as expandable tool pill | server tool |
| `ci status` / `docs on signals` | Tools discovered from the MCP server | MCP |

Switch to the **AG-UI events** tab to watch the protocol while you do it.

### Use a real LLM (optional)

```bash
# OpenAI (or any OpenAI-compatible endpoint)
OPENAI_API_KEY=sk-... npm run dev:agent
OPENAI_BASE_URL=http://localhost:11434/v1 OPENAI_MODEL=qwen2.5:7b npm run dev:agent   # e.g. Ollama

# Google Gemini
GOOGLE_GENERATIVE_AI_API_KEY=... npm run dev:agent

# Force a provider
LLM_PROVIDER=scripted|openai|google
```

All other variables: `MCP_SERVER_URL`, `PORT`, `MCP_PORT`, `LOG_AG_UI_EVENTS`
(see `docs/02-architecture.md`).

## Learn

1. [`docs/01-concepts.md`](docs/01-concepts.md) – AG-UI, A2UI, MCP and MCP Apps;
   the patterns (frontend tools, widgets, server tools, activity renderers);
   and answers to the two central questions:
   *How do I avoid coupling to the server stack and the LLM?* and
   *How do I support dynamic UI as an answer from the agent?*
2. [`docs/02-architecture.md`](docs/02-architecture.md) – how this repo is
   structured, file by file, and one run traced end to end.
3. [`docs/03-labs.md`](docs/03-labs.md) – exercises: add tools, human in the
   loop, extend the A2UI catalog with your own components, raw A2UI from an LLM,
   swap LLM/agent framework, add MCP tools, MCP Apps, server-side memory.

## Repo layout

```
client/       Angular 22 app (CopilotKit headless chat, tools, widgets, A2UI renderer, board)
server/       AG-UI agent server (Express + SSE; ScriptedAgent | LlmAgent via Vercel AI SDK; MCP client)
mcp-server/   Minimal MCP server (Streamable HTTP) with search_docs and get_ci_status
docs/         Concepts, architecture, labs
```

Useful scripts: `npm run dev:web|dev:agent|dev:mcp`, `npm run typecheck`
(servers), `npm run build` (client production build).

## Key libraries

- [`@copilotkit/angular`](https://docs.copilotkit.ai/angular) – headless AG-UI client for Angular
- [`@ag-ui/client`](https://docs.ag-ui.com) – AG-UI protocol (`HttpAgent`, `AbstractAgent`, event types)
- [`@a2ui/angular`](https://a2ui.org) – A2UI v0.9 renderer and Basic Catalog
- [`@modelcontextprotocol/sdk`](https://modelcontextprotocol.io) – MCP server and client
- [`ai`](https://ai-sdk.dev) – provider-agnostic LLM streaming and tool calling

## Sources this project is based on

- Angular Architects blog series on Agentic UI, including
  [MCP Apps in Angular with CopilotKit](https://www.angulararchitects.io/en/blog/mcp-apps-in-angular-with-copilotkit-rich-chat-interfaces-instead-of-text-responses/)
- [`flights42` (branch `agentic`)](https://github.com/angular-architects/flights42/tree/agentic) reference project

## Notes

- `client` installs with `--legacy-peer-deps` because `@a2ui/angular` currently
  declares a peer range of Angular 21; it builds and runs fine on Angular 22.
- Angular budgets in `client/angular.json` are raised: CopilotKit + A2UI add
  ~2 MB raw / ~420 kB compressed to the initial bundle.
