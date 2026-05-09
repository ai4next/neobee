-- Idea Synthesis stage tables
CREATE TABLE IF NOT EXISTS idea_synthesis_data (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  title TEXT NOT NULL,
  thesis TEXT NOT NULL,
  why_now TEXT NOT NULL,
  target_user TEXT NOT NULL,
  core_mechanism TEXT NOT NULL,
  risks TEXT NOT NULL DEFAULT '[]',
  total_score INTEGER NOT NULL DEFAULT 0,
  controversy_label TEXT,
  FOREIGN KEY (session_id) REFERENCES session(id)
);