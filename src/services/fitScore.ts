import {
  EnrichmentData,
  FitScoreResult,
  ScoreBreakdown,
} from '../types/lead';

/**
 * Calculate Fit Score based on enrichment data
 * 
 * Solvency Score (0-80):
 * - Website: +10 if present
 * - Reviews: +0 (<5), +10 (5-14), +20 (15-29), +25 (≥30)
 * - Years in business: +0 (<2), +10 (2-3), +15 (4-7), +20 (≥8)
 * - Employees: +0 (<3), +10 (3-5), +15 (6-15), +20 (≥16)
 * - Physical location: +5 if operational
 * 
 * Sophistication Penalty (0 to -27, half strength, capped at -20):
 * - Meta Pixel: -7
 * - GA4/Google Ads: -5
 * - Multiple pixels (≥2): -10
 * - Marketing automation: -5
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
  const clay = enrichmentData.clay;
  const websiteTech = enrichmentData.website_tech;

  // Website: +10 if present
  if (websiteTech?.has_meta_pixel !== undefined || googlePlaces) {
    // We consider website present if we have any website tech data or Google Places data
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
  const yearsInBusiness = clay?.years_in_business ?? 0;
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
  const employees = clay?.employee_estimate ?? 0;
  if (employees >= 16) {
    breakdown.solvency_score.employees = 20;
  } else if (employees >= 6) {
    breakdown.solvency_score.employees = 15;
  } else if (employees >= 3) {
    breakdown.solvency_score.employees = 10;
  } else {
    breakdown.solvency_score.employees = 0;
  }

  // Physical location: +5 if operational
  if (googlePlaces?.gmb_is_operational === true && googlePlaces?.gmb_address) {
    breakdown.solvency_score.physical_location = 5;
  }

  breakdown.solvency_score.total =
    breakdown.solvency_score.website +
    breakdown.solvency_score.reviews +
    breakdown.solvency_score.years_in_business +
    breakdown.solvency_score.employees +
    breakdown.solvency_score.physical_location;

  // Calculate Sophistication Penalty (0 to -27, half strength, capped at -20)
  if (websiteTech) {
    // Meta Pixel: -7
    if (websiteTech.has_meta_pixel) {
      breakdown.sophistication_penalty.meta_pixel = -7;
    }

    // GA4/Google Ads: -5
    if (websiteTech.has_ga4 || websiteTech.has_google_ads_tag) {
      breakdown.sophistication_penalty.ga4_google_ads = -5;
    }

    // Multiple pixels (≥2): -10
    if (websiteTech.pixel_count >= 2) {
      breakdown.sophistication_penalty.multiple_pixels = -10;
    }

    // Marketing automation (HubSpot): -5
    if (websiteTech.has_hubspot) {
      breakdown.sophistication_penalty.marketing_automation = -5;
    }
  }

  breakdown.sophistication_penalty.total_before_cap =
    breakdown.sophistication_penalty.meta_pixel +
    breakdown.sophistication_penalty.ga4_google_ads +
    breakdown.sophistication_penalty.multiple_pixels +
    breakdown.sophistication_penalty.marketing_automation;

  // Cap penalty at -20
  breakdown.sophistication_penalty.capped_total = Math.max(
    breakdown.sophistication_penalty.total_before_cap,
    -20
  );

  // Calculate final score: clamp(SolvencyScore + Penalty, 0, 100)
  const rawScore = breakdown.solvency_score.total + breakdown.sophistication_penalty.capped_total;
  breakdown.final_score = Math.max(0, Math.min(100, rawScore));

  // Determine tier
  let fitTier: 'Disqualified' | 'MQL' | 'High Fit' | 'Premium';
  if (breakdown.final_score >= 80) {
    fitTier = 'Premium';
  } else if (breakdown.final_score >= 60) {
    fitTier = 'High Fit';
  } else if (breakdown.final_score >= 40) {
    fitTier = 'MQL';
  } else {
    fitTier = 'Disqualified';
  }

  return {
    fit_score: breakdown.final_score,
    fit_tier: fitTier,
    score_breakdown: breakdown,
  };
}

