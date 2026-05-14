from __future__ import annotations

from langchain_core.output_parsers import PydanticOutputParser
from langchain_core.prompts import ChatPromptTemplate

from neobee.core.llm import get_llm
from neobee.models import OpportunityMap, ResearchBrief
from neobee.pipeline._utils import _retry_llm

PROMPT = ChatPromptTemplate.from_messages([
    ("system", "You are a market intelligence analyst. Given a research brief, identify 3-6 distinct "
     "opportunity areas where new startup ideas could be built. For each area, describe the core pain "
     "points, relevant technology trends, and market signals. Also identify cross-area synergies.\n\n"
     "Be specific and concrete. Avoid generic categories like 'healthcare' — instead use focused areas "
     "like 'AI-powered diagnostic triage for primary care'."),
    ("human", "Research Brief:\n\nTopic Frame: {topic_frame}\n\n"
     "Key Facts:\n{key_facts}\n\n"
     "Open Questions:\n{open_questions}\n\n"
     "Signals:\n{signals}\n\n"
     "Generate an opportunity map with 3-6 areas and cross-area synergies.\n\n"
     "Use {language}\n\n{format_instructions}"),
])


async def generate_opportunity_map(
    brief: ResearchBrief,
    language: str,
) -> OpportunityMap | None:
    """Generate a structured OpportunityMap from a ResearchBrief."""
    try:
        parser = PydanticOutputParser(pydantic_object=OpportunityMap)
        llm = get_llm("deep_research")
        messages = PROMPT.format_messages(
            topic_frame=brief.topic_frame,
            key_facts="\n".join(brief.key_facts) if brief.key_facts else "N/A",
            open_questions="\n".join(brief.open_questions) if brief.open_questions else "N/A",
            signals="\n".join(brief.signals) if brief.signals else "N/A",
            language=language,
            format_instructions=parser.get_format_instructions(),
        )
        result = await _retry_llm(llm.ainvoke(messages))
        return parser.parse(result.content)
    except Exception:
        return None