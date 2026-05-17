"""Deep research agent -- explores a topic via web search and produces a text report."""

from __future__ import annotations

from typing import Any

from deepagents import create_deep_agent

from neobee.core.llm import get_llm
from neobee.models import ResearchReport
from neobee.pipeline.tools.search import fetch_url_tool, web_search_tool

SYSTEM_PROMPT = """\
You are a deep research strategist. Research the topic thoroughly using web_search_tool.
Produce a comprehensive research report covering topic overview, key facts, market signals,
open questions, trends, and source references. Write in plain text with markdown formatting."""


async def run_research_agent(topic: str, additional_info: str = "",
                              language: str = "en", expert_count: int = 3,
                              round_count: int = 3) -> dict[str, Any]:
    lang = "English" if language == "en" else "Chinese"
    llm = get_llm("deep_research")

    agent = create_deep_agent(
        model=llm,
        system_prompt=SYSTEM_PROMPT,
        tools=[web_search_tool, fetch_url_tool],
    )

    user_msg = (
        f"Research topic: {topic}\n"
        f"Additional context: {additional_info}\n"
        f"Language: {lang}\n"
        f"Expert count for later stages: {expert_count}\n"
        f"Debate rounds for later stages: {round_count}\n\n"
        "Research this topic thoroughly and produce a comprehensive research report."
    )

    try:
        result = await agent.ainvoke({"messages": [{"role": "user", "content": user_msg}]})
        messages = result.get("messages", []) or []
        if not messages:
            return {"research_brief": None, "opportunity_map": None, "error": "No messages"}

        # Collect all AI text output as the report
        parts = []
        for msg in messages:
            if hasattr(msg, "content") and msg.content and getattr(msg, "type", "") == "ai":
                parts.append(str(msg.content))
            elif hasattr(msg, "content") and msg.content:
                parts.append(str(msg.content))
        report = "\n\n".join(p for p in parts if p.strip()) or str(messages[-1].content)
        return {"research_brief": report, "opportunity_map": None, "error": None}
    except Exception as e:
        return {"research_brief": None, "opportunity_map": None, "error": str(e)}