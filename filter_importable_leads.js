const fs = require('fs');
const path = require('path');

/**
 * Filter incomplete leads for those with business name/name + phone
 */

const CSV_INPUT = path.join(__dirname, 'leads_not_in_salesforce.csv');
const CSV_OUTPUT = path.join(__dirname, 'leads_ready_for_import.csv');

// Parse CSV manually (simple implementation)
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

function escapeCSV(value) {
  if (!value) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// Main processing function
async function main() {
  console.log('Reading incomplete leads CSV...');
  const csvContent = fs.readFileSync(CSV_INPUT, 'utf-8');
  const { headers, rows } = parseCSV(csvContent);

  console.log(`Found ${rows.length} incomplete leads`);

  // Filter for leads with sufficient data
  const importableLeads = rows.filter(row => {
    const businessName = row.Business_name || row['Business name'];
    const name = row.Name;
    const phone = row.Phone;

    // Must have phone AND (business name OR name)
    const hasPhone = phone && phone.trim() !== '';
    const hasBusinessName = businessName && businessName.trim() !== '';
    const hasName = name && name.trim() !== '';

    return hasPhone && (hasBusinessName || hasName);
  });

  console.log(`\n=== ANALYSIS ===`);
  console.log(`Total incomplete leads: ${rows.length}`);
  console.log(`Leads with business name/name + phone: ${importableLeads.length}`);
  console.log(`Leads still missing data: ${rows.length - importableLeads.length}`);

  if (importableLeads.length > 0) {
    // Show details
    console.log('\n=== LEADS READY FOR IMPORT ===');
    importableLeads.forEach((lead, i) => {
      const businessName = lead.Business_name || lead['Business name'] || 'N/A';
      const name = lead.Name || 'N/A';
      const phone = lead.Phone || 'N/A';
      const email = lead.Email || 'N/A';
      const city = lead.City || 'N/A';
      const state = lead.State || 'N/A';

      console.log(`\n${i + 1}. Business: ${businessName}`);
      console.log(`   Name: ${name}`);
      console.log(`   Phone: ${phone}`);
      console.log(`   Email: ${email}`);
      console.log(`   Location: ${city}, ${state}`);
    });

    // Write to output CSV
    console.log(`\nWriting ${importableLeads.length} leads to ${CSV_OUTPUT}...`);
    const outputLines = [headers.join(',')];

    importableLeads.forEach(row => {
      const line = headers.map(header => escapeCSV(row[header])).join(',');
      outputLines.push(line);
    });

    fs.writeFileSync(CSV_OUTPUT, outputLines.join('\n'));
    console.log('Done! File saved to leads_ready_for_import.csv');
  } else {
    console.log('\nNo leads have sufficient data for import.');
  }
}

main().catch(console.error);
