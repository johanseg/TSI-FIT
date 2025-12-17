# TSI Fit Score Engine

Automated lead enrichment and scoring system that enriches prospects via Workato webhook, calculates a retention-based "Fit Score" (0-100), and returns results for Salesforce update.

## Architecture

- **API Service**: Express.js REST API (port 4900) - receives webhooks from Workato, performs synchronous enrichment
- **Database**: PostgreSQL (lead_enrichments table for audit trail)
- **Integration**: Workato handles LanderLab → Salesforce flow, calls TSI for enrichment

## Data Flow

```
LanderLab Form → Workato → Salesforce (create Lead)
                    ↓
              Workato calls POST /enrich
                    ↓
              TSI enriches (Google Places, Website Tech, Clay)
                    ↓
              Returns fit_score + enrichment data
                    ↓
              Workato updates Salesforce Lead
```

## Tech Stack

- Node.js 18+, TypeScript 5.3 (strict mode)
- Express.js 4.18, Puppeteer 21.6
- PostgreSQL (pg), axios, Zod validation
- Winston logging, Jest testing

## Common Commands

```bash
npm install                 # Install all dependencies
npm run build               # Build TypeScript
npm test                    # Run Jest tests
npm run dev                 # Start development server on port 4900

# Database migrations
psql -d $DATABASE_URL -f migrations/001_create_leads_table.sql
psql -d $DATABASE_URL -f migrations/002_create_enrichments_table.sql
```

## Project Structure

```
src/
  index.ts               # Express app entry point
  services/
    googlePlaces.ts      # Google Places API
    clay.ts              # Clay enrichment (employees, revenue)
    websiteTech.ts       # Puppeteer tech detection
    fitScore.ts          # Score calculation algorithm
  types/lead.ts          # TypeScript interfaces
```

## API Endpoints

### POST /enrich (requires X-API-Key header)

Synchronous enrichment endpoint for Workato integration.

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
  "fit_tier": "High Fit",
  "employee_estimate": 5,
  "years_in_business": 4,
  "google_reviews_count": 23,
  "google_rating": 4.5,
  "has_website": true,
  "has_physical_location": true,
  "pixels_detected": "meta,ga4",
  "has_meta_pixel": true,
  "has_ga4": true,
  "has_google_ads": false,
  "has_hubspot": false,
  "score_breakdown": "{...}",
  "enrichment_timestamp": "2024-01-01T00:00:00.000Z",
  "request_id": "uuid"
}
```

### GET /health

Health check endpoint (no auth required).

### GET /enrichment/:salesforceLeadId (requires X-API-Key header)

Retrieve enrichment data by Salesforce Lead ID.

## Fit Score Algorithm

**Solvency (0-80 points):** Website (+10), Google reviews (0-25), Years in business (0-20), Employees (0-20), Physical location (+5)

**Sophistication Penalty (-20 max):** Meta Pixel (-7), GA4/Google Ads (-5), Multiple pixels (-10), Marketing automation (-5)

**Tiers:** 0-39 Disqualified, 40-59 MQL, 60-79 High Fit, 80-100 Premium

## Environment Variables

```
DATABASE_URL              # PostgreSQL connection string
GOOGLE_PLACES_API_KEY     # Google Places API key
CLAY_API_KEY              # Clay enrichment API key
API_KEY                   # API key for Workato authentication
NODE_ENV                  # development | production
PORT                      # Server port (default: 4900)
LOG_LEVEL                 # info | debug | error
```

## Deployment

Deployed to Hostinger VPS (API service + PostgreSQL).

## Workato Integration

Configure Workato HTTP action:
- **URL**: `https://your-domain.com:4900/enrich`
- **Method**: POST
- **Headers**: `X-API-Key: your_api_key`, `Content-Type: application/json`
- **Body**: Map Salesforce Lead fields to request schema
