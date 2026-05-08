import type { GraphData, SessionAggregate, SessionRound } from '@neobee/shared';

export class GraphBuilder {
  build(input: Pick<SessionAggregate, 'session' | 'experts' | 'reviews' | 'ideas'> & { rounds: SessionRound[] }): GraphData {
    const nodes: GraphData['nodes'] = [
      {
        id: input.session.id,
        type: 'topic',
        label: input.session.topic,
        metadata: {}
      },
      ...input.experts.map((expert) => ({
        id: expert.id,
        type: 'expert' as const,
        label: expert.name,
        metadata: { domain: expert.domain, stance: expert.stance }
      })),
      ...input.rounds.flatMap((round) =>
        round.insights.map((insight) => ({
          id: insight.id,
          type: 'insight' as const,
          label: `R${round.round}: ${insight.insight}`,
          metadata: { round: round.round, expertId: insight.expertId }
        }))
      ),
      ...input.ideas.map((idea) => ({
        id: idea.id,
        type: 'idea' as const,
        label: idea.title,
        metadata: { score: idea.totalScore, whyNow: idea.whyNow }
      }))
    ];

    const edges: GraphData['edges'] = [
      ...input.experts.map((expert) => ({
        id: crypto.randomUUID(),
        type: 'generated' as const,
        source: input.session.id,
        target: expert.id,
        metadata: {}
      })),
      ...input.rounds.flatMap((round) =>
        round.insights.flatMap((insight) => [
          {
            id: crypto.randomUUID(),
            type: 'generated' as const,
            source: insight.expertId,
            target: insight.id,
            metadata: { round: round.round }
          },
          ...insight.links.map((link) => ({
            id: crypto.randomUUID(),
            type: this.mapRelation(link.relationType),
            source: insight.id,
            target: link.targetInsightId,
            metadata: { rationale: link.rationale }
          }))
        ])
      ),
      ...input.reviews.map((review) => ({
        id: crypto.randomUUID(),
        type: 'reviewed' as const,
        source: review.reviewerExpertId,
        target: review.insightId,
        metadata: { objectionLevel: review.objectionLevel }
      })),
      ...input.ideas.flatMap((idea) =>
        idea.supportingInsights.map((insightId) => ({
          id: crypto.randomUUID(),
          type: 'contributes_to' as const,
          source: insightId,
          target: idea.id,
          metadata: {}
        }))
      )
    ];

    return { nodes, edges };
  }

  private mapRelation(relationType: 'support' | 'extend' | 'contradict' | 'reframe' | 'risk') {
    switch (relationType) {
      case 'support':
        return 'supports' as const;
      case 'extend':
        return 'extends' as const;
      case 'contradict':
        return 'contradicts' as const;
      case 'reframe':
        return 'reframes' as const;
      case 'risk':
        return 'flags_risk' as const;
    }
  }
}