
CREATE TABLE public.sac_otp_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('signup','login')),
  attempts int NOT NULL DEFAULT 0,
  used boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sac_otp_codes_email_idx ON public.sac_otp_codes(email, used, expires_at);

GRANT ALL ON public.sac_otp_codes TO service_role;
ALTER TABLE public.sac_otp_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only" ON public.sac_otp_codes FOR ALL TO service_role USING (true) WITH CHECK (true);
