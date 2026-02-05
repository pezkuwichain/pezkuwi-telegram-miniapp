import { describe, it, expect } from 'vitest';
import { cn, formatNumber, formatDate, formatAddress } from './utils';

describe('utils', () => {
  describe('cn', () => {
    it('merges class names correctly', () => {
      expect(cn('foo', 'bar')).toBe('foo bar');
      const condition = false;
      expect(cn('foo', condition && 'bar', 'baz')).toBe('foo baz');
    });

    it('handles tailwind conflicts', () => {
      expect(cn('p-4', 'p-2')).toBe('p-2');
      expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
    });
  });

  describe('formatNumber', () => {
    it('formats small numbers as-is', () => {
      expect(formatNumber(0)).toBe('0');
      expect(formatNumber(999)).toBe('999');
    });

    it('formats thousands with K suffix', () => {
      expect(formatNumber(1000)).toBe('1.0K');
      expect(formatNumber(1500)).toBe('1.5K');
      expect(formatNumber(999999)).toBe('1000.0K');
    });

    it('formats millions with M suffix', () => {
      expect(formatNumber(1000000)).toBe('1.0M');
      expect(formatNumber(2500000)).toBe('2.5M');
    });
  });

  describe('formatAddress', () => {
    it('truncates long addresses', () => {
      const address = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
      expect(formatAddress(address)).toBe('5Grwva...GKutQY'); // default: 6 chars from each end
      expect(formatAddress(address, 4)).toBe('5Grw...utQY');
    });

    it('returns short addresses unchanged', () => {
      expect(formatAddress('abc')).toBe('abc');
      expect(formatAddress('')).toBe('');
    });
  });

  describe('formatDate', () => {
    it('formats recent dates as relative time', () => {
      const now = new Date();
      expect(formatDate(now)).toBe('Niha');

      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
      expect(formatDate(fiveMinutesAgo)).toBe('5 deq berê');

      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      expect(formatDate(twoHoursAgo)).toBe('2 saet berê');

      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
      expect(formatDate(threeDaysAgo)).toBe('3 roj berê');
    });
  });
});
