const fs = require('fs');
const path = require('path');

/**
 * Compare CSV leads with Salesforce leads to identify which need to be imported
 */

const CSV_INPUT = path.join(__dirname, 'Leads fb.csv');
const SF_DATA = path.join(__dirname, '.claude', 'projects', '-Users-johan-AI-TSI-Fit-Score', 'ec788981-d946-4ea2-8caa-bbd7af92d91d', 'tool-results', 'mcp-salesforce-salesforce_query_records-1767991447644.txt');
const CSV_OUTPUT = path.join(__dirname, 'leads_not_in_salesforce.csv');

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

function normalizePhone(phone) {
  if (!phone) return '';
  // Remove all non-digit characters
  return phone.replace(/\D/g, '');
}

function normalizeEmail(email) {
  if (!email) return '';
  return email.toLowerCase().trim();
}

// Parse Salesforce data from text output
function parseSalesforceData(sfText) {
  const emails = new Set();
  const phones = new Set();

  // Extract emails using regex
  const emailMatches = sfText.matchAll(/Email:\s*([^\s\n]+)/g);
  for (const match of emailMatches) {
    if (match[1] && match[1] !== 'null') {
      emails.add(normalizeEmail(match[1]));
    }
  }

  // Extract phones using regex
  const phoneMatches = sfText.matchAll(/Phone:\s*([^\s\n]+)/g);
  for (const match of phoneMatches) {
    if (match[1] && match[1] !== 'null') {
      phones.add(normalizePhone(match[1]));
    }
  }

  return { emails, phones };
}

// Main processing function
async function main() {
  console.log('Reading CSV file...');
  const csvContent = fs.readFileSync(CSV_INPUT, 'utf-8');
  const { headers, rows } = parseCSV(csvContent);

  console.log(`Found ${rows.length} leads in CSV`);

  // Filter for Facebook leads from January 2026
  const facebookLeads = rows.filter(row => {
    const leadSource = row.Lead_source;
    const dateStr = row['Ll submission time utc'] || row.Created;
    const isFacebook = leadSource === 'Facebook';
    const isJanuary2026 = dateStr && dateStr.includes('2026') &&
                         (dateStr.includes('Jan') || dateStr.startsWith('2026-01'));
    return isFacebook && isJanuary2026;
  });

  console.log(`Filtered to ${facebookLeads.length} Facebook leads from January 2026`);

  // Read Salesforce data
  console.log('\nReading Salesforce data...');
  const sfPath = '/Users/johan/.claude/projects/-Users-johan-AI-TSI-Fit-Score/ec788981-d946-4ea2-8caa-bbd7af92d91d/tool-results/mcp-salesforce-salesforce_query_records-1767991447644.txt';
  const sfContent = fs.readFileSync(sfPath, 'utf-8');
  const { emails: sfEmails, phones: sfPhones } = parseSalesforceData(sfContent);

  console.log(`Found ${sfEmails.size} unique emails in Salesforce`);
  console.log(`Found ${sfPhones.size} unique phones in Salesforce`);

  // Compare and identify leads not in Salesforce
  const leadsNotInSF = facebookLeads.filter(row => {
    const email = normalizeEmail(row.Email);
    const phone = normalizePhone(row.Phone);

    // Lead is NOT in Salesforce if neither email nor phone matches
    const emailMatch = email && sfEmails.has(email);
    const phoneMatch = phone && sfPhones.has(phone);

    return !emailMatch && !phoneMatch;
  });

  console.log(`\n=== RESULTS ===`);
  console.log(`CSV Facebook leads (Jan 2026): ${facebookLeads.length}`);
  console.log(`Salesforce Facebook leads (Jan 2026): ${sfEmails.size}`);
  console.log(`Leads NOT in Salesforce: ${leadsNotInSF.length}`);
  console.log(`Leads already in Salesforce: ${facebookLeads.length - leadsNotInSF.length}`);

  // Write leads not in Salesforce to output CSV
  if (leadsNotInSF.length > 0) {
    console.log(`\nWriting ${leadsNotInSF.length} leads to ${CSV_OUTPUT}...`);
    const outputLines = [headers.join(',')];

    leadsNotInSF.forEach(row => {
      const line = headers.map(header => escapeCSV(row[header])).join(',');
      outputLines.push(line);
    });

    fs.writeFileSync(CSV_OUTPUT, outputLines.join('\n'));
    console.log(`Done! File saved to leads_not_in_salesforce.csv`);

    // Show sample of leads not in SF
    console.log('\nSample leads not in Salesforce:');
    leadsNotInSF.slice(0, 5).forEach((lead, i) => {
      console.log(`  ${i + 1}. ${lead.Business_name || lead['Business name']} - ${lead.Email} - ${lead.Phone}`);
    });
  } else {
    console.log('\nAll leads from the CSV are already in Salesforce!');
  }
}

main().catch(console.error);
