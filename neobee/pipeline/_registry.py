from __future__ import annotations

from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from neobee.pipeline.graph import Orchestrator
    from neobee.pipeline.task_tracker import TaskTracker

# Module-level Orchestrator reference — avoids putting non-serializable objects in LangGraph state
_current_orch: Optional["Orchestrator"] = None


def _set_current_orch(orch: "Orchestrator") -> None:
    global _current_orch
    _current_orch = orch


def _get_tracker() -> Optional["TaskTracker"]:
    if _current_orch is not None:
        return _current_orch.tracker
    return None