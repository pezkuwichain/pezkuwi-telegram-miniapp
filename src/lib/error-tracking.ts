/**
 * Error Tracking Utility
 * Centralized error logging and tracking infrastructure
 *
 * In production, this can be connected to:
 * - Sentry (recommended)
 * - LogRocket
 * - Custom analytics endpoint
 */

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
  // Map technical errors to user-friendly messages
  const errorMap: Record<string, string> = {
    'Network Error': 'Têkiliya înternetê tune ye. Ji kerema xwe têkiliya xwe kontrol bike.',
    'Failed to fetch': 'Têkiliya înternetê tune ye. Ji kerema xwe têkiliya xwe kontrol bike.',
    TIMEOUT: 'Operasyon zêde dirêj kişand. Ji kerema xwe dîsa biceribîne.',
    'Wallet not found': 'Wallet nehate dîtin. Ji kerema xwe wallet çêke an jî restore bike.',
    'Şîfre (password) çewt e': 'Şîfre (password) çewt e. Ji kerema xwe dîsa biceribîne.',
  };

  for (const [key, message] of Object.entries(errorMap)) {
    if (error.message.includes(key)) {
      return message;
    }
  }

  return 'Tiştek çewt çêbû. Ji kerema xwe dîsa biceribîne.';
}
