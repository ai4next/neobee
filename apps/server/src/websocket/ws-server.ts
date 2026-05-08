import { WebSocket, WebSocketServer } from 'ws';
import type { SessionEvent } from '@neobee/shared';
import { SessionsService } from '../modules/sessions/sessions.service.js';
import { EventBus } from '../lib/event-bus.js';
import type { Server } from 'http';

interface ClientMessage {
  type: 'subscribe_session';
  payload: { sessionId: string };
}

interface ConnectedClient {
  ws: WebSocket;
  sessionId: string | null;
  unsubscribe?: () => void;
}

export function createWebSocketServer(
  sessionsService: SessionsService,
  eventBus: EventBus,
  server: Server
): WebSocketServer {
  const wss = new WebSocketServer({ server });

  const clients: ConnectedClient[] = [];

  function send(ws: WebSocket, type: string, payload: unknown): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type, payload }));
    }
  }

  function broadcast(sessionId: string, event: SessionEvent): void {
    const message = JSON.stringify({ type: event.type, payload: event.payload });
    for (const client of clients) {
      if (client.sessionId === sessionId && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(message);
      }
    }
  }

  wss.on('connection', (ws) => {
    const client: ConnectedClient = { ws, sessionId: null };
    clients.push(client);

    ws.on('message', (data) => {
      try {
        const message: ClientMessage = JSON.parse(data.toString());

        switch (message.type) {
          case 'subscribe_session': {
            const payload = message.payload as { sessionId: string };
            const { sessionId } = payload;
            client.sessionId = sessionId;

            const unsub = eventBus.subscribe(sessionId, (event) => {
              broadcast(sessionId, event);
            });
            client.unsubscribe = unsub;

            try {
              const aggregate = sessionsService.getSessionState(sessionId);
              send(ws, 'session_state', aggregate);
            } catch {
              send(ws, 'error', { message: 'Session not found' });
            }
            break;
          }
        }
      } catch (err) {
        send(ws, 'error', { message: err instanceof Error ? err.message : 'Unknown error' });
      }
    });

    ws.on('close', () => {
      const index = clients.indexOf(client);
      if (index !== -1) {
        clients.splice(index, 1);
      }
      client.unsubscribe?.();
    });
  });

  console.log('WebSocket server attached to HTTP server');

  return wss;
}
