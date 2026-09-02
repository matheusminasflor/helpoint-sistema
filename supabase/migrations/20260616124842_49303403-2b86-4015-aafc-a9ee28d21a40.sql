
CREATE TABLE public.daily_email_otps (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_email_otps TO authenticated;
GRANT ALL ON public.daily_email_otps TO service_role;

ALTER TABLE public.daily_email_otps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage their own daily otps"
ON public.daily_email_otps
FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE INDEX idx_daily_email_otps_user_day ON public.daily_email_otps (user_id, verified_at);

CREATE OR REPLACE FUNCTION public.is_email_verified_today()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.daily_email_otps
    WHERE user_id = auth.uid()
      AND verified_at IS NOT NULL
      AND verified_at::date = (now() AT TIME ZONE 'America/Sao_Paulo')::date
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_email_verified_today() TO authenticated;
