📘 PRD — TSI Lead Fit Scoring & Retention Enrichment Engine (MVP)

Product Name: TSI Fit Score Engine
Version: v1.2 (Production)
Owner: Growth / Acquisition (Townsquare Interactive)
Status: ✅ **DEPLOYED & OPERATIONAL**
Primary Goal: Improve customer retention and LTV by pre-qualifying leads before sales using automated data enrichment and scoring, and passing those signals to Salesforce and ad platforms.

**Latest Update (Jan 2026)**: Website validation with domain age lookup now live. Invalid URLs receive 0 points. Domain age used as fallback for years_in_business when PDL data unavailable.

⸻

1. Problem Statement (Why This Exists)

Current paid acquisition (Facebook, Google, TikTok) optimizes on cheap MQLs and early sales signals, not long-term retention.

As a result:
	•	High volume of low-solvency, early-stage SMBs
	•	Sales closes deals that technically qualify but churn within 3–6 months
	•	Ad platforms are being trained on bad customers, compounding the problem

Root cause:
There is no automated, pre-sales signal that predicts whether a lead is capable of retaining.

⸻

2. Product Objective (What Success Looks Like)

Primary Objective

Create an automated system that:
	1.	Enriches leads at form submit
	2.	Calculates a Fit Score (0–100) tied to retention probability
	3.	Writes the score + attributes into Salesforce
	4.	Powers downstream decisions:
	•	Sales routing
	•	Qualification rules
	•	Ad platform standard events (via Stape)

Success Metrics (Not Vanity)
	•	↑ 90-day retention rate (primary KPI)
	•	↑ LTV per customer
	•	↓ Sales-closed / churned accounts
	•	↓ % of low-fit customers sold
	•	↑ Average Fit Score of closed-won deals

⸻

3. MVP Scope (Strict)

COMPLETED & IN PRODUCTION
	•	✅ Automated enrichment using:
	•	✅ Google Places / Maps API (GMB matching, reviews, ratings, location)
	•	✅ Website URL validation + WHOIS domain age lookup (30-day cache)
	•	✅ Website tech detection (Puppeteer-based pixel scanning)
	•	✅ People Data Labs (PDL) enrichment (employees, years in business, revenue, industry)
	•	✅ Deterministic Fit Score calculation (0-100)
	•	✅ Salesforce direct write-back (custom fields + Score__c mapping)
	•	✅ Synchronous scoring (~5-8 seconds per lead)
	•	✅ PostgreSQL audit trail with JSONB enrichment data
	•	✅ Internal dashboard for monitoring and batch operations

OUT OF SCOPE (for MVP)
	•	n8n orchestration (comes later)
	•	Real-time bid optimization logic
	•	UI dashboards (BI later)
	•	Call transcription / RAG (separate system)

⸻

4. System Architecture (MVP)

Flow:

LanderLab Form → Workato (webhook)
             → Salesforce (create Lead)
             → TSI API /enrich (Railway)
             → Enrichment (Google Places + Website Validation + Website Tech + PDL)
             → Fit Score Calculation (0-100)
             → Return to Workato
             → Workato updates Salesforce Lead
             → (Optional) Stape event decision

Hosting: Railway (Production)
Services:
	•	Web API (port 4900) - synchronous enrichment via Express.js
	•	PostgreSQL DB - audit trail with JSONB columns for enrichment data
	•	Internal Dashboard - /dashboard endpoint for monitoring and batch operations
Deployment: Automatic via GitHub push to Railway

⸻

5. Data Enrichment Signals (Production)

Data Sources

| Source | Data Provided | Usage |
|--------|--------------|-------|
| **Google Places API** | GMB match, reviews count, rating, address, business type | Solvency scoring, location validation |
| **Website Validator** | URL existence, domain age (WHOIS), response time | Website scoring, years in business fallback |
| **Website Tech Scanner** | Meta Pixel, GA4, Google Ads, TikTok, HubSpot detection | Pixel bonus scoring |
| **People Data Labs (PDL)** | Employee count, years in business, revenue, industry, NAICS | Solvency scoring (primary source) |

Positive Solvency Signals (Solvency Score: 0-85 points)

| Signal | Points | Why |
|--------|--------|-----|
| GMB Match (Google Business Profile found) | +5 | Real, verifiable business |
| Website (valid custom domain) | +15 | Professional presence |
| Website (GMB/Google URL) | +5 | Basic online presence |
| Website (subdomain/social) | +0 | Not professional |
| Website (invalid URL, validation failed) | +0 | Non-functional or fake |
| Google Reviews ≥55 | +25 | High operational maturity |
| Google Reviews 15-54 | +20 | Moderate maturity |
| Google Reviews <15 | +0 | New or inactive |
| Years in business ≥8 | +15 | Long-term survivability |
| Years in business 4-7 | +10 | Established |
| Years in business 2-3 | +5 | Early stage but viable |
| Years in business <2 | +0 | High-risk startup |
| Employees >5 | +15 | Payroll + solvency |
| Employees 2-4 | +5 | Small team |
| Employees <2 | +0 | Solo operator |
| Physical location (storefront/office) | +10 | Permanent establishment |
| Physical location (service-area business) | +5 | Legitimate operation |
| Physical location (residential/unknown) | +0 | Questionable legitimacy |

Pixel Bonus (0-10 points)

**Design Shift**: Changed from penalty to bonus. Pixels now indicate digital maturity and spending capability.

| Signal | Points | Why |
|--------|--------|-----|
| 1 pixel detected (Meta, GA4, Google Ads, TikTok) | +5 | Active digital presence |
| 2+ pixels detected | +10 | Sophisticated digital operations |
| No pixels detected | +0 | No digital marketing |

Data Fallback Priority

**Years in Business**:
1. PDL `years_in_business` (primary)
2. Website domain age from WHOIS (fallback)
3. Clay `years_in_business` (legacy)
4. Default: 0

Website Validation Caching:
- 30-day TTL in PostgreSQL (website_validation_data JSONB column)
- Indexed on URL for fast cache lookups
- Prevents repeated WHOIS lookups (2-5 seconds per domain)

⸻

6. Fit Score Model (v1.2 - Production)

Score Range: 0–100

Formula:
```
Fit Score = clamp(Solvency Score + Pixel Bonus, 0, 100)
```

Components:
- **Solvency Score**: 0-85 points (business fundamentals)
- **Pixel Bonus**: 0-10 points (digital maturity bonus)

Breakdown by Component:

| Component | Max Points | Scoring Logic |
|-----------|-----------|---------------|
| GMB Match | 5 | Google Business Profile found |
| Website | 15 | Valid custom domain (15), GMB URL (5), subdomain (0), invalid (0) |
| Google Reviews | 25 | ≥55 reviews (25), 15-54 (20), <15 (0) |
| Years in Business | 15 | ≥8 years (15), 4-7 (10), 2-3 (5), <2 (0) |
| Employee Count | 15 | >5 employees (15), 2-4 (5), <2 (0) |
| Physical Location | 10 | Storefront/office (10), service-area (5), residential (0) |
| Pixel Bonus | 10 | 2+ pixels (10), 1 pixel (5), no pixels (0) |
| **Total** | **95** | Sum capped at 100 |

Output Tiers

| Score | Tier | Action | Usage |
|-------|------|--------|-------|
| 0 | Disqualified | Do not sell | No GMB verification |
| 1-39 | Low Quality | High scrutiny | Weak fundamentals |
| 40-59 | MQL | Standard qualification | Acceptable baseline |
| 60-79 | Good MQL | Standard close | Solid business |
| 80-99 | High Quality | Priority routing | Strong fundamentals |
| 100 | Premium | Fast-track | Perfect score |

Score__c Mapping (0-5 scale for ad platforms)

**Only for Facebook, TikTok, and Google leads:**

| Fit Score | Score__c | Tier |
|-----------|----------|------|
| 0 | 0 | Disqualified - no GMB |
| 1-39 | 1 | Low Quality |
| 40-59 | 2 | MQL |
| 60-79 | 3 | Good MQL |
| 80-99 | 4 | High Quality |
| 100 | 5 | Premium |

**Note**: Score__c is used for ad platform optimization (Facebook Conversions API, Google Enhanced Conversions, TikTok Events API). Other lead sources receive Fit Score (0-100) only.


⸻

7. Salesforce Integration (Core Requirement)

Objects Updated
- Lead (primary)
- Opportunity (future)

Custom Fields (Production)

| Field API Name | Type | Description | Source |
|----------------|------|-------------|--------|
| `Fit_Score__c` | Number(3,0) | Fit Score (0-100) | Calculated |
| `Score__c` | Number(1,0) | Ad platform score (0-5) | Mapped from Fit Score |
| `Number_of_Employees__c` | Number | Employee count | PDL |
| `Employee_Size_Range__c` | Text | Employee range (e.g., "11-50") | PDL |
| `Number_of_Years_in_Business__c` | Number | Years operating | PDL → Domain age → 0 |
| `Year_Founded__c` | Number | Founded year | PDL |
| `Industry__c` | Text | Industry classification | PDL |
| `NAICS_Code__c` | Text | NAICS industry code | PDL |
| `Inferred_Revenue__c` | Text | Revenue range | PDL |
| `Number_of_GMB_Reviews__c` | Number | Google reviews count | Google Places |
| `GMB_Star_Rating__c` | Number(2,1) | Google rating (1.0-5.0) | Google Places |
| `Has_GMB__c` | Boolean | GMB profile exists | Google Places |
| `GMB_URL__c` | URL | Google Maps link | Google Places |
| `Has_Website__c` | Boolean | Valid website exists | Website Validator |
| `Has_Physical_Location__c` | Boolean | Physical address verified | Google Places |
| `Location_Type__c` | Picklist | Business location type | Google Places |
| `Business_License__c` | Text | Business license info | Future |
| `Spending_on_Marketing__c` | Boolean | Active digital marketing | Pixels + Years |
| `Has_Meta_Pixel__c` | Boolean | Meta Pixel detected | Website Tech |
| `Has_GA4__c` | Boolean | GA4 detected | Website Tech |
| `Has_Google_Ads_Tag__c` | Boolean | Google Ads tag detected | Website Tech |
| `Has_TikTok_Pixel__c` | Boolean | TikTok Pixel detected | Website Tech |
| `Has_HubSpot__c` | Boolean | HubSpot detected | Website Tech |
| `Pixels_Detected__c` | Text | Comma-separated pixel list | Website Tech |
| `Enrichment_Status__c` | Picklist | completed/failed/pending | System |
| `Score_Breakdown__c` | Long Text Area | JSON score breakdown | Calculated |
| `Enrichment_Timestamp__c` | DateTime | Last enrichment time | System |

GMB Field Filling (Auto-population)

When Google Business Profile is found, the following standard Lead fields are auto-filled if empty:

| Standard Field | Source | Behavior |
|----------------|--------|----------|
| `Website` | GMB website | Fill if empty |
| `Street` | GMB address | Fill if empty OR overwrite if high-confidence match |
| `City` | GMB address | Fill if empty OR overwrite if high-confidence match |
| `State` | GMB address | Fill if empty OR overwrite if high-confidence match |
| `PostalCode` | GMB address | Fill if empty OR overwrite if high-confidence match |
| `Country` | GMB address | Fill if empty OR overwrite if high-confidence match |

Address overwrite logic:
- If Lead name exactly matches GMB name → overwrite address (high confidence)
- If Lead name is fuzzy match or different → fill only if empty (low confidence)

Salesforce is the source of truth.

⸻

8. API Contracts (Production)

Primary Endpoint: POST /enrich

**Authentication**: X-API-Key header (required)

**Request Body**:
```json
{
  "salesforce_lead_id": "00Qxxxxxxxxxxxx",
  "business_name": "ABC Roofing",
  "phone": "+15551234567",
  "website": "https://abcroofing.com",
  "city": "Austin",
  "state": "TX"
}
```

**Response** (returned to Workato for Salesforce update):
```json
{
  "enrichment_status": "completed",
  "fit_score": 78,
  "score": 3,
  "employee_count": 12,
  "employee_size_range": "11-50",
  "years_in_business": 8,
  "year_founded": 2016,
  "industry": "Construction",
  "naics_code": "238160",
  "inferred_revenue": "$1M-$10M",
  "google_reviews_count": 23,
  "google_rating": 4.5,
  "has_gmb": true,
  "gmb_url": "https://maps.google.com/?cid=...",
  "has_website": true,
  "has_physical_location": true,
  "location_type": "storefront",
  "spending_on_marketing": true,
  "pixels_detected": "meta,ga4",
  "has_meta_pixel": true,
  "has_ga4": true,
  "has_google_ads": false,
  "has_tiktok_pixel": false,
  "has_hubspot": false,
  "website_validation": {
    "exists": true,
    "status_code": 200,
    "domain_age_years": 8,
    "redirected": false
  },
  "score_breakdown": {
    "solvency_score": {
      "gmb_match": 5,
      "website": 15,
      "reviews": 20,
      "years_in_business": 10,
      "employees": 15,
      "physical_location": 10,
      "total": 75
    },
    "pixel_bonus": {
      "pixels_detected": ["meta", "ga4"],
      "bonus": 10
    },
    "final_score": 85
  },
  "salesforce_fields": {
    "Fit_Score__c": 78,
    "Score__c": 3,
    "Number_of_Employees__c": 12,
    "Employee_Size_Range__c": "11-50",
    "Number_of_Years_in_Business__c": 8,
    "Year_Founded__c": 2016,
    "Industry__c": "Construction",
    "NAICS_Code__c": "238160",
    "Inferred_Revenue__c": "$1M-$10M",
    "Number_of_GMB_Reviews__c": 23,
    "GMB_Star_Rating__c": 4.5,
    "Has_GMB__c": true,
    "GMB_URL__c": "https://maps.google.com/?cid=...",
    "Has_Website__c": true,
    "Has_Physical_Location__c": true,
    "Location_Type__c": "storefront",
    "Spending_on_Marketing__c": true,
    "Has_Meta_Pixel__c": true,
    "Has_GA4__c": true,
    "Has_Google_Ads_Tag__c": false,
    "Has_TikTok_Pixel__c": false,
    "Has_HubSpot__c": false,
    "Pixels_Detected__c": "meta,ga4",
    "Enrichment_Status__c": "completed",
    "Score_Breakdown__c": "{...JSON...}",
    "Enrichment_Timestamp__c": "2026-01-12T00:00:00.000Z"
  },
  "enrichment_timestamp": "2026-01-12T00:00:00.000Z",
  "request_id": "uuid-xxxx-xxxx-xxxx"
}
```

Automatic Endpoint: POST /api/workato/enrich

**Purpose**: Fully automated enrichment - Workato only sends Salesforce Lead ID, API fetches Lead data, enriches it, and updates Salesforce directly.

**Request**:
```json
{
  "salesforce_lead_id": "00Qxxxxxxxxxxxx"
}
```

**Response**: Same as POST /enrich

**Note**: This endpoint is used for "set it and forget it" automation. Workato just triggers the enrichment, and the API handles everything else.


⸻

9. Operational Rules (Non-Negotiable)
	•	Sales cannot override Fit Score
	•	Leads <40 must not be sold
	•	Any override requires manager approval + logging
	•	Fit Score must be calculated before first sales call
	•	Fail-closed: if enrichment fails → default conservative score

⸻

10. MVP Rollout Plan (7 Days)

Day 1–2
	•	API skeleton
	•	Google Places integration
	•	Salesforce auth

Day 3
	•	Website tech detection
	•	Clay enrichment wiring

Day 4
	•	Fit Score logic
	•	Unit tests for scoring

Day 5
	•	Salesforce write-back
	•	Logging + retries

Day 6
	•	End-to-end test with real leads
	•	Compare vs rep qualification

Day 7
	•	Production deploy
	•	Monitor Fit Score distribution

⸻

11. Risks & Mitigations

Risk	Mitigation
Enrichment API limits	Async worker + caching
False negatives	Conservative thresholds in v1
Sales resistance	Make Fit Score visible + auditable
Platform latency	Async scoring allowed


⸻

12. Future Extensions (Post-MVP)
	•	n8n orchestration
	•	Event-level feedback loop to Meta / Google
	•	90-/120-/180-day ROAS attribution
	•	Call Rack sentiment injection
	•	BI dashboard (retention by Fit Tier)

⸻

Bottom Line (for Leadership)

This system redefines MQL from:

“Someone who filled a form”

to:

“A business that can actually retain”

If this isn’t built, every optimization downstream is lying.