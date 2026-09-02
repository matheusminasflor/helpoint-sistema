
-- Enum for deliverable frequency
CREATE TYPE public.deliverable_frequency AS ENUM ('weekly', 'monthly');

-- 1. Artist Contracts
CREATE TABLE public.mkt_artist_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  influencer_id uuid NOT NULL REFERENCES public.mkt_influencers(id) ON DELETE CASCADE,
  base_bonus numeric NOT NULL DEFAULT 0,
  contract_start date NOT NULL,
  contract_end date,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mkt_artist_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view artist contracts"
  ON public.mkt_artist_contracts FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Members can insert artist contracts"
  ON public.mkt_artist_contracts FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Members can update artist contracts"
  ON public.mkt_artist_contracts FOR UPDATE
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Supervisors can delete artist contracts"
  ON public.mkt_artist_contracts FOR DELETE
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND public.is_supervisor_or_higher(auth.uid()));

CREATE TRIGGER inject_tenant_id_mkt_artist_contracts
  BEFORE INSERT ON public.mkt_artist_contracts
  FOR EACH ROW EXECUTE FUNCTION public.inject_tenant_id();

CREATE TRIGGER update_mkt_artist_contracts_updated_at
  BEFORE UPDATE ON public.mkt_artist_contracts
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 2. Artist Deliverables
CREATE TABLE public.mkt_artist_deliverables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  contract_id uuid NOT NULL REFERENCES public.mkt_artist_contracts(id) ON DELETE CASCADE,
  title text NOT NULL,
  deliverable_type text NOT NULL,
  target_quantity integer NOT NULL DEFAULT 1,
  frequency public.deliverable_frequency NOT NULL DEFAULT 'monthly',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mkt_artist_deliverables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view deliverables"
  ON public.mkt_artist_deliverables FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Members can insert deliverables"
  ON public.mkt_artist_deliverables FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Members can update deliverables"
  ON public.mkt_artist_deliverables FOR UPDATE
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Supervisors can delete deliverables"
  ON public.mkt_artist_deliverables FOR DELETE
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND public.is_supervisor_or_higher(auth.uid()));

CREATE TRIGGER inject_tenant_id_mkt_artist_deliverables
  BEFORE INSERT ON public.mkt_artist_deliverables
  FOR EACH ROW EXECUTE FUNCTION public.inject_tenant_id();

CREATE TRIGGER update_mkt_artist_deliverables_updated_at
  BEFORE UPDATE ON public.mkt_artist_deliverables
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 3. Artist Deliveries (log)
CREATE TABLE public.mkt_artist_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  deliverable_id uuid NOT NULL REFERENCES public.mkt_artist_deliverables(id) ON DELETE CASCADE,
  delivered_at date NOT NULL DEFAULT CURRENT_DATE,
  proof_url text,
  notes text,
  registered_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mkt_artist_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view deliveries"
  ON public.mkt_artist_deliveries FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Members can insert deliveries"
  ON public.mkt_artist_deliveries FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Members can update deliveries"
  ON public.mkt_artist_deliveries FOR UPDATE
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Supervisors can delete deliveries"
  ON public.mkt_artist_deliveries FOR DELETE
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND public.is_supervisor_or_higher(auth.uid()));

CREATE TRIGGER inject_tenant_id_mkt_artist_deliveries
  BEFORE INSERT ON public.mkt_artist_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.inject_tenant_id();

-- 4. Payout Rules
CREATE TABLE public.mkt_payout_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  contract_id uuid NOT NULL REFERENCES public.mkt_artist_contracts(id) ON DELETE CASCADE,
  min_percentage integer NOT NULL DEFAULT 70,
  payout_percentage integer NOT NULL DEFAULT 70,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mkt_payout_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view payout rules"
  ON public.mkt_payout_rules FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Members can insert payout rules"
  ON public.mkt_payout_rules FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Members can update payout rules"
  ON public.mkt_payout_rules FOR UPDATE
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Supervisors can delete payout rules"
  ON public.mkt_payout_rules FOR DELETE
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND public.is_supervisor_or_higher(auth.uid()));

CREATE TRIGGER inject_tenant_id_mkt_payout_rules
  BEFORE INSERT ON public.mkt_payout_rules
  FOR EACH ROW EXECUTE FUNCTION public.inject_tenant_id();
