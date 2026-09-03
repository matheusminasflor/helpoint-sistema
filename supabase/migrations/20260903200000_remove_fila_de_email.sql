-- Remove a fila de e-mail (pgmq + cron + funções + tabelas) criada em
-- 20260526182710_email_infra.sql. Os e-mails de login saem do GoTrue por SMTP
-- (supabase/config.toml); os transacionais, de _shared/email.ts. Nada mais
-- enfileira, lê ou registra aqui. As tabelas estavam vazias.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-email-queue') THEN
    PERFORM cron.unschedule('process-email-queue');
  END IF;
END $$;

-- As filas primeiro: seus triggers email_queue_wake_* dependem da função abaixo.
-- Esses triggers e email_queue_dispatch/wake nunca estiveram em migration —
-- foram criados direto no banco; por isso tudo aqui é IF EXISTS.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgmq') THEN
    PERFORM pgmq.drop_queue(q) FROM unnest(ARRAY[
      'auth_emails', 'auth_emails_dlq', 'transactional_emails', 'transactional_emails_dlq'
    ]) AS q WHERE q IN (SELECT queue_name FROM pgmq.list_queues());
  END IF;
END $$;
DROP EXTENSION IF EXISTS pgmq;
DROP SCHEMA IF EXISTS pgmq; -- a extensão não leva o schema vazio junto

DROP FUNCTION IF EXISTS public.email_queue_dispatch();
DROP FUNCTION IF EXISTS public.email_queue_wake();
DROP FUNCTION IF EXISTS public.enqueue_email(TEXT, JSONB);
DROP FUNCTION IF EXISTS public.read_email_batch(TEXT, INT, INT);
DROP FUNCTION IF EXISTS public.delete_email(TEXT, BIGINT);
DROP FUNCTION IF EXISTS public.move_to_dlq(TEXT, TEXT, BIGINT, JSONB);

DROP TABLE IF EXISTS public.email_send_log;
DROP TABLE IF EXISTS public.email_send_state;
DROP TABLE IF EXISTS public.suppressed_emails;
DROP TABLE IF EXISTS public.email_unsubscribe_tokens;
