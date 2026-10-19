// The TRC20 check costs one TronGrid request per user, and the free plan
// allows 10,000 a day ("Exceed the user daily usage (10000)", logged
// 2026-10-19). Checking every user every five minutes needs ~29,000 a day at
// 101 users, so only users who opened the deposit screen recently are checked
// on every run; everyone else is checked by a full scan every six hours.

export const ACTIVE_WINDOW_MS = 24 * 60 * 60 * 1000;
export const FULL_SCAN_EVERY_HOURS = 6;
// The cron runs every five minutes, so exactly one run per full-scan hour
// starts inside this window.
export const FULL_SCAN_WINDOW_MINUTES = 5;

export function isFullScanRun(now: Date): boolean {
  return (
    now.getUTCHours() % FULL_SCAN_EVERY_HOURS === 0 &&
    now.getUTCMinutes() < FULL_SCAN_WINDOW_MINUTES
  );
}

export interface Trc20User {
  deposit_info_seen_at: string | null;
}

export function selectTrc20Users<T extends Trc20User>(users: T[], now: Date): T[] {
  if (isFullScanRun(now)) return users;
  const since = now.getTime() - ACTIVE_WINDOW_MS;
  return users.filter((user) => {
    if (!user.deposit_info_seen_at) return false;
    const seen = Date.parse(user.deposit_info_seen_at);
    return !Number.isNaN(seen) && seen >= since;
  });
}
