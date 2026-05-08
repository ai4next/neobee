import { useEffect, useRef } from 'react';
import type { SessionAggregate, SessionEvent, TaskProgressPayload } from '@neobee/shared';

const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:4001';

interface UseSessionWebSocketOptions {
  activeSessionId: string | null;
  onSessionState: (aggregate: SessionAggregate) => void;
  onSessionEvents: (events: SessionEvent[]) => void;
  onSessionEvent: (event: SessionEvent) => void;
  onTaskProgress: (progress: TaskProgressPayload) => void;
  onError: (message: string) => void;
}

export function useSessionWebSocket({
  activeSessionId,
  onSessionState,
  onSessionEvents,
  onSessionEvent,
  onTaskProgress,
  onError
}: UseSessionWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const activeSessionRef = useRef<string | null>(activeSessionId);
  const handlersRef = useRef({
    onSessionState,
    onSessionEvents,
    onSessionEvent,
    onTaskProgress,
    onError
  });

  activeSessionRef.current = activeSessionId;
  handlersRef.current = {
    onSessionState,
    onSessionEvents,
    onSessionEvent,
    onTaskProgress,
    onError
  };

  useEffect(() => {
    let reconnectTimer: number | null = null;

    const subscribe = () => {
      const sessionId = activeSessionRef.current;
      const socket = wsRef.current;
      if (!sessionId || !socket || socket.readyState !== WebSocket.OPEN) {
        return;
      }

      socket.send(JSON.stringify({ type: 'subscribe_session', payload: { sessionId } }));
    };

    const connect = () => {
      const current = wsRef.current;
      if (current && (current.readyState === WebSocket.OPEN || current.readyState === WebSocket.CONNECTING)) {
        subscribe();
        return;
      }

      const socket = new WebSocket(WS_URL);
      wsRef.current = socket;

      socket.onopen = () => {
        reconnectAttempts.current = 0;
        subscribe();
      };

      socket.onmessage = (message) => {
        try {
          const data = JSON.parse(message.data);
          switch (data.type) {
            case 'session_state':
              handlersRef.current.onSessionState(data.payload as SessionAggregate);
              break;
            case 'session_events':
              handlersRef.current.onSessionEvents(data.payload as SessionEvent[]);
              break;
            case 'event':
              handlersRef.current.onSessionEvent(data.payload as SessionEvent);
              break;
            case 'task.progress':
              handlersRef.current.onTaskProgress((data.payload as SessionEvent<TaskProgressPayload>).payload);
              break;
            case 'error':
              handlersRef.current.onError((data.payload as { message?: string }).message ?? 'WebSocket error');
              break;
          }
        } catch {
          handlersRef.current.onError('Failed to parse WebSocket message');
        }
      };

      socket.onerror = () => {
        handlersRef.current.onError('WebSocket connection error');
      };

      socket.onclose = () => {
        wsRef.current = null;
        if (reconnectAttempts.current >= maxReconnectAttempts) {
          return;
        }

        const delay = Math.min(1000 * 2 ** reconnectAttempts.current, 30000);
        reconnectAttempts.current += 1;
        reconnectTimer = window.setTimeout(() => {
          connect();
        }, delay);
      };
    };

    connect();

    return () => {
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
      }
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, []);

  useEffect(() => {
    const socket = wsRef.current;
    if (!activeSessionId || !socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    socket.send(JSON.stringify({ type: 'subscribe_session', payload: { sessionId: activeSessionId } }));
  }, [activeSessionId]);
}
