from __future__ import annotations

import streamlit as st

from neobee.models import SessionRecord, SessionStatus

_SESSION_CSS = """
<style>
/* ── Session row: each row wraps two columns ── */
div[data-testid^="sr_"] {
    position: relative;
}
/* Delete column: hidden by default ── */
div[data-testid^="sr_"] > div > div[data-testid="column"]:last-child {
    width: 0 !important;
    min-width: 0 !important;
    flex: 0 0 0 !important;
    overflow: hidden;
    transition: width 0.15s ease, flex 0.15s ease !important;
}
/* Delete column: reveal on row hover ── */
div[data-testid^="sr_"]:hover > div > div[data-testid="column"]:last-child {
    width: 32px !important;
    min-width: 32px !important;
    flex: 0 0 32px !important;
}
/* Style the ✕ popover trigger ── */
div[data-testid^="sr_"] div[data-testid="column"]:last-child button {
    background: transparent !important;
    border: none !important;
    padding: 0 !important;
    min-width: 0 !important;
    width: 28px !important;
    height: 28px !important;
    font-size: 13px !important;
    line-height: 1 !important;
    color: #94A3B8 !important;
    box-shadow: none !important;
    transition: color 0.15s ease !important;
}
div[data-testid^="sr_"] div[data-testid="column"]:last-child button:hover {
    color: #FB7185 !important;
}
/* Style the popover content ── */
div[data-testid="stPopoverBody"] button[kind="primary"] {
    width: 100%;
}
</style>
"""


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
    """Sidebar session list with hover-reveal delete."""
    from neobee.core import db as db_module

    for s in sessions:
        topic_label = s.topic[:40] + ("..." if len(s.topic) > 40 else "")

        with st.sidebar.container(key=f"sr_{s.id}"):
            cols = st.columns([0.85, 0.15], gap="small", vertical_alignment="center")
            with cols[0]:
                label = f"{_status_badge(s.status)} {topic_label}"
                if st.button(label, key=f"session_{s.id}", use_container_width=True,
                             type="primary" if s.id == active_id else "secondary"):
                    st.session_state.session_id = s.id
                    st.session_state.view = "session"
                    st.switch_page("pages/2_Session_View.py")
            with cols[1]:
                with st.popover("✕", help="Delete this session"):
                    st.caption(f"Delete **{topic_label}**?")
                    st.caption("This action cannot be undone.")
                    if st.button("Confirm Delete", key=f"confirm_del_{s.id}",
                                 type="primary", use_container_width=True):
                        db_module.delete_session(s.id)
                        if st.session_state.get("session_id") == s.id:
                            st.session_state.session_id = None
                            st.session_state.view = "new"
                        st.rerun()


def render_shared_sidebar() -> str:
    """Render sidebar shared by all pages. Returns the active language."""
    from neobee.core import db as db_module

    st.sidebar.title("NeoBee 🐝")

    # Inject hover-reveal CSS once
    st.markdown(_SESSION_CSS, unsafe_allow_html=True)

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