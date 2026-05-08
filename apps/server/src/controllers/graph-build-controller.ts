import type { SessionRecord } from '@neobee/shared';
import { StageController } from './stage-controller.js';
import { GraphBuilder } from '../graph/graph-builder.js';

export class GraphBuildController extends StageController {
  protected async execute(session: SessionRecord): Promise<void> {
    const aggregate = this.store.get(session.id);
    if (!aggregate) return;

    if (aggregate.graph.nodes.length > 0) {
      this.advance(session.id, 'summary');
      return;
    }

    if (aggregate.experts.length === 0) return;

    this.eventBus.emitRaw(session.id, 'graph_build.started', 'graph_build', {});
    this.createTask(session.id);

    const builder = new GraphBuilder();
    const graph = builder.build({
      session,
      experts: aggregate.experts,
      rounds: aggregate.rounds,
      reviews: aggregate.reviews,
      ideas: aggregate.ideas
    });

    this.store.setGraph(session.id, graph);
    this.completeTask();
    this.eventBus.emitRaw(session.id, 'graph.updated', 'graph_build', { graph });
    this.advance(session.id, 'summary');
  }
}