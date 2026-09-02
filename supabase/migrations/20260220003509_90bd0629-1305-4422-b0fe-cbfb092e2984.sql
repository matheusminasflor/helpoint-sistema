
-- Força RLS mesmo para o table owner (necessário para testes via SQL Editor)
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;
