import { Connection } from 'jsforce';
import { GooglePlacesService } from '../src/services/googlePlaces';
import { logger } from '../src/utils/logger';

/**
 * Test GMB match rate improvements by fetching leads from Salesforce and re-enriching
 * Usage: npx ts-node scripts/test-gmb-match-rate-sf.ts [sample-size]
 */

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY || '';
const SFDC_USERNAME = process.env.SFDC_USERNAME || '';
const SFDC_PASSWORD = process.env.SFDC_PASSWORD || '';
const SFDC_SECURITY_TOKEN = process.env.SFDC_SECURITY_TOKEN || '';
const SFDC_LOGIN_URL = process.env.SFDC_LOGIN_URL || 'https://login.salesforce.com';

async function testMatchRate(sampleSize: number = 200) {
  if (!GOOGLE_PLACES_API_KEY) {
    console.error('Missing required environment variable: GOOGLE_PLACES_API_KEY');
    process.exit(1);
  }

  if (!SFDC_USERNAME || !SFDC_PASSWORD || !SFDC_SECURITY_TOKEN) {
    console.error('Missing required Salesforce credentials: SFDC_USERNAME, SFDC_PASSWORD, SFDC_SECURITY_TOKEN');
    process.exit(1);
  }

  const connection = new Connection({ loginUrl: SFDC_LOGIN_URL });
  const googlePlaces = new GooglePlacesService(GOOGLE_PLACES_API_KEY);

  try {
    console.log(`\n🔐 Logging into Salesforce...\n`);
    await connection.login(SFDC_USERNAME, SFDC_PASSWORD + SFDC_SECURITY_TOKEN);
    console.log(`✅ Connected to Salesforce\n`);

    console.log(`\n🔍 Fetching ${sampleSize} leads from Salesforce...\n`);

    // Fetch leads that have business info (company name, city, state)
    // Use SOQL LIMIT with ORDER BY to get a random-ish sample
    const result = await connection.query<{
      Id: string;
      Company: string;
      Phone: string;
      City: string;
      State: string;
      Website: string;
      Street: string;
      PostalCode: string;
    }>(`
      SELECT Id, Company, Phone, City, State, Website, Street, PostalCode
      FROM Lead
      WHERE Company != null
        AND City != null
        AND State != null
        AND IsConverted = false
      ORDER BY CreatedDate DESC
      LIMIT ${sampleSize}
    `);

    const leads = result.records;
    console.log(`Found ${leads.length} leads to test\n`);

    let processed = 0;
    const startTime = Date.now();

    // Process each lead
    for (const lead of leads) {
      processed++;
      if (processed % 20 === 0) {
        console.log(`Progress: ${processed}/${leads.length} (${Math.round(processed/leads.length*100)}%)`);
      }

      try {
        await googlePlaces.enrich(
          lead.Company,
          lead.Phone || undefined,
          lead.City,
          lead.State,
          lead.Website || undefined,
          lead.Street || undefined,
          lead.PostalCode || undefined
        );
      } catch (error) {
        logger.error('Enrichment failed for lead', {
          leadId: lead.Id,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      // Small delay to respect rate limits (beyond the built-in 1/sec)
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const duration = (Date.now() - startTime) / 1000;

    // Get statistics
    const stats = GooglePlacesService.getMatchStats();

    console.log('\n' + '='.repeat(60));
    console.log('GMB MATCH RATE TEST RESULTS');
    console.log('='.repeat(60));
    console.log(`\nTotal leads tested: ${stats.totalAttempts}`);
    console.log(`Successful matches: ${stats.totalMatches}`);
    console.log(`Match rate: ${stats.matchRate}%`);
    console.log(`\nBaseline (historical): 25%`);
    console.log(`Improvement: ${stats.matchRate >= 25 ? '+' : ''}${(stats.matchRate - 25).toFixed(1)} percentage points`);
    console.log(`\nDuration: ${Math.round(duration)}s (${(duration/60).toFixed(1)} minutes)`)  ;

    console.log('\n' + '-'.repeat(60));
    console.log('TOP PERFORMING STRATEGIES');
    console.log('-'.repeat(60));

    stats.topStrategies.slice(0, 10).forEach((s, i) => {
      console.log(`${i + 1}. ${s.strategy}: ${s.count} matches (${s.percentage.toFixed(1)}% of total)`);
    });

    console.log('\n' + '-'.repeat(60));
    console.log('ALL STRATEGY RESULTS');
    console.log('-'.repeat(60));

    Object.entries(stats.strategySuccesses)
      .sort(([,a], [,b]) => b - a)
      .forEach(([strategy, count]) => {
        const pct = stats.totalMatches > 0 ? (count / stats.totalMatches) * 100 : 0;
        console.log(`${strategy}: ${count} (${pct.toFixed(1)}%)`);
      });

    console.log('\n✅ Test complete!\n');

  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

// Parse command line args
const sampleSize = parseInt(process.argv[2] || '200');
testMatchRate(sampleSize);
