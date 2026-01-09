const { Pool } = require('pg');

const pool = new Pool({
  host: 'ballast.proxy.rlwy.net',
  port: 30059,
  database: 'railway',
  user: 'postgres',
  password: 'IPjlJsGZRqolbRIINZRHwiRJmrxiVAls',
});

async function query() {
  try {
    const result = await pool.query(
      `SELECT 
        id,
        created_at,
        fit_score,
        salesforce_updated,
        salesforce_updated_at,
        error_message,
        has_website,
        has_gmb,
        location_type,
        number_of_gbp_reviews,
        spending_on_marketing
       FROM lead_enrichments 
       WHERE salesforce_lead_id = $1
       ORDER BY created_at DESC`,
      ['00QNv00000Sra3dMAB']
    );
    
    console.log('=== Enrichment #1 (Most Recent) ===');
    console.log(JSON.stringify(result.rows[0], null, 2));
    console.log('\n=== Enrichment #2 (Earlier) ===');
    console.log(JSON.stringify(result.rows[1], null, 2));
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

query();
