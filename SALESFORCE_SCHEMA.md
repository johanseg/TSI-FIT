# Salesforce Data Schema - Townsquare Interactive

This document describes the Salesforce data model and fields used for analytics reporting, specifically for MQL tracking, sales analysis, and cohort LTV calculations.

---

## Object Overview

We work primarily with two Salesforce objects:
1. **Lead** - Marketing qualified leads and their lifecycle
2. **Opportunity** - Sales opportunities and closed-won deals

---

## Lead Object

The Lead object tracks potential customers from initial contact through marketing qualification.

### Key Identification Fields

| Field API Name | Field Label | Type | Description |
|---------------|-------------|------|-------------|
| `Id` | Lead ID | ID | Unique identifier for the lead record |
| `Name` | Full Name | String | Contact's full name |
| `Company` | Company | String | Company name |
| `Email` | Email | Email | Contact email address |

### Lead Lifecycle & Status Fields

| Field API Name | Field Label | Type | Description |
|---------------|-------------|------|-------------|
| `Status` | Status | Picklist | Current lead status (e.g., New, Working, Qualified, etc.) |
| `Lead_Stage__c` | Lead Stage | Picklist | Current stage in lead lifecycle. **Key values**: `MQL`, `Lead`, `Lead Contacted`, `Converted` |
| `IsConverted` | Converted | Boolean | Whether lead has been converted to opportunity |
| `ConvertedDate` | Converted Date | Date | Date when lead was converted to opportunity |
| `ConvertedOpportunityId` | Converted Opportunity ID | Reference | ID of opportunity created from this lead |

### MQL (Marketing Qualified Lead) Fields

| Field API Name | Field Label | Type | Description |
|---------------|-------------|------|-------------|
| `Lead_MQL_Date__c` | Lead MQL Date | Date | **Date only** when lead became MQL (used for filtering) |
| `Lead_MQL_Date_Time__c` | Lead MQL Date/Time | DateTime | **Full timestamp** when lead became MQL (more precise) |
| `Inbound__c` | Inbound | Boolean | **Formula field** - Indicates if lead came from inbound marketing channels |

### Date Tracking Fields

| Field API Name | Field Label | Type | Description |
|---------------|-------------|------|-------------|
| `CreatedDate` | Created Date | DateTime | System timestamp when record was created |
| `Date_Received__c` | Date Received | Date/DateTime | When lead was first received/captured |
| `LastModifiedDate` | Last Modified Date | DateTime | Last time record was updated |

### Source & Attribution Fields

| Field API Name | Field Label | Type | Description |
|---------------|-------------|------|-------------|
| `LeadSource` | Lead Source | Picklist | Primary source of the lead (e.g., Facebook, Google Ads, Website, Radio, etc.) |
| `Source__c` | Source | String | Additional source information |
| `Sales_Channel__c` | Sales Channel | Picklist | Sales channel handling this lead. **Key value**: `Inside Sales` |

### UTM Tracking Fields (Primary)

These are the **main UTM fields** used for campaign attribution:

| Field API Name | Field Label | Type | Description | **Required for FB Analysis** |
|---------------|-------------|------|-------------|------------------------------|
| `UTM_Source__c` | UTM Source | String | Campaign source (e.g., "fb", "facebook", "google") | ✅ Yes - Must be "fb" or "facebook" |
| `UTM_Campaign__c` | UTM Campaign | String | Campaign name | No |
| `UTM_Content__c` | UTM Content | String | Ad content/creative identifier | ✅ Yes - Must exist (not empty) |
| `UTM_Term__c` | UTM Term | String | Search terms/keywords | ✅ Yes - Must exist (not empty) |

### UTM Tracking Fields (Drift - Alternative System)

| Field API Name | Field Label | Type | Description |
|---------------|-------------|------|-------------|
| `Drift_UTM_Source__c` | Drift UTM Source | String | UTM source from Drift chat system |
| `Drift_UTM_Campaign__c` | Drift UTM Campaign | String | Campaign name from Drift |
| `Drift_UTM_Content__c` | Drift UTM Content | String | Ad content from Drift |
| `Drift_UTM_Term__c` | Drift UTM Term | String | Search terms from Drift |
| `Drift_Lead_Stage__c` | Drift Lead Stage | String | Lead stage tracked by Drift |

### UTM Tracking Fields (Pardot/GA - Legacy)

| Field API Name | Field Label | Type | Description |
|---------------|-------------|------|-------------|
| `pi__utm_source__c` | Pardot UTM Source | String | UTM source from Pardot/Google Analytics |
| `pi__utm_campaign__c` | Pardot UTM Campaign | String | Campaign from Pardot |
| `pi__utm_content__c` | Pardot UTM Content | String | Content from Pardot |
| `pi__utm_term__c` | Pardot UTM Term | String | Terms from Pardot |

### Business Classification Fields

| Field API Name | Field Label | Type | Description |
|---------------|-------------|------|-------------|
| `Vertical__c` | Vertical | Picklist | Business vertical/industry category |
| `Industry` | Industry | Picklist | Standard Salesforce industry field |

### Scoring and Grading Fields

| Field API Name | Field Label | Type | Description |
|---------------|-------------|------|-------------|
| `Score__c` | Score | Number | Primary lead scoring metric (0-5 scale). Indicates lead quality and likelihood to convert. |

### Inbound Lead Information Fields (Fit Score Inputs)

These fields are the **inputs used to calculate the Fit Score**. They capture business profile data collected during lead intake:

| Field API Name | Field Label | Type | Description |
|---------------|-------------|------|-------------|
| `Lead_Vertical__c` | Lead Vertical | Picklist | Business vertical category (e.g., "Automotive", "HVAC", "Plumbing"). Same values as `Vertical__c`. |
| `Has_GMB__c` | Has GMB | Boolean | Whether the business has a Google My Business / Google Business Profile listing. |
| `Has_Website__c` | Has Website | Boolean | Whether the business has an existing website. |
| `GMB_URL__c` | GMB URL | URL | Link to the business's Google Business Profile. |
| `Number_of_Employees__c` | Number of Employees | Picklist | Employee count range. **Values**: `0`, `1 - 2`, `3 - 5`, `Over 5` |
| `Number_of_GBP_Reviews__c` | Number of GBP Reviews | Picklist | Google Business Profile review count. **Values**: `Under 15`, `Over 14` |
| `Location_Type__c` | Location Type | Picklist | Type of business location. **Values**: `Home Office`, `Physical Location (Office)`, `Retail Location (Store Front)` |
| `Number_of_Years_in_Business__c` | Number of Years in Business | Picklist | How long the business has been operating. **Values**: `Under 1 Year`, `1 - 3 Years`, `3 - 5 Years`, `5 - 10+ years` |
| `Business_License__c` | Business License | Boolean | Whether the business has a valid business license. |
| `Spending_on_Marketing__c` | Spending on Marketing | Boolean | Whether the business is currently spending on marketing. |
| `Full_Time_Part_Time__c` | Full Time/Part Time | Picklist | Business operation status. **Values**: `Full Time`, `Part Time` |

### Activity and Engagement Fields

| Field API Name | Field Label | Type | Description |
|---------------|-------------|------|-------------|
| `Calls_Made__c` | Calls Made | Number | The total number of dials made to a lead. |

---

## Opportunity Object

The Opportunity object tracks sales deals from qualification through close (won or lost).

### Key Identification Fields

| Field API Name | Field Label | Type | Description |
|---------------|-------------|------|-------------|
| `Id` | Opportunity ID | ID | Unique identifier for the opportunity |
| `Name` | Opportunity Name | String | Name/title of the opportunity |
| `AccountId` | Account ID | Reference | Related account record |
| `Account.Name` | Account Name | String | Name of the account (company) |
| `Account.Id` | Account ID | ID | Account unique identifier |

### Sales Stage & Status Fields

| Field API Name | Field Label | Type | Description |
|---------------|-------------|------|-------------|
| `StageName` | Stage | Picklist | Current sales stage (e.g., Prospecting, Proposal, Closed Won, Closed Lost) |
| `IsClosed` | Is Closed | Boolean | Whether opportunity is closed (won or lost) |
| `IsWon` | Is Won | Boolean | Whether opportunity was closed-won (deal succeeded) |
| `Probability` | Probability (%) | Percent | Likelihood of closing (0-100%) |

### Revenue & Contract Fields

| Field API Name | Field Label | Type | Description | **Usage in Analysis** |
|---------------|-------------|------|-------------|-----------------------|
| `Amount` | Amount | Currency | **Monthly Recurring Revenue (MRR)** - Monthly subscription/service fee | **MRR = Amount** |
| `Closed_Amount__c` | Closed Amount | Currency | Alternative field for closed amount | Backup to Amount |
| `Contract_Length__c` | Contract Length | Number | Length of contract in months (defaults to 12 if not specified) | Used to calculate theoretical LTV |
| `TotalOpportunityQuantity` | Quantity | Number | Number of units/licenses | Rarely used |

### Date Fields

| Field API Name | Field Label | Type | Description | **Critical for Cohort Analysis** |
|---------------|-------------|------|-------------|---------------------------------|
| `CloseDate` | Close Date | Date | Date the opportunity was closed (won or lost) | ✅ **Cohort Month** = Year-Month of CloseDate |
| `CreatedDate` | Created Date | DateTime | When opportunity record was created | No |
| `LastModifiedDate` | Last Modified Date | DateTime | Last update timestamp | No |
| `LastStageChangeDate` | Last Stage Change Date | DateTime | When stage was last changed | No |

### Customer Retention & Churn Fields

| Field API Name | Field Label | Type | Description | **Critical for LTV** |
|---------------|-------------|------|-------------|---------------------|
| `Cancellation_Date__c` | Cancellation Date | Date | **Date customer cancelled service** | ✅ **Used to calculate actual LTV** - If present, customer churned |
| `Client_Status__c` | Client Status | Picklist | Current client status (Eligible, Not Eligible, etc.) | Secondary indicator |
| `Sub_6_Month_Churn__c` | Sub-6 Month Churn | Boolean | Flag indicating if customer churned within first 6 months | Early churn indicator |

### Source & Attribution Fields

| Field API Name | Field Label | Type | Description |
|---------------|-------------|------|-------------|
| `LeadSource` | Lead Source | Picklist | Original source of the lead that became this opportunity |
| `Source__c` | Source | String | Additional source information |
| `Sales_Channel__c` | Sales Channel | Picklist | Sales channel (Inside Sales, Outside Sales, Agency, etc.) |

### UTM Tracking Fields

Same structure as Lead object:

| Field API Name | Field Label | Type | Description |
|---------------|-------------|------|-------------|
| `UTM_Source__c` | UTM Source | String | Campaign source |
| `UTM_Campaign__c` | UTM Campaign | String | Campaign name |
| `UTM_Content__c` | UTM Content | String | Ad content identifier |
| `UTM_Term__c` | UTM Term | String | Search terms |

### Business Classification Fields

| Field API Name | Field Label | Type | Description |
|---------------|-------------|------|-------------|
| `Vertical__c` | Vertical | Picklist | Business vertical/industry |
| `Type` | Opportunity Type | Picklist | Type of opportunity (New Business, Upsell, Renewal, etc.) |

---

## Key Business Logic & Formulas

### Facebook Channel Qualification Criteria

For an opportunity to be counted as a **Facebook channel sale**, ALL of the following must be true:

```typescript
1. UTM_Source__c = "fb" OR "facebook" (case-insensitive)
2. UTM_Term__c exists (not null, not empty string)
3. UTM_Content__c exists (not null, not empty string)
4. Sales_Channel__c = "Inside Sales"
5. IsWon = true
6. IsClosed = true
7. CloseDate >= 2024-01-01
```

### Inbound Lead Qualification Criteria

For a lead to be counted as **Inbound MQL**, ALL must be true:

```typescript
1. Inbound__c = true (formula field)
2. Lead_MQL_Date__c = LAST_WEEK (Salesforce date literal)
```

### LTV (Lifetime Value) Calculation Logic

**For Active Customers** (no Cancellation_Date__c):
```typescript
monthsActive = floor((today - CloseDate) / 30 days)
actualLTV = MRR × monthsActive
status = "Active"
```

**For Churned Customers** (has Cancellation_Date__c):
```typescript
monthsRetained = floor((Cancellation_Date__c - CloseDate) / 30 days)
actualLTV = MRR × monthsRetained
status = "Churned"
```

**Theoretical LTV** (not used in final analysis):
```typescript
theoreticalLTV = MRR × (Contract_Length__c || 12)
```

### Survivability Rate Calculation

```typescript
survivabilityRate = (activeCustomers / totalCustomers) × 100%

where:
  activeCustomers = count of opportunities with Cancellation_Date__c = null
  totalCustomers = total count of closed-won opportunities in cohort
```

### Cohort Definition

```typescript
cohortMonth = Year-Month of CloseDate
// Example: If CloseDate = "2024-03-15", cohortMonth = "2024-03"
```

---

## Channel Mapping Logic

### Channel Classification

Opportunities/Leads are classified into these channels based on UTM Source and Lead Source:

| Channel Name | Matching Keywords (case-insensitive) |
|-------------|--------------------------------------|
| **FB** | "facebook", "fb" (in UTM_Source__c or LeadSource) |
| **Google** | "google ads", "google" |
| **Bing** | "bing ads", "bing" |
| **TikTok** | "tiktok" |
| **Bark** | "bark.com", "bark" |
| **Website** | "website" |
| **Radio** | "radio" (excludes "Referral Radio Rep") |
| **Com Exp** | "commercial experts", "commercial expert", "com exp" |

### Exclusions

- **Sales**: Exclude opportunities where LeadSource contains "referral radio rep"
- **MQLs**: Filter to specific 8 channels only (FB, Google, Bing, TikTok, Bark, Website, Radio, Com Exp)

---

## Sample SOQL Queries

### Query for Facebook Cohort Analysis

```sql
SELECT Id, Name, Account.Name, Account.Id, Amount, CloseDate,
       StageName, LeadSource, Sales_Channel__c, Source__c,
       Vertical__c, Contract_Length__c, CreatedDate,
       UTM_Source__c, UTM_Campaign__c, UTM_Term__c, UTM_Content__c,
       IsClosed, IsWon, Cancellation_Date__c, Client_Status__c,
       Sub_6_Month_Churn__c
FROM Opportunity
WHERE IsWon = true
  AND IsClosed = true
  AND CloseDate >= 2024-01-01
ORDER BY CloseDate ASC
```

Then filter in code:
```typescript
const facebookSales = records.filter(opp => {
  const utmSource = (opp.UTM_Source__c || '').toLowerCase();
  const utmTerm = opp.UTM_Term__c || '';
  const utmContent = opp.UTM_Content__c || '';
  const salesChannel = opp.Sales_Channel__c || '';

  return (utmSource === 'fb' || utmSource === 'facebook') &&
         utmTerm.trim().length > 0 &&
         utmContent.trim().length > 0 &&
         salesChannel === 'Inside Sales';
});
```

### Query for Inbound MQLs (Last Week)

```sql
SELECT Id, Name, Company, LeadSource, Lead_MQL_Date_Time__c,
       Sales_Channel__c, Source__c, Status, Vertical__c,
       Date_Received__c, Inbound__c, Lead_Stage__c, IsConverted,
       UTM_Source__c, UTM_Campaign__c, UTM_Content__c, UTM_Term__c
FROM Lead
WHERE Inbound__c = true
  AND Lead_MQL_Date__c = LAST_WEEK
ORDER BY Lead_MQL_Date_Time__c DESC
```

### Query for Weekly Sales Report

```sql
SELECT Id, Name, Account.Name, Amount, CloseDate,
       StageName, LeadSource, Sales_Channel__c, Source__c,
       Vertical__c, Contract_Length__c, CreatedDate, Type
FROM Opportunity
WHERE IsWon = true
  AND IsClosed = true
  AND CloseDate >= {lastMonday}
  AND CloseDate <= {lastSunday}
ORDER BY CloseDate DESC, Amount DESC
```

---

## Important Notes & Gotchas

### 1. UTM Field Confusion
There are **three separate UTM tracking systems**:
- Primary fields: `UTM_Source__c`, `UTM_Campaign__c`, etc.
- Drift fields: `Drift_UTM_Source__c`, etc.
- Pardot/GA fields: `pi__utm_source__c`, etc.

**Always use the primary fields** (`UTM_Source__c`) for analysis.

### 2. Date vs DateTime Fields
- `Lead_MQL_Date__c` is a **Date** field (used for LAST_WEEK filtering)
- `Lead_MQL_Date_Time__c` is a **DateTime** field (more precise timestamp)
- `CloseDate` is a **Date** field
- `Cancellation_Date__c` is a **Date** field

### 3. Inbound Formula Field
`Inbound__c` is a **formula field** (boolean) that automatically determines if a lead is from inbound marketing. You cannot directly see the formula, but it's used as the primary filter for inbound leads.

### 4. MRR vs Total Value
- `Amount` field = **Monthly Recurring Revenue (MRR)**
- Total contract value = `Amount × Contract_Length__c`
- Actual LTV = `Amount × months_retained` (calculated, not a field)

### 5. Default Contract Length
If `Contract_Length__c` is null or not specified, **default to 12 months** for calculations.

### 6. Cancellation Date Determines Status
- If `Cancellation_Date__c` is **null** → Customer is **Active**
- If `Cancellation_Date__c` has a value → Customer is **Churned**

### 7. Salesforce Date Literals
- `LAST_WEEK` = Monday to Sunday of the previous week (Salesforce automatically calculates)
- `THIS_WEEK` = Monday to Sunday of current week
- Use explicit date ranges for more control: `CloseDate >= 2024-01-01 AND CloseDate <= 2024-12-31`

---

## Data Quality Observations

Based on actual queries (as of Nov 2025):

- **Total Closed-Won Opportunities (2024-present)**: 23,780
- **Facebook Sales (all criteria met)**: 2,109 (8.9% of total)
- **Opportunities with Cancellation Date**: 12,594 (53% have churned)
- **Active Opportunities (no cancel date)**: 11,186 (47% still active)

### Facebook Channel Filtering Impact:
- With FB/Facebook UTM Source: 2,143
- Missing UTM Term: 8 (filtered out)
- Missing UTM Content: 26 (filtered out)
- Not Inside Sales: 7 (filtered out)
- **Final Facebook count**: 2,109

---

## Export Data Structure

When exporting to Excel, we create these sheets:

### Sheet 1: Cohort Summary
| Column | Description |
|--------|-------------|
| Month | Cohort month (YYYY-MM format) |
| Total Sales | Number of closed-won opportunities in cohort |
| Total Revenue (MRR) | Sum of Amount field for all customers |
| Average MRR | Total Revenue / Total Sales |
| Average LTV | Average actual LTV (using cancellation dates) |
| Survivability % | Percentage of customers still active |
| Active Customers | Count with no Cancellation_Date__c |
| Churned Customers | Count with Cancellation_Date__c |
| Months Active | Age of cohort in months |

### Sheet 2: Customer Details
Individual customer records with all fields including cancellation data.

### Sheet 3: Age Analysis
Cohort performance grouped by age ranges (0-3 months, 4-6 months, etc.).

### Sheet 4: Key Metrics
Overall summary statistics.

### Sheet 5: Filter Info
Applied filters and report metadata.

---

## Data Enrichment with External Sources

### Overview

Salesforce data often lacks complete vertical/profession information, with up to 52.7% of records having "Unknown" or missing vertical classifications. External data sources can be used to enrich Salesforce records through advanced fuzzy matching techniques.

**Achievement**: Using the methodology below, we achieved **96.7% match rate** (2,013 of 2,081 records), reducing "Unknown" verticals from 47.1% to 3.3%.

---

### External Data Source: Vertical Info Excel File

#### File Structure
**File**: `Vertical info TSI.xlsx`
- **Total Records**: 38,389 business profiles
- **Key Columns**:
  - **Column C**: `Business Settings Dim Nickname` - GP ID (e.g., "TI OWENSA003")
  - **Column J**: `Business Dim Vertical Group` - High-level category (e.g., "Home Services")
  - **Column K**: `Business Dim Profession` - Specific profession (e.g., "hvac contractor", "carpet cleaner")
  - **Address Fields**: Used for state extraction to aid matching disambiguation

#### GP ID Concept
- **GP ID** (General Profile ID): Internal identifier in format `TI XXXXXXXXXXNN` where:
  - `TI` = Townsquare Interactive prefix
  - `XXXXXXXX` = Business name abbreviation (e.g., "OWENSA" for "Owen's AC")
  - `NNN` = Numeric suffix (e.g., "003")
- **Critical Note**: GP ID exists in Excel but **NOT in Salesforce** - must use name-based matching

---

### Matching Strategy: Three-Tier Approach

To achieve high match rates, use a progressive matching strategy that starts with exact matches and falls back to fuzzy matching:

#### Tier 1: Exact Name Match (Case-Insensitive)
```typescript
// Match Opportunity.Name or Account.Name directly with Excel business name
const exactMatch = excelRecords.find(excel =>
  excel.businessName.toLowerCase() === opportunity.Name.toLowerCase()
);
```
**Success Rate**: ~60% of records

#### Tier 2: Normalized Name Match
Remove common business suffixes and special characters:

```typescript
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')  // Replace special chars with space
    .replace(/\s+/g, ' ')           // Normalize whitespace
    .replace(/\b(llc|inc|corp|ltd|co|company|the|and|&|services?|service|group)\b/g, '')
    .trim()
    .replace(/\s+/g, '');           // Remove all spaces for final comparison
}

const normalizedMatch = excelRecords.find(excel =>
  normalizeName(excel.businessName) === normalizeName(opportunity.Name)
);
```
**Success Rate**: Additional ~25% of records

#### Tier 3: Fuzzy Match with State Filtering
Use Levenshtein distance algorithm with state-based disambiguation:

```typescript
function similarity(s1: string, s2: string): number {
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  if (longer.length === 0) return 1.0;

  const editDistance = calculateEditDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

function calculateEditDistance(s1: string, s2: string): number {
  const costs: number[] = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
}

// Apply fuzzy matching with 80% similarity threshold
const SIMILARITY_THRESHOLD = 0.80;

// Get state from Account.BillingState or Account.ShippingState
const opportunityState = opportunity.Account?.BillingState ||
                         opportunity.Account?.ShippingState;

// Filter Excel records to same state first (reduces false positives)
const stateFilteredExcel = excelRecords.filter(excel =>
  excel.state === opportunityState
);

// Find best fuzzy match
let bestMatch = null;
let bestScore = 0;

for (const excel of stateFilteredExcel) {
  const score = similarity(
    normalizeName(opportunity.Name),
    normalizeName(excel.businessName)
  );

  if (score >= SIMILARITY_THRESHOLD && score > bestScore) {
    bestScore = score;
    bestMatch = excel;
  }
}
```
**Success Rate**: Additional ~12% of records

---

### Complete Enrichment Pipeline

#### Step 1: Load Salesforce Data
```typescript
const opportunities = await querySalesforce(`
  SELECT Id, Name, Account.Name, Account.Id,
         Account.BillingState, Account.ShippingState,
         Amount, CloseDate, Cancellation_Date__c,
         Vertical__c, UTM_Source__c, UTM_Campaign__c,
         UTM_Term__c, UTM_Content__c, Sales_Channel__c
  FROM Opportunity
  WHERE IsWon = true
    AND IsClosed = true
    AND CloseDate >= 2024-01-01
`);
```

#### Step 2: Load Excel Data
```typescript
import * as XLSX from 'xlsx';

const workbook = XLSX.readFile('Vertical info TSI.xlsx');
const worksheet = workbook.Sheets[workbook.SheetNames[0]];
const excelData = XLSX.utils.sheet_to_json(worksheet);

// Parse Excel structure
const excelRecords = excelData.map(row => ({
  gpId: row['Business Settings Dim Nickname'],           // Column C
  businessName: row['Account Name'] || row['Business Name'], // Varies by file
  verticalGroup: row['Business Dim Vertical Group'],     // Column J
  profession: row['Business Dim Profession'],            // Column K
  state: extractState(row['Address']),                   // From address field
}));
```

#### Step 3: Apply Three-Tier Matching
```typescript
interface EnrichedRecord {
  id: string;
  oppName: string;
  accountName: string;
  matchedExcelName: string;
  matchStrategy: 'exact' | 'normalized' | 'fuzzy' | 'unmatched';
  gpId: string;
  profession: string;
  verticalGroup: string;
  state: string;
  // ... other Salesforce fields
}

const enrichedRecords: EnrichedRecord[] = [];
let exactMatches = 0;
let normalizedMatches = 0;
let fuzzyMatches = 0;
let unmatched = 0;

for (const opp of opportunities) {
  let match = null;
  let strategy: 'exact' | 'normalized' | 'fuzzy' | 'unmatched' = 'unmatched';

  // Tier 1: Exact match
  match = excelRecords.find(excel =>
    excel.businessName.toLowerCase() === opp.Name.toLowerCase()
  );
  if (match) {
    exactMatches++;
    strategy = 'exact';
  }

  // Tier 2: Normalized match
  if (!match) {
    match = excelRecords.find(excel =>
      normalizeName(excel.businessName) === normalizeName(opp.Name)
    );
    if (match) {
      normalizedMatches++;
      strategy = 'normalized';
    }
  }

  // Tier 3: Fuzzy match with state filter
  if (!match) {
    const oppState = opp.Account?.BillingState || opp.Account?.ShippingState;
    const candidates = excelRecords.filter(excel => excel.state === oppState);

    let bestScore = 0;
    for (const excel of candidates) {
      const score = similarity(
        normalizeName(opp.Name),
        normalizeName(excel.businessName)
      );
      if (score >= 0.80 && score > bestScore) {
        bestScore = score;
        match = excel;
      }
    }

    if (match) {
      fuzzyMatches++;
      strategy = 'fuzzy';
    } else {
      unmatched++;
    }
  }

  // Create enriched record
  enrichedRecords.push({
    id: opp.Id,
    oppName: opp.Name,
    accountName: opp.Account?.Name || '',
    matchedExcelName: match?.businessName || '',
    matchStrategy: strategy,
    gpId: match?.gpId || '',
    profession: match?.profession || 'Unknown',
    verticalGroup: match?.verticalGroup || 'Unknown',
    state: opp.Account?.BillingState || '',
    // ... copy other Salesforce fields
  });
}

console.log(`Exact matches: ${exactMatches}`);
console.log(`Normalized matches: ${normalizedMatches}`);
console.log(`Fuzzy matches: ${fuzzyMatches}`);
console.log(`Unmatched: ${unmatched}`);
console.log(`Total match rate: ${((enrichedRecords.length - unmatched) / enrichedRecords.length * 100).toFixed(1)}%`);
```

#### Step 4: Export Enriched Data
```typescript
import * as fs from 'fs';

// Export as JSON for analysis
fs.writeFileSync(
  'data/exports/enriched_facebook_data_2024.json',
  JSON.stringify(enrichedRecords, null, 2)
);

// Export as Excel for manual review
const workbook = XLSX.utils.book_new();
const worksheet = XLSX.utils.json_to_sheet(enrichedRecords);
XLSX.utils.book_append_sheet(workbook, worksheet, 'Enriched Data');
XLSX.writeFile(workbook, 'data/exports/enriched_facebook_data_2024.xlsx');
```

---

### Best Practices for Matching

#### 1. Use Opportunity Name, Not Account Name
**Why**: Excel files typically contain the business name as entered during signup, which matches `Opportunity.Name` more closely than `Account.Name`.

**Example**:
- Opportunity.Name: "Owen's AC Cooling LLC"
- Account.Name: "M.Refrigeration Services" (parent company)
- Excel Name: "Owen's AC Cooling LLC" ✅ Matches Opportunity

#### 2. State-Based Disambiguation
**Why**: Prevents false positives when businesses have similar names in different states.

**Example**:
- "ABC Plumbing" in Texas (80% match to "ABC Plumbing & Heating")
- "ABC Plumbing" in Florida (85% match to "ABC Plumbing Services")
- Without state filter: Wrong match possible
- With state filter: Correct match guaranteed

#### 3. Similarity Threshold Selection
- **80% threshold**: Good balance between precision and recall
- **85%+ threshold**: Very safe but may miss legitimate matches
- **75% threshold**: Catches more matches but increases false positives

**Recommendation**: Start with 80%, manually review unmatched records, adjust if needed.

#### 4. Name Normalization Rules
Remove these common variations:
- Legal suffixes: LLC, Inc, Corp, Ltd, Co, Company
- Articles: The, A, An
- Conjunctions: And, &
- Generic terms: Services, Service, Group
- Special characters: &, -, ., !, etc.
- Extra whitespace

#### 5. Manual Review of Edge Cases
After enrichment, review records with:
- Fuzzy matches below 85% similarity
- Multiple matches with similar scores
- Unmatched records with high MRR (>$500)

---

### Data Quality Improvements

#### Before Enrichment (Raw Salesforce)
```
Total Records: 2,081
Unknown Vertical: 1,096 (52.7%)
Known Vertical: 985 (47.3%)
```

#### After Enrichment (96.7% Match Rate)
```
Total Records: 2,081
Matched Records: 2,013 (96.7%)
Unknown Vertical: 68 (3.3%)

Match Breakdown:
- Exact Match: 1,248 (60.0%)
- Normalized Match: 521 (25.0%)
- Fuzzy Match: 244 (11.7%)
- Unmatched: 68 (3.3%)
```

#### Impact on Analysis Quality
- **Profession Analysis**: Can now segment by 50+ professions vs "Unknown"
- **Vertical Trends**: Identify high/low performing industries
- **Geographic + Vertical**: Cross-dimensional insights (e.g., "HVAC in Texas")
- **Campaign Optimization**: Target specific professions with specific campaigns

---

### Common Matching Challenges & Solutions

#### Challenge 1: Abbreviated Names
**Problem**: "ABC HVAC" in Salesforce vs "ABC Heating Ventilation and Air Conditioning" in Excel

**Solution**: Create abbreviation expansion rules
```typescript
const expansions = {
  'hvac': 'heating ventilation air conditioning',
  'ac': 'air conditioning',
  'plbg': 'plumbing',
  'elec': 'electrical',
  'const': 'construction'
};

function expandAbbreviations(name: string): string {
  let expanded = name.toLowerCase();
  for (const [abbr, full] of Object.entries(expansions)) {
    expanded = expanded.replace(new RegExp(`\\b${abbr}\\b`, 'g'), full);
  }
  return expanded;
}
```

#### Challenge 2: Owner Names vs Business Names
**Problem**: "John's Plumbing" in Salesforce vs "Smith Plumbing Services LLC" in Excel (same business, different name format)

**Solution**: Use state + phone number + address matching if available, or accept lower match rate for this edge case.

#### Challenge 3: Multiple Locations
**Problem**: "ABC Plumbing - Dallas" vs "ABC Plumbing - Houston" (same company, different branches)

**Solution**: Use state filtering + remove location suffixes
```typescript
function removeLocationSuffixes(name: string): string {
  return name.replace(/\s*-\s*(dallas|houston|austin|miami|etc)\s*$/i, '').trim();
}
```

#### Challenge 4: Merged/Acquired Businesses
**Problem**: Business name changed after acquisition, Excel has old name

**Solution**: Keep historical Excel snapshots or accept that recent acquisitions may not match.

---

### Performance Optimization

For large datasets (10,000+ records):

#### 1. Index Excel Data by State
```typescript
const excelByState = new Map<string, ExcelRecord[]>();
for (const record of excelRecords) {
  if (!excelByState.has(record.state)) {
    excelByState.set(record.state, []);
  }
  excelByState.get(record.state)!.push(record);
}

// Lookup is now O(1) for state filter
const candidates = excelByState.get(opportunity.state) || [];
```

#### 2. Pre-compute Normalized Names
```typescript
interface IndexedExcelRecord extends ExcelRecord {
  normalizedName: string;
}

const indexedExcel = excelRecords.map(record => ({
  ...record,
  normalizedName: normalizeName(record.businessName)
}));

// Avoid re-normalizing in loop
```

#### 3. Parallel Processing
```typescript
import { Worker } from 'worker_threads';

// Split opportunities into chunks
const chunkSize = 500;
const chunks = [];
for (let i = 0; i < opportunities.length; i += chunkSize) {
  chunks.push(opportunities.slice(i, i + chunkSize));
}

// Process chunks in parallel
const results = await Promise.all(
  chunks.map(chunk => processChunkInWorker(chunk, excelRecords))
);
```

---

### Validation & Quality Checks

After enrichment, always run these validation checks:

#### 1. Verify Match Rate
```typescript
const matchRate = ((totalRecords - unmatchedCount) / totalRecords) * 100;
console.log(`Match Rate: ${matchRate.toFixed(1)}%`);

// Target: >95% for high-quality enrichment
if (matchRate < 90) {
  console.warn('⚠️ Low match rate - review matching logic');
}
```

#### 2. Check for Duplicate GP IDs
```typescript
const gpIdCounts = new Map<string, number>();
enrichedRecords.forEach(record => {
  if (record.gpId) {
    gpIdCounts.set(record.gpId, (gpIdCounts.get(record.gpId) || 0) + 1);
  }
});

const duplicates = Array.from(gpIdCounts.entries())
  .filter(([_, count]) => count > 1);

if (duplicates.length > 0) {
  console.warn(`⚠️ Found ${duplicates.length} duplicate GP IDs - possible multi-location businesses`);
}
```

#### 3. Verify Profession Distribution
```typescript
const professionCounts = new Map<string, number>();
enrichedRecords.forEach(record => {
  const profession = record.profession || 'Unknown';
  professionCounts.set(profession, (professionCounts.get(profession) || 0) + 1);
});

console.log('\nTop 10 Professions:');
Array.from(professionCounts.entries())
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10)
  .forEach(([profession, count]) => {
    console.log(`  ${profession}: ${count} (${(count / enrichedRecords.length * 100).toFixed(1)}%)`);
  });
```

#### 4. Review Fuzzy Match Quality
```typescript
const fuzzyMatches = enrichedRecords.filter(r => r.matchStrategy === 'fuzzy');
console.log(`\nFuzzy Matches (${fuzzyMatches.length}):`);

// Manually review first 10 fuzzy matches
fuzzyMatches.slice(0, 10).forEach(record => {
  console.log(`  SF: "${record.oppName}" → Excel: "${record.matchedExcelName}"`);
});
```

---

### Integration with Analysis Scripts

Once data is enriched, use it in analysis:

```typescript
import * as fs from 'fs';

// Load enriched data
const enrichedData: EnrichedRecord[] = JSON.parse(
  fs.readFileSync('data/exports/enriched_facebook_data_2024.json', 'utf-8')
);

// Now analyze by profession
const professionStats = new Map<string, {
  total: number;
  active: number;
  totalMRR: number;
  totalLTV: number;
}>();

enrichedData.forEach(record => {
  const profession = record.profession;
  if (!professionStats.has(profession)) {
    professionStats.set(profession, {
      total: 0,
      active: 0,
      totalMRR: 0,
      totalLTV: 0
    });
  }

  const stats = professionStats.get(profession)!;
  stats.total++;
  if (record.isActive) stats.active++;
  stats.totalMRR += record.mrr;
  stats.totalLTV += record.mrr * record.monthsRetained;
});

// Calculate retention by profession
Array.from(professionStats.entries())
  .map(([profession, stats]) => ({
    profession,
    customers: stats.total,
    retention: (stats.active / stats.total) * 100,
    avgMRR: stats.totalMRR / stats.total,
    avgLTV: stats.totalLTV / stats.total
  }))
  .sort((a, b) => b.retention - a.retention)
  .forEach(stat => {
    console.log(`${stat.profession}: ${stat.retention.toFixed(1)}% retention, $${stat.avgLTV.toFixed(0)} LTV`);
  });
```

---

## Usage Context

This schema is used for:
1. **Weekly MQL Reporting** - Track marketing qualified leads by channel
2. **Weekly Sales Reporting** - Track closed-won deals by channel
3. **Cohort LTV Analysis** - Calculate actual customer lifetime value by cohort
4. **Retention Analysis** - Measure survivability and churn rates
5. **Channel Performance** - Compare performance across marketing channels (FB, Google, etc.)
6. **Data Enrichment** - Enhance Salesforce records with external vertical/profession data (96.7% match rate)

All queries are **read-only** and validated through a safety layer to ensure no data modification.
