-- ============================================
-- ADD MISSING COLUMNS TO CHANNEL_SNAPSHOTS
-- ============================================
-- Fixes pipeline gap: BigQuery returns points_used, coupon_off,
-- take_rate_revenue, direct/ota bookings, and efficiency metrics
-- but they were never stored in the cache table.
--
-- Also fixes data_source CHECK to allow 'meta_api' (Meta Ads API integration).
--
-- Run in Supabase SQL Editor or via: supabase db push
-- ============================================

-- Cost breakdown columns (from bookings_reconciled_v2)
ALTER TABLE channel_snapshots
  ADD COLUMN IF NOT EXISTS points_used DECIMAL(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coupon_off DECIMAL(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS take_rate_revenue DECIMAL(12,2) DEFAULT 0;

-- Booking type columns (from bookings_reconciled_v2 native flags)
ALTER TABLE channel_snapshots
  ADD COLUMN IF NOT EXISTS direct_bookings INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ota_bookings INTEGER DEFAULT 0;

-- Efficiency metrics (calculated in mapper)
ALTER TABLE channel_snapshots
  ADD COLUMN IF NOT EXISTS cpac DECIMAL(12,4),
  ADD COLUMN IF NOT EXISTS cpcp DECIMAL(12,4),
  ADD COLUMN IF NOT EXISTS cpc DECIMAL(12,4),
  ADD COLUMN IF NOT EXISTS cpb DECIMAL(12,4),
  ADD COLUMN IF NOT EXISTS roas DECIMAL(12,6);

-- Timestamp for cache freshness
ALTER TABLE channel_snapshots
  ADD COLUMN IF NOT EXISTS last_updated TIMESTAMPTZ DEFAULT NOW();

-- Fix data_source CHECK to include 'meta_api'
ALTER TABLE channel_snapshots DROP CONSTRAINT IF EXISTS channel_snapshots_data_source_check;
ALTER TABLE channel_snapshots ADD CONSTRAINT channel_snapshots_data_source_check
  CHECK (data_source IN ('bigquery', 'meta_api', 'fixed_cost', 'manual'));
