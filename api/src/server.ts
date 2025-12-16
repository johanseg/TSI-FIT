import express, { Express } from 'express';
import { logger } from '@tsi-fit-score/shared';
import { requestLogger, errorLogger } from './middleware/logging';
import { validateIngestPayload } from './middleware/validation';
import ingestRouter from './routes/ingest';
import healthRouter from './routes/health';
import leadRouter from './routes/lead';

const app: Express = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(requestLogger);

// Routes
app.use('/health', healthRouter);
app.use('/ingest', validateIngestPayload, ingestRouter);
app.use('/lead', leadRouter);

// Error handling
app.use(errorLogger);

// Start server
app.listen(PORT, () => {
  logger.info('API server started', {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
  });
});

export default app;

