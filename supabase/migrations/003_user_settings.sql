-- User Settings Table
-- Stores per-user preferences for the Growth Tracker

CREATE TABLE IF NOT EXISTS user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_insights_digest BOOLEAN DEFAULT true,
  email_cpb_alert BOOLEAN DEFAULT false,
  default_date_range VARCHAR(10) DEFAULT '30',
  auto_refresh_interval VARCHAR(10) DEFAULT '60',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Index for user lookup
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);

-- RLS
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- Users can only access their own settings
CREATE POLICY user_settings_select ON user_settings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY user_settings_insert ON user_settings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY user_settings_update ON user_settings
  FOR UPDATE USING (auth.uid() = user_id);

-- Note: This trigger assumes update_updated_at_column() function exists from migration 002
-- If it doesn't exist, uncomment the following:
-- CREATE OR REPLACE FUNCTION update_updated_at_column()
-- RETURNS TRIGGER AS $$
-- BEGIN
--   NEW.updated_at = NOW();
--   RETURN NEW;
-- END;
-- $$ language 'plpgsql';

-- Trigger for updated_at
CREATE TRIGGER update_user_settings_updated_at
  BEFORE UPDATE ON user_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
