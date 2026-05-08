-- System-level tables

CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY,
  topic TEXT NOT NULL,
  round_count INTEGER NOT NULL DEFAULT 3,
  expert_count INTEGER NOT NULL DEFAULT 5,
  additional_info TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL DEFAULT 'en',
  status TEXT NOT NULL DEFAULT 'created',
  current_stage TEXT NOT NULL DEFAULT 'topic_intake',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS session_event (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  type TEXT NOT NULL,
  stage TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (session_id) REFERENCES session(id)
);

CREATE TABLE IF NOT EXISTS session_error (
  session_id TEXT NOT NULL UNIQUE,
  errors TEXT NOT NULL DEFAULT '[]',
  FOREIGN KEY (session_id) REFERENCES session(id)
);
