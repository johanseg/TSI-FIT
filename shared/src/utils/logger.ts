import winston from 'winston';

// Redact sensitive information from logs
function redactSensitiveData(text: string): string {
  if (!text) return text;

  // Redact email addresses
  text = text.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL_REDACTED]');

  // Redact phone numbers (various formats)
  text = text.replace(/\b(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, '[PHONE_REDACTED]');
  text = text.replace(/\b\+?\d{1,3}[-.\s]?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,9}\b/g, '[PHONE_REDACTED]');

  return text;
}

// Custom format that redacts sensitive data
const redactFormat = winston.format.printf(({ level, message, timestamp, ...metadata }) => {
  const redactedMessage = redactSensitiveData(String(message));
  const redactedMetadata = JSON.stringify(metadata, null, 2);
  const redactedMetadataStr = redactSensitiveData(redactedMetadata);

  return `${timestamp} [${level}]: ${redactedMessage} ${redactedMetadataStr !== '{}' ? redactedMetadataStr : ''}`;
});

const logLevel = process.env.LOG_LEVEL || 'info';

export const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    redactFormat
  ),
  defaultMeta: { service: 'tsi-fit-score' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        redactFormat
      ),
    }),
  ],
});

// Helper function to redact objects before logging
export function redactObject(obj: Record<string, unknown>): Record<string, unknown> {
  const redacted = { ...obj };
  const redactedStr = JSON.stringify(redacted);
  const cleaned = redactSensitiveData(redactedStr);
  return JSON.parse(cleaned);
}

