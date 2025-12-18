import jsforce, { Connection } from 'jsforce';
import { logger } from '../utils/logger';
import { EnrichmentData, FitScoreResult, WebsiteTechData } from '../types/lead';

export interface SalesforceConfig {
  loginUrl: string;
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
  securityToken: string;
}

export class SalesforceService {
  private connection: Connection | null = null;
  private config: SalesforceConfig;

  constructor(config: SalesforceConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    if (this.connection) {
      return;
    }

    try {
      this.connection = new jsforce.Connection({
        loginUrl: this.config.loginUrl,
        version: '58.0',
      });

      await this.connection.login(
        this.config.username,
        this.config.password + this.config.securityToken
      );

      logger.info('Salesforce connection established');
    } catch (error) {
      logger.error('Failed to connect to Salesforce', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private ensureConnected(): void {
    if (!this.connection) {
      throw new Error('Salesforce connection not established. Call connect() first.');
    }
  }

  private formatPixelsDetected(websiteTech?: WebsiteTechData): string {
    if (!websiteTech) {
      return '';
    }

    const pixels: string[] = [];
    if (websiteTech.has_meta_pixel) pixels.push('meta');
    if (websiteTech.has_ga4) pixels.push('ga4');
    if (websiteTech.has_google_ads_tag) pixels.push('google_ads');
    if (websiteTech.has_tiktok_pixel) pixels.push('tiktok');

    return pixels.join(',');
  }

  private formatMarketingTools(websiteTech?: WebsiteTechData): string {
    if (!websiteTech) {
      return '';
    }

    return websiteTech.marketing_tools_detected.join(',');
  }

  async updateLead(
    salesforceLeadId: string,
    enrichmentData: EnrichmentData,
    fitScore: FitScoreResult,
    sfAlignedFields?: Record<string, unknown>
  ): Promise<boolean> {
    try {
      await this.connect();
      this.ensureConnected();

      const websiteTech = enrichmentData.website_tech;

      // Build update data - only include fields that exist in Salesforce
      // The sfAlignedFields contain the properly mapped picklist values for existing SF custom fields
      const updateData: Record<string, unknown> = {};

      // Add Salesforce-aligned enrichment fields (these fields already exist in SF)
      if (sfAlignedFields) {
        // Only include non-null values to avoid overwriting with nulls
        Object.entries(sfAlignedFields).forEach(([key, value]) => {
          if (value !== null && value !== undefined) {
            updateData[key] = value;
          }
        });
      }

      // Add optional pixel/marketing tracking fields if they exist in SF schema
      if (websiteTech) {
        updateData.Pixels_Detected__c = this.formatPixelsDetected(websiteTech);
        updateData.Marketing_Tools__c = this.formatMarketingTools(websiteTech);
      }

      // Skip update if no fields to update
      if (Object.keys(updateData).length === 0) {
        logger.info('No fields to update in Salesforce', { leadId: salesforceLeadId });
        return true;
      }

      await this.connection!.sobject('Lead').update({
        Id: salesforceLeadId,
        ...updateData,
      });

      logger.info('Salesforce Lead updated successfully', {
        leadId: salesforceLeadId,
        fieldsUpdated: Object.keys(updateData),
      });

      return true;
    } catch (error) {
      logger.error('Failed to update Salesforce Lead', {
        error: error instanceof Error ? error.message : String(error),
        leadId: salesforceLeadId,
      });
      return false;
    }
  }

  async updateOpportunity(
    salesforceOppId: string,
    enrichmentData: EnrichmentData,
    fitScore: FitScoreResult
  ): Promise<boolean> {
    try {
      await this.connect();
      this.ensureConnected();

      const googlePlaces = enrichmentData.google_places;
      const clay = enrichmentData.clay;
      const websiteTech = enrichmentData.website_tech;

      const updateData: Record<string, unknown> = {
        Fit_Score__c: fitScore.fit_score,
        Fit_Score_Timestamp__c: new Date().toISOString(),
        Enrichment_Status__c: 'success',
      };

      // Add enrichment data fields
      if (googlePlaces?.gmb_review_count !== undefined) {
        updateData.Google_Reviews_Count__c = googlePlaces.gmb_review_count;
      }

      if (clay?.employee_estimate !== undefined) {
        updateData.Employee_Estimate__c = clay.employee_estimate;
      }

      if (clay?.years_in_business !== undefined) {
        updateData.Years_In_Business__c = clay.years_in_business;
      }

      if (websiteTech) {
        updateData.Has_Website__c = true;
        updateData.Pixels_Detected__c = this.formatPixelsDetected(websiteTech);
        updateData.Marketing_Tools__c = this.formatMarketingTools(websiteTech);
      } else {
        updateData.Has_Website__c = false;
      }

      // Add score breakdown as JSON string
      if (fitScore.score_breakdown) {
        updateData.Score_Breakdown__c = JSON.stringify(fitScore.score_breakdown);
      }

      await this.connection!.sobject('Opportunity').update({
        Id: salesforceOppId,
        ...updateData,
      });

      logger.info('Salesforce Opportunity updated successfully', {
        oppId: salesforceOppId,
        fitScore: fitScore.fit_score,
      });

      return true;
    } catch (error) {
      logger.error('Failed to update Salesforce Opportunity', {
        error: error instanceof Error ? error.message : String(error),
        oppId: salesforceOppId,
      });
      return false;
    }
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      await this.connection.logout();
      this.connection = null;
      logger.info('Salesforce connection closed');
    }
  }

  async query(soql: string): Promise<{ records: unknown[] }> {
    await this.connect();
    this.ensureConnected();

    const result = await this.connection!.query(soql);
    return { records: result.records };
  }
}

