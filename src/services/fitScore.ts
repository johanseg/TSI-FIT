import {
  EnrichmentData,
  FitScoreResult,
  ScoreBreakdown,
} from '../types/lead';
import { PeopleDataLabsService } from './peopleDataLabs';
import { GooglePlacesService } from './googlePlaces';

/**
 * Check if a URL is a Google/GMB URL
 */
function isGoogleOrGmbUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname.includes('google.com') ||
           hostname.includes('google.') ||
           hostname.includes('.google.') ||
           hostname === 'google.com';
  } catch {
    return false;
  }
}

/**
 * Check if a URL is a subdomain (not a root domain)
 */
function isSubdomain(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace('www.', '');
    // Count dots - if more than 1, it's likely a subdomain (e.g., shop.example.com)
    // Exception: common TLDs like .co.uk count as 2 parts
    const parts = hostname.split('.');
    if (parts.length <= 2) return false; // example.com = not subdomain

    // Check for common multi-part TLDs
    const multiPartTlds = ['co.uk', 'com.au', 'co.nz', 'co.za'];
    const lastTwoParts = parts.slice(-2).join('.');
    if (multiPartTlds.includes(lastTwoParts) && parts.length === 3) {
      return false; // example.co.uk = not subdomain
    }

    return true; // shop.example.com = subdomain
  } catch {
    return false;
  }
}

/**
 * Calculate Fit Score based on enrichment data
 *
 * Data sources (in priority order):
 * - PDL (People Data Labs): employees, years in business, industry, revenue
 * - Google Places: reviews, physical location, website
 * - Website Tech: pixel detection for bonus points
 *
 * Solvency Score (0-95):
 * - GMB Match: +10 if GMB found (place_id exists)
 * - Website: +10 if custom domain, +5 if GMB/Google URL, +0 if subdomain/social
 * - Reviews: +0 (<5), +10 (5-14), +20 (15-29), +25 (≥30)
 * - Years in business: +0 (<2), +5 (2-3), +10 (4-7), +15 (≥8)
 * - Employees: +0 (<2), +5 (2-4), +15 (>5)
 * - Physical location: +20 storefront/office, +10 service-area business
 * - Marketing spend: +0 ($0), +5 (<$500), +10 (≥$500)
 *
 * Physical Location Detection:
 * - Uses Google Places API pureServiceAreaBusiness flag to detect home-based contractors
 * - Storefront/Office locations get +20 bonus (real commercial location)
 * - Service-area businesses (home-based) get +10 bonus (verified GMB presence)
 * - Residential/unknown get +0
 *
 * Pixel Bonus (0-10):
 * - 1 pixel: +5
 * - 2+ pixels: +10
 *
 * Final: clamp(SolvencyScore + PixelBonus, 0, 100)
 */
export function calculateFitScore(enrichmentData: EnrichmentData): FitScoreResult {
  const breakdown: ScoreBreakdown = {
    solvency_score: {
      gmb_match: 0,
      website: 0,
      reviews: 0,
      years_in_business: 0,
      employees: 0,
      physical_location: 0,
      marketing_spend: 0,
      total: 0,
    },
    pixel_bonus: {
      pixel_count: 0,
      bonus: 0,
    },
    final_score: 0,
  };

  // Calculate Solvency Score (0-95)
  const googlePlaces = enrichmentData.google_places;
  const pdl = enrichmentData.pdl;
  const clay = enrichmentData.clay; // Legacy fallback
  const websiteTech = enrichmentData.website_tech;

  // GMB Match: +10 if place_id exists
  if (googlePlaces?.place_id) {
    breakdown.solvency_score.gmb_match = 10;
  }

  // Website scoring:
  // +10 if custom domain (not GMB/Google URL, not subdomain)
  // +5 if GMB/Google URL
  // +0 if subdomain or no website
  const websiteUrl = googlePlaces?.gmb_website || pdl?.website_confirmed;

  if (websiteUrl) {
    const isGoogleUrl = isGoogleOrGmbUrl(websiteUrl);
    const isSubdomainUrl = isSubdomain(websiteUrl);

    if (isGoogleUrl) {
      breakdown.solvency_score.website = 5; // GMB/Google URL
    } else if (isSubdomainUrl) {
      breakdown.solvency_score.website = 0; // Subdomain gets 0
    } else {
      breakdown.solvency_score.website = 10; // Custom domain
    }
  } else if (websiteTech?.has_meta_pixel !== undefined) {
    // If we have website tech data, it means we successfully scanned a website
    // This implies a real website exists (not GMB/subdomain)
    breakdown.solvency_score.website = 10;
  }

  // Reviews: +0 (<5), +10 (5-14), +20 (15-29), +25 (≥30)
  const reviewCount = googlePlaces?.gmb_review_count ?? 0;
  if (reviewCount >= 30) {
    breakdown.solvency_score.reviews = 25;
  } else if (reviewCount >= 15) {
    breakdown.solvency_score.reviews = 20;
  } else if (reviewCount >= 5) {
    breakdown.solvency_score.reviews = 10;
  } else {
    breakdown.solvency_score.reviews = 0;
  }

  // Years in business: +0 (<2), +5 (2-3), +10 (4-7), +15 (≥8)
  // Priority: PDL > Clay (legacy)
  const yearsInBusiness = pdl?.years_in_business ?? clay?.years_in_business ?? 0;
  if (yearsInBusiness >= 8) {
    breakdown.solvency_score.years_in_business = 15;
  } else if (yearsInBusiness >= 4) {
    breakdown.solvency_score.years_in_business = 10;
  } else if (yearsInBusiness >= 2) {
    breakdown.solvency_score.years_in_business = 5;
  } else {
    breakdown.solvency_score.years_in_business = 0;
  }

  // Employees: +0 (<2), +5 (2-4), +15 (>5)
  // Priority: PDL employee_count > PDL size_range (parsed) > Clay (legacy)
  let employees = 0;
  if (pdl?.employee_count != null && pdl.employee_count > 0) {
    // Use exact employee count if available and valid
    employees = pdl.employee_count;
  } else if (pdl?.size_range) {
    // Parse employee count from size range (e.g., "1-10" → 6, "11-50" → 30)
    employees = PeopleDataLabsService.parseEmployeeCountFromSize(pdl.size_range) ?? 0;
  } else if (clay?.employee_estimate != null && clay.employee_estimate > 0) {
    // Legacy Clay fallback
    employees = clay.employee_estimate;
  }

  if (employees > 5) {
    breakdown.solvency_score.employees = 15;
  } else if (employees >= 2) {
    breakdown.solvency_score.employees = 5;
  } else {
    breakdown.solvency_score.employees = 0;
  }

  // Physical location bonus based on location classification:
  // - Storefront/Office: +20 (has real commercial location with customer foot traffic or dedicated office)
  // - Service Area Business: +10 (verified business via GMB, operates from home/mobile)
  // - Residential/Unknown: +0 (not a valid business location)
  if (googlePlaces) {
    const classification = GooglePlacesService.getLocationClassification(googlePlaces);
    if (classification === 'storefront' || classification === 'office') {
      breakdown.solvency_score.physical_location = 20;
    } else if (classification === 'service_area') {
      // Verified service-area business (home-based contractor with GMB presence)
      breakdown.solvency_score.physical_location = 10;
    }
  }

  // Marketing spend: +0 ($0), +5 (<$500), +10 (≥$500)
  const marketingSpend = enrichmentData.marketing_spend ?? 0;
  if (marketingSpend >= 500) {
    breakdown.solvency_score.marketing_spend = 10;
  } else if (marketingSpend > 0) {
    breakdown.solvency_score.marketing_spend = 5;
  } else {
    breakdown.solvency_score.marketing_spend = 0;
  }

  breakdown.solvency_score.total =
    breakdown.solvency_score.gmb_match +
    breakdown.solvency_score.website +
    breakdown.solvency_score.reviews +
    breakdown.solvency_score.years_in_business +
    breakdown.solvency_score.employees +
    breakdown.solvency_score.physical_location +
    breakdown.solvency_score.marketing_spend;

  // Calculate Pixel Bonus (0-10)
  // 1 pixel: +5, 2+ pixels: +10
  if (websiteTech) {
    breakdown.pixel_bonus.pixel_count = websiteTech.pixel_count;
    if (websiteTech.pixel_count >= 2) {
      breakdown.pixel_bonus.bonus = 10;
    } else if (websiteTech.pixel_count === 1) {
      breakdown.pixel_bonus.bonus = 5;
    }
  }

  // Calculate final score: clamp(SolvencyScore + PixelBonus, 0, 100)
  const rawScore = breakdown.solvency_score.total + breakdown.pixel_bonus.bonus;
  breakdown.final_score = Math.max(0, Math.min(100, rawScore));

  return {
    fit_score: breakdown.final_score,
    score_breakdown: breakdown,
  };
}
