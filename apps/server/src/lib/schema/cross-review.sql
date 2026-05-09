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
  FOREIGN KEY (session_id) REFERENCES session(id)
);