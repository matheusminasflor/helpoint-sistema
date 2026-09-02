DO $$
DECLARE
  _jobid bigint;
BEGIN
  SELECT jobid INTO _jobid FROM cron.job WHERE jobname = 'mkt-publish-due-5min';
  IF _jobid IS NOT NULL THEN
    PERFORM cron.unschedule(_jobid);
  END IF;
END $$;

SELECT cron.schedule(
  'mkt-publish-due-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://csbhhvgnbpleinxlpkcd.supabase.co/functions/v1/mkt-publish-due',
    headers := jsonb_build_object('Content-Type','application/json'),
    body := jsonb_build_object('source','cron')
  ) AS request_id;
  $$
);