from __future__ import annotations

import asyncio
from typing import TypeVar

from neobee.models import ReviewScore

T = TypeVar("T")


async def _retry_llm(coro, retries: int = 2) -> T:
    """Retry an async LLM call with exponential backoff."""
    for attempt in range(retries + 1):
        try:
            return await coro
        except Exception:
            if attempt < retries:
                await asyncio.sleep(2**attempt)
            else:
                raise


def _aggregate_scores(reviews: list[ReviewScore]) -> dict[str, float]:
    """Group reviews by insight_id and return average dimension score (1-10) per insight."""
    scores: dict[str, list[float]] = {}
    for rev in reviews:
        avg = (rev.novelty + rev.usefulness + rev.feasibility +
               rev.evidence_strength + rev.cross_domain_leverage + rev.risk_awareness) / 6
        scores.setdefault(rev.insight_id, []).append(avg)
    return {iid: sum(v) / len(v) for iid, v in scores.items()}


def _aggregate_scores_sum(reviews: list[ReviewScore]) -> dict[str, float]:
    """Group reviews by insight_id and return average total score (out of 60) per insight."""
    scores: dict[str, list[float]] = {}
    for rev in reviews:
        total = (rev.novelty + rev.usefulness + rev.feasibility +
                 rev.evidence_strength + rev.cross_domain_leverage + rev.risk_awareness)
        scores.setdefault(rev.insight_id, []).append(total)
    return {iid: sum(v) / len(v) for iid, v in scores.items()}