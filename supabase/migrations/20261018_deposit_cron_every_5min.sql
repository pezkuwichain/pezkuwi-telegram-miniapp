-- Check deposits every five minutes instead of every minute. Each run walks
-- every user's TRC20 address at ~4 TronGrid requests a second, so a
-- one-minute schedule stops fitting at roughly 150 users; five minutes keeps
-- headroom for growth at the cost of up to five minutes' detection delay.
--
-- The job is owned by supabase_admin, so this must be applied as that role.
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'check-deposits-job'),
  schedule := '*/5 * * * *'
);
