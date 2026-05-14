from __future__ import annotations

from langchain_core.output_parsers import PydanticOutputParser
from langchain_core.prompts import ChatPromptTemplate

from neobee.core.llm import get_llm
from neobee.models import ExpertProfile, ExpertsOutput
from neobee.pipeline._utils import _make_progress
from neobee.pipeline.state import NeobeeState

BATCH_SIZE = 25

PROMPT_SINGLE_BATCH = ChatPromptTemplate.from_messages([
    ("system", "You are a talent scout for innovation think-tanks. Given a research topic and "
     "identified opportunity areas, generate {batch_count} diverse expert personas who would provide "
     "valuable perspectives on these areas.\n\n"
     "Opportunity Areas:\n{opportunity_areas_text}\n\n"
     "Assign each expert to one opportunity area. For each area, provide a mix of:\n"
     "- A domain insider (deep expertise in the area)\n"
     "- An adjacent cross-pollinator (perspective from a neighboring domain)\n"
     "- A contrarian challenger (critical stance, questions assumptions)\n\n"
     "Generate distinct personas that complement the ones already generated: {existing_summary}"),
    ("human", "Research Topic: {topic}\n\n"
     "Topic Frame: {topic_frame}\n\n"
     "Open Questions: {open_questions}\n\n"
     "Generate {batch_count} additional expert personas with their assigned opportunity areas. "
     "They must be DIFFERENT from the existing ones — cover new domains, perspectives, and stances.\n\n"
     "Use {language}\n\n{format_instructions}"),
])


async def expert_creation_node(state: NeobeeState) -> dict:
    """Generate expert personas from the research brief, with batching for large counts."""
    print("===== Expert Creation Node =====")
    session = state["session"]
    language = "English" if session.language == "en" else "Chinese"
    brief = state.get("research_brief")
    opportunity_map = state.get("opportunity_map")
    progress = _make_progress(session.id, "expert_creation", state.get("task_id"))

    if not brief:
        return {"error": "Research brief is required for expert creation", "experts": []}

    try:
        total_needed = session.expert_count
        parser = PydanticOutputParser(pydantic_object=ExpertsOutput)
        llm = get_llm("expert_creation")
        all_experts: list[ExpertProfile] = []

        progress(5, "generating expert personas")

        # Build opportunity areas context
        opportunity_areas_text = "None identified"
        if opportunity_map and opportunity_map.areas:
            lines = []
            for area in opportunity_map.areas:
                pains = "; ".join(area.pain_points[:3]) if area.pain_points else "N/A"
                lines.append(f"- {area.name}: {area.description} (pain points: {pains})")
            opportunity_areas_text = "\n".join(lines)

        num_batches = (total_needed + BATCH_SIZE - 1) // BATCH_SIZE
        batch_sizes = [min(BATCH_SIZE, total_needed - i * BATCH_SIZE) for i in range(num_batches)]

        for batch_idx, batch_count in enumerate(batch_sizes):
            if batch_idx == 0:
                # First batch — use original prompt (no existing context)
                messages = PROMPT_SINGLE_BATCH.format_messages(
                    batch_count=str(batch_count),
                    topic=session.topic,
                    topic_frame=brief.topic_frame,
                    open_questions="\n".join(brief.open_questions) if brief.open_questions else "None yet",
                    existing_summary="None — this is the first batch",
                    language=language,
                    opportunity_areas_text=opportunity_areas_text,
                    format_instructions=parser.get_format_instructions(),
                )
            else:
                domains = ", ".join(e.domain for e in all_experts[-BATCH_SIZE:])
                messages = PROMPT_SINGLE_BATCH.format_messages(
                    batch_count=str(batch_count),
                    topic=session.topic,
                    topic_frame=brief.topic_frame,
                    open_questions="\n".join(brief.open_questions) if brief.open_questions else "None yet",
                    existing_summary=domains,
                    language=language,
                    opportunity_areas_text=opportunity_areas_text,
                    format_instructions=parser.get_format_instructions(),
                )

            result = await llm.ainvoke(messages)
            parsed = parser.parse(result.content)
            all_experts.extend(parsed.experts)

            # Ensure all experts have IDs
            for expert in parsed.experts:
                if not expert.id:
                    import uuid
                    expert.id = uuid.uuid4().hex

            pct = 10 + int(85 * (batch_idx + 1) / num_batches)
            progress(pct, f"generated batch {batch_idx + 1}/{num_batches}")

        # Trim to exact count requested
        all_experts = all_experts[:total_needed]

        progress(100, "completed")
        return {"experts": all_experts, "error": None}

    except Exception as e:
        progress(0, "failed")
        return {"experts": [], "error": str(e)}