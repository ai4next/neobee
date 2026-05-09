import type { SessionStage, SessionRecord } from '@neobee/shared';
import { EventBus } from '../lib/event-bus.js';
import { SessionStore } from '../modules/sessions/sessions.store.js';
import { taskTracker } from '../lib/task-tracking.js';

const STAGE_INTERVAL_MS = 1000;

export abstract class StageController {
  protected readonly store: SessionStore;
  protected readonly eventBus: EventBus;
  readonly stage: SessionStage;

  private running = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly inFlightSessions = new Set<string>();

  constructor(store: SessionStore, eventBus: EventBus, stage: SessionStage) {
    this.store = store;
    this.eventBus = eventBus;
    this.stage = stage;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.poll();
    this.timer = setInterval(() => this.poll(), STAGE_INTERVAL_MS);
  }

  stop(): void {
    this.running = false;
    this.inFlightSessions.clear();
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private poll(): void {
    if (!this.running) return;

    const sessions = this.store.findByCurrentStage(this.stage);
    for (const session of sessions) {
      if (!this.running) break;
      if (['paused', 'failed', 'completed'].includes(session.status)) continue;
      if (this.inFlightSessions.has(session.id)) continue;

      this.inFlightSessions.add(session.id);
      this.execute(session)
        .catch((err) => {
          const message = err instanceof Error ? err.message : 'Unknown stage error';
          this.store.appendError(session.id, `[${this.stage}] ${message}`);
          taskTracker.completeTask(session.id, this.stage, 'failed', message);
          this.store.setStatus(session.id, 'failed', this.stage);
          this.eventBus.emitRaw(session.id, 'run.failed', this.stage, { error: message });
          console.error(`[${this.stage}] Error executing session ${session.id}:`, err);
        })
        .finally(() => {
          this.inFlightSessions.delete(session.id);
        });
    }
  }

  protected abstract execute(session: SessionRecord): Promise<void>;

  protected advance(sessionId: string, nextStage: SessionStage): void {
    this.store.setStatus(sessionId, this.stageToStatus(nextStage), nextStage);
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
