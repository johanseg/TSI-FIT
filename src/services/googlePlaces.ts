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
    state?: string,
    website?: string
  ): Promise<string | null> {
    await this.rateLimit();

    // Strategy 1: Try business name with location
    let query = businessName;
    if (city && state) {
      query += ` ${city}, ${state}`;
    }

    let placeId = await this.searchForPlace(query);

    // Strategy 2: If no result, try with phone number
    if (!placeId && phone) {
      await this.rateLimit();
      placeId = await this.searchForPlace(`${businessName} ${phone}`);
    }

    // Strategy 3: If still no result and we have a website, try extracting domain
    if (!placeId && website) {
      await this.rateLimit();
      try {
        const domain = new URL(website).hostname.replace('www.', '');
        placeId = await this.searchForPlace(domain);
      } catch {
        // Invalid URL, skip this strategy
      }
    }

    return placeId;
  }

  private async searchForPlace(query: string): Promise<string | null> {
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
          logger.info('No place found for query', { query });
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
            fields: 'name,types,rating,user_ratings_total,formatted_address,business_status,website,formatted_phone_number,address_components',
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

        // Parse address components to extract city, state, zip
        let city: string | undefined;
        let state: string | undefined;
        let zip: string | undefined;

        if (result.address_components) {
          for (const component of result.address_components) {
            if (component.types.includes('locality')) {
              city = component.long_name;
            } else if (component.types.includes('administrative_area_level_1')) {
              state = component.short_name; // Use short name for state (e.g., "TX" instead of "Texas")
            } else if (component.types.includes('postal_code')) {
              zip = component.long_name;
            }
          }
        }

        return {
          place_id: placeId,
          gmb_name: result.name || undefined,
          gmb_primary_category: result.types?.[0] || undefined,
          gmb_rating: result.rating || undefined,
          gmb_review_count: result.user_ratings_total || undefined,
          gmb_address: result.formatted_address || undefined,
          gmb_is_operational: result.business_status === 'OPERATIONAL',
          gmb_website: result.website || undefined,
          gmb_phone: result.formatted_phone_number || undefined,
          gmb_city: city,
          gmb_state: state,
          gmb_zip: zip,
          gmb_types: result.types || undefined,
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
    state?: string,
    website?: string
  ): Promise<GooglePlacesData | null> {
    try {
      const placeId = await this.findPlace(businessName, phone, city, state, website);

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

  /**
   * Determine if location is commercial/storefront vs residential
   * Returns true for commercial, false for residential, null if unknown
   */
  static isCommercialLocation(googlePlacesData: GooglePlacesData): boolean | null {
    if (!googlePlacesData.gmb_types || googlePlacesData.gmb_types.length === 0) {
      return null;
    }

    // Residential indicators
    const residentialTypes = [
      'lodging',
      'campground',
      'rv_park',
    ];

    // Commercial/Storefront indicators
    const commercialTypes = [
      'store', 'shop', 'retail', 'restaurant', 'cafe', 'bakery', 'bar',
      'beauty_salon', 'hair_care', 'spa', 'gym', 'health',
      'car_dealer', 'car_repair', 'car_wash',
      'bank', 'atm', 'finance', 'insurance_agency',
      'doctor', 'dentist', 'hospital', 'pharmacy', 'veterinary_care',
      'lawyer', 'accounting', 'real_estate_agency',
      'establishment', 'point_of_interest', 'business',
      'food', 'meal_delivery', 'meal_takeaway',
      'clothing_store', 'shoe_store', 'jewelry_store',
      'electronics_store', 'hardware_store', 'home_goods_store',
      'furniture_store', 'book_store', 'florist',
      'grocery_or_supermarket', 'convenience_store', 'supermarket',
      'gas_station', 'parking', 'car_rental',
      'travel_agency', 'post_office', 'laundry', 'locksmith',
      'moving_company', 'storage', 'plumber', 'electrician',
      'roofing_contractor', 'general_contractor', 'painter',
    ];

    const types = googlePlacesData.gmb_types.map(t => t.toLowerCase());

    // Check for residential types first
    for (const type of types) {
      if (residentialTypes.some(rt => type.includes(rt))) {
        return false;
      }
    }

    // Check for commercial types
    for (const type of types) {
      if (commercialTypes.some(ct => type.includes(ct))) {
        return true;
      }
    }

    // Default to commercial if we have a GMB profile and it's operational
    // Most businesses with GMB listings are commercial
    if (googlePlacesData.gmb_is_operational && googlePlacesData.gmb_address) {
      return true;
    }

    return null;
  }
}

