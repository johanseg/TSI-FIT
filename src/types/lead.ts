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
}

export interface ClayData {
  employee_estimate?: number;
  revenue_estimate_range?: string;
  year_founded?: number;
  years_in_business?: number;
  industry?: string;
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
  clay?: ClayData;
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
  sophistication_penalty: {
    meta_pixel: number;
    ga4_google_ads: number;
    multiple_pixels: number;
    marketing_automation: number;
    total_before_cap: number;
    capped_total: number;
  };
  final_score: number;
}

export interface FitScoreResult {
  fit_score: number;
  fit_tier: 'Disqualified' | 'MQL' | 'High Fit' | 'Premium';
  score_breakdown: ScoreBreakdown;
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
  clay_data?: ClayData;
  website_tech_data?: WebsiteTechData;
  fit_score?: number;
  fit_tier?: string;
  score_breakdown?: ScoreBreakdown;
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

