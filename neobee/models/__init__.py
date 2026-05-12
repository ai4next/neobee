from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Generic, Optional, TypeVar

from pydantic import BaseModel, Field


# ── Enums ────────────────────────────────────────────────────────────────────

class SessionStatus(str, Enum):
    CREATED = "created"
    PAUSED = "paused"
    RESEARCHING = "researching"
    EXPERTS_GENERATED = "experts_generated"
    DEBATING = "debating"
    REVIEWING = "reviewing"
    SYNTHESIZING = "synthesizing"
    COMPLETED = "completed"
    FAILED = "failed"


class SessionStage(str, Enum):
    TOPIC_INTAKE = "topic_intake"
    DEEP_RESEARCH = "deep_research"
    EXPERT_CREATION = "expert_creation"
    INSIGHT_REFINEMENT = "insight_refinement"
    CROSS_REVIEW = "cross_review"
    IDEA_SYNTHESIS = "idea_synthesis"


class StageRunStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"


class ResearchProgressStage(str, Enum):
    INITIALIZING = "initializing"
    ANALYZING = "analyzing"
    GATHERING_FACTS = "gathering_facts"
    IDENTIFYING_QUESTIONS = "identifying_questions"
    SYNTHESIZING = "synthesizing"


class SessionEventType(str, Enum):
    SESSION_CREATED = "session.created"
    SESSION_PAUSED = "session.paused"
    SESSION_STAGE_CHANGED = "session.stage_changed"
    RESEARCH_STARTED = "research.started"
    RESEARCH_PROGRESS = "research.progress"
    RESEARCH_COMPLETED = "research.completed"
    EXPERTS_STARTED = "experts.started"
    EXPERTS_GENERATED = "experts.generated"
    INSIGHT_REFINEMENT_STARTED = "insight_refinement.started"
    INSIGHT_REFINEMENT_COMPLETED = "insight_refinement.completed"
    CROSS_REVIEW_STARTED = "cross_review.started"
    REVIEW_COMPLETED = "review.completed"
    IDEA_SYNTHESIS_STARTED = "idea_synthesis.started"
    IDEA_GENERATED = "idea.generated"
    ROUND_STARTED = "round.started"
    INSIGHT_CREATED = "insight.created"
    ROUND_COMPLETED = "round.completed"
    RUN_FAILED = "run.failed"
    TASK_STARTED = "task.started"
    TASK_PROGRESS = "task.progress"
    TASK_COMPLETED = "task.completed"


# ── Input / Record models ────────────────────────────────────────────────────

class CreateSessionInput(BaseModel):
    topic: str = Field(..., min_length=1, max_length=500)
    round_count: int = Field(default=3, ge=1, le=10)
    expert_count: int = Field(default=3, ge=1, le=10)
    additional_info: str = Field(default="")
    language: str = Field(default="en")


class SessionRecord(BaseModel):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    topic: str
    round_count: int = 3
    expert_count: int = 3
    additional_info: str = ""
    language: str = "en"
    status: SessionStatus = SessionStatus.CREATED
    current_stage: Optional[SessionStage] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def touch(self) -> None:
        self.updated_at = datetime.now(timezone.utc).isoformat()


# ── Pipeline stage data models ───────────────────────────────────────────────

class ResearchProgress(BaseModel):
    stage: ResearchProgressStage
    message: str
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class ResearchBrief(BaseModel):
    topic_frame: str
    key_facts: list[str] = Field(default_factory=list)
    open_questions: list[str] = Field(default_factory=list)
    signals: list[str] = Field(default_factory=list)
    source_refs: list[str] = Field(default_factory=list)


class ExpertProfile(BaseModel):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    name: str
    domain: str
    persona_style: str
    stance: str
    skills: list[str] = Field(default_factory=list)


class Insight(BaseModel):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    round: int
    expert_id: str
    insight: str
    rationale: str


class SessionRound(BaseModel):
    round: int
    expert_id: str
    insights: list[Insight] = Field(default_factory=list)


class ReviewScore(BaseModel):
    insight_id: str
    reviewer_expert_id: str
    novelty: int = Field(..., ge=1, le=10)
    usefulness: int = Field(..., ge=1, le=10)
    feasibility: int = Field(..., ge=1, le=10)
    evidence_strength: int = Field(..., ge=1, le=10)
    cross_domain_leverage: int = Field(..., ge=1, le=10)
    risk_awareness: int = Field(..., ge=1, le=10)
    comment: str = ""


class IdeaCandidate(BaseModel):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    title: str
    thesis: str
    why_now: str
    target_user: str
    core_mechanism: str
    risks: list[str] = Field(default_factory=list)
    total_score: float = 0.0
    controversy_label: Optional[str] = None


# ── Checkpoint / Cursor models ───────────────────────────────────────────────

class InsightRefinementCursor(BaseModel):
    expert_index: int = 0
    round_index: int = 0


class CrossReviewCursor(BaseModel):
    completed_expert_ids: list[str] = Field(default_factory=list)


class SessionCheckpoint(BaseModel):
    completed_stages: list[str] = Field(default_factory=list)
    current_stage: Optional[str] = None
    stage_progress: int = 0
    research_brief: Optional[ResearchBrief] = None
    experts: list[ExpertProfile] = Field(default_factory=list)
    rounds: list[SessionRound] = Field(default_factory=list)
    reviews: list[ReviewScore] = Field(default_factory=list)
    ideas: list[IdeaCandidate] = Field(default_factory=list)
    insight_refinement_cursor: Optional[InsightRefinementCursor] = None
    cross_review_cursor: Optional[CrossReviewCursor] = None


class TaskProgressPayload(BaseModel):
    session_id: str
    stage: SessionStage
    task_id: str
    status: str  # running | completed | failed
    progress: int = 0
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    error: Optional[str] = None
    current_step: Optional[dict] = None


T = TypeVar("T")


class SessionEvent(BaseModel, Generic[T]):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    session_id: str
    type: SessionEventType
    stage: SessionStage
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    payload: T = Field(default_factory=dict)  # type: ignore


# ── Aggregated view ──────────────────────────────────────────────────────────

class SessionAggregate(BaseModel):
    session: SessionRecord
    checkpoint: Optional[SessionCheckpoint] = None
    research_brief: Optional[ResearchBrief] = None
    research_progress: list[ResearchProgress] = Field(default_factory=list)
    experts: list[ExpertProfile] = Field(default_factory=list)
    rounds: list[SessionRound] = Field(default_factory=list)
    reviews: list[ReviewScore] = Field(default_factory=list)
    ideas: list[IdeaCandidate] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)


# ── LLM structured output schemas (used by pipeline nodes) ───────────────────

class QueryGenOutput(BaseModel):
    primary_query: str = Field(description="Main search query")
    sub_queries: list[str] = Field(description="Supporting sub-queries", default_factory=list)
    search_strategy: str = Field(description="Strategy for searching", default="")


class FactExtractionOutput(BaseModel):
    facts: list[str] = Field(description="Verifiable facts extracted from search results")
    knowledge_gaps: list[str] = Field(description="Identified knowledge gaps")
    key_entities: list[str] = Field(description="Key entities or concepts mentioned")


class SynthesisOutput(BaseModel):
    topic_frame: str = Field(description="360-degree framing of the topic")
    key_facts: list[str] = Field(description="Key facts with source attribution")
    open_questions: list[str] = Field(description="Open questions and uncertainties")
    signals: list[str] = Field(description="Trends, patterns, signals")
    source_refs: list[str] = Field(description="Source references")


class ExpertsOutput(BaseModel):
    experts: list[ExpertProfile] = Field(description="Generated expert personas")


class InsightOutput(BaseModel):
    insight: str = Field(description="The insight statement")
    rationale: str = Field(description="Rationale behind the insight")


class ReviewBatchOutput(BaseModel):
    reviews: list[ReviewScore] = Field(description="Batch of review scores")


class IdeaBatchOutput(BaseModel):
    ideas: list[IdeaCandidate] = Field(description="Batch of generated ideas")


# ── DB row models (for SQLite round-trip) ────────────────────────────────────

class DbInsightRow(BaseModel):
    id: int
    session_id: str
    round_number: int
    expert_id: str
    insight: str
    rationale: str


class DbReviewRow(BaseModel):
    id: int
    session_id: str
    insight_id: str
    reviewer_expert_id: str
    novelty: int
    usefulness: int
    feasibility: int
    evidence_strength: int
    cross_domain_leverage: int
    risk_awareness: int
    comment: str


class DbIdeaRow(BaseModel):
    id: int
    session_id: str
    title: str
    thesis: str
    why_now: str
    target_user: str
    core_mechanism: str
    risks: str  # JSON string
    total_score: float
    controversy_label: Optional[str]