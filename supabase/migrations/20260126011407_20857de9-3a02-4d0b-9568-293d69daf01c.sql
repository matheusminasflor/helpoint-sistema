-- Create ticket_attachments table for file uploads
CREATE TABLE public.ticket_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  comment_id UUID REFERENCES public.ticket_comments(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER,
  uploaded_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ticket_attachments ENABLE ROW LEVEL SECURITY;

-- Create tenant injection trigger
CREATE TRIGGER inject_tenant_id_ticket_attachments
  BEFORE INSERT ON public.ticket_attachments
  FOR EACH ROW EXECUTE FUNCTION public.inject_tenant_id();

-- RLS Policies
CREATE POLICY "Users can view attachments on accessible tickets"
  ON public.ticket_attachments FOR SELECT
  USING (
    tenant_id = get_user_tenant_id() AND
    (
      EXISTS (
        SELECT 1 FROM public.tickets t 
        WHERE t.id = ticket_attachments.ticket_id 
        AND (t.requester_id = auth.uid() OR t.assigned_to = auth.uid())
      )
      OR has_role(auth.uid(), 'tecnico'::app_role)
      OR is_supervisor_or_higher(auth.uid())
    )
  );

CREATE POLICY "Users can upload attachments to accessible tickets"
  ON public.ticket_attachments FOR INSERT
  WITH CHECK (
    tenant_id = get_user_tenant_id() AND
    (
      EXISTS (
        SELECT 1 FROM public.tickets t 
        WHERE t.id = ticket_attachments.ticket_id 
        AND (t.requester_id = auth.uid() OR t.assigned_to = auth.uid())
      )
      OR has_role(auth.uid(), 'tecnico'::app_role)
      OR is_supervisor_or_higher(auth.uid())
    )
  );

CREATE POLICY "Directors can delete attachments"
  ON public.ticket_attachments FOR DELETE
  USING (tenant_id = get_user_tenant_id() AND is_diretor(auth.uid()));

-- Create storage bucket for ticket attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('ticket-attachments', 'ticket-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Users can view ticket attachments"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'ticket-attachments' AND auth.uid() IS NOT NULL);

CREATE POLICY "Users can upload ticket attachments"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'ticket-attachments' AND auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete their own attachments"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'ticket-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);