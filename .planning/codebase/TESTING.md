# Testing Patterns

**Analysis Date:** 2026-01-08

## Test Framework

**Runner:**
- Not detected - No test framework installed

**Assertion Library:**
- Not detected

**Run Commands:**
- Not available - No test scripts in `package.json`

## Test File Organization

**Location:**
- No test files detected in codebase
- No `*.test.ts`, `*.spec.ts`, or `__tests__/` directories found
- `tsconfig.json` excludes `tests/` directory, but directory doesn't exist

**Current State:**
- ❌ Zero test infrastructure
- ❌ No test framework dependencies (Vitest, Jest, Mocha)
- ❌ No test configuration files
- ❌ No example tests

**Implications:**
- Manual testing only
- High risk for regressions when modifying core logic
- No automated verification of:
  - Fit score calculation algorithm
  - Salesforce field mapping logic
  - Google Places fuzzy matching
  - External API integration behavior
  - Error handling and retry logic

## Recommendations for Future Testing

**Suggested Framework:**
- Vitest (modern, fast, TypeScript-native)
  - Aligns with existing TypeScript + Zod stack
  - Built-in coverage support
  - Easy mocking for external APIs

**Suggested File Structure:**
```
src/
  services/
    fitScore.ts
    fitScore.test.ts          # Co-located unit tests
  utils/
    retry.ts
    retry.test.ts             # Co-located unit tests
tests/
  integration/
    enrichment-pipeline.test.ts  # Integration tests
    salesforce-update.test.ts    # Integration tests
```

**Priority Areas for Testing:**

1. **Unit Tests (High Priority):**
   - `src/services/fitScore.ts` - Score calculation algorithm
   - `src/services/salesforceFieldMapper.ts` - Field mapping logic
   - `src/utils/retry.ts` - Exponential backoff behavior
   - `src/utils/circuitBreaker.ts` - State transitions

2. **Integration Tests (Medium Priority):**
   - Enrichment pipeline end-to-end (mock external APIs)
   - Salesforce connection and query logic
   - Database audit trail persistence

3. **Mocking Strategy:**
   - Mock external APIs: Google Places, PDL, Salesforce
   - Use fixtures for API response data
   - Mock Puppeteer browser for website tech tests

**Suggested Test Commands:**
```bash
npm test                              # Run all tests
npm test -- --watch                   # Watch mode
npm test -- --coverage                # Coverage report
npm test -- src/services/fitScore.test.ts  # Single file
```

**Coverage Goals:**
- Critical business logic: 80%+ coverage
- Utility functions: 90%+ coverage
- Integration tests for all external API interactions

---

*Testing analysis: 2026-01-08*
*Update when test infrastructure is added*
