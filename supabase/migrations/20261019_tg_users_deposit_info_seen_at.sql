-- When the user last opened the deposit screen. check-deposits checks the
-- TRC20 addresses of users seen in the last 24 hours on every run and all
-- users only every six hours, to stay inside TronGrid's free daily quota.
ALTER TABLE tg_users ADD COLUMN IF NOT EXISTS deposit_info_seen_at timestamptz;
