import type { CreateSessionInput, SessionAggregate, SessionCheckpoint, SessionEvent, SessionStage } from '@neobee/shared';
import { SessionStore } from './sessions.store.js';
import { EventBus } from '../../lib/event-bus.js';
import { taskTracker } from '../../lib/task-tracking.js';

export class SessionsService {
  private readonly store: SessionStore;
  private readonly eventBus: EventBus;

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
    const aggregate = this.requireSession(sessionId);
    this.store.clearErrors(sessionId);
    this.store.setStatus(sessionId, 'researching', 'deep_research');
    this.eventBus.emitRaw(sessionId, 'task.started', 'deep_research', { sessionId, stage: 'deep_research' });
    return this.requireSession(sessionId);
  }

  pauseSession(sessionId: string): SessionAggregate {
    const aggregate = this.requireSession(sessionId);
    const stage = aggregate.session.currentStage ?? 'topic_intake';
    this.store.setStatus(sessionId, 'paused', stage);
    this.eventBus.emitRaw(sessionId, 'session.paused', stage, {});
    return this.requireSession(sessionId);
  }

  resumeSession(sessionId: string): SessionAggregate {
    const aggregate = this.requireSession(sessionId);
    const stage = aggregate.session.currentStage ?? 'deep_research';
    const status = this.stageToStatus(stage);
    this.store.setStatus(sessionId, status as any, stage);
    this.eventBus.emitRaw(sessionId, 'task.started', stage, { sessionId, stage });
    return this.requireSession(sessionId);
  }

  cancelSession(sessionId: string): SessionAggregate {
    const aggregate = this.requireSession(sessionId);
    const stage = aggregate.session.currentStage ?? 'topic_intake';
    this.store.setStatus(sessionId, 'failed', null);
    this.store.clearCheckpoint(sessionId);
    this.store.appendError(sessionId, 'Session cancelled');
    this.eventBus.emitRaw(sessionId, 'run.failed', stage, { error: 'Session cancelled' });
    return this.requireSession(sessionId);
  }

  listSessions(): SessionAggregate[] {
    return this.store.list();
  }

  getSessionState(sessionId: string): SessionAggregate {
    return this.requireSession(sessionId);
  }

  getGraph(sessionId: string) {
    return this.getSessionState(sessionId).graph;
  }

  getSummary(sessionId: string) {
    return this.getSessionState(sessionId).summary;
  }

  getEvents(sessionId: string): SessionEvent[] {
    this.requireSession(sessionId);
    return this.store.getEvents(sessionId);
  }

  getCheckpoint(sessionId: string): SessionCheckpoint | null {
    this.requireSession(sessionId);
    return this.store.getCheckpoint(sessionId);
  }

  getTaskWithSteps(sessionId: string, stage: SessionStage, page: number = 1, pageSize: number = 20) {
    this.requireSession(sessionId);
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
      steps: paginatedSteps.map((step) => ({
        ...step,
        data: JSON.parse(step.data)
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

  private requireSession(sessionId: string): SessionAggregate {
    const aggregate = this.store.get(sessionId);
    if (!aggregate) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    return aggregate;
  }
}
