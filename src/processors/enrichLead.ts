import { Job } from 'bullmq';
import { Pool } from 'pg';
import { logger } from '../utils/logger';
import {
  LeadPayload,
  EnrichmentData,
  LeadEnrichmentRecord,
  EnrichmentJobData,
} from '../types/lead';
import { GooglePlacesService } from '../services/googlePlaces';
import { ClayService } from '../services/clay';
import { WebsiteTechService } from '../services/websiteTech';
import { calculateFitScore } from '../services/fitScore';
import { SalesforceService } from '../services/salesforce';

export class EnrichmentProcessor {
  private pool: Pool;
  private googlePlaces: GooglePlacesService;
  private clay: ClayService;
  private websiteTech: WebsiteTechService;
  private salesforce: SalesforceService;

  constructor(
    pool: Pool,
    googlePlaces: GooglePlacesService,
    clay: ClayService,
    websiteTech: WebsiteTechService,
    salesforce: SalesforceService
  ) {
    this.pool = pool;
    this.googlePlaces = googlePlaces;
    this.clay = clay;
    this.websiteTech = websiteTech;
    this.salesforce = salesforce;
  }

  async process(job: Job<EnrichmentJobData>): Promise<void> {
    const { leadRowId, leadPayload } = job.data;
    const jobId = job.id!;

    logger.info('Starting lead enrichment', {
      jobId,
      leadRowId,
      businessName: leadPayload.business_name,
    });

    const enrichmentData: EnrichmentData = {};
    let enrichmentStatus: 'pending' | 'success' | 'partial' | 'failed' = 'pending';
    let errorMessage: string | undefined;

    try {
      // Create initial enrichment record
      await this.createEnrichmentRecord(leadRowId, jobId);

      // Step 1: Google Places enrichment
      try {
        logger.info('Enriching with Google Places', { jobId, leadRowId });
        const googlePlacesData = await this.googlePlaces.enrich(
          leadPayload.business_name,
          leadPayload.phone,
          leadPayload.city,
          leadPayload.state
        );
        if (googlePlacesData) {
          enrichmentData.google_places = googlePlacesData;
          await this.updateEnrichmentRecord(leadRowId, jobId, {
            google_places_data: googlePlacesData,
          });
        }
      } catch (error) {
        logger.warn('Google Places enrichment failed', {
          jobId,
          leadRowId,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      // Step 2: Website tech detection
      if (leadPayload.website) {
        try {
          logger.info('Detecting website tech', { jobId, leadRowId, website: leadPayload.website });
          const websiteTechData = await this.websiteTech.detectTech(leadPayload.website);
          enrichmentData.website_tech = websiteTechData;
          await this.updateEnrichmentRecord(leadRowId, jobId, {
            website_tech_data: websiteTechData,
          });
        } catch (error) {
          logger.warn('Website tech detection failed', {
            jobId,
            leadRowId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // Step 3: Clay enrichment
      try {
        logger.info('Enriching with Clay', { jobId, leadRowId });
        const clayData = await this.clay.enrichLead(leadPayload);
        if (clayData) {
          enrichmentData.clay = clayData;
          await this.updateEnrichmentRecord(leadRowId, jobId, {
            clay_data: clayData,
          });
        }
      } catch (error) {
        logger.warn('Clay enrichment failed', {
          jobId,
          leadRowId,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      // Step 4: Calculate Fit Score
      let fitScoreResult;
      try {
        logger.info('Calculating Fit Score', { jobId, leadRowId });
        fitScoreResult = calculateFitScore(enrichmentData);

        await this.updateEnrichmentRecord(leadRowId, jobId, {
          fit_score: fitScoreResult.fit_score,
          fit_tier: fitScoreResult.fit_tier,
          score_breakdown: fitScoreResult.score_breakdown,
        });
      } catch (error) {
        logger.error('Fit Score calculation failed', {
          jobId,
          leadRowId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }

      // Step 5: Update Salesforce
      if (leadPayload.salesforce_lead_id) {
        try {
          logger.info('Updating Salesforce Lead', {
            jobId,
            leadRowId,
            salesforceLeadId: leadPayload.salesforce_lead_id,
          });
          const updated = await this.salesforce.updateLead(
            leadPayload.salesforce_lead_id,
            enrichmentData,
            fitScoreResult
          );

          if (updated) {
            await this.updateEnrichmentRecord(leadRowId, jobId, {
              salesforce_updated: true,
              salesforce_updated_at: new Date(),
            });
          }
        } catch (error) {
          logger.error('Salesforce update failed', {
            jobId,
            leadRowId,
            error: error instanceof Error ? error.message : String(error),
          });
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

      await this.updateEnrichmentRecord(leadRowId, jobId, {
        enrichment_status: enrichmentStatus,
        error_message: errorMessage,
      });

      logger.info('Lead enrichment completed', {
        jobId,
        leadRowId,
        status: enrichmentStatus,
        fitScore: fitScoreResult?.fit_score,
      });
    } catch (error) {
      enrichmentStatus = 'failed';
      errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('Lead enrichment failed', {
        jobId,
        leadRowId,
        error: errorMessage,
      });

      await this.updateEnrichmentRecord(leadRowId, jobId, {
        enrichment_status: enrichmentStatus,
        error_message: errorMessage,
      });

      throw error;
    } finally {
      await this.websiteTech.close();
    }
  }

  private async createEnrichmentRecord(
    leadId: string,
    jobId: string
  ): Promise<void> {
    await this.pool.query(
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

    await this.pool.query(
      `UPDATE lead_enrichments
       SET ${fields.join(', ')}
       WHERE lead_id = $${paramIndex} AND job_id = $${paramIndex + 1}`,
      values
    );
  }
}
