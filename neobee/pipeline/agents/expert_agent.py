"""Expert creation agent -- generates diverse expert personas from research context."""

from __future__ import annotations

from typing import Any

from deepagents import create_deep_agent

from neobee.core.llm import get_llm
from neobee.models import ExpertProfile
from neobee.pipeline.agents._utils import extract_json

SYSTEM_PROMPT = """\
You are a talent scout assembling a world-class innovation think-tank. \
Given a research report and opportunity areas, create deeply characterized expert personas.

Each expert must feel real and distinctive:
- **name**: Full name with appropriate cultural background
- **domain**: Specific sub-field of expertise (not generic, e.g. "Adversarial ML in EdTech" not "AI")
- **persona_style**: Their thinking archetype (visionary, skeptic, pragmatist, systems-thinker, ethicist, builder, etc.)
- **stance**: Their specific position on the topic (controversial or differentiated, not generic)
- **skills**: 4-6 concrete, specific skills that reflect their unique expertise
- **opportunity_area**: Which opportunity area from the research they are best suited to

Make experts diverse in background, thinking style, and domain coverage. \
Avoid cliches. Each expert should offer a perspective no other expert overlaps with.

CRITICAL: Your FINAL message must be ONLY a ```json code block with no other text.

```json
{
  "experts": [
    {
      "name": "Dr. Mei-Lin Chen",
      "domain": "Computational Linguistics & NLP for Low-Resource Languages",
      "persona_style": "systems-thinker",
      "stance": "enthusiastic but warns against Western-centric training data creates systemic bias in global EdTech",
      "skills": ["multilingual NLP", "curriculum-aware language modeling", "cross-cultural assessment design", "learnability metrics", "low-resource dataset construction"],
      "opportunity_area": "Area name"
    }
  ]
}
```"""


async def run_expert_agent(
    topic: str,
    report: str,
    opportunity_areas_text: str,
    expert_count: int,
    language: str = "en",
) -> dict[str, Any]:
    """Run the expert creation agent.

    Returns:
        dict with keys ``experts`` (list[ExpertProfile]) and ``error`` (str | None).
    """
    lang = "English" if language == "en" else "Chinese"
    llm = get_llm("expert_creation")

    agent = create_deep_agent(
        model=llm,
        system_prompt=SYSTEM_PROMPT,
        tools=[],
    )

    user_msg = (
        f"Research topic: {topic}\n\n"
        f"Research Report:\n{report}\n\n"
        f"Opportunity Areas:\n{opportunity_areas_text}\n\n"
        f"Generate {expert_count} diverse, deeply characterized expert personas. Language: {lang}"
    )

    try:
        result = await agent.ainvoke({"messages": [{"role": "user", "content": user_msg}]})
        final_msg = result.get("messages", [])[-1] if result.get("messages") else None
        if final_msg and hasattr(final_msg, "content") and final_msg.content:
            parsed = extract_json(str(final_msg.content))
            if parsed and "experts" in parsed:
                import uuid
                experts = [ExpertProfile(**e) for e in parsed["experts"]]
                for exp in experts:
                    if not exp.id:
                        exp.id = uuid.uuid4().hex
                # Trim to exact count
                experts = experts[:expert_count]
                return {"experts": experts, "error": None}
        return {"experts": [], "error": "Failed to parse agent output"}
    except Exception as e:
        return {"experts": [], "error": str(e)}