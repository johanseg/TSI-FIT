# Test Enrichment Endpoint

Send a test request to the local enrichment endpoint.

First, ensure the dev server is running, then test with:

```bash
curl -X POST http://localhost:4900/enrich \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{
    "salesforce_lead_id": "00Q000000TEST001",
    "business_name": "Test Roofing Co",
    "website": "https://example.com",
    "phone": "+15551234567",
    "city": "Austin",
    "state": "TX"
  }'
```

Analyze the response and verify all enrichment fields are populated correctly.
