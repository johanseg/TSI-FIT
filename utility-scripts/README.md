# Utility Scripts

Standalone utility scripts for analysis, import/export, and database queries. These scripts are separate from the main web application codebase.

## Structure

```
utility-scripts/
  analysis/           # Lead analysis and comparison scripts
  import-export/      # Salesforce import/export scripts
  queries/            # Database query and lookup scripts
```

## Analysis Scripts

### `analysis/analyze-incomplete-leads.js`

Analyzes incomplete leads from CSV file to identify missing data and enrichment gaps.

**Usage:**
```bash
node utility-scripts/analysis/analyze-incomplete-leads.js
```

**Input:** `leads_not_in_salesforce.csv` (must be in project root)

### `analysis/check-facebook-leads.js`

Checks Facebook leads from CSV against Salesforce to identify leads that don't exist or don't match criteria (Facebook source, January 2026).

**Usage:**
```bash
node utility-scripts/analysis/check-facebook-leads.js
```

**Input:** `Leads fb.csv` (must be in project root)
**Output:** `leads_to_import.csv`

### `analysis/compare-leads.js`

Compares leads between different data sources to identify discrepancies and duplicates.

**Usage:**
```bash
node utility-scripts/analysis/compare-leads.js
```

## Import/Export Scripts

### `import-export/enrich-and-import-leads.js`

Enriches incomplete leads by scraping websites for business name and phone, then imports to Salesforce.

**Usage:**
```bash
node utility-scripts/import-export/enrich-and-import-leads.js
```

**Input:** `leads_not_in_salesforce.csv`
**Output:** `enriched_leads_imported.csv`

### `import-export/import-to-salesforce.js`

Imports leads from CSV to Salesforce using Salesforce API.

**Usage:**
```bash
node utility-scripts/import-export/import-to-salesforce.js
```

**Input:** CSV file with lead data
**Output:** Salesforce import results

### `import-export/create-enriched-csv.js`

Creates enriched CSV files from lead enrichment data.

**Usage:**
```bash
node utility-scripts/import-export/create-enriched-csv.js
```

### `import-export/filter-importable-leads.js`

Filters leads based on import criteria before importing to Salesforce.

**Usage:**
```bash
node utility-scripts/import-export/filter-importable-leads.js
```

## Query Scripts

### `queries/query-sf-fields.js`

Queries Salesforce fields and database enrichment records for a specific lead.

**Usage:**
```bash
node utility-scripts/queries/query-sf-fields.js
```

**Note:** Update the Salesforce Lead ID in the script before running.

### `queries/search-ringio-field.js`

Searches for Ringio field values in Salesforce.

**Usage:**
```bash
node utility-scripts/queries/search-ringio-field.js
```

### `queries/extract-websites.js`

Extracts website URLs from lead data sources.

**Usage:**
```bash
node utility-scripts/queries/extract-websites.js
```

## TypeScript Scripts

TypeScript utility scripts for Salesforce operations are located in `scripts/`:

- `scripts/count_fb_leads_today.ts` - Count Facebook leads created today
- `scripts/leads_by_source_today.ts` - Group leads by source for today
- `scripts/test-gmb-match-rate.ts` - Test Google Business Profile match rate
- `scripts/test-gmb-match-rate-sf.ts` - Test GMB match rate against Salesforce leads

## Requirements

Most scripts require:
- Node.js 18+
- Environment variables configured (see main README.md)
- CSV input files in project root (check script comments for specific file names)

## Notes

- These scripts are utility tools and may require manual configuration
- Check script source code for specific input/output file requirements
- Some scripts contain hardcoded database credentials - use environment variables instead
- Scripts are standalone and don't require the main API server to be running
