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
  | 'idea_synthesis'
  | 'graph_build'
  | 'summary';

export interface SessionCheckpoint {
  completedStages: SessionStage[];
  currentStage: SessionStage | null;
  stageProgress: number; // 0-100 within current stage
  researchBrief: ResearchBrief | null;
  experts: ExpertProfile[];
  rounds: SessionRound[];
  reviews: ReviewScore[];
  ideas: IdeaCandidate[];
  graph: GraphData;
  // For insight refinement: tracks which expert/round combination we're at
  insightRefinementCursor: { expertIndex: number; roundIndex: number } | null;
}

export type InsightRelationType =
  | 'support'
  | 'extend'
  | 'contradict'
  | 'reframe'
  | 'risk';

export type GraphNodeType = 'topic' | 'expert' | 'insight' | 'idea';
export type GraphEdgeType =
  | 'generated'
  | 'supports'
  | 'extends'
  | 'contradicts'
  | 'reframes'
  | 'flags_risk'
  | 'contributes_to'
  | 'reviewed';

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

export interface InsightLink {
  targetInsightId: string;
  relationType: InsightRelationType;
  rationale: string;
}

export interface Insight {
  id: string;
  round: number;
  expertId: string;
  insight: string;
  rationale: string;
  references: string[];
  links: InsightLink[];
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
  objectionLevel: 'low' | 'medium' | 'high';
}

export interface IdeaCandidate {
  id: string;
  title: string;
  thesis: string;
  supportingInsights: string[];
  whyNow: string;
  targetUser: string;
  coreMechanism: string;
  risks: string[];
  totalScore: number;
  controversyLabel?: 'wildcard';
}

export interface SummaryDocument {
  bestIdeas: string[];
  controversialIdeas: string[];
  unresolvedQuestions: string[];
  executiveSummary: string;
}

export interface GraphNode {
  id: string;
  type: GraphNodeType;
  label: string;
  metadata: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  type: GraphEdgeType;
  source: string;
  target: string;
  metadata: Record<string, unknown>;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
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
  graph: GraphData;
  summary: SummaryDocument | null;
  errors: string[];
}

export type SessionEventType =
  | 'session.created'
  | 'session.paused'
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
  | 'graph_build.started'
  | 'graph.updated'
  | 'summary.started'
  | 'summary.completed'
  | 'round.started'
  | 'insight.created'
  | 'round.completed'
  | 'run.failed'
  | 'task.started'
  | 'task.progress'
  | 'task.completed';

export interface TaskProgressPayload {
  stage: SessionStage;
  taskId: string;
  status: 'running' | 'completed' | 'failed';
  progress: number;
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
