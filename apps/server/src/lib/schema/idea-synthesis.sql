-- Idea Synthesis stage tables

CREATE TABLE IF NOT EXISTS idea_synthesis_data (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  title TEXT NOT NULL,
  thesis TEXT NOT NULL,
  supporting_insights TEXT NOT NULL DEFAULT '[]',
  why_now TEXT NOT NULL,
  target_user TEXT NOT NULL,
  core_mechanism TEXT NOT NULL,
  risks TEXT NOT NULL DEFAULT '[]',
  total_score INTEGER NOT NULL DEFAULT 0,
  controversy_label TEXT,
  FOREIGN KEY (session_id) REFERENCES session(id)
);

CREATE TABLE IF NOT EXISTS idea_synthesis_task (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  progress INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES session(id)
);

CREATE TABLE IF NOT EXISTS idea_synthesis_step (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  name TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES idea_synthesis_task(id)
);
