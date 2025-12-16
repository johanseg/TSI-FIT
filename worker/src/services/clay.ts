import axios, { AxiosInstance } from 'axios';
import { logger } from '@tsi-fit-score/shared';
import { ClayData, LeadPayload } from '@tsi-fit-score/shared';
import { CircuitBreaker } from '../utils/circuitBreaker';
import { retryWithBackoff } from '../utils/retry';

const CLAY_API_BASE = 'https://api.clay.com/v1';

export class ClayService {
  private apiKey: string;
  private client: AxiosInstance;
  private circuitBreaker: CircuitBreaker;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('CLAY_API_KEY is required');
    }
    this.apiKey = apiKey;
    this.client = axios.create({
      baseURL: CLAY_API_BASE,
      timeout: 30000,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      resetTimeoutMs: 60000, // 60 seconds
    });
  }

  async enrichLead(leadData: LeadPayload): Promise<ClayData | null> {
    try {
      return await this.circuitBreaker.execute(async () => {
        return retryWithBackoff(
          async () => {
            // Clay API endpoint for enrichment
            // Note: Adjust endpoint and payload structure based on actual Clay API documentation
            const response = await this.client.post('/enrich', {
              business_name: leadData.business_name,
              website: leadData.website,
              phone: leadData.phone,
              email: leadData.email,
              city: leadData.city,
              state: leadData.state,
            });

            const data = response.data;

            // Extract enrichment data from Clay response
            // Adjust field mapping based on actual Clay API response structure
            const clayData: ClayData = {};

            if (data.employee_estimate !== undefined) {
              clayData.employee_estimate = data.employee_estimate;
            }

            if (data.revenue_estimate_range) {
              clayData.revenue_estimate_range = data.revenue_estimate_range;
            }

            if (data.year_founded !== undefined) {
              clayData.year_founded = data.year_founded;
              
              // Calculate years in business
              const currentYear = new Date().getFullYear();
              clayData.years_in_business = currentYear - data.year_founded;
            }

            if (data.industry) {
              clayData.industry = data.industry;
            }

            return Object.keys(clayData).length > 0 ? clayData : null;
          },
          { maxRetries: 3, initialDelayMs: 2000 },
          'clay-enrichment'
        );
      }, 'clay-service');
    } catch (error) {
      logger.error('Clay enrichment failed', {
        error: error instanceof Error ? error.message : String(error),
        businessName: leadData.business_name,
      });
      return null;
    }
  }
}

