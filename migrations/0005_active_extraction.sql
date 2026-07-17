PRAGMA foreign_keys = ON;

ALTER TABLE sources
  ADD COLUMN active_extraction_run_id TEXT REFERENCES extraction_runs(id) ON DELETE RESTRICT;

CREATE INDEX sources_active_extraction_idx
  ON sources (active_extraction_run_id);
