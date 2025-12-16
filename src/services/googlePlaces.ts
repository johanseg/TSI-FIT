import axios, { AxiosInstance } from 'axios';
import { logger } from '../utils/logger';
import { GooglePlacesData } from '../types/lead';
import { retryWithBackoff, sleep } from '../utils/retry';

const GOOGLE_PLACES_API_BASE = 'https://maps.googleapis.com/maps/api/place';

export class GooglePlacesService {
  private apiKey: string;
  private client: AxiosInstance;
  private lastRequestTime: number = 0;
  private minRequestInterval: number = 1000; // 1 request per second

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('GOOGLE_PLACES_API_KEY is required');
    }
    this.apiKey = apiKey;
    this.client = axios.create({
      baseURL: GOOGLE_PLACES_API_BASE,
      timeout: 10000,
    });
  }

  private async rateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.minRequestInterval) {
      const waitTime = this.minRequestInterval - timeSinceLastRequest;
      await sleep(waitTime);
    }
    
    this.lastRequestTime = Date.now();
  }

  async findPlace(
    businessName: string,
    phone?: string,
    city?: string,
    state?: string
  ): Promise<string | null> {
    await this.rateLimit();

    // Build query string
    let query = businessName;
    if (city && state) {
      query += ` ${city}, ${state}`;
    } else if (phone) {
      query += ` ${phone}`;
    }

    return retryWithBackoff(
      async () => {
        const response = await this.client.get('/findplacefromtext/json', {
          params: {
            input: query,
            inputtype: 'textquery',
            fields: 'place_id',
            key: this.apiKey,
          },
        });

        if (response.data.status === 'OK' && response.data.candidates?.length > 0) {
          return response.data.candidates[0].place_id;
        }

        if (response.data.status === 'ZERO_RESULTS') {
          logger.warn('No place found for query', { query });
          return null;
        }

        throw new Error(`Google Places API error: ${response.data.status}`);
      },
      { maxRetries: 3, initialDelayMs: 1000 },
      'google-places-find'
    );
  }

  async getPlaceDetails(placeId: string): Promise<GooglePlacesData | null> {
    await this.rateLimit();

    return retryWithBackoff(
      async () => {
        const response = await this.client.get('/details/json', {
          params: {
            place_id: placeId,
            fields: 'name,types,rating,user_ratings_total,formatted_address,business_status',
            key: this.apiKey,
          },
        });

        if (response.data.status !== 'OK') {
          if (response.data.status === 'NOT_FOUND') {
            logger.warn('Place not found', { placeId });
            return null;
          }
          throw new Error(`Google Places API error: ${response.data.status}`);
        }

        const result = response.data.result;

        return {
          place_id: placeId,
          gmb_name: result.name || undefined,
          gmb_primary_category: result.types?.[0] || undefined,
          gmb_rating: result.rating || undefined,
          gmb_review_count: result.user_ratings_total || undefined,
          gmb_address: result.formatted_address || undefined,
          gmb_is_operational: result.business_status === 'OPERATIONAL',
        };
      },
      { maxRetries: 3, initialDelayMs: 1000 },
      'google-places-details'
    );
  }

  async enrich(
    businessName: string,
    phone?: string,
    city?: string,
    state?: string
  ): Promise<GooglePlacesData | null> {
    try {
      const placeId = await this.findPlace(businessName, phone, city, state);
      
      if (!placeId) {
        return null;
      }

      return await this.getPlaceDetails(placeId);
    } catch (error) {
      logger.error('Google Places enrichment failed', {
        error: error instanceof Error ? error.message : String(error),
        businessName,
      });
      return null;
    }
  }
}

