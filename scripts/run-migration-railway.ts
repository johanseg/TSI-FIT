/**
 * Run database migration 009 specifically for Railway environment
 * This uses the Railway-provided DATABASE_URL which includes internal hostnames
 *
 * Usage: railway run npx tsx scripts/run-migration-railway.ts
 */

import { Pool } from 'pg';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

function log(color: string, message: string) {
  console.log(`${color}${message}${colors.reset}`);
}

async function runMigration() {
  // Use DATABASE_URL from environment (provided by Railway)
  if (!process.env.DATABASE_URL) {
    log(colors.red, '\n❌ DATABASE_URL environment variable not found');
    log(colors.yellow, 'Make sure to run this with: railway run npx tsx scripts/run-migration-railway.ts\n');
    process.exit(1);
  }

  log(colors.cyan, `\nConnecting to database...`);
  log(colors.yellow, `Host: ${new URL(process.env.DATABASE_URL).hostname}\n`);

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false // Railway uses SSL
    }
  });

  try {
    log(colors.cyan, '🔧 Running Database Migration 009: Add website_validation_data column\n');

    // Test connection first
    await pool.query('SELECT NOW()');
    log(colors.green, '✓ Database connection successful\n');

    // Check if column already exists
    log(colors.yellow, 'Checking if migration is needed...');
    const checkResult = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'lead_enrichments'
      AND column_name = 'website_validation_data'
    `);

    if (checkResult.rows.length > 0) {
      log(colors.yellow, '\n⚠️  Migration already applied - website_validation_data column exists');
      log(colors.green, '✅ Database is up to date!\n');
      await pool.end();
      return;
    }

    // Run migration
    log(colors.cyan, '\nExecuting migration...\n');

    // Step 1: Add column
    log(colors.cyan, '1. Adding website_validation_data column...');
    await pool.query(`
      ALTER TABLE lead_enrichments
      ADD COLUMN website_validation_data JSONB
    `);
    log(colors.green, '   ✓ Column added');

    // Step 2: Create index
    log(colors.cyan, '2. Creating GIN index...');
    await pool.query(`
      CREATE INDEX idx_enrichments_website_validation_url
      ON lead_enrichments
      USING gin ((website_validation_data->>'url'))
    `);
    log(colors.green, '   ✓ Index created');

    // Step 3: Add comment
    log(colors.cyan, '3. Adding column comment...');
    await pool.query(`
      COMMENT ON COLUMN lead_enrichments.website_validation_data IS
      'Cached website validation results including URL existence check, domain age from WHOIS, and response time. TTL: 30 days.'
    `);
    log(colors.green, '   ✓ Comment added');

    log(colors.green, '\n✅ Migration completed successfully!\n');

    // Verify migration
    log(colors.cyan, 'Verifying migration...');
    const verifyResult = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'lead_enrichments'
      AND column_name = 'website_validation_data'
    `);

    if (verifyResult.rows.length > 0) {
      log(colors.green, `✓ Column verified: ${verifyResult.rows[0].column_name} (${verifyResult.rows[0].data_type})`);
    }

    // Check index
    const indexResult = await pool.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'lead_enrichments'
      AND indexname = 'idx_enrichments_website_validation_url'
    `);

    if (indexResult.rows.length > 0) {
      log(colors.green, `✓ Index verified: ${indexResult.rows[0].indexname}`);
    }

    log(colors.green, '\n🎉 Database migration complete! Ready to deploy.\n');

  } catch (error) {
    log(colors.red, '\n❌ Migration failed!');
    console.error(error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
