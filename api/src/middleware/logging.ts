import { Request, Response, NextFunction } from 'express';
import { logger } from '@tsi-fit-score/shared';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();

  // Log request
  logger.info('Incoming request', {
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });

  // Override res.json to log response
  const originalJson = res.json.bind(res);
  res.json = function (body: unknown) {
    const duration = Date.now() - startTime;
    logger.info('Request completed', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
    });
    return originalJson(body);
  };

  next();
}

export function errorLogger(err: Error, req: Request, res: Response, next: NextFunction): void {
  logger.error('Request error', {
    error: err.message,
    stack: err.stack,
    method: req.method,
    path: req.path,
  });

  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

