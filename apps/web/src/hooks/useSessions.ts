import { useEffect, useState } from 'react';
import type {
  CreateSessionInput,
  SessionAggregate,
  SessionEvent,
  SessionStage
} from '@neobee/shared';
import { api } from '../lib/api';
import { useTaskProgress } from './useTaskProgress';
import { useSessionWebSocket } from './useSessionWebSocket';

function mergeSessionList(
  previous: SessionAggregate[],
  nextSession: SessionAggregate
): SessionAggregate[] {
  const exists = previous.some((session) => session.session.id === nextSession.session.id);
  const merged = exists
    ? previous.map((session) => (session.session.id === nextSession.session.id ? nextSession : session))
    : [nextSession, ...previous];

  return merged.sort((a, b) => b.session.updatedAt.localeCompare(a.session.updatedAt));
}

export function useSessions(language: string) {
  const [sessions, setSessions] = useState<SessionAggregate[]>([]);
  const [session, setSession] = useState<SessionAggregate | null>(null);
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [selectedStage, setSelectedStage] = useState<SessionStage>('topic_intake');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { taskProgress, resetTaskProgress, applyTaskProgress } = useTaskProgress();

  useEffect(() => {
    api.listSessions()
      .then(setSessions)
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to fetch sessions');
      });
  }, []);

  useSessionWebSocket({
    activeSessionId: session?.session.id ?? null,
    onSessionState: (aggregate) => {
      setSession(aggregate);
      if (aggregate.session.currentStage) {
        setSelectedStage(aggregate.session.currentStage);
      }
      setSessions((previous) => mergeSessionList(previous, aggregate));
      if (aggregate.session.status === 'completed' || aggregate.session.status === 'failed') {
        setIsSubmitting(false);
      }
    },
    onSessionEvents: (nextEvents) => {
      setEvents(nextEvents);
    },
    onSessionEvent: (event) => {
      setEvents((previous) => {
        if (previous.some((existing) => existing.id === event.id)) {
          return previous;
        }
        return [...previous, event];
      });

      if (event.stage) {
        setSelectedStage(event.stage);
      }

      if (event.type === 'run.failed') {
        setError((event.payload as { error?: string }).error ?? 'Session failed');
        setIsSubmitting(false);
      }
    },
    onTaskProgress: (progress) => {
      applyTaskProgress(progress);
    },
    onError: (message) => {
      setError(message);
      setIsSubmitting(false);
    }
  });

  async function createAndRunSession(form: CreateSessionInput): Promise<void> {
    setIsSubmitting(true);
    setError(null);
    resetTaskProgress();

    try {
      const aggregate = await api.createSession({ ...form, language });
      setSession(aggregate);
      setEvents([]);
      setSelectedStage('topic_intake');
      setSessions((previous) => mergeSessionList(previous, aggregate));
      await api.runSession(aggregate.session.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setIsSubmitting(false);
    }
  }

  async function retrySession(): Promise<void> {
    if (!session) return;
    setIsSubmitting(true);
    setError(null);
    resetTaskProgress();

    try {
      const aggregate = await api.retrySession(session.session.id);
      setSession(aggregate);
      setSessions((previous) => mergeSessionList(previous, aggregate));
      setIsSubmitting(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Retry failed');
      setIsSubmitting(false);
    }
  }

  async function deleteSession(sessionId: string): Promise<void> {
    try {
      await api.deleteSession(sessionId);
      setSessions((previous) => previous.filter((s) => s.session.id !== sessionId));
      if (session?.session.id === sessionId) {
        setSession(null);
        setEvents([]);
        setError(null);
        resetTaskProgress();
        setSelectedStage('topic_intake');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  function selectSession(nextSession: SessionAggregate): void {
    setSession(nextSession);
    setEvents([]);
    setError(null);
    resetTaskProgress();
    setSelectedStage(nextSession.session.currentStage ?? 'topic_intake');
  }

  function prepareNewSession(): void {
    setSession(null);
    setEvents([]);
    setError(null);
    resetTaskProgress();
    setSelectedStage('topic_intake');
    setIsSubmitting(false);
  }

  return {
    sessions,
    session,
    events,
    taskProgress,
    selectedStage,
    setSelectedStage,
    isSubmitting,
    error,
    createAndRunSession,
    retrySession,
    deleteSession,
    selectSession,
    prepareNewSession
  };
}
