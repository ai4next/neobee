-- Summary stage tables

CREATE TABLE IF NOT EXISTS summary_data (
  session_id TEXT NOT NULL UNIQUE,
  best_ideas TEXT NOT NULL DEFAULT '[]',
  controversial_ideas TEXT NOT NULL DEFAULT '[]',
  unresolved_questions TEXT NOT NULL DEFAULT '[]',
  executive_summary TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES session(id)
);

CREATE TABLE IF NOT EXISTS summary_task (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  progress INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES session(id)
);

CREATE TABLE IF NOT EXISTS summary_step (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  name TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES summary_task(id)
);
