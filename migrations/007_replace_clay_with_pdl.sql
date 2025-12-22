-- Migration: Replace Clay with People Data Labs (PDL) for company enrichment
-- PDL provides: years in business, employee count, industry, NAICS, size, revenue, HQ location

-- Add pdl_data column for People Data Labs enrichment data
ALTER TABLE lead_enrichments
ADD COLUMN IF NOT EXISTS pdl_data JSONB;

-- Add comment explaining the data structure
COMMENT ON COLUMN lead_enrichments.pdl_data IS 'People Data Labs Company Enrichment data: years_in_business, employee_count, size_range, industry, naics_codes, inferred_revenue, headquarters';

-- Keep clay_data column for backwards compatibility with existing records
-- (no need to drop it - existing records may still reference it)
COMMENT ON COLUMN lead_enrichments.clay_data IS 'DEPRECATED: Legacy Clay enrichment data. New records use pdl_data.';

-- Update enrichment_status check constraint to include new statuses
ALTER TABLE lead_enrichments
DROP CONSTRAINT IF EXISTS lead_enrichments_enrichment_status_check;

ALTER TABLE lead_enrichments
ADD CONSTRAINT lead_enrichments_enrichment_status_check
CHECK (enrichment_status IN ('pending', 'success', 'partial', 'failed', 'completed', 'no_data'));
