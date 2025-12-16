import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { logger } from '@tsi-fit-score/shared';

// Schema for direct API payload
const directApiSchema = z.object({
  lead_id: z.string().min(1),
  salesforce_lead_id: z.string().optional(),
  business_name: z.string().min(1),
  website: z.string().url().optional().or(z.string().length(0)),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.string().length(0)),
  utm_source: z.string().optional(),
  fbclid: z.string().optional(),
  gclid: z.string().optional(),
  ttclid: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
});

// Schema for LanderLab.io webhook payload (flexible - accepts common webhook formats)
const landerlabWebhookSchema = z.object({
  lead_id: z.string().min(1).optional(),
  id: z.string().min(1).optional(), // Alternative field name
  salesforce_lead_id: z.string().optional(),
  business_name: z.string().min(1).optional(),
  company_name: z.string().min(1).optional(), // Alternative field name
  website: z.string().url().optional().or(z.string().length(0)),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.string().length(0)),
  utm_source: z.string().optional(),
  fbclid: z.string().optional(),
  gclid: z.string().optional(),
  ttclid: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
}).refine(
  (data) => data.lead_id || data.id,
  { message: 'lead_id or id is required' }
).refine(
  (data) => data.business_name || data.company_name,
  { message: 'business_name or company_name is required' }
);

export function validateIngestPayload(req: Request, res: Response, next: NextFunction): void {
  try {
    // Try direct API format first
    let validated = directApiSchema.safeParse(req.body);
    
    // If that fails, try LanderLab webhook format
    if (!validated.success) {
      validated = landerlabWebhookSchema.safeParse(req.body);
      
      if (validated.success) {
        // Normalize LanderLab format to internal format
        req.body = {
          lead_id: validated.data.lead_id || validated.data.id,
          salesforce_lead_id: validated.data.salesforce_lead_id,
          business_name: validated.data.business_name || validated.data.company_name,
          website: validated.data.website,
          phone: validated.data.phone,
          email: validated.data.email,
          utm_source: validated.data.utm_source,
          fbclid: validated.data.fbclid,
          gclid: validated.data.gclid,
          ttclid: validated.data.ttclid,
          city: validated.data.city,
          state: validated.data.state,
        };
      }
    }

    if (!validated.success) {
      logger.warn('Payload validation failed', {
        errors: validated.error.errors,
        body: req.body,
      });
      res.status(400).json({
        error: 'Invalid payload',
        details: validated.error.errors,
      });
      return;
    }

    next();
  } catch (error) {
    logger.error('Validation middleware error', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: 'Internal server error' });
  }
}

