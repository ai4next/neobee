import type { SessionRecord } from '@neobee/shared';
import { StageController } from './stage-controller.js';
import { InsightRefinementChain } from '../chains/insight-refinement-chain.js';

export class InsightRefinementController extends StageController {
  protected async execute(session: SessionRecord): Promise<void> {
    const aggregate = this.store.get(session.id);
    if (!aggregate) return;

    if (!aggregate.researchBrief || aggregate.experts.length === 0) return;

    // Already completed (has rounds for all experts × rounds)
    const expectedRounds = session.roundCount;
    const allExpertsDone = aggregate.experts.every(
      (expert) => aggregate.rounds.some((r) => r.expertId === expert.id && r.round === expectedRounds)
    );
    if (allExpertsDone && aggregate.rounds.length > 0) {
      this.advance(session.id, 'cross_review');
      return;
    }

    this.eventBus.emitRaw(session.id, 'insight_refinement.started', 'insight_refinement', {});
    this.createTask(session.id);

    const chain = new InsightRefinementChain();
    const rounds = [...aggregate.rounds];

    // Resume from checkpoint cursor if available
    const cursor = aggregate.checkpoint?.insightRefinementCursor;
    const startExpertIdx = cursor?.expertIndex ?? 0;
    const startRoundIdx = cursor?.roundIndex ?? 0;

    for (let expertIdx = startExpertIdx; expertIdx < aggregate.experts.length; expertIdx++) {
      const expert = aggregate.experts[expertIdx];
      const startRound = expertIdx === startExpertIdx ? startRoundIdx + 1 : 1;

      for (let round = startRound; round <= session.roundCount; round++) {
        // Check pause
        const updated = this.store.get(session.id);
        if (updated?.session.status === 'paused') {
          this.store.saveCheckpoint(session.id, {
            ...updated.checkpoint!,
            insightRefinementCursor: { expertIndex: expertIdx, roundIndex: round }
          });
          return;
        }

        this.createStep(`round_${round}_started`, { expertId: expert.id });

        const previousInsights = rounds
          .filter((r) => r.expertId === expert.id)
          .flatMap((r) => r.insights);

        const insight = await chain.run({
          round,
          expert,
          session,
          researchBrief: aggregate.researchBrief!,
          previousInsights
        });

        const existingRound = rounds.find((r) => r.round === round && r.expertId === expert.id);
        if (existingRound) {
          existingRound.insights.push(insight);
        } else {
          rounds.push({ round, expertId: expert.id, insights: [insight] });
        }

        this.createStep(`round_${round}_completed`, { insightId: insight.id });
        this.store.setRounds(session.id, rounds);
      }
    }

    this.completeTask();
    this.eventBus.emitRaw(session.id, 'insight_refinement.completed', 'insight_refinement', { rounds });
    this.advance(session.id, 'cross_review');
  }
}