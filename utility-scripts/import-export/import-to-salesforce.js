const fs = require('fs');
const path = require('path');

/**
 * Read enriched leads data and prepare for Salesforce import
 */

const DATA_FILE = path.join(__dirname, 'enriched_leads_data.json');
const OUTPUT_CSV = path.join(__dirname, 'enriched_leads_imported.csv');

function escapeCSV(value) {
  if (!value) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

async function main() {
  console.log('=== PREPARING LEADS FOR SALESFORCE IMPORT ===\n');

  // Read enriched data
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  const salesforceLeads = data.salesforceLeads;

  console.log(`Total enriched leads: ${salesforceLeads.length}`);
  console.log('\nLead records to import:\n');

  salesforceLeads.forEach((lead, i) => {
    console.log(`${i + 1}. ${lead.Company}`);
    console.log(`   Phone: ${lead.Phone}`);
    console.log(`   Website: ${lead.Website}`);
    console.log(`   Location: ${lead.City}, ${lead.State} ${lead.PostalCode}`);
    console.log('');
  });

  // Save leads to JSON for manual review
  fs.writeFileSync(
    path.join(__dirname, 'salesforce_import_payload.json'),
    JSON.stringify(salesforceLeads, null, 2)
  );

  console.log('✅ Salesforce import payload saved to: salesforce_import_payload.json');
  console.log(`\nReady to import ${salesforceLeads.length} leads to Salesforce`);

  return salesforceLeads;
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Error:', error);
      process.exit(1);
    });
}

module.exports = { main };
