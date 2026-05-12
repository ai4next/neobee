from __future__ import annotations

from datetime import datetime, timezone
from typing import Callable, Optional

from neobee.core import db as db_module

ProgressCallback = Callable[[str, str, dict], None]


class TaskTracker:
    """Tracks pipeline task progress with SQLite persistence."""

    def __init__(self, progress_callback: Optional[ProgressCallback] = None):
        self.active_tasks: dict[str, int] = {}
        self._progress_callback = progress_callback

    def set_progress_listener(self, callback: ProgressCallback) -> None:
        self._progress_callback = callback

    def create_task(self, session_id: str, stage: str) -> int:
        task_id = db_module.create_task(session_id, stage)
        key = f"{session_id}:{stage}"
        self.active_tasks[key] = task_id
        self._emit_progress(session_id, stage, task_id, "running", 0)
        return task_id

    def create_step(self, task_id: int, stage: str, name: str, data: Optional[dict] = None) -> int:
        return db_module.create_step(task_id, stage, name, data)

    def update_progress(self, session_id: str, stage: str, task_id: int, progress: int, step_name: Optional[str] = None, step_data: Optional[dict] = None) -> None:
        db_module.update_task_progress(task_id, progress, "running")
        if step_name:
            self.create_step(task_id, stage, step_name, step_data)
        self._emit_progress(session_id, stage, task_id, "running", progress, step_name, step_data)

    def complete_task(self, session_id: str, stage: str, task_id: int) -> None:
        db_module.update_task_progress(task_id, 100, "completed")
        key = f"{session_id}:{stage}"
        self.active_tasks.pop(key, None)
        self._emit_progress(session_id, stage, task_id, "completed", 100)

    def fail_task(self, session_id: str, stage: str, task_id: int, error: str) -> None:
        db_module.update_task_progress(task_id, 0, "failed")
        key = f"{session_id}:{stage}"
        self.active_tasks.pop(key, None)
        self._emit_progress(session_id, stage, task_id, "failed", 0, error=error)

    def _emit_progress(self, session_id: str, stage: str, task_id: int, status: str, progress: int,
                       step_name: Optional[str] = None, step_data: Optional[dict] = None,
                       error: Optional[str] = None) -> None:
        if self._progress_callback:
            self._progress_callback(session_id, stage, {
                "task_id": str(task_id),
                "status": status,
                "progress": progress,
                "current_step": {"name": step_name, "data": step_data} if step_name else None,
                "error": error,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            })