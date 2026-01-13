#!/usr/bin/env node
/**
 * Simple migration script that can be deployed to Railway
 * Run this as a one-off command in Railway dashboard
 */

const { Pool } = require('pg');

async function runMigration() {
  console.log('🔧 Starting migration...\n');

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    // Test connection
    await pool.query('SELECT NOW()');
    console.log('✓ Database connected\n');

    // Check if already applied
    const check = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'lead_enrichments' AND column_name = 'website_validation_data'
    `);

    if (check.rows.length > 0) {
      console.log('⚠️  Migration already applied');
      process.exit(0);
    }

    console.log('Applying migration...');

    // Add column
    await pool.query('ALTER TABLE lead_enrichments ADD COLUMN website_validation_data JSONB');
    console.log('✓ Column added');

    // Create index
    await pool.query(`
      CREATE INDEX idx_enrichments_website_validation_url
      ON lead_enrichments USING gin ((website_validation_data->>'url'))
    `);
    console.log('✓ Index created');

    // Add comment
    await pool.query(`
      COMMENT ON COLUMN lead_enrichments.website_validation_data IS
      'Cached website validation results. TTL: 30 days.'
    `);
    console.log('✓ Comment added');

    console.log('\n✅ Migration completed successfully!\n');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
