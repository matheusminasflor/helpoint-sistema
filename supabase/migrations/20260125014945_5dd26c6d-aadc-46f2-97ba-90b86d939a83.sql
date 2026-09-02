-- Storage bucket for POP media
INSERT INTO storage.buckets (id, name, public) VALUES ('pop-media', 'pop-media', true);

-- Storage policies
CREATE POLICY "Authenticated users can upload to pop-media"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'pop-media' AND auth.role() = 'authenticated');

CREATE POLICY "Anyone can view pop-media"
ON storage.objects FOR SELECT
USING (bucket_id = 'pop-media');

CREATE POLICY "Authenticated users can delete from pop-media"
ON storage.objects FOR DELETE
USING (bucket_id = 'pop-media' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update pop-media"
ON storage.objects FOR UPDATE
USING (bucket_id = 'pop-media' AND auth.role() = 'authenticated');

-- Table for POP attachments
CREATE TABLE public.pop_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  pop_id UUID NOT NULL REFERENCES pops(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('image', 'video', 'gif')),
  file_size INTEGER,
  thumbnail_url TEXT,
  sort_order INTEGER DEFAULT 0,
  caption TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.pop_attachments ENABLE ROW LEVEL SECURITY;

-- RLS policies for pop_attachments
CREATE POLICY "Users can view attachments in their tenant"
ON public.pop_attachments FOR SELECT
USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Supervisors can create attachments"
ON public.pop_attachments FOR INSERT
WITH CHECK (tenant_id = get_user_tenant_id() AND is_supervisor_or_higher(auth.uid()));

CREATE POLICY "Supervisors can update attachments"
ON public.pop_attachments FOR UPDATE
USING (tenant_id = get_user_tenant_id() AND is_supervisor_or_higher(auth.uid()))
WITH CHECK (tenant_id = get_user_tenant_id() AND is_supervisor_or_higher(auth.uid()));

CREATE POLICY "Supervisors can delete attachments"
ON public.pop_attachments FOR DELETE
USING (tenant_id = get_user_tenant_id() AND is_supervisor_or_higher(auth.uid()));