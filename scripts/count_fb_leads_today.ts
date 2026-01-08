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
    await sfService.connect();
    
    // Strict query based on schema "Required for FB Analysis"
    const query = `
      SELECT COUNT(Id) cnt 
      FROM Lead 
      WHERE (UTM_Source__c = 'fb' OR UTM_Source__c = 'facebook')
        AND UTM_Content__c != null
        AND UTM_Term__c != null
        AND CreatedDate = TODAY
    `;
    console.log('Executing strict schema-based query...');
    
    const result = await sfService.query(query);
    const strictCount = (result.records as any[])[0].cnt;
    
    // Loose query (LeadSource)
    const looseQuery = `
      SELECT COUNT(Id) cnt 
      FROM Lead 
      WHERE LeadSource = 'Facebook'
        AND CreatedDate = TODAY
    `;
    const looseResult = await sfService.query(looseQuery);
    const looseCount = (looseResult.records as any[])[0].cnt;

    console.log('\n--- Result ---');
    console.log('Facebook leads (Strict UTM filter):', strictCount);
    console.log('Facebook leads (LeadSource = Facebook):', looseCount);
    console.log('---------------\n');

    await sfService.disconnect();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
