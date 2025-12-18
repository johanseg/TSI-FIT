import {
  EnrichmentData,
  SalesforceEnrichmentFields,
  EmployeePicklist,
  GBPReviewsPicklist,
  YearsInBusinessPicklist,
  LocationTypePicklist,
} from '../types/lead';

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

  // Has_Website__c - True if we have website tech data or a website URL was provided
  const has_website = !!(websiteTech || websiteUrl);

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
 * - If has physical address and is operational -> "Physical Location (Office)" or "Retail Location (Store Front)"
 * - Otherwise -> "Home Office" (default assumption for service businesses)
 */
function mapLocationType(
  googlePlaces?: EnrichmentData['google_places']
): LocationTypePicklist | null {
  if (!googlePlaces) {
    return null;
  }

  // If we have Google Places data with an address and operational status
  if (googlePlaces.gmb_address && googlePlaces.gmb_is_operational) {
    // Check primary category for retail indicators
    const category = (googlePlaces.gmb_primary_category || '').toLowerCase();
    const retailCategories = [
      'store', 'shop', 'retail', 'boutique', 'salon', 'spa',
      'restaurant', 'cafe', 'bar', 'bakery', 'dealership'
    ];

    const isRetail = retailCategories.some(rc => category.includes(rc));

    if (isRetail) {
      return 'Retail Location (Store Front)';
    } else {
      return 'Physical Location (Office)';
    }
  }

  // If we found a GMB but no clear physical location
  if (googlePlaces.place_id) {
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
 * Format Salesforce fields for API response
 * Includes both custom fields (__c) and standard Lead fields (Website, Phone)
 */
export function formatForSalesforceUpdate(
  fields: SalesforceEnrichmentFields,
  website?: string,
  phone?: string
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

  // Include standard Lead fields if provided
  if (website) {
    result.Website = website;
  }
  if (phone) {
    result.Phone = phone;
  }

  return result;
}
