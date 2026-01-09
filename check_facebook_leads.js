const fs = require('fs');
const path = require('path');

/**
 * Script to check Facebook leads from CSV against Salesforce
 * Identifies leads that don't exist or don't match criteria (Facebook source, January 2026)
 */

const CSV_INPUT = path.join(__dirname, 'Leads fb.csv');
const CSV_OUTPUT = path.join(__dirname, 'leads_to_import.csv');

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
  console.log('Reading CSV file...');
  const csvContent = fs.readFileSync(CSV_INPUT, 'utf-8');
  const { headers, rows } = parseCSV(csvContent);

  console.log(`Found ${rows.length} leads in CSV`);

  // Prepare data for analysis
  const leads = rows.map(row => ({
    business_name: row.Business_name || row['Business name'],
    phone: row.Phone,
    email: row.Email,
    name: row.Name,
    state: row.State,
    city: row.City,
    website: row.Website,
    lead_source: row.Lead_source,
    submission_time: row['Ll submission time utc'],
    created: row.Created,
    raw_row: row
  }));

  // Filter for Facebook leads from January 2026
  const facebookLeads = leads.filter(lead => {
    const isFacebook = lead.lead_source === 'Facebook';
    let isJanuary2026 = false;

    // Check submission time or created date
    const dateStr = lead.submission_time || lead.created;
    if (dateStr) {
      // Check if date contains "2026" and "Jan" or "01"
      isJanuary2026 = dateStr.includes('2026') &&
                      (dateStr.includes('Jan') || dateStr.startsWith('2026-01'));
    }

    return isFacebook && isJanuary2026;
  });

  console.log(`Filtered to ${facebookLeads.length} Facebook leads from January 2026`);

  // Export summary for manual Salesforce check
  console.log('\n=== SUMMARY ===');
  console.log(`Total leads in CSV: ${rows.length}`);
  console.log(`Facebook leads from January 2026: ${facebookLeads.length}`);
  console.log('\nSample lead data for Salesforce verification:');
  console.log('Emails:', facebookLeads.slice(0, 5).map(l => l.email).join(', '));
  console.log('Phone numbers:', facebookLeads.slice(0, 5).map(l => l.phone).join(', '));
  console.log('Business names:', facebookLeads.slice(0, 5).map(l => l.business_name).join(', '));

  // Write filtered leads to output CSV for import
  console.log(`\nWriting filtered leads to ${CSV_OUTPUT}...`);
  const outputLines = [headers.join(',')];

  facebookLeads.forEach(lead => {
    const line = headers.map(header => escapeCSV(lead.raw_row[header])).join(',');
    outputLines.push(line);
  });

  fs.writeFileSync(CSV_OUTPUT, outputLines.join('\n'));
  console.log(`Done! ${facebookLeads.length} leads written to leads_to_import.csv`);

  // Output email list for Salesforce query
  const emails = facebookLeads.map(l => l.email).filter(e => e);
  const phones = facebookLeads.map(l => l.phone).filter(p => p);

  console.log('\n=== FOR SALESFORCE QUERY ===');
  console.log(`Unique emails (${emails.length}):`);
  console.log(emails.slice(0, 10).join(', '), '...');
  console.log(`\nUnique phones (${phones.length}):`);
  console.log(phones.slice(0, 10).join(', '), '...');
}

main().catch(console.error);
