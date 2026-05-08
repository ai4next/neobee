-- Graph Build stage tables

CREATE TABLE IF NOT EXISTS graph_build_data (
  session_id TEXT NOT NULL UNIQUE,
  nodes TEXT NOT NULL DEFAULT '[]',
  edges TEXT NOT NULL DEFAULT '[]',
  FOREIGN KEY (session_id) REFERENCES session(id)
);

CREATE TABLE IF NOT EXISTS graph_build_task (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  progress INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES session(id)
);

CREATE TABLE IF NOT EXISTS graph_build_step (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  name TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES graph_build_task(id)
);
