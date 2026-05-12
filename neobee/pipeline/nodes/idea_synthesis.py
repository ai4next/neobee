from __future__ import annotations

import asyncio
from math import floor

from langchain_core.output_parsers import PydanticOutputParser
from langchain_core.prompts import ChatPromptTemplate

from neobee.core.llm import get_llm
from neobee.models import IdeaBatchOutput, IdeaCandidate, Insight, ReviewScore, SessionRound
from neobee.pipeline.state import NeobeeState

PROMPT = ChatPromptTemplate.from_messages([
    ("system", "You are a startup idea synthesizer. Given research brief, expert insights, and review scores, "
     "generate promising startup ideas. Each idea should be well-reasoned and specific.\n\n"
     "Research Context:\nTopic Frame: {topic_frame}\nKey Facts: {key_facts}\n"
     "Open Questions: {open_questions}\n\n"
     "Insights with their aggregate review scores:\n{scored_insights}\n\n"
     "Generate {num_ideas} startup idea(s) based on this analysis."),
    ("human", "Generate startup ideas for the topic: {topic}\n\n{format_instructions}"),
])

BATCH_SIZE = 20


def _group_reviews_by_insight(reviews: list[ReviewScore]) -> dict[str, float]:
    scores: dict[str, list[float]] = {}
    for rev in reviews:
        if rev.insight_id not in scores:
            scores[rev.insight_id] = []
        avg = (rev.novelty + rev.usefulness + rev.feasibility +
               rev.evidence_strength + rev.cross_domain_leverage + rev.risk_awareness) / 6
        scores[rev.insight_id].append(avg)
    return {iid: sum(v) / len(v) for iid, v in scores.items()}


def _format_scored_insights(insights: list[Insight], scores: dict[str, float]) -> str:
    lines = []
    for ins in insights:
        score = scores.get(ins.id, 0)
        lines.append(f"Insight: {ins.insight}\nRationale: {ins.rationale}\nScore: {score:.1f}/10")
    return "\n\n".join(lines)


async def idea_synthesis_node(state: NeobeeState) -> dict:
    """Generate startup ideas from insights and reviews."""
    print("===== Idea Synthesis Node =====")
    session = state["session"]
    brief = state.get("research_brief")
    rounds = state.get("rounds", [])
    reviews = state.get("reviews", [])

    if not brief or not rounds:
        return {"error": "Research brief and rounds required for idea synthesis"}

    all_insights: list[Insight] = []
    for sr in rounds:
        all_insights.extend(sr.insights)

    if not all_insights:
        return {"error": "No insights to synthesize ideas from"}

    score_map = _group_reviews_by_insight(reviews)

    all_ideas: list[IdeaCandidate] = []

    try:
        for batch_start in range(0, len(all_insights), BATCH_SIZE):
            batch = all_insights[batch_start:batch_start + BATCH_SIZE]
            num_ideas = max(1, floor(len(batch) / 2))
            scored_text = _format_scored_insights(batch, score_map)

            parser = PydanticOutputParser(pydantic_object=IdeaBatchOutput)
            llm = get_llm("idea_synthesis")
            retries = 2
            for attempt in range(retries + 1):
                try:
                    messages = PROMPT.format_messages(
                        topic_frame=brief.topic_frame,
                        key_facts="\n".join(brief.key_facts) if brief.key_facts else "N/A",
                        open_questions="\n".join(brief.open_questions) if brief.open_questions else "N/A",
                        scored_insights=scored_text,
                        num_ideas=num_ideas,
                        topic=session.topic,
                        format_instructions=parser.get_format_instructions(),
                    )
                    result = await llm.ainvoke(messages)
                    parsed = parser.parse(result.content)
                    all_ideas.extend(parsed.ideas)
                    break
                except Exception:
                    if attempt < retries:
                        await asyncio.sleep(2 ** attempt)
                    else:
                        raise

        for idea in all_ideas:
            if score_map:
                idea.total_score = sum(score_map.values()) / len(score_map)

        return {"ideas": all_ideas, "error": None}

    except Exception as e:
        return {"ideas": [], "error": str(e)}