/**
 * Run database migration 009: Add website_validation_data column
 *
 * Usage: npx tsx scripts/run-migration.ts
 */

import 'dotenv/config';
import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';

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
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    log(colors.cyan, '\n🔧 Running Database Migration 009: Add website_validation_data column\n');

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

    // Read migration file
    const migrationPath = join(__dirname, '..', 'migrations', '009_add_website_validation.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf-8');

    log(colors.cyan, '\nExecuting migration SQL...');
    console.log(colors.yellow + migrationSQL + colors.reset);

    // Execute migration
    await pool.query(migrationSQL);

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
      log(colors.green, `✓ Column created: ${verifyResult.rows[0].column_name} (${verifyResult.rows[0].data_type})`);
    }

    // Check index
    const indexResult = await pool.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'lead_enrichments'
      AND indexname = 'idx_enrichments_website_validation_url'
    `);

    if (indexResult.rows.length > 0) {
      log(colors.green, `✓ Index created: ${indexResult.rows[0].indexname}`);
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
