-- Create separate table for sensitive license keys
CREATE TABLE IF NOT EXISTS public.software_license_keys (
  license_id uuid PRIMARY KEY REFERENCES public.software_licenses(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  license_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.software_license_keys ENABLE ROW LEVEL SECURITY;

-- RLS: only supervisors and above can manage/view license keys
CREATE POLICY "Supervisors can view license keys"
ON public.software_license_keys
FOR SELECT
USING (
  tenant_id = get_user_tenant_id()
  AND is_supervisor_or_higher(auth.uid())
);

CREATE POLICY "Supervisors can create license keys"
ON public.software_license_keys
FOR INSERT
WITH CHECK (
  tenant_id = get_user_tenant_id()
  AND is_supervisor_or_higher(auth.uid())
);

CREATE POLICY "Supervisors can update license keys"
ON public.software_license_keys
FOR UPDATE
USING (
  tenant_id = get_user_tenant_id()
  AND is_supervisor_or_higher(auth.uid())
)
WITH CHECK (
  tenant_id = get_user_tenant_id()
  AND is_supervisor_or_higher(auth.uid())
);

CREATE POLICY "Supervisors can delete license keys"
ON public.software_license_keys
FOR DELETE
USING (
  tenant_id = get_user_tenant_id()
  AND is_supervisor_or_higher(auth.uid())
);

-- Trigger for updated_at
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_software_license_keys_updated_at'
  ) THEN
    CREATE TRIGGER trg_software_license_keys_updated_at
    BEFORE UPDATE ON public.software_license_keys
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();
  END IF;
END $$;

-- Prevent storing secrets in software_licenses.license_key (kept only for backward compatibility)
CREATE OR REPLACE FUNCTION public.nullify_software_licenses_license_key()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  -- never store license keys in the main table (use software_license_keys instead)
  NEW.license_key := NULL;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_software_licenses_nullify_license_key'
  ) THEN
    CREATE TRIGGER trg_software_licenses_nullify_license_key
    BEFORE INSERT OR UPDATE OF license_key ON public.software_licenses
    FOR EACH ROW
    EXECUTE FUNCTION public.nullify_software_licenses_license_key();
  END IF;
END $$;

-- Backfill existing keys into the secure table
INSERT INTO public.software_license_keys (license_id, tenant_id, license_key)
SELECT id, tenant_id, license_key
FROM public.software_licenses
WHERE license_key IS NOT NULL
ON CONFLICT (license_id) DO UPDATE
SET license_key = EXCLUDED.license_key,
    tenant_id = EXCLUDED.tenant_id;

-- Scrub existing keys from the main table
UPDATE public.software_licenses
SET license_key = NULL
WHERE license_key IS NOT NULL;