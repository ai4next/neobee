import type { SessionCheckpoint, SessionRecord } from '@neobee/shared';
import { StageController } from './stage-controller.js';
import { workerPool } from '../workers/worker-pool.js';
import type { CrossReviewProgress, CrossReviewResult } from '../chains/cross-review-chain.js';

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

    const allInsights = aggregate.rounds.flatMap((r) => r.insights);
    const completedExpertIds = new Set(aggregate.checkpoint?.crossReviewCursor?.completedExpertIds ?? []);

    const onProgress = (progress: CrossReviewProgress) => {
      if (progress.type === 'expert_completed') {
        completedExpertIds.add(progress.expertId);

        const baseCheckpoint: SessionCheckpoint = aggregate.checkpoint ?? {
          completedStages: [],
          currentStage: 'cross_review',
          stageProgress: 0,
          researchBrief: aggregate.researchBrief,
          experts: aggregate.experts,
          rounds: aggregate.rounds,
          reviews: [],
          ideas: [],
          insightRefinementCursor: null,
          crossReviewCursor: null
        };

        this.store.saveCheckpoint(session.id, {
          ...baseCheckpoint,
          reviews: progress.reviews,
          crossReviewCursor: { completedExpertIds: Array.from(completedExpertIds) }
        });
      }
    };

    const { reviews, insightTotals } = await workerPool.execute<CrossReviewResult>(
      'cross_review',
      {
        experts: aggregate.experts,
        insights: allInsights,
        session,
        completedExpertIds: Array.from(completedExpertIds)
      },
      onProgress
    );

    this.store.setReviews(session.id, reviews);
    this.store.clearCheckpoint(session.id);
    this.createStep(session.id, 'aggregation_completed', { insightTotals });
    this.completeTask(session.id);
    this.eventBus.emitRaw(session.id, 'review.completed', 'cross_review', {
      reviews,
      insightTotals
    });
    this.advance(session.id, 'idea_synthesis');
  }
}
