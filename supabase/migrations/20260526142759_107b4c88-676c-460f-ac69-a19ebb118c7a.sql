
ALTER TABLE public.sac_products
  ADD COLUMN IF NOT EXISTS image_url text;

ALTER TABLE public.sac_tickets
  ADD COLUMN IF NOT EXISTS invoice_attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS satisfaction_resolved text,
  ADD COLUMN IF NOT EXISTS satisfaction_comment text,
  ADD COLUMN IF NOT EXISTS satisfaction_rated_at timestamptz;

ALTER TABLE public.sac_tickets
  DROP CONSTRAINT IF EXISTS sac_tickets_satisfaction_resolved_check;
ALTER TABLE public.sac_tickets
  ADD CONSTRAINT sac_tickets_satisfaction_resolved_check
  CHECK (satisfaction_resolved IS NULL OR satisfaction_resolved IN ('yes','partial','no'));

ALTER TABLE public.customer_profiles
  ADD COLUMN IF NOT EXISTS onboarded_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_sac_tickets_satisfaction
  ON public.sac_tickets(tenant_id, satisfaction_rating)
  WHERE satisfaction_rating IS NOT NULL;
