import type { SessionStage, SessionRecord } from '@neobee/shared';
import { EventBus } from '../lib/event-bus.js';
import { SessionStore } from '../modules/sessions/sessions.store.js';
import { taskTracker } from '../lib/task-tracking.js';

const STAGE_INTERVAL_MS = 500;

export abstract class StageController {
  protected readonly store: SessionStore;
  protected readonly eventBus: EventBus;
  readonly stage: SessionStage;

  private running = false;
  private timer: ReturnType<typeof setInterval> | null = null;

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
      // Only process sessions in active states (not paused/failed/completed)
      if (['paused', 'failed', 'completed'].includes(session.status)) continue;

      this.execute(session).catch((err) => {
        console.error(`[${this.stage}] Error executing session ${session.id}:`, err);
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
      idea_synthesis: 'synthesizing',
      graph_build: 'synthesizing',
      summary: 'completed'
    };
    return map[stage] ?? 'created';
  }

  protected createTask(sessionId: string): void {
    taskTracker.createTask(sessionId, this.stage);
  }

  protected createStep(name: string, data: Record<string, unknown> = {}): void {
    taskTracker.createStep(null, this.stage, name, data);
  }

  protected updateProgress(progress: number): void {
    taskTracker.updateTaskProgress(this.stage, progress);
  }

  protected completeTask(): void {
    taskTracker.completeTask(this.stage);
  }
}