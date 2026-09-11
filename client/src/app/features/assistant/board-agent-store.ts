import { inject } from '@angular/core';
import { CopilotKit, injectAgentStore } from '@copilotkit/angular';

import { registerA2uiActionHandlers } from '../../core/agent/a2ui/a2ui-actions';
import { sendDeveloperMessage } from '../../core/agent/agent-store-helpers';
import { initAgentStore } from '../../core/agent/init-agent-store';
import { BoardStore } from '../board/board.store';
import type { TaskPriority } from '../board/task.model';
import { boardTools } from './tools/board.tools';
import { taskCardWidget } from './widgets/task-card-widget';

export const BOARD_AGENT_ID = 'board-agent';
export const BOARD_AGENT_URL = 'http://localhost:3001/ag-ui/board-agent';

/**
 * Everything the assistant feature needs to talk to *its* agent, in one place:
 * the AG-UI endpoint, the frontend tools and widgets it offers, and the
 * handlers for A2UI events coming from agent-generated surfaces.
 */
export function injectBoardAgentStore() {
  initAgentStore({
    agentId: BOARD_AGENT_ID,
    url: BOARD_AGENT_URL,
    frontendTools: [...boardTools, taskCardWidget],
  });

  const store = injectAgentStore(BOARD_AGENT_ID);
  const copilotKit = inject(CopilotKit);
  const board = inject(BoardStore);

  registerA2uiActionHandlers({
    // Fired by the "Open" buttons of the dashboard surface.
    openTask: (action) => {
      const taskId = String(action.context['taskId'] ?? '');
      board.highlight(taskId);
    },
    // Fired by the submit button of the generated form.
    createTaskFromForm: (action) => {
      const title = String(action.context['title'] ?? '').trim();
      const priorityRaw = action.context['priority'];
      const priority = (Array.isArray(priorityRaw) ? priorityRaw[0] : priorityRaw) as TaskPriority | undefined;
      if (!title) {
        return;
      }
      const task = board.add({ title, priority });
      // Tell the agent what the app did, so the conversation stays coherent.
      void sendDeveloperMessage(
        copilotKit,
        store,
        JSON.stringify({ event: 'taskCreatedFromForm', task }),
      );
    },
  });

  return store;
}
