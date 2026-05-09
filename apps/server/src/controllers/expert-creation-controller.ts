import type { SessionRecord, ExpertProfile } from '@neobee/shared';
import { StageController } from './stage-controller.js';
import { workerPool } from '../workers/worker-pool.js';

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

    const experts = await workerPool.execute<ExpertProfile[]>('expert_creation', {
      session,
      researchBrief: aggregate.researchBrief
    });

    this.store.setExperts(session.id, experts);
    this.completeTask(session.id);
    this.eventBus.emitRaw(session.id, 'experts.generated', 'expert_creation', { experts });
    this.advance(session.id, 'insight_refinement');
  }
}
