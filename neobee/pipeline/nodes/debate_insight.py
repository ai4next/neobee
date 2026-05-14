from __future__ import annotations

import asyncio

from langchain_core.output_parsers import PydanticOutputParser
from langchain_core.prompts import ChatPromptTemplate

from neobee.core.llm import get_llm
from neobee.models import Insight, InsightOutput, OpportunityMap, SessionRound
from neobee.pipeline._registry import _get_tracker
from neobee.pipeline.state import NeobeeState

MAX_CONCURRENT_LLM = 20
_semaphore = asyncio.Semaphore(MAX_CONCURRENT_LLM)

# ── Round 1: Divergent (within area) ──────────────────────────────────────

PROMPT_R1 = ChatPromptTemplate.from_messages([
    ("system", "You are {expert_name}, a {expert_domain} expert with a {persona_style} style. "
     "Your stance is: {stance}. Your skills include: {skills}.\n\n"
     "You are assigned to the opportunity area: {opportunity_area}\n"
     "Area description: {area_description}\n"
     "Pain points in this area: {pain_points}\n"
     "Tech trends: {tech_trends}\n"
     "Market signals: {market_signals}\n\n"
     "Research Context:\nTopic Frame: {topic_frame}\nKey Facts: {key_facts}\n"
     "Open Questions: {open_questions}\n\n"
     "Generate ONE deep, original insight that leverages your unique expertise "
     "and addresses the pain points in your assigned area. "
     "Think beyond obvious observations."),
    ("human", "Generate your insight on the topic: {topic}\n\n"
     "Use {language}\n\n{format_instructions}"),
])

# ── Round 2: Challenge (cross-area) ───────────────────────────────────────

PROMPT_R2 = ChatPromptTemplate.from_messages([
    ("system", "You are {expert_name}, a {expert_domain} expert with a {persona_style} style. "
     "Your stance is: {stance}.\n\n"
     "You are seeing insights from OTHER opportunity areas. Your task is to either:\n"
     "1) CHALLENGE — identify blind spots, assumptions, or missing perspectives\n"
     "2) DEEPEN — add supporting evidence, extend the idea, or connect it to your area\n\n"
     "Your previous insight (Round 1): {my_insight}\n\n"
     "Insights from other areas to respond to:\n{other_insights}\n\n"
     "Cross-area synergies to consider: {cross_synergies}"),
    ("human", "Choose ONE insight from another area and either challenge or deepen it. "
     "State clearly whether you are challenging or deepening.\n\n"
     "Use {language}\n\n{format_instructions}"),
])

# ── Round 3: Synthesis (convergence) ──────────────────────────────────────

PROMPT_R3 = ChatPromptTemplate.from_messages([
    ("system", "You are {expert_name}, a {expert_domain} expert with a {persona_style} style. "
     "Your stance is: {stance}.\n\n"
     "Synthesize what you've learned from the debate into a final, refined insight.\n\n"
     "Your Round 1 insight: {my_insight}\n"
     "Your Round 2 challenge/deepening: {my_challenge}\n\n"
     "All insights from the discussion:\n{all_insights}\n\n"
     "Cross-area synergies: {cross_synergies}\n\n"
     "Produce a final insight that either:\n"
     "- Strengthens your original position by incorporating counterarguments\n"
     "- Shifts to a new synthesis that bridges multiple perspectives\n"
     "- Identifies a novel connection that emerged from the debate"),
    ("human", "Generate your final synthesized insight.\n\n"
     "Use {language}\n\n{format_instructions}"),
])


def _get_area_for_expert(expert, opportunity_map: OpportunityMap | None) -> tuple[str, str, str, str, str]:
    """Get area details for an expert's assigned opportunity area."""
    if not opportunity_map or not opportunity_map.areas:
        return "", "", "", "", ""
    for area in opportunity_map.areas:
        if area.name == expert.opportunity_area:
            return (
                area.name,
                area.description,
                "\n".join(area.pain_points) if area.pain_points else "N/A",
                "\n".join(area.tech_trends) if area.tech_trends else "N/A",
                "\n".join(area.market_signals) if area.market_signals else "N/A",
            )
    return "", "", "", "", ""


async def debate_insight_node(state: NeobeeState) -> dict:
    """3-round debate insight generation: divergent -> challenge -> synthesis."""
    print("===== Debate Insight Node =====")
    session = state["session"]
    language = "English" if session.language == "en" else "Chinese"
    brief = state.get("research_brief")
    experts = state.get("experts", [])
    opportunity_map = state.get("opportunity_map")
    existing_rounds = list(state.get("rounds", []))
    cursor = state.get("insight_cursor") or {"expert_index": 0, "round_index": 0, "debate_phase": "r1"}
    tracker = _get_tracker()
    task_id = state.get("task_id")

    if not brief or not experts:
        return {"error": "Research brief and experts required for debate insight"}

    def _progress(pct: int, step: str) -> None:
        if tracker and task_id:
            tracker.update_progress(session.id, "insight_refinement", task_id, pct, step)

    try:
        _progress(5, "starting debate insight generation")

        # -- Round 1: Divergent (all experts in parallel) --
        _progress(10, "round 1: divergent insights")
        r1_insights: dict[str, Insight] = {}

        async def r1_for_expert(expert) -> Insight:
            area_name, area_desc, pain_pts, tech, signals = _get_area_for_expert(expert, opportunity_map)
            parser = PydanticOutputParser(pydantic_object=InsightOutput)
            llm = get_llm("insight_refinement")
            messages = PROMPT_R1.format_messages(
                expert_name=expert.name,
                expert_domain=expert.domain,
                persona_style=expert.persona_style,
                stance=expert.stance,
                skills=", ".join(expert.skills),
                opportunity_area=area_name or expert.opportunity_area,
                area_description=area_desc,
                pain_points=pain_pts,
                tech_trends=tech,
                market_signals=signals,
                topic_frame=brief.topic_frame,
                key_facts="\n".join(brief.key_facts) if brief.key_facts else "N/A",
                open_questions="\n".join(brief.open_questions) if brief.open_questions else "N/A",
                topic=session.topic,
                language=language,
                format_instructions=parser.get_format_instructions(),
            )
            async with _semaphore:
                result = await llm.ainvoke(messages)
            parsed = parser.parse(result.content)
            return Insight(
                round=1,
                expert_id=expert.id,
                insight=parsed.insight,
                rationale=parsed.rationale,
            )

        r1_tasks = [r1_for_expert(expert) for expert in experts]
        r1_results = await asyncio.gather(*r1_tasks)
        for expert, ins in zip(experts, r1_results):
            r1_insights[expert.id] = ins

        _progress(35, "round 1 complete")

        # -- Round 2: Challenge (cross-area) --
        _progress(40, "round 2: cross-area challenge")
        r2_insights: dict[str, Insight] = {}
        cross_synergies_text = ""
        if opportunity_map and opportunity_map.cross_area_synergies:
            cross_synergies_text = "\n".join(opportunity_map.cross_area_synergies)

        async def r2_for_expert(expert) -> tuple[str, Insight]:
            # Pick insights from OTHER areas
            other_insights_list = []
            for other_exp in experts:
                if other_exp.id != expert.id and other_exp.opportunity_area != expert.opportunity_area:
                    ins = r1_insights.get(other_exp.id)
                    if ins:
                        other_insights_list.append(
                            f"Expert: {other_exp.name} ({other_exp.domain}, area: {other_exp.opportunity_area})\n"
                            f"Insight: {ins.insight}\nRationale: {ins.rationale}"
                        )
            # Limit to 3 other insights to avoid context overflow
            other_text = "\n\n".join(other_insights_list[:3]) if other_insights_list else "No cross-area insights available."

            my_r1 = r1_insights.get(expert.id)
            my_r1_text = f"{my_r1.insight}\nRationale: {my_r1.rationale}" if my_r1 else "N/A"

            parser = PydanticOutputParser(pydantic_object=InsightOutput)
            llm = get_llm("insight_refinement")
            messages = PROMPT_R2.format_messages(
                expert_name=expert.name,
                expert_domain=expert.domain,
                persona_style=expert.persona_style,
                stance=expert.stance,
                my_insight=my_r1_text,
                other_insights=other_text,
                cross_synergies=cross_synergies_text or "None identified",
                language=language,
                format_instructions=parser.get_format_instructions(),
            )
            async with _semaphore:
                result = await llm.ainvoke(messages)
            parsed = parser.parse(result.content)
            return expert.id, Insight(
                round=2,
                expert_id=expert.id,
                insight=parsed.insight,
                rationale=parsed.rationale,
            )

        r2_tasks = [r2_for_expert(expert) for expert in experts]
        r2_results = await asyncio.gather(*r2_tasks)
        for eid, ins in r2_results:
            r2_insights[eid] = ins

        _progress(65, "round 2 complete")

        # -- Round 3: Synthesis (convergence) --
        _progress(70, "round 3: synthesis")
        r3_insights: dict[str, Insight] = {}

        # Build all insights text for context
        all_insights_text_lines = []
        for expert in experts:
            r1 = r1_insights.get(expert.id)
            r2 = r2_insights.get(expert.id)
            if r1:
                all_insights_text_lines.append(
                    f"{expert.name} ({expert.domain}, R1): {r1.insight}"
                )
            if r2:
                all_insights_text_lines.append(
                    f"{expert.name} ({expert.domain}, R2): {r2.insight}"
                )
        all_insights_text = "\n\n".join(all_insights_text_lines)

        async def r3_for_expert(expert) -> tuple[str, Insight]:
            my_r1 = r1_insights.get(expert.id)
            my_r2 = r2_insights.get(expert.id)
            my_r1_text = f"{my_r1.insight}\nRationale: {my_r1.rationale}" if my_r1 else "N/A"
            my_r2_text = f"{my_r2.insight}\nRationale: {my_r2.rationale}" if my_r2 else "N/A"

            parser = PydanticOutputParser(pydantic_object=InsightOutput)
            llm = get_llm("insight_refinement")
            messages = PROMPT_R3.format_messages(
                expert_name=expert.name,
                expert_domain=expert.domain,
                persona_style=expert.persona_style,
                stance=expert.stance,
                my_insight=my_r1_text,
                my_challenge=my_r2_text,
                all_insights=all_insights_text,
                cross_synergies=cross_synergies_text or "None identified",
                language=language,
                format_instructions=parser.get_format_instructions(),
            )
            async with _semaphore:
                result = await llm.ainvoke(messages)
            parsed = parser.parse(result.content)
            return expert.id, Insight(
                round=3,
                expert_id=expert.id,
                insight=parsed.insight,
                rationale=parsed.rationale,
            )

        r3_tasks = [r3_for_expert(expert) for expert in experts]
        r3_results = await asyncio.gather(*r3_tasks)
        for eid, ins in r3_results:
            r3_insights[eid] = ins

        _progress(90, "round 3 complete")

        # -- Build SessionRounds (only R3 insights feed into cross review) --
        new_rounds = list(existing_rounds)
        for expert in experts:
            r3 = r3_insights.get(expert.id)
            if r3:
                sr = SessionRound(round=3, expert_id=expert.id, insights=[r3])
                new_rounds.append(sr)

        _progress(100, "completed")
        return {"rounds": new_rounds, "insight_cursor": None, "error": None}

    except Exception as e:
        return {"error": str(e)}