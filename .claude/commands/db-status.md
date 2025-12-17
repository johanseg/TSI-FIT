# Database Status

Check the database connection and recent enrichments.

```bash
psql "$DATABASE_URL" -c "SELECT COUNT(*) as total_enrichments FROM lead_enrichments;"
psql "$DATABASE_URL" -c "SELECT salesforce_lead_id, fit_score, fit_tier, created_at FROM lead_enrichments ORDER BY created_at DESC LIMIT 10;"
```

Report the total count and recent enrichment activity.
