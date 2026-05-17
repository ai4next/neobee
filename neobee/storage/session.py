"""File-based session storage for NeoBee.

Each session is a directory under ``~/.neobee/sessions/{name}/``::

    sessions/
      {name}/
        session.json           # SessionMeta metadata
        research/
          report.md            # Plain text research report
        experts/
          {name}.md            # One file per expert
        insights/
          {id}.md              # One file per insight
        ideas/
          {rank}-{title}.md    # One file per idea
        insights/
          insights.md          # R3 Insight[]
        ideas/
          ideas.md             # IdeaCandidate[]
"""

from __future__ import annotations

import json
import os
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from neobee.core.config import CONFIG_DIR
from neobee.models import (
    ExpertProfile,
    IdeaCandidate,
    Insight,
    OpportunityMap,
    ResearchReport,
    SessionMeta,
    SessionRound,
    SessionStatus,
)

SESSIONS_DIR = CONFIG_DIR / "sessions"

STAGE_DIRS = {
    "research": "research",
    "experts": "experts",
    "insights": "insights",
    "ideas": "ideas",
}

STAGE_FILES = {
    "research": "research/report.md",
}


# ── Helpers ──────────────────────────────────────────────────────────────────


def _sanitize_topic(topic: str) -> str:
    """Sanitize a topic into a filesystem-safe slug."""
    s = topic.strip().lower()
    s = s.replace(" ", "-")
    s = re.sub(r'[/:*?"<>|]', "", s)
    s = re.sub(r"-+", "-", s)
    s = s.strip("-")
    return s or "untitled"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _timestamp() -> str:
    return datetime.now().strftime("%Y%m%d-%H%M%S")


# ── Session directory management ─────────────────────────────────────────────


def create_session_dir(topic: str, expert_count: int, round_count: int) -> tuple[Path, str]:
    """Create a new session directory and return (path, name)."""
    slug = _sanitize_topic(topic)
    ts = _timestamp()
    name = f"{slug}-{expert_count}-{round_count}-{ts}"
    path = SESSIONS_DIR / name
    path.mkdir(parents=True, exist_ok=True)
    for subdir in STAGE_DIRS.values():
        (path / subdir).mkdir(parents=True, exist_ok=True)
    return path, name


def write_session_meta(path: Path, meta: SessionMeta) -> None:
    """Write session metadata to session.json."""
    data = meta.model_dump(mode="json")
    (path / "session.json").write_text(
        json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8"
    )


def read_session_meta(path: Path) -> Optional[SessionMeta]:
    """Read session metadata from session.json."""
    fpath = path / "session.json"
    if not fpath.exists():
        return None
    data = json.loads(fpath.read_text(encoding="utf-8"))
    return SessionMeta(**data)


def update_session_status(path: Path, status: SessionStatus) -> None:
    """Update the status field of an existing session.json."""
    meta = read_session_meta(path)
    if meta:
        meta.status = status
        meta.updated_at = _now()
        write_session_meta(path, meta)


def list_session_dirs() -> list[tuple[str, SessionMeta]]:
    """List all sessions, newest first."""
    if not SESSIONS_DIR.exists():
        return []
    entries: list[tuple[str, SessionMeta]] = []
    for child in sorted(SESSIONS_DIR.iterdir(), key=lambda p: p.name, reverse=True):
        if child.is_dir():
            meta = read_session_meta(child)
            if meta:
                entries.append((child.name, meta))
    return entries


def get_session_path(name: str) -> Optional[Path]:
    """Get the path for a named session."""
    p = SESSIONS_DIR / name
    return p if p.exists() and p.is_dir() else None


# ── Stage data I/O ───────────────────────────────────────────────────────────


def write_research(session_path: Path, report: str,
                   opp_map: Optional[OpportunityMap] = None) -> None:
    report_path = session_path / STAGE_FILES["research"]
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(report, encoding="utf-8")


def write_experts(session_path: Path, experts: list[ExpertProfile]) -> None:
    """Write each expert as an individual markdown file."""
    experts_dir = session_path / "experts"
    experts_dir.mkdir(parents=True, exist_ok=True)

    for exp in experts:
        safe_name = _sanitize_topic(exp.name)
        content = (
            f"# {exp.name}\n\n"
            f"## Domain\n{exp.domain}\n\n"
            f"## Persona Style\n{exp.persona_style}\n\n"
            f"## Stance\n{exp.stance}\n\n"
            f"## Skills\n"
            + "\n".join(f"- {s}" for s in exp.skills) + "\n\n"
            f"## Opportunity Area\n{exp.opportunity_area}\n"
        )
        (experts_dir / f"{safe_name}.md").write_text(content, encoding="utf-8")


def write_insights(session_path: Path, rounds: list[SessionRound],
                   experts: list[ExpertProfile]) -> None:
    """Write each insight as an individual markdown file, named by expert name."""
    insights_dir = session_path / "insights"
    insights_dir.mkdir(parents=True, exist_ok=True)
    name_by_id = {e.id: e.name for e in experts}

    for sr in rounds:
        for ins in sr.insights:
            expert_name = name_by_id.get(ins.expert_id, ins.expert_id[:8])
            safe_name = _sanitize_topic(expert_name)
            content = (
                f"# {expert_name}\n\n"
                f"**Round:** {ins.round}\n\n"
                f"**Insight:** {ins.insight}\n\n"
                f"**Rationale:** {ins.rationale}\n"
            )
            (insights_dir / f"{safe_name}.md").write_text(content, encoding="utf-8")


def write_ideas(session_path: Path, ideas: list[IdeaCandidate]) -> None:
    """Write each idea as an individual markdown file."""
    ideas_dir = session_path / "ideas"
    ideas_dir.mkdir(parents=True, exist_ok=True)

    for i, idea in enumerate(sorted(ideas, key=lambda x: x.total_score, reverse=True), 1):
        safe_title = _sanitize_topic(idea.title)
        content = (
            f"# {idea.title}\n\n"
            f"**Score:** {idea.total_score:.1f}/10  \n"
            f"**Controversy:** {idea.controversy_label or 'N/A'}\n\n"
            f"## Thesis\n{idea.thesis}\n\n"
            f"## Why Now\n{idea.why_now}\n\n"
            f"## Target User\n{idea.target_user}\n\n"
            f"## Core Mechanism\n{idea.core_mechanism}\n\n"
            f"## Risks\n"
            + "\n".join(f"- {r}" for r in idea.risks)
            + "\n"
        )
        (ideas_dir / f"{i:02d}-{safe_title}.md").write_text(content, encoding="utf-8")