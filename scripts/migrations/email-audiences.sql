-- Additive migration. Run in the target database's application search_path.
CREATE TABLE IF NOT EXISTS email_audience (
  id text PRIMARY KEY, brand_id text NOT NULL REFERENCES public.brand(id) ON DELETE CASCADE,
  name text NOT NULL, definition jsonb NOT NULL, revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_audience_brand_idx ON email_audience(brand_id);
CREATE TABLE IF NOT EXISTS email_audience_snapshot (
  id text PRIMARY KEY, audience_id text NOT NULL REFERENCES email_audience(id) ON DELETE CASCADE,
  revision integer NOT NULL, definition jsonb NOT NULL, query_sql text NOT NULL, query_hash text NOT NULL,
  job_id text NOT NULL, table_id text NOT NULL, status text NOT NULL DEFAULT 'compiling',
  recipient_count integer, error text, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_audience_snapshot_audience_idx ON email_audience_snapshot(audience_id,created_at);
