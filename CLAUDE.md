# TSI Fit Score Engine

Automated lead enrichment and scoring system that enriches prospects at form submit, calculates a retention-based "Fit Score" (0-100), and writes results back to Salesforce.

## Architecture

- **Monorepo** with npm workspaces: `api/`, `worker/`, `shared/`
- **API Service**: Express.js REST API (port 3000) - receives webhooks, queues jobs
- **Worker Service**: BullMQ background processor - enrichment, scoring, Salesforce sync
- **Database**: PostgreSQL (leads, lead_enrichments tables)
- **Queue**: Redis via BullMQ

## Tech Stack

- Node.js 18+, TypeScript 5.3 (strict mode)
- Express.js 4.18, BullMQ 5.3, Puppeteer 21.6
- PostgreSQL (pg), Redis (ioredis)
- jsforce (Salesforce), axios, Zod validation
- Winston logging, Jest testing

## Common Commands

```bash
npm install                 # Install all workspace dependencies
npm run build               # Build all packages (api, worker, shared)
npm test                    # Run Jest tests

# Development (run in separate terminals)
cd api && npm run dev       # Start API on port 3000
cd worker && npm run dev    # Start background worker

# Database migrations
psql -d $DATABASE_URL -f migrations/001_create_leads_table.sql
psql -d $DATABASE_URL -f migrations/002_create_enrichments_table.sql
```

## Project Structure

```
api/src/
  server.ts              # Express app entry point
  routes/                # API endpoints (ingest, health, lead)
  middleware/            # Logging, validation
  services/queue.ts      # BullMQ queue integration

worker/src/
  worker.ts              # BullMQ worker entry point
  processors/enrichLead.ts   # Main enrichment orchestrator
  services/
    googlePlaces.ts      # Google Places API
    clay.ts              # Clay enrichment (employees, revenue)
    websiteTech.ts       # Puppeteer tech detection
    fitScore.ts          # Score calculation algorithm
    salesforce.ts        # Salesforce API integration
  utils/                 # Retry, circuit breaker patterns

shared/src/
  types/lead.ts          # TypeScript interfaces
  database/client.ts     # PostgreSQL pool
  utils/logger.ts        # Winston logger
```

## Data Flow

1. `POST /ingest` receives form submission
2. Lead inserted into PostgreSQL
3. Job queued via BullMQ/Redis
4. Worker processes: Google Places → Website Tech → Clay → Fit Score → Salesforce
5. Results stored in lead_enrichments table

## Fit Score Algorithm

**Solvency (0-80 points):** Website (+10), Google reviews (0-25), Years in business (0-20), Employees (0-20), Physical location (+5)

**Sophistication Penalty (-20 max):** Meta Pixel (-7), GA4/Google Ads (-5), Multiple pixels (-10), Marketing automation (-5)

**Tiers:** 0-39 Disqualified, 40-59 MQL, 60-79 High Fit, 80-100 Premium

## Environment Variables

```
DATABASE_URL, REDIS_URL
GOOGLE_PLACES_API_KEY, CLAY_API_KEY
SFDC_LOGIN_URL, SFDC_CLIENT_ID, SFDC_CLIENT_SECRET
SFDC_USERNAME, SFDC_PASSWORD, SFDC_SECURITY_TOKEN
NODE_ENV, PORT, LOG_LEVEL
```

## Deployment

Deployed to Render.com via `render.yaml` (API web service + Worker background service + PostgreSQL + Redis).
