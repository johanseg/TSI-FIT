# Technology Stack

**Analysis Date:** 2026-01-08

## Languages

**Primary:**
- TypeScript 5.7 - All application code (`package.json`, `tsconfig.json`)

**Secondary:**
- SQL - Database migrations (`migrations/*.sql`)
- JavaScript - Compiled output in `dist/`

## Runtime

**Environment:**
- Node.js 18+ (engines field in `package.json`)
- `.nvmrc` specifies Node 22

**Package Manager:**
- npm 10.x
- Lockfile: `package-lock.json` (version 3)

## Frameworks

**Core:**
- Express.js 4.21.2 - REST API server (`package.json`, `src/index.ts`)

**Testing:**
- Not detected

**Build/Dev:**
- TypeScript 5.7.2 - Compilation (`tsconfig.json`)
- tsx 4.21.0 - TypeScript watch mode for development (`package.json`)
- tsc - Build output to `dist/`

## Key Dependencies

**Critical:**
- jsforce 3.10.10 - Salesforce CRM integration (`src/services/salesforce.ts`)
- puppeteer 24.33.0 - Website tech detection via headless browser (`src/services/websiteTech.ts`)
- pg 8.13.1 - PostgreSQL database client (`src/index.ts`)
- axios 1.7.9 - HTTP client for external APIs (`src/services/googlePlaces.ts`, `src/services/peopleDataLabs.ts`)

**Infrastructure:**
- winston 3.17.0 - Application logging with sensitive data redaction (`src/utils/logger.ts`)
- zod 3.24.1 - Schema validation for API inputs (`src/index.ts`)
- uuid 11.0.3 - Request ID generation (`src/index.ts`)

## Configuration

**Environment:**
- dotenv 17.2.3 - Environment variable loading
- Configuration files:
  - `.env` - Runtime configuration (gitignored)
  - `.env.example` - Configuration template with all required vars
  - Required vars: `DATABASE_URL`, `GOOGLE_PLACES_API_KEY`, `PDL_API_KEY`, `API_KEY`, `SFDC_*` (Salesforce OAuth credentials)

**Build:**
- `tsconfig.json` - TypeScript compiler options
  - Target: ES2022
  - Module: CommonJS
  - Strict mode enabled
  - Source maps and declarations enabled

## Platform Requirements

**Development:**
- Any platform with Node.js 18+ (macOS, Linux, Windows)
- PostgreSQL database (local or remote)
- No additional tooling required

**Production:**
- Deployed to Hostinger VPS (per README.md)
- Express server on port 4900 (configurable via `PORT` env var)
- PostgreSQL database co-located or remote
- Chromium for Puppeteer (installed via npm)

---

*Stack analysis: 2026-01-08*
*Update after major dependency changes*
