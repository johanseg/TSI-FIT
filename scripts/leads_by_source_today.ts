import { SalesforceService } from '../src/services/salesforce';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  const sfService = new SalesforceService({
    loginUrl: process.env.SFDC_LOGIN_URL || 'https://login.salesforce.com',
    clientId: process.env.SFDC_CLIENT_ID || '',
    clientSecret: process.env.SFDC_CLIENT_SECRET || '',
    username: process.env.SFDC_USERNAME || '',
    password: process.env.SFDC_PASSWORD || '',
    securityToken: process.env.SFDC_SECURITY_TOKEN || '',
  });

  try {
    console.log('Connecting to Salesforce...');
    await sfService.connect();
    
    const query = `
      SELECT LeadSource, COUNT(Id) cnt 
      FROM Lead 
      WHERE CreatedDate = TODAY 
        AND Sales_Channel__c = 'Inside Sales'
        AND LeadSource != null 
        AND LeadSource != 'Unknown'
      GROUP BY LeadSource
      ORDER BY COUNT(Id) DESC
    `;
    
    console.log('Executing query:', query);
    
    const result = await sfService.query(query);
    
    console.log('\n--- Inside Sales Leads by Source (Today) ---');
    if (result.records.length === 0) {
      console.log('No leads found for Inside Sales today.');
    } else {
      (result.records as any[]).forEach(row => {
        console.log(`${row.LeadSource}: ${row.cnt}`);
      });
      
      const total = (result.records as any[]).reduce((sum, row) => sum + row.cnt, 0);
      console.log('-------------------------------------------');
      console.log(`Total: ${total}`);
    }
    console.log('-------------------------------------------\n');

    await sfService.disconnect();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
