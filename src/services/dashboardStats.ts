import { SalesforceService } from './salesforce';

export interface ScoreDistribution {
  score: number;
  count: number;
  percentage: number;
}

export interface LeadSourceStats {
  leadSource: string;
  totalLeads: number;
  enrichedLeads: number;
  enrichmentRate: number;
  avgFitScore: number;
  scoreDistribution: ScoreDistribution[];
}

export interface DashboardStats {
  totalLeads: number;
  enrichedLeads: number;
  unenrichedLeads: number;
  enrichmentRate: number;
  avgFitScore: number;
  scoreDistribution: ScoreDistribution[];
  byLeadSource: LeadSourceStats[];
  lastUpdated: string;
  customFieldsAvailable: boolean;
  setupRequired?: string[];
}

export interface UnenrichedLead {
  id: string;
  company: string;
  website: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  street: string | null;
  postalCode: string | null;
  leadSource: string | null;
  createdDate: string;
}

export class DashboardStatsService {
  private salesforce: SalesforceService;

  constructor(salesforce: SalesforceService) {
    this.salesforce = salesforce;
  }

  // Calculate score distribution for leads (group by Score__c values 0-5)
  private calculateScoreDistribution(leads: any[]): ScoreDistribution[] {
    // Initialize 6 buckets for scores 0, 1, 2, 3, 4, 5
    const buckets = [0, 0, 0, 0, 0, 0];

    // Count leads by their Score__c value (0-5)
    for (const lead of leads) {
      const score = lead.Score__c;
      if (score !== null && score !== undefined && score >= 0 && score <= 5) {
        buckets[Math.round(score)]++;
      }
    }

    const total = buckets.reduce((sum, count) => sum + count, 0);
    const distribution: ScoreDistribution[] = [];

    // Create distribution entries for scores 0-5
    for (let i = 0; i <= 5; i++) {
      distribution.push({
        score: i,
        count: buckets[i],
        percentage: total > 0 ? (buckets[i] / total) * 100 : 0,
      });
    }

    return distribution;
  }

  async getStats(startDate?: string, endDate?: string): Promise<DashboardStats> {
    await this.salesforce.connect();

    // Default to this month if no dates provided
    const now = new Date();
    const defaultStartDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const defaultEndDate = now.toISOString().split('T')[0];

    const startDateStr = startDate || defaultStartDate;
    const endDateStr = endDate || defaultEndDate;

    // Format dates for SOQL datetime comparison (needs T00:00:00Z format)
    const soqlStartDate = `${startDateStr}T00:00:00Z`;
    const soqlEndDate = `${endDateStr}T23:59:59Z`;

    // Try to query with custom Fit Score OUTPUT fields first (Fit_Score__c)
    // Then fall back to existing INPUT fields (Has_Website__c, Number_of_Employees__c, etc.)
    // Finally fall back to basic Lead fields
    let leads: any[] = [];
    let customFieldsAvailable = true;
    let fitScoreFieldsAvailable = true;
    const setupRequired: string[] = [];

    try {
      // Query with Score__c and existing Salesforce fields
      const leadsQuery = `
        SELECT Id, Company, LeadSource, Website, Phone, City, State,
               Score__c, Has_Website__c, Has_GMB__c, GMB_URL__c,
               Number_of_Employees__c, Number_of_GBP_Reviews__c,
               Number_of_Years_in_Business__c, Location_Type__c,
               Business_License__c, Spending_on_Marketing__c,
               Full_Time_Part_Time__c, Lead_Vertical__c, CreatedDate
        FROM Lead
        WHERE CreatedDate >= ${soqlStartDate} AND CreatedDate <= ${soqlEndDate}
      `;
      const result = await this.salesforce.query(leadsQuery);
      leads = result.records as any[];
    } catch (error) {
      if (error instanceof Error && error.message.includes('No such column')) {
        fitScoreFieldsAvailable = false;
        customFieldsAvailable = false;
        setupRequired.push('Some custom fields not found - showing basic lead stats only');

        // Fallback: Basic Lead fields only
        const basicQuery = `
          SELECT Id, Company, LeadSource, Website, Phone, City, State, CreatedDate
          FROM Lead
          WHERE CreatedDate >= ${soqlStartDate} AND CreatedDate <= ${soqlEndDate}
        `;
        const result = await this.salesforce.query(basicQuery);
        leads = result.records as any[];
      } else {
        throw error;
      }
    }

    // Calculate overall stats
    const totalLeads = leads.length;

    // Helper to check if a lead is "enriched"
    // A lead is enriched if it has a Score__c value set (0-5 scale)
    const isEnriched = (lead: any): boolean => {
      return lead.Score__c !== undefined && lead.Score__c !== null;
    };

    // Get score value from lead (Score__c is 0-5)
    const getScore = (lead: any): number | null => {
      if (lead.Score__c !== undefined && lead.Score__c !== null) {
        return lead.Score__c;
      }
      return null;
    };

    const enrichedLeads = leads.filter(isEnriched).length;
    const unenrichedLeads = totalLeads - enrichedLeads;
    const enrichmentRate = totalLeads > 0 ? (enrichedLeads / totalLeads) * 100 : 0;

    // Average Fit Score
    const leadsWithScores = leads.filter(lead => getScore(lead) !== null);
    const avgFitScore = leadsWithScores.length > 0
      ? leadsWithScores.reduce((sum, lead) => sum + (getScore(lead) || 0), 0) / leadsWithScores.length
      : 0;

    // Score distribution
    const scoreDistribution = this.calculateScoreDistribution(leads);

    // Group by lead source
    const leadSourceMap = new Map<string, any[]>();
    for (const lead of leads) {
      const source = lead.LeadSource || 'Unknown';
      if (!leadSourceMap.has(source)) {
        leadSourceMap.set(source, []);
      }
      leadSourceMap.get(source)!.push(lead);
    }

    const byLeadSource: LeadSourceStats[] = [];
    for (const [leadSource, sourceLeads] of leadSourceMap) {
      const sourceTotalLeads = sourceLeads.length;
      const sourceEnrichedLeads = sourceLeads.filter(isEnriched).length;
      const sourceLeadsWithScores = sourceLeads.filter(lead => getScore(lead) !== null);
      const sourceAvgFitScore = sourceLeadsWithScores.length > 0
        ? sourceLeadsWithScores.reduce((sum, lead) => sum + (getScore(lead) || 0), 0) / sourceLeadsWithScores.length
        : 0;

      byLeadSource.push({
        leadSource,
        totalLeads: sourceTotalLeads,
        enrichedLeads: sourceEnrichedLeads,
        enrichmentRate: sourceTotalLeads > 0 ? (sourceEnrichedLeads / sourceTotalLeads) * 100 : 0,
        avgFitScore: sourceAvgFitScore,
        scoreDistribution: this.calculateScoreDistribution(sourceLeads),
      });
    }

    // Sort by total leads descending
    byLeadSource.sort((a, b) => b.totalLeads - a.totalLeads);

    return {
      totalLeads,
      enrichedLeads,
      unenrichedLeads,
      enrichmentRate,
      avgFitScore,
      scoreDistribution,
      byLeadSource,
      lastUpdated: new Date().toISOString(),
      customFieldsAvailable,
      setupRequired: setupRequired.length > 0 ? setupRequired : undefined,
    };
  }

  async getUnenrichedLeadsPaginated(
    limit: number = 100,
    offset: number = 0,
    startDate?: string,
    endDate?: string,
    leadSource?: string
  ): Promise<{ leads: UnenrichedLead[]; totalCount: number }> {
    await this.salesforce.connect();

    // Default to this month if no dates provided
    const now = new Date();
    const defaultStartDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const defaultEndDate = now.toISOString().split('T')[0];

    const startDateStr = startDate || defaultStartDate;
    const endDateStr = endDate || defaultEndDate;

    // Format dates for SOQL datetime comparison
    const soqlStartDate = `${startDateStr}T00:00:00Z`;
    const soqlEndDate = `${endDateStr}T23:59:59Z`;

    // Build lead source filter if provided (sanitize input to prevent SOQL injection)
    let leadSourceFilter = '';
    if (leadSource) {
      // Sanitize leadSource: only allow alphanumeric, spaces, and common characters
      const sanitizedLeadSource = leadSource.replace(/[^a-zA-Z0-9\s\-_]/g, '');
      if (sanitizedLeadSource !== leadSource) {
        throw new Error('Invalid characters in leadSource parameter');
      }
      leadSourceFilter = `AND LeadSource = '${sanitizedLeadSource}'`;
    }

    // Helper to map lead records
    const mapLeads = (records: any[]): UnenrichedLead[] => records.map(lead => ({
      id: lead.Id,
      company: lead.Company,
      website: lead.Website || null,
      phone: lead.Phone || null,
      city: lead.City || null,
      state: lead.State || null,
      street: lead.Street || null,
      postalCode: lead.PostalCode || null,
      leadSource: lead.LeadSource || null,
      createdDate: lead.CreatedDate,
    }));

    // Try with Score__c first, then fallback to no custom fields
    try {
      // First try: Score__c (the 0-5 enrichment score field)
      // Get total count first
      const countQuery = `
        SELECT COUNT(Id) cnt
        FROM Lead
        WHERE Score__c = null
          AND Company != null
          AND CreatedDate >= ${soqlStartDate} AND CreatedDate <= ${soqlEndDate}
          ${leadSourceFilter}
      `;
      const countResult = await this.salesforce.query(countQuery);
      const totalCount = (countResult.records as any[])[0]?.cnt || 0;

      // Get paginated results
      const query = `
        SELECT Id, Company, Website, Phone, City, State, Street, PostalCode, LeadSource, CreatedDate
        FROM Lead
        WHERE Score__c = null
          AND Company != null
          AND CreatedDate >= ${soqlStartDate} AND CreatedDate <= ${soqlEndDate}
          ${leadSourceFilter}
        ORDER BY CreatedDate DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `;
      const result = await this.salesforce.query(query);
      return { leads: mapLeads(result.records as any[]), totalCount };
    } catch (error) {
      // Fallback: No custom fields - return all leads within date range
      if (error instanceof Error && error.message.includes('No such column')) {
        const countQuery = `
          SELECT COUNT(Id) cnt
          FROM Lead
          WHERE Company != null
            AND CreatedDate >= ${soqlStartDate} AND CreatedDate <= ${soqlEndDate}
            ${leadSourceFilter}
        `;
        const countResult = await this.salesforce.query(countQuery);
        const totalCount = (countResult.records as any[])[0]?.cnt || 0;

        const query = `
          SELECT Id, Company, Website, Phone, City, State, Street, PostalCode, LeadSource, CreatedDate
          FROM Lead
          WHERE Company != null
            AND CreatedDate >= ${soqlStartDate} AND CreatedDate <= ${soqlEndDate}
            ${leadSourceFilter}
          ORDER BY CreatedDate DESC
          LIMIT ${limit}
          OFFSET ${offset}
        `;
        const result = await this.salesforce.query(query);
        return { leads: mapLeads(result.records as any[]), totalCount };
      }
      throw error;
    }
  }

  // Keep original method for backwards compatibility
  async getUnenrichedLeads(limit: number = 100, startDate?: string, endDate?: string): Promise<UnenrichedLead[]> {
    const { leads } = await this.getUnenrichedLeadsPaginated(limit, 0, startDate, endDate);
    return leads;
  }

  async getUnenrichedLeadsCount(): Promise<number> {
    await this.salesforce.connect();

    try {
      const query = `
        SELECT COUNT(Id) cnt
        FROM Lead
        WHERE Score__c = null
          AND Company != null
      `;
      const result = await this.salesforce.query(query);
      const records = result.records as any[];
      return records[0]?.cnt || 0;
    } catch (error) {
      // Custom fields don't exist - return count of all leads with Company
      if (error instanceof Error && error.message.includes('No such column')) {
        const basicQuery = `
          SELECT COUNT(Id) cnt
          FROM Lead
          WHERE Company != null
        `;
        const result = await this.salesforce.query(basicQuery);
        const records = result.records as any[];
        return records[0]?.cnt || 0;
      }
      throw error;
    }
  }
}
