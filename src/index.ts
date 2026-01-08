import 'dotenv/config';
import express from 'express';
import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import winston from 'winston';
import path from 'path';

// Services
import { GooglePlacesService } from './services/googlePlaces';
import { PeopleDataLabsService } from './services/peopleDataLabs';
import { WebsiteTechService } from './services/websiteTech';
import { calculateFitScore } from './services/fitScore';
import { SalesforceService } from './services/salesforce';
import { DashboardStatsService } from './services/dashboardStats';
import { mapToSalesforceFields, formatForSalesforceUpdate, getFilledFieldsFromGMB, mapGMBTypesToVertical } from './services/salesforceFieldMapper';

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
      peopleDataLabs: { configured: !!process.env.PDL_API_KEY },
    };

    // Environment info (masked)
    const envConfig = {
      DATABASE_URL: process.env.DATABASE_URL ? '***configured***' : 'NOT SET',
      GOOGLE_PLACES_API_KEY: process.env.GOOGLE_PLACES_API_KEY ? '***configured***' : 'NOT SET',
      PDL_API_KEY: process.env.PDL_API_KEY ? '***configured***' : 'NOT SET',
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

    // Score distribution by ranges
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

    // First check local database for existing enrichment (if available)
    let localEnrichment = null;
    try {
      const localResult = await pool.query(
        `SELECT le.* FROM lead_enrichments le
         JOIN leads l ON le.lead_id = l.id
         WHERE l.salesforce_lead_id = $1
         ORDER BY le.created_at DESC LIMIT 1`,
        [salesforceLeadId]
      );
      localEnrichment = localResult.rows[0] || null;
    } catch (dbError) {
      logger.warn('Local database not available', { error: dbError instanceof Error ? dbError.message : String(dbError) });
    }

    // Then fetch from Salesforce
    let salesforceLead = null;
    try {
      const salesforce = getSalesforceService();
      const query = `
        SELECT Id, Company, Website, Phone, City, State, LeadSource,
               FirstName, LastName, Email, Status, CreatedDate,
               Fit_Score__c, Has_Website__c, Has_GMB__c, GMB_URL__c,
               Number_of_Employees__c, Number_of_GBP_Reviews__c,
               Number_of_Years_in_Business__c, Location_Type__c
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
      localEnrichment,
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
      SELECT Id, Company, Website, Phone, City, State, Street, PostalCode, LeadSource, FirstName, LastName, Email
      FROM Lead
      WHERE Id = '${salesforce_lead_id}'
    `;
    const result = await salesforce.query(query);

    if (result.records.length === 0) {
      return res.status(404).json({ error: 'Lead not found in Salesforce' });
    }

    const lead = result.records[0] as {
      Id: string; Company: string; Website?: string; Phone?: string;
      City?: string; State?: string; Street?: string; PostalCode?: string;
      LeadSource?: string; FirstName?: string; LastName?: string; Email?: string;
    };

    const enrichmentData: EnrichmentData = {};

    // Initialize services
    const googlePlaces = new GooglePlacesService(process.env.GOOGLE_PLACES_API_KEY || '');
    const pdl = new PeopleDataLabsService(process.env.PDL_API_KEY || '');
    const websiteTech = new WebsiteTechService();

    try {
      // Step 1: Google Places enrichment (first priority - use all available data for matching)
      try {
        logger.info('Enriching with Google Places', { requestId, businessName: lead.Company });
        const googlePlacesData = await googlePlaces.enrich(
          lead.Company,
          lead.Phone,
          lead.City,
          lead.State,
          lead.Website,
          lead.Street,
          lead.PostalCode
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
      const gmbResult = getFilledFieldsFromGMB(enrichmentData.google_places, {
        website: lead.Website,
        phone: lead.Phone,
        city: lead.City,
        state: lead.State,
      });
      const filledFromGMB = gmbResult.fields;
      const gmbAuditNote = gmbResult.auditNote;

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

      // Step 3: PDL Company Enrichment (for employees, years in business, industry, revenue)
      try {
        logger.info('Enriching with People Data Labs', { requestId });
        const pdlData = await pdl.enrichCompany({
          lead_id: requestId,
          business_name: lead.Company,
          website: websiteForTech,
          phone: lead.Phone || filledFromGMB.phone,
          city: lead.City || filledFromGMB.city,
          state: lead.State || filledFromGMB.state,
        });
        if (pdlData) {
          enrichmentData.pdl = pdlData;
        }
      } catch (error) {
        logger.warn('PDL enrichment failed', { requestId, error });
      }

      // Step 4: Calculate Fit Score
      const fitScoreResult = calculateFitScore(enrichmentData);

      // Step 5: Map to Salesforce-aligned fields (use GMB-filled website if original missing)
      const sfFields = mapToSalesforceFields(enrichmentData, websiteForTech);

      // Step 6: Update Salesforce if requested
      let salesforceUpdated = false;
      let salesforceError: string | undefined;
      if (update_salesforce) {
        try {
          // Update with SF-aligned fields (GMB/Clay data is authoritative and overwrites existing)
          const sfUpdateFields = formatForSalesforceUpdate(
            sfFields,
            lead.Website,
            lead.Phone,
            filledFromGMB,
            fitScoreResult.fit_score,
            enrichmentData.google_places?.gmb_types,
            gmbAuditNote
          );
          const sfResult = await salesforce.updateLead(salesforce_lead_id, enrichmentData, fitScoreResult, sfUpdateFields);
          salesforceUpdated = sfResult.success;

          if (!sfResult.success && sfResult.error) {
            salesforceError = `${sfResult.error.code}: ${sfResult.error.message}`;
            logger.warn('Salesforce update failed', {
              requestId,
              leadId: salesforce_lead_id,
              errorCode: sfResult.error.code,
              errorMessage: sfResult.error.message,
              isRetryable: sfResult.error.isRetryable,
            });
          }

          if (Object.keys(filledFromGMB).length > 0) {
            logger.info('Filled missing lead fields from GMB', {
              requestId,
              filledFields: Object.keys(filledFromGMB),
            });
          }
        } catch (sfError) {
          logger.error('Failed to update Salesforce (exception)', { requestId, error: sfError });
          salesforceError = sfError instanceof Error ? sfError.message : String(sfError);
        }
      }

      // Store enrichment record with SF-aligned fields
      const enrichmentStatus = enrichmentData.google_places || enrichmentData.pdl || enrichmentData.website_tech
        ? 'completed' : 'no_data';

      try {
        await pool.query(
          `INSERT INTO lead_enrichments (
            salesforce_lead_id, job_id, enrichment_status,
            google_places_data, pdl_data, website_tech_data,
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
            enrichmentData.pdl ? JSON.stringify(enrichmentData.pdl) : null,
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
          pdl: enrichmentData.pdl || null,
        },
        salesforce_updated: salesforceUpdated,
        salesforce_error: salesforceError,
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
    const leadSource = req.query.leadSource as string | undefined;

    const salesforce = getSalesforceService();
    const dashboardService = new DashboardStatsService(salesforce);
    const { leads, totalCount } = await dashboardService.getUnenrichedLeadsPaginated(limit, offset, startDate, endDate, leadSource);
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

// Enrichment KPIs endpoint - supports date range selection
app.get('/api/dashboard/enrichment-kpis', async (req, res) => {
  try {
    const period = req.query.period as string || 'today';
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayEnd = new Date(todayStart.getTime() - 1);

    // Calculate this week (Monday to now)
    const dayOfWeek = now.getDay();
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const thisWeekStart = new Date(todayStart.getTime() - daysToMonday * 24 * 60 * 60 * 1000);

    // Calculate last week (previous Monday to previous Sunday)
    const lastWeekStart = new Date(thisWeekStart.getTime() - 7 * 24 * 60 * 60 * 1000);
    const lastWeekEnd = new Date(thisWeekStart.getTime() - 1);

    // Calculate this month (first day to now)
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Calculate last month
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    // Determine primary period based on selection
    let primaryStart: Date;
    let primaryEnd: Date;
    let primaryLabel: string;
    let comparisonStart: Date;
    let comparisonEnd: Date;
    let comparisonLabel: string;

    switch (period) {
      case 'yesterday':
        primaryStart = yesterdayStart;
        primaryEnd = yesterdayEnd;
        primaryLabel = 'Yesterday';
        // Compare with day before yesterday
        comparisonStart = new Date(yesterdayStart.getTime() - 24 * 60 * 60 * 1000);
        comparisonEnd = new Date(yesterdayStart.getTime() - 1);
        comparisonLabel = 'Day Before';
        break;
      case 'this_week':
        primaryStart = thisWeekStart;
        primaryEnd = now;
        primaryLabel = 'This Week';
        comparisonStart = lastWeekStart;
        comparisonEnd = lastWeekEnd;
        comparisonLabel = 'Last Week';
        break;
      case 'last_week':
        primaryStart = lastWeekStart;
        primaryEnd = lastWeekEnd;
        primaryLabel = 'Last Week';
        // Compare with week before
        comparisonStart = new Date(lastWeekStart.getTime() - 7 * 24 * 60 * 60 * 1000);
        comparisonEnd = new Date(lastWeekStart.getTime() - 1);
        comparisonLabel = 'Previous Week';
        break;
      case 'this_month':
        primaryStart = thisMonthStart;
        primaryEnd = now;
        primaryLabel = 'This Month';
        comparisonStart = lastMonthStart;
        comparisonEnd = lastMonthEnd;
        comparisonLabel = 'Last Month';
        break;
      case 'last_month':
        primaryStart = lastMonthStart;
        primaryEnd = lastMonthEnd;
        primaryLabel = 'Last Month';
        // Compare with month before
        comparisonStart = new Date(now.getFullYear(), now.getMonth() - 2, 1);
        comparisonEnd = new Date(now.getFullYear(), now.getMonth() - 1, 0, 23, 59, 59, 999);
        comparisonLabel = 'Previous Month';
        break;
      case 'today':
      default:
        primaryStart = todayStart;
        primaryEnd = now;
        primaryLabel = 'Today';
        comparisonStart = yesterdayStart;
        comparisonEnd = yesterdayEnd;
        comparisonLabel = 'Yesterday';
        break;
    }

    // Helper function to get stats for a date range
    const getStatsForRange = async (startDate: Date, endDate: Date) => {
      const result = await pool.query(`
        SELECT
          COUNT(*) as total_enriched,
          COUNT(CASE WHEN enrichment_status = 'completed' THEN 1 END) as successful,
          COUNT(CASE WHEN enrichment_status = 'failed' OR enrichment_status = 'no_data' THEN 1 END) as failed,
          COUNT(CASE WHEN salesforce_updated = true THEN 1 END) as salesforce_updated,
          ROUND(AVG(fit_score), 1) as avg_fit_score,
          MIN(fit_score) as min_fit_score,
          MAX(fit_score) as max_fit_score,
          COUNT(CASE WHEN fit_score >= 80 THEN 1 END) as premium_count,
          COUNT(CASE WHEN fit_score >= 60 AND fit_score < 80 THEN 1 END) as high_fit_count,
          COUNT(CASE WHEN fit_score >= 40 AND fit_score < 60 THEN 1 END) as mql_count,
          COUNT(CASE WHEN fit_score < 40 THEN 1 END) as disqualified_count,
          COUNT(CASE WHEN has_gmb = true THEN 1 END) as has_gmb_count,
          COUNT(CASE WHEN has_website = true THEN 1 END) as has_website_count,
          COUNT(CASE WHEN spending_on_marketing = true THEN 1 END) as has_pixels_count
        FROM lead_enrichments
        WHERE created_at >= $1 AND created_at <= $2
      `, [startDate.toISOString(), endDate.toISOString()]);

      const row = result.rows[0];
      return {
        total_enriched: parseInt(row.total_enriched) || 0,
        successful: parseInt(row.successful) || 0,
        failed: parseInt(row.failed) || 0,
        salesforce_updated: parseInt(row.salesforce_updated) || 0,
        avg_fit_score: parseFloat(row.avg_fit_score) || 0,
        min_fit_score: parseInt(row.min_fit_score) || 0,
        max_fit_score: parseInt(row.max_fit_score) || 0,
        score_distribution: {
          premium: parseInt(row.premium_count) || 0,
          high_fit: parseInt(row.high_fit_count) || 0,
          mql: parseInt(row.mql_count) || 0,
          disqualified: parseInt(row.disqualified_count) || 0,
        },
        data_quality: {
          has_gmb: parseInt(row.has_gmb_count) || 0,
          has_website: parseInt(row.has_website_count) || 0,
          has_pixels: parseInt(row.has_pixels_count) || 0,
        },
      };
    };

    // Get hourly breakdown for a date range
    const getHourlyStats = async (startDate: Date, endDate: Date) => {
      const result = await pool.query(`
        SELECT
          EXTRACT(HOUR FROM created_at) as hour,
          COUNT(*) as count,
          ROUND(AVG(fit_score), 1) as avg_score
        FROM lead_enrichments
        WHERE created_at >= $1 AND created_at <= $2
        GROUP BY EXTRACT(HOUR FROM created_at)
        ORDER BY hour
      `, [startDate.toISOString(), endDate.toISOString()]);

      return result.rows.map(row => ({
        hour: parseInt(row.hour),
        count: parseInt(row.count),
        avg_score: parseFloat(row.avg_score) || 0,
      }));
    };

    // Get daily breakdown for a date range
    const getDailyStats = async (startDate: Date, endDate: Date) => {
      const result = await pool.query(`
        SELECT
          DATE(created_at) as date,
          COUNT(*) as count,
          ROUND(AVG(fit_score), 1) as avg_score
        FROM lead_enrichments
        WHERE created_at >= $1 AND created_at <= $2
        GROUP BY DATE(created_at)
        ORDER BY date
      `, [startDate.toISOString(), endDate.toISOString()]);

      return result.rows.map(row => ({
        date: row.date,
        count: parseInt(row.count),
        avg_score: parseFloat(row.avg_score) || 0,
      }));
    };

    // Get recent enrichments within a date range
    const getRecentEnrichments = async (startDate: Date, endDate: Date, limit: number) => {
      const result = await pool.query(`
        SELECT
          salesforce_lead_id,
          enrichment_status,
          fit_score,
          salesforce_updated,
          has_gmb,
          has_website,
          created_at
        FROM lead_enrichments
        WHERE created_at >= $1 AND created_at <= $2
        ORDER BY created_at DESC
        LIMIT $3
      `, [startDate.toISOString(), endDate.toISOString(), limit]);

      return result.rows;
    };

    // Execute queries for primary and comparison periods
    const [primaryStats, comparisonStats, hourlyStats, dailyStats, recentEnrichments] = await Promise.all([
      getStatsForRange(primaryStart, primaryEnd),
      getStatsForRange(comparisonStart, comparisonEnd),
      getHourlyStats(primaryStart, primaryEnd),
      getDailyStats(primaryStart, primaryEnd),
      getRecentEnrichments(primaryStart, primaryEnd, 10),
    ]);

    // Calculate trends (percentage change)
    const calcTrend = (current: number, previous: number) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 100);
    };

    res.json({
      selected_period: period,
      primary: {
        label: primaryLabel,
        start: primaryStart.toISOString(),
        end: primaryEnd.toISOString(),
        stats: primaryStats,
        hourly: hourlyStats,
        daily: dailyStats,
      },
      comparison: {
        label: comparisonLabel,
        start: comparisonStart.toISOString(),
        end: comparisonEnd.toISOString(),
        stats: comparisonStats,
      },
      trends: {
        total_enriched: calcTrend(primaryStats.total_enriched, comparisonStats.total_enriched),
        avg_fit_score: calcTrend(primaryStats.avg_fit_score, comparisonStats.avg_fit_score),
        successful: calcTrend(primaryStats.successful, comparisonStats.successful),
      },
      recent_enrichments: recentEnrichments,
      generated_at: now.toISOString(),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to fetch enrichment KPIs', { error: errorMessage });

    const emptyStats = {
      total_enriched: 0, successful: 0, failed: 0, salesforce_updated: 0,
      avg_fit_score: 0, min_fit_score: 0, max_fit_score: 0,
      score_distribution: { premium: 0, high_fit: 0, mql: 0, disqualified: 0 },
      data_quality: { has_gmb: 0, has_website: 0, has_pixels: 0 },
    };

    // Check if it's a table not found error
    if (errorMessage.includes('does not exist') || errorMessage.includes('42P01')) {
      res.json({
        selected_period: 'today',
        primary: { label: 'Today', stats: emptyStats, hourly: [], daily: [] },
        comparison: { label: 'Yesterday', stats: emptyStats },
        trends: { total_enriched: 0, avg_fit_score: 0, successful: 0 },
        recent_enrichments: [],
        setup_required: 'Database tables not found. Run migrations first.',
        generated_at: new Date().toISOString(),
      });
    } else {
      res.status(500).json({ error: `Failed to fetch enrichment KPIs: ${errorMessage}` });
    }
  }
});

// Helper function to process a single lead enrichment
async function enrichSingleLead(
  lead: { id: string; company: string; phone?: string | null; city?: string | null; state?: string | null; website?: string | null; street?: string | null; postalCode?: string | null },
  salesforce: SalesforceService,
  pool: Pool
): Promise<{ id: string; success: boolean; fit_score?: number; error?: string; duration_ms?: number }> {
  const startTime = Date.now();
  const requestId = uuidv4();

  try {
    const enrichmentData: EnrichmentData = {};

    // Initialize services
    const googlePlaces = new GooglePlacesService(process.env.GOOGLE_PLACES_API_KEY || '');
    const pdl = new PeopleDataLabsService(process.env.PDL_API_KEY || '');
    const websiteTech = new WebsiteTechService();

    try {
      // Step 1: Google Places enrichment
      try {
        const googlePlacesData = await googlePlaces.enrich(
          lead.company,
          lead.phone || undefined,
          lead.city || undefined,
          lead.state || undefined,
          lead.website || undefined,
          lead.street || undefined,
          lead.postalCode || undefined
        );
        if (googlePlacesData) {
          enrichmentData.google_places = googlePlacesData;
        }
      } catch (error) {
        logger.warn('Google Places enrichment failed', { leadId: lead.id, error });
      }

      // Get fields that can be filled from GMB data
      const gmbResult = getFilledFieldsFromGMB(enrichmentData.google_places, {
        website: lead.website || undefined,
        phone: lead.phone || undefined,
        city: lead.city || undefined,
        state: lead.state || undefined,
      });
      const filledFromGMB = gmbResult.fields;
      const gmbAuditNote = gmbResult.auditNote;

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

      // Step 3: PDL Company Enrichment
      try {
        const pdlData = await pdl.enrichCompany({
          lead_id: requestId,
          business_name: lead.company,
          website: websiteForTech,
          phone: lead.phone || filledFromGMB.phone,
          city: lead.city || filledFromGMB.city,
          state: lead.state || filledFromGMB.state,
        });
        if (pdlData) {
          enrichmentData.pdl = pdlData;
        }
      } catch (error) {
        logger.warn('PDL enrichment failed', { leadId: lead.id, error });
      }

      // Step 4: Calculate Fit Score
      const fitScoreResult = calculateFitScore(enrichmentData);

      // Step 5: Map to Salesforce-aligned fields
      const sfFields = mapToSalesforceFields(enrichmentData, websiteForTech);
      const sfUpdateFields = formatForSalesforceUpdate(
        sfFields,
        lead.website || undefined,
        lead.phone || undefined,
        filledFromGMB,
        fitScoreResult.fit_score,
        enrichmentData.google_places?.gmb_types,
        gmbAuditNote
      );

      // Step 6: Update Salesforce
      const sfResult = await salesforce.updateLead(lead.id, enrichmentData, fitScoreResult, sfUpdateFields);

      // Store in local database
      try {
        await pool.query(
          `INSERT INTO lead_enrichments (
            salesforce_lead_id, job_id, enrichment_status,
            google_places_data, pdl_data, website_tech_data,
            fit_score, score_breakdown, salesforce_updated
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            lead.id,
            requestId,
            'completed',
            enrichmentData.google_places ? JSON.stringify(enrichmentData.google_places) : null,
            enrichmentData.pdl ? JSON.stringify(enrichmentData.pdl) : null,
            enrichmentData.website_tech ? JSON.stringify(enrichmentData.website_tech) : null,
            fitScoreResult.fit_score,
            JSON.stringify(fitScoreResult.score_breakdown),
            sfResult.success,
          ]
        );
      } catch (dbError) {
        logger.error('Failed to store enrichment record', { leadId: lead.id, error: dbError });
      }

      const duration = Date.now() - startTime;
      if (sfResult.success) {
        return { id: lead.id, success: true, fit_score: fitScoreResult.fit_score, duration_ms: duration };
      } else {
        const errorMsg = sfResult.error
          ? `${sfResult.error.code}: ${sfResult.error.message}`
          : 'Failed to update Salesforce';
        return { id: lead.id, success: false, error: errorMsg, duration_ms: duration };
      }
    } finally {
      await websiteTech.close();
    }
  } catch (error) {
    return {
      id: lead.id,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      duration_ms: Date.now() - startTime,
    };
  }
}

// Batch enrich leads with PARALLEL processing (concurrency limit: 5)
app.post('/api/dashboard/enrich-batch', async (req, res) => {
  const { lead_ids, concurrency = 5 } = req.body;
  const startTime = Date.now();

  if (!Array.isArray(lead_ids) || lead_ids.length === 0) {
    return res.status(400).json({ error: 'lead_ids array is required' });
  }

  if (lead_ids.length > 50) {
    return res.status(400).json({ error: 'Maximum 50 leads per batch' });
  }

  // Limit concurrency to prevent overloading
  const maxConcurrency = Math.min(Math.max(1, concurrency), 10);

  const salesforce = getSalesforceService();
  const dashboardService = new DashboardStatsService(salesforce);

  // Get lead details from Salesforce
  const allUnenriched = await dashboardService.getUnenrichedLeads(1000);
  const leadsToEnrich = allUnenriched.filter(l => lead_ids.includes(l.id));

  if (leadsToEnrich.length === 0) {
    return res.status(404).json({ error: 'No matching leads found' });
  }

  logger.info('Starting parallel batch enrichment', {
    totalLeads: leadsToEnrich.length,
    concurrency: maxConcurrency,
  });

  // Process leads in parallel with concurrency limit
  const results: Array<{ id: string; success: boolean; fit_score?: number; error?: string; duration_ms?: number }> = [];

  // Process in chunks based on concurrency
  for (let i = 0; i < leadsToEnrich.length; i += maxConcurrency) {
    const chunk = leadsToEnrich.slice(i, i + maxConcurrency);
    const chunkResults = await Promise.all(
      chunk.map(lead => enrichSingleLead(lead, salesforce, pool))
    );
    results.push(...chunkResults);

    logger.info('Batch chunk completed', {
      processed: Math.min(i + maxConcurrency, leadsToEnrich.length),
      total: leadsToEnrich.length,
    });
  }

  const totalDuration = Date.now() - startTime;
  const successCount = results.filter(r => r.success).length;
  const avgDuration = results.reduce((sum, r) => sum + (r.duration_ms || 0), 0) / results.length;

  logger.info('Parallel batch enrichment completed', {
    processed: results.length,
    successful: successCount,
    failed: results.length - successCount,
    totalDuration_ms: totalDuration,
    avgLeadDuration_ms: Math.round(avgDuration),
    concurrency: maxConcurrency,
  });

  res.json({
    processed: results.length,
    successful: successCount,
    failed: results.length - successCount,
    total_duration_ms: totalDuration,
    avg_lead_duration_ms: Math.round(avgDuration),
    concurrency_used: maxConcurrency,
    results,
  });
});

// Google Places-only batch enrichment (faster - skips PDL and website tech)
app.post('/api/dashboard/enrich-batch-gmb-only', async (req, res) => {
  const { lead_ids, concurrency = 10 } = req.body;
  const startTime = Date.now();

  if (!Array.isArray(lead_ids) || lead_ids.length === 0) {
    return res.status(400).json({ error: 'lead_ids array is required' });
  }

  if (lead_ids.length > 100) {
    return res.status(400).json({ error: 'Maximum 100 leads per batch for GMB-only enrichment' });
  }

  // Validate Salesforce Lead IDs to prevent SOQL injection
  const { validateSalesforceIds } = await import('./utils/validation.js');
  const validation = validateSalesforceIds(lead_ids);
  if (!validation.valid) {
    logger.warn('Invalid Salesforce Lead IDs provided', { invalidIds: validation.invalidIds });
    return res.status(400).json({
      error: 'Invalid Salesforce Lead IDs',
      invalidIds: validation.invalidIds
    });
  }

  const maxConcurrency = Math.min(Math.max(1, concurrency), 20);
  const salesforce = getSalesforceService();

  // Fetch lead details directly from Salesforce by IDs
  const leadIds = lead_ids.map((id: string) => `'${id}'`).join(',');
  const query = `SELECT Id, Company, Phone, City, State, Website, Street, PostalCode FROM Lead WHERE Id IN (${leadIds})`;

  let leadsToEnrich: Array<{
    id: string;
    company: string;
    phone?: string | null;
    city?: string | null;
    state?: string | null;
    website?: string | null;
    street?: string | null;
    postalCode?: string | null;
  }> = [];

  try {
    const sfResult = await salesforce.query(query);
    leadsToEnrich = (sfResult.records as Array<Record<string, unknown>>).map((r) => ({
      id: r.Id as string,
      company: r.Company as string,
      phone: r.Phone as string | null,
      city: r.City as string | null,
      state: r.State as string | null,
      website: r.Website as string | null,
      street: r.Street as string | null,
      postalCode: r.PostalCode as string | null,
    }));
  } catch (err) {
    logger.error('Failed to fetch leads from Salesforce', { error: err });
    return res.status(500).json({ error: 'Failed to fetch leads from Salesforce' });
  }

  if (leadsToEnrich.length === 0) {
    return res.status(404).json({ error: 'No matching leads found in Salesforce' });
  }

  logger.info('Starting GMB-only batch enrichment', {
    totalLeads: leadsToEnrich.length,
    concurrency: maxConcurrency,
  });

  const googlePlaces = new GooglePlacesService(process.env.GOOGLE_PLACES_API_KEY || '');

  const results: Array<{ id: string; success: boolean; fit_score?: number; gmb_found?: boolean; reviews?: number; error?: string }> = [];

  // Process in parallel chunks
  for (let i = 0; i < leadsToEnrich.length; i += maxConcurrency) {
    const chunk = leadsToEnrich.slice(i, i + maxConcurrency);
    const chunkResults = await Promise.all(
      chunk.map(async (lead) => {
        try {
          const enrichmentData: EnrichmentData = {};

          // Only run Google Places enrichment
          const googlePlacesData = await googlePlaces.enrich(
            lead.company,
            lead.phone || undefined,
            lead.city || undefined,
            lead.state || undefined,
            lead.website || undefined,
            lead.street || undefined,
            lead.postalCode || undefined
          );

          if (googlePlacesData) {
            enrichmentData.google_places = googlePlacesData;
          }

          // Calculate fit score with just GMB data
          const fitScoreResult = calculateFitScore(enrichmentData);

          // Update Salesforce with GMB data and fit score
          const sfUpdateFields: Record<string, unknown> = {
            Fit_Score__c: fitScoreResult.fit_score,
          };

          if (googlePlacesData) {
            sfUpdateFields.Has_GMB__c = true;
            sfUpdateFields.GMB_Review_Count__c = googlePlacesData.gmb_review_count || 0;
            sfUpdateFields.GMB_Rating__c = googlePlacesData.gmb_rating || null;
            if (googlePlacesData.place_id) {
              sfUpdateFields.GMB_URL__c = `https://www.google.com/maps/place/?q=place_id:${googlePlacesData.place_id}`;
            }
          } else {
            sfUpdateFields.Has_GMB__c = false;
          }

          const sfResult = await salesforce.updateLead(lead.id, enrichmentData, fitScoreResult, sfUpdateFields);
          if (!sfResult.success) {
            logger.error('Salesforce update failed in GMB-only batch', {
              leadId: lead.id,
              error: sfResult.error,
              fieldsAttempted: Object.keys(sfUpdateFields),
            });
          }

          return {
            id: lead.id,
            success: true,
            fit_score: fitScoreResult.fit_score,
            gmb_found: !!googlePlacesData?.place_id,
            reviews: googlePlacesData?.gmb_review_count || 0,
          };
        } catch (error) {
          return {
            id: lead.id,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      })
    );
    results.push(...chunkResults);

    logger.info('GMB-only batch chunk completed', {
      processed: Math.min(i + maxConcurrency, leadsToEnrich.length),
      total: leadsToEnrich.length,
    });
  }

  const totalDuration = Date.now() - startTime;
  const successCount = results.filter(r => r.success).length;
  const gmbFoundCount = results.filter(r => r.gmb_found).length;

  res.json({
    processed: results.length,
    successful: successCount,
    failed: results.length - successCount,
    gmb_found: gmbFoundCount,
    gmb_match_rate: `${((gmbFoundCount / results.length) * 100).toFixed(1)}%`,
    total_duration_ms: totalDuration,
    avg_lead_duration_ms: Math.round(totalDuration / results.length),
    results,
  });
});

// Backfill fit scores for leads that have GMB but no fit score
app.post('/api/dashboard/backfill-fit-scores', async (req, res) => {
  const { limit = 100 } = req.body;
  const startTime = Date.now();
  const salesforce = getSalesforceService();

  // Query leads with GMB but no fit score
  const query = `SELECT Id, Company, Has_GMB__c, GMB_URL__c FROM Lead WHERE Has_GMB__c = true AND Fit_Score__c = null AND LeadSource = 'Facebook' LIMIT ${Math.min(limit, 500)}`;

  let leadsToUpdate: Array<{ id: string; company: string; hasGmb: boolean }> = [];

  try {
    const sfResult = await salesforce.query(query);
    leadsToUpdate = (sfResult.records as Array<Record<string, unknown>>).map((r) => ({
      id: r.Id as string,
      company: r.Company as string,
      hasGmb: r.Has_GMB__c as boolean,
    }));
  } catch (err) {
    logger.error('Failed to fetch leads for fit score backfill', { error: err });
    return res.status(500).json({ error: 'Failed to fetch leads from Salesforce' });
  }

  if (leadsToUpdate.length === 0) {
    return res.json({ message: 'No leads found needing fit score backfill', processed: 0 });
  }

  logger.info('Starting fit score backfill', { totalLeads: leadsToUpdate.length });

  const results: Array<{ id: string; success: boolean; fit_score?: number; error?: string }> = [];

  for (const lead of leadsToUpdate) {
    try {
      // Calculate fit score assuming GMB exists (gives +10 for website)
      const enrichmentData: EnrichmentData = {
        google_places: {
          place_id: 'backfill', // Indicates GMB exists
        },
      };
      const fitScoreResult = calculateFitScore(enrichmentData);

      // Update Salesforce with fit score
      const sfUpdateFields: Record<string, unknown> = {
        Fit_Score__c: fitScoreResult.fit_score,
      };

      const sfResult = await salesforce.updateLead(lead.id, enrichmentData, fitScoreResult, sfUpdateFields);

      if (sfResult.success) {
        results.push({ id: lead.id, success: true, fit_score: fitScoreResult.fit_score });
      } else {
        results.push({ id: lead.id, success: false, error: sfResult.error?.message });
      }
    } catch (error) {
      results.push({
        id: lead.id,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  const totalDuration = Date.now() - startTime;
  const successCount = results.filter(r => r.success).length;

  res.json({
    processed: results.length,
    successful: successCount,
    failed: results.length - successCount,
    total_duration_ms: totalDuration,
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
    const pdl = new PeopleDataLabsService(process.env.PDL_API_KEY || '');
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
      const gmbResult = getFilledFieldsFromGMB(enrichmentData.google_places, {
        website: payload.website,
        phone: payload.phone,
        city: payload.city,
        state: payload.state,
      });
      const filledFromGMB = gmbResult.fields;
      const gmbAuditNote = gmbResult.auditNote;

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

      // Step 3: PDL Company Enrichment (for employees, years in business, industry, revenue)
      try {
        logger.info('Enriching with People Data Labs', { requestId });
        const pdlData = await pdl.enrichCompany({
          lead_id: requestId,
          business_name: payload.business_name,
          website: websiteForTech,
          phone: payload.phone || filledFromGMB.phone,
          city: payload.city || filledFromGMB.city,
          state: payload.state || filledFromGMB.state,
        });
        if (pdlData) {
          enrichmentData.pdl = pdlData;
        }
      } catch (error) {
        logger.warn('PDL enrichment failed', {
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
        enrichmentData.pdl ||
        enrichmentData.website_tech;

      const enrichmentStatus = hasAnyEnrichment ? 'completed' : 'no_data';

      // Store enrichment record in database with SF-aligned fields
      try {
        await pool.query(
          `INSERT INTO lead_enrichments (
            salesforce_lead_id, job_id, enrichment_status,
            google_places_data, pdl_data, website_tech_data,
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
            enrichmentData.pdl ? JSON.stringify(enrichmentData.pdl) : null,
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
        employee_count: enrichmentData.pdl?.employee_count ?? null,
        employee_size_range: enrichmentData.pdl?.size_range ?? null,
        years_in_business: enrichmentData.pdl?.years_in_business ?? null,
        year_founded: enrichmentData.pdl?.year_founded ?? null,
        industry: enrichmentData.pdl?.industry ?? null,
        inferred_revenue: enrichmentData.pdl?.inferred_revenue ?? null,
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
        // Fields from GMB data (for reference - does not include phone)
        gmb_data: filledFromGMB,
        // Salesforce-aligned fields (map directly to SF custom fields)
        // Workato should use these values to update the Lead record
        // Note: Phone is intentionally NOT included - preserve original lead phone
        salesforce_fields: {
          // Standard Lead fields (website from GMB, but NOT phone)
          Website: filledFromGMB.website || payload.website || null,
          // Phone is intentionally NOT updated - preserve original lead phone number
          Street: filledFromGMB.address || null,
          City: filledFromGMB.city || payload.city || null,
          State: filledFromGMB.state || payload.state || null,
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
          // Lead_Vertical__c - mapped from GMB types (only set if determined)
          Lead_Vertical__c: mapGMBTypesToVertical(enrichmentData.google_places?.gmb_types),
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

// ============ Workato Automatic Enrichment Endpoint ============

// Workato sends a Salesforce Lead ID, we fetch the lead, enrich it, and update Salesforce
// This is the simplified endpoint for automatic enrichment from Workato
app.post('/api/workato/enrich', authenticateApiKey, async (req, res) => {
  const requestId = uuidv4();
  const startTime = Date.now();

  logger.info('Workato automatic enrichment request received', { requestId, body: req.body });

  try {
    const { salesforce_lead_id } = req.body;

    if (!salesforce_lead_id) {
      return res.status(400).json({ error: 'salesforce_lead_id is required' });
    }

    // Fetch lead data from Salesforce
    const salesforce = getSalesforceService();
    const query = `
      SELECT Id, Company, Website, Phone, City, State, Street, PostalCode, LeadSource, FirstName, LastName, Email
      FROM Lead
      WHERE Id = '${salesforce_lead_id}'
    `;
    const result = await salesforce.query(query);

    if (result.records.length === 0) {
      logger.warn('Lead not found in Salesforce', { requestId, salesforceLeadId: salesforce_lead_id });
      return res.status(404).json({ error: 'Lead not found in Salesforce', request_id: requestId });
    }

    const lead = result.records[0] as {
      Id: string; Company: string; Website?: string; Phone?: string;
      City?: string; State?: string; Street?: string; PostalCode?: string;
      LeadSource?: string; FirstName?: string; LastName?: string; Email?: string;
    };

    logger.info('Fetched lead from Salesforce', {
      requestId,
      leadId: lead.Id,
      company: lead.Company,
      hasWebsite: !!lead.Website,
      hasPhone: !!lead.Phone,
    });

    const enrichmentData: EnrichmentData = {};

    // Initialize services
    const googlePlaces = new GooglePlacesService(process.env.GOOGLE_PLACES_API_KEY || '');
    const pdl = new PeopleDataLabsService(process.env.PDL_API_KEY || '');
    const websiteTech = new WebsiteTechService();

    try {
      // Step 1: Google Places enrichment (first priority - use all available data for matching)
      try {
        logger.info('Enriching with Google Places', { requestId, businessName: lead.Company });
        const googlePlacesData = await googlePlaces.enrich(
          lead.Company,
          lead.Phone,
          lead.City,
          lead.State,
          lead.Website,
          lead.Street,
          lead.PostalCode
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
      const gmbResult = getFilledFieldsFromGMB(enrichmentData.google_places, {
        website: lead.Website,
        phone: lead.Phone,
        city: lead.City,
        state: lead.State,
      });
      const filledFromGMB = gmbResult.fields;
      const gmbAuditNote = gmbResult.auditNote;

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

      // Step 3: PDL Company Enrichment (for employees, years in business, industry, revenue)
      try {
        logger.info('Enriching with People Data Labs', { requestId });
        const pdlData = await pdl.enrichCompany({
          lead_id: requestId,
          business_name: lead.Company,
          website: websiteForTech,
          phone: lead.Phone || filledFromGMB.phone,
          city: lead.City || filledFromGMB.city,
          state: lead.State || filledFromGMB.state,
        });
        if (pdlData) {
          enrichmentData.pdl = pdlData;
        }
      } catch (error) {
        logger.warn('PDL enrichment failed', { requestId, error });
      }

      // Step 4: Calculate Fit Score
      const fitScoreResult = calculateFitScore(enrichmentData);

      // Step 5: Map to Salesforce-aligned fields (use GMB-filled website if original missing)
      const sfFields = mapToSalesforceFields(enrichmentData, websiteForTech);

      // Step 6: Update Salesforce
      let salesforceUpdated = false;
      let salesforceError: string | undefined;
      try {
        const sfUpdateFields = formatForSalesforceUpdate(
          sfFields,
          lead.Website,
          lead.Phone,
          filledFromGMB,
          fitScoreResult.fit_score,
          enrichmentData.google_places?.gmb_types,
          gmbAuditNote
        );
        const sfResult = await salesforce.updateLead(salesforce_lead_id, enrichmentData, fitScoreResult, sfUpdateFields);
        salesforceUpdated = sfResult.success;

        if (!sfResult.success && sfResult.error) {
          salesforceError = `${sfResult.error.code}: ${sfResult.error.message}`;
          logger.warn('Salesforce update failed', {
            requestId,
            leadId: salesforce_lead_id,
            errorCode: sfResult.error.code,
            errorMessage: sfResult.error.message,
          });
        }

        if (Object.keys(filledFromGMB).length > 0) {
          logger.info('Filled missing lead fields from GMB', {
            requestId,
            filledFields: Object.keys(filledFromGMB),
          });
        }
      } catch (sfError) {
        logger.error('Failed to update Salesforce (exception)', { requestId, error: sfError });
        salesforceError = sfError instanceof Error ? sfError.message : String(sfError);
      }

      // Step 7: Store enrichment record in database
      const enrichmentStatus = enrichmentData.google_places || enrichmentData.pdl || enrichmentData.website_tech
        ? 'completed' : 'no_data';

      try {
        await pool.query(
          `INSERT INTO lead_enrichments (
            salesforce_lead_id, job_id, enrichment_status,
            google_places_data, pdl_data, website_tech_data,
            fit_score, score_breakdown, salesforce_updated, salesforce_updated_at,
            has_website, number_of_employees, number_of_gbp_reviews,
            number_of_years_in_business, has_gmb, gmb_url,
            location_type, business_license, spending_on_marketing
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
          [
            salesforce_lead_id,
            requestId,
            enrichmentStatus,
            enrichmentData.google_places ? JSON.stringify(enrichmentData.google_places) : null,
            enrichmentData.pdl ? JSON.stringify(enrichmentData.pdl) : null,
            enrichmentData.website_tech ? JSON.stringify(enrichmentData.website_tech) : null,
            fitScoreResult.fit_score,
            JSON.stringify(fitScoreResult.score_breakdown),
            salesforceUpdated,
            salesforceUpdated ? new Date() : null,
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
      logger.info('Workato automatic enrichment completed', {
        requestId,
        salesforceLeadId: salesforce_lead_id,
        fitScore: fitScoreResult.fit_score,
        salesforceUpdated,
        duration,
      });

      // Return comprehensive response for Workato
      res.json({
        success: true,
        request_id: requestId,
        enrichment_status: enrichmentStatus,
        fit_score: fitScoreResult.fit_score,
        salesforce_updated: salesforceUpdated,
        salesforce_error: salesforceError,
        duration_ms: duration,
        lead: {
          id: lead.Id,
          company: lead.Company,
          website: lead.Website,
          phone: lead.Phone,
          city: lead.City,
          state: lead.State,
        },
        enrichment_summary: {
          google_places_found: !!enrichmentData.google_places,
          pdl_found: !!enrichmentData.pdl,
          website_tech_scanned: !!enrichmentData.website_tech,
          google_reviews: enrichmentData.google_places?.gmb_review_count ?? null,
          google_rating: enrichmentData.google_places?.gmb_rating ?? null,
          employee_count: enrichmentData.pdl?.employee_count ?? null,
          years_in_business: enrichmentData.pdl?.years_in_business ?? null,
          pixels_detected: enrichmentData.website_tech?.marketing_tools_detected ?? [],
        },
        score_breakdown: fitScoreResult.score_breakdown,
      });
    } finally {
      await websiteTech.close();
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Workato automatic enrichment failed', {
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
    pdlConfigured: !!process.env.PDL_API_KEY,
  });
});
