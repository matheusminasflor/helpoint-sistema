-- =====================================================
-- KANBAN SYSTEM - Complete Database Schema
-- =====================================================

-- 1. Quadros por departamento
CREATE TABLE public.kanban_boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  department TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, department)
);

-- 2. Colunas do quadro
CREATE TABLE public.kanban_columns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  board_id UUID NOT NULL REFERENCES public.kanban_boards(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6B7280',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_done_column BOOLEAN DEFAULT false,
  wip_limit INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Cards/Tarefas
CREATE TABLE public.kanban_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  board_id UUID NOT NULL REFERENCES public.kanban_boards(id),
  column_id UUID NOT NULL REFERENCES public.kanban_columns(id),
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  due_date DATE,
  cover_color TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  source_type TEXT,
  source_id UUID,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  assigned_to UUID REFERENCES public.profiles(id),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Membros do Card
CREATE TABLE public.kanban_card_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  card_id UUID NOT NULL REFERENCES public.kanban_cards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  added_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(card_id, user_id)
);

-- 5. Menções com Acesso Externo
CREATE TABLE public.kanban_card_mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  card_id UUID NOT NULL REFERENCES public.kanban_cards(id) ON DELETE CASCADE,
  mentioned_user_id UUID NOT NULL REFERENCES public.profiles(id),
  mentioned_by UUID NOT NULL REFERENCES public.profiles(id),
  message TEXT,
  can_edit BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(card_id, mentioned_user_id)
);

-- 6. Checklists
CREATE TABLE public.kanban_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  card_id UUID NOT NULL REFERENCES public.kanban_cards(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Checklist',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. Itens do Checklist
CREATE TABLE public.kanban_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  checklist_id UUID NOT NULL REFERENCES public.kanban_checklists(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  is_completed BOOLEAN DEFAULT false,
  completed_by UUID REFERENCES public.profiles(id),
  completed_at TIMESTAMPTZ,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 8. Anexos do Card
CREATE TABLE public.kanban_card_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  card_id UUID NOT NULL REFERENCES public.kanban_cards(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT,
  file_size INTEGER,
  uploaded_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 9. Comentários e Logs do Card
CREATE TABLE public.kanban_card_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  card_id UUID NOT NULL REFERENCES public.kanban_cards(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.profiles(id),
  content TEXT NOT NULL,
  comment_type TEXT DEFAULT 'comment' CHECK (comment_type IN ('comment', 'activity', 'mention')),
  is_internal BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- SECURITY FUNCTIONS
-- =====================================================

-- Verificar se usuario pertence ao departamento do board
CREATE OR REPLACE FUNCTION public.user_belongs_to_board_department(_board_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM kanban_boards b
    JOIN profiles p ON p.tenant_id = b.tenant_id
    WHERE b.id = _board_id
    AND p.id = auth.uid()
    AND p.department = b.department
  )
$$;

-- Verificar se usuario foi mencionado em um card
CREATE OR REPLACE FUNCTION public.user_mentioned_in_card(_card_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM kanban_card_mentions
    WHERE card_id = _card_id
    AND mentioned_user_id = auth.uid()
  )
$$;

-- Verificar se usuario é membro de um card
CREATE OR REPLACE FUNCTION public.user_is_card_member(_card_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM kanban_card_members
    WHERE card_id = _card_id
    AND user_id = auth.uid()
  )
$$;

-- =====================================================
-- ENABLE RLS ON ALL TABLES
-- =====================================================

ALTER TABLE public.kanban_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kanban_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kanban_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kanban_card_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kanban_card_mentions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kanban_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kanban_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kanban_card_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kanban_card_comments ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLS POLICIES - KANBAN_BOARDS
-- =====================================================

CREATE POLICY "Users see boards from their department or admin"
ON public.kanban_boards FOR SELECT
USING (
  tenant_id = get_user_tenant_id()
  AND (
    is_admin_or_higher(auth.uid())
    OR department = (SELECT department FROM profiles WHERE id = auth.uid())
  )
);

CREATE POLICY "Admins can create boards"
ON public.kanban_boards FOR INSERT
WITH CHECK (
  tenant_id = get_user_tenant_id()
  AND is_admin_or_higher(auth.uid())
);

CREATE POLICY "Admins can update boards"
ON public.kanban_boards FOR UPDATE
USING (tenant_id = get_user_tenant_id() AND is_admin_or_higher(auth.uid()))
WITH CHECK (tenant_id = get_user_tenant_id() AND is_admin_or_higher(auth.uid()));

CREATE POLICY "Admins can delete boards"
ON public.kanban_boards FOR DELETE
USING (tenant_id = get_user_tenant_id() AND is_admin_or_higher(auth.uid()));

-- =====================================================
-- RLS POLICIES - KANBAN_COLUMNS
-- =====================================================

CREATE POLICY "Users see columns from accessible boards"
ON public.kanban_columns FOR SELECT
USING (
  tenant_id = get_user_tenant_id()
  AND (
    is_admin_or_higher(auth.uid())
    OR user_belongs_to_board_department(board_id)
  )
);

CREATE POLICY "Supervisors can manage columns"
ON public.kanban_columns FOR INSERT
WITH CHECK (
  tenant_id = get_user_tenant_id()
  AND (is_supervisor_or_higher(auth.uid()) OR user_belongs_to_board_department(board_id))
);

CREATE POLICY "Supervisors can update columns"
ON public.kanban_columns FOR UPDATE
USING (tenant_id = get_user_tenant_id() AND (is_supervisor_or_higher(auth.uid()) OR user_belongs_to_board_department(board_id)))
WITH CHECK (tenant_id = get_user_tenant_id() AND (is_supervisor_or_higher(auth.uid()) OR user_belongs_to_board_department(board_id)));

CREATE POLICY "Supervisors can delete columns"
ON public.kanban_columns FOR DELETE
USING (tenant_id = get_user_tenant_id() AND is_supervisor_or_higher(auth.uid()));

-- =====================================================
-- RLS POLICIES - KANBAN_CARDS (CRITICAL - Department + Mention)
-- =====================================================

CREATE POLICY "Users see cards from department or mention"
ON public.kanban_cards FOR SELECT
USING (
  tenant_id = get_user_tenant_id()
  AND (
    is_admin_or_higher(auth.uid())
    OR user_belongs_to_board_department(board_id)
    OR user_mentioned_in_card(id)
    OR user_is_card_member(id)
    OR created_by = auth.uid()
    OR assigned_to = auth.uid()
  )
);

CREATE POLICY "Department members can create cards"
ON public.kanban_cards FOR INSERT
WITH CHECK (
  tenant_id = get_user_tenant_id()
  AND (
    is_supervisor_or_higher(auth.uid())
    OR user_belongs_to_board_department(board_id)
  )
);

CREATE POLICY "Department members and mentioned can update cards"
ON public.kanban_cards FOR UPDATE
USING (
  tenant_id = get_user_tenant_id()
  AND (
    is_supervisor_or_higher(auth.uid())
    OR user_belongs_to_board_department(board_id)
    OR (user_mentioned_in_card(id) AND (SELECT can_edit FROM kanban_card_mentions WHERE card_id = id AND mentioned_user_id = auth.uid()))
    OR created_by = auth.uid()
    OR assigned_to = auth.uid()
  )
)
WITH CHECK (
  tenant_id = get_user_tenant_id()
  AND (
    is_supervisor_or_higher(auth.uid())
    OR user_belongs_to_board_department(board_id)
    OR (user_mentioned_in_card(id) AND (SELECT can_edit FROM kanban_card_mentions WHERE card_id = id AND mentioned_user_id = auth.uid()))
    OR created_by = auth.uid()
    OR assigned_to = auth.uid()
  )
);

CREATE POLICY "Supervisors can delete cards"
ON public.kanban_cards FOR DELETE
USING (
  tenant_id = get_user_tenant_id()
  AND (is_supervisor_or_higher(auth.uid()) OR created_by = auth.uid())
);

-- =====================================================
-- RLS POLICIES - KANBAN_CARD_MEMBERS
-- =====================================================

CREATE POLICY "Users see card members if they can access card"
ON public.kanban_card_members FOR SELECT
USING (
  tenant_id = get_user_tenant_id()
  AND (
    is_admin_or_higher(auth.uid())
    OR EXISTS (
      SELECT 1 FROM kanban_cards c
      WHERE c.id = card_id
      AND (
        user_belongs_to_board_department(c.board_id)
        OR user_mentioned_in_card(c.id)
        OR user_is_card_member(c.id)
      )
    )
  )
);

CREATE POLICY "Department members can add card members"
ON public.kanban_card_members FOR INSERT
WITH CHECK (
  tenant_id = get_user_tenant_id()
  AND EXISTS (
    SELECT 1 FROM kanban_cards c
    WHERE c.id = card_id
    AND (is_supervisor_or_higher(auth.uid()) OR user_belongs_to_board_department(c.board_id))
  )
);

CREATE POLICY "Supervisors can delete card members"
ON public.kanban_card_members FOR DELETE
USING (
  tenant_id = get_user_tenant_id()
  AND (
    is_supervisor_or_higher(auth.uid())
    OR EXISTS (
      SELECT 1 FROM kanban_cards c
      WHERE c.id = card_id AND user_belongs_to_board_department(c.board_id)
    )
  )
);

-- =====================================================
-- RLS POLICIES - KANBAN_CARD_MENTIONS
-- =====================================================

CREATE POLICY "Users see mentions they made or received"
ON public.kanban_card_mentions FOR SELECT
USING (
  tenant_id = get_user_tenant_id()
  AND (
    is_admin_or_higher(auth.uid())
    OR mentioned_user_id = auth.uid()
    OR mentioned_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM kanban_cards c
      WHERE c.id = card_id AND user_belongs_to_board_department(c.board_id)
    )
  )
);

CREATE POLICY "Department members can create mentions"
ON public.kanban_card_mentions FOR INSERT
WITH CHECK (
  tenant_id = get_user_tenant_id()
  AND EXISTS (
    SELECT 1 FROM kanban_cards c
    WHERE c.id = card_id
    AND (is_supervisor_or_higher(auth.uid()) OR user_belongs_to_board_department(c.board_id))
  )
);

CREATE POLICY "Supervisors can delete mentions"
ON public.kanban_card_mentions FOR DELETE
USING (
  tenant_id = get_user_tenant_id()
  AND (is_supervisor_or_higher(auth.uid()) OR mentioned_by = auth.uid())
);

-- =====================================================
-- RLS POLICIES - KANBAN_CHECKLISTS
-- =====================================================

CREATE POLICY "Users see checklists if they can access card"
ON public.kanban_checklists FOR SELECT
USING (
  tenant_id = get_user_tenant_id()
  AND EXISTS (
    SELECT 1 FROM kanban_cards c
    WHERE c.id = card_id
    AND (
      is_admin_or_higher(auth.uid())
      OR user_belongs_to_board_department(c.board_id)
      OR user_mentioned_in_card(c.id)
      OR user_is_card_member(c.id)
    )
  )
);

CREATE POLICY "Card accessors can create checklists"
ON public.kanban_checklists FOR INSERT
WITH CHECK (
  tenant_id = get_user_tenant_id()
  AND EXISTS (
    SELECT 1 FROM kanban_cards c
    WHERE c.id = card_id
    AND (
      is_supervisor_or_higher(auth.uid())
      OR user_belongs_to_board_department(c.board_id)
      OR user_mentioned_in_card(c.id)
    )
  )
);

CREATE POLICY "Card accessors can update checklists"
ON public.kanban_checklists FOR UPDATE
USING (
  tenant_id = get_user_tenant_id()
  AND EXISTS (
    SELECT 1 FROM kanban_cards c
    WHERE c.id = card_id
    AND (
      is_supervisor_or_higher(auth.uid())
      OR user_belongs_to_board_department(c.board_id)
      OR user_mentioned_in_card(c.id)
    )
  )
);

CREATE POLICY "Supervisors can delete checklists"
ON public.kanban_checklists FOR DELETE
USING (tenant_id = get_user_tenant_id() AND is_supervisor_or_higher(auth.uid()));

-- =====================================================
-- RLS POLICIES - KANBAN_CHECKLIST_ITEMS
-- =====================================================

CREATE POLICY "Users see checklist items if they can access checklist"
ON public.kanban_checklist_items FOR SELECT
USING (
  tenant_id = get_user_tenant_id()
  AND EXISTS (
    SELECT 1 FROM kanban_checklists cl
    JOIN kanban_cards c ON c.id = cl.card_id
    WHERE cl.id = checklist_id
    AND (
      is_admin_or_higher(auth.uid())
      OR user_belongs_to_board_department(c.board_id)
      OR user_mentioned_in_card(c.id)
      OR user_is_card_member(c.id)
    )
  )
);

CREATE POLICY "Card accessors can manage checklist items"
ON public.kanban_checklist_items FOR INSERT
WITH CHECK (
  tenant_id = get_user_tenant_id()
  AND EXISTS (
    SELECT 1 FROM kanban_checklists cl
    JOIN kanban_cards c ON c.id = cl.card_id
    WHERE cl.id = checklist_id
    AND (
      is_supervisor_or_higher(auth.uid())
      OR user_belongs_to_board_department(c.board_id)
      OR user_mentioned_in_card(c.id)
    )
  )
);

CREATE POLICY "Card accessors can update checklist items"
ON public.kanban_checklist_items FOR UPDATE
USING (
  tenant_id = get_user_tenant_id()
  AND EXISTS (
    SELECT 1 FROM kanban_checklists cl
    JOIN kanban_cards c ON c.id = cl.card_id
    WHERE cl.id = checklist_id
    AND (
      is_supervisor_or_higher(auth.uid())
      OR user_belongs_to_board_department(c.board_id)
      OR user_mentioned_in_card(c.id)
    )
  )
);

CREATE POLICY "Card accessors can delete checklist items"
ON public.kanban_checklist_items FOR DELETE
USING (
  tenant_id = get_user_tenant_id()
  AND EXISTS (
    SELECT 1 FROM kanban_checklists cl
    JOIN kanban_cards c ON c.id = cl.card_id
    WHERE cl.id = checklist_id
    AND (
      is_supervisor_or_higher(auth.uid())
      OR user_belongs_to_board_department(c.board_id)
      OR user_mentioned_in_card(c.id)
    )
  )
);

-- =====================================================
-- RLS POLICIES - KANBAN_CARD_ATTACHMENTS
-- =====================================================

CREATE POLICY "Users see attachments if they can access card"
ON public.kanban_card_attachments FOR SELECT
USING (
  tenant_id = get_user_tenant_id()
  AND EXISTS (
    SELECT 1 FROM kanban_cards c
    WHERE c.id = card_id
    AND (
      is_admin_or_higher(auth.uid())
      OR user_belongs_to_board_department(c.board_id)
      OR user_mentioned_in_card(c.id)
      OR user_is_card_member(c.id)
    )
  )
);

CREATE POLICY "Card accessors can upload attachments"
ON public.kanban_card_attachments FOR INSERT
WITH CHECK (
  tenant_id = get_user_tenant_id()
  AND EXISTS (
    SELECT 1 FROM kanban_cards c
    WHERE c.id = card_id
    AND (
      is_supervisor_or_higher(auth.uid())
      OR user_belongs_to_board_department(c.board_id)
      OR user_mentioned_in_card(c.id)
    )
  )
);

CREATE POLICY "Uploaders and supervisors can delete attachments"
ON public.kanban_card_attachments FOR DELETE
USING (
  tenant_id = get_user_tenant_id()
  AND (is_supervisor_or_higher(auth.uid()) OR uploaded_by = auth.uid())
);

-- =====================================================
-- RLS POLICIES - KANBAN_CARD_COMMENTS
-- =====================================================

CREATE POLICY "Users see comments if they can access card"
ON public.kanban_card_comments FOR SELECT
USING (
  tenant_id = get_user_tenant_id()
  AND EXISTS (
    SELECT 1 FROM kanban_cards c
    WHERE c.id = card_id
    AND (
      is_admin_or_higher(auth.uid())
      OR user_belongs_to_board_department(c.board_id)
      OR user_mentioned_in_card(c.id)
      OR user_is_card_member(c.id)
    )
  )
  AND (
    is_internal = false
    OR is_supervisor_or_higher(auth.uid())
    OR EXISTS (
      SELECT 1 FROM kanban_cards c WHERE c.id = card_id AND user_belongs_to_board_department(c.board_id)
    )
  )
);

CREATE POLICY "Card accessors can create comments"
ON public.kanban_card_comments FOR INSERT
WITH CHECK (
  tenant_id = get_user_tenant_id()
  AND author_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM kanban_cards c
    WHERE c.id = card_id
    AND (
      is_supervisor_or_higher(auth.uid())
      OR user_belongs_to_board_department(c.board_id)
      OR user_mentioned_in_card(c.id)
      OR user_is_card_member(c.id)
    )
  )
);

CREATE POLICY "Authors and supervisors can delete comments"
ON public.kanban_card_comments FOR DELETE
USING (
  tenant_id = get_user_tenant_id()
  AND (is_supervisor_or_higher(auth.uid()) OR author_id = auth.uid())
);

-- =====================================================
-- TRIGGERS - INJECT TENANT ID
-- =====================================================

CREATE TRIGGER inject_tenant_kanban_boards
  BEFORE INSERT ON public.kanban_boards
  FOR EACH ROW EXECUTE FUNCTION inject_tenant_id();

CREATE TRIGGER inject_tenant_kanban_columns
  BEFORE INSERT ON public.kanban_columns
  FOR EACH ROW EXECUTE FUNCTION inject_tenant_id();

CREATE TRIGGER inject_tenant_kanban_cards
  BEFORE INSERT ON public.kanban_cards
  FOR EACH ROW EXECUTE FUNCTION inject_tenant_id();

CREATE TRIGGER inject_tenant_kanban_card_members
  BEFORE INSERT ON public.kanban_card_members
  FOR EACH ROW EXECUTE FUNCTION inject_tenant_id();

CREATE TRIGGER inject_tenant_kanban_card_mentions
  BEFORE INSERT ON public.kanban_card_mentions
  FOR EACH ROW EXECUTE FUNCTION inject_tenant_id();

CREATE TRIGGER inject_tenant_kanban_checklists
  BEFORE INSERT ON public.kanban_checklists
  FOR EACH ROW EXECUTE FUNCTION inject_tenant_id();

CREATE TRIGGER inject_tenant_kanban_checklist_items
  BEFORE INSERT ON public.kanban_checklist_items
  FOR EACH ROW EXECUTE FUNCTION inject_tenant_id();

CREATE TRIGGER inject_tenant_kanban_card_attachments
  BEFORE INSERT ON public.kanban_card_attachments
  FOR EACH ROW EXECUTE FUNCTION inject_tenant_id();

CREATE TRIGGER inject_tenant_kanban_card_comments
  BEFORE INSERT ON public.kanban_card_comments
  FOR EACH ROW EXECUTE FUNCTION inject_tenant_id();

-- =====================================================
-- TRIGGERS - UPDATED_AT
-- =====================================================

CREATE TRIGGER update_kanban_boards_updated_at
  BEFORE UPDATE ON public.kanban_boards
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER update_kanban_cards_updated_at
  BEFORE UPDATE ON public.kanban_cards
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

CREATE INDEX idx_kanban_boards_tenant_department ON public.kanban_boards(tenant_id, department);
CREATE INDEX idx_kanban_columns_board ON public.kanban_columns(board_id, sort_order);
CREATE INDEX idx_kanban_cards_board ON public.kanban_cards(board_id);
CREATE INDEX idx_kanban_cards_column ON public.kanban_cards(column_id, sort_order);
CREATE INDEX idx_kanban_cards_assigned ON public.kanban_cards(assigned_to);
CREATE INDEX idx_kanban_cards_due_date ON public.kanban_cards(due_date) WHERE due_date IS NOT NULL;
CREATE INDEX idx_kanban_card_members_card ON public.kanban_card_members(card_id);
CREATE INDEX idx_kanban_card_members_user ON public.kanban_card_members(user_id);
CREATE INDEX idx_kanban_card_mentions_card ON public.kanban_card_mentions(card_id);
CREATE INDEX idx_kanban_card_mentions_user ON public.kanban_card_mentions(mentioned_user_id);
CREATE INDEX idx_kanban_checklists_card ON public.kanban_checklists(card_id);
CREATE INDEX idx_kanban_checklist_items_checklist ON public.kanban_checklist_items(checklist_id);
CREATE INDEX idx_kanban_card_attachments_card ON public.kanban_card_attachments(card_id);
CREATE INDEX idx_kanban_card_comments_card ON public.kanban_card_comments(card_id);