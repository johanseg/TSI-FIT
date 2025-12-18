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
    website?: string,
    address?: string,
    zip?: string
  ): Promise<string | null> {
    await this.rateLimit();

    // Strategy 1: Try phone number first (most accurate identifier)
    // Phone numbers are unique and give the best match
    if (phone) {
      const placeId = await this.searchForPlace(phone);
      if (placeId) {
        logger.info('Found place by phone number', { phone, placeId });
        return placeId;
      }
    }

    // Strategy 2: Try business name with full address (most specific location)
    if (address && city && state) {
      await this.rateLimit();
      const placeId = await this.searchForPlace(`${businessName} ${address} ${city}, ${state}`);
      if (placeId) {
        logger.info('Found place by business name + full address', { businessName, city, state });
        return placeId;
      }
    }

    // Strategy 3: Try business name with city, state, zip
    if (city && state) {
      await this.rateLimit();
      const query = zip ? `${businessName} ${city}, ${state} ${zip}` : `${businessName} ${city}, ${state}`;
      const placeId = await this.searchForPlace(query);
      if (placeId) {
        logger.info('Found place by business name + city/state', { businessName, city, state });
        return placeId;
      }
    }

    // Strategy 4: Try business name with state only
    if (state) {
      await this.rateLimit();
      const placeId = await this.searchForPlace(`${businessName} ${state}`);
      if (placeId) {
        logger.info('Found place by business name + state', { businessName, state });
        return placeId;
      }
    }

    // Strategy 5: Try business name with zip code
    if (zip) {
      await this.rateLimit();
      const placeId = await this.searchForPlace(`${businessName} ${zip}`);
      if (placeId) {
        logger.info('Found place by business name + zip', { businessName, zip });
        return placeId;
      }
    }

    // Strategy 6: Try business name with phone (combined search)
    if (phone) {
      await this.rateLimit();
      const placeId = await this.searchForPlace(`${businessName} ${phone}`);
      if (placeId) {
        logger.info('Found place by business name + phone', { businessName, phone });
        return placeId;
      }
    }

    // Strategy 7: Try website domain
    if (website) {
      await this.rateLimit();
      try {
        const domain = new URL(website).hostname.replace('www.', '');
        const placeId = await this.searchForPlace(domain);
        if (placeId) {
          logger.info('Found place by website domain', { domain });
          return placeId;
        }
      } catch {
        // Invalid URL, skip this strategy
      }
    }

    // Strategy 8: Last resort - just business name (least accurate)
    await this.rateLimit();
    const placeId = await this.searchForPlace(businessName);
    if (placeId) {
      logger.info('Found place by business name only', { businessName });
      return placeId;
    }

    return null;
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
    website?: string,
    address?: string,
    zip?: string
  ): Promise<GooglePlacesData | null> {
    try {
      const placeId = await this.findPlace(businessName, phone, city, state, website, address, zip);

      if (!placeId) {
        return null;
      }

      const placeDetails = await this.getPlaceDetails(placeId);
      if (!placeDetails) {
        return null;
      }

      // Validate the match by counting matching data points
      // We need at least 1 matching data point to accept the result
      const matchScore = this.calculateMatchScore(
        { phone, city, state, zip, website },
        placeDetails
      );

      if (matchScore.score < 1) {
        logger.warn('GMB match score too low - discarding result', {
          businessName,
          matchScore: matchScore.score,
          matchedFields: matchScore.matchedFields,
          foundName: placeDetails.gmb_name,
        });
        return null;
      }

      logger.info('GMB match validated', {
        businessName,
        matchScore: matchScore.score,
        matchedFields: matchScore.matchedFields,
        foundName: placeDetails.gmb_name,
      });

      return placeDetails;
    } catch (error) {
      logger.error('Google Places enrichment failed', {
        error: error instanceof Error ? error.message : String(error),
        businessName,
      });
      return null;
    }
  }

  /**
   * Calculate match score between input data and GMB result
   * Returns a score (number of matching fields) and list of matched fields
   */
  private calculateMatchScore(
    input: { phone?: string; city?: string; state?: string; zip?: string; website?: string },
    gmbResult: GooglePlacesData
  ): { score: number; matchedFields: string[] } {
    const matchedFields: string[] = [];

    // Normalize phone numbers for comparison (remove non-digits)
    const normalizePhone = (p?: string) => p?.replace(/\D/g, '') || '';

    // Check phone match (worth 2 points - very reliable)
    if (input.phone && gmbResult.gmb_phone) {
      const inputPhone = normalizePhone(input.phone);
      const gmbPhone = normalizePhone(gmbResult.gmb_phone);
      // Check if either phone contains the other (handle country codes)
      if (inputPhone.length >= 10 && gmbPhone.length >= 10) {
        if (inputPhone.includes(gmbPhone.slice(-10)) || gmbPhone.includes(inputPhone.slice(-10))) {
          matchedFields.push('phone');
        }
      }
    }

    // Check state match (worth 1 point)
    if (input.state && gmbResult.gmb_state) {
      const inputState = input.state.toUpperCase().trim();
      const gmbState = gmbResult.gmb_state.toUpperCase().trim();
      if (inputState === gmbState) {
        matchedFields.push('state');
      } else {
        // State mismatch is a strong negative signal
        return { score: -10, matchedFields: ['STATE_MISMATCH'] };
      }
    }

    // Check city match (worth 1 point)
    if (input.city && gmbResult.gmb_city) {
      const inputCity = input.city.toLowerCase().trim();
      const gmbCity = gmbResult.gmb_city.toLowerCase().trim();
      if (inputCity === gmbCity || inputCity.includes(gmbCity) || gmbCity.includes(inputCity)) {
        matchedFields.push('city');
      }
    }

    // Check zip match (worth 1 point)
    if (input.zip && gmbResult.gmb_zip) {
      const inputZip = input.zip.trim();
      const gmbZip = gmbResult.gmb_zip.trim();
      if (inputZip === gmbZip) {
        matchedFields.push('zip');
      }
    }

    // Check website match (worth 1 point)
    if (input.website && gmbResult.gmb_website) {
      try {
        const inputDomain = new URL(input.website).hostname.replace('www.', '').toLowerCase();
        const gmbDomain = new URL(gmbResult.gmb_website).hostname.replace('www.', '').toLowerCase();
        if (inputDomain === gmbDomain) {
          matchedFields.push('website');
        }
      } catch {
        // Invalid URL, skip
      }
    }

    return { score: matchedFields.length, matchedFields };
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

