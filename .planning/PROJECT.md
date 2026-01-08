# TSI Fit Score Engine

## What This Is

An automated lead enrichment and scoring system that enriches prospects via Workato webhooks, calculates a retention-based "Fit Score" (0-100) using Google Places, People Data Labs, and website technology detection, and updates Salesforce Leads directly. Currently deployed to production serving LanderLab form submissions.

## Core Value

Accurate, automated enrichment that predicts customer retention potential — enabling sales teams to prioritize leads with the highest long-term value based on business fundamentals and digital presence.

## Requirements

### Validated

- ✓ Webhook-based enrichment via Workato integration — existing
- ✓ Multi-source data enrichment (Google Places, PDL, Website Tech) — existing
- ✓ Fit Score calculation algorithm (0-100 scale with solvency + pixel bonus) — existing
- ✓ Direct Salesforce Lead updates via jsforce OAuth — existing
- ✓ PostgreSQL audit trail for all enrichments — existing
- ✓ Dashboard UI for enrichment statistics and manual operations — existing
- ✓ Batch enrichment endpoints (standard and GMB-only modes) — existing
- ✓ Circuit breaker and retry logic for API resilience — existing
- ✓ Location classification (storefront/office/service area/residential) — existing

### Active

- [ ] **Security**: Fix SOQL injection vulnerabilities in batch endpoints and dashboardStats
- [ ] **Security**: Add authentication to admin endpoints (/api/setup/*)
- [ ] **Security**: Validate environment variables at startup
- [ ] **UX**: Standardize date selector component across all dashboard views (including "today" option)
- [ ] **UX**: Add pagination to auto-enrichment views for viewing more leads
- [ ] **UX**: Convert all Salesforce Lead IDs to clickable links to Salesforce
- [ ] **Filtering**: Exclude "Unknown" lead source from "Inside Sales" across entire app
- [ ] **Manual Enrichment**: Show all updatable fields in lookup results with change highlighting
- [ ] **Data Quality**: Implement multi-variation GMB search (business name variations, address formats, phone searches)
- [ ] **Data Quality**: Improve GMB match rate from current ~25% baseline

### Out of Scope

- No new enrichment data sources (stick with Google Places, PDL, Website Tech) — keeping integration complexity manageable
- No major fit score algorithm changes — proven scoring model, focus on data quality not calculation
- No UI redesign — functional improvements only, preserve existing visual design
- No test infrastructure in this phase — prioritizing production improvements over testing setup

## Context

**Current State:**
- Production system running on Hostinger VPS
- Enriching Facebook leads from LanderLab forms via Workato
- Recent batch enrichments: 5,242 Nov-Dec 2025 leads (25% GMB match), 3,999 Oct 2025 leads (13.9% GMB match)
- Monolithic Express.js architecture (1,889-line src/index.ts)
- No test coverage currently

**Known Issues (from CONCERNS.md):**
- SOQL injection vulnerabilities in 4 locations (src/index.ts:1128, 1600; dashboardStats.ts:233; salesforce.ts:188)
- Admin endpoints exposed without authentication (GET /api/setup/*)
- Missing environment variable validation at startup
- Puppeteer browser created per request (performance bottleneck)
- Low GMB match rates limiting enrichment effectiveness

**Recent Work:**
- Enhanced location detection using Google Places pureServiceAreaBusiness field
- Migration from Clay to People Data Labs for company enrichment
- Batch enrichment infrastructure for backfilling historical leads

## Constraints

- **Tech Stack**: Node.js 18+, TypeScript 5.7, Express.js, PostgreSQL, Puppeteer, jsforce — no major framework changes
- **API Compatibility**: Workato integration must remain stable — no breaking changes to webhook endpoints
- **Deployment**: Hostinger VPS — work within existing infrastructure
- **Production System**: Changes must be backwards compatible and safely deployable to live system

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Security fixes before features | SOQL injection is critical vulnerability with potential data exposure risk | — Pending |
| Multi-variation GMB search strategy | Address low match rates (25%) through fallback search patterns rather than loosening criteria | — Pending |
| Preserve monolithic architecture | Refactoring to microservices would be high-risk for production system; focus on incremental improvements | — Pending |
| Skip test infrastructure for now | Prioritize production improvements; testing can be added in future phase | — Pending |
| Exclude "Unknown" leads globally | Inside Sales team confirmed "Unknown" source leads are low quality and skew metrics | — Pending |

---
*Last updated: 2026-01-08 after initialization*
