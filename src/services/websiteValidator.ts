import axios, { AxiosError } from 'axios';
import { logger } from '../utils/logger';
import * as whois from 'whois';
import { promisify } from 'util';

const whoisLookup = promisify(whois.lookup);

export interface WebsiteValidationResult {
  url: string;
  exists: boolean;
  status_code?: number;
  final_url?: string; // After redirects
  redirected: boolean;
  response_time_ms?: number;
  error?: string;
  domain_age?: {
    created_date?: string;
    age_years?: number;
    age_days?: number;
    registrar?: string;
    updated_date?: string;
    expiry_date?: string;
  };
}

export class WebsiteValidatorService {
  private timeout: number;
  private maxRedirects: number;

  constructor(timeout: number = 10000, maxRedirects: number = 5) {
    this.timeout = timeout;
    this.maxRedirects = maxRedirects;
  }

  /**
   * Normalize website URL to proper format
   * Handles missing protocols, www variations, trailing slashes
   */
  private normalizeUrl(url: string): string[] {
    // Remove whitespace
    let cleaned = url.trim();

    // Remove trailing slash
    cleaned = cleaned.replace(/\/$/, '');

    // If no protocol, try both http and https
    if (!cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
      return [
        `https://${cleaned}`,
        `http://${cleaned}`,
        `https://www.${cleaned}`,
        `http://www.${cleaned}`,
      ];
    }

    // If protocol exists, return as-is and with/without www
    const variants: string[] = [cleaned];

    if (cleaned.includes('://www.')) {
      // Has www, add without www
      variants.push(cleaned.replace('://www.', '://'));
    } else if (cleaned.match(/^https?:\/\/[^\/]+/)) {
      // No www, add with www
      const withWww = cleaned.replace(/^(https?:\/\/)/, '$1www.');
      variants.push(withWww);
    }

    return variants;
  }

  /**
   * Extract domain from URL for WHOIS lookup
   */
  private extractDomain(url: string): string | null {
    try {
      const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
      let hostname = urlObj.hostname;

      // Remove www prefix
      hostname = hostname.replace(/^www\./, '');

      return hostname;
    } catch (error) {
      logger.error('Failed to extract domain from URL', { url, error });
      return null;
    }
  }

  /**
   * Parse WHOIS data to extract domain age information
   */
  private parseWhoisData(whoisData: string, domain: string): WebsiteValidationResult['domain_age'] {
    try {
      const lines = whoisData.split('\n');
      const result: WebsiteValidationResult['domain_age'] = {};

      // Patterns to match creation date (various formats)
      const creationPatterns = [
        /Creation Date:\s*(.+)/i,
        /Created:\s*(.+)/i,
        /Created On:\s*(.+)/i,
        /Registration Time:\s*(.+)/i,
        /Registered on:\s*(.+)/i,
        /Domain Registration Date:\s*(.+)/i,
      ];

      // Patterns to match updated date
      const updatePatterns = [
        /Updated Date:\s*(.+)/i,
        /Updated:\s*(.+)/i,
        /Modified:\s*(.+)/i,
        /Last Updated:\s*(.+)/i,
      ];

      // Patterns to match expiry date
      const expiryPatterns = [
        /Expir(?:y|ation) Date:\s*(.+)/i,
        /Expires:\s*(.+)/i,
        /Expires On:\s*(.+)/i,
        /Registry Expiry Date:\s*(.+)/i,
      ];

      // Patterns to match registrar
      const registrarPatterns = [
        /Registrar:\s*(.+)/i,
        /Sponsoring Registrar:\s*(.+)/i,
      ];

      // Extract dates and registrar
      for (const line of lines) {
        // Creation date
        if (!result.created_date) {
          for (const pattern of creationPatterns) {
            const match = line.match(pattern);
            if (match) {
              result.created_date = match[1].trim();
              break;
            }
          }
        }

        // Updated date
        if (!result.updated_date) {
          for (const pattern of updatePatterns) {
            const match = line.match(pattern);
            if (match) {
              result.updated_date = match[1].trim();
              break;
            }
          }
        }

        // Expiry date
        if (!result.expiry_date) {
          for (const pattern of expiryPatterns) {
            const match = line.match(pattern);
            if (match) {
              result.expiry_date = match[1].trim();
              break;
            }
          }
        }

        // Registrar
        if (!result.registrar) {
          for (const pattern of registrarPatterns) {
            const match = line.match(pattern);
            if (match) {
              result.registrar = match[1].trim();
              break;
            }
          }
        }
      }

      // Calculate age from creation date
      if (result.created_date) {
        try {
          const createdDate = new Date(result.created_date);
          if (!isNaN(createdDate.getTime())) {
            const now = new Date();
            const ageMs = now.getTime() - createdDate.getTime();
            result.age_days = Math.floor(ageMs / (1000 * 60 * 60 * 24));
            result.age_years = Math.floor(result.age_days / 365.25);
          }
        } catch (error) {
          logger.warn('Failed to parse creation date', { created_date: result.created_date });
        }
      }

      return Object.keys(result).length > 0 ? result : undefined;
    } catch (error) {
      logger.error('Failed to parse WHOIS data', { domain, error });
      return undefined;
    }
  }

  /**
   * Get domain age using WHOIS lookup
   */
  async getDomainAge(url: string): Promise<WebsiteValidationResult['domain_age']> {
    const domain = this.extractDomain(url);
    if (!domain) {
      logger.warn('Could not extract domain from URL', { url });
      return undefined;
    }

    try {
      logger.debug('Performing WHOIS lookup', { domain });

      const whoisData = await whoisLookup(domain);

      if (!whoisData || typeof whoisData !== 'string') {
        logger.warn('WHOIS lookup returned no data or invalid data', { domain, type: typeof whoisData });
        return undefined;
      }

      const parsed = this.parseWhoisData(whoisData as string, domain);

      if (parsed) {
        logger.info('Domain age retrieved successfully', {
          domain,
          age_years: parsed.age_years,
          created_date: parsed.created_date
        });
      }

      return parsed;
    } catch (error) {
      logger.warn('WHOIS lookup failed', {
        domain,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return undefined;
    }
  }

  /**
   * Validate if a website URL exists and is accessible
   * Tries multiple URL variations (http/https, www/no-www)
   */
  async validateUrl(url: string): Promise<WebsiteValidationResult> {
    const startTime = Date.now();
    const urlVariants = this.normalizeUrl(url);

    logger.debug('Validating website URL', { url, variants: urlVariants });

    // Try each variant until one succeeds
    for (const variant of urlVariants) {
      try {
        const response = await axios.head(variant, {
          timeout: this.timeout,
          maxRedirects: this.maxRedirects,
          validateStatus: (status) => status < 500, // Accept any status < 500
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; TSI-FitScore/1.0; +https://tsi-fitscore.com)',
          },
        });

        const responseTime = Date.now() - startTime;
        const finalUrl = response.request?.res?.responseUrl || variant;
        const redirected = finalUrl !== variant;

        // Check if status code indicates success (2xx or 3xx)
        const exists = response.status >= 200 && response.status < 400;

        if (exists) {
          logger.info('Website validation successful', {
            url,
            variant,
            status_code: response.status,
            response_time_ms: responseTime,
            redirected,
          });

          return {
            url: variant,
            exists: true,
            status_code: response.status,
            final_url: finalUrl,
            redirected,
            response_time_ms: responseTime,
          };
        }
      } catch (error) {
        const axiosError = error as AxiosError;

        // If we get a response but it's an error, that still means the domain exists
        if (axiosError.response) {
          const responseTime = Date.now() - startTime;

          logger.warn('Website exists but returned error status', {
            url,
            variant,
            status_code: axiosError.response.status,
          });

          // 4xx errors mean the site exists but page not found or forbidden
          // We still consider this as "exists" for validation purposes
          if (axiosError.response.status >= 400 && axiosError.response.status < 500) {
            return {
              url: variant,
              exists: true,
              status_code: axiosError.response.status,
              final_url: variant,
              redirected: false,
              response_time_ms: responseTime,
              error: `HTTP ${axiosError.response.status}`,
            };
          }
        }

        // Continue to next variant
        logger.debug('URL variant failed', { variant, error: axiosError.message });
      }
    }

    // All variants failed
    const responseTime = Date.now() - startTime;

    logger.warn('Website validation failed - all variants exhausted', {
      url,
      tried_variants: urlVariants,
      response_time_ms: responseTime,
    });

    return {
      url,
      exists: false,
      response_time_ms: responseTime,
      redirected: false,
      error: 'All URL variants failed to respond',
    };
  }

  /**
   * Comprehensive website validation including existence check and domain age
   */
  async validateWebsite(url: string, includeDomainAge: boolean = true): Promise<WebsiteValidationResult> {
    // First, validate URL exists
    const validationResult = await this.validateUrl(url);

    // If URL exists and domain age is requested, get domain age
    if (validationResult.exists && includeDomainAge) {
      const domainAge = await this.getDomainAge(validationResult.final_url || url);
      if (domainAge) {
        validationResult.domain_age = domainAge;
      }
    }

    return validationResult;
  }
}

/**
 * Calculate domain age score component
 *
 * @param domainAgeYears - Age of domain in years
 * @returns Score contribution (0-5 points)
 */
export function calculateDomainAgeScore(domainAgeYears: number | undefined): number {
  if (domainAgeYears === undefined || domainAgeYears === null) {
    return 0;
  }

  // Domain age scoring:
  // - <1 year: 0 points (very new, higher risk)
  // - 1-2 years: 1 point (established presence)
  // - 3-5 years: 2 points (proven track record)
  // - 6-10 years: 3 points (mature business)
  // - 11-15 years: 4 points (well-established)
  // - 16+ years: 5 points (very mature, trusted)

  if (domainAgeYears < 1) return 0;
  if (domainAgeYears < 3) return 1;
  if (domainAgeYears < 6) return 2;
  if (domainAgeYears < 11) return 3;
  if (domainAgeYears < 16) return 4;
  return 5;
}
