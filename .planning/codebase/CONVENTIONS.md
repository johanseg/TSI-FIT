# Coding Conventions

**Analysis Date:** 2026-01-08

## Naming Patterns

**Files:**
- camelCase for all TypeScript files (`googlePlaces.ts`, `fitScore.ts`, `retry.ts`)
- Migration files: Numbered prefix with snake_case (`001_create_leads_table.sql`)
- No special test file suffixes (no tests present)

**Functions:**
- camelCase for all functions (`calculateFitScore`, `enrichSingleLead`, `mapToSalesforceFields`)
- Async functions have no special prefix
- Event handlers not applicable (server-side only)

**Variables:**
- camelCase for variables (`enrichmentData`, `leadPayload`, `websiteUrl`)
- SCREAMING_SNAKE_CASE for constants (`MAX_LOG_ENTRIES`, `INVALID_WEBSITE_DOMAINS`)
- Boolean variables prefixed with `has_` or `is_` (`has_website`, `is_service_area_business`)

**Types:**
- PascalCase for interfaces (`GooglePlacesData`, `LeadPayload`, `ScoreBreakdown`)
- PascalCase for type aliases (`EmployeePicklist`, `LocationTypePicklist`)
- PascalCase for classes (`GooglePlacesService`, `CircuitBreaker`, `SalesforceService`)
- No `I` prefix for interfaces

## Code Style

**Formatting:**
- No Prettier or ESLint config files detected
- Inferred from code:
  - 2-space indentation (consistent across all files)
  - Single quotes for strings
  - Semicolons required at end of statements
  - Space before opening brace: `if (condition) {`
  - No space between function name and parentheses: `function name()`

**Linting:**
- Not detected - No ESLint configuration
- TypeScript strict mode acts as linter via `tsconfig.json`

## Import Organization

**Order:**
1. External packages (axios, jsforce, puppeteer, winston)
2. Internal utilities (`../utils/logger`, `../utils/retry`)
3. Type imports (`../types/lead`)

**Grouping:**
- No blank lines between import groups (informal organization)
- Alphabetical within each type not enforced

**Path Aliases:**
- None detected - All imports use relative paths (`./`, `../`)

## Error Handling

**Patterns:**
- Throw errors in services, catch at route/boundary level
- Custom error messages with context
- Async functions use try/catch, no `.catch()` chains
- Example from `src/services/googlePlaces.ts`:
  ```typescript
  try {
    return await this.circuitBreaker.execute(async () => {
      return retryWithBackoff(async () => {
        // API call
      });
    });
  } catch (error) {
    logger.error('Google Places enrichment failed', { error, businessName });
    return null;
  }
  ```

**Error Types:**
- Throw on invalid configuration (missing API keys)
- Return null for expected failures (no match found, API unavailable)
- Log errors with context before returning null

## Logging

**Framework:**
- Winston 3.17.0 (`src/utils/logger.ts`)
- Levels: error, warn, info, debug

**Patterns:**
- Structured logging with metadata objects
  ```typescript
  logger.info('Enrichment completed', {
    requestId,
    fitScore: result.fit_score,
    duration: endTime - startTime
  });
  ```
- Sensitive data redaction (emails, phone numbers) via custom format
- Log at service boundaries and key decision points
- No console.log in committed code (Winston only)

## Comments

**When to Comment:**
- Explain why, not what
- Document business logic and scoring algorithms
- Example from `src/services/fitScore.ts`:
  ```typescript
  /**
   * Calculate Fit Score based on enrichment data
   *
   * Solvency Score (0-95):
   * - Website: +10 if present
   * - Google Reviews: 0-25 (scaled by count)
   * ...
   */
  ```

**JSDoc/TSDoc:**
- Used for complex functions with multi-line block comments
- Not enforced consistently across all public functions
- Includes parameter explanations and algorithm breakdowns

**TODO Comments:**
- None detected in codebase search
- No specific format convention established

## Function Design

**Size:**
- No enforced limit
- `src/index.ts` contains long route handlers (50-200 lines each)
- Service methods generally 20-100 lines

**Parameters:**
- No strict limit
- Prefer objects for 4+ parameters
- Example: `retryWithBackoff(fn, options, context)` uses options object

**Return Values:**
- Explicit return statements
- Return early for guard clauses
- Async functions return `Promise<T>` or `Promise<T | null>`
- Null indicates expected failure (no data found, API unavailable)

## Module Design

**Exports:**
- Named exports preferred for classes and functions
- No default exports detected
- Example: `export class GooglePlacesService`, `export async function retryWithBackoff`

**Barrel Files:**
- Not used - No `index.ts` files for re-exports
- Direct imports from specific files

**Dependencies:**
- No circular dependencies detected
- Clear layer separation (utils → types → services → routes)

---

*Convention analysis: 2026-01-08*
*Update when patterns change*
