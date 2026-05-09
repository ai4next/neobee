import type { SessionEvent, SessionStage } from '@neobee/shared';
import { SessionStore } from '../modules/sessions/sessions.store.js';
import { EventBus } from '../lib/event-bus.js';
import { StageController } from './stage-controller.js';
import { DeepResearchController } from './deep-research-controller.js';
import { ExpertCreationController } from './expert-creation-controller.js';
import { InsightRefinementController } from './insight-refinement-controller.js';
import { CrossReviewController } from './cross-review-controller.js';
import { IdeaSynthesisController } from './idea-synthesis-controller.js';

const ACTIVE_STAGES: SessionStage[] = [
  'deep_research',
  'expert_creation',
  'insight_refinement',
  'cross_review',
  'idea_synthesis'
];

export class StageOrchestrator {
  private readonly controllers: Map<SessionStage, StageController> = new Map();
  private readonly store: SessionStore;

  constructor(store: SessionStore, eventBus: EventBus) {
    this.store = store;
    for (const stage of ACTIVE_STAGES) {
      const controller = this.createController(store, eventBus, stage);
      this.controllers.set(stage, controller);
    }

    // Subscribe to stage change events for event-driven dispatch
    eventBus.subscribe('*', (event: SessionEvent) => {
      if (event.type === 'session.stage_changed') {
        const nextStage = event.stage;
        this.dispatch(event.sessionId, nextStage);
      }
    });
  }

  private createController(store: SessionStore, eventBus: EventBus, stage: SessionStage): StageController {
    switch (stage) {
      case 'deep_research':
        return new DeepResearchController(store, eventBus, stage);
      case 'expert_creation':
        return new ExpertCreationController(store, eventBus, stage);
      case 'insight_refinement':
        return new InsightRefinementController(store, eventBus, stage);
      case 'cross_review':
        return new CrossReviewController(store, eventBus, stage);
      case 'idea_synthesis':
        return new IdeaSynthesisController(store, eventBus, stage);
      default:
        throw new Error(`Unknown stage: ${stage}`);
    }
  }

  startAll(): void {
    // Start all controllers
    for (const controller of this.controllers.values()) {
      controller.start();
    }
    // Scan for sessions that were mid-stage (crash recovery)
    this.scanInFlightSessions();
  }

  stopAll(): void {
    for (const controller of this.controllers.values()) {
      controller.stop();
    }
  }

  dispatch(sessionId: string, stage: SessionStage): void {
    if (!ACTIVE_STAGES.includes(stage)) return;
    const controller = this.controllers.get(stage);
    if (controller) {
      controller.enqueue(sessionId);
    }
  }

  private scanInFlightSessions(): void {
    for (const stage of ACTIVE_STAGES) {
      const sessions = this.store.findByCurrentStage(stage);
      for (const session of sessions) {
        if (session.status === 'researching' || session.status === 'experts_generated' ||
            session.status === 'debating' || session.status === 'reviewing' ||
            session.status === 'synthesizing') {
          this.dispatch(session.id, stage);
        }
      }
    }
  }

  getController(stage: SessionStage): StageController | undefined {
    return this.controllers.get(stage);
  }
}