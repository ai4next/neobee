"""NeoBee — New Session page."""
from __future__ import annotations

import streamlit as st

from neobee.core import db as db_module
from neobee.models import CreateSessionInput, SessionRecord
from neobee.webui.components import render_shared_sidebar, render_topic_form
from neobee.webui.pages.sessions import get_orchestrator
from neobee.webui.styles import inject_theme


st.set_page_config(
    page_title="NeoBee",
    layout="wide",
    page_icon="🐝",
    initial_sidebar_state="expanded",
    menu_items={
        "About": "AI-native brainstorming platform — NeoBee",
        "Get help": None,
        "Report a bug": None,
    },
)

inject_theme()
language = st.session_state.get("language", "en")
T = lambda en, zh: en if language == "en" else zh  # noqa: E731

render_shared_sidebar()

# ── Main area ───────────────────────────────────────────────────────
st.markdown(f"# 🐝 NeoBee")
st.markdown(T("AI-native brainstorming platform", "AI 原生头脑风暴平台"))
st.divider()

submitted, form_data = render_topic_form(language)
if submitted:
    input_data = CreateSessionInput(**form_data)
    record = SessionRecord(
        topic=input_data.topic,
        round_count=input_data.round_count,
        expert_count=input_data.expert_count,
        additional_info=input_data.additional_info,
        language=st.session_state.language,
    )
    db_module.create_session(record)
    st.session_state.session_id = record.id
    st.session_state.view = "session"
    st.switch_page("pages/2_Session_View.py")