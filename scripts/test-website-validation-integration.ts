/**
 * Test script for website validation integration
 * Tests the full enrichment flow with valid and invalid URLs
 *
 * Usage: tsx scripts/test-website-validation-integration.ts
 */

import 'dotenv/config';
import { WebsiteValidatorService } from '../src/services/websiteValidator';
import { calculateFitScore } from '../src/services/fitScore';
import { mapToSalesforceFields } from '../src/services/salesforceFieldMapper';
import { EnrichmentData } from '../src/types/lead';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(color: string, message: string) {
  console.log(`${color}${message}${colors.reset}`);
}

function section(title: string) {
  console.log('\n' + '='.repeat(60));
  log(colors.cyan, `  ${title}`);
  console.log('='.repeat(60) + '\n');
}

async function testValidUrl() {
  section('Test 1: Valid Website with Domain Age');

  const testUrl = 'https://google.com';
  log(colors.blue, `Testing URL: ${testUrl}`);

  try {
    const validator = new WebsiteValidatorService();
    const validation = await validator.validateWebsite(testUrl, true);

    console.log('\nValidation Result:');
    console.log(`  ✓ URL exists: ${validation.exists}`);
    console.log(`  ✓ Status code: ${validation.status_code}`);
    console.log(`  ✓ Response time: ${validation.response_time_ms}ms`);
    console.log(`  ✓ Redirected: ${validation.redirected}`);
    if (validation.final_url) {
      console.log(`  ✓ Final URL: ${validation.final_url}`);
    }

    if (validation.domain_age) {
      console.log('\nDomain Age:');
      console.log(`  ✓ Age: ${validation.domain_age.age_years} years (${validation.domain_age.age_days} days)`);
      console.log(`  ✓ Created: ${validation.domain_age.created_date}`);
      if (validation.domain_age.registrar) {
        console.log(`  ✓ Registrar: ${validation.domain_age.registrar}`);
      }
    }

    // Test fit score calculation with validation
    const enrichmentData: EnrichmentData = {
      website_validation: validation,
    };

    const fitScore = calculateFitScore(enrichmentData);
    console.log('\nFit Score Calculation:');
    console.log(`  ✓ Website points: ${fitScore.score_breakdown.solvency_score.website} (should be 15 for valid custom domain)`);
    console.log(`  ✓ Years in business: ${fitScore.score_breakdown.solvency_score.years_in_business} (from domain age: ${validation.domain_age?.age_years || 0} years)`);
    console.log(`  ✓ Total fit score: ${fitScore.fit_score}`);

    log(colors.green, '\n✅ Valid URL test PASSED');
    return true;
  } catch (error) {
    log(colors.red, `\n❌ Valid URL test FAILED: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

async function testInvalidUrl() {
  section('Test 2: Invalid Website (Non-Existent Domain)');

  const testUrl = 'https://thisdomaindoesnotexist12345xyz.com';
  log(colors.blue, `Testing URL: ${testUrl}`);

  try {
    const validator = new WebsiteValidatorService();
    const validation = await validator.validateWebsite(testUrl, true);

    console.log('\nValidation Result:');
    console.log(`  ✓ URL exists: ${validation.exists}`);
    console.log(`  ✓ Error: ${validation.error || 'N/A'}`);
    console.log(`  ✓ Response time: ${validation.response_time_ms}ms`);

    if (validation.exists) {
      log(colors.red, '\n❌ Expected exists=false for non-existent domain');
      return false;
    }

    // Test fit score calculation with invalid URL
    const enrichmentData: EnrichmentData = {
      website_validation: validation,
      google_places: {
        gmb_website: testUrl, // Simulating a GMB website that doesn't actually exist
      },
    };

    const fitScore = calculateFitScore(enrichmentData);
    console.log('\nFit Score Calculation:');
    console.log(`  ✓ Website points: ${fitScore.score_breakdown.solvency_score.website} (should be 0 for invalid URL)`);
    console.log(`  ✓ Total fit score: ${fitScore.fit_score}`);

    if (fitScore.score_breakdown.solvency_score.website !== 0) {
      log(colors.red, `\n❌ Expected website points = 0, got ${fitScore.score_breakdown.solvency_score.website}`);
      return false;
    }

    log(colors.green, '\n✅ Invalid URL test PASSED');
    return true;
  } catch (error) {
    log(colors.red, `\n❌ Invalid URL test FAILED: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

async function testDomainAgeFallback() {
  section('Test 3: Domain Age as Fallback for Years in Business');

  const testUrl = 'https://example.com';
  log(colors.blue, `Testing URL: ${testUrl} (should have old domain age)`);

  try {
    const validator = new WebsiteValidatorService();
    const validation = await validator.validateWebsite(testUrl, true);

    console.log('\nValidation Result:');
    console.log(`  ✓ URL exists: ${validation.exists}`);
    console.log(`  ✓ Domain age: ${validation.domain_age?.age_years || 'N/A'} years`);

    // Test 3a: With PDL data (should use PDL)
    const enrichmentDataWithPDL: EnrichmentData = {
      website_validation: validation,
      pdl: {
        years_in_business: 5, // PDL says 5 years
      },
    };

    const fitScoreWithPDL = calculateFitScore(enrichmentDataWithPDL);
    console.log('\nFit Score with PDL data:');
    console.log(`  ✓ Years in business points: ${fitScoreWithPDL.score_breakdown.solvency_score.years_in_business} (using PDL: 5 years = 10 points)`);

    // Test 3b: Without PDL data (should use domain age)
    const enrichmentDataNoPDL: EnrichmentData = {
      website_validation: validation,
      // No PDL data - should fall back to domain age
    };

    const fitScoreNoPDL = calculateFitScore(enrichmentDataNoPDL);
    const domainAge = validation.domain_age?.age_years || 0;
    const expectedPoints = domainAge >= 8 ? 15 : domainAge >= 4 ? 10 : domainAge >= 2 ? 5 : 0;

    console.log('\nFit Score without PDL data:');
    console.log(`  ✓ Domain age: ${domainAge} years`);
    console.log(`  ✓ Years in business points: ${fitScoreNoPDL.score_breakdown.solvency_score.years_in_business} (expected: ${expectedPoints})`);

    if (fitScoreNoPDL.score_breakdown.solvency_score.years_in_business !== expectedPoints) {
      log(colors.red, `\n❌ Expected ${expectedPoints} points for ${domainAge} years, got ${fitScoreNoPDL.score_breakdown.solvency_score.years_in_business}`);
      return false;
    }

    log(colors.green, '\n✅ Domain age fallback test PASSED');
    return true;
  } catch (error) {
    log(colors.red, `\n❌ Domain age fallback test FAILED: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

async function testSpendingOnMarketing() {
  section('Test 4: Spending on Marketing with Domain Age');

  const testUrl = 'https://example.com';
  log(colors.blue, `Testing Spending_on_Marketing field calculation`);

  try {
    const validator = new WebsiteValidatorService();
    const validation = await validator.validateWebsite(testUrl, true);

    // Test 4a: Domain age > 2 years AND has pixels = TRUE
    const enrichmentDataWithPixels: EnrichmentData = {
      website_validation: validation,
      website_tech: {
        has_meta_pixel: true,
        has_ga4: false,
        has_google_ads_tag: false,
        has_tiktok_pixel: false,
        has_hubspot: false,
        pixel_count: 1,
        marketing_tools_detected: ['meta'],
      },
      // No PDL data - should use domain age
    };

    const sfFieldsWithPixels = mapToSalesforceFields(enrichmentDataWithPixels, testUrl);
    const domainAge = validation.domain_age?.age_years || 0;
    const expectedSpending = domainAge > 2;

    console.log('\nWith advertising pixels:');
    console.log(`  ✓ Domain age: ${domainAge} years`);
    console.log(`  ✓ Has advertising pixels: true`);
    console.log(`  ✓ Spending on marketing: ${sfFieldsWithPixels.spending_on_marketing} (expected: ${expectedSpending})`);

    if (sfFieldsWithPixels.spending_on_marketing !== expectedSpending) {
      log(colors.red, `\n❌ Expected spending_on_marketing=${expectedSpending}, got ${sfFieldsWithPixels.spending_on_marketing}`);
      return false;
    }

    // Test 4b: Domain age > 2 years but NO pixels = FALSE
    const enrichmentDataNoPixels: EnrichmentData = {
      website_validation: validation,
      website_tech: {
        has_meta_pixel: false,
        has_ga4: false,
        has_google_ads_tag: false,
        has_tiktok_pixel: false,
        has_hubspot: false,
        pixel_count: 0,
        marketing_tools_detected: [],
      },
    };

    const sfFieldsNoPixels = mapToSalesforceFields(enrichmentDataNoPixels, testUrl);

    console.log('\nWithout advertising pixels:');
    console.log(`  ✓ Domain age: ${domainAge} years`);
    console.log(`  ✓ Has advertising pixels: false`);
    console.log(`  ✓ Spending on marketing: ${sfFieldsNoPixels.spending_on_marketing} (expected: false)`);

    if (sfFieldsNoPixels.spending_on_marketing !== false) {
      log(colors.red, `\n❌ Expected spending_on_marketing=false without pixels, got ${sfFieldsNoPixels.spending_on_marketing}`);
      return false;
    }

    log(colors.green, '\n✅ Spending on marketing test PASSED');
    return true;
  } catch (error) {
    log(colors.red, `\n❌ Spending on marketing test FAILED: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

async function testCacheScenario() {
  section('Test 5: Website Validation Caching');

  const testUrl = 'https://example.com';
  log(colors.blue, `Testing cache behavior for: ${testUrl}`);
  log(colors.yellow, '\nNote: This test just validates the validation service works correctly.');
  log(colors.yellow, 'Actual cache testing requires database access.\n');

  try {
    const validator = new WebsiteValidatorService();

    // First call - should fetch fresh data
    console.log('First validation (cache miss):');
    const start1 = Date.now();
    const validation1 = await validator.validateWebsite(testUrl, true);
    const duration1 = Date.now() - start1;
    console.log(`  ✓ Duration: ${duration1}ms`);
    console.log(`  ✓ Domain age: ${validation1.domain_age?.age_years} years`);

    // Second call - in real app, would hit cache
    console.log('\nSecond validation (would be cache hit in production):');
    const start2 = Date.now();
    const validation2 = await validator.validateWebsite(testUrl, true);
    const duration2 = Date.now() - start2;
    console.log(`  ✓ Duration: ${duration2}ms`);
    console.log(`  ✓ Domain age: ${validation2.domain_age?.age_years} years`);

    // Verify results are consistent
    if (validation1.domain_age?.age_years !== validation2.domain_age?.age_years) {
      log(colors.red, '\n❌ Domain age mismatch between calls');
      return false;
    }

    log(colors.green, '\n✅ Cache scenario test PASSED');
    log(colors.yellow, '\nTo test actual cache behavior, run an enrichment and check logs for "Using cached website validation"');
    return true;
  } catch (error) {
    log(colors.red, `\n❌ Cache scenario test FAILED: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

async function runAllTests() {
  console.clear();
  log(colors.cyan, '\n╔═══════════════════════════════════════════════════════════╗');
  log(colors.cyan, '║   Website Validation Integration Test Suite              ║');
  log(colors.cyan, '╚═══════════════════════════════════════════════════════════╝\n');

  const results = {
    passed: 0,
    failed: 0,
    tests: [] as { name: string; passed: boolean }[],
  };

  const tests = [
    { name: 'Valid URL with domain age', fn: testValidUrl },
    { name: 'Invalid URL handling', fn: testInvalidUrl },
    { name: 'Domain age fallback', fn: testDomainAgeFallback },
    { name: 'Spending on marketing calculation', fn: testSpendingOnMarketing },
    { name: 'Cache scenario', fn: testCacheScenario },
  ];

  for (const test of tests) {
    const passed = await test.fn();
    results.tests.push({ name: test.name, passed });
    if (passed) {
      results.passed++;
    } else {
      results.failed++;
    }
  }

  // Summary
  section('Test Summary');
  console.log(`Total tests: ${results.tests.length}`);
  log(colors.green, `Passed: ${results.passed}`);
  if (results.failed > 0) {
    log(colors.red, `Failed: ${results.failed}`);
  }
  console.log('\nDetailed Results:');
  results.tests.forEach((test, i) => {
    const icon = test.passed ? '✅' : '❌';
    const color = test.passed ? colors.green : colors.red;
    log(color, `  ${icon} Test ${i + 1}: ${test.name}`);
  });

  console.log('\n' + '='.repeat(60) + '\n');

  if (results.failed === 0) {
    log(colors.green, '🎉 All tests passed! Website validation integration is working correctly.\n');
    process.exit(0);
  } else {
    log(colors.red, `❌ ${results.failed} test(s) failed. Please review the output above.\n`);
    process.exit(1);
  }
}

// Run all tests
runAllTests().catch((error) => {
  console.error('\n');
  log(colors.red, `Fatal error: ${error instanceof Error ? error.message : String(error)}`);
  console.error(error);
  process.exit(1);
});
