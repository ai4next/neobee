from __future__ import annotations

from math import floor

from langchain_core.output_parsers import PydanticOutputParser
from langchain_core.prompts import ChatPromptTemplate

from neobee.core.llm import get_llm
from neobee.models import IdeaBatchOutput, IdeaCandidate, Insight, ReviewScore
from neobee.pipeline._utils import _aggregate_reviews, _retry_llm
from neobee.pipeline.state import NeobeeState

PROMPT = ChatPromptTemplate.from_messages([
    ("system", "You are a startup idea synthesizer. Given research brief, expert insights, and review scores, "
     "generate promising startup ideas. Each idea should be well-reasoned and specific.\n\n"
     "Research Context:\nTopic Frame: {topic_frame}\nKey Facts: {key_facts}\n"
     "Open Questions: {open_questions}\n\n"
     "Insights with their aggregate review scores:\n{insights_text}\n\n"
     "Generate {num_ideas} startup idea(s) based on this analysis."),
    ("human", "Generate startup ideas for the topic: {topic}\n\n"
     "Use {language}\n\n{format_instructions}"),
])

BATCH_SIZE = 30


def _format_insights(insights: list[Insight], reviews: dict[str, ReviewScore]) -> str:
    lines = []
    for ins in insights:
        review = reviews.get(ins.id, 0)
        lines.append(f"Insight: {ins.insight}\nRationale: {ins.rationale}\nReview: {review.comment}")
    return "\n\n".join(lines)


async def idea_synthesis_node(state: NeobeeState) -> dict:
    """Generate startup ideas from insights and reviews."""
    print("===== Idea Synthesis Node =====")
    session = state["session"]
    language = "English" if session.language == "en" else "Chinese"
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

    review_map = _aggregate_reviews(reviews)
    all_ideas: list[IdeaCandidate] = []

    try:
        for batch_start in range(0, len(all_insights), BATCH_SIZE):
            batch = all_insights[batch_start:batch_start + BATCH_SIZE]
            num_ideas = max(1, floor(len(batch) / 2))
            insights_text = _format_insights(batch, review_map)

            parser = PydanticOutputParser(pydantic_object=IdeaBatchOutput)
            llm = get_llm("idea_synthesis")
            messages = PROMPT.format_messages(
                topic_frame=brief.topic_frame,
                key_facts="\n".join(brief.key_facts) if brief.key_facts else "N/A",
                open_questions="\n".join(brief.open_questions) if brief.open_questions else "N/A",
                insights_text=insights_text,
                num_ideas=num_ideas,
                topic=session.topic,
                language=language,
                format_instructions=parser.get_format_instructions(),
            )
            result = await _retry_llm(llm.ainvoke(messages))
            parsed = parser.parse(result.content)

            all_ideas.extend(parsed.ideas)

        return {"ideas": all_ideas, "error": None}

    except Exception as e:
        return {"ideas": [], "error": str(e)}