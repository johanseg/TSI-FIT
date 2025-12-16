import express from 'express';
import { Worker, Queue } from 'bullmq';
import Redis from 'ioredis';
import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import winston from 'winston';

// Services
import { GooglePlacesService } from './services/googlePlaces';
import { ClayService } from './services/clay';
import { WebsiteTechService } from './services/websiteTech';
import { calculateFitScore } from './services/fitScore';
import { SalesforceService } from './services/salesforce';
import { EnrichmentProcessor } from './processors/enrichLead';

// Types
import { LeadPayload, EnrichmentJobData } from './types/lead';

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

// Redis connection
const redisConnection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

// BullMQ Queue
const queue = new Queue<EnrichmentJobData>('lead-enrichment', {
  connection: redisConnection,
});

// Validation schemas
const DirectLeadSchema = z.object({
  lead_id: z.string(),
  business_name: z.string(),
  contact_name: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  website: z.string().url().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  salesforce_lead_id: z.string().optional(),
  fbclid: z.string().optional(),
  gclid: z.string().optional(),
  ttclid: z.string().optional(),
  utm_source: z.string().optional(),
  utm_medium: z.string().optional(),
  utm_campaign: z.string().optional(),
});

const LanderLabSchema = z.object({
  form_data: z.record(z.string()).optional(),
  lead_id: z.string().optional(),
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

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Lead ingestion
app.post('/ingest', async (req, res) => {
  try {
    let leadPayload: LeadPayload;

    // Try direct format first
    const directResult = DirectLeadSchema.safeParse(req.body);
    if (directResult.success) {
      leadPayload = directResult.data as LeadPayload;
    } else {
      // Try LanderLab format
      const landerLabResult = LanderLabSchema.safeParse(req.body);
      if (landerLabResult.success && landerLabResult.data.form_data) {
        const formData = landerLabResult.data.form_data;
        leadPayload = {
          lead_id: landerLabResult.data.lead_id || uuidv4(),
          business_name: formData.business_name || formData.company || '',
          contact_name: formData.contact_name || formData.name,
          email: formData.email,
          phone: formData.phone,
          website: formData.website,
          city: formData.city,
          state: formData.state,
          salesforce_lead_id: formData.salesforce_lead_id,
          fbclid: formData.fbclid,
          gclid: formData.gclid,
          ttclid: formData.ttclid,
          utm_source: formData.utm_source,
          utm_medium: formData.utm_medium,
          utm_campaign: formData.utm_campaign,
        };
      } else {
        return res.status(400).json({ error: 'Invalid payload format' });
      }
    }

    // Insert lead into database
    const leadRowId = uuidv4();
    await pool.query(
      `INSERT INTO leads (id, lead_id, business_name, contact_name, email, phone, website, city, state, salesforce_lead_id, fbclid, gclid, ttclid, utm_source, utm_medium, utm_campaign, raw_payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
      [
        leadRowId,
        leadPayload.lead_id,
        leadPayload.business_name,
        leadPayload.contact_name,
        leadPayload.email,
        leadPayload.phone,
        leadPayload.website,
        leadPayload.city,
        leadPayload.state,
        leadPayload.salesforce_lead_id,
        leadPayload.fbclid,
        leadPayload.gclid,
        leadPayload.ttclid,
        leadPayload.utm_source,
        leadPayload.utm_medium,
        leadPayload.utm_campaign,
        JSON.stringify(req.body),
      ]
    );

    // Enqueue job
    const job = await queue.add('enrich-lead', {
      leadRowId,
      leadPayload,
    });

    logger.info('Lead ingested and job enqueued', { leadRowId, jobId: job.id });

    res.status(202).json({
      message: 'Lead accepted for processing',
      lead_row_id: leadRowId,
      job_id: job.id,
    });
  } catch (error) {
    logger.error('Failed to ingest lead', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get lead by ID
app.get('/lead/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const leadResult = await pool.query('SELECT * FROM leads WHERE id = $1', [id]);
    if (leadResult.rows.length === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const enrichmentResult = await pool.query(
      'SELECT * FROM lead_enrichments WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 1',
      [id]
    );

    res.json({
      lead: leadResult.rows[0],
      enrichment: enrichmentResult.rows[0] || null,
    });
  } catch (error) {
    logger.error('Failed to fetch lead', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

// Worker setup
const worker = new Worker<EnrichmentJobData>(
  'lead-enrichment',
  async (job) => {
    logger.info('Processing job', { jobId: job.id, leadRowId: job.data.leadRowId });

    const processor = new EnrichmentProcessor(
      pool,
      new GooglePlacesService(process.env.GOOGLE_PLACES_API_KEY || ''),
      new ClayService(process.env.CLAY_API_KEY || ''),
      new WebsiteTechService(),
      new SalesforceService({
        loginUrl: process.env.SFDC_LOGIN_URL || 'https://login.salesforce.com',
        clientId: process.env.SFDC_CLIENT_ID || '',
        clientSecret: process.env.SFDC_CLIENT_SECRET || '',
        username: process.env.SFDC_USERNAME || '',
        password: process.env.SFDC_PASSWORD || '',
        securityToken: process.env.SFDC_SECURITY_TOKEN || '',
      })
    );

    await processor.process(job);
  },
  {
    connection: redisConnection,
    concurrency: 5,
    removeOnComplete: { count: 100, age: 24 * 3600 },
    removeOnFail: { count: 1000 },
  }
);

worker.on('completed', (job) => {
  logger.info('Job completed', { jobId: job.id });
});

worker.on('failed', (job, err) => {
  logger.error('Job failed', { jobId: job?.id, error: err.message });
});

// Graceful shutdown
const shutdown = async () => {
  logger.info('Shutting down...');
  await worker.close();
  await queue.close();
  await pool.end();
  redisConnection.disconnect();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  logger.info('Worker started, waiting for jobs...');
});
