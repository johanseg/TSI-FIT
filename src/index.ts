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
import { mapToSalesforceFields, formatForSalesforceUpdate, getFilledFieldsFromGMB } from './services/salesforceFieldMapper';

// Types
import { EnrichmentData, SalesforceEnrichmentFields } from './types/lead';

// In-memory log storage (circular buffer) - defined early so logs are captured
const logBuffer: Array<{ timestamp: string; level: string; message: string; meta?: Record<string, unknown> }> = [];
const MAX_LOG_ENTRIES = 500;

// Custom format to capture logs to buffer
const captureFormat = winston.format((info) => {
  const { level, message, timestamp, ...meta } = info;
  const logEntry = {
    timestamp: (timestamp as string) || new Date().toISOString(),
    level: level as string,
    message: message as string,
    meta: Object.keys(meta).length > 0 ? meta : undefined,
  };
  logBuffer.push(logEntry);
  if (logBuffer.length > MAX_LOG_ENTRIES) {
    logBuffer.shift();
  }
  return info;
});

// Logger setup with capture format
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    captureFormat(),
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

// Redirect root to dashboard
app.get('/', (_req, res) => {
  res.redirect('/dashboard');
});

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

// ============ Setup API Endpoints ============

// Get system status and configuration (no auth - internal dashboard)
app.get('/api/setup/status', async (_req, res) => {
  try {
    // Check database connection
    let dbStatus = { connected: false, error: '' };
    try {
      const result = await pool.query('SELECT NOW() as time, current_database() as db');
      dbStatus = { connected: true, error: '', ...result.rows[0] };
    } catch (dbErr) {
      dbStatus = { connected: false, error: dbErr instanceof Error ? dbErr.message : 'Unknown error' };
    }

    // Check Salesforce connection
    let sfStatus = { connected: false, error: '' };
    try {
      const salesforce = getSalesforceService();
      await salesforce.connect();
      sfStatus = { connected: true, error: '' };
      await salesforce.disconnect();
    } catch (sfErr) {
      sfStatus = { connected: false, error: sfErr instanceof Error ? sfErr.message : 'Unknown error' };
    }

    // Check configured services
    const services = {
      database: dbStatus,
      salesforce: sfStatus,
      googlePlaces: { configured: !!process.env.GOOGLE_PLACES_API_KEY },
      clay: { configured: !!process.env.CLAY_API_KEY },
    };

    // Environment info (masked)
    const envConfig = {
      DATABASE_URL: process.env.DATABASE_URL ? '***configured***' : 'NOT SET',
      GOOGLE_PLACES_API_KEY: process.env.GOOGLE_PLACES_API_KEY ? '***configured***' : 'NOT SET',
      CLAY_API_KEY: process.env.CLAY_API_KEY ? '***configured***' : 'NOT SET',
      API_KEY: process.env.API_KEY ? '***configured***' : 'NOT SET',
      SFDC_LOGIN_URL: process.env.SFDC_LOGIN_URL || 'https://login.salesforce.com',
      SFDC_USERNAME: process.env.SFDC_USERNAME ? '***configured***' : 'NOT SET',
      SFDC_PASSWORD: process.env.SFDC_PASSWORD ? '***configured***' : 'NOT SET',
      SFDC_SECURITY_TOKEN: process.env.SFDC_SECURITY_TOKEN ? '***configured***' : 'NOT SET',
      NODE_ENV: process.env.NODE_ENV || 'development',
      PORT: process.env.PORT || '4900',
      LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    };

    res.json({
      services,
      environment: envConfig,
      serverTime: new Date().toISOString(),
      uptime: process.uptime(),
    });
  } catch (error) {
    logger.error('Failed to fetch system status', { error });
    res.status(500).json({ error: 'Failed to fetch system status' });
  }
});

// Get recent logs (no auth - internal dashboard)
app.get('/api/setup/logs', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 100, MAX_LOG_ENTRIES);
  const level = req.query.level as string;

  let logs = [...logBuffer].reverse();

  if (level) {
    logs = logs.filter(log => log.level === level);
  }

  res.json({
    logs: logs.slice(0, limit),
    total: logBuffer.length,
  });
});

// Test database connection (no auth - internal dashboard)
app.post('/api/setup/test-database', async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        current_database() as database_name,
        pg_size_pretty(pg_database_size(current_database())) as database_size,
        (SELECT COUNT(*) FROM lead_enrichments) as enrichment_count
    `);
    res.json({ success: true, ...result.rows[0] });
  } catch (error) {
    res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get database stats (no auth - internal dashboard)
app.get('/api/setup/database-stats', async (_req, res) => {
  try {
    const enrichmentStats = await pool.query(`
      SELECT
        COUNT(*) as total_enrichments,
        COUNT(CASE WHEN enrichment_status = 'completed' THEN 1 END) as completed,
        COUNT(CASE WHEN enrichment_status = 'failed' THEN 1 END) as failed,
        COUNT(CASE WHEN enrichment_status = 'pending' THEN 1 END) as pending,
        ROUND(AVG(fit_score), 1) as avg_fit_score,
        MIN(created_at) as oldest_record,
        MAX(created_at) as newest_record
      FROM lead_enrichments
    `);

    // Score distribution by ranges (replacing tier distribution)
    const scoreDistribution = await pool.query(`
      SELECT
        CASE
          WHEN fit_score >= 80 THEN '80-100'
          WHEN fit_score >= 60 THEN '60-79'
          WHEN fit_score >= 40 THEN '40-59'
          ELSE '0-39'
        END as score_range,
        COUNT(*) as count
      FROM lead_enrichments
      WHERE fit_score IS NOT NULL
      GROUP BY score_range
      ORDER BY score_range DESC
    `);

    const recentActivity = await pool.query(`
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM lead_enrichments
      WHERE created_at > NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
      LIMIT 30
    `);

    res.json({
      stats: enrichmentStats.rows[0],
      scoreDistribution: scoreDistribution.rows,
      recentActivity: recentActivity.rows,
      tableExists: true,
    });
  } catch (error) {
    // Check if error is due to missing table
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    if (errorMessage.includes('does not exist') || errorMessage.includes('42P01')) {
      logger.warn('Database table lead_enrichments does not exist - migrations needed');
      res.json({
        stats: { total_enrichments: 0, completed: 0, failed: 0, pending: 0 },
        scoreDistribution: [],
        recentActivity: [],
        tableExists: false,
        setupRequired: 'Run database migrations: psql -d $DATABASE_URL -f migrations/001_create_leads_table.sql && psql -d $DATABASE_URL -f migrations/002_create_enrichments_table.sql',
      });
    } else {
      logger.error('Failed to fetch database stats', { error });
      res.status(500).json({ error: 'Failed to fetch database stats' });
    }
  }
});

// ============ Manual Enrichment API Endpoints ============

// Lookup lead by Salesforce ID (no auth - internal dashboard)
app.get('/api/lead/:salesforceLeadId', async (req, res) => {
  try {
    const { salesforceLeadId } = req.params;

    // First check local database for existing enrichment
    const localResult = await pool.query(
      `SELECT * FROM lead_enrichments WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [salesforceLeadId]
    );

    // Then fetch from Salesforce
    let salesforceLead = null;
    try {
      const salesforce = getSalesforceService();
      const query = `
        SELECT Id, Company, Website, Phone, City, State, LeadSource,
               FirstName, LastName, Email, Status, CreatedDate,
               Fit_Score__c, Enrichment_Status__c,
               Employee_Estimate__c, Years_In_Business__c, Google_Reviews_Count__c
        FROM Lead
        WHERE Id = '${salesforceLeadId}'
      `;
      const result = await salesforce.query(query);
      if (result.records.length > 0) {
        salesforceLead = result.records[0];
      }
    } catch (sfError) {
      logger.warn('Failed to fetch lead from Salesforce', { salesforceLeadId, error: sfError });
    }

    res.json({
      salesforce: salesforceLead,
      localEnrichment: localResult.rows[0] || null,
    });
  } catch (error) {
    logger.error('Failed to lookup lead', { error });
    res.status(500).json({ error: 'Failed to lookup lead' });
  }
});

// Manual enrichment by Salesforce Lead ID (no auth - internal dashboard)
app.post('/api/enrich-by-id', async (req, res) => {
  const { salesforce_lead_id, update_salesforce = true } = req.body;

  if (!salesforce_lead_id) {
    return res.status(400).json({ error: 'salesforce_lead_id is required' });
  }

  const requestId = uuidv4();
  const startTime = Date.now();

  logger.info('Manual enrichment started', { requestId, salesforceLeadId: salesforce_lead_id });

  try {
    // Fetch lead data from Salesforce
    const salesforce = getSalesforceService();
    const query = `
      SELECT Id, Company, Website, Phone, City, State, LeadSource, FirstName, LastName, Email
      FROM Lead
      WHERE Id = '${salesforce_lead_id}'
    `;
    const result = await salesforce.query(query);

    if (result.records.length === 0) {
      return res.status(404).json({ error: 'Lead not found in Salesforce' });
    }

    const lead = result.records[0] as {
      Id: string; Company: string; Website?: string; Phone?: string;
      City?: string; State?: string; LeadSource?: string;
      FirstName?: string; LastName?: string; Email?: string;
    };

    const enrichmentData: EnrichmentData = {};

    // Initialize services
    const googlePlaces = new GooglePlacesService(process.env.GOOGLE_PLACES_API_KEY || '');
    const clay = new ClayService(process.env.CLAY_API_KEY || '');
    const websiteTech = new WebsiteTechService();

    try {
      // Step 1: Google Places enrichment (first priority - use website/phone/business)
      try {
        logger.info('Enriching with Google Places', { requestId, businessName: lead.Company });
        const googlePlacesData = await googlePlaces.enrich(
          lead.Company,
          lead.Phone,
          lead.City,
          lead.State,
          lead.Website // Include website for better matching
        );
        if (googlePlacesData) {
          enrichmentData.google_places = googlePlacesData;
          logger.info('Google Places match found', {
            requestId,
            hasGMB: !!googlePlacesData.place_id,
            gmbName: googlePlacesData.gmb_name,
          });
        }
      } catch (error) {
        logger.warn('Google Places enrichment failed', { requestId, error });
      }

      // Get fields that can be filled from GMB data
      const filledFromGMB = getFilledFieldsFromGMB(enrichmentData.google_places, {
        website: lead.Website,
        phone: lead.Phone,
        city: lead.City,
        state: lead.State,
      });

      // Use GMB-filled website for tech detection if original is missing
      const websiteForTech = lead.Website || filledFromGMB.website;

      // Step 2: Website tech detection (use original or GMB-filled website)
      if (websiteForTech) {
        try {
          logger.info('Detecting website tech', { requestId, website: websiteForTech });
          const websiteTechData = await websiteTech.detectTech(websiteForTech);
          enrichmentData.website_tech = websiteTechData;
        } catch (error) {
          logger.warn('Website tech detection failed', { requestId, error });
        }
      }

      // Step 3: Clay enrichment (for employees, years in business, business license)
      try {
        logger.info('Enriching with Clay', { requestId });
        const clayData = await clay.enrichLead({
          lead_id: requestId,
          business_name: lead.Company,
          website: websiteForTech,
          phone: lead.Phone || filledFromGMB.phone,
          city: lead.City || filledFromGMB.city,
          state: lead.State || filledFromGMB.state,
        });
        if (clayData) {
          enrichmentData.clay = clayData;
        }
      } catch (error) {
        logger.warn('Clay enrichment failed', { requestId, error });
      }

      // Step 4: Calculate Fit Score
      const fitScoreResult = calculateFitScore(enrichmentData);

      // Step 5: Map to Salesforce-aligned fields (use GMB-filled website if original missing)
      const sfFields = mapToSalesforceFields(enrichmentData, websiteForTech);

      // Step 6: Update Salesforce if requested
      let salesforceUpdated = false;
      if (update_salesforce) {
        try {
          // Update with both fit score and SF-aligned fields (including GMB-filled fields)
          const sfUpdateFields = formatForSalesforceUpdate(
            sfFields,
            lead.Website,
            lead.Phone,
            filledFromGMB,
            fitScoreResult.fit_score
          );
          salesforceUpdated = await salesforce.updateLead(salesforce_lead_id, enrichmentData, fitScoreResult, sfUpdateFields);

          if (Object.keys(filledFromGMB).length > 0) {
            logger.info('Filled missing lead fields from GMB', {
              requestId,
              filledFields: Object.keys(filledFromGMB),
            });
          }
        } catch (sfError) {
          logger.error('Failed to update Salesforce', { requestId, error: sfError });
        }
      }

      // Store enrichment record with SF-aligned fields
      const enrichmentStatus = enrichmentData.google_places || enrichmentData.clay || enrichmentData.website_tech
        ? 'completed' : 'no_data';

      try {
        await pool.query(
          `INSERT INTO lead_enrichments (
            lead_id, job_id, enrichment_status,
            google_places_data, clay_data, website_tech_data,
            fit_score, score_breakdown, salesforce_updated,
            has_website, number_of_employees, number_of_gbp_reviews,
            number_of_years_in_business, has_gmb, gmb_url,
            location_type, business_license, spending_on_marketing
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
          [
            salesforce_lead_id,
            requestId,
            enrichmentStatus,
            enrichmentData.google_places ? JSON.stringify(enrichmentData.google_places) : null,
            enrichmentData.clay ? JSON.stringify(enrichmentData.clay) : null,
            enrichmentData.website_tech ? JSON.stringify(enrichmentData.website_tech) : null,
            fitScoreResult.fit_score,
            JSON.stringify(fitScoreResult.score_breakdown),
            salesforceUpdated,
            sfFields.has_website,
            sfFields.number_of_employees,
            sfFields.number_of_gbp_reviews,
            sfFields.number_of_years_in_business,
            sfFields.has_gmb,
            sfFields.gmb_url,
            sfFields.location_type,
            sfFields.business_license,
            sfFields.spending_on_marketing,
          ]
        );
      } catch (dbError) {
        logger.error('Failed to store enrichment record', { requestId, error: dbError });
      }

      const duration = Date.now() - startTime;
      logger.info('Manual enrichment completed', {
        requestId,
        salesforceLeadId: salesforce_lead_id,
        fitScore: fitScoreResult.fit_score,
        duration,
      });

      res.json({
        success: true,
        request_id: requestId,
        lead: {
          id: lead.Id,
          company: lead.Company,
          website: lead.Website,
          phone: lead.Phone,
          city: lead.City,
          state: lead.State,
        },
        enrichment: {
          status: enrichmentStatus,
          fit_score: fitScoreResult.fit_score,
          score_breakdown: fitScoreResult.score_breakdown,
          google_places: enrichmentData.google_places || null,
          website_tech: enrichmentData.website_tech || null,
          clay: enrichmentData.clay || null,
        },
        salesforce_updated: salesforceUpdated,
        duration_ms: duration,
      });
    } finally {
      await websiteTech.close();
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Manual enrichment failed', {
      requestId,
      error: error instanceof Error ? error.message : String(error),
      duration,
    });

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      request_id: requestId,
    });
  }
});

// ============ Dashboard API Endpoints ============

// Dashboard stats (no auth - internal dashboard)
app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;

    logger.info('Fetching dashboard stats', { startDate, endDate });

    const salesforce = getSalesforceService();
    const dashboardService = new DashboardStatsService(salesforce);
    const stats = await dashboardService.getStats(startDate, endDate);
    res.json(stats);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to fetch dashboard stats', { error: errorMessage });
    res.status(500).json({ error: `Failed to fetch dashboard stats: ${errorMessage}` });
  }
});

// Get unenriched leads (no auth - internal dashboard)
app.get('/api/dashboard/unenriched', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;

    const salesforce = getSalesforceService();
    const dashboardService = new DashboardStatsService(salesforce);
    const { leads, totalCount } = await dashboardService.getUnenrichedLeadsPaginated(limit, offset, startDate, endDate);
    res.json({
      leads,
      totalCount,
      limit,
      offset,
      hasMore: offset + leads.length < totalCount
    });
  } catch (error) {
    logger.error('Failed to fetch unenriched leads', { error });
    res.status(500).json({ error: 'Failed to fetch unenriched leads' });
  }
});

// Batch enrich leads and update Salesforce (no auth - internal dashboard)
app.post('/api/dashboard/enrich-batch', async (req, res) => {
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

  const results: Array<{ id: string; success: boolean; fit_score?: number; error?: string }> = [];

  for (const lead of leadsToEnrich) {
    const requestId = uuidv4();

    try {
      const enrichmentData: EnrichmentData = {};

      // Initialize services
      const googlePlaces = new GooglePlacesService(process.env.GOOGLE_PLACES_API_KEY || '');
      const clay = new ClayService(process.env.CLAY_API_KEY || '');
      const websiteTech = new WebsiteTechService();

      try {
        // Step 1: Google Places enrichment (first priority)
        try {
          const googlePlacesData = await googlePlaces.enrich(
            lead.company,
            lead.phone || undefined,
            lead.city || undefined,
            lead.state || undefined,
            lead.website || undefined
          );
          if (googlePlacesData) {
            enrichmentData.google_places = googlePlacesData;
          }
        } catch (error) {
          logger.warn('Google Places enrichment failed', { leadId: lead.id, error });
        }

        // Get fields that can be filled from GMB data
        const filledFromGMB = getFilledFieldsFromGMB(enrichmentData.google_places, {
          website: lead.website || undefined,
          phone: lead.phone || undefined,
          city: lead.city || undefined,
          state: lead.state || undefined,
        });

        // Use GMB-filled website for tech detection if original is missing
        const websiteForTech = lead.website || filledFromGMB.website;

        // Step 2: Website tech detection
        if (websiteForTech) {
          try {
            const websiteTechData = await websiteTech.detectTech(websiteForTech);
            enrichmentData.website_tech = websiteTechData;
          } catch (error) {
            logger.warn('Website tech detection failed', { leadId: lead.id, error });
          }
        }

        // Step 3: Clay enrichment
        try {
          const clayData = await clay.enrichLead({
            lead_id: requestId,
            business_name: lead.company,
            website: websiteForTech,
            phone: lead.phone || filledFromGMB.phone,
            city: lead.city || filledFromGMB.city,
            state: lead.state || filledFromGMB.state,
          });
          if (clayData) {
            enrichmentData.clay = clayData;
          }
        } catch (error) {
          logger.warn('Clay enrichment failed', { leadId: lead.id, error });
        }

        // Step 4: Calculate Fit Score
        const fitScoreResult = calculateFitScore(enrichmentData);

        // Step 5: Map to Salesforce-aligned fields (including GMB-filled fields)
        const sfFields = mapToSalesforceFields(enrichmentData, websiteForTech);
        const sfUpdateFields = formatForSalesforceUpdate(
          sfFields,
          lead.website || undefined,
          lead.phone || undefined,
          filledFromGMB,
          fitScoreResult.fit_score
        );

        // Step 6: Update Salesforce
        const updated = await salesforce.updateLead(lead.id, enrichmentData, fitScoreResult, sfUpdateFields);

        if (updated) {
          results.push({
            id: lead.id,
            success: true,
            fit_score: fitScoreResult.fit_score,
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
              fit_score, score_breakdown, salesforce_updated
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              lead.id,
              requestId,
              'completed',
              enrichmentData.google_places ? JSON.stringify(enrichmentData.google_places) : null,
              enrichmentData.clay ? JSON.stringify(enrichmentData.clay) : null,
              enrichmentData.website_tech ? JSON.stringify(enrichmentData.website_tech) : null,
              fitScoreResult.fit_score,
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
      // Step 1: Google Places enrichment (first priority - use website/phone/business)
      try {
        logger.info('Enriching with Google Places', { requestId, businessName: payload.business_name });
        const googlePlacesData = await googlePlaces.enrich(
          payload.business_name,
          payload.phone,
          payload.city,
          payload.state,
          payload.website // Include website for better matching
        );
        if (googlePlacesData) {
          enrichmentData.google_places = googlePlacesData;
          logger.info('Google Places match found', {
            requestId,
            hasGMB: !!googlePlacesData.place_id,
            gmbName: googlePlacesData.gmb_name,
          });
        }
      } catch (error) {
        logger.warn('Google Places enrichment failed', {
          requestId,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      // Get fields that can be filled from GMB data
      const filledFromGMB = getFilledFieldsFromGMB(enrichmentData.google_places, {
        website: payload.website,
        phone: payload.phone,
        city: payload.city,
        state: payload.state,
      });

      // Use GMB-filled website for tech detection if original is missing
      const websiteForTech = payload.website || filledFromGMB.website;

      // Step 2: Website tech detection (use original or GMB-filled website)
      if (websiteForTech) {
        try {
          logger.info('Detecting website tech', { requestId, website: websiteForTech });
          const websiteTechData = await websiteTech.detectTech(websiteForTech);
          enrichmentData.website_tech = websiteTechData;
        } catch (error) {
          logger.warn('Website tech detection failed', {
            requestId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // Step 3: Clay enrichment (for employees, years in business, business license)
      try {
        logger.info('Enriching with Clay', { requestId });
        const clayData = await clay.enrichLead({
          lead_id: requestId,
          business_name: payload.business_name,
          website: websiteForTech,
          phone: payload.phone || filledFromGMB.phone,
          city: payload.city || filledFromGMB.city,
          state: payload.state || filledFromGMB.state,
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

      // Step 5: Map to Salesforce-aligned fields (use GMB-filled website if original missing)
      const sfFields = mapToSalesforceFields(enrichmentData, websiteForTech);

      // Determine enrichment status
      const hasAnyEnrichment =
        enrichmentData.google_places ||
        enrichmentData.clay ||
        enrichmentData.website_tech;

      const enrichmentStatus = hasAnyEnrichment ? 'completed' : 'no_data';

      // Store enrichment record in database with SF-aligned fields
      try {
        await pool.query(
          `INSERT INTO lead_enrichments (
            lead_id, job_id, enrichment_status,
            google_places_data, clay_data, website_tech_data,
            fit_score, score_breakdown,
            has_website, number_of_employees, number_of_gbp_reviews,
            number_of_years_in_business, has_gmb, gmb_url,
            location_type, business_license, spending_on_marketing
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
          [
            payload.salesforce_lead_id,
            requestId,
            enrichmentStatus,
            enrichmentData.google_places ? JSON.stringify(enrichmentData.google_places) : null,
            enrichmentData.clay ? JSON.stringify(enrichmentData.clay) : null,
            enrichmentData.website_tech ? JSON.stringify(enrichmentData.website_tech) : null,
            fitScoreResult.fit_score,
            JSON.stringify(fitScoreResult.score_breakdown),
            sfFields.has_website,
            sfFields.number_of_employees,
            sfFields.number_of_gbp_reviews,
            sfFields.number_of_years_in_business,
            sfFields.has_gmb,
            sfFields.gmb_url,
            sfFields.location_type,
            sfFields.business_license,
            sfFields.spending_on_marketing,
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
        duration,
      });

      // Log if we filled any fields from GMB
      if (Object.keys(filledFromGMB).length > 0) {
        logger.info('Filled missing lead fields from GMB', {
          requestId,
          filledFields: Object.keys(filledFromGMB),
        });
      }

      // Build response for Workato to update Salesforce
      // Includes both raw enrichment data and Salesforce-aligned field values
      const response = {
        enrichment_status: enrichmentStatus,
        fit_score: fitScoreResult.fit_score,
        // Raw enrichment data (for reference/debugging)
        employee_estimate: enrichmentData.clay?.employee_estimate ?? null,
        years_in_business: enrichmentData.clay?.years_in_business ?? null,
        google_reviews_count: enrichmentData.google_places?.gmb_review_count ?? null,
        google_rating: enrichmentData.google_places?.gmb_rating ?? null,
        has_physical_location: enrichmentData.google_places?.gmb_is_operational ?? false,
        pixels_detected: enrichmentData.website_tech?.marketing_tools_detected?.join(',') ?? '',
        has_meta_pixel: enrichmentData.website_tech?.has_meta_pixel ?? false,
        has_ga4: enrichmentData.website_tech?.has_ga4 ?? false,
        has_google_ads: enrichmentData.website_tech?.has_google_ads_tag ?? false,
        has_hubspot: enrichmentData.website_tech?.has_hubspot ?? false,
        score_breakdown: JSON.stringify(fitScoreResult.score_breakdown),
        enrichment_timestamp: new Date().toISOString(),
        request_id: requestId,
        // Fields filled from GMB data (when missing from original lead)
        filled_from_gmb: filledFromGMB,
        // Salesforce-aligned fields (map directly to SF custom fields)
        // Workato should use these values to update the Lead record
        salesforce_fields: {
          // Standard Lead fields (use original or GMB-filled values)
          Website: payload.website || filledFromGMB.website || null,
          Phone: payload.phone || filledFromGMB.phone || null,
          Street: filledFromGMB.address || null,
          City: payload.city || filledFromGMB.city || null,
          State: payload.state || filledFromGMB.state || null,
          PostalCode: filledFromGMB.zip || null,
          // Custom fields
          Has_Website__c: sfFields.has_website,
          Number_of_Employees__c: sfFields.number_of_employees,
          Number_of_GBP_Reviews__c: sfFields.number_of_gbp_reviews,
          Number_of_Years_in_Business__c: sfFields.number_of_years_in_business,
          Has_GMB__c: sfFields.has_gmb,
          GMB_URL__c: sfFields.gmb_url,
          Location_Type__c: sfFields.location_type,
          Business_License__c: sfFields.business_license,
          Spending_on_Marketing__c: sfFields.spending_on_marketing,
        },
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
  logger.info(`TSI Fit Score Engine started`, {
    port: PORT,
    nodeEnv: process.env.NODE_ENV || 'development',
    databaseConfigured: !!process.env.DATABASE_URL,
    salesforceConfigured: !!process.env.SFDC_USERNAME,
    googlePlacesConfigured: !!process.env.GOOGLE_PLACES_API_KEY,
    clayConfigured: !!process.env.CLAY_API_KEY,
  });
});
