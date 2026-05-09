CREATE TABLE IF NOT EXISTS stage_task (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  stage TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  progress INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_stage_task_session_stage ON stage_task(session_id, stage);

CREATE TABLE IF NOT EXISTS stage_step (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  stage TEXT NOT NULL,
  name TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES stage_task(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_stage_step_task ON stage_step(task_id);