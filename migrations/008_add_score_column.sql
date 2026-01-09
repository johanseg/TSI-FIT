-- Migration: Add score column to lead_enrichments table
-- Purpose: Store Score__c value (0-5) alongside fit_score (0-100)
-- Date: 2026-01-09

-- Add score column (nullable integer 0-5)
ALTER TABLE lead_enrichments
ADD COLUMN IF NOT EXISTS score INTEGER;

-- Add comment explaining the column
COMMENT ON COLUMN lead_enrichments.score IS 'Score__c value (0-5) calculated from fit_score. Only populated for Facebook/TikTok/Google leads.';

-- Add check constraint to ensure score is between 0 and 5
ALTER TABLE lead_enrichments
ADD CONSTRAINT score_range_check CHECK (score IS NULL OR (score >= 0 AND score <= 5));
