from __future__ import annotations

import streamlit as st


def render_topic_form(language: str = "en") -> tuple[bool, dict]:
    """Topic intake form. Returns (submitted, form_data)."""
    en = language == "en"
    with st.form("session_form"):
        topic = st.text_input("Topic" if en else "主题", placeholder="e.g., AI-powered education for children")
        col1, col2 = st.columns(2)
        with col1:
            rounds = st.number_input("Rounds" if en else "轮次", min_value=1, max_value=10, value=3)
        with col2:
            experts = st.number_input("Experts" if en else "专家数", min_value=1, max_value=10, value=3)
        additional_info = st.text_area("Additional Info" if en else "补充信息", placeholder="Optional context..." if en else "可选补充信息...")
        submitted = st.form_submit_button("Launch Brainstorm 🚀", width='stretch')

        if submitted and topic.strip():
            return True, {
                "topic": topic.strip(),
                "round_count": rounds,
                "expert_count": experts,
                "additional_info": additional_info,
            }
    return False, {}