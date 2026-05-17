"""Shared utilities for deep agents."""

from __future__ import annotations

import json
from typing import Any, Optional


def extract_json(text: str) -> Optional[dict[str, Any]]:
    """Extract JSON from text — tries raw parse, then ```json block, then balanced {}."""
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    for tag in ("```json", "```"):
        start = text.find(tag)
        if start >= 0:
            end = text.find("```", start + len(tag))
            if end >= 0:
                try:
                    return json.loads(text[start + len(tag):end].strip())
                except json.JSONDecodeError:
                    pass
    brace_start = text.find("{")
    if brace_start >= 0:
        depth = 0
        for i in range(brace_start, len(text)):
            depth += (text[i] == "{") - (text[i] == "}")
            if depth == 0:
                try:
                    return json.loads(text[brace_start:i + 1])
                except json.JSONDecodeError:
                    break
    return None