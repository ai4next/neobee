from __future__ import annotations

import time
from typing import Optional

import streamlit as st

from neobee.core import db as db_module
from neobee.models import (
    CreateSessionInput,
    SessionRecord,
    SessionStage,
    SessionStatus,
)
from neobee.pipeline.graph import Orchestrator
from neobee.webui.components import (
    render_experts_card,
    render_ideas_card,
    render_insights_card,
    render_research_card,
    render_reviews_card,
    render_session_list,
    render_task_progress,
    render_topic_form,
    stage_label,
)




@st.cache_resource
def get_orchestrator() -> Orchestrator:
    """Singleton Orchestrator cached across reruns."""
    return Orchestrator()


def _inject_theme_css() -> None:
    from neobee.webui.styles import inject_theme

    inject_theme()


def _init_session_state() -> None:
    if "session_id" not in st.session_state:
        st.session_state.session_id = None
    if "page" not in st.session_state:
        st.session_state.page = "sessions"
    if "stage_tab" not in st.session_state:
        st.session_state.stage_tab = 0
    if "language" not in st.session_state:
        st.session_state.language = "en"
    if "view" not in st.session_state:
        st.session_state.view = "new"  # "new" | "session"


def _load_session() -> Optional[SessionRecord]:
    sid = st.session_state.get("session_id")
    if not sid:
        return None
    return db_module.get_session(sid)


def _language() -> str:
    return st.session_state.get("language", "en")


def render_sessions_page() -> None:
    _init_session_state()
    orchestrator = get_orchestrator()
    language = _language()
    T = lambda en, zh: en if language == "en" else zh  # noqa: E731

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

    _inject_theme_css()

    # ── Sidebar ─────────────────────────────────────────────────────────
    st.sidebar.title("NeoBee 🐝")

    st.sidebar.selectbox(
        "Language / 语言", ["en", "zh"],
        index=0 if st.session_state.language == "en" else 1,
        key="language",
        label_visibility="collapsed",
    )

    if st.sidebar.button(T("+ New Session", "+ 新会话"), width='stretch', type="primary"):
        st.session_state.session_id = None
        st.session_state.stage_tab = 0
        st.session_state.view = "new"
        st.rerun()

    st.sidebar.divider()

    sessions = db_module.list_sessions()
    active_id = st.session_state.get("session_id")
    render_session_list(sessions, active_id)

    # ── Main area ──
    current_session = _load_session()

    if st.session_state.view == "new":
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

            # Auto-start pipeline immediately
            record.status = SessionStatus.RESEARCHING
            record.current_stage = SessionStage.DEEP_RESEARCH
            db_module.update_session(record)

            st.session_state.session_id = record.id
            st.session_state.view = "session"
            orchestrator.start_session_sync(record.id, record)
            st.rerun()

    elif st.session_state.view == "session":
        with main_placeholder.container():
            if current_session is None:
                # Session was deleted or not found — back to new view
                st.session_state.view = "new"
                st.rerun()
                return

            sid = current_session.id

            # Auto-start stale CREATED sessions (e.g. from previous app session)
            if current_session.status == SessionStatus.CREATED:
                current_session.status = SessionStatus.RESEARCHING
                current_session.current_stage = SessionStage.DEEP_RESEARCH
                db_module.update_session(current_session)
                orchestator.start_session_sync(sid, current_session)
                st.rerun()

            # ── Running progress (above button row) ──
            _RUNNING_STATES = (SessionStatus.RESEARCHING, SessionStatus.EXPERTS_GENERATED,
                               SessionStatus.DEBATING, SessionStatus.REVIEWING, SessionStatus.SYNTHESIZING)
            if current_session.status in _RUNNING_STATES:
                stage_key = current_session.current_stage.value if current_session.current_stage else "deep_research"
                stage_name = stage_label(current_session.current_stage, language) if current_session.current_stage else ""

                st.markdown(f"""
                <style>
                @keyframes neobee-dot-pulse {{ 0%,100% {{ opacity:1; }} 50% {{ opacity:0.2; }} }}
                .neobee-progress-dot {{
                    display:inline-block; width:10px; height:10px; border-radius:50%;
                    background:#2DD4BF; margin-right:8px; vertical-align:middle;
                    animation: neobee-dot-pulse 1.2s ease-in-out infinite;
                }}
                .neobee-progress-label {{
                    font-size:0.9rem; color:#94A3B8; vertical-align:middle;
                }}
                .neobee-step-text {{
                    font-size:0.85rem; color:#94A3B8; text-align:right;
                    padding-top:0.15rem;
                }}
                </style>
                """, unsafe_allow_html=True)

                pcol, scol = st.columns([4, 1])
                with pcol:
                    task = db_module.get_task(sid, stage_key)
                    progress = task["progress"] if task else 0
                    st.markdown(
                        f'<div class="neobee-progress-label">'
                        f'<span class="neobee-progress-dot"></span>'
                        f'{stage_name}  <strong>{progress}%</strong>'
                        f'</div>',
                        unsafe_allow_html=True,
                    )
                with scol:
                    task = db_module.get_task(sid, stage_key)
                    step_text = None
                    if task:
                        steps = db_module.get_steps(task["id"])
                        if steps:
                            step_text = steps[-1]["name"]
                    st.markdown(
                        f'<div class="neobee-step-text">→ {step_text if step_text else ("initializing..." if language == "en" else "初始化中...")}</div>',
                        unsafe_allow_html=True,
                    )

            # ── Action buttons + stage tabs ──
            tcol, bcol = st.columns([5, 1])
            with bcol:

                if current_session.status == SessionStatus.PAUSED:
                    if st.button(T("▶ Resume", "▶ 恢复"), width='stretch', type="primary"):
                        orchestrator.resume_session(sid)
                        current_session.status = SessionStatus.RESEARCHING
                        db_module.update_session(current_session)
                        orchestrator.start_session_sync(sid, current_session)
                        st.rerun()

                elif current_session.status in (SessionStatus.RESEARCHING, SessionStatus.EXPERTS_GENERATED,
                                                SessionStatus.DEBATING, SessionStatus.REVIEWING, SessionStatus.SYNTHESIZING):
                    st.markdown("""
                    <style>
                    @keyframes neobee-pause-blink { 0%,100% { opacity:1; } 50% { opacity:0.25; } }
                    div[data-testid="column"]:nth-child(2) button[kind="secondary"] p {
                        animation: neobee-pause-blink 1.2s ease-in-out infinite;
                    }
                    </style>
                    """, unsafe_allow_html=True)
                    if st.button(T("⏸ Pause", "⏸ 暂停"), width='stretch'):
                        orchestrator.pause_session(sid)
                        current_session.status = SessionStatus.PAUSED
                        db_module.update_session(current_session)
                        st.rerun()

                elif current_session.status == SessionStatus.FAILED:
                    c1, c2 = st.columns(2)
                    with c1:
                        if st.button(T("🔄 Retry", "🔄 重试"), width='stretch'):
                            current_stage = current_session.current_stage.value if current_session.current_stage else "deep_research"
                            db_module.clear_stage_data(sid, current_stage)
                            current_session.status = SessionStatus.RESEARCHING
                            db_module.update_session(current_session)
                            orchestrator.start_session_sync(sid, current_session)
                            st.rerun()
                    with c2:
                        if st.button(T("🗑 Delete", "🗑 删除"), width='stretch'):
                            db_module.delete_session(sid)
                            st.session_state.session_id = None
                            st.session_state.view = "new"
                            st.rerun()

                elif current_session.status == SessionStatus.COMPLETED:
                    if st.button(T("🗑 Delete", "🗑 删除"), width='stretch'):
                        db_module.delete_session(sid)
                        st.session_state.session_id = None
                        st.session_state.view = "new"
                        st.rerun()

            with tcol:
                agg = db_module.get_aggregate(sid)

                stages = list(SessionStage)
                stage_names = [stage_label(s, language) for s in stages]
                selected_tab = st.tabs(stage_names)

                # ── Stage progress indicator ──
                current_idx = -1
                if current_session.current_stage and current_session.current_stage in stages:
                    current_idx = stages.index(current_session.current_stage)
                is_completed = current_session.status == SessionStatus.COMPLETED

                stage_css_parts = []
                if is_completed:
                    stage_css_parts.append(""".stTabs [data-baseweb="tab-list"] > button {
        color: #2DD4BF !important;
    }""")
                elif current_idx >= 0:
                    completed_count = current_idx
                    if completed_count > 0:
                        stage_css_parts.append(f""".stTabs [data-baseweb="tab-list"] > button:nth-child(-n+{completed_count}) {{
        color: #2DD4BF !important;
    }}""")
                    stage_css_parts.append(f""".stTabs [data-baseweb="tab-list"] > button:nth-child({current_idx + 1}) {{
        color: #38BDF8 !important;
        animation: neobee-tab-blink 1.2s ease-in-out infinite;
    }}""")

                if stage_css_parts:
                    st.markdown(f"""<style>
    @keyframes neobee-tab-blink {{ 0%%,100%% {{ opacity:1; }} 50%% {{ opacity:0.35; }} }}
    {"".join(stage_css_parts)}
    </style>""", unsafe_allow_html=True)

                with selected_tab[0]:
                    en = language == "en"
                    st.markdown(f"**{'Topic:' if en else '主题:'}** {current_session.topic}")
                    st.markdown(f"**{'Rounds:' if en else '轮次:'}** {current_session.round_count}  |  **{'Experts:' if en else '专家数:'}** {current_session.expert_count}")
                    if current_session.additional_info:
                        st.markdown(f"**{'Additional Info:' if en else '补充信息:'}** {current_session.additional_info}")
                    st.markdown(f"**{'Language:' if en else '语言:'}** {current_session.language}")

                with selected_tab[1]:
                    if agg and agg.research_brief:
                        render_research_card(agg.research_brief, SessionStage.DEEP_RESEARCH, sid, language)
                    elif current_session.status in (SessionStatus.RESEARCHING, SessionStatus.CREATED):
                        render_task_progress(sid, "deep_research", language)
                    else:
                        st.info(T("No research data yet", "暂无研究数据"))

                with selected_tab[2]:
                    if agg and agg.experts:
                        render_experts_card(agg.experts, language)
                    else:
                        render_task_progress(sid, "expert_creation", language)

                with selected_tab[3]:
                    if agg and agg.rounds:
                        render_insights_card(agg.rounds, language)
                    else:
                        render_task_progress(sid, "insight_refinement", language)

                with selected_tab[4]:
                    if agg and agg.reviews:
                        render_reviews_card(agg.reviews, agg.rounds, language)
                    else:
                        render_task_progress(sid, "cross_review", language)

                with selected_tab[5]:
                    if agg and agg.ideas:
                        render_ideas_card(agg.ideas, language)
                    else:
                        render_task_progress(sid, "idea_synthesis", language)

            if agg and agg.errors:
                with st.expander(T("Errors", "错误"), expanded=False):
                    for err in agg.errors:
                        st.error(err)

            if current_session.status in (SessionStatus.RESEARCHING, SessionStatus.EXPERTS_GENERATED,
                                           SessionStatus.DEBATING, SessionStatus.REVIEWING, SessionStatus.SYNTHESIZING):
                time.sleep(2)
                st.rerun()