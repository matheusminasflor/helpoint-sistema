-- ==================================================
-- Marketing Module Expansion - Tables and Policies
-- ==================================================

-- 1. Enum for supplier categories
CREATE TYPE public.mkt_supplier_category AS ENUM (
  'grafica', 'producao', 'midia', 'eventos', 'brindes', 'digital', 'audiovisual', 'outro'
);

-- 2. Enum for supplier status
CREATE TYPE public.mkt_supplier_status AS ENUM ('active', 'inactive', 'blocked');

-- 3. Enum for quotation status
CREATE TYPE public.mkt_quotation_status AS ENUM ('pending', 'approved', 'rejected', 'completed', 'cancelled');

-- 4. Enum for UGC approval status
CREATE TYPE public.mkt_ugc_status AS ENUM ('pending', 'approved', 'rejected');

-- 5. Enum for UGC media type
CREATE TYPE public.mkt_ugc_media_type AS ENUM ('image', 'video', 'story', 'reel', 'carousel');

-- 6. Enum for AI generation type
CREATE TYPE public.mkt_ai_generation_type AS ENUM ('image', 'caption', 'idea', 'reminder');

-- ==================================================
-- Table: mkt_suppliers (Fornecedores)
-- ==================================================
CREATE TABLE public.mkt_suppliers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  cnpj TEXT,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  category mkt_supplier_category NOT NULL DEFAULT 'outro',
  services TEXT[] DEFAULT '{}',
  rating NUMERIC(2,1) CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
  status mkt_supplier_status NOT NULL DEFAULT 'active',
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.mkt_suppliers ENABLE ROW LEVEL SECURITY;

-- RLS Policies for mkt_suppliers
CREATE POLICY "Users can view suppliers in their tenant"
  ON public.mkt_suppliers FOR SELECT
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Members can create suppliers"
  ON public.mkt_suppliers FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id() AND (has_role(auth.uid(), 'member') OR is_supervisor_or_higher(auth.uid())));

CREATE POLICY "Members can update suppliers"
  ON public.mkt_suppliers FOR UPDATE
  USING (tenant_id = get_user_tenant_id() AND (has_role(auth.uid(), 'member') OR is_supervisor_or_higher(auth.uid())))
  WITH CHECK (tenant_id = get_user_tenant_id() AND (has_role(auth.uid(), 'member') OR is_supervisor_or_higher(auth.uid())));

CREATE POLICY "Managers can delete suppliers"
  ON public.mkt_suppliers FOR DELETE
  USING (tenant_id = get_user_tenant_id() AND is_supervisor_or_higher(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_mkt_suppliers_updated_at
  BEFORE UPDATE ON public.mkt_suppliers
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ==================================================
-- Table: mkt_quotations (Cotações)
-- ==================================================
CREATE TABLE public.mkt_quotations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES public.mkt_suppliers(id) ON DELETE CASCADE,
  event_id UUID REFERENCES public.mkt_events(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  items JSONB DEFAULT '[]',
  total_value NUMERIC(12,2),
  status mkt_quotation_status NOT NULL DEFAULT 'pending',
  approved_by UUID REFERENCES public.profiles(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  purchase_order_ref TEXT,
  valid_until DATE,
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.mkt_quotations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for mkt_quotations
CREATE POLICY "Users can view quotations in their tenant"
  ON public.mkt_quotations FOR SELECT
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Members can create quotations"
  ON public.mkt_quotations FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id() AND (has_role(auth.uid(), 'member') OR is_supervisor_or_higher(auth.uid())));

CREATE POLICY "Members can update quotations"
  ON public.mkt_quotations FOR UPDATE
  USING (tenant_id = get_user_tenant_id() AND (has_role(auth.uid(), 'member') OR is_supervisor_or_higher(auth.uid())))
  WITH CHECK (tenant_id = get_user_tenant_id() AND (has_role(auth.uid(), 'member') OR is_supervisor_or_higher(auth.uid())));

CREATE POLICY "Managers can delete quotations"
  ON public.mkt_quotations FOR DELETE
  USING (tenant_id = get_user_tenant_id() AND is_supervisor_or_higher(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_mkt_quotations_updated_at
  BEFORE UPDATE ON public.mkt_quotations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ==================================================
-- Table: mkt_ugc_content (User Generated Content)
-- ==================================================
CREATE TABLE public.mkt_ugc_content (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  source_platform social_platform NOT NULL DEFAULT 'instagram',
  source_url TEXT,
  source_author TEXT,
  media_type mkt_ugc_media_type NOT NULL DEFAULT 'image',
  media_url TEXT,
  thumbnail_url TEXT,
  description TEXT,
  hashtags TEXT[] DEFAULT '{}',
  influencer_id UUID REFERENCES public.mkt_influencers(id) ON DELETE SET NULL,
  approval_status mkt_ugc_status NOT NULL DEFAULT 'pending',
  usage_rights TEXT,
  used_in_campaigns UUID[] DEFAULT '{}',
  engagement_original JSONB DEFAULT '{}',
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.mkt_ugc_content ENABLE ROW LEVEL SECURITY;

-- RLS Policies for mkt_ugc_content
CREATE POLICY "Users can view UGC in their tenant"
  ON public.mkt_ugc_content FOR SELECT
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Members can create UGC"
  ON public.mkt_ugc_content FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id() AND (has_role(auth.uid(), 'member') OR is_supervisor_or_higher(auth.uid())));

CREATE POLICY "Members can update UGC"
  ON public.mkt_ugc_content FOR UPDATE
  USING (tenant_id = get_user_tenant_id() AND (has_role(auth.uid(), 'member') OR is_supervisor_or_higher(auth.uid())))
  WITH CHECK (tenant_id = get_user_tenant_id() AND (has_role(auth.uid(), 'member') OR is_supervisor_or_higher(auth.uid())));

CREATE POLICY "Managers can delete UGC"
  ON public.mkt_ugc_content FOR DELETE
  USING (tenant_id = get_user_tenant_id() AND is_supervisor_or_higher(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_mkt_ugc_content_updated_at
  BEFORE UPDATE ON public.mkt_ugc_content
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ==================================================
-- Table: mkt_ai_generations (AI Generated Content Log)
-- ==================================================
CREATE TABLE public.mkt_ai_generations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  type mkt_ai_generation_type NOT NULL,
  prompt TEXT NOT NULL,
  result TEXT,
  model_used TEXT DEFAULT 'google/gemini-2.5-flash-image',
  post_id UUID REFERENCES public.mkt_social_posts(id) ON DELETE SET NULL,
  event_id UUID REFERENCES public.mkt_events(id) ON DELETE SET NULL,
  accepted BOOLEAN DEFAULT false,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.mkt_ai_generations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for mkt_ai_generations
CREATE POLICY "Users can view AI generations in their tenant"
  ON public.mkt_ai_generations FOR SELECT
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Members can create AI generations"
  ON public.mkt_ai_generations FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id() AND (has_role(auth.uid(), 'member') OR is_supervisor_or_higher(auth.uid())));

CREATE POLICY "Members can update AI generations"
  ON public.mkt_ai_generations FOR UPDATE
  USING (tenant_id = get_user_tenant_id() AND (has_role(auth.uid(), 'member') OR is_supervisor_or_higher(auth.uid())))
  WITH CHECK (tenant_id = get_user_tenant_id() AND (has_role(auth.uid(), 'member') OR is_supervisor_or_higher(auth.uid())));

-- ==================================================
-- Table: mkt_social_accounts (Connected Social Accounts)
-- ==================================================
CREATE TABLE public.mkt_social_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  platform social_platform NOT NULL,
  account_name TEXT NOT NULL,
  account_id TEXT,
  page_id TEXT,
  access_token TEXT,
  token_expires_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_sync_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.mkt_social_accounts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for mkt_social_accounts
CREATE POLICY "Managers can view social accounts"
  ON public.mkt_social_accounts FOR SELECT
  USING (tenant_id = get_user_tenant_id() AND is_supervisor_or_higher(auth.uid()));

CREATE POLICY "Managers can create social accounts"
  ON public.mkt_social_accounts FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id() AND is_supervisor_or_higher(auth.uid()));

CREATE POLICY "Managers can update social accounts"
  ON public.mkt_social_accounts FOR UPDATE
  USING (tenant_id = get_user_tenant_id() AND is_supervisor_or_higher(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id() AND is_supervisor_or_higher(auth.uid()));

CREATE POLICY "Admins can delete social accounts"
  ON public.mkt_social_accounts FOR DELETE
  USING (tenant_id = get_user_tenant_id() AND is_admin_or_higher(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_mkt_social_accounts_updated_at
  BEFORE UPDATE ON public.mkt_social_accounts
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ==================================================
-- Storage Bucket: mkt-media
-- ==================================================
INSERT INTO storage.buckets (id, name, public) 
VALUES ('mkt-media', 'mkt-media', true)
ON CONFLICT (id) DO NOTHING;

-- Storage Policies for mkt-media bucket
CREATE POLICY "Public can view mkt media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'mkt-media');

CREATE POLICY "Authenticated users can upload mkt media"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'mkt-media' AND auth.uid() IS NOT NULL);

CREATE POLICY "Users can update their uploaded mkt media"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'mkt-media' AND auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete their uploaded mkt media"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'mkt-media' AND auth.uid() IS NOT NULL);

-- ==================================================
-- Indexes for performance
-- ==================================================
CREATE INDEX idx_mkt_suppliers_tenant ON public.mkt_suppliers(tenant_id);
CREATE INDEX idx_mkt_suppliers_status ON public.mkt_suppliers(status);
CREATE INDEX idx_mkt_quotations_tenant ON public.mkt_quotations(tenant_id);
CREATE INDEX idx_mkt_quotations_supplier ON public.mkt_quotations(supplier_id);
CREATE INDEX idx_mkt_quotations_status ON public.mkt_quotations(status);
CREATE INDEX idx_mkt_ugc_tenant ON public.mkt_ugc_content(tenant_id);
CREATE INDEX idx_mkt_ugc_status ON public.mkt_ugc_content(approval_status);
CREATE INDEX idx_mkt_ai_generations_tenant ON public.mkt_ai_generations(tenant_id);
CREATE INDEX idx_mkt_social_accounts_tenant ON public.mkt_social_accounts(tenant_id);