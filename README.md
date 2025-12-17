# TSI Fit Score Engine

Automated lead enrichment and scoring system that enriches leads via Workato webhook, calculates a Fit Score (0-100), and returns enrichment data for Salesforce update.

## Architecture

```
LanderLab Form → Workato → Salesforce (create Lead)
                    ↓
              Workato calls POST /enrich
                    ↓
              TSI enriches (Google Places, Website Tech, Clay)
                    ↓
              Returns fit_score + enrichment data
                    ↓
              Workato updates Salesforce Lead
```

- **API Service**: Express.js API (port 4900) that performs synchronous lead enrichment
- **PostgreSQL**: Stores enrichment results for audit trail
- **Workato**: Orchestrates LanderLab → Salesforce flow and triggers enrichment

## Prerequisites

- Node.js >= 18.0.0
- PostgreSQL database
- Google Places API key
- Clay API key

## Environment Variables

Create a `.env` file in the root directory:

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/tsi_fit_score

# Google Places API
GOOGLE_PLACES_API_KEY=your_google_places_api_key_here

# Clay API
CLAY_API_KEY=your_clay_api_key_here

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
   psql -d your_database -f migrations/001_create_leads_table.sql
   psql -d your_database -f migrations/002_create_enrichments_table.sql
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
   psql $DATABASE_URL -f migrations/001_create_leads_table.sql
   psql $DATABASE_URL -f migrations/002_create_enrichments_table.sql
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

### POST /enrich

Synchronous enrichment endpoint for Workato integration.

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
  "fit_tier": "High Fit",
  "employee_estimate": 5,
  "years_in_business": 4,
  "google_reviews_count": 23,
  "google_rating": 4.5,
  "has_website": true,
  "has_physical_location": true,
  "pixels_detected": "meta,ga4",
  "has_meta_pixel": true,
  "has_ga4": true,
  "has_google_ads": false,
  "has_hubspot": false,
  "score_breakdown": "{...}",
  "enrichment_timestamp": "2024-01-01T00:00:00.000Z",
  "request_id": "uuid"
}
```

### GET /health

Health check endpoint (no authentication required).

### GET /enrichment/:salesforceLeadId

Retrieve enrichment data by Salesforce Lead ID (requires X-API-Key header).

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

### Solvency Score (0-80 points)
- **Website present**: +10 points
- **Google Reviews**:
  - < 5 reviews: +0
  - 5-14 reviews: +10
  - 15-29 reviews: +20
  - ≥ 30 reviews: +25
- **Years in Business**:
  - < 2 years: +0
  - 2-3 years: +10
  - 4-7 years: +15
  - ≥ 8 years: +20
- **Employees**:
  - < 3 employees: +0
  - 3-5 employees: +10
  - 6-15 employees: +15
  - ≥ 16 employees: +20
- **Physical Location**: +5 points if operational

### Sophistication Penalty (0 to -27, capped at -20)
- **Meta Pixel detected**: -7
- **GA4/Google Ads tag**: -5
- **Multiple pixels (≥2)**: -10
- **Marketing automation (HubSpot)**: -5

### Fit Tiers
- **0-39**: Disqualified
- **40-59**: MQL
- **60-79**: High Fit
- **80-100**: Premium

## Salesforce Fields

Workato should update these custom fields on Lead records:

| Field API Name | Type | Description |
|---------------|------|-------------|
| `Fit_Score__c` | Number | Fit score (0-100) |
| `Fit_Tier__c` | Picklist | Disqualified/MQL/High Fit/Premium |
| `Employee_Estimate__c` | Number | Estimated employee count |
| `Years_In_Business__c` | Number | Years in business |
| `Google_Reviews_Count__c` | Number | Google review count |
| `Google_Rating__c` | Number | Google rating (1-5) |
| `Has_Website__c` | Checkbox | Has website |
| `Has_Physical_Location__c` | Checkbox | Has physical location |
| `Pixels_Detected__c` | Text | Comma-separated list |
| `Has_Meta_Pixel__c` | Checkbox | Has Meta pixel |
| `Has_GA4__c` | Checkbox | Has GA4 |
| `Has_Google_Ads__c` | Checkbox | Has Google Ads tag |
| `Has_HubSpot__c` | Checkbox | Has HubSpot |
| `Enrichment_Status__c` | Text | completed/no_data |
| `Enrichment_Timestamp__c` | DateTime | When enrichment ran |

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

## Support

For issues or questions, refer to the project documentation or contact the development team.
