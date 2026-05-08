import type { CreateSessionInput, SessionAggregate, SessionCheckpoint, SessionEvent, SessionStage } from '@neobee/shared';
import { SessionStore } from './sessions.store.js';
import { EventBus } from '../../lib/event-bus.js';

export class SessionsService {
  private readonly store: SessionStore;
  private readonly eventBus: EventBus;
  private readonly eventListeners = new Map<string, Set<(event: SessionEvent) => void>>();

  constructor(store: SessionStore, eventBus: EventBus) {
    this.store = store;
    this.eventBus = eventBus;
  }

  createSession(input: CreateSessionInput): SessionAggregate {
    const aggregate = this.store.create(input);
    this.eventBus.emitRaw(aggregate.session.id, 'session.created', 'topic_intake', { session: aggregate.session });
    return aggregate;
  }

  runSession(sessionId: string): SessionAggregate {
    const aggregate = this.store.get(sessionId);
    if (!aggregate) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    this.store.setStatus(sessionId, 'researching', 'deep_research');
    return this.store.get(sessionId)!;
  }

  pauseSession(sessionId: string): void {
    this.store.setStatus(sessionId, 'paused', this.store.get(sessionId)?.session.currentStage ?? 'topic_intake');
  }

  resumeSession(sessionId: string): void {
    const aggregate = this.store.get(sessionId);
    if (!aggregate) return;
    const stage = aggregate.session.currentStage ?? 'deep_research';
    const status = this.stageToStatus(stage);
    this.store.setStatus(sessionId, status as any, stage);
  }

  cancelSession(sessionId: string): void {
    this.store.setStatus(sessionId, 'failed', null);
    this.store.clearCheckpoint(sessionId);
  }

  listSessions(): SessionAggregate[] {
    return this.store.list();
  }

  getSessionState(sessionId: string): SessionAggregate {
    const aggregate = this.store.get(sessionId);
    if (!aggregate) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    return aggregate;
  }

  getGraph(sessionId: string) {
    return this.getSessionState(sessionId).graph;
  }

  getSummary(sessionId: string) {
    return this.getSessionState(sessionId).summary;
  }

  getEvents(sessionId: string): SessionEvent[] {
    return this.store.getEvents(sessionId);
  }

  getCheckpoint(sessionId: string): SessionCheckpoint | null {
    return this.store.getCheckpoint(sessionId);
  }

  getTaskWithSteps(sessionId: string, stage: SessionStage, page: number = 1, pageSize: number = 20) {
    const { taskTracker } = require('../../lib/task-tracking.js');
    const task = taskTracker.getTask(sessionId, stage);
    if (!task) {
      return { task: null, steps: [], totalSteps: 0, totalPages: 0 };
    }

    const allSteps = taskTracker.getSteps(task.id, stage);
    const totalSteps = allSteps.length;
    const totalPages = Math.ceil(totalSteps / pageSize);
    const startIndex = (page - 1) * pageSize;
    const paginatedSteps = allSteps.slice(startIndex, startIndex + pageSize);

    return {
      task,
      steps: paginatedSteps.map((s: any) => ({
        ...s,
        data: JSON.parse(s.data)
      })),
      totalSteps,
      totalPages,
      currentPage: page
    };
  }

  addEventListener(sessionId: string, listener: (event: SessionEvent) => void): () => void {
    return this.eventBus.subscribe(sessionId, listener);
  }

  removeEventListener(sessionId: string, listener: (event: SessionEvent) => void): void {
    this.eventBus.unsubscribe(sessionId, listener);
  }

  private stageToStatus(stage: SessionStage): string {
    const map: Record<SessionStage, string> = {
      topic_intake: 'created',
      deep_research: 'researching',
      expert_creation: 'experts_generated',
      insight_refinement: 'debating',
      cross_review: 'reviewing',
      idea_synthesis: 'synthesizing',
      graph_build: 'synthesizing',
      summary: 'completed'
    };
    return map[stage] ?? 'created';
  }
}