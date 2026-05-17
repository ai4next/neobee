from __future__ import annotations

from typing import Optional, TypedDict

from neobee.models import (
    ExpertProfile,
    IdeaCandidate,
    OpportunityMap,
    ResearchReport,
    SessionMeta,
    SessionRound,
)


class NeobeeState(TypedDict):
    """LangGraph state for the NeoBee brainstorming pipeline."""
    session_path: str
    session_meta: SessionMeta
    topic: str
    expert_count: int
    round_count: int
    additional_info: str
    language: str
    # Stage outputs
    research_brief: Optional[ResearchReport]
    opportunity_map: Optional[OpportunityMap]
    experts: list[ExpertProfile]
    rounds: list[SessionRound]
    ideas: list[IdeaCandidate]
    # Flow
    error: Optional[str]


def make_initial_state(session_path: str, meta: SessionMeta) -> NeobeeState:
    """Create initial state for a new pipeline run."""
    return {
        "session_path": session_path,
        "session_meta": meta,
        "topic": meta.topic,
        "expert_count": meta.expert_count,
        "round_count": meta.round_count,
        "additional_info": meta.additional_info,
        "language": meta.language,
        "research_brief": None,
        "opportunity_map": None,
        "experts": [],
        "rounds": [],
        "ideas": [],
        "error": None,
    }