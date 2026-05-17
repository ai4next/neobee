"""4-stage pipeline: deep_research → expert_creation → insight_refinement → idea_synthesis."""

from __future__ import annotations

from pathlib import Path

from langgraph.graph import END, StateGraph

from neobee.models import SessionMeta
from neobee.pipeline.agents.expert_agent import run_expert_agent
from neobee.pipeline.agents.idea_agent import run_idea_agent
from neobee.pipeline.agents.insight_agent import run_insight_agent
from neobee.pipeline.agents.research_agent import run_research_agent
from neobee.pipeline.state import NeobeeState, make_initial_state
from neobee.storage import session as storage


async def deep_research(state: NeobeeState) -> dict:
    print("  [research] Starting...")
    r = await run_research_agent(state["topic"], state.get("additional_info", ""), state.get("language"),
                                  state["expert_count"], state["round_count"])
    if r.get("error"): print(f"  [research] {r['error']}"); return {"error": r["error"]}
    sp = Path(state["session_path"])
    storage.write_research(sp, r["research_brief"], r.get("opportunity_map"))
    print(f"  [research] done")
    return {"research_brief": r["research_brief"], "opportunity_map": r.get("opportunity_map"), "error": None}


async def expert_creation(state: NeobeeState) -> dict:
    print("  [experts] Starting...")
    brief, opp = state.get("research_brief"), state.get("opportunity_map")
    if not brief: return {"error": "Brief required"}
    opp_text = "\n".join(f"- {a.name}: {a.description}" for a in opp.areas) if opp and opp.areas else "None"
    r = await run_expert_agent(state["topic"], brief, opp_text, state["expert_count"], state.get("language"))
    if r.get("error"): print(f"  [experts] {r['error']}"); return {"error": r["error"]}
    sp = Path(state["session_path"])
    storage.write_experts(sp, r["experts"])
    print(f"  [experts] {len(r['experts'])} experts saved")
    return {"experts": r["experts"], "error": None}


async def insight_refinement(state: NeobeeState) -> dict:
    print("  [insight] Starting...")
    brief, experts, opp = state.get("research_brief"), state.get("experts", []), state.get("opportunity_map")
    if not brief or not experts: return {"error": "Brief and experts required"}
    opp_text = "\n".join(f"- {a.name}: {a.description}" for a in opp.areas) if opp and opp.areas else "None"
    r = await run_insight_agent(state["topic"], brief, experts, state["round_count"],
                                 state.get("language"), opp_text,
                                 opp.cross_area_synergies if opp else None)
    if r.get("error"): print(f"  [insight] {r['error']}"); return {"error": r["error"]}
    sp = Path(state["session_path"])
    storage.write_insights(sp, r["rounds"], experts)
    print(f"  [insight] done")
    return {"rounds": r["rounds"], "error": None}


async def idea_synthesis(state: NeobeeState) -> dict:
    print("  [ideas] Starting...")
    brief, rounds, opp = state.get("research_brief"), state.get("rounds", []), state.get("opportunity_map")
    if not brief or not rounds: return {"error": "Brief and insights required"}
    insights_text = "\n\n".join(f"Expert {ins.expert_id[:8]} (R{ins.round}): {ins.insight}\nRationale: {ins.rationale}"
                                for sr in rounds for ins in sr.insights)
    opp_text = "\n".join(f"- {a.name}: {a.description}" for a in opp.areas) if opp and opp.areas else "None"
    r = await run_idea_agent(state["topic"], brief, insights_text, opp_text,
                              language=state.get("language"))
    if r.get("error"): print(f"  [ideas] {r['error']}"); return {"error": r["error"]}
    sp = Path(state["session_path"])
    storage.write_ideas(sp, r["ideas"])
    print(f"  [ideas] {len(r['ideas'])} ideas saved")
    return {"ideas": r["ideas"], "error": None}


def _route(state):
    return "err" if state.get("error") else "ok"


async def run_pipeline(session_path: str, meta: SessionMeta) -> NeobeeState:
    graph = StateGraph(NeobeeState)
    graph.add_node("research", deep_research)
    graph.add_node("experts", expert_creation)
    graph.add_node("insight", insight_refinement)
    graph.add_node("ideas", idea_synthesis)
    graph.set_entry_point("research")
    for cur, nxt in [("research", "experts"), ("experts", "insight"), ("insight", "ideas"), ("ideas", END)]:
        graph.add_conditional_edges(cur, _route, {"ok": nxt, "err": END})
    return await graph.compile().ainvoke(make_initial_state(session_path, meta))