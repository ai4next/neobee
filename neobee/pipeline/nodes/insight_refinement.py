from __future__ import annotations

import asyncio

from langchain_core.output_parsers import PydanticOutputParser
from langchain_core.prompts import ChatPromptTemplate

from neobee.core.llm import get_llm
from neobee.models import Insight, InsightOutput, SessionRound
from neobee.pipeline.state import NeobeeState

from neobee.pipeline._registry import _get_tracker

MAX_CONCURRENT_LLM = 20
_semaphore = asyncio.Semaphore(MAX_CONCURRENT_LLM)

PROMPT = ChatPromptTemplate.from_messages([
    ("system", "You are {expert_name}, a {expert_domain} expert with a {persona_style} style. "
     "Your stance is: {stance}. Your skills include: {skills}.\n\n"
     "Research Context:\nTopic Frame: {topic_frame}\nKey Facts: {key_facts}\n"
     "Open Questions: {open_questions}\n\n"
     "Your previous insights in earlier rounds: {previous_insights}\n\n"
     "Generate ONE deep, original insight that leverages your unique expertise. "
     "Think beyond obvious observations."),
    ("human", "Generate your insight on the topic: {topic}\n\n"
     "Use {language}\n\n{format_instructions}"),
])


async def insight_refinement_node(state: NeobeeState) -> dict:
    """Generate insights per expert per round, with pause/resume support."""
    print("===== Insight Refinement Node =====")
    session = state["session"]
    language = "English" if session.language == "en" else "Chinese"
    brief = state.get("research_brief")
    experts = state.get("experts", [])
    existing_rounds = list(state.get("rounds", []))
    cursor = state.get("insight_cursor") or {"expert_index": 0, "round_index": 0}
    tracker = _get_tracker()
    task_id = state.get("task_id")

    if not brief or not experts:
        return {"error": "Research brief and experts required for insight refinement"}

    def _progress(pct: int, step: str) -> None:
        if tracker and task_id:
            tracker.update_progress(session.id, "insight_refinement", task_id, pct, step)

    try:
        start_expert = cursor.get("expert_index", 0)
        start_round = cursor.get("round_index", 0)
        total_experts = len(experts)
        total_rounds = session.round_count

        _progress(5, "starting insight generation")

        for rn in range(start_round, total_rounds + 1):
            # Determine which experts need insights for this round
            expert_indices = range(start_expert if rn == start_round else 0, total_experts)

            async def gen_for_expert(ei: int) -> tuple[int, Insight]:
                expert = experts[ei]
                # Gather previous insights for this expert from earlier rounds
                prev_insights = []
                for existing_round in existing_rounds:
                    if existing_round.expert_id == expert.id and existing_round.round < rn:
                        for ins in existing_round.insights:
                            prev_insights.append(ins.insight)
                ins = await _generate_single_insight(language, session, brief, expert, rn, prev_insights)
                return ei, ins

            insights = await asyncio.gather(*[gen_for_expert(ei) for ei in expert_indices])

            # Attach generated insights to SessionRound objects
            for ei, insight in insights:
                target_round = None
                for sr in existing_rounds:
                    if sr.round == rn and sr.expert_id == experts[ei].id:
                        target_round = sr
                        break
                if target_round is None:
                    target_round = SessionRound(round=rn, expert_id=experts[ei].id, insights=[])
                    existing_rounds.append(target_round)
                target_round.insights.append(insight)

            pct = 20 + int(80 * (rn - start_round + 1) / (total_rounds - start_round + 1))
            _progress(pct, f"completed round {rn}/{total_rounds}")

        _progress(100, "completed")
        return {"rounds": existing_rounds, "insight_cursor": None, "error": None}

    except Exception as e:
        return {"error": str(e)}


async def _generate_single_insight(
    language, session, brief, expert, round_number: int, previous_insights: list[str]
) -> Insight:
    """Generate a single insight for one expert-round combination."""
    parser = PydanticOutputParser(pydantic_object=InsightOutput)
    llm = get_llm("insight_refinement")
    messages = PROMPT.format_messages(
        expert_name=expert.name,
        expert_domain=expert.domain,
        persona_style=expert.persona_style,
        stance=expert.stance,
        skills=", ".join(expert.skills),
        topic_frame=brief.topic_frame,
        key_facts="\n".join(brief.key_facts) if brief.key_facts else "N/A",
        open_questions="\n".join(brief.open_questions) if brief.open_questions else "N/A",
        previous_insights="\n".join(previous_insights) if previous_insights else "None yet",
        topic=session.topic,
        language=language,
        format_instructions=parser.get_format_instructions(),
    )
    async with _semaphore:
        result = await llm.ainvoke(messages)
    parsed = parser.parse(result.content)
    return Insight(
        round=round_number,
        expert_id=expert.id,
        insight=parsed.insight,
        rationale=parsed.rationale,
    )