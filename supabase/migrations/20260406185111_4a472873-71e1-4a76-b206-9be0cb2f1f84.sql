
-- 1. Fix ticket-attachments: replace broad SELECT with tenant-scoped
DROP POLICY IF EXISTS "Users can view ticket attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can read own ticket attachments" ON storage.objects;

CREATE POLICY "Tenant users can view ticket attachments"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'ticket-attachments'
  AND EXISTS (
    SELECT 1 FROM public.ticket_attachments ta
    JOIN public.tickets t ON t.id = ta.ticket_id
    WHERE ta.file_url LIKE '%' || storage.filename(name) || '%'
      AND t.tenant_id = public.get_user_tenant_id()
  )
);

-- Remove duplicate broad INSERT policy for ticket-attachments
DROP POLICY IF EXISTS "Users can upload ticket attachments" ON storage.objects;

-- 2. Remove duplicate overly broad facility-maps-backgrounds policies
DROP POLICY IF EXISTS "Users can delete map backgrounds" ON storage.objects;
DROP POLICY IF EXISTS "Users can update map backgrounds" ON storage.objects;

-- 3. Remove duplicate overly broad mkt-media policies
DROP POLICY IF EXISTS "Users can delete their uploaded mkt media" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their uploaded mkt media" ON storage.objects;

-- 4. Fix kanban_cards UPDATE policy: self-referential subquery bug
DROP POLICY IF EXISTS "Department members and mentioned can update cards" ON kanban_cards;

CREATE POLICY "Department members and mentioned can update cards"
ON kanban_cards FOR UPDATE TO authenticated
USING (
  tenant_id = get_user_tenant_id()
  AND (
    is_supervisor_or_higher(auth.uid())
    OR user_belongs_to_board_department(board_id)
    OR (user_mentioned_in_card(id) AND EXISTS (
      SELECT 1 FROM kanban_card_mentions
      WHERE kanban_card_mentions.card_id = kanban_cards.id
        AND kanban_card_mentions.mentioned_user_id = auth.uid()
        AND kanban_card_mentions.can_edit = true
    ))
    OR created_by = auth.uid()
    OR assigned_to = auth.uid()
  )
)
WITH CHECK (
  tenant_id = get_user_tenant_id()
  AND (
    is_supervisor_or_higher(auth.uid())
    OR user_belongs_to_board_department(board_id)
    OR (user_mentioned_in_card(id) AND EXISTS (
      SELECT 1 FROM kanban_card_mentions
      WHERE kanban_card_mentions.card_id = kanban_cards.id
        AND kanban_card_mentions.mentioned_user_id = auth.uid()
        AND kanban_card_mentions.can_edit = true
    ))
    OR created_by = auth.uid()
    OR assigned_to = auth.uid()
  )
);
