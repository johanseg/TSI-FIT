import {
  EnrichmentData,
  FitScoreResult,
  ScoreBreakdown,
} from '../types/lead';
import { PeopleDataLabsService } from './peopleDataLabs';

/**
 * Calculate Fit Score based on enrichment data
 *
 * Data sources (in priority order):
 * - PDL (People Data Labs): employees, years in business, industry, revenue
 * - Google Places: reviews, physical location, website
 * - Website Tech: pixel detection for sophistication penalty
 *
 * Solvency Score (0-85):
 * - Website: +10 if present
 * - Reviews: +0 (<5), +10 (5-14), +20 (15-29), +25 (≥30)
 * - Years in business: +0 (<2), +10 (2-3), +15 (4-7), +20 (≥8)
 * - Employees: +0 (<3), +10 (3-5), +15 (6-15), +20 (≥16)
 * - Physical location: +10 for 1 location, +15 for multiple locations
 *
 * Sophistication Penalty (capped at -10):
 * - Meta Pixel: -3
 * - GA4/Google Ads: -3
 * - Multiple pixels (≥2): -4
 * - Marketing automation: -3
 *
 * Final: clamp(SolvencyScore + Penalty, 0, 100)
 */
export function calculateFitScore(enrichmentData: EnrichmentData): FitScoreResult {
  const breakdown: ScoreBreakdown = {
    solvency_score: {
      website: 0,
      reviews: 0,
      years_in_business: 0,
      employees: 0,
      physical_location: 0,
      total: 0,
    },
    sophistication_penalty: {
      meta_pixel: 0,
      ga4_google_ads: 0,
      multiple_pixels: 0,
      marketing_automation: 0,
      total_before_cap: 0,
      capped_total: 0,
    },
    final_score: 0,
  };

  // Calculate Solvency Score (0-80)
  const googlePlaces = enrichmentData.google_places;
  const pdl = enrichmentData.pdl;
  const clay = enrichmentData.clay; // Legacy fallback
  const websiteTech = enrichmentData.website_tech;

  // Website: +10 if present
  // Consider website present if we have website tech data, Google Places has website, PDL confirmed, or GMB profile exists
  if (
    websiteTech?.has_meta_pixel !== undefined ||
    googlePlaces?.gmb_website ||
    googlePlaces?.place_id ||
    pdl?.website_confirmed
  ) {
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

  // Years in business: +0 (<2), +10 (2-3), +15 (4-7), +20 (≥8)
  // Priority: PDL > Clay (legacy)
  const yearsInBusiness = pdl?.years_in_business ?? clay?.years_in_business ?? 0;
  if (yearsInBusiness >= 8) {
    breakdown.solvency_score.years_in_business = 20;
  } else if (yearsInBusiness >= 4) {
    breakdown.solvency_score.years_in_business = 15;
  } else if (yearsInBusiness >= 2) {
    breakdown.solvency_score.years_in_business = 10;
  } else {
    breakdown.solvency_score.years_in_business = 0;
  }

  // Employees: +0 (<3), +10 (3-5), +15 (6-15), +20 (≥16)
  // Priority: PDL employee_count > PDL size_range (parsed) > Clay (legacy)
  let employees = 0;
  if (pdl?.employee_count !== undefined) {
    employees = pdl.employee_count;
  } else if (pdl?.size_range) {
    // Parse employee count from size range (e.g., "11-50" → 30)
    employees = PeopleDataLabsService.parseEmployeeCountFromSize(pdl.size_range) ?? 0;
  } else if (clay?.employee_estimate !== undefined) {
    employees = clay.employee_estimate;
  }

  if (employees >= 16) {
    breakdown.solvency_score.employees = 20;
  } else if (employees >= 6) {
    breakdown.solvency_score.employees = 15;
  } else if (employees >= 3) {
    breakdown.solvency_score.employees = 10;
  } else {
    breakdown.solvency_score.employees = 0;
  }

  // Physical location: +10 for 1 location, +15 for multiple locations
  // Note: Currently we can only detect single GMB location, so +10 max
  // TODO: Add multi-location detection when data source is available
  if (googlePlaces?.gmb_is_operational === true && googlePlaces?.gmb_address) {
    breakdown.solvency_score.physical_location = 10;
  }

  breakdown.solvency_score.total =
    breakdown.solvency_score.website +
    breakdown.solvency_score.reviews +
    breakdown.solvency_score.years_in_business +
    breakdown.solvency_score.employees +
    breakdown.solvency_score.physical_location;

  // Calculate Sophistication Penalty (capped at -10)
  if (websiteTech) {
    // Meta Pixel: -3
    if (websiteTech.has_meta_pixel) {
      breakdown.sophistication_penalty.meta_pixel = -3;
    }

    // GA4/Google Ads: -3
    if (websiteTech.has_ga4 || websiteTech.has_google_ads_tag) {
      breakdown.sophistication_penalty.ga4_google_ads = -3;
    }

    // Multiple pixels (≥2): -4
    if (websiteTech.pixel_count >= 2) {
      breakdown.sophistication_penalty.multiple_pixels = -4;
    }

    // Marketing automation (HubSpot): -3
    if (websiteTech.has_hubspot) {
      breakdown.sophistication_penalty.marketing_automation = -3;
    }
  }

  breakdown.sophistication_penalty.total_before_cap =
    breakdown.sophistication_penalty.meta_pixel +
    breakdown.sophistication_penalty.ga4_google_ads +
    breakdown.sophistication_penalty.multiple_pixels +
    breakdown.sophistication_penalty.marketing_automation;

  // Cap penalty at -10
  breakdown.sophistication_penalty.capped_total = Math.max(
    breakdown.sophistication_penalty.total_before_cap,
    -10
  );

  // Calculate final score: clamp(SolvencyScore + Penalty, 0, 100)
  const rawScore = breakdown.solvency_score.total + breakdown.sophistication_penalty.capped_total;
  breakdown.final_score = Math.max(0, Math.min(100, rawScore));

  return {
    fit_score: breakdown.final_score,
    score_breakdown: breakdown,
  };
}

