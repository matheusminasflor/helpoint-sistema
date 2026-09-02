
-- Create table for tracking security violations and progressive blocking
CREATE TABLE public.lyra_security_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  violation_count INTEGER NOT NULL DEFAULT 1,
  blocked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint per user (one record per user)
CREATE UNIQUE INDEX idx_lyra_security_blocks_user_id ON public.lyra_security_blocks (user_id);

-- Enable RLS
ALTER TABLE public.lyra_security_blocks ENABLE ROW LEVEL SECURITY;

-- Users can view their own block status
CREATE POLICY "Users can view own security blocks"
ON public.lyra_security_blocks
FOR SELECT
USING (tenant_id = get_user_tenant_id() AND user_id = auth.uid());

-- Only system (service role) manages inserts/updates via edge function
-- No INSERT/UPDATE/DELETE policies for regular users

-- Trigger for updated_at
CREATE TRIGGER update_lyra_security_blocks_updated_at
BEFORE UPDATE ON public.lyra_security_blocks
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();
