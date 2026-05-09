export type SessionStatus =
  | 'created'
  | 'paused'
  | 'researching'
  | 'experts_generated'
  | 'debating'
  | 'reviewing'
  | 'synthesizing'
  | 'completed'
  | 'failed';

export type SessionStage =
  | 'topic_intake'
  | 'deep_research'
  | 'expert_creation'
  | 'insight_refinement'
  | 'cross_review'
  | 'idea_synthesis';

export type StageRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface SessionCheckpoint {
  completedStages: SessionStage[];
  currentStage: SessionStage | null;
  stageProgress: number; // 0-100 within current stage
  researchBrief: ResearchBrief | null;
  experts: ExpertProfile[];
  rounds: SessionRound[];
  reviews: ReviewScore[];
  ideas: IdeaCandidate[];
  // For insight refinement: tracks which expert/round combination we're at
  insightRefinementCursor: { expertIndex: number; roundIndex: number } | null;
  // For cross review: tracks which experts have completed their reviews
  crossReviewCursor: { completedExpertIds: string[] } | null;
}

export interface CreateSessionInput {
  topic: string;
  roundCount: number;
  expertCount: number;
  additionalInfo: string;
  language: string;
}

export interface SessionRecord {
  id: string;
  topic: string;
  roundCount: number;
  expertCount: number;
  additionalInfo: string;
  language: string;
  status: SessionStatus;
  currentStage: SessionStage | null;
  createdAt: string;
  updatedAt: string;
}

export interface ResearchProgress {
  stage: 'initializing' | 'analyzing' | 'gathering_facts' | 'identifying_questions' | 'synthesizing';
  message: string;
  timestamp: string;
}

export interface ResearchBrief {
  topicFrame: string;
  keyFacts: string[];
  openQuestions: string[];
  signals: string[];
  sourceRefs: string[];
}

export interface ExpertProfile {
  id: string;
  name: string;
  domain: string;
  personaStyle: string;
  stance: string;
  skills: string[];
}

export interface Insight {
  id: string;
  round: number;
  expertId: string;
  insight: string;
  rationale: string;
}

export interface ReviewScore {
  insightId: string;
  reviewerExpertId: string;
  novelty: number;
  usefulness: number;
  feasibility: number;
  evidenceStrength: number;
  crossDomainLeverage: number;
  riskAwareness: number;
  comment: string;
}

export interface IdeaCandidate {
  id: string;
  title: string;
  thesis: string;
  whyNow: string;
  targetUser: string;
  coreMechanism: string;
  risks: string[];
  totalScore: number;
  controversyLabel?: 'wildcard';
}

export interface SessionRound {
  round: number;
  expertId: string;
  insights: Insight[];
}

export interface SessionAggregate {
  session: SessionRecord;
  checkpoint: SessionCheckpoint | null;
  researchBrief: ResearchBrief | null;
  researchProgress: ResearchProgress[];
  experts: ExpertProfile[];
  rounds: SessionRound[];
  reviews: ReviewScore[];
  ideas: IdeaCandidate[];
  errors: string[];
}

export type SessionEventType =
  | 'session.created'
  | 'session.paused'
  | 'session.stage_changed'
  | 'research.started'
  | 'research.progress'
  | 'research.completed'
  | 'experts.started'
  | 'experts.generated'
  | 'insight_refinement.started'
  | 'insight_refinement.completed'
  | 'cross_review.started'
  | 'review.completed'
  | 'idea_synthesis.started'
  | 'idea.generated'
  | 'round.started'
  | 'insight.created'
  | 'round.completed'
  | 'run.failed'
  | 'task.started'
  | 'task.progress'
  | 'task.completed';

export interface TaskProgressPayload {
  sessionId: string;
  stage: SessionStage;
  taskId: string;
  status: Extract<StageRunStatus, 'running' | 'completed' | 'failed'>;
  progress: number;
  updatedAt: string;
  error?: string;
  currentStep?: {
    name: string;
    data: Record<string, unknown>;
  };
}

export interface SessionEvent<TPayload = Record<string, unknown>> {
  id: string;
  sessionId: string;
  type: SessionEventType;
  stage: SessionStage;
  timestamp: string;
  payload: TPayload;
}
