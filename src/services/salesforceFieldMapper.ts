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
import { calculateScore } from './scoreMapper';

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
  const pdl = enrichmentData.pdl;
  const clay = enrichmentData.clay;
  const websiteTech = enrichmentData.website_tech;

  // Has_Website__c - True if we have website tech data, a website URL was provided, or GMB has website
  const has_website = !!(websiteTech || websiteUrl || googlePlaces?.gmb_website);

  // Number_of_Employees__c - Map employee estimate to picklist
  // Priority: PDL employee_count > Clay employee_estimate
  const employeeCount = pdl?.employee_count ?? clay?.employee_estimate;
  const number_of_employees = mapEmployeeCount(employeeCount);

  // Number_of_GBP_Reviews__c - Map review count to picklist
  const number_of_gbp_reviews = mapGBPReviews(googlePlaces?.gmb_review_count);

  // Number_of_Years_in_Business__c - Map years to picklist
  // Priority: PDL years_in_business > Clay years_in_business
  const yearsInBusiness = pdl?.years_in_business ?? clay?.years_in_business;
  const number_of_years_in_business = mapYearsInBusiness(yearsInBusiness);

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
  // Priority: PDL years_in_business > Domain Age > Clay years_in_business
  const spending_on_marketing = determineSpendingOnMarketing(pdl, clay, websiteTech, enrichmentData.website_validation);

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
 */
function mapEmployeeCount(employeeEstimate?: number): EmployeePicklist | null {
  if (employeeEstimate == null) return null;
  if (employeeEstimate === 0) return '0';
  if (employeeEstimate <= 2) return '1 - 2';
  if (employeeEstimate <= 5) return '3 - 5';
  return 'Over 5';
}

/**
 * Map Google Business Profile review count to Salesforce picklist
 */
function mapGBPReviews(reviewCount?: number): GBPReviewsPicklist | null {
  if (reviewCount == null) return null;
  return reviewCount >= 15 ? 'Over 14' : 'Under 15';
}

/**
 * Map years in business to Salesforce picklist
 */
function mapYearsInBusiness(yearsInBusiness?: number): YearsInBusinessPicklist | null {
  if (yearsInBusiness == null) return null;
  if (yearsInBusiness < 1) return 'Under 1 Year';
  if (yearsInBusiness <= 3) return '1 - 3 Years';
  if (yearsInBusiness <= 5) return '3 - 5 Years';
  return '5 - 10+ years';
}

/**
 * Determine location type from Google Places data
 * Returns null - Location_Type__c is only set manually by sales reps
 */
function mapLocationType(_googlePlaces?: GooglePlacesData): LocationTypePicklist | null {
  return null;
}

// Lead_Vertical__c picklist values from Salesforce
export type LeadVerticalPicklist =
  | 'Appliance Repair' | 'Arborists & Tree Removal' | 'Art & Photography' | 'Automotive'
  | 'Bail Bonds' | 'Beauty & Cosmetic' | 'Cabinets & Countertops' | 'Carpet Cleaning'
  | 'Chiropractors, Acupuncture & Massage' | 'Cleaning Services' | 'Commercial Contractors'
  | 'Computers & Technology' | 'Concrete & Masonry' | 'Custom Home Builders' | 'Damage Restoration'
  | 'Decks & Patios' | 'Dental' | 'Doctors' | 'Doors & Windows' | 'Electricians'
  | 'Entertainment & Music' | 'Fences' | 'Finance & Accounting' | 'Flooring' | 'Furniture'
  | 'Garage Doors' | 'General Contractor' | 'Government & Community' | 'Gyms & Fitness'
  | 'Handymen' | 'Home Entertainment & Automation' | 'Home Health Care' | 'Home Inspection'
  | 'Home Remodeling & Additions' | 'Home Security' | 'HVAC' | 'Insulation' | 'Insurance'
  | 'Junk Removal' | 'Landscaping' | 'Legal' | 'Lodging & Travel' | 'Logistics & Transportation'
  | 'Med Spas' | 'Moving & Storage' | 'Non-profit' | 'Nutrition & Fitness' | 'Other Blue Collar'
  | 'Other SMB' | 'Other White Collar' | 'Painting' | 'Pest Control' | 'Physical Therapy'
  | 'Plastic Surgery' | 'Plumbing' | 'Pools' | 'Pressure Washing' | 'Private Investigators'
  | 'Religious' | 'Restaurants, Food & Beverages' | 'Retail & Specialty Shops' | 'Road Side Assistance'
  | 'Roofing' | 'Salons & Beauty' | 'Siding' | 'Signs, Graphics & Print Materials' | 'Solar'
  | 'Sports & Outdoors' | 'Tattoo Parlors' | 'Therapists' | 'Towing' | 'Transportation'
  | 'Veterinary & Pets';

/**
 * Map GMB types to Lead_Vertical__c picklist value
 * Returns null if no matching vertical found
 */
export function mapGMBTypesToVertical(gmbTypes?: string[]): LeadVerticalPicklist | null {
  if (!gmbTypes || gmbTypes.length === 0) {
    return null;
  }

  // Normalize types to lowercase for matching
  const types = gmbTypes.map(t => t.toLowerCase());

  // GMB type keywords -> Salesforce Lead_Vertical__c mapping
  // Order matters - more specific matches should come first
  const typeMapping: Array<{ keywords: string[]; vertical: LeadVerticalPicklist }> = [
    // Roofing
    { keywords: ['roofing', 'roofer'], vertical: 'Roofing' },

    // Plumbing
    { keywords: ['plumber', 'plumbing'], vertical: 'Plumbing' },

    // HVAC
    { keywords: ['hvac', 'heating', 'air_conditioning', 'furnace'], vertical: 'HVAC' },

    // Electricians
    { keywords: ['electrician', 'electrical'], vertical: 'Electricians' },

    // Tree Services
    { keywords: ['tree', 'arborist', 'tree_service'], vertical: 'Arborists & Tree Removal' },

    // Landscaping
    { keywords: ['landscap', 'lawn', 'garden'], vertical: 'Landscaping' },

    // Painting
    { keywords: ['painter', 'painting'], vertical: 'Painting' },

    // Pest Control
    { keywords: ['pest', 'exterminator', 'termite'], vertical: 'Pest Control' },

    // Cleaning Services
    { keywords: ['cleaning', 'maid', 'janitorial', 'house_cleaning'], vertical: 'Cleaning Services' },

    // Carpet Cleaning
    { keywords: ['carpet_clean'], vertical: 'Carpet Cleaning' },

    // Garage Doors
    { keywords: ['garage_door'], vertical: 'Garage Doors' },

    // Fences
    { keywords: ['fence', 'fencing'], vertical: 'Fences' },

    // Concrete & Masonry
    { keywords: ['concrete', 'masonry', 'mason', 'cement', 'paving'], vertical: 'Concrete & Masonry' },

    // Flooring
    { keywords: ['flooring', 'floor', 'hardwood', 'tile_contractor'], vertical: 'Flooring' },

    // Doors & Windows
    { keywords: ['window', 'door_supplier', 'glass'], vertical: 'Doors & Windows' },

    // Decks & Patios
    { keywords: ['deck', 'patio'], vertical: 'Decks & Patios' },

    // Siding
    { keywords: ['siding'], vertical: 'Siding' },

    // Home Remodeling
    { keywords: ['remodel', 'renovation', 'home_improvement', 'kitchen_remodel', 'bathroom_remodel'], vertical: 'Home Remodeling & Additions' },

    // General Contractor
    { keywords: ['general_contractor', 'contractor', 'construction'], vertical: 'General Contractor' },

    // Custom Home Builders
    { keywords: ['home_builder', 'custom_home'], vertical: 'Custom Home Builders' },

    // Pools
    { keywords: ['pool', 'swimming_pool', 'hot_tub', 'spa_contractor'], vertical: 'Pools' },

    // Solar
    { keywords: ['solar'], vertical: 'Solar' },

    // Insulation
    { keywords: ['insulation'], vertical: 'Insulation' },

    // Damage Restoration
    { keywords: ['restoration', 'water_damage', 'fire_damage', 'mold'], vertical: 'Damage Restoration' },

    // Appliance Repair
    { keywords: ['appliance_repair', 'appliance'], vertical: 'Appliance Repair' },

    // Handymen
    { keywords: ['handyman'], vertical: 'Handymen' },

    // Junk Removal
    { keywords: ['junk', 'hauling', 'debris'], vertical: 'Junk Removal' },

    // Moving & Storage
    { keywords: ['moving', 'mover', 'storage'], vertical: 'Moving & Storage' },

    // Pressure Washing
    { keywords: ['pressure_wash', 'power_wash'], vertical: 'Pressure Washing' },

    // Home Inspection
    { keywords: ['home_inspection', 'inspector'], vertical: 'Home Inspection' },

    // Home Security
    { keywords: ['security_system', 'alarm', 'locksmith'], vertical: 'Home Security' },

    // Towing
    { keywords: ['towing', 'tow_truck'], vertical: 'Towing' },

    // Road Side Assistance
    { keywords: ['roadside', 'emergency_road'], vertical: 'Road Side Assistance' },

    // Automotive
    { keywords: ['auto', 'car_repair', 'car_dealer', 'mechanic', 'auto_body', 'tire', 'oil_change'], vertical: 'Automotive' },

    // Legal
    { keywords: ['lawyer', 'attorney', 'law_firm', 'legal'], vertical: 'Legal' },

    // Dental
    { keywords: ['dentist', 'dental', 'orthodont'], vertical: 'Dental' },

    // Doctors
    { keywords: ['doctor', 'physician', 'medical', 'clinic', 'family_practice', 'primary_care'], vertical: 'Doctors' },

    // Chiropractors
    { keywords: ['chiropract', 'acupunctur', 'massage_therapist', 'massage'], vertical: 'Chiropractors, Acupuncture & Massage' },

    // Physical Therapy
    { keywords: ['physical_therap', 'physiotherap', 'rehab'], vertical: 'Physical Therapy' },

    // Plastic Surgery
    { keywords: ['plastic_surg', 'cosmetic_surg'], vertical: 'Plastic Surgery' },

    // Med Spas
    { keywords: ['med_spa', 'medical_spa', 'medspa'], vertical: 'Med Spas' },

    // Therapists
    { keywords: ['therapist', 'counselor', 'psycholog', 'mental_health'], vertical: 'Therapists' },

    // Veterinary & Pets
    { keywords: ['veterinar', 'vet', 'pet', 'animal_hospital', 'dog', 'cat', 'grooming'], vertical: 'Veterinary & Pets' },

    // Salons & Beauty
    { keywords: ['salon', 'beauty', 'hair', 'nail', 'barber', 'spa'], vertical: 'Salons & Beauty' },

    // Gyms & Fitness
    { keywords: ['gym', 'fitness', 'yoga', 'pilates', 'crossfit', 'personal_train'], vertical: 'Gyms & Fitness' },

    // Restaurants, Food & Beverages
    { keywords: ['restaurant', 'cafe', 'coffee', 'bakery', 'bar', 'food', 'catering', 'pizza', 'meal'], vertical: 'Restaurants, Food & Beverages' },

    // Retail & Specialty Shops
    { keywords: ['store', 'shop', 'retail', 'boutique'], vertical: 'Retail & Specialty Shops' },

    // Insurance
    { keywords: ['insurance'], vertical: 'Insurance' },

    // Finance & Accounting
    { keywords: ['accountant', 'accounting', 'tax', 'financial', 'cpa', 'bookkeep'], vertical: 'Finance & Accounting' },

    // Real Estate (maps to Other White Collar)
    { keywords: ['real_estate', 'realtor', 'property'], vertical: 'Other White Collar' },

    // Photography
    { keywords: ['photograph', 'photo_studio'], vertical: 'Art & Photography' },

    // Entertainment & Music
    { keywords: ['entertainment', 'music', 'dj', 'event'], vertical: 'Entertainment & Music' },

    // Lodging & Travel
    { keywords: ['hotel', 'motel', 'lodging', 'travel', 'vacation'], vertical: 'Lodging & Travel' },

    // Tattoo Parlors
    { keywords: ['tattoo', 'piercing'], vertical: 'Tattoo Parlors' },

    // Signs, Graphics & Print
    { keywords: ['sign', 'printing', 'graphic'], vertical: 'Signs, Graphics & Print Materials' },

    // Computers & Technology
    { keywords: ['computer', 'it_service', 'tech_support', 'software'], vertical: 'Computers & Technology' },

    // Furniture
    { keywords: ['furniture'], vertical: 'Furniture' },

    // Cabinets & Countertops
    { keywords: ['cabinet', 'countertop', 'granite', 'marble'], vertical: 'Cabinets & Countertops' },

    // Home Entertainment & Automation
    { keywords: ['home_theater', 'home_automation', 'smart_home'], vertical: 'Home Entertainment & Automation' },

    // Home Health Care
    { keywords: ['home_health', 'home_care', 'senior_care', 'nursing'], vertical: 'Home Health Care' },

    // Private Investigators
    { keywords: ['investigator', 'detective'], vertical: 'Private Investigators' },

    // Religious
    { keywords: ['church', 'religious', 'worship', 'temple', 'mosque', 'synagogue'], vertical: 'Religious' },

    // Non-profit
    { keywords: ['non_profit', 'nonprofit', 'charity', 'foundation'], vertical: 'Non-profit' },

    // Bail Bonds
    { keywords: ['bail_bond'], vertical: 'Bail Bonds' },

    // Sports & Outdoors
    { keywords: ['sport', 'outdoor', 'recreation', 'golf', 'tennis', 'hunting', 'fishing'], vertical: 'Sports & Outdoors' },
  ];

  // Check each mapping
  for (const mapping of typeMapping) {
    for (const type of types) {
      for (const keyword of mapping.keywords) {
        if (type.includes(keyword)) {
          return mapping.vertical;
        }
      }
    }
  }

  return null;
}

/**
 * Determine if business is spending on marketing
 * Criteria: domain age > 2 years AND has advertising pixels (Meta, Google Ads, TikTok)
 */
function determineSpendingOnMarketing(
  pdl?: EnrichmentData['pdl'],
  clay?: EnrichmentData['clay'],
  websiteTech?: EnrichmentData['website_tech'],
  websiteValidation?: EnrichmentData['website_validation']
): boolean {
  // Check if business has been around for more than 2 years
  // Priority: PDL years_in_business > Domain Age > Clay years_in_business
  const domainAgeYears = websiteValidation?.domain_age?.age_years;
  const yearsInBusiness = pdl?.years_in_business ?? domainAgeYears ?? clay?.years_in_business ?? 0;
  const domainAgeOver2Years = yearsInBusiness > 2;

  // Check if has advertising pixels
  const hasAdvertisingPixels = !!(
    websiteTech?.has_meta_pixel ||
    websiteTech?.has_google_ads_tag ||
    websiteTech?.has_tiktok_pixel
  );

  return domainAgeOver2Years && hasAdvertisingPixels;
}

/**
 * Fields from GMB data to update in Salesforce
 * These will overwrite existing Salesforce data if GMB has values
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
 * Result of GMB field filling operation
 */
export interface GMBFilledResult {
  fields: GMBFilledFields;
  addressWasOverwritten: boolean;
  auditNote?: string;
}

/**
 * Generate audit note for address overwrite
 */
export function generateAddressOverwriteNote(
  originalAddress: { city?: string; state?: string; zip?: string },
  gmbAddress: { city?: string; state?: string; zip?: string }
): string {
  const original = [originalAddress.city, originalAddress.state, originalAddress.zip]
    .filter(Boolean)
    .join(', ') || '(empty)';
  const updated = [gmbAddress.city, gmbAddress.state, gmbAddress.zip]
    .filter(Boolean)
    .join(', ') || '(empty)';

  const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
  return `[TSI Auto-Enrichment ${timestamp}] Address corrected from GMB (phone match). Original: ${original} → Updated: ${updated}`;
}

/**
 * Get fields from GMB data to update in Salesforce
 * GMB data is used to fill missing fields, but we preserve the original phone number
 * since phone is a primary identifier from the lead submission
 *
 * When shouldOverwriteAddress is true (high-confidence phone + name match),
 * address fields are always filled from GMB, even if lead has existing values.
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
): GMBFilledResult {
  const filled: GMBFilledFields = {};
  let addressWasOverwritten = false;
  let auditNote: string | undefined;

  if (!googlePlaces) {
    return { fields: filled, addressWasOverwritten, auditNote };
  }

  const shouldOverwriteAddress = googlePlaces.shouldOverwriteAddress === true;

  // Use GMB data for website
  // NOTE: We intentionally DO NOT include phone - the lead's phone is a primary identifier
  // and should not be overwritten by GMB data (which may be from a wrong match)
  if (googlePlaces.gmb_website) {
    filled.website = googlePlaces.gmb_website;
  }

  // Do NOT overwrite phone - it's a primary lead identifier
  // if (googlePlaces.gmb_phone) {
  //   filled.phone = googlePlaces.gmb_phone;
  // }

  // Address fields: Always fill from GMB if shouldOverwriteAddress is true
  // Otherwise, only fill if lead field is empty/missing
  if (googlePlaces.gmb_address) {
    if (shouldOverwriteAddress || !originalLead.address) {
      filled.address = googlePlaces.gmb_address;
    }
  }

  if (googlePlaces.gmb_city) {
    if (shouldOverwriteAddress || !originalLead.city) {
      filled.city = googlePlaces.gmb_city;
    }
  }

  if (googlePlaces.gmb_state) {
    if (shouldOverwriteAddress || !originalLead.state) {
      filled.state = googlePlaces.gmb_state;
    }
  }

  if (googlePlaces.gmb_zip) {
    if (shouldOverwriteAddress || !originalLead.zip) {
      filled.zip = googlePlaces.gmb_zip;
    }
  }

  // Check if we actually overwrote any address fields that had values
  if (shouldOverwriteAddress) {
    const hadExistingAddress = originalLead.city || originalLead.state || originalLead.zip;
    const gmbHasAddress = googlePlaces.gmb_city || googlePlaces.gmb_state || googlePlaces.gmb_zip;

    if (hadExistingAddress && gmbHasAddress) {
      // Check if any field actually changed
      const stateChanged = originalLead.state && googlePlaces.gmb_state &&
        originalLead.state.toUpperCase().trim() !== googlePlaces.gmb_state.toUpperCase().trim();
      const cityChanged = originalLead.city && googlePlaces.gmb_city &&
        originalLead.city.toLowerCase().trim() !== googlePlaces.gmb_city.toLowerCase().trim();
      const zipChanged = originalLead.zip && googlePlaces.gmb_zip &&
        originalLead.zip.trim() !== googlePlaces.gmb_zip.trim();

      if (stateChanged || cityChanged || zipChanged) {
        addressWasOverwritten = true;
        auditNote = generateAddressOverwriteNote(
          { city: originalLead.city, state: originalLead.state, zip: originalLead.zip },
          { city: googlePlaces.gmb_city, state: googlePlaces.gmb_state, zip: googlePlaces.gmb_zip }
        );
      }
    }
  }

  return { fields: filled, addressWasOverwritten, auditNote };
}

/**
 * Format Salesforce fields for API response
 * Includes both custom fields (__c) and standard Lead fields (Website, etc.)
 * Note: Phone is intentionally NOT updated - it's a primary lead identifier
 */
export function formatForSalesforceUpdate(
  fields: SalesforceEnrichmentFields,
  website?: string,
  _phone?: string, // Unused - phone is preserved from original lead
  filledFromGMB?: GMBFilledFields,
  fitScore?: number,
  gmbTypes?: string[],
  auditNote?: string, // Optional audit note to append to Notes__c
  leadSource?: string // Lead source for Score__c calculation (Facebook, TikTok, Google)
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

  // Add Fit_Score__c if provided
  if (fitScore !== undefined && fitScore !== null) {
    result.Fit_Score__c = fitScore;
  }

  // Calculate and add Score__c if lead source is Facebook, TikTok, or Google
  // Score__c is calculated from Fit Score using thresholds:
  // 0 → 0, 1-39 → 1, 40-59 → 2, 60-79 → 3, 80-99 → 4, 100+ → 5
  const calculatedScore = calculateScore(fitScore, leadSource);
  if (calculatedScore !== null) {
    result.Score__c = calculatedScore;
  }

  // Always overwrite Lead_Vertical__c from GMB types if we can determine it
  // GMB data is considered authoritative
  if (gmbTypes && gmbTypes.length > 0) {
    const mappedVertical = mapGMBTypesToVertical(gmbTypes);
    if (mappedVertical) {
      result.Lead_Vertical__c = mappedVertical;
    }
  }

  // Update website from GMB if available (GMB website data is usually accurate)
  // But DO NOT update phone - it's a primary lead identifier and should be preserved
  const finalWebsite = filledFromGMB?.website || website;

  if (finalWebsite) {
    result.Website = finalWebsite;
  }
  // Phone is intentionally NOT updated - preserve the original lead phone number

  // Always update address fields from GMB if available (GMB is authoritative)
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

  // Add audit note to Notes__c if provided (e.g., address corrected from GMB)
  if (auditNote) {
    result.Notes__c = auditNote;
  }

  return result;
}
