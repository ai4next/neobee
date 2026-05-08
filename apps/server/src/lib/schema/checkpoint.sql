-- Session checkpoint for pause/resume support

CREATE TABLE IF NOT EXISTS session_checkpoint (
  session_id TEXT NOT NULL UNIQUE,
  completed_stages TEXT NOT NULL DEFAULT '[]',
  current_stage TEXT,
  stage_progress INTEGER NOT NULL DEFAULT 0,
  research_brief TEXT,
  experts TEXT,
  rounds TEXT,
  reviews TEXT,
  ideas TEXT,
  graph TEXT,
  insight_cursor TEXT,
  FOREIGN KEY (session_id) REFERENCES session(id)
);