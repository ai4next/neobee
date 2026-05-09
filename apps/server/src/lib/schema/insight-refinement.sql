-- Insight Refinement stage tables
CREATE TABLE IF NOT EXISTS insight_refinement_data (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  round_number INTEGER NOT NULL,
  expert_id TEXT NOT NULL,
  insight TEXT NOT NULL,
  rationale TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES session(id)
);