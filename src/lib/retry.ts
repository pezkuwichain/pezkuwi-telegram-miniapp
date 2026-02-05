/**
 * Retry Utility
 * Implements exponential backoff with jitter for resilient operations
 */

import { trackError, trackWarning } from './error-tracking';

export interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  jitter?: boolean;
  onRetry?: (attempt: number, error: Error) => void;
  retryCondition?: (error: Error) => boolean;
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, 'onRetry' | 'retryCondition'>> = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitter: true,
};

/**
 * Calculate delay with exponential backoff and optional jitter
 */
function calculateDelay(
  attempt: number,
  initialDelayMs: number,
  maxDelayMs: number,
  backoffMultiplier: number,
  jitter: boolean
): number {
  let delay = initialDelayMs * Math.pow(backoffMultiplier, attempt - 1);
  delay = Math.min(delay, maxDelayMs);

  if (jitter) {
    // Add random jitter (±25%)
    const jitterFactor = 0.75 + Math.random() * 0.5;
    delay = Math.floor(delay * jitterFactor);
  }

  return delay;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Default retry condition - retry on network and timeout errors
 */
function defaultRetryCondition(error: Error): boolean {
  const retryableErrors = [
    'Network Error',
    'Failed to fetch',
    'TIMEOUT',
    'ECONNRESET',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'fetch failed',
    'network request failed',
  ];

  return retryableErrors.some(
    (msg) => error.message.toLowerCase().includes(msg.toLowerCase()) || error.name === msg
  );
}

/**
 * Execute a function with automatic retry and exponential backoff
 *
 * @example
 * const result = await withRetry(() => fetchData(), { maxAttempts: 5 });
 */
export async function withRetry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T> {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const retryCondition = options?.retryCondition ?? defaultRetryCondition;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if we should retry
      if (attempt >= config.maxAttempts || !retryCondition(lastError)) {
        trackError(lastError, { action: 'retry_failed', extra: { attempt } });
        throw lastError;
      }

      // Calculate delay and wait
      const delay = calculateDelay(
        attempt,
        config.initialDelayMs,
        config.maxDelayMs,
        config.backoffMultiplier,
        config.jitter
      );

      trackWarning(`Retry attempt ${attempt}/${config.maxAttempts}, waiting ${delay}ms`, {
        action: 'retry_attempt',
        extra: { error: lastError.message },
      });

      // Call optional retry callback
      if (options?.onRetry) {
        options.onRetry(attempt, lastError);
      }

      await sleep(delay);
    }
  }

  // This shouldn't happen, but TypeScript needs it
  throw lastError ?? new Error('Retry failed');
}

/**
 * Create a retry wrapper for a specific function
 *
 * @example
 * const fetchWithRetry = createRetryWrapper(fetchData, { maxAttempts: 5 });
 * const result = await fetchWithRetry();
 */
export function createRetryWrapper<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  options?: RetryOptions
): (...args: TArgs) => Promise<TResult> {
  return (...args: TArgs) => withRetry(() => fn(...args), options);
}

/**
 * Execute with timeout
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  timeoutError?: string
): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(timeoutError ?? 'TIMEOUT')), timeoutMs)
    ),
  ]);
}

/**
 * Execute with both retry and timeout
 */
export async function withRetryAndTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  retryOptions?: RetryOptions
): Promise<T> {
  return withRetry(() => withTimeout(fn, timeoutMs), retryOptions);
}
