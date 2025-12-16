import { Worker } from 'bullmq';
import { logger } from '@tsi-fit-score/shared';
import { EnrichmentProcessor, EnrichmentJobData } from './processors/enrichLead';

const REDIS_URL = process.env.REDIS_URL;
if (!REDIS_URL) {
  throw new Error('REDIS_URL environment variable is required');
}

const QUEUE_NAME = 'lead-enrichment';

// Create worker
const worker = new Worker<EnrichmentJobData>(
  QUEUE_NAME,
  async (job) => {
    const processor = new EnrichmentProcessor();
    await processor.process(job);
  },
  {
    connection: {
      host: new URL(REDIS_URL).hostname,
      port: parseInt(new URL(REDIS_URL).port || '6379'),
      password: new URL(REDIS_URL).password || undefined,
    },
    concurrency: 5, // Process up to 5 jobs concurrently
    removeOnComplete: {
      count: 100, // Keep last 100 completed jobs
      age: 24 * 3600, // Keep for 24 hours
    },
    removeOnFail: {
      count: 1000, // Keep last 1000 failed jobs
    },
  }
);

worker.on('completed', (job) => {
  logger.info('Job completed', {
    jobId: job.id,
    leadId: job.data.leadId,
  });
});

worker.on('failed', (job, err) => {
  logger.error('Job failed', {
    jobId: job?.id,
    leadId: job?.data.leadId,
    error: err.message,
  });
});

worker.on('error', (err) => {
  logger.error('Worker error', {
    error: err.message,
  });
});

logger.info('Worker started', {
  queue: QUEUE_NAME,
  concurrency: 5,
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down worker gracefully');
  await worker.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down worker gracefully');
  await worker.close();
  process.exit(0);
});

