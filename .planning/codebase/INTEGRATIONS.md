# External Integrations

**Analysis Date:** 2026-01-08

## APIs & External Services

**Google Places API (New):**
- Purpose: Business location data, GMB verification, reviews, ratings, operational status, business type classification
- API Base: `https://places.googleapis.com/v1` (`src/services/googlePlaces.ts`)
- SDK/Client: axios HTTP client
- Auth: API Key in `GOOGLE_PLACES_API_KEY` env var
- Data Returned:
  - Place ID, GMB name, primary category
  - Review count, rating
  - Address, city, state, zip, phone, website
  - Operational status, business types (storefront vs service-area vs residential)
  - Service area business detection flag

**People Data Labs (PDL) Company Enrichment API:**
- Purpose: Employee count, years in business, industry classification, NAICS codes, inferred revenue
- API Base: `https://api.peopledatalabs.com/v5` (`src/services/peopleDataLabs.ts`)
- SDK/Client: axios HTTP client
- Auth: API Key in `PDL_API_KEY` env var
- Data Returned:
  - Founded year, years in business
  - Employee count (exact), employee size range
  - Industry, NAICS/SIC classifications
  - Inferred revenue ranges
  - HQ location for validation

**Salesforce CRM:**
- Purpose: Lead data retrieval, fit score updates, enrichment field population
- SDK/Client: jsforce 3.10.10 (`src/services/salesforce.ts`)
- Auth: OAuth 2.0 (username/password/security token flow)
- Integration method: Direct Lead object updates via REST API
- Environment Variables:
  - `SFDC_LOGIN_URL` (default: https://login.salesforce.com)
  - `SFDC_CLIENT_ID`
  - `SFDC_CLIENT_SECRET`
  - `SFDC_USERNAME`
  - `SFDC_PASSWORD`
  - `SFDC_SECURITY_TOKEN`
- Endpoints used: Query API, Lead updates, field validation

**Website Technology Detection:**
- Purpose: Detect marketing pixels and analytics tools on business websites
- Implementation: Puppeteer 24.33.0 headless Chromium browser (`src/services/websiteTech.ts`)
- Detection Targets:
  - Meta Pixel (Facebook conversion tracking)
  - Google Analytics 4 (GA4)
  - Google Ads conversion tags
  - TikTok Pixel
  - HubSpot tracking
- No external API - browser-based HTML/JavaScript analysis

## Data Storage

**Databases:**
- PostgreSQL - Primary data store
  - Connection: `DATABASE_URL` env var
  - Client: pg 8.13.1 (`src/index.ts`)
  - Migrations: SQL files in `migrations/` directory
  - Tables:
    - `leads` - Raw lead records
    - `lead_enrichments` - Enrichment results with all source data
  - Storage: Raw enrichment JSON, Salesforce-aligned fields, fit scores, audit trail

**File Storage:**
- None - All data stored in PostgreSQL and Salesforce

**Caching:**
- In-memory circular log buffer (500 entries) - `src/index.ts`
- No Redis or external cache layer

## Authentication & Identity

**Auth Provider:**
- Custom API Key authentication
  - Implementation: `authenticateApiKey()` middleware in `src/index.ts`
  - Token storage: `X-API-Key` header
  - Session management: None (stateless API)

**OAuth Integrations:**
- Salesforce OAuth 2.0 (`src/services/salesforce.ts`)
  - Credentials: Environment variables (see above)
  - Connection caching with session validation

## Monitoring & Observability

**Error Tracking:**
- Winston logging to console (`src/utils/logger.ts`)
  - Sensitive data redaction (emails, phone numbers)
  - Log levels: error, warn, info, debug

**Analytics:**
- None - Dashboard statistics generated from PostgreSQL queries

**Logs:**
- Console output only
  - Structured JSON logging
  - In-memory circular buffer (500 entries) for `/api/setup/logs` endpoint

## CI/CD & Deployment

**Hosting:**
- Hostinger VPS - Self-managed deployment (per README.md)
  - Deployment: Manual
  - Environment vars: Configured via `.env` file on server

**CI Pipeline:**
- None detected - No GitHub Actions or similar CI configuration

## Environment Configuration

**Development:**
- Required env vars: `DATABASE_URL`, `GOOGLE_PLACES_API_KEY`, `PDL_API_KEY`, `API_KEY`, `SFDC_*`
- Secrets location: `.env.local` file (gitignored)
- Mock/stub services: None - uses test mode API keys for Google/PDL

**Staging:**
- Not detected - Appears to be single production environment

**Production:**
- Secrets management: `.env` file on VPS
- Database: PostgreSQL on same VPS or remote connection

## Webhooks & Callbacks

**Incoming:**
- Workato - Multiple endpoints
  - `POST /enrich` - Manual enrichment with full lead payload
  - `POST /api/workato/enrich` - Automatic enrichment (Salesforce Lead ID only)
  - Verification: `X-API-Key` header validation
  - Events: Lead creation triggers from LanderLab forms

**Outgoing:**
- Salesforce Lead updates (`src/services/salesforce.ts`)
  - Direct REST API updates via jsforce
  - No webhook callbacks

---

*Integration audit: 2026-01-08*
*Update when adding/removing external services*
