ALTER TABLE raw_items
  ADD COLUMN IF NOT EXISTS effective_at TIMESTAMPTZ
  GENERATED ALWAYS AS (COALESCE(posted_at, collected_at)) STORED;

-- statement
CREATE INDEX CONCURRENTLY IF NOT EXISTS raw_items_project_id_idx ON raw_items(project_id, id);

-- statement
CREATE INDEX CONCURRENTLY IF NOT EXISTS raw_items_project_posted_id_idx ON raw_items(project_id, posted_at, id);

-- statement
CREATE INDEX CONCURRENTLY IF NOT EXISTS raw_items_project_effective_id_idx ON raw_items(project_id, effective_at DESC, id DESC);

-- statement
CREATE INDEX CONCURRENTLY IF NOT EXISTS raw_items_project_platform_effective_id_idx ON raw_items(project_id, platform, effective_at DESC, id DESC);

-- statement
CREATE INDEX CONCURRENTLY IF NOT EXISTS analysis_labels_sentiment_comment_idx ON analysis_labels(sentiment, comment_id);

-- statement
CREATE INDEX CONCURRENTLY IF NOT EXISTS analysis_entity_mentions_project_time_idx ON analysis_entity_mentions(project_id, posted_at, kind, canonical);

-- statement
DROP INDEX CONCURRENTLY IF EXISTS model_cache_lookup_idx;

-- statement
DROP INDEX CONCURRENTLY IF EXISTS raw_items_content_hash_idx;
-- statement
ALTER TABLE analysis_runs
  ALTER COLUMN progress SET DEFAULT '{"processed":0,"total":0,"reused":0,"stage":"queued"}'::jsonb;
