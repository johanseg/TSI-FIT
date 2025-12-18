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
  leadSource: string | null;
  createdDate: string;
}

export class DashboardStatsService {
  private salesforce: SalesforceService;

  constructor(salesforce: SalesforceService) {
    this.salesforce = salesforce;
  }

  // Calculate score distribution for leads (group by individual scores)
  private calculateScoreDistribution(leads: any[]): ScoreDistribution[] {
    const scoreMap = new Map<number, number>();

    // Get score for each lead
    for (const lead of leads) {
      const score = lead.Fit_Score__c;
      if (score !== null && score !== undefined) {
        // Round to nearest integer for grouping
        const roundedScore = Math.round(score);
        scoreMap.set(roundedScore, (scoreMap.get(roundedScore) || 0) + 1);
      }
    }

    const total = Array.from(scoreMap.values()).reduce((sum, count) => sum + count, 0);
    const distribution: ScoreDistribution[] = [];

    // Sort by score and create distribution entries
    const sortedScores = Array.from(scoreMap.keys()).sort((a, b) => a - b);
    for (const score of sortedScores) {
      const count = scoreMap.get(score) || 0;
      distribution.push({
        score,
        count,
        percentage: total > 0 ? (count / total) * 100 : 0,
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
      // First try: Query with Fit Score output fields (what we write to SF after enrichment)
      const leadsQuery = `
        SELECT Id, Company, LeadSource, Website, Phone, City, State,
               Fit_Score__c, Enrichment_Status__c,
               Employee_Estimate__c, Years_In_Business__c,
               Google_Reviews_Count__c, Has_Website__c,
               Pixels_Detected__c, Fit_Score_Timestamp__c, CreatedDate
        FROM Lead
        WHERE CreatedDate >= ${soqlStartDate} AND CreatedDate <= ${soqlEndDate}
      `;
      const result = await this.salesforce.query(leadsQuery);
      leads = result.records as any[];
    } catch (error) {
      if (error instanceof Error && error.message.includes('No such column')) {
        fitScoreFieldsAvailable = false;

        try {
          // Second try: Query with existing Salesforce INPUT fields (from SALESFORCE_SCHEMA.md)
          const existingFieldsQuery = `
            SELECT Id, Company, LeadSource, Website, Phone, City, State,
                   Fit_Score__c, Has_Website__c, Has_GMB__c, GMB_URL__c,
                   Number_of_Employees__c, Number_of_GBP_Reviews__c,
                   Number_of_Years_in_Business__c, Location_Type__c,
                   Business_License__c, Spending_on_Marketing__c,
                   Full_Time_Part_Time__c, Lead_Vertical__c, CreatedDate
            FROM Lead
            WHERE CreatedDate >= ${soqlStartDate} AND CreatedDate <= ${soqlEndDate}
          `;
          const result = await this.salesforce.query(existingFieldsQuery);
          leads = result.records as any[];
          setupRequired.push('Some Fit Score output fields may need to be created - using existing input fields');
        } catch (innerError) {
          // Third try: Basic Lead fields only
          if (innerError instanceof Error && innerError.message.includes('No such column')) {
            customFieldsAvailable = false;
            setupRequired.push('No custom fields found - showing basic lead stats only');

            const basicQuery = `
              SELECT Id, Company, LeadSource, Website, Phone, City, State, CreatedDate
              FROM Lead
              WHERE CreatedDate >= ${soqlStartDate} AND CreatedDate <= ${soqlEndDate}
            `;
            const result = await this.salesforce.query(basicQuery);
            leads = result.records as any[];
          } else {
            throw innerError;
          }
        }
      } else {
        throw error;
      }
    }

    // Calculate overall stats
    const totalLeads = leads.length;

    // Helper to check if a lead is "enriched"
    // A lead is enriched if it has a Fit_Score__c value set
    const isEnriched = (lead: any): boolean => {
      return lead.Fit_Score__c !== undefined && lead.Fit_Score__c !== null;
    };

    // Get score value from lead
    const getScore = (lead: any): number | null => {
      if (lead.Fit_Score__c !== undefined && lead.Fit_Score__c !== null) {
        return lead.Fit_Score__c;
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
    endDate?: string
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

    // Helper to map lead records
    const mapLeads = (records: any[]): UnenrichedLead[] => records.map(lead => ({
      id: lead.Id,
      company: lead.Company,
      website: lead.Website || null,
      phone: lead.Phone || null,
      city: lead.City || null,
      state: lead.State || null,
      leadSource: lead.LeadSource || null,
      createdDate: lead.CreatedDate,
    }));

    // Try with Fit_Score__c first, then fallback to no custom fields
    try {
      // First try: Fit_Score__c (the enrichment score field)
      // Get total count first
      const countQuery = `
        SELECT COUNT(Id) cnt
        FROM Lead
        WHERE Fit_Score__c = null
          AND Company != null
          AND CreatedDate >= ${soqlStartDate} AND CreatedDate <= ${soqlEndDate}
      `;
      const countResult = await this.salesforce.query(countQuery);
      const totalCount = (countResult.records as any[])[0]?.cnt || 0;

      // Get paginated results
      const query = `
        SELECT Id, Company, Website, Phone, City, State, LeadSource, CreatedDate
        FROM Lead
        WHERE Fit_Score__c = null
          AND Company != null
          AND CreatedDate >= ${soqlStartDate} AND CreatedDate <= ${soqlEndDate}
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
        `;
        const countResult = await this.salesforce.query(countQuery);
        const totalCount = (countResult.records as any[])[0]?.cnt || 0;

        const query = `
          SELECT Id, Company, Website, Phone, City, State, LeadSource, CreatedDate
          FROM Lead
          WHERE Company != null
            AND CreatedDate >= ${soqlStartDate} AND CreatedDate <= ${soqlEndDate}
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
        WHERE Fit_Score__c = null
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
