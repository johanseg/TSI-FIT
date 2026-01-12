/**
 * Test script for website validator service
 *
 * Usage:
 * npm run test-validator <website-url>
 *
 * Examples:
 * npm run test-validator google.com
 * npm run test-validator https://example.com
 * npm run test-validator fantasticplasticautobody.com
 */

import { WebsiteValidatorService } from '../src/services/websiteValidator';

async function main() {
  const url = process.argv[2];

  if (!url) {
    console.error('Usage: npm run test-validator <website-url>');
    console.error('Example: npm run test-validator google.com');
    process.exit(1);
  }

  console.log('='.repeat(60));
  console.log('WEBSITE VALIDATION TEST');
  console.log('='.repeat(60));
  console.log(`Testing URL: ${url}`);
  console.log('');

  const validator = new WebsiteValidatorService(10000, 5);

  try {
    console.log('Step 1: Validating URL existence...');
    const urlCheck = await validator.validateUrl(url);

    console.log('');
    console.log('URL Validation Results:');
    console.log('-'.repeat(60));
    console.log(`  URL Tested: ${urlCheck.url}`);
    console.log(`  Exists: ${urlCheck.exists ? '✅ YES' : '❌ NO'}`);

    if (urlCheck.exists) {
      console.log(`  Status Code: ${urlCheck.status_code}`);
      console.log(`  Final URL: ${urlCheck.final_url}`);
      console.log(`  Redirected: ${urlCheck.redirected ? 'Yes' : 'No'}`);
      console.log(`  Response Time: ${urlCheck.response_time_ms}ms`);
    } else {
      console.log(`  Error: ${urlCheck.error}`);
    }

    if (urlCheck.exists) {
      console.log('');
      console.log('Step 2: Getting domain age...');
      console.log('(This may take 10-30 seconds for WHOIS lookup)');

      const fullValidation = await validator.validateWebsite(url, true);

      if (fullValidation.domain_age) {
        console.log('');
        console.log('Domain Age Results:');
        console.log('-'.repeat(60));
        console.log(`  Created Date: ${fullValidation.domain_age.created_date || 'Unknown'}`);
        console.log(`  Age (Years): ${fullValidation.domain_age.age_years !== undefined ? fullValidation.domain_age.age_years : 'Unknown'}`);
        console.log(`  Age (Days): ${fullValidation.domain_age.age_days !== undefined ? fullValidation.domain_age.age_days : 'Unknown'}`);
        console.log(`  Registrar: ${fullValidation.domain_age.registrar || 'Unknown'}`);
        console.log(`  Updated Date: ${fullValidation.domain_age.updated_date || 'Unknown'}`);
        console.log(`  Expiry Date: ${fullValidation.domain_age.expiry_date || 'Unknown'}`);

        if (fullValidation.domain_age.age_years !== undefined) {
          console.log('');
          console.log(`  Domain Age Score: ${calculateDomainAgeScoreDisplay(fullValidation.domain_age.age_years)}`);
        }
      } else {
        console.log('');
        console.log('Domain Age Results:');
        console.log('-'.repeat(60));
        console.log('  ⚠️  Could not retrieve domain age (WHOIS lookup failed)');
      }
    }

    console.log('');
    console.log('='.repeat(60));
    console.log('TEST COMPLETE');
    console.log('='.repeat(60));
  } catch (error) {
    console.error('');
    console.error('❌ Error during validation:', error);
    process.exit(1);
  }
}

function calculateDomainAgeScoreDisplay(ageYears: number): string {
  let score = 0;
  let label = '';

  if (ageYears < 1) {
    score = 0;
    label = 'Very New (<1 year)';
  } else if (ageYears < 3) {
    score = 1;
    label = 'New (1-2 years)';
  } else if (ageYears < 6) {
    score = 2;
    label = 'Established (3-5 years)';
  } else if (ageYears < 11) {
    score = 3;
    label = 'Mature (6-10 years)';
  } else if (ageYears < 16) {
    score = 4;
    label = 'Well-Established (11-15 years)';
  } else {
    score = 5;
    label = 'Very Mature (16+ years)';
  }

  return `${score}/5 points - ${label}`;
}

main();
