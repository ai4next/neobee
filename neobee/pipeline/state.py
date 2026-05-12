from __future__ import annotations

from typing import Optional, TypedDict

from neobee.models import (
    ExpertProfile,
    IdeaCandidate,
    ResearchBrief,
    ReviewScore,
    SessionRecord,
    SessionRound,
)


class NeobeeState(TypedDict):
    """LangGraph state for the NeoBee brainstorming pipeline."""
    session: SessionRecord
    research_brief: Optional[ResearchBrief]
    experts: list[ExpertProfile]
    rounds: list[SessionRound]
    reviews: list[ReviewScore]
    ideas: list[IdeaCandidate]
    error: Optional[str]
    insight_cursor: Optional[dict]  # {expert_index: int, round_index: int}
    cross_review_cursor: Optional[dict]  # {completed_expert_ids: list[str]}
    task_id: Optional[int]
    _resume_target: Optional[str]


def make_initial_state(session: SessionRecord) -> NeobeeState:
    return {
        "session": session,
        "research_brief": None,
        "experts": [],
        "rounds": [],
        "reviews": [],
        "ideas": [],
        "error": None,
        "insight_cursor": None,
        "cross_review_cursor": None,
        "task_id": None,
        "_resume_target": None,
    }