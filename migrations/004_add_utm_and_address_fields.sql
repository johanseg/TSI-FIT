-- Migration: Add UTM fields and address to leads table
-- These fields capture additional marketing attribution and location data

-- Add new columns to leads table
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS utm_campaign TEXT,
ADD COLUMN IF NOT EXISTS utm_content TEXT,
ADD COLUMN IF NOT EXISTS utm_term TEXT,
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS city TEXT,
ADD COLUMN IF NOT EXISTS state TEXT,
ADD COLUMN IF NOT EXISTS zip TEXT;

-- Create index on utm_campaign for marketing analysis
CREATE INDEX IF NOT EXISTS idx_leads_utm_campaign ON leads(utm_campaign) WHERE utm_campaign IS NOT NULL;

-- Comments explaining the fields
COMMENT ON COLUMN leads.utm_campaign IS 'UTM Campaign parameter from marketing attribution';
COMMENT ON COLUMN leads.utm_content IS 'UTM Content parameter from marketing attribution';
COMMENT ON COLUMN leads.utm_term IS 'UTM Term parameter from marketing attribution';
COMMENT ON COLUMN leads.address IS 'Business street address';
COMMENT ON COLUMN leads.city IS 'Business city';
COMMENT ON COLUMN leads.state IS 'Business state';
COMMENT ON COLUMN leads.zip IS 'Business zip code';
