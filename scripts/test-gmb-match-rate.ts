import { Pool } from 'pg';
import { GooglePlacesService } from '../src/services/googlePlaces';
import { logger } from '../src/utils/logger';

/**
 * Test GMB match rate improvements by re-enriching a sample of historical leads
 * Usage: npx ts-node scripts/test-gmb-match-rate.ts [sample-size]
 */

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY || '';
const DATABASE_URL = process.env.DATABASE_URL || '';

async function testMatchRate(sampleSize: number = 200) {
  if (!GOOGLE_PLACES_API_KEY || !DATABASE_URL) {
    console.error('Missing required environment variables: GOOGLE_PLACES_API_KEY, DATABASE_URL');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: DATABASE_URL });
  const googlePlaces = new GooglePlacesService(GOOGLE_PLACES_API_KEY);

  try {
    console.log(`\n🔍 Testing GMB match rate on ${sampleSize} leads...\n`);

    // Fetch sample of leads with business info but no GMB data yet
    // Prioritize leads with city/state/phone for best test coverage
    const { rows: leads } = await pool.query(`
      SELECT
        id,
        salesforce_lead_id,
        business_name as company,
        phone,
        city,
        state,
        website,
        address as street,
        zip
      FROM leads
      WHERE business_name IS NOT NULL
        AND city IS NOT NULL
        AND state IS NOT NULL
      ORDER BY RANDOM()
      LIMIT $1
    `, [sampleSize]);

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
          lead.company,
          lead.phone,
          lead.city,
          lead.state,
          lead.website,
          lead.street,
          lead.zip
        );
      } catch (error) {
        logger.error('Enrichment failed for lead', {
          leadId: lead.id,
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
    console.log(`\nDuration: ${Math.round(duration)}s (${(duration/60).toFixed(1)} minutes)`);

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
  } finally {
    await pool.end();
  }
}

// Parse command line args
const sampleSize = parseInt(process.argv[2] || '200');
testMatchRate(sampleSize);
