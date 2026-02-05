/**
 * Retry Utility Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { withRetry, withTimeout, createRetryWrapper } from './retry';

describe('retry utilities', () => {
  describe('withRetry', () => {
    it('should succeed on first try', async () => {
      const fn = vi.fn().mockResolvedValue('success');

      const result = await withRetry(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('Network Error'))
        .mockRejectedValueOnce(new Error('Network Error'))
        .mockResolvedValue('success');

      const result = await withRetry(fn, { maxAttempts: 3, initialDelayMs: 10 });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should throw after max attempts', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Network Error'));

      await expect(withRetry(fn, { maxAttempts: 3, initialDelayMs: 10 })).rejects.toThrow(
        'Network Error'
      );

      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should not retry on non-retryable errors', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Validation failed'));

      await expect(withRetry(fn, { maxAttempts: 3, initialDelayMs: 10 })).rejects.toThrow(
        'Validation failed'
      );

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should call onRetry callback', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('Network Error'))
        .mockResolvedValue('success');

      const onRetry = vi.fn();

      await withRetry(fn, { maxAttempts: 3, initialDelayMs: 10, onRetry });

      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error));
    });

    it('should use custom retry condition', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('Custom retry error'))
        .mockResolvedValue('success');

      const result = await withRetry(fn, {
        maxAttempts: 3,
        initialDelayMs: 10,
        retryCondition: (err) => err.message.includes('Custom'),
      });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('withTimeout', () => {
    it('should resolve if function completes before timeout', async () => {
      const fn = vi.fn().mockResolvedValue('success');

      const result = await withTimeout(fn, 1000);

      expect(result).toBe('success');
    });

    it('should reject if timeout is exceeded', async () => {
      const fn = vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(resolve, 500);
          })
      );

      await expect(withTimeout(fn, 50)).rejects.toThrow('TIMEOUT');
    });

    it('should use custom timeout error message', async () => {
      const fn = vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(resolve, 500);
          })
      );

      await expect(withTimeout(fn, 50, 'Operation timed out')).rejects.toThrow(
        'Operation timed out'
      );
    });
  });

  describe('createRetryWrapper', () => {
    it('should create a function that retries on failure', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('Network Error'))
        .mockResolvedValue('success');

      const wrappedFn = createRetryWrapper(fn as () => Promise<string>, {
        maxAttempts: 3,
        initialDelayMs: 10,
      });

      const result = await wrappedFn();

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should pass all arguments through', async () => {
      const fn = vi.fn().mockResolvedValue('success');

      const wrappedFn = createRetryWrapper(fn as (a: string, b: number) => Promise<string>, {
        maxAttempts: 2,
      });

      await wrappedFn('arg1', 42);

      expect(fn).toHaveBeenCalledWith('arg1', 42);
    });
  });
});
