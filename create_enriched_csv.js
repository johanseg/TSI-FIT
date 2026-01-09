const fs = require('fs');
const path = require('path');

/**
 * Create CSV of successfully imported enriched leads
 */

const DATA_FILE = path.join(__dirname, 'enriched_leads_data.json');
const CSV_OUTPUT = path.join(__dirname, 'enriched_leads_imported_to_salesforce.csv');

function escapeCSV(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

async function main() {
  console.log('Creating CSV of imported enriched leads...\n');

  // Read enriched data
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));

  // CSV headers
  const headers = [
    'Business_Name',
    'Phone',
    'Website',
    'City',
    'State',
    'Zipcode',
    'Lead_Source',
    'Status',
    'Submission_Date',
    'Import_Date',
    'Enrichment_Method'
  ];

  // Build CSV rows
  const rows = data.leads.map((lead, index) => {
    const sfLead = data.salesforceLeads[index];

    return [
      escapeCSV(lead.businessName),
      escapeCSV(lead.phone),
      escapeCSV(lead.website),
      escapeCSV(lead.city),
      escapeCSV(lead.state),
      escapeCSV(lead.zipcode),
      escapeCSV('Facebook'),
      escapeCSV('Imported'),
      escapeCSV(sfLead.Description?.match(/Original submission: (.+)/)?.[1] || ''),
      escapeCSV(data.timestamp),
      escapeCSV('Web Scraping')
    ].join(',');
  });

  // Write CSV
  const csvContent = [headers.join(','), ...rows].join('\n');
  fs.writeFileSync(CSV_OUTPUT, csvContent);

  console.log(`✅ CSV created successfully!`);
  console.log(`File: ${CSV_OUTPUT}`);
  console.log(`Total leads: ${rows.length}\n`);

  // Print summary
  console.log('=== IMPORT SUMMARY ===');
  console.log(`Successfully imported: ${rows.length} leads`);
  console.log(`Lead Source: Facebook`);
  console.log(`Enrichment Method: Web scraping from business websites`);
  console.log(`Import Date: ${data.timestamp}`);

  return CSV_OUTPUT;
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
