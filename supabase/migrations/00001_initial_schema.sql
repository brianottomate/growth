-- ============================================
-- WANDER GROWTH TRACKER DATABASE SCHEMA
-- ============================================
-- Run this migration in Supabase SQL Editor
-- or via Supabase CLI: supabase db push
-- ============================================

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to check if user email is from @wander.com domain
CREATE OR REPLACE FUNCTION is_wander_email()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    SELECT email LIKE '%@wander.com'
    FROM auth.users
    WHERE id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- USERS TABLE
-- ============================================
-- Stores Wander employee info (extends auth.users)

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255),
  avatar_url TEXT,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraint: email must end with @wander.com
  CONSTRAINT users_email_domain CHECK (email LIKE '%@wander.com')
);

-- NOTE: When inserting, always set id = auth.uid() to match RLS policies
-- Example: INSERT INTO users (id, email, name) VALUES (auth.uid(), 'user@wander.com', 'Name')

-- Index for email lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Trigger for updated_at
CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Users can only see their own record
CREATE POLICY users_select_own ON users
  FOR SELECT USING (
    auth.uid()::text = id::text
    AND is_wander_email()
  );

-- Users can only insert their own record
CREATE POLICY users_insert_own ON users
  FOR INSERT WITH CHECK (
    auth.uid()::text = id::text
    AND is_wander_email()
  );

-- Users can only update their own record
CREATE POLICY users_update_own ON users
  FOR UPDATE USING (
    auth.uid()::text = id::text
    AND is_wander_email()
  );

-- ============================================
-- SYNC_LOGS TABLE
-- ============================================
-- History of data refresh operations

CREATE TABLE IF NOT EXISTS sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'success', 'partial_failure', 'failed')),
  trigger VARCHAR(20) NOT NULL
    CHECK (trigger IN ('scheduled', 'manual', 'api')),
  results JSONB DEFAULT '{}',
  duration_ms INTEGER,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for recent syncs query
CREATE INDEX IF NOT EXISTS idx_sync_logs_started_at ON sync_logs(started_at DESC);

-- Index for status filtering
CREATE INDEX IF NOT EXISTS idx_sync_logs_status ON sync_logs(status);

-- RLS
ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;

-- All authenticated @wander.com users can read sync logs
CREATE POLICY sync_logs_select_all ON sync_logs
  FOR SELECT USING (is_wander_email());

-- Only service role can insert/update sync logs
-- (No insert/update policies for regular users - handled by service role)

-- ============================================
-- CHANNEL_SNAPSHOTS TABLE
-- ============================================
-- Cached channel metrics from BigQuery

CREATE TABLE IF NOT EXISTS channel_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel VARCHAR(50) NOT NULL,
  date DATE NOT NULL,
  spend DECIMAL(12,2),
  account_creations INTEGER,
  checkout_previewed INTEGER,
  checkout_started INTEGER,
  bookings INTEGER,
  gmv DECIMAL(12,2),
  clicks INTEGER,
  impressions INTEGER,
  attribution VARCHAR(50)
    CHECK (attribution IN ('first_partner', 'view_click', 'data_driven', 'last_click')),
  data_source VARCHAR(50) NOT NULL
    CHECK (data_source IN ('bigquery', 'fixed_cost', 'manual')),
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One snapshot per channel per day
  UNIQUE(channel, date)
);

-- Index for channel + date lookups
CREATE INDEX IF NOT EXISTS idx_snapshots_channel_date ON channel_snapshots(channel, date);

-- Index for recent data queries
CREATE INDEX IF NOT EXISTS idx_snapshots_date ON channel_snapshots(date DESC);

-- Index for synced_at (data freshness)
CREATE INDEX IF NOT EXISTS idx_snapshots_synced_at ON channel_snapshots(synced_at DESC);

-- RLS
ALTER TABLE channel_snapshots ENABLE ROW LEVEL SECURITY;

-- All authenticated @wander.com users can read channel snapshots
CREATE POLICY snapshots_select_all ON channel_snapshots
  FOR SELECT USING (is_wander_email());

-- Only service role can insert/update/delete snapshots
-- (No write policies for regular users - handled by service role during sync)

-- ============================================
-- ASK_CLAUDE_CONVERSATIONS TABLE
-- ============================================
-- Store Ask Claude conversation history per user

CREATE TABLE IF NOT EXISTS ask_claude_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  messages JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for user's conversations
CREATE INDEX IF NOT EXISTS idx_ask_claude_user ON ask_claude_conversations(user_id);

-- Index for recent conversations
CREATE INDEX IF NOT EXISTS idx_ask_claude_updated ON ask_claude_conversations(updated_at DESC);

-- Trigger for updated_at
CREATE TRIGGER ask_claude_conversations_updated_at
  BEFORE UPDATE ON ask_claude_conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE ask_claude_conversations ENABLE ROW LEVEL SECURITY;

-- Users can only see their own conversations
CREATE POLICY ask_claude_select_own ON ask_claude_conversations
  FOR SELECT USING (
    auth.uid()::text = user_id::text
    AND is_wander_email()
  );

-- Users can only insert their own conversations
CREATE POLICY ask_claude_insert_own ON ask_claude_conversations
  FOR INSERT WITH CHECK (
    auth.uid()::text = user_id::text
    AND is_wander_email()
  );

-- Users can only update their own conversations
CREATE POLICY ask_claude_update_own ON ask_claude_conversations
  FOR UPDATE USING (
    auth.uid()::text = user_id::text
    AND is_wander_email()
  );

-- Users can only delete their own conversations
CREATE POLICY ask_claude_delete_own ON ask_claude_conversations
  FOR DELETE USING (
    auth.uid()::text = user_id::text
    AND is_wander_email()
  );

-- ============================================
-- GRANT PERMISSIONS
-- ============================================
-- Ensure authenticated users can access tables (RLS handles row-level access)

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Service role has full access (for cron jobs, data sync)
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
