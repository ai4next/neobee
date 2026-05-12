from __future__ import annotations

import json
import os
import time
from functools import lru_cache
from pathlib import Path
from typing import Optional

from pydantic import BaseModel, Field

# Config file location
CONFIG_DIR = Path(os.environ.get("NEOBEE_DATA_DIR", Path.home() / ".neobee"))
CONFIG_PATH = CONFIG_DIR / "neobee.json"
CACHE_TTL_MS = 5000


class StageProvider(BaseModel):
    stage: str = "default"
    provider: str = "anthropic"
    model: str = "claude-sonnet-4-7"
    temperature: float = 0.7
    api_key: Optional[str] = None
    base_url: Optional[str] = None


class NeobeeConfig(BaseModel):
    providers: list[StageProvider] = Field(default_factory=lambda: [
        StageProvider(stage="default", provider="anthropic", model="claude-sonnet-4-7", temperature=0.7),
    ])
    search_provider: str = "llm"
    search_api_key: Optional[str] = None


def _ensure_config_dir() -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)


def _load_config_raw() -> dict:
    _ensure_config_dir()
    if CONFIG_PATH.exists():
        raw = CONFIG_PATH.read_text(encoding="utf-8")
        return json.loads(raw) if raw.strip() else {}
    return {}


_cache_data: dict = {}
_cache_time: float = 0.0


def get_config() -> NeobeeConfig:
    """Read config with TTL cache (5s)."""
    global _cache_data, _cache_time
    now = time.time() * 1000
    if not _cache_data or (now - _cache_time) > CACHE_TTL_MS:
        raw = _load_config_raw()
        _cache_data = raw
        _cache_time = now
    return NeobeeConfig(**_cache_data)


def save_config(config: NeobeeConfig) -> None:
    """Persist config and invalidate cache."""
    global _cache_data, _cache_time
    _ensure_config_dir()
    raw = config.model_dump(mode="json")
    CONFIG_PATH.write_text(json.dumps(raw, indent=2, ensure_ascii=False), encoding="utf-8")
    _cache_data = raw
    _cache_time = time.time() * 1000


def get_provider_for_stage(stage: str) -> StageProvider:
    """Find the matching provider config for a pipeline stage, falling back to 'default'."""
    config = get_config()
    for p in config.providers:
        if p.stage == stage:
            return p
    for p in config.providers:
        if p.stage == "default":
            return p
    return StageProvider()