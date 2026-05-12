from __future__ import annotations

from functools import lru_cache
from typing import Optional

from langchain_anthropic import ChatAnthropic
from langchain_core.language_models import BaseChatModel
from langchain_openai import ChatOpenAI

from neobee.core.config import get_config, get_provider_for_stage


@lru_cache(maxsize=32)
def _get_cached_llm(provider: str, model: str, temperature: float, api_key: str = "", base_url: str = "") -> BaseChatModel:
    key = api_key or None
    url = base_url or None
    if provider == "anthropic":
        return ChatAnthropic(
            model=model,
            temperature=temperature,
            api_key=key,
            base_url=url,
            thinking={"type": "disabled"},
        )
    elif provider in ("openai", "openrouter"):
        return ChatOpenAI(
            model=model,
            temperature=temperature,
            api_key=key,
            base_url=url,
        )
    else:
        return ChatAnthropic(
            model=model,
            temperature=temperature,
            api_key=key,
            base_url=url,
            thinking={"type": "disabled"},
        )


def get_llm(stage: str = "default") -> BaseChatModel:
    """Get a cached LLM instance configured for the given pipeline stage."""
    cfg = get_provider_for_stage(stage)
    return _get_cached_llm(
        provider=cfg.provider,
        model=cfg.model,
        temperature=cfg.temperature,
        api_key=cfg.api_key or "",
        base_url=cfg.base_url or "",
    )


def clear_llm_cache() -> None:
    _get_cached_llm.cache_clear()