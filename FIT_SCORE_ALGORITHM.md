# TSI Fit Score Algorithm - Technical Review

**Last Updated**: 2026-01-09
**Algorithm Version**: 2.0 (with GMB Match Bonus & Refined Location Scoring)

---

## Overview

The TSI Fit Score is a **0-100 point** scoring system that evaluates lead quality based on business solvency indicators and marketing sophistication. The score predicts likelihood of conversion and long-term customer retention.

**Core Philosophy**: Established businesses with verified online presence, customer validation, and commercial locations are higher-quality leads.

---

## Scoring Components

### Total Score Calculation
```
Final Score = min(100, Solvency Score + Pixel Bonus)

Where:
- Solvency Score: 0-95 points (business fundamentals)
- Pixel Bonus: 0-10 points (marketing sophistication)
```

---

## Solvency Score Breakdown (0-95 points)

### 1. GMB Match (+10 points)
**Award Criteria**: Google Business Profile found (place_id exists)

**Why It Matters**:
- Verified business entity by Google
- Indicates business legitimacy and public presence
- Required for local search visibility

**Implementation**:
```typescript
if (googlePlaces?.place_id) {
  score += 10;
}
```

---

### 2. Website (+0/+5/+15 points)
**Scoring Logic**:
- **+15 points**: Custom domain (e.g., `abcroofing.com`)
- **+5 points**: Google/GMB website (e.g., `business.site`)
- **+0 points**: Subdomain or no website (e.g., `shop.wix.com/mystore`)

**Why It Matters**:
- Custom domains show business investment and permanence
- GMB sites show minimal digital presence
- Subdomains often indicate low-commitment web presence

**Detection Logic**:
```typescript
const websiteUrl = googlePlaces?.gmb_website || pdl?.website_confirmed;

if (isGoogleOrGmbUrl(websiteUrl)) {
  score += 5;  // GMB/Google URL
} else if (isSubdomain(websiteUrl)) {
  score += 0;  // Subdomain
} else if (websiteUrl) {
  score += 15; // Custom domain
}
```

**Subdomain Detection**:
- `example.com` → NOT subdomain (+15)
- `www.example.com` → NOT subdomain (+15)
- `shop.example.com` → Subdomain (+0)
- `example.co.uk` → NOT subdomain (+15, common TLD)

---

### 3. Google Reviews (+0/+10/+20/+25 points)
**Scoring Tiers**:
- **0-4 reviews**: +0 points (insufficient validation)
- **5-14 reviews**: +10 points (emerging presence)
- **15-29 reviews**: +20 points (established business)
- **30+ reviews**: +25 points (strong reputation)

**Why It Matters**:
- Reviews = customer validation and service quality
- High review counts indicate longevity and satisfied customers
- Strong predictor of business stability

**Implementation**:
```typescript
const reviewCount = googlePlaces?.gmb_review_count ?? 0;

if (reviewCount >= 30) {
  score += 25;
} else if (reviewCount >= 15) {
  score += 20;
} else if (reviewCount >= 5) {
  score += 10;
} else {
  score += 0;
}
```

---

### 4. Years in Business (+0/+5/+10/+15 points)
**Scoring Tiers**:
- **0-1 years**: +0 points (startup, high risk)
- **2-3 years**: +5 points (survived initial phase)
- **4-7 years**: +10 points (established)
- **8+ years**: +15 points (proven longevity)

**Data Source Priority**:
1. People Data Labs (PDL) `years_in_business`
2. Clay (legacy) `years_in_business`

**Why It Matters**:
- Longer tenure = lower churn risk
- Established businesses more likely to invest in long-term services
- Past 3-year survival indicates business viability

---

### 5. Employees (+0/+5/+15 points)
**Scoring Tiers**:
- **0-1 employees**: +0 points (solopreneur, limited capacity)
- **2-4 employees**: +5 points (small team)
- **5+ employees**: +15 points (established team)

**Data Source Priority**:
1. PDL `employee_count` (exact number)
2. PDL `size_range` (parsed to number, e.g., "1-10" → 6)
3. Clay `employee_estimate` (legacy)

**Why It Matters**:
- Team size indicates business scale and capacity
- Multi-person businesses have more stability
- Larger teams can better absorb service contracts

---

### 6. Physical Location (+0/+10/+20 points)
**Scoring Logic**:
- **+20 points**: Storefront or Office (commercial location)
- **+10 points**: Service Area Business (home-based/mobile)
- **+0 points**: Residential or Unknown

**Classification Algorithm**:

#### Step 1: Check `pureServiceAreaBusiness` Flag
```typescript
if (googlePlacesData.is_service_area_business === true) {
  return 'service_area'; // +10 points
}
```
**Most reliable indicator** from Google Places API v1. Identifies home-based contractors.

#### Step 2: Check Google Business Types
**Storefront Types** (+20 points):
- Retail: `store`, `shop`, `retail`, `restaurant`, `cafe`, `bakery`, `bar`
- Personal services: `beauty_salon`, `hair_care`, `spa`, `gym`, `fitness_center`
- Auto: `car_dealer`, `car_wash`, `gas_station`
- Shopping: `pharmacy`, `florist`, `grocery`, `supermarket`, `convenience_store`

**Office Types** (+20 points):
- Professional: `doctor`, `dentist`, `hospital`, `lawyer`, `attorney`, `accountant`
- Financial: `real_estate_agency`, `insurance_agency`, `bank`, `finance`
- Services: `car_repair`, `auto_repair`, `mechanic`, `storage`, `moving_company`

**Contractor Types** (+10 or +20, conditional):
- Home services: `plumber`, `electrician`, `roofing_contractor`, `hvac`, `landscaper`
- Maintenance: `pest_control`, `cleaning`, `carpet_cleaning`, `handyman`, `locksmith`
- Construction: `general_contractor`, `painter`, `construction`, `remodeling`
- Auto detailing: `car_detailing`, `auto_detailing`, `mobile_car_wash`

**Contractor Classification Rules**:
```typescript
if (isContractorType) {
  if (gmb_review_count >= 15 && gmb_address && gmb_is_operational) {
    return 'office'; // +20 points - Established contractor with real shop
  } else {
    return 'service_area'; // +10 points - Home-based contractor
  }
}
```

**Residential Types** (+0 points):
- `lodging`, `campground`, `rv_park`, `hotel`, `motel`, `resort`, `apartment`

#### Step 3: Default for Unknown Types
```typescript
if (gmb_is_operational && gmb_address) {
  return 'service_area'; // +10 for GMB verification
}
return null; // +0 points
```

**Why This Matters**:
- **Recent Fix (Jan 9, 2026)**: Previously, contractors and unknowns defaulted to "office" (+20), over-scoring home-based businesses
- **New Logic**: Service area businesses get +10 for verified GMB, but not +20 unless certain of commercial location
- Example: Mobile auto detailer now gets +10 instead of +20

---

### 7. Marketing Spend (+0/+5/+10 points)
**Scoring Logic**:
- **$0**: +0 points (no marketing budget)
- **$1-$499**: +5 points (small marketing investment)
- **$500+**: +10 points (significant marketing commitment)

**Data Source**: Currently not populated (future enhancement)

**Why It Matters**:
- Businesses spending on marketing are growth-oriented
- Marketing investment indicates cash flow and business sophistication

---

## Pixel Bonus (0-10 points)

**Scoring Logic**:
- **0 pixels**: +0 points
- **1 pixel**: +5 points
- **2+ pixels**: +10 points

**Tracked Pixels**:
- Meta Pixel (Facebook)
- Google Analytics 4 (GA4)
- Google Ads Tag
- TikTok Pixel
- HubSpot Tracking

**Detection Method**: Puppeteer-based website scan looking for tracking script tags

**Why It Matters**:
- Pixel presence indicates marketing sophistication
- Multiple pixels = multi-channel marketing strategy
- Correlates with higher marketing budgets and growth focus

---

## Google Places API Integration

### Google Places API v1 (New)

**Endpoint**: `https://places.googleapis.com/v1`

**Key Features**:
1. **pureServiceAreaBusiness** flag - Identifies home-based contractors
2. Better type detection for business classification
3. More accurate review counts

### Multi-Strategy Matching (10 Strategies)

The algorithm tries **10 different search strategies** in priority order to find the business GMB profile:

#### Strategy 1: Phone Number (4 variations)
1. **Phone as provided**: `+17085551234` or `(708) 555-1234`
2. **With +1 prefix**: If 10 digits, try `+15551234567`
3. **Formatted**: `(555) 123-4567`
4. **Digits only**: Last 10 digits `5551234567`

**Match Rate**: ~40% (highest accuracy)

#### Strategy 2: Business Name + Full Address
- Query: `{businessName} {street} {city}, {state}`
- Example: `ABC Roofing 123 Main St Chicago, IL`

#### Strategy 2b: Business Name + Street Only
- Query: `{businessName} {street}`
- Example: `ABC Roofing 123 Main St`
- **Use Case**: Well-known on their street, city adds noise

#### Strategy 2c: Business Name + Street + ZIP
- Query: `{businessName} {street} {zip}`
- Example: `ABC Roofing 123 Main St 60601`

#### Strategy 3: Business Name + City/State
- Query: `{businessName} {city}, {state}` or `{businessName} {city}, {state} {zip}`
- Example: `ABC Roofing Chicago, IL 60601`
- **Location Biasing**: Uses city coordinates for 50km radius search

#### Strategy 4: Business Name + State Only
- Query: `{businessName} {state}`
- Example: `ABC Roofing Illinois`

#### Strategy 5: Business Name + ZIP
- Query: `{businessName} {zip}`
- Example: `ABC Roofing 60601`

#### Strategy 6: Business Name + Phone
- Query: `{businessName} {phone}`
- Example: `ABC Roofing (708) 555-1234`

#### Strategy 7: Website Domain
- Query: Domain name without protocol/www
- Example: `abcroofing.com`

#### Strategy 8: Abbreviated Name (for long names)
- Takes first 2-3 words of business name
- Tries with city/state and ZIP
- **Use Case**: "ABC Roofing and General Contracting Services LLC" → "ABC Roofing"

#### Strategy 9: Domain-Derived Name
- Extracts name from domain (e.g., `acmeroofing.com` → "acme roofing")
- Tries with city/state and ZIP
- **Use Case**: Domain name more recognizable than legal business name

#### Strategy 10: Name Only (Last Resort)
- Query: `{businessName}`
- Least accurate, no location context

### Location Biasing

For major US cities (top 50), searches use a **50km radius location bias** around city coordinates:

```typescript
locationBias: {
  circle: {
    center: { latitude: 41.8781, longitude: -87.6298 }, // Chicago
    radius: 50000 // 50km
  }
}
```

**Cities Supported**: New York, Los Angeles, Chicago, Houston, Phoenix, Philadelphia, San Antonio, San Diego, Dallas, San Jose, Austin, Jacksonville, Fort Worth, Columbus, Charlotte, San Francisco, Indianapolis, Seattle, Denver, Washington DC, Boston, and 29 more.

### Fuzzy Name Matching

After GMB search returns results, validates match using fuzzy logic:

**Normalization Steps**:
1. Remove punctuation: `ABC Roofing, LLC` → `ABC Roofing LLC`
2. Remove business suffixes: `LLC`, `Inc`, `Corp`, `Co`, `Ltd`, etc.
3. Lowercase: `ABC Roofing` → `abc roofing`
4. Trim whitespace

**Match Criteria**:
- Exact match after normalization ✅
- One name contains the other ✅
- 50%+ of words match ✅
- Handle "The" prefix variations ✅
- Handle numeric suffixes ✅

**Examples**:
- `ABC Roofing LLC` = `ABC Roofing Services` ✅
- `The Paint Spot` = `Paint Spot` ✅
- `Company 1` = `Company` ✅
- `Owen's HVAC` = `Owens HVAC Services Inc` ✅

---

## Score Tiers

| Tier | Score Range | Label | MQL Status |
|------|-------------|-------|------------|
| **Disqualified** | 0-39 | Low Fit | Not MQL |
| **MQL** | 40-59 | Medium Fit | MQL |
| **High Fit** | 60-79 | High Quality | MQL |
| **Premium** | 80-100 | Premium Lead | MQL |

---

## Recent Algorithm Changes

### January 9, 2026 - Location Scoring Refinement

**Issue**: Home-based and mobile contractors were receiving +20 points (office classification) when they should only get +10 (service area).

**Example**: "Remarkable auto care" (mobile detailing) was classified as "office" and scored +20.

**Changes Made**:

1. **Added auto detailing types to contractor list**:
   ```typescript
   'car_detailing', 'auto_detailing', 'mobile_car_wash', 'detailing'
   ```

2. **Updated contractor classification logic**:
   - Contractors now require **15+ reviews** to qualify as "office"
   - Without strong signals → classified as "service_area" (+10)
   - With 15+ reviews + address → classified as "office" (+20)

3. **Changed default for unknown business types**:
   - **Old**: Unknown with address → "office" (+20)
   - **New**: Unknown with address → "service_area" (+10)

4. **Website scoring increased**:
   - Custom domain: +10 → **+15 points**
   - Rationale: Partially offset location penalty for legitimate businesses

**Impact**:
- Lead 00QNv00000Sra3dMAB: 65 → 60 (-5 points)
  - Website: +10 → +15 (+5)
  - Location: +20 → +10 (-10)
  - Net: -5 points

### January 9, 2026 - Salesforce Field Mapping Update

**Issue**: Service area businesses were updating `Location_Type__c` field to "Home Office" when we weren't certain about the office.

**Change**: Service area classification now returns `null` for `Location_Type__c` field.

**Result**: Field only updates when certain of commercial location (storefront or office).

---

## Data Sources

### 1. Google Places API v1
**Provides**:
- `place_id` (GMB verification)
- `displayName` (business name)
- `types` (business categories)
- `userRatingCount` (review count)
- `rating` (star rating)
- `formattedAddress` (full address)
- `phoneNumber` (contact)
- `websiteUri` (website)
- `businessStatus` (operational status)
- `pureServiceAreaBusiness` (home-based flag)

### 2. People Data Labs (PDL)
**Provides**:
- `employee_count` (exact number)
- `size_range` (employee range string)
- `years_in_business` (calculated from founding year)
- `industry` (NAICS classification)
- `inferred_revenue` (revenue estimate)
- `website_confirmed` (verified website)

### 3. Website Tech Detection (Puppeteer)
**Provides**:
- `has_meta_pixel` (Facebook tracking)
- `has_ga4` (Google Analytics 4)
- `has_google_ads_tag` (Google Ads)
- `has_tiktok_pixel` (TikTok tracking)
- `has_hubspot` (HubSpot tracking)
- `pixel_count` (total pixels detected)

---

## Score Examples

### Example 1: Premium Lead (Score: 85)
```
Business: ABC HVAC Services
- GMB Match: +10 (verified GMB)
- Website: +15 (custom domain: abchvac.com)
- Reviews: +25 (45 reviews)
- Years: +15 (12 years in business)
- Employees: +15 (8 employees)
- Location: +20 (storefront with 45 reviews)
- Pixels: +10 (Meta + GA4)
Total: 85 + 10 = 95 (capped at 100)
```

### Example 2: High Fit Lead (Score: 65)
```
Business: Smith Plumbing
- GMB Match: +10 (verified GMB)
- Website: +15 (custom domain)
- Reviews: +20 (18 reviews)
- Years: +10 (6 years)
- Employees: +5 (3 employees)
- Location: +10 (service area - home-based)
- Pixels: +5 (1 pixel)
Total: 70 + 5 = 75
```

### Example 3: MQL Lead (Score: 50)
```
Business: Jones Handyman
- GMB Match: +10 (verified GMB)
- Website: +15 (custom domain)
- Reviews: +10 (12 reviews)
- Years: +5 (3 years)
- Employees: +0 (1 employee)
- Location: +10 (service area)
- Pixels: +0 (no pixels)
Total: 50
```

### Example 4: Disqualified (Score: 30)
```
Business: New Startup Services
- GMB Match: +0 (no GMB found)
- Website: +5 (GMB website only)
- Reviews: +0 (2 reviews)
- Years: +0 (1 year)
- Employees: +0 (1 employee)
- Location: +0 (no verification)
- Pixels: +0 (no pixels)
Total: 5
```

---

## Implementation Files

| File | Purpose |
|------|---------|
| `src/services/fitScore.ts` | Core scoring algorithm |
| `src/services/googlePlaces.ts` | GMB matching and enrichment |
| `src/services/peopleDataLabs.ts` | Company data enrichment |
| `src/services/websiteTech.ts` | Pixel detection via Puppeteer |
| `src/services/salesforceFieldMapper.ts` | Maps enrichment to Salesforce fields |

---

## Analytics & Monitoring

### Match Rate Tracking
The system tracks GMB match statistics:
```typescript
{
  totalAttempts: number,
  totalMatches: number,
  strategySuccesses: {
    'phone-original': count,
    'phone-plus1': count,
    'name-city-state': count,
    ...
  }
}
```

**Use Case**: Identify which matching strategies are most effective for optimization.

---

## Future Enhancements

1. **Marketing Spend Integration**: Currently +0 for all leads. Plan to integrate ad spend data from PDL or other sources.

2. **Industry-Specific Scoring**: Weight components differently by vertical (e.g., retail prioritizes location, B2B prioritizes employees).

3. **Machine Learning Refinement**: Train model on conversion data to optimize scoring weights.

4. **Real-Time Score Updates**: Re-calculate scores periodically as businesses grow (more reviews, more employees, etc.).

5. **Competitive Analysis**: Factor in competitor presence and market saturation.

---

## Testing & Validation

### Test Lead: 00QNv00000Sra3dMAB (Lonzos roadside service)

**Enrichment #1** (10:15 AM, old algorithm):
```json
{
  "fit_score": 65,
  "breakdown": {
    "gmb_match": 10,
    "website": 10,     // OLD: Custom domain scored +10
    "reviews": 25,     // 31 reviews
    "years": 0,        // No data
    "employees": 0,    // No data
    "location": 20,    // OLD: Classified as office
    "pixels": 0
  }
}
```

**Enrichment #2** (5:04 PM, new algorithm):
```json
{
  "fit_score": 60,
  "breakdown": {
    "gmb_match": 10,
    "website": 15,     // NEW: Custom domain +15
    "reviews": 25,     // 31 reviews
    "years": 0,        // No data
    "employees": 0,    // No data
    "location": 10,    // NEW: Classified as service_area
    "pixels": 0
  }
}
```

**Analysis**: Score decreased by 5 points due to more accurate location classification, partially offset by website scoring increase.

---

## API Rate Limits

### Google Places API v1
- **Rate**: 1 request per second (enforced in code)
- **Daily Limit**: Varies by billing plan (typically 1000-10000/day)
- **Retry Strategy**: Exponential backoff with 3 retries

### People Data Labs API
- **Rate**: Per contract limits
- **Timeout**: 10 seconds
- **Retry Strategy**: Exponential backoff with 3 retries

---

## Error Handling

All enrichment services use circuit breaker pattern to prevent cascading failures:

```typescript
try {
  const googlePlaces = await googlePlacesService.enrich(...);
} catch (error) {
  logger.warn('Google Places enrichment failed', { error });
  // Continue with enrichment using available data sources
}
```

**Graceful Degradation**: If one data source fails, algorithm continues with remaining sources. Minimum viable enrichment requires GMB data only.

---

## Conclusion

The TSI Fit Score is a comprehensive lead quality indicator combining:
1. **Business Legitimacy** (GMB verification, reviews)
2. **Digital Presence** (custom domain, pixels)
3. **Business Maturity** (years, employees)
4. **Commercial Viability** (physical location type)

Recent refinements ensure accurate classification of service area businesses, preventing over-scoring of home-based operations while maintaining recognition of established commercial locations.
