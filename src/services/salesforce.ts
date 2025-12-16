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
        Fit_Tier__c: fitScore.fit_tier,
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

      await this.connection!.sobject('Lead').update({
        Id: salesforceLeadId,
        ...updateData,
      });

      logger.info('Salesforce Lead updated successfully', {
        leadId: salesforceLeadId,
        fitScore: fitScore.fit_score,
        fitTier: fitScore.fit_tier,
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
        Fit_Tier__c: fitScore.fit_tier,
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
        fitTier: fitScore.fit_tier,
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
}

