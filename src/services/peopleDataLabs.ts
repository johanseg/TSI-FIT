import axios, { AxiosInstance } from 'axios';
import { logger } from '../utils/logger';
import { PDLCompanyData, LeadPayload } from '../types/lead';
import { CircuitBreaker } from '../utils/circuitBreaker';
import { retryWithBackoff } from '../utils/retry';

const PDL_API_BASE = 'https://api.peopledatalabs.com/v5';

interface PDLCompanyResponse {
  status: number;
  likelihood: number;
  // Company fields from PDL Company Schema
  name?: string;
  display_name?: string;
  id?: string;
  founded?: number;
  employee_count?: number;
  employee_count_by_country?: Record<string, number>;
  size?: string; // e.g., "1-10", "11-50", "51-200", etc.
  industry?: string;
  industry_v2?: string;
  naics?: Array<{
    sector?: string;
    sub_sector?: string;
    industry_group?: string;
    naics_industry?: string;
    national_industry?: string;
    code?: string;
  }>;
  sic?: Array<{
    major_group?: string;
    industry_group?: string;
    industry_sector?: string;
    code?: string;
  }>;
  inferred_revenue?: string; // e.g., "$1M-$10M", "$10M-$50M"
  location?: {
    name?: string;
    locality?: string;
    region?: string;
    metro?: string;
    country?: string;
    continent?: string;
    street_address?: string;
    address_line_2?: string;
    postal_code?: string;
    geo?: string;
  };
  website?: string;
}

export class PeopleDataLabsService {
  private apiKey: string;
  private client: AxiosInstance;
  private circuitBreaker: CircuitBreaker;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('PDL_API_KEY is required');
    }
    this.apiKey = apiKey;
    this.client = axios.create({
      baseURL: PDL_API_BASE,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      resetTimeoutMs: 60000, // 60 seconds
    });
  }

  async enrichCompany(leadData: LeadPayload): Promise<PDLCompanyData | null> {
    try {
      return await this.circuitBreaker.execute(async () => {
        return retryWithBackoff(
          async () => {
            // Build query params - PDL uses GET with query params
            const params: Record<string, string> = {
              api_key: this.apiKey,
            };

            // PDL requires at least one of: name, website, profile, ticker, pdl_id
            // Prefer website for most accurate matching
            if (leadData.website) {
              // Extract domain from URL
              const domain = this.extractDomain(leadData.website);
              if (domain) {
                params.website = domain;
              }
            }

            // Also include name for better matching
            if (leadData.business_name) {
              params.name = leadData.business_name;
            }

            // If we don't have enough identifiers, return null
            if (!params.website && !params.name) {
              logger.warn('PDL enrichment skipped - no website or business name', {
                businessName: leadData.business_name,
              });
              return null;
            }

            logger.debug('PDL Company Enrichment request', {
              params: { ...params, api_key: '***' },
            });

            const response = await this.client.get<PDLCompanyResponse>('/company/enrich', {
              params,
            });

            const data = response.data;

            // Check if we got a match
            if (data.status !== 200) {
              logger.info('PDL no match found', {
                status: data.status,
                businessName: leadData.business_name,
              });
              return null;
            }

            // Map PDL response to our data structure
            const pdlData: PDLCompanyData = {
              pdl_id: data.id,
              likelihood: data.likelihood,
            };

            // Founded year → years in business
            if (data.founded) {
              pdlData.year_founded = data.founded;
              const currentYear = new Date().getFullYear();
              pdlData.years_in_business = currentYear - data.founded;
            }

            // Employee count (exact number from PDL's profile analysis)
            if (data.employee_count !== undefined) {
              pdlData.employee_count = data.employee_count;
            }

            // Size range (self-reported, e.g., "11-50", "51-200")
            if (data.size) {
              pdlData.size_range = data.size;
            }

            // Industry
            if (data.industry) {
              pdlData.industry = data.industry;
            }
            if (data.industry_v2) {
              pdlData.industry_v2 = data.industry_v2;
            }

            // NAICS codes
            if (data.naics && data.naics.length > 0) {
              pdlData.naics_codes = data.naics.map(n => ({
                code: n.code,
                sector: n.sector,
                industry: n.naics_industry,
              }));
            }

            // Inferred revenue (e.g., "$1M-$10M")
            if (data.inferred_revenue) {
              pdlData.inferred_revenue = data.inferred_revenue;
            }

            // Location / HQ validation
            if (data.location) {
              pdlData.headquarters = {
                locality: data.location.locality,
                region: data.location.region,
                country: data.location.country,
                postal_code: data.location.postal_code,
              };
            }

            // Website confirmation
            if (data.website) {
              pdlData.website_confirmed = data.website;
            }

            logger.info('PDL enrichment successful', {
              businessName: leadData.business_name,
              likelihood: data.likelihood,
              employeeCount: pdlData.employee_count,
              yearsInBusiness: pdlData.years_in_business,
              industry: pdlData.industry,
            });

            return Object.keys(pdlData).length > 2 ? pdlData : null; // Need more than just id and likelihood
          },
          { maxRetries: 3, initialDelayMs: 2000 },
          'pdl-company-enrichment'
        );
      }, 'pdl-service');
    } catch (error) {
      // Handle 404 (no match) gracefully - not an error
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        logger.info('PDL no company match found', {
          businessName: leadData.business_name,
          website: leadData.website,
        });
        return null;
      }

      logger.error('PDL company enrichment failed', {
        error: error instanceof Error ? error.message : String(error),
        businessName: leadData.business_name,
      });
      return null;
    }
  }

  /**
   * Extract clean domain from URL
   */
  private extractDomain(url: string): string | null {
    try {
      // Add protocol if missing
      let urlWithProtocol = url;
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        urlWithProtocol = `https://${url}`;
      }

      const parsed = new URL(urlWithProtocol);
      // Return hostname without www
      return parsed.hostname.replace(/^www\./, '');
    } catch {
      // If URL parsing fails, try to extract domain directly
      const match = url.match(/(?:https?:\/\/)?(?:www\.)?([^\/\s]+)/);
      return match ? match[1] : null;
    }
  }

  /**
   * Parse employee count from size range string
   * e.g., "11-50" → returns midpoint 30
   */
  static parseEmployeeCountFromSize(sizeRange: string | undefined): number | null {
    if (!sizeRange) return null;

    // Common PDL size ranges: "1-10", "11-50", "51-200", "201-500", "501-1000", "1001-5000", "5001-10000", "10001+"
    const match = sizeRange.match(/(\d+)-?(\d+)?/);
    if (!match) return null;

    const low = parseInt(match[1], 10);
    const high = match[2] ? parseInt(match[2], 10) : low * 2; // For "10001+" type ranges

    // Return midpoint
    return Math.round((low + high) / 2);
  }

  /**
   * Parse revenue range to get approximate value
   * e.g., "$10M-$50M" → returns { min: 10000000, max: 50000000 }
   */
  static parseRevenueRange(revenueStr: string | undefined): { min: number; max: number } | null {
    if (!revenueStr) return null;

    // Extract numbers and multipliers
    const matches = revenueStr.match(/\$?([\d.]+)([MBK])?/gi);
    if (!matches || matches.length < 1) return null;

    const parseValue = (str: string): number => {
      const match = str.match(/([\d.]+)([MBK])?/i);
      if (!match) return 0;

      const num = parseFloat(match[1]);
      const multiplier = match[2]?.toUpperCase();

      switch (multiplier) {
        case 'K': return num * 1000;
        case 'M': return num * 1000000;
        case 'B': return num * 1000000000;
        default: return num;
      }
    };

    const values = matches.map(parseValue).filter(v => v > 0);
    if (values.length === 0) return null;

    return {
      min: Math.min(...values),
      max: Math.max(...values),
    };
  }
}
