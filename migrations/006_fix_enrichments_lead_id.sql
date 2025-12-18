-- Migration: Fix lead_enrichments lead_id column to support Salesforce Lead IDs
-- The original schema required lead_id to be a UUID referencing the leads table,
-- but when enriching directly from Salesforce, we only have the Salesforce Lead ID.

-- Step 1: Add salesforce_lead_id column for storing Salesforce Lead IDs
ALTER TABLE lead_enrichments
ADD COLUMN IF NOT EXISTS salesforce_lead_id TEXT;

-- Step 2: Make lead_id nullable (for enrichments from Salesforce that don't have local lead records)
ALTER TABLE lead_enrichments
ALTER COLUMN lead_id DROP NOT NULL;

-- Step 3: Drop the foreign key constraint (if it exists)
ALTER TABLE lead_enrichments
DROP CONSTRAINT IF EXISTS lead_enrichments_lead_id_fkey;

-- Step 4: Add index on salesforce_lead_id for lookups
CREATE INDEX IF NOT EXISTS idx_enrichments_salesforce_lead_id
ON lead_enrichments(salesforce_lead_id)
WHERE salesforce_lead_id IS NOT NULL;

-- Step 5: Add check constraint to ensure at least one ID is provided
ALTER TABLE lead_enrichments
ADD CONSTRAINT chk_enrichments_has_lead_id
CHECK (lead_id IS NOT NULL OR salesforce_lead_id IS NOT NULL);

-- Add enrichment_status value 'completed' to the check constraint
-- First drop the old constraint, then add a new one with all valid values
ALTER TABLE lead_enrichments DROP CONSTRAINT IF EXISTS lead_enrichments_enrichment_status_check;
ALTER TABLE lead_enrichments ADD CONSTRAINT lead_enrichments_enrichment_status_check
CHECK (enrichment_status IN ('pending', 'success', 'partial', 'failed', 'completed', 'no_data'));

COMMENT ON COLUMN lead_enrichments.salesforce_lead_id IS 'Salesforce Lead ID (18-char) for enrichments triggered from Salesforce';
