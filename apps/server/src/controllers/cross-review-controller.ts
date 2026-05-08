import type { SessionRecord } from '@neobee/shared';
import { StageController } from './stage-controller.js';
import { CrossReviewChain } from '../chains/cross-review-chain.js';

export class CrossReviewController extends StageController {
  protected async execute(session: SessionRecord): Promise<void> {
    const aggregate = this.store.get(session.id);
    if (!aggregate) return;

    if (aggregate.reviews.length > 0) {
      this.advance(session.id, 'idea_synthesis');
      return;
    }

    if (aggregate.experts.length === 0 || aggregate.rounds.length === 0) return;

    this.eventBus.emitRaw(session.id, 'cross_review.started', 'cross_review', {});
    this.createTask(session.id);

    const chain = new CrossReviewChain();
    const allInsights = aggregate.rounds.flatMap((r) => r.insights);
    const reviews = await chain.run(aggregate.experts, allInsights);

    this.store.setReviews(session.id, reviews);
    this.completeTask();
    this.eventBus.emitRaw(session.id, 'review.completed', 'cross_review', { reviews });
    this.advance(session.id, 'idea_synthesis');
  }
}