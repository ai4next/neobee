import type { SessionEvent, SessionEventType, SessionStage } from '@neobee/shared';

type EventListener = (event: SessionEvent) => void;

export class EventBus {
  private listeners = new Map<string, Set<EventListener>>();

  subscribe(sessionId: string, listener: EventListener): () => void {
    if (!this.listeners.has(sessionId)) {
      this.listeners.set(sessionId, new Set());
    }
    this.listeners.get(sessionId)!.add(listener);
    return () => this.unsubscribe(sessionId, listener);
  }

  unsubscribe(sessionId: string, listener: EventListener): void {
    this.listeners.get(sessionId)?.delete(listener);
  }

  emit(event: SessionEvent): void {
    const listeners = this.listeners.get(event.sessionId);
    if (!listeners) return;
    for (const listener of listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error(`Event listener error for session ${event.sessionId}:`, err);
      }
    }
  }

  emitRaw(sessionId: string, type: SessionEventType, stage: SessionStage, payload: Record<string, unknown> = {}): void {
    const event: SessionEvent = {
      id: crypto.randomUUID(),
      sessionId,
      type,
      stage,
      timestamp: new Date().toISOString(),
      payload
    };
    this.emit(event);
  }
}