import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '@tsi-fit-score/shared';
import { LeadPayload } from '@tsi-fit-score/shared';
import { query, queryOne } from '@tsi-fit-score/shared';
import { QueueService } from '../services/queue';

const router = Router();
const queueService = new QueueService();

router.post('/', async (req: Request, res: Response) => {
  try {
    const leadPayload: LeadPayload = req.body;

    // Insert lead into database
    const leadId = uuidv4();
    await query(
      `INSERT INTO leads (
        id, lead_id, salesforce_lead_id, business_name, website, phone, email,
        utm_source, fbclid, gclid, ttclid, raw_payload
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        leadId,
        leadPayload.lead_id,
        leadPayload.salesforce_lead_id || null,
        leadPayload.business_name,
        leadPayload.website || null,
        leadPayload.phone || null,
        leadPayload.email || null,
        leadPayload.utm_source || null,
        leadPayload.fbclid || null,
        leadPayload.gclid || null,
        leadPayload.ttclid || null,
        JSON.stringify(leadPayload),
      ]
    );

    // Add job to queue
    const jobId = await queueService.addJob(leadId, leadPayload);

    logger.info('Lead ingested successfully', {
      leadId,
      jobId,
      businessName: leadPayload.business_name,
    });

    res.status(202).json({
      status: 'accepted',
      job_id: jobId,
      lead_row_id: leadId,
    });
  } catch (error) {
    logger.error('Failed to ingest lead', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: 'Failed to ingest lead',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;

