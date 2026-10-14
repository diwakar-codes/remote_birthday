-- =====================================================================
-- Remote Birthday - automatic cleanup every 10 minutes
-- Run AFTER your app is deployed on Vercel.
--
-- Replace the 2 placeholders below:
--   YOUR-APP.vercel.app   -> your real Vercel domain
--   YOUR_CRON_SECRET      -> the same value as CRON_SECRET in Vercel env vars
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove an older version of the job if you re-run this file
select cron.unschedule(jobid) from cron.job where jobname = 'cleanup-expired-celebrations';

select cron.schedule(
  'cleanup-expired-celebrations',
  '*/10 * * * *',
  $$
  select net.http_post(
    url     := 'https://YOUR-APP.vercel.app/api/cleanup',
    headers := jsonb_build_object(
      'Authorization', 'Bearer YOUR_CRON_SECRET',
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- Check it later with:
--   select * from cron.job_run_details order by start_time desc limit 10;
--   select * from net._http_response order by created desc limit 10;
