import { Queue } from 'bullmq';
import { logger, LeadPayload, EnrichmentJobData } from '@tsi-fit-score/shared';

const REDIS_URL = process.env.REDIS_URL;
if (!REDIS_URL) {
  throw new Error('REDIS_URL environment variable is required');
}

const QUEUE_NAME = 'lead-enrichment';

export class QueueService {
  private queue: Queue<EnrichmentJobData>;

  constructor() {
    this.queue = new Queue<EnrichmentJobData>(QUEUE_NAME, {
      connection: {
        host: new URL(REDIS_URL).hostname,
        port: parseInt(new URL(REDIS_URL).port || '6379'),
        password: new URL(REDIS_URL).password || undefined,
      },
    });
  }

  async addJob(leadId: string, leadPayload: LeadPayload): Promise<string> {
    const job = await this.queue.add('enrich-lead', {
      leadId,
      leadPayload,
    });

    logger.info('Job added to queue', {
      jobId: job.id,
      leadId,
      businessName: leadPayload.business_name,
    });

    return job.id!;
  }

  async getJobStatus(jobId: string): Promise<unknown> {
    const job = await this.queue.getJob(jobId);
    if (!job) {
      return null;
    }

    const state = await job.getState();
    const progress = job.progress;
    const returnValue = job.returnvalue;
    const failedReason = job.failedReason;

    return {
      id: job.id,
      state,
      progress,
      returnValue,
      failedReason,
      data: job.data,
    };
  }
}

