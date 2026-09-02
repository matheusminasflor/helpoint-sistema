-- Enums para o módulo MKT
CREATE TYPE public.influencer_category AS ENUM ('artista', 'influencer', 'criador', 'modelo', 'outro');
CREATE TYPE public.influencer_status AS ENUM ('active', 'inactive', 'blocked');
CREATE TYPE public.mkt_event_type AS ENUM ('show', 'feira', 'live', 'lancamento', 'workshop', 'reuniao', 'outro');
CREATE TYPE public.mkt_event_status AS ENUM ('planning', 'confirmed', 'in_progress', 'completed', 'cancelled');
CREATE TYPE public.social_platform AS ENUM ('instagram', 'tiktok', 'youtube', 'linkedin', 'twitter', 'facebook');
CREATE TYPE public.social_post_type AS ENUM ('feed', 'story', 'reel', 'live', 'short', 'post');
CREATE TYPE public.social_post_status AS ENUM ('draft', 'scheduled', 'published', 'failed');
CREATE TYPE public.event_participant_role AS ENUM ('palestrante', 'artista', 'convidado', 'patrocinador', 'staff', 'outro');
CREATE TYPE public.event_participant_status AS ENUM ('invited', 'confirmed', 'declined', 'maybe');

-- Tabela: mkt_influencers (Artistas e Influenciadores)
CREATE TABLE public.mkt_influencers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  stage_name TEXT,
  email TEXT,
  phone TEXT,
  category public.influencer_category NOT NULL DEFAULT 'influencer',
  social_instagram TEXT,
  social_tiktok TEXT,
  social_youtube TEXT,
  social_twitter TEXT,
  social_linkedin TEXT,
  followers_count INTEGER DEFAULT 0,
  engagement_rate NUMERIC(5,2),
  price_range TEXT,
  notes TEXT,
  status public.influencer_status NOT NULL DEFAULT 'active',
  tags TEXT[] DEFAULT '{}',
  avatar_url TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela: mkt_events (Eventos)
CREATE TABLE public.mkt_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  event_type public.mkt_event_type NOT NULL DEFAULT 'outro',
  start_date TIMESTAMP WITH TIME ZONE NOT NULL,
  end_date TIMESTAMP WITH TIME ZONE,
  location TEXT,
  is_online BOOLEAN NOT NULL DEFAULT false,
  budget NUMERIC(12,2),
  actual_cost NUMERIC(12,2),
  status public.mkt_event_status NOT NULL DEFAULT 'planning',
  responsible_id UUID REFERENCES public.profiles(id),
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela: mkt_event_participants (Participantes de Eventos)
CREATE TABLE public.mkt_event_participants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.mkt_events(id) ON DELETE CASCADE,
  influencer_id UUID REFERENCES public.mkt_influencers(id) ON DELETE SET NULL,
  participant_name TEXT,
  role public.event_participant_role NOT NULL DEFAULT 'convidado',
  fee NUMERIC(12,2),
  status public.event_participant_status NOT NULL DEFAULT 'invited',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela: mkt_social_posts (Cronograma de Posts)
CREATE TABLE public.mkt_social_posts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT,
  platform public.social_platform NOT NULL DEFAULT 'instagram',
  post_type public.social_post_type NOT NULL DEFAULT 'feed',
  scheduled_at TIMESTAMP WITH TIME ZONE,
  published_at TIMESTAMP WITH TIME ZONE,
  status public.social_post_status NOT NULL DEFAULT 'draft',
  media_urls TEXT[] DEFAULT '{}',
  hashtags TEXT[] DEFAULT '{}',
  event_id UUID REFERENCES public.mkt_events(id) ON DELETE SET NULL,
  influencer_id UUID REFERENCES public.mkt_influencers(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_mkt_influencers_tenant ON public.mkt_influencers(tenant_id);
CREATE INDEX idx_mkt_influencers_status ON public.mkt_influencers(tenant_id, status);
CREATE INDEX idx_mkt_events_tenant ON public.mkt_events(tenant_id);
CREATE INDEX idx_mkt_events_dates ON public.mkt_events(tenant_id, start_date, end_date);
CREATE INDEX idx_mkt_events_status ON public.mkt_events(tenant_id, status);
CREATE INDEX idx_mkt_event_participants_event ON public.mkt_event_participants(event_id);
CREATE INDEX idx_mkt_social_posts_tenant ON public.mkt_social_posts(tenant_id);
CREATE INDEX idx_mkt_social_posts_scheduled ON public.mkt_social_posts(tenant_id, scheduled_at);
CREATE INDEX idx_mkt_social_posts_platform ON public.mkt_social_posts(tenant_id, platform);

-- Triggers para updated_at
CREATE TRIGGER update_mkt_influencers_updated_at
  BEFORE UPDATE ON public.mkt_influencers
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_mkt_events_updated_at
  BEFORE UPDATE ON public.mkt_events
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_mkt_event_participants_updated_at
  BEFORE UPDATE ON public.mkt_event_participants
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_mkt_social_posts_updated_at
  BEFORE UPDATE ON public.mkt_social_posts
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Triggers para inject_tenant_id
CREATE TRIGGER inject_tenant_mkt_influencers
  BEFORE INSERT ON public.mkt_influencers
  FOR EACH ROW EXECUTE FUNCTION public.inject_tenant_id();

CREATE TRIGGER inject_tenant_mkt_events
  BEFORE INSERT ON public.mkt_events
  FOR EACH ROW EXECUTE FUNCTION public.inject_tenant_id();

CREATE TRIGGER inject_tenant_mkt_event_participants
  BEFORE INSERT ON public.mkt_event_participants
  FOR EACH ROW EXECUTE FUNCTION public.inject_tenant_id();

CREATE TRIGGER inject_tenant_mkt_social_posts
  BEFORE INSERT ON public.mkt_social_posts
  FOR EACH ROW EXECUTE FUNCTION public.inject_tenant_id();

-- Habilitar RLS em todas as tabelas
ALTER TABLE public.mkt_influencers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mkt_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mkt_event_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mkt_social_posts ENABLE ROW LEVEL SECURITY;

-- RLS Policies para mkt_influencers
CREATE POLICY "Users can view influencers in their tenant"
  ON public.mkt_influencers FOR SELECT
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Members can create influencers"
  ON public.mkt_influencers FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id() AND (has_role(auth.uid(), 'member') OR is_supervisor_or_higher(auth.uid())));

CREATE POLICY "Members can update influencers"
  ON public.mkt_influencers FOR UPDATE
  USING (tenant_id = get_user_tenant_id() AND (has_role(auth.uid(), 'member') OR is_supervisor_or_higher(auth.uid())))
  WITH CHECK (tenant_id = get_user_tenant_id() AND (has_role(auth.uid(), 'member') OR is_supervisor_or_higher(auth.uid())));

CREATE POLICY "Managers can delete influencers"
  ON public.mkt_influencers FOR DELETE
  USING (tenant_id = get_user_tenant_id() AND is_supervisor_or_higher(auth.uid()));

-- RLS Policies para mkt_events
CREATE POLICY "Users can view events in their tenant"
  ON public.mkt_events FOR SELECT
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Members can create events"
  ON public.mkt_events FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id() AND (has_role(auth.uid(), 'member') OR is_supervisor_or_higher(auth.uid())));

CREATE POLICY "Members can update events"
  ON public.mkt_events FOR UPDATE
  USING (tenant_id = get_user_tenant_id() AND (has_role(auth.uid(), 'member') OR is_supervisor_or_higher(auth.uid())))
  WITH CHECK (tenant_id = get_user_tenant_id() AND (has_role(auth.uid(), 'member') OR is_supervisor_or_higher(auth.uid())));

CREATE POLICY "Managers can delete events"
  ON public.mkt_events FOR DELETE
  USING (tenant_id = get_user_tenant_id() AND is_supervisor_or_higher(auth.uid()));

-- RLS Policies para mkt_event_participants
CREATE POLICY "Users can view event participants in their tenant"
  ON public.mkt_event_participants FOR SELECT
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Members can create event participants"
  ON public.mkt_event_participants FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id() AND (has_role(auth.uid(), 'member') OR is_supervisor_or_higher(auth.uid())));

CREATE POLICY "Members can update event participants"
  ON public.mkt_event_participants FOR UPDATE
  USING (tenant_id = get_user_tenant_id() AND (has_role(auth.uid(), 'member') OR is_supervisor_or_higher(auth.uid())))
  WITH CHECK (tenant_id = get_user_tenant_id() AND (has_role(auth.uid(), 'member') OR is_supervisor_or_higher(auth.uid())));

CREATE POLICY "Managers can delete event participants"
  ON public.mkt_event_participants FOR DELETE
  USING (tenant_id = get_user_tenant_id() AND is_supervisor_or_higher(auth.uid()));

-- RLS Policies para mkt_social_posts
CREATE POLICY "Users can view social posts in their tenant"
  ON public.mkt_social_posts FOR SELECT
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Members can create social posts"
  ON public.mkt_social_posts FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id() AND (has_role(auth.uid(), 'member') OR is_supervisor_or_higher(auth.uid())));

CREATE POLICY "Members can update social posts"
  ON public.mkt_social_posts FOR UPDATE
  USING (tenant_id = get_user_tenant_id() AND (has_role(auth.uid(), 'member') OR is_supervisor_or_higher(auth.uid())))
  WITH CHECK (tenant_id = get_user_tenant_id() AND (has_role(auth.uid(), 'member') OR is_supervisor_or_higher(auth.uid())));

CREATE POLICY "Managers can delete social posts"
  ON public.mkt_social_posts FOR DELETE
  USING (tenant_id = get_user_tenant_id() AND is_supervisor_or_higher(auth.uid()));