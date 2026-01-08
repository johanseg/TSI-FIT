# Roadmap: TSI Fit Score Engine

## Overview

Four-phase improvement plan addressing critical security vulnerabilities, UX consistency, manual enrichment workflow, and GMB match rate optimization. Security fixes first, followed by UX improvements, then data quality enhancements.

## Domain Expertise

None

## Phases

- [x] **Phase 1: Security Hardening** - Fix SOQL injection vulnerabilities and add authentication
- [ ] **Phase 2: UX Improvements** - Standardize UI components and add navigation features
- [ ] **Phase 3: Manual Enrichment Enhancement** - Improve field visibility and change tracking
- [ ] **Phase 4: GMB Match Rate Optimization** - Implement multi-variation search strategies

## Phase Details

### Phase 1: Security Hardening
**Goal**: Eliminate SOQL injection vulnerabilities and secure admin endpoints
**Depends on**: Nothing (first phase)
**Research**: Unlikely (fixing known vulnerabilities with established patterns)
**Plans**: 2 plans

Plans:
- [x] 01-01: Fix SOQL injection vulnerabilities in batch endpoints and dashboardStats
- [x] 01-02: Add authentication to admin endpoints and validate environment variables

### Phase 2: UX Improvements
**Goal**: Standardize date selector, add pagination, convert Lead IDs to links, filter "Unknown" leads
**Depends on**: Phase 1
**Research**: Unlikely (internal UI patterns and filtering logic)
**Plans**: 3 plans

Plans:
- [ ] 02-01: Standardize date selector component across all dashboard views
- [ ] 02-02: Add pagination to auto-enrichment views
- [ ] 02-03: Convert Salesforce Lead IDs to clickable links and filter "Unknown" leads

### Phase 3: Manual Enrichment Enhancement
**Goal**: Show all updatable fields with change highlighting in manual enrichment workflow
**Depends on**: Phase 2
**Research**: Unlikely (existing enrichment data structures and UI patterns)
**Plans**: 1 plan

Plans:
- [ ] 03-01: Show all updatable Salesforce fields with change highlighting in lookup results

### Phase 4: GMB Match Rate Optimization
**Goal**: Implement multi-variation GMB search to improve match rates from 25% baseline
**Depends on**: Phase 3
**Research**: Likely (Google Places API search strategies)
**Research topics**: Google Places Text Search API variations, fuzzy matching strategies, phone number search formats, address normalization techniques
**Plans**: 2 plans

Plans:
- [ ] 04-01: Implement fallback search variations (business name, address formats, phone)
- [ ] 04-02: Test and measure match rate improvements, tune search strategies

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Security Hardening | 2/2 | Complete | 2026-01-08 |
| 2. UX Improvements | 0/3 | Not started | - |
| 3. Manual Enrichment Enhancement | 0/1 | Not started | - |
| 4. GMB Match Rate Optimization | 0/2 | Not started | - |
