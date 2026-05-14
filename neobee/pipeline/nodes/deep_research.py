from __future__ import annotations

import asyncio

from langchain_core.output_parsers import PydanticOutputParser
from langchain_core.prompts import ChatPromptTemplate

from neobee.core.llm import get_llm
from neobee.core.search import search
from neobee.models import (
    FactExtractionOutput,
    QueryGenOutput,
    ResearchBrief,
    SynthesisOutput,
)
from neobee.pipeline.state import NeobeeState

from neobee.pipeline._registry import _get_tracker

PROMPT_QUERY_GEN = ChatPromptTemplate.from_messages([
    ("system", "You are a research strategist. Given a topic, generate search queries to gather comprehensive information.\n\nTopic: {topic}\nAdditional Context: {additional_info}"),
    ("human", "Generate a primary search query and 3-5 sub-queries to thoroughly research this topic.\n\n{format_instructions}"),
])

PROMPT_FACT_EXTRACT = ChatPromptTemplate.from_messages([
    ("system", "Extract verifiable facts from the following search results. Identify knowledge gaps and key entities."),
    ("human", "Search Results:\n{results}\n\nExtract facts, knowledge gaps, and key entities.\n\n{format_instructions}"),
])

PROMPT_SYNTHESIS = ChatPromptTemplate.from_messages([
    ("system", "You are a research analyst. Synthesize the collected information into a comprehensive research brief. "
     "Include a 360-degree topic frame, key facts with source attribution, open questions, emerging signals/trends, and source references."),
    ("human", "First round facts: {first_facts}\n\nSecond round facts: {second_facts}\n\nGap queries: {gap_queries}\n\nProduce the final research brief.\n\n"
     "Use {language}\n\n{format_instructions}"),
])


async def _run_query_gen(session) -> QueryGenOutput:
    parser = PydanticOutputParser(pydantic_object=QueryGenOutput)
    llm = get_llm("deep_research")
    messages = PROMPT_QUERY_GEN.format_messages(
        topic=session.topic,
        additional_info=session.additional_info,
        format_instructions=parser.get_format_instructions(),
    )
    result = await llm.ainvoke(messages)
    return parser.parse(result.content)


async def _run_fact_extraction(results_text: str) -> FactExtractionOutput:
    parser = PydanticOutputParser(pydantic_object=FactExtractionOutput)
    llm = get_llm("deep_research")
    messages = PROMPT_FACT_EXTRACT.format_messages(
        results=results_text,
        format_instructions=parser.get_format_instructions(),
    )
    result = await llm.ainvoke(messages)
    return parser.parse(result.content)


async def _run_synthesis(language: str, first_facts: list[str], second_facts: list[str], gap_queries: list[str]) -> SynthesisOutput:
    parser = PydanticOutputParser(pydantic_object=SynthesisOutput)
    llm = get_llm("deep_research")
    messages = PROMPT_SYNTHESIS.format_messages(
        first_facts="\n".join(first_facts),
        second_facts="\n".join(second_facts),
        gap_queries="\n".join(gap_queries),
        language=language,
        format_instructions=parser.get_format_instructions(),
    )
    result = await llm.ainvoke(messages)
    return parser.parse(result.content)


async def deep_research_node(state: NeobeeState) -> dict:
    """Five sub-stage deep research: query gen -> search-1 -> fact extract -> search-2 -> synthesis."""
    print("===== Deep Research Node =====")
    session = state["session"]
    language = "English" if session.language == "en" else "Chinese"
    tracker = _get_tracker()
    task_id = state.get("task_id")

    def _progress(pct: int, step: str) -> None:
        if tracker and task_id:
            tracker.update_progress(session.id, "deep_research", task_id, pct, step)

    try:
        # Sub-stage 1: Query generation (LLM-1)
        _progress(15, "generating search queries")
        queries = await _run_query_gen(session)
        all_queries = [queries.primary_query] + queries.sub_queries

        # Sub-stage 2: First round broad search (Search-1)
        _progress(30, "searching round 1")
        first_results = []
        search_tasks = [asyncio.to_thread(search, q, num_results=5) for q in all_queries]
        responses = await asyncio.gather(*search_tasks, return_exceptions=True)
        for resp in responses:
            if isinstance(resp, Exception):
                continue
            first_results.extend(resp.results)

        # Deduplicate by URL
        seen_urls = set()
        unique_first_results = []
        for r in first_results:
            if r.url and r.url not in seen_urls:
                seen_urls.add(r.url)
                unique_first_results.append(r)

        results_text = "\n\n".join(
            f"Title: {r.title}\nURL: {r.url}\nSnippet: {r.snippet}" for r in unique_first_results
        )

        # Sub-stage 3: Fact extraction & gap identification (LLM-2)
        _progress(50, "extracting facts and gaps")
        first_facts_output = await _run_fact_extraction(results_text)
        first_facts = first_facts_output.facts

        # Sub-stage 4: Second round targeted search (Search-2)
        _progress(65, "searching knowledge gaps")
        gap_queries = first_facts_output.knowledge_gaps[:5]
        second_results = []
        gap_search_tasks = [asyncio.to_thread(search, q, num_results=3) for q in gap_queries]
        gap_responses = await asyncio.gather(*gap_search_tasks, return_exceptions=True)
        for resp in gap_responses:
            if isinstance(resp, Exception):
                continue
            second_results.extend(resp.results)

        for r in second_results:
            if r.url and r.url not in seen_urls:
                seen_urls.add(r.url)

        second_results_text = "\n\n".join(
            f"Title: {r.title}\nURL: {r.url}\nSnippet: {r.snippet}" for r in second_results
        ) if second_results else "No additional results found."

        # Sub-stage 5: Synthesis (LLM-3)
        _progress(80, "synthesizing research brief")
        synthesis = await _run_synthesis(language, first_facts, [second_results_text], gap_queries)

        brief = ResearchBrief(
            topic_frame=synthesis.topic_frame,
            key_facts=synthesis.key_facts,
            open_questions=synthesis.open_questions,
            signals=synthesis.signals,
            source_refs=synthesis.source_refs,
        )

        _progress(100, "completed")
        return {"research_brief": brief, "error": None}

    except Exception as e:
        return {"research_brief": None, "error": str(e)}