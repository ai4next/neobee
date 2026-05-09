import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from '../event-bus.js';

describe('EventBus', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  it('should emit events to subscribed listeners', () => {
    const listener = vi.fn();
    eventBus.subscribe('session-1', listener);

    eventBus.emitRaw('session-1', 'task.started', 'deep_research', { foo: 'bar' });

    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock.calls[0][0];
    expect(event.sessionId).toBe('session-1');
    expect(event.type).toBe('task.started');
    expect(event.stage).toBe('deep_research');
    expect(event.payload).toEqual({ foo: 'bar' });
  });

  it('should not deliver events to other session listeners', () => {
    const listener1 = vi.fn();
    const listener2 = vi.fn();
    eventBus.subscribe('session-1', listener1);
    eventBus.subscribe('session-2', listener2);

    eventBus.emitRaw('session-1', 'task.started', 'deep_research', {});

    expect(listener1).toHaveBeenCalledTimes(1);
    expect(listener2).not.toHaveBeenCalled();
  });

  it('should support unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = eventBus.subscribe('session-1', listener);

    unsubscribe();
    eventBus.emitRaw('session-1', 'task.started', 'deep_research', {});

    expect(listener).not.toHaveBeenCalled();
  });

  it('should forward events to recorder', () => {
    const recorder = vi.fn();
    eventBus.setRecorder(recorder);

    eventBus.emitRaw('session-1', 'task.started', 'deep_research', {});

    expect(recorder).toHaveBeenCalledTimes(1);
  });

  it('should support global wildcard listeners', () => {
    const globalListener = vi.fn();
    eventBus.subscribe('*', globalListener);
    eventBus.subscribe('*', globalListener);

    eventBus.emitRaw('session-1', 'task.started', 'deep_research', {});

    expect(globalListener).toHaveBeenCalledTimes(1);
  });

  it('should emit event with correct shape', () => {
    const listener = vi.fn();
    eventBus.subscribe('s1', listener);
    eventBus.emitRaw('s1', 'session.created', 'topic_intake', { topic: 'AI' });

    const event = listener.mock.calls[0][0];
    expect(event).toHaveProperty('id');
    expect(event).toHaveProperty('sessionId', 's1');
    expect(event).toHaveProperty('type', 'session.created');
    expect(event).toHaveProperty('stage', 'topic_intake');
    expect(event).toHaveProperty('timestamp');
    expect(event).toHaveProperty('payload', { topic: 'AI' });
  });

  it('should handle listener errors without breaking', () => {
    const brokenListener = vi.fn(() => { throw new Error('oops'); });
    const goodListener = vi.fn();
    eventBus.subscribe('s1', brokenListener);
    eventBus.subscribe('s1', goodListener);

    expect(() => eventBus.emitRaw('s1', 'task.started', 'deep_research', {})).not.toThrow();
    expect(goodListener).toHaveBeenCalledTimes(1);
  });
});