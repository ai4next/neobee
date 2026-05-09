import type { SessionStage } from '@neobee/shared';

export const stageMeta: Array<{ stage: SessionStage; code: string }> = [
  { stage: 'topic_intake', code: '00' },
  { stage: 'deep_research', code: '01' },
  { stage: 'expert_creation', code: '02' },
  { stage: 'insight_refinement', code: '03' },
  { stage: 'cross_review', code: '04' },
  { stage: 'idea_synthesis', code: '05' }
];