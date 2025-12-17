import { SalesforceService } from './salesforce';

export interface TierDistribution {
  tier: string;
  count: number;
  percentage: number;
}

export interface LeadSourceStats {
  leadSource: string;
  totalLeads: number;
  enrichedLeads: number;
  enrichmentRate: number;
  avgFitScore: number;
  tierDistribution: TierDistribution[];
}

export interface DashboardStats {
  totalLeads: number;
  enrichedLeads: number;
  unenrichedLeads: number;
  enrichmentRate: number;
  avgFitScore: number;
  tierDistribution: TierDistribution[];
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

  // Helper to get tier from score (works with Score__c 0-5 range or Fit_Score__c 0-100 range)
  private getTierFromScore(score: number | null | undefined): string | null {
    if (score === null || score === undefined) return null;

    // Check if it's a 0-5 scale (Score__c) or 0-100 scale (Fit_Score__c)
    if (score <= 5) {
      // 0-5 scale: 0-1 = Disqualified, 1-2 = MQL, 2-3 = High Fit, 3-5 = Premium
      if (score < 1) return 'Disqualified';
      if (score < 2) return 'MQL';
      if (score < 3) return 'High Fit';
      return 'Premium';
    } else {
      // 0-100 scale: 0-39 = Disqualified, 40-59 = MQL, 60-79 = High Fit, 80-100 = Premium
      if (score < 40) return 'Disqualified';
      if (score < 60) return 'MQL';
      if (score < 80) return 'High Fit';
      return 'Premium';
    }
  }

  private calculateTierDistribution(leads: any[]): TierDistribution[] {
    const tiers = ['Disqualified', 'MQL', 'High Fit', 'Premium'];
    const distribution: TierDistribution[] = [];

    // Get tier for each lead - check Fit_Tier__c first, then calculate from score
    const leadsWithTiers = leads.map(lead => {
      if (lead.Fit_Tier__c) return lead.Fit_Tier__c;
      // Calculate tier from score (check Score__c then Fit_Score__c)
      const score = lead.Score__c ?? lead.Fit_Score__c;
      return this.getTierFromScore(score);
    }).filter(tier => tier !== null);

    const total = leadsWithTiers.length;

    for (const tier of tiers) {
      const count = leadsWithTiers.filter(t => t === tier).length;
      distribution.push({
        tier,
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

    // Try to query with custom Fit Score OUTPUT fields first (Fit_Score__c, Fit_Tier__c)
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
               Fit_Score__c, Fit_Tier__c, Enrichment_Status__c,
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
          // Include Score__c which is the 0-5 enrichment score field
          const existingFieldsQuery = `
            SELECT Id, Company, LeadSource, Website, Phone, City, State,
                   Score__c, Has_Website__c, Has_GMB__c, GMB_URL__c,
                   Number_of_Employees__c, Number_of_GBP_Reviews__c,
                   Number_of_Years_in_Business__c, Location_Type__c,
                   Business_License__c, Spending_on_Marketing__c,
                   Full_Time_Part_Time__c, Lead_Vertical__c, CreatedDate
            FROM Lead
            WHERE CreatedDate >= ${soqlStartDate} AND CreatedDate <= ${soqlEndDate}
          `;
          const result = await this.salesforce.query(existingFieldsQuery);
          leads = result.records as any[];
          setupRequired.push('Fit Score output fields need to be created (Fit_Score__c, Fit_Tier__c, etc.) - using existing input fields');
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
    // A lead is enriched if it has a Score__c value between 0-5, OR if Fit_Score__c is set
    // Check multiple possible score fields depending on which query succeeded
    const isEnriched = (lead: any): boolean => {
      // Check Score__c (0-5 range) - primary enrichment indicator
      if (lead.Score__c !== undefined && lead.Score__c !== null) {
        return true;
      }
      // Check Fit_Score__c as fallback
      if (lead.Fit_Score__c !== undefined && lead.Fit_Score__c !== null) {
        return true;
      }
      return false;
    };

    // Get score value from lead (check both possible fields)
    const getScore = (lead: any): number | null => {
      if (lead.Score__c !== undefined && lead.Score__c !== null) {
        return lead.Score__c;
      }
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

    // Tier distribution
    const tierDistribution = this.calculateTierDistribution(leads);

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
        tierDistribution: this.calculateTierDistribution(sourceLeads),
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
      tierDistribution,
      byLeadSource,
      lastUpdated: new Date().toISOString(),
      customFieldsAvailable,
      setupRequired: setupRequired.length > 0 ? setupRequired : undefined,
    };
  }

  async getUnenrichedLeads(limit: number = 100, startDate?: string, endDate?: string): Promise<UnenrichedLead[]> {
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

    // Try with Score__c first (0-5 score field), then Fit_Score__c, then no custom fields
    try {
      // First try: Score__c (the 0-5 enrichment score field)
      const query = `
        SELECT Id, Company, Website, Phone, City, State, LeadSource, CreatedDate
        FROM Lead
        WHERE Score__c = null
          AND Company != null
          AND CreatedDate >= ${soqlStartDate} AND CreatedDate <= ${soqlEndDate}
        ORDER BY CreatedDate DESC
        LIMIT ${limit}
      `;
      const result = await this.salesforce.query(query);
      const leads = result.records as any[];

      return leads.map(lead => ({
        id: lead.Id,
        company: lead.Company,
        website: lead.Website || null,
        phone: lead.Phone || null,
        city: lead.City || null,
        state: lead.State || null,
        leadSource: lead.LeadSource || null,
        createdDate: lead.CreatedDate,
      }));
    } catch (error) {
      if (error instanceof Error && error.message.includes('No such column')) {
        try {
          // Second try: Fit_Score__c
          const fitScoreQuery = `
            SELECT Id, Company, Website, Phone, City, State, LeadSource, CreatedDate
            FROM Lead
            WHERE Fit_Score__c = null
              AND Company != null
              AND CreatedDate >= ${soqlStartDate} AND CreatedDate <= ${soqlEndDate}
            ORDER BY CreatedDate DESC
            LIMIT ${limit}
          `;
          const result = await this.salesforce.query(fitScoreQuery);
          const leads = result.records as any[];

          return leads.map(lead => ({
            id: lead.Id,
            company: lead.Company,
            website: lead.Website || null,
            phone: lead.Phone || null,
            city: lead.City || null,
            state: lead.State || null,
            leadSource: lead.LeadSource || null,
            createdDate: lead.CreatedDate,
          }));
        } catch (innerError) {
          // Third try: No custom fields - return all leads within date range
          if (innerError instanceof Error && innerError.message.includes('No such column')) {
            const basicQuery = `
              SELECT Id, Company, Website, Phone, City, State, LeadSource, CreatedDate
              FROM Lead
              WHERE Company != null
                AND CreatedDate >= ${soqlStartDate} AND CreatedDate <= ${soqlEndDate}
              ORDER BY CreatedDate DESC
              LIMIT ${limit}
            `;
            const result = await this.salesforce.query(basicQuery);
            const leads = result.records as any[];

            return leads.map(lead => ({
              id: lead.Id,
              company: lead.Company,
              website: lead.Website || null,
              phone: lead.Phone || null,
              city: lead.City || null,
              state: lead.State || null,
              leadSource: lead.LeadSource || null,
              createdDate: lead.CreatedDate,
            }));
          }
          throw innerError;
        }
      }
      throw error;
    }
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
