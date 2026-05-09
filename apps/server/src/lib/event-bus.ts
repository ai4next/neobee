import type { SessionEvent, SessionEventType, SessionStage } from '@neobee/shared';

type EventListener = (event: SessionEvent<any>) => void;
type EventRecorder = (event: SessionEvent<any>) => void;

export class EventBus {
  private readonly listeners = new Map<string, Set<EventListener>>();
  private readonly globalListeners = new Set<EventListener>();
  private recorder: EventRecorder | null = null;

  setRecorder(recorder: EventRecorder): void {
    this.recorder = recorder;
  }

  subscribe(sessionId: string, listener: EventListener): () => void {
    if (sessionId === '*') {
      this.globalListeners.add(listener);
      return () => this.globalListeners.delete(listener);
    }
    if (!this.listeners.has(sessionId)) {
      this.listeners.set(sessionId, new Set());
    }
    this.listeners.get(sessionId)!.add(listener);
    return () => this.unsubscribe(sessionId, listener);
  }

  unsubscribe(sessionId: string, listener: EventListener): void {
    this.listeners.get(sessionId)?.delete(listener);
  }

  emit(event: SessionEvent<any>): void {
    this.recorder?.(event);

    // Notify session-specific listeners
    const listeners = this.listeners.get(event.sessionId);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(event);
        } catch (err) {
          console.error(`Event listener error for session ${event.sessionId}:`, err);
        }
      }
    }

    // Notify global listeners
    for (const listener of this.globalListeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('Global event listener error:', err);
      }
    }
  }

  emitRaw<TPayload = Record<string, unknown>>(
    sessionId: string,
    type: SessionEventType,
    stage: SessionStage,
    payload: TPayload = {} as TPayload
  ): SessionEvent<TPayload> {
    const event: SessionEvent<TPayload> = {
      id: crypto.randomUUID(),
      sessionId,
      type,
      stage,
      timestamp: new Date().toISOString(),
      payload
    };
    this.emit(event);
    return event;
  }
}
