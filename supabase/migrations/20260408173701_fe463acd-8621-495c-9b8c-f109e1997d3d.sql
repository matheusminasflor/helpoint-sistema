
-- Create ticket_mentions table
CREATE TABLE public.ticket_mentions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  mentioned_user_id uuid NOT NULL REFERENCES public.profiles(id),
  mentioned_by uuid NOT NULL REFERENCES public.profiles(id),
  message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX idx_ticket_mentions_tenant_user ON public.ticket_mentions (tenant_id, mentioned_user_id);
CREATE INDEX idx_ticket_mentions_ticket ON public.ticket_mentions (ticket_id);

-- Enable RLS
ALTER TABLE public.ticket_mentions ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Tenant isolation for ticket_mentions"
  ON public.ticket_mentions FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Authenticated users can create ticket mentions"
  ON public.ticket_mentions FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Users can delete their own mentions"
  ON public.ticket_mentions FOR DELETE
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND mentioned_by = auth.uid());

-- Inject tenant_id trigger
CREATE TRIGGER inject_tenant_id_ticket_mentions
  BEFORE INSERT ON public.ticket_mentions
  FOR EACH ROW
  EXECUTE FUNCTION public.inject_tenant_id();

-- Security definer function
CREATE OR REPLACE FUNCTION public.user_mentioned_in_ticket(_ticket_id uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ticket_mentions
    WHERE ticket_id = _ticket_id
    AND mentioned_user_id = auth.uid()
  )
$$;
