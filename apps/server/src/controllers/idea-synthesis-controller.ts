import type { SessionRecord, IdeaCandidate } from '@neobee/shared';
import { StageController } from './stage-controller.js';
import { workerPool } from '../workers/worker-pool.js';

export class IdeaSynthesisController extends StageController {
  protected async execute(session: SessionRecord): Promise<void> {
    const aggregate = this.store.get(session.id);
    if (!aggregate) return;

    if (aggregate.ideas.length > 0) {
      this.store.setStatus(session.id, 'completed', 'idea_synthesis');
      this.eventBus.emitRaw(session.id, 'session.stage_changed', 'idea_synthesis', { from: 'idea_synthesis', to: 'idea_synthesis' });
      return;
    }

    if (!aggregate.researchBrief || aggregate.experts.length === 0 || aggregate.rounds.length === 0) return;

    this.eventBus.emitRaw(session.id, 'idea_synthesis.started', 'idea_synthesis', {});
    this.createTask(session.id);

    const allInsights = aggregate.rounds.flatMap((r) => r.insights);
    const ideas = await workerPool.execute<IdeaCandidate[]>('idea_synthesis', {
      session,
      researchBrief: aggregate.researchBrief,
      insights: allInsights,
      reviews: aggregate.reviews
    });

    this.store.setIdeas(session.id, ideas);
    this.completeTask(session.id);
    this.eventBus.emitRaw(session.id, 'idea.generated', 'idea_synthesis', { ideas });
    this.store.setStatus(session.id, 'completed', 'idea_synthesis');
    this.eventBus.emitRaw(session.id, 'session.stage_changed', 'idea_synthesis', { from: 'idea_synthesis', to: 'idea_synthesis' });
  }
}
