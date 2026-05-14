from __future__ import annotations

import json
import sqlite3
import threading
from pathlib import Path
from typing import Optional

from neobee.core.config import CONFIG_DIR
from neobee.models import (
    CrossReviewCursor,
    ExpertProfile,
    IdeaCandidate,
    Insight,
    InsightRefinementCursor,
    ResearchBrief,
    ReviewScore,
    SessionAggregate,
    SessionCheckpoint,
    SessionEvent,
    SessionEventType,
    SessionRecord,
    SessionRound,
    SessionStage,
    SessionStatus,
)

_DATA_DIR = CONFIG_DIR / "data"
_DB_PATH = _DATA_DIR / "neobee.db"

_local = threading.local()


def get_db() -> sqlite3.Connection:
    if not hasattr(_local, "conn") or _local.conn is None:
        _DATA_DIR.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(_DB_PATH), check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        _local.conn = conn
        _init_schema(conn)
    return _local.conn


def _init_schema(conn: sqlite3.Connection) -> None:
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS session (
            id TEXT PRIMARY KEY,
            topic TEXT NOT NULL,
            round_count INTEGER NOT NULL DEFAULT 3,
            expert_count INTEGER NOT NULL DEFAULT 3,
            additional_info TEXT NOT NULL DEFAULT '',
            language TEXT NOT NULL DEFAULT 'en',
            status TEXT NOT NULL DEFAULT 'created',
            current_stage TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS session_event (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            type TEXT NOT NULL,
            stage TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            payload TEXT NOT NULL DEFAULT '{}',
            FOREIGN KEY (session_id) REFERENCES session(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS session_error (
            session_id TEXT NOT NULL UNIQUE,
            errors TEXT NOT NULL DEFAULT '[]',
            FOREIGN KEY (session_id) REFERENCES session(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS session_checkpoint (
            session_id TEXT NOT NULL UNIQUE,
            completed_stages TEXT NOT NULL DEFAULT '[]',
            current_stage TEXT,
            stage_progress INTEGER NOT NULL DEFAULT 0,
            research_brief TEXT,
            experts TEXT,
            rounds TEXT,
            reviews TEXT,
            ideas TEXT,
            insight_cursor TEXT,
            cross_review_cursor TEXT,
            FOREIGN KEY (session_id) REFERENCES session(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS deep_research_data (
            session_id TEXT NOT NULL UNIQUE,
            topic_frame TEXT,
            key_facts TEXT NOT NULL DEFAULT '[]',
            open_questions TEXT NOT NULL DEFAULT '[]',
            signals TEXT NOT NULL DEFAULT '[]',
            source_refs TEXT NOT NULL DEFAULT '[]',
            FOREIGN KEY (session_id) REFERENCES session(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS expert_creation_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            name TEXT NOT NULL,
            domain TEXT NOT NULL,
            persona_style TEXT NOT NULL,
            stance TEXT NOT NULL,
            skills TEXT NOT NULL DEFAULT '[]',
            opportunity_area TEXT NOT NULL DEFAULT '',
            FOREIGN KEY (session_id) REFERENCES session(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS insight_refinement_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            round_number INTEGER NOT NULL,
            expert_id TEXT NOT NULL,
            insight TEXT NOT NULL,
            rationale TEXT NOT NULL,
            FOREIGN KEY (session_id) REFERENCES session(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS cross_review_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            insight_id TEXT NOT NULL,
            reviewer_expert_id TEXT NOT NULL,
            novelty INTEGER NOT NULL,
            usefulness INTEGER NOT NULL,
            feasibility INTEGER NOT NULL,
            evidence_strength INTEGER NOT NULL,
            cross_domain_leverage INTEGER NOT NULL,
            risk_awareness INTEGER NOT NULL,
            comment TEXT NOT NULL DEFAULT '',
            FOREIGN KEY (session_id) REFERENCES session(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS idea_synthesis_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            title TEXT NOT NULL,
            thesis TEXT NOT NULL,
            why_now TEXT NOT NULL,
            target_user TEXT NOT NULL,
            core_mechanism TEXT NOT NULL,
            risks TEXT NOT NULL DEFAULT '[]',
            total_score REAL NOT NULL DEFAULT 0,
            controversy_label TEXT,
            FOREIGN KEY (session_id) REFERENCES session(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS stage_task (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            stage TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'running',
            progress INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (session_id) REFERENCES session(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS stage_step (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER NOT NULL,
            stage TEXT NOT NULL,
            name TEXT NOT NULL,
            data TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL,
            FOREIGN KEY (task_id) REFERENCES stage_task(id) ON DELETE CASCADE
        );
    """)
    conn.commit()


# ── Session CRUD ─────────────────────────────────────────────────────────────

def create_session(record: SessionRecord) -> SessionRecord:
    conn = get_db()
    conn.execute(
        """INSERT INTO session (id, topic, round_count, expert_count, additional_info, language, status, current_stage, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (record.id, record.topic, record.round_count, record.expert_count,
         record.additional_info, record.language, record.status.value,
         record.current_stage.value if record.current_stage else None,
         record.created_at, record.updated_at),
    )
    conn.commit()
    return record


def get_session(session_id: str) -> Optional[SessionRecord]:
    conn = get_db()
    row = conn.execute("SELECT * FROM session WHERE id = ?", (session_id,)).fetchone()
    return _row_to_session(row) if row else None


def list_sessions() -> list[SessionRecord]:
    conn = get_db()
    rows = conn.execute("SELECT * FROM session ORDER BY updated_at DESC").fetchall()
    return [_row_to_session(r) for r in rows]


def update_session(record: SessionRecord) -> None:
    conn = get_db()
    record.touch()
    conn.execute(
        """UPDATE session SET topic=?, round_count=?, expert_count=?, additional_info=?,
           language=?, status=?, current_stage=?, updated_at=?
           WHERE id=?""",
        (record.topic, record.round_count, record.expert_count,
         record.additional_info, record.language, record.status.value,
         record.current_stage.value if record.current_stage else None,
         record.updated_at, record.id),
    )
    conn.commit()


def delete_session(session_id: str) -> None:
    conn = get_db()
    conn.execute("DELETE FROM session WHERE id = ?", (session_id,))
    conn.commit()


def _row_to_session(row: sqlite3.Row) -> SessionRecord:
    return SessionRecord(
        id=row["id"],
        topic=row["topic"],
        round_count=row["round_count"],
        expert_count=row["expert_count"],
        additional_info=row["additional_info"],
        language=row["language"],
        status=SessionStatus(row["status"]),
        current_stage=SessionStage(row["current_stage"]) if row["current_stage"] else None,
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


# ── Events ───────────────────────────────────────────────────────────────────

def append_event(event: SessionEvent) -> None:
    conn = get_db()
    conn.execute(
        "INSERT INTO session_event (id, session_id, type, stage, timestamp, payload) VALUES (?, ?, ?, ?, ?, ?)",
        (event.id, event.session_id, event.type.value, event.stage.value,
         event.timestamp, json.dumps(event.payload, ensure_ascii=False)),
    )
    conn.commit()


def get_events(session_id: str) -> list[SessionEvent]:
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM session_event WHERE session_id = ? ORDER BY timestamp ASC", (session_id,)
    ).fetchall()
    result = []
    for r in rows:
        result.append(SessionEvent(
            id=r["id"],
            session_id=r["session_id"],
            type=SessionEventType(r["type"]),
            stage=SessionStage(r["stage"]),
            timestamp=r["timestamp"],
            payload=json.loads(r["payload"]),
        ))
    return result


# ── Errors ───────────────────────────────────────────────────────────────────

def append_error(session_id: str, error_msg: str) -> None:
    conn = get_db()
    row = conn.execute("SELECT errors FROM session_error WHERE session_id = ?", (session_id,)).fetchone()
    if row:
        errors = json.loads(row["errors"])
        errors.append(error_msg)
        conn.execute("UPDATE session_error SET errors = ? WHERE session_id = ?",
                     (json.dumps(errors, ensure_ascii=False), session_id))
    else:
        conn.execute("INSERT INTO session_error (session_id, errors) VALUES (?, ?)",
                     (session_id, json.dumps([error_msg], ensure_ascii=False)))
    conn.commit()


def get_errors(session_id: str) -> list[str]:
    conn = get_db()
    row = conn.execute("SELECT errors FROM session_error WHERE session_id = ?", (session_id,)).fetchone()
    return json.loads(row["errors"]) if row else []


# ── Research Brief ───────────────────────────────────────────────────────────

def upsert_research_brief(session_id: str, brief: ResearchBrief) -> None:
    conn = get_db()
    conn.execute(
        """INSERT OR REPLACE INTO deep_research_data (session_id, topic_frame, key_facts, open_questions, signals, source_refs)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (session_id, brief.topic_frame,
         json.dumps(brief.key_facts, ensure_ascii=False),
         json.dumps(brief.open_questions, ensure_ascii=False),
         json.dumps(brief.signals, ensure_ascii=False),
         json.dumps(brief.source_refs, ensure_ascii=False)),
    )
    conn.commit()


def get_research_brief(session_id: str) -> Optional[ResearchBrief]:
    conn = get_db()
    row = conn.execute("SELECT * FROM deep_research_data WHERE session_id = ?", (session_id,)).fetchone()
    if not row:
        return None
    return ResearchBrief(
        topic_frame=row["topic_frame"] or "",
        key_facts=json.loads(row["key_facts"]),
        open_questions=json.loads(row["open_questions"]),
        signals=json.loads(row["signals"]),
        source_refs=json.loads(row["source_refs"]),
    )


# ── Expert Profiles ──────────────────────────────────────────────────────────

def upsert_experts(session_id: str, experts: list) -> None:
    conn = get_db()
    conn.execute("DELETE FROM expert_creation_data WHERE session_id = ?", (session_id,))
    for exp in experts:
        conn.execute(
            "INSERT INTO expert_creation_data (session_id, name, domain, persona_style, stance, skills, opportunity_area) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (session_id, exp.name, exp.domain, exp.persona_style, exp.stance,
             json.dumps(exp.skills, ensure_ascii=False), exp.opportunity_area or ""),
        )
    conn.commit()


def get_experts(session_id: str) -> list:
    conn = get_db()
    rows = conn.execute("SELECT * FROM expert_creation_data WHERE session_id = ? ORDER BY id", (session_id,)).fetchall()
    return [
        ExpertProfile(
            name=r["name"], domain=r["domain"], persona_style=r["persona_style"],
            stance=r["stance"], skills=json.loads(r["skills"]),
            opportunity_area=r["opportunity_area"] or "",
        ) for r in rows
    ]


# ── Insights / Rounds ────────────────────────────────────────────────────────

def upsert_rounds(session_id: str, rounds: list[SessionRound]) -> None:
    conn = get_db()
    conn.execute("DELETE FROM insight_refinement_data WHERE session_id = ?", (session_id,))
    for sr in rounds:
        for ins in sr.insights:
            cursor = conn.execute(
                "INSERT INTO insight_refinement_data (session_id, round_number, expert_id, insight, rationale) VALUES (?, ?, ?, ?, ?)",
                (session_id, sr.round, sr.expert_id, ins.insight, ins.rationale),
            )
            # Use the DB row id as canonical insight id — ensures round-trip consistency
            ins.id = str(cursor.lastrowid)
    conn.commit()


def get_rounds(session_id: str) -> list[SessionRound]:
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM insight_refinement_data WHERE session_id = ? ORDER BY round_number, id", (session_id,)
    ).fetchall()
    rounds_map: dict[tuple[int, str], SessionRound] = {}
    for r in rows:
        key = (r["round_number"], r["expert_id"])
        if key not in rounds_map:
            rounds_map[key] = SessionRound(round=r["round_number"], expert_id=r["expert_id"])
        rounds_map[key].insights.append(Insight(
            id=str(r["id"]),
            insight=r["insight"],
            rationale=r["rationale"],
            round=r["round_number"],
            expert_id=r["expert_id"],
        ))
    return list(rounds_map.values())


# ── Reviews ──────────────────────────────────────────────────────────────────

def upsert_reviews(session_id: str, reviews: list[ReviewScore]) -> None:
    conn = get_db()
    conn.execute("DELETE FROM cross_review_data WHERE session_id = ?", (session_id,))
    for rev in reviews:
        conn.execute(
            """INSERT INTO cross_review_data (session_id, insight_id, reviewer_expert_id,
               novelty, usefulness, feasibility, evidence_strength, cross_domain_leverage, risk_awareness, comment)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (session_id, rev.insight_id, rev.reviewer_expert_id,
             rev.novelty, rev.usefulness, rev.feasibility,
             rev.evidence_strength, rev.cross_domain_leverage, rev.risk_awareness,
             rev.comment),
        )
    conn.commit()


def get_reviews(session_id: str) -> list[ReviewScore]:
    conn = get_db()
    rows = conn.execute("SELECT * FROM cross_review_data WHERE session_id = ? ORDER BY id", (session_id,)).fetchall()
    return [
        ReviewScore(
            insight_id=r["insight_id"],
            reviewer_expert_id=r["reviewer_expert_id"],
            novelty=r["novelty"],
            usefulness=r["usefulness"],
            feasibility=r["feasibility"],
            evidence_strength=r["evidence_strength"],
            cross_domain_leverage=r["cross_domain_leverage"],
            risk_awareness=r["risk_awareness"],
            comment=r["comment"],
        ) for r in rows
    ]


# ── Ideas ────────────────────────────────────────────────────────────────────

def upsert_ideas(session_id: str, ideas: list[IdeaCandidate]) -> None:
    conn = get_db()
    conn.execute("DELETE FROM idea_synthesis_data WHERE session_id = ?", (session_id,))
    for idea in ideas:
        conn.execute(
            """INSERT INTO idea_synthesis_data (session_id, title, thesis, why_now, target_user,
               core_mechanism, risks, total_score, controversy_label)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (session_id, idea.title, idea.thesis, idea.why_now, idea.target_user,
             idea.core_mechanism, json.dumps(idea.risks, ensure_ascii=False),
             idea.total_score, idea.controversy_label),
        )
    conn.commit()


def get_ideas(session_id: str) -> list[IdeaCandidate]:
    conn = get_db()
    rows = conn.execute("SELECT * FROM idea_synthesis_data WHERE session_id = ? ORDER BY id", (session_id,)).fetchall()
    return [
        IdeaCandidate(
            title=r["title"], thesis=r["thesis"], why_now=r["why_now"],
            target_user=r["target_user"], core_mechanism=r["core_mechanism"],
            risks=json.loads(r["risks"]), total_score=r["total_score"],
            controversy_label=r["controversy_label"],
        ) for r in rows
    ]


# ── Checkpoint ───────────────────────────────────────────────────────────────

def save_checkpoint(session_id: str, cp: SessionCheckpoint) -> None:
    conn = get_db()
    conn.execute(
        """INSERT OR REPLACE INTO session_checkpoint
           (session_id, completed_stages, current_stage, stage_progress,
            research_brief, experts, rounds, reviews, ideas,
            insight_cursor, cross_review_cursor)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (session_id,
         '[]',
         cp.current_stage,
         0,
         json.dumps(cp.research_brief.model_dump(mode="json"), ensure_ascii=False) if cp.research_brief else None,
         json.dumps([e.model_dump(mode="json") for e in cp.experts], ensure_ascii=False) if cp.experts else None,
         json.dumps([r.model_dump(mode="json") for r in cp.rounds], ensure_ascii=False) if cp.rounds else None,
         json.dumps([r.model_dump(mode="json") for r in cp.reviews], ensure_ascii=False) if cp.reviews else None,
         json.dumps([i.model_dump(mode="json") for i in cp.ideas], ensure_ascii=False) if cp.ideas else None,
         json.dumps(cp.insight_refinement_cursor.model_dump(mode="json"), ensure_ascii=False) if cp.insight_refinement_cursor else None,
         json.dumps(cp.cross_review_cursor.model_dump(mode="json"), ensure_ascii=False) if cp.cross_review_cursor else None,
         ),
    )
    conn.commit()


def get_checkpoint(session_id: str) -> Optional[SessionCheckpoint]:
    conn = get_db()
    row = conn.execute("SELECT * FROM session_checkpoint WHERE session_id = ?", (session_id,)).fetchone()
    if not row:
        return None
    return SessionCheckpoint(
        current_stage=row["current_stage"],
        research_brief=ResearchBrief(**json.loads(row["research_brief"])) if row["research_brief"] else None,
        experts=[ExpertProfile(**e) for e in json.loads(row["experts"])] if row["experts"] else [],
        rounds=[SessionRound(**r) for r in json.loads(row["rounds"])] if row["rounds"] else [],
        reviews=[ReviewScore(**r) for r in json.loads(row["reviews"])] if row["reviews"] else [],
        ideas=[IdeaCandidate(**i) for i in json.loads(row["ideas"])] if row["ideas"] else [],
        insight_refinement_cursor=InsightRefinementCursor(**json.loads(row["insight_cursor"])) if row["insight_cursor"] else None,
        cross_review_cursor=CrossReviewCursor(**json.loads(row["cross_review_cursor"])) if row["cross_review_cursor"] else None,
    )


def clear_checkpoint(session_id: str) -> None:
    conn = get_db()
    conn.execute("DELETE FROM session_checkpoint WHERE session_id = ?", (session_id,))
    conn.commit()


def clear_stage_data(session_id: str, from_stage: str) -> None:
    """Delete stage data from the given stage onward."""
    stages = ["deep_research", "expert_creation", "insight_refinement", "cross_review", "idea_synthesis"]
    idx = stages.index(from_stage) if from_stage in stages else 0
    tables = {
        "deep_research": "deep_research_data",
        "expert_creation": "expert_creation_data",
        "insight_refinement": "insight_refinement_data",
        "cross_review": "cross_review_data",
        "idea_synthesis": "idea_synthesis_data",
    }
    conn = get_db()
    for stage in stages[idx:]:
        conn.execute(f"DELETE FROM {tables[stage]} WHERE session_id = ?", (session_id,))
    conn.execute("DELETE FROM stage_task WHERE session_id = ?", (session_id,))
    conn.execute("DELETE FROM stage_step WHERE task_id IN (SELECT id FROM stage_task WHERE session_id = ?)", (session_id,))
    clear_checkpoint(session_id)
    conn.commit()


# ── Aggregate loading ────────────────────────────────────────────────────────

def get_aggregate(session_id: str) -> Optional[SessionAggregate]:
    session = get_session(session_id)
    if not session:
        return None
    return SessionAggregate(
        session=session,
        checkpoint=get_checkpoint(session_id),
        research_brief=get_research_brief(session_id),
        experts=get_experts(session_id),
        rounds=get_rounds(session_id),
        reviews=get_reviews(session_id),
        ideas=get_ideas(session_id),
        errors=get_errors(session_id),
    )


# ── Task Tracking ────────────────────────────────────────────────────────────

def create_task(session_id: str, stage: str) -> int:
    from datetime import datetime, timezone
    conn = get_db()
    now = datetime.now(timezone.utc).isoformat()
    cur = conn.execute(
        "INSERT INTO stage_task (session_id, stage, status, progress, created_at, updated_at) VALUES (?, ?, 'running', 0, ?, ?)",
        (session_id, stage, now, now),
    )
    conn.commit()
    return cur.lastrowid


def update_task_progress(task_id: int, progress: int, status: str = "running") -> None:
    from datetime import datetime, timezone
    conn = get_db()
    conn.execute(
        "UPDATE stage_task SET progress = ?, status = ?, updated_at = ? WHERE id = ?",
        (progress, status, datetime.now(timezone.utc).isoformat(), task_id),
    )
    conn.commit()


def create_step(task_id: int, stage: str, name: str, data: dict | None = None) -> int:
    from datetime import datetime, timezone
    conn = get_db()
    now = datetime.now(timezone.utc).isoformat()
    cur = conn.execute(
        "INSERT INTO stage_step (task_id, stage, name, data, created_at) VALUES (?, ?, ?, ?, ?)",
        (task_id, stage, name, json.dumps(data or {}, ensure_ascii=False), now),
    )
    conn.commit()
    return cur.lastrowid


def get_task(session_id: str, stage: str) -> Optional[dict]:
    conn = get_db()
    row = conn.execute(
        "SELECT * FROM stage_task WHERE session_id = ? AND stage = ? ORDER BY id DESC LIMIT 1",
        (session_id, stage),
    ).fetchone()
    return dict(row) if row else None


def get_steps(task_id: int) -> list[dict]:
    conn = get_db()
    rows = conn.execute("SELECT * FROM stage_step WHERE task_id = ? ORDER BY id", (task_id,)).fetchall()
    return [dict(r) for r in rows]