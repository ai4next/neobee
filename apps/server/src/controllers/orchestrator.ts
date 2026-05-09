import type { SessionStage } from '@neobee/shared';
import { SessionStore } from '../modules/sessions/sessions.store.js';
import { EventBus } from '../lib/event-bus.js';
import { StageController } from './stage-controller.js';
import { DeepResearchController } from './deep-research-controller.js';
import { ExpertCreationController } from './expert-creation-controller.js';
import { InsightRefinementController } from './insight-refinement-controller.js';
import { CrossReviewController } from './cross-review-controller.js';
import { IdeaSynthesisController } from './idea-synthesis-controller.js';

export class StageOrchestrator {
  private readonly controllers: Map<SessionStage, StageController> = new Map();

  constructor(store: SessionStore, eventBus: EventBus) {
    const stages: SessionStage[] = [
      'deep_research',
      'expert_creation',
      'insight_refinement',
      'cross_review',
      'idea_synthesis'
    ];

    for (const stage of stages) {
      const controller = this.createController(store, eventBus, stage);
      this.controllers.set(stage, controller);
    }
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
    for (const controller of this.controllers.values()) {
      controller.start();
    }
  }

  stopAll(): void {
    for (const controller of this.controllers.values()) {
      controller.stop();
    }
  }

  getController(stage: SessionStage): StageController | undefined {
    return this.controllers.get(stage);
  }
}