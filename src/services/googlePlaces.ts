import axios, { AxiosInstance } from 'axios';
import { logger } from '../utils/logger';
import { GooglePlacesData } from '../types/lead';
import { retryWithBackoff, sleep } from '../utils/retry';

// Google Places API (New) base URL
const GOOGLE_PLACES_API_BASE = 'https://places.googleapis.com/v1';

// Domains that should not be considered as business websites
const INVALID_WEBSITE_DOMAINS = [
  'facebook.com',
  'fb.com',
  'yelp.com',
  'instagram.com',
  'twitter.com',
  'x.com',
  'linkedin.com',
  'youtube.com',
  'tiktok.com',
  'pinterest.com',
  'tripadvisor.com',
  'yellowpages.com',
  'bbb.org',
  'mapquest.com',
  'foursquare.com',
];

// Business suffixes to remove for fuzzy name matching
const BUSINESS_SUFFIXES = [
  'llc', 'llp', 'inc', 'corp', 'corporation', 'co', 'company',
  'ltd', 'limited', 'plc', 'pllc', 'pc', 'pa', 'dba',
  'enterprises', 'services', 'solutions', 'group', 'holdings',
];

/**
 * Normalize business name for fuzzy matching
 * Removes common suffixes like LLC, Inc, Corp and normalizes whitespace
 */
function normalizeBusinessName(name: string): string {
  let normalized = name.toLowerCase().trim();

  // Remove punctuation and special characters
  normalized = normalized.replace(/[.,'"!@#$%^&*()_+=\[\]{}|\\/<>?;:]/g, ' ');

  // Remove business suffixes
  for (const suffix of BUSINESS_SUFFIXES) {
    // Match suffix at end of string or followed by space
    const suffixPattern = new RegExp(`\\b${suffix}\\b`, 'gi');
    normalized = normalized.replace(suffixPattern, '');
  }

  // Collapse multiple spaces and trim
  normalized = normalized.replace(/\s+/g, ' ').trim();

  return normalized;
}

/**
 * Check if two business names match using fuzzy matching
 * Returns true if names are similar enough to be considered the same business
 */
function fuzzyBusinessNameMatch(inputName: string, gmbName: string): boolean {
  const normalizedInput = normalizeBusinessName(inputName);
  const normalizedGmb = normalizeBusinessName(gmbName);

  // Exact match after normalization
  if (normalizedInput === normalizedGmb) {
    return true;
  }

  // One contains the other (handles partial matches)
  if (normalizedInput.includes(normalizedGmb) || normalizedGmb.includes(normalizedInput)) {
    return true;
  }

  // Check if first significant words match (e.g., "ABC Roofing" vs "ABC Roofing Services")
  const inputWords = normalizedInput.split(' ').filter(w => w.length > 1);
  const gmbWords = normalizedGmb.split(' ').filter(w => w.length > 1);

  if (inputWords.length > 0 && gmbWords.length > 0) {
    // Check if the first 1-2 significant words match
    const matchingWords = inputWords.filter(w => gmbWords.includes(w));
    const minWords = Math.min(inputWords.length, gmbWords.length);

    // If at least 50% of the shorter name's words match, consider it a match
    if (matchingWords.length >= Math.ceil(minWords * 0.5)) {
      return true;
    }
  }

  // Handle "The" prefix variations (e.g., "The Paint Spot" vs "Paint Spot")
  const inputWithoutThe = normalizedInput.replace(/^the\s+/i, '');
  const gmbWithoutThe = normalizedGmb.replace(/^the\s+/i, '');
  if (inputWithoutThe !== normalizedInput || gmbWithoutThe !== normalizedGmb) {
    // One had "The" prefix, compare without it
    if (inputWithoutThe === gmbWithoutThe) {
      return true;
    }
    // Also check containment without "The"
    if (inputWithoutThe.includes(gmbWithoutThe) || gmbWithoutThe.includes(inputWithoutThe)) {
      return true;
    }
  }

  // Handle numeric suffixes (e.g., "Company 1" vs "Company", "Business 2" vs "Business")
  const inputWithoutNumbers = normalizedInput.replace(/\s*\d+\s*/g, ' ').replace(/\s+/g, ' ').trim();
  const gmbWithoutNumbers = normalizedGmb.replace(/\s*\d+\s*/g, ' ').replace(/\s+/g, ' ').trim();
  if (inputWithoutNumbers !== normalizedInput || gmbWithoutNumbers !== normalizedGmb) {
    // One had numbers, compare without them
    if (inputWithoutNumbers === gmbWithoutNumbers) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a URL is a valid business website (not a social media or directory listing)
 */
function isValidBusinessWebsite(url: string | undefined): boolean {
  if (!url) return false;

  try {
    const hostname = new URL(url).hostname.toLowerCase().replace('www.', '');
    return !INVALID_WEBSITE_DOMAINS.some(domain =>
      hostname === domain || hostname.endsWith('.' + domain)
    );
  } catch {
    return false;
  }
}

/**
 * Extract a readable business name from a website domain
 * e.g., "acmeroofing.com" → "acme roofing", "dr-smith-dental.net" → "dr smith dental"
 */
function extractBusinessNameFromDomain(url: string): string | null {
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace('www.', '');
    const domain = hostname.split('.')[0]; // Get name before TLD

    // Skip if too short or generic
    if (domain.length < 4) return null;
    const genericDomains = ['mail', 'shop', 'store', 'info', 'home', 'site', 'web', 'page', 'online'];
    if (genericDomains.includes(domain)) return null;

    // Convert camelCase to spaces and replace hyphens/underscores
    const spaced = domain
      .replace(/([a-z])([A-Z])/g, '$1 $2') // camelCase → camel Case
      .replace(/[-_]/g, ' ')               // kebab-case → kebab case
      .trim();

    // Skip if result is still too short or same as original
    if (spaced.length < 4) return null;

    return spaced;
  } catch {
    return null;
  }
}

/**
 * Get approximate coordinates for city/state for location biasing
 * Returns null if location not recognized
 * Uses static mapping for major US cities to avoid external geocoding API
 */
function getCityCoordinates(city: string, state: string): { latitude: number; longitude: number } | null {
  // Map major US cities to coordinates (top 100 cities cover most queries)
  // Format: "city, ST" -> { lat, lng }
  const cityCoords: Record<string, { latitude: number; longitude: number }> = {
    // Top 50 US cities by population
    'new york, ny': { latitude: 40.7128, longitude: -74.0060 },
    'los angeles, ca': { latitude: 34.0522, longitude: -118.2437 },
    'chicago, il': { latitude: 41.8781, longitude: -87.6298 },
    'houston, tx': { latitude: 29.7604, longitude: -95.3698 },
    'phoenix, az': { latitude: 33.4484, longitude: -112.0740 },
    'philadelphia, pa': { latitude: 39.9526, longitude: -75.1652 },
    'san antonio, tx': { latitude: 29.4241, longitude: -98.4936 },
    'san diego, ca': { latitude: 32.7157, longitude: -117.1611 },
    'dallas, tx': { latitude: 32.7767, longitude: -96.7970 },
    'san jose, ca': { latitude: 37.3382, longitude: -121.8863 },
    'austin, tx': { latitude: 30.2672, longitude: -97.7431 },
    'jacksonville, fl': { latitude: 30.3322, longitude: -81.6557 },
    'fort worth, tx': { latitude: 32.7555, longitude: -97.3308 },
    'columbus, oh': { latitude: 39.9612, longitude: -82.9988 },
    'charlotte, nc': { latitude: 35.2271, longitude: -80.8431 },
    'san francisco, ca': { latitude: 37.7749, longitude: -122.4194 },
    'indianapolis, in': { latitude: 39.7684, longitude: -86.1581 },
    'seattle, wa': { latitude: 47.6062, longitude: -122.3321 },
    'denver, co': { latitude: 39.7392, longitude: -104.9903 },
    'washington, dc': { latitude: 38.9072, longitude: -77.0369 },
    'boston, ma': { latitude: 42.3601, longitude: -71.0589 },
    'el paso, tx': { latitude: 31.7619, longitude: -106.4850 },
    'nashville, tn': { latitude: 36.1627, longitude: -86.7816 },
    'detroit, mi': { latitude: 42.3314, longitude: -83.0458 },
    'oklahoma city, ok': { latitude: 35.4676, longitude: -97.5164 },
    'portland, or': { latitude: 45.5152, longitude: -122.6784 },
    'las vegas, nv': { latitude: 36.1699, longitude: -115.1398 },
    'memphis, tn': { latitude: 35.1495, longitude: -90.0490 },
    'louisville, ky': { latitude: 38.2527, longitude: -85.7585 },
    'baltimore, md': { latitude: 39.2904, longitude: -76.6122 },
    'milwaukee, wi': { latitude: 43.0389, longitude: -87.9065 },
    'albuquerque, nm': { latitude: 35.0844, longitude: -106.6504 },
    'tucson, az': { latitude: 32.2226, longitude: -110.9747 },
    'fresno, ca': { latitude: 36.7378, longitude: -119.7871 },
    'mesa, az': { latitude: 33.4152, longitude: -111.8315 },
    'sacramento, ca': { latitude: 38.5816, longitude: -121.4944 },
    'atlanta, ga': { latitude: 33.7490, longitude: -84.3880 },
    'kansas city, mo': { latitude: 39.0997, longitude: -94.5786 },
    'colorado springs, co': { latitude: 38.8339, longitude: -104.8214 },
    'omaha, ne': { latitude: 41.2565, longitude: -95.9345 },
    'raleigh, nc': { latitude: 35.7796, longitude: -78.6382 },
    'miami, fl': { latitude: 25.7617, longitude: -80.1918 },
    'long beach, ca': { latitude: 33.7701, longitude: -118.1937 },
    'virginia beach, va': { latitude: 36.8529, longitude: -75.9780 },
    'oakland, ca': { latitude: 37.8044, longitude: -122.2712 },
    'minneapolis, mn': { latitude: 44.9778, longitude: -93.2650 },
    'tulsa, ok': { latitude: 36.1540, longitude: -95.9928 },
    'tampa, fl': { latitude: 27.9506, longitude: -82.4572 },
    'arlington, tx': { latitude: 32.7357, longitude: -97.1081 },
    'new orleans, la': { latitude: 29.9511, longitude: -90.0715 },
  };

  const key = `${city.toLowerCase()}, ${state.toLowerCase()}`;
  return cityCoords[key] || null;
}

export class GooglePlacesService {
  private client: AxiosInstance;
  private lastRequestTime: number = 0;
  private minRequestInterval: number = 1000; // 1 request per second

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('GOOGLE_PLACES_API_KEY is required');
    }
    this.client = axios.create({
      baseURL: GOOGLE_PLACES_API_BASE,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
      },
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

    // Get city coordinates for location biasing (if available)
    let coords: { latitude: number; longitude: number } | null = null;
    if (city && state) {
      coords = getCityCoordinates(city, state);
    }

    // Strategy 1: Try phone number in multiple formats (most accurate identifier)
    // Phone numbers are unique and give the best match
    if (phone) {
      const phoneDigits = phone.replace(/\D/g, ''); // Extract just digits

      // Variation 1a: Phone as provided (current behavior)
      const placeId = await this.searchForPlace(phone);
      if (placeId) {
        logger.info('Found place by phone (original format)', { phone, placeId });
        return placeId;
      }

      // Variation 1b: Try with +1 country code if not present
      if (phoneDigits.length === 10) {
        await this.rateLimit();
        const phoneWithCountry = `+1${phoneDigits}`;
        const placeIdWithCountry = await this.searchForPlace(phoneWithCountry);
        if (placeIdWithCountry) {
          logger.info('Found place by phone (+1 format)', { phone: phoneWithCountry, placeId: placeIdWithCountry });
          return placeIdWithCountry;
        }
      }

      // Variation 1c: Try formatted (###) ###-####
      if (phoneDigits.length === 10) {
        await this.rateLimit();
        const formatted = `(${phoneDigits.slice(0, 3)}) ${phoneDigits.slice(3, 6)}-${phoneDigits.slice(6)}`;
        const placeIdFormatted = await this.searchForPlace(formatted);
        if (placeIdFormatted) {
          logger.info('Found place by phone (formatted)', { phone: formatted, placeId: placeIdFormatted });
          return placeIdFormatted;
        }
      }

      // Variation 1d: Try unformatted 10 digits
      if (phoneDigits.length >= 10) {
        await this.rateLimit();
        const unformatted = phoneDigits.slice(-10); // Last 10 digits (removes country code if present)
        const placeIdUnformatted = await this.searchForPlace(unformatted);
        if (placeIdUnformatted) {
          logger.info('Found place by phone (digits only)', { phone: unformatted, placeId: placeIdUnformatted });
          return placeIdUnformatted;
        }
      }
    }

    // Strategy 2: Try business name with full address (most specific location)
    if (address && city && state) {
      await this.rateLimit();
      const placeId = await this.searchForPlace(
        `${businessName} ${address} ${city}, ${state}`,
        coords?.latitude,
        coords?.longitude
      );
      if (placeId) {
        logger.info('Found place by business name + full address', { businessName, city, state });
        return placeId;
      }
    }

    // Strategy 3: Try business name with city, state, zip
    if (city && state) {
      await this.rateLimit();
      const query = zip ? `${businessName} ${city}, ${state} ${zip}` : `${businessName} ${city}, ${state}`;
      const placeId = await this.searchForPlace(query, coords?.latitude, coords?.longitude);
      if (placeId) {
        logger.info('Found place by business name + city/state', { businessName, city, state });
        return placeId;
      }
    }

    // Strategy 4: Try business name with state only
    if (state) {
      await this.rateLimit();
      const placeId = await this.searchForPlace(
        `${businessName} ${state}`,
        coords?.latitude,
        coords?.longitude
      );
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

    // Strategy 8: Try abbreviated business name (first 2-3 words) for long names
    // Long business names often fail to match, but the first words are often enough
    const nameWords = businessName.split(/\s+/).filter(w => w.length > 1);
    if (nameWords.length >= 3) {
      const abbreviatedName = nameWords.slice(0, 3).join(' ');

      // Try abbreviated name with city/state
      if (city && state) {
        await this.rateLimit();
        const placeId = await this.searchForPlace(
          `${abbreviatedName} ${city}, ${state}`,
          coords?.latitude,
          coords?.longitude
        );
        if (placeId) {
          logger.info('Found place by abbreviated name + city/state', { abbreviatedName, city, state });
          return placeId;
        }
      }

      // Try abbreviated name with zip
      if (zip) {
        await this.rateLimit();
        const placeId = await this.searchForPlace(`${abbreviatedName} ${zip}`);
        if (placeId) {
          logger.info('Found place by abbreviated name + zip', { abbreviatedName, zip });
          return placeId;
        }
      }
    }

    // Strategy 9: Try website domain as a business name search
    // Sometimes the domain name itself is more recognizable than the company name
    if (website) {
      const domainBusinessName = extractBusinessNameFromDomain(website);
      if (domainBusinessName && domainBusinessName.toLowerCase() !== businessName.toLowerCase()) {
        // Try domain-derived name with city/state
        if (city && state) {
          await this.rateLimit();
          const placeId = await this.searchForPlace(`${domainBusinessName} ${city}, ${state}`);
          if (placeId) {
            logger.info('Found place by domain-derived name + city/state', { domainBusinessName, city, state });
            return placeId;
          }
        }

        // Try domain-derived name with zip
        if (zip) {
          await this.rateLimit();
          const placeId = await this.searchForPlace(`${domainBusinessName} ${zip}`);
          if (placeId) {
            logger.info('Found place by domain-derived name + zip', { domainBusinessName, zip });
            return placeId;
          }
        }
      }
    }

    // Strategy 10: Last resort - just business name (least accurate)
    await this.rateLimit();
    const placeId = await this.searchForPlace(businessName);
    if (placeId) {
      logger.info('Found place by business name only', { businessName });
      return placeId;
    }

    return null;
  }

  private async searchForPlace(query: string, latitude?: number, longitude?: number): Promise<string | null> {
    return retryWithBackoff(
      async () => {
        // Using Places API (New) Text Search endpoint
        const requestBody: any = {
          textQuery: query,
          pageSize: 1, // We only need the top result
        };

        // Add location bias if coordinates provided (50km radius)
        if (latitude !== undefined && longitude !== undefined) {
          requestBody.locationBias = {
            circle: {
              center: { latitude, longitude },
              radius: 50000, // 50km radius - wide enough to catch suburbs but focused
            },
          };
        }

        const response = await this.client.post(
          '/places:searchText',
          requestBody,
          {
            headers: {
              'X-Goog-FieldMask': 'places.id',
            },
          }
        );

        // New API returns places array directly (no status field)
        if (response.data.places && response.data.places.length > 0) {
          return response.data.places[0].id;
        }

        logger.info('No place found for query', { query });
        return null;
      },
      { maxRetries: 3, initialDelayMs: 1000 },
      'google-places-find'
    );
  }

  async getPlaceDetails(placeId: string): Promise<GooglePlacesData | null> {
    await this.rateLimit();

    return retryWithBackoff(
      async () => {
        // Using Places API (New) Place Details endpoint
        // Field mask specifies which fields to return
        const fieldMask = [
          'displayName',
          'types',
          'rating',
          'userRatingCount',
          'formattedAddress',
          'businessStatus',
          'websiteUri',
          'nationalPhoneNumber',
          'addressComponents',
          'pureServiceAreaBusiness', // Detects service-area businesses (home-based contractors)
        ].join(',');

        const response = await this.client.get(`/places/${placeId}`, {
          headers: {
            'X-Goog-FieldMask': fieldMask,
          },
        });

        // New API returns the place directly (no wrapper object)
        const result = response.data;

        // If no data returned, place not found
        if (!result || Object.keys(result).length === 0) {
          logger.warn('Place not found', { placeId });
          return null;
        }

        // Parse address components to extract city, state, zip
        // New API uses camelCase field names
        let city: string | undefined;
        let state: string | undefined;
        let zip: string | undefined;

        if (result.addressComponents) {
          for (const component of result.addressComponents) {
            if (component.types?.includes('locality')) {
              city = component.longText;
            } else if (component.types?.includes('administrative_area_level_1')) {
              state = component.shortText; // Use short name for state (e.g., "TX" instead of "Texas")
            } else if (component.types?.includes('postal_code')) {
              zip = component.longText;
            }
          }
        }

        // Filter out social media / directory websites - they're not real business websites
        const rawWebsite = result.websiteUri;
        const validWebsite = isValidBusinessWebsite(rawWebsite) ? rawWebsite : undefined;

        if (rawWebsite && !validWebsite) {
          logger.info('Filtered out non-business website from GMB', {
            placeId,
            filteredUrl: rawWebsite,
          });
        }

        return {
          place_id: placeId,
          gmb_name: result.displayName?.text || undefined,
          gmb_primary_category: result.types?.[0] || undefined,
          gmb_rating: result.rating || undefined,
          gmb_review_count: result.userRatingCount || undefined,
          gmb_address: result.formattedAddress || undefined,
          gmb_is_operational: result.businessStatus === 'OPERATIONAL',
          gmb_website: validWebsite,
          gmb_phone: result.nationalPhoneNumber || undefined,
          gmb_city: city,
          gmb_state: state,
          gmb_zip: zip,
          gmb_types: result.types || undefined,
          is_service_area_business: result.pureServiceAreaBusiness === true,
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
      // Include businessName for high-confidence phone + name matching
      const matchScore = this.calculateMatchScore(
        { phone, city, state, zip, website, businessName },
        placeDetails
      );

      // Accept if score >= 1 OR if we have high-confidence phone + name match
      const isHighConfidenceMatch = matchScore.isPhoneMatch && matchScore.isBusinessNameMatch;

      if (matchScore.score < 1 && !isHighConfidenceMatch) {
        logger.warn('GMB match score too low - discarding result', {
          businessName,
          matchScore: matchScore.score,
          matchedFields: matchScore.matchedFields,
          foundName: placeDetails.gmb_name,
          isPhoneMatch: matchScore.isPhoneMatch,
          isBusinessNameMatch: matchScore.isBusinessNameMatch,
        });
        return null;
      }

      logger.info('GMB match validated', {
        businessName,
        matchScore: matchScore.score,
        matchedFields: matchScore.matchedFields,
        foundName: placeDetails.gmb_name,
        isHighConfidenceMatch,
        shouldOverwriteAddress: matchScore.shouldOverwriteAddress,
      });

      // Return place details with the shouldOverwriteAddress flag
      return {
        ...placeDetails,
        shouldOverwriteAddress: matchScore.shouldOverwriteAddress,
      };
    } catch (error) {
      logger.error('Google Places enrichment failed', {
        error: error instanceof Error ? error.message : String(error),
        businessName,
      });
      return null;
    }
  }

  /**
   * Match score result with additional flags for high-confidence matching
   */
  public static MatchScoreResult: undefined;

  /**
   * Calculate match score between input data and GMB result
   * Returns a score, matched fields, and flags for high-confidence matching
   *
   * HIGH CONFIDENCE MATCHING:
   * When phone matches AND business name fuzzy-matches, we treat GMB as authoritative.
   * This overrides state mismatch rejection and triggers address overwrite.
   */
  private calculateMatchScore(
    input: { phone?: string; city?: string; state?: string; zip?: string; website?: string; businessName?: string },
    gmbResult: GooglePlacesData
  ): {
    score: number;
    matchedFields: string[];
    isPhoneMatch: boolean;
    isBusinessNameMatch: boolean;
    hasStateMismatch: boolean;
    shouldOverwriteAddress: boolean;
  } {
    const matchedFields: string[] = [];
    let isPhoneMatch = false;
    let isBusinessNameMatch = false;
    let hasStateMismatch = false;
    let shouldOverwriteAddress = false;

    // Normalize phone numbers for comparison (remove non-digits)
    const normalizePhone = (p?: string) => p?.replace(/\D/g, '') || '';

    // Check business name match (fuzzy)
    if (input.businessName && gmbResult.gmb_name) {
      isBusinessNameMatch = fuzzyBusinessNameMatch(input.businessName, gmbResult.gmb_name);
      if (isBusinessNameMatch) {
        matchedFields.push('businessName');
      }
    }

    // Check phone match (worth 2 points - very reliable)
    // Phone match is HIGH CONFIDENCE - overrides state mismatch
    if (input.phone && gmbResult.gmb_phone) {
      const inputPhone = normalizePhone(input.phone);
      const gmbPhone = normalizePhone(gmbResult.gmb_phone);
      // Check if either phone contains the other (handle country codes)
      if (inputPhone.length >= 10 && gmbPhone.length >= 10) {
        if (inputPhone.includes(gmbPhone.slice(-10)) || gmbPhone.includes(inputPhone.slice(-10))) {
          matchedFields.push('phone');
          isPhoneMatch = true;
          logger.info('Phone match detected - high confidence GMB match', {
            inputPhone: input.phone,
            gmbPhone: gmbResult.gmb_phone,
          });
        } else {
          // Phone numbers don't match - this is a strong negative signal
          // Different phone = likely different business (ALWAYS reject)
          logger.warn('Phone mismatch detected - likely wrong GMB match', {
            inputPhone: input.phone,
            gmbPhone: gmbResult.gmb_phone,
          });
          return {
            score: -10,
            matchedFields: ['PHONE_MISMATCH'],
            isPhoneMatch: false,
            isBusinessNameMatch,
            hasStateMismatch: false,
            shouldOverwriteAddress: false
          };
        }
      }
    }

    // Check state match (worth 1 point)
    // If phone matches, we DON'T reject on state mismatch - instead flag for address overwrite
    if (input.state && gmbResult.gmb_state) {
      const inputState = input.state.toUpperCase().trim();
      const gmbState = gmbResult.gmb_state.toUpperCase().trim();
      if (inputState === gmbState) {
        matchedFields.push('state');
      } else {
        hasStateMismatch = true;

        // Check if zip matches - zip is more reliable than IP-guessed state from LanderLab
        const zipMatches = input.zip && gmbResult.gmb_zip &&
          input.zip.trim() === gmbResult.gmb_zip.trim();

        // HIGH CONFIDENCE: Accept if phone + name match, OR if zip matches
        if (isPhoneMatch && isBusinessNameMatch) {
          logger.info('State mismatch overridden by phone + business name match - will overwrite address from GMB', {
            inputState: input.state,
            gmbState: gmbResult.gmb_state,
            businessName: input.businessName,
            gmbName: gmbResult.gmb_name,
          });
          shouldOverwriteAddress = true;
          // Don't reject - continue scoring
        } else if (zipMatches) {
          // Zip match is high confidence - IP-guessed state is often wrong
          logger.info('State mismatch overridden by zip match - trusting GMB address', {
            inputState: input.state,
            gmbState: gmbResult.gmb_state,
            matchedZip: input.zip,
          });
          shouldOverwriteAddress = true;
          matchedFields.push('zip'); // Count zip as a matched field
          // Don't reject - continue scoring
        } else {
          // No high-confidence match - state mismatch is a rejection
          logger.warn('State mismatch without phone or zip match - rejecting GMB result', {
            inputState: input.state,
            gmbState: gmbResult.gmb_state,
            inputZip: input.zip,
            gmbZip: gmbResult.gmb_zip,
          });
          return {
            score: -10,
            matchedFields: ['STATE_MISMATCH'],
            isPhoneMatch,
            isBusinessNameMatch,
            hasStateMismatch: true,
            shouldOverwriteAddress: false
          };
        }
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

    return {
      score: matchedFields.length,
      matchedFields,
      isPhoneMatch,
      isBusinessNameMatch,
      hasStateMismatch,
      shouldOverwriteAddress
    };
  }

  /**
   * Determine the business location type for more accurate scoring
   *
   * Returns:
   * - 'storefront': Commercial location with physical customer-facing space (retail, restaurant, salon, etc.)
   * - 'office': Commercial location for service businesses (contractors with office, professional services)
   * - 'service_area': Home-based or mobile business that serves customers at their location
   * - 'residential': Residential/lodging location (should not receive physical location bonus)
   * - null: Unknown/cannot determine
   */
  static getLocationClassification(googlePlacesData: GooglePlacesData): 'storefront' | 'office' | 'service_area' | 'residential' | null {
    // First check the pureServiceAreaBusiness flag from Google Places API
    // This is the most reliable indicator of a home-based/mobile contractor
    if (googlePlacesData.is_service_area_business === true) {
      return 'service_area';
    }

    const types = googlePlacesData.gmb_types?.map(t => t.toLowerCase()) || [];

    if (types.length === 0) {
      // No types available - try to infer from other data
      if (googlePlacesData.gmb_address && googlePlacesData.gmb_is_operational) {
        // Has a physical address and is operational, likely a real business location
        return 'office';
      }
      return null;
    }

    // Residential indicators - these should NOT get physical location bonus
    const residentialTypes = [
      'lodging', 'campground', 'rv_park', 'hotel', 'motel', 'resort',
      'apartment', 'apartment_complex', 'housing_complex',
    ];

    // Storefront/retail indicators - clear commercial presence with customer foot traffic
    const storefrontTypes = [
      'store', 'shop', 'retail', 'restaurant', 'cafe', 'bakery', 'bar',
      'beauty_salon', 'hair_care', 'spa', 'gym', 'fitness_center',
      'car_dealer', 'car_wash', 'gas_station',
      'pharmacy', 'florist', 'grocery', 'supermarket', 'convenience_store',
      'clothing_store', 'shoe_store', 'jewelry_store', 'electronics_store',
      'hardware_store', 'home_goods_store', 'furniture_store', 'book_store',
      'pet_store', 'liquor_store', 'department_store', 'shopping_mall',
    ];

    // Office/professional service types - commercial but not retail
    const officeTypes = [
      'doctor', 'dentist', 'hospital', 'medical', 'veterinary_care', 'clinic',
      'lawyer', 'attorney', 'law_firm', 'accounting', 'accountant',
      'real_estate_agency', 'insurance_agency', 'bank', 'finance',
      'car_repair', 'auto_repair', 'mechanic',
      'storage', 'moving_company', 'funeral_home',
    ];

    // Contractor types - these are OFTEN home-based but not always
    // If they have is_service_area_business=false AND a real address, they likely have a shop/office
    const contractorTypes = [
      'plumber', 'electrician', 'roofing_contractor', 'general_contractor',
      'painter', 'hvac', 'landscaper', 'landscaping', 'lawn_care',
      'pest_control', 'cleaning', 'maid_service', 'carpet_cleaning',
      'handyman', 'locksmith', 'appliance_repair', 'garage_door',
      'tree_service', 'pool_service', 'fencing', 'concrete', 'masonry',
      'home_improvement', 'remodeling', 'renovation', 'construction',
    ];

    // Check for residential first
    for (const type of types) {
      if (residentialTypes.some(rt => type.includes(rt))) {
        return 'residential';
      }
    }

    // Check for clear storefront/retail
    for (const type of types) {
      if (storefrontTypes.some(st => type.includes(st))) {
        return 'storefront';
      }
    }

    // Check for office/professional services
    for (const type of types) {
      if (officeTypes.some(ot => type.includes(ot))) {
        return 'office';
      }
    }

    // Check for contractor types
    const isContractorType = types.some(type =>
      contractorTypes.some(ct => type.includes(ct))
    );

    if (isContractorType) {
      // Key insight: If Google didn't flag as pureServiceAreaBusiness
      // AND the business has a physical address, they likely have a real shop/office
      if (googlePlacesData.gmb_address && googlePlacesData.gmb_is_operational) {
        // Contractor with physical address - likely has a shop or office
        return 'office';
      } else {
        // Contractor without clear physical address - likely home-based
        return 'service_area';
      }
    }

    // Default: if operational with address, assume office
    if (googlePlacesData.gmb_is_operational && googlePlacesData.gmb_address) {
      return 'office';
    }

    return null;
  }

  /**
   * @deprecated Use getLocationClassification() for more granular detection
   * Determine if location is commercial/storefront vs residential
   * Returns true for commercial, false for residential, null if unknown
   *
   * Note: This method treats service-area businesses (home-based contractors) as commercial,
   * which may not be ideal for all use cases. Use getLocationClassification() instead.
   */
  static isCommercialLocation(googlePlacesData: GooglePlacesData): boolean | null {
    const classification = this.getLocationClassification(googlePlacesData);

    switch (classification) {
      case 'storefront':
      case 'office':
        return true;
      case 'service_area':
        // Service-area businesses are commercial entities, but operate from home
        // For backwards compatibility, we still return true
        // Use getLocationClassification() if you need to distinguish these
        return true;
      case 'residential':
        return false;
      default:
        return null;
    }
  }

  /**
   * Check if the business has a real commercial physical location
   * (storefront or office - NOT home-based service area businesses)
   *
   * This is what should be used for the +20 physical location bonus
   */
  static hasCommercialLocation(googlePlacesData: GooglePlacesData): boolean {
    const classification = this.getLocationClassification(googlePlacesData);
    return classification === 'storefront' || classification === 'office';
  }

  /**
   * Check if the business is a service-area business (home-based/mobile)
   * These are legitimate businesses but operate from home, not a commercial location
   */
  static isServiceAreaBusiness(googlePlacesData: GooglePlacesData): boolean {
    return this.getLocationClassification(googlePlacesData) === 'service_area';
  }
}

