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

// Common Salesforce error codes and their meanings
const SF_ERROR_CODES: Record<string, string> = {
  CANNOT_UPDATE_CONVERTED_LEAD: 'Lead has been converted to Account/Contact',
  ENTITY_IS_DELETED: 'Record has been deleted',
  INSUFFICIENT_ACCESS_ON_CROSS_REFERENCE_ENTITY: 'Insufficient permissions to update related record',
  INVALID_CROSS_REFERENCE_KEY: 'Invalid ID or record not found',
  INVALID_FIELD: 'Field does not exist on object',
  INVALID_FIELD_FOR_INSERT_UPDATE: 'Field is not writable',
  REQUIRED_FIELD_MISSING: 'Required field is missing',
  FIELD_CUSTOM_VALIDATION_EXCEPTION: 'Custom validation rule failed',
  DUPLICATE_VALUE: 'Duplicate value for unique field',
  STRING_TOO_LONG: 'Value exceeds field length',
  INVALID_OR_NULL_FOR_RESTRICTED_PICKLIST: 'Invalid picklist value',
};

export interface SalesforceUpdateResult {
  success: boolean;
  leadId: string;
  error?: {
    code: string;
    message: string;
    isRetryable: boolean;
  };
  fieldsUpdated?: string[];
}

export class SalesforceService {
  private connection: Connection | null = null;
  private config: SalesforceConfig;
  private connectionAttempts: number = 0;
  private maxConnectionAttempts: number = 3;

  constructor(config: SalesforceConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    if (this.connection) {
      // Check if session is still valid
      try {
        await this.connection.identity();
        return;
      } catch {
        logger.warn('Salesforce session expired, reconnecting...');
        this.connection = null;
      }
    }

    this.connectionAttempts++;

    if (this.connectionAttempts > this.maxConnectionAttempts) {
      const error = new Error(`Salesforce connection failed after ${this.maxConnectionAttempts} attempts`);
      logger.error('Salesforce connection attempts exhausted', {
        attempts: this.connectionAttempts,
        loginUrl: this.config.loginUrl,
        username: this.config.username,
      });
      throw error;
    }

    try {
      logger.info('Connecting to Salesforce', {
        loginUrl: this.config.loginUrl,
        username: this.config.username,
        attempt: this.connectionAttempts,
      });

      this.connection = new jsforce.Connection({
        loginUrl: this.config.loginUrl,
        version: '58.0',
      });

      const loginResult = await this.connection.login(
        this.config.username,
        this.config.password + this.config.securityToken
      );

      logger.info('Salesforce connection established', {
        userId: loginResult.id,
        organizationId: loginResult.organizationId,
        instanceUrl: this.connection.instanceUrl,
      });

      // Reset connection attempts on success
      this.connectionAttempts = 0;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('Failed to connect to Salesforce', {
        error: errorMessage,
        loginUrl: this.config.loginUrl,
        username: this.config.username,
        attempt: this.connectionAttempts,
      });

      // Check for specific authentication errors
      if (errorMessage.includes('INVALID_LOGIN')) {
        logger.error('Salesforce authentication failed - check credentials', {
          hint: 'Verify SFDC_USERNAME, SFDC_PASSWORD, and SFDC_SECURITY_TOKEN',
        });
      } else if (errorMessage.includes('LOGIN_MUST_USE_SECURITY_TOKEN')) {
        logger.error('Salesforce security token required', {
          hint: 'Add SFDC_SECURITY_TOKEN to your configuration',
        });
      }

      this.connection = null;
      throw error;
    }
  }

  private ensureConnected(): void {
    if (!this.connection) {
      throw new Error('Salesforce connection not established. Call connect() first.');
    }
  }

  /**
   * Parse Salesforce error to extract meaningful information
   */
  private parseError(error: unknown): { code: string; message: string; isRetryable: boolean } {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Check for known error patterns
    for (const [code, description] of Object.entries(SF_ERROR_CODES)) {
      if (errorMessage.toUpperCase().includes(code) || errorMessage.includes(code)) {
        return {
          code,
          message: `${description}: ${errorMessage}`,
          isRetryable: false,
        };
      }
    }

    // Check for converted lead error (common pattern)
    if (errorMessage.toLowerCase().includes('converted lead')) {
      return {
        code: 'CANNOT_UPDATE_CONVERTED_LEAD',
        message: 'Lead has been converted and cannot be updated',
        isRetryable: false,
      };
    }

    // Check for session/connection errors (retryable)
    if (
      errorMessage.includes('INVALID_SESSION_ID') ||
      errorMessage.includes('Session expired') ||
      errorMessage.includes('ECONNRESET') ||
      errorMessage.includes('ETIMEDOUT')
    ) {
      return {
        code: 'SESSION_ERROR',
        message: errorMessage,
        isRetryable: true,
      };
    }

    // Default unknown error
    return {
      code: 'UNKNOWN_ERROR',
      message: errorMessage,
      isRetryable: false,
    };
  }

  /**
   * Verify lead exists and is not converted before attempting update
   */
  async verifyLead(leadId: string): Promise<{ exists: boolean; isConverted: boolean; error?: string }> {
    try {
      await this.connect();
      this.ensureConnected();

      const result = await this.connection!.query(
        `SELECT Id, IsConverted, ConvertedAccountId FROM Lead WHERE Id = '${leadId}' LIMIT 1`
      );

      if (result.records.length === 0) {
        return { exists: false, isConverted: false, error: 'Lead not found' };
      }

      const lead = result.records[0] as { IsConverted: boolean; ConvertedAccountId?: string };

      if (lead.IsConverted) {
        logger.warn('Lead is converted', {
          leadId,
          convertedAccountId: lead.ConvertedAccountId,
        });
        return { exists: true, isConverted: true, error: 'Lead has been converted' };
      }

      return { exists: true, isConverted: false };
    } catch (error) {
      const parsed = this.parseError(error);
      return { exists: false, isConverted: false, error: parsed.message };
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
  ): Promise<SalesforceUpdateResult> {
    const startTime = Date.now();

    try {
      await this.connect();
      this.ensureConnected();

      // Build update data - only include fields that exist in Salesforce
      const updateData: Record<string, unknown> = {};

      // Add Salesforce-aligned enrichment fields
      if (sfAlignedFields) {
        Object.entries(sfAlignedFields).forEach(([key, value]) => {
          if (value !== null && value !== undefined) {
            updateData[key] = value;
          }
        });
      }

      // Skip update if no fields to update
      if (Object.keys(updateData).length === 0) {
        logger.info('No fields to update in Salesforce', {
          leadId: salesforceLeadId,
          reason: 'All mapped fields are null/undefined',
        });
        return {
          success: true,
          leadId: salesforceLeadId,
          fieldsUpdated: [],
        };
      }

      // Log the update attempt with field details
      logger.info('Attempting Salesforce Lead update', {
        leadId: salesforceLeadId,
        fieldCount: Object.keys(updateData).length,
        fields: Object.keys(updateData),
        fitScore: updateData.Fit_Score__c,
        hasGMB: updateData.Has_GMB__c,
      });

      const result = await this.connection!.sobject('Lead').update({
        Id: salesforceLeadId,
        ...updateData,
      });

      const duration = Date.now() - startTime;

      // jsforce returns an object with success: boolean and errors array
      const updateResult = result as {
        success: boolean;
        id?: string;
        errors?: Array<{ message: string; statusCode: string; fields?: string[] }>;
      };

      if (!updateResult.success) {
        const errorDetails = updateResult.errors?.[0];
        const errorCode = errorDetails?.statusCode || 'UNKNOWN';
        const errorMessage = errorDetails?.message || 'Unknown error';
        const affectedFields = errorDetails?.fields || [];

        logger.error('Salesforce Lead update failed', {
          leadId: salesforceLeadId,
          errorCode,
          errorMessage,
          affectedFields,
          attemptedFields: Object.keys(updateData),
          duration,
        });

        return {
          success: false,
          leadId: salesforceLeadId,
          error: {
            code: errorCode,
            message: SF_ERROR_CODES[errorCode] || errorMessage,
            isRetryable: false,
          },
        };
      }

      logger.info('Salesforce Lead updated successfully', {
        leadId: salesforceLeadId,
        fieldsUpdated: Object.keys(updateData),
        fitScore: updateData.Fit_Score__c,
        duration,
      });

      return {
        success: true,
        leadId: salesforceLeadId,
        fieldsUpdated: Object.keys(updateData),
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const parsed = this.parseError(error);

      logger.error('Salesforce Lead update exception', {
        leadId: salesforceLeadId,
        errorCode: parsed.code,
        errorMessage: parsed.message,
        isRetryable: parsed.isRetryable,
        duration,
      });

      // If retryable and we haven't exhausted retries, try reconnecting
      if (parsed.isRetryable) {
        logger.info('Attempting to reconnect and retry Salesforce update', {
          leadId: salesforceLeadId,
        });

        this.connection = null;

        try {
          await this.connect();
          // Recursive retry (only once)
          return this.updateLead(salesforceLeadId, enrichmentData, fitScore, sfAlignedFields);
        } catch (retryError) {
          logger.error('Salesforce retry failed', {
            leadId: salesforceLeadId,
            error: retryError instanceof Error ? retryError.message : String(retryError),
          });
        }
      }

      return {
        success: false,
        leadId: salesforceLeadId,
        error: parsed,
      };
    }
  }

  async updateOpportunity(
    salesforceOppId: string,
    enrichmentData: EnrichmentData,
    fitScore: FitScoreResult
  ): Promise<boolean> {
    const startTime = Date.now();

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

      logger.info('Attempting Salesforce Opportunity update', {
        oppId: salesforceOppId,
        fieldCount: Object.keys(updateData).length,
        fitScore: fitScore.fit_score,
      });

      const result = await this.connection!.sobject('Opportunity').update({
        Id: salesforceOppId,
        ...updateData,
      });

      const duration = Date.now() - startTime;

      const updateResult = result as {
        success: boolean;
        errors?: Array<{ message: string; statusCode: string }>;
      };

      if (!updateResult.success) {
        const errorDetails = updateResult.errors?.[0];
        logger.error('Salesforce Opportunity update failed', {
          oppId: salesforceOppId,
          errorCode: errorDetails?.statusCode,
          errorMessage: errorDetails?.message,
          duration,
        });
        return false;
      }

      logger.info('Salesforce Opportunity updated successfully', {
        oppId: salesforceOppId,
        fitScore: fitScore.fit_score,
        fieldsUpdated: Object.keys(updateData),
        duration,
      });

      return true;
    } catch (error) {
      const duration = Date.now() - startTime;
      const parsed = this.parseError(error);

      logger.error('Salesforce Opportunity update exception', {
        oppId: salesforceOppId,
        errorCode: parsed.code,
        errorMessage: parsed.message,
        duration,
      });

      return false;
    }
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      try {
        await this.connection.logout();
        logger.info('Salesforce connection closed gracefully');
      } catch (error) {
        logger.warn('Error during Salesforce disconnect', {
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        this.connection = null;
      }
    }
  }

  async query(soql: string): Promise<{ records: unknown[] }> {
    const startTime = Date.now();

    try {
      await this.connect();
      this.ensureConnected();

      logger.debug('Executing Salesforce query', {
        queryPreview: soql.substring(0, 100) + (soql.length > 100 ? '...' : ''),
      });

      const result = await this.connection!.query(soql);
      const duration = Date.now() - startTime;

      logger.debug('Salesforce query completed', {
        recordCount: result.records.length,
        totalSize: result.totalSize,
        duration,
      });

      return { records: result.records };
    } catch (error) {
      const duration = Date.now() - startTime;
      const parsed = this.parseError(error);

      logger.error('Salesforce query failed', {
        errorCode: parsed.code,
        errorMessage: parsed.message,
        queryPreview: soql.substring(0, 100),
        duration,
      });

      throw error;
    }
  }

  /**
   * Get connection status for health checks
   */
  getConnectionStatus(): { connected: boolean; instanceUrl?: string } {
    return {
      connected: this.connection !== null,
      instanceUrl: this.connection?.instanceUrl,
    };
  }
}
