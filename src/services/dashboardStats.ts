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

  private calculateTierDistribution(leads: any[]): TierDistribution[] {
    const tiers = ['Disqualified', 'MQL', 'High Fit', 'Premium'];
    const distribution: TierDistribution[] = [];
    const total = leads.filter(l => l.Fit_Tier__c).length;

    for (const tier of tiers) {
      const count = leads.filter(l => l.Fit_Tier__c === tier).length;
      distribution.push({
        tier,
        count,
        percentage: total > 0 ? (count / total) * 100 : 0,
      });
    }

    return distribution;
  }

  async getStats(daysBack: number = 30): Promise<DashboardStats> {
    await this.salesforce.connect();

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);
    const startDateStr = startDate.toISOString().split('T')[0];

    // Query leads with Fit Score fields
    const leadsQuery = `
      SELECT Id, Company, LeadSource, Website, Phone, City, State,
             Fit_Score__c, Fit_Tier__c, Enrichment_Status__c,
             Employee_Estimate__c, Years_In_Business__c,
             Google_Reviews_Count__c, Has_Website__c,
             Pixels_Detected__c, Fit_Score_Timestamp__c
      FROM Lead
      WHERE CreatedDate >= ${startDateStr}
    `;

    const result = await this.salesforce.query(leadsQuery);
    const leads = result.records as any[];

    // Calculate overall stats
    const totalLeads = leads.length;

    // A lead is "enriched" if it has a Fit Score
    const enrichedLeads = leads.filter(lead => lead.Fit_Score__c !== null).length;
    const unenrichedLeads = totalLeads - enrichedLeads;
    const enrichmentRate = totalLeads > 0 ? (enrichedLeads / totalLeads) * 100 : 0;

    // Average Fit Score (0-100 scale)
    const leadsWithScores = leads.filter(lead => lead.Fit_Score__c !== null);
    const avgFitScore = leadsWithScores.length > 0
      ? leadsWithScores.reduce((sum, lead) => sum + (lead.Fit_Score__c || 0), 0) / leadsWithScores.length
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
      const sourceEnrichedLeads = sourceLeads.filter(lead => lead.Fit_Score__c !== null).length;
      const sourceLeadsWithScores = sourceLeads.filter(lead => lead.Fit_Score__c !== null);
      const sourceAvgFitScore = sourceLeadsWithScores.length > 0
        ? sourceLeadsWithScores.reduce((sum, lead) => sum + (lead.Fit_Score__c || 0), 0) / sourceLeadsWithScores.length
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
    };
  }

  async getUnenrichedLeads(limit: number = 100): Promise<UnenrichedLead[]> {
    await this.salesforce.connect();

    // Query leads without Fit Score
    const query = `
      SELECT Id, Company, Website, Phone, City, State, LeadSource, CreatedDate
      FROM Lead
      WHERE Fit_Score__c = null
        AND Company != null
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
  }

  async getUnenrichedLeadsCount(): Promise<number> {
    await this.salesforce.connect();

    const query = `
      SELECT COUNT(Id) cnt
      FROM Lead
      WHERE Fit_Score__c = null
        AND Company != null
    `;

    const result = await this.salesforce.query(query);
    const records = result.records as any[];
    return records[0]?.cnt || 0;
  }
}
