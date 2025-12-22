# TSI Fit Score Engine

Automated lead enrichment and scoring system that enriches prospects via Workato webhook, calculates a retention-based "Fit Score" (0-100), and updates Salesforce Leads directly.

## Architecture

- **API Service**: Express.js REST API (port 4900) - receives webhooks from Workato, performs synchronous enrichment
- **Database**: PostgreSQL (lead_enrichments table for audit trail)
- **Salesforce**: Direct Lead updates via jsforce (OAuth 2.0)
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
    lead.ts                     # TypeScript interfaces
  services/
    googlePlaces.ts             # Google Places API integration
    peopleDataLabs.ts           # PDL Company Enrichment API
    websiteTech.ts              # Puppeteer-based tech stack detection
    fitScore.ts                 # Score calculation algorithm
    salesforce.ts               # Salesforce OAuth + Lead updates
    salesforceFieldMapper.ts    # Maps enrichment data → SF fields
    dashboardStats.ts           # Dashboard statistics
  utils/
    logger.ts                   # Winston logger configuration
    retry.ts                    # Retry logic with exponential backoff
    circuitBreaker.ts           # Circuit breaker for external APIs
migrations/
  001_create_leads_table.sql
  002_create_enrichments_table.sql
  003_salesforce_aligned_fields.sql
  004_add_utm_and_address_fields.sql
  005_drop_fit_tier_column.sql
  006_fix_enrichments_lead_id.sql
  007_replace_clay_with_pdl.sql
```

## API Endpoints

### POST /enrich (X-API-Key required)

Synchronous enrichment endpoint for Workato.

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

### GET /health

Health check (no auth).

### GET /api/lead/:salesforceLeadId (X-API-Key required)

Retrieve enrichment data by Salesforce Lead ID.

## Fit Score Algorithm

**Solvency (0-80 points):**
- Website: +10
- Google reviews: 0-25 (scaled by count)
- Years in business: 0-20
- Employees: 0-20
- Physical location: +5

**Sophistication Penalty (-20 max):**
- Meta Pixel: -7
- GA4/Google Ads: -5
- Multiple pixels: -10
- Marketing automation: -5

**Tiers:** 0-39 Disqualified, 40-59 MQL, 60-79 High Fit, 80-100 Premium

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

## Deployment

Deployed to Hostinger VPS (API service + PostgreSQL).

## Workato Integration

Configure Workato HTTP action:
- **URL**: `https://your-domain.com:4900/enrich`
- **Method**: POST
- **Headers**: `X-API-Key: your_api_key`, `Content-Type: application/json`
- **Body**: Map Salesforce Lead fields to request schema
