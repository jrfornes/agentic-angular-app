import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import cors from "cors";
import express from "express";
import { z } from "zod";

/**
 * A tiny "dev-tools" MCP server. Think of it as a business partner's or a
 * platform team's service: it knows things the agent does not (CI status,
 * engineering guidelines) and exposes them as MCP *tools*.
 *
 * The agent server connects to it with an MCP client and offers the tools to
 * the model. The Angular app never talks to this server directly.
 */
const GUIDELINES = [
  {
    id: "signals",
    title: "State with Signals",
    text: "Model component and feature state with Angular signals. Derive with computed(), keep side effects in effect() rare and local. Prefer signal-based inputs/outputs.",
  },
  {
    id: "standalone",
    title: "Standalone components only",
    text: "New code uses standalone components, functional guards and provide* functions. Group features by domain, not by technical type.",
  },
  {
    id: "agentic",
    title: "Agentic UI boundaries",
    text: "The frontend talks to agents only through AG-UI. Tools and widgets are registered per agent id. Never import a vendor LLM SDK in the client.",
  },
  {
    id: "testing",
    title: "Testing",
    text: "Unit test stores and pure functions with Vitest. Cover critical flows with a browser test. Tool handlers are plain functions – test them without the agent.",
  },
  {
    id: "a2ui",
    title: "Dynamic UI",
    text: "Agent-generated UI must come from a catalog (A2UI) or a registered widget. Validate structures on the server before they reach the browser.",
  },
];

/**
 * In stateless HTTP mode every request gets its own server + transport pair,
 * which is the pattern the MCP SDK recommends for simple deployments.
 */
function createServer(): McpServer {
  const server = new McpServer({
    name: "Agentic Board Dev-Tools MCP Server",
    version: "1.0.0",
  });

  server.registerTool(
    "search_docs",
    {
      title: "Search engineering guidelines",
      description:
        "Searches the team engineering guidelines. Use it when the user asks how something should be done in this codebase.",
      inputSchema: { query: z.string().min(1).describe("Free-text query") },
      outputSchema: {
        results: z.array(
          z.object({ id: z.string(), title: z.string(), excerpt: z.string() }),
        ),
      },
    },
    async ({ query }) => {
      const terms = query
        .toLowerCase()
        .split(/\W+/)
        .filter((term) => term.length > 2);
      const results = GUIDELINES.filter((doc) => {
        const haystack = `${doc.title} ${doc.text}`.toLowerCase();
        return (
          terms.length === 0 || terms.some((term) => haystack.includes(term))
        );
      }).map((doc) => ({ id: doc.id, title: doc.title, excerpt: doc.text }));
      const structuredContent = { results };
      return {
        content: [{ type: "text", text: JSON.stringify(structuredContent) }],
        structuredContent,
      };
    },
  );

  server.registerTool(
    "get_ci_status",
    {
      title: "Get CI status",
      description:
        "Returns the (simulated) CI pipeline status for a git branch.",
      inputSchema: {
        branch: z.string().default("main").describe("Branch name"),
      },
      outputSchema: {
        branch: z.string(),
        status: z.enum(["passing", "failing", "running"]),
        summary: z.string(),
        durationSeconds: z.number(),
      },
    },
    async ({ branch }) => {
      // Deterministic pseudo status derived from the branch name.
      const hash = [...branch].reduce(
        (acc, char) => acc + char.charCodeAt(0),
        0,
      );
      const status = (["passing", "failing", "running"] as const)[hash % 3];
      const structuredContent = {
        branch,
        status,
        summary:
          status === "passing"
            ? "All 128 tests passed"
            : status === "failing"
              ? "2 unit tests failed in board.store.spec.ts"
              : "Build step 3/5 (ng build) in progress",
        durationSeconds: 120 + (hash % 300),
      };
      return {
        content: [{ type: "text", text: JSON.stringify(structuredContent) }],
        structuredContent,
      };
    },
  );

  return server;
}

const app = express();
app.use(cors({ exposedHeaders: ["Mcp-Session-Id"] }));
app.use(express.json());

app.all("/mcp", async (req, res) => {
  const server = createServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

const port = Number(process.env["MCP_PORT"] ?? 3002);
app.listen(port, () => {
  console.log(`MCP server listening on http://localhost:${port}/mcp`);
});
