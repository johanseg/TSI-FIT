const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

/**
 * Enrich incomplete leads by scraping websites for business name and phone,
 * then import to Salesforce
 */

const CSV_INPUT = path.join(__dirname, 'leads_not_in_salesforce.csv');
const CSV_OUTPUT = path.join(__dirname, 'enriched_leads_imported.csv');

// Parse CSV
function parseCSV(csvText) {
  const lines = csvText.split('\n');
  const headers = parseCSVLine(lines[0]);
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = parseCSVLine(lines[i]);
    if (values.length === headers.length) {
      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index];
      });
      rows.push(row);
    }
  }

  return { headers, rows };
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function escapeCSV(value) {
  if (!value) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// Normalize website URL
function normalizeWebsite(website) {
  if (!website || website.trim() === '') return null;

  let url = website.trim();

  // Skip invalid/incomplete websites
  if (url.includes('@')) return null; // Email addresses
  if (url.includes('townsquareinteractive.com')) return null;
  if (!url.includes('.')) return null; // No TLD
  if (url.includes('fucking.com')) return null; // Spam

  // Add protocol if missing
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }

  // Fix common typos
  url = url.replace(/\.con$/, '.com');
  url = url.replace(/\s+/g, '');

  return url;
}

// Extract phone numbers from text
function extractPhoneNumbers(text) {
  const phonePatterns = [
    /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, // (123) 456-7890 or 123-456-7890
    /\d{3}[-.\s]\d{3}[-.\s]\d{4}/g, // 123.456.7890
    /\+1[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, // +1 (123) 456-7890
    /1[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, // 1-123-456-7890
  ];

  const phones = [];
  phonePatterns.forEach(pattern => {
    const matches = text.match(pattern);
    if (matches) {
      matches.forEach(phone => {
        const cleaned = phone.replace(/\D/g, '');
        if (cleaned.length === 10) {
          phones.push('+1' + cleaned);
        } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
          phones.push('+' + cleaned);
        }
      });
    }
  });

  return [...new Set(phones)]; // Remove duplicates
}

// Extract business name from website
function extractBusinessName(text, url) {
  // Try to find business name in common patterns
  const patterns = [
    /<title>([^<|]+)/i,
    /<h1[^>]*>([^<]+)</i,
    /class="[^"]*(?:business-name|company-name|site-title)[^"]*"[^>]*>([^<]+)</i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      let name = match[1].trim();
      // Clean up common suffixes
      name = name.replace(/\s*[-|]\s*.*/g, ''); // Remove everything after | or -
      name = name.replace(/\s*(Home|Welcome|Official Site)\s*$/i, '');
      if (name.length > 3 && name.length < 100) {
        return name;
      }
    }
  }

  // Fallback: use domain name
  try {
    const domain = new URL(url).hostname.replace('www.', '');
    const name = domain.split('.')[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch (e) {
    return null;
  }
}

// Scrape website for business info
async function scrapeWebsite(url, browser) {
  console.log(`  Scraping: ${url}`);

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Set timeout and navigate
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 15000
    }).catch(() => null);

    // Wait a bit for dynamic content
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Get page content
    const html = await page.content();
    const text = await page.evaluate(() => document.body.innerText).catch(() => '');

    await page.close();

    // Extract phone numbers
    const phones = extractPhoneNumbers(text);

    // Extract business name
    const businessName = extractBusinessName(html, url);

    return {
      success: true,
      businessName,
      phone: phones.length > 0 ? phones[0] : null,
      allPhones: phones
    };

  } catch (error) {
    console.log(`  ❌ Error scraping ${url}: ${error.message}`);
    return {
      success: false,
      businessName: null,
      phone: null,
      error: error.message
    };
  }
}

// Main function
async function main() {
  console.log('=== LEAD ENRICHMENT AND IMPORT PROCESS ===\n');

  // Read CSV
  console.log('Step 1: Reading incomplete leads CSV...');
  const csvContent = fs.readFileSync(CSV_INPUT, 'utf-8');
  const { headers, rows } = parseCSV(csvContent);
  console.log(`Found ${rows.length} incomplete leads`);

  // Filter for valid websites
  console.log('\nStep 2: Filtering valid websites...');
  const leadsWithWebsites = rows
    .map(row => ({
      ...row,
      normalizedWebsite: normalizeWebsite(row.Website)
    }))
    .filter(row => row.normalizedWebsite !== null);

  console.log(`Valid websites to scrape: ${leadsWithWebsites.length}`);

  // Launch browser
  console.log('\nStep 3: Launching browser for web scraping...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  // Scrape each website
  console.log('\nStep 4: Scraping websites for business info...');
  const enrichedLeads = [];

  for (let i = 0; i < leadsWithWebsites.length; i++) {
    const lead = leadsWithWebsites[i];
    console.log(`\n[${i + 1}/${leadsWithWebsites.length}] Processing: ${lead.normalizedWebsite}`);

    const scraped = await scrapeWebsite(lead.normalizedWebsite, browser);

    if (scraped.success && scraped.phone) {
      console.log(`  ✅ Found: ${scraped.businessName || 'N/A'} | ${scraped.phone}`);

      enrichedLeads.push({
        ...lead,
        enrichedBusinessName: scraped.businessName,
        enrichedPhone: scraped.phone,
        allPhones: scraped.allPhones
      });
    } else {
      console.log(`  ⚠️ No phone found`);
    }

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  await browser.close();

  console.log(`\n\nStep 5: Enrichment Results`);
  console.log(`Successfully enriched: ${enrichedLeads.length} leads`);
  console.log(`Failed to enrich: ${leadsWithWebsites.length - enrichedLeads.length} leads`);

  if (enrichedLeads.length === 0) {
    console.log('\n❌ No leads were enriched. Nothing to import.');
    return;
  }

  // Prepare Salesforce lead records
  console.log('\n\nStep 6: Preparing Salesforce lead records...');
  const salesforceLeads = enrichedLeads.map(lead => {
    // Use enriched business name or fall back to inferred name from website
    let company = lead.enrichedBusinessName || 'Unknown Company';
    if (company === 'Unknown Company' && lead.normalizedWebsite) {
      try {
        const domain = new URL(lead.normalizedWebsite).hostname.replace('www.', '');
        company = domain.split('.')[0];
        company = company.charAt(0).toUpperCase() + company.slice(1);
      } catch (e) {}
    }

    return {
      Company: company,
      Phone: lead.enrichedPhone,
      Website: lead.normalizedWebsite,
      City: lead.City || null,
      State: lead.State || null,
      PostalCode: lead.Zipcode || null,
      LeadSource: 'Facebook',
      Status: 'Open',
      LastName: 'Lead', // Required field, using placeholder
      // Custom fields from CSV
      Description: `Enriched from incomplete form submission. Original submission: ${lead['Ll submission time utc'] || lead.Created}`,
      // UTM parameters
      utm_source__c: lead.Utm_source || null,
      utm_medium__c: lead.Utm_medium || null,
      utm_campaign__c: lead.Utm_campaign || null,
      utm_term__c: lead.Utm_term || null,
      utm_content__c: lead.Utm_content || null,
    };
  });

  console.log(`Prepared ${salesforceLeads.length} leads for Salesforce`);

  // Save enriched leads data for review
  console.log('\nStep 7: Saving enriched leads data...');
  const enrichedData = {
    timestamp: new Date().toISOString(),
    totalEnriched: enrichedLeads.length,
    leads: enrichedLeads.map(lead => ({
      website: lead.normalizedWebsite,
      businessName: lead.enrichedBusinessName,
      phone: lead.enrichedPhone,
      city: lead.City,
      state: lead.State,
      zipcode: lead.Zipcode
    })),
    salesforceLeads: salesforceLeads
  };

  fs.writeFileSync(
    path.join(__dirname, 'enriched_leads_data.json'),
    JSON.stringify(enrichedData, null, 2)
  );

  console.log('\n✅ Enrichment complete!');
  console.log(`\nNext step: Import ${salesforceLeads.length} leads to Salesforce`);
  console.log(`Enriched data saved to: enriched_leads_data.json`);

  return salesforceLeads;
}

// Run if called directly
if (require.main === module) {
  main()
    .then(leads => {
      if (leads && leads.length > 0) {
        console.log('\n=== READY FOR SALESFORCE IMPORT ===');
        console.log('Run the Salesforce import script to complete the process.');
      }
      process.exit(0);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { main };
