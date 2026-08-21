CREATE TABLE IF NOT EXISTS cloud_saves (
  key_hash TEXT PRIMARY KEY,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  protocol_version INTEGER NOT NULL,
  slot_format_version INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  previous_revision INTEGER,
  previous_payload_json TEXT,
  previous_updated_at TEXT
);
