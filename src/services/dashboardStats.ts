import { SalesforceService } from './salesforce';

export interface ScoreDistribution {
  score: number;
  count: number;
}

export interface LeadSourceStats {
  leadSource: string;
  totalLeads: number;
  enrichedLeads: number;
  enrichmentRate: number;
  avgScore: number;
  scoreDistribution: ScoreDistribution[];
}

export interface DashboardStats {
  totalLeads: number;
  enrichedLeads: number;
  enrichmentRate: number;
  avgScore: number;
  scoreDistribution: ScoreDistribution[];
  byLeadSource: LeadSourceStats[];
  lastUpdated: string;
}

export class DashboardStatsService {
  private salesforce: SalesforceService;

  constructor(salesforce: SalesforceService) {
    this.salesforce = salesforce;
  }

  async getStats(daysBack: number = 30): Promise<DashboardStats> {
    await this.salesforce.connect();

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);
    const startDateStr = startDate.toISOString().split('T')[0];

    // Query leads with Fit Score input fields
    const leadsQuery = `
      SELECT Id, LeadSource, Score__c,
             Has_GMB__c, Has_Website__c, Number_of_Employees__c,
             Number_of_GBP_Reviews__c, Location_Type__c,
             Number_of_Years_in_Business__c, Business_License__c,
             Spending_on_Marketing__c, Lead_Vertical__c
      FROM Lead
      WHERE CreatedDate >= ${startDateStr}
        AND Sales_Channel__c = 'Inside Sales'
    `;

    const result = await this.salesforce.query(leadsQuery);
    const leads = result.records as any[];

    // Calculate overall stats
    const totalLeads = leads.length;

    // A lead is "enriched" if it has at least one of the key enrichment fields populated
    const enrichedLeads = leads.filter(lead =>
      lead.Has_GMB__c !== null ||
      lead.Has_Website__c !== null ||
      lead.Number_of_Employees__c !== null ||
      lead.Number_of_GBP_Reviews__c !== null ||
      lead.Location_Type__c !== null
    ).length;

    const enrichmentRate = totalLeads > 0 ? (enrichedLeads / totalLeads) * 100 : 0;

    // Score distribution (0-5 scale)
    const scoreDistribution: ScoreDistribution[] = [];
    for (let score = 0; score <= 5; score++) {
      const count = leads.filter(lead => lead.Score__c === score).length;
      scoreDistribution.push({ score, count });
    }

    // Leads with scores
    const leadsWithScores = leads.filter(lead => lead.Score__c !== null);
    const avgScore = leadsWithScores.length > 0
      ? leadsWithScores.reduce((sum, lead) => sum + (lead.Score__c || 0), 0) / leadsWithScores.length
      : 0;

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
      const sourceEnrichedLeads = sourceLeads.filter(lead =>
        lead.Has_GMB__c !== null ||
        lead.Has_Website__c !== null ||
        lead.Number_of_Employees__c !== null ||
        lead.Number_of_GBP_Reviews__c !== null ||
        lead.Location_Type__c !== null
      ).length;

      const sourceLeadsWithScores = sourceLeads.filter(lead => lead.Score__c !== null);
      const sourceAvgScore = sourceLeadsWithScores.length > 0
        ? sourceLeadsWithScores.reduce((sum, lead) => sum + (lead.Score__c || 0), 0) / sourceLeadsWithScores.length
        : 0;

      const sourceScoreDistribution: ScoreDistribution[] = [];
      for (let score = 0; score <= 5; score++) {
        const count = sourceLeads.filter(lead => lead.Score__c === score).length;
        sourceScoreDistribution.push({ score, count });
      }

      byLeadSource.push({
        leadSource,
        totalLeads: sourceTotalLeads,
        enrichedLeads: sourceEnrichedLeads,
        enrichmentRate: sourceTotalLeads > 0 ? (sourceEnrichedLeads / sourceTotalLeads) * 100 : 0,
        avgScore: sourceAvgScore,
        scoreDistribution: sourceScoreDistribution,
      });
    }

    // Sort by total leads descending
    byLeadSource.sort((a, b) => b.totalLeads - a.totalLeads);

    return {
      totalLeads,
      enrichedLeads,
      enrichmentRate,
      avgScore,
      scoreDistribution,
      byLeadSource,
      lastUpdated: new Date().toISOString(),
    };
  }
}
