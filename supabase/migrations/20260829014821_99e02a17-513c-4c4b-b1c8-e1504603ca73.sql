-- ============ AI credentials (BYOK) ============
-- ATENÇÃO: armazenamento restrito a service_role. Sem GRANT para anon/authenticated:
-- a coluna api_key NUNCA pode ser lida pelo frontend. Apenas edge functions
-- (service_role) leem a chave em texto para chamar o provedor.
CREATE TABLE IF NOT EXISTS public.tenant_ai_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('anthropic','openai','google')),
  api_key text NOT NULL,
  key_last4 text,
  model text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_ai_credentials_one_active
  ON public.tenant_ai_credentials (tenant_id) WHERE is_active;

GRANT ALL ON public.tenant_ai_credentials TO service_role;
ALTER TABLE public.tenant_ai_credentials ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER tenant_ai_credentials_updated_at
  BEFORE UPDATE ON public.tenant_ai_credentials
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============ Social account secrets ============
CREATE TABLE IF NOT EXISTS public.mkt_social_account_secrets (
  account_id uuid PRIMARY KEY REFERENCES public.mkt_social_accounts(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  access_token text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.mkt_social_account_secrets TO service_role;
ALTER TABLE public.mkt_social_account_secrets ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER mkt_social_account_secrets_updated_at
  BEFORE UPDATE ON public.mkt_social_account_secrets
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.mkt_social_accounts
  ADD COLUMN IF NOT EXISTS is_connected boolean NOT NULL DEFAULT false;

INSERT INTO public.mkt_social_account_secrets (account_id, tenant_id, access_token)
SELECT a.id, a.tenant_id, a.access_token
FROM public.mkt_social_accounts a
WHERE a.access_token IS NOT NULL
ON CONFLICT (account_id) DO NOTHING;

UPDATE public.mkt_social_accounts SET is_connected = true WHERE access_token IS NOT NULL;
UPDATE public.mkt_social_accounts SET access_token = NULL WHERE access_token IS NOT NULL;