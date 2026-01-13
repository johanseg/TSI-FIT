/**
 * Score Mapper Service
 *
 * Maps Fit Score (0-100) to Salesforce Score__c (0-5)
 *
 * This mapping is ONLY applied to leads from Facebook, TikTok, and Google.
 * Other lead sources do not receive automatic Score__c updates.
 */

// Lead sources that receive automatic Score__c updates
const ALLOWED_LEAD_SOURCES = ['facebook', 'tiktok', 'google'];

// Score labels for display
const SCORE_LABELS: Record<number, string> = {
  0: 'Disqualified',
  1: 'Low Quality',
  2: 'MQL',
  3: 'Good MQL',
  4: 'High Quality',
  5: 'Premium',
};

/**
 * Maps Fit Score (0-100) to Score__c (0-5)
 *
 * Mapping thresholds:
 * - 0: Score 0 (Disqualified)
 * - 1-39: Score 1 (Low Quality)
 * - 40-59: Score 2 (MQL)
 * - 60-79: Score 3 (Good MQL)
 * - 80-99: Score 4 (High Quality)
 * - 100: Score 5 (Premium)
 */
export function fitScoreToScore(fitScore: number | null | undefined): number {
  if (fitScore == null || fitScore === 0) return 0;
  if (fitScore >= 100) return 5;
  if (fitScore >= 80) return 4;
  if (fitScore >= 60) return 3;
  if (fitScore >= 40) return 2;
  return 1;
}

/**
 * Get human-readable label for Score__c value
 */
export function getScoreLabel(score: number): string {
  return SCORE_LABELS[score] ?? 'Unknown';
}

/**
 * Check if a lead source should receive automatic Score__c updates
 */
export function shouldUpdateScore(leadSource: string | null | undefined): boolean {
  if (!leadSource) return false;
  return ALLOWED_LEAD_SOURCES.includes(leadSource.toLowerCase().trim());
}

/**
 * Calculate Score__c from Fit Score with lead source filtering
 * Returns null if lead source is not in the allowed list
 */
export function calculateScore(
  fitScore: number | null | undefined,
  leadSource: string | null | undefined
): number | null {
  if (!shouldUpdateScore(leadSource)) {
    return null;
  }
  return fitScoreToScore(fitScore);
}
