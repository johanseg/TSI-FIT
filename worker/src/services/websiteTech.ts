import puppeteer, { Browser, Page } from 'puppeteer';
import { logger } from '@tsi-fit-score/shared';
import { WebsiteTechData } from '@tsi-fit-score/shared';

export class WebsiteTechService {
  private browser: Browser | null = null;

  async initialize(): Promise<void> {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
        ],
      });
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  private normalizeUrl(url: string): string {
    // Ensure URL has protocol
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return `https://${url}`;
    }
    return url;
  }

  async detectTech(websiteUrl: string): Promise<WebsiteTechData> {
    const result: WebsiteTechData = {
      has_meta_pixel: false,
      has_ga4: false,
      has_google_ads_tag: false,
      has_tiktok_pixel: false,
      has_hubspot: false,
      pixel_count: 0,
      marketing_tools_detected: [],
    };

    if (!websiteUrl) {
      return result;
    }

    try {
      await this.initialize();
      if (!this.browser) {
        throw new Error('Browser not initialized');
      }

      const normalizedUrl = this.normalizeUrl(websiteUrl);
      const page: Page = await this.browser.newPage();

      try {
        // Set timeout for page load
        await page.goto(normalizedUrl, {
          waitUntil: 'networkidle2',
          timeout: 15000,
        });

        // Get page content
        const content = await page.content();
        const pageText = await page.evaluate(() => document.body.innerText);

        // Detect Meta Pixel
        if (
          content.includes('connect.facebook.net') ||
          content.includes('fbq(') ||
          content.includes('facebook.com/tr')
        ) {
          result.has_meta_pixel = true;
          result.marketing_tools_detected.push('meta');
          result.pixel_count++;
        }

        // Detect GA4
        if (
          content.includes("gtag('config','G-") ||
          content.includes('googletagmanager.com/gtag/js?id=G-') ||
          content.includes('gtag("config","G-')
        ) {
          result.has_ga4 = true;
          result.marketing_tools_detected.push('ga4');
          result.pixel_count++;
        }

        // Detect Google Ads tag (AW- IDs)
        if (
          content.includes("gtag('config','AW-") ||
          content.includes('gtag("config","AW-') ||
          content.includes('googletagmanager.com/gtag/js?id=AW-')
        ) {
          result.has_google_ads_tag = true;
          result.marketing_tools_detected.push('google_ads');
          result.pixel_count++;
        }

        // Detect TikTok Pixel
        if (
          content.includes('analytics.tiktok.com') ||
          content.includes('ttq.load') ||
          content.includes('tiktok.com/analytics')
        ) {
          result.has_tiktok_pixel = true;
          result.marketing_tools_detected.push('tiktok');
          result.pixel_count++;
        }

        // Detect HubSpot
        if (
          content.includes('js.hs-scripts.com') ||
          content.includes('hubspot.com') ||
          content.includes('hs-script-loader')
        ) {
          result.has_hubspot = true;
          result.marketing_tools_detected.push('hubspot');
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
      // Return empty result on error
    }

    return result;
  }
}

