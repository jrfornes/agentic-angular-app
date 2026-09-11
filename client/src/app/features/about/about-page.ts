import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-about-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="about">
      <h2>How this app is wired</h2>
      <pre class="diagram">
 Angular (this app)                     agent server (Node)                 external
 ─────────────────────────────          ───────────────────────────         ─────────────
 CopilotKit headless chat   ──AG-UI──▶  AbstractAgent.run(input)  ──MCP──▶  MCP server
   • frontend tools         ◀──SSE────    scripted | LLM (AI SDK)            (dev-tools)
   • widgets (taskCard)                   server tools
   • A2UI activity renderer               A2UI surface builders
   • raw event inspector                  validation
      </pre>

      <h3>Three kinds of "agent output"</h3>
      <ul>
        <li><strong>Text</strong> – <code>TEXT_MESSAGE_*</code> events, streamed token by token.</li>
        <li>
          <strong>Tool calls</strong> – <code>TOOL_CALL_*</code> events. Server tools are executed by the agent
          (you see the call + result). Frontend tools are executed here in Angular; the result is sent back
          in the next run. Widgets are frontend tools with a component and no follow-up.
        </li>
        <li>
          <strong>Activities</strong> – <code>ACTIVITY_SNAPSHOT</code> events carrying an <code>activityType</code>.
          This app registers a renderer for <code>a2ui-surface</code>: the agent describes UI with the A2UI Basic
          Catalog, the client renders it with its own components and handles the events.
        </li>
      </ul>

      <h3>Why the client is not coupled to the LLM or the server stack</h3>
      <ul>
        <li>The only contract is AG-UI over HTTP/SSE. Swap the server for Mastra, LangGraph, ADK, Pydantic AI, .NET – nothing here changes.</li>
        <li>The model is a server detail. This demo runs scripted (no LLM), OpenAI-compatible or Gemini behind the same endpoint.</li>
        <li>Dynamic UI comes from a catalog (A2UI) or registered widgets – never from code shipped by the agent.</li>
      </ul>

      <p>Open the <em>AG-UI events</em> tab in the assistant and watch the protocol while you chat. The docs folder in the repo has the full guide and labs.</p>
    </article>
  `,
  styles: `
    .about { max-width: 820px; display: grid; gap: 12px; }
    .diagram { font-size: 12px; line-height: 1.5; background: var(--surface-2); border: 1px solid var(--border);
      border-radius: 10px; padding: 12px; overflow-x: auto; }
    h2, h3 { margin: 8px 0 0; }
    ul { margin: 0; padding-left: 20px; line-height: 1.6; }
    code { font-family: var(--font-mono); font-size: 12px; background: var(--surface-2); padding: 1px 5px; border-radius: 4px; }
  `,
})
export class AboutPage {}
