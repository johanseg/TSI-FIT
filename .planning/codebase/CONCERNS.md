# Codebase Concerns

**Analysis Date:** 2026-01-08

## Security Issues

**SOQL Injection Vulnerabilities (CRITICAL):**
- Issue: Multiple endpoints build SOQL queries via string interpolation without parameterization
- Files affected:
  - `src/index.ts:1128` - Batch GMB enrichment: `const query = \`SELECT ... WHERE Id IN (${leadIds})\``
  - `src/index.ts:1600` - Workato automatic enrichment: `WHERE Id = '${salesforce_lead_id}'`
  - `src/services/dashboardStats.ts:233` - Lead source filter: `AND LeadSource = '${leadSource}'`
  - `src/services/salesforce.ts:188` - Lead verification: `WHERE Id = '${leadId}'`
- Impact: User-controlled input directly interpolated into SOQL queries (potential injection)
- Fix approach: Validate Salesforce ID format (`^00[a-zA-Z0-9]{13}$`) or use parameterized queries if jsforce supports them

**Missing Authentication on Admin Endpoints:**
- Issue: Setup and diagnostic endpoints exposed without authentication
- Files: `src/index.ts:138-293`
  - `GET /api/setup/status` - Exposes all environment variable status
  - `GET /api/setup/logs` - Exposes 500 most recent log entries
  - `POST /api/setup/test-database` - Runs database queries
  - `GET /api/setup/database-stats` - Exposes database statistics
- Impact: Sensitive configuration and system information exposed to anyone
- Fix approach: Add `authenticateApiKey` middleware to these routes

**Missing Environment Variable Validation:**
- Issue: Required env vars not validated at startup
- File: `src/index.ts:54,122-127`
- Impact: Runtime failures instead of failing fast at startup
- Fix approach: Add startup validation that checks all required env vars before starting server

## Tech Debt

**Monolithic Route File:**
- Issue: Single 1,889-line file contains all routes, middleware, and orchestration logic
- File: `src/index.ts`
- Why: Rapid development without refactoring
- Impact: Difficult to navigate, test, and maintain
- Fix approach: Extract routes into separate files (`src/routes/enrichment.ts`, `src/routes/dashboard.ts`, `src/routes/setup.ts`)

**Puppeteer Instance Per Request:**
- Issue: New browser instance created for every enrichment request
- Files: `src/index.ts:386,912,1360,1628` - Multiple `new WebsiteTechService()` calls
- Why: Simple implementation without resource pooling
- Impact: High memory usage, slow browser initialization (500ms+ per request)
- Fix approach: Implement singleton browser instance or connection pool in `src/services/websiteTech.ts`

**Swallowed Database Errors:**
- Issue: Database insert failures logged but don't affect API response
- Files:
  - `src/index.ts:507-539` - `/api/enrich-by-id` endpoint
  - `src/index.ts:1745-1778` - `/api/workato/enrich` endpoint
- Why: Graceful degradation prioritized over data consistency
- Impact: Enrichment data loss is silent; clients won't know audit trail wasn't persisted
- Fix approach: Either fail the request on DB error, or add explicit `database_persisted: false` in response

## Known Bugs

**Recursive Retry Without Limit:**
- Symptoms: Potential stack overflow in edge cases with persistent Salesforce errors
- Trigger: Salesforce API repeatedly returns retryable errors
- File: `src/services/salesforce.ts:355-363` - `updateLead()` calls itself recursively
- Root cause: Retry logic uses recursion instead of iteration
- Fix: Convert to iterative loop with max retry count

## Performance Bottlenecks

**Dashboard Statistics Queries:**
- Problem: Multiple parallel database queries on every KPI request
- File: `src/index.ts:831` - `/api/dashboard/enrichment-kpis` endpoint
- Measurement: 5+ parallel DB queries, no caching
- Cause: No result caching layer
- Improvement path: Add 1-5 minute cache for dashboard KPIs using in-memory cache or Redis

**Batch Processing Concurrency:**
- Problem: Batch endpoints could exhaust system resources
- Files:
  - `src/index.ts:1039` - `/api/dashboard/enrich-batch` (5 concurrent, up to 100 leads)
  - `src/index.ts:1123` - `/api/dashboard/enrich-batch-gmb-only` (20 concurrent, up to 100 leads)
- Measurement: No queue backpressure or rate limiting
- Cause: Simple Promise.all() implementation
- Improvement path: Implement queue with resource limits (e.g., BullMQ)

## Missing Critical Features

**No Test Coverage:**
- Problem: Zero unit tests or integration tests
- Current workaround: Manual testing only
- Blocks: Confident refactoring, regression prevention, CI/CD pipeline
- Implementation complexity: Medium (need to add Vitest, write tests, set up mocks)
- Priority: High - especially for `fitScore.ts`, `salesforceFieldMapper.ts`, `retry.ts`

**No Rate Limiting:**
- Problem: Batch endpoints vulnerable to abuse
- Current workaround: None
- Blocks: DoS protection, fair resource usage
- Implementation complexity: Low (use express-rate-limit middleware)

**No Request Deduplication:**
- Problem: Same lead enriched multiple times = duplicate API costs
- Current workaround: None
- Blocks: Cost optimization
- Implementation complexity: Medium (need Redis or in-memory cache with TTL)

## Missing Input Validation

**Batch Endpoint Parameters:**
- Issue: Insufficient validation on user-supplied parameters
- Files:
  - `src/index.ts:1039` - `concurrency` parameter not validated for type/range
  - `src/index.ts:615` - `limit` and `offset` not validated for negative values
  - `src/services/dashboardStats.ts:233` - `leadSource` used without escaping
- Impact: Type errors, SQL injection, unexpected behavior
- Fix approach: Add Zod schemas for all query parameters

## Fragile Areas

**Error Handling in WebsiteTech Service:**
- File: `src/services/websiteTech.ts`
- Why fragile: Browser initialization may fail, but `close()` called in finally block regardless
- Common failures: Browser not initialized error if called before `initialize()`
- Safe modification: Add null checks in `close()` method
- Test coverage: None

**Salesforce Connection State:**
- File: `src/services/salesforce.ts`
- Why fragile: Connection caching relies on session validation, but errors may leave stale connection
- Common failures: Session expired, connection timeout
- Safe modification: Always validate connection before queries, implement connection refresh logic
- Test coverage: None

## Dependencies at Risk

**No Critical Dependency Issues:**
- All dependencies appear to be at current or recent versions
- jsforce 3.10.10 - Current stable release
- puppeteer 24.33.0 - Current stable release
- winston 3.17.0 - Actively maintained
- express 4.21.2 - Stable, actively maintained

**Note:** Run `npm audit` to check for security vulnerabilities in dependencies

## Test Coverage Gaps

**All Core Business Logic Untested:**
- What's not tested: Everything (no tests exist)
- Files without tests:
  - `src/services/fitScore.ts` - Scoring algorithm
  - `src/services/salesforceFieldMapper.ts` - Field mapping
  - `src/services/googlePlaces.ts` - GMB matching
  - `src/utils/retry.ts` - Retry logic
  - `src/utils/circuitBreaker.ts` - Circuit breaker
- Risk: Regressions go unnoticed, refactoring is dangerous
- Priority: High
- Difficulty to test: Low to medium (requires API mocking)

---

*Concerns audit: 2026-01-08*
*Update as issues are fixed or new ones discovered*
