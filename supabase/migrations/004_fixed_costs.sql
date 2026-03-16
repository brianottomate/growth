-- Fixed Costs Table
-- Stores monthly fixed marketing costs not captured in BigQuery
-- (TV, Lifecycle, Demand Sales, Direct Mail, Affiliate, SEO, etc.)

CREATE TABLE IF NOT EXISTS fixed_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category VARCHAR(50) NOT NULL CHECK (category IN (
    'tv_linear', 'tv_streaming', 'lifecycle', 'demand_sales',
    'direct_mail', 'affiliate', 'seo', 'events', 'content', 'other'
  )),
  partner VARCHAR(255),
  monthly_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One entry per category (singleton pattern for simplicity)
  UNIQUE(category)
);

-- Index for category lookup
CREATE INDEX IF NOT EXISTS idx_fixed_costs_category ON fixed_costs(category);

-- Trigger for updated_at
CREATE TRIGGER update_fixed_costs_updated_at
  BEFORE UPDATE ON fixed_costs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE fixed_costs ENABLE ROW LEVEL SECURITY;

-- All authenticated @wander.com users can read fixed costs
CREATE POLICY fixed_costs_select_all ON fixed_costs
  FOR SELECT USING (is_wander_email());

-- All authenticated @wander.com users can insert fixed costs
CREATE POLICY fixed_costs_insert ON fixed_costs
  FOR INSERT WITH CHECK (is_wander_email());

-- All authenticated @wander.com users can update fixed costs
CREATE POLICY fixed_costs_update ON fixed_costs
  FOR UPDATE USING (is_wander_email());

-- Insert default values for known fixed cost categories
-- (Based on Wander's actual fixed costs from spreadsheet)
INSERT INTO fixed_costs (category, partner, monthly_amount) VALUES
  ('tv_linear', 'Comcast', 10581.00),
  ('lifecycle', 'Customer.io', 13500.00),
  ('demand_sales', 'BDRs (4)', 36842.00),
  ('direct_mail', 'PebblePost', 17134.00),
  ('affiliate', 'Acceleration Partners', 8797.00),
  ('seo', 'Digitaloft', 27871.00)
ON CONFLICT (category) DO NOTHING;
