import type { SessionRecord } from '@neobee/shared';
import { StageController } from './stage-controller.js';
import { SummaryChain } from '../chains/summary-chain.js';

export class SummaryController extends StageController {
  protected async execute(session: SessionRecord): Promise<void> {
    const aggregate = this.store.get(session.id);
    if (!aggregate) return;

    if (aggregate.summary) {
      return; // already done
    }

    if (!aggregate.researchBrief) return;

    this.eventBus.emitRaw(session.id, 'summary.started', 'summary', {});
    this.createTask(session.id);

    const chain = new SummaryChain();
    const summary = await chain.run(aggregate);

    this.store.setSummary(session.id, summary);
    this.completeTask(session.id);
    this.eventBus.emitRaw(session.id, 'summary.completed', 'summary', { summary });

    // Mark session as completed
    this.store.setStatus(session.id, 'completed', 'summary');
  }
}
