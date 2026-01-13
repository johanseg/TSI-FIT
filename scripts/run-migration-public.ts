/**
 * Run database migration using Railway's public DATABASE_URL
 * Usage: railway run npx tsx scripts/run-migration-public.ts
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
  // Use public DATABASE_URL
  const dbUrl = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;

  if (!dbUrl) {
    log(colors.red, '\n❌ No DATABASE_URL found');
    process.exit(1);
  }

  log(colors.cyan, '\n🔧 Running Database Migration 009\n');
  log(colors.yellow, `Using ${process.env.DATABASE_PUBLIC_URL ? 'PUBLIC' : 'internal'} database URL`);
  log(colors.yellow, `Host: ${new URL(dbUrl).hostname}\n`);

  const pool = new Pool({
    connectionString: dbUrl,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    // Test connection
    await pool.query('SELECT NOW()');
    log(colors.green, '✓ Database connected\n');

    // Check if already applied
    const check = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'lead_enrichments' AND column_name = 'website_validation_data'
    `);

    if (check.rows.length > 0) {
      log(colors.yellow, '⚠️  Migration already applied');
      log(colors.green, '✅ Database is up to date!\n');
      process.exit(0);
    }

    log(colors.cyan, 'Applying migration...\n');

    // Add column
    log(colors.cyan, '1. Adding column...');
    await pool.query('ALTER TABLE lead_enrichments ADD COLUMN website_validation_data JSONB');
    log(colors.green, '   ✓ Column added');

    // Create index (using btree for text field, or gin_trgm_ops if pg_trgm is available)
    log(colors.cyan, '2. Creating index...');
    try {
      // Try with gin_trgm_ops first (for pattern matching)
      await pool.query(`
        CREATE INDEX idx_enrichments_website_validation_url
        ON lead_enrichments USING gin ((website_validation_data->>'url') gin_trgm_ops)
      `);
      log(colors.green, '   ✓ GIN index created (with pg_trgm)');
    } catch (err: any) {
      // Fallback to btree if pg_trgm extension is not available
      if (err.code === '42704' || err.message.includes('operator class')) {
        log(colors.yellow, '   ! pg_trgm not available, using btree index');
        await pool.query(`
          CREATE INDEX idx_enrichments_website_validation_url
          ON lead_enrichments ((website_validation_data->>'url'))
        `);
        log(colors.green, '   ✓ Btree index created');
      } else {
        throw err;
      }
    }

    // Add comment
    log(colors.cyan, '3. Adding comment...');
    await pool.query(`
      COMMENT ON COLUMN lead_enrichments.website_validation_data IS
      'Cached website validation results including URL existence check, domain age from WHOIS, and response time. TTL: 30 days.'
    `);
    log(colors.green, '   ✓ Comment added');

    log(colors.green, '\n✅ Migration completed successfully!\n');

  } catch (error) {
    log(colors.red, '\n❌ Migration failed!');
    console.error(error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
