from __future__ import annotations

import streamlit as st

from neobee.models import ExpertProfile, IdeaCandidate, ResearchBrief, ReviewScore, SessionRound, SessionStage


def render_research_card(brief: ResearchBrief | None, stage: SessionStage, session_id: str, language: str = "en") -> None:
    """Display research brief."""
    if not brief:
        st.info("⏳ Research in progress..." if language == "en" else "⏳ 研究进行中...")
        return

    st.markdown(f"### {brief.topic_frame}")

    metrics_cols = st.columns(4)
    with metrics_cols[0]:
        st.metric("Key Facts" if language == "en" else "关键事实", len(brief.key_facts))
    with metrics_cols[1]:
        st.metric("Open Questions" if language == "en" else "开放问题", len(brief.open_questions))
    with metrics_cols[2]:
        st.metric("Signals" if language == "en" else "信号", len(brief.signals))
    with metrics_cols[3]:
        st.metric("Sources" if language == "en" else "来源", len(brief.source_refs))

    with st.expander("Key Facts" if language == "en" else "关键事实", expanded=True):
        for fact in brief.key_facts:
            st.markdown(f"- {fact}")

    with st.expander("Open Questions" if language == "en" else "开放问题"):
        for q in brief.open_questions:
            st.markdown(f"- {q}")

    with st.expander("Signals & Trends" if language == "en" else "信号与趋势"):
        for s in brief.signals:
            st.markdown(f"- {s}")


def render_experts_card(experts: list[ExpertProfile], language: str = "en") -> None:
    """Display expert profiles in a grid."""
    if not experts:
        st.info("⏳ Generating experts..." if language == "en" else "⏳ 专家生成中...")
        return

    en = language == "en"
    cols = st.columns(min(3, len(experts)))
    for i, expert in enumerate(experts):
        with cols[i % 3]:
            with st.container(border=True):
                st.markdown(f"**{expert.name}**")
                st.caption(f"{expert.domain} | {expert.stance}")
                st.markdown(f"*{expert.persona_style}*")
                if expert.skills:
                    st.markdown(("**Skills:** " if en else "**技能:** ") + ", ".join(expert.skills[:5]))


def render_insights_card(rounds: list[SessionRound], language: str = "en") -> None:
    """Display insights grouped by round."""
    if not rounds:
        st.info("⏳ Generating insights..." if language == "en" else "⏳ 洞见生成中...")
        return

    round_groups: dict[int, list[SessionRound]] = {}
    for sr in rounds:
        round_groups.setdefault(sr.round, []).append(sr)

    for round_num in sorted(round_groups.keys()):
        with st.expander(f"Round {round_num}" if language == "en" else f"第 {round_num} 轮", expanded=True):
            for sr in round_groups[round_num]:
                for ins in sr.insights:
                    st.markdown(f"**{sr.expert_id}** — {ins.insight}")
                    st.caption(f"*{ins.rationale}*")
                    st.divider()


def render_reviews_card(reviews: list[ReviewScore], rounds: list[SessionRound], language: str = "en") -> None:
    """Display review scores."""
    if not reviews:
        st.info("⏳ Reviews in progress..." if language == "en" else "⏳ 评审进行中...")
        return

    dim_labels_en = ["Novelty", "Usefulness", "Feasibility", "Evidence", "Cross-domain", "Risk Awareness"]
    dim_labels_zh = ["新颖性", "实用性", "可行性", "证据力", "跨领域", "风险意识"]
    labels = dim_labels_zh if language == "zh" else dim_labels_en

    review_groups: dict[str, list[ReviewScore]] = {}
    for rev in reviews:
        review_groups.setdefault(rev.insight_id, []).append(rev)

    for insight_id, group in review_groups.items():
        with st.expander(f"Insight: {insight_id[:12]}...", expanded=False):
            for sr in rounds:
                for ins in sr.insights:
                    if ins.id == insight_id:
                        st.markdown(f"**{ins.insight}**")
                        break

            scores_data = []
            for rev in group:
                scores_data.append({
                    "Reviewer": rev.reviewer_expert_id[:12],
                    labels[0]: rev.novelty,
                    labels[1]: rev.usefulness,
                    labels[2]: rev.feasibility,
                    labels[3]: rev.evidence_strength,
                    labels[4]: rev.cross_domain_leverage,
                    labels[5]: rev.risk_awareness,
                    "Comment": rev.comment[:50] if rev.comment else "",
                })
            st.dataframe(scores_data, width='stretch')


def render_ideas_card(ideas: list[IdeaCandidate], language: str = "en") -> None:
    """Display generated idea candidates."""
    if not ideas:
        st.info("⏳ Synthesizing ideas..." if language == "en" else "⏳ 想法综合中...")
        return

    en = language == "en"
    for i, idea in enumerate(ideas):
        with st.container(border=True):
            col1, col2 = st.columns([4, 1])
            with col1:
                st.markdown(f"### {i + 1}. {idea.title}")
            with col2:
                score_color = "green" if idea.total_score >= 7 else "orange" if idea.total_score >= 4 else "red"
                st.markdown(
                    f"<h3 style='color:{score_color}; text-align:right;'>{idea.total_score:.1f}</h3>",
                    unsafe_allow_html=True,
                )
                if idea.controversy_label:
                    st.markdown(f"<p style='text-align:right;'><small>⚡ {idea.controversy_label}</small></p>",
                                unsafe_allow_html=True)

            st.markdown(("**Thesis:** " if en else "**论点:** ") + idea.thesis)
            st.markdown(("**Why Now:** " if en else "**为何现在:** ") + idea.why_now)
            st.markdown(("**Target User:** " if en else "**目标用户:** ") + idea.target_user)
            st.markdown(("**Core Mechanism:** " if en else "**核心机制:** ") + idea.core_mechanism)

            if idea.risks:
                with st.expander("Risks" if en else "风险"):
                    for risk in idea.risks:
                        st.markdown(f"- {risk}")