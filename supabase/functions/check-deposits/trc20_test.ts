import { assertEquals } from 'jsr:@std/assert@1';
import { isFullScanRun, selectTrc20Users } from './trc20.ts';

const at = (iso: string) => new Date(iso);
const users = [
  { id: 'recent', deposit_info_seen_at: '2026-10-19T09:00:00Z' },
  { id: 'stale', deposit_info_seen_at: '2026-10-17T09:00:00Z' },
  { id: 'never', deposit_info_seen_at: null },
  { id: 'garbled', deposit_info_seen_at: 'not a date' },
];
const ids = (list: { id: string }[]) => list.map((u) => u.id);

Deno.test('an ordinary run checks only users seen in the last 24 hours', () => {
  assertEquals(ids(selectTrc20Users(users, at('2026-10-19T10:35:00Z'))), ['recent']);
});

Deno.test('a user seen exactly 24 hours ago is still checked', () => {
  const edge = [{ id: 'edge', deposit_info_seen_at: '2026-10-18T10:35:00Z' }];
  assertEquals(ids(selectTrc20Users(edge, at('2026-10-19T10:35:00Z'))), ['edge']);
});

Deno.test('the full-scan run checks everyone', () => {
  assertEquals(ids(selectTrc20Users(users, at('2026-10-19T12:00:20Z'))), ids(users));
});

Deno.test('exactly one five-minute run per full-scan hour is a full scan', () => {
  assertEquals(isFullScanRun(at('2026-10-19T00:00:15Z')), true);
  assertEquals(isFullScanRun(at('2026-10-19T06:04:59Z')), true);
  assertEquals(isFullScanRun(at('2026-10-19T06:05:00Z')), false);
  assertEquals(isFullScanRun(at('2026-10-19T07:00:15Z')), false);
  assertEquals(isFullScanRun(at('2026-10-19T18:00:15Z')), true);
});
