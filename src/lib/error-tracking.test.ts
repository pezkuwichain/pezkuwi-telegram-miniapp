/**
 * Error Tracking Utility Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  trackError,
  trackWarning,
  getRecentErrors,
  clearErrorBuffer,
  createError,
  extractError,
  formatUserError,
} from './error-tracking';

describe('error-tracking utilities', () => {
  beforeEach(() => {
    clearErrorBuffer();
  });

  describe('trackError', () => {
    it('should add error to buffer', () => {
      const error = new Error('Test error');

      trackError(error);

      const errors = getRecentErrors();
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toBe('Test error');
    });

    it('should include context in tracked error', () => {
      const error = new Error('Test error');

      trackError(error, { component: 'TestComponent', action: 'test_action' });

      const errors = getRecentErrors();
      expect(errors[0].context?.component).toBe('TestComponent');
      expect(errors[0].context?.action).toBe('test_action');
    });

    it('should include timestamp', () => {
      const before = Date.now();
      trackError(new Error('Test'));
      const after = Date.now();

      const errors = getRecentErrors();
      expect(errors[0].timestamp).toBeGreaterThanOrEqual(before);
      expect(errors[0].timestamp).toBeLessThanOrEqual(after);
    });

    it('should limit buffer to 50 errors', () => {
      for (let i = 0; i < 60; i++) {
        trackError(new Error(`Error ${i}`));
      }

      const errors = getRecentErrors();
      expect(errors).toHaveLength(50);
      expect(errors[0].message).toBe('Error 10'); // First 10 should be removed
    });
  });

  describe('trackWarning', () => {
    it('should not throw', () => {
      expect(() => trackWarning('Test warning')).not.toThrow();
    });

    it('should accept context', () => {
      expect(() => trackWarning('Test warning', { action: 'test' })).not.toThrow();
    });
  });

  describe('clearErrorBuffer', () => {
    it('should clear all errors', () => {
      trackError(new Error('Error 1'));
      trackError(new Error('Error 2'));

      expect(getRecentErrors()).toHaveLength(2);

      clearErrorBuffer();

      expect(getRecentErrors()).toHaveLength(0);
    });
  });

  describe('createError', () => {
    it('should create and track error', () => {
      const error = createError('Created error', { component: 'Test' });

      expect(error.message).toBe('Created error');
      expect(getRecentErrors()).toHaveLength(1);
    });
  });

  describe('extractError', () => {
    it('should return Error instance unchanged', () => {
      const error = new Error('Test');
      expect(extractError(error)).toBe(error);
    });

    it('should convert string to Error', () => {
      const error = extractError('String error');
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('String error');
    });

    it('should handle unknown types', () => {
      const error = extractError({ weird: 'object' });
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('An unknown error occurred');
    });

    it('should handle null', () => {
      const error = extractError(null);
      expect(error).toBeInstanceOf(Error);
    });

    it('should handle undefined', () => {
      const error = extractError(undefined);
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('formatUserError', () => {
    it('should format network errors', () => {
      const error = new Error('Network Error');
      const message = formatUserError(error);
      expect(message).toContain('înternetê');
    });

    it('should format fetch errors', () => {
      const error = new Error('Failed to fetch');
      const message = formatUserError(error);
      expect(message).toContain('înternetê');
    });

    it('should format timeout errors', () => {
      const error = new Error('TIMEOUT');
      const message = formatUserError(error);
      expect(message).toContain('dirêj');
    });

    it('should format wallet not found errors', () => {
      const error = new Error('Wallet not found');
      const message = formatUserError(error);
      expect(message).toContain('Wallet');
    });

    it('should format password errors', () => {
      const error = new Error('Şîfre (password) çewt e');
      const message = formatUserError(error);
      expect(message).toContain('Şîfre');
    });

    it('should return generic message for unknown errors', () => {
      const error = new Error('Some random error');
      const message = formatUserError(error);
      expect(message).toContain('çewt');
    });
  });
});
