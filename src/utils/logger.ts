import winston from 'winston';

// Patterns for sensitive data that should be redacted in logs
const SENSITIVE_PATTERNS = [
  { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, replacement: '[EMAIL_REDACTED]' },
  { pattern: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, replacement: '[PHONE_REDACTED]' },
];

function redactSensitiveData(message: string): string {
  return SENSITIVE_PATTERNS.reduce(
    (result, { pattern, replacement }) => result.replace(pattern, replacement),
    message
  );
}

export function redactObject(obj: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      redacted[key] = redactSensitiveData(value);
    } else if (typeof value === 'object' && value !== null) {
      redacted[key] = redactObject(value as Record<string, unknown>);
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}

const customFormat = winston.format.printf(({ level, message, timestamp, ...meta }) => {
  const redactedMessage = typeof message === 'string' ? redactSensitiveData(message) : message;
  const metaStr = Object.keys(meta).length > 0 ? JSON.stringify(redactObject(meta)) : '';
  return `${timestamp} [${level.toUpperCase()}]: ${redactedMessage} ${metaStr}`.trim();
});

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    customFormat
  ),
  transports: [new winston.transports.Console()],
});
