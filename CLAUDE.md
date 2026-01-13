# TSI Fit Score Engine

Automated lead enrichment and scoring system that enriches prospects via Workato webhook, calculates a retention-based "Fit Score" (0-100), and updates Salesforce Leads directly.

## Architecture

- **API Service**: Express.js REST API (port 4900) - receives webhooks from Workato, performs synchronous enrichment
- **Database**: PostgreSQL (leads and lead_enrichments tables for audit trail)
- **Salesforce**: Direct Lead updates via jsforce (OAuth 2.0)
- **Dashboard**: Internal web dashboard at `/dashboard` for monitoring and manual operations
- **Integration**: Workato handles LanderLab → Salesforce Lead creation, calls TSI for enrichment

## Data Flow

```
LanderLab Form → Workato → Salesforce (create Lead)
                    ↓
              Workato calls POST /enrich
                    ↓
              TSI enriches (Google Places, Website Tech, PDL)
                    ↓
              TSI updates Salesforce Lead directly
                    ↓
              Returns fit_score + enrichment data to Workato
```

## Tech Stack

- Node.js 18+, TypeScript 5.7 (strict mode)
- Express.js 4.21, Puppeteer 24.x
- PostgreSQL (pg), jsforce 3.x for Salesforce
- axios, Zod validation, Winston logging

## Enrichment Data Sources

| Source | Data Provided | Used For |
|--------|--------------|----------|
| **Google Places** | Reviews, rating, address, GMB status | Solvency score, location validation |
| **People Data Labs** | Employee count, years in business, industry, NAICS, revenue | Solvency score, MQL gating |
| **Website Validator** | URL validation, domain age (WHOIS), response time | Website scoring, years_in_business fallback |
| **Website Tech** | Pixel detection (Meta, GA4, TikTok, HubSpot) | Sophistication penalty |

## Commands

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript to dist/
npm run dev          # Start dev server with hot reload (port 4900)
npm start            # Run production build
```

## Project Structure

```
src/
  index.ts                      # Express app, routes, middleware
  types/
    lead.ts                     # TypeScript interfaces (EnrichmentData, FitScoreResult, etc.)
  services/
    googlePlaces.ts             # Google Places API integration (GMB matching)
    peopleDataLabs.ts           # PDL Company Enrichment API (employees, years in business)
    websiteValidator.ts         # URL validation + WHOIS domain age lookup (30-day cache)
    websiteTech.ts              # Puppeteer-based tech stack detection (pixels, marketing tools)
    fitScore.ts                 # Fit Score calculation algorithm (0-100)
    scoreMapper.ts              # Maps Fit Score (0-100) → Score__c (0-5) for Facebook/TikTok/Google
    salesforce.ts               # Salesforce OAuth + Lead updates (jsforce)
    salesforceFieldMapper.ts    # Maps enrichment data → SF custom fields + GMB field filling
    dashboardStats.ts           # Dashboard statistics (unenriched leads, KPIs)
    clay.ts                     # Legacy Clay integration (kept for backwards compatibility)
  utils/
    logger.ts                   # Winston logger configuration (in-memory log buffer)
    retry.ts                    # Retry logic with exponential backoff
    circuitBreaker.ts           # Circuit breaker for external APIs
    validation.ts               # Salesforce ID validation (SOQL injection prevention)
migrations/
  001_create_leads_table.sql              # Initial leads table
  002_create_enrichments_table.sql        # Initial enrichments table
  003_salesforce_aligned_fields.sql       # Add SF-aligned fields (has_website, number_of_employees, etc.)
  004_add_utm_and_address_fields.sql      # Add UTM tracking and address fields
  005_drop_fit_tier_column.sql            # Remove fit_tier (replaced by score calculation)
  006_fix_enrichments_lead_id.sql         # Fix lead_id reference (use salesforce_lead_id directly)
  007_replace_clay_with_pdl.sql           # Add pdl_data column, migrate from clay_data
  008_add_score_column.sql                # Add score column (0-5) for Score__c mapping
  009_add_website_validation.sql          # Add website_validation_data column for URL validation cache
public/
  index.html                    # Internal dashboard (enrichment monitoring, batch operations)
utility-scripts/                # Standalone utility scripts (analysis, import/export, queries)
  analysis/                     # Lead analysis scripts
  import-export/                # Salesforce import/export scripts
  queries/                      # Database query scripts
scripts/                        # TypeScript utility scripts
```

## API Endpoints

### Production Endpoints (Workato Integration)

#### POST /enrich (X-API-Key required)

Synchronous enrichment endpoint for Workato. Receives lead data from Workato, enriches it, and returns Salesforce field mappings for Workato to update the Lead record.

**Request:**
```json
{
  "salesforce_lead_id": "00Qxxxxxxxxxxxx",
  "business_name": "ABC Roofing",
  "website": "https://abcroofing.com",
  "phone": "+15551234567",
  "city": "Austin",
  "state": "TX"
}
```

**Response:**
```json
{
  "enrichment_status": "completed",
  "fit_score": 78,
  "employee_count": 12,
  "employee_size_range": "11-50",
  "years_in_business": 8,
  "year_founded": 2016,
  "industry": "construction",
  "inferred_revenue": "$1M-$10M",
  "google_reviews_count": 23,
  "google_rating": 4.5,
  "has_physical_location": true,
  "pixels_detected": "meta,ga4",
  "has_meta_pixel": true,
  "has_ga4": true,
  "has_google_ads": false,
  "has_hubspot": false,
  "score_breakdown": "{...}",
  "salesforce_fields": "{...}",
  "enrichment_timestamp": "2024-01-01T00:00:00.000Z",
  "request_id": "uuid"
}
```

#### POST /api/workato/enrich (X-API-Key required)

Automatic enrichment endpoint for Workato. Fetches lead from Salesforce by ID, enriches it, and updates Salesforce directly. This endpoint is fully automated - Workato just needs to send the Salesforce Lead ID.

### Dashboard Endpoints (Internal - No Auth Required)

#### GET /

Redirects to `/dashboard`

#### GET /dashboard

Serves internal dashboard HTML (static files from `public/`)

#### GET /api/lead/:salesforceLeadId

Retrieve enrichment data by Salesforce Lead ID (from database and Salesforce)

#### POST /api/enrich-by-id

Manual enrichment by Salesforce Lead ID. Optional `update_salesforce` parameter (default: true)

#### GET /api/dashboard/stats

Get dashboard statistics for date range (`startDate`, `endDate` query params)

#### GET /api/dashboard/unenriched

Get paginated list of unenriched leads from Salesforce (`limit`, `offset`, `startDate`, `endDate`, `leadSource` query params)

#### GET /api/dashboard/enrichment-kpis

Get enrichment KPIs for selected period (`period=today|yesterday|this_week|last_week|this_month|last_month`, `limit`, `offset` query params)

#### POST /api/dashboard/enrich-batch

Batch enrich multiple leads (parallel processing, max 50 leads, configurable concurrency 1-10)

**Request:**
```json
{
  "lead_ids": ["00Q...", "00Q..."],
  "concurrency": 5
}
```

#### POST /api/dashboard/enrich-batch-gmb-only

Fast GMB-only batch enrichment (skips PDL and website tech, max 100 leads, concurrency 1-20)

#### POST /api/dashboard/backfill-fit-scores

Backfill fit scores for leads with GMB but no fit score (Facebook leads only)

### Setup & Monitoring Endpoints (X-API-Key required)

#### GET /health

Health check (no auth required)

#### GET /api/setup/status

System status: database connection, Salesforce connection, configured services

#### GET /api/setup/logs

Recent application logs (in-memory buffer, max 500 entries, `limit`, `level` query params)

#### POST /api/setup/test-database

Test database connection and get database info

#### GET /api/setup/database-stats

Database statistics: enrichment counts, score distribution, recent activity

#### GET /enrichment/:salesforceLeadId

Retrieve enrichment record from database by Salesforce Lead ID (legacy endpoint)

**Request:**
```json
{
  "salesforce_lead_id": "00Qxxxxxxxxxxxx"
}
```

**Response:**
```json
{
  "success": true,
  "request_id": "uuid",
  "enrichment_status": "completed",
  "fit_score": 78,
  "salesforce_updated": true,
  "duration_ms": 5230,
  "lead": {
    "id": "00Qxxxxxxxxxxxx",
    "company": "ABC Roofing",
    "website": "https://abcroofing.com",
    "phone": "+15551234567",
    "city": "Austin",
    "state": "TX"
  },
  "enrichment_summary": {
    "google_places_found": true,
    "pdl_found": true,
    "website_tech_scanned": true,
    "google_reviews": 23,
    "google_rating": 4.5,
    "employee_count": 12,
    "years_in_business": 8,
    "pixels_detected": ["meta", "ga4"]
  },
  "score_breakdown": {...}
}
```

### GET /api/dashboard/enrichment-kpis (no auth)

Returns enrichment KPIs for today, yesterday, this week, and last week.

**Response:**
```json
{
  "periods": {
    "today": {
      "label": "Today",
      "stats": {
        "total_enriched": 25,
        "successful": 23,
        "failed": 2,
        "salesforce_updated": 22,
        "avg_fit_score": 58.3,
        "score_distribution": {
          "premium": 3,
          "high_fit": 8,
          "mql": 10,
          "disqualified": 4
        },
        "data_quality": {
          "has_gmb": 18,
          "has_website": 20,
          "has_pixels": 12
        }
      },
      "hourly": [...]
    },
    "yesterday": {...},
    "this_week": {...},
    "last_week": {...}
  },
  "trends": {
    "today_vs_yesterday": { "total_enriched": 15, "avg_fit_score": -3 },
    "this_week_vs_last_week": { "total_enriched": 22, "avg_fit_score": 5 }
  },
  "recent_enrichments": [...]
}
```

## Fit Score Algorithm

**Solvency Score (0-85 points):**
- GMB Match: +5 if Google Business Profile found (place_id exists)
- Website: +15 (custom domain AND valid URL), +5 (GMB/Google URL AND valid), +0 (subdomain/invalid URL/no website)
- Reviews: +0 (<15), +20 (15-54), +25 (≥55)
- Years in business: +0 (<2), +5 (2-3), +10 (4-7), +15 (≥8) - uses PDL, falls back to domain age, then Clay
- Employees: +0 (<2), +5 (2-4), +15 (>5)
- Physical location: +10 (storefront/office), +5 (service-area business), +0 (residential/unknown)
- Marketing spend: +0 ($0), +5 (<$500), +10 (≥$500)

**Pixel Bonus (0-10 points):**
- 1 pixel detected: +5
- 2+ pixels detected: +10

**Final Score:** `clamp(SolvencyScore + PixelBonus, 0, 100)`

**Score__c Mapping (0-5, for Facebook/TikTok/Google leads only):**
- 0: Score 0 (Disqualified - no business verification)
- 1-39: Score 1 (Low Quality)
- 40-59: Score 2 (MQL)
- 60-79: Score 3 (Good MQL)
- 80-99: Score 4 (High Quality)
- 100: Score 5 (Premium)

**Note:** Score__c is only calculated and updated for leads with `LeadSource` = 'Facebook', 'TikTok', or 'Google'. Other lead sources do not receive automatic Score__c updates.

## Environment Variables

```bash
# Database
DATABASE_URL              # PostgreSQL connection string

# API Keys
GOOGLE_PLACES_API_KEY     # Google Places API
PDL_API_KEY               # People Data Labs API key
API_KEY                   # Workato webhook authentication

# Salesforce OAuth 2.0
SFDC_CLIENT_ID            # Connected App client ID
SFDC_CLIENT_SECRET        # Connected App client secret
SFDC_USERNAME             # Salesforce username
SFDC_PASSWORD             # Salesforce password
SFDC_SECURITY_TOKEN       # Salesforce security token
SFDC_LOGIN_URL            # login.salesforce.com or test.salesforce.com

# Server
NODE_ENV                  # development | production
PORT                      # Default: 4900
LOG_LEVEL                 # info | debug | error
```

## Patterns

- **Retry with backoff**: External API calls use exponential backoff (see `utils/retry.ts`)
- **Circuit breaker**: Prevents cascading failures from flaky services (see `utils/circuitBreaker.ts`)
- **Graceful degradation**: Database unavailable → enrichment still works, just not persisted
- **Field mapping**: `salesforceFieldMapper.ts` centralizes all SF field name mappings
- **GMB field filling**: Automatically fills missing lead fields (website, address) from Google Business Profile data, with address overwrite protection for high-confidence matches
- **Website validation caching**: URL validation and domain age results cached in database (30-day TTL) to avoid repeated WHOIS lookups
- **SOQL injection prevention**: All Salesforce ID inputs are validated using `utils/validation.ts` before use in queries
- **In-memory log buffer**: Recent logs (max 500 entries) are kept in memory for `/api/setup/logs` endpoint
- **Batch processing**: Parallel enrichment with configurable concurrency limits to prevent API overload

## Deployment

Deployed to Hostinger VPS (API service + PostgreSQL).

## Utility Scripts

Standalone utility scripts for analysis, import/export, and database queries are located in `utility-scripts/`:
- **analysis/**: Lead analysis and comparison scripts
- **import-export/**: Salesforce import/export scripts
- **queries/**: Database query and lookup scripts

TypeScript utility scripts for Salesforce operations are in `scripts/`.

## Workato Integration

Configure Workato HTTP action:
- **URL**: `https://your-domain.com:4900/enrich`
- **Method**: POST
- **Headers**: `X-API-Key: your_api_key`, `Content-Type: application/json`
- **Body**: Map Salesforce Lead fields to request schema
