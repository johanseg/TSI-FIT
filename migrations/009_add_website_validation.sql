-- Migration 009: Add website validation data column
-- Adds JSONB column to store website validation results including domain age
-- Used for caching validation results to avoid repeated WHOIS lookups

-- Add website_validation_data column
ALTER TABLE lead_enrichments
ADD COLUMN website_validation_data JSONB;

-- Create GIN index for fast cache lookups by URL
CREATE INDEX idx_enrichments_website_validation_url
ON lead_enrichments
USING gin ((website_validation_data->>'url'));

-- Add comment for documentation
COMMENT ON COLUMN lead_enrichments.website_validation_data IS
'Cached website validation results including URL existence check, domain age from WHOIS, and response time. TTL: 30 days.';
