import type { SessionRecord } from '@neobee/shared';
import { StageController } from './stage-controller.js';
import { DeepResearchChain } from '../chains/deep-research-chain.js';
import type { ResearchProgress } from '@neobee/shared';

export class DeepResearchController extends StageController {
  protected async execute(session: SessionRecord): Promise<void> {
    const aggregate = this.store.get(session.id);
    if (!aggregate) return;

    // Skip if already done
    if (aggregate.researchBrief) {
      this.advance(session.id, 'expert_creation');
      return;
    }

    this.eventBus.emitRaw(session.id, 'research.started', 'deep_research', { topic: session.topic });
    this.createTask(session.id);

    const chain = new DeepResearchChain();
    const researchBrief = await chain.run(session, {
      onProgress: (progress: ResearchProgress) => {
        this.createStep(session.id, progress.stage, { message: progress.message });
      }
    });

    this.store.setResearchBrief(session.id, researchBrief);
    this.completeTask(session.id);
    this.eventBus.emitRaw(session.id, 'research.completed', 'deep_research', { researchBrief });
    this.advance(session.id, 'expert_creation');
  }
}
