-- =====================================================
-- HELPOINT - Multi-Tenant Architecture with Full Audit
-- =====================================================

-- 1. Create Role Enum for Personas
CREATE TYPE public.app_role AS ENUM ('colaborador', 'tecnico', 'supervisor', 'diretor');

-- 2. Create Tenants Table (Empresas)
CREATE TABLE public.tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    plan TEXT NOT NULL DEFAULT 'starter',
    settings JSONB DEFAULT '{}',
    logo_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Create Profiles Table (Usuários)
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    job_title TEXT,
    department TEXT,
    phone TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Create User Roles Table (Separate for Security)
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role app_role NOT NULL DEFAULT 'colaborador',
    granted_by UUID REFERENCES public.profiles(id),
    granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, role)
);

-- 5. Create Audit Log Table (Auditoria Total)
CREATE TABLE public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id),
    action TEXT NOT NULL,
    table_name TEXT NOT NULL,
    record_id UUID,
    old_data JSONB,
    new_data JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Create Tasks Table (For Daily Curation / Focus Mode)
CREATE TABLE public.tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    priority INTEGER DEFAULT 3 CHECK (priority >= 1 AND priority <= 5),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
    due_date TIMESTAMPTZ,
    source_type TEXT,
    source_id UUID,
    is_ai_suggested BOOLEAN DEFAULT false,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================
-- SECURITY DEFINER FUNCTIONS (Avoid RLS Recursion)
-- =====================================================

-- Get current user's tenant_id
CREATE OR REPLACE FUNCTION public.get_user_tenant_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
$$;

-- Check if user has a specific role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = _user_id AND role = _role
    )
$$;

-- Check if user is supervisor or higher
CREATE OR REPLACE FUNCTION public.is_supervisor_or_higher(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = _user_id AND role IN ('supervisor', 'diretor')
    )
$$;

-- Check if user is diretor
CREATE OR REPLACE FUNCTION public.is_diretor(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = _user_id AND role = 'diretor'
    )
$$;

-- Get user's highest role
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT role FROM public.user_roles
    WHERE user_id = _user_id
    ORDER BY CASE role
        WHEN 'diretor' THEN 1
        WHEN 'supervisor' THEN 2
        WHEN 'tecnico' THEN 3
        WHEN 'colaborador' THEN 4
    END
    LIMIT 1
$$;

-- =====================================================
-- ENABLE RLS ON ALL TABLES
-- =====================================================

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLS POLICIES - Tenants
-- =====================================================

CREATE POLICY "Users can view their own tenant"
ON public.tenants FOR SELECT
TO authenticated
USING (id = public.get_user_tenant_id());

-- =====================================================
-- RLS POLICIES - Profiles
-- =====================================================

CREATE POLICY "Users can view profiles in their tenant"
ON public.profiles FOR SELECT
TO authenticated
USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid() AND tenant_id = public.get_user_tenant_id());

CREATE POLICY "Allow insert during signup"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (id = auth.uid());

-- =====================================================
-- RLS POLICIES - User Roles
-- =====================================================

CREATE POLICY "Users can view roles in their tenant"
ON public.user_roles FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = user_roles.user_id
        AND profiles.tenant_id = public.get_user_tenant_id()
    )
);

CREATE POLICY "Directors can manage roles"
ON public.user_roles FOR ALL
TO authenticated
USING (public.is_diretor(auth.uid()))
WITH CHECK (public.is_diretor(auth.uid()));

-- =====================================================
-- RLS POLICIES - Audit Logs
-- =====================================================

CREATE POLICY "Users can view audit logs of their tenant"
ON public.audit_logs FOR SELECT
TO authenticated
USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "System can insert audit logs"
ON public.audit_logs FOR INSERT
TO authenticated
WITH CHECK (tenant_id = public.get_user_tenant_id());

-- =====================================================
-- RLS POLICIES - Tasks
-- =====================================================

CREATE POLICY "Users can view their own tasks"
ON public.tasks FOR SELECT
TO authenticated
USING (
    tenant_id = public.get_user_tenant_id() AND
    (user_id = auth.uid() OR public.is_supervisor_or_higher(auth.uid()))
);

CREATE POLICY "Users can create their own tasks"
ON public.tasks FOR INSERT
TO authenticated
WITH CHECK (
    tenant_id = public.get_user_tenant_id() AND
    user_id = auth.uid()
);

CREATE POLICY "Users can update their own tasks"
ON public.tasks FOR UPDATE
TO authenticated
USING (tenant_id = public.get_user_tenant_id() AND user_id = auth.uid())
WITH CHECK (tenant_id = public.get_user_tenant_id() AND user_id = auth.uid());

CREATE POLICY "Users can delete their own tasks"
ON public.tasks FOR DELETE
TO authenticated
USING (tenant_id = public.get_user_tenant_id() AND user_id = auth.uid());

-- =====================================================
-- TRIGGERS - Updated_at Automation
-- =====================================================

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_tenants_updated_at
    BEFORE UPDATE ON public.tenants
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_tasks_updated_at
    BEFORE UPDATE ON public.tasks
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- =====================================================
-- AUDIT TRIGGER - Log All Changes
-- =====================================================

CREATE OR REPLACE FUNCTION public.audit_trigger_fn()
RETURNS TRIGGER AS $$
DECLARE
    _tenant_id UUID;
    _old_data JSONB;
    _new_data JSONB;
BEGIN
    -- Get tenant_id from the record
    IF TG_OP = 'DELETE' THEN
        _tenant_id := OLD.tenant_id;
        _old_data := to_jsonb(OLD);
        _new_data := NULL;
    ELSIF TG_OP = 'INSERT' THEN
        _tenant_id := NEW.tenant_id;
        _old_data := NULL;
        _new_data := to_jsonb(NEW);
    ELSE
        _tenant_id := NEW.tenant_id;
        _old_data := to_jsonb(OLD);
        _new_data := to_jsonb(NEW);
    END IF;

    -- Only log if tenant_id exists
    IF _tenant_id IS NOT NULL THEN
        INSERT INTO public.audit_logs (
            tenant_id,
            user_id,
            action,
            table_name,
            record_id,
            old_data,
            new_data
        ) VALUES (
            _tenant_id,
            auth.uid(),
            TG_OP,
            TG_TABLE_NAME,
            COALESCE(NEW.id, OLD.id),
            _old_data,
            _new_data
        );
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply audit trigger to tasks
CREATE TRIGGER audit_tasks
    AFTER INSERT OR UPDATE OR DELETE ON public.tasks
    FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

-- =====================================================
-- INDEXES for Performance
-- =====================================================

CREATE INDEX idx_profiles_tenant_id ON public.profiles(tenant_id);
CREATE INDEX idx_profiles_email ON public.profiles(email);
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX idx_tasks_tenant_id ON public.tasks(tenant_id);
CREATE INDEX idx_tasks_user_id ON public.tasks(user_id);
CREATE INDEX idx_tasks_status ON public.tasks(status);
CREATE INDEX idx_tasks_due_date ON public.tasks(due_date);
CREATE INDEX idx_audit_logs_tenant_id ON public.audit_logs(tenant_id);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs(created_at DESC);