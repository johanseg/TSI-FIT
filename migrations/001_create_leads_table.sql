-- Create leads table
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id TEXT NOT NULL,
  salesforce_lead_id TEXT,
  business_name TEXT NOT NULL,
  website TEXT,
  phone TEXT,
  email TEXT,
  utm_source TEXT,
  fbclid TEXT,
  gclid TEXT,
  ttclid TEXT,
  raw_payload JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index on lead_id for lookups
CREATE INDEX IF NOT EXISTS idx_leads_lead_id ON leads(lead_id);

-- Create index on salesforce_lead_id for Salesforce lookups
CREATE INDEX IF NOT EXISTS idx_leads_salesforce_lead_id ON leads(salesforce_lead_id) WHERE salesforce_lead_id IS NOT NULL;

-- Create index on created_at for time-based queries
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

