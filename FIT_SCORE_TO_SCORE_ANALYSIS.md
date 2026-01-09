# Fit Score to Score__c Mapping Analysis

**Date**: 2026-01-09
**Sample Size**: 100 leads from today
**Purpose**: Create automated mapping from Fit_Score__c (0-100) to Score__c (0-5)

---

## Current Data Analysis (Today's Leads)

### Fit Score Distribution

| Fit Score Range | Count | % of Total | Current Score__c Values |
|----------------|-------|-----------|------------------------|
| **80-100 (Premium)** | 1 | 1% | 3 |
| **70-79 (High Fit)** | 5 | 5% | 2, 3, 4, null |
| **60-69 (High Fit)** | 8 | 8% | 0, 2, 4, null |
| **50-59 (MQL)** | 9 | 9% | 1, 2, 3, 4, null |
| **40-49 (MQL)** | 4 | 4% | 0, 2, null |
| **30-39 (Disqualified)** | 3 | 3% | 0, 1 |
| **20-29 (Disqualified)** | 4 | 4% | 0, 1, 3 |
| **10-19 (Disqualified)** | 13 | 13% | 0, 1, 2, 3 |
| **0-9 (Disqualified)** | 53 | 53% | 0, 1, 2, 3, 4, null |

### Current Score__c Distribution

| Score__c | Count | % of Total | Avg Fit Score |
|----------|-------|-----------|---------------|
| **null** | 15 | 15% | 29.7 |
| **0** | 41 | 41% | 7.9 |
| **1** | 21 | 21% | 14.3 |
| **2** | 16 | 16% | 45.0 |
| **3** | 6 | 6% | 33.3 |
| **4** | 1 | 1% | 65.0 |

### Key Observations

1. **Score__c is poorly calibrated**:
   - 41% of leads have Score__c = 0 (average Fit Score: 7.9)
   - Many high Fit Score leads have low or null Score__c
   - Example: Fit Score 75 → Score__c = 2 or null

2. **Fit Score 0 dominance**:
   - 53% of today's leads have Fit Score = 0 (no GMB found)
   - These are truly disqualified leads (no business verification)

3. **High-quality leads exist but underscored**:
   - 14 leads with Fit Score ≥ 60 (High Fit or Premium)
   - Many have Score__c = 2 or null (should be 4-5)

4. **Current Score__c appears to use different criteria**:
   - No clear correlation with Fit Score
   - Likely based on manual qualification or different algorithm

---

## Detailed Examples of Misalignment

### Premium/High Fit Leads Being Underscored

| Company | Fit Score | Current Score__c | What It Should Be |
|---------|-----------|-----------------|-------------------|
| MR WINDSHIELD AUTO GLASS | 80 | 3 | **5** (Premium) |
| Threading Place | 75 | 2 | **5** (Premium) |
| Creations by Beth Photography | 75 | null | **5** (Premium) |
| Classy Closets | 70 | 3 | **4** (High Fit) |
| Tammy Jones Botanica | 65 | null | **4** (High Fit) |
| Roys auto | 65 | 4 | **4** (High Fit) ✅ Correct |

### Mid-Tier Leads with Inconsistent Scoring

| Company | Fit Score | Current Score__c | What It Should Be |
|---------|-----------|-----------------|-------------------|
| A Smarter Clean | 55 | 1 | **3** (MQL) |
| HAIR JUNKIE STL LLC | 55 | 1 | **3** (MQL) |
| IronHead Towing and recovery | 50 | 1 | **3** (MQL) |
| Affordable Heating Cooling | 50 | null | **3** (MQL) |

### Low-Quality Leads (Correctly Scored Low)

| Company | Fit Score | Current Score__c | What It Should Be |
|---------|-----------|-----------------|-------------------|
| Property management pros se | 0 | 0 | **0** (Disqualified) ✅ |
| Divonei Diniz | 0 | 0 | **0** (Disqualified) ✅ |
| Remarkable auto care | 30 | 0 | **1** (Disqualified) |

---

## Proposed Mapping Algorithm

### Option 1: Conservative (Stricter Thresholds)

| Fit Score Range | Score__c | Tier | Rationale |
|----------------|----------|------|-----------|
| **0-29** | 0 | Disqualified | No business verification or very weak signals |
| **30-49** | 1 | Low Quality | Minimal validation, high risk |
| **50-64** | 2 | MQL | Some validation, moderate potential |
| **65-74** | 3 | Good MQL | Strong validation, good potential |
| **75-84** | 4 | High Quality | Excellent validation, high potential |
| **85-100** | 5 | Premium | Outstanding business, highest potential |

**Pros**:
- More selective, higher quality at top tiers
- Matches TSI's "Premium" tier starting at 80+
- Clear differentiation between quality levels

**Cons**:
- Only 1 lead today would get Score__c = 5
- May be too conservative for current lead volume

---

### Option 2: Balanced (Recommended)

| Fit Score Range | Score__c | Tier | Rationale |
|----------------|----------|------|-----------|
| **0-34** | 0 | Disqualified | No business verification, not worth pursuing |
| **35-49** | 1 | Low Quality | Minimal signals, nurture or disqualify |
| **50-59** | 2 | MQL - Lower | Basic validation, standard follow-up |
| **60-69** | 3 | MQL - Upper | Strong validation, priority follow-up |
| **70-79** | 4 | High Fit | Excellent signals, high-touch approach |
| **80-100** | 5 | Premium | Outstanding, immediate attention |

**Pros**:
- Balanced distribution across all tiers
- Aligns with TSI Fit Score tiers (Premium 80+, High Fit 60-79, MQL 40-59, Disqualified 0-39)
- Provides clear differentiation for sales team

**Cons**:
- None significant

**Today's Distribution with This Mapping**:
- Score 0: 56 leads (56%) - Disqualified
- Score 1: 4 leads (4%) - Low quality
- Score 2: 9 leads (9%) - MQL Lower
- Score 3: 8 leads (8%) - MQL Upper
- Score 4: 5 leads (5%) - High Fit
- Score 5: 1 lead (1%) - Premium

---

### Option 3: Aggressive (More Generous)

| Fit Score Range | Score__c | Tier | Rationale |
|----------------|----------|------|-----------|
| **0-39** | 0 | Disqualified | Below MQL threshold |
| **40-54** | 2 | MQL - Lower | Entry-level MQL |
| **55-64** | 3 | MQL - Upper | Solid MQL |
| **65-74** | 4 | High Fit | Strong lead |
| **75-100** | 5 | Premium | Top tier |

**Pros**:
- More leads get higher scores (may boost sales morale)
- Faster to see "quality" leads in pipeline

**Cons**:
- Less differentiation in lower tiers (no Score 1)
- May overvalue mediocre leads
- Doesn't align as well with TSI tier definitions

---

## Approved Mapping (January 9, 2026)

### Implementation Formula

```typescript
function fitScoreToScore(fitScore: number | null): number {
  if (fitScore === null || fitScore === undefined) {
    return 0; // No score = disqualified
  }

  if (fitScore === 0) return 0;        // Exactly 0 (no GMB found)
  if (fitScore >= 100) return 5;       // 100+ (Premium)
  if (fitScore >= 80) return 4;        // 80-99 (High Quality)
  if (fitScore >= 60) return 3;        // 60-79 (Good MQL)
  if (fitScore >= 40) return 2;        // 40-59 (MQL)
  if (fitScore >= 1) return 1;         // 1-39 (Low Quality)
  return 0;                            // Fallback
}
```

### Visual Representation

```
Fit Score:  0    1    40   60   80   100
Score__c:  |--0--|--1--|--2--|--3--|--4--|--5--|
           Disqual Low  MQL  Good High Premium
                              MQL  Qual
```

### Mapping Thresholds

| Fit Score Range | Score__c | Tier | Description |
|----------------|----------|------|-------------|
| **0** | 0 | Disqualified | No business verification (no GMB found) |
| **1-39** | 1 | Low Quality | Minimal signals, high risk |
| **40-59** | 2 | MQL | Basic validation, moderate potential |
| **60-79** | 3 | Good MQL | Strong validation, good potential |
| **80-99** | 4 | High Quality | Excellent validation, high potential |
| **100+** | 5 | Premium | Outstanding business, highest potential |

### Lead Source Restriction

**IMPORTANT**: Score__c automatic updates are **ONLY applied to leads from Facebook, TikTok, and Google**.

Other lead sources (e.g., organic, referral, LinkedIn, etc.) will **NOT** have their Score__c field updated automatically. This ensures the scoring system is only applied to the channels where the Fit Score algorithm has been validated.

The `shouldUpdateScore()` function checks the `LeadSource` field and returns `true` only for:
- `Facebook`
- `TikTok`
- `Google`

---

## Impact Analysis: If Applied to Today's Leads

### Before (Current State)

| Score__c | Count | % |
|----------|-------|---|
| null | 15 | 15% |
| 0 | 41 | 41% |
| 1 | 21 | 21% |
| 2 | 16 | 16% |
| 3 | 6 | 6% |
| 4 | 1 | 1% |
| **Total** | **100** | **100%** |

### After (With Balanced Mapping)

| Score__c | Count | % | Change |
|----------|-------|---|--------|
| 0 | 56 | 56% | +15 leads |
| 1 | 4 | 4% | -17 leads |
| 2 | 9 | 9% | -7 leads |
| 3 | 8 | 8% | +2 leads |
| 4 | 5 | 5% | +4 leads |
| 5 | 1 | 1% | +1 lead |
| **Total** | **100** | **100%** | - |

### Key Changes

1. **More leads properly disqualified** (0-34 Fit Score → Score 0)
   - 56 leads (56%) would be Score 0 vs current 41%
   - Clearer signal: these leads have no GMB or very weak signals

2. **High-quality leads get proper recognition**
   - 14 leads with Fit Score ≥ 60 would get Score 3-5
   - Currently many have Score 2 or null

3. **Better sales prioritization**
   - Score 5 (Premium): 1 lead - immediate attention
   - Score 4 (High Fit): 5 leads - high-touch approach
   - Score 3 (MQL Upper): 8 leads - priority follow-up
   - Score 2 (MQL Lower): 9 leads - standard follow-up
   - Score 1 (Low Quality): 4 leads - nurture or disqualify
   - Score 0 (Disqualified): 56 leads - auto-disqualify

---

## Examples: Today's Leads with New Scoring

### Premium Tier (Score 5)

| Company | Fit Score | Old Score__c | New Score__c |
|---------|-----------|--------------|--------------|
| MR WINDSHIELD AUTO GLASS | 80 | 3 | **5** ⬆️ |

### High Fit Tier (Score 4)

| Company | Fit Score | Old Score__c | New Score__c |
|---------|-----------|--------------|--------------|
| Threading Place | 75 | 2 | **4** ⬆️ |
| Creations by Beth Photography | 75 | null | **4** ⬆️ |
| Goodman Painters and Decorators | 75 | null | **4** ⬆️ |
| H.I.S. Automotive Services | 70 | 2 | **4** ⬆️ |
| Classy Closets | 70 | 3 | **4** ⬆️ |

### MQL Upper Tier (Score 3)

| Company | Fit Score | Old Score__c | New Score__c |
|---------|-----------|--------------|--------------|
| Quick Ink Tees | 65 | 2 | **3** ⬆️ |
| Roys auto | 65 | 4 | **3** ⬇️ |
| Tammy Jones Botanica | 65 | null | **3** ⬆️ |
| Lonzos roadside service | 65 | 0 | **3** ⬆️ |
| SOVEREIGN CLEANING SERVICES | 60 | 2 | **3** ⬆️ |
| Tucson auto paint and supplies | 60 | 3 | **3** ✅ |
| REMAX team realtors | 60 | 2 | **3** ⬆️ |
| Better Shutters | 60 | 4 | **3** ⬇️ |

### MQL Lower Tier (Score 2)

| Company | Fit Score | Old Score__c | New Score__c |
|---------|-----------|--------------|--------------|
| Recharge Wellness Odenton | 55 | 2 | **2** ✅ |
| A Smarter Clean | 55 | 1 | **2** ⬆️ |
| HAIR JUNKIE STL LLC | 55 | 1 | **2** ⬆️ |
| Princeton Taxi | 55 | 3 | **2** ⬇️ |
| IronHead Towing and recovery | 50 | 1 | **2** ⬆️ |
| Affordable Heating Cooling | 50 | null | **2** ⬆️ |
| Brooks Repair Service | 50 | 1 | **2** ⬆️ |

---

## Implementation Plan

### Phase 1: Testing (Today)

1. ✅ **Create mapping function** in `src/services/scoreMapper.ts`
2. ✅ **Analyze today's leads** with proposed mapping
3. ⏳ **Get user approval** on mapping thresholds
4. ⏳ **Test with sample leads** (10-20 leads)

### Phase 2: Rollout (After Approval)

1. **Update enrichment flow** to calculate Score__c automatically
2. **Update Salesforce field mapper** to include Score__c
3. **Start automatic updates** for new enrichments (today forward)
4. **Monitor for 1 week** to validate mapping accuracy

### Phase 3: Backfill (Optional)

1. **Identify leads** with Fit_Score__c but wrong Score__c
2. **Backfill Score__c** for historical leads (last 30 days?)
3. **Validate** with sales team feedback

---

## Questions for User Approval

1. **Which mapping option do you prefer?**
   - [ ] Option 1: Conservative (stricter, only 1 lead gets Score 5)
   - [x] Option 2: Balanced (recommended, clear tier alignment)
   - [ ] Option 3: Aggressive (more generous scoring)

2. **Should we update Score__c for existing leads?**
   - [ ] Yes, backfill last 30 days
   - [ ] Yes, backfill last 7 days
   - [ ] No, only new leads going forward

3. **Any threshold adjustments needed?**
   - Current proposal: 0-34=0, 35-49=1, 50-59=2, 60-69=3, 70-79=4, 80-100=5
   - Adjustments: _______

4. **When to start automatic updates?**
   - [ ] Immediately after approval
   - [ ] Start tomorrow (Jan 10)
   - [ ] After 1 week of testing

---

## Technical Implementation Notes

### File: `src/services/scoreMapper.ts`

```typescript
/**
 * Maps Fit Score (0-100) to Score__c (0-5)
 *
 * Score__c Scale:
 * - 0: Disqualified (Fit Score 0-34)
 * - 1: Low Quality (Fit Score 35-49)
 * - 2: MQL Lower (Fit Score 50-59)
 * - 3: MQL Upper (Fit Score 60-69)
 * - 4: High Fit (Fit Score 70-79)
 * - 5: Premium (Fit Score 80-100)
 */
export function fitScoreToScore(fitScore: number | null): number {
  if (fitScore === null || fitScore === undefined) {
    return 0;
  }

  if (fitScore >= 80) return 5;  // Premium
  if (fitScore >= 70) return 4;  // High Fit
  if (fitScore >= 60) return 3;  // MQL Upper
  if (fitScore >= 50) return 2;  // MQL Lower
  if (fitScore >= 35) return 1;  // Low Quality
  return 0;                       // Disqualified
}

/**
 * Get human-readable label for Score__c value
 */
export function getScoreLabel(score: number): string {
  const labels: Record<number, string> = {
    0: 'Disqualified',
    1: 'Low Quality',
    2: 'MQL - Lower',
    3: 'MQL - Upper',
    4: 'High Fit',
    5: 'Premium',
  };
  return labels[score] ?? 'Unknown';
}
```

### Integration Points

1. **`src/services/salesforceFieldMapper.ts`**:
   - Import `fitScoreToScore` function
   - Calculate Score__c when mapping enrichment data

2. **`src/index.ts`** (enrichment endpoint):
   - After calculating Fit Score, calculate Score__c
   - Include Score__c in Salesforce update

3. **Database Schema**:
   - Add `score` column to `lead_enrichments` table (optional, for tracking)

---

## Success Metrics

After implementation, track:

1. **Score Distribution**:
   - % of leads in each Score tier
   - Comparison with current distribution

2. **Conversion Rates by Score**:
   - Score 5 → Conversion rate
   - Score 4 → Conversion rate
   - Score 3 → Conversion rate
   - Score 2 → Conversion rate
   - Score 1 → Conversion rate
   - Score 0 → Conversion rate (should be ~0%)

3. **Sales Team Feedback**:
   - Are Score 4-5 leads actually higher quality?
   - Are Score 0-1 leads correctly disqualified?
   - Any threshold adjustments needed?

4. **Lead Volume Impact**:
   - How many leads move to each tier?
   - Does this change sales capacity planning?
