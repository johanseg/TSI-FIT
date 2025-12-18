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
 * Get fields from GMB data to update in Salesforce
 * GMB data is used to fill missing fields, but we preserve the original phone number
 * since phone is a primary identifier from the lead submission
 */
export function getFilledFieldsFromGMB(
  googlePlaces: GooglePlacesData | undefined,
  _originalLead: {
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

  // Use GMB data for website and address fields
  // NOTE: We intentionally DO NOT include phone - the lead's phone is a primary identifier
  // and should not be overwritten by GMB data (which may be from a wrong match)
  if (googlePlaces.gmb_website) {
    filled.website = googlePlaces.gmb_website;
  }

  // Do NOT overwrite phone - it's a primary lead identifier
  // if (googlePlaces.gmb_phone) {
  //   filled.phone = googlePlaces.gmb_phone;
  // }

  if (googlePlaces.gmb_address) {
    filled.address = googlePlaces.gmb_address;
  }

  if (googlePlaces.gmb_city) {
    filled.city = googlePlaces.gmb_city;
  }

  if (googlePlaces.gmb_state) {
    filled.state = googlePlaces.gmb_state;
  }

  if (googlePlaces.gmb_zip) {
    filled.zip = googlePlaces.gmb_zip;
  }

  return filled;
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
  _fitScore?: number,
  gmbTypes?: string[]
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

  // Note: We don't update Score__c - it's read-only (used to identify if lead was scored)
  // The fit score is calculated but not written to Salesforce via this field

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

  return result;
}
