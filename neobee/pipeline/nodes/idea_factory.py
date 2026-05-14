from __future__ import annotations

import statistics

from langchain_core.output_parsers import PydanticOutputParser
from langchain_core.prompts import ChatPromptTemplate

from neobee.core.llm import get_llm
from neobee.models import (
    IdeaBatchOutput,
    IdeaCandidate,
    IdeaEvaluation,
    Insight,
    RawIdea,
    ReviewScore,
)
from neobee.pipeline._utils import _aggregate_reviews, _retry_llm
from neobee.pipeline.state import NeobeeState

# ---- Stage A: Raw Generation -----------------------------------------------

PROMPT_GENERATE = ChatPromptTemplate.from_messages([
    ("system", "You are a startup idea synthesizer. Given research context, expert insights, "
     "and review scores, generate promising startup ideas for a specific opportunity area.\n\n"
     "Opportunity Area: {area_name}\nArea Description: {area_description}\n"
     "Pain Points: {pain_points}\nTech Trends: {tech_trends}\n\n"
     "Research Context:\nTopic Frame: {topic_frame}\nKey Facts: {key_facts}\n\n"
     "Insights with their aggregate review scores:\n{insights_text}\n\n"
     "Generate {num_ideas} raw startup idea(s) for this opportunity area. "
     "Each idea should be specific and well-reasoned."),
    ("human", "Generate startup ideas for the topic: {topic}\n\n"
     "Use {language}\n\n{format_instructions}"),
])

# ---- Stage B: Evaluation ---------------------------------------------------

PROMPT_EVALUATE = ChatPromptTemplate.from_messages([
    ("system", "You are a critical startup evaluator. Score the following startup idea on "
     "five dimensions (1-10 scale):\n"
     "- novelty: How novel and non-obvious is this idea?\n"
     "- feasibility: How technically and practically feasible?\n"
     "- market_potential: Market size, growth potential, timing?\n"
     "- differentiation: How differentiated from existing solutions?\n"
     "- insight_alignment: How well is this grounded in the research insights?\n\n"
     "Be critical. A score of 7+ should mean genuinely impressive on that dimension."),
    ("human", "Research Context:\n{topic_frame}\n\n"
     "Idea Title: {title}\nThesis: {thesis}\nCore Mechanism: {core_mechanism}\n\n"
     "Provide scores and a brief justification.\n\n{format_instructions}"),
])

# ---- Stage C: Refinement ---------------------------------------------------

PROMPT_REFINE = ChatPromptTemplate.from_messages([
    ("system", "You are a startup strategist. Deepen the following raw idea into a "
     "well-rounded startup concept. Add concrete details about:\n"
     "- Why now (market timing, trends, signals)\n"
     "- Target user (who exactly, what segment)\n"
     "- Core mechanism (how it works at a high level)\n"
     "- Key risks (technical, market, adoption)\n\n"
     "Evaluation scores for reference:\n{evaluation_summary}"),
    ("human", "Raw Idea:\nTitle: {title}\nThesis: {thesis}\nCore Mechanism: {core_mechanism}\n\n"
     "Research Context:\n{topic_frame}\n\n"
     "Deepen this into a complete startup concept.\n\n"
     "Use {language}\n\n{format_instructions}"),
])

# ---- Constants -------------------------------------------------------------

IDEAS_PER_AREA = 6
TOP_K_PER_AREA = 3
EVAL_WEIGHTS = {
    "balanced": {"novelty": 0.30, "feasibility": 0.25, "market_potential": 0.25, "differentiation": 0.20},
    "bold": {"novelty": 0.45, "feasibility": 0.15, "market_potential": 0.15, "differentiation": 0.25},
    "safe": {"novelty": 0.15, "feasibility": 0.35, "market_potential": 0.35, "differentiation": 0.15},
}
PASS_THRESHOLD = 6.0  # out of max 10.0 (weighted score; raw score /10 * weight 1.0)
INSIGHT_ALIGNMENT_MIN = 5


def _compute_total(eval_scores: dict[str, int], strategy: str = "balanced") -> float:
    weights = EVAL_WEIGHTS.get(strategy, EVAL_WEIGHTS["balanced"])
    return sum(eval_scores[k] * weights[k] for k in weights)


def _compute_controversy_label(eval_scores: dict[str, int]) -> str | None:
    scores = list(eval_scores.values())
    if len(scores) < 2:
        return None
    variance = statistics.variance(scores)
    avg = sum(scores) / len(scores)
    if variance > 4.0:
        return "controversial"
    if avg >= 7.5:
        return "consensus"
    if eval_scores.get("novelty", 5) >= 8 and eval_scores.get("feasibility", 5) <= 4:
        return "niche"
    return None


def _format_insights_with_scores(
    insights: list[Insight],
    review_map: dict[str, ReviewScore],
) -> str:
    lines = []
    for ins in insights:
        review = review_map.get(ins.id)
        score_str = f"Score: {review.novelty + review.usefulness + review.feasibility + review.evidence_strength + review.cross_domain_leverage + review.risk_awareness}/60" if review else "No review"
        comment = review.comment if review else ""
        lines.append(f"Insight: {ins.insight}\nRationale: {ins.rationale}\n{score_str}\nComment: {comment}")
    return "\n\n".join(lines)


async def idea_factory_node(state: NeobeeState) -> dict:
    """4-stage idea generation: Generate -> Evaluate -> Refine -> Rank."""
    print("===== Idea Factory Node =====")
    session = state["session"]
    language = "English" if session.language == "en" else "Chinese"
    brief = state.get("research_brief")
    opportunity_map = state.get("opportunity_map")
    rounds = state.get("rounds", [])
    reviews = state.get("reviews", [])

    if not brief or not rounds:
        return {"error": "Research brief and rounds required for idea generation"}

    # Collect all R3 (final) insights
    all_insights: list[Insight] = []
    for sr in rounds:
        all_insights.extend(sr.insights)

    if not all_insights:
        return {"error": "No insights to synthesize ideas from"}

    review_map = _aggregate_reviews(reviews)
    all_raw_ideas: list[RawIdea] = []
    all_evaluations: list[IdeaEvaluation] = []
    all_refined: list[IdeaCandidate] = []

    try:
        # Determine areas to generate for
        areas = []
        if opportunity_map and opportunity_map.areas:
            areas = opportunity_map.areas

        # ---- Stage A: Raw Generation ----
        print("  Stage A: Raw Generation")
        if areas:
            for area in areas:
                # Filter insights relevant to this area (by expert opportunity_area)
                area_expert_ids = {
                    getattr(sr, "expert_id", None)
                    for sr in rounds
                }
                area_insights = [
                    ins for ins in all_insights
                    if ins.expert_id in area_expert_ids
                ]
                if not area_insights:
                    area_insights = all_insights  # fallback to all

                insights_text = _format_insights_with_scores(area_insights, review_map)
                parser = PydanticOutputParser(pydantic_object=IdeaBatchOutput)
                llm = get_llm("idea_synthesis")
                messages = PROMPT_GENERATE.format_messages(
                    area_name=area.name,
                    area_description=area.description,
                    pain_points="\n".join(area.pain_points) if area.pain_points else "N/A",
                    tech_trends="\n".join(area.tech_trends) if area.tech_trends else "N/A",
                    topic_frame=brief.topic_frame,
                    key_facts="\n".join(brief.key_facts) if brief.key_facts else "N/A",
                    insights_text=insights_text,
                    num_ideas=IDEAS_PER_AREA,
                    topic=session.topic,
                    language=language,
                    format_instructions=parser.get_format_instructions(),
                )
                result = await _retry_llm(llm.ainvoke(messages))
                parsed = parser.parse(result.content)
                for idea in parsed.ideas:
                    all_raw_ideas.append(RawIdea(
                        title=idea.title,
                        thesis=idea.thesis,
                        core_mechanism=idea.core_mechanism,
                    ))
        else:
            # No opportunity map -- generate from all insights
            insights_text = _format_insights_with_scores(all_insights, review_map)
            parser = PydanticOutputParser(pydantic_object=IdeaBatchOutput)
            llm = get_llm("idea_synthesis")
            messages = PROMPT_GENERATE.format_messages(
                area_name="General",
                area_description="Overall topic area",
                pain_points="N/A",
                tech_trends="N/A",
                topic_frame=brief.topic_frame,
                key_facts="\n".join(brief.key_facts) if brief.key_facts else "N/A",
                insights_text=insights_text,
                num_ideas=IDEAS_PER_AREA,
                topic=session.topic,
                language=language,
                format_instructions=parser.get_format_instructions(),
            )
            result = await _retry_llm(llm.ainvoke(messages))
            parsed = parser.parse(result.content)
            for idea in parsed.ideas:
                all_raw_ideas.append(RawIdea(
                    title=idea.title,
                    thesis=idea.thesis,
                    core_mechanism=idea.core_mechanism,
                ))

        # ---- Stage B: Evaluation ----
        print("  Stage B: Evaluation")
        parser_eval = PydanticOutputParser(pydantic_object=IdeaEvaluation)
        llm_eval = get_llm("idea_synthesis")

        for raw in all_raw_ideas:
            try:
                messages = PROMPT_EVALUATE.format_messages(
                    topic_frame=brief.topic_frame,
                    title=raw.title,
                    thesis=raw.thesis,
                    core_mechanism=raw.core_mechanism,
                    format_instructions=parser_eval.get_format_instructions(),
                )
                result = await _retry_llm(llm_eval.ainvoke(messages))
                parsed = parser_eval.parse(result.content)
                parsed.idea_id = raw.id
                parsed.total_score = _compute_total({
                    "novelty": parsed.novelty,
                    "feasibility": parsed.feasibility,
                    "market_potential": parsed.market_potential,
                    "differentiation": parsed.differentiation,
                })
                parsed.controversy_label = _compute_controversy_label({
                    "novelty": parsed.novelty,
                    "feasibility": parsed.feasibility,
                    "market_potential": parsed.market_potential,
                    "differentiation": parsed.differentiation,
                    "insight_alignment": parsed.insight_alignment,
                })
                all_evaluations.append(parsed)
            except Exception:
                continue  # skip failed evaluations

        # Filter: discard low-scoring or poorly-aligned ideas
        passed: list[tuple[RawIdea, IdeaEvaluation]] = []
        for raw in all_raw_ideas:
            eval_match = next((e for e in all_evaluations if e.idea_id == raw.id), None)
            if eval_match is None:
                continue
            if eval_match.total_score < PASS_THRESHOLD:
                continue
            if eval_match.insight_alignment < INSIGHT_ALIGNMENT_MIN:
                continue
            passed.append((raw, eval_match))

        # Keep top K globally
        passed.sort(key=lambda x: x[1].total_score, reverse=True)
        passed = passed[:TOP_K_PER_AREA * max(len(areas), 1)]

        # ---- Stage C: Refinement ----
        print("  Stage C: Refinement")
        parser_refine = PydanticOutputParser(pydantic_object=IdeaCandidate)
        llm_refine = get_llm("idea_synthesis")

        for raw, eval_score in passed:
            try:
                eval_summary = (
                    f"novelty={eval_score.novelty}/10, feasibility={eval_score.feasibility}/10, "
                    f"market_potential={eval_score.market_potential}/10, "
                    f"differentiation={eval_score.differentiation}/10, "
                    f"insight_alignment={eval_score.insight_alignment}/10"
                )
                messages = PROMPT_REFINE.format_messages(
                    title=raw.title,
                    thesis=raw.thesis,
                    core_mechanism=raw.core_mechanism,
                    topic_frame=brief.topic_frame,
                    evaluation_summary=eval_summary,
                    language=language,
                    format_instructions=parser_refine.get_format_instructions(),
                )
                result = await _retry_llm(llm_refine.ainvoke(messages))
                parsed = parser_refine.parse(result.content)
                parsed.total_score = eval_score.total_score
                parsed.controversy_label = eval_score.controversy_label
                all_refined.append(parsed)
            except Exception:
                # Keep raw version as fallback
                all_refined.append(IdeaCandidate(
                    title=raw.title,
                    thesis=raw.thesis,
                    core_mechanism=raw.core_mechanism,
                    total_score=eval_score.total_score,
                    controversy_label=eval_score.controversy_label,
                ))

        # ---- Stage D: Ranking ----
        print("  Stage D: Ranking")
        all_refined.sort(key=lambda x: x.total_score, reverse=True)

        return {"ideas": all_refined, "error": None}

    except Exception as e:
        return {"ideas": [], "error": str(e)}