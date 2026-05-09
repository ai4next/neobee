import type { SessionStage, SessionRecord } from '@neobee/shared';
import { EventBus } from '../lib/event-bus.js';
import { SessionStore } from '../modules/sessions/sessions.store.js';
import { taskTracker } from '../lib/task-tracking.js';
import { JobQueue } from '../orchestrator/job-queue.js';

export abstract class StageController {
  protected readonly store: SessionStore;
  protected readonly eventBus: EventBus;
  readonly stage: SessionStage;
  protected readonly queue: JobQueue;

  private started = false;

  constructor(store: SessionStore, eventBus: EventBus, stage: SessionStage) {
    this.store = store;
    this.eventBus = eventBus;
    this.stage = stage;
    this.queue = new JobQueue((sessionId) => this.run(sessionId));
  }

  start(): void {
    this.started = true;
  }

  stop(): void {
    this.started = false;
    this.queue.clear();
  }

  enqueue(sessionId: string): void {
    if (!this.started) return;
    this.queue.enqueue(sessionId);
  }

  private async run(sessionId: string): Promise<void> {
    const aggregate = this.store.get(sessionId);
    if (!aggregate) return;

    const session = aggregate.session;
    if (['paused', 'failed', 'completed'].includes(session.status)) return;

    try {
      await this.execute(session);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown stage error';
      this.store.appendError(session.id, `[${this.stage}] ${message}`);
      taskTracker.completeTask(session.id, this.stage, 'failed', message);
      this.store.setStatus(session.id, 'failed', this.stage);
      this.eventBus.emitRaw(session.id, 'run.failed', this.stage, { error: message });
    }
  }

  protected abstract execute(session: SessionRecord): Promise<void>;

  protected advance(sessionId: string, nextStage: SessionStage): void {
    this.store.setStatus(sessionId, this.stageToStatus(nextStage), nextStage);
    this.eventBus.emitRaw(sessionId, 'session.stage_changed', nextStage, { from: this.stage, to: nextStage });
  }

  protected stageToStatus(stage: SessionStage): SessionRecord['status'] {
    const map: Record<SessionStage, SessionRecord['status']> = {
      topic_intake: 'created',
      deep_research: 'researching',
      expert_creation: 'experts_generated',
      insight_refinement: 'debating',
      cross_review: 'reviewing',
      idea_synthesis: 'synthesizing'
    };
    return map[stage] ?? 'created';
  }

  protected createTask(sessionId: string): void {
    taskTracker.createTask(sessionId, this.stage);
  }

  protected createStep(sessionId: string, name: string, data: Record<string, unknown> = {}): void {
    taskTracker.createStep(sessionId, this.stage, name, data);
  }

  protected updateProgress(sessionId: string, progress: number): void {
    taskTracker.updateTaskProgress(sessionId, this.stage, progress);
  }

  protected completeTask(sessionId: string, status: 'completed' | 'failed' = 'completed', error?: string): void {
    taskTracker.completeTask(sessionId, this.stage, status, error);
  }
}
