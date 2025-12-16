import { Router, Request, Response } from 'express';
import { logger } from '@tsi-fit-score/shared';
import { queryOne } from '@tsi-fit-score/shared';

const router = Router();

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const leadId = req.params.id;

    // Fetch lead
    const lead = await queryOne(
      `SELECT * FROM leads WHERE id = $1`,
      [leadId]
    );

    if (!lead) {
      res.status(404).json({ error: 'Lead not found' });
      return;
    }

    // Fetch enrichment data
    const enrichment = await queryOne(
      `SELECT * FROM lead_enrichments 
       WHERE lead_id = $1 
       ORDER BY created_at DESC 
       LIMIT 1`,
      [leadId]
    );

    res.json({
      lead,
      enrichment: enrichment || null,
    });
  } catch (error) {
    logger.error('Failed to fetch lead', {
      error: error instanceof Error ? error.message : String(error),
      leadId: req.params.id,
    });
    res.status(500).json({
      error: 'Failed to fetch lead',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;

