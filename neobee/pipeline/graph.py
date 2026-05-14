from __future__ import annotations

import asyncio
import threading
from typing import Callable, Optional

from langgraph.checkpoint.memory import MemorySaver
from langgraph.checkpoint.serde.jsonplus import JsonPlusSerializer
from langgraph.graph import END, StateGraph

from neobee.core import db as db_module
from neobee.models import (
    SessionCheckpoint,
    SessionEvent,
    SessionEventType,
    SessionRecord,
    SessionStage,
    SessionStatus,
)
from neobee.pipeline.nodes import (
    cross_review_node,
    debate_insight_node,
    deep_research_node,
    expert_creation_node,
    idea_factory_node,
)
from neobee.pipeline.state import NeobeeState, make_initial_state
from neobee.pipeline.task_tracker import TaskTracker

from neobee.pipeline._registry import _get_tracker, _set_current_orch

ProgressCallback = Callable[[str, str, dict], None]

# ── Pause event registry ─────────────────────────────────────────────────────

_pause_events: dict[str, asyncio.Event] = {}


def _get_pause_event(session_id: str) -> asyncio.Event:
    if session_id not in _pause_events:
        _pause_events[session_id] = asyncio.Event()
    return _pause_events[session_id]


def request_pause(session_id: str) -> None:
    _get_pause_event(session_id).set()


def clear_pause(session_id: str) -> None:
    _get_pause_event(session_id).clear()


def is_paused(session_id: str) -> bool:
    ev = _get_pause_event(session_id)
    return ev.is_set()


# ── Event helpers ────────────────────────────────────────────────────────────

def emit_event(session_id: str, event_type: SessionEventType, stage: SessionStage,
               payload: dict | None = None) -> None:
    event = SessionEvent(
        session_id=session_id,
        type=event_type,
        stage=stage,
        payload=payload or {},
    )
    db_module.append_event(event)


def _session_status_for_stage(stage: SessionStage) -> SessionStatus:
    mapping = {
        SessionStage.DEEP_RESEARCH: SessionStatus.RESEARCHING,
        SessionStage.EXPERT_CREATION: SessionStatus.EXPERTS_GENERATED,
        SessionStage.INSIGHT_REFINEMENT: SessionStatus.DEBATING,
        SessionStage.CROSS_REVIEW: SessionStatus.REVIEWING,
        SessionStage.IDEA_SYNTHESIS: SessionStatus.SYNTHESIZING,
    }
    return mapping.get(stage, SessionStatus.RESEARCHING)


# ── Graph node functions ─────────────────────────────────────────────────────

async def start_router(state: NeobeeState) -> dict:
    """Route to the correct starting stage based on loaded state data."""
    session = state["session"]
    if session.current_stage == SessionStage.EXPERT_CREATION:
        route_to = "expert_creation"
    elif session.current_stage == SessionStage.INSIGHT_REFINEMENT:
        route_to = "insight_refinement"
    elif session.current_stage == SessionStage.CROSS_REVIEW:
        route_to = "cross_review"
    elif session.current_stage == SessionStage.IDEA_SYNTHESIS:
        route_to = "idea_synthesis"
    else:
        route_to = "deep_research"
    return {"_resume_target": route_to}

async def deep_research_wrapper(state: NeobeeState) -> dict:
    session = state["session"]
    stage = SessionStage.DEEP_RESEARCH
    tracker = _get_tracker()
    task_id = tracker.create_task(session.id, "deep_research")

    emit_event(session.id, SessionEventType.RESEARCH_STARTED, stage)
    tracker.update_progress(session.id, "deep_research", task_id, 10, "initializing")

    if is_paused(session.id):
        tracker.update_progress(session.id, "deep_research", task_id, 0, "paused")
        cp = _build_checkpoint(state, "deep_research")
        db_module.save_checkpoint(session.id, cp)
        session.status = SessionStatus.PAUSED
        db_module.update_session(session)
        emit_event(session.id, SessionEventType.SESSION_PAUSED, stage)
        return {"error": None, "_paused": True, "task_id": task_id}

    state["task_id"] = task_id
    result = await deep_research_node(state)

    if result.get("error"):
        tracker.fail_task(session.id, "deep_research", task_id, result["error"])
        emit_event(session.id, SessionEventType.RUN_FAILED, stage, {"error": result["error"]})
        db_module.append_error(session.id, result["error"])
    else:
        db_module.upsert_research_brief(session.id, result["research_brief"])
        tracker.complete_task(session.id, "deep_research", task_id)
        emit_event(session.id, SessionEventType.RESEARCH_COMPLETED, stage)
        session.current_stage = SessionStage.EXPERT_CREATION
        session.status = _session_status_for_stage(SessionStage.EXPERT_CREATION)
        db_module.update_session(session)
        emit_event(session.id, SessionEventType.SESSION_STAGE_CHANGED, stage,
                   {"next_stage": "expert_creation"})

    result["task_id"] = task_id
    return result


async def expert_creation_wrapper(state: NeobeeState) -> dict:
    session = state["session"]
    stage = SessionStage.EXPERT_CREATION
    tracker = _get_tracker()
    task_id = tracker.create_task(session.id, "expert_creation")

    emit_event(session.id, SessionEventType.EXPERTS_STARTED, stage)

    if is_paused(session.id):
        tracker.update_progress(session.id, "expert_creation", task_id, 0, "paused")
        cp = _build_checkpoint(state, "expert_creation")
        db_module.save_checkpoint(session.id, cp)
        session.status = SessionStatus.PAUSED
        db_module.update_session(session)
        emit_event(session.id, SessionEventType.SESSION_PAUSED, stage)
        return {"error": None, "_paused": True, "task_id": task_id}

    result = await expert_creation_node(state)

    if result.get("error"):
        tracker.fail_task(session.id, "expert_creation", task_id, result["error"])
        emit_event(session.id, SessionEventType.RUN_FAILED, stage, {"error": result["error"]})
        db_module.append_error(session.id, result["error"])
    else:
        db_module.upsert_experts(session.id, result["experts"])
        tracker.complete_task(session.id, "expert_creation", task_id)
        emit_event(session.id, SessionEventType.EXPERTS_GENERATED, stage)
        session.current_stage = SessionStage.INSIGHT_REFINEMENT
        session.status = _session_status_for_stage(SessionStage.INSIGHT_REFINEMENT)
        db_module.update_session(session)
        emit_event(session.id, SessionEventType.SESSION_STAGE_CHANGED, stage,
                   {"next_stage": "insight_refinement"})

    result["task_id"] = task_id
    return result


async def debate_insight_wrapper(state: NeobeeState) -> dict:
    session = state["session"]
    stage = SessionStage.INSIGHT_REFINEMENT
    tracker = _get_tracker()
    task_id = tracker.create_task(session.id, "insight_refinement")

    emit_event(session.id, SessionEventType.INSIGHT_REFINEMENT_STARTED, stage)

    if is_paused(session.id):
        tracker.update_progress(session.id, "insight_refinement", task_id, 0, "paused")
        cp = _build_checkpoint(state, "insight_refinement")
        db_module.save_checkpoint(session.id, cp)
        session.status = SessionStatus.PAUSED
        db_module.update_session(session)
        emit_event(session.id, SessionEventType.SESSION_PAUSED, stage)
        return {"error": None, "_paused": True, "task_id": task_id}

    result = await debate_insight_node(state)

    if result.get("error"):
        tracker.fail_task(session.id, "insight_refinement", task_id, result["error"])
        emit_event(session.id, SessionEventType.RUN_FAILED, stage, {"error": result["error"]})
        db_module.append_error(session.id, result["error"])
    elif result.get("_paused"):
        pass
    else:
        db_module.upsert_rounds(session.id, result["rounds"])
        tracker.complete_task(session.id, "insight_refinement", task_id)
        emit_event(session.id, SessionEventType.INSIGHT_REFINEMENT_COMPLETED, stage)
        session.current_stage = SessionStage.CROSS_REVIEW
        session.status = _session_status_for_stage(SessionStage.CROSS_REVIEW)
        db_module.update_session(session)
        emit_event(session.id, SessionEventType.SESSION_STAGE_CHANGED, stage,
                   {"next_stage": "cross_review"})

    result["task_id"] = task_id
    return result


async def cross_review_wrapper(state: NeobeeState) -> dict:
    session = state["session"]
    stage = SessionStage.CROSS_REVIEW
    tracker = _get_tracker()
    task_id = tracker.create_task(session.id, "cross_review")

    emit_event(session.id, SessionEventType.CROSS_REVIEW_STARTED, stage)

    if is_paused(session.id):
        tracker.update_progress(session.id, "cross_review", task_id, 0, "paused")
        cp = _build_checkpoint(state, "cross_review")
        db_module.save_checkpoint(session.id, cp)
        session.status = SessionStatus.PAUSED
        db_module.update_session(session)
        emit_event(session.id, SessionEventType.SESSION_PAUSED, stage)
        return {"error": None, "_paused": True, "task_id": task_id}

    result = await cross_review_node(state)

    if result.get("error"):
        tracker.fail_task(session.id, "cross_review", task_id, result["error"])
        emit_event(session.id, SessionEventType.RUN_FAILED, stage, {"error": result["error"]})
        db_module.append_error(session.id, result["error"])
    else:
        db_module.upsert_reviews(session.id, result["reviews"])
        tracker.complete_task(session.id, "cross_review", task_id)
        emit_event(session.id, SessionEventType.REVIEW_COMPLETED, stage)
        session.current_stage = SessionStage.IDEA_SYNTHESIS
        session.status = _session_status_for_stage(SessionStage.IDEA_SYNTHESIS)
        db_module.update_session(session)
        emit_event(session.id, SessionEventType.SESSION_STAGE_CHANGED, stage,
                   {"next_stage": "idea_synthesis"})

    result["task_id"] = task_id
    return result


async def idea_factory_wrapper(state: NeobeeState) -> dict:
    session = state["session"]
    stage = SessionStage.IDEA_SYNTHESIS
    tracker = _get_tracker()
    task_id = tracker.create_task(session.id, "idea_synthesis")

    emit_event(session.id, SessionEventType.IDEA_SYNTHESIS_STARTED, stage)

    if is_paused(session.id):
        tracker.update_progress(session.id, "idea_synthesis", task_id, 0, "paused")
        cp = _build_checkpoint(state, "idea_synthesis")
        db_module.save_checkpoint(session.id, cp)
        session.status = SessionStatus.PAUSED
        db_module.update_session(session)
        emit_event(session.id, SessionEventType.SESSION_PAUSED, stage)
        return {"error": None, "_paused": True, "task_id": task_id}

    result = await idea_factory_node(state)

    if result.get("error"):
        tracker.fail_task(session.id, "idea_synthesis", task_id, result["error"])
        emit_event(session.id, SessionEventType.RUN_FAILED, stage, {"error": result["error"]})
        db_module.append_error(session.id, result["error"])
    else:
        db_module.upsert_ideas(session.id, result["ideas"])
        tracker.complete_task(session.id, "idea_synthesis", task_id)
        emit_event(session.id, SessionEventType.IDEA_GENERATED, stage)

    result["task_id"] = task_id
    return result


# ── Terminal nodes ───────────────────────────────────────────────────────────

async def complete_session_node(state: NeobeeState) -> dict:
    session = state["session"]
    session.status = SessionStatus.COMPLETED
    session.current_stage = SessionStage.IDEA_SYNTHESIS
    db_module.update_session(session)
    emit_event(session.id, SessionEventType.SESSION_STAGE_CHANGED,
               SessionStage.IDEA_SYNTHESIS, {"status": "completed"})
    db_module.clear_checkpoint(session.id)
    return {}


async def fail_session_node(state: NeobeeState) -> dict:
    session = state["session"]
    session.status = SessionStatus.FAILED
    db_module.update_session(session)
    return {}


# ── Routing ──────────────────────────────────────────────────────────────────

def route_on_error(state: NeobeeState) -> str:
    if state.get("error"):
        return "handle_error"
    if state.get("_paused"):
        return "paused"
    return "next_stage"


# ── Checkpoint builder ───────────────────────────────────────────────────────

def _build_checkpoint(state: NeobeeState, stage: str) -> SessionCheckpoint:
    return SessionCheckpoint(
        current_stage=stage,
        research_brief=state.get("research_brief"),
        opportunity_map=state.get("opportunity_map"),
        experts=state.get("experts", []),
        rounds=state.get("rounds", []),
        reviews=state.get("reviews", []),
        ideas=state.get("ideas", []),
        insight_refinement_cursor=state.get("insight_cursor"),
        cross_review_cursor=state.get("cross_review_cursor"),
    )


# ── Orchestrator ─────────────────────────────────────────────────────────────

class Orchestrator:
    """Manages LangGraph execution for NeoBee sessions."""

    def __init__(self, progress_callback: Optional[ProgressCallback] = None):
        _set_current_orch(self)
        self.tracker = TaskTracker(progress_callback)
        self.graph = self._build_graph()
        self.active_runs: dict[str, asyncio.Task] = {}
        # Persistent background event loop for pipeline execution (Streamlit compat)
        self._bg_loop = asyncio.new_event_loop()
        self._bg_thread = threading.Thread(target=self._bg_loop.run_forever, daemon=True)
        self._bg_thread.start()

    def _build_graph(self) -> StateGraph:
        builder = StateGraph(NeobeeState)

        builder.add_node("start_router", start_router)
        builder.add_node("deep_research", deep_research_wrapper)
        builder.add_node("expert_creation", expert_creation_wrapper)
        builder.add_node("insight_refinement", debate_insight_wrapper)
        builder.add_node("cross_review", cross_review_wrapper)
        builder.add_node("idea_synthesis", idea_factory_wrapper)
        builder.add_node("complete_session", complete_session_node)
        builder.add_node("fail_session", fail_session_node)

        builder.set_entry_point("start_router")

        builder.add_conditional_edges(
            "start_router",
            lambda s: s.get("_resume_target", "deep_research"),
            {
                "deep_research": "deep_research",
                "expert_creation": "expert_creation",
                "insight_refinement": "insight_refinement",
                "cross_review": "cross_review",
                "idea_synthesis": "idea_synthesis",
            },
        )

        builder.add_conditional_edges(
            "deep_research",
            route_on_error,
            {"next_stage": "expert_creation", "handle_error": "fail_session", "paused": END},
        )
        builder.add_conditional_edges(
            "expert_creation",
            route_on_error,
            {"next_stage": "insight_refinement", "handle_error": "fail_session", "paused": END},
        )
        builder.add_conditional_edges(
            "insight_refinement",
            route_on_error,
            {"next_stage": "cross_review", "handle_error": "fail_session", "paused": END},
        )
        builder.add_conditional_edges(
            "cross_review",
            route_on_error,
            {"next_stage": "idea_synthesis", "handle_error": "fail_session", "paused": END},
        )
        builder.add_conditional_edges(
            "idea_synthesis",
            route_on_error,
            {"next_stage": "complete_session", "handle_error": "fail_session", "paused": END},
        )

        builder.add_edge("complete_session", END)
        builder.add_edge("fail_session", END)

        return builder.compile(checkpointer=MemorySaver(
            serde=JsonPlusSerializer(allowed_msgpack_modules=[
                ("neobee.models", "SessionStatus"),
                ("neobee.models", "SessionStage"),
                ("neobee.models", "SessionRecord"),
                ("neobee.models", "ResearchBrief"),
                ("neobee.models", "OpportunityMap"),
                ("neobee.models", "ExpertProfile"),
                ("neobee.models", "SessionRound"),
                ("neobee.models", "ReviewScore"),
                ("neobee.models", "IdeaCandidate"),
                ("neobee.models", "InsightRefinementCursor"),
                ("neobee.models", "CrossReviewCursor"),
                ("neobee.models", "SessionEventType"),
                ("neobee.models", "SessionEvent"),
            ]),
        ))

    def start_session_sync(self, session_id: str,
                           session_record: Optional[SessionRecord] = None) -> None:
        """Synchronous entry point — submits pipeline to the background event loop."""
        if session_id in self.active_runs:
            return
        asyncio.run_coroutine_threadsafe(
            self._start_session(session_id, session_record), self._bg_loop
        )

    async def _start_session(self, session_id: str, session_record: Optional[SessionRecord] = None) -> None:
        if session_id in self.active_runs:
            return

        if session_record is None:
            session_record = db_module.get_session(session_id)
            if not session_record:
                raise ValueError(f"Session {session_id} not found")

        cp = db_module.get_checkpoint(session_id)
        if cp:
            # Set session back to running status on resume
            session_record.status = SessionStatus.RESEARCHING
            session_record.current_stage = SessionStage(cp.current_stage) if cp.current_stage else SessionStage.DEEP_RESEARCH
            db_module.update_session(session_record)

            state = {
                "session": session_record,
                "research_brief": cp.research_brief,
                "opportunity_map": cp.opportunity_map,
                "experts": cp.experts,
                "rounds": cp.rounds,
                "reviews": cp.reviews,
                "ideas": cp.ideas,
                "error": None,
                "insight_cursor": (
                    {"expert_index": cp.insight_refinement_cursor.expert_index,
                     "round_index": cp.insight_refinement_cursor.round_index}
                    if cp.insight_refinement_cursor else None
                ),
                "cross_review_cursor": (
                    {"completed_expert_ids": cp.cross_review_cursor.completed_expert_ids}
                    if cp.cross_review_cursor else None
                ),
                "task_id": None,
                "_resume_target": cp.current_stage,
            }
        elif session_record.current_stage and session_record.current_stage != SessionStage.DEEP_RESEARCH:
            # Reconstruct state from DB (e.g. after retry with cleared checkpoint)
            state = make_initial_state(session_record)
            state["research_brief"] = db_module.get_research_brief(session_id)
            state["experts"] = db_module.get_experts(session_id)
            state["rounds"] = db_module.get_rounds(session_id)
            state["reviews"] = db_module.get_reviews(session_id)
            state["opportunity_map"] = None
            state["ideas"] = db_module.get_ideas(session_id)
            state["_resume_target"] = session_record.current_stage.value
        else:
            state = make_initial_state(session_record)

        task = asyncio.create_task(self._run_graph(session_id, state))
        self.active_runs[session_id] = task

    async def _run_graph(self, session_id: str, state: NeobeeState) -> None:
        try:
            await self.graph.ainvoke(state, {"configurable": {"thread_id": session_id}})
        except Exception as e:
            session = db_module.get_session(session_id)
            if session:
                session.status = SessionStatus.FAILED
                db_module.update_session(session)
                db_module.append_error(session_id, str(e))
        finally:
            self.active_runs.pop(session_id, None)

    def pause_session(self, session_id: str) -> None:
        request_pause(session_id)

    def resume_session(self, session_id: str) -> None:
        clear_pause(session_id)

    def cancel_session(self, session_id: str) -> None:
        asyncio.run_coroutine_threadsafe(
            self._cancel_session(session_id), self._bg_loop
        )

    async def _cancel_session(self, session_id: str) -> None:
        task = self.active_runs.pop(session_id, None)
        if task:
            task.cancel()
        session = db_module.get_session(session_id)
        if session:
            session.status = SessionStatus.FAILED
            db_module.update_session(session)

    def is_running(self, session_id: str) -> bool:
        return session_id in self.active_runs and not self.active_runs[session_id].done()

    def set_progress_listener(self, callback: ProgressCallback) -> None:
        self.tracker.set_progress_listener(callback)