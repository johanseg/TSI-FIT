#!/bin/bash
# Run database migration on Railway
# Usage: ./scripts/railway-migrate.sh

set -e

echo "🚂 Running migration on Railway database..."
echo ""

# Check if railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not found. Install it first:"
    echo "   npm install -g @railway/cli"
    exit 1
fi

# Check if project is linked
if ! railway status &> /dev/null; then
    echo "⚠️  No Railway project linked."
    echo "Run: railway link"
    exit 1
fi

echo "✓ Railway CLI found and project linked"
echo ""

# Run migration using Node.js script
echo "Executing migration script..."
railway run npx tsx scripts/run-migration.ts

echo ""
echo "✅ Migration complete!"
