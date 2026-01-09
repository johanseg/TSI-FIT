const fs = require('fs');
const path = require('path');

const CSV_INPUT = path.join(__dirname, 'leads_not_in_salesforce.csv');

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

async function main() {
  const csvContent = fs.readFileSync(CSV_INPUT, 'utf-8');
  const { rows } = parseCSV(csvContent);

  console.log('=== WEBSITES FROM 44 INCOMPLETE LEADS ===\n');

  rows.forEach((row, i) => {
    const website = row.Website || 'N/A';
    const city = row.City || 'N/A';
    const state = row.State || 'N/A';
    const zipcode = row.Zipcode || 'N/A';
    const submissionDate = row['Ll submission time utc'] || row.Created || 'N/A';

    console.log(`${i + 1}. ${website}`);
    console.log(`   Location: ${city}, ${state} ${zipcode}`);
    console.log(`   Submitted: ${submissionDate}`);
    console.log('');
  });

  // Categorize websites
  const validWebsites = [];
  const emailsAsWebsites = [];
  const invalidWebsites = [];
  const landingPages = [];

  rows.forEach(row => {
    const website = row.Website || '';
    if (website.includes('townsquareinteractive.com') || website.includes('lp1.')) {
      landingPages.push(website);
    } else if (website.includes('@')) {
      emailsAsWebsites.push(website);
    } else if (website.includes('.com') || website.includes('.net') || website.includes('.shop') || website.includes('.app')) {
      validWebsites.push(website);
    } else if (website.trim() !== '') {
      invalidWebsites.push(website);
    }
  });

  console.log('\n=== WEBSITE CATEGORIZATION ===');
  console.log(`Valid websites: ${validWebsites.length}`);
  console.log(`Emails entered as websites: ${emailsAsWebsites.length}`);
  console.log(`Landing pages (not actual business sites): ${landingPages.length}`);
  console.log(`Invalid/incomplete websites: ${invalidWebsites.length}`);

  if (emailsAsWebsites.length > 0) {
    console.log('\n=== EMAILS ENTERED AS WEBSITES ===');
    emailsAsWebsites.forEach(email => console.log(`  - ${email}`));
  }

  if (invalidWebsites.length > 0) {
    console.log('\n=== INVALID/INCOMPLETE WEBSITES ===');
    invalidWebsites.forEach(site => console.log(`  - ${site}`));
  }
}

main().catch(console.error);
