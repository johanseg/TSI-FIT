export interface LeadPayload {
  lead_id: string;
  salesforce_lead_id?: string;
  business_name: string;
  contact_name?: string;
  website?: string;
  phone?: string;
  email?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  fbclid?: string;
  gclid?: string;
  ttclid?: string;
  city?: string;
  state?: string;
}

export interface GooglePlacesData {
  place_id?: string;
  gmb_name?: string;
  gmb_primary_category?: string;
  gmb_review_count?: number;
  gmb_rating?: number;
  gmb_address?: string;
  gmb_is_operational?: boolean;
  // Additional fields for filling missing lead data
  gmb_website?: string;
  gmb_phone?: string;
  gmb_city?: string;
  gmb_state?: string;
  gmb_zip?: string;
  gmb_types?: string[]; // For determining commercial vs residential
  // Flag to indicate GMB address should overwrite lead address (high-confidence phone + name match)
  shouldOverwriteAddress?: boolean;
}

// Legacy Clay interface - kept for backwards compatibility with existing DB records
export interface ClayData {
  employee_estimate?: number;
  revenue_estimate_range?: string;
  year_founded?: number;
  years_in_business?: number;
  industry?: string;
}

// People Data Labs Company Enrichment data
export interface PDLCompanyData {
  // Match metadata
  pdl_id?: string;
  likelihood?: number; // 1-10 confidence score

  // Years in business (from founded year)
  year_founded?: number;
  years_in_business?: number;

  // Employee data
  employee_count?: number; // Exact count from PDL profile analysis
  size_range?: string; // Self-reported range, e.g., "11-50", "51-200"

  // Industry classification
  industry?: string; // Primary industry
  industry_v2?: string; // Expanded industry classification
  naics_codes?: Array<{
    code?: string;
    sector?: string;
    industry?: string;
  }>;

  // Revenue
  inferred_revenue?: string; // e.g., "$1M-$10M", "$10M-$50M"

  // Location / HQ validation
  headquarters?: {
    locality?: string;
    region?: string;
    country?: string;
    postal_code?: string;
  };

  // Website confidence
  website_confirmed?: string;
}

export interface WebsiteTechData {
  has_meta_pixel: boolean;
  has_ga4: boolean;
  has_google_ads_tag: boolean;
  has_tiktok_pixel: boolean;
  has_hubspot: boolean;
  pixel_count: number;
  marketing_tools_detected: string[];
}

export interface EnrichmentData {
  google_places?: GooglePlacesData;
  clay?: ClayData; // Legacy - kept for backwards compatibility
  pdl?: PDLCompanyData; // People Data Labs Company Enrichment
  website_tech?: WebsiteTechData;
}

export interface ScoreBreakdown {
  solvency_score: {
    website: number;
    reviews: number;
    years_in_business: number;
    employees: number;
    physical_location: number;
    total: number;
  };
  pixel_bonus: {
    pixel_count: number;
    bonus: number; // +5 for 1 pixel, +10 for 2+ pixels
  };
  final_score: number;
}

export interface FitScoreResult {
  fit_score: number;
  score_breakdown: ScoreBreakdown;
}

// Salesforce-aligned field outputs (maps to existing SF custom fields on Lead)
export type EmployeePicklist = '0' | '1 - 2' | '3 - 5' | 'Over 5';
export type GBPReviewsPicklist = 'Under 15' | 'Over 14';
export type YearsInBusinessPicklist = 'Under 1 Year' | '1 - 3 Years' | '3 - 5 Years' | '5 - 10+ years';
export type LocationTypePicklist = 'Home Office' | 'Physical Location (Office)' | 'Retail Location (Store Front)';

export interface SalesforceEnrichmentFields {
  // Has_Website__c - Boolean: Does the business have a website?
  has_website: boolean;

  // Number_of_Employees__c - Picklist: Employee count range
  number_of_employees: EmployeePicklist | null;

  // Number_of_GBP_Reviews__c - Picklist: Google Business Profile review count
  number_of_gbp_reviews: GBPReviewsPicklist | null;

  // Number_of_Years_in_Business__c - Picklist: How long in business
  number_of_years_in_business: YearsInBusinessPicklist | null;

  // Has_GMB__c - Boolean: Does customer have Google Business Profile?
  has_gmb: boolean;

  // GMB_URL__c - URL: Google Business Profile URL
  gmb_url: string | null;

  // Location_Type__c - Picklist: Type of business location
  location_type: LocationTypePicklist | null;

  // Business_License__c - Boolean: Has business license (not determinable from enrichment)
  business_license: boolean | null;

  // Spending_on_Marketing__c - Boolean: domain age > 2 years AND has advertising pixels
  spending_on_marketing: boolean;
}

export interface LeadRecord {
  id: string;
  lead_id: string;
  salesforce_lead_id?: string;
  business_name: string;
  website?: string;
  phone?: string;
  email?: string;
  utm_source?: string;
  fbclid?: string;
  gclid?: string;
  ttclid?: string;
  raw_payload: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface LeadEnrichmentRecord {
  id: string;
  lead_id: string;
  job_id: string;
  enrichment_status: 'pending' | 'success' | 'partial' | 'failed';
  google_places_data?: GooglePlacesData;
  clay_data?: ClayData; // Legacy
  pdl_data?: PDLCompanyData; // People Data Labs
  website_tech_data?: WebsiteTechData;
  fit_score?: number;
  score_breakdown?: ScoreBreakdown;
  // Salesforce-aligned fields
  has_website?: boolean;
  number_of_employees?: EmployeePicklist;
  number_of_gbp_reviews?: GBPReviewsPicklist;
  number_of_years_in_business?: YearsInBusinessPicklist;
  has_gmb?: boolean;
  gmb_url?: string;
  location_type?: LocationTypePicklist;
  business_license?: boolean;
  spending_on_marketing?: boolean;
  // Status tracking
  salesforce_updated: boolean;
  salesforce_updated_at?: Date;
  error_message?: string;
  created_at: Date;
  updated_at: Date;
}

export interface EnrichmentJobData {
  leadRowId: string; // UUID from leads table
  leadPayload: LeadPayload;
}

