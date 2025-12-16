import { calculateFitScore } from '../../worker/src/services/fitScore';
import { EnrichmentData } from '@tsi-fit-score/shared';

describe('Fit Score Calculation', () => {
  describe('Solvency Score Components', () => {
    test('should award 10 points for website presence', () => {
      const data: EnrichmentData = {
        website_tech: {
          has_meta_pixel: false,
          has_ga4: false,
          has_google_ads_tag: false,
          has_tiktok_pixel: false,
          has_hubspot: false,
          pixel_count: 0,
          marketing_tools_detected: [],
        },
      };

      const result = calculateFitScore(data);
      expect(result.score_breakdown.solvency_score.website).toBe(10);
    });

    test('should award 0 points for reviews < 5', () => {
      const data: EnrichmentData = {
        google_places: {
          gmb_review_count: 4,
        },
      };

      const result = calculateFitScore(data);
      expect(result.score_breakdown.solvency_score.reviews).toBe(0);
    });

    test('should award 10 points for reviews 5-14', () => {
      const data: EnrichmentData = {
        google_places: {
          gmb_review_count: 10,
        },
      };

      const result = calculateFitScore(data);
      expect(result.score_breakdown.solvency_score.reviews).toBe(10);
    });

    test('should award 20 points for reviews 15-29', () => {
      const data: EnrichmentData = {
        google_places: {
          gmb_review_count: 20,
        },
      };

      const result = calculateFitScore(data);
      expect(result.score_breakdown.solvency_score.reviews).toBe(20);
    });

    test('should award 25 points for reviews ≥ 30', () => {
      const data: EnrichmentData = {
        google_places: {
          gmb_review_count: 35,
        },
      };

      const result = calculateFitScore(data);
      expect(result.score_breakdown.solvency_score.reviews).toBe(25);
    });

    test('should award 0 points for years < 2', () => {
      const data: EnrichmentData = {
        clay: {
          years_in_business: 1,
        },
      };

      const result = calculateFitScore(data);
      expect(result.score_breakdown.solvency_score.years_in_business).toBe(0);
    });

    test('should award 10 points for years 2-3', () => {
      const data: EnrichmentData = {
        clay: {
          years_in_business: 2,
        },
      };

      const result = calculateFitScore(data);
      expect(result.score_breakdown.solvency_score.years_in_business).toBe(10);
    });

    test('should award 15 points for years 4-7', () => {
      const data: EnrichmentData = {
        clay: {
          years_in_business: 5,
        },
      };

      const result = calculateFitScore(data);
      expect(result.score_breakdown.solvency_score.years_in_business).toBe(15);
    });

    test('should award 20 points for years ≥ 8', () => {
      const data: EnrichmentData = {
        clay: {
          years_in_business: 10,
        },
      };

      const result = calculateFitScore(data);
      expect(result.score_breakdown.solvency_score.years_in_business).toBe(20);
    });

    test('should award 0 points for employees < 3', () => {
      const data: EnrichmentData = {
        clay: {
          employee_estimate: 2,
        },
      };

      const result = calculateFitScore(data);
      expect(result.score_breakdown.solvency_score.employees).toBe(0);
    });

    test('should award 10 points for employees 3-5', () => {
      const data: EnrichmentData = {
        clay: {
          employee_estimate: 4,
        },
      };

      const result = calculateFitScore(data);
      expect(result.score_breakdown.solvency_score.employees).toBe(10);
    });

    test('should award 15 points for employees 6-15', () => {
      const data: EnrichmentData = {
        clay: {
          employee_estimate: 10,
        },
      };

      const result = calculateFitScore(data);
      expect(result.score_breakdown.solvency_score.employees).toBe(15);
    });

    test('should award 20 points for employees ≥ 16', () => {
      const data: EnrichmentData = {
        clay: {
          employee_estimate: 20,
        },
      };

      const result = calculateFitScore(data);
      expect(result.score_breakdown.solvency_score.employees).toBe(20);
    });

    test('should award 5 points for operational physical location', () => {
      const data: EnrichmentData = {
        google_places: {
          gmb_is_operational: true,
          gmb_address: '123 Main St',
        },
      };

      const result = calculateFitScore(data);
      expect(result.score_breakdown.solvency_score.physical_location).toBe(5);
    });

    test('should not award points for non-operational location', () => {
      const data: EnrichmentData = {
        google_places: {
          gmb_is_operational: false,
          gmb_address: '123 Main St',
        },
      };

      const result = calculateFitScore(data);
      expect(result.score_breakdown.solvency_score.physical_location).toBe(0);
    });
  });

  describe('Sophistication Penalties', () => {
    test('should apply -7 penalty for Meta Pixel', () => {
      const data: EnrichmentData = {
        website_tech: {
          has_meta_pixel: true,
          has_ga4: false,
          has_google_ads_tag: false,
          has_tiktok_pixel: false,
          has_hubspot: false,
          pixel_count: 1,
          marketing_tools_detected: ['meta'],
        },
      };

      const result = calculateFitScore(data);
      expect(result.score_breakdown.sophistication_penalty.meta_pixel).toBe(-7);
    });

    test('should apply -5 penalty for GA4', () => {
      const data: EnrichmentData = {
        website_tech: {
          has_meta_pixel: false,
          has_ga4: true,
          has_google_ads_tag: false,
          has_tiktok_pixel: false,
          has_hubspot: false,
          pixel_count: 1,
          marketing_tools_detected: ['ga4'],
        },
      };

      const result = calculateFitScore(data);
      expect(result.score_breakdown.sophistication_penalty.ga4_google_ads).toBe(-5);
    });

    test('should apply -5 penalty for Google Ads tag', () => {
      const data: EnrichmentData = {
        website_tech: {
          has_meta_pixel: false,
          has_ga4: false,
          has_google_ads_tag: true,
          has_tiktok_pixel: false,
          has_hubspot: false,
          pixel_count: 1,
          marketing_tools_detected: ['google_ads'],
        },
      };

      const result = calculateFitScore(data);
      expect(result.score_breakdown.sophistication_penalty.ga4_google_ads).toBe(-5);
    });

    test('should apply -10 penalty for multiple pixels (≥2)', () => {
      const data: EnrichmentData = {
        website_tech: {
          has_meta_pixel: true,
          has_ga4: true,
          has_google_ads_tag: false,
          has_tiktok_pixel: false,
          has_hubspot: false,
          pixel_count: 2,
          marketing_tools_detected: ['meta', 'ga4'],
        },
      };

      const result = calculateFitScore(data);
      expect(result.score_breakdown.sophistication_penalty.multiple_pixels).toBe(-10);
    });

    test('should apply -5 penalty for HubSpot', () => {
      const data: EnrichmentData = {
        website_tech: {
          has_meta_pixel: false,
          has_ga4: false,
          has_google_ads_tag: false,
          has_tiktok_pixel: false,
          has_hubspot: true,
          pixel_count: 0,
          marketing_tools_detected: ['hubspot'],
        },
      };

      const result = calculateFitScore(data);
      expect(result.score_breakdown.sophistication_penalty.marketing_automation).toBe(-5);
    });

    test('should cap total penalty at -20', () => {
      const data: EnrichmentData = {
        website_tech: {
          has_meta_pixel: true,
          has_ga4: true,
          has_google_ads_tag: true,
          has_tiktok_pixel: true,
          has_hubspot: true,
          pixel_count: 4,
          marketing_tools_detected: ['meta', 'ga4', 'google_ads', 'tiktok', 'hubspot'],
        },
      };

      const result = calculateFitScore(data);
      // Total before cap: -7 -5 -10 -5 = -27
      expect(result.score_breakdown.sophistication_penalty.total_before_cap).toBe(-27);
      // Should be capped at -20
      expect(result.score_breakdown.sophistication_penalty.capped_total).toBe(-20);
    });
  });

  describe('Final Score and Tier Mapping', () => {
    test('should clamp score to 0 minimum', () => {
      const data: EnrichmentData = {
        website_tech: {
          has_meta_pixel: true,
          has_ga4: true,
          has_google_ads_tag: true,
          has_tiktok_pixel: true,
          has_hubspot: true,
          pixel_count: 4,
          marketing_tools_detected: ['meta', 'ga4', 'google_ads', 'tiktok', 'hubspot'],
        },
      };

      const result = calculateFitScore(data);
      expect(result.fit_score).toBeGreaterThanOrEqual(0);
    });

    test('should clamp score to 100 maximum', () => {
      const data: EnrichmentData = {
        google_places: {
          gmb_review_count: 50,
          gmb_is_operational: true,
          gmb_address: '123 Main St',
        },
        clay: {
          years_in_business: 15,
          employee_estimate: 25,
        },
        website_tech: {
          has_meta_pixel: false,
          has_ga4: false,
          has_google_ads_tag: false,
          has_tiktok_pixel: false,
          has_hubspot: false,
          pixel_count: 0,
          marketing_tools_detected: [],
        },
      };

      const result = calculateFitScore(data);
      expect(result.fit_score).toBeLessThanOrEqual(100);
    });

    test('should map 0-39 to Disqualified', () => {
      const data: EnrichmentData = {
        website_tech: {
          has_meta_pixel: true,
          has_ga4: true,
          has_google_ads_tag: true,
          has_tiktok_pixel: false,
          has_hubspot: false,
          pixel_count: 3,
          marketing_tools_detected: ['meta', 'ga4', 'google_ads'],
        },
      };

      const result = calculateFitScore(data);
      expect(result.fit_tier).toBe('Disqualified');
      expect(result.fit_score).toBeLessThan(40);
    });

    test('should map 40-59 to MQL', () => {
      const data: EnrichmentData = {
        google_places: {
          gmb_review_count: 8,
        },
        website_tech: {
          has_meta_pixel: false,
          has_ga4: false,
          has_google_ads_tag: false,
          has_tiktok_pixel: false,
          has_hubspot: false,
          pixel_count: 0,
          marketing_tools_detected: [],
        },
      };

      const result = calculateFitScore(data);
      expect(result.fit_tier).toBe('MQL');
      expect(result.fit_score).toBeGreaterThanOrEqual(40);
      expect(result.fit_score).toBeLessThan(60);
    });

    test('should map 60-79 to High Fit', () => {
      const data: EnrichmentData = {
        google_places: {
          gmb_review_count: 20,
          gmb_is_operational: true,
          gmb_address: '123 Main St',
        },
        clay: {
          years_in_business: 5,
          employee_estimate: 8,
        },
        website_tech: {
          has_meta_pixel: false,
          has_ga4: false,
          has_google_ads_tag: false,
          has_tiktok_pixel: false,
          has_hubspot: false,
          pixel_count: 0,
          marketing_tools_detected: [],
        },
      };

      const result = calculateFitScore(data);
      expect(result.fit_tier).toBe('High Fit');
      expect(result.fit_score).toBeGreaterThanOrEqual(60);
      expect(result.fit_score).toBeLessThan(80);
    });

    test('should map 80-100 to Premium', () => {
      const data: EnrichmentData = {
        google_places: {
          gmb_review_count: 35,
          gmb_is_operational: true,
          gmb_address: '123 Main St',
        },
        clay: {
          years_in_business: 10,
          employee_estimate: 20,
        },
        website_tech: {
          has_meta_pixel: false,
          has_ga4: false,
          has_google_ads_tag: false,
          has_tiktok_pixel: false,
          has_hubspot: false,
          pixel_count: 0,
          marketing_tools_detected: [],
        },
      };

      const result = calculateFitScore(data);
      expect(result.fit_tier).toBe('Premium');
      expect(result.fit_score).toBeGreaterThanOrEqual(80);
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty enrichment data', () => {
      const data: EnrichmentData = {};
      const result = calculateFitScore(data);
      expect(result.fit_score).toBe(0);
      expect(result.fit_tier).toBe('Disqualified');
    });

    test('should handle null/undefined values gracefully', () => {
      const data: EnrichmentData = {
        google_places: {
          gmb_review_count: undefined as any,
        },
        clay: {
          employee_estimate: undefined as any,
          years_in_business: undefined as any,
        },
      };

      const result = calculateFitScore(data);
      expect(result.fit_score).toBeGreaterThanOrEqual(0);
      expect(result.fit_score).toBeLessThanOrEqual(100);
    });

    test('should calculate maximum possible score', () => {
      const data: EnrichmentData = {
        google_places: {
          gmb_review_count: 50,
          gmb_is_operational: true,
          gmb_address: '123 Main St',
        },
        clay: {
          years_in_business: 15,
          employee_estimate: 25,
        },
        website_tech: {
          has_meta_pixel: false,
          has_ga4: false,
          has_google_ads_tag: false,
          has_tiktok_pixel: false,
          has_hubspot: false,
          pixel_count: 0,
          marketing_tools_detected: [],
        },
      };

      const result = calculateFitScore(data);
      // Max solvency: 10 + 25 + 20 + 20 + 5 = 80
      expect(result.score_breakdown.solvency_score.total).toBe(80);
      expect(result.fit_score).toBe(80);
    });
  });
});

