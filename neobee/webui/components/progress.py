from __future__ import annotations

import streamlit as st


def render_task_progress(session_id: str, stage: str, language: str = "en") -> None:
    """Display task progress from the database."""
    from neobee.core import db as db_module

    task = db_module.get_task(session_id, stage)
    if not task:
        return

    st.progress(task["progress"] / 100.0)
    status_text = {
        "running": "Running..." if language == "en" else "运行中...",
        "completed": "Completed" if language == "en" else "已完成",
        "failed": "Failed" if language == "en" else "失败",
    }
    st.caption(status_text.get(task["status"], task["status"]))

    steps = db_module.get_steps(task["id"])
    if steps:
        with st.expander("Steps" if language == "en" else "步骤", expanded=False):
            for step in steps[-10:]:
                st.text(f"• {step['name']}")