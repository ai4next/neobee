from __future__ import annotations

import streamlit as st

from neobee.models import SessionRecord, SessionStatus


def _status_badge(status: SessionStatus) -> str:
    badges = {
        SessionStatus.CREATED: "🔵",
        SessionStatus.PAUSED: "⏸️",
        SessionStatus.RESEARCHING: "🔄",
        SessionStatus.EXPERTS_GENERATED: "👥",
        SessionStatus.DEBATING: "💬",
        SessionStatus.REVIEWING: "📝",
        SessionStatus.SYNTHESIZING: "⚙️",
        SessionStatus.COMPLETED: "✅",
        SessionStatus.FAILED: "❌",
    }
    return badges.get(status, "⚪")


def render_session_list(sessions: list[SessionRecord], active_id: str | None) -> None:
    """Sidebar session list."""
    for s in sessions:
        label = f"{_status_badge(s.status)} {s.topic[:40]}..."
        if st.sidebar.button(label, key=f"session_{s.id}", width='stretch',
                            type="primary" if s.id == active_id else "secondary"):
            st.session_state.session_id = s.id
            st.session_state.view = "session"
            st.switch_page("pages/2_Session_View.py")


def render_shared_sidebar() -> str:
    """Render sidebar shared by all pages. Returns the active language."""
    from neobee.core import db as db_module

    st.sidebar.title("NeoBee 🐝")

    language = st.sidebar.selectbox(
        "Language / 语言", ["en", "zh"],
        index=0 if st.session_state.get("language", "en") == "en" else 1,
        key="language",
        label_visibility="collapsed",
    )

    if st.sidebar.button("+ New Session", width='stretch', type="primary"):
        st.session_state.session_id = None
        st.session_state.view = "new"
        st.switch_page("pages/1_New_Session.py")

    st.sidebar.divider()

    sessions = db_module.list_sessions()
    active_id = st.session_state.get("session_id")
    render_session_list(sessions, active_id)

    return language or "en"