-- Migration: Add Salesforce-aligned enrichment output fields
-- These fields map directly to existing Salesforce custom fields on the Lead object

-- Add new columns to lead_enrichments for Salesforce field outputs
ALTER TABLE lead_enrichments
ADD COLUMN IF NOT EXISTS has_website BOOLEAN,
ADD COLUMN IF NOT EXISTS number_of_employees TEXT CHECK (number_of_employees IN ('0', '1 - 2', '3 - 5', 'Over 5')),
ADD COLUMN IF NOT EXISTS number_of_gbp_reviews TEXT CHECK (number_of_gbp_reviews IN ('Under 15', 'Over 14')),
ADD COLUMN IF NOT EXISTS number_of_years_in_business TEXT CHECK (number_of_years_in_business IN ('Under 1 Year', '1 - 3 Years', '3 - 5 Years', '5 - 10+ years')),
ADD COLUMN IF NOT EXISTS has_gmb BOOLEAN,
ADD COLUMN IF NOT EXISTS gmb_url TEXT,
ADD COLUMN IF NOT EXISTS location_type TEXT CHECK (location_type IN ('Home Office', 'Physical Location (Office)', 'Retail Location (Store Front)')),
ADD COLUMN IF NOT EXISTS business_license BOOLEAN,
ADD COLUMN IF NOT EXISTS spending_on_marketing BOOLEAN;

-- Add indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_enrichments_has_gmb ON lead_enrichments(has_gmb) WHERE has_gmb IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_enrichments_spending_on_marketing ON lead_enrichments(spending_on_marketing) WHERE spending_on_marketing IS NOT NULL;

-- Comment explaining the field mappings
COMMENT ON COLUMN lead_enrichments.has_website IS 'Maps to Salesforce Has_Website__c - True if business has a website';
COMMENT ON COLUMN lead_enrichments.number_of_employees IS 'Maps to Salesforce Number_of_Employees__c - Picklist: 0, 1 - 2, 3 - 5, Over 5';
COMMENT ON COLUMN lead_enrichments.number_of_gbp_reviews IS 'Maps to Salesforce Number_of_GBP_Reviews__c - Picklist: Under 15, Over 14';
COMMENT ON COLUMN lead_enrichments.number_of_years_in_business IS 'Maps to Salesforce Number_of_Years_in_Business__c - Picklist: Under 1 Year, 1 - 3 Years, 3 - 5 Years, 5 - 10+ years';
COMMENT ON COLUMN lead_enrichments.has_gmb IS 'Maps to Salesforce Has_GMB__c - True if business has Google Business Profile';
COMMENT ON COLUMN lead_enrichments.gmb_url IS 'Maps to Salesforce GMB_URL__c - Google Business Profile URL';
COMMENT ON COLUMN lead_enrichments.location_type IS 'Maps to Salesforce Location_Type__c - Picklist: Home Office, Physical Location (Office), Retail Location (Store Front)';
COMMENT ON COLUMN lead_enrichments.business_license IS 'Maps to Salesforce Business_License__c - True/False (not determinable from enrichment, set null)';
COMMENT ON COLUMN lead_enrichments.spending_on_marketing IS 'Maps to Salesforce Spending_on_Marketing__c - True if domain age > 2 years AND has advertising pixels';
