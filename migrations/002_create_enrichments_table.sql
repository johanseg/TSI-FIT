-- Create lead_enrichments table
CREATE TABLE IF NOT EXISTS lead_enrichments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  job_id TEXT NOT NULL,
  enrichment_status TEXT NOT NULL CHECK (enrichment_status IN ('pending', 'success', 'partial', 'failed')),
  google_places_data JSONB,
  clay_data JSONB,
  website_tech_data JSONB,
  fit_score INTEGER CHECK (fit_score >= 0 AND fit_score <= 100),
  fit_tier TEXT CHECK (fit_tier IN ('Disqualified', 'MQL', 'High Fit', 'Premium')),
  score_breakdown JSONB,
  salesforce_updated BOOLEAN DEFAULT FALSE,
  salesforce_updated_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index on lead_id for lookups
CREATE INDEX IF NOT EXISTS idx_enrichments_lead_id ON lead_enrichments(lead_id);

-- Create index on job_id for queue tracking
CREATE INDEX IF NOT EXISTS idx_enrichments_job_id ON lead_enrichments(job_id);

-- Create index on enrichment_status for filtering
CREATE INDEX IF NOT EXISTS idx_enrichments_status ON lead_enrichments(enrichment_status);

-- Create index on fit_score for scoring queries
CREATE INDEX IF NOT EXISTS idx_enrichments_fit_score ON lead_enrichments(fit_score) WHERE fit_score IS NOT NULL;

-- Create index on created_at for time-based queries
CREATE INDEX IF NOT EXISTS idx_enrichments_created_at ON lead_enrichments(created_at);

-- Create trigger to update updated_at timestamp
CREATE TRIGGER update_enrichments_updated_at BEFORE UPDATE ON lead_enrichments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

