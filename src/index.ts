import express from 'express';
import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import winston from 'winston';
import path from 'path';

// Services
import { GooglePlacesService } from './services/googlePlaces';
import { ClayService } from './services/clay';
import { WebsiteTechService } from './services/websiteTech';
import { calculateFitScore } from './services/fitScore';
import { SalesforceService } from './services/salesforce';
import { DashboardStatsService } from './services/dashboardStats';

// Types
import { EnrichmentData } from './types/lead';

// Logger setup
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()],
});

// Database pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Validation schema for /enrich endpoint (Workato integration)
const EnrichRequestSchema = z.object({
  salesforce_lead_id: z.string(),
  business_name: z.string(),
  contact_name: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  website: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
});

// Express app
const app = express();
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.info('Request completed', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: Date.now() - start,
    });
  });
  next();
});

// API Key authentication middleware
const authenticateApiKey = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const apiKey = req.headers['x-api-key'];
  const expectedApiKey = process.env.API_KEY;

  if (!expectedApiKey) {
    logger.error('API_KEY environment variable not configured');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  if (!apiKey || apiKey !== expectedApiKey) {
    logger.warn('Invalid or missing API key', {
      ip: req.ip,
      path: req.path,
      hasKey: !!apiKey
    });
    return res.status(401).json({ error: 'Unauthorized: Invalid or missing API key' });
  }

  next();
};

// Serve static files for dashboard
app.use('/dashboard', express.static(path.join(__dirname, '../public')));

// Helper to get Salesforce service
const getSalesforceService = () => new SalesforceService({
  loginUrl: process.env.SFDC_LOGIN_URL || 'https://login.salesforce.com',
  clientId: process.env.SFDC_CLIENT_ID || '',
  clientSecret: process.env.SFDC_CLIENT_SECRET || '',
  username: process.env.SFDC_USERNAME || '',
  password: process.env.SFDC_PASSWORD || '',
  securityToken: process.env.SFDC_SECURITY_TOKEN || '',
});

// Health check (no auth required)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============ Dashboard API Endpoints ============

// Dashboard stats
app.get('/api/dashboard/stats', authenticateApiKey, async (req, res) => {
  try {
    const daysBack = parseInt(req.query.days as string) || 30;
    const salesforce = getSalesforceService();
    const dashboardService = new DashboardStatsService(salesforce);
    const stats = await dashboardService.getStats(daysBack);
    res.json(stats);
  } catch (error) {
    logger.error('Failed to fetch dashboard stats', { error });
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
});

// Get unenriched leads
app.get('/api/dashboard/unenriched', authenticateApiKey, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const salesforce = getSalesforceService();
    const dashboardService = new DashboardStatsService(salesforce);
    const leads = await dashboardService.getUnenrichedLeads(limit);
    const count = await dashboardService.getUnenrichedLeadsCount();
    res.json({ leads, totalCount: count });
  } catch (error) {
    logger.error('Failed to fetch unenriched leads', { error });
    res.status(500).json({ error: 'Failed to fetch unenriched leads' });
  }
});

// Batch enrich leads and update Salesforce
app.post('/api/dashboard/enrich-batch', authenticateApiKey, async (req, res) => {
  const { lead_ids } = req.body;

  if (!Array.isArray(lead_ids) || lead_ids.length === 0) {
    return res.status(400).json({ error: 'lead_ids array is required' });
  }

  if (lead_ids.length > 10) {
    return res.status(400).json({ error: 'Maximum 10 leads per batch' });
  }

  const salesforce = getSalesforceService();
  const dashboardService = new DashboardStatsService(salesforce);

  // Get lead details from Salesforce
  const allUnenriched = await dashboardService.getUnenrichedLeads(1000);
  const leadsToEnrich = allUnenriched.filter(l => lead_ids.includes(l.id));

  if (leadsToEnrich.length === 0) {
    return res.status(404).json({ error: 'No matching leads found' });
  }

  const results: Array<{ id: string; success: boolean; fit_score?: number; fit_tier?: string; error?: string }> = [];

  for (const lead of leadsToEnrich) {
    const requestId = uuidv4();

    try {
      const enrichmentData: EnrichmentData = {};

      // Initialize services
      const googlePlaces = new GooglePlacesService(process.env.GOOGLE_PLACES_API_KEY || '');
      const clay = new ClayService(process.env.CLAY_API_KEY || '');
      const websiteTech = new WebsiteTechService();

      try {
        // Google Places enrichment
        try {
          const googlePlacesData = await googlePlaces.enrich(
            lead.company,
            lead.phone || undefined,
            lead.city || undefined,
            lead.state || undefined
          );
          if (googlePlacesData) {
            enrichmentData.google_places = googlePlacesData;
          }
        } catch (error) {
          logger.warn('Google Places enrichment failed', { leadId: lead.id, error });
        }

        // Website tech detection
        if (lead.website) {
          try {
            const websiteTechData = await websiteTech.detectTech(lead.website);
            enrichmentData.website_tech = websiteTechData;
          } catch (error) {
            logger.warn('Website tech detection failed', { leadId: lead.id, error });
          }
        }

        // Clay enrichment
        try {
          const clayData = await clay.enrichLead({
            lead_id: requestId,
            business_name: lead.company,
            website: lead.website || undefined,
            phone: lead.phone || undefined,
            city: lead.city || undefined,
            state: lead.state || undefined,
          });
          if (clayData) {
            enrichmentData.clay = clayData;
          }
        } catch (error) {
          logger.warn('Clay enrichment failed', { leadId: lead.id, error });
        }

        // Calculate Fit Score
        const fitScoreResult = calculateFitScore(enrichmentData);

        // Update Salesforce
        const updated = await salesforce.updateLead(lead.id, enrichmentData, fitScoreResult);

        if (updated) {
          results.push({
            id: lead.id,
            success: true,
            fit_score: fitScoreResult.fit_score,
            fit_tier: fitScoreResult.fit_tier,
          });
        } else {
          results.push({
            id: lead.id,
            success: false,
            error: 'Failed to update Salesforce',
          });
        }

        // Store in local database
        try {
          await pool.query(
            `INSERT INTO lead_enrichments (
              lead_id, job_id, enrichment_status,
              google_places_data, clay_data, website_tech_data,
              fit_score, fit_tier, score_breakdown, salesforce_updated
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
              lead.id,
              requestId,
              'completed',
              enrichmentData.google_places ? JSON.stringify(enrichmentData.google_places) : null,
              enrichmentData.clay ? JSON.stringify(enrichmentData.clay) : null,
              enrichmentData.website_tech ? JSON.stringify(enrichmentData.website_tech) : null,
              fitScoreResult.fit_score,
              fitScoreResult.fit_tier,
              JSON.stringify(fitScoreResult.score_breakdown),
              updated,
            ]
          );
        } catch (dbError) {
          logger.error('Failed to store enrichment record', { leadId: lead.id, error: dbError });
        }
      } finally {
        await websiteTech.close();
      }
    } catch (error) {
      results.push({
        id: lead.id,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  const successCount = results.filter(r => r.success).length;
  res.json({
    processed: results.length,
    successful: successCount,
    failed: results.length - successCount,
    results,
  });
});

// Synchronous enrichment endpoint for Workato
app.post('/enrich', authenticateApiKey, async (req, res) => {
  const requestId = uuidv4();
  const startTime = Date.now();

  logger.info('Enrichment request received', { requestId, body: req.body });

  try {
    // Validate request
    const parseResult = EnrichRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      logger.warn('Invalid request payload', { requestId, errors: parseResult.error.errors });
      return res.status(400).json({
        error: 'Invalid request payload',
        details: parseResult.error.errors
      });
    }

    const payload = parseResult.data;
    const enrichmentData: EnrichmentData = {};

    // Initialize services
    const googlePlaces = new GooglePlacesService(process.env.GOOGLE_PLACES_API_KEY || '');
    const clay = new ClayService(process.env.CLAY_API_KEY || '');
    const websiteTech = new WebsiteTechService();

    try {
      // Step 1: Google Places enrichment
      try {
        logger.info('Enriching with Google Places', { requestId, businessName: payload.business_name });
        const googlePlacesData = await googlePlaces.enrich(
          payload.business_name,
          payload.phone,
          payload.city,
          payload.state
        );
        if (googlePlacesData) {
          enrichmentData.google_places = googlePlacesData;
        }
      } catch (error) {
        logger.warn('Google Places enrichment failed', {
          requestId,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      // Step 2: Website tech detection
      if (payload.website) {
        try {
          logger.info('Detecting website tech', { requestId, website: payload.website });
          const websiteTechData = await websiteTech.detectTech(payload.website);
          enrichmentData.website_tech = websiteTechData;
        } catch (error) {
          logger.warn('Website tech detection failed', {
            requestId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // Step 3: Clay enrichment
      try {
        logger.info('Enriching with Clay', { requestId });
        const clayData = await clay.enrichLead({
          lead_id: requestId,
          business_name: payload.business_name,
          website: payload.website,
          phone: payload.phone,
          city: payload.city,
          state: payload.state,
        });
        if (clayData) {
          enrichmentData.clay = clayData;
        }
      } catch (error) {
        logger.warn('Clay enrichment failed', {
          requestId,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      // Step 4: Calculate Fit Score
      const fitScoreResult = calculateFitScore(enrichmentData);

      // Determine enrichment status
      const hasAnyEnrichment =
        enrichmentData.google_places ||
        enrichmentData.clay ||
        enrichmentData.website_tech;

      const enrichmentStatus = hasAnyEnrichment ? 'completed' : 'no_data';

      // Store enrichment record in database
      try {
        await pool.query(
          `INSERT INTO lead_enrichments (
            lead_id, job_id, enrichment_status,
            google_places_data, clay_data, website_tech_data,
            fit_score, fit_tier, score_breakdown
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            payload.salesforce_lead_id,
            requestId,
            enrichmentStatus,
            enrichmentData.google_places ? JSON.stringify(enrichmentData.google_places) : null,
            enrichmentData.clay ? JSON.stringify(enrichmentData.clay) : null,
            enrichmentData.website_tech ? JSON.stringify(enrichmentData.website_tech) : null,
            fitScoreResult.fit_score,
            fitScoreResult.fit_tier,
            JSON.stringify(fitScoreResult.score_breakdown),
          ]
        );
      } catch (dbError) {
        logger.error('Failed to store enrichment record', {
          requestId,
          error: dbError instanceof Error ? dbError.message : String(dbError),
        });
        // Continue - we still want to return the enrichment data
      }

      const duration = Date.now() - startTime;
      logger.info('Enrichment completed', {
        requestId,
        salesforceLeadId: payload.salesforce_lead_id,
        fitScore: fitScoreResult.fit_score,
        fitTier: fitScoreResult.fit_tier,
        duration,
      });

      // Build response for Workato to update Salesforce
      const response = {
        enrichment_status: enrichmentStatus,
        fit_score: fitScoreResult.fit_score,
        fit_tier: fitScoreResult.fit_tier,
        employee_estimate: enrichmentData.clay?.employee_estimate ?? null,
        years_in_business: enrichmentData.clay?.years_in_business ?? null,
        google_reviews_count: enrichmentData.google_places?.gmb_review_count ?? null,
        google_rating: enrichmentData.google_places?.gmb_rating ?? null,
        has_website: !!payload.website,
        has_physical_location: enrichmentData.google_places?.gmb_is_operational ?? false,
        pixels_detected: enrichmentData.website_tech?.marketing_tools_detected?.join(',') ?? '',
        has_meta_pixel: enrichmentData.website_tech?.has_meta_pixel ?? false,
        has_ga4: enrichmentData.website_tech?.has_ga4 ?? false,
        has_google_ads: enrichmentData.website_tech?.has_google_ads_tag ?? false,
        has_hubspot: enrichmentData.website_tech?.has_hubspot ?? false,
        score_breakdown: JSON.stringify(fitScoreResult.score_breakdown),
        enrichment_timestamp: new Date().toISOString(),
        request_id: requestId,
      };

      res.json(response);
    } finally {
      // Clean up Puppeteer browser
      await websiteTech.close();
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Enrichment failed', {
      requestId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      duration,
    });

    res.status(500).json({
      error: 'Enrichment failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      request_id: requestId,
    });
  }
});

// Get enrichment by Salesforce Lead ID
app.get('/enrichment/:salesforceLeadId', authenticateApiKey, async (req, res) => {
  try {
    const { salesforceLeadId } = req.params;

    const result = await pool.query(
      `SELECT * FROM lead_enrichments
       WHERE lead_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [salesforceLeadId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Enrichment not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Failed to fetch enrichment', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

// Graceful shutdown
const shutdown = async () => {
  logger.info('Shutting down...');
  await pool.end();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start server
const PORT = process.env.PORT || 4900;
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});
