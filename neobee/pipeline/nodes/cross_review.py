from __future__ import annotations

import asyncio

from langchain_core.output_parsers import PydanticOutputParser
from langchain_core.prompts import ChatPromptTemplate

from neobee.core.llm import get_llm
from neobee.models import Insight, ReviewBatchOutput, ReviewScore, SessionRound
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
     "Provide scores and comments for each insight.\n\n{format_instructions}"),
])

BATCH_SIZE = 20


def _format_insights_for_review(insights: list[Insight]) -> str:
    return "\n\n".join(
        f"Insight {i + 1} (ID: {ins.id}):\nExpert: {ins.expert_id}\n"
        f"Round: {ins.round}\nInsight: {ins.insight}\nRationale: {ins.rationale}"
        for i, ins in enumerate(insights)
    )


async def cross_review_node(state: NeobeeState) -> dict:
    """Each expert reviews all insights with 6-dimension scores."""
    print("===== Cross Review Node =====")
    experts = state.get("experts", [])
    rounds = state.get("rounds", [])
    cursor = state.get("cross_review_cursor") or {"completed_expert_ids": []}

    if not experts or not rounds:
        return {"error": "Experts and rounds required for cross review"}

    all_insights: list[Insight] = []
    for sr in rounds:
        all_insights.extend(sr.insights)

    if not all_insights:
        return {"error": "No insights to review"}

    all_reviews = list(state.get("reviews", []))
    completed_ids = set(cursor.get("completed_expert_ids", []))

    try:
        for expert in experts:
            if expert.id in completed_ids:
                continue

            for batch_start in range(0, len(all_insights), BATCH_SIZE):
                batch = all_insights[batch_start:batch_start + BATCH_SIZE]
                insights_text = _format_insights_for_review(batch)

                parser = PydanticOutputParser(pydantic_object=ReviewBatchOutput)
                llm = get_llm("cross_review")
                retries = 2
                batch_reviews = []
                for attempt in range(retries + 1):
                    try:
                        messages = PROMPT.format_messages(
                            reviewer_domain=expert.domain,
                            reviewer_style=expert.persona_style,
                            insights_text=insights_text,
                            format_instructions=parser.get_format_instructions(),
                        )
                        result = await llm.ainvoke(messages)
                        parsed = parser.parse(result.content)
                        batch_reviews = parsed.reviews
                        break
                    except Exception:
                        if attempt < retries:
                            await asyncio.sleep(2 ** attempt)
                        else:
                            raise

                for i, rev in enumerate(batch_reviews):
                    if i < len(batch):
                        rev.insight_id = batch[i].id
                    rev.reviewer_expert_id = expert.id

                all_reviews.extend(batch_reviews)

            completed_ids.add(expert.id)

        return {"reviews": all_reviews, "cross_review_cursor": None, "error": None}

    except Exception as e:
        return {"error": str(e)}


def aggregate_scores(reviews: list[ReviewScore]) -> dict[str, float]:
    scores: dict[str, list[float]] = {}
    for rev in reviews:
        total = (rev.novelty + rev.usefulness + rev.feasibility +
                 rev.evidence_strength + rev.cross_domain_leverage + rev.risk_awareness)
        if rev.insight_id not in scores:
            scores[rev.insight_id] = []
        scores[rev.insight_id].append(total)
    return {insight_id: sum(v) / len(v) for insight_id, v in scores.items()}