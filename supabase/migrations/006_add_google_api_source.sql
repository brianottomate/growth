-- Add 'google_api' to the data_source CHECK constraint.
-- Google Ads API integration uses data-driven attribution (already in attribution CHECK).

ALTER TABLE channel_snapshots DROP CONSTRAINT IF EXISTS channel_snapshots_data_source_check;
ALTER TABLE channel_snapshots ADD CONSTRAINT channel_snapshots_data_source_check
  CHECK (data_source IN ('bigquery', 'meta_api', 'google_api', 'fixed_cost', 'manual'));
