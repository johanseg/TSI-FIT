/**
 * Score Mapper Service
 *
 * Maps Fit Score (0-100) to Salesforce Score__c (0-5)
 *
 * This mapping is ONLY applied to leads from Facebook, TikTok, and Google.
 * Other lead sources do not receive automatic Score__c updates.
 */

/**
 * Maps Fit Score (0-100) to Score__c (0-5)
 *
 * Mapping thresholds:
 * - 0: Score 0 (Disqualified - no business verification)
 * - 1-39: Score 1 (Low Quality - minimal signals)
 * - 40-59: Score 2 (MQL - basic validation)
 * - 60-79: Score 3 (Good MQL - strong validation)
 * - 80-99: Score 4 (High Quality - excellent validation)
 * - 100+: Score 5 (Premium - outstanding business)
 *
 * @param fitScore - Fit Score value (0-100)
 * @returns Score__c value (0-5)
 */
export function fitScoreToScore(fitScore: number | null | undefined): number {
  // Null or undefined fit score = disqualified
  if (fitScore === null || fitScore === undefined) {
    return 0;
  }

  // Apply mapping thresholds
  if (fitScore === 0) return 0;        // Exactly 0 (no GMB found)
  if (fitScore >= 100) return 5;       // 100+ (Premium)
  if (fitScore >= 80) return 4;        // 80-99 (High Quality)
  if (fitScore >= 60) return 3;        // 60-79 (Good MQL)
  if (fitScore >= 40) return 2;        // 40-59 (MQL)
  if (fitScore >= 1) return 1;         // 1-39 (Low Quality)
  return 0;                            // Fallback (shouldn't reach here)
}

/**
 * Get human-readable label for Score__c value
 *
 * @param score - Score__c value (0-5)
 * @returns Human-readable label
 */
export function getScoreLabel(score: number): string {
  const labels: Record<number, string> = {
    0: 'Disqualified',
    1: 'Low Quality',
    2: 'MQL',
    3: 'Good MQL',
    4: 'High Quality',
    5: 'Premium',
  };
  return labels[score] ?? 'Unknown';
}

/**
 * Check if a lead source should receive automatic Score__c updates
 *
 * Only Facebook, TikTok, and Google leads receive automatic Score__c updates.
 * This restriction is based on user requirements to limit scope to these channels.
 *
 * @param leadSource - Salesforce Lead.LeadSource value
 * @returns true if lead source should receive Score__c updates
 */
export function shouldUpdateScore(leadSource: string | null | undefined): boolean {
  if (!leadSource) return false;

  const allowedSources = ['facebook', 'tiktok', 'google'];
  const normalizedSource = leadSource.toLowerCase().trim();

  return allowedSources.includes(normalizedSource);
}

/**
 * Calculate Score__c from Fit Score with lead source filtering
 *
 * @param fitScore - Fit Score value (0-100)
 * @param leadSource - Salesforce Lead.LeadSource value
 * @returns Score__c value (0-5) if lead source is allowed, null otherwise
 */
export function calculateScore(
  fitScore: number | null | undefined,
  leadSource: string | null | undefined
): number | null {
  // Check if lead source should receive Score__c updates
  if (!shouldUpdateScore(leadSource)) {
    return null; // Don't update Score__c for non-allowed sources
  }

  return fitScoreToScore(fitScore);
}
