-- Deep Research stage tables

CREATE TABLE IF NOT EXISTS deep_research_data (
  session_id TEXT NOT NULL UNIQUE,
  topic_frame TEXT NOT NULL,
  key_facts TEXT NOT NULL DEFAULT '[]',
  open_questions TEXT NOT NULL DEFAULT '[]',
  signals TEXT NOT NULL DEFAULT '[]',
  source_refs TEXT NOT NULL DEFAULT '[]',
  FOREIGN KEY (session_id) REFERENCES session(id)
);

CREATE TABLE IF NOT EXISTS deep_research_task (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  progress INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES session(id)
);

CREATE TABLE IF NOT EXISTS deep_research_step (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  name TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES deep_research_task(id)
);
