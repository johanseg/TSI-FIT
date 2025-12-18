import {
  EnrichmentData,
  SalesforceEnrichmentFields,
  EmployeePicklist,
  GBPReviewsPicklist,
  YearsInBusinessPicklist,
  LocationTypePicklist,
  GooglePlacesData,
} from '../types/lead';
import { GooglePlacesService } from './googlePlaces';

/**
 * Maps enrichment data to Salesforce custom field values
 *
 * Salesforce Fields:
 * - Has_Website__c - Boolean
 * - Number_of_Employees__c - Picklist (0, 1 - 2, 3 - 5, Over 5)
 * - Number_of_GBP_Reviews__c - Picklist (Under 15, Over 14)
 * - Number_of_Years_in_Business__c - Picklist (Under 1 Year, 1 - 3 Years, 3 - 5 Years, 5 - 10+ years)
 * - Has_GMB__c - Boolean
 * - GMB_URL__c - URL
 * - Location_Type__c - Picklist (Home Office, Physical Location (Office), Retail Location (Store Front))
 * - Business_License__c - Boolean (not determinable from enrichment)
 * - Spending_on_Marketing__c - Boolean (domain age > 2 AND has advertising pixels)
 */
export function mapToSalesforceFields(
  enrichmentData: EnrichmentData,
  websiteUrl?: string
): SalesforceEnrichmentFields {
  const googlePlaces = enrichmentData.google_places;
  const clay = enrichmentData.clay;
  const websiteTech = enrichmentData.website_tech;

  // Has_Website__c - True if we have website tech data, a website URL was provided, or GMB has website
  const has_website = !!(websiteTech || websiteUrl || googlePlaces?.gmb_website);

  // Number_of_Employees__c - Map employee estimate to picklist
  const number_of_employees = mapEmployeeCount(clay?.employee_estimate);

  // Number_of_GBP_Reviews__c - Map review count to picklist
  const number_of_gbp_reviews = mapGBPReviews(googlePlaces?.gmb_review_count);

  // Number_of_Years_in_Business__c - Map years to picklist
  const number_of_years_in_business = mapYearsInBusiness(clay?.years_in_business);

  // Has_GMB__c - True if we found a Google Business Profile
  const has_gmb = !!(googlePlaces?.place_id);

  // GMB_URL__c - Construct URL from place_id if available
  const gmb_url = googlePlaces?.place_id
    ? `https://www.google.com/maps/place/?q=place_id:${googlePlaces.place_id}`
    : null;

  // Location_Type__c - Determine from Google Places data
  const location_type = mapLocationType(googlePlaces);

  // Business_License__c - Cannot be determined from enrichment data
  const business_license = null;

  // Spending_on_Marketing__c - True if domain age > 2 years AND has advertising pixels
  const spending_on_marketing = determineSpendingOnMarketing(clay, websiteTech);

  return {
    has_website,
    number_of_employees,
    number_of_gbp_reviews,
    number_of_years_in_business,
    has_gmb,
    gmb_url,
    location_type,
    business_license,
    spending_on_marketing,
  };
}

/**
 * Map employee count to Salesforce picklist value
 * 0 -> "0"
 * 1-2 -> "1 - 2"
 * 3-5 -> "3 - 5"
 * 6+ -> "Over 5"
 */
function mapEmployeeCount(employeeEstimate?: number): EmployeePicklist | null {
  if (employeeEstimate === undefined || employeeEstimate === null) {
    return null;
  }

  if (employeeEstimate === 0) {
    return '0';
  } else if (employeeEstimate <= 2) {
    return '1 - 2';
  } else if (employeeEstimate <= 5) {
    return '3 - 5';
  } else {
    return 'Over 5';
  }
}

/**
 * Map Google Business Profile review count to Salesforce picklist
 * < 15 reviews -> "Under 15"
 * >= 15 reviews -> "Over 14"
 */
function mapGBPReviews(reviewCount?: number): GBPReviewsPicklist | null {
  if (reviewCount === undefined || reviewCount === null) {
    return null;
  }

  return reviewCount >= 15 ? 'Over 14' : 'Under 15';
}

/**
 * Map years in business to Salesforce picklist
 * < 1 year -> "Under 1 Year"
 * 1-3 years -> "1 - 3 Years"
 * 4-5 years -> "3 - 5 Years" (note: SF field uses "3 - 5" for 4-5)
 * 6+ years -> "5 - 10+ years"
 */
function mapYearsInBusiness(yearsInBusiness?: number): YearsInBusinessPicklist | null {
  if (yearsInBusiness === undefined || yearsInBusiness === null) {
    return null;
  }

  if (yearsInBusiness < 1) {
    return 'Under 1 Year';
  } else if (yearsInBusiness <= 3) {
    return '1 - 3 Years';
  } else if (yearsInBusiness <= 5) {
    return '3 - 5 Years';
  } else {
    return '5 - 10+ years';
  }
}

/**
 * Determine location type from Google Places data
 * - If commercial/storefront location -> "Physical Location (Office)" or "Retail Location (Store Front)"
 * - If residential detected -> null (not a valid business location)
 * - If home-based service business -> "Home Office"
 */
function mapLocationType(
  googlePlaces?: GooglePlacesData
): LocationTypePicklist | null {
  if (!googlePlaces) {
    return null;
  }

  // Use the new commercial location detection
  const isCommercial = GooglePlacesService.isCommercialLocation(googlePlaces);

  // If residential, don't assign a location type (user requirement: must not be residential)
  if (isCommercial === false) {
    return null;
  }

  // If we have Google Places data with an address and operational status
  if (googlePlaces.gmb_address && googlePlaces.gmb_is_operational && isCommercial) {
    // Check types for retail indicators
    const types = googlePlaces.gmb_types || [];
    const retailTypes = [
      'store', 'shop', 'retail', 'boutique', 'salon', 'spa',
      'restaurant', 'cafe', 'bar', 'bakery', 'dealership',
      'clothing_store', 'shoe_store', 'jewelry_store',
      'electronics_store', 'hardware_store', 'home_goods_store',
      'furniture_store', 'book_store', 'florist',
      'grocery_or_supermarket', 'convenience_store', 'supermarket',
      'beauty_salon', 'hair_care', 'gym', 'pharmacy',
    ];

    const isRetail = types.some(t =>
      retailTypes.some(rt => t.toLowerCase().includes(rt))
    );

    if (isRetail) {
      return 'Retail Location (Store Front)';
    } else {
      return 'Physical Location (Office)';
    }
  }

  // If we found a GMB but no clear physical location (service-based business)
  if (googlePlaces.place_id && !googlePlaces.gmb_address) {
    return 'Home Office';
  }

  return null;
}

/**
 * Determine if business is spending on marketing
 * Criteria: domain age > 2 years AND has advertising pixels (Meta, Google Ads, TikTok)
 */
function determineSpendingOnMarketing(
  clay?: EnrichmentData['clay'],
  websiteTech?: EnrichmentData['website_tech']
): boolean {
  // Check if business has been around for more than 2 years
  const domainAgeOver2Years = (clay?.years_in_business ?? 0) > 2;

  // Check if has advertising pixels
  const hasAdvertisingPixels = !!(
    websiteTech?.has_meta_pixel ||
    websiteTech?.has_google_ads_tag ||
    websiteTech?.has_tiktok_pixel
  );

  return domainAgeOver2Years && hasAdvertisingPixels;
}

/**
 * Fields that can be filled from GMB data when missing from the lead
 */
export interface GMBFilledFields {
  website?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
}

/**
 * Get fields that can be filled from GMB data
 * Only returns values for fields that are missing from the original lead
 */
export function getFilledFieldsFromGMB(
  googlePlaces: GooglePlacesData | undefined,
  originalLead: {
    website?: string;
    phone?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
  }
): GMBFilledFields {
  const filled: GMBFilledFields = {};

  if (!googlePlaces) {
    return filled;
  }

  // Fill website if missing
  if (!originalLead.website && googlePlaces.gmb_website) {
    filled.website = googlePlaces.gmb_website;
  }

  // Fill phone if missing
  if (!originalLead.phone && googlePlaces.gmb_phone) {
    filled.phone = googlePlaces.gmb_phone;
  }

  // Fill address if missing
  if (!originalLead.address && googlePlaces.gmb_address) {
    filled.address = googlePlaces.gmb_address;
  }

  // Fill city if missing
  if (!originalLead.city && googlePlaces.gmb_city) {
    filled.city = googlePlaces.gmb_city;
  }

  // Fill state if missing
  if (!originalLead.state && googlePlaces.gmb_state) {
    filled.state = googlePlaces.gmb_state;
  }

  // Fill zip if missing
  if (!originalLead.zip && googlePlaces.gmb_zip) {
    filled.zip = googlePlaces.gmb_zip;
  }

  return filled;
}

/**
 * Format Salesforce fields for API response
 * Includes both custom fields (__c) and standard Lead fields (Website, Phone, etc.)
 * Fills in missing fields from GMB data
 */
export function formatForSalesforceUpdate(
  fields: SalesforceEnrichmentFields,
  website?: string,
  phone?: string,
  filledFromGMB?: GMBFilledFields,
  fitScore?: number
): Record<string, unknown> {
  const result: Record<string, unknown> = {
    Has_Website__c: fields.has_website,
    Number_of_Employees__c: fields.number_of_employees,
    Number_of_GBP_Reviews__c: fields.number_of_gbp_reviews,
    Number_of_Years_in_Business__c: fields.number_of_years_in_business,
    Has_GMB__c: fields.has_gmb,
    GMB_URL__c: fields.gmb_url,
    Location_Type__c: fields.location_type,
    Business_License__c: fields.business_license,
    Spending_on_Marketing__c: fields.spending_on_marketing,
  };

  // Add Fit Score if provided
  if (fitScore !== undefined && fitScore !== null) {
    result.Fit_Score__c = fitScore;
    result.Fit_Score_Timestamp__c = new Date().toISOString();
    result.Enrichment_Status__c = 'success';
  }

  // Use original values or GMB-filled values for standard Lead fields
  const finalWebsite = website || filledFromGMB?.website;
  const finalPhone = phone || filledFromGMB?.phone;

  if (finalWebsite) {
    result.Website = finalWebsite;
  }
  if (finalPhone) {
    result.Phone = finalPhone;
  }

  // Include address fields if filled from GMB
  if (filledFromGMB?.address) {
    result.Street = filledFromGMB.address;
  }
  if (filledFromGMB?.city) {
    result.City = filledFromGMB.city;
  }
  if (filledFromGMB?.state) {
    result.State = filledFromGMB.state;
  }
  if (filledFromGMB?.zip) {
    result.PostalCode = filledFromGMB.zip;
  }

  return result;
}
