# TSI Fit Score Engine MVP

Automated lead enrichment and scoring system that enriches leads at form submit, calculates a Fit Score (0-100), and writes the score + attributes into Salesforce.

## Architecture

- **API Service**: Express.js API that receives webhooks from LanderLab.io and queues enrichment jobs
- **Worker Service**: BullMQ worker that processes enrichment jobs (Google Places, Clay, Website Tech Detection)
- **PostgreSQL**: Stores lead data and enrichment results
- **Redis**: Queue backend for BullMQ
- **Salesforce**: Receives Fit Score and enrichment data updates

## Prerequisites

- Node.js >= 18.0.0
- PostgreSQL database
- Redis instance
- Google Places API key
- Clay API key
- Salesforce credentials (Client ID, Client Secret, Username, Password, Security Token)

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/tsi_fit_score

# Redis
REDIS_URL=redis://localhost:6379

# Google Places API
GOOGLE_PLACES_API_KEY=your_google_places_api_key_here

# Clay API
CLAY_API_KEY=your_clay_api_key_here

# Salesforce
SFDC_LOGIN_URL=https://login.salesforce.com
SFDC_CLIENT_ID=your_salesforce_client_id
SFDC_CLIENT_SECRET=your_salesforce_client_secret
SFDC_USERNAME=your_salesforce_username
SFDC_PASSWORD=your_salesforce_password
SFDC_SECURITY_TOKEN=your_salesforce_security_token

# Application
NODE_ENV=production
LOG_LEVEL=info
PORT=3000
```

## Local Development Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Set up database**:
   - Create a PostgreSQL database
   - Run migrations:
     ```bash
     psql -d your_database -f migrations/001_create_leads_table.sql
     psql -d your_database -f migrations/002_create_enrichments_table.sql
     ```

3. **Start Redis**:
   ```bash
   redis-server
   ```

4. **Build the project**:
   ```bash
   npm run build
   ```

5. **Start services**:
   - API Service:
     ```bash
     cd api && npm run dev
     ```
   - Worker Service:
     ```bash
     cd worker && npm run dev
     ```

## Deployment to Render

### Prerequisites

1. Render account
2. All environment variables configured
3. Database migrations run

### Steps

1. **Connect your repository** to Render

2. **Create services from render.yaml**:
   - Render will automatically detect `render.yaml` and create:
     - API Service (Web Service)
     - Worker Service (Background Worker)
     - PostgreSQL Database
     - Redis Key-Value Store

3. **Configure environment variables**:
   - In Render dashboard, set all required environment variables for both API and Worker services
   - Mark sensitive variables (API keys, passwords) as "Sync" = false

4. **Run database migrations**:
   - Connect to your Render PostgreSQL database
   - Run the migration files:
     ```bash
     psql $DATABASE_URL -f migrations/001_create_leads_table.sql
     psql $DATABASE_URL -f migrations/002_create_enrichments_table.sql
     ```

5. **Deploy services**:
   - Render will automatically build and deploy on git push
   - Monitor logs in Render dashboard

### LanderLab.io Webhook Configuration

1. In LanderLab.io, navigate to your landing page settings
2. Set up webhook:
   - **Webhook URL**: `https://your-api-service.onrender.com/ingest`
   - **HTTP Method**: POST
   - **Payload Format**: JSON

The API accepts both direct API format and LanderLab webhook format. See `sample-payload.json` for examples.

## API Endpoints

### POST /ingest

Webhook endpoint for receiving leads from LanderLab.io or direct API calls.

**Request Body** (Direct API format):
```json
{
  "lead_id": "external_123",
  "salesforce_lead_id": "00Qxxxxxxxxxxxx",
  "business_name": "ABC Roofing",
  "website": "https://abcroofing.com",
  "phone": "+15551234567",
  "email": "owner@abcroofing.com",
  "utm_source": "facebook",
  "fbclid": "xxx",
  "gclid": "",
  "ttclid": "",
  "city": "Austin",
  "state": "TX"
}
```

**Response**:
```json
{
  "status": "accepted",
  "job_id": "job-uuid",
  "lead_row_id": "lead-uuid"
}
```

### GET /health

Health check endpoint.

**Response**:
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### GET /lead/:id

Retrieve lead and enrichment data by lead ID (UUID).

**Response**:
```json
{
  "lead": {
    "id": "uuid",
    "lead_id": "external_123",
    "business_name": "ABC Roofing",
    ...
  },
  "enrichment": {
    "fit_score": 78,
    "fit_tier": "High Fit",
    "google_places_data": {...},
    "clay_data": {...},
    "website_tech_data": {...},
    ...
  }
}
```

## Fit Score Calculation

The Fit Score (0-100) is calculated based on:

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

## Salesforce Integration

The system updates the following custom fields on Lead/Opportunity records:

- `Fit_Score__c` (Number)
- `Fit_Tier__c` (Picklist)
- `Employee_Estimate__c` (Number)
- `Years_In_Business__c` (Number)
- `Google_Reviews_Count__c` (Number)
- `Has_Website__c` (Boolean)
- `Pixels_Detected__c` (Text) - Comma-separated list (e.g., "meta,ga4,tiktok")
- `Marketing_Tools__c` (Text) - Comma-separated list
- `Enrichment_Status__c` (Text)
- `Fit_Score_Timestamp__c` (DateTime)
- `Score_Breakdown__c` (Text) - JSON string with detailed breakdown

## Testing

Run unit tests:
```bash
npm test
```

## Monitoring

- **API Service**: Monitor via `/health` endpoint
- **Worker Service**: Check logs in Render dashboard
- **Queue**: Monitor job status via BullMQ dashboard (if configured)
- **Database**: Monitor via Render PostgreSQL dashboard

## Troubleshooting

### Common Issues

1. **Database connection errors**:
   - Verify `DATABASE_URL` is correct
   - Ensure database is accessible
   - Check firewall rules

2. **Redis connection errors**:
   - Verify `REDIS_URL` is correct
   - Ensure Redis is running
   - Check network connectivity

3. **Google Places API errors**:
   - Verify API key is valid
   - Check API quota/limits
   - Review rate limiting (1 req/sec)

4. **Salesforce update failures**:
   - Verify credentials are correct
   - Check custom fields exist in Salesforce
   - Review Salesforce API limits

5. **Website tech detection timeouts**:
   - Some websites may be slow to load
   - Puppeteer timeout is set to 15 seconds
   - Failed detection doesn't fail the entire job

## Support

For issues or questions, please refer to the project documentation or contact the development team.

