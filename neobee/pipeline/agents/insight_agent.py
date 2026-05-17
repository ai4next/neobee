"""Insight refinement agent -- multi-agent debate (Facilitator + Expert agents).

The Facilitator agent orchestrates a 3-round debate:
- R1: Divergent -- each expert generates initial insight
- R2: Challenge -- experts challenge or deepen each other's insights
- R3: Synthesis -- each expert produces final synthesized insight

Only R3 insights are returned.
"""

from __future__ import annotations

from typing import Any

from neobee.core.llm import get_llm
from neobee.models import ExpertProfile, Insight, SessionRound
from neobee.pipeline.agents._utils import extract_json


def _build_expert_prompt(expert: ExpertProfile, round_num: int, language: str) -> str:
    """Build the prompt for an expert agent based on its profile and round."""
    base = (
        f"You are {expert.name}, a {expert.domain} expert with a {expert.persona_style} style. "
        f"Your stance is: {expert.stance}. Your skills include: {', '.join(expert.skills)}.\n"
        f"Your opportunity area: {expert.opportunity_area}\n\n"
    )
    if round_num == 1:
        return base + (
            "Generate ONE deep, original insight from your unique perspective. "
            "Think beyond obvious observations.\n"
            'Output JSON: { "insight": "...", "rationale": "..." }\n'
            f"Language: {language}"
        )
    elif round_num == 2:
        return base + (
            "Review the insights from other experts below. Either:\n"
            "1) CHALLENGE -- identify blind spots, assumptions, missing perspectives\n"
            "2) DEEPEN -- add supporting evidence, extend the idea\n\n"
            'Output JSON: { "insight": "...", "rationale": "...", "target_expert_id": "..." }\n'
            f"Language: {language}"
        )
    else:
        return base + (
            "Based on the full debate, produce your FINAL synthesized insight. Either:\n"
            "- Strengthen your position by incorporating counterarguments\n"
            "- Shift to a new synthesis bridging multiple perspectives\n"
            "- Identify a novel connection that emerged\n\n"
            'Output JSON: { "insight": "...", "rationale": "..." }\n'
            f"Language: {language}"
        )


async def _call_expert(expert: ExpertProfile, round_num: int,
                       context: str, language: str) -> dict:
    """Call a single expert LLM and return parsed JSON."""
    llm = get_llm("insight_refinement")
    prompt = _build_expert_prompt(expert, round_num, language)
    result = await llm.ainvoke([
        {"role": "system", "content": prompt},
        {"role": "user", "content": context},
    ])
    content = str(result.content) if hasattr(result, "content") else str(result)
    parsed = extract_json(content)
    return parsed or {}


async def run_insight_agent(
    topic: str,
    report: str,
    experts: list[ExpertProfile],
    round_count: int,
    language: str = "en",
    opportunity_areas_text: str = "",
    cross_synergies: list[str] | None = None,
) -> dict[str, Any]:
    """Run a 3-round debate by calling each expert's LLM directly.

    R1: each expert generates initial insight.
    R2: insights shared, each expert challenges/deepens another's.
    R3: each expert produces final synthesis.

    Returns:
        dict with keys ``rounds`` (list[SessionRound] -- R3 final) and ``error`` (str | None).
    """
    import uuid
    lang = "English" if language == "en" else "Chinese"
    actual_rounds = max(round_count, 3)
    synergy_text = "\n".join(f"- {s}" for s in (cross_synergies or [])) or "None"

    # ── Build research context ──────────────────────────────────────────────
    research_context = (
        f"Topic: {topic}\n\n"
        f"Research Report:\n{report}\n\n"
        f"Opportunity Areas:\n{opportunity_areas_text}\n\n"
        f"Cross-Area Synergies:\n{synergy_text}\n\n"
        f"Language: {lang}"
    )

    try:
        # ── R1: Divergent — each expert generates initial insight ──────────
        r1_results: dict[str, dict] = {}
        for exp in experts:
            result = await _call_expert(exp, 1, research_context, lang)
            if "insight" in result:
                r1_results[exp.id] = result

        if not r1_results:
            return {"rounds": [], "error": "All R1 experts failed"}

        # ── R2: Challenge — share insights, each expert challenges ─────────
        r1_text = "\n\n".join(
            f"Expert {_expert_name(exp.id, experts)}: {r1_results[exp.id]['insight']}"
            for exp in experts if exp.id in r1_results
        )
        r2_context = f"{research_context}\n\nInsights from Round 1:\n{r1_text}"

        r2_results: dict[str, dict] = {}
        for exp in experts:
            if exp.id not in r1_results:
                continue
            result = await _call_expert(exp, 2, r2_context, lang)
            if "insight" in result:
                r2_results[exp.id] = result

        # ── R3: Synthesis — final insight from each expert ─────────────────
        r2_text = "\n\n".join(
            f"Expert {_expert_name(exp.id, experts)}: {r2_results.get(exp.id, {}).get('insight', r1_results[exp.id]['insight'])}"
            for exp in experts if exp.id in r1_results
        )
        r3_context = f"{research_context}\n\nRound 1 insights:\n{r1_text}\n\nRound 2 challenges:\n{r2_text}"

        r3_results: dict[str, dict] = {}
        for exp in experts:
            if exp.id not in r1_results:
                continue
            result = await _call_expert(exp, 3, r3_context, lang)
            if "insight" in result:
                r3_results[exp.id] = result

        if not r3_results:
            return {"rounds": [], "error": "All R3 experts failed"}

        rounds = []
        for eid, data in r3_results.items():
            ins = Insight(
                id=uuid.uuid4().hex,
                round=3,
                expert_id=eid,
                insight=data.get("insight", ""),
                rationale=data.get("rationale", ""),
            )
            rounds.append(SessionRound(round=3, expert_id=eid, insights=[ins]))

        return {"rounds": rounds, "error": None}
    except Exception as e:
        return {"rounds": [], "error": str(e)}


def _expert_name(expert_id: str, experts: list[ExpertProfile]) -> str:
    for e in experts:
        if e.id == expert_id:
            return e.name
    return expert_id[:8]