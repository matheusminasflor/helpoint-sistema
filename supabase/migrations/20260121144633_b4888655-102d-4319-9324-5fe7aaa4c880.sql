-- =====================================================
-- 1. AUDIT TRIGGERS FOR ALL TABLES
-- =====================================================

-- Create audit trigger on profiles table
CREATE TRIGGER audit_profiles_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

-- Create audit trigger on tasks table
CREATE TRIGGER audit_tasks_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.tasks
    FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

-- =====================================================
-- 2. AUTOMATIC TENANT_ID INJECTION TRIGGERS
-- =====================================================

-- Function to auto-inject tenant_id on INSERT for tables that reference user
CREATE OR REPLACE FUNCTION public.inject_tenant_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Only inject if tenant_id is NULL or if we need to verify it
    IF NEW.tenant_id IS NULL THEN
        NEW.tenant_id := get_user_tenant_id();
    END IF;
    
    -- Security check: ensure tenant_id matches user's tenant
    IF NEW.tenant_id != get_user_tenant_id() THEN
        RAISE EXCEPTION 'tenant_id mismatch: cannot insert data for another tenant';
    END IF;
    
    RETURN NEW;
END;
$$;

-- Apply tenant_id injection trigger to tasks
CREATE TRIGGER inject_tenant_id_tasks
    BEFORE INSERT ON public.tasks
    FOR EACH ROW EXECUTE FUNCTION public.inject_tenant_id();

-- =====================================================
-- 3. ASSET CATEGORIES ENUM
-- =====================================================
CREATE TYPE public.asset_status AS ENUM ('active', 'inactive', 'maintenance', 'decommissioned');
CREATE TYPE public.asset_category AS ENUM ('hardware', 'software', 'network', 'peripheral', 'mobile', 'other');
CREATE TYPE public.ticket_status AS ENUM ('open', 'in_progress', 'waiting_user', 'waiting_parts', 'resolved', 'closed', 'cancelled');
CREATE TYPE public.ticket_priority AS ENUM ('critical', 'high', 'medium', 'low');

-- =====================================================
-- 4. ASSETS/INVENTORY TABLE (Mundo 3)
-- =====================================================
CREATE TABLE public.assets (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    
    -- Asset identification
    asset_tag TEXT NOT NULL,
    serial_number TEXT,
    name TEXT NOT NULL,
    description TEXT,
    
    -- Classification
    category asset_category NOT NULL DEFAULT 'hardware',
    subcategory TEXT,
    manufacturer TEXT,
    model TEXT,
    
    -- Assignment
    assigned_to UUID REFERENCES public.profiles(id),
    department TEXT,
    location TEXT,
    
    -- Technical specs (flexible JSONB for different asset types)
    specs JSONB DEFAULT '{}',
    
    -- Lifecycle
    status asset_status NOT NULL DEFAULT 'active',
    purchase_date DATE,
    warranty_expiry DATE,
    purchase_value DECIMAL(12,2),
    
    -- Metadata
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES auth.users(id),
    
    -- Ensure unique asset_tag per tenant
    UNIQUE(tenant_id, asset_tag)
);

-- Enable RLS
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

-- RLS Policies for assets
CREATE POLICY "Users can view assets in their tenant"
ON public.assets FOR SELECT
USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Supervisors can create assets"
ON public.assets FOR INSERT
WITH CHECK (tenant_id = get_user_tenant_id() AND is_supervisor_or_higher(auth.uid()));

CREATE POLICY "Supervisors can update assets"
ON public.assets FOR UPDATE
USING (tenant_id = get_user_tenant_id() AND is_supervisor_or_higher(auth.uid()))
WITH CHECK (tenant_id = get_user_tenant_id() AND is_supervisor_or_higher(auth.uid()));

CREATE POLICY "Directors can delete assets"
ON public.assets FOR DELETE
USING (tenant_id = get_user_tenant_id() AND is_diretor(auth.uid()));

-- Triggers for assets
CREATE TRIGGER handle_assets_updated_at
    BEFORE UPDATE ON public.assets
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER inject_tenant_id_assets
    BEFORE INSERT ON public.assets
    FOR EACH ROW EXECUTE FUNCTION public.inject_tenant_id();

CREATE TRIGGER audit_assets_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.assets
    FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

-- =====================================================
-- 5. HELPDESK TICKETS TABLE (Mundo 1)
-- =====================================================
CREATE TABLE public.tickets (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    
    -- Ticket identification
    ticket_number SERIAL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    
    -- Classification
    category TEXT,
    subcategory TEXT,
    priority ticket_priority NOT NULL DEFAULT 'medium',
    
    -- Status
    status ticket_status NOT NULL DEFAULT 'open',
    
    -- Requester & Assignment
    requester_id UUID NOT NULL REFERENCES public.profiles(id),
    assigned_to UUID REFERENCES public.profiles(id),
    
    -- Related asset (optional)
    asset_id UUID REFERENCES public.assets(id),
    
    -- SLA tracking
    sla_due_at TIMESTAMPTZ,
    first_response_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    
    -- Resolution
    resolution_notes TEXT,
    satisfaction_rating INTEGER CHECK (satisfaction_rating >= 1 AND satisfaction_rating <= 5),
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

-- RLS Policies for tickets
-- Requesters can view their own tickets
CREATE POLICY "Users can view their own tickets"
ON public.tickets FOR SELECT
USING (
    tenant_id = get_user_tenant_id() 
    AND (
        requester_id = auth.uid() 
        OR assigned_to = auth.uid()
        OR has_role(auth.uid(), 'tecnico')
        OR is_supervisor_or_higher(auth.uid())
    )
);

-- Users can create tickets
CREATE POLICY "Users can create tickets"
ON public.tickets FOR INSERT
WITH CHECK (
    tenant_id = get_user_tenant_id() 
    AND requester_id = auth.uid()
);

-- Technicians can update tickets
CREATE POLICY "Technicians can update tickets"
ON public.tickets FOR UPDATE
USING (
    tenant_id = get_user_tenant_id()
    AND (
        requester_id = auth.uid()
        OR assigned_to = auth.uid()
        OR has_role(auth.uid(), 'tecnico')
        OR is_supervisor_or_higher(auth.uid())
    )
)
WITH CHECK (tenant_id = get_user_tenant_id());

-- Directors can delete tickets
CREATE POLICY "Directors can delete tickets"
ON public.tickets FOR DELETE
USING (tenant_id = get_user_tenant_id() AND is_diretor(auth.uid()));

-- Triggers for tickets
CREATE TRIGGER handle_tickets_updated_at
    BEFORE UPDATE ON public.tickets
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER inject_tenant_id_tickets
    BEFORE INSERT ON public.tickets
    FOR EACH ROW EXECUTE FUNCTION public.inject_tenant_id();

CREATE TRIGGER audit_tickets_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.tickets
    FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

-- =====================================================
-- 6. TICKET COMMENTS/INTERACTIONS TABLE
-- =====================================================
CREATE TABLE public.ticket_comments (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES public.profiles(id),
    
    content TEXT NOT NULL,
    is_internal BOOLEAN DEFAULT false, -- Internal notes not visible to requester
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ticket_comments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for ticket_comments
CREATE POLICY "Users can view comments on accessible tickets"
ON public.ticket_comments FOR SELECT
USING (
    tenant_id = get_user_tenant_id()
    AND (
        -- Can see public comments on own tickets
        (NOT is_internal AND EXISTS (
            SELECT 1 FROM public.tickets t 
            WHERE t.id = ticket_id AND t.requester_id = auth.uid()
        ))
        -- Technicians and supervisors can see all comments
        OR has_role(auth.uid(), 'tecnico')
        OR is_supervisor_or_higher(auth.uid())
    )
);

CREATE POLICY "Users can create comments"
ON public.ticket_comments FOR INSERT
WITH CHECK (
    tenant_id = get_user_tenant_id()
    AND author_id = auth.uid()
);

-- Triggers for ticket_comments
CREATE TRIGGER inject_tenant_id_ticket_comments
    BEFORE INSERT ON public.ticket_comments
    FOR EACH ROW EXECUTE FUNCTION public.inject_tenant_id();

CREATE TRIGGER audit_ticket_comments_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.ticket_comments
    FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

-- =====================================================
-- 7. SLA CONFIGURATION TABLE
-- =====================================================
CREATE TABLE public.sla_policies (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    
    name TEXT NOT NULL,
    priority ticket_priority NOT NULL,
    
    -- Response times in minutes
    first_response_time INTEGER NOT NULL, -- e.g., 30 min for critical
    resolution_time INTEGER NOT NULL, -- e.g., 240 min for critical
    
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    UNIQUE(tenant_id, priority)
);

-- Enable RLS
ALTER TABLE public.sla_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view SLA policies"
ON public.sla_policies FOR SELECT
USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Directors can manage SLA policies"
ON public.sla_policies FOR ALL
USING (tenant_id = get_user_tenant_id() AND is_diretor(auth.uid()))
WITH CHECK (tenant_id = get_user_tenant_id() AND is_diretor(auth.uid()));

CREATE TRIGGER inject_tenant_id_sla_policies
    BEFORE INSERT ON public.sla_policies
    FOR EACH ROW EXECUTE FUNCTION public.inject_tenant_id();

CREATE TRIGGER handle_sla_policies_updated_at
    BEFORE UPDATE ON public.sla_policies
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();