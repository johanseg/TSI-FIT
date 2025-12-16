import { logger } from './logger';

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  resetTimeoutMs?: number;
  monitoringWindowMs?: number;
}

const DEFAULT_OPTIONS: Required<CircuitBreakerOptions> = {
  failureThreshold: 5,
  resetTimeoutMs: 60000, // 60 seconds
  monitoringWindowMs: 60000, // 60 seconds
};

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures: number[] = [];
  private lastFailureTime: number | null = null;
  private options: Required<CircuitBreakerOptions>;

  constructor(options: CircuitBreakerOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  async execute<T>(fn: () => Promise<T>, context?: string): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      const now = Date.now();
      if (this.lastFailureTime && now - this.lastFailureTime >= this.options.resetTimeoutMs) {
        logger.info('Circuit breaker transitioning to HALF_OPEN', { context: context || 'circuit-breaker' });
        this.state = CircuitState.HALF_OPEN;
      } else {
        throw new Error('Circuit breaker is OPEN - service unavailable');
      }
    }

    try {
      const result = await fn();
      
      if (this.state === CircuitState.HALF_OPEN) {
        logger.info('Circuit breaker transitioning to CLOSED after successful call', {
          context: context || 'circuit-breaker',
        });
        this.state = CircuitState.CLOSED;
        this.failures = [];
        this.lastFailureTime = null;
      } else {
        // Clean up old failures outside monitoring window
        this.cleanupOldFailures();
      }

      return result;
    } catch (error) {
      this.recordFailure();

      if (this.state === CircuitState.HALF_OPEN) {
        logger.warn('Circuit breaker transitioning back to OPEN after HALF_OPEN failure', {
          context: context || 'circuit-breaker',
        });
        this.state = CircuitState.OPEN;
        this.lastFailureTime = Date.now();
      } else if (this.failures.length >= this.options.failureThreshold) {
        logger.error('Circuit breaker opening due to failure threshold', {
          context: context || 'circuit-breaker',
          failures: this.failures.length,
          threshold: this.options.failureThreshold,
        });
        this.state = CircuitState.OPEN;
        this.lastFailureTime = Date.now();
      }

      throw error;
    }
  }

  private recordFailure(): void {
    const now = Date.now();
    this.failures.push(now);
    this.lastFailureTime = now;
    this.cleanupOldFailures();
  }

  private cleanupOldFailures(): void {
    const cutoff = Date.now() - this.options.monitoringWindowMs;
    this.failures = this.failures.filter((time) => time > cutoff);
  }

  getState(): CircuitState {
    return this.state;
  }

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failures = [];
    this.lastFailureTime = null;
  }
}

