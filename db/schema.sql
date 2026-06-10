CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  steam_app_id TEXT,
  reddit_subreddits JSONB NOT NULL DEFAULT '[]'::jsonb,
  reddit_keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_links JSONB NOT NULL DEFAULT '[]'::jsonb,
  version_windows JSONB NOT NULL DEFAULT '[]'::jsonb,
  entity_aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS raw_items (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  source_url TEXT,
  source_title TEXT,
  external_id TEXT,
  body TEXT NOT NULL,
  body_norm TEXT NOT NULL,
  author_hash TEXT,
  posted_at TIMESTAMPTZ,
  collected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  language TEXT,
  upvotes INTEGER,
  replies INTEGER,
  content_hash TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (project_id, platform, content_hash)
);

CREATE INDEX IF NOT EXISTS raw_items_project_posted_idx ON raw_items(project_id, posted_at DESC);
CREATE INDEX IF NOT EXISTS raw_items_project_platform_idx ON raw_items(project_id, platform);
CREATE INDEX IF NOT EXISTS raw_items_content_hash_idx ON raw_items(content_hash);
CREATE INDEX IF NOT EXISTS raw_items_body_fts_idx ON raw_items USING GIN (to_tsvector('simple', body_norm));

CREATE TABLE IF NOT EXISTS analysis_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  input JSONB NOT NULL,
  progress JSONB NOT NULL DEFAULT '{"processed":0,"total":0,"stage":"queued"}'::jsonb,
  report_id TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS analysis_runs_project_created_idx ON analysis_runs(project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS analysis_labels (
  id BIGSERIAL PRIMARY KEY,
  comment_id TEXT NOT NULL REFERENCES raw_items(id) ON DELETE CASCADE,
  sentiment TEXT NOT NULL,
  topic TEXT NOT NULL,
  intent TEXT NOT NULL,
  severity INTEGER NOT NULL,
  is_bug BOOLEAN NOT NULL,
  is_churn_risk BOOLEAN NOT NULL,
  entities JSONB NOT NULL DEFAULT '[]'::jsonb,
  confidence NUMERIC NOT NULL,
  rationale TEXT NOT NULL,
  model TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (comment_id)
);

CREATE INDEX IF NOT EXISTS analysis_labels_sentiment_idx ON analysis_labels(sentiment);
CREATE INDEX IF NOT EXISTS analysis_labels_topic_idx ON analysis_labels(topic);
CREATE INDEX IF NOT EXISTS analysis_labels_bug_idx ON analysis_labels(is_bug) WHERE is_bug = true;
CREATE INDEX IF NOT EXISTS analysis_labels_churn_idx ON analysis_labels(is_churn_risk) WHERE is_churn_risk = true;

CREATE TABLE IF NOT EXISTS topic_clusters (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  item_count INTEGER NOT NULL,
  sentiment TEXT NOT NULL,
  severity NUMERIC NOT NULL,
  summary TEXT NOT NULL,
  recommendation TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS topic_clusters_run_idx ON topic_clusters(run_id);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  markdown TEXT NOT NULL,
  summary JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reports_project_created_idx ON reports(project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS embedding_cache (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  embedding VECTOR(1536),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider, model, input_hash)
);

