# TSI Fit Score Engine

Automated lead enrichment and scoring system that enriches leads via Workato webhook, calculates a Fit Score (0-100), and returns enrichment data for Salesforce update.

## Architecture

```
LanderLab Form → Workato → Salesforce (create Lead)
                    ↓
              Workato calls POST /enrich or POST /api/workato/enrich
                    ↓
              TSI enriches (Google Places, Website Tech, People Data Labs)
                    ↓
              TSI updates Salesforce Lead directly (or returns data for Workato)
                    ↓
              Returns fit_score + enrichment data + Score__c (0-5)
```

- **API Service**: Express.js API (port 4900) that performs synchronous lead enrichment
- **PostgreSQL**: Stores enrichment results for audit trail (leads and lead_enrichments tables)
- **Salesforce**: Direct Lead updates via jsforce (OAuth 2.0) - updates custom fields and standard fields
- **Dashboard**: Internal web dashboard at `/dashboard` for monitoring and manual operations
- **Workato**: Orchestrates LanderLab → Salesforce flow and triggers enrichment

## Prerequisites

- Node.js >= 18.0.0
- PostgreSQL database
- Google Places API key
- People Data Labs API key
- Salesforce credentials (OAuth 2.0 Connected App)

## Environment Variables

Create a `.env` file in the root directory:

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/tsi_fit_score

# Google Places API
GOOGLE_PLACES_API_KEY=your_google_places_api_key_here

# People Data Labs API
PDL_API_KEY=your_pdl_api_key_here

# Salesforce OAuth 2.0
SFDC_CLIENT_ID=your_salesforce_client_id
SFDC_CLIENT_SECRET=your_salesforce_client_secret
SFDC_USERNAME=your_salesforce_username
SFDC_PASSWORD=your_salesforce_password
SFDC_SECURITY_TOKEN=your_salesforce_security_token
SFDC_LOGIN_URL=https://login.salesforce.com

# API Authentication (for Workato webhook calls)
API_KEY=your_secure_api_key_here

# Application
NODE_ENV=production
LOG_LEVEL=info
PORT=4900
```

## Local Development Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Set up database**:
   ```bash
   # Run all migrations in order
   psql $DATABASE_URL -f migrations/001_create_leads_table.sql
   psql $DATABASE_URL -f migrations/002_create_enrichments_table.sql
   psql $DATABASE_URL -f migrations/003_salesforce_aligned_fields.sql
   psql $DATABASE_URL -f migrations/004_add_utm_and_address_fields.sql
   psql $DATABASE_URL -f migrations/005_drop_fit_tier_column.sql
   psql $DATABASE_URL -f migrations/006_fix_enrichments_lead_id.sql
   psql $DATABASE_URL -f migrations/007_replace_clay_with_pdl.sql
   psql $DATABASE_URL -f migrations/008_add_score_column.sql
   ```

3. **Build the project**:
   ```bash
   npm run build
   ```

4. **Start the server**:
   ```bash
   npm run dev
   ```

## Deployment to Hostinger

### Prerequisites

1. Hostinger VPS account
2. Node.js 18+ installed on server
3. PostgreSQL database configured

### Steps

1. **Set up your VPS**:
   - Install Node.js and PostgreSQL
   - Clone the repository

2. **Configure environment variables**:
   - Create `.env` file with all required variables
   - Generate a secure API key for Workato authentication

3. **Run database migrations**:
   ```bash
   # Run all migrations in order
   psql $DATABASE_URL -f migrations/001_create_leads_table.sql
   psql $DATABASE_URL -f migrations/002_create_enrichments_table.sql
   psql $DATABASE_URL -f migrations/003_salesforce_aligned_fields.sql
   psql $DATABASE_URL -f migrations/004_add_utm_and_address_fields.sql
   psql $DATABASE_URL -f migrations/005_drop_fit_tier_column.sql
   psql $DATABASE_URL -f migrations/006_fix_enrichments_lead_id.sql
   psql $DATABASE_URL -f migrations/007_replace_clay_with_pdl.sql
   psql $DATABASE_URL -f migrations/008_add_score_column.sql
   ```

4. **Build and start**:
   ```bash
   npm install
   npm run build
   node dist/index.js
   ```

5. **Set up process manager** (recommended):
   - Use PM2: `pm2 start dist/index.js --name tsi-fit-score`
   - Configure automatic restarts on failure

## API Endpoints

### Production Endpoints (Workato Integration)

#### POST /enrich (X-API-Key required)

Synchronous enrichment endpoint for Workato integration. Receives lead data, enriches it, and returns Salesforce field mappings for Workato to update the Lead record.

**Headers:**
- `X-API-Key`: Your API key (required)
- `Content-Type`: application/json

**Request Body:**
```json
{
  "salesforce_lead_id": "00Qxxxxxxxxxxxx",
  "business_name": "ABC Roofing",
  "website": "https://abcroofing.com",
  "phone": "+15551234567",
  "city": "Austin",
  "state": "TX"
}
```

**Response:**
```json
{
  "enrichment_status": "completed",
  "fit_score": 78,
  "employee_count": 12,
  "employee_size_range": "11-50",
  "years_in_business": 8,
  "year_founded": 2016,
  "industry": "construction",
  "inferred_revenue": "$1M-$10M",
  "google_reviews_count": 23,
  "google_rating": 4.5,
  "has_physical_location": true,
  "pixels_detected": "meta,ga4",
  "has_meta_pixel": true,
  "has_ga4": true,
  "has_google_ads": false,
  "has_hubspot": false,
  "score_breakdown": "{...}",
  "salesforce_fields": {
    "Website": "https://example.com",
    "Has_Website__c": true,
    "Number_of_Employees__c": "3 - 5",
    "Number_of_GBP_Reviews__c": "Over 14",
    "Fit_Score__c": 78,
    "Has_GMB__c": true,
    "GMB_URL__c": "https://www.google.com/maps/place/?q=place_id:...",
    "Spending_on_Marketing__c": true,
    "Lead_Vertical__c": "Roofing"
  },
  "enrichment_timestamp": "2024-01-01T00:00:00.000Z",
  "request_id": "uuid"
}
```

#### POST /api/workato/enrich (X-API-Key required)

Automatic enrichment endpoint. Workato sends Salesforce Lead ID, TSI fetches the lead, enriches it, and updates Salesforce directly.

**Request:**
```json
{
  "salesforce_lead_id": "00Qxxxxxxxxxxxx"
}
```

**Response:**
```json
{
  "success": true,
  "request_id": "uuid",
  "enrichment_status": "completed",
  "fit_score": 78,
  "score": 3,
  "salesforce_updated": true,
  "duration_ms": 5230,
  "lead": {
    "id": "00Qxxxxxxxxxxxx",
    "company": "ABC Roofing",
    "website": "https://abcroofing.com",
    "phone": "+15551234567",
    "city": "Austin",
    "state": "TX"
  },
  "enrichment_summary": {
    "google_places_found": true,
    "pdl_found": true,
    "website_tech_scanned": true,
    "google_reviews": 23,
    "google_rating": 4.5,
    "employee_count": 12,
    "years_in_business": 8,
    "pixels_detected": ["meta", "ga4"]
  },
  "score_breakdown": {...}
}
```

### Dashboard Endpoints (Internal - No Auth)

#### GET /health

Health check endpoint (no authentication required).

#### GET /api/lead/:salesforceLeadId

Retrieve enrichment data by Salesforce Lead ID (from database and Salesforce).

#### GET /api/dashboard/enrichment-kpis

Returns enrichment KPIs for selected period (today, yesterday, this week, last week, etc.). Supports pagination.


## Workato Integration

### HTTP Action Configuration

1. **URL**: `https://your-domain.com:4900/enrich`
2. **Method**: POST
3. **Headers**:
   - `X-API-Key`: `your_api_key`
   - `Content-Type`: `application/json`
4. **Request Body**: Map Salesforce Lead fields:
   ```json
   {
     "salesforce_lead_id": "{Lead.Id}",
     "business_name": "{Lead.Company}",
     "website": "{Lead.Website}",
     "phone": "{Lead.Phone}",
     "city": "{Lead.City}",
     "state": "{Lead.State}"
   }
   ```
5. **Response Handling**: Map response fields to Salesforce Lead update action

## Fit Score Calculation

### Solvency Score (0-95 points)
- **GMB Match**: +10 if Google Business Profile found (place_id exists)
- **Website**: +15 (custom domain), +5 (GMB/Google URL), +0 (subdomain/social)
- **Google Reviews**:
  - < 5 reviews: +0
  - 5-14 reviews: +10
  - 15-29 reviews: +20
  - ≥ 30 reviews: +25
- **Years in Business**:
  - < 2 years: +0
  - 2-3 years: +5
  - 4-7 years: +10
  - ≥ 8 years: +15
- **Employees**:
  - < 2 employees: +0
  - 2-4 employees: +5
  - > 5 employees: +15
- **Physical Location**:
  - Storefront/Office: +20
  - Service-area business: +10
  - Residential/Unknown: +0
- **Marketing Spend**:
  - $0: +0
  - <$500: +5
  - ≥$500: +10

### Pixel Bonus (0-10 points)
- **1 pixel detected**: +5
- **2+ pixels detected**: +10

### Final Score
`clamp(SolvencyScore + PixelBonus, 0, 100)`

### Score__c Mapping (0-5, for Facebook/TikTok/Google leads only)
- **0**: Disqualified (no business verification)
- **1-39**: Score 1 (Low Quality)
- **40-59**: Score 2 (MQL)
- **60-79**: Score 3 (Good MQL)
- **80-99**: Score 4 (High Quality)
- **100**: Score 5 (Premium)

**Note:** Score__c is only calculated and updated for leads with `LeadSource` = 'Facebook', 'TikTok', or 'Google'.

## Salesforce Fields

The system automatically updates these custom fields on Lead records:

| Field API Name | Type | Description |
|---------------|------|-------------|
| `Fit_Score__c` | Number | Fit score (0-100) |
| `Score__c` | Number | Score (0-5) - **Only for Facebook/TikTok/Google leads** |
| `Has_Website__c` | Checkbox | Has website |
| `Number_of_Employees__c` | Picklist | 0, 1 - 2, 3 - 5, Over 5 |
| `Number_of_GBP_Reviews__c` | Picklist | Under 15, Over 14 |
| `Number_of_Years_in_Business__c` | Picklist | Under 1 Year, 1 - 3 Years, 3 - 5 Years, 5 - 10+ years |
| `Has_GMB__c` | Checkbox | Has Google Business Profile |
| `GMB_URL__c` | URL | Google Business Profile URL |
| `Location_Type__c` | Picklist | Home Office, Physical Location (Office), Retail Location (Store Front) - **Never auto-updated** |
| `Business_License__c` | Checkbox | Has business license (not determinable from enrichment) |
| `Spending_on_Marketing__c` | Checkbox | Domain age > 2 years AND has advertising pixels |
| `Lead_Vertical__c` | Picklist | Business vertical mapped from GMB types (overwrites existing) |

**Standard Fields (updated from GMB data):**
- `Website`: Updated from GMB if missing
- `Street`, `City`, `State`, `PostalCode`: Updated from GMB (address correction for high-confidence matches)
- `Notes__c`: Audit notes for address corrections

**Note:** Phone number is **never** updated from GMB data - it's a primary lead identifier and must be preserved.

## Testing

```bash
npm test
```

## Monitoring

- **API Health**: `GET /health`
- **Logs**: Check application logs for enrichment status
- **Database**: Query `lead_enrichments` table for audit trail

## Troubleshooting

### Common Issues

1. **401 Unauthorized**:
   - Verify `X-API-Key` header is set correctly
   - Check `API_KEY` environment variable

2. **Database connection errors**:
   - Verify `DATABASE_URL` is correct
   - Ensure database is accessible

3. **Google Places API errors**:
   - Verify API key is valid
   - Check API quota/limits

4. **Website tech detection timeouts**:
   - Some websites may be slow to load
   - Puppeteer timeout is 15 seconds
   - Failed detection doesn't fail the entire request

## Utility Scripts

Standalone utility scripts for analysis, import/export, and database queries are located in `utility-scripts/`. See [utility-scripts/README.md](utility-scripts/README.md) for documentation.

TypeScript utility scripts for Salesforce operations are in `scripts/`.

## Support

For issues or questions, refer to the project documentation or contact the development team.
