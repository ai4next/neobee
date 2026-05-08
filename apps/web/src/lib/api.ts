import type {
  CreateSessionInput,
  SessionAggregate,
  SessionEvent,
  SessionStage
} from '@neobee/shared';

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (!response.ok) {
    let message = `Request failed: ${response.status}`;
    try {
      const payload = await response.json();
      if (typeof payload.error === 'string') {
        message = payload.error;
      }
    } catch {
      // Ignore JSON parse errors and keep the HTTP status based message.
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export interface TaskStepsResponse {
  task: {
    id: string;
    sessionId: string;
    status: string;
    progress: number;
    createdAt: string;
    updatedAt: string;
  } | null;
  steps: Array<{
    id: string;
    taskId: string;
    name: string;
    data: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
  }>;
  totalSteps: number;
  totalPages: number;
  currentPage?: number;
}

export const api = {
  listSessions(): Promise<SessionAggregate[]> {
    return apiRequest<SessionAggregate[]>('/api/sessions');
  },

  createSession(input: CreateSessionInput): Promise<SessionAggregate> {
    return apiRequest<SessionAggregate>('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    });
  },

  runSession(sessionId: string): Promise<SessionAggregate> {
    return apiRequest<SessionAggregate>(`/api/sessions/${sessionId}/run`, {
      method: 'POST'
    });
  },

  fetchSessionState(sessionId: string): Promise<SessionAggregate> {
    return apiRequest<SessionAggregate>(`/api/sessions/${sessionId}/state`);
  },

  fetchSessionEvents(sessionId: string): Promise<SessionEvent[]> {
    return apiRequest<SessionEvent[]>(`/api/sessions/${sessionId}/events`);
  },

  fetchTaskSteps(sessionId: string, stage: SessionStage, page: number, pageSize = 10): Promise<TaskStepsResponse> {
    return apiRequest<TaskStepsResponse>(
      `/api/sessions/${sessionId}/tasks/${stage}?page=${page}&pageSize=${pageSize}`
    );
  }
};
