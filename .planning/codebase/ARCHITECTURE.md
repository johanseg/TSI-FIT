# Architecture

**Analysis Date:** 2026-01-08

## Pattern Overview

**Overall:** Monolithic Express.js REST API with Service-Oriented Architecture

**Key Characteristics:**
- Single Express.js server (port 4900) handling all requests
- Synchronous enrichment pipeline (no async queues or workers)
- Service-oriented with clear separation between enrichment sources
- Layered architecture with strict boundaries
- Database-backed for audit trail and analytics

## Layers

**API/Routes Layer:**
- Purpose: HTTP request handling, routing, middleware, response formatting
- Contains: Express route handlers, request validation, authentication middleware
- Location: `src/index.ts` (1889 lines - monolithic entry point)
- Depends on: Service layer for business logic
- Used by: Workato webhooks, dashboard UI

**Service Layer:**
- Purpose: Business logic and external API integrations
- Contains: Enrichment services, Salesforce operations, field mapping
- Location: `src/services/*.ts`
  - `googlePlaces.ts` - Google Places API integration, GMB matching
  - `peopleDataLabs.ts` - PDL API integration, company enrichment
  - `websiteTech.ts` - Puppeteer-based website tech detection
  - `salesforce.ts` - Salesforce OAuth + CRUD operations
  - `fitScore.ts` - Fit score calculation algorithm (0-100)
  - `salesforceFieldMapper.ts` - Data transformation to SF picklist types
  - `dashboardStats.ts` - Analytics queries
- Depends on: Types layer, utils layer, external APIs
- Used by: API routes layer

**Types/Data Models Layer:**
- Purpose: TypeScript interfaces defining all data contracts
- Contains: Request/response payloads, enrichment data structures, Salesforce field mappings
- Location: `src/types/lead.ts`
- Depends on: Nothing (pure type definitions)
- Used by: All layers for type safety

**Utilities Layer:**
- Purpose: Cross-cutting concerns and infrastructure
- Contains: Logging, retry logic, circuit breaker pattern
- Location: `src/utils/*.ts`
  - `logger.ts` - Winston logger with sensitive data redaction
  - `retry.ts` - Exponential backoff retry logic
  - `circuitBreaker.ts` - Circuit breaker for service resilience
- Depends on: Nothing
- Used by: Service layer, API layer

**Data/Database Layer:**
- Purpose: PostgreSQL audit trail and analytics
- Contains: Database connection pool, migration scripts
- Location: `src/index.ts` (pool initialization), `migrations/*.sql`
- Depends on: Nothing
- Used by: API layer for audit trail persistence

## Data Flow

**Enrichment Request Lifecycle:**

1. **Entry Point:** Workato sends webhook to `POST /enrich` or `POST /api/workato/enrich`
2. **Authentication:** `authenticateApiKey()` middleware validates X-API-Key header
3. **Request Validation:** Zod schema validates incoming payload
4. **Enrichment Pipeline (parallel execution):**
   - Google Places Service → GMB data (reviews, location, business type)
   - People Data Labs Service → Company data (employees, revenue, industry)
   - Website Tech Service → Puppeteer detects marketing pixels
5. **Fit Score Calculation:** `fitScore.ts` calculates 0-100 score with breakdown
6. **Salesforce Field Mapping:** `salesforceFieldMapper.ts` transforms to SF types
7. **Salesforce Update:** `salesforce.ts` updates Lead record via jsforce
8. **Database Audit:** PostgreSQL stores full enrichment data for analytics
9. **Response:** JSON response with fit score, enrichment summary, SF update status

**State Management:**
- Stateless API - no session persistence
- Database stores enrichment history
- Salesforce stores current state of leads

## Key Abstractions

**Service Pattern:**
- Purpose: Encapsulate external API integration logic
- Examples: `GooglePlacesService`, `PeopleDataLabsService`, `WebsiteTechService`, `SalesforceService`
- Pattern: Class-based with constructor injection of API keys/config
- Methods: Async/await returning strongly-typed data or null

**Fit Score Algorithm:**
- Purpose: Single source of truth for scoring logic
- Example: `calculateFitScore(enrichmentData)` in `src/services/fitScore.ts`
- Pattern: Pure function taking partial data, returning score + breakdown
- Scoring components:
  - Solvency (0-95): website, reviews, years, employees, location, marketing spend
  - Pixel bonus (0-10): +5 for 1 pixel, +10 for 2+ pixels

**Field Mapper:**
- Purpose: Centralized Salesforce field transformations
- Example: `mapToSalesforceFields()` in `src/services/salesforceFieldMapper.ts`
- Pattern: Functional mapping from enrichment data to SF picklist values
- Handles: Employee ranges, years in business ranges, review buckets, location types

**Circuit Breaker:**
- Purpose: Prevent cascading failures from external API failures
- Example: `CircuitBreaker` class in `src/utils/circuitBreaker.ts`
- Pattern: States (CLOSED, OPEN, HALF_OPEN), failure threshold, reset timeout
- Applied to: Google Places, PDL, Salesforce API calls

**Retry with Backoff:**
- Purpose: Handle transient failures from external APIs
- Example: `retryWithBackoff()` in `src/utils/retry.ts`
- Pattern: Exponential backoff (1s → 2s → 4s → 8s → 10s max)
- Applied to: All external API calls

## Entry Points

**Main HTTP Entry:**
- Location: `src/index.ts` (lines 1878-1888)
- Triggers: HTTP requests to port 4900
- Responsibilities: Express app initialization, route registration, middleware setup

**Enrichment Endpoints:**
- `POST /enrich` - Manual enrichment (full lead payload)
- `POST /api/workato/enrich` - Automatic enrichment (SF Lead ID only)
- `POST /api/enrich-by-id/:salesforceLeadId` - Enrich specific lead
- `POST /api/dashboard/enrich-batch` - Batch enrichment (up to 100 leads)
- `POST /api/dashboard/enrich-batch-gmb-only` - GMB-only batch (faster, no PDL/website tech)

**Dashboard/Admin Endpoints:**
- `GET /health` - Health check (no auth)
- `GET /api/dashboard/enrichment-kpis` - KPI statistics
- `GET /api/dashboard/stats` - Lead statistics by date range
- `GET /api/setup/status` - System configuration status
- `GET /api/setup/logs` - Recent log entries (500 max)

## Error Handling

**Strategy:** Try/catch at route level, log errors, return appropriate HTTP status codes

**Patterns:**
- Services throw errors with descriptive messages
- Route handlers catch, log to Winston, return 4xx/5xx status codes
- Partial enrichment success tolerated (one source fails, others succeed)

**Circuit Breaker:** Prevents cascading failures by opening after 5 failures, resetting after 60 seconds

**Retry Logic:** Exponential backoff with 3 retries for transient failures

**Graceful Degradation:** Database unavailable → enrichment still works, just not persisted

## Cross-Cutting Concerns

**Logging:**
- Winston logger with sensitive data redaction (`src/utils/logger.ts`)
- Structured JSON logging with metadata
- In-memory circular buffer (500 entries) for admin dashboard
- Levels: error, warn, info, debug

**Validation:**
- Zod schemas for API request validation (`src/index.ts`)
- TypeScript strict mode for compile-time type safety
- Input sanitization before Salesforce queries

**Error Resilience:**
- Circuit breaker pattern for external APIs (`src/utils/circuitBreaker.ts`)
- Retry with exponential backoff (`src/utils/retry.ts`)
- Graceful degradation when optional services fail

---

*Architecture analysis: 2026-01-08*
*Update when major patterns change*
