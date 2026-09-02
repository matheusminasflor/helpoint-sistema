-- Schedule check-alerts edge function to run every hour
-- Removes any prior schedule to keep idempotent
DO $$
DECLARE
  _jobid bigint;
BEGIN
  SELECT jobid INTO _jobid FROM cron.job WHERE jobname = 'check-alerts-hourly';
  IF _jobid IS NOT NULL THEN
    PERFORM cron.unschedule(_jobid);
  END IF;
END $$;

SELECT cron.schedule(
  'check-alerts-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://csbhhvgnbpleinxlpkcd.supabase.co/functions/v1/check-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNzYmhodmduYnBsZWlueGxwa2NkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwMDM2OTYsImV4cCI6MjA4NDU3OTY5Nn0.WFaevKDrJ_pMDE0r7Lj9bcGPKZUbvALilD8hE1WYy2k'
    ),
    body := jsonb_build_object('source', 'cron')
  ) AS request_id;
  $$
);