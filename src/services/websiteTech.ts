import puppeteer, { Browser, Page } from 'puppeteer';
import { logger } from '../utils/logger';
import { WebsiteTechData } from '../types/lead';

// Browser launch arguments for headless operation
const BROWSER_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-accelerated-2d-canvas',
  '--no-first-run',
  '--no-zygote',
  '--disable-gpu',
];

// Tech detection patterns
const TECH_PATTERNS = {
  meta: ['connect.facebook.net', 'fbq(', 'facebook.com/tr'],
  ga4: ["gtag('config','G-", 'googletagmanager.com/gtag/js?id=G-', 'gtag("config","G-'],
  google_ads: ["gtag('config','AW-", 'gtag("config","AW-', 'googletagmanager.com/gtag/js?id=AW-'],
  tiktok: ['analytics.tiktok.com', 'ttq.load', 'tiktok.com/analytics'],
  hubspot: ['js.hs-scripts.com', 'hubspot.com', 'hs-script-loader'],
} as const;

// Pixels that count toward pixel_count (hubspot is not a pixel)
const PIXELS = ['meta', 'ga4', 'google_ads', 'tiktok'] as const;

function createEmptyResult(): WebsiteTechData {
  return {
    has_meta_pixel: false,
    has_ga4: false,
    has_google_ads_tag: false,
    has_tiktok_pixel: false,
    has_hubspot: false,
    pixel_count: 0,
    marketing_tools_detected: [],
  };
}

function normalizeUrl(url: string): string {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return `https://${url}`;
  }
  return url;
}

export class WebsiteTechService {
  private browser: Browser | null = null;

  async initialize(): Promise<void> {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: BROWSER_ARGS,
      });
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  async detectTech(websiteUrl: string): Promise<WebsiteTechData> {
    const result = createEmptyResult();

    if (!websiteUrl) {
      return result;
    }

    try {
      await this.initialize();
      if (!this.browser) {
        throw new Error('Browser not initialized');
      }

      const normalizedUrl = normalizeUrl(websiteUrl);
      const page: Page = await this.browser.newPage();

      try {
        await page.goto(normalizedUrl, {
          waitUntil: 'networkidle2',
          timeout: 15000,
        });

        const content = await page.content();

        // Detect each tech by checking patterns
        for (const [tech, patterns] of Object.entries(TECH_PATTERNS)) {
          const detected = patterns.some(pattern => content.includes(pattern));
          if (detected) {
            result.marketing_tools_detected.push(tech);

            // Set the specific flag
            if (tech === 'meta') result.has_meta_pixel = true;
            else if (tech === 'ga4') result.has_ga4 = true;
            else if (tech === 'google_ads') result.has_google_ads_tag = true;
            else if (tech === 'tiktok') result.has_tiktok_pixel = true;
            else if (tech === 'hubspot') result.has_hubspot = true;

            // Count pixels (excluding hubspot)
            if ((PIXELS as readonly string[]).includes(tech)) {
              result.pixel_count++;
            }
          }
        }

        logger.info('Website tech detection completed', {
          url: normalizedUrl,
          pixelsDetected: result.pixel_count,
          tools: result.marketing_tools_detected,
        });
      } finally {
        await page.close();
      }
    } catch (error) {
      logger.error('Website tech detection failed', {
        error: error instanceof Error ? error.message : String(error),
        url: websiteUrl,
      });
    }

    return result;
  }
}

