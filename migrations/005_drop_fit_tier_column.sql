-- Migration: Drop fit_tier column from lead_enrichments table
-- This column is no longer used after removing the tier classification system

ALTER TABLE lead_enrichments
DROP COLUMN IF EXISTS fit_tier;
