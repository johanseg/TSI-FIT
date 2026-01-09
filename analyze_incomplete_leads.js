const fs = require('fs');
const path = require('path');

/**
 * Detailed analysis of incomplete leads
 */

const CSV_INPUT = path.join(__dirname, 'leads_not_in_salesforce.csv');

// Parse CSV manually
function parseCSV(csvText) {
  const lines = csvText.split('\n');
  const headers = parseCSVLine(lines[0]);
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = parseCSVLine(lines[i]);
    if (values.length === headers.length) {
      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index];
      });
      rows.push(row);
    }
  }

  return { headers, rows };
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());

  return result;
}

function hasValue(val) {
  return val && val.trim() !== '' && val.trim() !== 'N/A';
}

// Main processing function
async function main() {
  console.log('Reading incomplete leads CSV...');
  const csvContent = fs.readFileSync(CSV_INPUT, 'utf-8');
  const { headers, rows } = parseCSV(csvContent);

  console.log(`Found ${rows.length} incomplete leads\n`);

  // Analyze what fields they have
  let stats = {
    hasBusinessName: 0,
    hasPhone: 0,
    hasEmail: 0,
    hasName: 0,
    hasWebsite: 0,
    hasState: 0,
    hasCity: 0,
    hasZipcode: 0,
    hasAnyContact: 0,
    hasMinimumData: 0
  };

  const leadsWithMinimumData = [];

  rows.forEach(row => {
    const businessName = row.Business_name || row['Business name'];
    const phone = row.Phone;
    const email = row.Email;
    const name = row.Name;
    const website = row.Website;
    const state = row.State;
    const city = row.City;
    const zipcode = row.Zipcode;

    if (hasValue(businessName)) stats.hasBusinessName++;
    if (hasValue(phone)) stats.hasPhone++;
    if (hasValue(email)) stats.hasEmail++;
    if (hasValue(name)) stats.hasName++;
    if (hasValue(website)) stats.hasWebsite++;
    if (hasValue(state)) stats.hasState++;
    if (hasValue(city)) stats.hasCity++;
    if (hasValue(zipcode)) stats.hasZipcode++;

    // Has any contact method
    if (hasValue(phone) || hasValue(email)) {
      stats.hasAnyContact++;
    }

    // Minimum data for a lead: (business name OR infer from website) + (phone OR email) + location
    const canInferBusinessName = hasValue(website) && !website.includes('townsquareinteractive.com');
    const hasContactMethod = hasValue(phone) || hasValue(email);
    const hasLocation = hasValue(state) && hasValue(city);

    if ((hasValue(businessName) || canInferBusinessName) && hasContactMethod && hasLocation) {
      stats.hasMinimumData++;
      leadsWithMinimumData.push({
        businessName: businessName || `Business from ${website}`,
        phone: phone || 'N/A',
        email: email || 'N/A',
        website: website || 'N/A',
        city: city || 'N/A',
        state: state || 'N/A',
        zipcode: zipcode || 'N/A'
      });
    }
  });

  console.log('=== DATA COMPLETENESS ANALYSIS ===');
  console.log(`Total Leads: ${rows.length}`);
  console.log(`\nCritical Fields:`);
  console.log(`  Business Name: ${stats.hasBusinessName} (${Math.round(stats.hasBusinessName/rows.length*100)}%)`);
  console.log(`  Phone: ${stats.hasPhone} (${Math.round(stats.hasPhone/rows.length*100)}%)`);
  console.log(`  Email: ${stats.hasEmail} (${Math.round(stats.hasEmail/rows.length*100)}%)`);
  console.log(`  Name: ${stats.hasName} (${Math.round(stats.hasName/rows.length*100)}%)`);
  console.log(`\nSupplementary Fields:`);
  console.log(`  Website: ${stats.hasWebsite} (${Math.round(stats.hasWebsite/rows.length*100)}%)`);
  console.log(`  State: ${stats.hasState} (${Math.round(stats.hasState/rows.length*100)}%)`);
  console.log(`  City: ${stats.hasCity} (${Math.round(stats.hasCity/rows.length*100)}%)`);
  console.log(`  Zipcode: ${stats.hasZipcode} (${Math.round(stats.hasZipcode/rows.length*100)}%)`);

  console.log(`\n=== IMPORT VIABILITY ===`);
  console.log(`Leads with ANY contact method (phone OR email): ${stats.hasAnyContact}`);
  console.log(`Leads with minimum data for import: ${stats.hasMinimumData}`);

  if (leadsWithMinimumData.length > 0) {
    console.log(`\n=== LEADS THAT COULD BE IMPORTED ===`);
    leadsWithMinimumData.forEach((lead, i) => {
      console.log(`\n${i + 1}. ${lead.businessName}`);
      console.log(`   Phone: ${lead.phone}`);
      console.log(`   Email: ${lead.email}`);
      console.log(`   Website: ${lead.website}`);
      console.log(`   Location: ${lead.city}, ${lead.state} ${lead.zipcode}`);
    });
  }

  console.log(`\n=== RECOMMENDATION ===`);
  if (stats.hasAnyContact === 0) {
    console.log('❌ NONE of these 44 leads have contact information (no phone or email).');
    console.log('These appear to be abandoned form submissions where users did not complete the form.');
    console.log('WITHOUT phone or email, these leads cannot be contacted and should NOT be imported.');
  } else if (stats.hasMinimumData > 0) {
    console.log(`✅ ${stats.hasMinimumData} leads have sufficient data to import.`);
  } else {
    console.log('⚠️ Some leads have partial data but are missing critical fields for a viable lead.');
  }
}

main().catch(console.error);
