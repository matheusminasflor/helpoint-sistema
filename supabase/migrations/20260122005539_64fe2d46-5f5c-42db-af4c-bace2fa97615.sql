-- Create ENUMs for IT Management modules
CREATE TYPE license_type AS ENUM ('perpetual', 'subscription', 'volume', 'oem');
CREATE TYPE contract_status AS ENUM ('active', 'expiring', 'expired', 'cancelled');
CREATE TYPE payment_frequency AS ENUM ('monthly', 'quarterly', 'yearly', 'one_time');
CREATE TYPE maintenance_type AS ENUM ('preventive', 'corrective', 'upgrade', 'cleaning');
CREATE TYPE maintenance_status AS ENUM ('scheduled', 'in_progress', 'completed', 'cancelled');

-- Table: software_licenses
CREATE TABLE public.software_licenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    name TEXT NOT NULL,
    vendor TEXT,
    license_type license_type NOT NULL DEFAULT 'subscription',
    license_key TEXT,
    total_quantity INTEGER NOT NULL DEFAULT 1,
    expiry_date DATE,
    purchase_date DATE,
    purchase_value NUMERIC,
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Table: license_assignments
CREATE TABLE public.license_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    license_id UUID NOT NULL REFERENCES public.software_licenses(id) ON DELETE CASCADE,
    assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    asset_id UUID REFERENCES public.assets(id) ON DELETE SET NULL,
    assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    assigned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    notes TEXT,
    CONSTRAINT assignment_target_check CHECK (assigned_to IS NOT NULL OR asset_id IS NOT NULL)
);

-- Table: software_contracts
CREATE TABLE public.software_contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    name TEXT NOT NULL,
    vendor TEXT NOT NULL,
    contract_number TEXT,
    description TEXT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    renewal_alert_days INTEGER NOT NULL DEFAULT 30,
    auto_renew BOOLEAN NOT NULL DEFAULT false,
    value NUMERIC,
    payment_frequency payment_frequency DEFAULT 'yearly',
    status contract_status NOT NULL DEFAULT 'active',
    document_url TEXT,
    contact_name TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Table: asset_maintenances
CREATE TABLE public.asset_maintenances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
    maintenance_type maintenance_type NOT NULL DEFAULT 'corrective',
    title TEXT NOT NULL,
    description TEXT,
    scheduled_date DATE,
    completed_date DATE,
    cost NUMERIC,
    status maintenance_status NOT NULL DEFAULT 'scheduled',
    technician_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    external_provider TEXT,
    ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.software_licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.license_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.software_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_maintenances ENABLE ROW LEVEL SECURITY;

-- RLS Policies for software_licenses
CREATE POLICY "Users can view licenses in their tenant"
ON public.software_licenses FOR SELECT
USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Supervisors can create licenses"
ON public.software_licenses FOR INSERT
WITH CHECK (tenant_id = get_user_tenant_id() AND is_supervisor_or_higher(auth.uid()));

CREATE POLICY "Supervisors can update licenses"
ON public.software_licenses FOR UPDATE
USING (tenant_id = get_user_tenant_id() AND is_supervisor_or_higher(auth.uid()))
WITH CHECK (tenant_id = get_user_tenant_id() AND is_supervisor_or_higher(auth.uid()));

CREATE POLICY "Directors can delete licenses"
ON public.software_licenses FOR DELETE
USING (tenant_id = get_user_tenant_id() AND is_diretor(auth.uid()));

-- RLS Policies for license_assignments
CREATE POLICY "Users can view license assignments in their tenant"
ON public.license_assignments FOR SELECT
USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Supervisors can create license assignments"
ON public.license_assignments FOR INSERT
WITH CHECK (tenant_id = get_user_tenant_id() AND is_supervisor_or_higher(auth.uid()));

CREATE POLICY "Supervisors can update license assignments"
ON public.license_assignments FOR UPDATE
USING (tenant_id = get_user_tenant_id() AND is_supervisor_or_higher(auth.uid()))
WITH CHECK (tenant_id = get_user_tenant_id() AND is_supervisor_or_higher(auth.uid()));

CREATE POLICY "Supervisors can delete license assignments"
ON public.license_assignments FOR DELETE
USING (tenant_id = get_user_tenant_id() AND is_supervisor_or_higher(auth.uid()));

-- RLS Policies for software_contracts
CREATE POLICY "Users can view contracts in their tenant"
ON public.software_contracts FOR SELECT
USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Supervisors can create contracts"
ON public.software_contracts FOR INSERT
WITH CHECK (tenant_id = get_user_tenant_id() AND is_supervisor_or_higher(auth.uid()));

CREATE POLICY "Supervisors can update contracts"
ON public.software_contracts FOR UPDATE
USING (tenant_id = get_user_tenant_id() AND is_supervisor_or_higher(auth.uid()))
WITH CHECK (tenant_id = get_user_tenant_id() AND is_supervisor_or_higher(auth.uid()));

CREATE POLICY "Directors can delete contracts"
ON public.software_contracts FOR DELETE
USING (tenant_id = get_user_tenant_id() AND is_diretor(auth.uid()));

-- RLS Policies for asset_maintenances
CREATE POLICY "Users can view maintenances in their tenant"
ON public.asset_maintenances FOR SELECT
USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Technicians can create maintenances"
ON public.asset_maintenances FOR INSERT
WITH CHECK (tenant_id = get_user_tenant_id() AND (has_role(auth.uid(), 'tecnico') OR is_supervisor_or_higher(auth.uid())));

CREATE POLICY "Technicians can update maintenances"
ON public.asset_maintenances FOR UPDATE
USING (tenant_id = get_user_tenant_id() AND (has_role(auth.uid(), 'tecnico') OR is_supervisor_or_higher(auth.uid())))
WITH CHECK (tenant_id = get_user_tenant_id() AND (has_role(auth.uid(), 'tecnico') OR is_supervisor_or_higher(auth.uid())));

CREATE POLICY "Directors can delete maintenances"
ON public.asset_maintenances FOR DELETE
USING (tenant_id = get_user_tenant_id() AND is_diretor(auth.uid()));

-- Add tenant injection triggers
CREATE TRIGGER inject_tenant_software_licenses
BEFORE INSERT ON public.software_licenses
FOR EACH ROW EXECUTE FUNCTION inject_tenant_id();

CREATE TRIGGER inject_tenant_license_assignments
BEFORE INSERT ON public.license_assignments
FOR EACH ROW EXECUTE FUNCTION inject_tenant_id();

CREATE TRIGGER inject_tenant_software_contracts
BEFORE INSERT ON public.software_contracts
FOR EACH ROW EXECUTE FUNCTION inject_tenant_id();

CREATE TRIGGER inject_tenant_asset_maintenances
BEFORE INSERT ON public.asset_maintenances
FOR EACH ROW EXECUTE FUNCTION inject_tenant_id();

-- Add updated_at triggers
CREATE TRIGGER update_software_licenses_updated_at
BEFORE UPDATE ON public.software_licenses
FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER update_software_contracts_updated_at
BEFORE UPDATE ON public.software_contracts
FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER update_asset_maintenances_updated_at
BEFORE UPDATE ON public.asset_maintenances
FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- Add audit triggers
CREATE TRIGGER audit_software_licenses
AFTER INSERT OR UPDATE OR DELETE ON public.software_licenses
FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER audit_license_assignments
AFTER INSERT OR UPDATE OR DELETE ON public.license_assignments
FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER audit_software_contracts
AFTER INSERT OR UPDATE OR DELETE ON public.software_contracts
FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER audit_asset_maintenances
AFTER INSERT OR UPDATE OR DELETE ON public.asset_maintenances
FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();