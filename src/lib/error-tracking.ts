/**
 * Error Tracking Utility
 * Centralized error logging and tracking infrastructure
 *
 * In production, this can be connected to:
 * - Sentry (recommended)
 * - LogRocket
 * - Custom analytics endpoint
 */

import { translate } from '@/i18n';

export interface ErrorContext {
  component?: string;
  action?: string;
  userId?: string;
  extra?: Record<string, unknown>;
}

export interface TrackedError {
  message: string;
  stack?: string;
  timestamp: number;
  context?: ErrorContext;
  fingerprint?: string;
}

// In-memory error buffer (last 50 errors for debugging)
const errorBuffer: TrackedError[] = [];
const MAX_BUFFER_SIZE = 50;

/**
 * Generate a fingerprint for deduplication
 */
function generateFingerprint(error: Error, context?: ErrorContext): string {
  const parts = [error.name, error.message, context?.component, context?.action].filter(Boolean);
  return parts.join('::');
}

/**
 * Track an error
 */
export function trackError(error: Error, context?: ErrorContext): void {
  const trackedError: TrackedError = {
    message: error.message,
    stack: error.stack,
    timestamp: Date.now(),
    context,
    fingerprint: generateFingerprint(error, context),
  };

  // Add to buffer (FIFO)
  errorBuffer.push(trackedError);
  if (errorBuffer.length > MAX_BUFFER_SIZE) {
    errorBuffer.shift();
  }

  // Log in development
  if (import.meta.env.DEV) {
    console.error('[ErrorTracking]', {
      error: error.message,
      stack: error.stack,
      context,
    });
  }

  // TODO: In production, send to error tracking service
  // sendToSentry(trackedError);
  // sendToAnalytics(trackedError);
}

/**
 * Track a warning (non-critical issue)
 */
export function trackWarning(message: string, context?: ErrorContext): void {
  if (import.meta.env.DEV) {
    console.warn('[Warning]', message, context);
  }

  // TODO: In production, send to analytics
}

/**
 * Get recent errors (for debugging)
 */
export function getRecentErrors(): TrackedError[] {
  return [...errorBuffer];
}

/**
 * Clear error buffer
 */
export function clearErrorBuffer(): void {
  errorBuffer.length = 0;
}

/**
 * Create an error with context
 */
export function createError(message: string, context?: ErrorContext): Error {
  const error = new Error(message);
  trackError(error, context);
  return error;
}

/**
 * Safe error extraction from unknown catch value
 */
export function extractError(caught: unknown): Error {
  if (caught instanceof Error) {
    return caught;
  }
  if (typeof caught === 'string') {
    return new Error(caught);
  }
  return new Error('An unknown error occurred');
}

/**
 * Format error for user display
 */
export function formatUserError(error: Error): string {
  // Map technical errors to translation keys
  const errorMap: Record<string, string> = {
    'Network Error': 'errors.networkError',
    'Failed to fetch': 'errors.networkError',
    TIMEOUT: 'errors.timeout',
    'Wallet not found': 'errors.walletNotFound',
    'Şîfre (password) çewt e': 'errors.wrongPassword',
  };

  for (const [key, translationKey] of Object.entries(errorMap)) {
    if (error.message.includes(key)) {
      return translate(translationKey);
    }
  }

  return translate('errors.default');
}
