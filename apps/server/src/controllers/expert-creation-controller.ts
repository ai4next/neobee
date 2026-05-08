import type { SessionRecord } from '@neobee/shared';
import { StageController } from './stage-controller.js';
import { ExpertCreationChain } from '../chains/expert-creation-chain.js';

export class ExpertCreationController extends StageController {
  protected async execute(session: SessionRecord): Promise<void> {
    const aggregate = this.store.get(session.id);
    if (!aggregate) return;

    if (aggregate.experts.length > 0) {
      this.advance(session.id, 'insight_refinement');
      return;
    }

    if (!aggregate.researchBrief) return; // wait for deep research

    this.eventBus.emitRaw(session.id, 'experts.started', 'expert_creation', {});
    this.createTask(session.id);

    const chain = new ExpertCreationChain();
    const experts = await chain.run(session, aggregate.researchBrief);

    this.store.setExperts(session.id, experts);
    this.completeTask(session.id);
    this.eventBus.emitRaw(session.id, 'experts.generated', 'expert_creation', { experts });
    this.advance(session.id, 'insight_refinement');
  }
}
