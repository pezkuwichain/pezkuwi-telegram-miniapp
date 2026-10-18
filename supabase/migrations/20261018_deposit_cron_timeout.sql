-- The deposit check takes longer than pg_net's default 5 s timeout (about
-- 15-30 s with 53 users, as TronGrid requests go one at a time), so every call
-- was recorded as a timeout and the result it returns (deposits found, errors)
-- was never stored. The function itself runs on either way; with a 60 s
-- timeout net._http_response keeps each run's result.
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'check-deposits-job'),
  command := $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/check-deposits',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
