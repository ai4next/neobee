import { WebSocket, WebSocketServer } from 'ws';
import type { SessionEvent } from '@neobee/shared';
import { SessionsService } from '../modules/sessions/sessions.service.js';
import type { Server } from 'http';
import { logger } from '../lib/logger.js';

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
  _eventBus: unknown,
  server: Server
): WebSocketServer {
  const wss = new WebSocketServer({ server });

  function send(ws: WebSocket, type: string, payload: unknown): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type, payload }));
    }
  }

  function sendSessionState(ws: WebSocket, sessionId: string): void {
    try {
      const aggregate = sessionsService.getSessionState(sessionId);
      send(ws, 'session_state', aggregate);
      send(ws, 'session_events', sessionsService.getEvents(sessionId));
    } catch {
      send(ws, 'error', { message: 'Session not found' });
    }
  }

  wss.on('connection', (ws) => {
    const client: ConnectedClient = { ws, sessionId: null };

    ws.on('message', (data) => {
      try {
        const message: ClientMessage = JSON.parse(data.toString());

        if (message.type !== 'subscribe_session') {
          send(ws, 'error', { message: 'Unsupported message type' });
          return;
        }

        client.unsubscribe?.();
        client.sessionId = message.payload.sessionId;
        client.unsubscribe = sessionsService.addEventListener(client.sessionId, (event: SessionEvent) => {
          send(ws, event.type === 'task.progress' ? 'task.progress' : 'event', event);
          sendSessionState(ws, client.sessionId!);
        });

        sendSessionState(ws, client.sessionId);
      } catch (err) {
        send(ws, 'error', { message: err instanceof Error ? err.message : 'Unknown error' });
      }
    });

    ws.on('close', () => {
      client.unsubscribe?.();
    });
  });

  logger.info('WebSocket server attached to HTTP server');

  return wss;
}
