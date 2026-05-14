from __future__ import annotations

from langchain_core.output_parsers import PydanticOutputParser
from langchain_core.prompts import ChatPromptTemplate

from neobee.core.llm import get_llm
from neobee.models import ExpertProfile, Insight, ReviewBatchOutput
from neobee.pipeline._utils import _make_progress, _retry_llm
from neobee.pipeline.state import NeobeeState

PROMPT = ChatPromptTemplate.from_messages([
    ("system", "You are an expert evaluator. Review the following insights and score each one "
     "on six dimensions (1-10 scale):\n"
     "- novelty: How novel is this insight?\n"
     "- usefulness: How useful is it for generating startup ideas?\n"
     "- feasibility: How feasible would implementation be?\n"
     "- evidence_strength: How well-supported is it by evidence?\n"
     "- cross_domain_leverage: Can this be applied across domains?\n"
     "- risk_awareness: Does it show awareness of risks?\n\n"
     "Reviewer's expertise: {reviewer_domain}\nReviewer's style: {reviewer_style}"),
    ("human", "Review the following insights:\n\n{insights_text}\n\n"
     "Provide scores and comments for each insight.\n\n"
     "Use {language}\n\n{format_instructions}"),
])

BATCH_SIZE = 30
GROUP_SIZE = 5


def _format_insights_for_review(insights: list[Insight]) -> str:
    return "\n\n".join(
        f"Insight {i + 1} (ID: {ins.id}):\nExpert: {ins.expert_id}\n"
        f"Round: {ins.round}\nInsight: {ins.insight}\nRationale: {ins.rationale}"
        for i, ins in enumerate(insights)
    )


def _group_experts(
    experts: list[ExpertProfile],
    group_size: int = GROUP_SIZE,
) -> list[list[ExpertProfile]]:
    """Divide experts into balanced groups deterministically.

    Groups are sized so that the largest and smallest group differ
    by at most 1 expert.  Number of groups is derived from total
    expert count and target group_size.
    """
    sorted_experts = sorted(experts, key=lambda e: e.id)
    n = len(sorted_experts)
    if n == 0:
        return []

    num_groups = max(1, (n + group_size - 1) // group_size)  # ceiling division
    base_size = n // num_groups
    remainder = n % num_groups

    groups: list[list[ExpertProfile]] = []
    idx = 0
    for i in range(num_groups):
        size = base_size + (1 if i < remainder else 0)
        groups.append(sorted_experts[idx:idx + size])
        idx += size

    return groups


def _get_group_insights_for_reviewer(
    reviewer_id: str,
    group: list[ExpertProfile],
    expert_insights: dict[str, list[Insight]],
) -> list[Insight]:
    """Collect all insights from group members except the reviewer."""
    insights: list[Insight] = []
    for expert in group:
        if expert.id != reviewer_id:
            insights.extend(expert_insights.get(expert.id, []))
    return insights


async def cross_review_node(state: NeobeeState) -> dict:
    """Group-based cross review with full coverage within each group.

    Experts are divided into balanced groups (GROUP_SIZE={}). Within
    each group, every expert reviews ALL insights from every other
    group member, guaranteeing complete coverage.
    """.format(GROUP_SIZE)
    print("===== Cross Review Node =====")
    session = state["session"]
    experts = state.get("experts", [])
    rounds = state.get("rounds", [])
    cursor = state.get("cross_review_cursor") or {"completed_expert_ids": []}
    progress = _make_progress(session.id, "cross_review", state.get("task_id"))

    if not experts or not rounds:
        return {"error": "Experts and rounds required for cross review"}

    # Build lookup: expert_id -> list of their insights across all rounds
    expert_insights: dict[str, list[Insight]] = {}
    for sr in rounds:
        for ins in sr.insights:
            expert_insights.setdefault(ins.expert_id, []).append(ins)

    if not expert_insights:
        return {"error": "No insights to review"}

    all_reviews = list(state.get("reviews", []))
    completed_ids = set(cursor.get("completed_expert_ids", []))
    total_experts = len(experts)

    try:
        groups = _group_experts(experts)
        reviewed_count = len(completed_ids)
        language = "English" if session.language == "en" else "Chinese"
        progress(5, "starting grouped cross review")

        for group in groups:
            if len(group) < 2:
                for expert in group:
                    completed_ids.add(expert.id)
                reviewed_count += len(group)
                continue

            for reviewer in group:
                if reviewer.id in completed_ids:
                    continue

                to_review = _get_group_insights_for_reviewer(
                    reviewer.id, group, expert_insights,
                )
                if not to_review:
                    reviewed_count += 1
                    completed_ids.add(reviewer.id)
                    continue

                parser = PydanticOutputParser(pydantic_object=ReviewBatchOutput)
                llm = get_llm("cross_review")

                for batch_start in range(0, len(to_review), BATCH_SIZE):
                    batch = to_review[batch_start:batch_start + BATCH_SIZE]
                    insights_text = _format_insights_for_review(batch)

                    messages = PROMPT.format_messages(
                        reviewer_domain=reviewer.domain,
                        reviewer_style=reviewer.persona_style,
                        insights_text=insights_text,
                        language=language,
                        format_instructions=parser.get_format_instructions(),
                    )
                    result = await _retry_llm(llm.ainvoke(messages))
                    parsed = parser.parse(result.content)

                    for i, rev in enumerate(parsed.reviews):
                        if i < len(batch):
                            rev.insight_id = batch[i].id
                        rev.reviewer_expert_id = reviewer.id

                    all_reviews.extend(parsed.reviews)

                reviewed_count += 1
                completed_ids.add(reviewer.id)
                pct = 10 + int(90 * reviewed_count / total_experts)
                progress(pct, f"reviewed {reviewed_count}/{total_experts} experts")

        progress(100, "completed")
        return {"reviews": all_reviews, "cross_review_cursor": None, "error": None}

    except Exception as e:
        return {"error": str(e)}
