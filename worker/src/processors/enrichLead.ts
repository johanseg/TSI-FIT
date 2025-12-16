import { Job } from 'bullmq';
import { logger } from '@tsi-fit-score/shared';
import {
  LeadPayload,
  EnrichmentData,
  LeadRecord,
  LeadEnrichmentRecord,
  EnrichmentJobData,
} from '@tsi-fit-score/shared';
import { query } from '@tsi-fit-score/shared';
import { GooglePlacesService } from '../services/googlePlaces';
import { ClayService } from '../services/clay';
import { WebsiteTechService } from '../services/websiteTech';
import { calculateFitScore } from '../services/fitScore';
import { SalesforceService } from '../services/salesforce';

export class EnrichmentProcessor {
  private googlePlaces: GooglePlacesService;
  private clay: ClayService;
  private websiteTech: WebsiteTechService;
  private salesforce: SalesforceService;

  constructor() {
    const googlePlacesApiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!googlePlacesApiKey) {
      throw new Error('GOOGLE_PLACES_API_KEY is required');
    }
    this.googlePlaces = new GooglePlacesService(googlePlacesApiKey);

    const clayApiKey = process.env.CLAY_API_KEY;
    if (!clayApiKey) {
      throw new Error('CLAY_API_KEY is required');
    }
    this.clay = new ClayService(clayApiKey);

    this.websiteTech = new WebsiteTechService();

    const sfdcConfig = {
      loginUrl: process.env.SFDC_LOGIN_URL || 'https://login.salesforce.com',
      clientId: process.env.SFDC_CLIENT_ID || '',
      clientSecret: process.env.SFDC_CLIENT_SECRET || '',
      username: process.env.SFDC_USERNAME || '',
      password: process.env.SFDC_PASSWORD || '',
      securityToken: process.env.SFDC_SECURITY_TOKEN || '',
    };
    this.salesforce = new SalesforceService(sfdcConfig);
  }

  async process(job: Job<EnrichmentJobData>): Promise<void> {
    const { leadId, leadPayload } = job.data;
    const jobId = job.id!;

    logger.info('Starting lead enrichment', {
      jobId,
      leadId,
      businessName: leadPayload.business_name,
    });

    // Initialize enrichment record
    let enrichmentRecord: LeadEnrichmentRecord | null = null;
    const enrichmentData: EnrichmentData = {};
    let enrichmentStatus: 'pending' | 'success' | 'partial' | 'failed' = 'pending';
    let errorMessage: string | undefined;

    try {
      // Create initial enrichment record
      await this.createEnrichmentRecord(leadId, jobId);

      // Step 1: Google Places enrichment
      try {
        logger.info('Enriching with Google Places', { jobId, leadId });
        const googlePlacesData = await this.googlePlaces.enrich(
          leadPayload.business_name,
          leadPayload.phone,
          leadPayload.city,
          leadPayload.state
        );
        if (googlePlacesData) {
          enrichmentData.google_places = googlePlacesData;
          await this.updateEnrichmentRecord(leadId, jobId, {
            google_places_data: googlePlacesData,
          });
        }
      } catch (error) {
        logger.warn('Google Places enrichment failed', {
          jobId,
          leadId,
          error: error instanceof Error ? error.message : String(error),
        });
        // Continue with other enrichments
      }

      // Step 2: Website tech detection
      if (leadPayload.website) {
        try {
          logger.info('Detecting website tech', { jobId, leadId, website: leadPayload.website });
          const websiteTechData = await this.websiteTech.detectTech(leadPayload.website);
          enrichmentData.website_tech = websiteTechData;
          await this.updateEnrichmentRecord(leadId, jobId, {
            website_tech_data: websiteTechData,
          });
        } catch (error) {
          logger.warn('Website tech detection failed', {
            jobId,
            leadId,
            error: error instanceof Error ? error.message : String(error),
          });
          // Continue with other enrichments
        }
      }

      // Step 3: Clay enrichment
      try {
        logger.info('Enriching with Clay', { jobId, leadId });
        const clayData = await this.clay.enrichLead(leadPayload);
        if (clayData) {
          enrichmentData.clay = clayData;
          await this.updateEnrichmentRecord(leadId, jobId, {
            clay_data: clayData,
          });
        }
      } catch (error) {
        logger.warn('Clay enrichment failed', {
          jobId,
          leadId,
          error: error instanceof Error ? error.message : String(error),
        });
        // Continue with scoring
      }

      // Step 4: Calculate Fit Score
      let fitScoreResult;
      try {
        logger.info('Calculating Fit Score', { jobId, leadId });
        fitScoreResult = calculateFitScore(enrichmentData);
        
        await this.updateEnrichmentRecord(leadId, jobId, {
          fit_score: fitScoreResult.fit_score,
          fit_tier: fitScoreResult.fit_tier,
          score_breakdown: fitScoreResult.score_breakdown,
        });
      } catch (error) {
        logger.error('Fit Score calculation failed', {
          jobId,
          leadId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error; // Fail the job if scoring fails
      }

      // Step 5: Update Salesforce
      if (leadPayload.salesforce_lead_id) {
        try {
          logger.info('Updating Salesforce Lead', {
            jobId,
            leadId,
            salesforceLeadId: leadPayload.salesforce_lead_id,
          });
          const updated = await this.salesforce.updateLead(
            leadPayload.salesforce_lead_id,
            enrichmentData,
            fitScoreResult
          );

          if (updated) {
            await this.updateEnrichmentRecord(leadId, jobId, {
              salesforce_updated: true,
              salesforce_updated_at: new Date(),
            });
          }
        } catch (error) {
          logger.error('Salesforce update failed', {
            jobId,
            leadId,
            error: error instanceof Error ? error.message : String(error),
          });
          // Don't fail the job if Salesforce update fails
        }
      }

      // Determine final status
      const hasAnyEnrichment =
        enrichmentData.google_places ||
        enrichmentData.clay ||
        enrichmentData.website_tech;

      if (hasAnyEnrichment && fitScoreResult) {
        enrichmentStatus = 'success';
      } else if (hasAnyEnrichment) {
        enrichmentStatus = 'partial';
      } else {
        enrichmentStatus = 'failed';
        errorMessage = 'No enrichment data collected';
      }

      await this.updateEnrichmentRecord(leadId, jobId, {
        enrichment_status: enrichmentStatus,
        error_message: errorMessage,
      });

      logger.info('Lead enrichment completed', {
        jobId,
        leadId,
        status: enrichmentStatus,
        fitScore: fitScoreResult?.fit_score,
      });
    } catch (error) {
      enrichmentStatus = 'failed';
      errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('Lead enrichment failed', {
        jobId,
        leadId,
        error: errorMessage,
      });

      await this.updateEnrichmentRecord(leadId, jobId, {
        enrichment_status: enrichmentStatus,
        error_message: errorMessage,
      });

      throw error;
    } finally {
      // Cleanup
      await this.websiteTech.close();
      await this.salesforce.disconnect();
    }
  }

  private async createEnrichmentRecord(
    leadId: string,
    jobId: string
  ): Promise<void> {
    await query(
      `INSERT INTO lead_enrichments (lead_id, job_id, enrichment_status)
       VALUES ($1, $2, 'pending')
       ON CONFLICT DO NOTHING`,
      [leadId, jobId]
    );
  }

  private async updateEnrichmentRecord(
    leadId: string,
    jobId: string,
    updates: Partial<LeadEnrichmentRecord>
  ): Promise<void> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (updates.google_places_data !== undefined) {
      fields.push(`google_places_data = $${paramIndex}`);
      values.push(JSON.stringify(updates.google_places_data));
      paramIndex++;
    }

    if (updates.clay_data !== undefined) {
      fields.push(`clay_data = $${paramIndex}`);
      values.push(JSON.stringify(updates.clay_data));
      paramIndex++;
    }

    if (updates.website_tech_data !== undefined) {
      fields.push(`website_tech_data = $${paramIndex}`);
      values.push(JSON.stringify(updates.website_tech_data));
      paramIndex++;
    }

    if (updates.fit_score !== undefined) {
      fields.push(`fit_score = $${paramIndex}`);
      values.push(updates.fit_score);
      paramIndex++;
    }

    if (updates.fit_tier !== undefined) {
      fields.push(`fit_tier = $${paramIndex}`);
      values.push(updates.fit_tier);
      paramIndex++;
    }

    if (updates.score_breakdown !== undefined) {
      fields.push(`score_breakdown = $${paramIndex}`);
      values.push(JSON.stringify(updates.score_breakdown));
      paramIndex++;
    }

    if (updates.salesforce_updated !== undefined) {
      fields.push(`salesforce_updated = $${paramIndex}`);
      values.push(updates.salesforce_updated);
      paramIndex++;
    }

    if (updates.salesforce_updated_at !== undefined) {
      fields.push(`salesforce_updated_at = $${paramIndex}`);
      values.push(updates.salesforce_updated_at);
      paramIndex++;
    }

    if (updates.enrichment_status !== undefined) {
      fields.push(`enrichment_status = $${paramIndex}`);
      values.push(updates.enrichment_status);
      paramIndex++;
    }

    if (updates.error_message !== undefined) {
      fields.push(`error_message = $${paramIndex}`);
      values.push(updates.error_message);
      paramIndex++;
    }

    if (fields.length === 0) {
      return;
    }

    values.push(leadId, jobId);

    await query(
      `UPDATE lead_enrichments
       SET ${fields.join(', ')}
       WHERE lead_id = $${paramIndex} AND job_id = $${paramIndex + 1}`,
      values
    );
  }
}

