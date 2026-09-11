import type { BaseEvent } from '@ag-ui/core';
import type { Response } from 'express';
import type { Observable } from 'rxjs';

/**
 * AG-UI is transport agnostic. The official SDKs use HTTP + Server-Sent Events,
 * where every AG-UI event is one `data:` line containing JSON.
 *
 * This is the only piece of "glue" between the protocol and the web server.
 */
export function pipeEventsToSse(
  events$: Observable<BaseEvent>,
  res: Response,
  options: { log?: boolean } = {},
): void {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // A leading comment defeats proxies that buffer until the first payload.
  res.write(':\n\n');

  let closed = false;

  const subscription = events$.subscribe({
    next: (event) => {
      if (closed) {
        return;
      }
      if (options.log) {
        console.log('[ag-ui →]', JSON.stringify(event));
      }
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    },
    error: (error: unknown) => {
      if (closed) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      res.write(
        `data: ${JSON.stringify({ type: 'RUN_ERROR', message, code: 'run_error' })}\n\n`,
      );
      closed = true;
      res.end();
    },
    complete: () => {
      if (closed) {
        return;
      }
      closed = true;
      res.end();
    },
  });

  res.on('close', () => {
    closed = true;
    subscription.unsubscribe();
  });
}
