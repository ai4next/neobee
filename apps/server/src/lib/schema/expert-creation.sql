-- Expert Creation stage tables
CREATE TABLE IF NOT EXISTS expert_creation_data (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  name TEXT NOT NULL,
  domain TEXT NOT NULL,
  persona_style TEXT NOT NULL,
  stance TEXT NOT NULL,
  skills TEXT NOT NULL DEFAULT '[]',
  FOREIGN KEY (session_id) REFERENCES session(id)
);