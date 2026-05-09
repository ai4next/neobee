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