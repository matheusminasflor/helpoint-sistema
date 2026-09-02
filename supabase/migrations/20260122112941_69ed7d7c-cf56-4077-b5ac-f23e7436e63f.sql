-- Facility maps (free canvas)
CREATE TABLE IF NOT EXISTS public.facility_maps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'draft',
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS facility_maps_tenant_id_idx ON public.facility_maps (tenant_id);

ALTER TABLE public.facility_maps ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='facility_maps' AND policyname='Users can view facility maps in their tenant'
  ) THEN
    CREATE POLICY "Users can view facility maps in their tenant"
    ON public.facility_maps
    FOR SELECT
    USING (tenant_id = public.get_user_tenant_id());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='facility_maps' AND policyname='Supervisors can create facility maps'
  ) THEN
    CREATE POLICY "Supervisors can create facility maps"
    ON public.facility_maps
    FOR INSERT
    WITH CHECK ((tenant_id = public.get_user_tenant_id()) AND public.is_supervisor_or_higher(auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='facility_maps' AND policyname='Supervisors can update facility maps'
  ) THEN
    CREATE POLICY "Supervisors can update facility maps"
    ON public.facility_maps
    FOR UPDATE
    USING ((tenant_id = public.get_user_tenant_id()) AND public.is_supervisor_or_higher(auth.uid()))
    WITH CHECK ((tenant_id = public.get_user_tenant_id()) AND public.is_supervisor_or_higher(auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='facility_maps' AND policyname='Directors can delete facility maps'
  ) THEN
    CREATE POLICY "Directors can delete facility maps"
    ON public.facility_maps
    FOR DELETE
    USING ((tenant_id = public.get_user_tenant_id()) AND public.is_diretor(auth.uid()));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_facility_maps_tenant_id') THEN
    CREATE TRIGGER trg_facility_maps_tenant_id
    BEFORE INSERT ON public.facility_maps
    FOR EACH ROW
    EXECUTE FUNCTION public.inject_tenant_id();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_facility_maps_updated_at') THEN
    CREATE TRIGGER trg_facility_maps_updated_at
    BEFORE UPDATE ON public.facility_maps
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_facility_maps_audit') THEN
    CREATE TRIGGER trg_facility_maps_audit
    AFTER INSERT OR UPDATE OR DELETE ON public.facility_maps
    FOR EACH ROW
    EXECUTE FUNCTION public.audit_trigger_fn();
  END IF;
END $$;


-- Network diagrams (AI-suggested + manual)
CREATE TABLE IF NOT EXISTS public.network_diagrams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'draft',
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS network_diagrams_tenant_id_idx ON public.network_diagrams (tenant_id);

ALTER TABLE public.network_diagrams ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='network_diagrams' AND policyname='Users can view network diagrams in their tenant'
  ) THEN
    CREATE POLICY "Users can view network diagrams in their tenant"
    ON public.network_diagrams
    FOR SELECT
    USING (tenant_id = public.get_user_tenant_id());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='network_diagrams' AND policyname='Supervisors can create network diagrams'
  ) THEN
    CREATE POLICY "Supervisors can create network diagrams"
    ON public.network_diagrams
    FOR INSERT
    WITH CHECK ((tenant_id = public.get_user_tenant_id()) AND public.is_supervisor_or_higher(auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='network_diagrams' AND policyname='Supervisors can update network diagrams'
  ) THEN
    CREATE POLICY "Supervisors can update network diagrams"
    ON public.network_diagrams
    FOR UPDATE
    USING ((tenant_id = public.get_user_tenant_id()) AND public.is_supervisor_or_higher(auth.uid()))
    WITH CHECK ((tenant_id = public.get_user_tenant_id()) AND public.is_supervisor_or_higher(auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='network_diagrams' AND policyname='Directors can delete network diagrams'
  ) THEN
    CREATE POLICY "Directors can delete network diagrams"
    ON public.network_diagrams
    FOR DELETE
    USING ((tenant_id = public.get_user_tenant_id()) AND public.is_diretor(auth.uid()));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_network_diagrams_tenant_id') THEN
    CREATE TRIGGER trg_network_diagrams_tenant_id
    BEFORE INSERT ON public.network_diagrams
    FOR EACH ROW
    EXECUTE FUNCTION public.inject_tenant_id();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_network_diagrams_updated_at') THEN
    CREATE TRIGGER trg_network_diagrams_updated_at
    BEFORE UPDATE ON public.network_diagrams
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_network_diagrams_audit') THEN
    CREATE TRIGGER trg_network_diagrams_audit
    AFTER INSERT OR UPDATE OR DELETE ON public.network_diagrams
    FOR EACH ROW
    EXECUTE FUNCTION public.audit_trigger_fn();
  END IF;
END $$;
