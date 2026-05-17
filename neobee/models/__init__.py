from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class SessionStatus(str, Enum):
    CREATED = "created"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class SessionMeta(BaseModel):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    topic: str
    expert_count: int = 3
    round_count: int = 3
    additional_info: str = ""
    language: str = "en"
    status: SessionStatus = SessionStatus.CREATED
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


ResearchReport = str


class OpportunityArea(BaseModel):
    name: str
    description: str
    pain_points: list[str] = Field(default_factory=list)
    tech_trends: list[str] = Field(default_factory=list)
    market_signals: list[str] = Field(default_factory=list)


class OpportunityMap(BaseModel):
    areas: list[OpportunityArea] = Field(default_factory=list)
    cross_area_synergies: list[str] = Field(default_factory=list)


class ExpertProfile(BaseModel):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    name: str
    domain: str
    persona_style: str
    stance: str
    skills: list[str] = Field(default_factory=list)
    opportunity_area: str = ""


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