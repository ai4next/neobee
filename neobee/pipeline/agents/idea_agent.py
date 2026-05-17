"""Idea synthesis agent -- generates, evaluates, refines, and ranks startup ideas."""

from __future__ import annotations

from typing import Any

from deepagents import create_deep_agent

from neobee.core.llm import get_llm
from neobee.models import IdeaCandidate
from neobee.pipeline.agents._utils import extract_json

SYSTEM_PROMPT = """\
You are a startup idea synthesizer. Generate startup ideas from research and insights.

First output a ```json block with your ideas, then you can add explanation after it.

```json
{
  "ideas": [
    {
      "id": "uuid",
      "title": "Idea Title",
      "thesis": "Thesis",
      "why_now": "Why now",
      "target_user": "Target user",
      "core_mechanism": "How it works",
      "risks": ["risk1"],
      "total_score": 8.5,
      "controversy_label": "consensus"
    }
  ]
}
```"""


async def run_idea_agent(
    topic: str,
    report: str,
    insights_text: str,
    opportunity_areas_text: str,
    ideas_per_area: int = 6,
    language: str = "en",
) -> dict[str, Any]:
    lang = "English" if language == "en" else "Chinese"
    llm = get_llm("idea_synthesis")

    agent = create_deep_agent(
        model=llm,
        system_prompt=SYSTEM_PROMPT,
        tools=[],
    )

    user_msg = (
        f"Topic: {topic}\n\n"
        f"Research Report:\n{report}\n\n"
        f"Opportunity Areas:\n{opportunity_areas_text}\n\n"
        f"Expert Insights (Final Round):\n{insights_text}\n\n"
        f"Language: {lang}\n"
        f"Generate {ideas_per_area} raw ideas per area, self-evaluate, filter low scores, "
        f"refine with why_now/target_user/risks, rank by score."
    )

    try:
        result = await agent.ainvoke({"messages": [{"role": "user", "content": user_msg}]})
        final_msg = result.get("messages", [])[-1] if result.get("messages") else None
        if final_msg and hasattr(final_msg, "content") and final_msg.content:
            content = str(final_msg.content)
            parsed = extract_json(content)
            if parsed and "ideas" in parsed:
                import uuid
                ideas = [IdeaCandidate(**i) for i in parsed["ideas"]]
                for idea in ideas:
                    if not idea.id:
                        idea.id = uuid.uuid4().hex
                return {"ideas": ideas, "error": None}
            preview = content[:500] if content else "empty"
            return {"ideas": [], "error": f"Failed to parse agent output. Preview: {preview}"}
        return {"ideas": [], "error": "No valid message in agent response"}
    except Exception as e:
        return {"ideas": [], "error": str(e)}