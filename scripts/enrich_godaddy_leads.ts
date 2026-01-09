import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { PeopleDataLabsService } from '../src/services/peopleDataLabs';
import { GooglePlacesService } from '../src/services/googlePlaces';
import { calculateFitScore } from '../src/services/fitScore';
import { LeadPayload, EnrichmentData } from '../src/types/lead';

// Load environment variables
dotenv.config();

const INPUT_FILE = 'GoDaddy Roofing Leads(Meta Export).csv';
const OUTPUT_FILE = 'GoDaddy Roofing Leads(Enriched).csv';

// CSV Parser handling quotes and newlines
function parseCSV(content: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          currentField += '"';
          i++; // Skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentField);
        currentField = '';
      } else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
        if (char === '\r') i++;
      } else if (char === '\r') {
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
      } else {
        currentField += char;
      }
    }
  }
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }
  return rows;
}

// CSV Writer
function toCSV(rows: (string | number | boolean | null | undefined)[][]): string {
  return rows.map(row => {
    return row.map(field => {
      if (field === null || field === undefined) return '';
      const stringField = String(field);
      if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n')) {
        return `"${stringField.replace(/"/g, '""')}"`;
      }
      return stringField;
    }).join(',');
  }).join('\n');
}

async function main() {
  const pdlApiKey = process.env.PDL_API_KEY;
  const googlePlacesApiKey = process.env.GOOGLE_PLACES_API_KEY;

  if (!pdlApiKey || !googlePlacesApiKey) {
    console.error('Error: PDL_API_KEY and GOOGLE_PLACES_API_KEY must be set in .env');
    process.exit(1);
  }

  const pdlService = new PeopleDataLabsService(pdlApiKey);
  const googlePlacesService = new GooglePlacesService(googlePlacesApiKey);

  console.log(`Reading input file: ${INPUT_FILE}`);
  const fileContent = fs.readFileSync(INPUT_FILE, 'utf-8');
  const rows = parseCSV(fileContent);

  if (rows.length < 2) {
    console.error('Error: CSV file is empty or invalid');
    process.exit(1);
  }

  const headers = rows[0];
  const dataRows = rows.slice(1);

  // Map headers to indices
  const getIndex = (name: string) => headers.findIndex(h => h.trim() === name);
  
  const idxDomain = getIndex('Domain');
  const idxCompany = getIndex('Company Name');
  const idxPhone = getIndex('Telephones');
  const idxCity = getIndex('City');
  const idxState = getIndex('State');
  const idxZip = getIndex('Postcode');

  console.log(`Found ${dataRows.length} rows to process.`);

  const enrichedRows: any[][] = [];
  const newHeaders = [
    ...headers,
    'Fit Score',
    'GMB Matched',
    'GMB Name',
    'GMB Rating',
    'GMB Reviews',
    'GMB Address',
    'PDL Employee Count',
    'PDL Industry',
    'PDL Revenue',
    'Fit Score Breakdown'
  ];
  enrichedRows.push(newHeaders);

  // Process rows sequentially to avoid rate limits and better logging
  // Only process first 5 for testing if needed, but user asked for "each row".
  // Given 652KB file, likely hundreds of rows. Rate limiting in services will help.
  
  let count = 0;
  for (const row of dataRows) {
    count++;
    if (row.length < headers.length) continue; // Skip malformed rows

    const businessName = row[idxCompany] || '';
    const website = row[idxDomain] || '';
    // Extract first phone number if multiple
    const phoneRaw = row[idxPhone] || '';
    const phone = phoneRaw.split('\n')[0].trim(); 
    
    const city = row[idxCity] || '';
    const state = row[idxState] || '';
    const zip = row[idxZip] || '';

    console.log(`[${count}/${dataRows.length}] Processing: ${businessName || website}`);

    const leadPayload: LeadPayload = {
      lead_id: `csv-${count}`,
      business_name: businessName,
      website: website,
      phone: phone,
      city: city,
      state: state,
    };

    let enrichmentData: EnrichmentData = {};

    // 1. PDL Enrichment
    try {
      const pdlData = await pdlService.enrichCompany(leadPayload);
      if (pdlData) {
        enrichmentData.pdl = pdlData;
      }
    } catch (e) {
      console.error(`Error enriching PDL for ${businessName}:`, e);
    }

    // 2. Google Places Enrichment
    try {
      const placesData = await googlePlacesService.enrich(
        businessName || website, // Fallback to website if name missing
        phone,
        city,
        state,
        website,
        undefined, // Address (street) not reliably in CSV
        zip
      );
      if (placesData) {
        enrichmentData.google_places = placesData;
      }
    } catch (e) {
      console.error(`Error enriching Google Places for ${businessName}:`, e);
    }

    // 3. Fit Score
    const fitScoreResult = calculateFitScore(enrichmentData);

    // Append data
    const newRow = [...row];
    newRow.push(fitScoreResult.fit_score);
    newRow.push(enrichmentData.google_places ? 'Yes' : 'No');
    newRow.push(enrichmentData.google_places?.gmb_name || '');
    newRow.push(enrichmentData.google_places?.gmb_rating || '');
    newRow.push(enrichmentData.google_places?.gmb_review_count || '');
    newRow.push(enrichmentData.google_places?.gmb_address || '');
    newRow.push(enrichmentData.pdl?.employee_count || enrichmentData.pdl?.size_range || '');
    newRow.push(enrichmentData.pdl?.industry || '');
    newRow.push(enrichmentData.pdl?.inferred_revenue || '');
    newRow.push(JSON.stringify(fitScoreResult.score_breakdown));

    enrichedRows.push(newRow);
    
    // Optional: save progress periodically or just wait for end
  }

  console.log(`Writing output to: ${OUTPUT_FILE}`);
  fs.writeFileSync(OUTPUT_FILE, toCSV(enrichedRows));
  console.log('Done.');
}

main().catch(console.error);
