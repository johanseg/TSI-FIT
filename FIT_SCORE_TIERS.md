# TSI Fit Score - Detailed Scoring Tiers

**Last Updated**: 2026-01-09
**Algorithm Version**: 2.0

---

## Overview

This document provides a detailed breakdown of every scoring tier for each component of the TSI Fit Score algorithm.

**Total Possible Score**: 0-100 points
- **Solvency Score**: 0-95 points (7 components)
- **Pixel Bonus**: 0-10 points

---

## Component 1: GMB Match (0-10 points)

### Tier Breakdown

| Condition | Points | Label | Indicator |
|-----------|--------|-------|-----------|
| **No GMB found** | 0 | No Verification | ❌ Not verified business |
| **GMB found (place_id exists)** | 10 | Verified | ✅ Google-verified business |

### Implementation Logic
```typescript
if (googlePlaces?.place_id) {
  score = 10;
} else {
  score = 0;
}
```

### Business Impact
- **0 points**: Business may not exist, not discoverable on Google Maps
- **10 points**: Verified legitimate business with Google My Business profile

### Examples
- ❌ **0 pts**: "ABC Services" - no GMB profile found
- ✅ **10 pts**: "Smith Plumbing" - active GMB with place_id `ChIJ...`

---

## Component 2: Website (0-15 points)

### Tier Breakdown

| Website Type | Points | Label | Examples |
|-------------|--------|-------|----------|
| **No website** | 0 | No Digital Presence | No URL found |
| **Subdomain** | 0 | Low Commitment | `shop.mysite.com`, `business.wix.com/abc` |
| **GMB/Google URL** | 5 | Basic Presence | `business.site`, `g.page/abc`, `*.google.com` |
| **Custom Domain** | 15 | Professional Website | `abcroofing.com`, `smithplumbing.net` |

### Website Type Detection

#### Custom Domain (15 points)
- Root domain: `example.com`
- With www: `www.example.com`
- Multi-part TLDs: `example.co.uk`, `example.com.au`

#### GMB/Google URL (5 points)
- Google Sites: `business.site`
- Google Pages: `g.page/*`
- Any `*.google.com` domain

#### Subdomain (0 points)
- Third-level domains: `shop.example.com`
- Platform subdomains: `mybusiness.wix.com/store`
- E-commerce subdomains: `store.shopify.com/abc`

**Exception for Common TLDs**:
```
example.co.uk → NOT subdomain (15 pts)
shop.example.co.uk → Subdomain (0 pts)
```

### Implementation Logic
```typescript
const websiteUrl = googlePlaces?.gmb_website || pdl?.website_confirmed;

if (!websiteUrl) {
  score = 0;
} else if (isGoogleOrGmbUrl(websiteUrl)) {
  score = 5;  // GMB/Google URL
} else if (isSubdomain(websiteUrl)) {
  score = 0;  // Subdomain
} else {
  score = 15; // Custom domain
}
```

### Business Impact
- **0 points**: No website or low-commitment web presence (subdomain)
- **5 points**: Basic Google-provided website, minimal investment
- **15 points**: Professional website with custom domain, shows business investment

### Examples
- ❌ **0 pts**: No website provided
- ❌ **0 pts**: `mybusiness.wix.com/abc` (subdomain)
- ⚠️ **5 pts**: `business.site` (GMB website)
- ⚠️ **5 pts**: `g.page/smithplumbing` (Google page)
- ✅ **15 pts**: `abcroofing.com` (custom domain)
- ✅ **15 pts**: `smith-plumbing.co.uk` (custom domain with multi-part TLD)

---

## Component 3: Google Reviews (0-25 points)

### Tier Breakdown

| Review Count | Points | Label | Interpretation |
|-------------|--------|-------|----------------|
| **0-4 reviews** | 0 | Minimal Validation | New/unknown business |
| **5-14 reviews** | 10 | Emerging | Building reputation |
| **15-29 reviews** | 20 | Established | Strong local presence |
| **30+ reviews** | 25 | Excellent Reputation | Highly validated |

### Visual Scale
```
Reviews:     0    5    10   15   20   25   30   35   40+
Points:     |0pts |--10pts--|----20pts----|-----25pts-----|
            New   Emerging    Established   Excellent
```

### Implementation Logic
```typescript
const reviewCount = googlePlaces?.gmb_review_count ?? 0;

if (reviewCount >= 30) {
  score = 25;
} else if (reviewCount >= 15) {
  score = 20;
} else if (reviewCount >= 5) {
  score = 10;
} else {
  score = 0;
}
```

### Business Impact
- **0 points**: Insufficient customer validation, high risk
- **10 points**: Starting to build reputation, some customer feedback
- **20 points**: Well-established business with strong customer base
- **25 points**: Exceptional reputation, highly trusted in community

### Examples by Industry

#### Home Services (Contractor)
- ❌ **0 pts**: 3 reviews - new contractor or poor service
- ⚠️ **10 pts**: 8 reviews - 1-2 years in business
- ✅ **20 pts**: 22 reviews - established contractor (3-5 years)
- ✅ **25 pts**: 45 reviews - top-rated contractor (5+ years)

#### Retail/Storefront
- ❌ **0 pts**: 2 reviews - new store or low traffic
- ⚠️ **10 pts**: 12 reviews - building customer base
- ✅ **20 pts**: 18 reviews - popular local shop
- ✅ **25 pts**: 67 reviews - well-known destination

#### Professional Services (Office)
- ❌ **0 pts**: 1 review - new practice
- ⚠️ **10 pts**: 9 reviews - growing practice
- ✅ **20 pts**: 25 reviews - established practice
- ✅ **25 pts**: 50+ reviews - highly sought-after professional

---

## Component 4: Years in Business (0-15 points)

### Tier Breakdown

| Years | Points | Label | Business Phase |
|-------|--------|-------|----------------|
| **0-1 years** | 0 | Startup | High risk, unproven |
| **2-3 years** | 5 | Early Stage | Survived initial hurdles |
| **4-7 years** | 10 | Established | Proven business model |
| **8+ years** | 15 | Mature | Long-term stability |

### Visual Timeline
```
Years:       0    1    2    3    4    5    6    7    8    9    10+
Points:     |--0pts--|--5pts--|--------10pts--------|------15pts----->
            Startup  Early Stage    Established        Mature
            ⚠️ High   ⚠️ Medium      ✅ Low Risk        ✅ Very Low
            Risk      Risk
```

### Implementation Logic
```typescript
const yearsInBusiness = pdl?.years_in_business ?? clay?.years_in_business ?? 0;

if (yearsInBusiness >= 8) {
  score = 15;
} else if (yearsInBusiness >= 4) {
  score = 10;
} else if (yearsInBusiness >= 2) {
  score = 5;
} else {
  score = 0;
}
```

### Survival Statistics Context

| Years | Survival Rate | Risk Level |
|-------|---------------|------------|
| 1 year | ~80% survive | High risk |
| 2 years | ~70% survive | Medium-high risk |
| 5 years | ~50% survive | Medium risk |
| 10 years | ~33% survive | Low risk |

*Source: Bureau of Labor Statistics*

### Business Impact
- **0 points**: High churn risk, may not survive first year
- **5 points**: Survived critical first 2 years, business model validated
- **10 points**: Established business with proven longevity
- **15 points**: Mature business, very low churn risk

### Examples
- ❌ **0 pts**: Founded 2025 (0 years) - brand new startup
- ❌ **0 pts**: Founded 2024 (1 year) - still in high-risk phase
- ⚠️ **5 pts**: Founded 2023 (2 years) - survived initial challenges
- ⚠️ **5 pts**: Founded 2022 (3 years) - building momentum
- ✅ **10 pts**: Founded 2020 (5 years) - weathered COVID, established
- ✅ **10 pts**: Founded 2019 (6 years) - proven business model
- ✅ **15 pts**: Founded 2016 (9 years) - mature, stable business
- ✅ **15 pts**: Founded 2008 (17 years) - survived 2008 recession, very stable

---

## Component 5: Number of Employees (0-15 points)

### Tier Breakdown

| Employee Count | Points | Label | Business Size |
|---------------|--------|-------|---------------|
| **0-1 employees** | 0 | Solopreneur | One-person operation |
| **2-4 employees** | 5 | Small Team | Micro business |
| **5+ employees** | 15 | Established Team | Small business+ |

### Visual Scale
```
Employees:   0    1    2    3    4    5    6    7    8+
Points:     |--0pts--|----5pts----|----------15pts--------->
            Solo     Small Team    Established Team
            ⚠️        ⚠️            ✅
```

### Implementation Logic
```typescript
let employees = 0;

// Priority 1: PDL exact employee count
if (pdl?.employee_count != null && pdl.employee_count > 0) {
  employees = pdl.employee_count;
}
// Priority 2: PDL size range (parsed)
else if (pdl?.size_range) {
  employees = PeopleDataLabsService.parseEmployeeCountFromSize(pdl.size_range) ?? 0;
  // "1-10" → 6, "11-50" → 30, "51-200" → 125
}
// Priority 3: Clay (legacy)
else if (clay?.employee_estimate != null && clay.employee_estimate > 0) {
  employees = clay.employee_estimate;
}

// Scoring
if (employees > 5) {
  score = 15;
} else if (employees >= 2) {
  score = 5;
} else {
  score = 0;
}
```

### Business Impact
- **0 points**: Single-person operation, limited capacity, high dependency on owner
- **5 points**: Small team, some redundancy, better capacity
- **15 points**: Established team, redundancy, scalable operations

### Examples by Industry

#### Home Services (Contractor)
- ❌ **0 pts**: 1 employee - owner doing all work
- ⚠️ **5 pts**: 3 employees - owner + 2 technicians
- ✅ **15 pts**: 8 employees - owner + office staff + 5 technicians

#### Professional Services
- ❌ **0 pts**: 1 employee - solo practitioner (attorney, accountant)
- ⚠️ **5 pts**: 3 employees - practitioner + assistant + admin
- ✅ **15 pts**: 12 employees - multiple practitioners + support staff

#### Retail
- ❌ **0 pts**: 1 employee - owner runs store alone
- ⚠️ **5 pts**: 4 employees - owner + 3 part-time staff
- ✅ **15 pts**: 10 employees - manager + full/part-time staff

### PDL Size Range Parsing
```
"1-10" → 6 employees (midpoint)
"11-50" → 30 employees
"51-200" → 125 employees
"201-500" → 350 employees
"501-1000" → 750 employees
"1001-5000" → 3000 employees
```

---

## Component 6: Physical Location (0-20 points)

### Tier Breakdown

| Location Type | Points | Label | Description |
|--------------|--------|-------|-------------|
| **No location / Residential** | 0 | No Commercial Presence | Not verified or home address |
| **Service Area Business** | 10 | Home-Based / Mobile | Verified GMB, operates from home |
| **Office** | 20 | Commercial Location | Dedicated office space |
| **Storefront** | 20 | Retail Location | Customer-facing retail space |

### Classification Algorithm Flow

```
┌─────────────────────────────────────┐
│ Start: Check pureServiceAreaBusiness│
└────────────┬────────────────────────┘
             │
             ├─► is_service_area_business = true? ──► SERVICE AREA (+10)
             │
             └─► Check GMB business types
                 │
                 ├─► Residential type? ──────────────► RESIDENTIAL (0)
                 │
                 ├─► Storefront type? ───────────────► STOREFRONT (+20)
                 │
                 ├─► Office type? ────────────────────► OFFICE (+20)
                 │
                 └─► Contractor type?
                     │
                     ├─► Has 15+ reviews? ────────────► OFFICE (+20)
                     │
                     └─► < 15 reviews? ───────────────► SERVICE AREA (+10)
```

### Business Type Classifications

#### Storefront Types (+20 points)
**Characteristics**: Customer foot traffic, retail space, physical inventory

| Category | Examples |
|----------|----------|
| **Retail** | store, shop, retail, department_store, shopping_mall |
| **Food & Beverage** | restaurant, cafe, bakery, bar |
| **Personal Care** | beauty_salon, hair_care, spa, gym, fitness_center |
| **Automotive** | car_dealer, car_wash, gas_station |
| **Shopping** | pharmacy, florist, grocery, supermarket, convenience_store |
| **Specialty Retail** | clothing_store, shoe_store, jewelry_store, electronics_store, hardware_store, home_goods_store, furniture_store, book_store, pet_store, liquor_store |

#### Office Types (+20 points)
**Characteristics**: Professional services, appointment-based, dedicated office space

| Category | Examples |
|----------|----------|
| **Medical** | doctor, dentist, hospital, medical, veterinary_care, clinic |
| **Legal/Financial** | lawyer, attorney, law_firm, accounting, accountant |
| **Real Estate/Insurance** | real_estate_agency, insurance_agency, bank, finance |
| **Auto Services** | car_repair, auto_repair, mechanic |
| **Other Services** | storage, moving_company, funeral_home |

#### Contractor Types (+10 or +20, conditional)
**Characteristics**: Often home-based, mobile service, goes to customer location

| Category | Examples |
|----------|----------|
| **Trades** | plumber, electrician, roofing_contractor, general_contractor, painter, hvac |
| **Outdoor Services** | landscaper, landscaping, lawn_care, tree_service, pool_service, fencing, concrete, masonry |
| **Cleaning/Maintenance** | pest_control, cleaning, maid_service, carpet_cleaning |
| **Repair** | handyman, locksmith, appliance_repair, garage_door |
| **Construction** | home_improvement, remodeling, renovation, construction |
| **Auto Detailing** | car_detailing, auto_detailing, mobile_car_wash, detailing |

**Contractor Scoring Logic**:
```typescript
if (isContractorType) {
  if (gmb_review_count >= 15 && gmb_address && gmb_is_operational) {
    return 'office'; // +20 points - Has real shop/office
  } else {
    return 'service_area'; // +10 points - Home-based
  }
}
```

#### Residential Types (0 points)
**Characteristics**: Not commercial businesses

| Examples |
|----------|
| lodging, campground, rv_park, hotel, motel, resort, apartment, apartment_complex, housing_complex |

### Implementation Examples

#### Example 1: Retail Flower Shop
```
GMB Types: ['florist', 'store', 'point_of_interest']
Classification: STOREFRONT
Score: +20 points
Reason: Clear retail location with customer foot traffic
```

#### Example 2: Established HVAC Contractor
```
GMB Types: ['hvac', 'general_contractor']
Review Count: 28
Has Address: Yes
Classification: OFFICE
Score: +20 points
Reason: Contractor with 15+ reviews, likely has shop/office
```

#### Example 3: New Plumbing Contractor
```
GMB Types: ['plumber']
Review Count: 8
Has Address: Yes
is_service_area_business: false
Classification: SERVICE AREA
Score: +10 points
Reason: Contractor with < 15 reviews, likely home-based
```

#### Example 4: Mobile Auto Detailing
```
GMB Types: ['car_detailing', 'mobile_car_wash']
Review Count: 15
is_service_area_business: true
Classification: SERVICE AREA
Score: +10 points
Reason: pureServiceAreaBusiness flag indicates home/mobile operation
```

#### Example 5: Unknown Business with GMB
```
GMB Types: ['point_of_interest', 'establishment']
Has Address: Yes
is_operational: Yes
Classification: SERVICE AREA
Score: +10 points
Reason: Unknown type defaults to service_area (not office)
```

### Business Impact
- **0 points**: No verified commercial presence, residential address, or no location data
- **10 points**: Verified business via GMB but operates from home/mobile (service area)
- **20 points**: Dedicated commercial location (storefront/office) with customer access

### Key Changes (Jan 9, 2026)
**Before**:
- Contractors defaulted to "office" (+20)
- Unknown businesses with address → "office" (+20)

**After**:
- Contractors require 15+ reviews for "office" (+20), else "service_area" (+10)
- Unknown businesses with address → "service_area" (+10)

**Rationale**: More accurate classification prevents over-scoring home-based operations

---

## Component 7: Marketing Spend (0-10 points)

### Tier Breakdown

| Annual Spend | Points | Label | Marketing Sophistication |
|-------------|--------|-------|-------------------------|
| **$0** | 0 | No Marketing | No marketing investment |
| **$1 - $499** | 5 | Low Investment | Testing marketing channels |
| **$500+** | 10 | Active Marketing | Committed marketing budget |

### Implementation Logic
```typescript
const marketingSpend = enrichmentData.marketing_spend ?? 0;

if (marketingSpend >= 500) {
  score = 10;
} else if (marketingSpend > 0) {
  score = 5;
} else {
  score = 0;
}
```

### Current Status
⚠️ **Not Currently Populated**: This field is set to 0 for all leads. Future enhancement planned.

### Planned Data Sources
1. **People Data Labs**: `estimated_marketing_spend` field
2. **BuiltWith**: Technology stack analysis → spend estimates
3. **Clearbit**: Company attributes including marketing data

### Business Impact
- **0 points**: Not investing in growth, low business sophistication
- **5 points**: Testing marketing, early growth phase
- **10 points**: Committed to marketing, growth-focused business

### Future Examples
- ❌ **0 pts**: No marketing spend detected
- ⚠️ **5 pts**: $200/month on Facebook Ads
- ✅ **10 pts**: $1,500/month on Google Ads + Facebook

---

## Pixel Bonus (0-10 points)

### Tier Breakdown

| Pixel Count | Points | Label | Marketing Sophistication |
|------------|--------|-------|-------------------------|
| **0 pixels** | 0 | No Tracking | Not tracking conversions |
| **1 pixel** | 5 | Basic Tracking | Single channel tracking |
| **2+ pixels** | 10 | Multi-Channel | Sophisticated marketing |

### Tracked Pixels

| Pixel | Purpose | Business Type |
|-------|---------|---------------|
| **Meta Pixel** | Facebook/Instagram Ads tracking | Most common for small business |
| **Google Analytics 4 (GA4)** | Website analytics, Google Ads | Professional businesses |
| **Google Ads Tag** | Google Ads conversion tracking | Active Google Ads users |
| **TikTok Pixel** | TikTok Ads tracking | Younger demographic businesses |
| **HubSpot** | Marketing automation, CRM | B2B, established businesses |

### Implementation Logic
```typescript
if (websiteTech) {
  const pixelCount = websiteTech.pixel_count;

  if (pixelCount >= 2) {
    score = 10;
  } else if (pixelCount === 1) {
    score = 5;
  } else {
    score = 0;
  }
}
```

### Detection Method
**Puppeteer-based scan** looking for:
- Script tags with pixel domains
- Tracking code snippets
- Marketing automation platforms

**Scan timeout**: 10 seconds per website

### Business Impact
- **0 points**: Not tracking marketing performance, flying blind
- **5 points**: Basic tracking on one platform, measuring ROI on single channel
- **10 points**: Multi-channel tracking, sophisticated marketing operation

### Examples

#### No Pixels (0 points)
```
Business: Small local shop
Website: basic-plumbing.com
Pixels: None
Reason: No marketing tracking, likely relying on word-of-mouth
```

#### Single Pixel (5 points)
```
Business: Growing contractor
Website: smithhvac.com
Pixels: Meta Pixel
Reason: Running Facebook Ads, tracking conversions
```

#### Multiple Pixels (10 points)
```
Business: Established business
Website: premiumroofing.com
Pixels: Meta Pixel, GA4, Google Ads Tag
Reason: Multi-channel marketing strategy, tracking across platforms
```

### Pixel Combinations by Business Stage

| Stage | Typical Pixels | Score | Marketing Budget |
|-------|---------------|-------|------------------|
| **Startup** | None | 0 | < $500/month |
| **Growing** | Meta or GA4 | 5 | $500-$2k/month |
| **Established** | Meta + GA4 | 10 | $2k-$5k/month |
| **Advanced** | Meta + GA4 + Google Ads + HubSpot | 10 | $5k+/month |

---

## Combined Score Examples

### Example 1: Premium Lead (Score: 85)
```
Business: Established HVAC Company (15 years)

GMB Match:        +10  ✅ Active GMB profile
Website:          +15  ✅ Custom domain (premierhvac.com)
Reviews:          +25  ✅ 52 Google reviews
Years:            +15  ✅ 15 years in business
Employees:        +15  ✅ 12 employees
Location:         +20  ✅ Office with shop (25+ reviews)
Marketing Spend:  +0   ⚠️  Not populated
──────────────────────
Solvency Total:   100  (capped at 95)
Pixel Bonus:      +10  ✅ Meta + GA4 + Google Ads
──────────────────────
FINAL SCORE:      95   🏆 PREMIUM TIER
```

### Example 2: High Fit Lead (Score: 70)
```
Business: Mid-Size Plumbing Company (6 years)

GMB Match:        +10  ✅ Active GMB profile
Website:          +15  ✅ Custom domain (cityplumbing.com)
Reviews:          +20  ✅ 18 Google reviews
Years:            +10  ✅ 6 years in business
Employees:        +5   ⚠️  3 employees
Location:         +10  ⚠️  Service area (< 15 reviews)
Marketing Spend:  +0   ⚠️  Not populated
──────────────────────
Solvency Total:   70
Pixel Bonus:      +5   ⚠️  Meta Pixel only
──────────────────────
FINAL SCORE:      75   ✅ HIGH FIT TIER
```

### Example 3: MQL Lead (Score: 50)
```
Business: Small Landscaping Business (3 years)

GMB Match:        +10  ✅ Active GMB profile
Website:          +15  ✅ Custom domain (greenlawns.com)
Reviews:          +10  ⚠️  12 Google reviews
Years:            +5   ⚠️  3 years in business
Employees:        +0   ❌ 1 employee (owner)
Location:         +10  ⚠️  Service area (home-based)
Marketing Spend:  +0   ⚠️  Not populated
──────────────────────
Solvency Total:   50
Pixel Bonus:      +0   ❌ No pixels
──────────────────────
FINAL SCORE:      50   ⚠️  MQL TIER
```

### Example 4: Disqualified (Score: 30)
```
Business: New Mobile Detailing (1 year)

GMB Match:        +10  ✅ Active GMB profile
Website:          +5   ⚠️  GMB website (business.site)
Reviews:          +0   ❌ 4 Google reviews
Years:            +0   ❌ 1 year in business
Employees:        +0   ❌ 1 employee (owner)
Location:         +10  ⚠️  Service area (mobile)
Marketing Spend:  +0   ⚠️  Not populated
──────────────────────
Solvency Total:   25
Pixel Bonus:      +5   ⚠️  Meta Pixel
──────────────────────
FINAL SCORE:      30   ❌ DISQUALIFIED
```

### Example 5: Retail Premium (Score: 80)
```
Business: Boutique Clothing Store (8 years)

GMB Match:        +10  ✅ Active GMB profile
Website:          +15  ✅ Custom domain (chicboutique.com)
Reviews:          +25  ✅ 67 Google reviews
Years:            +15  ✅ 8 years in business
Employees:        +5   ⚠️  4 employees
Location:         +20  ✅ Storefront retail location
Marketing Spend:  +0   ⚠️  Not populated
──────────────────────
Solvency Total:   90
Pixel Bonus:      +10  ✅ Meta + GA4 + TikTok
──────────────────────
FINAL SCORE:      100  🏆 PREMIUM TIER (capped)
```

---

## Score Distribution Guide

### Expected Distribution Across Lead Sources

| Source | Avg Score | Typical Range | Premium % |
|--------|-----------|---------------|-----------|
| **Facebook Ads** | 55 | 40-75 | 10% |
| **Google Ads** | 60 | 45-80 | 15% |
| **Organic Search** | 65 | 50-85 | 20% |
| **Referral** | 70 | 55-90 | 25% |

### Score to Conversion Rate Correlation

| Score Range | Tier | Est. Conversion Rate | Recommended Action |
|-------------|------|---------------------|-------------------|
| **0-39** | Disqualified | 2-5% | Auto-disqualify or nurture |
| **40-59** | MQL | 8-12% | Standard sales process |
| **60-79** | High Fit | 15-25% | Priority outreach |
| **80-100** | Premium | 30-40% | Immediate contact, high touch |

---

## Summary Table: Maximum Points by Component

| Component | Max Points | % of Total |
|-----------|-----------|------------|
| GMB Match | 10 | 10% |
| Website | 15 | 15% |
| Reviews | 25 | 25% |
| Years in Business | 15 | 15% |
| Employees | 15 | 15% |
| Physical Location | 20 | 20% |
| Marketing Spend | 10 | 10% (not populated) |
| **Solvency Subtotal** | **95** | **95%** |
| Pixel Bonus | 10 | 10% |
| **TOTAL POSSIBLE** | **100** | **100%** |

---

## Tier Classification Summary

| Tier | Score Range | Label | MQL Status | Characteristics |
|------|-------------|-------|------------|-----------------|
| **Disqualified** | 0-39 | Low Fit | ❌ Not MQL | New business, no validation, minimal presence |
| **MQL** | 40-59 | Medium Fit | ✅ MQL | Some validation, emerging business |
| **High Fit** | 60-79 | High Quality | ✅ MQL | Established business, strong indicators |
| **Premium** | 80-100 | Premium Lead | ✅ MQL | Mature business, excellent reputation, multi-channel marketing |

---

## Notes on Algorithm Evolution

### Version History
- **v1.0** (2024): Initial algorithm with clay data
- **v2.0** (Jan 9, 2026):
  - Added GMB Match bonus (+10)
  - Increased website scoring (+10 → +15)
  - Refined location classification (service area vs office)
  - Switched from Clay to People Data Labs

### Future Enhancements
1. **Marketing Spend Population**: Integrate PDL marketing spend data
2. **Industry-Specific Scoring**: Weight components differently by vertical
3. **Machine Learning**: Optimize weights based on conversion data
4. **Dynamic Thresholds**: Adjust MQL threshold by lead source
