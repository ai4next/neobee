from __future__ import annotations

from langchain_core.output_parsers import PydanticOutputParser
from langchain_core.prompts import ChatPromptTemplate

from neobee.core.llm import get_llm
from neobee.models import ExpertsOutput
from neobee.pipeline.state import NeobeeState

PROMPT = ChatPromptTemplate.from_messages([
    ("system", "You are a talent scout for innovation think-tanks. Given a research topic, "
     "generate {expert_count} diverse expert personas who would provide valuable perspectives. "
     "Each expert should have a unique domain, persona style, and stance."),
    ("human", "Research Topic: {topic}\n\n"
     "Topic Frame: {topic_frame}\n\n"
     "Open Questions: {open_questions}\n\n"
     "Generate {expert_count} expert personas with diverse perspectives.\n\n{format_instructions}"),
])


async def expert_creation_node(state: NeobeeState) -> dict:
    """Generate expert personas from the research brief."""
    print("★★★★★ EXPERT CREATION ★★★★★")
    session = state["session"]
    brief = state.get("research_brief")

    if not brief:
        return {"error": "Research brief is required for expert creation", "experts": []}

    try:
        parser = PydanticOutputParser(pydantic_object=ExpertsOutput)
        llm = get_llm("expert_creation")
        messages = PROMPT.format_messages(
            expert_count=str(session.expert_count),
            topic=session.topic,
            topic_frame=brief.topic_frame,
            open_questions="\n".join(brief.open_questions) if brief.open_questions else "None yet",
            format_instructions=parser.get_format_instructions(),
        )
        result = await llm.ainvoke(messages)
        parsed = parser.parse(result.content)

        for expert in parsed.experts:
            if not expert.id:
                import uuid
                expert.id = uuid.uuid4().hex

        return {"experts": parsed.experts, "error": None}

    except Exception as e:
        return {"experts": [], "error": str(e)}