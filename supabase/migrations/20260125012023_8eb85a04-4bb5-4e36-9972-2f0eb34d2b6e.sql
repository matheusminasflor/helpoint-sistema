-- Fase 1: Alterações no banco de dados para POPs com subcategorias, feedbacks e métricas

-- Adicionar coluna subcategory na tabela pops
ALTER TABLE public.pops ADD COLUMN IF NOT EXISTS subcategory TEXT;

-- Adicionar coluna avg_rating na tabela pops
ALTER TABLE public.pops ADD COLUMN IF NOT EXISTS avg_rating NUMERIC(3,2);

-- Criar tabela de feedbacks de POPs
CREATE TABLE public.pop_feedbacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  pop_id UUID NOT NULL REFERENCES public.pops(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  rating INTEGER NOT NULL,
  comment TEXT,
  suggestion TEXT,
  is_helpful BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Adicionar constraint de rating via trigger (evita CHECK constraint issues)
CREATE OR REPLACE FUNCTION public.validate_pop_feedback_rating()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.rating < 1 OR NEW.rating > 5 THEN
    RAISE EXCEPTION 'Rating must be between 1 and 5';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER validate_pop_feedback_rating_trigger
BEFORE INSERT OR UPDATE ON public.pop_feedbacks
FOR EACH ROW EXECUTE FUNCTION public.validate_pop_feedback_rating();

-- Habilitar RLS
ALTER TABLE public.pop_feedbacks ENABLE ROW LEVEL SECURITY;

-- RLS Policies para pop_feedbacks
CREATE POLICY "Users can create own feedback"
  ON public.pop_feedbacks FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id() AND user_id = auth.uid());

CREATE POLICY "View feedback policy"
  ON public.pop_feedbacks FOR SELECT
  USING (tenant_id = get_user_tenant_id() AND (user_id = auth.uid() OR is_supervisor_or_higher(auth.uid())));

-- Trigger para injetar tenant_id automaticamente
CREATE TRIGGER inject_tenant_id_pop_feedbacks
BEFORE INSERT ON public.pop_feedbacks
FOR EACH ROW EXECUTE FUNCTION public.inject_tenant_id();

-- Trigger para atualizar avg_rating automaticamente quando feedback é inserido
CREATE OR REPLACE FUNCTION public.update_pop_avg_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.pops
  SET avg_rating = (
    SELECT ROUND(AVG(rating)::NUMERIC, 2)
    FROM public.pop_feedbacks
    WHERE pop_id = NEW.pop_id
  )
  WHERE id = NEW.pop_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER update_pop_rating_trigger
AFTER INSERT ON public.pop_feedbacks
FOR EACH ROW EXECUTE FUNCTION public.update_pop_avg_rating();