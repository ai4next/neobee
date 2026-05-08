-- Cross Review stage tables

CREATE TABLE IF NOT EXISTS cross_review_data (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  insight_id TEXT NOT NULL,
  reviewer_expert_id TEXT NOT NULL,
  novelty INTEGER NOT NULL,
  usefulness INTEGER NOT NULL,
  feasibility INTEGER NOT NULL,
  evidence_strength INTEGER NOT NULL,
  cross_domain_leverage INTEGER NOT NULL,
  risk_awareness INTEGER NOT NULL,
  comment TEXT NOT NULL,
  objection_level TEXT NOT NULL DEFAULT 'medium',
  FOREIGN KEY (session_id) REFERENCES session(id)
);

CREATE TABLE IF NOT EXISTS cross_review_task (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  progress INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES session(id)
);

CREATE TABLE IF NOT EXISTS cross_review_step (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  name TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES cross_review_task(id)
);
